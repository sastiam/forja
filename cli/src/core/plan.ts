import { existsSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import type { Host } from "./hosts.ts";
import type { Module } from "./modules.ts";
import { expandHome, home } from "./paths.ts";
import type { Profile } from "./profile.ts";
import * as brew from "./runners/brew.ts";
import * as chezmoi from "./runners/chezmoi.ts";
import * as dnf from "./runners/dnf.ts";
import type { Runner } from "./runners/shell.ts";
import { planThirdParty, readThirdParty, THIRDPARTY_FILE } from "./thirdparty.ts";

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
  /** `forja apply <m> --revert`: deshace lo que hizo apply (sin desinstalar paquetes). */
  revert?(ctx: ModuleCtx): Promise<void>;
}

export interface Action {
  kind: "brew" | "dnf" | "chezmoi" | "step" | "guide";
  description: string;
  pending: boolean;
}

export interface CheckResult {
  name: string;
  ok: boolean;
  detail?: string;
  /** Con `ok: false`, doctor lo muestra como aviso (!) en vez de fallo (✖) y no cambia el código de salida. */
  warn?: boolean;
}

export interface ModulePlan {
  module: string;
  status: "skipped" | "ok" | "pending";
  reason?: string;
  actions: Action[];
}

export const osName = (platform: string): string =>
  platform === "darwin" ? "darwin" : platform === "linux" ? "linux" : platform;

/** Archivo de repos de terceros de Fedora del módulo, si existe y estamos en Linux. */
export function thirdPartyFile(m: Module, platform: string): string | null {
  const file = join(m.dir, THIRDPARTY_FILE);
  return platform === "linux" && existsSync(file) ? file : null;
}

/** Archivo de paquetes de Fedora del módulo, si existe y estamos en Linux. */
export function dnfFile(m: Module, platform: string): string | null {
  const file = join(m.dir, dnf.PACKAGES_FILE);
  return platform === "linux" && existsSync(file) ? file : null;
}

export async function loadHooks(m: Module): Promise<ModuleHooks> {
  if (!m.hasApply) return {};
  return (await import(pathToFileURL(join(m.dir, "apply.ts")).href)) as ModuleHooks;
}

export function chezmoiSource(root: string): string {
  return join(root, "home");
}

/** /Users/x/.zshrc → ~/.zshrc, para mensajes. */
export function tildify(p: string): string {
  const h = home();
  return p === h || p.startsWith(`${h}/`) ? `~${p.slice(h.length)}` : p;
}

const platformExtra = (m: Module, platform: string): string[] =>
  platform === "darwin" ? m.targetsDarwin : [];

/** Rutas de chezmoi del módulo para este SO: las comunes y, en macOS, las de `targets_darwin`. */
export function moduleTargets(m: Module, platform = "darwin"): string[] {
  return [...m.targets, ...(platform === "darwin" ? m.targetsDarwin : [])].map(expandHome);
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
    for (const tap of await brew.untrustedTaps(ctx.runner, file))
      actions.push({
        kind: "step",
        description: `confiar en el tap de terceros ${tap} (brew trust --tap ${tap})`,
        pending: true,
      });
    const s = await brew.bundleCheck(ctx.runner, file);
    actions.push({
      kind: "brew",
      description:
        s === "unavailable" ? "brew bundle (Homebrew aún no instalado)" : "brew bundle (Brewfile)",
      pending: s !== "ok",
    });
  }
  const pkgFile = dnfFile(m, ctx.platform);
  if (pkgFile && (await dnf.readPackages(pkgFile)).length) {
    const { state, missing } = await dnf.packagesCheck(ctx.runner, pkgFile);
    actions.push({
      kind: "dnf",
      description:
        state === "unavailable"
          ? "dnf install (rpm no disponible: ¿es Fedora?)"
          : `dnf install${missing.length ? ` (faltan: ${missing.join(", ")}; pedirá sudo)` : " (packages.fedora.txt)"}`,
      pending: state !== "ok",
    });
  }
  const thirdParty = thirdPartyFile(m, ctx.platform);
  if (thirdParty)
    actions.push(
      ...(await planThirdParty(
        ctx.runner,
        await readThirdParty(thirdParty),
        ctx.profile?.fedora?.trusted_repos ?? [],
      )),
    );
  if (moduleTargets(m, ctx.platform).length && existsSync(chezmoiSource(ctx.root))) {
    const source = chezmoiSource(ctx.root);
    const d = await chezmoi.diff(ctx.runner, source, moduleTargets(m, ctx.platform));
    const outside =
      d.state === "pending"
        ? await chezmoi.conflicts(ctx.runner, source, moduleTargets(m, ctx.platform), home())
        : [];
    const note = outside.length
      ? ` (modificado fuera de chezmoi: ${outside.map(tildify).join(", ")})`
      : "";
    actions.push({
      kind: "chezmoi",
      description:
        d.state === "unavailable"
          ? `chezmoi apply ${m.targets.concat(platformExtra(m, ctx.platform)).join(" ")} (chezmoi aún no instalado)`
          : `chezmoi apply ${m.targets.concat(platformExtra(m, ctx.platform)).join(" ")}${note}`,
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
