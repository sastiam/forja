# Backlog

## Por evaluar
- [ ] editor: volver a probar tsgo en Zed cuando se corrija el watcher recursivo sobre symlinks de pnpm.
- [ ] containers: medir pnpm install + hot reload del monorepo real en OrbStack vs Colima y registrar resultados en un ADR.
- [ ] agents: confirmar si OpenCode lee ~/.claude/skills para no duplicar enlaces.
- [ ] agents: evaluar servidores MCP HTTP compartidos para no multiplicar procesos stdio por sesión.
- [ ] git: evaluar si Fork reemplaza a Sublime Merge (falta verificar si muestra la base en conflictos).
- [ ] macos: evaluar compatibilidad con macOS 27 antes de actualizar (OrbStack, Zed, Claude Code).
- [ ] containers: revisar madurez de Floci (fijar versión; probar compat-cdk con los stacks reales).

## Hosts
- [ ] fedora: módulos core/shell/git/runtimes/agents con dnf.
- [ ] raspi: perfil mínimo arm64.

## Ideas
- [ ] `forja report`: exportar el estado de la máquina a Markdown para el vault de Obsidian.
- [ ] Rust: módulo opcional con sccache (CARGO_INCREMENTAL=0) si el uso deja de ser ocasional.
