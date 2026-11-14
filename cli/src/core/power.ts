import { userInfo } from "node:os";
import { log } from "./log.ts";
import type { Runner } from "./runners/shell.ts";
import { type AwakeState, loadAwake, saveAwake } from "./state.ts";

/**
 * Modo tapa: `pmset -a disablesleep 1` impide que el Mac se duerma al cerrar la
 * tapa (caffeinate no lo cubre). Solo se usa mientras corre un loop; se quita al
 * terminar, con la batería baja o a mano con `forja awake off`.
 */

export const SUDOERS_FILE = "/etc/sudoers.d/forja-awake";
export const PMSET = "/usr/bin/pmset";
/** Batería mínima sin cargador con el modo activo. */
export const MIN_BATTERY = 20;

/** Regla sudo mínima: solo estos tres comandos exactos, sin contraseña, para el usuario. */
export function sudoersRule(user = userInfo().username): string {
  return `# Gestionado por forja (macos-base): forja awake sin contraseña durante loops largos.
${user} ALL=(root) NOPASSWD: ${PMSET} -a disablesleep 1, ${PMSET} -a disablesleep 0, ${PMSET} sleepnow
`;
}

export interface Battery {
  ac: boolean;
  percent: number | null;
}

/** `pmset -g batt`: "Now drawing from 'AC Power'" + "…\t87%; charging…". */
export function parseBatt(text: string): Battery {
  const pct = /(\d+)%/.exec(text)?.[1];
  return { ac: /'AC Power'/.test(text), percent: pct ? Number(pct) : null };
}

/** `pmset -g`: línea "SleepDisabled\t\t1". */
export function parseSleepDisabled(text: string): boolean {
  return /^\s*SleepDisabled\s+1\s*$/m.test(text);
}

/** `ioreg -r -k AppleClamshellState -d 1`: "AppleClamshellState" = Yes. */
export function parseClamshellClosed(text: string): boolean {
  return /"AppleClamshellState"\s*=\s*Yes/.test(text);
}

export async function sleepDisabled(runner: Runner): Promise<boolean> {
  return parseSleepDisabled((await runner.query("pmset", ["-g"])).stdout);
}

export async function battery(runner: Runner): Promise<Battery> {
  return parseBatt((await runner.query("pmset", ["-g", "batt"])).stdout);
}

/** `sudo -n`: nunca pide contraseña (en un loop no hay nadie). Falla si falta la regla. */
async function sudoPmset(runner: Runner, args: string[]): Promise<void> {
  const r = await runner.exec("sudo", ["-n", PMSET, ...args]);
  if (r.code !== 0)
    throw new Error(
      `sudo ${PMSET} ${args.join(" ")} falló: falta la regla ${SUDOERS_FILE} (forja apply macos-base)`,
    );
}

export async function awakeOn(runner: Runner, reason: string, pid?: number): Promise<void> {
  await sudoPmset(runner, ["-a", "disablesleep", "1"]);
  if (!runner.dryRun) await saveAwake({ since: new Date().toISOString(), reason, pid });
}

export async function awakeOff(runner: Runner): Promise<void> {
  await sudoPmset(runner, ["-a", "disablesleep", "0"]);
  if (!runner.dryRun) await saveAwake(null);
}

export interface AwakeStatus {
  sleepDisabled: boolean;
  state: AwakeState | null;
  /** Activo sin registro o con el loop que lo pidió ya muerto. Un `awake on` manual no es huérfano. */
  orphan: boolean;
  battery: Battery;
}

export function pidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return (e as NodeJS.ErrnoException).code === "EPERM";
  }
}

export async function awakeStatus(runner: Runner): Promise<AwakeStatus> {
  const disabled = await sleepDisabled(runner);
  const state = await loadAwake();
  const dead = state?.pid !== undefined && !pidAlive(state.pid);
  return {
    sleepDisabled: disabled,
    state,
    orphan: disabled && (!state || dead),
    battery: await battery(runner),
  };
}

/**
 * Un tick del guardián: sin cargador y por debajo del mínimo, quita el modo y,
 * si la tapa está cerrada, duerme el Mac. Devuelve true si cortó.
 */
export async function guardTick(runner: Runner, min = MIN_BATTERY): Promise<boolean> {
  const b = await battery(runner);
  if (b.ac || b.percent === null || b.percent >= min) return false;
  log.warn(`Batería al ${b.percent} % sin cargador: se quita el modo tapa.`);
  await awakeOff(runner);
  const lid = await runner.query("ioreg", ["-r", "-k", "AppleClamshellState", "-d", "1"]);
  if (parseClamshellClosed(lid.stdout)) await runner.exec("sudo", ["-n", PMSET, "sleepnow"]);
  return true;
}

/**
 * Mantiene el modo tapa mientras dure `fn`, y lo quita siempre al salir (también
 * con Ctrl-C o SIGTERM). Revisa la batería cada `intervalMs`.
 */
export async function withAwake<T>(
  runner: Runner,
  reason: string,
  fn: () => Promise<T>,
  intervalMs = 60_000,
): Promise<T> {
  await awakeOn(runner, reason, process.pid);
  let cut = false;
  const timer = setInterval(() => {
    if (!cut)
      void guardTick(runner).then(
        (c) => (cut = c),
        () => {},
      );
  }, intervalMs);
  const restore = () => {
    clearInterval(timer);
    return cut ? Promise.resolve() : awakeOff(runner);
  };
  const onSignal = (sig: NodeJS.Signals) => {
    void restore().finally(() => process.kill(process.pid, sig));
  };
  process.once("SIGINT", onSignal);
  process.once("SIGTERM", onSignal);
  try {
    return await fn();
  } finally {
    process.off("SIGINT", onSignal);
    process.off("SIGTERM", onSignal);
    await restore();
  }
}
