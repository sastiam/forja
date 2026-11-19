import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { out } from "../../cli/src/core/log.ts";
import type { Action, CheckResult, ModuleCtx } from "../../cli/src/core/plan.ts";
import * as linux from "./linux.ts";

// En macOS el módulo solo usa el Brewfile (Zed y la fuente son casks) y chezmoi: no hay pasos propios.
export async function plan(ctx: ModuleCtx): Promise<Action[]> {
  return ctx.platform === "linux" ? linux.plan(ctx) : [];
}

export async function apply(ctx: ModuleCtx): Promise<void> {
  if (ctx.platform === "linux") await linux.apply(ctx);
}

export async function check(ctx: ModuleCtx): Promise<CheckResult[]> {
  return ctx.platform === "linux" ? linux.check(ctx) : [];
}

export async function revert(ctx: ModuleCtx): Promise<void> {
  if (ctx.platform === "linux") return linux.revert(ctx);
  // macOS: sin revert automático, como antes; se muestran los pasos manuales.
  out(await readFile(join(ctx.module.dir, "revert.md"), "utf8"));
}
