import { existsSync } from "node:fs";
import { cp, mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { log } from "./log.ts";
import { home } from "./paths.ts";
import { type Action, type CheckResult, tildify } from "./plan.ts";
import type { Runner } from "./runners/shell.ts";

/**
 * Skills que genera `openspec init` 2.0.0 (`--tools claude`). forja las copia a
 * ~/.claude/skills en lugar de usar `openspec init` en cada proyecto.
 */
export const OPENSPEC_SKILLS = [
  "openspec-apply-change",
  "openspec-archive-change",
  "openspec-explore",
  "openspec-propose",
  "openspec-sync-specs",
  "openspec-update-change",
] as const;

/** Claude Code y OpenCode leen las skills globales de aquí (FORJA_CLAUDE_SKILLS_DIR para tests). */
export const claudeSkillsDir = (): string =>
  process.env.FORJA_CLAUDE_SKILLS_DIR ?? join(home(), ".claude", "skills");

const GENERATED_BY = /^\s*generatedBy:\s*"?([^"\r\n]*?)"?\s*$/m;
const OPENSPEC_VERSION_TIMEOUT_MS = 15000;
/** Lo que `openspec init` 2.0.0 genera dentro de un proyecto (las skills van en `.agents/skills`). */
const OPENSPEC_INIT_ARGS = ["init", "--tools", "claude", "--no-animation"];
const OPENSPEC_GENERATED_DIR = join(".agents", "skills");
const OPENSPEC_TMP_PREFIX = "forja-openspec-";
const SKILL_FILE = "SKILL.md";
const SKILLS_LABEL = "skills de OpenSpec";
const SKILLS_DIR_LABEL = "~/.claude/skills";
const FALTA_OPENSPEC = "falta openspec: forja apply runtimes";
const SKILLS_FIX = "forja apply agents";

/** Versión de openspec que generó una SKILL.md (`generatedBy: "2.0.0"`), o null si no la trae. */
export function generatedBy(skillMd: string): string | null {
  const version = GENERATED_BY.exec(skillMd)?.[1]?.trim();
  return version ? version : null;
}

/**
 * Compara las skills instaladas (nombre → generatedBy, null si no lo tiene) con la
 * versión de openspec: ausente = faltante; otra versión o sin versión = desfasada.
 */
export function openspecSkillsStatus(
  found: Record<string, string | null>,
  version: string,
): { missing: string[]; stale: string[] } {
  const missing: string[] = [];
  const stale: string[] = [];
  for (const name of OPENSPEC_SKILLS) {
    if (!Object.hasOwn(found, name)) missing.push(name);
    else if (found[name] !== version) stale.push(name);
  }
  return { missing, stale };
}

/** Versión de openspec (primera línea de `openspec --version`), o null si falta o falla. */
async function openspecVersion(runner: Runner): Promise<string | null> {
  const r = await runner.query("openspec", ["--version"], {
    timeoutMs: OPENSPEC_VERSION_TIMEOUT_MS,
  });
  if (r.code !== 0) return null;
  const first = r.stdout.trim().split("\n")[0]?.trim();
  return first ? first : null;
}

/** Nombre de skill → su `generatedBy` (null si el SKILL.md no lo trae). Solo las que existen. */
async function installedSkills(): Promise<Record<string, string | null>> {
  const found: Record<string, string | null> = {};
  for (const name of OPENSPEC_SKILLS) {
    const file = join(claudeSkillsDir(), name, SKILL_FILE);
    if (existsSync(file)) found[name] = generatedBy(await readFile(file, "utf8"));
  }
  return found;
}

/** "faltan: a, b; desfasadas: c", o "" si no hay nada. */
function skillsProblems(missing: string[], stale: string[]): string {
  return [
    missing.length ? `faltan: ${missing.join(", ")}` : "",
    stale.length ? `desfasadas: ${stale.join(", ")}` : "",
  ]
    .filter(Boolean)
    .join("; ");
}

/** Acción de `plan` para las skills de OpenSpec en ~/.claude/skills. */
export async function skillsAction(runner: Runner): Promise<Action> {
  const version = await openspecVersion(runner);
  const dir = tildify(claudeSkillsDir());
  if (!version)
    return {
      kind: "step",
      description: `${SKILLS_LABEL} en ${dir} (${FALTA_OPENSPEC})`,
      pending: true,
    };
  const { missing, stale } = openspecSkillsStatus(await installedSkills(), version);
  const problems = skillsProblems(missing, stale);
  return {
    kind: "step",
    description: `${SKILLS_LABEL} ${version} en ${dir}${problems ? ` (${problems})` : ""}`,
    pending: missing.length + stale.length > 0,
  };
}

/**
 * Genera las skills con `openspec init` en un directorio temporal y las copia a
 * ~/.claude/skills, reemplazando solo las carpetas de OPENSPEC_SKILLS.
 */
export async function installSkills(runner: Runner): Promise<void> {
  if (!(await openspecVersion(runner))) {
    log.warn(`${FALTA_OPENSPEC}; se omiten las skills de OpenSpec`);
    return;
  }
  const dir = claudeSkillsDir();
  if (runner.dryRun) {
    for (const name of OPENSPEC_SKILLS) log.step(`copiaría ${name} en ${tildify(dir)}`);
    return;
  }
  const tmp = await mkdtemp(join(tmpdir(), OPENSPEC_TMP_PREFIX));
  try {
    const r = await runner.exec("openspec", OPENSPEC_INIT_ARGS, { cwd: tmp });
    if (r.code !== 0) throw new Error(`openspec init falló: ${(r.stderr || r.stdout).trim()}`);
    const generated = join(tmp, OPENSPEC_GENERATED_DIR);
    for (const name of OPENSPEC_SKILLS)
      if (!existsSync(join(generated, name, SKILL_FILE)))
        throw new Error(`openspec init no generó la skill ${name}`);
    await mkdir(dir, { recursive: true });
    for (const name of OPENSPEC_SKILLS) {
      const target = join(dir, name);
      await rm(target, { recursive: true, force: true });
      await cp(join(generated, name), target, { recursive: true });
      log.step(`skill ${name} instalada en ${tildify(dir)}`);
    }
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
}

/** Resultado de `check` para las skills de OpenSpec; el arreglo es `forja apply agents`. */
export async function skillsCheck(runner: Runner): Promise<CheckResult> {
  const name = `${SKILLS_LABEL} en ${SKILLS_DIR_LABEL}`;
  const version = await openspecVersion(runner);
  if (!version) return { name, ok: false, detail: FALTA_OPENSPEC };
  const { missing, stale } = openspecSkillsStatus(await installedSkills(), version);
  const problems = skillsProblems(missing, stale);
  return {
    name,
    ok: problems === "",
    detail: problems ? `${problems}: ${SKILLS_FIX}` : undefined,
  };
}
