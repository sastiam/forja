# ADR 0014 — Identidad y firma de git por repo

- **Estado:** aceptada
- **Fecha:** 2026-11-16

## Contexto

La config global de git es la laboral (email y clave de firma de la empresa, `commit.gpgsign=true`). `forja` y `openspec-cascade` son repos personales. Solo forja tenía un override manual en su `.git/config`. En openspec-cascade, cualquier worktree no creado con `wt new --agent` firmaba con la clave laboral, y los de agente (ADR 0008) llevaban la clave de agente pero el email laboral, de modo que GitHub no los verificaba. `wt night` tampoco reaplicaba la firma a un worktree reutilizado.

## Decisión

1. **Excepciones declaradas en el perfil local.** `[git.identities.<n>]` (nombre, email, `signing_key`, `agent_key` opcional) y `[git.repos]` (repo → identidad). Sin entrada manda la global (laboral).
2. **Nivel repo.** La identidad se escribe con `git config --local` en el `.git/config` del repo principal: la heredan todos los worktrees, vengan de donde vengan.
3. **Agentes encima.** En su `config.worktree`, clave de agente más nombre y email de la identidad.
4. **Automático e idempotente.** `wt new` y `wt night` (también con worktree reutilizado) lo aplican. `forja git identity apply|check` cubre lo ya existente.

## Consecuencias

- Añadir un repo personal es una línea en el perfil.
- Los worktrees creados fuera de forja firman con la clave humana de la identidad, que necesita ssh-agent: vale porque los commits ocurren fuera del sandbox.
- La clave humana no se lee desde el sandbox (`~/.ssh` está denegado); los agentes dentro del sandbox no firman.
