import { readFile } from "node:fs/promises";
import type { Runner } from "./shell.ts";
import { commandExists } from "./shell.ts";

export type DnfState = "ok" | "pending" | "unavailable";

/** Archivo de paquetes de un módulo para Fedora (el equivalente al Brewfile de macOS). */
export const PACKAGES_FILE = "packages.fedora.txt";

/** Consultas con el idioma fijo: rpm traduce sus mensajes y no se debe depender de ellos. */
const RPM_ENV: Record<string, string> = { LC_ALL: "C" };

/** Un paquete por línea; `#` empieza un comentario (también al final de la línea). */
export function parsePackages(text: string): string[] {
  const out: string[] = [];
  for (const raw of text.split("\n")) {
    const name = raw.replace(/#.*$/, "").trim();
    if (!name) continue;
    if (!/^[A-Za-z0-9][A-Za-z0-9+._-]*$/.test(name)) throw new Error(`paquete inválido: ${name}`);
    if (!out.includes(name)) out.push(name);
  }
  return out;
}

export async function readPackages(file: string): Promise<string[]> {
  return parsePackages(await readFile(file, "utf8"));
}

/**
 * Paquetes de la lista que no están instalados, o null sin rpm (no es Fedora).
 * `rpm -q --qf %{NAME}` imprime solo los instalados; lo que falta es la resta.
 */
export async function missingPackages(
  runner: Runner,
  packages: string[],
): Promise<string[] | null> {
  if (!packages.length) return [];
  if (!(await commandExists(runner, "rpm"))) return null;
  const r = await runner.query("rpm", ["-q", "--qf", "%{NAME}\\n", ...packages], { env: RPM_ENV });
  const installed = new Set(r.stdout.split("\n").map((l) => l.trim()));
  return packages.filter((p) => !installed.has(p));
}

/** Estado de un archivo de paquetes sin modificar nada. */
export async function packagesCheck(
  runner: Runner,
  file: string,
): Promise<{ state: DnfState; missing: string[] }> {
  const missing = await missingPackages(runner, await readPackages(file));
  if (missing === null) return { state: "unavailable", missing: [] };
  return { state: missing.length ? "pending" : "ok", missing };
}

/** `sudo` salvo que ya seamos root. dnf necesita privilegios para instalar. */
export const elevate = (
  cmd: string,
  args: string[],
  uid = process.getuid?.(),
): [string, string[]] => (uid === 0 ? [cmd, args] : ["sudo", [cmd, ...args]]);

/** Instala solo lo que falta. Pide la contraseña de sudo en el terminal, nunca la guarda. */
export async function installMissing(runner: Runner, missing: string[]) {
  const [cmd, args] = elevate("dnf", ["install", "-y", ...missing]);
  return runner.exec(cmd, args, { stream: true });
}
