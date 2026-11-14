import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { plan } from "../../modules/looper/apply.ts";
import { LOOPER_REF } from "../src/core/looper.ts";
import type { ModuleCtx } from "../src/core/plan.ts";
import { createFakeRunner } from "../src/core/runners/shell.ts";
import {
  cascadeArgs,
  defaultBranch,
  missingChanges,
  type NightOpts,
  preflight,
} from "../src/wt/night.ts";
import { tmp } from "./helpers.ts";

const opts = (o: Partial<NightOpts> = {}): NightOpts => ({
  changes: ["a", "b"],
  engine: "claude",
  branch: "night-a",
  fullGate: false,
  allowBattery: false,
  hosts: ["github.com"],
  ...o,
});

function repoWith(...changes: string[]): string {
  const repo = tmp();
  for (const c of changes) {
    mkdirSync(join(repo, "openspec", "changes", c), { recursive: true });
    writeFileSync(join(repo, "openspec", "changes", c, "tasks.md"), "- [ ] 1.1 algo\n");
  }
  return repo;
}

test("cascadeArgs pasa repo, changes en orden, motor y logs", () => {
  assert.deepEqual(cascadeArgs("/wt", opts({ fullGate: true }), "/logs"), [
    "--repo",
    "/wt",
    "--changes",
    "a,b",
    "--engine",
    "claude",
    "--log-dir",
    "/logs",
    "--full-gate",
  ]);
});

test("defaultBranch usa el primer change y la fecha", () => {
  assert.equal(
    defaultBranch(["upgrade-deps", "x"], new Date("2026-11-14T03:00:00Z")),
    "night-upgrade-deps-20261114",
  );
});

test("missingChanges detecta changes sin tasks.md", () => {
  assert.deepEqual(missingChanges(repoWith("a"), ["a", "b"]), ["b"]);
});

test("preflight: exige looper, changes existentes y corriente", async () => {
  const repo = repoWith("a", "b");
  const onBattery = createFakeRunner((cmd, args) =>
    cmd === "pmset"
      ? { stdout: "Now drawing from 'Battery Power'\n\t80%;" }
      : args[1]?.startsWith("command -v")
        ? { code: 0 }
        : undefined,
  );
  const p = await preflight(onBattery, repo, opts(), "darwin");
  assert.deepEqual(
    p.map((x) => [x.name, x.ok]),
    [
      ["openspec-cascade instalado", true],
      ["changes de OpenSpec", true],
      ["corriente conectada", false],
    ],
  );
  const ok = await preflight(onBattery, repo, opts({ allowBattery: true }), "darwin");
  assert.ok(ok.every((x) => x.ok));
  const none = await preflight(onBattery, repo, opts({ changes: [] }), "linux");
  assert.equal(none.find((x) => x.name === "changes de OpenSpec")?.ok, false);
});

test("looper: plan pendiente si no está clonado en el ref fijado", async () => {
  process.env.FORJA_LOOPER_DIR = join(tmp(), "no-existe");
  const [a] = await plan({ runner: createFakeRunner() } as unknown as ModuleCtx);
  assert.equal(a?.pending, true);
  assert.match(a?.description ?? "", new RegExp(LOOPER_REF.slice(0, 7)));
  delete process.env.FORJA_LOOPER_DIR;
});
