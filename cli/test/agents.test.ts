import assert from "node:assert/strict";
import { homedir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { check } from "../../modules/agents/apply.ts";
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
