import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { SandboxFinding } from "../commands/sandbox-check.ts";
import type { ClaudeSandbox } from "../core/claude-sandbox.ts";
import { home, stateDir } from "../core/paths.ts";
import type { Runner } from "../core/runners/shell.ts";

/**
 * Sandbox de los loops de `wt night` (ADR 0013).
 *
 * openspec-cascade carga solo los ajustes del proyecto, así que el sandbox de
 * ~/.claude/settings.json no llega a sus sesiones. `wt night` escribe un
 * settings propio por noche y se lo pasa con `--settings`; la comprobación
 * previa corre con ese mismo archivo, dentro del sandbox, antes del loop.
 */

/** Lecturas que ningún agente necesita (las mismas que el settings global). */
export const SECRET_READ_DENY = [
  "Read(./.env)",
  "Read(./.env.*)",
  "Read(~/.aws/**)",
  "Read(~/.ssh/**)",
  "Read(~/.config/op/**)",
  "Read(~/.config/forja/local/**)",
];

export interface NightSandboxInput {
  /** Dominios, lecturas y escrituras del host + perfil + módulos (claudeSandbox). */
  base: ClaudeSandbox;
  /** `--host` de `wt night`: dominios que la tarea necesita esta noche. */
  hosts: string[];
  /** Módulo containers activo: Docker por el socket de Colima (ADR 0012). */
  docker: boolean;
  homeDir?: string;
}

/** Settings de Claude Code para las sesiones del loop. Sin duplicados y en orden estable. */
export function nightSettings(i: NightSandboxInput): Record<string, unknown> {
  const uniq = (xs: string[]) => [...new Set(xs)];
  const h = i.homeDir ?? home();
  return {
    permissions: { deny: SECRET_READ_DENY },
    sandbox: {
      enabled: true,
      // Sin sandbox no hay loop: mejor fallar al arrancar que correr sin protección.
      failIfUnavailable: true,
      // Nadie aprueba de noche: lo que no cabe en el sandbox falla y no se escapa.
      allowUnsandboxedCommands: false,
      autoAllowBashIfSandboxed: true,
      network: {
        allowedDomains: uniq([...i.base.allowed_domains, ...i.hosts]),
        // Los tests suelen levantar servidores en localhost.
        allowLocalBinding: true,
        ...(i.docker ? { allowUnixSockets: [join(h, ".colima", "default", "docker.sock")] } : {}),
      },
      filesystem: {
        allowRead: i.base.allow_read,
        allowWrite: i.base.allow_write,
      },
    },
  };
}

/** Fuera del worktree y fuera de lo que el sandbox puede escribir: el agente no puede reescribir su sandbox. */
export function nightSettingsPath(branch: string): string {
  return join(stateDir(), "night", `${branch.replaceAll("/", "-")}.settings.json`);
}

export function writeNightSettings(path: string, settings: Record<string, unknown>): void {
  mkdirSync(join(path, ".."), { recursive: true });
  writeFileSync(path, `${JSON.stringify(settings, null, 2)}\n`, { mode: 0o600 });
}

/** Comando que la sesión de comprobación ejecuta dentro del sandbox. */
export function insideCheckCommand(hosts: string[]): string {
  return [
    "forja",
    "sandbox-check",
    "--json",
    "--inside-loop",
    ...hosts.flatMap((h) => ["--host", h]),
  ].join(" ");
}

/**
 * Argumentos de `claude -p` para la comprobación: los mismos ajustes que el
 * loop (solo los del proyecto + `--settings`), Haiku y solo Bash.
 */
export function preflightClaudeArgs(settingsPath: string, hosts: string[]): string[] {
  const cmd = insideCheckCommand(hosts);
  return [
    "-p",
    `Ejecuta exactamente este comando con la herramienta Bash, sin cambiarlo: ${cmd}\n` +
      "Después responde solo con su salida estándar, tal cual, sin comentarios ni bloques de código.",
    "--settings",
    settingsPath,
    "--setting-sources",
    "project",
    "--permission-mode",
    "dontAsk",
    "--allowedTools",
    "Bash",
    "--model",
    "haiku",
    "--max-turns",
    "4",
    "--output-format",
    "json",
  ];
}

const fail = (name: string, detail: string, fix: string): SandboxFinding[] => [
  { name, status: "fail", detail, fix },
];

/**
 * Lee la salida JSON de `claude -p` y el informe de `sandbox-check --json` que
 * el modelo devolvió. Ante cualquier duda falla: un loop sin comprobar no arranca.
 */
export function parsePreflight(code: number, stdout: string, stderr: string): SandboxFinding[] {
  const name = "sandbox: comprobación dentro del loop";
  let result: string;
  try {
    const r = JSON.parse(stdout) as { is_error?: boolean; result?: string; subtype?: string };
    if (r.is_error || typeof r.result !== "string")
      return fail(
        name,
        r.result ?? r.subtype ?? "sin resultado",
        "revisa `claude -p` (sesión iniciada, red) y el settings de la noche",
      );
    result = r.result;
  } catch {
    const why = (stderr || stdout).trim().split("\n")[0] || `claude salió con ${code}`;
    return fail(
      name,
      why,
      "comprueba que `claude` está instalado y con sesión iniciada (claude /login)",
    );
  }
  const start = result.indexOf("{");
  const end = result.lastIndexOf("}");
  try {
    const report = JSON.parse(result.slice(start, end + 1)) as { findings?: SandboxFinding[] };
    if (start < 0 || !Array.isArray(report.findings)) throw new Error("sin findings");
    return report.findings.map((f) => ({ ...f, name: `sandbox: ${f.name}` }));
  } catch {
    return fail(
      name,
      result.trim().split("\n")[0]?.slice(0, 200) ?? "",
      "el agente no pudo ejecutar `forja sandbox-check` dentro del sandbox: ¿forja en el PATH? ¿lo deniega el settings?",
    );
  }
}

/** Ejecuta la comprobación dentro del sandbox del loop, con el directorio de trabajo en el worktree. */
export async function insidePreflight(
  runner: Runner,
  cwd: string,
  settingsPath: string,
  hosts: string[],
): Promise<SandboxFinding[]> {
  const r = await runner.query("claude", preflightClaudeArgs(settingsPath, hosts), { cwd });
  return parsePreflight(r.code, r.stdout, r.stderr);
}
