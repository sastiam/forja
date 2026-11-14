import { existsSync } from "node:fs";
import { log } from "../../cli/src/core/log.ts";
import { LOOPER_BIN, LOOPER_REF, LOOPER_REPO, looperDir } from "../../cli/src/core/looper.ts";
import type { Action, CheckResult, ModuleCtx } from "../../cli/src/core/plan.ts";
import { commandExists, type Runner } from "../../cli/src/core/runners/shell.ts";

async function head(runner: Runner, dir: string): Promise<string | null> {
  if (!existsSync(dir)) return null;
  const r = await runner.query("git", ["-C", dir, "rev-parse", "HEAD"]);
  return r.code === 0 ? r.stdout.trim() : null;
}

export async function plan(ctx: ModuleCtx): Promise<Action[]> {
  const dir = looperDir();
  const at = await head(ctx.runner, dir);
  return [
    {
      kind: "step",
      description: at
        ? `openspec-cascade en ${LOOPER_REF.slice(0, 7)} (ahora ${at.slice(0, 7)}) + bun install + bun link`
        : `clonar openspec-cascade en ${dir} (${LOOPER_REF.slice(0, 7)}) + bun install + bun link`,
      pending: at !== LOOPER_REF || !(await commandExists(ctx.runner, LOOPER_BIN)),
    },
  ];
}

export async function apply(ctx: ModuleCtx): Promise<void> {
  const { runner } = ctx;
  const dir = looperDir();
  if (!(await commandExists(runner, "bun")))
    throw new Error("falta bun: forja apply runtimes (mise instala bun)");
  if (!existsSync(dir)) {
    log.step(`git clone ${LOOPER_REPO}`);
    const r = await runner.exec("git", ["clone", "--quiet", LOOPER_REPO, dir], { stream: true });
    if (r.code !== 0) throw new Error("git clone de openspec-cascade falló");
  }
  if ((await head(runner, dir)) !== LOOPER_REF) {
    const dirty = (await runner.query("git", ["-C", dir, "status", "--porcelain"])).stdout.trim();
    if (dirty) throw new Error(`${dir} tiene cambios locales; no se cambia de versión`);
    await runner.exec("git", ["-C", dir, "fetch", "--quiet", "origin"], { stream: true });
    const r = await runner.exec("git", ["-C", dir, "checkout", "--quiet", "--detach", LOOPER_REF]);
    if (r.code !== 0) throw new Error(`no se pudo hacer checkout de ${LOOPER_REF}`);
  }
  for (const args of [["install", "--frozen-lockfile"], ["link"]]) {
    const r = await runner.exec("bun", args, { cwd: dir, stream: true });
    if (r.code !== 0) throw new Error(`bun ${args.join(" ")} falló`);
  }
}

export async function check(ctx: ModuleCtx): Promise<CheckResult[]> {
  const at = await head(ctx.runner, looperDir());
  const bin = await ctx.runner.query(LOOPER_BIN, ["--help"], { timeoutMs: 15000 });
  return [
    {
      name: `openspec-cascade en ${LOOPER_REF.slice(0, 7)}`,
      ok: at === LOOPER_REF,
      warn: at !== null,
      detail: at
        ? at === LOOPER_REF
          ? undefined
          : `está en ${at.slice(0, 7)}`
        : "no instalado (forja apply looper)",
    },
    {
      name: `${LOOPER_BIN} --help`,
      ok: bin.code === 0,
      detail: bin.code === 0 ? undefined : "¿~/.bun/bin en el PATH? (bun link)",
    },
  ];
}
