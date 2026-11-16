import { existsSync } from "node:fs";
import { basename } from "node:path";
import { expandHome } from "./paths.ts";
import type { GitIdentity, Profile } from "./profile.ts";
import type { Runner } from "./runners/shell.ts";
import { enableAgentSigning } from "./signing.ts";
import type { Owner } from "./state.ts";

/**
 * Identidad de git que corresponde a un repo según el perfil, o `undefined` si no tiene
 * excepción (entonces manda la config global, la laboral). Se busca por ruta completa y,
 * si no, por nombre de carpeta.
 */
export function identityFor(
  profile: Pick<Profile, "git"> | null | undefined,
  repo: string,
): GitIdentity | undefined {
  if (!profile) return undefined;
  const { repos, identities } = profile.git;
  const byPath = Object.entries(repos).find(([k]) => k.includes("/") && expandHome(k) === repo);
  const name = byPath?.[1] ?? repos[basename(repo)];
  return name ? identities[name] : undefined;
}

/**
 * Fija la identidad en el `.git/config` del repo (`--local`). Los worktrees lo heredan,
 * los cree forja, Claude Code, openspec-cascade o `git worktree add`, y gana a la global.
 */
export async function applyRepoIdentity(
  runner: Runner,
  repo: string,
  id: GitIdentity,
): Promise<void> {
  const key = expandHome(id.signing_key);
  if (!existsSync(key)) throw new Error(`clave de firma no encontrada: ${key}`);
  const steps: string[][] = [
    ["user.name", id.name],
    ["user.email", id.email],
    ["gpg.format", "ssh"],
    ["user.signingkey", key],
    ["commit.gpgsign", "true"],
  ];
  for (const [k, v] of steps) {
    const r = await runner.exec("git", ["config", "--local", k as string, v as string], {
      cwd: repo,
    });
    if (r.code !== 0)
      throw new Error(`git config --local ${k} falló: ${(r.stderr || r.stdout).trim()}`);
  }
}

export interface EnsureResult {
  identity?: GitIdentity;
  agentSigned: boolean;
  warnings: string[];
}

/**
 * Deja un worktree con la identidad y la firma que le tocan, de forma idempotente:
 * identidad del repo (si tiene excepción) y, si lo lleva un agente, su clave de firma
 * (más nombre y email de la identidad para que GitHub verifique el commit).
 */
export async function ensureWorktreeIdentity(
  runner: Runner,
  repo: string,
  worktree: string,
  owner: Owner,
  profile: Pick<Profile, "git" | "signing"> | null | undefined,
): Promise<EnsureResult> {
  const identity = identityFor(profile, repo);
  const warnings: string[] = [];
  if (identity) await applyRepoIdentity(runner, repo, identity);
  let agentSigned = false;
  if (owner !== "human") {
    const key = identity?.agent_key ?? profile?.signing.agent_key;
    if (key) {
      await enableAgentSigning(runner, repo, worktree, key, identity);
      agentSigned = true;
    } else
      warnings.push(
        "sin clave de agente ([signing] agent_key o agent_key de la identidad): los commits de este agente irán SIN la firma de agente (ver docs/guide/firma.md)",
      );
  }
  return { identity, agentSigned, warnings };
}

/** Propietario de un worktree: el registrado en el estado o, si no, deducido de la rama. */
export function ownerOf(
  path: string,
  branch: string | undefined,
  records: { path: string; owner: Owner }[],
): Owner {
  const rec = records.find((r) => r.path === path);
  if (rec) return rec.owner;
  return branch?.startsWith("agent/") ? "claude" : "human";
}
