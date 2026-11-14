import { parseArgs } from "node:util";
import { load } from "../core/context.ts";
import { out, outJson } from "../core/log.ts";
import { computePlan, loadHooks, type ModuleCtx } from "../core/plan.ts";

export async function driftCommand(argv: string[]): Promise<number> {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: { json: { type: "boolean" } },
  });
  const { ctx, all, order } = await load({ dryRun: true, names: positionals });
  const plans = await computePlan(ctx, all, order);
  const report = [];
  for (const p of plans) {
    const m = all.get(p.module);
    const checks =
      m && p.status !== "skipped"
        ? ((await (await loadHooks(m)).check?.({ ...ctx, module: m } as ModuleCtx)) ?? [])
        : [];
    report.push({
      module: p.module,
      status: p.status,
      pending: p.actions.filter((a) => a.pending),
      failedChecks: checks.filter((c) => !c.ok),
    });
  }
  const drifted = report.filter((r) => r.pending.length || r.failedChecks.length);
  if (values.json) outJson({ drift: drifted.length > 0, modules: report });
  else if (!drifted.length) out("Sin desvíos: la máquina coincide con el repo.");
  else
    for (const r of drifted) {
      out(`● ${r.module}`);
      for (const a of r.pending) out(`    + [${a.kind}] ${a.description}`);
      for (const c of r.failedChecks) out(`    ✖ ${c.name}${c.detail ? `: ${c.detail}` : ""}`);
    }
  return drifted.length ? 2 : 0;
}
