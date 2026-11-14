# Changelog

Formato basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/) y [SemVer](https://semver.org/lang/es/).

## [Unreleased]

### Added
- `forja sandbox-check [--host h]…`: comprobación previa de un loop (git, escritura, firma de agentes y red) con el arreglo sugerido para cada fallo (ADR 0009).
- Firma ssh de agentes: campo `[signing] agent_key` del perfil, `wt new --agent` la activa por worktree y `doctor` comprueba la clave (ADR 0008).
- `doctor`/`drift` (módulo `agents`): `opencode --version` y `hermes --version` deben responder; aviso si `opencode` es la copia del instalador oficial (`~/.opencode/bin`) en vez de la de brew. Los checks de módulo admiten `warn` (se muestran con `!` y no cambian el código de salida de doctor).
- `forja report [-o archivo.md]`: exporta el estado de la máquina (módulos y diagnóstico) a Markdown.

### Changed
- `containers`: Colima + Docker CLI sustituyen a OrbStack como runtime por defecto (ADR 0007); el check acepta ambos contextos.

### Fixed
- `drift`, `plan` y `report` marcaban como pendientes paquetes instalados: `brew bundle check` se ejecuta ahora con `--no-upgrade`, `HOMEBREW_NO_AUTO_UPDATE=1` y `HOMEBREW_NO_ANALYTICS=1`, sin red (dentro del sandbox no llega a analytics.brew.sh).

## [0.1.0] - 2026-11-14

### Added
- `bootstrap.sh` (POSIX sh, idempotente, `--dry-run`, `--no-claude`, `--dir`, `--ref`).
- CLI `forja` en TypeScript sin build y sin dependencias de runtime: `setup --no-claude`, `plan`, `apply`, `drift`, `doctor` (sin `--fix`), `module`, `backlog`, `version`.
- Subcomandos `forja wt new|ls|rm|prune|init-project`.
- Módulos `core, shell, git, runtimes, containers, editor, terminal, browsers, agents, worktrees, security, macos-base` (y `macos-aggressive` como esqueleto).
- Hosts `macbook` (soportado), `fedora` y `raspi` (planificados).
- Skills `worktree-new` y `worktree-status` completas; el resto en borrador.
- Archivos de comunidad de GitHub, plantillas, Dependabot y workflows de CI, release y CodeQL.
- ADRs de las decisiones iniciales.

[Unreleased]: https://github.com/sastiam/forja/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/sastiam/forja/releases/tag/v0.1.0
