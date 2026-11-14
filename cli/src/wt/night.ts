import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { runChecks } from "../commands/sandbox-check.ts";
import { log, out } from "../core/log.ts";
import { LOOPER_BIN, LOOPER_ENGINES, type LooperEngine } from "../core/looper.ts";
import { expandHome, profilePath } from "../core/paths.ts";
import { battery, withAwake } from "../core/power.ts";
import { loadProfile, type Profile } from "../core/profile.ts";
import { commandExists, createRunner, type Runner } from "../core/runners/shell.ts";
import { logsDir } from "../core/state.ts";
import { mainRepoRoot } from "./git.ts";
import { createWorktree } from "./new.ts";
import { findWorktree } from "./rm.ts";

export interface NightOpts {
  changes: string[];
  engine: LooperEngine;
  branch: string;
  fullGate: boolean;
  allowBattery: boolean;
  hosts: string[];
}

export interface Preflight {
  name: string;
  ok: boolean;
  detail?: string;
}

/** Changes de OpenSpec que no existen en el repo (`openspec/changes/<nombre>/tasks.md`). */
export function missingChanges(repo: string, changes: string[]): string[] {
  return changes.filter((c) => !existsSync(join(repo, "openspec", "changes", c, "tasks.md")));
}

/** Argumentos de openspec-cascade. Los logs van a ~/.local/state/forja/logs/night. */
export function cascadeArgs(worktree: string, o: NightOpts, logDir: string): string[] {
  return [
    "--repo",
    worktree,
    "--changes",
    o.changes.join(","),
    "--engine",
    o.engine,
    "--log-dir",
    logDir,
    ...(o.fullGate ? ["--full-gate"] : []),
  ];
}

/** Rama por defecto: agent/night-<primer change>-<AAAAMMDD>. */
export function defaultBranch(changes: string[], now = new Date()): string {
  const d = now.toISOString().slice(0, 10).replaceAll("-", "");
  return `night-${changes[0] ?? "run"}-${d}`;
}

/** Comprobaciones antes de crear nada. Todas deben pasar. */
export async function preflight(
  runner: Runner,
  repo: string,
  o: NightOpts,
  platform = process.platform,
): Promise<Preflight[]> {
  const p: Preflight[] = [];
  p.push({
    name: `${LOOPER_BIN} instalado`,
    ok: await commandExists(runner, LOOPER_BIN),
    detail: "forja apply looper",
  });
  const missing = missingChanges(repo, o.changes);
  p.push({
    name: "changes de OpenSpec",
    ok: o.changes.length > 0 && missing.length === 0,
    detail: o.changes.length ? `no existen: ${missing.join(", ")}` : "usa --changes a,b",
  });
  if (platform === "darwin") {
    const b = await battery(runner);
    p.push({
      name: "corriente conectada",
      ok: b.ac || o.allowBattery,
      detail: `batería al ${b.percent ?? "?"} %: conecta el cargador o usa --allow-battery`,
    });
  }
  return p.map((x) => (x.ok ? { name: x.name, ok: true } : x));
}

async function notify(profile: Profile | null, message: string): Promise<void> {
  const file = expandHome(profile?.notify.ntfy_topic_file ?? "~/.config/ntfy/topic");
  if (!existsSync(file)) return;
  const topic = readFileSync(file, "utf8").trim();
  await createRunner(false).exec("curl", [
    "-s",
    "-H",
    "Title: forja wt night",
    "-d",
    message,
    `https://ntfy.sh/${topic}`,
  ]);
}

const HELP =
  "uso: forja wt night --changes a,b [--engine claude|opencode|antigravity] [--branch nombre] [--full-gate] [--allow-battery] [--host h]… [--dry-run]";

export async function wtNight(argv: string[]): Promise<number> {
  const { values } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      changes: { type: "string" },
      engine: { type: "string" },
      branch: { type: "string" },
      "full-gate": { type: "boolean" },
      "allow-battery": { type: "boolean" },
      host: { type: "string", multiple: true },
      "dry-run": { type: "boolean" },
    },
  });
  const engine = (values.engine ?? "claude") as LooperEngine;
  if (!LOOPER_ENGINES.includes(engine)) {
    log.error(`--engine inválido: ${engine}\n${HELP}`);
    return 1;
  }
  const changes = (values.changes ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const o: NightOpts = {
    changes,
    engine,
    branch: values.branch ?? defaultBranch(changes),
    fullGate: values["full-gate"] === true,
    allowBattery: values["allow-battery"] === true,
    hosts: values.host ?? ["github.com"],
  };
  const runner = createRunner(false);
  const repo = await mainRepoRoot(runner, process.cwd());
  const profile = await loadProfile(profilePath()).catch(() => null);

  // 1. Comprobaciones previas: nada se crea si alguna falla.
  const pre = await preflight(runner, repo, o);
  for (const x of pre) out(`${x.ok ? "✔" : "✖"} ${x.name}${x.detail ? ` — ${x.detail}` : ""}`);
  if (pre.some((x) => !x.ok)) return 1;

  // 2. Worktree de agente (rama agent/…, firma ssh por worktree) o reutiliza el existente.
  const existing = await findWorktree(runner, repo, `agent/${o.branch}`);
  const path = existing
    ? existing.path
    : (
        await createWorktree(runner, repo, {
          branch: o.branch,
          agent: "night",
          signingKey: profile?.signing.agent_key,
        })
      ).path;
  log.info(`worktree: ${path}`);

  // 3. Comprobación del entorno del loop (git, escritura, firma, red).
  const checks = await runChecks(runner, {
    cwd: path,
    hosts: o.hosts,
    keyPath: profile?.signing.agent_key ? expandHome(profile.signing.agent_key) : undefined,
  });
  for (const c of checks)
    out(
      `${c.status === "ok" ? "✔" : c.status === "skip" ? "–" : "✖"} ${c.name}${c.fix ? ` — ${c.fix}` : ""}`,
    );
  if (checks.some((c) => c.status === "fail")) return 1;

  const logDir = join(logsDir(), "night");
  const args = cascadeArgs(path, o, logDir);
  if (values["dry-run"]) {
    out(`\n${LOOPER_BIN} ${args.join(" ")} --dry-run`);
    const r = await runner.exec(LOOPER_BIN, [...args, "--dry-run"], { stream: true });
    return r.code;
  }

  // 4. Loop con el modo tapa activo; se quita siempre al salir.
  const start = Date.now();
  const run = () => runner.exec(LOOPER_BIN, args, { stream: true });
  const r =
    process.platform === "darwin"
      ? await withAwake(runner, `wt night ${o.branch}`, run)
      : await run();
  const mins = Math.round((Date.now() - start) / 60000);
  const msg =
    r.code === 0
      ? `✔ ${o.branch}: ${o.changes.join(", ")} terminado en ${mins} min. Revisa y abre la PR (no se hizo push).`
      : `✖ ${o.branch}: openspec-cascade salió con ${r.code} tras ${mins} min. Logs: ${logDir}`;
  out(`\n${msg}`);
  await notify(profile, msg);
  return r.code === 0 ? 0 : 1;
}
