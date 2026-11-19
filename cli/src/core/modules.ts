import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { parse } from "./toml.ts";

export interface Module {
  name: string;
  dir: string;
  summary: string;
  os: string[];
  depends: string[];
  targets: string[];
  /** Rutas extra solo de macOS (`targets_darwin`), p. ej. los scripts de Colima. */
  targetsDarwin: string[];
  risk: "low" | "medium" | "high";
  requiresSudo: boolean;
  optional: boolean;
  checks: string[];
  /** Comprobaciones extra por SO (`[checks.darwin]` / `[checks.linux]`). */
  checksByOs: Record<string, string[]>;
  hasBrewfile: boolean;
  hasApply: boolean;
}

export function parseModule(name: string, dir: string, text: string): Module {
  const t = parse(text);
  const list = (v: unknown): string[] => (Array.isArray(v) ? v.map(String) : []);
  const risk = String(t.risk ?? "low");
  if (risk !== "low" && risk !== "medium" && risk !== "high")
    throw new Error(`${name}: risk inválido (${risk})`);
  if (t.name !== name) throw new Error(`modules/${name}/module.toml: name debe ser "${name}"`);
  const checks =
    t.checks && typeof t.checks === "object" && !Array.isArray(t.checks)
      ? list(t.checks.commands)
      : [];
  const checksByOs: Record<string, string[]> = {};
  if (t.checks && typeof t.checks === "object" && !Array.isArray(t.checks))
    for (const os of ["darwin", "linux"]) {
      const sub = t.checks[os];
      if (sub && typeof sub === "object" && !Array.isArray(sub))
        checksByOs[os] = list(sub.commands);
    }
  return {
    name,
    dir,
    summary: String(t.summary ?? ""),
    os: list(t.os),
    depends: list(t.depends),
    targets: list(t.targets),
    targetsDarwin: list(t.targets_darwin),
    risk,
    requiresSudo: t.requires_sudo === true,
    optional: t.optional === true,
    checks,
    checksByOs,
    hasBrewfile: existsSync(join(dir, "Brewfile")),
    hasApply: existsSync(join(dir, "apply.ts")),
  };
}

export async function loadModules(root: string): Promise<Map<string, Module>> {
  const base = join(root, "modules");
  const map = new Map<string, Module>();
  for (const e of await readdir(base, { withFileTypes: true })) {
    if (!e.isDirectory()) continue;
    const dir = join(base, e.name);
    map.set(e.name, parseModule(e.name, dir, await readFile(join(dir, "module.toml"), "utf8")));
  }
  return map;
}

export class DependencyError extends Error {}

/** Orden topológico (dependencias primero) de `wanted` + sus dependencias. Detecta ciclos y faltantes. */
export function resolveOrder(all: Map<string, Module>, wanted: string[]): string[] {
  const order: string[] = [];
  const state = new Map<string, "visiting" | "done">();
  const visit = (name: string, trail: string[]): void => {
    const m = all.get(name);
    if (!m)
      throw new DependencyError(
        `módulo desconocido: ${name}${trail.length ? ` (requerido por ${trail.at(-1)})` : ""}`,
      );
    const s = state.get(name);
    if (s === "done") return;
    if (s === "visiting")
      throw new DependencyError(`ciclo de dependencias: ${[...trail, name].join(" → ")}`);
    state.set(name, "visiting");
    for (const d of m.depends) visit(d, [...trail, name]);
    state.set(name, "done");
    order.push(name);
  };
  for (const w of wanted) visit(w, []);
  return order;
}
