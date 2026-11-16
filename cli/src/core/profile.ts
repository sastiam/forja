import { readFile } from "node:fs/promises";
import { parse, type TomlTable } from "./toml.ts";

export interface WorkProfile {
  enabled: boolean;
  code_dir?: string;
  claude_rules?: string;
  aws_config?: string;
}

/**
 * Identidad de git alternativa a la global (que es la laboral por defecto).
 * `signing_key` firma los commits humanos; `agent_key` (o `[signing] agent_key`) los de agentes.
 */
export interface GitIdentity {
  name: string;
  email: string;
  signing_key: string;
  agent_key?: string;
}

export interface Profile {
  schema: 1;
  host: string;
  modules_extra: string[];
  modules_skip: string[];
  identity: { name: string; email: string };
  profiles: { work?: WorkProfile; personal?: { code_dir?: string } };
  notify: { ntfy_topic_file?: string };
  signing: { agent_key?: string };
  /**
   * Excepciones a la identidad global: `identities` nombra identidades y `repos` asigna
   * cada repo (por nombre de carpeta o ruta) a una. Sin entrada, manda la config global.
   */
  git: { identities: Record<string, GitIdentity>; repos: Record<string, string> };
  /**
   * Claude Code: extras personales del sandbox (se suman a los del host) y el
   * modelo por defecto que `/model` guarda en settings.json, y el tema que guarda `/config`.
   */
  claude: {
    allowed_domains: string[];
    allow_read: string[];
    /** Sandbox de las sesiones interactivas; manda sobre el del host. `wt night` lo ignora (ADR 0015). */
    sandbox?: boolean;
    model?: string;
    theme?: string;
    /** Plugins de Claude Code que forja no activa (`token-saver`, `aws-core`…; ver cli/src/core/claude-plugins.ts). */
    plugins_skip?: string[];
  };
  /**
   * Tamaño de la VM de Colima (lo que falte sale de colimaSize() según la máquina),
   * qué carpetas monta (por defecto solo ~/code) y tras cuántos minutos sin
   * contenedores se apaga sola (por defecto 15; 0 = nunca).
   */
  containers: {
    cpu?: number;
    memory_gb?: number;
    disk_gb?: number;
    mounts?: string[];
    idle_minutes?: number;
  };
  secrets: { provider: "1password" | "none" };
}

export class ProfileError extends Error {}

function table(v: unknown, path: string): TomlTable {
  if (v === undefined) return {};
  if (typeof v !== "object" || v === null || Array.isArray(v))
    throw new ProfileError(`${path} debe ser una tabla`);
  return v as TomlTable;
}

function str(v: unknown, path: string, required = false): string | undefined {
  if (v === undefined) {
    if (required) throw new ProfileError(`falta ${path}`);
    return undefined;
  }
  if (typeof v !== "string") throw new ProfileError(`${path} debe ser string`);
  return v;
}

function posInt(v: unknown, path: string): number | undefined {
  if (v === undefined) return undefined;
  if (typeof v !== "number" || !Number.isInteger(v) || v < 1)
    throw new ProfileError(`${path} debe ser un entero positivo`);
  return v;
}

function strList(v: unknown, path: string): string[] {
  if (v === undefined) return [];
  if (!Array.isArray(v) || v.some((x) => typeof x !== "string"))
    throw new ProfileError(`${path} debe ser lista de strings`);
  return v as string[];
}

function parseGit(git: TomlTable): Profile["git"] {
  const identities: Record<string, GitIdentity> = {};
  const ids = table(git.identities, "git.identities");
  for (const [name, v] of Object.entries(ids)) {
    const t = table(v, `git.identities.${name}`);
    const id: GitIdentity = {
      name: str(t.name, `git.identities.${name}.name`, true) as string,
      email: str(t.email, `git.identities.${name}.email`, true) as string,
      signing_key: str(t.signing_key, `git.identities.${name}.signing_key`, true) as string,
    };
    const agentKey = str(t.agent_key, `git.identities.${name}.agent_key`);
    if (agentKey) id.agent_key = agentKey;
    identities[name] = id;
  }
  const repos: Record<string, string> = {};
  for (const [repo, v] of Object.entries(table(git.repos, "git.repos"))) {
    const name = str(v, `git.repos.${repo}`) as string;
    if (!identities[name])
      throw new ProfileError(
        `git.repos.${repo}: la identidad "${name}" no existe en git.identities`,
      );
    repos[repo] = name;
  }
  return { identities, repos };
}

/** Valida un objeto TOML ya parseado y devuelve un Profile tipado. */
export function validateProfile(raw: TomlTable): Profile {
  if (raw.schema !== 1) throw new ProfileError("schema debe ser 1");
  const identity = table(raw.identity, "identity");
  const profiles = table(raw.profiles, "profiles");
  const work = table(profiles.work, "profiles.work");
  const personal = table(profiles.personal, "profiles.personal");
  const secrets = table(raw.secrets, "secrets");
  const signing = table(raw.signing, "signing");
  const claude = table(raw.claude, "claude");
  const containers = table(raw.containers, "containers");
  const provider = str(secrets.provider, "secrets.provider") ?? "none";
  if (provider !== "1password" && provider !== "none")
    throw new ProfileError('secrets.provider: "1password" o "none"');
  const profile: Profile = {
    schema: 1,
    host: str(raw.host, "host", true) as string,
    modules_extra: strList(raw.modules_extra, "modules_extra"),
    modules_skip: strList(raw.modules_skip, "modules_skip"),
    identity: {
      name: str(identity.name, "identity.name", true) as string,
      email: str(identity.email, "identity.email", true) as string,
    },
    profiles: {},
    notify: {
      ntfy_topic_file: str(table(raw.notify, "notify").ntfy_topic_file, "notify.ntfy_topic_file"),
    },
    signing: { agent_key: str(signing.agent_key, "signing.agent_key") },
    git: parseGit(table(raw.git, "git")),
    claude: {
      allowed_domains: strList(claude.allowed_domains, "claude.allowed_domains"),
      allow_read: strList(claude.allow_read, "claude.allow_read"),
    },
    containers: {},
    secrets: { provider },
  };
  for (const k of ["cpu", "memory_gb", "disk_gb"] as const) {
    const n = posInt(containers[k], `containers.${k}`);
    if (n !== undefined) profile.containers[k] = n;
  }
  if (containers.mounts !== undefined) {
    const mounts = strList(containers.mounts, "containers.mounts");
    if (!mounts.length) throw new ProfileError("containers.mounts no puede estar vacío");
    profile.containers.mounts = mounts;
  }
  if (containers.idle_minutes !== undefined) {
    const n = containers.idle_minutes;
    if (typeof n !== "number" || !Number.isInteger(n) || n < 0)
      throw new ProfileError("containers.idle_minutes debe ser un entero >= 0");
    profile.containers.idle_minutes = n;
  }
  if (claude.sandbox !== undefined) {
    if (typeof claude.sandbox !== "boolean")
      throw new ProfileError("claude.sandbox debe ser boolean");
    profile.claude.sandbox = claude.sandbox;
  }
  const model = str(claude.model, "claude.model");
  if (model) profile.claude.model = model;
  const theme = str(claude.theme, "claude.theme");
  if (theme) profile.claude.theme = theme;
  const pluginsSkip = strList(claude.plugins_skip, "claude.plugins_skip");
  if (pluginsSkip.length) profile.claude.plugins_skip = pluginsSkip;
  if (Object.keys(work).length) {
    if (work.enabled !== undefined && typeof work.enabled !== "boolean")
      throw new ProfileError("profiles.work.enabled debe ser boolean");
    profile.profiles.work = {
      enabled: work.enabled === true,
      code_dir: str(work.code_dir, "profiles.work.code_dir"),
      claude_rules: str(work.claude_rules, "profiles.work.claude_rules"),
      aws_config: str(work.aws_config, "profiles.work.aws_config"),
    };
  }
  if (Object.keys(personal).length)
    profile.profiles.personal = { code_dir: str(personal.code_dir, "profiles.personal.code_dir") };
  return profile;
}

export async function loadProfile(path: string): Promise<Profile | null> {
  let text: string;
  try {
    text = await readFile(path, "utf8");
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw e;
  }
  return validateProfile(parse(text));
}

export function profileToToml(p: Profile): TomlTable {
  const out: TomlTable = {
    schema: 1,
    host: p.host,
    modules_extra: p.modules_extra,
    modules_skip: p.modules_skip,
    identity: { name: p.identity.name, email: p.identity.email },
  };
  const profiles: TomlTable = {};
  if (p.profiles.work) {
    const w: TomlTable = { enabled: p.profiles.work.enabled };
    if (p.profiles.work.code_dir) w.code_dir = p.profiles.work.code_dir;
    if (p.profiles.work.claude_rules) w.claude_rules = p.profiles.work.claude_rules;
    if (p.profiles.work.aws_config) w.aws_config = p.profiles.work.aws_config;
    profiles.work = w;
  }
  if (p.profiles.personal?.code_dir) profiles.personal = { code_dir: p.profiles.personal.code_dir };
  if (Object.keys(profiles).length) out.profiles = profiles;
  if (p.notify.ntfy_topic_file) out.notify = { ntfy_topic_file: p.notify.ntfy_topic_file };
  if (p.signing.agent_key) out.signing = { agent_key: p.signing.agent_key };
  if (Object.keys(p.git.identities).length) {
    const identities: TomlTable = {};
    for (const [k, id] of Object.entries(p.git.identities)) identities[k] = { ...id };
    const git: TomlTable = { identities };
    if (Object.keys(p.git.repos).length) git.repos = { ...p.git.repos };
    out.git = git;
  }
  const claude: TomlTable = {};
  if (p.claude.allowed_domains.length) claude.allowed_domains = p.claude.allowed_domains;
  if (p.claude.allow_read.length) claude.allow_read = p.claude.allow_read;
  if (p.claude.sandbox !== undefined) claude.sandbox = p.claude.sandbox;
  if (p.claude.model) claude.model = p.claude.model;
  if (p.claude.theme) claude.theme = p.claude.theme;
  if (p.claude.plugins_skip?.length) claude.plugins_skip = p.claude.plugins_skip;
  if (Object.keys(claude).length) out.claude = claude;
  if (Object.keys(p.containers).length) out.containers = { ...p.containers };
  out.secrets = { provider: p.secrets.provider };
  return out;
}
