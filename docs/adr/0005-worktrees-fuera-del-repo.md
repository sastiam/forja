# ADR 0005 — Worktrees como hermanos del repo

- **Estado:** aceptada
- **Fecha:** 2026-11-14

## Contexto

Un worktree dentro del repo haría que `pnpm install` suba hasta el `pnpm-workspace.yaml` del padre.

## Decisión

Los worktrees viven en `<dir-del-repo>/../<repo>.wt/<slug>`. Los metadatos se guardan en `~/.local/state/forja/worktrees.json`. El puerto es `port_base + cksum(slug) % 100` (CRC de POSIX `cksum`, determinista y con test). `wt new` nunca copia `.env` ni `.env.*` (salvo `.env.tpl`).

## Consecuencias

`.worktreeinclude` admite solo rutas literales (sin globs) en v0.1.0.

## Plan B

Worktrees dentro de `.claude/worktrees` (comportamiento por defecto de Claude Code).
