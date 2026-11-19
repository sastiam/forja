import { readFile } from "node:fs/promises";
import { totalmem } from "node:os";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { loadOverlay } from "../core/claude-overlay.ts";
import { settingsData as claudePluginsData } from "../core/claude-plugins.ts";
import { claudeSandbox } from "../core/claude-sandbox.ts";
import { load } from "../core/context.ts";
import { log, out } from "../core/log.ts";
import type { Module } from "../core/modules.ts";
import { chezmoiConfigPath, home } from "../core/paths.ts";
import {
  type Ctx,
  chezmoiSource,
  computePlan,
  dnfFile,
  loadHooks,
  type ModuleCtx,
  moduleTargets,
  osName,
  thirdPartyFile,
  tildify,
} from "../core/plan.ts";
import { confirm, isInteractive } from "../core/prompt.ts";
import * as brew from "../core/runners/brew.ts";
import * as chezmoi from "../core/runners/chezmoi.ts";
import * as dnf from "../core/runners/dnf.ts";
import { saveLastApply } from "../core/state.ts";
import { applyThirdParty, readThirdParty } from "../core/thirdparty.ts";
import { stringify, type TomlTable } from "../core/toml.ts";
import { renderPlan } from "./plan.ts";

/**
 * Memoria de tsserver en Zed: un octavo de la RAM, entre 3 y 8 GB. Con varios
 * worktrees abiertos hay un tsserver por ventana, así que no conviene subir más.
 */
export function zedTsMemoryMb(memBytes: number): number {
  const mb = Math.round(memBytes / 1024 ** 2 / 8);
  return Math.min(8192, Math.max(3072, mb));
}

/** Escribe ~/.config/chezmoi/chezmoi.toml derivado del perfil (datos personales: solo en la máquina). */
export async function writeChezmoiConfig(ctx: Ctx): Promise<void> {
  const p = ctx.profile;
  const overlay = await loadOverlay();
  if (overlay?.overrides.length)
    log.warn(
      `claude.settings.json (local) reemplaza claves que forja gestiona: ${overlay.overrides.join(", ")}` +
        (overlay.overrides.some((k) => k === "sandbox" || k === "permissions")
          ? " — incluye seguridad (sandbox/permissions); forja doctor avisa si el sandbox no coincide"
          : ""),
    );
  const data: TomlTable = {
    host: ctx.host.name,
    modules: ctx.enabled,
    name: p.identity.name,
    email: p.identity.email,
    work_enabled: p.profiles.work?.enabled === true,
    secrets_provider: p.secrets.provider,
    claude_sandbox: { ...claudeSandbox(ctx.host, p, ctx.enabled) },
    /** Vacío = la plantilla no escribe "model" y Claude Code usa su modelo por defecto. */
    claude_model: p.claude.model ?? "",
    /** Vacío = la plantilla no escribe "theme" (lo que guarda /config). */
    claude_theme: p.claude.theme ?? "",
    /** Capa personal de settings.json (claves de primer nivel que se añaden al final); "" = ninguna. */
    claude_overlay: overlay?.fragment ?? "",
    zed_ts_memory_mb: zedTsMemoryMb(totalmem()),
    /** Marketplaces y plugins de Claude Code (settings.json); ADR 0012. */
    ...claudePluginsData(ctx.root, p.claude.plugins_skip),
  };
  await ctx.runner.writeFile(
    chezmoiConfigPath(),
    stringify({ sourceDir: chezmoiSource(ctx.root), data }),
    0o600,
  );
}

/** `--revert` exige nombrar los módulos: nunca revierte «todo lo habilitado». */
async function revertModules(names: string[], dryRun: boolean, yes: boolean): Promise<number> {
  if (!names.length) {
    log.error("uso: forja apply <módulo…> --revert");
    return 1;
  }
  const { ctx, all } = await load({ dryRun, names });
  for (const name of names) {
    const m = all.get(name) as Module;
    const hooks = await loadHooks(m);
    if (!hooks.revert) {
      log.info(`${name}: sin revert automático; pasos manuales:`);
      try {
        out(await readFile(join(m.dir, "revert.md"), "utf8"));
      } catch {
        out("  (sin revert.md)");
      }
      continue;
    }
    if (!dryRun && !yes && !(isInteractive() && (await confirm(`¿Revertir ${name}?`)))) return 3;
    log.step(`revert ${name}`);
    await hooks.revert({ ...ctx, module: m });
    log.ok(`${name} revertido`);
  }
  if (dryRun) for (const s of ctx.runner.skipped) log.info(`  · ${s}`);
  return 0;
}

export async function applyCommand(argv: string[]): Promise<number> {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      yes: { type: "boolean" },
      "dry-run": { type: "boolean" },
      "i-understand-the-risks": { type: "boolean" },
      revert: { type: "boolean" },
      force: { type: "boolean" },
    },
  });
  const dryRun = values["dry-run"] === true;
  if (values.revert) return revertModules(positionals, dryRun, values.yes === true);
  const { ctx, all, order } = await load({ dryRun, names: positionals });

  if (order.includes("macos-aggressive")) {
    const explicit =
      positionals.includes("macos-aggressive") || ctx.enabled.includes("macos-aggressive");
    if (!explicit || !values["i-understand-the-risks"]) {
      log.error("macos-aggressive exige estar habilitado y --i-understand-the-risks.");
      return 3;
    }
  }

  const plans = await computePlan(ctx, all, order);
  out(renderPlan(plans));
  if (!dryRun && !values.yes) {
    if (!isInteractive()) {
      log.error("Se requiere confirmación: usa --yes en modo no interactivo.");
      return 3;
    }
    if (!(await confirm("¿Aplicar estos cambios?"))) return 3;
  }

  // Antes de escribir nada: chezmoi pide confirmación por TTY para lo cambiado
  // fuera de él, y sin TTY fallaría a mitad del apply.
  const force = values.force === true;
  const targets = order.flatMap((n) => {
    const m = all.get(n);
    return m && (!m.os.length || m.os.includes(osName(ctx.platform)))
      ? moduleTargets(m, ctx.platform)
      : [];
  });
  const outside = await chezmoi.conflicts(ctx.runner, chezmoiSource(ctx.root), targets, home());
  if (outside.length) {
    const list = outside.map((f) => `  ~ ${tildify(f)}`).join("\n");
    if (force) log.warn(`--force: se sobrescriben cambios hechos fuera de chezmoi:\n${list}`);
    else if (!dryRun && !isInteractive()) {
      log.error(
        `Archivos cambiados fuera de chezmoi que apply sobrescribiría:\n${list}\n` +
          "Revisa el cambio (chezmoi diff <archivo>) y elige:\n" +
          "  · conservarlo: forja capture (o muévelo al perfil / git.local.gitconfig)\n" +
          "  · descartarlo: forja apply … --yes --force",
      );
      return 3;
    } else log.warn(`chezmoi preguntará antes de sobrescribir:\n${list}`);
  }

  await writeChezmoiConfig(ctx);
  const results: { name: string; ok: boolean }[] = [];
  let failed = false;
  for (const name of order) {
    const m = all.get(name);
    if (!m) continue;
    if (m.os.length && !m.os.includes(osName(ctx.platform))) {
      log.info(`– ${name}: no aplica a ${ctx.platform}`);
      continue;
    }
    log.step(`${name}: ${m.summary}`);
    const mctx: ModuleCtx = { ...ctx, module: m };
    try {
      if (m.hasBrewfile && ctx.platform === "darwin") {
        const file = join(m.dir, "Brewfile");
        // El plan confirmado ya listaba estos taps como «confiar en el tap…».
        for (const tap of await brew.untrustedTaps(ctx.runner, file)) {
          const t = await brew.trustTap(ctx.runner, tap);
          if (t.code !== 0) throw new Error(`brew trust --tap ${tap} falló`);
        }
        const r = await brew.bundleApply(ctx.runner, file);
        if (r.code !== 0) throw new Error(`brew bundle falló (${r.code})`);
      }
      const pkgFile = dnfFile(m, ctx.platform);
      if (pkgFile) {
        const missing = await dnf.missingPackages(ctx.runner, await dnf.readPackages(pkgFile));
        if (missing === null) throw new Error("falta rpm: este host no parece Fedora");
        if (missing.length) {
          const r = await dnf.installMissing(ctx.runner, missing);
          if (r.code !== 0) throw new Error(`dnf install falló (${r.code})`);
        }
      }
      const thirdParty = thirdPartyFile(m, ctx.platform);
      if (thirdParty)
        await applyThirdParty(
          ctx.runner,
          await readThirdParty(thirdParty),
          ctx.profile.fedora?.trusted_repos ?? [],
        );
      if (moduleTargets(m, ctx.platform).length) {
        const r = await chezmoi.apply(
          ctx.runner,
          chezmoiSource(ctx.root),
          moduleTargets(m, ctx.platform),
          {
            force,
          },
        );
        if (r.code !== 0) throw new Error(`chezmoi apply falló: ${r.stderr.trim()}`);
      }
      await (await loadHooks(m)).apply?.(mctx);
      results.push({ name, ok: true });
      log.ok(name);
    } catch (e) {
      results.push({ name, ok: false });
      log.error(`${name}: ${(e as Error).message}`);
      failed = true;
      break;
    }
  }
  if (dryRun) {
    log.info(`\ndry-run: ${ctx.runner.skipped.length} acción(es) omitidas`);
    for (const s of ctx.runner.skipped) log.info(`  · ${s}`);
  } else await saveLastApply({ at: new Date().toISOString(), modules: results });
  return failed ? 1 : 0;
}
