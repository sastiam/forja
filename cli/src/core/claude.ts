// Integración con `claude -p` (diagnóstico de doctor --fix y onboarding).
// Llega en v0.2.0 (ver docs/SPEC.md §2.12). Aquí solo se detecta disponibilidad.
import { commandExists, type Runner } from "./runners/shell.ts";

export function claudeAvailable(runner: Runner): Promise<boolean> {
  return commandExists(runner, "claude");
}
