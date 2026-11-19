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
  doctorFailures,
  missingChanges,
  missingChangesAt,
  type NightOpts,
  preflight,
  specGateArgs,
  wtNight,
} from "../src/wt/night.ts";
import { tmp } from "./helpers.ts";

const opts = (o: Partial<NightOpts> = {}): NightOpts => ({
  changes: ["a", "b"],
  engine: "claude",
  branch: "night-a",
  fullGate: false,
  allowBattery: false,
  hosts: ["github.com"],
  sandbox: false,
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

/** Código con el que sale git cuando el objeto no existe (fatal). */
const GIT_FATAL_EXIT = 128;

/** Runner falso cuyo `git cat-file -e <ref>:<ruta>` solo encuentra las rutas de `present`. */
const refWith = (...present: string[]) =>
  createFakeRunner((cmd, args) =>
    cmd === "git" && args[0] === "cat-file"
      ? { code: present.some((p) => args[2]?.endsWith(`:${p}`)) ? 0 : GIT_FATAL_EXIT }
      : { code: 0 },
  );

test("missingChangesAt busca tasks.md en la rama base, no en el checkout", async () => {
  const runner = refWith("openspec/changes/a/tasks.md");
  assert.deepEqual(await missingChangesAt(runner, "/repo", "origin/main", ["a", "b"]), ["b"]);
  assert.ok(runner.calls.includes("git cat-file -e origin/main:openspec/changes/b/tasks.md"));
});

test("preflight con base: un change solo presente en el checkout falla y sugiere --base", async () => {
  const repo = repoWith("a", "b");
  const p = await preflight(
    refWith("openspec/changes/a/tasks.md"),
    repo,
    opts({ base: "origin/main" }),
    "linux",
  );
  const changes = p.find((x) => x.name === "changes de OpenSpec");
  assert.equal(changes?.ok, false);
  assert.match(changes?.detail ?? "", /origin\/main: b/);
  assert.match(changes?.detail ?? "", /--base/);
  assert.ok(!p.some((x) => x.name === "spec-gate (review)"));
});

test("wt night rechaza argumentos que no usa en vez de ignorarlos", async () => {
  await assert.rejects(() => wtNight(["--changes", "a", "--", "--allow-dirty"]), /--allow-dirty/);
  await assert.rejects(() => wtNight(["--changes", "a", "extra"]), /extra/);
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
      ["openspec-cascade doctor", true],
      ["changes de OpenSpec", true],
      ["spec-gate (review)", true],
      ["corriente conectada", false],
    ],
  );
  const ok = await preflight(onBattery, repo, opts({ allowBattery: true }), "darwin");
  assert.ok(ok.every((x) => x.ok));
  const none = await preflight(onBattery, repo, opts({ changes: [] }), "linux");
  assert.equal(none.find((x) => x.name === "changes de OpenSpec")?.ok, false);
});

test("preflight: spec-gate distinto de 0 aborta; se ejecuta con los changes en orden", async () => {
  const repo = repoWith("a", "b");
  const calls: string[][] = [];
  const failing = createFakeRunner((cmd, args) => {
    if (cmd === "openspec-cascade" && args[0] === "spec-gate") {
      calls.push(args);
      return { code: 2, stderr: "spec incompleta" };
    }
    return { code: 0 };
  });
  const p = await preflight(failing, repo, opts(), "linux");
  assert.equal(p.find((x) => x.name === "spec-gate (review)")?.ok, false);
  assert.deepEqual(calls[0], specGateArgs(["a", "b"]));
  assert.deepEqual(specGateArgs(["a", "b"]), [
    "spec-gate",
    "check",
    "--stage",
    "review",
    "--changes",
    "a,b",
  ]);
  // Sin changes válidos no se ejecuta el gate.
  const none = await preflight(failing, repo, opts({ changes: ["x"] }), "linux");
  assert.ok(!none.some((x) => x.name === "spec-gate (review)"));
});

test("looper: plan pendiente si no está clonado en el ref fijado", async () => {
  process.env.FORJA_LOOPER_DIR = join(tmp(), "no-existe");
  const [a] = await plan({ runner: createFakeRunner() } as unknown as ModuleCtx);
  assert.equal(a?.pending, true);
  assert.match(a?.description ?? "", new RegExp(LOOPER_REF.slice(0, 7)));
  delete process.env.FORJA_LOOPER_DIR;
});

test("cascadeArgs pasa --settings solo con sandbox", () => {
  assert.deepEqual(cascadeArgs("/wt", opts(), "/logs", "/s.json").slice(-2), [
    "--settings",
    "/s.json",
  ]);
  assert.ok(!cascadeArgs("/wt", opts(), "/logs").includes("--settings"));
});

test("cascadeArgs pasa --model y --effort solo si se indican", () => {
  const args = cascadeArgs("/wt", opts({ model: "opus", effort: "xhigh" }), "/logs");
  assert.equal(args[args.indexOf("--model") + 1], "opus");
  assert.equal(args[args.indexOf("--effort") + 1], "xhigh");
  const plain = cascadeArgs("/wt", opts(), "/logs");
  assert.ok(!plain.includes("--model") && !plain.includes("--effort"));
});

test("preflight con sandbox: exige motor claude y openspec-cascade con --settings", async () => {
  const repo = repoWith("a", "b");
  const runner = (help: string) =>
    createFakeRunner((cmd, args) =>
      cmd === "openspec-cascade" && args[0] === "--help" ? { stdout: help } : { code: 0 },
    );
  const sbx = (p: Awaited<ReturnType<typeof preflight>>) =>
    p
      .filter((x) => x.name.includes("sandbox") || x.name.includes("--settings"))
      .map((x) => [x.name, x.ok]);

  const ok = await preflight(
    runner("  --settings <file>  Extra"),
    repo,
    opts({ sandbox: true }),
    "linux",
  );
  assert.deepEqual(sbx(ok), [
    ["sandbox: motor claude", true],
    ["openspec-cascade acepta --settings", true],
  ]);
  const old = await preflight(runner("  --log-dir <path>"), repo, opts({ sandbox: true }), "linux");
  assert.deepEqual(sbx(old)[1], ["openspec-cascade acepta --settings", false]);
  const agy = await preflight(
    runner("--settings"),
    repo,
    opts({ sandbox: true, engine: "antigravity" }),
    "linux",
  );
  assert.deepEqual(sbx(agy)[0], ["sandbox: motor claude", false]);
  assert.deepEqual(sbx(await preflight(runner(""), repo, opts(), "linux")), []);
});

test("cascadeArgs pasa --mode solo si se pidió", () => {
  assert.ok(!cascadeArgs("/wt", opts(), "/logs").includes("--mode"));
  const args = cascadeArgs("/wt", opts({ mode: "v2" }), "/logs");
  assert.deepEqual(args.slice(args.indexOf("--mode"), args.indexOf("--mode") + 2), [
    "--mode",
    "v2",
  ]);
});

test("wt night rechaza un --mode desconocido antes de tocar nada", async () => {
  assert.equal(await wtNight(["--changes", "a", "--mode", "v9"]), 1);
  assert.equal(await wtNight(["--changes", "a", "--mode", "jules"]), 1);
});

test("doctorFailures junta solo las líneas fail del diagnóstico de cascade", () => {
  const out =
    "ok   runtime: bun 1.4.4\nwarn engine:opencode: not on PATH\nfail openspec: openspec/ missing\nfail git: dirty\n";
  assert.equal(doctorFailures(out), "fail openspec: openspec/ missing | fail git: dirty");
  assert.equal(doctorFailures("ok x\nwarn y\n"), "");
});

test("preflight: el doctor de cascade bloquea con sus fallos y los avisos no", async () => {
  const repo = repoWith("a", "b");
  const answers = (code: number, stdout: string) =>
    createFakeRunner((cmd, args) => {
      if (cmd === "openspec-cascade" && args[0] === "doctor") return { code, stdout };
      return { code: 0 };
    });
  const mal = await preflight(
    answers(1, "fail openspec: openspec/ missing\n"),
    repo,
    opts(),
    "linux",
  );
  const d = mal.find((x) => x.name === "openspec-cascade doctor");
  assert.equal(d?.ok, false);
  assert.match(d?.detail ?? "", /openspec\/ missing/);
  const aviso = await preflight(
    answers(0, "warn greptile: not installed\n"),
    repo,
    opts(),
    "linux",
  );
  assert.equal(aviso.find((x) => x.name === "openspec-cascade doctor")?.ok, true);
});

test("preflight: sin openspec-cascade instalado no ejecuta el doctor", async () => {
  const repo = repoWith("a", "b");
  const sin = createFakeRunner((cmd, args) => {
    if (cmd === "sh") return { code: 1 };
    return { code: 0, stdout: args.join(" ") };
  });
  const p = await preflight(sin, repo, opts(), "linux");
  assert.ok(!p.some((x) => x.name === "openspec-cascade doctor"));
  assert.ok(!sin.calls.some((c) => c.startsWith("openspec-cascade doctor")));
});
