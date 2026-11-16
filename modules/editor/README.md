# editor

Zed con tsgo (TypeScript y TSX), vtsls (JavaScript) y Biome, ajustado para monorepos y agentes.

- **Consumo:** un solo servidor de TS por lenguaje (tsgo para TypeScript y TSX, vtsls para JavaScript; fuera `typescript-language-server` y ESLint). `maxTsServerMemory` solo afecta a vtsls y se calcula según la RAM: un octavo, entre 3 y 8 GB (36 GB → 4,5 GB). Biome solo arranca en proyectos con `biome.json`. Telemetría desactivada.
- **tsgo:** es la extensión `tsgo` de Zed ("TypeScript Language Server", TypeScript 7 nativo, en preview). Su servidor se llama `typescript-ls`, así que **no** debe excluirse con `!typescript-ls`. Zed la instala sola con `auto_install_extensions`, igual que los temas que fija la plantilla.
- **Monorepo:** `file_scan_exclusions` saca del índice y del watcher `node_modules`, el store de pnpm, los artefactos (`dist`, `.next`, `.nuxt`, `.turbo`, `coverage`, `cdk.out`, `target`) y `.claude/worktrees`. Los worktrees de forja viven fuera del repo (ADR 0005), así que Zed no los indexa dos veces.
- **Agentes:** Claude Code viene integrado en el panel de agentes de Zed. OpenCode se declara en `agent_servers` (ACP).
- **Tareas** (`tasks.json`) y **atajos** (`keymap.json`): `cmd-alt-t` tests, `cmd-alt-y` typecheck, `cmd-alt-w` `forja wt ls`, `cmd-alt-i` `forja wt integrate` de la rama actual.

Medido en un monorepo pnpm (`alegra-ai-global-agent-backend`): tsgo no consume CPU en reposo (0,0–0,1 %) y ocupa unos 814 MiB, sin que aparezca el bug de watchers con symlinks de pnpm. Si reaparece, vuelve a vtsls en la plantilla y reabre la entrada del BACKLOG.
