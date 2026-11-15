import type { EngineInterface, Register } from "claude-code";
import { atom, read, update } from "claude-code";
import type { TddMode, TddRun } from "../types";
import { classify, decide, isTestRun, parseCommand, statusText } from "./logic.js";

const mode = atom({ plugin: "tdd-guard", key: "mode" } as const, null as TddMode | null);
const tests = atom({ plugin: "tdd-guard", key: "tests" } as const, [] as string[]);
const last = atom({ plugin: "tdd-guard", key: "last" } as const, null as TddRun | null);
const cwd = atom({ plugin: "tdd-guard", key: "cwd" } as const, "");

/** Ruta relativa al proyecto: así un `test/` por encima del repo no cuenta. */
function relative(root: string, path: string): string {
  return root && path.startsWith(`${root}/`) ? path.slice(root.length + 1) : path;
}

async function currentMode($: EngineInterface, initial: TddMode): Promise<TddMode> {
  return (await read($, mode)) ?? initial;
}

export const register: Register = (on, options) => {
  const initial: TddMode = options.default_mode === "off" ? "off" : "on";

  on("session.start", async ($, e, next) => {
    await update($, cwd, () => e.cwd);
    await $.command.register({
      name: "tdd",
      description: "TDD guard: /tdd on | off | status",
    });
    return next(e);
  });

  on("command.run", { command: "tdd" }, async ($, e) => {
    const word = parseCommand(e.args);
    if (word !== "status") await update($, mode, () => word);
    const text = statusText(
      await currentMode($, initial),
      (await read($, tests)).length,
      await read($, last),
    );
    $.ui.status(text);
    return { text };
  });

  on("tool.call", { tool: ["Edit", "Write"] }, async ($, e, next) => {
    if (!("file_path" in e) || typeof e.file_path !== "string") return next(e);
    const path = relative(await read($, cwd), e.file_path);
    if (classify(path) === "test") {
      const ran = await next(e);
      if (!("deny" in ran && ran.deny !== undefined) && ran.isError !== true)
        await update($, tests, (xs) => (xs.includes(path) ? xs : [...xs, path].slice(-100)));
      return ran;
    }
    const verdict = decide(await currentMode($, initial), await read($, tests), path);
    return verdict.allow ? next(e) : { deny: verdict.reason };
  }).catch(($, e, next) => next(e));

  on("tool.call", { tool: "Bash" }, async ($, e, next) => {
    const ran = await next(e);
    if (e.tool === "Bash" && isTestRun(e.command) && ran.deny === undefined) {
      const run: TddRun = ran.isError === true ? "red" : "green";
      await update($, last, () => run);
      const n = (await read($, tests)).length;
      $.ui.status(statusText(await currentMode($, initial), n, run));
    }
    return ran;
  });
};
