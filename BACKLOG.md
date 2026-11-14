# Backlog

## Por evaluar
- [ ] editor: volver a probar tsgo en Zed cuando se corrija el watcher recursivo sobre symlinks de pnpm.
- [x] containers: benchmark Colima vs OrbStack descartado; OrbStack fuera (actualización de ADR 0007).
- [ ] agents: confirmar si OpenCode lee ~/.claude/skills para no duplicar enlaces.
- [ ] agents: evaluar servidores MCP HTTP compartidos para no multiplicar procesos stdio por sesión.
- [ ] git: evaluar si Fork reemplaza a Sublime Merge (falta verificar si muestra la base en conflictos).
- [x] macos: compatibilidad con macOS 27. Zed 1.28.1 y Claude Code 2.1.325 funcionan en 27.2.1; OrbStack declara soporte desde v2.2.2 (ago-2026) con arreglos posteriores, pendiente de probar al instalarlo.
- [ ] containers: revisar madurez de Floci. Última release vista: 1.5.32, cadencia quincenal. Falta fijar versión en el Brewfile y probar compat-cdk con los stacks reales.

## Hosts
- [ ] fedora: módulos core/shell/git/runtimes/agents con dnf.
- [ ] raspi: perfil mínimo arm64.

## Ideas
- [x] `forja report`: exportar el estado de la máquina a Markdown para el vault de Obsidian (hecho en Unreleased).
- [ ] Rust: módulo opcional con sccache (CARGO_INCREMENTAL=0) si el uso deja de ser ocasional.
