import { parseArgs } from "node:util";
import { log, out, outJson } from "../core/log.ts";
import { isInteractive } from "../core/prompt.ts";
import { createRunner, type Runner } from "../core/runners/shell.ts";
import { defaultBase, git, gitOk, mainRepoRoot } from "./git.ts";
import { loadProject } from "./project.ts";
import { findWorktree } from "./rm.ts";

export type Strategy = "rebase" | "merge";

export interface IntegrateResult {
  branch: string;
  path: string;
  onto: string;
  strategy: Strategy;
  status: "ok" | "conflicts" | "checks-failed";
  conflicts: string[];
  checks: { cmd: string; ok: boolean }[];
  ahead: number;
  behind: number;
}

export interface IntegrateOpts {
  target: string;
  onto?: string;
  strategy?: Strategy;
  fetch?: boolean;
  /** Abre `git mergetool` (Sublime Merge) en cada parada por conflictos. */
  mergetool?: boolean;
}

/** Sin `GIT_EDITOR`, `rebase --continue` y `merge` abrirían un editor. */
const NO_EDITOR = { GIT_EDITOR: "true" };

async function conflicted(runner: Runner, cwd: string): Promise<string[]> {
  const r = await git(runner, cwd, ["diff", "--name-only", "--diff-filter=U"]);
  return r.stdout.split("\n").filter(Boolean);
}

async function inProgress(runner: Runner, cwd: string, strategy: Strategy): Promise<boolean> {
  const head = strategy === "rebase" ? "REBASE_HEAD" : "MERGE_HEAD";
  return (await git(runner, cwd, ["rev-parse", "--verify", "--quiet", head])).code === 0;
}

/**
 * Pone la rama de un worktree al día con `onto` (rebase o merge). mergiraf y
 * rerere actúan solos vía la configuración de git. Si quedan conflictos, se
 * detiene (o abre mergetool) y los lista. Después corre `[checks].integrate`.
 * Nunca hace push.
 */
export async function integrate(
  runner: Runner,
  cwd: string,
  o: IntegrateOpts,
): Promise<IntegrateResult> {
  const repo = await mainRepoRoot(runner, cwd);
  const wt = await findWorktree(runner, repo, o.target);
  if (!wt?.branch) throw new Error(`no encuentro el worktree de la rama: ${o.target}`);
  const strategy = o.strategy ?? "rebase";
  const path = wt.path;
  if (o.fetch !== false) await git(runner, repo, ["fetch", "--quiet", "origin"], true);
  const onto = o.onto ?? (await defaultBase(runner, repo));
  const result: IntegrateResult = {
    branch: wt.branch,
    path,
    onto,
    strategy,
    status: "ok",
    conflicts: [],
    checks: [],
    ahead: 0,
    behind: 0,
  };

  if (!(await inProgress(runner, path, strategy))) {
    if ((await gitOk(runner, path, ["status", "--porcelain", "--untracked-files=no"])).length)
      throw new Error(`${path}: hay cambios sin commit; haz commit o stash antes de integrar`);
    const args = strategy === "rebase" ? ["rebase", onto] : ["merge", "--no-edit", onto];
    const r = await runner.exec("git", args, { cwd: path, env: NO_EDITOR });
    if (r.code !== 0 && !(await inProgress(runner, path, strategy)))
      throw new Error(`git ${args.join(" ")} falló: ${(r.stderr || r.stdout).trim()}`);
  }

  // Bucle de paradas por conflictos: mergetool (si se pide) → continuar.
  while (await inProgress(runner, path, strategy)) {
    let files = await conflicted(runner, path);
    if (files.length && o.mergetool) {
      await runner.exec("git", ["mergetool"], { cwd: path, stream: true });
      files = await conflicted(runner, path);
    }
    if (files.length) {
      result.status = "conflicts";
      result.conflicts = files;
      return result;
    }
    await git(runner, path, ["add", "-A"], true);
    const cont = strategy === "rebase" ? ["rebase", "--continue"] : ["commit", "--no-edit"];
    const r = await runner.exec("git", cont, { cwd: path, env: NO_EDITOR });
    if (r.code !== 0 && !(await conflicted(runner, path)).length)
      throw new Error(`git ${cont.join(" ")} falló: ${(r.stderr || r.stdout).trim()}`);
  }

  for (const cmd of (await loadProject(repo)).integrate) {
    const r = await runner.exec("sh", ["-c", cmd], { cwd: path, stream: true });
    result.checks.push({ cmd, ok: r.code === 0 });
  }
  if (result.checks.some((c) => !c.ok)) result.status = "checks-failed";

  const counts = await git(runner, path, ["rev-list", "--left-right", "--count", `HEAD...${onto}`]);
  const [ahead, behind] = counts.stdout.trim().split(/\s+/).map(Number);
  result.ahead = ahead ?? 0;
  result.behind = behind ?? 0;
  return result;
}

export async function wtIntegrate(argv: string[]): Promise<number> {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      onto: { type: "string" },
      strategy: { type: "string" },
      "no-fetch": { type: "boolean" },
      "no-mergetool": { type: "boolean" },
      json: { type: "boolean" },
    },
  });
  const target = positionals[0];
  const strategy = values.strategy ?? "rebase";
  if (!target || (strategy !== "rebase" && strategy !== "merge")) {
    log.error(
      "uso: forja wt integrate <rama> [--onto origin/main] [--strategy rebase|merge] [--no-fetch] [--no-mergetool] [--json]",
    );
    return 1;
  }
  const r = await integrate(createRunner(false), process.cwd(), {
    target,
    onto: values.onto,
    strategy,
    fetch: !values["no-fetch"],
    mergetool: !values.json && !values["no-mergetool"] && isInteractive(),
  });
  if (values.json) outJson(r);
  else if (r.status === "conflicts") {
    out(`✖ ${r.branch}: conflictos que mergiraf no resolvió:`);
    for (const f of r.conflicts) out(`    ${f}`);
    const cont = r.strategy === "rebase" ? "git rebase --continue" : "git commit --no-edit";
    out(`  Resuelve en ${r.path} (git mergetool abre Sublime Merge), luego \`${cont}\``);
    out(`  y vuelve a ejecutar: forja wt integrate ${r.branch}`);
  } else {
    for (const c of r.checks) out(`${c.ok ? "✔" : "✖"} ${c.cmd}`);
    out(
      `${r.status === "ok" ? "✔" : "✖"} ${r.branch} integrada sobre ${r.onto} (${r.strategy}): ${r.ahead} commit(s) por delante, ${r.behind} por detrás. No se hizo push.`,
    );
  }
  return r.status === "ok" ? 0 : 1;
}
