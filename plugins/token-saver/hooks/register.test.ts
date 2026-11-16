import { expect, test } from "claude-code/testing";

const run = (exitCode: number, stdout: string) => ({
  value: { exitCode, stdout, stderr: "", isStdoutTruncated: false, isStderrTruncated: false },
});

test("reescribe con rtk cuando rtk tiene equivalente", async ($, on) => {
  let ran = "";
  on("process.run", (_, e) => (e.argv[1] === "rewrite" ? run(0, "rtk git status\n") : run(1, "")));
  on("tool.call", (_, e) => {
    if (e.tool === "Bash") ran = e.command;
    return { result: {} };
  });
  await $.tool.call({ tool: "Bash", command: "git status" });
  expect(ran).toBe("rtk git status");
});

test("en modo auto no reescribe: el clasificador ya revisó el comando original", async ($, on) => {
  let ran = "";
  let asked = false;
  on("process.run", () => {
    asked = true;
    return run(0, "rtk git status\n");
  });
  on("classic.UserPromptSubmit", () => ({}));
  on("tool.call", (_, e) => {
    if (e.tool === "Bash") ran = e.command;
    return { result: {} };
  });
  await $.classic.UserPromptSubmit({ prompt: "hola", permission_mode: "auto" });
  await $.tool.call({ tool: "Bash", command: "git status" });
  expect(ran).toBe("git status");
  expect(asked).toBe(false);
});

test("al salir del modo auto vuelve a reescribir", async ($, on) => {
  let ran = "";
  on("process.run", (_, e) => (e.argv[1] === "rewrite" ? run(0, "rtk git status\n") : run(1, "")));
  on("classic.UserPromptSubmit", () => ({}));
  on("tool.call", (_, e) => {
    if (e.tool === "Bash") ran = e.command;
    return { result: {} };
  });
  await $.classic.UserPromptSubmit({ prompt: "hola", permission_mode: "auto" });
  await $.classic.UserPromptSubmit({ prompt: "otra", permission_mode: "default" });
  await $.tool.call({ tool: "Bash", command: "git status" });
  expect(ran).toBe("rtk git status");
});

test("deja el comando si rtk no lo cubre", async ($, on) => {
  let ran = "";
  on("process.run", () => run(1, ""));
  on("tool.call", (_, e) => {
    if (e.tool === "Bash") ran = e.command;
    return { result: {} };
  });
  await $.tool.call({ tool: "Bash", command: "make deploy" });
  expect(ran).toBe("make deploy");
});

test("sin rtk instalado, el comando original", async ($, on) => {
  let ran = "";
  on("process.run", () => {
    throw new Error("ENOENT");
  });
  on("tool.call", (_, e) => {
    if (e.tool === "Bash") ran = e.command;
    return { result: {} };
  });
  await $.tool.call({ tool: "Bash", command: "git status" });
  expect(ran).toBe("git status");
});

test("con rtk desactivado no pregunta a rtk", { options: { rtk: false } }, async ($, on) => {
  let asked = false;
  on("process.run", () => {
    asked = true;
    return run(0, "rtk git status");
  });
  on("tool.call", () => ({ result: {} }));
  await $.tool.call({ tool: "Bash", command: "git status" });
  expect(asked).toBe(false);
});

const BASE = { sections: [{ id: "intro", text: "intro", scope: "shared" as const }] };
const COMPOSE = { model: "m", promptModel: "m", surfaces: [], outputStyle: null, traits: [] };

test("con codebase-memory conectado añade la sección de búsqueda", async ($, on) => {
  on("prompt.compose", () => BASE);
  const r = await $.prompt.compose({
    ...COMPOSE,
    tools: ["Read", "mcp__codebase-memory__search_graph"],
  });
  expect(r.sections.map((s) => s.id)).toContain("token-saver:search");
});

test("sin codebase-memory no toca el prompt", async ($, on) => {
  on("prompt.compose", () => BASE);
  const r = await $.prompt.compose({ ...COMPOSE, tools: ["Read", "Grep"] });
  expect(r.sections.map((s) => s.id)).toEqual(["intro"]);
});
