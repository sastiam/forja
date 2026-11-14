import { spawn } from "node:child_process";
import { copyFile, lstat, mkdir, readlink, rm, symlink, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

export interface ExecResult {
  code: number;
  stdout: string;
  stderr: string;
}

export interface ExecOptions {
  cwd?: string;
  env?: Record<string, string>;
  input?: string;
  /** Muestra la salida en vivo (stderr) además de capturarla. */
  stream?: boolean;
  timeoutMs?: number;
}

/**
 * Único punto de efectos. Los métodos `read*` nunca modifican el sistema y se
 * ejecutan siempre; los demás se omiten (y se registran) cuando `dryRun` es true.
 */
export interface Runner {
  readonly dryRun: boolean;
  /** Comando de solo lectura: se ejecuta aunque dryRun sea true. */
  query(cmd: string, args: string[], opts?: ExecOptions): Promise<ExecResult>;
  /** Comando con efectos: en dryRun no se ejecuta. */
  exec(cmd: string, args: string[], opts?: ExecOptions): Promise<ExecResult>;
  writeFile(path: string, content: string, mode?: number): Promise<void>;
  mkdirp(path: string): Promise<void>;
  link(target: string, path: string): Promise<void>;
  copy(from: string, to: string): Promise<void>;
  remove(path: string): Promise<void>;
  /** Acciones que se habrían ejecutado en dryRun. */
  readonly skipped: string[];
}

function run(cmd: string, args: string[], opts: ExecOptions = {}): Promise<ExecResult> {
  return new Promise((resolve) => {
    let child: ReturnType<typeof spawn>;
    try {
      child = spawn(cmd, args, {
        cwd: opts.cwd,
        env: { ...process.env, ...opts.env },
        stdio: ["pipe", "pipe", "pipe"],
      });
    } catch (e) {
      resolve({ code: 127, stdout: "", stderr: String(e) });
      return;
    }
    let stdout = "";
    let stderr = "";
    let timer: NodeJS.Timeout | undefined;
    if (opts.timeoutMs) timer = setTimeout(() => child.kill("SIGKILL"), opts.timeoutMs);
    child.stdout?.on("data", (d: Buffer) => {
      stdout += d;
      if (opts.stream) process.stderr.write(d);
    });
    child.stderr?.on("data", (d: Buffer) => {
      stderr += d;
      if (opts.stream) process.stderr.write(d);
    });
    child.on("error", (e: NodeJS.ErrnoException) => {
      if (timer) clearTimeout(timer);
      resolve({ code: e.code === "ENOENT" ? 127 : 1, stdout, stderr: stderr + String(e.message) });
    });
    child.on("close", (code) => {
      if (timer) clearTimeout(timer);
      resolve({ code: code ?? 1, stdout, stderr });
    });
    child.stdin?.on("error", () => {});
    child.stdin?.end(opts.input ?? "");
  });
}

export function createRunner(dryRun: boolean): Runner {
  const skipped: string[] = [];
  const fmt = (cmd: string, args: string[]) => [cmd, ...args].join(" ");
  const noop: ExecResult = { code: 0, stdout: "", stderr: "" };
  return {
    dryRun,
    skipped,
    query: (cmd, args, opts) => run(cmd, args, opts),
    async exec(cmd, args, opts) {
      if (dryRun) {
        skipped.push(fmt(cmd, args));
        return noop;
      }
      return run(cmd, args, opts);
    },
    async writeFile(path, content, mode) {
      if (dryRun) {
        skipped.push(`write ${path}`);
        return;
      }
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, content, { mode });
    },
    async mkdirp(path) {
      if (dryRun) {
        skipped.push(`mkdir -p ${path}`);
        return;
      }
      await mkdir(path, { recursive: true });
    },
    async link(target, path) {
      if (dryRun) {
        skipped.push(`ln -s ${target} ${path}`);
        return;
      }
      await mkdir(dirname(path), { recursive: true });
      try {
        const st = await lstat(path);
        if (st.isSymbolicLink() && (await readlink(path)) === target) return;
        if (!st.isSymbolicLink())
          throw new Error(`${path} existe y no es un symlink; no se sobrescribe`);
        await rm(path);
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
      }
      await symlink(target, path);
    },
    async copy(from, to) {
      if (dryRun) {
        skipped.push(`cp ${from} ${to}`);
        return;
      }
      await mkdir(dirname(to), { recursive: true });
      await copyFile(from, to);
    },
    async remove(path) {
      if (dryRun) {
        skipped.push(`rm -rf ${path}`);
        return;
      }
      await rm(path, { recursive: true, force: true });
    },
  };
}

/** Runner falso para tests: registra todo y responde con `responses`. */
export function createFakeRunner(
  responses: (cmd: string, args: string[]) => Partial<ExecResult> | undefined = () => undefined,
  dryRun = true,
): Runner & { calls: string[] } {
  const calls: string[] = [];
  const skipped: string[] = [];
  const answer = (cmd: string, args: string[]): ExecResult => {
    calls.push([cmd, ...args].join(" "));
    return { code: 0, stdout: "", stderr: "", ...responses(cmd, args) };
  };
  return {
    dryRun,
    calls,
    skipped,
    query: async (cmd, args) => answer(cmd, args),
    exec: async (cmd, args) => answer(cmd, args),
    writeFile: async (p) => void calls.push(`write ${p}`),
    mkdirp: async (p) => void calls.push(`mkdir ${p}`),
    link: async (t, p) => void calls.push(`link ${t} ${p}`),
    copy: async (f, t) => void calls.push(`cp ${f} ${t}`),
    remove: async (p) => void calls.push(`rm ${p}`),
  };
}

export async function commandExists(runner: Runner, cmd: string): Promise<boolean> {
  const r = await runner.query("sh", ["-c", `command -v ${cmd}`]);
  return r.code === 0;
}
