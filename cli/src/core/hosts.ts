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
  return {
    name: String(t.name ?? name),
    status: t.status === "planned" ? "planned" : "supported",
    os: String(t.os ?? "darwin"),
    arch: String(t.arch ?? "arm64"),
    modules: Array.isArray(list) ? list.map(String) : [],
  };
}

/** Módulos del host + extra del perfil − skip del perfil. */
export function enabledModuleNames(
  host: Host,
  profile: Pick<Profile, "modules_extra" | "modules_skip">,
): string[] {
  const set = new Set([...host.modules, ...profile.modules_extra]);
  for (const s of profile.modules_skip) set.delete(s);
  return [...set];
}
