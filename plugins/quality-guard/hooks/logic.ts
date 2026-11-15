// Lógica pura de quality-guard: sin imports ni `$`, la prueban `node --test` (cli/test) y el mod.

// ── AWS guard ─────────────────────────────────────────────────────────────────

export type AwsLevel = "pass" | "ask" | "deny";
export type AwsVerdict = { level: AwsLevel; reason?: string };

const LEVEL_ORDER: Record<AwsLevel, number> = { pass: 0, ask: 1, deny: 2 };
const LOCAL_PROFILE = "floci";
const PREVIEW_CHARS = 80;

/** Floci (AWS local): perfil `floci` o endpoint en localhost:4566. */
const LOCAL_MARKERS = [
  new RegExp(`(?:^|\\s)AWS_PROFILE=${LOCAL_PROFILE}(?:\\s|$)`),
  new RegExp(`--profile[= ]${LOCAL_PROFILE}(?:\\s|$)`),
  /(?:--endpoint-url[= ]|AWS_ENDPOINT_URL=)https?:\/\/(?:localhost|127\.0\.0\.1):4566/,
  /(?:^|\s)(?:cdklocal|awslocal|samlocal|tflocal)\s/,
];

const OTHER_PROFILE = /(?:AWS_PROFILE=|--profile[= ])(\S+)/;

/** Herramientas de IaC/AWS y sus subcomandos de solo lectura. */
const TOOLS: Record<string, { readOnly: RegExp; destructive: RegExp }> = {
  aws: {
    readOnly:
      /^aws\s+(?:\S+\s+(?:describe-|list-|get-|head-|wait\s)|s3\s+ls\b|sts\s+get-caller-identity|configure\s+list|help\b|--version)/,
    destructive:
      /^aws\s+(?:s3\s+rb\b|s3\s+rm\b.*--recursive|cloudformation\s+delete-stack|\S+\s+delete-\S+.*--force)/,
  },
  cdk: {
    readOnly:
      /^cdk\s+(?:synth|diff|ls|list|doctor|docs|context|notices|acknowledge|init|--version)/,
    destructive: /^cdk\s+destroy\b/,
  },
  sam: {
    readOnly: /^sam\s+(?:build|validate|local|init|logs|list|--version)/,
    destructive: /^sam\s+delete\b/,
  },
  terraform: {
    readOnly: /^terraform\s+(?:plan|validate|fmt|init|show|output|providers|version|graph)/,
    destructive: /^terraform\s+destroy\b|^terraform\s+apply\b.*-destroy/,
  },
  tofu: {
    readOnly: /^tofu\s+(?:plan|validate|fmt|init|show|output|providers|version|graph)/,
    destructive: /^tofu\s+destroy\b|^tofu\s+apply\b.*-destroy/,
  },
  pulumi: {
    readOnly: /^pulumi\s+(?:preview|stack\s+ls|config\s+get|whoami|version|about)/,
    destructive: /^pulumi\s+destroy\b/,
  },
};

/** Parte una línea de shell en comandos simples (aproximado: basta para clasificar). */
export function segments(command: string): string[] {
  return command
    .split(/&&|\|\||;|\||\n/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Prefijos que ejecutan el comando que les sigue. Se quitan en bucle para que
 * `sudo timeout 30 aws …` se clasifique igual que `aws …`.
 */
const WRAPPERS: [RegExp, string][] = [
  [/^(?:\S+=\S*\s+)+/, ""], // VAR=valor
  [/^op\s+run\b.*?--\s+/, ""],
  [/^(?:npx|bunx)(?:\s+-\S*)*\s+/, ""],
  [/^(?:pnpm|yarn)\s+(?:exec|dlx)\s+/, ""],
  [/^env(?:\s+(?:-[uCS]\s*\S+|-\S*))*\s+/, ""],
  [/^(?:sudo|doas)(?:\s+(?:-[ugCDhprtTU]\s*\S+|-\S*))*\s+/, ""],
  [/^timeout(?:\s+(?:-[sk]\s*\S+|-\S*))*\s+\S+\s+/, ""],
  [/^nice(?:\s+(?:-n\s*\S+|-\S*))*\s+/, ""],
  [/^xargs(?:\s+(?:-[IdEnLPs]\s*\S+|-\S*))*\s+/, ""],
  [/^(?:command|builtin|exec|nohup|time|stdbuf|caffeinate)(?:\s+-\S*)*\s+/, ""],
  [/^\\/, ""], // \aws (salta alias)
  [/^(['"])([^'"\s]+)\1(?=\s|$)/, "$2"], // "aws" s3 …
  [/^(?:[^\s/'"]*\/)+(?=\S)/, ""], // /usr/local/bin/aws, ./node_modules/.bin/cdk
];
const MAX_UNWRAP = 16;
/** Más anidamiento que esto (`bash -c "bash -c …"`) no se analiza: se pregunta. */
const MAX_NESTING = 4;

/** `bash -c '…'`, `sh -lc "…"`, `eval '…'`: el comando real va en el argumento. */
const NESTED_SHELL = /^(?:(?:(?:ba|da|z|k)?sh)(?:\s+-\S+)*?\s+-[a-z]*c[a-z]*|eval)\s+(.+)$/s;
/** `$(…)` y `` `…` `` dentro de cualquier comando. */
const SUBSTITUTIONS = [/\$\(([^()]*)\)/g, /`([^`]*)`/g];

/** Quita asignaciones `VAR=valor`, envoltorios (`sudo`, `timeout`, `npx`, `op run --`…) y rutas. */
function bareCommand(segment: string): string {
  let bare = segment;
  for (let i = 0; i < MAX_UNWRAP; i++) {
    const before = bare;
    for (const [re, to] of WRAPPERS) bare = bare.replace(re, to);
    if (bare === before) break;
  }
  return bare;
}

function unquote(s: string): string {
  return s.trim().replace(/^\\*['"]|\\*['"]$/g, "");
}

function stricter(a: AwsVerdict, b: AwsVerdict): AwsVerdict {
  return LEVEL_ORDER[b.level] > LEVEL_ORDER[a.level] ? b : a;
}

function classifySegment(
  segment: string,
  sessionProfile: string | undefined,
  depth: number,
): AwsVerdict {
  const bare = bareCommand(segment);
  const nested = NESTED_SHELL.exec(bare)?.[1];
  if (nested !== undefined) {
    const profile = OTHER_PROFILE.exec(segment)?.[1] ?? sessionProfile;
    return classifyLine(unquote(nested), profile, depth + 1);
  }
  const tool = Object.keys(TOOLS).find((t) => new RegExp(`^${t}(?:\\s|$)`).test(bare));
  if (!tool) return { level: "pass" };
  const rules = TOOLS[tool] as { readOnly: RegExp; destructive: RegExp };

  const explicit = OTHER_PROFILE.exec(segment)?.[1];
  const isLocal =
    LOCAL_MARKERS.some((re) => re.test(` ${segment} `)) ||
    (explicit === undefined && sessionProfile === LOCAL_PROFILE);
  if (isLocal || rules.readOnly.test(bare)) return { level: "pass" };

  const target = explicit ?? sessionProfile ?? "credenciales por defecto";
  if (rules.destructive.test(bare))
    return {
      level: "deny",
      reason:
        `quality-guard: \`${bare.slice(0, PREVIEW_CHARS)}\` es destructivo contra una cuenta real (${target}). ` +
        "Usa Floci (AWS_PROFILE=floci) o pide al usuario que lo ejecute a mano.",
    };
  return {
    level: "ask",
    reason:
      `quality-guard: \`${bare.slice(0, PREVIEW_CHARS)}\` cambia recursos en una cuenta real (${target}), ` +
      "no en Floci. ¿Seguro?",
  };
}

/** Clasifica una línea de Bash: gana el segmento más estricto. */
export function classifyAws(command: string, sessionProfile?: string): AwsVerdict {
  return classifyLine(command, sessionProfile, 0);
}

function classifyLine(
  command: string,
  sessionProfile: string | undefined,
  depth: number,
): AwsVerdict {
  if (depth > MAX_NESTING)
    return {
      level: "ask",
      reason: "quality-guard: comando demasiado anidado para comprobar si toca AWS real. ¿Seguro?",
    };
  let worst: AwsVerdict = { level: "pass" };
  for (const re of SUBSTITUTIONS)
    for (const [, inner] of command.matchAll(re))
      worst = stricter(worst, classifyLine(inner ?? "", sessionProfile, depth + 1));
  for (const s of segments(command))
    worst = stricter(worst, classifySegment(s, sessionProfile, depth));
  return worst;
}

/** ¿Es una herramienta MCP de AWS? (aws-core y servidores parecidos) */
export function isAwsMcpTool(tool: string): boolean {
  return /^mcp__.*aws/i.test(tool);
}

/** Busca un comando `aws …` dentro de la entrada de una herramienta MCP. */
export function awsCommandIn(input: unknown): string | undefined {
  if (typeof input === "string") return /^\s*aws\s/.test(input) ? input.trim() : undefined;
  if (input && typeof input === "object")
    for (const v of Object.values(input)) {
      const found = awsCommandIn(v);
      if (found) return found;
    }
  return undefined;
}

// ── Magic numbers ─────────────────────────────────────────────────────────────

export type Linter = "biome" | "ruff";
export type Finding = { line: number; column: number; message: string };

const MAX_FINDINGS = 5;

export function linterFor(path: string): Linter | undefined {
  if (/\.[cm]?[jt]sx?$/.test(path) && !/\.d\.[cm]?ts$/.test(path)) return "biome";
  if (/\.py$/.test(path)) return "ruff";
  return undefined;
}

export function linterArgs(linter: Linter, path: string): string[] {
  return linter === "biome"
    ? ["lint", "--only=style/noMagicNumbers", "--reporter=json", path]
    : ["check", "--select", "PLR2004", "--output-format", "json", "--exit-zero", path];
}

type BiomeOut = {
  diagnostics?: { category?: string; message?: string; location?: { start?: Pos } }[];
};
type Pos = { line?: number; column?: number };
type RuffOut = { code?: string; message?: string; location?: { row?: number; column?: number } }[];

/** Extrae el primer objeto/array JSON de la salida (biome puede añadir avisos alrededor). */
function json(stdout: string): unknown {
  const start = stdout.search(/[[{]/);
  if (start < 0) return undefined;
  try {
    return JSON.parse(stdout.slice(start));
  } catch {
    return undefined;
  }
}

export function parseFindings(linter: Linter, stdout: string): Finding[] {
  const out = json(stdout);
  if (linter === "biome") {
    const diags = (out as BiomeOut | undefined)?.diagnostics ?? [];
    return diags
      .filter((d) => d.category === "lint/style/noMagicNumbers")
      .map((d) => ({
        line: d.location?.start?.line ?? 0,
        column: d.location?.start?.column ?? 0,
        message: "número mágico",
      }));
  }
  const rows = Array.isArray(out) ? (out as RuffOut) : [];
  return rows
    .filter((r) => r.code === "PLR2004")
    .map((r) => ({
      line: r.location?.row ?? 0,
      column: r.location?.column ?? 0,
      message: r.message ?? "número mágico",
    }));
}

/** Líneas (1-based) que ocupa `fragment` dentro de `text`; vacío si no aparece. */
export function linesOf(text: string, fragment: string): { from: number; to: number } | undefined {
  const at = fragment ? text.indexOf(fragment) : -1;
  if (at < 0) return undefined;
  const from = text.slice(0, at).split("\n").length;
  return { from, to: from + fragment.split("\n").length - 1 };
}

/** Texto que lee el modelo tras la edición; undefined si no hay nada que decir. */
export function report(
  path: string,
  findings: readonly Finding[],
  range?: { from: number; to: number },
): string | undefined {
  const inRange = range
    ? findings.filter((f) => f.line >= range.from && f.line <= range.to)
    : findings;
  if (inRange.length === 0) return undefined;
  const shown = inRange
    .slice(0, MAX_FINDINGS)
    .map((f) => `- ${path}:${f.line}:${f.column} ${f.message}`);
  const more = inRange.length > MAX_FINDINGS ? [`- … y ${inRange.length - MAX_FINDINGS} más`] : [];
  return [
    "quality-guard: números mágicos en lo que acabas de escribir. Extráelos a constantes con nombre " +
      "y unidad (skill no-magic-numbers), salvo que el contexto ya los explique:",
    ...shown,
    ...more,
  ].join("\n");
}
