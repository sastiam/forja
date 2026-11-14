import { log } from "../core/log.ts";

/** Comandos reservados para hitos posteriores (ver docs/SPEC.md §2.12). */
export function notYet(name: string, milestone: string): number {
  log.error(`forja ${name} llega en ${milestone}. Mientras tanto, consulta docs/SPEC.md §2.12.`);
  return 1;
}
