import assert from "node:assert/strict";
import { test } from "node:test";
import { changedOnDisk, parseBrewfile, unmanaged } from "../src/commands/capture.ts";

test("parseBrewfile lee brew y cask, normaliza taps e ignora comentarios", () => {
  const d = parseBrewfile(
    'tap "floci-io/floci"\n# brew "comentado"\nbrew "colima"\nbrew "floci-io/floci/floci"\ncask "google-chrome", args: { adopt: true }\n',
    "containers",
  );
  assert.deepEqual(
    d.map((x) => `${x.kind}:${x.name}`),
    ["brew:colima", "brew:floci", "cask:google-chrome"],
  );
  assert.ok(d.every((x) => x.module === "containers"));
});

test("unmanaged: lo instalado que no está en ningún Brewfile", () => {
  const declared = parseBrewfile('brew "jq"\ncask "zed"\n', "core");
  assert.deepEqual(unmanaged({ brew: ["jq", "htop"], cask: ["zed", "orbstack"] }, declared), [
    { kind: "brew", name: "htop" },
    { kind: "cask", name: "orbstack" },
  ]);
});

test("changedOnDisk: solo la primera columna de chezmoi status", () => {
  const status =
    " M .zshrc\nMM .claude/settings.json\nA  .config/zed/keymap.json\n R .aws/config\n";
  assert.deepEqual(changedOnDisk(status, "/h"), [
    "/h/.claude/settings.json",
    "/h/.config/zed/keymap.json",
  ]);
});
