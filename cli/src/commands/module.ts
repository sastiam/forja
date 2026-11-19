import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { enabledModuleNames, loadHost } from "../core/hosts.ts";
import { out } from "../core/log.ts";
import { loadModules, resolveOrder } from "../core/modules.ts";
import { profilePath, repoRoot } from "../core/paths.ts";
import { loadProfile } from "../core/profile.ts";

export async function moduleCommand(argv: string[]): Promise<number> {
  const [sub = "ls", name] = argv;
  const root = repoRoot();
  const all = await loadModules(root);
  const profile = await loadProfile(profilePath());
  const enabled = profile ? enabledModuleNames(await loadHost(root, profile.host), profile) : [];
  if (sub === "ls") {
    for (const m of [...all.values()].sort((a, b) => a.name.localeCompare(b.name))) {
      const st = !profile ? "?" : enabled.includes(m.name) ? "on " : "off";
      out(`${st}  ${m.name.padEnd(18)} ${m.risk.padEnd(6)} ${m.summary}`);
    }
    return 0;
  }
  if (sub === "info" && name) {
    const m = all.get(name);
    if (!m) {
      out(`módulo desconocido: ${name}`);
      return 1;
    }
    out(`${m.name} — ${m.summary}`);
    out(
      `  os: ${m.os.join(", ") || "todos"}   riesgo: ${m.risk}   sudo: ${m.requiresSudo ? "sí" : "no"}   opcional: ${m.optional ? "sí" : "no"}`,
    );
    out(
      `  depende de: ${m.depends.join(", ") || "—"}  (orden: ${resolveOrder(all, [name]).join(" → ")})`,
    );
    out(
      `  targets: ${[...m.targets, ...m.targetsDarwin.map((t) => `${t} (solo macOS)`)].join(", ") || "—"}`,
    );
    out(
      `  estado: ${!profile ? "sin perfil" : enabled.includes(name) ? "habilitado" : "deshabilitado"}`,
    );
    const revert = join(m.dir, "revert.md");
    if (existsSync(revert)) out(`\nCómo revertir:\n${await readFile(revert, "utf8")}`);
    return 0;
  }
  out("uso: forja module ls | forja module info <módulo>");
  return 1;
}
