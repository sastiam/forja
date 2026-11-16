import type { EngineInterface, Register } from "claude-code";
import { atom, read, update } from "claude-code";
import {
  bandText,
  hasCodebaseMemory,
  interpretRewrite,
  parseGain,
  rewriteAllowed,
  SEARCH_SECTION,
  shouldTry,
} from "./logic.js";

const REWRITE_TIMEOUT_MS = 2000;
const GAIN_TIMEOUT_MS = 5000;
const REFRESH_EVERY_MS = 60_000;

const saved = atom({ plugin: "token-saver", key: "saved" } as const, null as number | null);
const percent = atom({ plugin: "token-saver", key: "percent" } as const, null as number | null);
const refreshedAt = atom({ plugin: "token-saver", key: "refreshedAt" } as const, 0);
/** Último modo de permisos visto en un evento clásico (`permission_mode`). */
const mode = atom({ plugin: "token-saver", key: "permissionMode" } as const, null as string | null);
/** Relee el ahorro de rtk (como mucho una vez por minuto) y el contexto usado. */
async function refresh($: EngineInterface, force: boolean): Promise<void> {
  const usage = await $.session.usage();
  await update($, percent, () => usage.context.percent ?? null);
  const now = await $.clock.now();
  if (!force && now - (await read($, refreshedAt)) < REFRESH_EVERY_MS) return;
  await update($, refreshedAt, () => now);
  try {
    const r = await $.process.run(["rtk", "gain", "--format", "json"], {
      timeoutMs: GAIN_TIMEOUT_MS,
    });
    const n = r.exitCode === 0 ? parseGain(r.stdout) : undefined;
    await update($, saved, () => n ?? null);
  } catch {
    await update($, saved, () => null); // rtk no instalado
  }
}

export const register: Register = (on, options) => {
  if (options.rtk !== false) {
    // El modo puede cambiar a mitad de sesión (shift+tab): se relee en cada prompt y herramienta.
    on("classic.SessionStart", async ($, e, next) => {
      await update($, mode, () => e.permission_mode ?? null);
      return next(e);
    });
    on("classic.UserPromptSubmit", async ($, e, next) => {
      await update($, mode, () => e.permission_mode ?? null);
      return next(e);
    });
    on("classic.PostToolUse", async ($, e, next) => {
      await update($, mode, () => e.permission_mode ?? null);
      return next(e);
    });

    on("tool.call", { tool: "Bash" }, async ($, e, next) => {
      if (e.tool !== "Bash" || !shouldTry(e.command)) return next(e);
      if (!rewriteAllowed(await read($, mode))) return next(e);
      try {
        const r = await $.process.run(["rtk", "rewrite", e.command], {
          timeoutMs: REWRITE_TIMEOUT_MS,
        });
        const command = interpretRewrite(r.exitCode, r.stdout, e.command);
        return command ? next({ ...e, command }) : next(e);
      } catch {
        return next(e); // rtk no instalado o lento: el comando original
      }
    }).catch(($, e, next) => next(e));
  }

  if (options.search_hint !== false)
    on("prompt.compose", async ($, e, next) => {
      const composed = await next(e);
      if (!hasCodebaseMemory(e.tools)) return composed;
      return {
        sections: [
          ...composed.sections,
          { id: "token-saver:search", text: SEARCH_SECTION, scope: "session" as const },
        ],
      };
    });

  if (options.band !== false) {
    on("session.start", async ($, e, next) => {
      const started = await next(e);
      await refresh($, true);
      return started;
    });

    on("turn.complete", async ($, e, next) => {
      const done = await next(e);
      await refresh($, false);
      return done;
    });

    on("ui.render", { component: "AbovePrompt" }, async ($, e, next) => {
      const s = await read($, saved);
      const p = await read($, percent);
      const text = bandText(p ?? undefined, s ?? undefined);
      if (!text || e.props.hasSurvey) return next(e);
      const { Text } = $.ui.resolve(e);
      return <Text dimColor>{text}</Text>;
    });
  }
};
