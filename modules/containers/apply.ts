import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { log } from "../../cli/src/core/log.ts";
import { home } from "../../cli/src/core/paths.ts";
import type { Action, CheckResult, ModuleCtx } from "../../cli/src/core/plan.ts";
import type { Runner } from "../../cli/src/core/runners/shell.ts";

/** Runtime único: Colima (ADR 0007). OrbStack ya no se usa. */
export const RUNTIME_CONTEXT = "colima";
export const ORBSTACK_APP = "/Applications/OrbStack.app";

/**
 * Lo único que ve la VM (y por tanto cualquier contenedor) del Mac. Colima monta
 * $HOME entero por defecto: con el socket de Docker en el sandbox de Claude, un
 * `docker run -v ~/.ssh:/x` se saltaría sus denegaciones (ADR 0012).
 */
export const DEFAULT_MOUNTS = ["~/code"];
/** Minutos sin contenedores antes de que el LaunchAgent apague Colima (0 = nunca). */
export const DEFAULT_IDLE_MINUTES = 15;
export const IDLE_LABEL = "dev.forja.colima-idle";
export const IDLE_SCRIPT = "~/.config/forja/bin/colima-idle";
const idlePlistPath = () => join(home(), "Library", "LaunchAgents", `${IDLE_LABEL}.plist`);

export const expandHome = (p: string, h = home()) =>
  p === "~" ? h : p.startsWith("~/") ? join(h, p.slice(2)) : p;

export interface ColimaSize {
  cpu: number;
  memoryGb: number;
  diskGb: number;
}

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

/**
 * Tamaño por defecto de la VM: ligero. Floci, CDK y un par de servicios caben
 * en un tercio de los núcleos (2–4) y un octavo de la RAM (4–8 GB); la RAM se
 * reserva entera mientras la VM está encendida. El disco virtual crece con el
 * uso hasta el tope y no se puede reducir sin borrar la VM, así que el tope es
 * moderado (40 GB). `[containers]` del perfil fija cualquiera de los tres.
 */
export function colimaSize(
  ncpu: number,
  memBytes: number,
  override: Partial<{ cpu: number; memory_gb: number; disk_gb: number }> = {},
): ColimaSize {
  const memGb = memBytes / 1024 ** 3;
  return {
    cpu: override.cpu ?? clamp(Math.floor(ncpu / 3), 2, 4),
    memoryGb: override.memory_gb ?? clamp(Math.round(memGb / 8), 4, 8),
    diskGb: override.disk_gb ?? 40,
  };
}

/** VM ya creada (`colima list --json`, una línea JSON por perfil). */
export function parseColimaList(stdout: string): (ColimaSize & { status: string }) | null {
  for (const line of stdout.split("\n")) {
    try {
      const v = JSON.parse(line) as {
        name?: string;
        status?: string;
        cpus?: number;
        memory?: number;
        disk?: number;
      };
      if (v.name !== "default") continue;
      return {
        status: v.status ?? "",
        cpu: v.cpus ?? 0,
        memoryGb: Math.round((v.memory ?? 0) / 1024 ** 3),
        diskGb: Math.round((v.disk ?? 0) / 1024 ** 3),
      };
    } catch {}
  }
  return null;
}

/**
 * Qué hay que hacer para llegar a `want`: CPU y RAM cambian con stop + start;
 * el disco solo crece, así que uno mayor que el deseado exige borrar la VM.
 */
export function resizePlan(
  have: ColimaSize | null,
  want: ColimaSize,
): { restart: boolean; recreate: boolean } {
  if (!have) return { restart: false, recreate: false };
  return {
    restart: have.cpu !== want.cpu || have.memoryGb !== want.memoryGb || have.diskGb < want.diskGb,
    recreate: have.diskGb > want.diskGb,
  };
}

const fmt = (s: ColimaSize) => `${s.cpu} CPU, ${s.memoryGb} GB, ${s.diskGb} GB de disco`;

/** Sin Rosetta 2, `--vz-rosetta` no tiene con qué emular amd64: se arranca sin él. */
export function colimaArgs(s: ColimaSize, rosetta = true, mounts: string[] = []): string[] {
  return [
    "start",
    "--vm-type",
    "vz",
    "--mount-type",
    "virtiofs",
    ...(rosetta ? ["--vz-rosetta"] : []),
    "--cpu",
    String(s.cpu),
    "--memory",
    String(s.memoryGb),
    "--disk",
    String(s.diskGb),
    ...mounts.flatMap((m) => ["--mount", `${m}:w`]),
  ];
}

/**
 * Montajes de `colima.yaml` (rutas tal cual, con `~`). `[]` significa «$HOME
 * entero» (el valor por defecto de Colima); null si no hay VM o no se puede leer.
 */
export function parseColimaMounts(yaml: string): string[] | null {
  const lines = yaml.split("\n");
  const i = lines.findIndex((l) => /^mounts:/.test(l));
  if (i < 0) return null;
  if (/^mounts:\s*\[\s*\]/.test(lines[i] ?? "")) return [];
  const out: string[] = [];
  for (const l of lines.slice(i + 1)) {
    if (/^\S/.test(l)) break;
    const m = /^\s*-?\s*location:\s*["']?([^"'#]+?)["']?\s*(#.*)?$/.exec(l);
    if (m?.[1]) out.push(m[1]);
  }
  return out;
}

const colimaYaml = () =>
  join(process.env.COLIMA_HOME ?? join(home(), ".colima"), "default", "colima.yaml");

function currentMounts(): string[] | null {
  try {
    return parseColimaMounts(readFileSync(colimaYaml(), "utf8"));
  } catch {
    return null;
  }
}

/** ¿La VM monta exactamente `want`? null = no se sabe (sin VM o sin colima.yaml). */
export function mountsChanged(have: string[] | null, want: string[]): boolean {
  if (have === null) return false;
  const norm = (xs: string[]) => [...new Set(xs.map((x) => expandHome(x)))].sort().join("\n");
  return norm(have) !== norm(want);
}

const fmtMounts = (xs: string[]) => (xs.length ? xs.join(", ") : "$HOME completo");

function wantMounts(ctx: ModuleCtx): string[] {
  return ctx.profile?.containers?.mounts ?? DEFAULT_MOUNTS;
}

function idleMinutes(ctx: ModuleCtx): number {
  return ctx.profile?.containers?.idle_minutes ?? DEFAULT_IDLE_MINUTES;
}

/** LaunchAgent que cada 5 min pregunta a `colima-idle` si toca apagar la VM. */
export function idlePlist(minutes: number, h = home()): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>${IDLE_LABEL}</string>
  <key>ProgramArguments</key>
  <array><string>${expandHome(IDLE_SCRIPT, h)}</string><string>${minutes}</string></array>
  <key>EnvironmentVariables</key>
  <dict><key>PATH</key><string>/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin</string></dict>
  <key>StartInterval</key><integer>300</integer>
  <key>RunAtLoad</key><true/>
  <key>StandardErrorPath</key><string>${join(h, ".local", "state", "forja", "colima-idle.log")}</string>
</dict>
</plist>
`;
}

async function uid(runner: Runner): Promise<string> {
  return (await runner.query("id", ["-u"])).stdout.trim();
}

/** Pendiente si el plist no existe, quedó con otros minutos o launchd no lo tiene cargado. */
async function idleAgentPending(ctx: ModuleCtx, minutes: number): Promise<boolean> {
  const path = idlePlistPath();
  const loaded =
    (await ctx.runner.query("launchctl", ["print", `gui/${await uid(ctx.runner)}/${IDLE_LABEL}`]))
      .code === 0;
  if (minutes === 0) return loaded || existsSync(path);
  let current = "";
  try {
    current = readFileSync(path, "utf8");
  } catch {}
  return current !== idlePlist(minutes) || !loaded;
}

export const ROSETTA_INSTALL = ["softwareupdate", "--install-rosetta", "--agree-to-license"];

/**
 * Rosetta 2: "n/a" fuera de Apple Silicon. Una Mac nueva no la trae, y sin ella
 * las imágenes amd64 (muchas de Floci y de Lambda) no corren con `--vz-rosetta`.
 */
export async function rosetta(runner: Runner): Promise<"ok" | "missing" | "n/a"> {
  if ((await runner.query("uname", ["-m"])).stdout.trim() !== "arm64") return "n/a";
  const r = await runner.query("/usr/bin/arch", ["-x86_64", "/usr/bin/true"]);
  return r.code === 0 ? "ok" : "missing";
}

async function machineSize(ctx: ModuleCtx): Promise<ColimaSize | null> {
  const r = await ctx.runner.query("sysctl", ["-n", "hw.ncpu", "hw.memsize"]);
  const [ncpu, mem] = r.stdout.trim().split(/\s+/).map(Number);
  return r.code === 0 && ncpu && mem ? colimaSize(ncpu, mem, ctx.profile?.containers) : null;
}

async function currentVm(runner: Runner) {
  const r = await runner.query("colima", ["list", "--json"]);
  return r.code === 0 ? parseColimaList(r.stdout) : null;
}

async function colimaRunning(runner: Runner): Promise<boolean> {
  return (await runner.query("colima", ["status"])).code === 0;
}

export async function plan(ctx: ModuleCtx): Promise<Action[]> {
  const size = await machineSize(ctx);
  const actions: Action[] = [];
  if ((await rosetta(ctx.runner)) === "missing")
    actions.push({
      kind: "step",
      description: `instalar Rosetta 2 para imágenes amd64 (sudo ${ROSETTA_INSTALL.join(" ")})`,
      pending: true,
    });
  if (size) {
    const vm = await currentVm(ctx.runner);
    const r = resizePlan(vm, size);
    const mounts = wantMounts(ctx);
    const have = vm ? currentMounts() : null;
    const remount = mountsChanged(have, mounts);
    if (vm && r.recreate)
      actions.push({
        kind: "guide",
        description: `Colima tiene ${vm.diskGb} GB de disco y el tope es ${size.diskGb} GB: el disco no se reduce. Para recrearla (borra imágenes y volúmenes): colima delete --force && forja apply containers`,
        pending: true,
      });
    // Bajo demanda: apagada no es un desvío; solo crearla o reconfigurarla.
    actions.push({
      kind: "step",
      description: !vm
        ? `crear Colima (vz, virtiofs, ${fmt(size)}, monta ${fmtMounts(mounts)}) y usar su contexto docker`
        : r.restart
          ? `reiniciar Colima con ${fmt(size)} (ahora ${fmt(vm)})`
          : remount
            ? `reiniciar Colima para montar solo ${fmtMounts(mounts)} (ahora: ${fmtMounts(have ?? [])})`
            : `Colima creada (${fmt(size)}, monta ${fmtMounts(mounts)}); arranca bajo demanda`,
      pending: !vm || r.restart || remount,
    });
  }
  const idle = idleMinutes(ctx);
  actions.push({
    kind: "step",
    description:
      idle > 0
        ? `apagar Colima tras ${idle} min sin contenedores (LaunchAgent ${IDLE_LABEL})`
        : `sin apagado automático de Colima (quitar LaunchAgent ${IDLE_LABEL})`,
    pending: await idleAgentPending(ctx, idle),
  });
  if (existsSync(ORBSTACK_APP))
    actions.push({
      kind: "guide",
      description: "OrbStack sigue instalado: brew uninstall --cask orbstack (ADR 0007)",
      pending: true,
    });
  return actions;
}

export async function apply(ctx: ModuleCtx): Promise<void> {
  const { runner } = ctx;
  const size = await machineSize(ctx);
  const vm = size ? await currentVm(runner) : null;
  // Rosetta antes de arrancar: una VM que arrancó sin ella no emula amd64 hasta reiniciarse.
  let ros = await rosetta(runner);
  let rosettaNew = false;
  if (ros === "missing") {
    const r = await runner.exec("sudo", ROSETTA_INSTALL, { stream: true });
    if (r.code === 0) [ros, rosettaNew] = ["ok", true];
    else
      log.warn(
        `Rosetta 2 no se instaló: Colima arranca sin --vz-rosetta (${ROSETTA_INSTALL.join(" ")})`,
      );
  }
  const mounts = wantMounts(ctx).map((m) => expandHome(m));
  // Montar una ruta que no existe hace fallar colima start.
  for (const m of mounts) if (!existsSync(m)) await runner.mkdirp(m);
  // Nunca borra la VM solo: con un disco mayor que el tope, plan lo indica como guía.
  const resize = size && vm ? resizePlan(vm, size).restart : false;
  const remount = vm ? mountsChanged(currentMounts(), mounts) : false;
  const running = await colimaRunning(runner);
  if (size && (resize || rosettaNew || remount) && running) {
    log.step(
      resize
        ? `colima stop (redimensionar a ${fmt(size)})`
        : remount
          ? `colima stop (montar solo ${fmtMounts(mounts)})`
          : "colima stop (activar Rosetta)",
    );
    const s = await runner.exec("colima", ["stop"], { stream: true });
    if (s.code !== 0) throw new Error("colima stop falló");
  }
  // Bajo demanda: solo se arranca para crearla o aplicar una config nueva; el
  // LaunchAgent la apaga después si nadie la usa.
  if (size && (!vm || resize || rosettaNew || remount)) {
    // colima start falla si se le pide menos disco del que ya tiene la VM.
    const start = vm && vm.diskGb > size.diskGb ? { ...size, diskGb: vm.diskGb } : size;
    if (start !== size)
      log.warn(
        `el disco de Colima (${vm?.diskGb} GB) no se reduce a ${size.diskGb} GB: colima delete --force && forja apply containers (borra imágenes y volúmenes)`,
      );
    const r = await runner.exec("colima", colimaArgs(start, ros !== "missing", mounts), {
      stream: true,
    });
    if (r.code !== 0) throw new Error("colima start falló (revisa `colima start --verbose`)");
  }
  await runner.exec("docker", ["context", "use", RUNTIME_CONTEXT]);
  const idle = idleMinutes(ctx);
  if (await idleAgentPending(ctx, idle)) {
    const target = `gui/${await uid(runner)}`;
    await runner.exec("launchctl", ["bootout", `${target}/${IDLE_LABEL}`]);
    if (idle > 0) {
      await runner.mkdirp(join(home(), ".local", "state", "forja"));
      await runner.writeFile(idlePlistPath(), idlePlist(idle));
      const b = await runner.exec("launchctl", ["bootstrap", target, idlePlistPath()]);
      if (b.code !== 0) log.warn(`no se cargó ${IDLE_LABEL}: ${b.stderr.trim()}`);
    } else await runner.remove(idlePlistPath());
  }
  if (existsSync(ORBSTACK_APP))
    log.warn("OrbStack sigue instalado; quítalo con: brew uninstall --cask orbstack");
}

export async function revert(ctx: ModuleCtx): Promise<void> {
  const { runner } = ctx;
  await runner.exec("launchctl", ["bootout", `gui/${await uid(runner)}/${IDLE_LABEL}`]);
  if (existsSync(idlePlistPath())) await runner.remove(idlePlistPath());
  log.info(
    "Apagado automático quitado. Colima conserva sus montajes; para volver a montar $HOME: colima stop && colima start --mount ~:w",
  );
}

export async function check(ctx: ModuleCtx): Promise<CheckResult[]> {
  const r = await ctx.runner.query("docker", ["context", "show"]);
  const ctxName = r.stdout.trim();
  const results: CheckResult[] = [
    {
      name: "contexto docker = colima",
      ok: ctxName === RUNTIME_CONTEXT,
      detail:
        ctxName === "orbstack"
          ? "OrbStack ya no es el runtime: docker context use colima"
          : ctxName && ctxName !== RUNTIME_CONTEXT
            ? `${ctxName}: docker context use colima`
            : ctxName
              ? undefined
              : "docker no disponible (¿colima start?)",
    },
  ];
  const have = currentMounts();
  if (have !== null) {
    const want = wantMounts(ctx);
    results.push({
      name: `Colima monta solo ${fmtMounts(want)}`,
      ok: !mountsChanged(have, want),
      detail: mountsChanged(have, want)
        ? `ahora: ${fmtMounts(have)} → forja apply containers`
        : undefined,
    });
  }
  const idle = idleMinutes(ctx);
  if (idle > 0) {
    const ok = !(await idleAgentPending(ctx, idle));
    results.push({
      name: `apagado automático de Colima (${idle} min)`,
      ok,
      detail: ok ? undefined : "forja apply containers",
    });
  }
  if ((await rosetta(ctx.runner)) === "missing")
    results.push({
      name: "Rosetta 2 instalada",
      ok: false,
      warn: true,
      detail: `imágenes amd64 sin emular: forja apply containers (o sudo ${ROSETTA_INSTALL.join(" ")})`,
    });
  if (existsSync(ORBSTACK_APP))
    results.push({
      name: "OrbStack desinstalado",
      ok: false,
      warn: true,
      detail: "brew uninstall --cask orbstack",
    });
  return results;
}
