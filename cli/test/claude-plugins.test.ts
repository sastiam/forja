import assert from "node:assert/strict";
import { test } from "node:test";
import {
  enabledPlugins,
  installedIds,
  marketplaceArg,
  marketplaceNames,
  PLUGINS,
  settingsData,
  unknownSkips,
} from "../src/core/claude-plugins.ts";

test("claude-plugins: plugins_skip acepta nombre corto o id completo", () => {
  const all = Object.keys(PLUGINS);
  assert.deepEqual(enabledPlugins(), all);
  assert.ok(!enabledPlugins(["aws-core"]).includes("aws-core@agent-toolkit-for-aws"));
  assert.ok(!enabledPlugins(["tdd-guard@forja"]).includes("tdd-guard@forja"));
  assert.deepEqual(unknownSkips(["aws-core", "tdd-guard@forja", "x"]), ["x"]);
});

test("claude-plugins: declara EGM y cascade desde GitHub, no desde el repo de desarrollo", () => {
  const d = settingsData("/r");
  assert.equal(d.claude_plugins["egm@egm"], true);
  assert.equal(d.claude_plugins["cascade@openspec-cascade"], true);
  assert.deepEqual(d.claude_marketplaces.egm, {
    source: { source: "github", repo: "google/elephant-goldfish-model" },
  });
  assert.deepEqual(d.claude_marketplaces["openspec-cascade"], {
    source: { source: "github", repo: "sastiam/openspec-cascade" },
  });
});

test("claude-plugins: settings solo declara los marketplaces que se usan", () => {
  const d = settingsData("/r", ["aws-core", "egm", "cascade"]);
  assert.deepEqual(Object.keys(d.claude_marketplaces).sort(), ["codebase-memory", "forja"]);
  assert.deepEqual(d.claude_marketplaces.forja, {
    source: { source: "directory", path: "/r/plugins" },
  });
  assert.equal(d.claude_plugins["aws-core@agent-toolkit-for-aws"], undefined);
  assert.equal(d.claude_plugins["token-saver@forja"], true);
});

test("claude-plugins: lee la salida JSON de la CLI de Claude Code", () => {
  assert.deepEqual(installedIds('[{"id":"a@b","enabled":true},{"x":1}]'), ["a@b"]);
  assert.deepEqual(installedIds("no json"), []);
  assert.deepEqual(marketplaceNames('[{"name":"forja","source":"directory"}]'), ["forja"]);
  assert.equal(marketplaceArg({ source: "github", repo: "o/r" }), "o/r");
  assert.equal(marketplaceArg({ source: "directory", path: "/p" }), "/p");
});
