import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { runChecks, type SandboxFinding } from "../commands/sandbox-check.ts";
import { claudeSandbox } from "../core/claude-sandbox.ts";
import { ensureWorktreeIdentity } from "../core/git-identity.ts";
import { enabledModuleNames, loadHost } from "../core/hosts.ts";
import { log, out } from "../core/log.ts";
import { LOOPER_BIN, LOOPER_ENGINES, type LooperEngine } from "../core/looper.ts";
import { expandHome, profilePath, repoRoot } from "../core/paths.ts";
import { battery, withAwake } from "../core/power.ts";
import { loadProfile, type Profile } from "../core/profile.ts";
import { commandExists, createRunner, type Runner } from "../core/runners/shell.ts";
import { logsDir } from "../core/state.ts";
import { mainRepoRoot } from "./git.ts";
import { createWorktree } from "./new.ts";
import {
  insidePreflight,
  nightSettings,
  nightSettingsPath,
  writeNightSettings,
} from "./night-sandbox.ts";
import { findWorktree } from "./rm.ts";

export interface NightOpts {
  changes: string[];
  engine: LooperEngine;
  branch: string;
  fullGate: boolean;
  allowBattery: boolean;
  hosts: string[];
  /** Sesiones del agente dentro del sandbox de Claude Code (por defecto; `--no-sandbox` lo quita). */
  sandbox: boolean;
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
export function cascadeArgs(
  worktree: string,
  o: NightOpts,
  logDir: string,
  settingsPath?: string,
): string[] {
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
    ...(settingsPath ? ["--settings", settingsPath] : []),
  ];
}

/** Líneas finales de la salida del spec-gate que se muestran al fallar. */
const GATE_DETAIL_LINES = 3;

/** Gate de specs antes de lanzar: cualquier código distinto de 0 aborta la noche. */
export function specGateArgs(changes: string[]): string[] {
  return ["spec-gate", "check", "--stage", "review", "--changes", changes.join(",")];
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
  if (o.sandbox) {
    p.push({
      name: "sandbox: motor claude",
      ok: o.engine === "claude",
      detail: `el sandbox solo se aplica al motor claude; para ${o.engine} usa --no-sandbox (sin protección)`,
    });
    // Una versión sin --settings ignoraría el flag y el loop correría sin sandbox.
    const help = await runner.query(LOOPER_BIN, ["--help"]);
    p.push({
      name: `${LOOPER_BIN} acepta --settings`,
      ok: help.stdout.includes("--settings"),
      detail: "versión antigua: forja apply looper",
    });
  }
  const missing = missingChanges(repo, o.changes);
  p.push({
    name: "changes de OpenSpec",
    ok: o.changes.length > 0 && missing.length === 0,
    detail: o.changes.length ? `no existen: ${missing.join(", ")}` : "usa --changes a,b",
  });
  // Solo si los changes existen: si no, el fallo ya está dicho arriba.
  if (o.changes.length > 0 && missing.length === 0) {
    const gate = await runner.query(LOOPER_BIN, specGateArgs(o.changes), { cwd: repo });
    p.push({
      name: "spec-gate (review)",
      ok: gate.code === 0,
      detail: `salió con ${gate.code}: ${(gate.stderr || gate.stdout).trim().split("\n").slice(-GATE_DETAIL_LINES).join(" | ")}`,
    });
  }
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

/** Settings del loop a partir del host, el perfil y sus módulos (lo mismo que el settings global). */
async function nightSandboxSettings(
  profile: Profile | null,
  hosts: string[],
): Promise<Record<string, unknown>> {
  const empty = { enabled: true, allowed_domains: [], allow_read: [], allow_write: [] };
  if (!profile) return nightSettings({ base: empty, hosts, docker: false });
  const host = await loadHost(repoRoot(), profile.host);
  const enabled = enabledModuleNames(host, profile);
  return nightSettings({
    base: claudeSandbox(host, profile, enabled),
    hosts,
    docker: enabled.includes("containers"),
  });
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
  "uso: forja wt night --changes a,b [--engine claude|opencode|antigravity] [--branch nombre] [--full-gate] [--allow-battery] [--host h]… [--no-sandbox] [--dry-run]";

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
      "no-sandbox": { type: "boolean" },
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
    sandbox: values["no-sandbox"] !== true,
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
          profile,
        })
      ).path;
  // Idempotente: un worktree reutilizado también recupera identidad y firma.
  if (existing) {
    const ensured = await ensureWorktreeIdentity(runner, repo, path, "night", profile);
    for (const w of ensured.warnings) log.warn(w);
  }
  log.info(`worktree: ${path}`);

  // 3. Comprobaciones: el arnés (fuera del sandbox: commits y firma) y, con
  //    el mismo settings que usará el loop, el agente dentro del sandbox.
  const show = (title: string, xs: SandboxFinding[]) => {
    out(`\n${title}`);
    for (const c of xs)
      out(
        `${c.status === "ok" ? "✔" : c.status === "skip" ? "–" : "✖"} ${c.name}${c.detail && c.status !== "ok" ? ` — ${c.detail}` : ""}`,
      );
    for (const c of xs) if (c.status === "fail" && c.fix) out(`    → ${c.name}: ${c.fix}`);
  };
  const checks = await runChecks(runner, {
    cwd: path,
    hosts: [],
    keyPath: profile?.signing.agent_key ? expandHome(profile.signing.agent_key) : undefined,
  });
  show("Arnés (fuera del sandbox):", checks);

  let settingsPath: string | undefined;
  if (o.sandbox) {
    settingsPath = nightSettingsPath(o.branch);
    writeNightSettings(settingsPath, await nightSandboxSettings(profile, o.hosts));
    log.info(`settings del loop: ${settingsPath}`);
    const inside = await insidePreflight(runner, path, settingsPath, o.hosts);
    show("Agente (dentro del sandbox, comprobado con claude -p):", inside);
    checks.push(...inside);
  } else log.warn("--no-sandbox: las sesiones del agente correrán SIN sandbox");
  if (checks.some((c) => c.status === "fail")) return 1;

  const logDir = join(logsDir(), "night");
  const args = cascadeArgs(path, o, logDir, settingsPath);
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
