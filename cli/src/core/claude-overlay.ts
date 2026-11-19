import { readFile } from "node:fs/promises";
import { expandHome } from "./paths.ts";

/**
 * Capa personal de ~/.claude/settings.json. forja gestiona ese archivo entero, así que un
 * `apply` borraba lo que el usuario tuviera (`model`, `autoMode`, `tui`, `effortLevel`…).
 * Las claves de primer nivel de este archivo se añaden al FINAL del settings.json generado:
 * conservan lo que forja no gestiona y, si coinciden con una clave de forja, ganan (en JSON,
 * ante una clave repetida manda la última). Vive en `local/`, fuera del repo, y el sandbox
 * de los agentes no puede leerlo (`Read(~/.config/forja/local/**)`).
 */
export const CLAUDE_OVERLAY = "~/.config/forja/local/claude.settings.json";

/**
 * Claves de primer nivel que forja escribe SIEMPRE en settings.json. Reemplazarlas es legítimo,
 * pero `permissions` y `sandbox` son las que contienen la seguridad: apply avisa si el overlay
 * las toca. `model` y `theme` no están: forja solo las escribe si el perfil las define, así que
 * ponerlas en el overlay es lo normal.
 */
export const MANAGED_KEYS = [
  "permissions",
  "sandbox",
  "hooks",
  "extraKnownMarketplaces",
  "enabledPlugins",
  "statusLine",
] as const;

export class ClaudeOverlayError extends Error {}

export interface Overlay {
  /** `"clave": valor, "otra": valor` listo para insertar tras la última clave de forja. */
  fragment: string;
  keys: string[];
  /** Claves del overlay que reemplazan una que forja gestiona. */
  overrides: string[];
}

export function parseOverlay(text: string, where = CLAUDE_OVERLAY): Overlay {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch (e) {
    throw new ClaudeOverlayError(`${where} no es JSON válido: ${(e as Error).message}`);
  }
  if (typeof value !== "object" || value === null || Array.isArray(value))
    throw new ClaudeOverlayError(`${where} debe ser un objeto JSON ({ … })`);
  const keys = Object.keys(value);
  return {
    // Una sola línea: el valor viaja por chezmoi.toml y el formato lo reescribe Claude Code igualmente.
    fragment: keys
      .map((k) => `${JSON.stringify(k)}: ${JSON.stringify((value as Record<string, unknown>)[k])}`)
      .join(", "),
    keys,
    overrides: keys.filter((k) => (MANAGED_KEYS as readonly string[]).includes(k)),
  };
}

/** Lee el overlay del usuario; null si no existe. Un overlay roto es un error, no se ignora. */
export async function loadOverlay(path = expandHome(CLAUDE_OVERLAY)): Promise<Overlay | null> {
  let text: string;
  try {
    text = await readFile(path, "utf8");
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw e;
  }
  return parseOverlay(text, CLAUDE_OVERLAY);
}
