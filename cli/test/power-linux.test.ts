import assert from "node:assert/strict";
import { test } from "node:test";
import { awakeOff, awakeOn, awakeStatus, guardTick } from "../src/core/power.ts";
import {
  INHIBIT_START_SCRIPT,
  parseForjaInhibitors,
  parseLidClosedLinux,
  parseLidInhibited,
  parsePowerSupply,
  parseStartedPid,
} from "../src/core/power-linux.ts";
import { createFakeRunner } from "../src/core/runners/shell.ts";
import { isolateState } from "./helpers.ts";

const LIST = `WHO            UID  USER    PID     COMM            WHAT                                    WHY      MODE
GNOME Shell    1000 sastiam 2100    gnome-shell     sleep                                   Inhibited  delay
forja          1000 sastiam 4242    systemd-inhibit handle-lid-switch:sleep                 wt night   block
`;

test("parseForjaInhibitors devuelve solo los PID de forja", () => {
  assert.deepEqual(parseForjaInhibitors(LIST), [4242]);
  assert.deepEqual(parseForjaInhibitors("WHO UID USER PID\nGNOME Shell 1000 a 1 x sleep\n"), []);
});

test("parseLidInhibited exige un inhibidor de forja sobre la tapa", () => {
  assert.equal(parseLidInhibited(LIST), true);
  assert.equal(parseLidInhibited(LIST.replace("forja ", "otro ")), false);
  assert.equal(parseLidInhibited(""), false);
});

test("parsePowerSupply: con cargador, sin cargador y sobremesa sin batería", () => {
  assert.deepEqual(parsePowerSupply("ADP0 Mains 1 -\nBAT0 Battery - 72\n"), {
    ac: true,
    percent: 72,
  });
  assert.deepEqual(parsePowerSupply("ADP0 Mains 0 -\nBAT0 Battery - 15\n"), {
    ac: false,
    percent: 15,
  });
  // sin batería nunca debe cortar por batería
  assert.deepEqual(parsePowerSupply(""), { ac: true, percent: null });
});

test("parseLidClosedLinux y parseStartedPid", () => {
  assert.equal(parseLidClosedLinux("state:      closed\n"), true);
  assert.equal(parseLidClosedLinux("state:      open\n"), false);
  assert.equal(parseStartedPid("4242\n"), 4242);
  assert.equal(parseStartedPid("abc"), null);
  assert.equal(parseStartedPid(""), null);
});

test("el script del inhibidor recibe el motivo como argumento, no interpolado", () => {
  assert.match(INHIBIT_START_SCRIPT, /--why="\$1"/);
  assert.match(INHIBIT_START_SCRIPT, /--who=forja/);
  assert.match(INHIBIT_START_SCRIPT, /--what=handle-lid-switch:sleep/);
  assert.match(INHIBIT_START_SCRIPT, /--mode=block/);
});

test("awakeOn en Linux lanza el inhibidor sin sudo ni pmset y pasa el motivo como argumento", async () => {
  isolateState();
  let argv: string[] = [];
  const r = createFakeRunner((cmd, args) => {
    if (cmd !== "sh") return undefined;
    argv = args;
    return { stdout: "4242\n" };
  }, false);
  const reason = "wt night x; rm -rf /";
  await awakeOn(r, reason, undefined, "linux");
  assert.ok(!r.calls.some((c) => c.includes("sudo") || c.includes("pmset")));
  assert.equal(argv[0], "-c");
  assert.equal(argv[1], INHIBIT_START_SCRIPT);
  assert.ok(!argv[1]?.includes("rm -rf"), "el motivo no se inyecta en el script");
  assert.equal(argv.at(-1), reason, "el motivo va como argumento aparte");
});

test("awakeOn en Linux falla claro si el inhibidor no arranca", async () => {
  isolateState();
  const r = createFakeRunner((cmd) => (cmd === "sh" ? { stdout: "" } : undefined), false);
  await assert.rejects(awakeOn(r, "x", undefined, "linux"), /inhibidor de systemd/);
});

test("awakeOff en Linux mata el grupo de procesos del inhibidor de forja", async () => {
  isolateState();
  const r = createFakeRunner(
    (cmd) => (cmd === "systemd-inhibit" ? { stdout: LIST } : undefined),
    false,
  );
  await awakeOff(r, "linux");
  assert.ok(r.calls.some((c) => c === "sh -c kill -TERM -- -4242 2>/dev/null || kill -TERM 4242"));
  assert.ok(!r.calls.some((c) => c.includes("pmset")));
});

test("awakeStatus en Linux usa systemd-inhibit y la batería de sysfs", async () => {
  isolateState();
  const r = createFakeRunner((cmd, args) => {
    if (cmd === "systemd-inhibit") return { stdout: LIST };
    if (cmd === "sh" && args[1]?.includes("power_supply"))
      return { stdout: "ADP0 Mains 1 -\nBAT0 Battery - 72\n" };
    return undefined;
  });
  const s = await awakeStatus(r, "linux");
  assert.equal(s.sleepDisabled, true);
  assert.deepEqual(s.battery, { ac: true, percent: 72 });
  assert.equal(s.orphan, true, "activo sin registro de forja");
});

test("guardTick en Linux corta con batería baja y suspende solo si la tapa está cerrada", async () => {
  isolateState();
  const answers = (closed: boolean) => (cmd: string, args: string[]) => {
    if (cmd === "systemd-inhibit") return { stdout: LIST };
    if (cmd === "sh" && args[1]?.includes("power_supply"))
      return { stdout: "ADP0 Mains 0 -\nBAT0 Battery - 12\n" };
    if (cmd === "sh" && args[1]?.includes("acpi/button/lid"))
      return { stdout: `state:      ${closed ? "closed" : "open"}\n` };
    return undefined;
  };
  const cerrada = createFakeRunner(answers(true), false);
  assert.equal(await guardTick(cerrada, 20, "linux"), true);
  assert.ok(cerrada.calls.includes("systemctl suspend"));
  const abierta = createFakeRunner(answers(false), false);
  assert.equal(await guardTick(abierta, 20, "linux"), true);
  assert.ok(!abierta.calls.includes("systemctl suspend"));
});

test("guardTick en Linux no corta con cargador ni sin batería", async () => {
  const ac = createFakeRunner((cmd) =>
    cmd === "sh" ? { stdout: "ADP0 Mains 1 -\nBAT0 Battery - 5\n" } : undefined,
  );
  assert.equal(await guardTick(ac, 20, "linux"), false);
  const sobremesa = createFakeRunner(() => ({ stdout: "" }));
  assert.equal(await guardTick(sobremesa, 20, "linux"), false);
});
