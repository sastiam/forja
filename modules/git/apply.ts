import {
  GIT_GLOBAL_CONFIG,
  moveCommands,
  personalGitKeys,
} from "../../cli/src/core/git-personal.ts";
import { expandHome } from "../../cli/src/core/paths.ts";
import type { CheckResult, ModuleCtx } from "../../cli/src/core/plan.ts";

/**
 * Identidad y firma en la config global en vez de en git.local.gitconfig:
 * `forja apply git` las borraría (chezmoi) y `forja capture` las subiría al repo.
 */
export async function check(ctx: ModuleCtx): Promise<CheckResult[]> {
  const r = await ctx.runner.query("git", [
    "config",
    "--file",
    expandHome(GIT_GLOBAL_CONFIG),
    "--list",
  ]);
  const found = r.code === 0 ? personalGitKeys(r.stdout) : [];
  return [
    {
      name: "git: identidad y firma fuera de la config global",
      ok: found.length === 0,
      warn: true,
      detail: found.length
        ? `${found.map((e) => e.key).join(", ")} → muévelas a git.local.gitconfig:\n      ${moveCommands(found).join("\n      ")}`
        : undefined,
    },
  ];
}
