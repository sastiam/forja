import { readFile } from "node:fs/promises";
import { log } from "./log.ts";
import type { Action } from "./plan.ts";
import { elevate, missingPackages, parsePackageName } from "./runners/dnf.ts";
import type { Runner } from "./runners/shell.ts";
import { parse, type TomlTable } from "./toml.ts";

/**
 * Repos de terceros de Fedora (ADR 0017). Un paquete que no está en los repos de Fedora
 * obliga a añadir un repo ajeno, y eso es una decisión de confianza: forja solo lo
 * habilita si el usuario lo listó en `[fedora] trusted_repos` de su perfil. Sin esa
 * línea, `plan` lo muestra y `apply` no lo toca.
 */

/** Archivo por módulo que declara sus repos de terceros y los paquetes que traen. */
export const THIRDPARTY_FILE = "thirdparty.fedora.toml";

/**
 * - `copr`: un proyecto de COPR (`dnf copr enable owner/project`).
 * - `repofile`: un archivo `.repo` publicado por el proveedor (`dnf config-manager addrepo`).
 * - `workstation`: un repo que Fedora ya empaqueta (deshabilitado) en `fedora-workstation-repositories`.
 */
export const REPO_KINDS = ["copr", "repofile", "workstation"] as const;
export type RepoKind = (typeof REPO_KINDS)[number];

export interface ThirdParty {
  name: string;
  kind: RepoKind;
  /** copr: `owner/project`; repofile: URL https del `.repo`; workstation: id del repo. */
  source: string;
  /** Solo `repofile`: id con el que aparece en `dnf repolist` una vez habilitado. */
  repoId?: string;
  packages: string[];
}

const COPR_RE = /^[A-Za-z0-9][A-Za-z0-9._-]*\/[A-Za-z0-9][A-Za-z0-9._-]*$/;
const REPO_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/;
const HTTPS_URL_RE = /^https:\/\/[A-Za-z0-9.-]+(?::\d+)?\/[A-Za-z0-9._~/%+-]+$/;

function validated(name: string, t: TomlTable): ThirdParty {
  const where = `${THIRDPARTY_FILE} [${name}]`;
  if (!REPO_ID_RE.test(name)) throw new Error(`${where}: nombre inválido`);
  const kind = t.kind;
  if (typeof kind !== "string" || !(REPO_KINDS as readonly string[]).includes(kind))
    throw new Error(`${where}: kind debe ser ${REPO_KINDS.join(", ")}`);
  const source = t.source;
  if (typeof source !== "string") throw new Error(`${where}: falta source`);
  if (kind === "copr" && !COPR_RE.test(source))
    throw new Error(`${where}: source de copr debe ser owner/project`);
  if (kind === "repofile" && !HTTPS_URL_RE.test(source))
    throw new Error(`${where}: source de repofile debe ser una URL https sin parámetros`);
  if (kind === "workstation" && !REPO_ID_RE.test(source))
    throw new Error(`${where}: source de workstation debe ser un id de repo`);
  let repoId: string | undefined;
  if (kind === "repofile") {
    if (typeof t.repo_id !== "string" || !REPO_ID_RE.test(t.repo_id))
      throw new Error(`${where}: repofile exige repo_id (el id que muestra dnf repolist)`);
    repoId = t.repo_id;
  }
  if (!Array.isArray(t.packages) || !t.packages.length)
    throw new Error(`${where}: packages debe ser una lista no vacía`);
  const packages = t.packages.map((p) => {
    if (typeof p !== "string") throw new Error(`${where}: packages solo admite textos`);
    return parsePackageName(p);
  });
  return { name, kind: kind as RepoKind, source, repoId, packages };
}

export function parseThirdParty(text: string): ThirdParty[] {
  const out: ThirdParty[] = [];
  for (const [name, value] of Object.entries(parse(text))) {
    if (typeof value !== "object" || value === null || Array.isArray(value))
      throw new Error(`${THIRDPARTY_FILE}: ${name} debe ser una tabla [${name}]`);
    out.push(validated(name, value as TomlTable));
  }
  return out;
}

export async function readThirdParty(file: string): Promise<ThirdParty[]> {
  return parseThirdParty(await readFile(file, "utf8"));
}

/** Clave que el usuario copia a `[fedora] trusted_repos`: incluye el origen, no solo el nombre. */
export const trustKey = (e: ThirdParty): string => `${e.kind}:${e.source}`;

/** Ids de los repos habilitados (`dnf repolist --enabled`), en minúsculas. */
export async function enabledRepoIds(runner: Runner): Promise<Set<string>> {
  const r = await runner.query("dnf", ["-q", "repolist", "--enabled"], { env: { LC_ALL: "C" } });
  const ids = new Set<string>();
  for (const line of r.stdout.split("\n").slice(1)) {
    const id = line.trim().split(/\s+/)[0];
    if (id) ids.add(id.toLowerCase());
  }
  return ids;
}

/** ¿Ya está habilitado? Un COPR aparece como `copr:copr.fedorainfracloud.org:owner:project`. */
export function isEnabled(e: ThirdParty, ids: Set<string>): boolean {
  if (e.kind === "copr") {
    const [owner, project] = e.source.toLowerCase().split("/");
    return [...ids].some((id) => id.endsWith(`:${owner}:${project}`));
  }
  return ids.has((e.repoId ?? e.source).toLowerCase());
}

/** Comandos (sin sudo) que habilitan el repo. Todos sus argumentos están validados arriba. */
export function enableCommands(e: ThirdParty): [string, string[]][] {
  switch (e.kind) {
    case "copr":
      return [["dnf", ["copr", "enable", "-y", e.source]]];
    case "repofile":
      return [["dnf", ["config-manager", "addrepo", `--from-repofile=${e.source}`]]];
    case "workstation":
      return [
        ["dnf", ["install", "-y", "fedora-workstation-repositories"]],
        ["dnf", ["config-manager", "setopt", `${e.source}.enabled=1`]],
      ];
  }
}

const describe = (e: ThirdParty): string => `${e.name} (${e.kind} ${e.source})`;

/** Acciones de `plan` para los repos de terceros de un módulo. No modifica nada. */
export async function planThirdParty(
  runner: Runner,
  entries: ThirdParty[],
  trusted: string[],
): Promise<Action[]> {
  const ids = await enabledRepoIds(runner);
  const actions: Action[] = [];
  for (const e of entries) {
    const missing = (await missingPackages(runner, e.packages)) ?? e.packages;
    if (isEnabled(e, ids)) {
      actions.push({
        kind: "dnf",
        description: missing.length
          ? `instalar de ${describe(e)}: ${missing.join(", ")} (pedirá sudo)`
          : `${e.name}: ${e.packages.join(", ")} instalado`,
        pending: missing.length > 0,
      });
    } else if (trusted.includes(trustKey(e))) {
      actions.push(
        {
          kind: "step",
          description: `habilitar el repo de terceros ${describe(e)} (confías en él; pedirá sudo)`,
          pending: true,
        },
        {
          kind: "dnf",
          description: `instalar de ${e.name}: ${e.packages.join(", ")}`,
          pending: missing.length > 0,
        },
      );
    } else {
      actions.push({
        kind: "guide",
        description: `repo de terceros SIN confiar: ${describe(e)} para ${e.packages.join(", ")}. Para usarlo añade "${trustKey(e)}" a [fedora] trusted_repos en tu profile.toml; si no, instálalo a mano`,
        pending: true,
      });
    }
  }
  return actions;
}

/**
 * Habilita (solo los de confianza) e instala. Un repo sin confiar se omite con un aviso y
 * nunca se habilita; sus paquetes no se instalan.
 */
export async function applyThirdParty(
  runner: Runner,
  entries: ThirdParty[],
  trusted: string[],
): Promise<void> {
  const ids = await enabledRepoIds(runner);
  for (const e of entries) {
    if (!isEnabled(e, ids)) {
      if (!trusted.includes(trustKey(e))) {
        log.warn(
          `${describe(e)} no está en [fedora] trusted_repos: se omite (${e.packages.join(", ")} no se instala)`,
        );
        continue;
      }
      for (const [cmd, args] of enableCommands(e)) {
        const [c, a] = elevate(cmd, args);
        const r = await runner.exec(c, a, { stream: true });
        if (r.code !== 0) throw new Error(`habilitar ${describe(e)} falló (${r.code})`);
      }
    }
    const missing = (await missingPackages(runner, e.packages)) ?? e.packages;
    if (missing.length) {
      const [c, a] = elevate("dnf", ["install", "-y", ...missing]);
      const r = await runner.exec(c, a, { stream: true });
      if (r.code !== 0) throw new Error(`dnf install de ${e.name} falló (${r.code})`);
    }
  }
}
