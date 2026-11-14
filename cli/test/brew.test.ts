import assert from "node:assert/strict";
import { test } from "node:test";
import { BREW_OFFLINE_ENV, bundleCheck, bundleMissing } from "../src/core/runners/brew.ts";
import { createFakeRunner } from "../src/core/runners/shell.ts";

const isBundle = (cmd: string, args: string[]) => cmd === "brew" && args[0] === "bundle";

test("bundleCheck consulta sin red: --no-upgrade y sin auto-update ni analytics", async () => {
  const r = createFakeRunner();
  assert.equal(await bundleCheck(r, "/m/Brewfile"), "ok");
  const i = r.calls.findIndex((c) => c.startsWith("brew bundle"));
  assert.equal(r.calls[i], "brew bundle check --no-upgrade --file /m/Brewfile");
  assert.deepEqual(r.envs[i], BREW_OFFLINE_ENV);
  assert.equal(r.envs[i]?.HOMEBREW_NO_AUTO_UPDATE, "1");
  assert.equal(r.envs[i]?.HOMEBREW_NO_ANALYTICS, "1");
});

test("bundleCheck devuelve pending si brew bundle check sale con error", async () => {
  const r = createFakeRunner((cmd, args) => (isBundle(cmd, args) ? { code: 1 } : undefined));
  assert.equal(await bundleCheck(r, "/m/Brewfile"), "pending");
});

test("bundleCheck devuelve unavailable sin brew", async () => {
  const r = createFakeRunner((cmd) => (cmd === "sh" ? { code: 1 } : undefined));
  assert.equal(await bundleCheck(r, "/m/Brewfile"), "unavailable");
  assert.ok(!r.calls.some((c) => c.startsWith("brew")));
});

test("bundleMissing consulta sin red y extrae las líneas pendientes", async () => {
  const r = createFakeRunner((cmd, args) =>
    isBundle(cmd, args)
      ? {
          code: 1,
          stdout:
            "→ Formula gitleaks needs to be installed.\nThe Brewfile's dependencies are not satisfied.\n→ Cask dia needs to be installed.\n",
        }
      : undefined,
  );
  assert.deepEqual(await bundleMissing(r, "/m/Brewfile"), [
    "Formula gitleaks needs to be installed.",
    "Cask dia needs to be installed.",
  ]);
  assert.equal(r.calls[0], "brew bundle check --no-upgrade --file /m/Brewfile --verbose");
  assert.deepEqual(r.envs[0], BREW_OFFLINE_ENV);
});
