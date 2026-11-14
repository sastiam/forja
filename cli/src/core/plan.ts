import { existsSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import type { Host } from "./hosts.ts";
import type { Module } from "./modules.ts";
import { expandHome } from "./paths.ts";
import type { Profile } from "./profile.ts";
import * as brew from "./runners/brew.ts";
import * as chezmoi from "./runners/chezmoi.ts";
import type { Runner } from "./runners/shell.ts";

export interface Ctx {
  runner: Runner;
  root: string;
  host: Host;
  profile: Profile;
  enabled: string[];
  /** SO donde corre forja (process.platform; inyectable para tests). */
  platform: string;
}

export interface ModuleCtx extends Ctx {
  module: Module;
}

/** Contrato opcional de modules/<m>/apply.ts */
export interface ModuleHooks {
  plan?(ctx: ModuleCtx): Promise<Action[]>;
  apply?(ctx: ModuleCtx): Promise<void>;
  check?(ctx: ModuleCtx): Promise<CheckResult[]>;
}

export interface Action {
  kind: "brew" | "chezmoi" | "step" | "guide";
  description: string;
  pending: boolean;
}

export interface CheckResult {
  name: string;
  ok: boolean;
  detail?: string;
}

export interface ModulePlan {
  module: string;
  status: "skipped" | "ok" | "pending";
  reason?: string;
  actions: Action[];
}

export const osName = (platform: string): string =>
  platform === "darwin" ? "darwin" : platform === "linux" ? "linux" : platform;

export async function loadHooks(m: Module): Promise<ModuleHooks> {
  if (!m.hasApply) return {};
  return (await import(pathToFileURL(join(m.dir, "apply.ts")).href)) as ModuleHooks;
}

export function chezmoiSource(root: string): string {
  return join(root, "home");
}

export function moduleTargets(m: Module): string[] {
  return m.targets.map(expandHome);
}

/** Calcula las acciones de un módulo sin modificar nada (solo consultas de lectura). */
export async function planModule(ctx: Ctx, m: Module): Promise<ModulePlan> {
  if (m.os.length && !m.os.includes(osName(ctx.platform))) {
    return {
      module: m.name,
      status: "skipped",
      reason: `no aplica a ${ctx.platform}`,
      actions: [],
    };
  }
  const actions: Action[] = [];
  const mctx: ModuleCtx = { ...ctx, module: m };
  if (m.hasBrewfile && ctx.platform === "darwin") {
    const file = join(m.dir, "Brewfile");
    const s = await brew.bundleCheck(ctx.runner, file);
    actions.push({
      kind: "brew",
      description:
        s === "unavailable" ? "brew bundle (Homebrew aún no instalado)" : "brew bundle (Brewfile)",
      pending: s !== "ok",
    });
  }
  if (m.targets.length && existsSync(chezmoiSource(ctx.root))) {
    const d = await chezmoi.diff(ctx.runner, chezmoiSource(ctx.root), moduleTargets(m));
    actions.push({
      kind: "chezmoi",
      description:
        d.state === "unavailable"
          ? `chezmoi apply ${m.targets.join(" ")} (chezmoi aún no instalado)`
          : `chezmoi apply ${m.targets.join(" ")}`,
      pending: d.state !== "ok",
    });
  }
  const hooks = await loadHooks(m);
  if (hooks.plan) actions.push(...(await hooks.plan(mctx)));
  const pending = actions.some((a) => a.pending);
  return { module: m.name, status: pending ? "pending" : "ok", actions };
}

export async function computePlan(
  ctx: Ctx,
  all: Map<string, Module>,
  order: string[],
): Promise<ModulePlan[]> {
  const plans: ModulePlan[] = [];
  for (const name of order) plans.push(await planModule(ctx, all.get(name) as Module));
  return plans;
}
