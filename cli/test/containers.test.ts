import assert from "node:assert/strict";
import { test } from "node:test";
import {
  apply,
  check,
  colimaArgs,
  colimaSize,
  parseColimaList,
  plan,
  resizePlan,
  rosetta,
} from "../../modules/containers/apply.ts";
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

test("colimaSize: ligero por defecto (tercio de núcleos 2–4, octavo de RAM 4–8 GB, 40 GB)", () => {
  const gb = 1024 ** 3;
  assert.deepEqual(colimaSize(14, 48 * gb), { cpu: 4, memoryGb: 6, diskGb: 40 });
  assert.deepEqual(colimaSize(16, 128 * gb), { cpu: 4, memoryGb: 8, diskGb: 40 });
  assert.deepEqual(colimaSize(4, 8 * gb), { cpu: 2, memoryGb: 4, diskGb: 40 });
});

test("colimaSize: el perfil fija cualquiera de los tres", () => {
  const gb = 1024 ** 3;
  assert.deepEqual(colimaSize(14, 48 * gb, { disk_gb: 25 }), { cpu: 4, memoryGb: 6, diskGb: 25 });
  assert.deepEqual(colimaSize(14, 48 * gb, { cpu: 2, memory_gb: 4 }), {
    cpu: 2,
    memoryGb: 4,
    diskGb: 40,
  });
});

test("colima list --json: lee la VM default", () => {
  const line = JSON.stringify({
    name: "default",
    status: "Running",
    cpus: 7,
    memory: 12 * 1024 ** 3,
    disk: 100 * 1024 ** 3,
  });
  assert.deepEqual(parseColimaList(`basura\n${line}\n`), {
    status: "Running",
    cpu: 7,
    memoryGb: 12,
    diskGb: 100,
  });
  assert.equal(parseColimaList(""), null);
});

test("resizePlan: CPU/RAM se reinician; un disco mayor que el tope exige recrear", () => {
  const want = { cpu: 4, memoryGb: 6, diskGb: 40 };
  assert.deepEqual(resizePlan(null, want), { restart: false, recreate: false });
  assert.deepEqual(resizePlan(want, want), { restart: false, recreate: false });
  assert.deepEqual(resizePlan({ cpu: 7, memoryGb: 12, diskGb: 40 }, want), {
    restart: true,
    recreate: false,
  });
  assert.deepEqual(resizePlan({ cpu: 4, memoryGb: 6, diskGb: 100 }, want), {
    restart: false,
    recreate: true,
  });
});

const vmJson = (cpus: number, memGb: number, diskGb: number, status = "Running") =>
  JSON.stringify({
    name: "default",
    status,
    cpus,
    memory: memGb * 1024 ** 3,
    disk: diskGb * 1024 ** 3,
  });

function colimaRunner(vm: string, running = true) {
  return createFakeRunner((cmd, args) => {
    if (cmd === "sysctl") return { stdout: `14\n${48 * 1024 ** 3}\n` };
    if (cmd === "colima" && args[0] === "list") return { stdout: `${vm}\n` };
    if (cmd === "colima" && args[0] === "status") return { code: running ? 0 : 1 };
    return undefined;
  }, false);
}

test("plan: una VM más grande se reinicia con el tamaño nuevo y avisa del disco", async () => {
  const runner = colimaRunner(vmJson(7, 12, 100));
  const actions = await plan({ runner } as unknown as ModuleCtx);
  const guide = actions.find((a) => a.kind === "guide" && /no se reduce/.test(a.description));
  assert.ok(guide, "avisa de que el disco no se reduce");
  assert.match(guide?.description ?? "", /colima delete --force/);
  const step = actions.find((a) => a.kind === "step");
  assert.equal(step?.pending, true);
  assert.match(step?.description ?? "", /reiniciar Colima con 4 CPU, 6 GB.*ahora 7 CPU, 12 GB/);
});

test("apply: para y arranca con CPU/RAM nuevas sin pedir menos disco ni borrar la VM", async () => {
  let running = true;
  const runner = createFakeRunner((cmd, args) => {
    if (cmd === "sysctl") return { stdout: `14\n${48 * 1024 ** 3}\n` };
    if (cmd === "colima" && args[0] === "list") return { stdout: `${vmJson(7, 12, 100)}\n` };
    if (cmd === "colima" && args[0] === "status") return { code: running ? 0 : 1 };
    if (cmd === "colima" && args[0] === "stop") running = false;
    return undefined;
  }, false);
  await apply({ runner } as unknown as ModuleCtx);
  assert.ok(runner.calls.includes("colima stop"));
  assert.ok(
    runner.calls.some(
      (c) => c.startsWith("colima start") && /--cpu 4 --memory 6 --disk 100$/.test(c),
    ),
  );
  assert.ok(!runner.calls.some((c) => c.includes("delete")));
});

test("plan: una VM con el tamaño correcto y en marcha no tiene nada pendiente", async () => {
  const actions = await plan({ runner: colimaRunner(vmJson(4, 6, 40)) } as unknown as ModuleCtx);
  assert.ok(actions.filter((a) => a.kind !== "guide").every((a) => !a.pending));
});

test("colimaArgs usa vz, virtiofs y rosetta", () => {
  assert.deepEqual(
    colimaArgs({ cpu: 7, memoryGb: 9, diskGb: 100 }).join(" "),
    "start --vm-type vz --mount-type virtiofs --vz-rosetta --cpu 7 --memory 9 --disk 100",
  );
});

/** Apple Silicon con o sin Rosetta 2; Colima parado. */
function rosettaRunner(installed: boolean) {
  return createFakeRunner((cmd, args) => {
    if (cmd === "uname") return { stdout: "arm64\n" };
    if (cmd === "/usr/bin/arch") return { code: installed ? 0 : 1 };
    if (cmd === "sysctl") return { stdout: `14\n${48 * 1024 ** 3}\n` };
    if (cmd === "colima" && args[0] !== "start") return { code: 1 };
    return undefined;
  }, false);
}

test("Rosetta: no aplica fuera de Apple Silicon", async () => {
  const runner = createFakeRunner((cmd) => (cmd === "uname" ? { stdout: "x86_64\n" } : undefined));
  assert.equal(await rosetta(runner), "n/a");
  assert.ok(!runner.calls.some((c) => c.startsWith("/usr/bin/arch")));
});

test("Rosetta: plan y doctor la piden si falta en Apple Silicon", async () => {
  const actions = await plan({ runner: rosettaRunner(false) } as unknown as ModuleCtx);
  const step = actions.find((a) => /Rosetta 2/.test(a.description));
  assert.equal(step?.pending, true);
  assert.match(step?.description ?? "", /softwareupdate --install-rosetta --agree-to-license/);
  const checks = await check({ runner: rosettaRunner(false) } as unknown as ModuleCtx);
  const r = checks.find((c) => c.name === "Rosetta 2 instalada");
  assert.equal(r?.warn, true);
  const ok = await check({ runner: rosettaRunner(true) } as unknown as ModuleCtx);
  assert.ok(!ok.some((c) => c.name === "Rosetta 2 instalada"));
});

test("Rosetta: apply la instala antes de arrancar Colima con --vz-rosetta", async () => {
  const runner = rosettaRunner(false);
  await apply({ runner } as unknown as ModuleCtx);
  const install = runner.calls.findIndex((c) => c.startsWith("sudo softwareupdate"));
  const start = runner.calls.findIndex((c) => c.startsWith("colima start"));
  assert.ok(install >= 0 && start > install);
  assert.match(runner.calls[start] ?? "", /--vz-rosetta/);
});

test("Rosetta: si no se instala, Colima arranca sin --vz-rosetta", async () => {
  const runner = createFakeRunner((cmd, args) => {
    if (cmd === "uname") return { stdout: "arm64\n" };
    if (cmd === "/usr/bin/arch" || (cmd === "sudo" && args[0] === "softwareupdate"))
      return { code: 1 };
    if (cmd === "sysctl") return { stdout: `14\n${48 * 1024 ** 3}\n` };
    if (cmd === "colima" && args[0] !== "start") return { code: 1 };
    return undefined;
  }, false);
  await apply({ runner } as unknown as ModuleCtx);
  const start = runner.calls.find((c) => c.startsWith("colima start"));
  assert.ok(start && !start.includes("--vz-rosetta"));
});

test("Rosetta: recién instalada con Colima en marcha, apply lo reinicia", async () => {
  let running = true;
  const runner = createFakeRunner((cmd, args) => {
    if (cmd === "uname") return { stdout: "arm64\n" };
    if (cmd === "/usr/bin/arch") return { code: 1 };
    if (cmd === "sysctl") return { stdout: `14\n${48 * 1024 ** 3}\n` };
    if (cmd === "colima" && args[0] === "list") return { stdout: `${vmJson(4, 6, 40)}\n` };
    if (cmd === "colima" && args[0] === "status") return { code: running ? 0 : 1 };
    if (cmd === "colima" && args[0] === "stop") running = false;
    return undefined;
  }, false);
  await apply({ runner } as unknown as ModuleCtx);
  assert.ok(runner.calls.includes("colima stop"));
  assert.ok(runner.calls.some((c) => c.startsWith("colima start") && c.includes("--vz-rosetta")));
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
  assert.match(a?.description ?? "", /4 CPU, 5 GB, 40 GB de disco/);
});
