import { parseArgs, styleText } from "node:util";
import { load } from "../core/context.ts";
import { out, outJson } from "../core/log.ts";
import { computePlan, type ModulePlan } from "../core/plan.ts";

export function renderPlan(plans: ModulePlan[]): string {
  const lines: string[] = [];
  for (const p of plans) {
    const icon = p.status === "ok" ? "✔" : p.status === "skipped" ? "–" : "●";
    lines.push(`${icon} ${p.module}${p.reason ? ` (${p.reason})` : ""}`);
    for (const a of p.actions)
      lines.push(`    ${a.pending ? "+" : "="} [${a.kind}] ${a.description}`);
  }
  return lines.join("\n");
}

export async function planCommand(argv: string[]): Promise<number> {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: { json: { type: "boolean" } },
  });
  // `plan` es siempre dry-run: los runners solo consultan.
  const { ctx, all, order } = await load({ dryRun: true, names: positionals });
  const plans = await computePlan(ctx, all, order);
  if (values.json) outJson({ host: ctx.host.name, modules: plans });
  else {
    out(renderPlan(plans));
    const pending = plans.filter((p) => p.status === "pending").length;
    out(
      `\n${pending ? styleText("yellow", `${pending} módulo(s) con cambios pendientes`) : "Nada que cambiar"}`,
    );
  }
  return 0;
}
