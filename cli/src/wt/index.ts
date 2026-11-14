import { log, out } from "../core/log.ts";
import { wtInitProject } from "./init-project.ts";
import { wtIntegrate } from "./integrate.ts";
import { wtLs } from "./ls.ts";
import { wtNew } from "./new.ts";
import { wtNight } from "./night.ts";
import { wtPrune } from "./prune.ts";
import { wtRm } from "./rm.ts";

const HELP = `forja wt — worktrees

  new <rama> [--base origin/main] [--agent claude|opencode|hermes] [--print-path] [--open]
  ls [--json]
  rm <rama|ruta> [--force]
  prune [--merged] [--older-than 14d] [--dry-run]
  integrate <rama> [--onto origin/main] [--strategy rebase|merge] [--no-fetch] [--json]
  init-project
  night --changes a,b [--engine claude|opencode|antigravity] [--branch b] [--full-gate] [--dry-run]`;

export async function wtCommand(argv: string[]): Promise<number> {
  const [sub, ...rest] = argv;
  switch (sub) {
    case "new":
      return wtNew(rest);
    case "ls":
      return wtLs(rest);
    case "rm":
      return wtRm(rest);
    case "prune":
      return wtPrune(rest);
    case "init-project":
      return wtInitProject();
    case "integrate":
      return wtIntegrate(rest);
    case "night":
      return wtNight(rest);
    case undefined:
    case "--help":
    case "help":
      out(HELP);
      return 0;
    default:
      log.error(`subcomando desconocido: ${sub}`);
      out(HELP);
      return 1;
  }
}
