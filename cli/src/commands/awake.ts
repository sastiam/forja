import { parseArgs } from "node:util";
import { log, out, outJson } from "../core/log.ts";
import { awakeOff, awakeOn, awakeStatus } from "../core/power.ts";
import { createRunner } from "../core/runners/shell.ts";

const HELP = `forja awake — no dormir al cerrar la tapa (solo mientras haga falta)

  on [--reason texto]   macOS: pmset -a disablesleep 1 · Linux: inhibidor de systemd (lo usa wt night; a mano, recuerda apagarlo)
  off                   vuelve el comportamiento normal
  status [--json]       estado, quién lo activó y batería

macOS requiere la regla sudo de macos-base (/etc/sudoers.d/forja-awake). Linux no necesita sudo.`;

const SUPPORTED = ["darwin", "linux"];

export async function awakeCommand(argv: string[]): Promise<number> {
  const [sub, ...rest] = argv;
  const { values } = parseArgs({
    args: rest,
    allowPositionals: true,
    options: { reason: { type: "string" }, json: { type: "boolean" } },
  });
  if (!SUPPORTED.includes(process.platform) && sub !== undefined && sub !== "--help") {
    log.error("forja awake solo aplica a macOS y Linux");
    return 1;
  }
  const runner = createRunner(false);
  switch (sub) {
    case "on":
      await awakeOn(runner, values.reason ?? "manual");
      log.ok(
        "Modo tapa activo: el equipo no dormirá al cerrar la tapa. Apágalo con: forja awake off",
      );
      return 0;
    case "off":
      await awakeOff(runner);
      log.ok("Modo tapa desactivado: cerrar la tapa vuelve a dormir el equipo.");
      return 0;
    case "status": {
      const s = await awakeStatus(runner);
      if (values.json) outJson(s);
      else {
        out(
          s.sleepDisabled
            ? `● activo${s.state ? ` desde ${s.state.since} (${s.state.reason})` : " sin registro de forja"}${s.orphan ? " — huérfano: forja awake off" : ""}`
            : "○ inactivo: la tapa duerme el equipo",
        );
        out(
          `  batería: ${s.battery.percent ?? "?"} %${s.battery.ac ? " con cargador" : " sin cargador"}`,
        );
      }
      return s.orphan ? 2 : 0;
    }
    default:
      out(HELP);
      return sub === undefined || sub === "--help" ? 0 : 1;
  }
}
