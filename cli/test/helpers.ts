import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export const tmp = (prefix = "forja-test-"): string => mkdtempSync(join(tmpdir(), prefix));

export function sh(cwd: string, cmd: string, args: string[]): string {
  return execFileSync(cmd, args, {
    cwd,
    encoding: "utf8",
    env: { ...process.env, GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_SYSTEM: "/dev/null" },
  }).trim();
}

/** Crea un repo git temporal con un commit en `main`. */
export function makeRepo(): string {
  const dir = join(tmp(), "proj");
  sh(tmp(), "mkdir", ["-p", dir]);
  sh(dir, "git", ["init", "-q", "-b", "main"]);
  sh(dir, "git", ["config", "user.email", "test@example.invalid"]);
  sh(dir, "git", ["config", "user.name", "Test"]);
  writeFileSync(join(dir, "README.md"), "hola\n");
  sh(dir, "git", ["add", "."]);
  sh(dir, "git", ["commit", "-q", "-m", "init"]);
  return dir;
}

/** Aísla el state de forja en un directorio temporal. */
export function isolateState(): string {
  const dir = tmp("forja-state-");
  process.env.FORJA_STATE_DIR = dir;
  return dir;
}
