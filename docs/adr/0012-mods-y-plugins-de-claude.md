# ADR 0012 — Mods y plugins de Claude Code gestionados por forja

- **Estado:** aceptada
- **Fecha:** 2026-11-15

## Contexto

Claude Code admite **mods**: plugins cuyo código TypeScript corre dentro del propio Claude Code y puede reescribir o
bloquear llamadas a herramientas, añadir secciones al prompt, dibujar bandas y paneles y registrar `/comandos`. Se
distribuyen como cualquier plugin, desde un marketplace, que puede ser una carpeta local.

Queríamos cuatro cosas en el día a día: gastar menos tokens en búsquedas y salidas de comandos, ver el estado de la
Mac sin salir de Claude, que el agente siga TDD y evite números mágicos, y no tocar cuentas AWS reales por accidente.
Además, dos herramientas de terceros ayudan a ahorrar tokens (rtk y codebase-memory-mcp) y AWS publica sus skills y
su MCP como plugin (`aws-core`, con la revisión Well-Architected).

Las dos herramientas de terceros traen su propio instalador para Claude Code (`rtk init -g`,
`codebase-memory-mcp install`). Ambos escriben en `~/.claude` (hooks en `settings.json`, agentes, skills), que forja
gestiona con chezmoi: cada `forja apply` los borraría y `forja drift` los marcaría como desvío.

## Decisión

1. **Marketplace local en `plugins/`.** Cuatro mods propios (`token-saver`, `forja-status`, `tdd-guard`,
   `quality-guard`), cada uno con su lógica pura en `hooks/logic.ts` (probada con `node --test`) y su cableado en
   `hooks/register.ts(x)` (probado con `claude plugin test`, `npm run plugins:check`). Al ser un marketplace de
   carpeta, Claude Code lee los mods del clon: editar el repo y `/reload-plugins` basta.
2. **Declarativo en `settings.json`.** `extraKnownMarketplaces` y `enabledPlugins` salen de
   `cli/src/core/claude-plugins.ts` (fuente única) a `chezmoi.toml` y de ahí a la plantilla. El perfil admite
   `[claude] plugins_skip` para no activar alguno.
3. **Instalación por la CLI.** Claude Code solo materializa lo declarado al abrir una sesión interactiva, así que
   `forja apply agents` añade los marketplaces e instala lo que falte con `claude plugin …`. Como `plugin install`
   reescribe `settings.json` con otro formato, después se reaplica ese archivo con chezmoi (`--force`, el contenido es
   el mismo).
4. **Terceros sin sus instaladores.** rtk se instala con brew y el mod `token-saver` le pregunta (`rtk rewrite`) por
   cada comando de Bash; nunca `rtk init`. codebase-memory entra como plugin (solo registra el MCP, con `npx`); nunca
   `codebase-memory-mcp install`. El sandbox de Claude Code permite escribir el historial de rtk.
5. **aws-core** entra como plugin oficial (necesita `uv`). Su MCP puede usar credenciales reales: el `quality-guard`
   pide confirmación antes de cualquier mutación fuera de Floci, también en herramientas `mcp__*aws*`.

## Consecuencias

- `forja apply agents` deja Claude Code con los mods, aws-core y codebase-memory activos; `forja doctor` avisa de los
  que falten, de rtk y de uvx.
- Los mods corren **sin sandbox** y con los permisos del usuario: solo se cargan mods de este repo, revisados como
  cualquier otro código. Cada guard falla en abierto (si el mod falla, decide Claude Code como siempre).
- La interfaz de los mods (bandas, paneles) no se dibuja en `claude -p`, el Agent SDK ni sesiones en la nube; sus
  hooks sí corren.
- Los ahorros de rtk y codebase-memory los anuncian sus autores. Hay que medirlos (`rtk gain`, `/cost`) antes de
  darlos por buenos (BACKLOG).

## Plan B

Si la API de mods cambia de forma incompatible (está en acceso anticipado), desactivar los mods con
`[claude] plugins_skip` y volver a hooks de `settings.json` en `home/private_dot_claude/hooks/`, que ya usa forja.
