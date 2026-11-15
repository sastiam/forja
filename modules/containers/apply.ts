import { existsSync } from "node:fs";
import { log } from "../../cli/src/core/log.ts";
import type { Action, CheckResult, ModuleCtx } from "../../cli/src/core/plan.ts";
import type { Runner } from "../../cli/src/core/runners/shell.ts";

/** Runtime único: Colima (ADR 0007). OrbStack ya no se usa. */
export const RUNTIME_CONTEXT = "colima";
export const ORBSTACK_APP = "/Applications/OrbStack.app";

export interface ColimaSize {
  cpu: number;
  memoryGb: number;
  diskGb: number;
}

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

/**
 * Tamaño por defecto de la VM: ligero. Floci, CDK y un par de servicios caben
 * en un tercio de los núcleos (2–4) y un octavo de la RAM (4–8 GB); la RAM se
 * reserva entera mientras la VM está encendida. El disco virtual crece con el
 * uso hasta el tope y no se puede reducir sin borrar la VM, así que el tope es
 * moderado (40 GB). `[containers]` del perfil fija cualquiera de los tres.
 */
export function colimaSize(
  ncpu: number,
  memBytes: number,
  override: Partial<{ cpu: number; memory_gb: number; disk_gb: number }> = {},
): ColimaSize {
  const memGb = memBytes / 1024 ** 3;
  return {
    cpu: override.cpu ?? clamp(Math.floor(ncpu / 3), 2, 4),
    memoryGb: override.memory_gb ?? clamp(Math.round(memGb / 8), 4, 8),
    diskGb: override.disk_gb ?? 40,
  };
}

/** VM ya creada (`colima list --json`, una línea JSON por perfil). */
export function parseColimaList(stdout: string): (ColimaSize & { status: string }) | null {
  for (const line of stdout.split("\n")) {
    try {
      const v = JSON.parse(line) as {
        name?: string;
        status?: string;
        cpus?: number;
        memory?: number;
        disk?: number;
      };
      if (v.name !== "default") continue;
      return {
        status: v.status ?? "",
        cpu: v.cpus ?? 0,
        memoryGb: Math.round((v.memory ?? 0) / 1024 ** 3),
        diskGb: Math.round((v.disk ?? 0) / 1024 ** 3),
      };
    } catch {}
  }
  return null;
}

/**
 * Qué hay que hacer para llegar a `want`: CPU y RAM cambian con stop + start;
 * el disco solo crece, así que uno mayor que el deseado exige borrar la VM.
 */
export function resizePlan(
  have: ColimaSize | null,
  want: ColimaSize,
): { restart: boolean; recreate: boolean } {
  if (!have) return { restart: false, recreate: false };
  return {
    restart: have.cpu !== want.cpu || have.memoryGb !== want.memoryGb || have.diskGb < want.diskGb,
    recreate: have.diskGb > want.diskGb,
  };
}

const fmt = (s: ColimaSize) => `${s.cpu} CPU, ${s.memoryGb} GB, ${s.diskGb} GB de disco`;

/** Sin Rosetta 2, `--vz-rosetta` no tiene con qué emular amd64: se arranca sin él. */
export function colimaArgs(s: ColimaSize, rosetta = true): string[] {
  return [
    "start",
    "--vm-type",
    "vz",
    "--mount-type",
    "virtiofs",
    ...(rosetta ? ["--vz-rosetta"] : []),
    "--cpu",
    String(s.cpu),
    "--memory",
    String(s.memoryGb),
    "--disk",
    String(s.diskGb),
  ];
}

export const ROSETTA_INSTALL = ["softwareupdate", "--install-rosetta", "--agree-to-license"];

/**
 * Rosetta 2: "n/a" fuera de Apple Silicon. Una Mac nueva no la trae, y sin ella
 * las imágenes amd64 (muchas de Floci y de Lambda) no corren con `--vz-rosetta`.
 */
export async function rosetta(runner: Runner): Promise<"ok" | "missing" | "n/a"> {
  if ((await runner.query("uname", ["-m"])).stdout.trim() !== "arm64") return "n/a";
  const r = await runner.query("/usr/bin/arch", ["-x86_64", "/usr/bin/true"]);
  return r.code === 0 ? "ok" : "missing";
}

async function machineSize(ctx: ModuleCtx): Promise<ColimaSize | null> {
  const r = await ctx.runner.query("sysctl", ["-n", "hw.ncpu", "hw.memsize"]);
  const [ncpu, mem] = r.stdout.trim().split(/\s+/).map(Number);
  return r.code === 0 && ncpu && mem ? colimaSize(ncpu, mem, ctx.profile?.containers) : null;
}

async function currentVm(runner: Runner) {
  const r = await runner.query("colima", ["list", "--json"]);
  return r.code === 0 ? parseColimaList(r.stdout) : null;
}

async function colimaRunning(runner: Runner): Promise<boolean> {
  return (await runner.query("colima", ["status"])).code === 0;
}

export async function plan(ctx: ModuleCtx): Promise<Action[]> {
  const size = await machineSize(ctx);
  const actions: Action[] = [];
  if ((await rosetta(ctx.runner)) === "missing")
    actions.push({
      kind: "step",
      description: `instalar Rosetta 2 para imágenes amd64 (sudo ${ROSETTA_INSTALL.join(" ")})`,
      pending: true,
    });
  if (size) {
    const vm = await currentVm(ctx.runner);
    const r = resizePlan(vm, size);
    if (vm && r.recreate)
      actions.push({
        kind: "guide",
        description: `Colima tiene ${vm.diskGb} GB de disco y el tope es ${size.diskGb} GB: el disco no se reduce. Para recrearla (borra imágenes y volúmenes): colima delete --force && forja apply containers`,
        pending: true,
      });
    actions.push({
      kind: "step",
      description:
        vm && r.restart
          ? `reiniciar Colima con ${fmt(size)} (ahora ${fmt(vm)})`
          : `arrancar Colima (vz, virtiofs, ${fmt(size)}) y usar su contexto docker`,
      pending: r.restart || !(await colimaRunning(ctx.runner)),
    });
  }
  if (existsSync(ORBSTACK_APP))
    actions.push({
      kind: "guide",
      description: "OrbStack sigue instalado: brew uninstall --cask orbstack (ADR 0007)",
      pending: true,
    });
  return actions;
}

export async function apply(ctx: ModuleCtx): Promise<void> {
  const { runner } = ctx;
  const size = await machineSize(ctx);
  const vm = size ? await currentVm(runner) : null;
  // Rosetta antes de arrancar: una VM que arrancó sin ella no emula amd64 hasta reiniciarse.
  let ros = await rosetta(runner);
  let rosettaNew = false;
  if (ros === "missing") {
    const r = await runner.exec("sudo", ROSETTA_INSTALL, { stream: true });
    if (r.code === 0) [ros, rosettaNew] = ["ok", true];
    else
      log.warn(
        `Rosetta 2 no se instaló: Colima arranca sin --vz-rosetta (${ROSETTA_INSTALL.join(" ")})`,
      );
  }
  // Nunca borra la VM solo: con un disco mayor que el tope, plan lo indica como guía.
  const resize = size && vm ? resizePlan(vm, size).restart : false;
  if (size && (resize || rosettaNew) && (await colimaRunning(runner))) {
    log.step(
      resize ? `colima stop (redimensionar a ${fmt(size)})` : "colima stop (activar Rosetta)",
    );
    const s = await runner.exec("colima", ["stop"], { stream: true });
    if (s.code !== 0) throw new Error("colima stop falló");
  }
  if (size && !(await colimaRunning(runner))) {
    // colima start falla si se le pide menos disco del que ya tiene la VM.
    const start = vm && vm.diskGb > size.diskGb ? { ...size, diskGb: vm.diskGb } : size;
    if (start !== size)
      log.warn(
        `el disco de Colima (${vm?.diskGb} GB) no se reduce a ${size.diskGb} GB: colima delete --force && forja apply containers (borra imágenes y volúmenes)`,
      );
    const r = await runner.exec("colima", colimaArgs(start, ros !== "missing"), { stream: true });
    if (r.code !== 0) throw new Error("colima start falló (revisa `colima start --verbose`)");
  }
  await runner.exec("docker", ["context", "use", RUNTIME_CONTEXT]);
  if (existsSync(ORBSTACK_APP))
    log.warn("OrbStack sigue instalado; quítalo con: brew uninstall --cask orbstack");
}

export async function check(ctx: ModuleCtx): Promise<CheckResult[]> {
  const r = await ctx.runner.query("docker", ["context", "show"]);
  const ctxName = r.stdout.trim();
  const results: CheckResult[] = [
    {
      name: "contexto docker = colima",
      ok: ctxName === RUNTIME_CONTEXT,
      detail:
        ctxName === "orbstack"
          ? "OrbStack ya no es el runtime: docker context use colima"
          : ctxName && ctxName !== RUNTIME_CONTEXT
            ? `${ctxName}: docker context use colima`
            : ctxName
              ? undefined
              : "docker no disponible (¿colima start?)",
    },
  ];
  if ((await rosetta(ctx.runner)) === "missing")
    results.push({
      name: "Rosetta 2 instalada",
      ok: false,
      warn: true,
      detail: `imágenes amd64 sin emular: forja apply containers (o sudo ${ROSETTA_INSTALL.join(" ")})`,
    });
  if (existsSync(ORBSTACK_APP))
    results.push({
      name: "OrbStack desinstalado",
      ok: false,
      warn: true,
      detail: "brew uninstall --cask orbstack",
    });
  return results;
}
