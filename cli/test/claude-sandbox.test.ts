import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { claudeSandbox, GIT_LOCAL_CONFIG } from "../src/core/claude-sandbox.ts";
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
  });
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
