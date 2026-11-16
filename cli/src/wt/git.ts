import { existsSync, readFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import type { Runner } from "../core/runners/shell.ts";

export interface GitWorktree {
  path: string;
  head: string;
  branch?: string;
  detached: boolean;
  bare: boolean;
  prunable: boolean;
}

/** Parsea la salida de `git worktree list --porcelain`. */
export function parseWorktreeList(text: string): GitWorktree[] {
  const out: GitWorktree[] = [];
  for (const block of text.split(/\n\s*\n/)) {
    if (!block.trim()) continue;
    const wt: GitWorktree = { path: "", head: "", detached: false, bare: false, prunable: false };
    for (const line of block.split("\n")) {
      const [k, ...v] = line.split(" ");
      const val = v.join(" ");
      if (k === "worktree") wt.path = val;
      else if (k === "HEAD") wt.head = val;
      else if (k === "branch") wt.branch = val.replace(/^refs\/heads\//, "");
      else if (k === "detached") wt.detached = true;
      else if (k === "bare") wt.bare = true;
      else if (k === "prunable") wt.prunable = true;
    }
    if (wt.path) out.push(wt);
  }
  return out;
}

export async function git(runner: Runner, cwd: string, args: string[], write = false) {
  return write ? runner.exec("git", args, { cwd }) : runner.query("git", args, { cwd });
}

export async function gitOk(
  runner: Runner,
  cwd: string,
  args: string[],
  write = false,
): Promise<string> {
  const r = await git(runner, cwd, args, write);
  if (r.code !== 0)
    throw new Error(`git ${args.join(" ")} falló: ${(r.stderr || r.stdout).trim()}`);
  return r.stdout.trim();
}

/** Raíz del repo principal (aunque se invoque desde un worktree). */
export async function mainRepoRoot(runner: Runner, cwd: string): Promise<string> {
  const common = await gitOk(runner, cwd, [
    "rev-parse",
    "--path-format=absolute",
    "--git-common-dir",
  ]);
  return basename(common) === ".git" ? dirname(common) : resolve(common);
}

export async function listWorktrees(runner: Runner, repo: string): Promise<GitWorktree[]> {
  return parseWorktreeList(await gitOk(runner, repo, ["worktree", "list", "--porcelain"]));
}

export async function refExists(runner: Runner, cwd: string, ref: string): Promise<boolean> {
  return (
    (await git(runner, cwd, ["rev-parse", "--verify", "--quiet", `${ref}^{commit}`])).code === 0
  );
}

/** Rama base por defecto: origin/main → main → HEAD. */
export async function defaultBase(runner: Runner, repo: string): Promise<string> {
  for (const ref of ["origin/main", "main", "origin/master", "master"])
    if (await refExists(runner, repo, ref)) return ref;
  return "HEAD";
}

/**
 * Añade `pattern` al `info/exclude` del repo si aún no está. Ese archivo es local
 * (no se versiona) y lo comparten todos los worktrees del repo.
 */
export async function ensureExcluded(runner: Runner, repo: string, pattern: string): Promise<void> {
  const file = await gitOk(runner, repo, [
    "rev-parse",
    "--path-format=absolute",
    "--git-path",
    "info/exclude",
  ]);
  const current = existsSync(file) ? readFileSync(file, "utf8") : "";
  if (current.split("\n").some((l) => l.trim() === pattern)) return;
  const sep = current === "" || current.endsWith("\n") ? "" : "\n";
  await runner.mkdirp(dirname(file));
  await runner.writeFile(file, `${current}${sep}${pattern}\n`);
}

export const worktreePath = (repo: string, slug: string): string =>
  join(dirname(repo), `${basename(repo)}.wt`, slug);
