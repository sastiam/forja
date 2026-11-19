# ADR 0010 — Sandbox de Claude Code por host

- **Estado:** aceptada
- **Fecha:** 2026-11-14

## Contexto

`~/.claude/settings.json` lo genera chezmoi a partir de `home/private_dot_claude/private_settings.json.tmpl`. En el Mac se
añadieron a mano `sandbox.network.allowedDomains` (github.com, api.github.com) y `sandbox.filesystem.allowRead`
(la identidad de git en `~/.config/forja/local/git.local.gitconfig`). Sin ellos, git y gh fallan dentro del sandbox. Esas
claves no estaban en el repo, así que un `forja apply` las habría borrado. Además, los dominios que necesita una
máquina de trabajo no son los de una Raspberry Pi, y los dominios de empresa no pueden acabar en un repo público.

## Decisión

1. **Dominios comunes en el host.** `hosts/<host>.toml` lleva `[claude] allowed_domains`.
2. **Extras personales en el perfil.** `profile.toml` (fuera del repo) admite `[claude] allowed_domains` y
   `allow_read`, que se suman a los del host.
3. **Lecturas derivadas de los módulos.** Con el módulo `git` activo se permite leer
   `~/.config/forja/local/git.local.gitconfig`. Ningún otro módulo añade lecturas por ahora.
4. **Un solo punto de cálculo.** `claudeSandbox()` une las listas sin duplicados y en orden estable. `forja apply` las
   escribe en `chezmoi.toml` (`data.claude_sandbox`) y la plantilla las convierte a JSON. Si falta el dato (porque el
   `chezmoi.toml` se escribió con una versión anterior), la plantilla usa listas vacías en vez de fallar.
5. **Lo específico de cada tarea sigue en el proyecto** (ADR 0009): los ajustes globales solo llevan lo que necesitan
   todas las sesiones.

## Consecuencias

- `forja apply` deja de borrar los permisos del sandbox, y `chezmoi diff` muestra cualquier cambio manual como desvío.
- Añadir un dominio para todas las máquinas de un tipo es una línea en el host; para una sola máquina, una línea en
  el perfil.
- Es el primer caso del flujo de `capture` (v0.2.0): pasar un cambio local al repo, separando lo común de lo personal.

## Plan B

Si la lista crece mucho, mover el sandbox a un archivo propio por host (`home/.../sandbox.<host>.json`) y fusionarlo
con `jq` al aplicar.
