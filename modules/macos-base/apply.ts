import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { log } from "../../cli/src/core/log.ts";
import { expandHome, stateDir } from "../../cli/src/core/paths.ts";
import type { Action, CheckResult, ModuleCtx } from "../../cli/src/core/plan.ts";
import { awakeStatus, SUDOERS_FILE, sudoersRule } from "../../cli/src/core/power.ts";
import type { Runner } from "../../cli/src/core/runners/shell.ts";
import { loadWorktrees } from "../../cli/src/core/state.ts";

const SUDO_LOCAL = "/etc/pam.d/sudo_local";
const TOUCH_ID = "auth       sufficient     pam_tid.so\n";
const pmsetBackup = (): string => join(stateDir(), "pmset-backup.txt");

const GUIDES = [
  "Límite de carga al 80 % (Tahoe 26.4+): Ajustes → Batería → Carga.",
  "Spotlight: excluye ~/code en Ajustes → Siri y Spotlight → Privacidad.",
  "Reducir transparencia: Ajustes → Accesibilidad → Pantalla.",
];

/**
 * Perfil de energía para un Pro/Max casi siempre enchufado: con corriente no se
 * duerme y va a máximo rendimiento; con batería, bajo consumo. powermode:
 * 0 automático, 1 bajo consumo, 2 alto rendimiento (solo algunos modelos).
 * VERIFICAR en el Mac: `pmset -g cap` lista `powermode` en este modelo.
 */
export const POWER = {
  ac: { sleep: "0", displaysleep: "15", powermode: "2" },
  battery: { powermode: "1" },
} as const;

export interface PmsetCustom {
  ac: Record<string, string>;
  battery: Record<string, string>;
}

/** `pmset -g custom`: secciones "Battery Power:" y "AC Power:" con pares clave/valor. */
export function parsePmsetCustom(text: string): PmsetCustom {
  const out: PmsetCustom = { ac: {}, battery: {} };
  let cur: Record<string, string> | null = null;
  for (const line of text.split("\n")) {
    if (/^Battery Power:/.test(line)) cur = out.battery;
    else if (/^AC Power:/.test(line)) cur = out.ac;
    else if (/^\S/.test(line)) cur = null;
    else {
      const m = /^\s+(\S+)\s+(\S+)/.exec(line);
      if (cur && m?.[1] && m[2]) cur[m[1]] = m[2];
    }
  }
  return out;
}

/** Claves de `want` cuyo valor actual difiere. */
export function powerDiff(cur: PmsetCustom, supportsPowermode: boolean) {
  const pick = (want: Record<string, string>, have: Record<string, string>) =>
    Object.entries(want).filter(
      ([k, v]) => (k !== "powermode" || supportsPowermode) && have[k] !== v,
    );
  return { ac: pick(POWER.ac, cur.ac), battery: pick(POWER.battery, cur.battery) };
}

/** Argumentos de pmset para devolver `keys` a los valores de la copia de seguridad. */
export function restoreArgs(backup: PmsetCustom): string[][] {
  const args: string[][] = [];
  for (const [flag, want, have] of [
    ["-c", POWER.ac, backup.ac],
    ["-b", POWER.battery, backup.battery],
  ] as const) {
    const kv = Object.keys(want).flatMap((k) => (have[k] !== undefined ? [k, have[k]] : []));
    if (kv.length) args.push([flag, ...kv]);
  }
  return args;
}

async function touchIdOn(ctx: ModuleCtx): Promise<boolean> {
  return (await ctx.runner.query("grep", ["-q", "pam_tid.so", SUDO_LOCAL])).code === 0;
}

async function supportsPowermode(runner: Runner): Promise<boolean> {
  return /\bpowermode\b/.test((await runner.query("pmset", ["-g", "cap"])).stdout);
}

async function currentPower(runner: Runner) {
  const cur = parsePmsetCustom((await runner.query("pmset", ["-g", "custom"])).stdout);
  return powerDiff(cur, await supportsPowermode(runner));
}

/** Directorios pesados y regenerables que Time Machine no debe copiar. */
async function backupExclusions(): Promise<string[]> {
  const dirs = new Set<string>([expandHome("~/.colima")]);
  for (const w of await loadWorktrees()) {
    dirs.add(join(w.repo, "node_modules"));
    dirs.add(dirname(w.path)); // <repo>.wt: ramas que también están en el remoto
  }
  return [...dirs].filter(existsSync);
}

export async function plan(ctx: ModuleCtx): Promise<Action[]> {
  const power = await currentPower(ctx.runner);
  const fmt = (kv: [string, string][]) => kv.map(([k, v]) => `${k}=${v}`).join(" ");
  return [
    {
      kind: "step",
      description: `Touch ID para sudo (${SUDO_LOCAL})`,
      pending: !(await touchIdOn(ctx)),
    },
    {
      kind: "step",
      description: `energía con corriente: ${fmt(power.ac) || "ok"} · con batería: ${fmt(power.battery) || "ok"} (backup de pmset)`,
      pending: power.ac.length + power.battery.length > 0,
    },
    {
      kind: "step",
      description: `regla sudo para forja awake (${SUDOERS_FILE}: solo pmset disablesleep/sleepnow)`,
      pending: !existsSync(SUDOERS_FILE),
    },
    {
      kind: "step",
      description: "Time Machine: excluir ~/.colima, node_modules y carpetas de worktrees",
      pending: false,
    },
    ...GUIDES.map((g): Action => ({ kind: "guide", description: g, pending: false })),
  ];
}

export async function apply(ctx: ModuleCtx): Promise<void> {
  const { runner } = ctx;
  if (!(await touchIdOn(ctx)))
    await runner.exec(
      "sh",
      ["-c", `printf '%s' '${TOUCH_ID}' | sudo tee ${SUDO_LOCAL} >/dev/null`],
      { stream: true },
    );

  const power = await currentPower(runner);
  if (power.ac.length + power.battery.length) {
    if (!existsSync(pmsetBackup()))
      await runner.writeFile(pmsetBackup(), (await runner.query("pmset", ["-g", "custom"])).stdout);
    for (const [flag, kv] of [
      ["-c", power.ac],
      ["-b", power.battery],
    ] as const)
      if (kv.length) {
        const r = await runner.exec("sudo", ["pmset", flag, ...kv.flat()], { stream: true });
        if (r.code !== 0)
          log.warn(`pmset ${flag} ${kv.flat().join(" ")} falló (¿modelo sin powermode?)`);
      }
  }

  if (!existsSync(SUDOERS_FILE)) {
    // Se valida con visudo antes de instalar: un sudoers roto bloquea sudo.
    const tmp = join(stateDir(), "forja-awake.sudoers");
    await runner.writeFile(tmp, sudoersRule(), 0o600);
    const ok = await runner.exec("sudo", ["visudo", "-cf", tmp]);
    if (ok.code !== 0) throw new Error("la regla sudo de forja awake no pasa visudo -c");
    await runner.exec("sudo", [
      "install",
      "-m",
      "0440",
      "-o",
      "root",
      "-g",
      "wheel",
      tmp,
      SUDOERS_FILE,
    ]);
    await runner.remove(tmp);
  }

  for (const dir of await backupExclusions()) await runner.exec("tmutil", ["addexclusion", dir]);
  for (const g of GUIDES) log.info(`  ☐ ${g}`);
}

export async function revert(ctx: ModuleCtx): Promise<void> {
  const { runner } = ctx;
  if (existsSync(pmsetBackup())) {
    for (const args of restoreArgs(parsePmsetCustom(readFileSync(pmsetBackup(), "utf8"))))
      await runner.exec("sudo", ["pmset", ...args], { stream: true });
    await runner.remove(pmsetBackup());
  }
  if (existsSync(SUDOERS_FILE)) await runner.exec("sudo", ["rm", "-f", SUDOERS_FILE]);
  for (const dir of await backupExclusions()) await runner.exec("tmutil", ["removeexclusion", dir]);
  log.info(`Touch ID para sudo se mantiene; para quitarlo: sudo rm ${SUDO_LOCAL}`);
}

export async function check(ctx: ModuleCtx): Promise<CheckResult[]> {
  const awake = await awakeStatus(ctx.runner);
  const power = await currentPower(ctx.runner);
  return [
    { name: "Touch ID para sudo", ok: await touchIdOn(ctx) },
    {
      name: "perfil de energía (corriente/batería)",
      ok: power.ac.length + power.battery.length === 0,
      warn: true,
      detail: power.ac.length + power.battery.length ? "forja apply macos-base" : undefined,
    },
    { name: "regla sudo de forja awake", ok: existsSync(SUDOERS_FILE), warn: true },
    {
      name: "modo tapa (forja awake)",
      ok: !awake.orphan,
      warn: true,
      detail: awake.orphan
        ? "activo sin loop: el Mac no dormirá al cerrar la tapa (forja awake off)"
        : awake.sleepDisabled
          ? `activo: ${awake.state?.reason ?? ""}`
          : undefined,
    },
  ];
}
