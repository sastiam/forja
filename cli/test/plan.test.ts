import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { writeChezmoiConfig } from "../src/commands/apply.ts";
import { addEntry, formatEntry } from "../src/commands/backlog.ts";
import { filterCapturable } from "../src/commands/capture-filter.ts";
import { loadHost } from "../src/core/hosts.ts";
import { loadModules, resolveOrder } from "../src/core/modules.ts";
import { repoRoot } from "../src/core/paths.ts";
import { type Ctx, computePlan } from "../src/core/plan.ts";
import { loadProfile } from "../src/core/profile.ts";
import { createFakeRunner, createRunner } from "../src/core/runners/shell.ts";
import { parse, type TomlTable } from "../src/core/toml.ts";

const fixture = join(fileURLToPath(import.meta.url), "..", "fixtures", "profile.fixture.toml");

async function ctxWith(
  runner: Ctx["runner"],
  platform = "darwin",
): Promise<{ ctx: Ctx; all: Awaited<ReturnType<typeof loadModules>>; order: string[] }> {
  const root = repoRoot();
  const profile = await loadProfile(fixture);
  assert.ok(profile);
  const host = await loadHost(root, profile.host);
  const all = await loadModules(root);
  const enabled = host.modules.filter((m) => !profile.modules_skip.includes(m));
  return {
    ctx: { runner, root, host, profile, enabled, platform },
    all,
    order: resolveOrder(all, enabled),
  };
}

test("plan con runners falsos: marca pendiente lo que falta y no ejecuta nada con efectos", async () => {
  // brew bundle check falla (faltan paquetes); chezmoi diff devuelve cambios.
  const runner = createFakeRunner((cmd, args) => {
    if (cmd === "sh" && args[1]?.startsWith("command -v")) return { code: 0 };
    if (cmd === "brew") return { code: 1 };
    if (cmd === "chezmoi") return { stdout: "diff --git a b" };
    return { code: 1 };
  });
  const { ctx, all, order } = await ctxWith(runner);
  const plans = await computePlan(ctx, all, order);
  const git = plans.find((p) => p.module === "git");
  assert.equal(git?.status, "pending");
  assert.ok(git?.actions.some((a) => a.kind === "brew" && a.pending));
  assert.ok(git?.actions.some((a) => a.kind === "chezmoi" && a.pending));
  assert.ok(!runner.calls.some((c) => c.startsWith("brew bundle --file")), "plan no aplica nada");
  assert.ok(!runner.calls.some((c) => c.startsWith("chezmoi") && /\bapply\b/.test(c)));
});

test("plan omite módulos que no aplican al SO", async () => {
  const { ctx, all, order } = await ctxWith(
    createFakeRunner(() => ({ code: 0 })),
    "linux",
  );
  const plans = await computePlan(ctx, all, order);
  assert.equal(plans.find((p) => p.module === "containers")?.status, "skipped");
  assert.notEqual(plans.find((p) => p.module === "git")?.status, "skipped");
});

test("apply --dry-run no escribe nada fuera de un directorio temporal", async () => {
  const home = mkdtempSync(join(tmpdir(), "forja-home-"));
  const saved = { HOME: process.env.HOME, XDG: process.env.XDG_CONFIG_HOME };
  process.env.HOME = home;
  process.env.XDG_CONFIG_HOME = join(home, ".config");
  try {
    const { ctx } = await ctxWith(createRunner(true));
    await writeChezmoiConfig(ctx);
    assert.deepEqual(readdirSync(home), [], "dry-run no crea archivos");
    assert.ok(ctx.runner.skipped.some((s) => s.startsWith("write ")));
    // sin dry-run sí escribe, y solo bajo HOME temporal
    const real = await ctxWith(createRunner(false));
    await writeChezmoiConfig(real.ctx);
    const cfg = join(home, ".config", "chezmoi", "chezmoi.toml");
    assert.ok(existsSync(cfg));
    const data = parse(readFileSync(cfg, "utf8")).data as TomlTable;
    const sb = data.claude_sandbox as TomlTable;
    assert.deepEqual(sb.allowed_domains, [
      "github.com",
      "api.github.com",
      "registry.example.invalid",
    ]);
    assert.deepEqual(sb.allow_read, ["~/.config/forja/local/git.local.gitconfig", "~/.npmrc"]);
  } finally {
    process.env.HOME = saved.HOME;
    if (saved.XDG === undefined) delete process.env.XDG_CONFIG_HOME;
    else process.env.XDG_CONFIG_HOME = saved.XDG;
  }
});

test("filtro de capture descarta rutas sensibles", () => {
  const home = "/Users/x";
  const res = filterCapturable(
    [
      `${home}/.ssh/id_ed25519`,
      `${home}/.aws/credentials`,
      `${home}/.config/op/config`,
      `${home}/.config/forja/local/CLAUDE.local.md`,
      `${home}/.gitconfig.local.bak`,
      `${home}/.zshrc`,
      `${home}/.config/git/config`,
    ],
    home,
  );
  assert.deepEqual(res.allowed, [`${home}/.zshrc`, `${home}/.config/git/config`]);
  assert.equal(res.rejected.length, 5);
});

test("backlog add añade entrada con fecha y módulo", async () => {
  const file = join(mkdtempSync(join(tmpdir(), "forja-bl-")), "BACKLOG.md");
  writeFileSync(file, "# Backlog\n");
  await addEntry(file, formatEntry("probar tsgo", "editor", new Date("2026-11-14T10:00:00Z")));
  const { readFileSync } = await import("node:fs");
  assert.match(readFileSync(file, "utf8"), /## Inbox\n- \[ \] 2026-11-14 editor: probar tsgo\n/);
});
