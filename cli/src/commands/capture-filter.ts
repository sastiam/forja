import { relative } from "node:path";

const SENSITIVE: RegExp[] = [
  /^\.ssh(\/|$)/,
  /^\.aws\/credentials$/,
  /^\.config\/op(\/|$)/,
  /^\.config\/forja\/local(\/|$)/,
  /\.local\./,
];

/**
 * Filtro de `capture` (v0.2.0): nunca propone rutas sensibles.
 * Se incluye ya para que el contrato esté cubierto por tests desde v0.1.0.
 */
export function filterCapturable(
  paths: string[],
  home: string,
): { allowed: string[]; rejected: string[] } {
  const allowed: string[] = [];
  const rejected: string[] = [];
  for (const p of paths) {
    const rel = relative(home, p);
    (SENSITIVE.some((re) => re.test(rel)) ? rejected : allowed).push(p);
  }
  return { allowed, rejected };
}
