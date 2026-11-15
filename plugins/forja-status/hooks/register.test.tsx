import type { On } from "claude-code";
import { expect, test } from "claude-code/testing";

const cmd = (command: string, args: string) => ({
  command,
  args,
  origin: { kind: "composer" as const },
  presentation: { isFullscreen: false, columns: 80 },
});

const ok = (stdout: string, exitCode = 0) => ({
  value: { exitCode, stdout, stderr: "", isStdoutTruncated: false, isStderrTruncated: false },
});

const ANSWERS: Record<string, ReturnType<typeof ok>> = {
  git: ok("feat/x\n"),
  "forja wt": ok(JSON.stringify([{ path: "/repo/wt", port: 3012 }])),
  colima: ok("", 1),
  "forja awake": ok(
    JSON.stringify({ sleepDisabled: true, orphan: false, battery: { percent: 15, ac: false } }),
  ),
  "forja drift": ok(JSON.stringify({ modules: [{ pending: [1] }, { pending: [] }] }), 2),
  "forja doctor": ok(
    JSON.stringify({ findings: [{ name: "disco", status: "fail", detail: "95 %" }] }),
    1,
  ),
};

function engine(on: On) {
  on("process.run", (_, e) => {
    const [a, b] = e.argv;
    return ANSWERS[`${a} ${b}`] ?? ANSWERS[a ?? ""] ?? ok("", 127);
  });
  on("command.register", () => ({ value: { command: "forja" } }));
  on("ui.open", () => ({ value: { isPlaced: true } }));
  on("session.start", (_, e) => ({ cwd: e.cwd }));
  on("clock.every", () => ({ value: undefined }));
}

const BAND = {
  plugin: "forja-status",
  component: "AbovePrompt",
  props: {
    hasSurvey: false,
    isCollapsed: false,
    isWorking: false,
    maxRows: 3,
    bodyColumns: 100,
    scroll: { offset: 0, bodyRows: 3 },
    view: {},
  },
} as const;

const PANE = {
  plugin: "forja-status",
  component: "Pane",
  requestId: "forja-status",
  props: {
    title: "forja",
    isFocused: false,
    bodyColumns: 60,
    placement: "dock",
    scroll: { offset: 0, bodyRows: 20 },
    view: {},
  },
} as const;

test("la banda muestra rama, puerto, drift, colima, modo tapa y batería", async ($, on) => {
  engine(on);
  await $.session.start({ cwd: "/repo/wt", surface: "terminal", isInteractive: true });
  await $.command.run(cmd("forja", "refresh"));
  for (const surface of ["terminal", "desktop"] as const) {
    const ui = await $.ui.mount({ ...BAND, surface });
    const t = await ui.find({ type: "Text" });
    expect(t?.text).toContain("⎇ feat/x :3012");
    expect(t?.text).toContain("colima ▼");
    expect(t?.text).toContain("awake ●");
    expect(t?.text).toContain("🪫 15 %");
    await ui.unmount();
  }
});

test("/forja doctor llena el panel y ofrece mac-doctor", async ($, on) => {
  engine(on);
  let sent = "";
  on("prompt.submit", (_, e) => {
    sent = e.text;
    return { text: e.text };
  });
  await $.session.start({ cwd: "/repo", surface: "desktop", isInteractive: true });
  await $.command.run(cmd("forja", "doctor"));
  const ui = await $.ui.mount({ ...PANE, surface: "desktop" });
  await ui.press({ key: "doctor" });
  expect((await ui.find({ type: "Text", text: /disco/ }))?.text).toContain("✖ disco");
  await ui.press({ key: "fix" });
  expect(sent).toMatch(/mac-doctor/);
  await ui.unmount();
});
