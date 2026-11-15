import { existsSync } from "node:fs";
import { join } from "node:path";
import { log } from "../../cli/src/core/log.ts";
import {
  bunBinDir,
  LOOPER_BIN,
  LOOPER_REF,
  LOOPER_REPO,
  looperDir,
} from "../../cli/src/core/looper.ts";
import type { Action, CheckResult, ModuleCtx } from "../../cli/src/core/plan.ts";
import { commandExists, type Runner } from "../../cli/src/core/runners/shell.ts";

async function head(runner: Runner, dir: string): Promise<string | null> {
  if (!existsSync(dir)) return null;
  const r = await runner.query("git", ["-C", dir, "rev-parse", "HEAD"]);
  return r.code === 0 ? r.stdout.trim() : null;
}

/** `bun link` hecho: el binario existe en ~/.bun/bin aunque esta shell no lo tenga en el PATH. */
const linked = (): boolean => existsSync(join(bunBinDir(), LOOPER_BIN));

export async function plan(ctx: ModuleCtx): Promise<Action[]> {
  const dir = looperDir();
  const at = await head(ctx.runner, dir);
  const ref = LOOPER_REF.slice(0, 7);
  if (at === LOOPER_REF && linked())
    return [{ kind: "step", description: `openspec-cascade en ${ref}, enlazado`, pending: false }];
  return [
    {
      kind: "step",
      description: !at
        ? `clonar openspec-cascade en ${dir} (${ref}) + bun install + bun link`
        : at !== LOOPER_REF
          ? `openspec-cascade a ${ref} (ahora ${at.slice(0, 7)}) + bun install + bun link`
          : `openspec-cascade sin enlazar en ${bunBinDir()}: bun install + bun link`,
      pending: true,
    },
  ];
}

export async function apply(ctx: ModuleCtx): Promise<void> {
  const { runner } = ctx;
  const dir = looperDir();
  if (!(await commandExists(runner, "bun")))
    throw new Error(
      "falta bun: ejecuta `mise install` (forja apply runtimes lo hace) y abre una terminal nueva",
    );
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
    binCheck(bin.code === 0, linked()),
  ];
}

/**
 * `--help` falla por dos motivos distintos: falta `bun link` (fallo) o el
 * binario está enlazado pero esta shell arrancó antes de que existiera
 * ~/.bun/bin (aviso: basta una terminal nueva).
 */
export function binCheck(runs: boolean, isLinked: boolean): CheckResult {
  const name = `${LOOPER_BIN} --help`;
  if (runs) return { name, ok: true };
  if (isLinked)
    return {
      name,
      ok: false,
      warn: true,
      detail:
        "enlazado en ~/.bun/bin pero no está en el PATH de esta shell: abre una terminal nueva " +
        "(una sesión ya abierta, como Claude Code, no lo ve hasta reiniciarse)",
    };
  return { name, ok: false, detail: "sin enlazar: forja apply looper (bun link)" };
}
