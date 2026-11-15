import { log } from "../../cli/src/core/log.ts";
import type { Action, ModuleCtx } from "../../cli/src/core/plan.ts";
import { commandExists, type Runner } from "../../cli/src/core/runners/shell.ts";

/** Herramientas de ~/.config/mise que aún no están instaladas (`mise ls --missing`). */
export function parseMissing(stdout: string): string[] {
  return stdout
    .split("\n")
    .map((l) => l.trim().split(/\s+/)[0] ?? "")
    .filter(Boolean);
}

async function missing(runner: Runner): Promise<string[]> {
  if (!(await commandExists(runner, "mise"))) return [];
  const r = await runner.query("mise", ["ls", "--missing", "--global"]);
  return r.code === 0 ? parseMissing(r.stdout) : [];
}

export async function plan(ctx: ModuleCtx): Promise<Action[]> {
  const m = await missing(ctx.runner);
  return [
    {
      kind: "step",
      description: `mise install${m.length ? ` (faltan: ${m.join(", ")})` : ""}`,
      pending: m.length > 0,
    },
  ];
}

/** chezmoi solo escribe la config; sin `mise install` las herramientas nuevas no existen. */
export async function apply(ctx: ModuleCtx): Promise<void> {
  log.step("mise install");
  const r = await ctx.runner.exec("mise", ["install"], { stream: true });
  if (r.code !== 0) throw new Error(`mise install falló (${r.code})`);
}
