import { join } from "node:path";
import { parseArgs } from "node:util";
import { claudeSandbox } from "../core/claude-sandbox.ts";
import { load } from "../core/context.ts";
import { log, out } from "../core/log.ts";
import { chezmoiConfigPath } from "../core/paths.ts";
import {
  type Ctx,
  chezmoiSource,
  computePlan,
  loadHooks,
  type ModuleCtx,
  moduleTargets,
  osName,
} from "../core/plan.ts";
import { confirm, isInteractive } from "../core/prompt.ts";
import * as brew from "../core/runners/brew.ts";
import * as chezmoi from "../core/runners/chezmoi.ts";
import { saveLastApply } from "../core/state.ts";
import { stringify, type TomlTable } from "../core/toml.ts";
import { renderPlan } from "./plan.ts";

/** Escribe ~/.config/chezmoi/chezmoi.toml derivado del perfil (datos personales: solo en la máquina). */
export async function writeChezmoiConfig(ctx: Ctx): Promise<void> {
  const p = ctx.profile;
  const data: TomlTable = {
    host: ctx.host.name,
    modules: ctx.enabled,
    name: p.identity.name,
    email: p.identity.email,
    work_enabled: p.profiles.work?.enabled === true,
    secrets_provider: p.secrets.provider,
    claude_sandbox: { ...claudeSandbox(ctx.host, p, ctx.enabled) },
  };
  await ctx.runner.writeFile(
    chezmoiConfigPath(),
    stringify({ sourceDir: chezmoiSource(ctx.root), data }),
    0o600,
  );
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
    },
  });
  if (values.revert) {
    log.error("--revert llega en v0.3.0 (macos-aggressive). Ver modules/<m>/revert.md.");
    return 1;
  }
  const dryRun = values["dry-run"] === true;
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
        const r = await brew.bundleApply(ctx.runner, join(m.dir, "Brewfile"));
        if (r.code !== 0) throw new Error(`brew bundle falló (${r.code})`);
      }
      if (m.targets.length) {
        const r = await chezmoi.apply(ctx.runner, chezmoiSource(ctx.root), moduleTargets(m));
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
