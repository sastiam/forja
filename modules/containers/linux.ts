import { log } from "../../cli/src/core/log.ts";
import type { Action, CheckResult, ModuleCtx } from "../../cli/src/core/plan.ts";
import { elevate } from "../../cli/src/core/runners/dnf.ts";
import { commandExists, type Runner } from "../../cli/src/core/runners/shell.ts";

/**
 * containers en Linux: Docker nativo (sin VM). forja NO instala el motor: puede
 * venir de los repos de Fedora (moby-engine) o del repo de Docker (docker-ce) y
 * elegir uno es una decisión de confianza que se deja al usuario. Tampoco añade
 * a nadie al grupo `docker`: ese grupo equivale a root en el equipo.
 */
export const DOCKER_UNIT = "docker";
export const INSTALL_HINT =
  "instala Docker: `sudo dnf install moby-engine docker-compose` (repos de Fedora) o docker-ce (repo oficial de Docker)";
export const GROUP_HINT =
  "tu usuario no puede usar el socket: `sudo usermod -aG docker $USER` y reinicia la sesión. Ojo: el grupo docker equivale a root (un contenedor puede montar /)";

export interface DockerState {
  cli: boolean;
  /** `systemctl is-active docker` = active. */
  active: boolean;
  enabled: boolean;
  /** `docker info` responde con este usuario. */
  reachable: boolean;
  /** El daemon corre pero el usuario no tiene permiso sobre el socket. */
  denied: boolean;
}

const FIRST_LINE_TIMEOUT_MS = 15000;

export async function dockerState(runner: Runner): Promise<DockerState> {
  const cli = await commandExists(runner, "docker");
  if (!cli) return { cli, active: false, enabled: false, reachable: false, denied: false };
  const active = (await runner.query("systemctl", ["is-active", DOCKER_UNIT])).stdout.trim();
  const enabled = (await runner.query("systemctl", ["is-enabled", DOCKER_UNIT])).stdout.trim();
  const info = await runner.query("docker", ["info", "--format", "{{.ServerVersion}}"], {
    timeoutMs: FIRST_LINE_TIMEOUT_MS,
  });
  return {
    cli,
    active: active === "active",
    enabled: enabled === "enabled",
    reachable: info.code === 0,
    denied: info.code !== 0 && /permission denied/i.test(info.stderr),
  };
}

export async function plan(ctx: ModuleCtx): Promise<Action[]> {
  const s = await dockerState(ctx.runner);
  if (!s.cli)
    return [
      { kind: "guide", description: `Docker no está instalado: ${INSTALL_HINT}`, pending: true },
    ];
  const actions: Action[] = [
    {
      kind: "step",
      description:
        s.active && s.enabled
          ? "docker.service activo y habilitado"
          : "habilitar y arrancar docker.service (sudo systemctl enable --now docker)",
      pending: !(s.active && s.enabled),
    },
  ];
  if (s.denied) actions.push({ kind: "guide", description: GROUP_HINT, pending: true });
  return actions;
}

export async function apply(ctx: ModuleCtx): Promise<void> {
  const s = await dockerState(ctx.runner);
  if (!s.cli) {
    log.warn(`Docker no está instalado; forja no lo instala solo. ${INSTALL_HINT}`);
    return;
  }
  if (!(s.active && s.enabled)) {
    const [cmd, args] = elevate("systemctl", ["enable", "--now", DOCKER_UNIT]);
    const r = await ctx.runner.exec(cmd, args, { stream: true });
    if (r.code !== 0) throw new Error(`systemctl enable --now ${DOCKER_UNIT} falló (${r.code})`);
  }
  if (s.denied) log.warn(GROUP_HINT);
}

export async function check(ctx: ModuleCtx): Promise<CheckResult[]> {
  const s = await dockerState(ctx.runner);
  if (!s.cli) return [{ name: "docker instalado", ok: false, detail: INSTALL_HINT }];
  return [
    {
      name: "docker.service activo y habilitado",
      ok: s.active && s.enabled,
      detail: s.active && s.enabled ? undefined : "forja apply containers",
    },
    {
      name: "docker accesible con tu usuario",
      ok: s.reachable,
      detail: s.reachable ? undefined : s.denied ? GROUP_HINT : "docker info falla",
    },
  ];
}
