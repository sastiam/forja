# ADR 0001 — chezmoi para los archivos de configuración

- **Estado:** aceptada
- **Fecha:** 2026-11-14

## Contexto

Hay que aplicar por módulo, detectar desvíos y capturar cambios manuales, sin guardar datos personales en el repo público.

## Decisión

Usar chezmoi con un único source dir (`home/`). Cada `module.toml` declara sus `targets` y `forja apply <m>` ejecuta `chezmoi apply <targets>`. Los datos personales viven en `~/.config/chezmoi/chezmoi.toml`, derivado de `profile.toml`.

## Consecuencias

`chezmoi diff`/`verify` cubren `drift`; `re-add` cubre `capture`. `.chezmoiignore.tmpl` excluye los módulos no habilitados. Los módulos que comparten un archivo (agents/worktrees con `~/.claude/settings.json`) deben coordinar mediante plantillas.

## Plan B

Symlinks propios gestionados por la CLI.
