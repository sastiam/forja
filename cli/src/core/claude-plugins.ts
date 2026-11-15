import { join } from "node:path";

/**
 * Plugins de Claude Code que gestiona forja (ADR 0012). Fuente única para:
 * - `settings.json.tmpl` (`extraKnownMarketplaces` y `enabledPlugins`, vía chezmoi.toml),
 * - `apply`/`check` del módulo agents (instalar lo que falte y comprobarlo).
 */

export type MarketplaceSource =
  | { source: "directory"; path: string }
  | { source: "github"; repo: string };

/** `<plugin>@<marketplace>` → para qué sirve (se muestra en plan/doctor). */
export const PLUGINS: Record<string, string> = {
  "token-saver@forja": "rtk para Bash, codebase-memory para búsquedas, banda de tokens",
  "forja-status@forja": "estado de forja encima del prompt y /forja",
  "tdd-guard@forja": "TDD: primero un test que falle",
  "quality-guard@forja": "números mágicos y guard de AWS fuera de Floci",
  "aws-core@agent-toolkit-for-aws": "skills y MCP oficiales de AWS (incluye Well-Architected)",
  "codebase-memory@codebase-memory": "grafo de código local (MCP) para buscar con menos tokens",
};

export function marketplaces(root: string): Record<string, MarketplaceSource> {
  return {
    forja: { source: "directory", path: join(root, "plugins") },
    "agent-toolkit-for-aws": { source: "github", repo: "aws/agent-toolkit-for-aws" },
    "codebase-memory": { source: "github", repo: "DeusData/codebase-memory-mcp" },
  };
}

const nameOf = (id: string): string => id.split("@")[0] ?? id;
const marketOf = (id: string): string => id.split("@")[1] ?? "";

/** Plugins activos: todos menos los de `[claude] plugins_skip` (por nombre o id completo). */
export function enabledPlugins(skip: readonly string[] = []): string[] {
  return Object.keys(PLUGINS).filter((id) => !skip.includes(id) && !skip.includes(nameOf(id)));
}

/** Nombres de `plugins_skip` que no corresponden a ningún plugin conocido. */
export function unknownSkips(skip: readonly string[]): string[] {
  const known = new Set(Object.keys(PLUGINS).flatMap((id) => [id, nameOf(id)]));
  return skip.filter((s) => !known.has(s));
}

/** Datos para chezmoi.toml: solo los marketplaces que usa algún plugin activo. */
export function settingsData(
  root: string,
  skip: readonly string[] = [],
): {
  claude_marketplaces: Record<string, { source: MarketplaceSource }>;
  claude_plugins: Record<string, boolean>;
} {
  const enabled = enabledPlugins(skip);
  const used = new Set(enabled.map(marketOf));
  const all = marketplaces(root);
  return {
    claude_marketplaces: Object.fromEntries(
      Object.entries(all)
        .filter(([name]) => used.has(name))
        .map(([name, source]) => [name, { source }]),
    ),
    claude_plugins: Object.fromEntries(enabled.map((id) => [id, true])),
  };
}

/** Argumento de `claude plugin marketplace add`. */
export function marketplaceArg(source: MarketplaceSource): string {
  return source.source === "directory" ? source.path : source.repo;
}

/** Ids instalados según `claude plugin list --json`. */
export function installedIds(json: string): string[] {
  try {
    const rows = JSON.parse(json) as unknown;
    if (!Array.isArray(rows)) return [];
    return rows
      .map((r) => (r && typeof r === "object" ? (r as { id?: unknown }).id : undefined))
      .filter((id): id is string => typeof id === "string");
  } catch {
    return [];
  }
}

/** Nombres según `claude plugin marketplace list --json`. */
export function marketplaceNames(json: string): string[] {
  try {
    const rows = JSON.parse(json) as unknown;
    if (!Array.isArray(rows)) return [];
    return rows
      .map((r) => (r && typeof r === "object" ? (r as { name?: unknown }).name : undefined))
      .filter((n): n is string => typeof n === "string");
  } catch {
    return [];
  }
}

export { marketOf };
