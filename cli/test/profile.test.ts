import assert from "node:assert/strict";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { loadProfile, ProfileError, profileToToml, validateProfile } from "../src/core/profile.ts";
import { parse, stringify } from "../src/core/toml.ts";

const fixture = join(fileURLToPath(import.meta.url), "..", "fixtures", "profile.fixture.toml");

test("carga y valida el perfil de fixture", async () => {
  const p = await loadProfile(fixture);
  assert.equal(p?.host, "macbook");
  assert.equal(p?.profiles.work?.enabled, true);
  assert.deepEqual(p?.modules_skip, ["macos-aggressive"]);
});

test("perfil inexistente devuelve null", async () => {
  assert.equal(await loadProfile("/nonexistent/profile.toml"), null);
});

test("rechaza perfiles inválidos", () => {
  assert.throws(() => validateProfile({ schema: 2 }), ProfileError);
  assert.throws(
    () => validateProfile({ schema: 1, host: "x", identity: { name: "n" } }),
    /identity.email/,
  );
  assert.throws(
    () =>
      validateProfile({
        schema: 1,
        host: "x",
        identity: { name: "n", email: "e" },
        secrets: { provider: "otro" },
      }),
    /provider/,
  );
});

test("round-trip del perfil", async () => {
  const p = await loadProfile(fixture);
  assert.ok(p);
  assert.deepEqual(validateProfile(parse(stringify(profileToToml(p)))), p);
});
