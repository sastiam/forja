import { parseArgs } from "node:util";
import { log, out } from "../core/log.ts";
import { repoRoot } from "../core/paths.ts";
import { commandExists, createRunner, type Runner } from "../core/runners/shell.ts";

/** Secciones de versión (`## [x.y.z]`) añadidas al CHANGELOG entre dos commits. */
export function newReleases(before: string, after: string): string[] {
  const versions = (s: string) =>
    new Set([...s.matchAll(/^## \[(\d+\.\d+\.\d+)\]/gm)].map((m) => m[1]));
  const old = versions(before);
  return [...versions(after)].filter((v): v is string => !!v && !old.has(v));
}

async function git(runner: Runner, root: string, args: string[], write = false) {
  const r = write
    ? await runner.exec("git", ["-C", root, ...args], { stream: true })
    : await runner.query("git", ["-C", root, ...args]);
  if (r.code !== 0)
    throw new Error(`git ${args.join(" ")} falló: ${(r.stderr || r.stdout).trim()}`);
  return r.stdout.trim();
}

/**
 * `forja self update`: `git pull --ff-only` del clon de forja + `mise install`,
 * y muestra qué cambió. No aplica nada: después, `forja plan`.
 */
export async function selfCommand(argv: string[]): Promise<number> {
  const [sub, ...rest] = argv;
  const { values } = parseArgs({ args: rest, options: { "dry-run": { type: "boolean" } } });
  if (sub !== "update") {
    out("uso: forja self update [--dry-run]");
    return sub ? 1 : 0;
  }
  const root = repoRoot();
  const runner = createRunner(values["dry-run"] === true);
  if (await git(runner, root, ["status", "--porcelain", "--untracked-files=no"])) {
    log.error(`${root} tiene cambios sin commit: guárdalos (rama + PR) antes de actualizar.`);
    return 1;
  }
  const branch = await git(runner, root, ["branch", "--show-current"]);
  if (branch !== "main") log.warn(`El clon está en la rama ${branch || "(detached)"}, no en main.`);
  const before = await git(runner, root, ["rev-parse", "HEAD"]);
  const changelogBefore = await git(runner, root, ["show", "HEAD:CHANGELOG.md"]);
  await git(runner, root, ["pull", "--ff-only"], true);
  const after = runner.dryRun ? before : await git(runner, root, ["rev-parse", "HEAD"]);
  if (after === before) {
    log.ok("forja ya está al día.");
    return 0;
  }
  if (await commandExists(runner, "mise"))
    await runner.exec("mise", ["install"], { cwd: root, stream: true });
  out(await git(runner, root, ["log", "--oneline", `${before}..${after}`]));
  const releases = newReleases(
    changelogBefore,
    await git(runner, root, ["show", "HEAD:CHANGELOG.md"]),
  );
  if (releases.length) out(`\nVersiones nuevas: ${releases.join(", ")} (ver CHANGELOG.md)`);
  log.ok(`forja actualizada ${before.slice(0, 7)} → ${after.slice(0, 7)}. Siguiente: forja plan`);
  return 0;
}
