// Lógica pura de forja-status: sin imports ni `$`, la prueban `node --test` (cli/test) y el mod.

export type Snapshot = {
  branch: string | null;
  port: number | null;
  drift: number | null;
  colima: "up" | "down" | null;
  awake: "on" | "orphan" | "off" | null;
  battery: number | null;
  onAc: boolean | null;
};

export type Finding = { name: string; status: "ok" | "warn" | "fail" | "skip"; detail?: string };

export const EMPTY: Snapshot = {
  branch: null,
  port: null,
  drift: null,
  colima: null,
  awake: null,
  battery: null,
  onAc: null,
};

const LOW_BATTERY_PERCENT = 20;

function parse(stdout: string): unknown {
  try {
    return JSON.parse(stdout);
  } catch {
    return undefined;
  }
}

/** `forja drift --json` → número de módulos con desvío. */
export function parseDrift(stdout: string): number | null {
  const out = parse(stdout) as
    | { modules?: { pending?: unknown[]; failedChecks?: unknown[] }[] }
    | undefined;
  if (!Array.isArray(out?.modules)) return null;
  return out.modules.filter((m) => (m.pending?.length ?? 0) + (m.failedChecks?.length ?? 0) > 0)
    .length;
}

/** `forja wt ls --json --no-pr` → puerto del worktree que contiene `cwd`. */
export function parseWorktreePort(stdout: string, cwd: string): number | null {
  const rows = parse(stdout);
  if (!Array.isArray(rows)) return null;
  const mine = (rows as { path?: string; port?: number | null }[])
    .filter((r) => typeof r.path === "string" && (cwd === r.path || cwd.startsWith(`${r.path}/`)))
    .sort((a, b) => (b.path?.length ?? 0) - (a.path?.length ?? 0))[0];
  return typeof mine?.port === "number" ? mine.port : null;
}

/** `forja awake status --json` → modo tapa y batería. */
export function parseAwake(stdout: string): Pick<Snapshot, "awake" | "battery" | "onAc"> {
  const s = parse(stdout) as
    | {
        sleepDisabled?: boolean;
        orphan?: boolean;
        battery?: { percent?: number | null; ac?: boolean };
      }
    | undefined;
  if (!s) return { awake: null, battery: null, onAc: null };
  return {
    awake: s.sleepDisabled ? (s.orphan ? "orphan" : "on") : "off",
    battery: typeof s.battery?.percent === "number" ? s.battery.percent : null,
    onAc: typeof s.battery?.ac === "boolean" ? s.battery.ac : null,
  };
}

/** `forja doctor --json` → hallazgos. */
export function parseDoctor(stdout: string): Finding[] | null {
  const out = parse(stdout) as { findings?: Finding[] } | undefined;
  return Array.isArray(out?.findings) ? out.findings : null;
}

/** Segmentos de la banda; solo lo que aporta (sin ruido cuando todo va bien). */
export function bandSegments(s: Snapshot): string[] {
  const seg: string[] = [];
  if (s.branch) seg.push(`⎇ ${s.branch}${s.port ? ` :${s.port}` : ""}`);
  if (s.drift) seg.push(`drift ${s.drift}`);
  if (s.colima) seg.push(`colima ${s.colima === "up" ? "▲" : "▼"}`);
  if (s.awake === "on") seg.push("awake ●");
  if (s.awake === "orphan") seg.push("awake huérfano ⚠");
  if (s.battery !== null && s.onAc === false)
    seg.push(`${s.battery < LOW_BATTERY_PERCENT ? "🪫" : "🔋"} ${s.battery} %`);
  return seg;
}

export const ICON: Record<Finding["status"], string> = { ok: "✔", warn: "!", fail: "✖", skip: "·" };

/** Prompt para mac-doctor con los hallazgos que no están bien. */
export function doctorPrompt(findings: readonly Finding[]): string {
  const bad = findings.filter((f) => f.status === "fail" || f.status === "warn");
  const lines = bad.map((f) => `- [${f.status}] ${f.name}${f.detail ? `: ${f.detail}` : ""}`);
  return [
    "Usa la skill mac-doctor con estos hallazgos de `forja doctor`:",
    ...(lines.length ? lines : ["- (sin fallos ni avisos)"]),
  ].join("\n");
}

/** `/forja <sub>` */
export function parseCommand(args: string): "status" | "doctor" | "refresh" {
  const w = args.trim().toLowerCase();
  return w === "doctor" || w === "refresh" ? w : "status";
}
