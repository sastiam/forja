import { existsSync, statSync } from "node:fs";
import { expandHome } from "./paths.ts";
import type { Runner } from "./runners/shell.ts";

export interface SigningFinding {
  name: string;
  status: "ok" | "warn" | "fail" | "skip";
  detail?: string;
}

/** A partir de esta edad se recomienda rotar la clave de firma de agentes. */
export const MAX_KEY_AGE_DAYS = 90;

/**
 * Activa la firma ssh solo en un worktree de agente (`git config --worktree`).
 * La clave es la privada: sin agente ssh, git solo firma con la ruta privada.
 */
export async function enableAgentSigning(
  runner: Runner,
  repo: string,
  worktree: string,
  keyPath: string,
): Promise<void> {
  const key = expandHome(keyPath);
  if (!existsSync(key))
    throw new Error(`clave de firma de agentes no encontrada: ${key} (ver docs/guide/firma.md)`);
  const steps: [string[], string][] = [
    [["config", "extensions.worktreeConfig", "true"], repo],
    [["config", "--worktree", "gpg.format", "ssh"], worktree],
    [["config", "--worktree", "user.signingkey", key], worktree],
    [["config", "--worktree", "commit.gpgsign", "true"], worktree],
  ];
  for (const [args, cwd] of steps) {
    const r = await runner.exec("git", args, { cwd });
    if (r.code !== 0)
      throw new Error(`git ${args.join(" ")} falló: ${(r.stderr || r.stdout).trim()}`);
  }
}

/** Evalúa la clave de agentes: existencia, permisos 600 y antigüedad. */
export function checkAgentKey(keyPath: string, now = Date.now()): SigningFinding[] {
  const key = expandHome(keyPath);
  const name = "firma de agentes: clave";
  if (!existsSync(key))
    return [{ name, status: "fail", detail: `no existe ${key} (ver docs/guide/firma.md)` }];
  const st = statSync(key);
  const out: SigningFinding[] = [];
  const perms = st.mode & 0o777;
  out.push(
    perms & 0o077
      ? {
          name: "firma de agentes: permisos",
          status: "fail",
          detail: `${perms.toString(8)} (debe ser 600: chmod 600 ${key})`,
        }
      : { name: "firma de agentes: permisos", status: "ok", detail: "600" },
  );
  const days = Math.floor((now - st.mtimeMs) / 86_400_000);
  out.push(
    days > MAX_KEY_AGE_DAYS
      ? {
          name: "firma de agentes: antigüedad",
          status: "warn",
          detail: `${days} días (rotar: gh ssh-key delete y crear otra)`,
        }
      : { name: "firma de agentes: antigüedad", status: "ok", detail: `${days} días` },
  );
  return out;
}

export async function signingFindings(
  runner: Runner,
  keyPath: string,
  platform: string,
): Promise<SigningFinding[]> {
  const out = checkAgentKey(keyPath);
  if (platform === "darwin") {
    const fv = await runner.query("fdesetup", ["status"]);
    out.push(
      fv.code !== 0
        ? { name: "firma de agentes: FileVault", status: "skip", detail: "fdesetup no disponible" }
        : /is On/i.test(fv.stdout)
          ? { name: "firma de agentes: FileVault", status: "ok" }
          : {
              name: "firma de agentes: FileVault",
              status: "fail",
              detail: "desactivado: la clave sin passphrase queda expuesta si pierdes el equipo",
            },
    );
  }
  return out;
}
