import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { stateDir } from "./paths.ts";

export type Owner = "human" | "claude" | "opencode" | "hermes" | "night";

export interface WorktreeRecord {
  path: string;
  repo: string;
  branch: string;
  base: string;
  owner: Owner;
  created_at: string;
  port: number;
}

async function readJson<T>(file: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await readFile(file, "utf8")) as T;
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return fallback;
    throw e;
  }
}

async function writeJson(file: string, data: unknown): Promise<void> {
  await mkdir(stateDir(), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  await writeFile(tmp, `${JSON.stringify(data, null, 2)}\n`);
  await rename(tmp, file);
}

const worktreesFile = () => join(stateDir(), "worktrees.json");

export const loadWorktrees = (): Promise<WorktreeRecord[]> => readJson(worktreesFile(), []);
export const saveWorktrees = (list: WorktreeRecord[]): Promise<void> =>
  writeJson(worktreesFile(), list);

export async function upsertWorktree(rec: WorktreeRecord): Promise<void> {
  const list = (await loadWorktrees()).filter((r) => r.path !== rec.path);
  list.push(rec);
  await saveWorktrees(list);
}

export async function removeWorktree(path: string): Promise<void> {
  await saveWorktrees((await loadWorktrees()).filter((r) => r.path !== path));
}

export interface LastApply {
  at: string;
  modules: { name: string; ok: boolean }[];
}

export const saveLastApply = (v: LastApply): Promise<void> =>
  writeJson(join(stateDir(), "last-apply.json"), v);
export const loadLastApply = (): Promise<LastApply | null> =>
  readJson(join(stateDir(), "last-apply.json"), null);

export function logsDir(): string {
  return join(stateDir(), "logs");
}
