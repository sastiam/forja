import type { Runner } from "./shell.ts";
import { commandExists } from "./shell.ts";

export type BrewState = "ok" | "pending" | "unavailable";

/**
 * Consultas sin red: sin auto-update ni analytics, y `--no-upgrade` para que una
 * versión desfasada no cuente como pendiente. Dentro del sandbox, brew no llega
 * a analytics.brew.sh y `bundle check` devolvía 1 con todo instalado.
 */
export const BREW_OFFLINE_ENV: Record<string, string> = {
  HOMEBREW_NO_AUTO_UPDATE: "1",
  HOMEBREW_NO_ANALYTICS: "1",
};

/** `brew bundle check`: ok si todo está instalado. */
export async function bundleCheck(runner: Runner, file: string): Promise<BrewState> {
  if (!(await commandExists(runner, "brew"))) return "unavailable";
  const r = await runner.query("brew", ["bundle", "check", "--no-upgrade", "--file", file], {
    env: BREW_OFFLINE_ENV,
  });
  return r.code === 0 ? "ok" : "pending";
}

export async function bundleApply(runner: Runner, file: string) {
  return runner.exec("brew", ["bundle", "--file", file], { stream: true });
}

/** Líneas `brew "x"` / `cask "x"` del Brewfile que no están satisfechas. */
export async function bundleMissing(runner: Runner, file: string): Promise<string[]> {
  const r = await runner.query(
    "brew",
    ["bundle", "check", "--no-upgrade", "--file", file, "--verbose"],
    { env: BREW_OFFLINE_ENV },
  );
  return r.stdout
    .split("\n")
    .filter((l) => l.startsWith("→"))
    .map((l) => l.replace(/^→\s*/, "").trim());
}
