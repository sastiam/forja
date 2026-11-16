import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import {
  generatedBy,
  installSkills,
  OPENSPEC_SKILLS,
  openspecSkillsStatus,
  skillsAction,
  skillsCheck,
} from "../src/core/openspec-skills.ts";
import { createFakeRunner, type ExecOptions, type Runner } from "../src/core/runners/shell.ts";

const VERSION = "2.0.0";
const OLD_VERSION = "1.14.3";
const SKILLS_ENV = "FORJA_CLAUDE_SKILLS_DIR";
const SKILL_FILE = "SKILL.md";
const SKILLS_PREFIX = "skills de OpenSpec";
const FALTA_OPENSPEC = "falta openspec: forja apply runtimes";
const SKILLS_FIX = "forja apply agents";

const skillMd = (version: string) =>
  `---\nname: openspec\nmetadata:\n  generatedBy: "${version}"\n---\n# Skill\n`;

function writeSkill(dir: string, version: string): void {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, SKILL_FILE), skillMd(version));
}

/** Simula `openspec --version`; el resto de comandos responde vacío con código 0. */
const openspecAt = (version: string | null, dryRun = true) =>
  createFakeRunner(
    (cmd, args) =>
      cmd === "openspec" && args[0] === "--version"
        ? version === null
          ? { code: 127, stderr: "openspec: command not found" }
          : { stdout: `${version}\n` }
        : undefined,
    dryRun,
  );

/** Apunta las skills a un directorio temporal mientras corre `fn`. */
async function withSkillsDir(skillsDir: string, fn: () => Promise<void>): Promise<void> {
  const saved = process.env[SKILLS_ENV];
  process.env[SKILLS_ENV] = skillsDir;
  try {
    await fn();
  } finally {
    if (saved === undefined) delete process.env[SKILLS_ENV];
    else process.env[SKILLS_ENV] = saved;
  }
}

// generatedBy: versión que deja `openspec init` en el frontmatter

test("generatedBy: lee la versión entre comillas, sin comillas o devuelve null", () => {
  assert.equal(generatedBy(skillMd("2.0.0")), "2.0.0");
  assert.equal(generatedBy("metadata:\n  generatedBy: 2.0.0\n---\n"), "2.0.0");
  assert.equal(generatedBy("---\nname: x\n---\n"), null);
});

// openspecSkillsStatus: compara lo instalado con la versión de openspec

test("openspecSkillsStatus: todas presentes y al día no tienen nada pendiente", () => {
  const found: Record<string, string | null> = {};
  for (const name of OPENSPEC_SKILLS) found[name] = VERSION;
  assert.deepEqual(openspecSkillsStatus(found, VERSION), { missing: [], stale: [] });
});

test("openspecSkillsStatus: una skill ausente cuenta como faltante", () => {
  const found: Record<string, string | null> = {};
  for (const name of OPENSPEC_SKILLS) found[name] = VERSION;
  const [gone] = OPENSPEC_SKILLS;
  if (!gone) assert.fail("OPENSPEC_SKILLS vacío");
  delete found[gone];
  assert.deepEqual(openspecSkillsStatus(found, VERSION), { missing: [gone], stale: [] });
});

test("openspecSkillsStatus: otra versión o sin generatedBy cuenta como desfasada", () => {
  const found: Record<string, string | null> = {};
  for (const name of OPENSPEC_SKILLS) found[name] = VERSION;
  const [old, unversioned] = OPENSPEC_SKILLS;
  if (!old || !unversioned) assert.fail("OPENSPEC_SKILLS tiene menos de dos nombres");
  found[old] = OLD_VERSION;
  found[unversioned] = null;
  assert.deepEqual(openspecSkillsStatus(found, VERSION), {
    missing: [],
    stale: [old, unversioned],
  });
});

// skillsAction y skillsCheck: lo que el usuario ve en `forja plan` y `forja doctor`

test("skillsAction: sin skills la acción está pendiente y lista las faltantes", async () => {
  const skills = mkdtempSync(join(tmpdir(), "forja-skills-"));
  await withSkillsDir(skills, async () => {
    const a = await skillsAction(openspecAt(VERSION));
    assert.equal(a.pending, true);
    assert.match(a.description, new RegExp(`faltan: ${OPENSPEC_SKILLS[0]}`));
  });
});

test("skillsAction: con las seis skills a la versión de openspec no hay nada pendiente", async () => {
  const skills = mkdtempSync(join(tmpdir(), "forja-skills-"));
  for (const name of OPENSPEC_SKILLS) writeSkill(join(skills, name), VERSION);
  await withSkillsDir(skills, async () => {
    const a = await skillsAction(openspecAt(VERSION));
    assert.equal(a.pending, false);
  });
});

test("skillsAction: una skill de otra versión queda pendiente como desfasada", async () => {
  const skills = mkdtempSync(join(tmpdir(), "forja-skills-"));
  for (const name of OPENSPEC_SKILLS) writeSkill(join(skills, name), VERSION);
  const [old] = OPENSPEC_SKILLS;
  if (!old) assert.fail("OPENSPEC_SKILLS vacío");
  writeSkill(join(skills, old), OLD_VERSION);
  await withSkillsDir(skills, async () => {
    const a = await skillsAction(openspecAt(VERSION));
    assert.equal(a.pending, true);
    assert.match(a.description, new RegExp(`desfasadas: ${old}`));
  });
});

test("skillsAction: sin openspec la acción está pendiente con la pista de runtimes", async () => {
  const skills = mkdtempSync(join(tmpdir(), "forja-skills-"));
  await withSkillsDir(skills, async () => {
    const a = await skillsAction(openspecAt(null));
    assert.equal(a.pending, true);
    assert.match(a.description, new RegExp(FALTA_OPENSPEC));
  });
});

test("skillsCheck: si `openspec --version` falla es un fallo con la pista de runtimes", async () => {
  const skills = mkdtempSync(join(tmpdir(), "forja-skills-"));
  await withSkillsDir(skills, async () => {
    const r = await skillsCheck(openspecAt(null));
    assert.equal(r.name.startsWith(SKILLS_PREFIX), true);
    assert.equal(r.ok, false);
    assert.match(r.detail ?? "", new RegExp(FALTA_OPENSPEC));
  });
});

test("skillsCheck: skills al día pasan, faltantes o desfasadas dan el arreglo", async () => {
  const skills = mkdtempSync(join(tmpdir(), "forja-skills-"));
  await withSkillsDir(skills, async () => {
    const empty = await skillsCheck(openspecAt(VERSION));
    assert.equal(empty.ok, false);
    assert.match(empty.detail ?? "", new RegExp(SKILLS_FIX));
    for (const name of OPENSPEC_SKILLS) writeSkill(join(skills, name), VERSION);
    const ok = await skillsCheck(openspecAt(VERSION));
    assert.equal(ok.ok, true);
  });
});

// installSkills: copia las skills generadas por `openspec init` en un directorio temporal

test("installSkills: copia las skills generadas y no toca directorios ajenos", async () => {
  const skills = mkdtempSync(join(tmpdir(), "forja-skills-"));
  mkdirSync(join(skills, "tdd"));
  writeFileSync(join(skills, "tdd", SKILL_FILE), "tdd intacta");
  writeSkill(join(skills, OPENSPEC_SKILLS[0] ?? "x"), OLD_VERSION);
  const stale = join(skills, OPENSPEC_SKILLS[0] ?? "x", "viejo.md");
  writeFileSync(stale, "sobra");

  const cwds: string[] = [];
  const base = openspecAt(VERSION, false);
  // El handler de createFakeRunner no recibe `cwd`: se envuelve `exec` solo en este test.
  const runner: Runner = {
    ...base,
    exec: async (cmd, args, opts?: ExecOptions) => {
      if (cmd === "openspec" && args[0] === "init") {
        const cwd = opts?.cwd ?? "";
        cwds.push(cwd);
        for (const name of OPENSPEC_SKILLS)
          writeSkill(join(cwd, ".agents", "skills", name), VERSION);
      }
      return base.exec(cmd, args, opts);
    },
  };

  await withSkillsDir(skills, async () => {
    await installSkills(runner);
  });

  assert.equal(cwds.length, 1);
  assert.equal(existsSync(cwds[0] ?? ""), false, "el directorio temporal se borra");
  for (const name of OPENSPEC_SKILLS)
    assert.match(readFileSync(join(skills, name, SKILL_FILE), "utf8"), /generatedBy: "2\.0\.0"/);
  assert.equal(existsSync(stale), false, "el contenido previo de la skill se reemplaza");
  assert.equal(readFileSync(join(skills, "tdd", SKILL_FILE), "utf8"), "tdd intacta");
});

test("installSkills en dry run: no ejecuta openspec init ni escribe skills", async () => {
  const skills = mkdtempSync(join(tmpdir(), "forja-skills-"));
  const runner = openspecAt(VERSION, true);
  await withSkillsDir(skills, async () => {
    await installSkills(runner);
  });
  assert.equal(
    runner.calls.some((c) => c.startsWith("openspec init")),
    false,
  );
  assert.equal(existsSync(join(skills, OPENSPEC_SKILLS[0] ?? "x")), false);
});
