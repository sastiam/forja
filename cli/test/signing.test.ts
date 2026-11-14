import assert from "node:assert/strict";
import { chmodSync, mkdtempSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { createFakeRunner } from "../src/core/runners/shell.ts";
import { checkAgentKey, enableAgentSigning, signingFindings } from "../src/core/signing.ts";

function tempKey(mode: number): string {
  const key = join(mkdtempSync(join(tmpdir(), "forja-key-")), "agent-signing");
  writeFileSync(key, "clave de prueba (no es una clave real)\n");
  chmodSync(key, mode);
  return key;
}

test("enableAgentSigning fija la firma ssh solo con --worktree", async () => {
  const key = tempKey(0o600);
  const runner = createFakeRunner(() => ({ code: 0 }));
  await enableAgentSigning(runner, "/repo", "/repo.wt/x", key);
  const calls = runner.calls.join("\n");
  assert.match(calls, /git config extensions\.worktreeConfig true/);
  assert.match(calls, /git config --worktree gpg\.format ssh/);
  assert.ok(calls.includes(`git config --worktree user.signingkey ${key}`));
  assert.match(calls, /git config --worktree commit\.gpgsign true/);
  assert.ok(!/config --global|config --system/.test(calls));
});

test("enableAgentSigning falla si la clave no existe", async () => {
  const runner = createFakeRunner(() => ({ code: 0 }));
  await assert.rejects(enableAgentSigning(runner, "/r", "/w", "/no/existe/key"), /no encontrada/);
  assert.equal(runner.calls.length, 0);
});

test("enableAgentSigning propaga el fallo de git", async () => {
  const key = tempKey(0o600);
  const runner = createFakeRunner(() => ({ code: 1, stderr: "boom" }));
  await assert.rejects(enableAgentSigning(runner, "/r", "/w", key), /boom/);
});

test("checkAgentKey: permisos correctos y clave reciente", () => {
  const f = checkAgentKey(tempKey(0o600));
  assert.ok(
    f.every((x) => x.status === "ok"),
    JSON.stringify(f),
  );
});

test("checkAgentKey: permisos abiertos fallan", () => {
  const f = checkAgentKey(tempKey(0o644));
  assert.equal(f.find((x) => x.name.endsWith("permisos"))?.status, "fail");
});

test("checkAgentKey: más de 90 días avisa de rotar", () => {
  const key = tempKey(0o600);
  const old = new Date(Date.now() - 120 * 86_400_000);
  utimesSync(key, old, old);
  assert.equal(checkAgentKey(key).find((x) => x.name.endsWith("antigüedad"))?.status, "warn");
});

test("checkAgentKey: clave inexistente falla", () => {
  assert.equal(checkAgentKey("/no/existe/key")[0]?.status, "fail");
});

test("signingFindings avisa si FileVault está apagado", async () => {
  const key = tempKey(0o600);
  const off = createFakeRunner(() => ({ stdout: "FileVault is Off.", code: 0 }));
  const f = await signingFindings(off, key, "darwin");
  assert.equal(f.find((x) => x.name.endsWith("FileVault"))?.status, "fail");
  const on = createFakeRunner(() => ({ stdout: "FileVault is On.", code: 0 }));
  assert.equal((await signingFindings(on, key, "darwin")).at(-1)?.status, "ok");
  assert.ok(!(await signingFindings(on, key, "linux")).some((x) => x.name.endsWith("FileVault")));
});
