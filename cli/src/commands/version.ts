import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { out } from "../core/log.ts";
import { profilePath, repoRoot } from "../core/paths.ts";
import { loadProfile } from "../core/profile.ts";
import { createRunner } from "../core/runners/shell.ts";

export async function versionCommand(): Promise<number> {
  const root = repoRoot();
  const pkg = JSON.parse(await readFile(join(root, "package.json"), "utf8")) as { version: string };
  const commit =
    (
      await createRunner(true).query("git", ["-C", root, "rev-parse", "--short", "HEAD"])
    ).stdout.trim() || "desconocido";
  const profile = await loadProfile(profilePath()).catch(() => null);
  out(
    `forja ${pkg.version} (${commit}) · node ${process.versions.node} · host ${profile?.host ?? "sin perfil"}`,
  );
  return 0;
}
