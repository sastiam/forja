import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { createRunner } from "../src/core/runners/shell.ts";
import { loadWorktrees } from "../src/core/state.ts";
import { parseWorktreeList } from "../src/wt/git.ts";
import { initProject } from "../src/wt/init-project.ts";
import { collectRows } from "../src/wt/ls.ts";
import { createWorktree } from "../src/wt/new.ts";
import { cksum, portFor } from "../src/wt/ports.ts";
import { parseDuration, prune } from "../src/wt/prune.ts";
import { removeSafely } from "../src/wt/rm.ts";
import { isolateState, makeRepo, sh, tmp } from "./helpers.ts";

const runner = createRunner(false);

test("cksum coincide con POSIX cksum y el puerto es determinista", () => {
  assert.equal(cksum("abc"), 1219131554); // printf abc | cksum
  assert.equal(portFor("feat-login", 3000), portFor("feat-login", 3000));
  assert.equal(portFor("abc", 3000), 3000 + (1219131554 % 100));
  const p = portFor("otra-rama", 4000);
  assert.ok(p >= 4000 && p < 4100);
});

test("parsea git worktree list --porcelain", () => {
  const txt =
    "worktree /a\nHEAD abc\nbranch refs/heads/main\n\nworktree /b.wt/x\nHEAD def\ndetached\n\n";
  const l = parseWorktreeList(txt);
  assert.equal(l.length, 2);
  assert.equal(l[0]?.branch, "main");
  assert.equal(l[1]?.detached, true);
});

test("parseDuration", () => {
  assert.equal(parseDuration("14d"), 14 * 86400_000);
  assert.throws(() => parseDuration("x"));
});

test("wt new/ls/rm: ciclo completo en un repo temporal", async () => {
  isolateState();
  const repo = makeRepo();
  writeFileSync(join(repo, ".env"), "SECRETO=1\n");
  writeFileSync(join(repo, ".env.tpl"), "X=op://v/i/f\n");
  writeFileSync(join(repo, ".worktreeinclude"), ".env\n.env.tpl\n");
  mkdirSync(join(repo, ".forja"));
  writeFileSync(
    join(repo, ".forja", "project.toml"),
    '[worktree]\nsetup = ["echo hecho > setup.txt"]\nport_base = 5000\n[floci]\nenabled = true\n',
  );

  const rec = await createWorktree(runner, repo, { branch: "feat/login", fetch: false });
  assert.ok(rec.path.endsWith(join("proj.wt", "feat-login")));
  assert.equal(sh(rec.path, "git", ["branch", "--show-current"]), "feat/login");
  assert.ok(!existsSync(join(rec.path, ".env")), "nunca copia .env");
  assert.ok(existsSync(join(rec.path, ".env.tpl")));
  assert.ok(existsSync(join(rec.path, "setup.txt")), "ejecuta setup");
  const env = readFileSync(join(rec.path, ".env.worktree"), "utf8");
  assert.match(env, /WT_NAME=feat-login/);
  assert.match(env, new RegExp(`WT_PORT=${portFor("feat-login", 5000)}`));
  assert.match(env, /AWS_PROFILE=floci/);
  assert.equal((await loadWorktrees()).length, 1);

  const rows = await collectRows(runner, repo, false);
  assert.equal(rows.length, 2);
  assert.equal(rows.find((r) => r.branch === "feat/login")?.owner, "human");

  // sucio → rechaza; con --force elimina
  assert.equal(
    rows.find((r) => r.branch === "feat/login")?.dirty,
    true,
    "setup.txt y .env.worktree sin commit",
  );
  await assert.rejects(() => removeSafely(runner, repo, "feat/login", false), /cambios sin commit/);
  await removeSafely(runner, repo, "feat/login", true);
  assert.ok(!existsSync(rec.path));
  assert.equal((await loadWorktrees()).length, 0);
});

test("wt new con agente usa prefijo agent/ y owner", async () => {
  isolateState();
  const repo = makeRepo();
  const rec = await createWorktree(runner, repo, {
    branch: "tarea",
    agent: "claude",
    fetch: false,
  });
  assert.equal(rec.branch, "agent/tarea");
  assert.equal(rec.owner, "claude");
});

test("wt prune --merged elimina fusionados y limpia huérfanos; respeta sucios", async () => {
  isolateState();
  const repo = makeRepo();
  const merged = await createWorktree(runner, repo, { branch: "merged-1", fetch: false });
  const dirty = await createWorktree(runner, repo, { branch: "merged-2", fetch: false });
  writeFileSync(join(dirty.path, "wip.txt"), "x");
  sh(repo, "git", ["worktree", "list"]);
  // ambos están fusionados (misma punta que main); .env.worktree es untracked → sucio también
  sh(merged.path, "rm", ["-f", ".env.worktree"]);
  const dry = await prune(runner, repo, { merged: true, dryRun: true });
  assert.deepEqual(dry.removed, [merged.path]);
  assert.ok(existsSync(merged.path), "dry-run no borra");
  const res = await prune(runner, repo, { merged: true });
  assert.deepEqual(res.removed, [merged.path]);
  assert.equal(res.skipped.length, 1);
  assert.ok(existsSync(dirty.path));

  // huérfano: ruta borrada a mano
  sh(tmp(), "rm", ["-rf", dirty.path]);
  const r2 = await prune(runner, repo, {});
  assert.deepEqual(r2.orphans, [dirty.path]);
  assert.equal((await loadWorktrees()).length, 0);
});

test("wt rm rechaza commits sin push", async () => {
  isolateState();
  const repo = makeRepo();
  const rec = await createWorktree(runner, repo, { branch: "con-commit", fetch: false });
  sh(rec.path, "rm", [".env.worktree"]);
  writeFileSync(join(rec.path, "f.txt"), "1");
  sh(rec.path, "git", ["add", "f.txt"]);
  sh(rec.path, "git", [
    "-c",
    "user.email=t@example.invalid",
    "-c",
    "user.name=T",
    "commit",
    "-q",
    "-m",
    "x",
  ]);
  await assert.rejects(() => removeSafely(runner, repo, "con-commit", false), /sin push/);
});

test("wt init-project no sobrescribe archivos existentes", async () => {
  const dest = tmp();
  writeFileSync(join(dest, ".worktreeinclude"), "propio\n");
  const copied = await initProject(dest);
  assert.ok(!copied.includes(".worktreeinclude"));
  assert.equal(readFileSync(join(dest, ".worktreeinclude"), "utf8"), "propio\n");
  assert.ok(existsSync(join(dest, ".forja", "project.toml")));
});
