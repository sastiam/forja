import { join } from "node:path";
import { home } from "./paths.ts";

/**
 * openspec-cascade: ejecuta changes de OpenSpec tarea a tarea con un agente,
 * verificando cada tarea y haciendo commit solo del trabajo verificado. forja
 * lo instala con un ref fijo y `wt night` lo lanza en un worktree de agente.
 */
export const LOOPER_REPO = "https://github.com/sastiam/openspec-cascade";
/** Ref fijado; se sube con una PR (forja-maintain), nunca solo. */
export const LOOPER_REF = "70e253795eeace77666c3dc69aa39f95464d7cd6";
export const LOOPER_BIN = "openspec-cascade";
export const LOOPER_ENGINES = ["claude", "opencode", "antigravity"] as const;
export type LooperEngine = (typeof LOOPER_ENGINES)[number];

export const looperDir = (): string =>
  process.env.FORJA_LOOPER_DIR ?? join(home(), ".local", "share", "openspec-cascade");

/** Carpeta donde `bun link` deja los binarios globales (`$BUN_INSTALL/bin`). */
export const bunBinDir = (): string => join(process.env.BUN_INSTALL ?? join(home(), ".bun"), "bin");
