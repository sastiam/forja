import { existsSync } from "node:fs";
import { join, normalize } from "node:path";
import { parseArgs } from "node:util";
import { ensureWorktreeIdentity } from "../core/git-identity.ts";
import { log, out } from "../core/log.ts";
import { profilePath } from "../core/paths.ts";
import { loadProfile, type Profile } from "../core/profile.ts";
import { createRunner, type Runner } from "../core/runners/shell.ts";
import { type Owner, upsertWorktree, type WorktreeRecord } from "../core/state.ts";
import { renderEnv } from "./env.ts";
import { defaultBase, git, gitOk, mainRepoRoot, refExists, worktreePath } from "./git.ts";
import { portFor, slugify } from "./ports.ts";
import { isSecretPath, loadProject, loadWorktreeInclude } from "./project.ts";

export interface NewOptions {
  branch: string;
  base?: string;
  agent?: Owner;
  fetch?: boolean;
  /** Perfil local: de él salen la identidad por repo ([git]) y la clave de agentes ([signing]). */
  profile?: Pick<Profile, "git" | "signing"> | null;
}

/** Crea un worktree. Los mensajes van a stderr; devuelve el registro. */
export async function createWorktree(
  runner: Runner,
  cwd: string,
  o: NewOptions,
): Promise<WorktreeRecord> {
  const repo = await mainRepoRoot(runner, cwd);
  const slug = slugify(o.branch);
  if (!slug) throw new Error(`nombre de rama inválido: ${o.branch}`);
  const owner: Owner = o.agent ?? "human";
  const branch =
    owner !== "human" && !o.branch.startsWith("agent/") ? `agent/${o.branch}` : o.branch;
  const path = worktreePath(repo, slugify(branch));
  if (existsSync(path)) throw new Error(`el worktree ya existe: ${path}`);

  if (o.fetch !== false && (await gitOk(runner, repo, ["remote"])).length) {
    log.step("git fetch");
    const f = await git(runner, repo, ["fetch", "--prune"], true);
    if (f.code !== 0) log.warn(`fetch falló (sigo sin red): ${f.stderr.trim()}`);
  }
  const base = o.base ?? (await defaultBase(runner, repo));
  log.step(`git worktree add ${path}`);
  if (await refExists(runner, repo, branch))
    await gitOk(runner, repo, ["worktree", "add", path, branch], true);
  else await gitOk(runner, repo, ["worktree", "add", "-b", branch, path, base], true);

  const ensured = await ensureWorktreeIdentity(runner, repo, path, owner, o.profile);
  if (ensured.identity) log.step(`identidad de git del repo: ${ensured.identity.email}`);
  if (ensured.agentSigned) log.step("firma ssh de agentes (solo este worktree)");
  for (const w of ensured.warnings) log.warn(w);

  const project = await loadProject(repo);
  const include = [...(await loadWorktreeInclude(repo)), ...project.copy];
  for (const rel of new Set(include)) {
    const clean = normalize(rel);
    if (clean.startsWith("..") || clean.startsWith("/")) {
      log.warn(`ruta fuera del repo ignorada: ${rel}`);
      continue;
    }
    if (isSecretPath(clean)) {
      log.warn(`no se copia ${clean} (secreto): usa .env.tpl con op:// y 'op run'`);
      continue;
    }
    if (existsSync(join(repo, clean))) await runner.copy(join(repo, clean), join(path, clean));
  }

  const port = portFor(slugify(branch), project.portBase);
  await runner.writeFile(
    join(path, ".env.worktree"),
    renderEnv({
      name: slugify(branch),
      port,
      composeProject: slugify(branch)
        .toLowerCase()
        .replace(/[^a-z0-9]/g, ""),
      floci: project.floci,
    }),
  );
  for (const cmd of project.setup) {
    log.step(`setup: ${cmd}`);
    const r = await runner.exec("sh", ["-c", cmd], { cwd: path, stream: true });
    if (r.code !== 0) log.warn(`setup falló (${r.code}): ${cmd}`);
  }
  const rec: WorktreeRecord = {
    path,
    repo,
    branch,
    base,
    owner,
    created_at: new Date().toISOString(),
    port,
  };
  await upsertWorktree(rec);
  return rec;
}

export async function wtNew(argv: string[]): Promise<number> {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      base: { type: "string" },
      agent: { type: "string" },
      "print-path": { type: "boolean" },
      open: { type: "boolean" },
      "no-fetch": { type: "boolean" },
    },
  });
  const branch = positionals[0];
  if (!branch) {
    log.error(
      "uso: forja wt new <rama> [--base origin/main] [--agent claude|opencode|hermes] [--print-path] [--open]",
    );
    return 1;
  }
  const agent = values.agent;
  if (agent && !["claude", "opencode", "hermes"].includes(agent))
    throw new Error(`--agent inválido: ${agent}`);
  const runner = createRunner(false);
  const profile = await loadProfile(profilePath()).catch(() => null);
  const rec = await createWorktree(runner, process.cwd(), {
    profile,
    branch,
    base: values.base,
    agent: agent as Owner | undefined,
    fetch: !values["no-fetch"],
  });
  if (values.open) await runner.exec("zed", [rec.path]);
  if (values["print-path"]) out(rec.path);
  else {
    log.ok(`Worktree listo: ${rec.path} (rama ${rec.branch}, puerto ${rec.port})`);
    log.info(
      "Arranca con secretos: op run --env-file=.env.tpl -- pnpm dev   (si el proyecto tiene .env.tpl)",
    );
  }
  return 0;
}
