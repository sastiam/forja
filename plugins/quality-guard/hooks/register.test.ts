import { expect, test } from "claude-code/testing";

const BIOME = JSON.stringify({
  diagnostics: [
    { category: "lint/style/noMagicNumbers", location: { start: { line: 2, column: 14 } } },
  ],
});

test("aws real que cambia recursos pide confirmación", async ($, on) => {
  on("env.get", () => ({ value: undefined }));
  on("tool.check", () => ({ decision: "allow" }));
  const r = await $.tool.check({ tool: "Bash", input: { command: "aws s3 mb s3://bucket" } });
  expect(r.decision).toBe("ask");
  expect(r.reason).toMatch(/cuenta real/);
});

test("aws contra Floci pasa", async ($, on) => {
  on("env.get", () => ({ value: undefined }));
  on("tool.check", () => ({ decision: "allow" }));
  const r = await $.tool.check({
    tool: "Bash",
    input: { command: "AWS_PROFILE=floci aws s3 mb s3://bucket" },
  });
  expect(r.decision).toBe("allow");
});

test("cdk destroy contra cuenta real se bloquea", async ($, on) => {
  on("env.get", () => ({ value: "prod" }));
  on("tool.check", () => ({ decision: "allow" }));
  const r = await $.tool.check({ tool: "Bash", input: { command: "pnpm exec cdk destroy --all" } });
  expect(r.decision).toBe("deny");
});

test("lecturas de aws pasan", async ($, on) => {
  on("env.get", () => ({ value: undefined }));
  on("tool.check", () => ({ decision: "allow" }));
  const r = await $.tool.check({ tool: "Bash", input: { command: "aws sts get-caller-identity" } });
  expect(r.decision).toBe("allow");
});

test("MCP de AWS que escribe pide confirmación", async ($, on) => {
  on("env.get", () => ({ value: undefined }));
  on("tool.check", () => ({ decision: "allow" }));
  const r = await $.tool.check({
    tool: "mcp__aws__call_aws",
    input: { cli_command: "aws dynamodb delete-table --table-name t" },
  });
  expect(r.decision).toBe("ask");
});

test("tras escribir, avisa de números mágicos", async ($, on) => {
  on("tool.call", () => ({ result: {} }));
  on("process.run", () => ({
    value: {
      exitCode: 0,
      stdout: BIOME,
      stderr: "",
      isStdoutTruncated: false,
      isStderrTruncated: false,
    },
  }));
  const r = await $.tool.call({ tool: "Write", file_path: "/repo/src/a.ts", content: "x" });
  expect(r.context?.join("\n")).toMatch(/src\/a\.ts:2:14/);
});

test("sin hallazgos no añade nada", async ($, on) => {
  on("tool.call", () => ({ result: {} }));
  on("process.run", () => ({
    value: {
      exitCode: 0,
      stdout: JSON.stringify({ diagnostics: [] }),
      stderr: "",
      isStdoutTruncated: false,
      isStderrTruncated: false,
    },
  }));
  const r = await $.tool.call({ tool: "Write", file_path: "/repo/src/a.ts", content: "x" });
  expect(r.context).toBeUndefined();
});
