import { readFile } from "node:fs/promises";
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

/** Líneas `tap "org/x"` de un Brewfile. */
export function parseTaps(brewfile: string): string[] {
  const out: string[] = [];
  for (const line of brewfile.split("\n")) {
    const m = /^\s*tap\s+"([^"]+)"/.exec(line);
    if (m?.[1]) out.push(m[1].toLowerCase());
  }
  return out;
}

/**
 * Taps del Brewfile en los que aún no se confía. Desde Homebrew 7, brew se
 * niega a cargar fórmulas de taps de terceros sin `brew trust`, y `brew bundle`
 * fallaba a mitad del módulo. Con un brew sin `trust` (anterior a 7) no hay nada
 * que confiar.
 */
export async function untrustedTaps(runner: Runner, file: string): Promise<string[]> {
  const taps = parseTaps(await readFile(file, "utf8"));
  if (!taps.length || !(await commandExists(runner, "brew"))) return [];
  const r = await runner.query("brew", ["trust", "--json=v1"], { env: BREW_OFFLINE_ENV });
  if (r.code !== 0) return [];
  let trusted: string[] = [];
  try {
    trusted = ((JSON.parse(r.stdout) as { taps?: string[] }).taps ?? []).map((t) =>
      t.toLowerCase(),
    );
  } catch {
    return [];
  }
  return taps.filter((t) => !trusted.includes(t));
}

/** Confía en un tap de terceros (decisión explícita: `plan` lo muestra y apply pide confirmación). */
export async function trustTap(runner: Runner, tap: string) {
  return runner.exec("brew", ["trust", "--tap", tap], { env: BREW_OFFLINE_ENV, stream: true });
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
