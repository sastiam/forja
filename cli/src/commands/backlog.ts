import { appendFile, readFile } from "node:fs/promises";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { out } from "../core/log.ts";
import { repoRoot } from "../core/paths.ts";

/** Formato de una entrada: `- [ ] YYYY-MM-DD módulo: texto` bajo la sección "## Inbox". */
export function formatEntry(text: string, module: string | undefined, date: Date): string {
  const d = date.toISOString().slice(0, 10);
  return `- [ ] ${d} ${module ? `${module}: ` : ""}${text}`;
}

export async function addEntry(file: string, entry: string): Promise<void> {
  let current = "";
  try {
    current = await readFile(file, "utf8");
  } catch {
    current = "# Backlog\n";
  }
  const prefix = current.includes("## Inbox")
    ? ""
    : `${current.endsWith("\n") ? "" : "\n"}\n## Inbox\n`;
  await appendFile(file, `${prefix}${entry}\n`);
}

export async function backlogCommand(argv: string[]): Promise<number> {
  const [sub = "ls", ...rest] = argv;
  const file = join(repoRoot(), "BACKLOG.md");
  if (sub === "add") {
    const { values, positionals } = parseArgs({
      args: rest,
      allowPositionals: true,
      options: { module: { type: "string" } },
    });
    const text = positionals.join(" ").trim();
    if (!text) {
      out('uso: forja backlog add "<texto>" [--module m]');
      return 1;
    }
    await addEntry(file, formatEntry(text, values.module, new Date()));
    out("Anotado en BACKLOG.md");
    return 0;
  }
  out((await readFile(file, "utf8").catch(() => "(BACKLOG.md vacío)")).trimEnd());
  return 0;
}
