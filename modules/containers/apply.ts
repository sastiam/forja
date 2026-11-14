import type { CheckResult, ModuleCtx } from "../../cli/src/core/plan.ts";

/** Runtimes soportados: Colima (por defecto) y OrbStack (alternativa de pago en uso comercial). */
export const RUNTIME_CONTEXTS = ["colima", "orbstack"];

export async function check(ctx: ModuleCtx): Promise<CheckResult[]> {
  const r = await ctx.runner.query("docker", ["context", "show"]);
  const ctxName = r.stdout.trim();
  return [
    {
      name: "contexto docker = colima u orbstack",
      ok: RUNTIME_CONTEXTS.includes(ctxName),
      detail: ctxName || "docker no disponible (¿colima start?)",
    },
  ];
}
