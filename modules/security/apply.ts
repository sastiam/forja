import { log } from "../../cli/src/core/log.ts";
import type { Action, CheckResult, ModuleCtx } from "../../cli/src/core/plan.ts";

const FW = "/usr/libexec/ApplicationFirewall/socketfilterfw";

async function firewallOn(ctx: ModuleCtx): Promise<boolean> {
  const r = await ctx.runner.query(FW, ["--getglobalstate"]);
  return /enabled|State = [12]/i.test(r.stdout);
}

async function fileVaultOn(ctx: ModuleCtx): Promise<boolean> {
  return /FileVault is On/i.test((await ctx.runner.query("fdesetup", ["status"])).stdout);
}

export async function plan(ctx: ModuleCtx): Promise<Action[]> {
  return [
    {
      kind: "step",
      description: "activar firewall de aplicaciones (sudo)",
      pending: !(await firewallOn(ctx)),
    },
  ];
}

export async function apply(ctx: ModuleCtx): Promise<void> {
  if (!(await firewallOn(ctx)))
    await ctx.runner.exec("sudo", [FW, "--setglobalstate", "on"], { stream: true });
  if (!(await fileVaultOn(ctx)))
    log.warn(
      "FileVault está desactivado: actívalo en Ajustes del Sistema → Privacidad y seguridad (forja no lo activa solo).",
    );
}

export async function check(ctx: ModuleCtx): Promise<CheckResult[]> {
  return [
    { name: "firewall activo", ok: await firewallOn(ctx) },
    { name: "FileVault activo", ok: await fileVaultOn(ctx), detail: "actívalo manualmente" },
  ];
}
