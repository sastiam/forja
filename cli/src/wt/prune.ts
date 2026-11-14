import { existsSync } from "node:fs";
import { parseArgs } from "node:util";
import { log } from "../core/log.ts";
import { createRunner, type Runner } from "../core/runners/shell.ts";
import { loadWorktrees, saveWorktrees } from "../core/state.ts";
import { defaultBase, git, listWorktrees, mainRepoRoot } from "./git.ts";
import { removeSafely, safety } from "./rm.ts";

export function parseDuration(s: string): number {
  const m = /^(\d+)([smhdw])$/.exec(s);
  if (!m) throw new Error(`duración inválida: ${s} (ej. 14d, 12h)`);
  const unit = { s: 1, m: 60, h: 3600, d: 86400, w: 604800 }[m[2] as "s"];
  return Number(m[1]) * unit * 1000;
}

export interface PruneResult {
  removed: string[];
  skipped: { path: string; reason: string }[];
  orphans: string[];
}

export async function prune(
  runner: Runner,
  cwd: string,
  o: { merged?: boolean; olderThanMs?: number; dryRun?: boolean },
): Promise<PruneResult> {
  const repo = await mainRepoRoot(runner, cwd);
  const res: PruneResult = { removed: [], skipped: [], orphans: [] };
  const records = await loadWorktrees();
  // Entradas huérfanas del state (ruta inexistente).
  res.orphans = records.filter((r) => r.repo === repo && !existsSync(r.path)).map((r) => r.path);
  if (!o.dryRun) {
    if (res.orphans.length)
      await saveWorktrees(records.filter((r) => !res.orphans.includes(r.path)));
    await git(runner, repo, ["worktree", "prune"], true);
  }
  if (!o.merged && o.olderThanMs === undefined) return res;
  const fallbackBase = await defaultBase(runner, repo);
  for (const wt of await listWorktrees(runner, repo)) {
    if (wt.path === repo || !wt.branch || !existsSync(wt.path)) continue;
    const rec = records.find((r) => r.path === wt.path);
    const base = rec?.base ?? fallbackBase;
    const isMerged = o.merged
      ? (await git(runner, repo, ["merge-base", "--is-ancestor", wt.branch, base])).code === 0
      : false;
    const isOld =
      o.olderThanMs !== undefined && rec
        ? Date.now() - Date.parse(rec.created_at) > o.olderThanMs
        : false;
    if (!isMerged && !isOld) continue;
    const s = await safety(runner, repo, wt, base);
    if (s.dirty || (s.unpushed && !isMerged)) {
      res.skipped.push({
        path: wt.path,
        reason: s.dirty ? "cambios sin commit" : "commits sin push",
      });
      continue;
    }
    if (!o.dryRun) await removeSafely(runner, repo, wt.path, false);
    res.removed.push(wt.path);
  }
  return res;
}

export async function wtPrune(argv: string[]): Promise<number> {
  const { values } = parseArgs({
    args: argv,
    options: {
      merged: { type: "boolean" },
      "older-than": { type: "string" },
      "dry-run": { type: "boolean" },
    },
  });
  const res = await prune(createRunner(false), process.cwd(), {
    merged: values.merged,
    olderThanMs: values["older-than"] ? parseDuration(values["older-than"]) : undefined,
    dryRun: values["dry-run"],
  });
  const verb = values["dry-run"] ? "se eliminarían" : "eliminados";
  for (const p of res.removed) log.ok(`${verb}: ${p}`);
  for (const s of res.skipped) log.warn(`omitido ${s.path}: ${s.reason}`);
  for (const o of res.orphans)
    log.info(`entrada huérfana ${values["dry-run"] ? "(se limpiaría)" : "limpiada"}: ${o}`);
  if (!res.removed.length && !res.skipped.length && !res.orphans.length)
    log.info("Nada que limpiar.");
  return 0;
}
