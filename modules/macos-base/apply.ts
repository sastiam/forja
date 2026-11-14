import { existsSync } from "node:fs";
import { join } from "node:path";
import { log } from "../../cli/src/core/log.ts";
import { stateDir } from "../../cli/src/core/paths.ts";
import type { Action, CheckResult, ModuleCtx } from "../../cli/src/core/plan.ts";
import { loadWorktrees } from "../../cli/src/core/state.ts";

const SUDO_LOCAL = "/etc/pam.d/sudo_local";
const TOUCH_ID = "auth       sufficient     pam_tid.so\n";
const pmsetBackup = (): string => join(stateDir(), "pmset-backup.txt");

const GUIDES = [
  "Límite de carga al 80 % (Tahoe 26.4+): Ajustes → Batería → Carga.",
  "Spotlight: excluye ~/code en Ajustes → Siri y Spotlight → Privacidad.",
  "Reducir transparencia: Ajustes → Accesibilidad → Pantalla.",
];

async function touchIdOn(ctx: ModuleCtx): Promise<boolean> {
  return (await ctx.runner.query("grep", ["-q", "pam_tid.so", SUDO_LOCAL])).code === 0;
}

export async function plan(ctx: ModuleCtx): Promise<Action[]> {
  return [
    {
      kind: "step",
      description: `Touch ID para sudo (${SUDO_LOCAL})`,
      pending: !(await touchIdOn(ctx)),
    },
    {
      kind: "step",
      description: "no dormir con corriente (backup de pmset + pmset -c sleep 0 displaysleep 15)",
      pending: !existsSync(pmsetBackup()),
    },
    ...GUIDES.map((g): Action => ({ kind: "guide", description: g, pending: false })),
  ];
}

export async function apply(ctx: ModuleCtx): Promise<void> {
  const { runner } = ctx;
  if (!(await touchIdOn(ctx)))
    await runner.exec(
      "sh",
      ["-c", `printf '%s' '${TOUCH_ID}' | sudo tee ${SUDO_LOCAL} >/dev/null`],
      { stream: true },
    );
  if (!existsSync(pmsetBackup())) {
    await runner.writeFile(pmsetBackup(), (await runner.query("pmset", ["-g", "custom"])).stdout);
    await runner.exec("sudo", ["pmset", "-c", "sleep", "0", "displaysleep", "15"], {
      stream: true,
    });
  }
  // Time Machine: excluye node_modules de los repos conocidos por forja (exclusión persistente).
  for (const repo of new Set((await loadWorktrees()).map((w) => w.repo))) {
    const nm = join(repo, "node_modules");
    if (existsSync(nm)) await runner.exec("tmutil", ["addexclusion", nm]);
  }
  for (const g of GUIDES) log.info(`  ☐ ${g}`);
}

export async function check(ctx: ModuleCtx): Promise<CheckResult[]> {
  return [{ name: "Touch ID para sudo", ok: await touchIdOn(ctx) }];
}
