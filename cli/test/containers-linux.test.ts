import assert from "node:assert/strict";
import { test } from "node:test";
import { apply, check, plan, revert } from "../../modules/containers/apply.ts";
import { GROUP_HINT, INSTALL_HINT } from "../../modules/containers/linux.ts";
import { sandboxPrereqFindings } from "../src/commands/doctor.ts";
import { claudeSandbox } from "../src/core/claude-sandbox.ts";
import { loadHost } from "../src/core/hosts.ts";
import { loadModules } from "../src/core/modules.ts";
import { repoRoot } from "../src/core/paths.ts";
import { type ModuleCtx, moduleTargets } from "../src/core/plan.ts";
import { createFakeRunner } from "../src/core/runners/shell.ts";

const ctx = (runner: ModuleCtx["runner"]): ModuleCtx =>
  ({ runner, platform: "linux", profile: undefined }) as unknown as ModuleCtx;

/** Un Docker simulado: cada flag cambia una respuesta. */
const docker = (o: {
  cli?: boolean;
  active?: boolean;
  enabled?: boolean;
  info?: "ok" | "denied" | "down";
}) =>
  createFakeRunner((cmd, args) => {
    if (cmd === "sh") return { code: o.cli === false ? 1 : 0 };
    if (cmd === "systemctl" && args[0] === "is-active")
      return { stdout: o.active ? "active\n" : "inactive\n" };
    if (cmd === "systemctl" && args[0] === "is-enabled")
      return { stdout: o.enabled ? "enabled\n" : "disabled\n" };
    if (cmd === "docker" && args[0] === "info")
      return o.info === "ok"
        ? { code: 0, stdout: "29.9.2\n" }
        : o.info === "denied"
          ? {
              code: 1,
              stderr: "permission denied while trying to connect to the Docker daemon socket",
            }
          : { code: 1, stderr: "Cannot connect to the Docker daemon" };
    return undefined;
  }, false);

test("containers en Linux: sin Docker, guía de instalación y no instala nada", async () => {
  const r = docker({ cli: false });
  const [a] = await plan(ctx(r));
  assert.equal(a?.kind, "guide");
  assert.ok(a?.pending);
  assert.ok(a.description.includes(INSTALL_HINT));
  await apply(ctx(r));
  assert.ok(!r.calls.some((c) => /dnf|install/.test(c)), "forja no instala el motor");
});

test("containers en Linux: con Docker parado, plan propone habilitar el servicio y apply lo hace", async () => {
  const r = docker({ active: false, enabled: false, info: "down" });
  const actions = await plan(ctx(r));
  assert.ok(actions[0]?.pending);
  assert.match(actions[0]?.description ?? "", /systemctl enable --now docker/);
  await apply(ctx(r));
  assert.match(r.calls.join("\n"), /(sudo )?systemctl enable --now docker/);
});

test("containers en Linux: todo en orden no propone nada", async () => {
  const r = docker({ active: true, enabled: true, info: "ok" });
  assert.ok((await plan(ctx(r))).every((a) => !a.pending));
  await apply(ctx(r));
  assert.ok(!r.calls.some((c) => c.includes("enable --now")));
  assert.ok((await check(ctx(r))).every((c) => c.ok));
});

test("containers en Linux: sin permiso sobre el socket avisa, pero nunca toca el grupo docker", async () => {
  const r = docker({ active: true, enabled: true, info: "denied" });
  const actions = await plan(ctx(r));
  assert.ok(actions.some((a) => a.kind === "guide" && a.description === GROUP_HINT));
  await apply(ctx(r));
  assert.ok(!r.calls.some((c) => /usermod|gpasswd|groupadd/.test(c)));
  const c = await check(ctx(r));
  assert.equal(c.find((x) => x.name.includes("accesible"))?.ok, false);
  assert.match(GROUP_HINT, /equivale a root/);
});

test("containers en Linux no usa colima, launchctl ni brew", async () => {
  const r = docker({ active: false, enabled: false, info: "down" });
  await plan(ctx(r));
  await apply(ctx(r));
  await check(ctx(r));
  await revert(ctx(r));
  assert.ok(!r.calls.some((c) => /colima|launchctl|brew|softwareupdate/.test(c)));
});

test("las rutas de Colima solo cuentan en macOS", async () => {
  const m = (await loadModules(repoRoot())).get("containers");
  assert.ok(m);
  assert.ok(moduleTargets(m, "darwin").some((t) => t.endsWith("colima-ensure")));
  assert.ok(!moduleTargets(m, "linux").some((t) => t.includes("colima")));
  assert.ok(moduleTargets(m, "linux").some((t) => t.endsWith(".aws/config")));
});

test("el sandbox de Claude en Linux no recibe el socket de Docker (equivale a root)", async () => {
  const host = await loadHost(repoRoot(), "fedora");
  const sb = claudeSandbox(
    host,
    { claude: { allowed_domains: [], allow_read: [], allow_write: [] } } as never,
    ["containers", "agents"],
  );
  assert.equal(sb.enabled, true, "en Fedora el sandbox va activo por defecto");
  const plantilla = await import("node:fs/promises").then((f) =>
    f.readFile(`${repoRoot()}/home/private_dot_claude/private_settings.json.tmpl`, "utf8"),
  );
  const linea = plantilla.split("\n").find((l) => l.includes("allowUnixSockets")) ?? "";
  assert.ok(
    plantilla.includes('(eq .chezmoi.os "darwin")'),
    "el socket y el hook de Colima son solo de macOS",
  );
  assert.ok(linea.includes("colima"), "el único socket declarado es el de Colima");
});

test("sandboxPrereqFindings: solo en Linux y con el sandbox pedido", async () => {
  assert.deepEqual(await sandboxPrereqFindings(createFakeRunner(), "darwin", true), []);
  assert.deepEqual(await sandboxPrereqFindings(createFakeRunner(), "linux", false), []);
  const ok = await sandboxPrereqFindings(
    createFakeRunner((cmd) => (cmd === "sh" ? { code: 0 } : undefined)),
    "linux",
    true,
  );
  assert.deepEqual(
    ok.map((f) => f.status),
    ["ok", "ok"],
  );
});

test("sandboxPrereqFindings distingue bwrap ausente, bwrap sin permisos y socat ausente", async () => {
  const sin = await sandboxPrereqFindings(
    createFakeRunner((cmd) =>
      cmd === "bwrap" ? { code: 127 } : cmd === "sh" ? { code: 1 } : undefined,
    ),
    "linux",
    true,
  );
  assert.equal(sin[0]?.status, "fail");
  assert.match(sin[0]?.detail ?? "", /falta bwrap/);
  assert.equal(sin[1]?.status, "fail");
  assert.match(sin[1]?.detail ?? "", /falta socat/);
  const denegado = await sandboxPrereqFindings(
    createFakeRunner((cmd) =>
      cmd === "bwrap"
        ? { code: 1, stderr: "setting up uid map: Permission denied\n" }
        : { code: 0 },
    ),
    "linux",
    true,
  );
  assert.match(denegado[0]?.detail ?? "", /user\.max_user_namespaces|SELinux/);
});
