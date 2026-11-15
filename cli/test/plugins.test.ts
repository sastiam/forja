// Lógica pura de los mods de plugins/: corre con node --test aunque no haya Claude Code (CI).
// El cableado de cada mod (hooks, UI) lo prueba `npm run plugins:check` con `claude plugin test`.
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import * as status from "../../plugins/forja-status/hooks/logic.ts";
import * as quality from "../../plugins/quality-guard/hooks/logic.ts";
import * as tdd from "../../plugins/tdd-guard/hooks/logic.ts";
import * as saver from "../../plugins/token-saver/hooks/logic.ts";

const PLUGINS = join(import.meta.dirname, "..", "..", "plugins");

test("plugins: el marketplace lista cada mod con su carpeta y su nombre", () => {
  const market = JSON.parse(
    readFileSync(join(PLUGINS, ".claude-plugin", "marketplace.json"), "utf8"),
  ) as { name: string; plugins: { name: string; source: string }[] };
  const dirs = readdirSync(PLUGINS, { withFileTypes: true })
    .filter((d) => d.isDirectory() && !d.name.startsWith("."))
    .map((d) => d.name)
    .sort();
  assert.equal(market.name, "forja");
  assert.deepEqual(market.plugins.map((p) => p.name).sort(), dirs);
  for (const p of market.plugins) {
    assert.equal(p.source, `./${p.name}`);
    const manifest = JSON.parse(
      readFileSync(join(PLUGINS, p.name, ".claude-plugin", "plugin.json"), "utf8"),
    ) as { name: string };
    assert.equal(manifest.name, p.name);
  }
});

test("tdd-guard: clasifica tests, código y archivos exentos", () => {
  const cases: [string, tdd.FileKind][] = [
    ["src/a.ts", "source"],
    ["src/a.test.ts", "test"],
    ["src/a.spec.tsx", "test"],
    ["src/__tests__/a.ts", "test"],
    ["cli/test/helpers.ts", "test"],
    ["app/test_models.py", "test"],
    ["pkg/a_test.go", "test"],
    ["pkg/a.go", "source"],
    ["README.md", "other"],
    ["vite.config.ts", "other"],
    ["src/types.d.ts", "other"],
    ["dist/a.js", "other"],
    ["package.json", "other"],
  ];
  for (const [path, kind] of cases) assert.equal(tdd.classify(path), kind, path);
});

test("tdd-guard: bloquea código sin test y lo permite con test o en off", () => {
  assert.equal(tdd.decide("on", [], "src/a.ts").allow, false);
  assert.equal(tdd.decide("on", ["src/a.test.ts"], "src/a.ts").allow, true);
  assert.equal(tdd.decide("off", [], "src/a.ts").allow, true);
  assert.equal(tdd.decide("on", [], "docs/x.md").allow, true);
});

test("tdd-guard: reconoce runners de tests", () => {
  for (const c of [
    "pnpm -s test",
    "npx vitest run",
    "node --test cli/test",
    "go test ./...",
    "pytest -q",
  ])
    assert.equal(tdd.isTestRun(c), true, c);
  for (const c of ["git status", "pnpm build", "cat test.txt"])
    assert.equal(tdd.isTestRun(c), false, c);
});

test("quality-guard: clasifica comandos de AWS", () => {
  const cases: [string, string | undefined, quality.AwsLevel][] = [
    ["aws s3 mb s3://b", undefined, "ask"],
    ["AWS_PROFILE=floci aws s3 mb s3://b", undefined, "pass"],
    ["aws s3 mb s3://b", "floci", "pass"],
    ["aws --profile prod s3 mb s3://b", "floci", "ask"],
    ["aws --endpoint-url http://localhost:4566 s3 mb s3://b", undefined, "pass"],
    ["aws sts get-caller-identity", undefined, "pass"],
    ["aws ec2 describe-instances", undefined, "pass"],
    ["aws s3 ls", undefined, "pass"],
    ["aws s3 rm s3://b --recursive", undefined, "deny"],
    ["aws cloudformation delete-stack --stack-name x", undefined, "deny"],
    ["cdk synth", undefined, "pass"],
    ["pnpm exec cdk deploy", undefined, "ask"],
    ["AWS_PROFILE=floci cdk deploy --require-approval never", undefined, "pass"],
    ["cdk destroy --all", "prod", "deny"],
    ["cdklocal deploy", undefined, "pass"],
    ["op run --env-file=.env.tpl -- cdk deploy", undefined, "ask"],
    ["terraform plan", undefined, "pass"],
    ["terraform apply", undefined, "ask"],
    ["git status && cdk destroy", undefined, "deny"],
    ["git status", undefined, "pass"],
    ["echo aws is great", undefined, "pass"],
  ];
  for (const [cmd, profile, level] of cases)
    assert.equal(quality.classifyAws(cmd, profile).level, level, `${cmd} (${profile ?? "-"})`);
});

test("quality-guard: encuentra comandos aws dentro de entradas MCP", () => {
  assert.equal(quality.isAwsMcpTool("mcp__aws-mcp__call_aws"), true);
  assert.equal(quality.isAwsMcpTool("mcp__github__get_me"), false);
  assert.equal(quality.awsCommandIn({ request: { cli_command: "aws s3 ls" } }), "aws s3 ls");
  assert.equal(quality.awsCommandIn({ query: "list buckets" }), undefined);
});

test("quality-guard: interpreta biome y ruff y filtra por las líneas editadas", () => {
  const biome = `aviso previo\n${JSON.stringify({
    diagnostics: [
      { category: "lint/style/noMagicNumbers", location: { start: { line: 2, column: 14 } } },
      { category: "lint/style/noMagicNumbers", location: { start: { line: 9, column: 3 } } },
    ],
  })}`;
  const found = quality.parseFindings("biome", biome);
  assert.equal(found.length, 2);
  assert.match(quality.report("a.ts", found) ?? "", /a\.ts:2:14/);
  assert.doesNotMatch(quality.report("a.ts", found, { from: 1, to: 3 }) ?? "", /a\.ts:9/);
  assert.equal(quality.report("a.ts", found, { from: 20, to: 30 }), undefined);

  const ruff = JSON.stringify([
    { code: "PLR2004", message: "Magic value 3600", location: { row: 4, column: 8 } },
  ]);
  assert.match(
    quality.report("a.py", quality.parseFindings("ruff", ruff)) ?? "",
    /a\.py:4:8 Magic/,
  );
  assert.deepEqual(quality.parseFindings("biome", "no es json"), []);
  assert.deepEqual(quality.linesOf("a\nb\nc\nd", "c\nd"), { from: 3, to: 4 });
  assert.equal(quality.linterFor("x.d.ts"), undefined);
  assert.equal(quality.linterFor("x.tsx"), "biome");
});

test("token-saver: decide cuándo preguntar a rtk e interpreta su respuesta", () => {
  assert.equal(saver.shouldTry("git status"), true);
  assert.equal(saver.shouldTry("rtk git status"), false);
  assert.equal(saver.shouldTry("cat <<EOF\nx\nEOF"), false);
  assert.equal(saver.shouldTry("   "), false);
  assert.equal(saver.interpretRewrite(0, "rtk git status\n", "git status"), "rtk git status");
  assert.equal(saver.interpretRewrite(3, "rtk ls", "ls"), "rtk ls");
  assert.equal(saver.interpretRewrite(1, "", "make"), undefined);
  assert.equal(saver.interpretRewrite(0, "git status", "git status"), undefined);
});

test("token-saver: lee rtk gain y arma la banda", () => {
  assert.equal(saver.parseGain(JSON.stringify({ summary: { total_saved: 1_234_567 } })), 1_234_567);
  assert.equal(saver.parseGain("{}"), undefined);
  assert.equal(saver.parseGain("nope"), undefined);
  assert.equal(saver.bandText(42.4, 1_234_567), "ctx 42 % · rtk −1.2M tok");
  assert.equal(saver.bandText(undefined, 3400), "rtk −3k tok");
  assert.equal(saver.bandText(undefined, undefined), undefined);
  assert.equal(saver.hasCodebaseMemory(["Read", "mcp__codebase-memory__search_graph"]), true);
  assert.equal(saver.hasCodebaseMemory(["Read"]), false);
});

test("forja-status: interpreta la CLI de forja y arma la banda", () => {
  assert.equal(
    status.parseDrift(JSON.stringify({ modules: [{ pending: [1] }, { failedChecks: [1] }, {}] })),
    2,
  );
  assert.equal(status.parseDrift("roto"), null);
  const wt = JSON.stringify([
    { path: "/r", port: null },
    { path: "/r/.wt/feat", port: 3012 },
  ]);
  assert.equal(status.parseWorktreePort(wt, "/r/.wt/feat/src"), 3012);
  assert.equal(status.parseWorktreePort(wt, "/r"), null);
  assert.deepEqual(
    status.parseAwake(
      JSON.stringify({ sleepDisabled: true, orphan: true, battery: { percent: 50, ac: true } }),
    ),
    { awake: "orphan", battery: 50, onAc: true },
  );
  const band = status.bandSegments({
    ...status.EMPTY,
    branch: "main",
    port: 3000,
    drift: 1,
    colima: "up",
    awake: "on",
    battery: 15,
    onAc: false,
  });
  assert.deepEqual(band, ["⎇ main :3000", "drift 1", "colima ▲", "awake ●", "🪫 15 %"]);
  assert.deepEqual(status.bandSegments(status.EMPTY), []);
  assert.match(
    status.doctorPrompt([
      { name: "disco", status: "fail", detail: "95 %" },
      { name: "ok", status: "ok" },
    ]),
    /\[fail\] disco: 95 %/,
  );
  assert.equal(status.parseCommand(" Doctor "), "doctor");
  assert.equal(status.parseCommand("xyz"), "status");
});
