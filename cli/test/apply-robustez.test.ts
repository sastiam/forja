import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { check as gitCheck } from "../../modules/git/apply.ts";
import { binCheck, plan as looperPlan } from "../../modules/looper/apply.ts";
import { parseMissing, plan as runtimesPlan } from "../../modules/runtimes/apply.ts";
import { moveCommands, personalGitKeys } from "../src/core/git-personal.ts";
import { loadModules } from "../src/core/modules.ts";
import { type ModuleCtx, planModule } from "../src/core/plan.ts";
import { validateProfile } from "../src/core/profile.ts";
import { modifiedOutside } from "../src/core/runners/chezmoi.ts";
import { createFakeRunner } from "../src/core/runners/shell.ts";

const root = join(import.meta.dirname, "..", "..");
const ctx = (runner: ModuleCtx["runner"]) => ({ root, runner }) as unknown as ModuleCtx;

// 1. Modelo de Claude Code en el perfil → settings.json

test("perfil: [claude] model es opcional y debe ser string", () => {
  const base = { schema: 1, host: "x", identity: { name: "n", email: "e" } };
  assert.equal(validateProfile(base).claude.model, undefined);
  assert.equal(validateProfile({ ...base, claude: { model: "opus" } }).claude.model, "opus");
  assert.throws(() => validateProfile({ ...base, claude: { model: 1 } }), /claude.model/);
});

function renderSettings(data: string): unknown {
  const dir = mkdtempSync(join(tmpdir(), "forja-tmpl-"));
  const cfg = join(dir, "chezmoi.toml");
  writeFileSync(cfg, `[data]\nmodules = ["git", "worktrees"]\n${data}`);
  const tmpl = readFileSync(join(root, "home/private_dot_claude/settings.json.tmpl"), "utf8");
  const out = execFileSync("chezmoi", ["--config", cfg, "--source", dir, "execute-template"], {
    input: tmpl,
    encoding: "utf8",
  });
  return JSON.parse(out);
}

const hasChezmoi = (() => {
  try {
    execFileSync("chezmoi", ["--version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
})();

test("settings.json: escribe model solo si el perfil lo define y sigue siendo JSON válido", {
  skip: !hasChezmoi && "chezmoi no instalado",
}, () => {
  const without = renderSettings('claude_model = ""\n') as Record<string, unknown>;
  assert.equal(without.model, undefined);
  assert.ok(without.statusLine);
  const old = renderSettings("") as Record<string, unknown>; // chezmoi.toml de una versión anterior
  assert.equal(old.model, undefined);
  const withModel = renderSettings('claude_model = "opus"\n') as Record<string, unknown>;
  assert.equal(withModel.model, "opus");
});

test("settings.json: escribe theme solo si el perfil lo define", {
  skip: !hasChezmoi && "chezmoi no instalado",
}, () => {
  const without = renderSettings('claude_theme = ""\n') as Record<string, unknown>;
  assert.equal(without.theme, undefined);
  const both = renderSettings('claude_model = "opus"\nclaude_theme = "dark"\n') as Record<
    string,
    unknown
  >;
  assert.equal(both.model, "opus");
  assert.equal(both.theme, "dark");
  const onlyTheme = renderSettings('claude_theme = "dark"\n') as Record<string, unknown>;
  assert.equal(onlyTheme.model, undefined);
  assert.equal(onlyTheme.theme, "dark");
});

function renderClaudeMd(data: string): string {
  const dir = mkdtempSync(join(tmpdir(), "forja-tmpl-"));
  const cfg = join(dir, "chezmoi.toml");
  writeFileSync(cfg, `[data]\n${data}`);
  const tmpl = readFileSync(join(root, "home/private_dot_claude/CLAUDE.md.tmpl"), "utf8");
  return execFileSync("chezmoi", ["--config", cfg, "--source", dir, "execute-template"], {
    input: tmpl,
    encoding: "utf8",
  });
}

test("CLAUDE.md: la regla de op:// solo aparece con secrets.provider = 1password", {
  skip: !hasChezmoi && "chezmoi no instalado",
}, () => {
  const op = renderClaudeMd('secrets_provider = "1password"\n');
  assert.match(op, /op run/);
  assert.match(op, /^- Para worktrees usa/m);
  for (const out of [renderClaudeMd('secrets_provider = "none"\n'), renderClaudeMd("")]) {
    assert.doesNotMatch(out, /op:\/\/|op run|\{\{/);
    assert.match(out, /^- No leas ni escribas secretos/m);
    assert.match(out, /^- Para worktrees usa/m);
  }
});

test("settings.json: con containers permite el socket de Colima y añade el hook", {
  skip: !hasChezmoi && "chezmoi no instalado",
}, () => {
  const dir = mkdtempSync(join(tmpdir(), "forja-tmpl-"));
  const cfg = join(dir, "chezmoi.toml");
  const render = (modules: string) => {
    writeFileSync(cfg, `[data]\nmodules = ${modules}\n`);
    const tmpl = readFileSync(join(root, "home/private_dot_claude/settings.json.tmpl"), "utf8");
    return JSON.parse(
      execFileSync("chezmoi", ["--config", cfg, "--source", dir, "execute-template"], {
        input: tmpl,
        encoding: "utf8",
      }),
    );
  };
  const on = render('["containers", "worktrees"]');
  assert.match(on.sandbox.network.allowUnixSockets[0], /^\/.*\/\.colima\/default\/docker\.sock$/);
  assert.equal(on.hooks.PreToolUse[0].matcher, "Bash");
  assert.match(on.hooks.PreToolUse[0].hooks[0].command, /colima-up\.sh$/);
  const off = render('["worktrees"]');
  assert.equal(off.sandbox.network.allowUnixSockets, undefined);
  assert.equal(off.hooks.PreToolUse, undefined);
});

// 2. Archivos cambiados fuera de chezmoi

test("chezmoi status: solo cuenta lo cambiado en el disco que apply sobrescribiría", () => {
  const status = [
    "MM .zshrc",
    " M .config/mise/config.toml",
    "M  .config/ghostty/config",
    "DA .claude/hooks/x.sh",
    "diff --git a b",
    "",
  ].join("\n");
  assert.deepEqual(modifiedOutside(status, "/Users/x"), [
    "/Users/x/.zshrc",
    "/Users/x/.claude/hooks/x.sh",
  ]);
});

test("plan señala los archivos modificados fuera de chezmoi", async () => {
  const home = process.env.HOME;
  process.env.HOME = "/Users/x";
  try {
    const runner = createFakeRunner((cmd, args) => {
      if (cmd === "sh") return { code: 0 };
      if (cmd === "chezmoi" && args.includes("diff")) return { stdout: "diff --git a b" };
      if (cmd === "chezmoi" && args.includes("status")) return { stdout: "MM .zshrc\n" };
      return undefined;
    });
    const all = await loadModules(root);
    const shell = all.get("shell");
    assert.ok(shell);
    const p = await planModule({ runner, root, platform: "linux" } as unknown as ModuleCtx, shell);
    const a = p.actions.find((x) => x.kind === "chezmoi");
    assert.ok(a?.pending);
    assert.match(a?.description ?? "", /modificado fuera de chezmoi: ~\/\.zshrc/);
  } finally {
    process.env.HOME = home;
  }
});

// 3. Identidad y firma de git fuera de la config global

test("git: detecta identidad y firma en la config global", () => {
  const list = [
    "init.defaultbranch=main",
    "gpg.format=ssh",
    "user.signingkey=/Users/x/.ssh/id_ed25519.pub",
    "commit.gpgsign=true",
    "include.path=~/.config/forja/local/git.local.gitconfig",
  ].join("\n");
  const found = personalGitKeys(list);
  assert.deepEqual(
    found.map((e) => e.key),
    ["gpg.format", "user.signingkey", "commit.gpgsign"],
  );
  const cmds = moveCommands(found);
  assert.equal(
    cmds[0],
    "git config --file ~/.config/forja/local/git.local.gitconfig gpg.format ssh",
  );
  assert.equal(cmds.at(-1), "git config --file ~/.config/git/config --unset-all commit.gpgsign");
});

test("git: la config del repo no tiene claves personales", () => {
  const text = readFileSync(join(root, "home/private_dot_config/git/config.tmpl"), "utf8");
  // Convierte el INI a `sección.clave=valor` como `git config --list`.
  let section = "";
  const list: string[] = [];
  for (const raw of text.split("\n")) {
    const l = raw.trim();
    const s = /^\[([^\s\]]+)/.exec(l);
    if (s) section = s[1]?.toLowerCase() ?? "";
    else if (l.includes("=")) list.push(`${section}.${l.split("=")[0]?.trim().toLowerCase()}=x`);
  }
  assert.deepEqual(personalGitKeys(list.join("\n")), []);
});

test("git: el check avisa (sin fallar doctor) y propone los comandos", async () => {
  const runner = createFakeRunner(() => ({ stdout: "commit.gpgsign=true\n" }));
  const [r] = await gitCheck(ctx(runner));
  assert.equal(r?.ok, false);
  assert.equal(r?.warn, true);
  assert.match(r?.detail ?? "", /commit\.gpgsign true/);
  const clean = await gitCheck(ctx(createFakeRunner(() => ({ stdout: "core.pager=delta\n" }))));
  assert.equal(clean[0]?.ok, true);
});

// 4. runtimes ejecuta mise install

test("runtimes: mise ls --missing marca el paso pendiente", async () => {
  assert.deepEqual(
    parseMissing("bun  latest  ~/.config/mise/config.toml  latest\n\nnode 26 ~/x 26\n"),
    ["bun", "node"],
  );
  const missing = createFakeRunner((cmd) =>
    cmd === "mise" ? { stdout: "bun  latest  ~/.config/mise/config.toml  latest\n" } : undefined,
  );
  const [a] = await runtimesPlan(ctx(missing));
  assert.equal(a?.pending, true);
  assert.match(a?.description ?? "", /faltan: bun/);
  const [b] = await runtimesPlan(ctx(createFakeRunner(() => ({ stdout: "" }))));
  assert.equal(b?.pending, false);
});

// 5. looper: ref y PATH por separado

test("looper: enlazado pero fuera del PATH es aviso, sin enlazar es fallo", () => {
  assert.deepEqual(binCheck(true, true), { name: "openspec-cascade --help", ok: true });
  const stale = binCheck(false, true);
  assert.equal(stale.warn, true);
  assert.match(stale.detail ?? "", /terminal nueva/);
  const missing = binCheck(false, false);
  assert.notEqual(missing.warn, true);
  assert.match(missing.detail ?? "", /bun link/);
});

test("looper: con el ref fijado y el binario enlazado no hay nada pendiente", async () => {
  const { LOOPER_REF } = await import("../src/core/looper.ts");
  const dir = mkdtempSync(join(tmpdir(), "forja-looper-"));
  const bun = mkdtempSync(join(tmpdir(), "forja-bun-"));
  mkdirSync(join(bun, "bin"));
  const saved = { dir: process.env.FORJA_LOOPER_DIR, bun: process.env.BUN_INSTALL };
  process.env.FORJA_LOOPER_DIR = dir;
  process.env.BUN_INSTALL = bun;
  try {
    const runner = createFakeRunner(() => ({ stdout: `${LOOPER_REF}\n` }));
    const [before] = await looperPlan(ctx(runner));
    assert.equal(before?.pending, true);
    assert.match(before?.description ?? "", /sin enlazar/);
    writeFileSync(join(bun, "bin", "openspec-cascade"), "");
    const [after] = await looperPlan(ctx(runner));
    assert.equal(after?.pending, false);
  } finally {
    for (const [k, v] of [
      ["FORJA_LOOPER_DIR", saved.dir],
      ["BUN_INSTALL", saved.bun],
    ] as const)
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
  }
});
