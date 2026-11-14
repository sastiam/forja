import { existsSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { log } from "../../cli/src/core/log.ts";
import { expandHome } from "../../cli/src/core/paths.ts";
import type { Action, CheckResult, ModuleCtx } from "../../cli/src/core/plan.ts";
import { confirm, isInteractive } from "../../cli/src/core/prompt.ts";
import { commandExists } from "../../cli/src/core/runners/shell.ts";

// VERIFICAR: ruta global de skills de OpenCode (¿~/.config/opencode/skills?) y si OpenCode
// ya lee ~/.claude/skills; en ese caso NO enlazar dos veces. Ver BACKLOG.md.
const CLAUDE_SKILLS = "~/.claude/skills";

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
  ];
}
