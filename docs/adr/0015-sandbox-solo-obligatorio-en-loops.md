# ADR 0015 — Sandbox obligatorio solo en loops

- **Estado:** aceptada
- **Fecha:** 2026-11-16

## Contexto

Medición sobre 50 transcripciones de Claude Code (4 proyectos, 16 de noviembre de 2026): unos 300 «Operation not permitted», casi todos fricción propia (`git.local.gitconfig`, `.git/config`, `~/.local/share/forja`, `Zed.app`, la clave de firma, temporales). No hay ni un registro `deny(…)` de una acción maliciosa o inesperada. En sesiones interactivas ya hay prompts de permisos y `deny` de secretos. En `wt night` nadie aprueba nada (`dontAsk`, Bash permitido), y ahí el sandbox es la única contención.

## Decisión

1. **`wt night` siempre con sandbox** (ADR 0013): `night-sandbox.ts` fija `enabled: true` y `failIfUnavailable`, sin leer ningún flag.
2. **Sesiones interactivas: configurable.** `[claude] sandbox = true|false` en `hosts/<host>.toml`; el perfil lo sobrescribe. Prioridad: perfil > host > `true`. En `macbook` queda en `false`.
3. `forja apply` lo escribe en `chezmoi.toml` (`claude_sandbox.enabled`) y la plantilla de `settings.json` lo respeta. `forja doctor` avisa si el `settings.json` real no coincide.

## Consecuencias

- Menos fallos de lectura de config, firma y `.git/worktrees` en sesiones interactivas, y menos listas de dominios que mantener allí.
- Volver a activarlo es una línea: `sandbox = true` en el perfil.
- La medición solo cubre sesiones interactivas; no incluye `wt night`.

## Plan B

Si aparece una violación real en una sesión interactiva, volver a `sandbox = true` en el host.
