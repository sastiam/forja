import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { loadHost } from "../src/core/hosts.ts";
import { loadModules, parseModule } from "../src/core/modules.ts";
import { repoRoot } from "../src/core/paths.ts";
import { dnfFile, type ModuleCtx, planModule } from "../src/core/plan.ts";
import {
  elevate,
  installMissing,
  missingPackages,
  PACKAGES_FILE,
  packagesCheck,
  parsePackages,
  readPackages,
} from "../src/core/runners/dnf.ts";
import { createFakeRunner } from "../src/core/runners/shell.ts";

/** rpm -q --qf %{NAME}\n imprime solo los instalados. */
const rpmWith = (installed: string[]) => (cmd: string, _args: string[]) => {
  if (cmd === "sh") return { code: 0 };
  if (cmd === "rpm") return { code: 1, stdout: installed.map((n) => `${n}\n`).join("") };
  return undefined;
};

test("parsePackages ignora comentarios, líneas vacías y duplicados", () => {
  const text = "# cabecera\njq\n\n  gh  # CLI de GitHub\njq\nfd-find\n";
  assert.deepEqual(parsePackages(text), ["jq", "gh", "fd-find"]);
});

test("parsePackages rechaza nombres que no son de paquete (nada de flags ni espacios)", () => {
  assert.throws(() => parsePackages("--installroot=/x\n"), /paquete inválido/);
  assert.throws(() => parsePackages("a b\n"), /paquete inválido/);
  assert.throws(() => parsePackages("$(id)\n"), /paquete inválido/);
});

test("missingPackages devuelve solo los que faltan y consulta con el idioma fijo", async () => {
  const r = createFakeRunner(rpmWith(["jq"]));
  assert.deepEqual(await missingPackages(r, ["jq", "gh"]), ["gh"]);
  const i = r.calls.findIndex((c) => c.startsWith("rpm "));
  assert.equal(r.calls[i], "rpm -q --qf %{NAME}\\n jq gh");
  assert.equal(r.envs[i]?.LC_ALL, "C");
});

test("missingPackages sin rpm devuelve null; con lista vacía no consulta nada", async () => {
  const sinRpm = createFakeRunner((cmd) => (cmd === "sh" ? { code: 1 } : undefined));
  assert.equal(await missingPackages(sinRpm, ["jq"]), null);
  const vacio = createFakeRunner();
  assert.deepEqual(await missingPackages(vacio, []), []);
  assert.equal(vacio.calls.length, 0);
});

test("packagesCheck distingue ok, pending y unavailable", async () => {
  const dir = join(repoRoot(), "modules", "shell", PACKAGES_FILE);
  const todos = await readPackages(dir);
  assert.equal((await packagesCheck(createFakeRunner(rpmWith(todos)), dir)).state, "ok");
  const faltan = await packagesCheck(createFakeRunner(rpmWith([])), dir);
  assert.equal(faltan.state, "pending");
  assert.deepEqual(faltan.missing, todos);
  const sinRpm = createFakeRunner((cmd) => (cmd === "sh" ? { code: 1 } : undefined));
  assert.equal((await packagesCheck(sinRpm, dir)).state, "unavailable");
});

test("elevate usa sudo salvo que ya seamos root", () => {
  assert.deepEqual(elevate("dnf", ["install", "-y", "jq"], 1000), [
    "sudo",
    ["dnf", "install", "-y", "jq"],
  ]);
  assert.deepEqual(elevate("dnf", ["install", "-y", "jq"], 0), ["dnf", ["install", "-y", "jq"]]);
});

test("installMissing instala solo lo que falta, con -y y sin tocar nada más", async () => {
  const r = createFakeRunner(undefined, false);
  await installMissing(r, ["gh", "jq"]);
  assert.match(r.calls.join("\n"), /^(sudo )?dnf install -y gh jq$/);
});

test("plan en Linux propone dnf con lo que falta y no instala nada", async () => {
  const root = repoRoot();
  const all = await loadModules(root);
  const shell = all.get("shell");
  assert.ok(shell);
  const runner = createFakeRunner(rpmWith(["starship"]));
  const ctx = {
    runner,
    root,
    host: await loadHost(root, "fedora"),
    profile: undefined,
    enabled: ["shell"],
    platform: "linux",
  } as unknown as ModuleCtx;
  const p = await planModule(ctx, shell);
  const a = p.actions.find((x) => x.kind === "dnf");
  assert.ok(a?.pending);
  assert.match(a.description, /faltan: zsh, zoxide/);
  assert.match(a.description, /sudo/);
  assert.ok(!runner.calls.some((c) => /dnf install/.test(c)), "plan no instala");
  assert.ok(!runner.calls.some((c) => c.startsWith("brew")), "en Linux no se llama a brew");
});

test("dnfFile solo aplica en Linux", async () => {
  const shell = (await loadModules(repoRoot())).get("shell");
  assert.ok(shell);
  assert.ok(dnfFile(shell, "linux"));
  assert.equal(dnfFile(shell, "darwin"), null);
});

test("parseModule lee las comprobaciones por SO", () => {
  const m = parseModule(
    "x",
    "/x",
    'name = "x"\n[checks]\ncommands = ["a"]\n[checks.darwin]\ncommands = ["brew --version"]\n[checks.linux]\ncommands = ["dnf --version"]\n',
  );
  assert.deepEqual(m.checks, ["a"]);
  assert.deepEqual(m.checksByOs, { darwin: ["brew --version"], linux: ["dnf --version"] });
});

test("el host fedora está soportado y cada módulo suyo funciona en Linux con sus paquetes declarados", async () => {
  const root = repoRoot();
  const host = await loadHost(root, "fedora");
  assert.equal(host.status, "supported");
  assert.equal(host.os, "linux");
  const all = await loadModules(root);
  for (const name of host.modules) {
    const m = all.get(name);
    assert.ok(m, `módulo desconocido: ${name}`);
    assert.ok(m.os.includes("linux"), `${name} debe declarar os = [..., "linux"]`);
    if (m.hasBrewfile && name !== "runtimes")
      assert.ok(
        existsSync(join(m.dir, PACKAGES_FILE)),
        `${name} tiene Brewfile pero no ${PACKAGES_FILE}`,
      );
  }
});

test("ningún apply de módulo Linux llama a comandos exclusivos de macOS sin comprobar el SO", async () => {
  const root = repoRoot();
  const host = await loadHost(root, "fedora");
  const all = await loadModules(root);
  const { readFile } = await import("node:fs/promises");
  for (const name of host.modules) {
    const m = all.get(name);
    if (!m?.hasApply) continue;
    const src = await readFile(join(m.dir, "apply.ts"), "utf8");
    assert.ok(
      !/\b(pmset|osascript|launchctl|defaults write)\b/.test(src),
      `${name}/apply.ts usa APIs de macOS`,
    );
  }
});
