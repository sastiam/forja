import { notYet } from "../commands/later.ts";
import { log, out } from "../core/log.ts";
import { wtInitProject } from "./init-project.ts";
import { wtLs } from "./ls.ts";
import { wtNew } from "./new.ts";
import { wtPrune } from "./prune.ts";
import { wtRm } from "./rm.ts";

const HELP = `forja wt — worktrees

  new <rama> [--base origin/main] [--agent claude|opencode|hermes] [--print-path] [--open]
  ls [--json]
  rm <rama|ruta> [--force]
  prune [--merged] [--older-than 14d] [--dry-run]
  init-project
  integrate (v0.2.0) · night (v0.3.0)`;

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
      return notYet("wt integrate", "v0.2.0");
    case "night":
      return notYet("wt night", "v0.3.0");
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
