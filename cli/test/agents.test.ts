import assert from "node:assert/strict";
import { homedir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { apply, check } from "../../modules/agents/apply.ts";
import { enabledPlugins } from "../src/core/claude-plugins.ts";
import type { CheckResult, ModuleCtx } from "../src/core/plan.ts";
import { createFakeRunner, type ExecResult } from "../src/core/runners/shell.ts";

const root = join(import.meta.dirname, "..", "..");

/** Simula `command -v` y `--version` por herramienta. */
function ctxWith(tools: Record<string, { path?: string; version?: Partial<ExecResult> }>) {
  const runner = createFakeRunner((cmd, args) => {
    if (cmd === "sh") {
      const name = args[1]?.replace("command -v ", "") ?? "";
      const t = tools[name];
      return t?.path ? { stdout: `${t.path}\n` } : { code: 1 };
    }
    if (args[0] === "--version") return tools[cmd]?.version ?? { code: 127 };
    return undefined;
  });
  return { root, runner } as unknown as ModuleCtx;
}

const byName = (rs: CheckResult[], name: string) => rs.find((r) => r.name === name);

test("agents: opencode de brew y hermes sano pasan", async () => {
  const rs = await check(
    ctxWith({
      opencode: { path: "/opt/homebrew/bin/opencode", version: { stdout: "2.3.0\n" } },
      hermes: { path: "/usr/local/bin/hermes", version: { stdout: "hermes 1.0\n" } },
    }),
  );
  assert.equal(byName(rs, "opencode instalado con brew")?.ok, true);
  assert.equal(byName(rs, "opencode --version")?.detail, "2.3.0");
  assert.equal(byName(rs, "hermes --version")?.ok, true);
});

test("agents: avisa si opencode viene del instalador oficial", async () => {
  const rs = await check(
    ctxWith({
      opencode: { path: join(homedir(), ".opencode/bin/opencode"), version: { stdout: "2.3.0" } },
    }),
  );
  const r = byName(rs, "opencode instalado con brew");
  assert.equal(r?.ok, false);
  assert.equal(r?.warn, true);
  assert.match(r?.detail ?? "", /~\/\.opencode\/bin/);
});

test("agents: hermes instalado pero roto es un fallo con el error", async () => {
  const rs = await check(
    ctxWith({
      opencode: { path: "/opt/homebrew/bin/opencode", version: { stdout: "2.3.0" } },
      hermes: {
        path: "/usr/local/bin/hermes",
        version: {
          code: 1,
          stderr: "Could not resolve the stable source release: Unterminated string\nmás\n",
        },
      },
    }),
  );
  const r = byName(rs, "hermes --version");
  assert.equal(r?.ok, false);
  assert.equal(r?.warn, undefined);
  assert.equal(r?.detail, "Could not resolve the stable source release: Unterminated string");
});

test("agents: hermes ausente es solo un aviso; opencode ausente, fallo", async () => {
  const rs = await check(ctxWith({}));
  assert.deepEqual([byName(rs, "hermes")?.ok, byName(rs, "hermes")?.warn], [false, true]);
  assert.equal(byName(rs, "opencode")?.ok, false);
  assert.equal(byName(rs, "opencode")?.warn, undefined);
});

/** ctx con claude, rtk y uvx según `tools`, y `claude plugin list --json` con `installed`. */
function pluginCtx(opts: {
  installed: string[];
  tools?: string[];
  skip?: string[];
  rtkOk?: boolean;
}) {
  const tools = new Set(opts.tools ?? ["claude", "uvx"]);
  const runner = createFakeRunner((cmd, args) => {
    if (cmd === "sh")
      return tools.has(args[1]?.replace("command -v ", "") ?? "") ? {} : { code: 1 };
    if (cmd === "claude" && args.join(" ") === "plugin list --json")
      return { stdout: JSON.stringify(opts.installed.map((id) => ({ id }))) };
    if (cmd === "rtk") return opts.rtkOk === false ? { code: 127 } : {};
    if (args[0] === "--version") return { code: 127 };
    return undefined;
  });
  const profile = { claude: { allowed_domains: [], allow_read: [], plugins_skip: opts.skip } };
  return { root, runner, profile } as unknown as ModuleCtx;
}

test("agents: avisa de los plugins de Claude Code que faltan", async () => {
  const rs = await check(pluginCtx({ installed: ["token-saver@forja"] }));
  const r = byName(rs, "plugins de Claude Code");
  assert.deepEqual([r?.ok, r?.warn], [false, true]);
  assert.match(r?.detail ?? "", /tdd-guard@forja/);
  assert.doesNotMatch(r?.detail ?? "", /token-saver@forja/);
});

test("agents: plugins_skip quita plugins del check y avisa de nombres desconocidos", async () => {
  const all = enabledPlugins();
  const rs = await check(
    pluginCtx({
      installed: all.filter((id) => !id.startsWith("aws-core")),
      skip: ["aws-core", "nope"],
    }),
  );
  assert.equal(byName(rs, "plugins de Claude Code")?.ok, true);
  assert.equal(byName(rs, "uv (MCP de aws-core)"), undefined);
  assert.match(byName(rs, "[claude] plugins_skip")?.detail ?? "", /nope/);
});

test("agents: rtk y uvx ausentes son avisos", async () => {
  const rs = await check(
    pluginCtx({ installed: enabledPlugins(), tools: ["claude"], rtkOk: false }),
  );
  assert.deepEqual(
    [byName(rs, "rtk (token-saver)")?.ok, byName(rs, "rtk (token-saver)")?.warn],
    [false, true],
  );
  assert.deepEqual(
    [byName(rs, "uv (MCP de aws-core)")?.ok, byName(rs, "uv (MCP de aws-core)")?.warn],
    [false, true],
  );
});

test("agents: apply instala marketplaces y plugins que faltan y restaura settings.json", async () => {
  const ctx = pluginCtx({ installed: [], tools: ["claude", "uvx", "hermes", "chezmoi"] });
  await apply(ctx);
  const calls = (ctx.runner as unknown as { calls: string[] }).calls;
  assert.ok(calls.includes(`claude plugin marketplace add ${join(root, "plugins")} --scope user`));
  assert.ok(calls.includes("claude plugin marketplace add aws/agent-toolkit-for-aws --scope user"));
  assert.ok(calls.includes("claude plugin install tdd-guard@forja --scope user"));
  const restore = calls.findIndex((c) => c.startsWith("chezmoi") && c.includes("settings.json"));
  const lastInstall = calls.findLastIndex((c) => c.startsWith("claude plugin install"));
  assert.ok(restore > lastInstall, "chezmoi restaura settings.json después de instalar");
  assert.match(calls[restore] ?? "", /--force/);
});
