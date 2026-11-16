import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { ensureWorktreeIdentity, identityFor, ownerOf } from "../src/core/git-identity.ts";
import { type Profile, validateProfile } from "../src/core/profile.ts";
import { createFakeRunner } from "../src/core/runners/shell.ts";
import { parse } from "../src/core/toml.ts";

const dir = mkdtempSync(join(tmpdir(), "forja-id-"));
const humanKey = join(dir, "personal.pub");
const agentKey = join(dir, "agent");
writeFileSync(humanKey, "pub\n");
writeFileSync(agentKey, "priv\n");

const base = `schema = 1
host = "h"
[identity]
name = "A"
email = "a@work.invalid"
[git.identities.personal]
name = "Ada"
email = "ada@users.noreply.invalid"
signing_key = "${humanKey}"
[git.repos]
forja = "personal"
openspec-cascade = "personal"
`;
const profile = (extra = ""): Profile => validateProfile(parse(base + extra));

test("identityFor: por nombre de carpeta; sin entrada manda la global", () => {
  const p = profile();
  assert.equal(identityFor(p, "/x/forja")?.email, "ada@users.noreply.invalid");
  assert.equal(identityFor(p, "/x/openspec-cascade")?.name, "Ada");
  assert.equal(identityFor(p, "/x/trabajo"), undefined);
  assert.equal(identityFor(null, "/x/forja"), undefined);
});

test("el perfil rechaza un repo con una identidad inexistente", () => {
  assert.throws(() => validateProfile(parse(`${base}[git.repos.extra]\n`)), /./);
  assert.throws(
    () => validateProfile(parse(base.replace('forja = "personal"', 'forja = "nadie"'))),
    /nadie/,
  );
});

test("humano: identidad a nivel repo (--local), sin tocar el worktree", async () => {
  const runner = createFakeRunner(() => ({ code: 0 }));
  const r = await ensureWorktreeIdentity(runner, "/x/forja", "/x/forja.wt/a", "human", profile());
  const calls = runner.calls.join("\n");
  assert.ok(calls.includes("git config --local user.email ada@users.noreply.invalid"));
  assert.ok(calls.includes(`git config --local user.signingkey ${humanKey}`));
  assert.match(calls, /git config --local commit\.gpgsign true/);
  assert.ok(!calls.includes("--worktree"));
  assert.equal(r.agentSigned, false);
});

test("agente: clave de agente y email de la identidad en el worktree", async () => {
  const runner = createFakeRunner(() => ({ code: 0 }));
  const p = profile(`[signing]\nagent_key = "${agentKey}"\n`);
  const r = await ensureWorktreeIdentity(runner, "/x/openspec-cascade", "/w", "night", p);
  const calls = runner.calls.join("\n");
  assert.ok(calls.includes(`git config --worktree user.signingkey ${agentKey}`));
  assert.ok(calls.includes("git config --worktree user.email ada@users.noreply.invalid"));
  assert.equal(r.agentSigned, true);
});

test("repo sin excepción: no escribe identidad; el agente conserva solo su clave", async () => {
  const runner = createFakeRunner(() => ({ code: 0 }));
  const p = profile(`[signing]\nagent_key = "${agentKey}"\n`);
  await ensureWorktreeIdentity(runner, "/x/trabajo", "/w", "claude", p);
  const calls = runner.calls.join("\n");
  assert.ok(!calls.includes("--local"));
  assert.ok(!calls.includes("user.email"));
  assert.ok(calls.includes("--worktree user.signingkey"));
});

test("agente sin clave de agente avisa", async () => {
  const runner = createFakeRunner(() => ({ code: 0 }));
  const r = await ensureWorktreeIdentity(runner, "/x/forja", "/w", "claude", profile());
  assert.equal(r.warnings.length, 1);
});

test("ownerOf: estado, luego prefijo agent/, luego humano", () => {
  const recs = [{ path: "/a", owner: "night" as const }];
  assert.equal(ownerOf("/a", "x", recs), "night");
  assert.equal(ownerOf("/b", "agent/x", recs), "claude");
  assert.equal(ownerOf("/c", "feat/x", recs), "human");
});
