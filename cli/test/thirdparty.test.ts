import assert from "node:assert/strict";
import { join } from "node:path";
import { test } from "node:test";
import { loadHost } from "../src/core/hosts.ts";
import { loadModules } from "../src/core/modules.ts";
import { repoRoot } from "../src/core/paths.ts";
import { validateProfile } from "../src/core/profile.ts";
import { createFakeRunner } from "../src/core/runners/shell.ts";
import {
  applyThirdParty,
  enableCommands,
  enabledRepoIds,
  isEnabled,
  parseThirdParty,
  planThirdParty,
  readThirdParty,
  THIRDPARTY_FILE,
  trustKey,
} from "../src/core/thirdparty.ts";
import { parse } from "../src/core/toml.ts";

const COPR = `[ghostty]\nkind = "copr"\nsource = "scottames/ghostty"\npackages = ["ghostty"]\n`;
const REPOFILE = `[sublime]\nkind = "repofile"\nsource = "https://download.sublimetext.com/rpm/stable/x86_64/sublime-text.repo"\nrepo_id = "sublime-text"\npackages = ["sublime-merge"]\n`;
const WORKSTATION = `[chrome]\nkind = "workstation"\nsource = "google-chrome"\npackages = ["google-chrome-stable"]\n`;

const REPOLIST = (ids: string[]) =>
  `repo id   repo name\n${ids.map((i) => `${i}   algo`).join("\n")}\n`;

/** dnf/rpm simulados: `repos` habilitados e `installed` paquetes instalados. */
const sim = (repos: string[], installed: string[] = [], dryRun = false) =>
  createFakeRunner((cmd, args) => {
    if (cmd === "sh") return { code: 0 };
    if (cmd === "dnf" && args.includes("repolist")) return { stdout: REPOLIST(repos) };
    if (cmd === "rpm") return { code: 1, stdout: installed.map((n) => `${n}\n`).join("") };
    return undefined;
  }, dryRun);

const entry = (text: string) => {
  const [e] = parseThirdParty(text);
  assert.ok(e);
  return e;
};

test("parseThirdParty lee los tres tipos de repo", () => {
  assert.deepEqual(entry(COPR), {
    name: "ghostty",
    kind: "copr",
    source: "scottames/ghostty",
    repoId: undefined,
    packages: ["ghostty"],
  });
  assert.equal(entry(REPOFILE).repoId, "sublime-text");
  assert.equal(entry(WORKSTATION).kind, "workstation");
});

test("parseThirdParty rechaza datos que no son de confianza o están mal formados", () => {
  const bad = (text: string, re: RegExp) => assert.throws(() => parseThirdParty(text), re);
  bad(COPR.replace('"scottames/ghostty"', '"no-es-owner-project"'), /owner\/project/);
  bad(COPR.replace("copr", "rpm"), /kind debe ser/);
  bad(REPOFILE.replace("https://", "http://"), /https/);
  bad(REPOFILE.replace("sublime-text.repo", "x.repo?token=1"), /https sin parámetros/);
  bad(REPOFILE.replace('repo_id = "sublime-text"\n', ""), /repo_id/);
  bad(COPR.replace('["ghostty"]', '["a; rm -rf /"]'), /paquete inválido/);
  bad(COPR.replace('["ghostty"]', '["--installroot=/x"]'), /paquete inválido/);
  bad(COPR.replace('["ghostty"]', "[]"), /no vacía/);
  bad(`ghostty = "x"\n`, /debe ser una tabla/);
});

test("trustKey incluye el origen, no solo el nombre", () => {
  assert.equal(trustKey(entry(COPR)), "copr:scottames/ghostty");
  assert.equal(
    trustKey(entry(REPOFILE)),
    "repofile:https://download.sublimetext.com/rpm/stable/x86_64/sublime-text.repo",
  );
  assert.equal(trustKey(entry(WORKSTATION)), "workstation:google-chrome");
});

test("isEnabled reconoce un COPR por su id real y los demás por repo_id", () => {
  const ids = new Set(["copr:copr.fedorainfracloud.org:scottames:ghostty", "sublime-text"]);
  assert.equal(isEnabled(entry(COPR), ids), true);
  assert.equal(
    isEnabled(entry(COPR), new Set(["copr:copr.fedorainfracloud.org:otro:ghostty"])),
    false,
  );
  assert.equal(isEnabled(entry(REPOFILE), ids), true);
  assert.equal(isEnabled(entry(WORKSTATION), ids), false);
});

test("enabledRepoIds salta la cabecera y pasa a minúsculas", async () => {
  const ids = await enabledRepoIds(sim(["Fedora", "updates"]));
  assert.deepEqual([...ids].sort(), ["fedora", "updates"]);
});

test("enableCommands: comandos exactos, sin shell", () => {
  assert.deepEqual(enableCommands(entry(COPR)), [
    ["dnf", ["copr", "enable", "-y", "scottames/ghostty"]],
  ]);
  assert.deepEqual(enableCommands(entry(REPOFILE)), [
    [
      "dnf",
      [
        "config-manager",
        "addrepo",
        "--from-repofile=https://download.sublimetext.com/rpm/stable/x86_64/sublime-text.repo",
      ],
    ],
  ]);
  assert.deepEqual(enableCommands(entry(WORKSTATION)), [
    ["dnf", ["install", "-y", "fedora-workstation-repositories"]],
    ["dnf", ["config-manager", "setopt", "google-chrome.enabled=1"]],
  ]);
});

test("plan: un repo sin confiar es una guía con la clave exacta y no instala nada", async () => {
  const r = sim([]);
  const [a] = await planThirdParty(r, [entry(COPR)], []);
  assert.equal(a?.kind, "guide");
  assert.ok(a?.pending);
  assert.match(a?.description ?? "", /SIN confiar/);
  assert.match(a?.description ?? "", /"copr:scottames\/ghostty"/);
  assert.match(a?.description ?? "", /\[fedora\] trusted_repos/);
  assert.ok(!r.calls.some((c) => /copr enable|install/.test(c)));
});

test("plan: con confianza propone habilitar el repo; con el repo ya habilitado, solo los paquetes", async () => {
  const confiado = await planThirdParty(sim([]), [entry(COPR)], ["copr:scottames/ghostty"]);
  assert.deepEqual(
    confiado.map((a) => [a.kind, a.pending]),
    [
      ["step", true],
      ["dnf", true],
    ],
  );
  assert.match(confiado[0]?.description ?? "", /habilitar el repo de terceros/);
  const habilitado = await planThirdParty(
    sim(["copr:copr.fedorainfracloud.org:scottames:ghostty"]),
    [entry(COPR)],
    [],
  );
  assert.deepEqual(
    habilitado.map((a) => [a.kind, a.pending]),
    [["dnf", true]],
  );
  const completo = await planThirdParty(
    sim(["copr:copr.fedorainfracloud.org:scottames:ghostty"], ["ghostty"]),
    [entry(COPR)],
    [],
  );
  assert.equal(completo[0]?.pending, false);
});

test("apply NUNCA habilita ni instala desde un repo sin confiar", async () => {
  const r = sim([], [], false);
  await applyThirdParty(r, [entry(COPR), entry(REPOFILE), entry(WORKSTATION)], []);
  assert.ok(!r.calls.some((c) => /copr enable|addrepo|setopt|workstation|dnf install/.test(c)));
});

test("apply con confianza: habilita con sudo, luego instala solo lo que falta", async () => {
  const r = sim([], [], false);
  await applyThirdParty(r, [entry(COPR)], ["copr:scottames/ghostty"]);
  const calls = r.calls.filter((c) => /dnf /.test(c) && !/repolist/.test(c));
  assert.match(calls[0] ?? "", /(sudo )?dnf copr enable -y scottames\/ghostty/);
  assert.match(calls[1] ?? "", /(sudo )?dnf install -y ghostty/);
});

test("apply no vuelve a habilitar un repo ya habilitado ni reinstala lo instalado", async () => {
  const r = sim(["copr:copr.fedorainfracloud.org:scottames:ghostty"], ["ghostty"], false);
  await applyThirdParty(r, [entry(COPR)], ["copr:scottames/ghostty"]);
  assert.ok(!r.calls.some((c) => /copr enable|dnf install/.test(c)));
});

test("apply falla claro si habilitar el repo falla", async () => {
  const r = createFakeRunner((cmd, args) => {
    if (cmd === "dnf" && args.includes("repolist")) return { stdout: REPOLIST([]) };
    if (cmd === "sh") return { code: 0 };
    if (cmd === "rpm") return { code: 1, stdout: "" };
    if (args.includes("copr")) return { code: 1 };
    return undefined;
  }, false);
  await assert.rejects(
    applyThirdParty(r, [entry(COPR)], ["copr:scottames/ghostty"]),
    /habilitar ghostty .* falló/,
  );
});

test("el perfil acepta [fedora] trusted_repos", () => {
  const base = `schema = 1\nhost = "fedora"\n[identity]\nname = "A"\nemail = "a@example.invalid"\n`;
  assert.deepEqual(
    validateProfile(parse(`${base}[fedora]\ntrusted_repos = ["copr:scottames/ghostty"]\n`)).fedora,
    {
      trusted_repos: ["copr:scottames/ghostty"],
    },
  );
  assert.deepEqual(validateProfile(parse(base)).fedora, { trusted_repos: [] });
});

test("los archivos thirdparty.fedora.toml del repo son válidos y sus paquetes no se repiten en dnf", async () => {
  const root = repoRoot();
  const all = await loadModules(root);
  const { existsSync } = await import("node:fs");
  const { readPackages, PACKAGES_FILE } = await import("../src/core/runners/dnf.ts");
  let vistos = 0;
  for (const m of all.values()) {
    const file = join(m.dir, THIRDPARTY_FILE);
    if (!existsSync(file)) continue;
    const entries = await readThirdParty(file);
    vistos += entries.length;
    const base = existsSync(join(m.dir, PACKAGES_FILE))
      ? await readPackages(join(m.dir, PACKAGES_FILE))
      : [];
    for (const e of entries)
      for (const p of e.packages)
        assert.ok(!base.includes(p), `${m.name}: ${p} está en dnf y en terceros`);
    assert.ok(
      m.os.includes("linux"),
      `${m.name} tiene repos de terceros de Fedora pero no declara linux`,
    );
  }
  assert.ok(vistos >= 3, "ghostty, sublime-merge y chrome");
  const host = await loadHost(root, "fedora");
  for (const n of ["terminal", "editor", "browsers"]) assert.ok(host.modules.includes(n), n);
});
