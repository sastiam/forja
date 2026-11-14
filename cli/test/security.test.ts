import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { HOOK_MARK, hookPath, hookState, PRE_COMMIT } from "../../modules/security/apply.ts";
import { tmp } from "./helpers.ts";

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
