import { existsSync, readFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { claudeAvailable, runClaudeInteractive, skillPrompt } from "../core/claude.ts";
import { claudeSandbox } from "../core/claude-sandbox.ts";
import { load } from "../core/context.ts";
import { log, out, outJson } from "../core/log.ts";
import { expandHome } from "../core/paths.ts";
import { loadHooks, type ModuleCtx, osName } from "../core/plan.ts";
import { isInteractive } from "../core/prompt.ts";
import { createRunner, type Runner } from "../core/runners/shell.ts";
import { signingFindings } from "../core/signing.ts";
import { loadWorktrees } from "../core/state.ts";

export interface Finding {
  name: string;
  status: "ok" | "warn" | "fail" | "skip";
  detail?: string;
}

export async function systemChecks(runner: Runner, platform: string): Promise<Finding[]> {
  const f: Finding[] = [];
  if (platform === "darwin") {
    const mp = await runner.query("memory_pressure", ["-Q"]);
    const free = /free percentage:\s*(\d+)%/.exec(mp.stdout)?.[1];
    f.push(
      mp.code !== 0 || !free
        ? { name: "memoria", status: "skip", detail: "memory_pressure no disponible" }
        : { name: "memoria", status: Number(free) < 15 ? "warn" : "ok", detail: `${free}% libre` },
    );
    const df = await runner.query("df", ["-h", "/System/Volumes/Data"]);
    const pct = /(\d+)%/.exec(df.stdout.split("\n")[1] ?? "")?.[1];
    f.push(
      pct
        ? { name: "disco", status: Number(pct) > 90 ? "warn" : "ok", detail: `${pct}% usado` }
        : { name: "disco", status: "skip", detail: "df sin datos" },
    );
    const caches = [
      "~/Library/Caches",
      "~/Library/pnpm/store",
      "~/.local/share/pnpm",
      "~/.orbstack",
      "~/.colima",
    ]
      .map(expandHome)
      .filter(existsSync);
    for (const c of caches) {
      const du = await runner.query("du", ["-sk", c], { timeoutMs: 20000 });
      const kb = Number(du.stdout.split(/\s/)[0]);
      if (kb)
        f.push({
          name: `caché ${c}`,
          status: kb > 20 * 1024 * 1024 ? "warn" : "ok",
          detail: `${(kb / 1024 / 1024).toFixed(1)} GB`,
        });
    }
  } else f.push({ name: "salud de macOS", status: "skip", detail: `no aplica a ${platform}` });
  const orphans = (await loadWorktrees()).filter((w) => !existsSync(w.path));
  f.push({
    name: "worktrees huérfanos",
    status: orphans.length ? "warn" : "ok",
    detail: orphans.length ? `${orphans.length} (usa: forja wt prune)` : undefined,
  });
  return f;
}

/** El sandbox que hay en ~/.claude/settings.json debe coincidir con el que piden host y perfil. */
export function sandboxFinding(
  wanted: boolean,
  settingsPath = expandHome("~/.claude/settings.json"),
): Finding {
  const name = "claude: sandbox interactivo";
  let actual: unknown;
  try {
    actual = (JSON.parse(readFileSync(settingsPath, "utf8")) as { sandbox?: { enabled?: unknown } })
      .sandbox?.enabled;
  } catch {
    return { name, status: "skip", detail: "sin ~/.claude/settings.json legible" };
  }
  const now = actual === true;
  return now === wanted
    ? {
        name,
        status: "ok",
        detail: wanted ? "activo" : "desactivado (wt night lo exige igualmente)",
      }
    : {
        name,
        status: "warn",
        detail: `settings.json lo tiene ${now ? "activo" : "desactivado"} y el host/perfil piden ${wanted ? "activo" : "desactivado"} (forja apply agents)`,
      };
}

export async function collectFindings(): Promise<Finding[]> {
  const findings: Finding[] = [];
  let loaded: Awaited<ReturnType<typeof load>> | null = null;
  try {
    loaded = await load({ dryRun: true });
  } catch (e) {
    findings.push({ name: "perfil", status: "warn", detail: (e as Error).message });
  }
  if (loaded) {
    const { ctx, all, order } = loaded;
    findings.push(sandboxFinding(claudeSandbox(ctx.host, ctx.profile, ctx.enabled).enabled));
    const agentKey = ctx.profile.signing.agent_key;
    if (agentKey) findings.push(...(await signingFindings(ctx.runner, agentKey, ctx.platform)));
    for (const name of order) {
      const m = all.get(name);
      if (!m || (m.os.length && !m.os.includes(osName(ctx.platform)))) continue;
      for (const cmd of m.checks) {
        const r = await ctx.runner.query("sh", ["-c", cmd], { timeoutMs: 15000 });
        findings.push({
          name: `${name}: ${cmd}`,
          status: r.code === 0 ? "ok" : "fail",
          detail: r.code === 0 ? undefined : (r.stderr || r.stdout).trim().split("\n")[0],
        });
      }
      for (const c of (await (await loadHooks(m)).check?.({ ...ctx, module: m } as ModuleCtx)) ??
        [])
        findings.push({
          name: `${name}: ${c.name}`,
          status: c.ok ? "ok" : c.warn ? "warn" : "fail",
          detail: c.detail,
        });
    }
  }
  findings.push(
    ...(await systemChecks(loaded?.ctx.runner ?? createRunner(true), process.platform)),
  );
  return findings;
}

export async function doctorCommand(argv: string[]): Promise<number> {
  const { values } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: { json: { type: "boolean" }, fix: { type: "boolean" } },
  });
  const findings = await collectFindings();
  const failed = findings.some((x) => x.status === "fail");
  if (values.json) outJson({ ok: !failed, findings });
  else {
    const icon = { ok: "✔", warn: "!", fail: "✖", skip: "–" } as const;
    for (const x of findings) out(`${icon[x.status]} ${x.name}${x.detail ? ` — ${x.detail}` : ""}`);
  }
  if (values.fix) {
    const runner = createRunner(true);
    if (!isInteractive() || !(await claudeAvailable(runner))) {
      log.error("doctor --fix necesita Claude Code y una terminal interactiva.");
      return 1;
    }
    const relevant = findings.filter((x) => x.status === "warn" || x.status === "fail");
    if (!relevant.length) {
      log.ok("Nada que arreglar.");
      return 0;
    }
    log.step(
      "Diagnóstico con Claude Code (skill mac-doctor): cada corrección se confirma en la sesión.",
    );
    return runClaudeInteractive(
      skillPrompt(
        "mac-doctor",
        "Prioriza estos hallazgos de forja doctor y propón correcciones reversibles, una a una.",
        JSON.stringify(relevant, null, 2),
      ),
    );
  }
  return failed ? 1 : 0;
}
