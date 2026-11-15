import { GIT_LOCAL_CONFIG } from "./claude-sandbox.ts";

/** Config global de git que gestiona chezmoi (módulo git). */
export const GIT_GLOBAL_CONFIG = "~/.config/git/config";

/**
 * Claves que identifican a la persona o a la máquina (identidad, firma,
 * credenciales). Van en git.local.gitconfig, fuera del repo; si aparecen en la
 * config global, `forja apply` las borraría y `forja capture` las publicaría.
 */
const PERSONAL: RegExp[] = [
  /^user\./,
  /^gpg\./,
  /^commit\.gpgsign$/,
  /^tag\.gpgsign$/,
  /^credential\./,
  /^url\..*\.insteadof$/,
];

export interface GitEntry {
  key: string;
  value: string;
}

/** Salida de `git config --file <f> --list` → claves personales, en orden. */
export function personalGitKeys(list: string): GitEntry[] {
  const out: GitEntry[] = [];
  for (const line of list.split("\n")) {
    const i = line.indexOf("=");
    const key = (i < 0 ? line : line.slice(0, i)).trim().toLowerCase();
    if (key && PERSONAL.some((re) => re.test(key)))
      out.push({ key, value: i < 0 ? "true" : line.slice(i + 1) });
  }
  return out;
}

const shq = (s: string) => (/^[\w@%+=:,./~-]+$/.test(s) ? s : `'${s.replace(/'/g, `'\\''`)}'`);

/** Comandos para mover las claves al gitconfig local y quitarlas de la global. */
export function moveCommands(entries: GitEntry[]): string[] {
  return [
    ...entries.map((e) => `git config --file ${GIT_LOCAL_CONFIG} ${e.key} ${shq(e.value)}`),
    ...entries.map((e) => `git config --file ${GIT_GLOBAL_CONFIG} --unset-all ${e.key}`),
  ];
}
