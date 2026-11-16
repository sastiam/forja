import assert from "node:assert/strict";
import { test } from "node:test";
import { createFakeRunner } from "../src/core/runners/shell.ts";
import {
  insideCheckCommand,
  insidePreflight,
  nightSettings,
  parsePreflight,
  preflightClaudeArgs,
  SECRET_READ_DENY,
} from "../src/wt/night-sandbox.ts";

interface Sbx {
  enabled: boolean;
  failIfUnavailable: boolean;
  allowUnsandboxedCommands: boolean;
  network: { allowedDomains: string[]; allowUnixSockets?: string[] };
  filesystem: { allowRead: string[]; allowWrite: string[] };
}

const base = {
  enabled: true,
  allowed_domains: ["github.com", "api.github.com"],
  allow_read: ["~/.config/forja/local/git.local.gitconfig"],
  allow_write: ["~/Library/Application Support/rtk"],
};

test("nightSettings: sandbox obligatorio, sin escapes y dominios unidos sin duplicados", () => {
  const s = nightSettings({
    base,
    hosts: ["github.com", "registry.npmjs.org"],
    docker: true,
    homeDir: "/h",
  });
  const sb = s.sandbox as Sbx;
  assert.equal(sb.enabled, true);
  assert.equal(sb.failIfUnavailable, true);
  assert.equal(sb.allowUnsandboxedCommands, false);
  assert.deepEqual(sb.network.allowedDomains, [
    "github.com",
    "api.github.com",
    "registry.npmjs.org",
  ]);
  assert.deepEqual(sb.network.allowUnixSockets, ["/h/.colima/default/docker.sock"]);
  assert.deepEqual(sb.filesystem.allowRead, base.allow_read);
  assert.deepEqual(sb.filesystem.allowWrite, base.allow_write);
  assert.deepEqual((s.permissions as { deny: string[] }).deny, SECRET_READ_DENY);
});

test("nightSettings: sin containers no abre el socket de Docker", () => {
  const sb = nightSettings({ base, hosts: [], docker: false }).sandbox as Sbx;
  assert.equal(sb.network.allowUnixSockets, undefined);
});

test("preflightClaudeArgs: mismo settings y fuentes que el loop, Haiku y solo Bash", () => {
  const a = preflightClaudeArgs("/s.json", ["github.com"]);
  const flag = (f: string) => a[a.indexOf(f) + 1];
  assert.equal(flag("--settings"), "/s.json");
  assert.equal(flag("--setting-sources"), "project");
  assert.equal(flag("--permission-mode"), "dontAsk");
  assert.equal(flag("--allowedTools"), "Bash");
  assert.equal(flag("--model"), "haiku");
  assert.ok(a[1]?.includes(insideCheckCommand(["github.com"])));
  assert.equal(
    insideCheckCommand(["a", "b"]),
    "forja sandbox-check --json --inside-loop --host a --host b",
  );
});

const claudeOut = (result: string, extra = {}) =>
  JSON.stringify({ type: "result", result, ...extra });

test("parsePreflight: lee el informe y marca cada check como del sandbox", () => {
  const report = { ok: true, findings: [{ name: "red: github.com", status: "ok" }] };
  const f = parsePreflight(0, claudeOut(`Salida:\n${JSON.stringify(report)}\n`), "");
  assert.deepEqual(f, [{ name: "sandbox: red: github.com", status: "ok" }]);
});

test("parsePreflight: falla cerrado ante error, salida rara o respuesta sin informe", () => {
  for (const [code, out, err] of [
    [1, "", "command not found: claude"],
    [0, claudeOut("x", { is_error: true }), ""],
    [0, claudeOut("No puedo ejecutar ese comando."), ""],
    [0, claudeOut('{"ok": true}'), ""],
  ] as const) {
    const f = parsePreflight(code, out, err);
    assert.equal(f.length, 1);
    assert.equal(f[0]?.status, "fail", out || err);
    assert.ok(f[0]?.fix);
  }
});

test("insidePreflight: ejecuta claude en el worktree", async () => {
  const runner = createFakeRunner((cmd) =>
    cmd === "claude"
      ? { stdout: claudeOut('{"ok":false,"findings":[{"name":"x","status":"fail"}]}') }
      : undefined,
  );
  const f = await insidePreflight(runner, "/wt", "/s.json", ["github.com"]);
  assert.equal(f[0]?.status, "fail");
  assert.ok(runner.calls[0]?.startsWith("claude -p"));
});
