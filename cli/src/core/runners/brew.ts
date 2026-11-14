import type { Runner } from "./shell.ts";
import { commandExists } from "./shell.ts";

export type BrewState = "ok" | "pending" | "unavailable";

/** `brew bundle check`: ok si todo está instalado. */
export async function bundleCheck(runner: Runner, file: string): Promise<BrewState> {
  if (!(await commandExists(runner, "brew"))) return "unavailable";
  const r = await runner.query("brew", ["bundle", "check", "--file", file]);
  return r.code === 0 ? "ok" : "pending";
}

export async function bundleApply(runner: Runner, file: string) {
  return runner.exec("brew", ["bundle", "--file", file], { stream: true });
}

/** Líneas `brew "x"` / `cask "x"` del Brewfile que no están satisfechas. */
export async function bundleMissing(runner: Runner, file: string): Promise<string[]> {
  const r = await runner.query("brew", ["bundle", "check", "--file", file, "--verbose"]);
  return r.stdout
    .split("\n")
    .filter((l) => l.startsWith("→"))
    .map((l) => l.replace(/^→\s*/, "").trim());
}
