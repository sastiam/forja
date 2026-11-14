import assert from "node:assert/strict";
import { test } from "node:test";
import { maxfilesPlist } from "../../modules/macos-aggressive/apply.ts";
import { POWER, parsePmsetCustom, powerDiff, restoreArgs } from "../../modules/macos-base/apply.ts";
import {
  awakeStatus,
  guardTick,
  parseBatt,
  parseClamshellClosed,
  parseSleepDisabled,
  sudoersRule,
} from "../src/core/power.ts";
import { createFakeRunner } from "../src/core/runners/shell.ts";
import { saveAwake } from "../src/core/state.ts";
import { isolateState } from "./helpers.ts";

const CUSTOM = `Battery Power:
 lidwake              1
 displaysleep         2
 powermode            0
 sleep                1
AC Power:
 lidwake              1
 displaysleep         10
 powermode            0
 sleep                1
`;

test("parsePmsetCustom separa batería y corriente", () => {
  const c = parsePmsetCustom(CUSTOM);
  assert.equal(c.battery.displaysleep, "2");
  assert.equal(c.ac.displaysleep, "10");
});

test("powerDiff: qué cambiar, y sin powermode si el modelo no lo admite", () => {
  const c = parsePmsetCustom(CUSTOM);
  assert.deepEqual(powerDiff(c, true), {
    ac: [
      ["sleep", "0"],
      ["displaysleep", "15"],
      ["powermode", "2"],
    ],
    battery: [["powermode", "1"]],
  });
  assert.deepEqual(powerDiff(c, false).battery, []);
  // batería ya en bajo consumo (la primera aparición de powermode es la de batería)
  const done = parsePmsetCustom(CUSTOM.replace("powermode            0", "powermode            1"));
  assert.deepEqual(powerDiff(done, true).battery, []);
});

test("restoreArgs devuelve solo las claves que forja cambia, a su valor previo", () => {
  assert.deepEqual(restoreArgs(parsePmsetCustom(CUSTOM)), [
    ["-c", "sleep", "1", "displaysleep", "10", "powermode", "0"],
    ["-b", "powermode", "0"],
  ]);
  assert.deepEqual(Object.keys(POWER.battery), ["powermode"]);
});

test("parsers de pmset e ioreg", () => {
  assert.deepEqual(parseBatt("Now drawing from 'AC Power'\n -InternalBattery-0\t87%; charged;"), {
    ac: true,
    percent: 87,
  });
  assert.deepEqual(parseBatt("Now drawing from 'Battery Power'\n -InternalBattery-0\t15%;"), {
    ac: false,
    percent: 15,
  });
  assert.equal(parseSleepDisabled("System-wide power settings:\n SleepDisabled\t\t1\n"), true);
  assert.equal(parseSleepDisabled(" SleepDisabled\t\t0\n"), false);
  assert.equal(parseClamshellClosed('"AppleClamshellState" = Yes'), true);
  assert.equal(parseClamshellClosed('"AppleClamshellState" = No'), false);
});

test("la regla sudo solo permite los tres comandos de pmset", () => {
  const rule = sudoersRule("ada");
  assert.match(
    rule,
    /^ada ALL=\(root\) NOPASSWD: \/usr\/bin\/pmset -a disablesleep 1, \/usr\/bin\/pmset -a disablesleep 0, \/usr\/bin\/pmset sleepnow$/m,
  );
  assert.doesNotMatch(rule, /ALL$/m);
});

test("guardTick corta el modo tapa con batería baja y duerme si la tapa está cerrada", async () => {
  isolateState();
  const r = createFakeRunner((cmd, args) => {
    if (cmd === "pmset" && args[1] === "batt")
      return { stdout: "Now drawing from 'Battery Power'\n -InternalBattery-0\t12%;" };
    if (cmd === "ioreg") return { stdout: '"AppleClamshellState" = Yes' };
    return undefined;
  }, false);
  assert.equal(await guardTick(r), true);
  assert.ok(r.calls.includes("sudo -n /usr/bin/pmset -a disablesleep 0"));
  assert.ok(r.calls.includes("sudo -n /usr/bin/pmset sleepnow"));
});

test("guardTick no hace nada con cargador", async () => {
  const r = createFakeRunner(() => ({ stdout: "Now drawing from 'AC Power'\n\t10%;" }));
  assert.equal(await guardTick(r), false);
  assert.ok(!r.calls.some((c) => c.startsWith("sudo")));
});

test("awakeStatus: huérfano si el proceso que lo activó ya no existe", async () => {
  isolateState();
  const r = createFakeRunner((cmd, args) =>
    cmd === "pmset" && args.length === 1 ? { stdout: " SleepDisabled\t\t1\n" } : undefined,
  );
  assert.equal((await awakeStatus(r)).orphan, true, "activo sin registro");
  await saveAwake({ since: "x", reason: "wt night", pid: 2 ** 22 + 12345 });
  assert.equal((await awakeStatus(r)).orphan, true, "pid muerto");
  await saveAwake({ since: "x", reason: "wt night", pid: process.pid });
  assert.equal((await awakeStatus(r)).orphan, false);
  await saveAwake({ since: "x", reason: "manual" });
  assert.equal((await awakeStatus(r)).orphan, false, "manual sin pid no es huérfano");
});

test("plist de maxfiles", () => {
  assert.match(
    maxfilesPlist(),
    /<string>maxfiles<\/string><string>524288<\/string><string>524288<\/string>/,
  );
});
