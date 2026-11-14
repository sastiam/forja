import { existsSync } from "node:fs";
import { parseArgs } from "node:util";
import { out, outJson } from "../core/log.ts";
import { commandExists, createRunner, type Runner } from "../core/runners/shell.ts";
import { loadWorktrees } from "../core/state.ts";
import { defaultBase, git, gitOk, listWorktrees, mainRepoRoot } from "./git.ts";

export interface WtRow {
  branch: string;
  path: string;
  owner: string;
  ahead: number;
  behind: number;
  dirty: boolean;
  lastCommit: string;
  port: number | null;
  age: string;
  pr: string | null;
}

const humanAge = (iso: string): string => {
  const s = (Date.now() - Date.parse(iso)) / 1000;
  return s < 3600
    ? `${Math.floor(s / 60)}m`
    : s < 86400
      ? `${Math.floor(s / 3600)}h`
      : `${Math.floor(s / 86400)}d`;
};

export async function collectRows(runner: Runner, cwd: string, withPr: boolean): Promise<WtRow[]> {
  const repo = await mainRepoRoot(runner, cwd);
  const records = await loadWorktrees();
  const fallback = await defaultBase(runner, repo);
  const ghOk =
    withPr &&
    (await commandExists(runner, "gh")) &&
    (await gitOk(runner, repo, ["remote"])).length > 0;
  const rows: WtRow[] = [];
  for (const wt of await listWorktrees(runner, repo)) {
    if (!existsSync(wt.path)) continue;
    const rec = records.find((r) => r.path === wt.path);
    const base = rec?.base ?? fallback;
    const lr = await git(runner, wt.path, [
      "rev-list",
      "--left-right",
      "--count",
      `${base}...HEAD`,
    ]);
    const [behind = 0, ahead = 0] = lr.code === 0 ? lr.stdout.trim().split(/\s+/).map(Number) : [];
    let pr: string | null = null;
    if (ghOk && wt.branch) {
      const r = await runner.query(
        "gh",
        ["pr", "view", wt.branch, "--json", "number,state", "-q", '"#\\(.number) \\(.state)"'],
        { cwd: repo, timeoutMs: 5000 },
      );
      if (r.code === 0) pr = r.stdout.trim() || null;
    }
    rows.push({
      branch: wt.branch ?? "(detached)",
      path: wt.path,
      owner: wt.path === repo ? "main" : (rec?.owner ?? "unknown"),
      ahead,
      behind,
      dirty: (await gitOk(runner, wt.path, ["status", "--porcelain"])).length > 0,
      lastCommit: await gitOk(runner, wt.path, ["log", "-1", "--format=%cr"]).catch(() => ""),
      port: rec?.port ?? null,
      age: rec ? humanAge(rec.created_at) : "-",
      pr,
    });
  }
  return rows;
}

export async function wtLs(argv: string[]): Promise<number> {
  const { values } = parseArgs({
    args: argv,
    options: { json: { type: "boolean" }, "no-pr": { type: "boolean" } },
  });
  const rows = await collectRows(createRunner(false), process.cwd(), !values["no-pr"]);
  if (values.json) {
    outJson(rows);
    return 0;
  }
  out(["RAMA", "OWNER", "↑/↓", "SUCIO", "ÚLTIMO COMMIT", "PUERTO", "EDAD", "PR"].join("\t"));
  for (const r of rows)
    out(
      [
        r.branch,
        r.owner,
        `${r.ahead}/${r.behind}`,
        r.dirty ? "sí" : "no",
        r.lastCommit,
        r.port ?? "-",
        r.age,
        r.pr ?? "-",
      ].join("\t"),
    );
  return 0;
}
