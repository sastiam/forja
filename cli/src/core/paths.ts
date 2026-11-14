import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** Raíz del repo forja (override con FORJA_HOME). */
export function repoRoot(): string {
  if (process.env.FORJA_HOME) return resolve(process.env.FORJA_HOME);
  return resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
}

export function home(): string {
  return process.env.HOME ?? homedir();
}

export function expandHome(p: string): string {
  if (p === "~") return home();
  if (p.startsWith("~/")) return join(home(), p.slice(2));
  return p;
}

/** ~/.config/forja (override con FORJA_CONFIG_DIR). */
export function configDir(): string {
  return process.env.FORJA_CONFIG_DIR ?? join(home(), ".config", "forja");
}

export function profilePath(): string {
  return join(configDir(), "profile.toml");
}

/** ~/.local/state/forja (override con FORJA_STATE_DIR). */
export function stateDir(): string {
  return process.env.FORJA_STATE_DIR ?? join(home(), ".local", "state", "forja");
}

export function chezmoiConfigPath(): string {
  return join(process.env.XDG_CONFIG_HOME ?? join(home(), ".config"), "chezmoi", "chezmoi.toml");
}
