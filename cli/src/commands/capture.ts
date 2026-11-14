import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { load } from "../core/context.ts";
import { log, out, outJson } from "../core/log.ts";
import type { Module } from "../core/modules.ts";
import { chezmoiSource, moduleTargets } from "../core/plan.ts";
import { ask, confirm, isInteractive } from "../core/prompt.ts";
import { BREW_OFFLINE_ENV } from "../core/runners/brew.ts";
import { commandExists, createRunner, type Runner } from "../core/runners/shell.ts";
import { filterCapturable } from "./capture-filter.ts";

export interface Declared {
  kind: "brew" | "cask";
  name: string;
  module: string;
}

/** Entradas `brew "x"` / `cask "x"` de un Brewfile. `tap/x/y` se normaliza a `y`. */
export function parseBrewfile(text: string, module: string): Declared[] {
  const out: Declared[] = [];
  for (const line of text.split("\n")) {
    const m = /^\s*(brew|cask)\s+"([^"]+)"/.exec(line);
    if (m) out.push({ kind: m[1] as "brew" | "cask", name: m[2]?.split("/").at(-1) ?? "", module });
  }
  return out;
}

/** Instalado y no declarado en ningún Brewfile. */
export function unmanaged(
  installed: { brew: string[]; cask: string[] },
  declared: Declared[],
): { kind: "brew" | "cask"; name: string }[] {
  // `brew leaves` da el nombre completo de las fórmulas de tap (org/tap/x).
  const has = (kind: string, name: string) =>
    declared.some((d) => d.kind === kind && d.name === name.split("/").at(-1));
  return [
    ...installed.brew
      .filter((n) => !has("brew", n))
      .map((name) => ({ kind: "brew" as const, name })),
    ...installed.cask
      .filter((n) => !has("cask", n))
      .map((name) => ({ kind: "cask" as const, name })),
  ];
}

/**
 * `chezmoi status`: la primera columna marca lo que cambió en el disco desde el
 * último apply. Eso es lo que se captura; la segunda columna es lo que apply cambiaría.
 */
export function changedOnDisk(status: string, home: string): string[] {
  return status
    .split("\n")
    .filter((l) => l.length > 3 && (l[0] === "M" || l[0] === "A"))
    .map((l) => join(home, l.slice(3).trim()));
}

const lines = (s: string) =>
  s
    .split("\n")
    .map((x) => x.trim())
    .filter(Boolean);

async function installedPackages(runner: Runner) {
  const opts = { env: BREW_OFFLINE_ENV };
  const brew = await runner.query("brew", ["leaves", "--installed-on-request"], opts);
  const cask = await runner.query("brew", ["list", "--cask", "-1"], opts);
  return { brew: lines(brew.stdout), cask: lines(cask.stdout) };
}

async function declaredPackages(all: Map<string, Module>): Promise<Declared[]> {
  const d: Declared[] = [];
  for (const m of all.values())
    if (m.hasBrewfile)
      d.push(...parseBrewfile(await readFile(join(m.dir, "Brewfile"), "utf8"), m.name));
  return d;
}

export async function captureCommand(argv: string[]): Promise<number> {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: { json: { type: "boolean" }, yes: { type: "boolean" } },
  });
  const { ctx, all } = await load({ dryRun: true });
  const runner = ctx.runner;
  /** Solo escribe tras una respuesta explícita (módulo elegido o confirmación). */
  const live = createRunner(false);
  const only = positionals[0];
  if (only && !all.has(only)) throw new Error(`módulo desconocido: ${only}`);

  const pkgs = (await commandExists(runner, "brew"))
    ? unmanaged(await installedPackages(runner), await declaredPackages(all))
    : [];

  let files: string[] = [];
  let templates: string[] = [];
  const source = chezmoiSource(ctx.root);
  if (await commandExists(runner, "chezmoi")) {
    const mod = only ? all.get(only) : undefined;
    const targets = mod ? moduleTargets(mod) : [];
    const st = await runner.query("chezmoi", ["--source", source, "status", ...targets]);
    const changed = changedOnDisk(st.stdout, homedir());
    for (const f of changed) {
      const sp = await runner.query("chezmoi", ["--source", source, "source-path", f]);
      (sp.stdout.trim().endsWith(".tmpl") ? templates : files).push(f);
    }
  }
  const filtered = filterCapturable(files, homedir());
  files = filtered.allowed;
  templates = filterCapturable(templates, homedir()).allowed;

  if (values.json) {
    outJson({ packages: pkgs, files, templates, rejected: filtered.rejected });
    return 0;
  }
  if (!pkgs.length && !files.length && !templates.length) {
    out("Nada que capturar: lo instalado y los archivos coinciden con el repo.");
    return 0;
  }
  if (pkgs.length) {
    out("Paquetes instalados fuera de los Brewfiles:");
    for (const p of pkgs) out(`  + ${p.kind} "${p.name}"`);
  }
  if (files.length) {
    out("Archivos cambiados en el disco (chezmoi re-add):");
    for (const f of files) out(`  ~ ${f}`);
  }
  if (templates.length) {
    out("Plantillas cambiadas: intégralas a mano (host, perfil o la .tmpl):");
    for (const f of templates) out(`  ! ${f}`);
  }
  if (filtered.rejected.length) log.info(`Omitidos por sensibles: ${filtered.rejected.length}`);

  if (!isInteractive() && !values.yes) {
    log.info(
      "Sin TTY: solo informe. Usa --yes para re-add de archivos (los paquetes piden módulo).",
    );
    return 2;
  }

  if (pkgs.length && isInteractive()) {
    const names = [...all.keys()].filter((n) => all.get(n)?.hasBrewfile).join(", ");
    for (const p of pkgs) {
      const m = await ask(`¿Módulo para ${p.kind} "${p.name}"? (${names}; Enter = omitir)`);
      if (!m) continue;
      const mod = all.get(m);
      if (!mod?.hasBrewfile) {
        log.warn(`${m} no tiene Brewfile; omitido`);
        continue;
      }
      const file = join(mod.dir, "Brewfile");
      const text = await readFile(file, "utf8");
      await live.writeFile(file, `${text.replace(/\n?$/, "\n")}${p.kind} "${p.name}"\n`);
      log.ok(`${p.kind} "${p.name}" → modules/${m}/Brewfile`);
    }
  }
  if (
    files.length &&
    (values.yes || (await confirm(`¿chezmoi re-add de ${files.length} archivo(s)?`)))
  ) {
    const r = await live.exec("chezmoi", ["--source", source, "re-add", ...files], {
      stream: true,
    });
    if (r.code !== 0) throw new Error("chezmoi re-add falló");
  }
  const diff = await runner.query("git", ["-C", ctx.root, "diff", "--stat"]);
  if (diff.stdout.trim()) {
    out(`\nCambios en el repo (sin commit):\n${diff.stdout}`);
    out("Revisa con git diff, crea una rama y haz commit con Conventional Commits.");
  }
  return 0;
}
