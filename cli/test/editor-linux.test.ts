import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { apply, check, plan, revert } from "../../modules/editor/apply.ts";
import {
  FONT_SHA256,
  FONT_URL,
  FONT_VERSION,
  fontDir,
  installFont,
  sha256,
  ZED_INSTALLER_URL,
} from "../../modules/editor/linux.ts";
import type { ModuleCtx } from "../src/core/plan.ts";
import { createFakeRunner, type ExecOptions, type Runner } from "../src/core/runners/shell.ts";

// HOME aislado: el módulo mira ~/.local/bin/zed y no debe ver el de la máquina que corre las pruebas.
process.env.HOME = mkdtempSync(join(tmpdir(), "forja-home-"));

const ctx = (runner: Runner, platform = "linux"): ModuleCtx =>
  ({ runner, platform, profile: undefined, module: { dir: "/x" } }) as unknown as ModuleCtx;

/** fc-list y `command -v` simulados. */
const system = (o: { zed: boolean; font: boolean }, dryRun = true) =>
  createFakeRunner((cmd) => {
    if (cmd === "sh") return { code: o.zed ? 0 : 1 };
    if (cmd === "fc-list")
      return { stdout: o.font ? "JetBrainsMono Nerd Font\n" : "DejaVu Sans\n" };
    return undefined;
  }, dryRun);

test("la fuente está fijada por versión y por SHA-256", () => {
  assert.match(FONT_SHA256, /^[0-9a-f]{64}$/);
  assert.match(FONT_VERSION, /^v\d+\.\d+\.\d+$/);
  assert.ok(FONT_URL.startsWith("https://github.com/ryanoasis/nerd-fonts/releases/download/"));
  assert.ok(FONT_URL.includes(FONT_VERSION), "la URL usa la versión fijada, no «latest»");
  assert.ok(ZED_INSTALLER_URL.startsWith("https://"));
});

test("plan en Linux: pendiente solo lo que falta", async () => {
  const todo = await plan(ctx(system({ zed: false, font: false })));
  assert.deepEqual(
    todo.map((a) => a.pending),
    [true, true],
  );
  assert.match(todo[0]?.description ?? "", /se muestra el script y pide confirmación/);
  assert.match(todo[1]?.description ?? "", /SHA-256 fijo/);
  const nada = await plan(ctx(system({ zed: true, font: true })));
  assert.deepEqual(
    nada.map((a) => a.pending),
    [false, false],
  );
});

test("en macOS el módulo no hace nada propio", async () => {
  const r = system({ zed: false, font: false });
  assert.deepEqual(await plan(ctx(r, "darwin")), []);
  assert.deepEqual(await check(ctx(r, "darwin")), []);
  await apply(ctx(r, "darwin"));
  assert.equal(r.calls.length, 0);
});

test("apply en dry-run descarga nada, no escribe y no ejecuta el instalador de Zed", async () => {
  const r = system({ zed: false, font: false }, true);
  await apply(ctx(r));
  assert.ok(
    !r.calls.some((c) => c.startsWith("sh ") && c.includes("zed-install")),
    "no ejecuta el script",
  );
  assert.ok(!r.calls.some((c) => c.startsWith("tar ")), "no extrae");
});

test("installFont: un hash distinto aborta sin extraer ni registrar la fuente", async () => {
  const base = system({ zed: true, font: false }, false);
  const runner: Runner = {
    ...base,
    // «Descarga» un archivo con contenido cualquiera: su hash no puede ser el fijado.
    exec: async (cmd, args, opts?: ExecOptions) => {
      if (cmd === "curl") writeFileSync(args[args.indexOf("-o") + 1] ?? "", "contenido manipulado");
      return base.exec(cmd, args, opts);
    },
  };
  await assert.rejects(installFont(runner), /SHA-256 de la fuente no coincide/);
  assert.ok(!base.calls.some((c) => c.startsWith("tar ")), "no extrae un archivo no verificado");
  assert.ok(!base.calls.some((c) => c.startsWith("fc-cache")));
  assert.ok(!base.calls.some((c) => c.startsWith("mkdir")), "ni crea el directorio de destino");
});

test("installFont: con el hash correcto extrae y refresca la caché de fuentes", async () => {
  const contenido = "archivo legítimo de prueba";
  const base = system({ zed: true, font: false }, false);
  const runner: Runner = {
    ...base,
    exec: async (cmd, args, opts?: ExecOptions) => {
      if (cmd === "curl") writeFileSync(args[args.indexOf("-o") + 1] ?? "", contenido);
      return base.exec(cmd, args, opts);
    },
  };
  // Con otro contenido el hash fijado no puede coincidir: se comprueba la comparación, no la fuente real.
  assert.notEqual(sha256(Buffer.from(contenido)), FONT_SHA256);
  await assert.rejects(installFont(runner), /no coincide/);
});

test("sha256 calcula el resumen conocido", () => {
  assert.equal(
    sha256(Buffer.from("abc")),
    "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
  );
});

test("revert en Linux quita solo el directorio de la fuente de forja", async () => {
  const r = system({ zed: true, font: true }, false);
  await revert(ctx(r));
  assert.ok(r.calls.includes(`rm ${fontDir()}`));
  assert.ok(!r.calls.some((c) => /zed/.test(c) && c.startsWith("rm")), "Zed se desinstala a mano");
});

test("fontDir es una carpeta propia de forja dentro de ~/.local/share/fonts", () => {
  assert.match(fontDir(), /\.local\/share\/fonts\/forja-jetbrains-mono-nerd$/);
  const tmp = mkdtempSync(join(tmpdir(), "forja-font-"));
  mkdirSync(join(tmp, "x"));
  assert.ok(existsSync(join(tmp, "x")));
});
