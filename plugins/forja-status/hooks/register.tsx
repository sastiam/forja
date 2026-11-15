import type { EngineInterface, Register } from "claude-code";
import { atom, read, update } from "claude-code";
import type { ForjaFinding, ForjaSnapshot } from "../types";
import {
  bandSegments,
  doctorPrompt,
  EMPTY,
  ICON,
  parseAwake,
  parseCommand,
  parseDoctor,
  parseDrift,
  parseWorktreePort,
} from "./logic.js";

const PANE = "forja-status";
const QUICK_EVERY_MS = 60_000;
const DRIFT_EVERY_MS = 600_000;
const QUICK_TIMEOUT_MS = 10_000;
const SLOW_TIMEOUT_MS = 180_000;

const snapshot = atom(
  { plugin: "forja-status", key: "snapshot" } as const,
  EMPTY as ForjaSnapshot,
  {
    shape: "snapshot-1",
  },
);
const findings = atom(
  { plugin: "forja-status", key: "findings" } as const,
  null as ForjaFinding[] | null,
);
const doctorRunning = atom({ plugin: "forja-status", key: "doctorRunning" } as const, false);

/** stdout del comando, o undefined si no está instalado o falla al arrancar. */
async function sh($: EngineInterface, argv: string[], timeoutMs: number) {
  try {
    return await $.process.run(argv, { timeoutMs });
  } catch {
    return undefined;
  }
}

/** Rama, puerto, Colima, modo tapa y batería: rápido, cada minuto. */
async function refreshQuick($: EngineInterface, cwd: string): Promise<void> {
  const [branch, wt, colima, awake] = await Promise.all([
    sh($, ["git", "branch", "--show-current"], QUICK_TIMEOUT_MS),
    sh($, ["forja", "wt", "ls", "--json", "--no-pr"], QUICK_TIMEOUT_MS),
    sh($, ["colima", "status"], QUICK_TIMEOUT_MS),
    sh($, ["forja", "awake", "status", "--json"], QUICK_TIMEOUT_MS),
  ]);
  const power = awake ? parseAwake(awake.stdout) : { awake: null, battery: null, onAc: null };
  await update(
    $,
    snapshot,
    (s): ForjaSnapshot => ({
      ...s,
      branch: branch?.exitCode === 0 ? branch.stdout.trim() || null : null,
      port: wt?.exitCode === 0 ? parseWorktreePort(wt.stdout, cwd) : null,
      colima: colima ? (colima.exitCode === 0 ? ("up" as const) : ("down" as const)) : null,
      ...power,
    }),
  );
}

/** `forja drift --json`: lento, cada 10 minutos. Sale con 2 cuando hay desvío. */
async function refreshDrift($: EngineInterface): Promise<void> {
  const r = await sh($, ["forja", "drift", "--json"], SLOW_TIMEOUT_MS);
  await update($, snapshot, (s) => ({ ...s, drift: r ? parseDrift(r.stdout) : null }));
}

async function runDoctor($: EngineInterface): Promise<void> {
  await update($, doctorRunning, () => true);
  const r = await sh($, ["forja", "doctor", "--json"], SLOW_TIMEOUT_MS);
  await update($, findings, () => (r ? parseDoctor(r.stdout) : null));
  await update($, doctorRunning, () => false);
}

export const register: Register = (on, options) => {
  let cwd = ".";

  on("session.start", async ($, e, next) => {
    const started = await next(e);
    cwd = e.cwd;
    await $.command.register({
      name: "forja",
      description: "Estado de forja: /forja [status|doctor|refresh]",
    });
    void refreshQuick($, e.cwd);
    $.clock.every(QUICK_EVERY_MS, () => void refreshQuick($, e.cwd));
    if (options.drift !== false) {
      void refreshDrift($);
      $.clock.every(DRIFT_EVERY_MS, () => void refreshDrift($));
    }
    return started;
  });

  on("command.run", { command: "forja" }, async ($, e) => {
    const sub = parseCommand(e.args);
    if (sub === "refresh") {
      await refreshQuick($, cwd);
      void refreshDrift($);
      return { text: "forja-status: actualizando." };
    }
    if (sub === "doctor") void runDoctor($);
    await $.ui.open({ id: PANE, title: "forja" });
    return {
      text: sub === "doctor" ? "forja doctor en marcha (panel forja)." : "Panel forja abierto.",
    };
  });

  on("ui.render", { component: "AbovePrompt" }, async ($, e, next) => {
    const seg = bandSegments(await read($, snapshot));
    if (seg.length === 0 || e.props.hasSurvey) return next(e);
    const { Text } = $.ui.resolve(e);
    return <Text dimColor>{seg.join(" · ")}</Text>;
  });

  on("ui.render", { component: "Pane", requestId: PANE }, async ($, e) => {
    const { Box, Button, Text } = $.ui.resolve(e);
    const s = await read($, snapshot);
    const list = await read($, findings);
    const running = await read($, doctorRunning);
    const seg = bandSegments(s);
    return (
      <Box flexDirection="column">
        <Text bold>Estado</Text>
        <Text dimColor>{seg.length ? seg.join(" · ") : "sin datos todavía"}</Text>
        <Text bold>forja doctor</Text>
        {running && <Text dimColor>ejecutando…</Text>}
        {!running && list === null && <Text dimColor>Pulsa «Ejecutar doctor».</Text>}
        {!running &&
          list?.map((f) => (
            <Text dimColor={f.status === "ok" || f.status === "skip"}>
              {ICON[f.status]} {f.name}
              {f.detail ? ` — ${f.detail}` : ""}
            </Text>
          ))}
        <Box flexDirection="row">
          <Button key="doctor" label="Ejecutar doctor" onPress={() => runDoctor($)} />
          {list?.some((f) => f.status !== "ok" && f.status !== "skip") && (
            <Button
              key="fix"
              label="Diagnosticar con mac-doctor"
              onPress={() => $.prompt.submit({ text: doctorPrompt(list), asUser: true })}
            />
          )}
        </Box>
      </Box>
    );
  });
};
