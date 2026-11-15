// Lógica pura de tdd-guard: sin imports ni `$`, la prueban `node --test` (cli/test) y el mod.

export type FileKind = "test" | "source" | "other";
export type TestRun = "red" | "green";
export type Mode = "on" | "off";

const SOURCE_EXT = /\.(?:[cm]?[jt]sx?|py|go|rs|rb|java|kt|swift)$/;

const TEST_FILE = [
  /\.(?:test|spec)\.[cm]?[jt]sx?$/,
  /(?:^|\/)__tests__\//,
  /(?:^|\/)tests?\//,
  /(?:^|\/)test_[^/]*\.py$/,
  /_test\.(?:py|go)$/,
  /_spec\.rb$/,
  /Tests?\.(?:java|kt|swift)$/,
];

/** Código que no se escribe con TDD: configuración, tipos, generado o dependencias. */
const EXEMPT = [
  /\.d\.[cm]?ts$/,
  /(?:^|\/)[^/]*\.config\.[cm]?[jt]s$/,
  /(?:^|\/)(?:node_modules|dist|build|coverage|cdk\.out|\.claude-plugin|\.venv|vendor|target)\//,
];

export function classify(path: string): FileKind {
  if (TEST_FILE.some((re) => re.test(path))) return "test";
  if (!SOURCE_EXT.test(path) || EXEMPT.some((re) => re.test(path))) return "other";
  return "source";
}

const TEST_RUNNER =
  /(?:^|[\s;&|(])(?:vitest|jest|pytest|bun test|go test|cargo test|node --test|(?:npm|pnpm|yarn|bun) (?:run |-s )?test\b|rspec|phpunit)/;

/** ¿El comando de Bash ejecuta tests? */
export function isTestRun(command: string): boolean {
  return TEST_RUNNER.test(command);
}

export type Verdict = { allow: true } | { allow: false; reason: string };

/** Decide si se permite editar `path` dados el modo y los tests tocados en la sesión. */
export function decide(mode: Mode, testsTouched: readonly string[], path: string): Verdict {
  if (mode === "off" || classify(path) !== "source" || testsTouched.length > 0)
    return { allow: true };
  return {
    allow: false,
    reason:
      `tdd-guard: ${path} es código de producción y en esta sesión aún no hay un test. ` +
      "Escribe primero un test que falle (skill tdd), ejecútalo y comprueba que falla por la razón " +
      "correcta; después implementa. Si es un spike o un cambio sin comportamiento, el usuario puede " +
      "desactivarlo con /tdd off.",
  };
}

/** Interpreta los argumentos de `/tdd`. */
export function parseCommand(args: string): Mode | "status" {
  const word = args.trim().toLowerCase();
  if (word === "on" || word === "off") return word;
  return "status";
}

export function statusText(mode: Mode, testsTouched: number, last: TestRun | null): string {
  const run = last === null ? "sin ejecutar" : last === "red" ? "rojo" : "verde";
  return `TDD ${mode === "on" ? "●" : "○"} ${mode} · tests tocados: ${testsTouched} · último run: ${run}`;
}
