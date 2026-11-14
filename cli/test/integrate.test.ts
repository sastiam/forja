import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { createRunner } from "../src/core/runners/shell.ts";
import { integrate } from "../src/wt/integrate.ts";
import { createWorktree } from "../src/wt/new.ts";
import { isolateState, makeRepo, sh } from "./helpers.ts";

const runner = createRunner(false);

function commit(dir: string, file: string, text: string, msg: string) {
  writeFileSync(join(dir, file), text);
  sh(dir, "git", ["add", file]);
  sh(dir, "git", ["commit", "-q", "-m", msg]);
}

test("wt integrate: rebase limpio sobre main y checks de integración", async () => {
  isolateState();
  const repo = makeRepo();
  mkdirSync(join(repo, ".forja"));
  writeFileSync(
    join(repo, ".forja", "project.toml"),
    '[checks]\nintegrate = ["test -f a.txt", "false"]\n',
  );
  sh(repo, "git", ["add", "."]);
  sh(repo, "git", ["commit", "-q", "-m", "proyecto"]);
  const wt = await createWorktree(runner, repo, { branch: "feat/a", fetch: false });
  commit(wt.path, "a.txt", "a\n", "feat: a");
  commit(repo, "b.txt", "b\n", "feat: b en main");

  const r = await integrate(runner, repo, { target: "feat/a", onto: "main", fetch: false });
  assert.equal(r.strategy, "rebase");
  assert.deepEqual(r.conflicts, []);
  assert.deepEqual(r.checks, [
    { cmd: "test -f a.txt", ok: true },
    { cmd: "false", ok: false },
  ]);
  assert.equal(r.status, "checks-failed");
  assert.equal(r.ahead, 1);
  assert.equal(r.behind, 0);
});

test("wt integrate: se detiene y lista los conflictos", async () => {
  isolateState();
  const repo = makeRepo();
  const wt = await createWorktree(runner, repo, { branch: "feat/x", fetch: false });
  commit(wt.path, "README.md", "rama\n", "feat: rama");
  commit(repo, "README.md", "main\n", "feat: main");

  const r = await integrate(runner, repo, { target: "feat/x", onto: "main", fetch: false });
  assert.equal(r.status, "conflicts");
  assert.deepEqual(r.conflicts, ["README.md"]);
  sh(wt.path, "git", ["rebase", "--abort"]);
});

test("wt integrate: rechaza un worktree con cambios sin commit", async () => {
  isolateState();
  const repo = makeRepo();
  const wt = await createWorktree(runner, repo, { branch: "feat/s", fetch: false });
  writeFileSync(join(wt.path, "README.md"), "modificado sin commit\n");
  await assert.rejects(
    integrate(runner, repo, { target: "feat/s", onto: "main", fetch: false }),
    /sin commit/,
  );
});
