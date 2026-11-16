// Lógica pura de token-saver: sin imports ni `$`, la prueban `node --test` (cli/test) y el mod.

/** `rtk rewrite <cmd>`: 0 = reescrito (regla allow), 3 = reescrito (preguntar), 1/2 = no tocar. */
const REWRITE_EXIT_CODES = new Set([0, 3]);
const MAX_COMMAND_CHARS = 2000;
const THOUSAND = 1000;
const MILLION = 1_000_000;

/** ¿Vale la pena preguntar a rtk? Evita heredocs, comandos largos y lo ya envuelto. */
export function shouldTry(command: string): boolean {
  const c = command.trim();
  return (
    c.length > 0 &&
    c.length <= MAX_COMMAND_CHARS &&
    !/^rtk(?:\s|$)/.test(c) &&
    !c.includes("<<") &&
    !/(?:^|\s)RTK_DISABLED=1(?:\s|$)/.test(c)
  );
}

/**
 * En modo auto el clasificador revisa en el servidor el comando tal como lo escribió el
 * modelo; si un hook lo reescribe después, la revisión deja de cubrirlo y la llamada se
 * rechaza. En ese modo no se reescribe.
 */
const AUTO_MODE = "auto";

/** ¿Se puede reescribir el comando en este modo de permisos? (desconocido: sí) */
export function rewriteAllowed(permissionMode: string | null | undefined): boolean {
  return permissionMode !== AUTO_MODE;
}

/** Comando reescrito por `rtk rewrite`, o undefined si rtk no lo cubre. */
export function interpretRewrite(
  exitCode: number,
  stdout: string,
  original: string,
): string | undefined {
  const out = stdout.trim();
  if (!REWRITE_EXIT_CODES.has(exitCode) || out === "" || out === original.trim()) return undefined;
  return out;
}

/** Tokens ahorrados según `rtk gain --format json` (summary.total_saved). */
export function parseGain(stdout: string): number | undefined {
  try {
    const saved = (JSON.parse(stdout) as { summary?: { total_saved?: unknown } }).summary
      ?.total_saved;
    return typeof saved === "number" && Number.isFinite(saved) ? saved : undefined;
  } catch {
    return undefined;
  }
}

export function formatTokens(n: number): string {
  if (n >= MILLION) return `${(n / MILLION).toFixed(1)}M`;
  if (n >= THOUSAND) return `${Math.round(n / THOUSAND)}k`;
  return String(n);
}

/** Texto de la banda: contexto usado y ahorro acumulado de rtk. */
export function bandText(
  contextPercent: number | undefined,
  saved: number | undefined,
): string | undefined {
  const parts: string[] = [];
  if (contextPercent !== undefined) parts.push(`ctx ${Math.round(contextPercent)} %`);
  if (saved !== undefined && saved > 0) parts.push(`rtk −${formatTokens(saved)} tok`);
  return parts.length ? parts.join(" · ") : undefined;
}

/** ¿Está conectado el MCP de codebase-memory? (sus herramientas aparecen en la petición) */
export function hasCodebaseMemory(tools: readonly string[]): boolean {
  return tools.some((t) => /^mcp__.*codebase[-_]memory/i.test(t));
}

export const SEARCH_SECTION = [
  "# Búsqueda de código con pocos tokens (token-saver)",
  "Para preguntas estructurales (dónde se define algo, quién llama a una función, qué rompe un cambio, " +
    "cómo está organizado el proyecto) usa primero las herramientas MCP de codebase-memory " +
    "(search_graph, trace_path, get_code_snippet, get_file_outline, get_architecture) en lugar de " +
    "Grep + Read de archivos completos. Si el proyecto no está indexado, llama antes a index_repository.",
  "Usa Grep para texto literal (mensajes, claves de configuración) y Read con offset/limit cuando " +
    "ya sepas qué líneas necesitas.",
].join("\n");
