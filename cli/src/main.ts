import { applyCommand } from "./commands/apply.ts";
import { awakeCommand } from "./commands/awake.ts";
import { backlogCommand } from "./commands/backlog.ts";
import { captureCommand } from "./commands/capture.ts";
import { doctorCommand } from "./commands/doctor.ts";
import { driftCommand } from "./commands/drift.ts";
import { moduleCommand } from "./commands/module.ts";
import { planCommand } from "./commands/plan.ts";
import { reportCommand } from "./commands/report.ts";
import { sandboxCheckCommand } from "./commands/sandbox-check.ts";
import { selfCommand } from "./commands/self.ts";
import { setupCommand } from "./commands/setup.ts";
import { versionCommand } from "./commands/version.ts";
import { log, out } from "./core/log.ts";
import { wtCommand } from "./wt/index.ts";

const HELP = `forja — provisionamiento de estaciones de desarrollo

  forja setup [--no-claude]            Primera configuración (perfil + plan + apply + doctor)
  forja plan [módulo…] [--json]        Muestra qué cambiaría, sin tocar nada
  forja apply [módulo…] [--yes] [--dry-run] [--force]
  forja drift [--json]                 Detecta desvíos (sale con 2 si los hay)
  forja capture [módulo] [--yes] [--json]  Pasa al repo paquetes y archivos cambiados en la máquina
  forja doctor [--json] [--fix]        Diagnóstico de módulos y salud (--fix: con Claude, skill mac-doctor)
  forja module ls | info <módulo>
  forja wt new|ls|rm|prune|init-project …   Worktrees (ver: forja wt --help)
  forja sandbox-check [--host h]… [--json] [--inside-loop]  Comprobación previa de un loop (ejecutar dentro del sandbox)
  forja awake on|off|status            No dormir al cerrar la tapa (loops largos; ver --help)
  forja report [-o archivo.md]         Estado de la máquina en Markdown (p. ej. para Obsidian)
  forja backlog add "<texto>" [--module m] | ls
  forja self update [--dry-run]        git pull --ff-only del clon de forja + mise install
  forja version

Códigos de salida: 0 ok · 1 error · 2 desvío · 3 requiere confirmación.`;

const commands: Record<string, (argv: string[]) => Promise<number>> = {
  setup: setupCommand,
  plan: planCommand,
  apply: applyCommand,
  drift: driftCommand,
  doctor: doctorCommand,
  module: moduleCommand,
  wt: wtCommand,
  backlog: backlogCommand,
  report: reportCommand,
  awake: awakeCommand,
  "sandbox-check": sandboxCheckCommand,
  version: versionCommand,
  capture: captureCommand,
  self: selfCommand,
};

async function main(): Promise<number> {
  const [cmd, ...rest] = process.argv.slice(2);
  if (!cmd || cmd === "help" || cmd === "--help" || cmd === "-h") {
    out(HELP);
    return 0;
  }
  const run = commands[cmd];
  if (!run) {
    log.error(`comando desconocido: ${cmd}\n`);
    out(HELP);
    return 1;
  }
  try {
    return await run(rest);
  } catch (e) {
    log.error((e as Error).message);
    return 1;
  }
}

// `forja … | head` no debe terminar con un stack trace.
process.stdout.on("error", (e: NodeJS.ErrnoException) => {
  if (e.code === "EPIPE") process.exit(0);
  throw e;
});

process.exitCode = await main();
