import type { Host } from "./hosts.ts";
import type { Profile } from "./profile.ts";

/** Identidad de git fuera del repo (módulo git): git dentro del sandbox necesita leerla. */
export const GIT_LOCAL_CONFIG = "~/.config/forja/local/git.local.gitconfig";

/** Historial de rtk (token-saver): `rtk` corre dentro del sandbox y escribe ahí su SQLite. */
export const RTK_DATA_DIR: Record<string, string> = {
  darwin: "~/Library/Application Support/rtk",
  linux: "~/.local/share/rtk",
};

export interface ClaudeSandbox {
  allowed_domains: string[];
  allow_read: string[];
  allow_write: string[];
}

/**
 * Sandbox de ~/.claude/settings.json: dominios del host + los del perfil, y
 * lecturas derivadas de los módulos activos + las del perfil. Sin duplicados,
 * en orden estable para que `chezmoi diff` no cambie entre ejecuciones.
 */
export function claudeSandbox(
  host: Pick<Host, "claude"> & Partial<Pick<Host, "os">>,
  profile: Pick<Profile, "claude">,
  enabled: string[],
): ClaudeSandbox {
  const uniq = (xs: string[]) => [...new Set(xs)];
  return {
    allowed_domains: uniq([...host.claude.allowed_domains, ...profile.claude.allowed_domains]),
    allow_read: uniq([
      ...(enabled.includes("git") ? [GIT_LOCAL_CONFIG] : []),
      ...profile.claude.allow_read,
    ]),
    allow_write: enabled.includes("agents")
      ? [RTK_DATA_DIR[host.os ?? "darwin"] ?? ""].filter(Boolean)
      : [],
  };
}
