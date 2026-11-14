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

/**
 * Tamaño de la VM según la máquina. Perfil Pro/Max casi siempre enchufado: la
 * mitad de los núcleos y un cuarto de la RAM (entre 4 y 24 GB) dejan sitio a
 * Zed, los LSP y los agentes. El disco solo puede crecer, así que se fija alto.
 */
export function colimaSize(ncpu: number, memBytes: number): ColimaSize {
  const memGb = memBytes / 1024 ** 3;
  return {
    cpu: Math.max(2, Math.floor(ncpu / 2)),
    memoryGb: Math.min(24, Math.max(4, Math.round(memGb / 4))),
    diskGb: 100,
  };
}

export function colimaArgs(s: ColimaSize): string[] {
  return [
    "start",
    "--vm-type",
    "vz",
    "--mount-type",
    "virtiofs",
    "--vz-rosetta",
    "--cpu",
    String(s.cpu),
    "--memory",
    String(s.memoryGb),
    "--disk",
    String(s.diskGb),
  ];
}

async function machineSize(runner: Runner): Promise<ColimaSize | null> {
  const r = await runner.query("sysctl", ["-n", "hw.ncpu", "hw.memsize"]);
  const [ncpu, mem] = r.stdout.trim().split(/\s+/).map(Number);
  return r.code === 0 && ncpu && mem ? colimaSize(ncpu, mem) : null;
}

async function colimaRunning(runner: Runner): Promise<boolean> {
  return (await runner.query("colima", ["status"])).code === 0;
}

export async function plan(ctx: ModuleCtx): Promise<Action[]> {
  const size = await machineSize(ctx.runner);
  const actions: Action[] = [];
  if (size)
    actions.push({
      kind: "step",
      description: `arrancar Colima (vz, virtiofs, ${size.cpu} CPU, ${size.memoryGb} GB, ${size.diskGb} GB de disco) y usar su contexto docker`,
      pending: !(await colimaRunning(ctx.runner)),
    });
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
  const size = await machineSize(runner);
  if (size && !(await colimaRunning(runner))) {
    const r = await runner.exec("colima", colimaArgs(size), { stream: true });
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
  if (existsSync(ORBSTACK_APP))
    results.push({
      name: "OrbStack desinstalado",
      ok: false,
      warn: true,
      detail: "brew uninstall --cask orbstack",
    });
  return results;
}
