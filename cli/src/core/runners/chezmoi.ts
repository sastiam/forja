import { join } from "node:path";
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

/**
 * Destinos de `chezmoi status` cambiados en el disco desde el último apply
 * (primera columna) que apply volvería a escribir (segunda columna). Con ellos
 * chezmoi pregunta por TTY antes de sobrescribir; sin TTY falla a medias.
 */
export function modifiedOutside(status: string, home: string): string[] {
  return status
    .split("\n")
    .filter((l) => /^[MAD][MADR] ./.test(l))
    .map((l) => join(home, l.slice(3).trim()));
}

export async function conflicts(
  runner: Runner,
  source: string,
  targets: string[],
  home: string,
): Promise<string[]> {
  if (!targets.length || !(await commandExists(runner, "chezmoi"))) return [];
  const r = await runner.query("chezmoi", [...base(source), "status", ...targets]);
  return r.code === 0 ? modifiedOutside(r.stdout, home) : [];
}

/** `force`: sobrescribe sin preguntar lo cambiado fuera de chezmoi (`forja apply --force`). */
export async function apply(
  runner: Runner,
  source: string,
  targets: string[],
  opts: { force?: boolean } = {},
) {
  const args = [...base(source), "apply", ...(opts.force ? ["--force"] : []), ...targets];
  return runner.exec("chezmoi", args, { stream: true });
}

export async function reAdd(runner: Runner, source: string, targets: string[]) {
  return runner.exec("chezmoi", [...base(source), "re-add", ...targets], { stream: true });
}
