import { mkdir, readdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { parseArgs } from "node:util";
import { log } from "../core/log.ts";
import { profilePath, repoRoot } from "../core/paths.ts";
import { loadProfile, profileToToml, validateProfile } from "../core/profile.ts";
import { ask, isInteractive } from "../core/prompt.ts";
import { stringify } from "../core/toml.ts";
import { applyCommand } from "./apply.ts";
import { doctorCommand } from "./doctor.ts";
import { planCommand } from "./plan.ts";

async function questionnaire(
  flags: Record<string, string | boolean | undefined>,
): Promise<ReturnType<typeof validateProfile>> {
  const hosts = (await readdir(join(repoRoot(), "hosts"))).map((f) => f.replace(/\.toml$/, ""));
  const interactive = isInteractive();
  const get = async (flag: string, q: string, def?: string): Promise<string> => {
    const v = flags[flag];
    if (typeof v === "string" && v) return v;
    if (!interactive) throw new Error(`falta --${flag} (modo no interactivo)`);
    return ask(q, def);
  };
  const host = await get("host", `Host (${hosts.join("/")})`, "macbook");
  const name = await get("name", "Nombre para git");
  const email = await get("email", "Email para git");
  const workDir =
    (flags["work-dir"] as string | undefined) ??
    (interactive ? await ask("Carpeta de código de trabajo (vacío = sin perfil de trabajo)") : "");
  const personalDir =
    (flags["personal-dir"] as string | undefined) ??
    (interactive ? await ask("Carpeta de código personal", "~/code/personal") : "");
  return validateProfile({
    schema: 1,
    host,
    modules_extra: [],
    modules_skip: ["macos-aggressive"],
    identity: { name, email },
    profiles: {
      ...(workDir ? { work: { enabled: true, code_dir: workDir } } : {}),
      ...(personalDir ? { personal: { code_dir: personalDir } } : {}),
    },
    secrets: { provider: "1password" },
  });
}

export async function setupCommand(argv: string[]): Promise<number> {
  const { values } = parseArgs({
    args: argv,
    options: {
      "no-claude": { type: "boolean" },
      yes: { type: "boolean" },
      host: { type: "string" },
      name: { type: "string" },
      email: { type: "string" },
      "work-dir": { type: "string" },
      "personal-dir": { type: "string" },
    },
  });
  if (!(await loadProfile(profilePath()))) {
    if (!values["no-claude"])
      log.warn(
        "El onboarding con Claude (skill forja-onboarding) llega en v0.2.0; uso el cuestionario de terminal.",
      );
    const profile = await questionnaire(values);
    await mkdir(dirname(profilePath()), { recursive: true });
    await writeFile(profilePath(), stringify(profileToToml(profile)), { mode: 0o600 });
    log.ok(`Perfil guardado en ${profilePath()} (solo en esta máquina)`);
  } else log.info(`Perfil existente: ${profilePath()}`);
  await planCommand([]);
  const code = await applyCommand(values.yes ? ["--yes"] : []);
  if (code !== 0) return code;
  return doctorCommand([]);
}
