import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { check, HOOK_MARK, hookPath, hookState, PRE_COMMIT } from "../../modules/security/apply.ts";
import type { ModuleCtx } from "../src/core/plan.ts";
import { createFakeRunner } from "../src/core/runners/shell.ts";
import { tmp } from "./helpers.ts";

test("FileVault: el consejo de activarlo solo aparece si está apagado", async () => {
  const fv = async (stdout: string) => {
    const runner = createFakeRunner((cmd) => (cmd === "fdesetup" ? { stdout } : undefined));
    const r = await check({ root: tmp(), runner } as unknown as ModuleCtx);
    return r.find((x) => x.name === "FileVault activo");
  };
  assert.deepEqual(await fv("FileVault is On.\n"), {
    name: "FileVault activo",
    ok: true,
    detail: undefined,
  });
  assert.deepEqual(await fv("FileVault is Off.\n"), {
    name: "FileVault activo",
    ok: false,
    detail: "actívalo manualmente",
  });
});

test("pre-commit de gitleaks: estados del hook", () => {
  const root = tmp();
  assert.equal(hookState(hookPath(root)), "no-repo");
  mkdirSync(join(root, ".git", "hooks"), { recursive: true });
  const path = hookPath(root) as string;
  assert.equal(hookState(path), "missing");
  writeFileSync(path, "#!/bin/sh\nnpx lint-staged\n");
  assert.equal(hookState(path), "foreign");
  writeFileSync(path, PRE_COMMIT);
  assert.equal(hookState(path), "ok");
});

test("el hook usa gitleaks sobre lo staged y lleva la marca", () => {
  assert.ok(PRE_COMMIT.startsWith("#!/bin/sh\n"));
  assert.ok(PRE_COMMIT.includes(HOOK_MARK));
  assert.match(PRE_COMMIT, /gitleaks git --pre-commit --staged/);
});
