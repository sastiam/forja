# agents

Claude Code (sandbox), OpenCode, Hermes y skills enlazadas.

Claude Code con sandbox obligatorio, `deny` de secretos y los plugins de la tabla de abajo. OpenCode solo con API key (nunca la suscripción). Hermes se instala con su instalador oficial tras mostrarlo y pedir confirmación; no se activa el gateway. Las skills de `skills/` se enlazan por symlink.

## Plugins y mods de Claude Code (ADR 0012)

`settings.json` declara los marketplaces y plugins de `cli/src/core/claude-plugins.ts`, y `apply` instala los que falten con `claude plugin …` (después reaplica `settings.json` con chezmoi, porque `plugin install` lo reescribe).

| Plugin | Qué hace |
|---|---|
| `token-saver@forja` | Pasa cada comando de Bash por `rtk rewrite`; con el MCP de codebase-memory conectado, añade al prompt cómo buscar con menos tokens; banda con contexto usado y tokens ahorrados por rtk. |
| `forja-status@forja` | Banda con rama y puerto del worktree, drift, Colima, modo tapa y batería. `/forja [status\|doctor\|refresh]` abre un panel con `forja doctor` y un botón para pasárselo a `mac-doctor`. |
| `tdd-guard@forja` | Bloquea editar código de producción hasta que la sesión toque un test. `/tdd on\|off\|status`. Sin modelo: reglas fijas. |
| `quality-guard@forja` | Tras cada edición, avisa de números mágicos en las líneas nuevas (biome `noMagicNumbers`, ruff `PLR2004`). Pide confirmación antes de cambiar recursos AWS fuera de Floci y bloquea lo destructivo (`cdk destroy`, `s3 rm --recursive`…). |
| `aws-core@agent-toolkit-for-aws` | Skills y MCP oficiales de AWS, incluida `aws-well-architected-review`. Su MCP corre con `uvx`. |
| `codebase-memory@codebase-memory` | Grafo de código en SQLite local (MCP por `npx`, sin telemetría). |

- Quitar uno: `[claude] plugins_skip = ["quality-guard"]` en el perfil y `forja apply agents`. Para una sesión: `/plugin` o `claude --safe-mode`.
- Opciones de cada mod (p. ej. el modo inicial de `tdd-guard`): `/plugin configure <id>`.
- Desarrollo de los mods: edita `plugins/<mod>/`, `/reload-plugins` en la sesión y `npm run plugins:check`.
- rtk se instala con brew y **no** se ejecuta `rtk init`; codebase-memory entra como plugin y **no** se ejecuta `codebase-memory-mcp install` (ambos escribirían en `~/.claude`, que gestiona chezmoi).

## Checks (`forja doctor`, `forja drift`)

- Skills enlazadas en `~/.claude/skills`.
- Plugins de Claude Code instalados (aviso si falta alguno), `rtk gain` responde (token-saver) y `uvx` existe (aws-core). Un `plugins_skip` con un nombre desconocido es un aviso.
- **OpenCode** instalado con brew. Si `opencode` resuelve a `~/.opencode/bin`, es la copia del instalador oficial y tapa la de brew: es un aviso (!). El arreglo: quita la línea `export PATH=~/.opencode/bin:$PATH` de `~/.zshrc` (`chezmoi apply` la restaura desde el repo) y ejecuta `rm -rf ~/.opencode`.
- Skills de OpenSpec en `~/.claude/skills`: `apply` ejecuta `openspec init --tools claude` en un directorio temporal y copia las seis que genera (`openspec-propose`, `openspec-apply-change`, `openspec-archive-change`, `openspec-explore`, `openspec-sync-specs` y `openspec-update-change`), reemplazando solo esas carpetas. Claude Code las invoca como `/openspec-propose` y OpenCode como `@openspec-propose`. Cada SKILL.md lleva `generatedBy` con la versión de openspec que las generó; `doctor` avisa si faltan o si esa versión no coincide con `openspec --version`. Para refrescarlas tras subir openspec, `forja apply agents`.
- `opencode --version` y `hermes --version` deben responder. Un binario instalado que falla es un fallo (✖). Si Hermes no está instalado es solo un aviso, porque es opcional.
