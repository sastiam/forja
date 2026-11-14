import type { CheckResult, ModuleCtx } from "../../cli/src/core/plan.ts";

export async function check(ctx: ModuleCtx): Promise<CheckResult[]> {
  const r = await ctx.runner.query("docker", ["context", "show"]);
  const ctxName = r.stdout.trim();
  return [
    {
      name: "contexto docker = orbstack",
      ok: ctxName === "orbstack",
      detail: ctxName || "docker no disponible",
    },
  ];
}
