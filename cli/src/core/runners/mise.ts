import type { Runner } from "./shell.ts";
import { commandExists } from "./shell.ts";

export async function installFrom(runner: Runner, cwd: string) {
  return runner.exec("mise", ["install"], { cwd, stream: true });
}

export async function missingTools(runner: Runner, cwd: string): Promise<string[] | null> {
  if (!(await commandExists(runner, "mise"))) return null;
  const r = await runner.query("mise", ["ls", "--missing"], { cwd });
  return r.stdout
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
}
