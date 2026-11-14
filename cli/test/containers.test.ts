import assert from "node:assert/strict";
import { test } from "node:test";
import { check } from "../../modules/containers/apply.ts";
import type { ModuleCtx } from "../src/core/plan.ts";
import { createFakeRunner } from "../src/core/runners/shell.ts";

const ctxFor = (stdout: string, code = 0) =>
  ({ runner: createFakeRunner(() => ({ stdout, code })) }) as unknown as ModuleCtx;

test("containers acepta los contextos colima y orbstack", async () => {
  for (const name of ["colima", "orbstack"])
    assert.equal((await check(ctxFor(`${name}\n`)))[0]?.ok, true, name);
});

test("containers rechaza default y docker ausente", async () => {
  assert.equal((await check(ctxFor("default\n")))[0]?.ok, false);
  const none = (await check(ctxFor("", 1)))[0];
  assert.equal(none?.ok, false);
  assert.match(none?.detail ?? "", /colima start/);
});
