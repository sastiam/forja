import type { Runner } from "./runners/shell.ts";

/**
 * Modo tapa en Linux: un «inhibidor» de systemd-logind. Mientras el proceso
 * `systemd-inhibit … sleep infinity` siga vivo, cerrar la tapa no suspende el
 * equipo. No hace falta root ni reglas sudo: logind deja a la sesión gráfica
 * activa tomar este bloqueo. Al matar el proceso, el bloqueo se libera solo.
 */

/** Nombre con el que forja se identifica en `systemd-inhibit --list`. */
export const INHIBIT_WHO = "forja";
/** handle-lid-switch: la tapa; sleep: la suspensión por inactividad. */
export const INHIBIT_WHAT = "handle-lid-switch:sleep";

/** Batería: mismo contrato que en macOS (power.ts). */
export interface LinuxBattery {
  ac: boolean;
  percent: number | null;
}

/**
 * Lanza el inhibidor en segundo plano y escribe su PID. `setsid` lo deja como
 * líder de su grupo para poder matarlo entero (systemd-inhibit crea un hijo
 * `sleep`). El motivo viaja como argumento ($1), nunca dentro del script.
 */
export const INHIBIT_START_SCRIPT = `setsid systemd-inhibit --what=${INHIBIT_WHAT} --who=${INHIBIT_WHO} --why="$1" --mode=block sleep infinity >/dev/null 2>&1 </dev/null & echo $!`;

/** PID impreso por el script de arranque, o null si no es un número. */
export function parseStartedPid(stdout: string): number | null {
  const n = Number(stdout.trim());
  return Number.isInteger(n) && n > 1 ? n : null;
}

/** Filas de `systemd-inhibit --list` cuyo WHO es forja: `[pid]`. Columnas: WHO UID USER PID COMM WHAT… */
export function parseForjaInhibitors(list: string): number[] {
  const pids: number[] = [];
  for (const line of list.split("\n")) {
    const cols = line.trim().split(/\s+/);
    if (cols[0] !== INHIBIT_WHO) continue;
    const pid = Number(cols[3]);
    if (Number.isInteger(pid) && pid > 1) pids.push(pid);
  }
  return pids;
}

/** ¿Hay un inhibidor de forja que bloquee la tapa? */
export function parseLidInhibited(list: string): boolean {
  return list
    .split("\n")
    .some((l) => l.trim().startsWith(`${INHIBIT_WHO} `) && /handle-lid-switch/.test(l));
}

/**
 * Salida de `sysfs_power`: una línea por fuente, «nombre tipo online capacidad»
 * (vacíos como «-»). AC = alguna fuente Mains con online=1; sin ninguna batería
 * el porcentaje es null (un sobremesa nunca debe cortar por batería).
 */
export function parsePowerSupply(text: string): LinuxBattery {
  let ac = false;
  let hasMains = false;
  let percent: number | null = null;
  for (const line of text.split("\n")) {
    const [, type, online, capacity] = line.trim().split(/\s+/);
    if (type === "Mains") {
      hasMains = true;
      if (online === "1") ac = true;
    } else if (type === "Battery" && percent === null && /^\d+$/.test(capacity ?? "")) {
      percent = Number(capacity);
    }
  }
  return { ac: hasMains ? ac : percent === null, percent };
}

export const POWER_SUPPLY_SCRIPT = `for d in /sys/class/power_supply/*; do [ -e "$d/type" ] || continue; printf '%s %s %s %s\\n' "$(basename "$d")" "$(cat "$d/type" 2>/dev/null || echo -)" "$(cat "$d/online" 2>/dev/null || echo -)" "$(cat "$d/capacity" 2>/dev/null || echo -)"; done`;

/** Contenido de /proc/acpi/button/lid/<tapa>/state: «state:      closed». */
export function parseLidClosedLinux(text: string): boolean {
  return /^state:\s+closed\s*$/m.test(text);
}

export async function inhibitList(runner: Runner): Promise<string> {
  return (await runner.query("systemd-inhibit", ["--list", "--no-pager"])).stdout;
}

export async function sleepDisabledLinux(runner: Runner): Promise<boolean> {
  return parseLidInhibited(await inhibitList(runner));
}

export async function batteryLinux(runner: Runner): Promise<LinuxBattery> {
  return parsePowerSupply((await runner.query("sh", ["-c", POWER_SUPPLY_SCRIPT])).stdout);
}

export async function lidClosedLinux(runner: Runner): Promise<boolean> {
  const r = await runner.query("sh", ["-c", "cat /proc/acpi/button/lid/*/state 2>/dev/null"]);
  return parseLidClosedLinux(r.stdout);
}

/** Activa el inhibidor y devuelve su PID (null en dry-run o si no arrancó). */
export async function inhibitStart(runner: Runner, reason: string): Promise<number | null> {
  const r = await runner.exec("sh", ["-c", INHIBIT_START_SCRIPT, "forja", reason]);
  if (runner.dryRun) return null;
  const pid = parseStartedPid(r.stdout);
  if (r.code !== 0 || pid === null)
    throw new Error("no se pudo activar el inhibidor de systemd (¿systemd-inhibit disponible?)");
  return pid;
}

/** Libera todos los inhibidores de forja: mata su grupo de procesos (y el proceso, por si acaso). */
export async function inhibitStop(runner: Runner): Promise<void> {
  for (const pid of parseForjaInhibitors(await inhibitList(runner)))
    await runner.exec("sh", ["-c", `kill -TERM -- -${pid} 2>/dev/null || kill -TERM ${pid}`]);
}

/** Suspende el equipo (sin sudo: lo permite la sesión activa). */
export async function suspendLinux(runner: Runner): Promise<void> {
  await runner.exec("systemctl", ["suspend"]);
}
