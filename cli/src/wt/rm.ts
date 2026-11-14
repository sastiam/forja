import { existsSync } from "node:fs";
import { parseArgs } from "node:util";
import { log } from "../core/log.ts";
import { createRunner, type Runner } from "../core/runners/shell.ts";
import { loadWorktrees, removeWorktree } from "../core/state.ts";
import { defaultBase, type GitWorktree, git, gitOk, listWorktrees, mainRepoRoot } from "./git.ts";
import { slugify } from "./ports.ts";
import { loadProject } from "./project.ts";

export async function findWorktree(
  runner: Runner,
  repo: string,
  target: string,
): Promise<GitWorktree | undefined> {
  const all = await listWorktrees(runner, repo);
  return all.find(
    (w) =>
      w.path === target ||
      w.branch === target ||
      (w.branch && slugify(w.branch) === slugify(target)),
  );
}

export interface Safety {
  dirty: boolean;
  unpushed: number;
}

export async function safety(
  runner: Runner,
  repo: string,
  wt: GitWorktree,
  base: string,
): Promise<Safety> {
  const dirty = existsSync(wt.path)
    ? (await gitOk(runner, wt.path, ["status", "--porcelain"])).length > 0
    : false;
  let unpushed = 0;
  if (wt.branch) {
    // Commits de la rama que no están en ningún remoto ni en la base.
    const r = await git(runner, repo, [
      "rev-list",
      "--count",
      wt.branch,
      "--not",
      "--remotes",
      base,
    ]);
    unpushed = r.code === 0 ? Number(r.stdout.trim()) : 0;
  }
  return { dirty, unpushed };
}

/** Elimina un worktree con las salvaguardas de la SPEC. Lanza si es inseguro y no hay `force`. */
export async function removeSafely(
  runner: Runner,
  cwd: string,
  target: string,
  force: boolean,
): Promise<string> {
  const repo = await mainRepoRoot(runner, cwd);
  const wt = await findWorktree(runner, repo, target);
  if (!wt) throw new Error(`no encuentro el worktree: ${target}`);
  if (wt.path === repo) throw new Error("no se puede eliminar el worktree principal");
  const rec = (await loadWorktrees()).find((r) => r.path === wt.path);
  const base = rec?.base ?? (await defaultBase(runner, repo));
  const s = await safety(runner, repo, wt, base);
  if (!force && (s.dirty || s.unpushed)) {
    throw new Error(
      `${wt.path}: ${s.dirty ? "cambios sin commit" : ""}${s.dirty && s.unpushed ? " y " : ""}${s.unpushed ? `${s.unpushed} commit(s) sin push` : ""}. Usa --force para eliminarlo igualmente.`,
    );
  }
  const project = await loadProject(repo);
  for (const cmd of project.teardown) {
    log.step(`teardown: ${cmd}`);
    await runner.exec("sh", ["-c", cmd], { cwd: wt.path, stream: true });
  }
  await gitOk(runner, repo, ["worktree", "remove", ...(force ? ["--force"] : []), wt.path], true);
  await git(runner, repo, ["worktree", "prune"], true);
  await removeWorktree(wt.path);
  return wt.path;
}

export async function wtRm(argv: string[]): Promise<number> {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: { force: { type: "boolean" } },
  });
  if (!positionals[0]) {
    log.error("uso: forja wt rm <rama|ruta> [--force]");
    return 1;
  }
  const path = await removeSafely(
    createRunner(false),
    process.cwd(),
    positionals[0],
    values.force === true,
  );
  log.ok(`Eliminado: ${path}`);
  return 0;
}
