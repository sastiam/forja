// Genera docs/modules.md: módulo → qué instala → cómo revertir. Uso: node scripts/gen-modules-doc.ts
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { loadModules } from "../cli/src/core/modules.ts";
import { repoRoot } from "../cli/src/core/paths.ts";

const root = repoRoot();
const mods = [...(await loadModules(root)).values()].sort((a, b) => a.name.localeCompare(b.name));
const cell = (s: string): string => s.replace(/\|/g, "\\|").replace(/\n+/g, " ").trim();
const rows = mods.map((m) => {
  const names = (file: string, re: RegExp): string[] =>
    existsSync(file)
      ? readFileSync(file, "utf8").split("\n").map((l) => re.exec(l)).filter((x): x is RegExpExecArray => !!x).map((x) => x[2] ?? x[1] ?? "")
      : [];
  const mac = names(join(m.dir, "Brewfile"), /^(brew|cask|tap) "([^"]+)"/);
  const fedora = names(join(m.dir, "packages.fedora.txt"), /^([A-Za-z0-9][^\s#]*)/);
  const pkgs = [mac.length ? `macOS: ${mac.join(", ")}` : "", fedora.length ? `Fedora: ${fedora.join(", ")}` : ""].filter(Boolean).join("<br>") || "—";
  const revert = existsSync(join(m.dir, "revert.md")) ? readFileSync(join(m.dir, "revert.md"), "utf8") : "—";
  return `| \`${m.name}\` | ${cell(m.summary)} | ${cell(pkgs || "—")} | ${m.targets.map((t) => `\`${t}\``).join(", ") || "—"} | ${m.risk} | ${cell(revert)} |`;
});
const out = `# Módulos\n\n> Generado con \`node scripts/gen-modules-doc.ts\`. No editar a mano.\n\n| Módulo | Qué hace | Paquetes | Rutas (chezmoi) | Riesgo | Cómo revertir |\n|---|---|---|---|---|---|\n${rows.join("\n")}\n`;
writeFileSync(join(root, "docs", "modules.md"), out);
console.log(`docs/modules.md: ${mods.length} módulos`);
