import type { On } from "claude-code";
import { type Engine, expect, test } from "claude-code/testing";

const cmd = (command: string, args: string) => ({
  command,
  args,
  origin: { kind: "composer" as const },
  presentation: { isFullscreen: false, columns: 80 },
});

const ROOT = "/repo";

async function start($: Engine, on: On) {
  on("command.register", () => ({ value: { command: "tdd" } }));
  on("session.start", (_, e) => ({ cwd: e.cwd }));
  on("tool.call", () => ({ result: {} }));
  await $.session.start({ cwd: ROOT, surface: "terminal", isInteractive: true });
}

test("bloquea código de producción sin test en la sesión", async ($, on) => {
  await start($, on);
  const r = await $.tool.call({ tool: "Write", file_path: `${ROOT}/src/a.ts`, content: "x" });
  expect(r.deny).toMatch(/tdd-guard/);
});

test("tras escribir un test, deja editar el código", async ($, on) => {
  await start($, on);
  const t = await $.tool.call({ tool: "Write", file_path: `${ROOT}/src/a.test.ts`, content: "t" });
  expect(t.deny).toBeUndefined();
  const r = await $.tool.call({ tool: "Write", file_path: `${ROOT}/src/a.ts`, content: "x" });
  expect(r.deny).toBeUndefined();
});

test("/tdd off desactiva el guard en la sesión", async ($, on) => {
  await start($, on);
  const out = await $.command.run(cmd("tdd", "off"));
  expect(out.text).toMatch(/off/);
  const r = await $.tool.call({ tool: "Write", file_path: `${ROOT}/src/a.ts`, content: "x" });
  expect(r.deny).toBeUndefined();
});

test("docs y configuración no se bloquean", async ($, on) => {
  await start($, on);
  for (const file_path of [`${ROOT}/README.md`, `${ROOT}/vite.config.ts`, `${ROOT}/types.d.ts`]) {
    const r = await $.tool.call({ tool: "Write", file_path, content: "x" });
    expect(r.deny).toBeUndefined();
  }
});

test("default_mode off no bloquea", { options: { default_mode: "off" } }, async ($, on) => {
  await start($, on);
  const r = await $.tool.call({ tool: "Write", file_path: `${ROOT}/src/a.ts`, content: "x" });
  expect(r.deny).toBeUndefined();
});
