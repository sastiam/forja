import { existsSync } from "node:fs";
import { cp, mkdir, readdir } from "node:fs/promises";
import { join } from "node:path";
import { log } from "../core/log.ts";
import { repoRoot } from "../core/paths.ts";
import { createRunner } from "../core/runners/shell.ts";
import { mainRepoRoot } from "./git.ts";

/** Copia templates/project al repo actual sin sobrescribir archivos existentes. */
export async function initProject(
  dest: string,
  src = join(repoRoot(), "templates", "project"),
): Promise<string[]> {
  const copied: string[] = [];
  const walk = async (rel: string): Promise<void> => {
    for (const e of await readdir(join(src, rel), { withFileTypes: true })) {
      const r = join(rel, e.name);
      if (e.isDirectory()) await walk(r);
      else if (!existsSync(join(dest, r))) {
        await mkdir(join(dest, rel), { recursive: true });
        await cp(join(src, r), join(dest, r));
        copied.push(r);
      }
    }
  };
  await walk("");
  return copied;
}

export async function wtInitProject(): Promise<number> {
  const repo = await mainRepoRoot(createRunner(false), process.cwd());
  const copied = await initProject(repo);
  for (const c of copied) log.ok(`creado ${c}`);
  if (!copied.length) log.info("Nada que copiar: los archivos ya existen.");
  return 0;
}
