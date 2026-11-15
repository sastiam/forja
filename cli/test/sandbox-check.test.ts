import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { checkSandboxActive, checkWritable, runChecks } from "../src/commands/sandbox-check.ts";
import { createFakeRunner } from "../src/core/runners/shell.ts";

const dir = (): string => mkdtempSync(join(tmpdir(), "forja-sbx-"));

test("checkWritable: ok en un directorio escribible y fail con el arreglo si no", () => {
  assert.equal(checkWritable("x", dir(), "arreglo").status, "ok");
  const bad = checkWritable("x", "/no/existe", "haz esto");
  assert.equal(bad.status, "fail");
  assert.equal(bad.fix, "haz esto");
});

test("runChecks: todo correcto", async () => {
  const cwd = dir();
  const runner = createFakeRunner((cmd, args) =>
    cmd === "git" && args[1] === "--absolute-git-dir" ? { stdout: `${cwd}\n` } : { code: 0 },
  );
  const f = await runChecks(runner, { cwd, hosts: ["github.com"], keyPath: "/k" });
  assert.ok(
    f.every((x) => x.status === "ok"),
    JSON.stringify(f),
  );
});

test("runChecks: red denegada y git ilegible dan el arreglo concreto", async () => {
  const cwd = dir();
  const runner = createFakeRunner((cmd, args) => {
    if (cmd === "git" && args[1] === "--absolute-git-dir") return { stdout: `${cwd}\n` };
    if (cmd === "git") return { code: 128, stderr: "fatal: no es posible acceder\n" };
    if (cmd === "curl") return { code: 56, stderr: "CONNECT tunnel failed, response 403\n" };
    return { code: 0 };
  });
  const f = await runChecks(runner, { cwd, hosts: ["registry.example.invalid"] });
  const net = f.find((x) => x.name === "red: registry.example.invalid");
  assert.equal(net?.status, "fail");
  assert.match(net?.fix ?? "", /allowedDomains/);
  assert.equal(f.find((x) => x.name.startsWith("git: lee"))?.status, "fail");
});

test("runChecks: git-dir de solo lectura impide commitear", async () => {
  const cwd = dir();
  const runner = createFakeRunner((cmd, args) =>
    cmd === "git" && args[1] === "--absolute-git-dir"
      ? { stdout: "/no/existe/.git/worktrees/x\n" }
      : { code: 0 },
  );
  const f = await runChecks(runner, { cwd, hosts: [] });
  assert.equal(f.find((x) => x.name.includes("commitear"))?.status, "fail");
});

test("runChecks: firma fallida se reporta y sin clave se omite", async () => {
  const cwd = dir();
  const base = (cmd: string, args: string[]) =>
    cmd === "git" && args[1] === "--absolute-git-dir" ? { stdout: `${cwd}\n` } : { code: 0 };
  const bad = createFakeRunner((cmd, args) =>
    cmd === "ssh-keygen" ? { code: 255, stderr: "No such file\n" } : base(cmd, args),
  );
  const f = await runChecks(bad, { cwd, hosts: [], keyPath: "/k" });
  assert.equal(f.find((x) => x.name.startsWith("firma"))?.status, "fail");
  const none = await runChecks(createFakeRunner(base), { cwd, hosts: [] });
  assert.equal(none.find((x) => x.name.startsWith("firma"))?.status, "skip");
});

test("checkSandboxActive: ok si no se puede escribir, fail si se puede", () => {
  assert.equal(checkSandboxActive(dir()).status, "fail");
  assert.equal(checkSandboxActive("/no/existe").status, "ok");
});

test("runChecks --inside-loop: omite firma y git-dir, exige sandbox activo", async () => {
  const cwd = dir();
  const runner = createFakeRunner((cmd, args) =>
    cmd === "git" && args[1] === "--absolute-git-dir" ? { stdout: "/solo/lectura\n" } : { code: 0 },
  );
  const f = await runChecks(runner, {
    cwd,
    hosts: [],
    keyPath: "/k",
    insideLoop: true,
    outsideDir: dir(),
  });
  const by = Object.fromEntries(f.map((x) => [x.name, x.status]));
  assert.equal(by["firma de agentes: la clave firma"], "skip");
  assert.equal(by["git: se puede commitear (escritura en el git-dir)"], "skip");
  // outsideDir es escribible (como $HOME sin sandbox): el check debe fallar.
  assert.equal(by["sandbox activo (no escribe fuera del worktree)"], "fail");
  assert.ok(!runner.calls.some((c) => c.startsWith("ssh-keygen")));
});
