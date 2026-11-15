import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { parseTaps, untrustedTaps } from "../src/core/runners/brew.ts";
import { apply as chezmoiApply, needsParentDirs } from "../src/core/runners/chezmoi.ts";
import { createFakeRunner } from "../src/core/runners/shell.ts";
import { tmp } from "./helpers.ts";

// Primer apply de un módulo en una máquina limpia: taps de terceros y carpetas que aún no existen.

test("brew: lee los taps del Brewfile", () => {
  const text = 'tap "Floci-IO/floci"\n# tap "comentado/x"\nbrew "colima"\n  tap "a/b"\n';
  assert.deepEqual(parseTaps(text), ["floci-io/floci", "a/b"]);
});

function brewfile(text: string): string {
  const file = join(tmp(), "Brewfile");
  writeFileSync(file, text);
  return file;
}

const trustRunner = (out: { code?: number; stdout?: string }) =>
  createFakeRunner((cmd, args) => {
    if (cmd === "sh") return { code: 0 }; // command -v brew
    if (cmd === "brew" && args[0] === "trust") return out;
    return undefined;
  });

test("brew: detecta los taps en los que aún no se confía", async () => {
  const file = brewfile('tap "floci-io/floci"\ntap "otra/org"\nbrew "floci-io/floci/floci"\n');
  const json = JSON.stringify({ taps: ["Otra/Org"], formulae: [], casks: [], commands: [] });
  assert.deepEqual(await untrustedTaps(trustRunner({ stdout: json }), file), ["floci-io/floci"]);
});

test("brew: sin taps, o con un brew sin `trust` (anterior a 7), no hay nada que confiar", async () => {
  assert.deepEqual(await untrustedTaps(trustRunner({ stdout: "{}" }), brewfile('brew "jq"\n')), []);
  const file = brewfile('tap "floci-io/floci"\n');
  assert.deepEqual(await untrustedTaps(trustRunner({ code: 1 }), file), []);
  assert.deepEqual(await untrustedTaps(trustRunner({ stdout: "no es json" }), file), []);
});

test("chezmoi: --parent-dirs solo cuando falta la carpeta de algún destino", async () => {
  const home = tmp("forja-home-");
  mkdirSync(join(home, ".config"));
  const existing = join(home, ".config", "git");
  const missing = join(home, ".aws", "config");
  assert.equal(needsParentDirs([existing]), false);
  assert.equal(needsParentDirs([existing, missing]), true);

  const runner = createFakeRunner();
  await chezmoiApply(runner, "/src", [existing]);
  await chezmoiApply(runner, "/src", [missing]);
  assert.equal(runner.calls[0], `chezmoi --source /src apply ${existing}`);
  assert.equal(runner.calls[1], `chezmoi --source /src apply --parent-dirs ${missing}`);
});
