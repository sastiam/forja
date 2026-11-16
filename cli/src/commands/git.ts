import { parseArgs } from "node:util";
import {
  applyRepoIdentity,
  ensureWorktreeIdentity,
  identityFor,
  ownerOf,
} from "../core/git-identity.ts";
import { log, out } from "../core/log.ts";
import { expandHome, profilePath } from "../core/paths.ts";
import { loadProfile } from "../core/profile.ts";
import { createRunner, type Runner } from "../core/runners/shell.ts";
import { loadWorktrees } from "../core/state.ts";
import { git, listWorktrees, mainRepoRoot } from "../wt/git.ts";

const HELP = `forja git identity — identidad y firma de git por repo

  apply [--repo ruta] [--dry-run]   Aplica la identidad del perfil ([git.repos]) al repo y a sus worktrees
  check [--repo ruta]               Comprueba email y clave efectivos de cada worktree (sale con 2 si no cuadran)

Sin entrada en [git.repos] manda la config global (la laboral). Ver docs/guide/firma.md.`;

async function effective(runner: Runner, cwd: string, key: string): Promise<string> {
  const r = await git(runner, cwd, ["config", "--get", key]);
  return r.code === 0 ? r.stdout.trim() : "";
}

export async function gitCommand(argv: string[]): Promise<number> {
  const [group, sub, ...rest] = argv;
  if (group !== "identity" || (sub !== "apply" && sub !== "check")) {
    out(HELP);
    return group === undefined || group === "--help" || group === "help" ? 0 : 1;
  }
  const { values } = parseArgs({
    args: rest,
    options: { repo: { type: "string" }, "dry-run": { type: "boolean" } },
  });
  const runner = createRunner(values["dry-run"] === true);
  const profile = await loadProfile(profilePath()).catch(() => null);
  const repo = await mainRepoRoot(runner, values.repo ? expandHome(values.repo) : process.cwd());
  const identity = identityFor(profile, repo);
  if (!identity) {
    log.info(`${repo}: sin entrada en [git.repos]; manda la identidad global`);
    return 0;
  }
  const records = await loadWorktrees();
  const trees = await listWorktrees(runner, repo);

  if (sub === "apply") {
    await applyRepoIdentity(runner, repo, identity);
    log.ok(`${repo}: ${identity.email}`);
    for (const wt of trees.filter((t) => t.path !== repo && !t.bare)) {
      const owner = ownerOf(wt.path, wt.branch, records);
      const r = await ensureWorktreeIdentity(runner, repo, wt.path, owner, profile);
      for (const w of r.warnings) log.warn(`${wt.path}: ${w}`);
      log.ok(`${wt.path} (${owner}${r.agentSigned ? ", firma de agente" : ""})`);
    }
    return 0;
  }

  let bad = 0;
  for (const wt of trees.filter((t) => !t.bare)) {
    const email = await effective(runner, wt.path, "user.email");
    const key = await effective(runner, wt.path, "user.signingkey");
    const owner = ownerOf(wt.path, wt.branch, records);
    const agentKey = identity.agent_key ?? profile?.signing.agent_key;
    const wantKey = expandHome(owner !== "human" && agentKey ? agentKey : identity.signing_key);
    const ok = email === identity.email && key === wantKey;
    if (!ok) bad++;
    out(`${ok ? "✔" : "✖"} ${wt.path} — ${email || "(sin email)"} · ${key || "(sin clave)"}`);
  }
  return bad ? 2 : 0;
}
