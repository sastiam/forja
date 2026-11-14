# Changelog

Formato basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/) y [SemVer](https://semver.org/lang/es/).

## [Unreleased]

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
