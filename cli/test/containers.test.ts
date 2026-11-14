import assert from "node:assert/strict";
import { test } from "node:test";
import { check, colimaArgs, colimaSize, plan } from "../../modules/containers/apply.ts";
import type { ModuleCtx } from "../src/core/plan.ts";
import { createFakeRunner } from "../src/core/runners/shell.ts";

const ctxFor = (stdout: string, code = 0) =>
  ({ runner: createFakeRunner(() => ({ stdout, code })) }) as unknown as ModuleCtx;

test("containers acepta solo el contexto colima", async () => {
  assert.equal((await check(ctxFor("colima\n")))[0]?.ok, true);
  const orb = (await check(ctxFor("orbstack\n")))[0];
  assert.equal(orb?.ok, false);
  assert.match(orb?.detail ?? "", /docker context use colima/);
});

test("containers rechaza default y docker ausente", async () => {
  assert.equal((await check(ctxFor("default\n")))[0]?.ok, false);
  const none = (await check(ctxFor("", 1)))[0];
  assert.equal(none?.ok, false);
  assert.match(none?.detail ?? "", /colima start/);
});

test("colimaSize: mitad de núcleos y un cuarto de la RAM, con límites", () => {
  const gb = 1024 ** 3;
  assert.deepEqual(colimaSize(14, 36 * gb), { cpu: 7, memoryGb: 9, diskGb: 100 });
  assert.deepEqual(colimaSize(16, 128 * gb), { cpu: 8, memoryGb: 24, diskGb: 100 });
  assert.deepEqual(colimaSize(4, 8 * gb), { cpu: 2, memoryGb: 4, diskGb: 100 });
});

test("colimaArgs usa vz, virtiofs y rosetta", () => {
  assert.deepEqual(
    colimaArgs({ cpu: 7, memoryGb: 9, diskGb: 100 }).join(" "),
    "start --vm-type vz --mount-type virtiofs --vz-rosetta --cpu 7 --memory 9 --disk 100",
  );
});

test("plan: Colima parado queda pendiente con el tamaño de la máquina", async () => {
  const runner = createFakeRunner((cmd) =>
    cmd === "sysctl"
      ? { stdout: `14\n${36 * 1024 ** 3}\n` }
      : cmd === "colima"
        ? { code: 1 }
        : undefined,
  );
  const [a] = await plan({ runner } as unknown as ModuleCtx);
  assert.equal(a?.pending, true);
  assert.match(a?.description ?? "", /7 CPU, 9 GB/);
});
