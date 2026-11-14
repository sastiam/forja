import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { parse, type TomlTable } from "../core/toml.ts";

export interface ProjectConfig {
  copy: string[];
  setup: string[];
  teardown: string[];
  portBase: number;
  integrate: string[];
  floci: boolean;
}

const list = (v: unknown): string[] => (Array.isArray(v) ? v.map(String) : []);
const sub = (v: unknown): TomlTable =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as TomlTable) : {};

export const defaultProject = (): ProjectConfig => ({
  copy: [],
  setup: [],
  teardown: [],
  portBase: 3000,
  integrate: [],
  floci: false,
});

/** Lee .forja/project.toml (opcional): sin archivo, forja no asume nada. */
export async function loadProject(repo: string): Promise<ProjectConfig> {
  let text: string;
  try {
    text = await readFile(join(repo, ".forja", "project.toml"), "utf8");
  } catch {
    return defaultProject();
  }
  const t = parse(text);
  const wt = sub(t.worktree);
  return {
    copy: list(wt.copy),
    setup: list(wt.setup),
    teardown: list(wt.teardown),
    portBase: typeof wt.port_base === "number" ? wt.port_base : 3000,
    integrate: list(sub(t.checks).integrate),
    floci: sub(t.floci).enabled === true,
  };
}

/** Líneas de .worktreeinclude (rutas literales; comentarios con #). */
export async function loadWorktreeInclude(repo: string): Promise<string[]> {
  try {
    return (await readFile(join(repo, ".worktreeinclude"), "utf8"))
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith("#"));
  } catch {
    return [];
  }
}

/** Nunca se copian secretos reales: .env y .env.* (salvo .env.tpl) y claves. */
export function isSecretPath(rel: string): boolean {
  const name = rel.split("/").pop() ?? rel;
  if (name === ".env.tpl") return false;
  return (
    name === ".env" ||
    name.startsWith(".env.") ||
    /\.(pem|key)$/.test(name) ||
    name === "credentials"
  );
}
