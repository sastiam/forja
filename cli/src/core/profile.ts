import { readFile } from "node:fs/promises";
import { parse, type TomlTable } from "./toml.ts";

export interface WorkProfile {
  enabled: boolean;
  code_dir?: string;
  claude_rules?: string;
  aws_config?: string;
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
   * Claude Code: extras personales del sandbox (se suman a los del host) y el
   * modelo por defecto que `/model` guarda en settings.json.
   */
  claude: { allowed_domains: string[]; allow_read: string[]; model?: string };
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

function strList(v: unknown, path: string): string[] {
  if (v === undefined) return [];
  if (!Array.isArray(v) || v.some((x) => typeof x !== "string"))
    throw new ProfileError(`${path} debe ser lista de strings`);
  return v as string[];
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
    claude: {
      allowed_domains: strList(claude.allowed_domains, "claude.allowed_domains"),
      allow_read: strList(claude.allow_read, "claude.allow_read"),
    },
    secrets: { provider },
  };
  const model = str(claude.model, "claude.model");
  if (model) profile.claude.model = model;
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
  const claude: TomlTable = {};
  if (p.claude.allowed_domains.length) claude.allowed_domains = p.claude.allowed_domains;
  if (p.claude.allow_read.length) claude.allow_read = p.claude.allow_read;
  if (p.claude.model) claude.model = p.claude.model;
  if (Object.keys(claude).length) out.claude = claude;
  out.secrets = { provider: p.secrets.provider };
  return out;
}
