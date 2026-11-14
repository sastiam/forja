// Integración con Claude Code: sesiones interactivas que arrancan con una skill
// (onboarding, doctor --fix). El usuario ve y confirma cada acción en la sesión.
import { spawnSync } from "node:child_process";
import { commandExists, type Runner } from "./runners/shell.ts";

export function claudeAvailable(runner: Runner): Promise<boolean> {
  return commandExists(runner, "claude");
}

/** Prompt inicial que invoca una skill con contexto adicional (p. ej. el JSON de doctor). */
export function skillPrompt(skill: string, intro: string, context?: string): string {
  return [`Usa la skill ${skill}.`, intro, context ? `\n\`\`\`json\n${context}\n\`\`\`` : ""]
    .filter(Boolean)
    .join(" ");
}

/** Abre Claude Code en la terminal (stdio heredado) y espera a que termine. */
export function runClaudeInteractive(prompt: string, cwd?: string): number {
  const r = spawnSync("claude", [prompt], { stdio: "inherit", cwd });
  return r.status ?? 1;
}
