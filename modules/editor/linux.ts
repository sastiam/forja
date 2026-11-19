import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { log } from "../../cli/src/core/log.ts";
import { home } from "../../cli/src/core/paths.ts";
import type { Action, CheckResult, ModuleCtx } from "../../cli/src/core/plan.ts";
import { confirm, isInteractive } from "../../cli/src/core/prompt.ts";
import { commandExists, type Runner } from "../../cli/src/core/runners/shell.ts";

/**
 * editor en Linux (ADR 0017). Zed no está en los repos de Fedora y la Nerd Font tampoco:
 * - Zed: el instalador oficial (https://zed.dev/docs/linux). Se descarga, se MUESTRA y solo
 *   se ejecuta con confirmación interactiva; sin terminal interactivo se omite.
 * - Nerd Font: el .tar.xz de una release fija de nerd-fonts, verificado contra un SHA-256
 *   que está escrito aquí. Si el hash no coincide, no se extrae nada.
 */
export const ZED_INSTALLER_URL = "https://zed.dev/install.sh";

export const FONT_VERSION = "v3.5.1";
export const FONT_FAMILY = "JetBrainsMono Nerd Font";
export const FONT_URL = `https://github.com/ryanoasis/nerd-fonts/releases/download/${FONT_VERSION}/JetBrainsMono.tar.xz`;
/** Coincide con el digest de GitHub y con SHA-256.txt de la release (comprobado el 2026-11-19). */
export const FONT_SHA256 = "04d5e8f903693f9dd13e16f867e994834e681eb3c72c0d337a770dcda09010cf";

export const fontDir = (): string =>
  join(home(), ".local", "share", "fonts", "forja-jetbrains-mono-nerd");
const zedUserBin = (): string => join(home(), ".local", "bin", "zed");
const TMP_PREFIX = "forja-editor-";

export const sha256 = (data: Uint8Array): string => createHash("sha256").update(data).digest("hex");

export async function zedInstalled(runner: Runner): Promise<boolean> {
  return (await commandExists(runner, "zed")) || existsSync(zedUserBin());
}

/** ¿fontconfig ve la familia? Sin `fc-list` cuenta como no instalada. */
export async function fontInstalled(runner: Runner): Promise<boolean> {
  const r = await runner.query("fc-list", [":", "family"]);
  return r.code === 0 && r.stdout.toLowerCase().includes(FONT_FAMILY.toLowerCase());
}

export async function plan(ctx: ModuleCtx): Promise<Action[]> {
  const zed = await zedInstalled(ctx.runner);
  const font = await fontInstalled(ctx.runner);
  return [
    {
      kind: "step",
      description: zed
        ? "Zed instalado"
        : `instalar Zed con su instalador oficial (${ZED_INSTALLER_URL}): se muestra el script y pide confirmación`,
      pending: !zed,
    },
    {
      kind: "step",
      description: font
        ? `${FONT_FAMILY} instalada`
        : `instalar ${FONT_FAMILY} ${FONT_VERSION} en ${fontDir()} (descarga verificada con SHA-256 fijo)`,
      pending: !font,
    },
  ];
}

async function installZed(runner: Runner): Promise<void> {
  const dir = runner.dryRun ? "" : await mkdtemp(join(tmpdir(), TMP_PREFIX));
  try {
    const script = join(dir || tmpdir(), "zed-install.sh");
    const r = await runner.exec("curl", ["-fsSL", ZED_INSTALLER_URL, "-o", script]);
    if (runner.dryRun) return;
    if (r.code !== 0) throw new Error("no se pudo descargar el instalador de Zed");
    if (!isInteractive()) {
      log.warn("Zed omitido: requiere confirmación interactiva (revisa el instalador antes).");
      return;
    }
    log.info(await readFile(script, "utf8"));
    if (await confirm("¿Ejecutar este instalador de Zed?")) {
      const run = await runner.exec("sh", [script], { stream: true });
      if (run.code !== 0) throw new Error(`el instalador de Zed falló (${run.code})`);
    }
  } finally {
    if (dir) await rm(dir, { recursive: true, force: true });
  }
}

/** Descarga, verifica el hash y solo entonces extrae. Un hash distinto aborta sin tocar nada. */
export async function installFont(runner: Runner): Promise<void> {
  if (runner.dryRun) {
    await runner.exec("curl", ["-fsSL", FONT_URL, "-o", "JetBrainsMono.tar.xz"]);
    await runner.mkdirp(fontDir());
    return;
  }
  const tmp = await mkdtemp(join(tmpdir(), TMP_PREFIX));
  try {
    const archive = join(tmp, "JetBrainsMono.tar.xz");
    const dl = await runner.exec("curl", ["-fsSL", FONT_URL, "-o", archive]);
    if (dl.code !== 0) throw new Error(`no se pudo descargar ${FONT_URL}`);
    const got = sha256(await readFile(archive));
    if (got !== FONT_SHA256)
      throw new Error(
        `el SHA-256 de la fuente no coincide (esperado ${FONT_SHA256}, obtenido ${got}): no se instala`,
      );
    await runner.mkdirp(fontDir());
    const tar = await runner.exec("tar", ["-xJf", archive, "-C", fontDir()]);
    if (tar.code !== 0) throw new Error("no se pudo extraer la fuente");
    await runner.exec("fc-cache", ["-f", fontDir()]);
    log.step(`${FONT_FAMILY} ${FONT_VERSION} instalada en ${fontDir()}`);
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
}

export async function apply(ctx: ModuleCtx): Promise<void> {
  if (!(await zedInstalled(ctx.runner))) await installZed(ctx.runner);
  if (!(await fontInstalled(ctx.runner))) await installFont(ctx.runner);
}

export async function check(ctx: ModuleCtx): Promise<CheckResult[]> {
  return [
    {
      name: "zed instalado",
      ok: await zedInstalled(ctx.runner),
      warn: true,
      detail: "forja apply editor (instalador oficial, con confirmación)",
    },
    {
      name: `${FONT_FAMILY} instalada`,
      ok: await fontInstalled(ctx.runner),
      warn: true,
      detail: "forja apply editor (los iconos de starship y Zed salen como «?» sin ella)",
    },
  ];
}

export async function revert(ctx: ModuleCtx): Promise<void> {
  await ctx.runner.remove(fontDir());
  await ctx.runner.exec("fc-cache", ["-f"]);
  log.info(
    "Fuente quitada. Zed no se desinstala solo: rm -rf ~/.local/zed.app ~/.local/bin/zed (y ~/.config/zed).",
  );
}
