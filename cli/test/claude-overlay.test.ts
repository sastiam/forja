import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import {
  CLAUDE_OVERLAY,
  ClaudeOverlayError,
  loadOverlay,
  MANAGED_KEYS,
  OPENCODE_MANAGED_KEYS,
  OPENCODE_OVERLAY,
  parseOverlay,
} from "../src/core/claude-overlay.ts";
import { repoRoot } from "../src/core/paths.ts";

const SETTINGS = join(repoRoot(), "home/private_dot_claude/private_settings.json.tmpl");

test("parseOverlay devuelve un fragmento listo para insertar y las claves", () => {
  const o = parseOverlay('{"tui":"fullscreen","autoMode":{"environment":["a","b"]}}');
  assert.deepEqual(o.keys, ["tui", "autoMode"]);
  assert.equal(o.fragment, '"tui": "fullscreen", "autoMode": {"environment":["a","b"]}');
  assert.deepEqual(o.overrides, []);
  // Insertado tras las claves de forja, el resultado sigue siendo JSON válido.
  assert.deepEqual(JSON.parse(`{ "a": 1, ${o.fragment} }`).autoMode, { environment: ["a", "b"] });
});

test("parseOverlay avisa de las claves que reemplazan seguridad de forja", () => {
  const o = parseOverlay('{"sandbox":{"enabled":false},"model":"sonnet","permissions":{}}');
  assert.deepEqual(o.overrides, ["sandbox", "permissions"]);
  assert.ok(
    !(MANAGED_KEYS as readonly string[]).includes("model"),
    "model solo va si el perfil lo pide",
  );
});

test("ante una clave repetida manda la del overlay (la última)", () => {
  const forja = '"sandbox": {"enabled": true}';
  const o = parseOverlay('{"sandbox":{"enabled":false}}');
  assert.equal(JSON.parse(`{ ${forja}, ${o.fragment} }`).sandbox.enabled, false);
});

test("parseOverlay rechaza lo que no es un objeto JSON, sin ignorarlo en silencio", () => {
  assert.throws(() => parseOverlay("{ no json"), ClaudeOverlayError);
  assert.throws(() => parseOverlay("[1,2]"), /objeto JSON/);
  assert.throws(() => parseOverlay("null"), /objeto JSON/);
  assert.throws(() => parseOverlay('"texto"'), /objeto JSON/);
  assert.throws(
    () => parseOverlay("{ no json"),
    new RegExp(CLAUDE_OVERLAY.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
  );
});

test("loadOverlay: sin archivo es null; con archivo lo lee; roto falla", async () => {
  const dir = mkdtempSync(join(tmpdir(), "forja-overlay-"));
  assert.equal(await loadOverlay(join(dir, "no-existe.json")), null);
  const ok = join(dir, "ok.json");
  writeFileSync(ok, '{"theme":"auto"}');
  assert.deepEqual((await loadOverlay(ok))?.keys, ["theme"]);
  const roto = join(dir, "roto.json");
  writeFileSync(roto, "{");
  await assert.rejects(loadOverlay(roto), ClaudeOverlayError);
});

test("la plantilla de settings.json inserta el overlay al final, después del tema", () => {
  const t = readFileSync(SETTINGS, "utf8");
  const overlay = t.indexOf('get . "claude_overlay"');
  assert.ok(overlay > t.indexOf('get . "claude_theme"'), "el overlay va después de model y theme");
  assert.ok(overlay > t.indexOf('"statusLine"'), "y después de las claves de forja");
});

// Render real con chezmoi: solo si hay binario (CHEZMOI_BIN o chezmoi en el PATH).
const chezmoi = process.env.CHEZMOI_BIN ?? "chezmoi";
const hasChezmoi = (() => {
  try {
    execFileSync(chezmoi, ["--version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
})();

test("render con chezmoi: el overlay conserva claves del usuario y gana a las de forja", {
  skip: !hasChezmoi,
}, () => {
  const dir = mkdtempSync(join(tmpdir(), "forja-render-"));
  const cfg = join(dir, "chezmoi.toml");
  const o = parseOverlay('{"tui":"fullscreen","sandbox":{"enabled":false}}');
  writeFileSync(
    cfg,
    `[data]\nmodules = ["agents"]\nclaude_overlay = ${JSON.stringify(o.fragment)}\n[data.claude_sandbox]\nenabled = true\nallowed_domains = []\nallow_read = []\nallow_write = []\n`,
  );
  const out = execFileSync(
    chezmoi,
    ["--config", cfg, "--source", join(repoRoot(), "home"), "execute-template"],
    {
      input: readFileSync(SETTINGS),
      encoding: "utf8",
    },
  );
  const json = JSON.parse(out);
  assert.equal(json.tui, "fullscreen", "conserva la clave personal");
  assert.equal(json.sandbox.enabled, false, "gana ante la de forja");
  assert.ok(json.statusLine, "las demás claves de forja siguen");
  // Sin overlay, el resultado no cambia y sigue siendo JSON válido.
  writeFileSync(
    cfg,
    `[data]\nmodules = ["agents"]\n[data.claude_sandbox]\nenabled = true\nallowed_domains = []\nallow_read = []\nallow_write = []\n`,
  );
  const sin = JSON.parse(
    execFileSync(
      chezmoi,
      ["--config", cfg, "--source", join(repoRoot(), "home"), "execute-template"],
      {
        input: readFileSync(SETTINGS),
        encoding: "utf8",
      },
    ),
  );
  assert.equal(sin.sandbox.enabled, true);
  assert.equal(sin.tui, undefined);
});

// Permisos: los archivos con datos personales o de acceso van en modo 0600 (prefijo private_ de chezmoi).
test("las plantillas de AWS, settings de Claude y Zed y OpenCode son privadas (0600)", () => {
  const root = repoRoot();
  for (const f of [
    "home/private_dot_aws/private_config.tmpl",
    "home/private_dot_aws/private_credentials",
    "home/private_dot_claude/private_settings.json.tmpl",
    "home/private_dot_config/zed/private_settings.json.tmpl",
    "home/private_dot_config/opencode/private_opencode.json.tmpl",
  ])
    assert.ok(existsSync(join(root, f)), `falta ${f} (¿perdió el prefijo private_?)`);
  for (const f of [
    "home/private_dot_aws/config.tmpl",
    "home/private_dot_aws/credentials",
    "home/private_dot_claude/settings.json.tmpl",
    "home/private_dot_config/zed/settings.json.tmpl",
  ])
    assert.ok(!existsSync(join(root, f)), `${f} volvió a ser legible por todos`);
});

test("la config de Ghostty incluye el archivo local como OPCIONAL (con ?)", () => {
  const t = readFileSync(join(repoRoot(), "home/private_dot_config/ghostty/config.tmpl"), "utf8");
  assert.match(t, /^config-file = \?~\/\.config\/forja\/local\/ghostty\.conf$/m);
  const lines = t.trim().split("\n");
  assert.ok(lines.at(-1)?.startsWith("config-file"), "va al final: lo personal gana");
});

// OpenCode: mismo mecanismo, otras claves gestionadas.
test("parseOverlay de OpenCode marca `permission` y `$schema` como claves de forja", () => {
  const o = parseOverlay(
    '{"model":"x","permission":{"bash":"allow"}}',
    OPENCODE_OVERLAY,
    OPENCODE_MANAGED_KEYS,
  );
  assert.deepEqual(o.overrides, ["permission"]);
  assert.deepEqual(
    parseOverlay('{"mcp":{}}', OPENCODE_OVERLAY, OPENCODE_MANAGED_KEYS).overrides,
    [],
  );
});

test("render con chezmoi: opencode.json conserva lo personal y el overlay gana", {
  skip: !hasChezmoi,
}, () => {
  const tpl = readFileSync(
    join(repoRoot(), "home/private_dot_config/opencode/private_opencode.json.tmpl"),
    "utf8",
  );
  const dir = mkdtempSync(join(tmpdir(), "forja-render-oc-"));
  const cfg = join(dir, "chezmoi.toml");
  const render = (data: string) => {
    writeFileSync(cfg, `[data]\n${data}`);
    return JSON.parse(
      execFileSync(
        chezmoi,
        ["--config", cfg, "--source", join(repoRoot(), "home"), "execute-template"],
        { input: tpl, encoding: "utf8" },
      ),
    );
  };
  const o = parseOverlay(
    '{"model":"anthropic/x","permission":{"bash":"allow","edit":"ask"}}',
    OPENCODE_OVERLAY,
    OPENCODE_MANAGED_KEYS,
  );
  const con = render(`opencode_overlay = ${JSON.stringify(o.fragment)}\n`);
  assert.equal(con.model, "anthropic/x");
  assert.equal(con.permission.bash, "allow", "el overlay gana");
  assert.equal(con.$schema, "https://opencode.ai/config.json");
  const sin = render("");
  assert.equal(sin.permission.bash, "ask");
  assert.equal(sin.model, undefined);
});
