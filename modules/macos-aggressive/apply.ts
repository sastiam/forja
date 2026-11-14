import { existsSync } from "node:fs";
import { join } from "node:path";
import { log } from "../../cli/src/core/log.ts";
import { stateDir } from "../../cli/src/core/paths.ts";
import type { Action, CheckResult, ModuleCtx } from "../../cli/src/core/plan.ts";

/**
 * Capa agresiva (exige --i-understand-the-risks). El modo tapa NO va aquí: se
 * activa solo durante un loop (`forja awake`, `wt night`).
 */
export const MAXFILES = 524288;
export const MAXFILES_PLIST = "/Library/LaunchDaemons/dev.forja.maxfiles.plist";
const LABEL = "dev.forja.maxfiles";

/** LaunchDaemon que fija `launchctl limit maxfiles` en cada arranque (monorepos, watchers, LSP). */
export function maxfilesPlist(n = MAXFILES): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>${LABEL}</string>
  <key>ProgramArguments</key>
  <array><string>launchctl</string><string>limit</string><string>maxfiles</string><string>${n}</string><string>${n}</string></array>
  <key>RunAtLoad</key><true/>
</dict>
</plist>
`;
}

async function maxfiles(ctx: ModuleCtx): Promise<number> {
  const r = await ctx.runner.query("launchctl", ["limit", "maxfiles"]);
  return Number(/maxfiles\s+(\d+)/.exec(r.stdout)?.[1] ?? 0);
}

/** Terminal en «Herramientas para desarrolladores»: sus procesos saltan la verificación de Gatekeeper (builds más rápidos). */
async function devModeOn(ctx: ModuleCtx): Promise<boolean> {
  return /enabled/i.test((await ctx.runner.query("spctl", ["developer-mode", "status"])).stdout);
}

export async function plan(ctx: ModuleCtx): Promise<Action[]> {
  return [
    {
      kind: "step",
      description: `launchctl maxfiles ${MAXFILES} persistente (${MAXFILES_PLIST})`,
      pending: !existsSync(MAXFILES_PLIST),
    },
    {
      kind: "step",
      description:
        "spctl developer-mode enable-terminal (luego actívalo en Ajustes → Privacidad → Herramientas para desarrolladores)",
      pending: !(await devModeOn(ctx)),
    },
  ];
}

export async function apply(ctx: ModuleCtx): Promise<void> {
  const { runner } = ctx;
  if (!existsSync(MAXFILES_PLIST)) {
    const tmp = join(stateDir(), "maxfiles.plist");
    await runner.writeFile(tmp, maxfilesPlist());
    await runner.exec("sudo", [
      "install",
      "-m",
      "0644",
      "-o",
      "root",
      "-g",
      "wheel",
      tmp,
      MAXFILES_PLIST,
    ]);
    await runner.exec("sudo", ["launchctl", "bootstrap", "system", MAXFILES_PLIST], {
      stream: true,
    });
    await runner.remove(tmp);
  }
  if (!(await devModeOn(ctx))) {
    await runner.exec("spctl", ["developer-mode", "enable-terminal"], { stream: true });
    log.info(
      "  ☐ Ajustes → Privacidad y seguridad → Herramientas para desarrolladores: activa tu terminal.",
    );
  }
}

export async function revert(ctx: ModuleCtx): Promise<void> {
  const { runner } = ctx;
  if (existsSync(MAXFILES_PLIST)) {
    await runner.exec("sudo", ["launchctl", "bootout", `system/${LABEL}`]);
    await runner.exec("sudo", ["rm", "-f", MAXFILES_PLIST]);
    log.info("maxfiles vuelve al valor por defecto tras reiniciar.");
  }
  log.info(
    "Developer mode: desactiva tu terminal en Ajustes → Privacidad y seguridad → Herramientas para desarrolladores.",
  );
}

export async function check(ctx: ModuleCtx): Promise<CheckResult[]> {
  const n = await maxfiles(ctx);
  return [
    { name: `maxfiles >= ${MAXFILES}`, ok: n >= MAXFILES, detail: n ? String(n) : undefined },
    { name: "developer mode (terminal)", ok: await devModeOn(ctx), warn: true },
  ];
}
