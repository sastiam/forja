# editor

Zed con vtsls y Biome, ajustado para monorepos y agentes.

- **Consumo:** un solo servidor de TS (vtsls; fuera `typescript-language-server` y ESLint). `maxTsServerMemory` se calcula según la RAM: un octavo, entre 3 y 8 GB (36 GB → 4,5 GB). Hay un tsserver por ventana, así que con varios worktrees abiertos no conviene subir más. Biome solo arranca en proyectos con `biome.json`. Telemetría desactivada.
- **Monorepo:** `file_scan_exclusions` saca del índice y del watcher `node_modules`, el store de pnpm, los artefactos (`dist`, `.next`, `.nuxt`, `.turbo`, `coverage`, `cdk.out`, `target`) y `.claude/worktrees`. Los worktrees de forja viven fuera del repo (ADR 0005), así que Zed no los indexa dos veces.
- **Agentes:** Claude Code viene integrado en el panel de agentes de Zed. OpenCode se declara en `agent_servers` (ACP).
- **Tareas** (`tasks.json`) y **atajos** (`keymap.json`): `cmd-alt-t` tests, `cmd-alt-y` typecheck, `cmd-alt-w` `forja wt ls`, `cmd-alt-i` `forja wt integrate` de la rama actual.

vtsls en lugar de tsgo mientras siga abierto el bug de watchers con symlinks de pnpm (ver BACKLOG).
