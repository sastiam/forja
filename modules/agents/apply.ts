import { existsSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import {
  enabledPlugins,
  installedIds,
  marketOf,
  marketplaceArg,
  marketplaceNames,
  marketplaces,
  PLUGINS,
  unknownSkips,
} from "../../cli/src/core/claude-plugins.ts";
import { log } from "../../cli/src/core/log.ts";
import { installSkills, skillsAction, skillsCheck } from "../../cli/src/core/openspec-skills.ts";
import { expandHome } from "../../cli/src/core/paths.ts";
import {
  type Action,
  type CheckResult,
  chezmoiSource,
  type ModuleCtx,
} from "../../cli/src/core/plan.ts";
import { confirm, isInteractive } from "../../cli/src/core/prompt.ts";
import * as chezmoi from "../../cli/src/core/runners/chezmoi.ts";
import { commandExists, type Runner } from "../../cli/src/core/runners/shell.ts";

// OpenCode lee ~/.claude/skills como fuente global de compatibilidad
// (https://opencode.ai/docs/skills/), así que las skills se enlazan solo ahí.
const CLAUDE_SKILLS = "~/.claude/skills";
const CLAUDE_SETTINGS = "~/.claude/settings.json";

const pluginsSkip = (ctx: ModuleCtx): string[] => ctx.profile?.claude.plugins_skip ?? [];

/** Plugins activos según el perfil que aún no están instalados (sin claude: todos). */
async function missingPlugins(ctx: ModuleCtx): Promise<string[]> {
  const wanted = enabledPlugins(pluginsSkip(ctx));
  if (!(await commandExists(ctx.runner, "claude"))) return wanted;
  const r = await ctx.runner.query("claude", ["plugin", "list", "--json"], { timeoutMs: 30000 });
  const installed = new Set(r.code === 0 ? installedIds(r.stdout) : []);
  return wanted.filter((id) => !installed.has(id));
}

/**
 * settings.json ya declara marketplaces y plugins (chezmoi), pero Claude Code solo los
 * materializa en una sesión interactiva. Aquí se instalan con la CLI; como `plugin install`
 * reescribe settings.json con otro formato, después chezmoi lo deja como en el repo.
 */
async function installPlugins(ctx: ModuleCtx): Promise<void> {
  const { runner } = ctx;
  const missing = await missingPlugins(ctx);
  if (!missing.length) return;
  const known = marketplaceNames(
    (await runner.query("claude", ["plugin", "marketplace", "list", "--json"])).stdout,
  );
  const all = marketplaces(ctx.root);
  for (const name of new Set(missing.map(marketOf))) {
    const source = all[name];
    if (!source || known.includes(name)) continue;
    log.step(`Claude Code: marketplace ${name}`);
    const r = await runner.exec("claude", [
      "plugin",
      "marketplace",
      "add",
      marketplaceArg(source),
      "--scope",
      "user",
    ]);
    if (r.code !== 0) log.warn(`no se pudo añadir el marketplace ${name}: ${r.stderr.trim()}`);
  }
  for (const id of missing) {
    log.step(`Claude Code: plugin ${id}`);
    const r = await runner.exec("claude", ["plugin", "install", id, "--scope", "user"]);
    if (r.code !== 0) log.warn(`no se pudo instalar ${id}: ${r.stderr.trim()}`);
  }
  const r = await chezmoi.apply(runner, chezmoiSource(ctx.root), [expandHome(CLAUDE_SETTINGS)], {
    force: true,
  });
  if (r.code !== 0) log.warn(`chezmoi no pudo restaurar ${CLAUDE_SETTINGS}: ${r.stderr.trim()}`);
}

async function skillDirs(root: string): Promise<string[]> {
  return (await readdir(join(root, "skills"), { withFileTypes: true }))
    .filter((e) => e.isDirectory())
    .map((e) => e.name);
}

export async function plan(ctx: ModuleCtx): Promise<Action[]> {
  const actions: Action[] = [];
  actions.push({
    kind: "step",
    description: "instalar Claude Code (instalador nativo)",
    pending: !(await commandExists(ctx.runner, "claude")),
  });
  const missing = (await skillDirs(ctx.root)).filter(
    (s) => !existsSync(join(expandHome(CLAUDE_SKILLS), s)),
  );
  actions.push({
    kind: "step",
    description: `enlazar skills en ${CLAUDE_SKILLS}${missing.length ? ` (faltan: ${missing.join(", ")})` : ""}`,
    pending: missing.length > 0,
  });
  actions.push(await skillsAction(ctx.runner));
  const missingP = await missingPlugins(ctx);
  actions.push({
    kind: "step",
    description: `plugins de Claude Code${missingP.length ? ` (faltan: ${missingP.join(", ")})` : ""}`,
    pending: missingP.length > 0,
  });
  actions.push({
    kind: "guide",
    description:
      "Hermes: instalador oficial, con confirmación (se muestra el script antes de ejecutarlo)",
    pending: !(await commandExists(ctx.runner, "hermes")),
  });
  return actions;
}

export async function apply(ctx: ModuleCtx): Promise<void> {
  const { runner } = ctx;
  if (!(await commandExists(runner, "claude"))) {
    log.step("Instalando Claude Code (instalador nativo)");
    const r = await runner.exec("sh", ["-c", "curl -fsSL https://claude.ai/install.sh | bash"], {
      stream: true,
    });
    if (r.code !== 0) throw new Error("falló el instalador de Claude Code");
  }
  for (const s of await skillDirs(ctx.root))
    await runner.link(join(ctx.root, "skills", s), join(expandHome(CLAUDE_SKILLS), s));
  await installSkills(runner);
  await installPlugins(ctx);

  if (!(await commandExists(runner, "hermes"))) {
    const script = "/tmp/hermes-install.sh";
    await runner.exec("curl", [
      "-fsSL",
      "https://hermes-agent.nousresearch.com/install.sh",
      "-o",
      script,
    ]);
    if (runner.dryRun) return;
    if (!isInteractive())
      return log.warn(
        "Hermes omitido: requiere confirmación interactiva (revisa el instalador antes de ejecutarlo).",
      );
    log.info((await runner.query("cat", [script])).stdout);
    if (await confirm("¿Ejecutar este instalador de Hermes? (no se activa el gateway)")) {
      await runner.exec("bash", [script], { stream: true });
      await runner.exec("hermes", ["doctor"], { stream: true });
    }
  }
}

const firstLine = (s: string): string => s.trim().split("\n")[0] ?? "";

/** `<cmd> --version` responde. Detecta binarios instalados pero rotos (p. ej. Hermes). */
async function versionCheck(runner: Runner, cmd: string): Promise<CheckResult> {
  const r = await runner.query(cmd, ["--version"], { timeoutMs: 15000 });
  return r.code === 0
    ? { name: `${cmd} --version`, ok: true, detail: firstLine(r.stdout) || undefined }
    : {
        name: `${cmd} --version`,
        ok: false,
        detail: firstLine(r.stderr || r.stdout) || `sale con ${r.code}`,
      };
}

/**
 * OpenCode se instala con brew. Su instalador oficial deja el binario en
 * ~/.opencode/bin y lo antepone al PATH en ~/.zshrc, tapando el de brew y
 * quedando fuera de drift/report.
 */
async function opencodeChecks(runner: Runner, platform: string): Promise<CheckResult[]> {
  if (!(await commandExists(runner, "opencode")))
    return [{ name: "opencode", ok: false, detail: "no instalado (forja apply agents)" }];
  const path = (await runner.query("sh", ["-c", "command -v opencode"])).stdout.trim();
  const unmanaged = path.startsWith(join(homedir(), ".opencode"));
  return [
    {
      name: `opencode instalado con ${platform === "linux" ? "mise" : "brew"}`,
      ok: !unmanaged,
      warn: true,
      detail: unmanaged
        ? `${path} es del instalador oficial: quita ~/.opencode/bin del PATH en ~/.zshrc y borra ~/.opencode`
        : undefined,
    },
    await versionCheck(runner, "opencode"),
  ];
}

/** Hermes es opcional: si no está instalado es un aviso; si está y no responde, un fallo. */
async function hermesChecks(runner: Runner): Promise<CheckResult[]> {
  if (!(await commandExists(runner, "hermes")))
    return [{ name: "hermes", ok: false, warn: true, detail: "no instalado (opcional)" }];
  return [await versionCheck(runner, "hermes")];
}

/** Plugins de Claude Code instalados, rtk (token-saver) y uv (MCP de aws-core). */
async function pluginChecks(ctx: ModuleCtx): Promise<CheckResult[]> {
  const { runner } = ctx;
  const skip = pluginsSkip(ctx);
  const results: CheckResult[] = [];
  const unknown = unknownSkips(skip);
  if (unknown.length)
    results.push({
      name: "[claude] plugins_skip",
      ok: false,
      warn: true,
      detail: `no existen: ${unknown.join(", ")} (ver cli/src/core/claude-plugins.ts)`,
    });
  if (await commandExists(runner, "claude")) {
    const missing = await missingPlugins(ctx);
    results.push({
      name: "plugins de Claude Code",
      ok: missing.length === 0,
      warn: true,
      detail: missing.length
        ? `faltan ${missing.map((id) => `${id} (${PLUGINS[id]})`).join(", ")}: forja apply agents`
        : undefined,
    });
  }
  const enabled = enabledPlugins(skip);
  if (enabled.includes("token-saver@forja")) {
    const r = await runner.query("rtk", ["gain", "--help"], { timeoutMs: 15000 });
    results.push({
      name: "rtk (token-saver)",
      ok: r.code === 0,
      warn: true,
      detail:
        r.code === 0
          ? undefined
          : "no responde a `rtk gain`: forja apply agents (si es otro «rtk», p. ej. Rust Type Kit, desinstálalo)",
    });
  }
  if (enabled.includes("aws-core@agent-toolkit-for-aws")) {
    const uvx = await commandExists(runner, "uvx");
    results.push({
      name: "uv (MCP de aws-core)",
      ok: uvx,
      warn: true,
      detail: uvx ? undefined : "falta uvx: forja apply agents",
    });
  }
  return results;
}

export async function check(ctx: ModuleCtx): Promise<CheckResult[]> {
  const missing = (await skillDirs(ctx.root)).filter(
    (s) => !existsSync(join(expandHome(CLAUDE_SKILLS), s)),
  );
  return [
    {
      name: "skills enlazadas",
      ok: missing.length === 0,
      detail: missing.length ? `faltan ${missing.join(", ")}` : undefined,
    },
    await skillsCheck(ctx.runner),
    ...(await opencodeChecks(ctx.runner, ctx.platform)),
    ...(await hermesChecks(ctx.runner)),
    ...(await pluginChecks(ctx)),
  ];
}
