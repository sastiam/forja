import type { EngineInterface, Register } from "claude-code";
import {
  awsCommandIn,
  classifyAws,
  isAwsMcpTool,
  type Linter,
  linesOf,
  linterArgs,
  linterFor,
  parseFindings,
  report,
} from "./logic.js";

const LINT_TIMEOUT_MS = 5000;

/** Corre el linter del proyecto (node_modules/.bin) o el global; undefined si no hay. */
async function lint($: EngineInterface, linter: Linter, path: string): Promise<string | undefined> {
  const candidates = linter === "biome" ? ["node_modules/.bin/biome", "biome"] : ["ruff"];
  for (const bin of candidates) {
    try {
      const r = await $.process.run([bin, ...linterArgs(linter, path)], {
        timeoutMs: LINT_TIMEOUT_MS,
      });
      return r.stdout;
    } catch {
      // no instalado: prueba el siguiente
    }
  }
  return undefined;
}

export const register: Register = (on, options) => {
  if (options.magic_numbers !== false)
    on("tool.call", { tool: ["Edit", "Write"] }, async ($, e, next) => {
      const ran = await next(e);
      if (ran.deny !== undefined || ran.isError === true) return ran;
      if (!("file_path" in e) || typeof e.file_path !== "string") return ran;
      const linter = linterFor(e.file_path);
      if (!linter) return ran;
      const stdout = await lint($, linter, e.file_path);
      if (!stdout) return ran;
      const fragment =
        e.tool === "Edit" && "new_string" in e && typeof e.new_string === "string"
          ? e.new_string
          : undefined;
      const range = fragment ? linesOf(await $.fs.read(e.file_path), fragment) : undefined;
      const text = report(e.file_path, parseFindings(linter, stdout), range);
      return text ? { ...ran, context: [...(ran.context ?? []), text] } : ran;
    });

  if (options.aws_guard !== false) {
    on("tool.check", { tool: "Bash" }, async ($, e, next) => {
      const input = e.input as { command?: unknown };
      if (typeof input.command !== "string") return next(e);
      const verdict = classifyAws(input.command, await $.env.get("AWS_PROFILE"));
      if (verdict.level === "pass") return next(e);
      const base = await next(e);
      if (base.decision === "deny") return base;
      return { decision: verdict.level, reason: verdict.reason };
    }).catch(($, e, next) => next(e));

    on("tool.check", { tool: /^mcp__.*aws/i }, async ($, e, next) => {
      if (!isAwsMcpTool(e.tool)) return next(e);
      const command = awsCommandIn(e.input);
      const verdict = command
        ? classifyAws(command, await $.env.get("AWS_PROFILE"))
        : e.isReadOnly
          ? { level: "pass" as const }
          : {
              level: "ask" as const,
              reason: `quality-guard: ${e.tool} puede cambiar recursos en una cuenta AWS real. ¿Seguro?`,
            };
      if (verdict.level === "pass") return next(e);
      const base = await next(e);
      if (base.decision === "deny") return base;
      return { decision: verdict.level, reason: verdict.reason };
    }).catch(($, e, next) => next(e));
  }
};
