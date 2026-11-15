import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { claudeSandbox, GIT_LOCAL_CONFIG, RTK_DATA_DIR } from "../src/core/claude-sandbox.ts";
import { loadHost } from "../src/core/hosts.ts";
import { validateProfile } from "../src/core/profile.ts";

const root = join(import.meta.dirname, "..", "..");
const noExtras = { claude: { allowed_domains: [], allow_read: [] } };

test("macbook permite github.com y api.github.com", async () => {
  const host = await loadHost(root, "macbook");
  assert.deepEqual(host.claude.allowed_domains, ["github.com", "api.github.com"]);
});

test("allowRead del gitconfig local solo con el módulo git", () => {
  const host = { claude: { allowed_domains: [] } };
  assert.deepEqual(claudeSandbox(host, noExtras, ["git"]).allow_read, [GIT_LOCAL_CONFIG]);
  assert.deepEqual(claudeSandbox(host, noExtras, ["core"]).allow_read, []);
});

test("el perfil suma dominios y lecturas sin duplicar, en orden estable", () => {
  const host = { claude: { allowed_domains: ["github.com", "api.github.com"] } };
  const profile = {
    claude: { allowed_domains: ["github.com", "npm.example.invalid"], allow_read: ["~/.npmrc"] },
  };
  assert.deepEqual(claudeSandbox(host, profile, ["git"]), {
    allowed_domains: ["github.com", "api.github.com", "npm.example.invalid"],
    allow_read: [GIT_LOCAL_CONFIG, "~/.npmrc"],
    allow_write: [],
  });
});

test("con agents, el sandbox deja escribir el historial de rtk según el SO", () => {
  const darwin = { os: "darwin", claude: { allowed_domains: [] } };
  const linux = { os: "linux", claude: { allowed_domains: [] } };
  assert.deepEqual(claudeSandbox(darwin, noExtras, ["agents"]).allow_write, [RTK_DATA_DIR.darwin]);
  assert.deepEqual(claudeSandbox(linux, noExtras, ["agents"]).allow_write, [RTK_DATA_DIR.linux]);
  assert.deepEqual(claudeSandbox(darwin, noExtras, ["git"]).allow_write, []);
});

test("el perfil valida [claude] como listas de strings", () => {
  const base = { schema: 1, host: "x", identity: { name: "n", email: "e" } };
  assert.deepEqual(validateProfile(base).claude, { allowed_domains: [], allow_read: [] });
  assert.throws(
    () => validateProfile({ ...base, claude: { allowed_domains: "github.com" } }),
    /claude.allowed_domains/,
  );
});

test("la plantilla de settings.json lee claude_sandbox con valores por defecto", () => {
  const tmpl = readFileSync(join(root, "home/private_dot_claude/settings.json.tmpl"), "utf8");
  assert.match(
    tmpl,
    /"allowedDomains": \{\{ get \$sb "allowed_domains" \| default list \| toJson \}\}/,
  );
  assert.match(tmpl, /"allowRead": \{\{ get \$sb "allow_read" \| default list \| toJson \}\}/);
});

test("memoria de tsserver en Zed: un octavo de la RAM entre 3 y 8 GB", async () => {
  const { zedTsMemoryMb } = await import("../src/commands/apply.ts");
  const gb = 1024 ** 3;
  assert.equal(zedTsMemoryMb(36 * gb), 4608);
  assert.equal(zedTsMemoryMb(8 * gb), 3072);
  assert.equal(zedTsMemoryMb(128 * gb), 8192);
  const tmpl = readFileSync(join(root, "home/private_dot_config/zed/settings.json.tmpl"), "utf8");
  assert.match(tmpl, /"maxTsServerMemory": \{\{ get \. "zed_ts_memory_mb" \| default 4096 \}\}/);
});
