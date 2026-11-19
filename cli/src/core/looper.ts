import { join } from "node:path";
import { home } from "./paths.ts";

/**
 * openspec-cascade: ejecuta changes de OpenSpec tarea a tarea con un agente,
 * verificando cada tarea y haciendo commit solo del trabajo verificado. forja
 * lo instala con un ref fijo y `wt night` lo lanza en un worktree de agente.
 */
export const LOOPER_REPO = "https://github.com/sastiam/openspec-cascade";
/** Ref fijado; se sube con una PR (forja-maintain), nunca solo. */
export const LOOPER_REF = "6c3da8cd5df71c4626db862cc5417565126b2ede";
export const LOOPER_BIN = "openspec-cascade";
export const LOOPER_ENGINES = ["claude", "opencode", "antigravity"] as const;
export type LooperEngine = (typeof LOOPER_ENGINES)[number];
/**
 * Pipeline de cascade (`--mode`): v1 es el flujo por tareas; v2, el de desarrollo guiado por
 * especificaciones (SDD) con QA autónomo. `jules` queda fuera a propósito: corre en la nube y
 * no admite el sandbox que `wt night` exige.
 */
export const LOOPER_MODES = ["v1", "v2"] as const;
export type LooperMode = (typeof LOOPER_MODES)[number];

export const looperDir = (): string =>
  process.env.FORJA_LOOPER_DIR ?? join(home(), ".local", "share", "openspec-cascade");

/** Carpeta donde `bun link` deja los binarios globales (`$BUN_INSTALL/bin`). */
export const bunBinDir = (): string => join(process.env.BUN_INSTALL ?? join(home(), ".bun"), "bin");
