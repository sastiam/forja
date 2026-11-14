import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { out, outJson } from "../core/log.ts";
import { expandHome, profilePath } from "../core/paths.ts";
import { loadProfile } from "../core/profile.ts";
import { createRunner, type Runner } from "../core/runners/shell.ts";

export interface SandboxFinding {
  name: string;
  status: "ok" | "fail" | "skip";
  detail?: string;
  /** Qué cambiar (en el lanzador o en los ajustes) para que pase. */
  fix?: string;
}

export interface CheckOpts {
  cwd: string;
  hosts: string[];
  keyPath?: string;
}

/** Comprueba que se puede escribir en `dir` creando y borrando un archivo. */
export function checkWritable(
  name: string,
  dir: string,
  fix: string,
  write: (dir: string) => void = probeWrite,
): SandboxFinding {
  try {
    write(dir);
    return { name, status: "ok" };
  } catch (e) {
    return { name, status: "fail", detail: `${dir}: ${(e as Error).message.split("\n")[0]}`, fix };
  }
}

function probeWrite(dir: string): void {
  const probe = mkdtempSync(join(dir, ".forja-probe-"));
  writeFileSync(join(probe, "x"), "");
  rmSync(probe, { recursive: true, force: true });
}

const firstLine = (s: string): string => s.trim().split("\n")[0] ?? "";

/**
 * Comprobación previa de un loop: debe ejecutarse DENTRO del entorno (sandbox)
 * donde correrá el agente. Falla pronto y dice qué ajustar, en lugar de dejar
 * que el loop se pare a mitad de tarea por un permiso.
 */
export async function runChecks(runner: Runner, o: CheckOpts): Promise<SandboxFinding[]> {
  const f: SandboxFinding[] = [];

  const inside = await runner.query("git", ["rev-parse", "--is-inside-work-tree"], { cwd: o.cwd });
  f.push(
    inside.code === 0
      ? { name: "git: lee su configuración", status: "ok" }
      : {
          name: "git: lee su configuración",
          status: "fail",
          detail: firstLine(inside.stderr || inside.stdout),
          fix: "permite leer los archivos que git incluye (sandbox.filesystem.allowRead)",
        },
  );

  const gitDir = await runner.query("git", ["rev-parse", "--absolute-git-dir"], { cwd: o.cwd });
  if (gitDir.code === 0 && gitDir.stdout.trim())
    f.push(
      checkWritable(
        "git: se puede commitear (escritura en el git-dir)",
        gitDir.stdout.trim(),
        "crea el worktree y haz los commits desde un lanzador fuera del sandbox, o usa un repo cuyo git-dir sea escribible",
      ),
    );
  else f.push({ name: "git: se puede commitear (escritura en el git-dir)", status: "skip" });

  f.push(
    checkWritable(
      "escritura en el directorio de trabajo",
      o.cwd,
      "lanza el loop con el directorio de trabajo dentro del worktree",
    ),
  );
  f.push(checkWritable("escritura en el directorio temporal", tmpdir(), "usa $TMPDIR del sandbox"));

  if (o.keyPath) {
    const key = expandHome(o.keyPath);
    const r = await runner.query("ssh-keygen", ["-Y", "sign", "-n", "git", "-f", key], {
      input: "forja\n",
    });
    f.push(
      r.code === 0
        ? { name: "firma de agentes: la clave firma", status: "ok" }
        : {
            name: "firma de agentes: la clave firma",
            status: "fail",
            detail: firstLine(r.stderr || r.stdout),
            fix: "revisa [signing] agent_key y que la clave sea legible desde el sandbox (docs/guide/firma.md)",
          },
    );
  } else
    f.push({
      name: "firma de agentes: la clave firma",
      status: "skip",
      detail: "sin [signing] agent_key en el perfil",
    });

  for (const host of o.hosts) {
    const r = await runner.query(
      "curl",
      ["-sS", "-o", "/dev/null", "--max-time", "10", `https://${host}`],
      { cwd: o.cwd },
    );
    f.push(
      r.code === 0
        ? { name: `red: ${host}`, status: "ok" }
        : {
            name: `red: ${host}`,
            status: "fail",
            detail: firstLine(r.stderr || r.stdout),
            fix: `añade ${host} a sandbox.network.allowedDomains (o instala antes del loop)`,
          },
    );
  }
  return f;
}

export async function sandboxCheckCommand(argv: string[]): Promise<number> {
  const { values } = parseArgs({
    args: argv,
    allowPositionals: false,
    options: { host: { type: "string", multiple: true }, json: { type: "boolean" } },
  });
  const profile = await loadProfile(profilePath()).catch(() => null);
  const hosts = values.host?.length ? values.host : ["github.com"];
  const findings = await runChecks(createRunner(true), {
    cwd: process.cwd(),
    hosts,
    keyPath: profile?.signing.agent_key,
  });
  const failed = findings.some((x) => x.status === "fail");
  if (values.json) outJson({ ok: !failed, findings });
  else {
    const icon = { ok: "✔", fail: "✖", skip: "–" } as const;
    for (const x of findings) {
      out(`${icon[x.status]} ${x.name}${x.detail ? ` — ${x.detail}` : ""}`);
      if (x.status === "fail" && x.fix) out(`    → ${x.fix}`);
    }
    if (failed) out("\nNo lances el loop hasta resolver los ✖: se pararía a mitad de tarea.");
  }
  return failed ? 1 : 0;
}
