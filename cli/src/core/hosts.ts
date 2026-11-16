import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { Profile } from "./profile.ts";
import { parse } from "./toml.ts";

export interface Host {
  name: string;
  status: "supported" | "planned";
  os: string;
  arch: string;
  modules: string[];
  /** Ajustes de Claude Code comunes a todas las máquinas de este tipo. */
  claude: { allowed_domains: string[]; sandbox?: boolean };
}

export async function loadHost(root: string, name: string): Promise<Host> {
  let text: string;
  try {
    text = await readFile(join(root, "hosts", `${name}.toml`), "utf8");
  } catch {
    throw new Error(`host desconocido: ${name} (no existe hosts/${name}.toml)`);
  }
  const t = parse(text);
  const list = t.modules;
  const claude = (t.claude ?? {}) as { allowed_domains?: unknown; sandbox?: unknown };
  return {
    name: String(t.name ?? name),
    status: t.status === "planned" ? "planned" : "supported",
    os: String(t.os ?? "darwin"),
    arch: String(t.arch ?? "arm64"),
    modules: Array.isArray(list) ? list.map(String) : [],
    claude: {
      allowed_domains: Array.isArray(claude.allowed_domains)
        ? claude.allowed_domains.map(String)
        : [],
      ...(typeof claude.sandbox === "boolean" ? { sandbox: claude.sandbox } : {}),
    },
  };
}

/** Módulos del host + extra del perfil − skip del perfil. */
export function enabledModuleNames(
  host: Pick<Host, "modules">,
  profile: Pick<Profile, "modules_extra" | "modules_skip">,
): string[] {
  const set = new Set([...host.modules, ...profile.modules_extra]);
  for (const s of profile.modules_skip) set.delete(s);
  return [...set];
}
