import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { log } from "../../cli/src/core/log.ts";
import type { Action, CheckResult, ModuleCtx } from "../../cli/src/core/plan.ts";

const FW = "/usr/libexec/ApplicationFirewall/socketfilterfw";

/** Marca para reconocer el hook de forja y no pisar uno ajeno. */
export const HOOK_MARK = "# forja:gitleaks";
export const PRE_COMMIT = `#!/bin/sh
${HOOK_MARK} — gestionado por el módulo security. El repo de forja es público.
command -v gitleaks >/dev/null || { echo "gitleaks no está instalado (forja apply security)" >&2; exit 1; }
exec gitleaks git --pre-commit --staged --redact --no-banner
`;

/** Ruta del pre-commit del clon de forja (null si no es un clon git). */
export function hookPath(root: string): string | null {
  const git = join(root, ".git");
  return existsSync(git) ? join(git, "hooks", "pre-commit") : null;
}

export function hookState(path: string | null): "ok" | "missing" | "foreign" | "no-repo" {
  if (!path) return "no-repo";
  if (!existsSync(path)) return "missing";
  return readFileSync(path, "utf8").includes(HOOK_MARK) ? "ok" : "foreign";
}

async function firewallOn(ctx: ModuleCtx): Promise<boolean> {
  const r = await ctx.runner.query(FW, ["--getglobalstate"]);
  return /enabled|State = [12]/i.test(r.stdout);
}

async function fileVaultOn(ctx: ModuleCtx): Promise<boolean> {
  return /FileVault is On/i.test((await ctx.runner.query("fdesetup", ["status"])).stdout);
}

export async function plan(ctx: ModuleCtx): Promise<Action[]> {
  const hook = hookState(hookPath(ctx.root));
  return [
    {
      kind: "step",
      description: "activar firewall de aplicaciones (sudo)",
      pending: !(await firewallOn(ctx)),
    },
    {
      kind: "step",
      description:
        hook === "foreign"
          ? "pre-commit de gitleaks: ya hay otro hook en el repo de forja; añade la línea de gitleaks a mano"
          : "pre-commit de gitleaks en el repo de forja",
      pending: hook === "missing",
    },
  ];
}

export async function apply(ctx: ModuleCtx): Promise<void> {
  const path = hookPath(ctx.root);
  if (path && hookState(path) === "missing") await ctx.runner.writeFile(path, PRE_COMMIT, 0o755);
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
    {
      name: "pre-commit de gitleaks (repo de forja)",
      ok: hookState(hookPath(ctx.root)) !== "missing",
      detail: hookState(hookPath(ctx.root)) === "missing" ? "forja apply security" : undefined,
    },
  ];
}
