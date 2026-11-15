import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import {
  apply,
  check,
  colimaArgs,
  colimaSize,
  idlePlist,
  mountsChanged,
  parseColimaList,
  parseColimaMounts,
  plan,
  resizePlan,
  rosetta,
} from "../../modules/containers/apply.ts";
import type { ModuleCtx } from "../src/core/plan.ts";
import { validateProfile } from "../src/core/profile.ts";
import { createFakeRunner } from "../src/core/runners/shell.ts";

// Sin colima.yaml real: los montajes se leen de aquí (COLIMA_HOME), vacío salvo que el test lo escriba.
const colimaHome = mkdtempSync(join(tmpdir(), "forja-colima-"));
process.env.COLIMA_HOME = colimaHome;
const writeColimaYaml = (yaml: string | null) => {
  const dir = join(colimaHome, "default");
  mkdirSync(dir, { recursive: true });
  const f = join(dir, "colima.yaml");
  if (yaml === null) writeFileSync(f, "cpu: 4\n");
  else writeFileSync(f, yaml);
};

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
      (c) => c.startsWith("colima start") && /--cpu 4 --memory 6 --disk 100( |$)/.test(c),
    ),
  );
  assert.ok(!runner.calls.some((c) => c.includes("delete")));
});

test("plan: una VM con el tamaño correcto y en marcha no tiene nada pendiente", async () => {
  const actions = await plan({ runner: colimaRunner(vmJson(4, 6, 40)) } as unknown as ModuleCtx);
  // El LaunchAgent de apagado depende de ~/Library: lo cubre su propio test.
  const steps = actions.filter((a) => a.kind !== "guide" && !/LaunchAgent/.test(a.description));
  assert.ok(steps.every((a) => !a.pending));
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

// Colima bajo demanda, montajes y apagado automático (ADR 0012)

test("perfil: [containers] mounts no vacío e idle_minutes >= 0", () => {
  const base = { schema: 1, host: "x", identity: { name: "n", email: "e" } };
  const p = validateProfile({
    ...base,
    containers: { mounts: ["~/code", "~/src"], idle_minutes: 0 },
  });
  assert.deepEqual(p.containers.mounts, ["~/code", "~/src"]);
  assert.equal(p.containers.idle_minutes, 0);
  assert.throws(() => validateProfile({ ...base, containers: { mounts: [] } }), /mounts/);
  assert.throws(
    () => validateProfile({ ...base, containers: { idle_minutes: -1 } }),
    /idle_minutes/,
  );
});

test("colimaArgs monta cada carpeta con escritura", () => {
  assert.match(
    colimaArgs({ cpu: 4, memoryGb: 6, diskGb: 40 }, true, ["/Users/x/code"]).join(" "),
    /--disk 40 --mount \/Users\/x\/code:w$/,
  );
});

test("colima.yaml: [] es $HOME completo; lee la lista de location", () => {
  assert.deepEqual(parseColimaMounts("cpu: 4\nmounts: []\nmountType: virtiofs\n"), []);
  const yaml =
    'mounts:\n  - location: ~/code\n    writable: true\n  - location: "/tmp/x"\nmountType: virtiofs\n';
  assert.deepEqual(parseColimaMounts(yaml), ["~/code", "/tmp/x"]);
  assert.equal(parseColimaMounts("cpu: 4\n"), null);
});

test("mountsChanged: compara con ~ expandido; sin datos no marca cambio", () => {
  const home = process.env.HOME ?? "";
  assert.equal(mountsChanged(["~/code"], ["~/code"]), false);
  assert.equal(mountsChanged([`${home}/code`], ["~/code"]), false);
  assert.equal(mountsChanged([], ["~/code"]), true);
  assert.equal(mountsChanged(null, ["~/code"]), false);
});

test("plan: Colima apagada y bien configurada no es un desvío", async () => {
  writeColimaYaml("mounts:\n  - location: ~/code\n    writable: true\n");
  const actions = await plan({
    runner: colimaRunner(vmJson(4, 6, 40, "Stopped"), false),
  } as unknown as ModuleCtx);
  const step = actions.find((a) => /Colima creada/.test(a.description));
  assert.equal(step?.pending, false);
  assert.match(step?.description ?? "", /arranca bajo demanda/);
});

test("plan: una VM que monta $HOME entero se reinicia para montar solo ~/code", async () => {
  writeColimaYaml("mounts: []\n");
  const actions = await plan({ runner: colimaRunner(vmJson(4, 6, 40)) } as unknown as ModuleCtx);
  const step = actions.find((a) => /montar solo/.test(a.description));
  assert.equal(step?.pending, true);
  assert.match(step?.description ?? "", /montar solo ~\/code \(ahora: \$HOME completo\)/);
  const checks = await check({ runner: colimaRunner(vmJson(4, 6, 40)) } as unknown as ModuleCtx);
  assert.equal(checks.find((c) => /monta solo/.test(c.name))?.ok, false);
  writeColimaYaml(null);
});

test("apply: con $HOME montado para, arranca con --mount y no arranca una VM apagada sin cambios", async () => {
  writeColimaYaml("mounts: []\n");
  let running = true;
  const runner = createFakeRunner((cmd, args) => {
    if (cmd === "sysctl") return { stdout: `14\n${48 * 1024 ** 3}\n` };
    if (cmd === "colima" && args[0] === "list") return { stdout: `${vmJson(4, 6, 40)}\n` };
    if (cmd === "colima" && args[0] === "status") return { code: running ? 0 : 1 };
    if (cmd === "colima" && args[0] === "stop") running = false;
    return undefined;
  }, false);
  await apply({ runner } as unknown as ModuleCtx);
  assert.ok(runner.calls.includes("colima stop"));
  assert.ok(
    runner.calls.some((c) => c.startsWith("colima start") && /--mount \S+\/code:w$/.test(c)),
  );

  writeColimaYaml("mounts:\n  - location: ~/code\n");
  const idle = colimaRunner(vmJson(4, 6, 40, "Stopped"), false);
  await apply({ runner: idle } as unknown as ModuleCtx);
  assert.ok(!idle.calls.some((c) => c.startsWith("colima start") || c === "colima stop"));
  writeColimaYaml(null);
});

test("LaunchAgent de apagado: plist con los minutos; apply lo carga con launchctl", async () => {
  const plist = idlePlist(15, "/Users/x");
  assert.match(
    plist,
    /<string>\/Users\/x\/.config\/forja\/bin\/colima-idle<\/string><string>15<\/string>/,
  );
  assert.match(plist, /<key>StartInterval<\/key><integer>300<\/integer>/);
  const runner = createFakeRunner((cmd, args) => {
    if (cmd === "id") return { stdout: "501\n" };
    if (cmd === "launchctl" && args[0] === "print") return { code: 113 };
    if (cmd === "sysctl") return { stdout: `14\n${48 * 1024 ** 3}\n` };
    if (cmd === "colima" && args[0] === "list") return { stdout: `${vmJson(4, 6, 40)}\n` };
    return undefined;
  }, false);
  await apply({ runner } as unknown as ModuleCtx);
  assert.ok(runner.calls.some((c) => /^write .*dev\.forja\.colima-idle\.plist$/.test(c)));
  assert.ok(
    runner.calls.some((c) => /^launchctl bootstrap gui\/501 .*colima-idle\.plist$/.test(c)),
  );
});

// Los scripts de ~/.config/forja/bin y el hook, con colima/docker simulados.

const root = join(import.meta.dirname, "..", "..");
const BIN = join(root, "home/private_dot_config/private_forja/bin");
const HOOK = join(root, "home/private_dot_claude/hooks/executable_colima-up.sh");

/** PATH con `colima` y `docker` falsos: el estado vive en archivos de `dir`. */
function fakeEnv(opts: { running: boolean; ps?: string }) {
  const dir = mkdtempSync(join(tmpdir(), "forja-fake-"));
  const bin = join(dir, "bin");
  mkdirSync(bin);
  const log = join(dir, "calls.log");
  const flag = join(dir, "running");
  if (opts.running) writeFileSync(flag, "");
  const script = (name: string, body: string) => {
    writeFileSync(join(bin, name), `#!/bin/sh\necho "${name} $*" >> "${log}"\n${body}\n`);
    chmodSync(join(bin, name), 0o755);
  };
  script(
    "colima",
    `case "$1" in status) [ -f "${flag}" ];; start) touch "${flag}";; stop) rm -f "${flag}";; esac`,
  );
  script("docker", `printf '%s' "${opts.ps ?? ""}"`);
  script("pgrep", "exit 1");
  const env = {
    PATH: `${bin}:/usr/bin:/bin`,
    HOME: dir,
    XDG_STATE_HOME: join(dir, "state"),
  };
  const calls = () => (existsSync(log) ? readFileSync(log, "utf8") : "");
  return { dir, env, calls, running: () => existsSync(flag) };
}

const run = (file: string, args: string[], env: Record<string, string>, input = "") =>
  spawnSync("bash", [file, ...args], { env, input, encoding: "utf8" });

test("colima-ensure: arranca solo si está apagada y limpia la marca de inactividad", () => {
  const off = fakeEnv({ running: false });
  mkdirSync(join(off.env.XDG_STATE_HOME, "forja"), { recursive: true });
  writeFileSync(join(off.env.XDG_STATE_HOME, "forja", "colima-idle.since"), "1");
  assert.equal(run(join(BIN, "executable_colima-ensure"), [], off.env).status, 0);
  assert.ok(off.running());
  assert.ok(!existsSync(join(off.env.XDG_STATE_HOME, "forja", "colima-idle.since")));
  const on = fakeEnv({ running: true });
  run(join(BIN, "executable_colima-ensure"), [], on.env);
  assert.doesNotMatch(on.calls(), /colima start/);
});

test("colima-idle: marca, espera los minutos y para; con contenedores no para", () => {
  const idle = join(BIN, "executable_colima-idle");
  const e = fakeEnv({ running: true });
  const stamp = join(e.env.XDG_STATE_HOME, "forja", "colima-idle.since");
  run(idle, ["15"], e.env);
  assert.ok(existsSync(stamp), "primera pasada sin contenedores: marca");
  run(idle, ["15"], e.env);
  assert.ok(e.running(), "aún no han pasado 15 min");
  writeFileSync(stamp, String(Math.floor(Date.now() / 1000) - 16 * 60));
  run(idle, ["15"], e.env);
  assert.ok(!e.running(), "16 min sin contenedores: colima stop");

  const busy = fakeEnv({ running: true, ps: "abc123" });
  const bstamp = join(busy.env.XDG_STATE_HOME, "forja", "colima-idle.since");
  mkdirSync(join(busy.env.XDG_STATE_HOME, "forja"), { recursive: true });
  writeFileSync(bstamp, "1");
  run(idle, ["15"], busy.env);
  assert.ok(busy.running());
  assert.ok(!existsSync(bstamp), "con contenedores la cuenta se reinicia");

  const never = fakeEnv({ running: true });
  run(idle, ["0"], never.env);
  assert.equal(never.calls(), "");
});

test("hook colima-up: solo llama a colima-ensure si el comando usa Docker", () => {
  const e = fakeEnv({ running: false });
  const ensureDir = join(e.dir, ".config", "forja", "bin");
  mkdirSync(ensureDir, { recursive: true });
  const marker = join(e.dir, "ensured");
  writeFileSync(join(ensureDir, "colima-ensure"), `#!/bin/sh\ntouch "${marker}"\n`);
  chmodSync(join(ensureDir, "colima-ensure"), 0o755);
  const hook = (command: string) => {
    if (existsSync(marker)) execFileSync("rm", [marker]);
    const r = run(HOOK, [], e.env, JSON.stringify({ tool_input: { command } }));
    assert.equal(r.status, 0);
    return existsSync(marker);
  };
  assert.equal(hook("docker run --rm hello-world"), true);
  assert.equal(hook("cd app && pnpm cdk deploy"), true);
  assert.equal(hook("floci start"), true);
  assert.equal(hook("git status"), false);
  assert.equal(hook("cat my-docker-notes.md"), false);
  assert.equal(hook("ls ./dockerfiles"), false);
});
