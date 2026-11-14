import assert from "node:assert/strict";
import { test } from "node:test";
import { renderReport } from "../src/commands/report.ts";

test("renderReport genera tablas y lista de diagnóstico", () => {
  const md = renderReport({
    version: "0.0.0",
    platform: "darwin",
    arch: "arm64",
    osRelease: "27.0.0",
    date: "2026-01-01",
    modules: [{ name: "core", status: "ok", pending: 0 }],
    findings: [
      { name: "memoria", status: "ok", detail: "90% libre" },
      { name: "disco", status: "warn" },
    ],
  });
  assert.match(md, /\| core \| ok \| 0 \|/);
  assert.match(md, /- ✅ memoria — 90% libre/);
  assert.match(md, /- ⚠️ disco$/m);
});
