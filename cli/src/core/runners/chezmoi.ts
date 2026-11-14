import type { Runner } from "./shell.ts";
import { commandExists } from "./shell.ts";

export type ChezmoiState = "ok" | "pending" | "unavailable";

const base = (source: string) => ["--source", source];

/** `chezmoi diff` sobre las rutas del módulo: vacío = sin cambios. */
export async function diff(
  runner: Runner,
  source: string,
  targets: string[],
): Promise<{ state: ChezmoiState; diff: string }> {
  if (!(await commandExists(runner, "chezmoi"))) return { state: "unavailable", diff: "" };
  const r = await runner.query("chezmoi", [...base(source), "diff", "--no-pager", ...targets]);
  if (r.code !== 0) return { state: "pending", diff: r.stderr };
  return { state: r.stdout.trim() ? "pending" : "ok", diff: r.stdout };
}

export async function apply(runner: Runner, source: string, targets: string[]) {
  return runner.exec("chezmoi", [...base(source), "apply", ...targets], { stream: true });
}

export async function reAdd(runner: Runner, source: string, targets: string[]) {
  return runner.exec("chezmoi", [...base(source), "re-add", ...targets], { stream: true });
}
