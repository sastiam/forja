import { enabledModuleNames, type Host, loadHost } from "./hosts.ts";
import { loadModules, type Module, resolveOrder } from "./modules.ts";
import { profilePath, repoRoot } from "./paths.ts";
import type { Ctx } from "./plan.ts";
import { loadProfile, type Profile } from "./profile.ts";
import { createRunner } from "./runners/shell.ts";

export interface Loaded {
  ctx: Ctx;
  all: Map<string, Module>;
  order: string[];
  host: Host;
  profile: Profile;
}

/** Carga perfil + host + módulos y calcula el orden de ejecución (`names` vacío = todos los habilitados). */
export async function load(opts: {
  dryRun: boolean;
  names?: string[];
  platform?: string;
}): Promise<Loaded> {
  const root = repoRoot();
  const profile = await loadProfile(profilePath());
  if (!profile) throw new Error(`No hay perfil en ${profilePath()}. Ejecuta: forja setup`);
  const host = await loadHost(root, profile.host);
  const all = await loadModules(root);
  const enabled = enabledModuleNames(host, profile);
  const wanted = opts.names?.length ? opts.names : enabled;
  for (const n of wanted) if (!all.has(n)) throw new Error(`módulo desconocido: ${n}`);
  const order = resolveOrder(all, wanted);
  const ctx: Ctx = {
    runner: createRunner(opts.dryRun),
    root,
    host,
    profile,
    enabled,
    platform: opts.platform ?? process.platform,
  };
  return { ctx, all, order, host, profile };
}
