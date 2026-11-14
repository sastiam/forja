# ADR 0004 — Una sola carpeta de skills enlazada a los agentes

- **Estado:** aceptada
- **Fecha:** 2026-11-14

## Contexto

Las mismas skills deben servir a Claude Code y OpenCode sin duplicar su contenido.

## Decisión

`skills/` es la fuente única. El módulo `agents` crea symlinks a `~/.claude/skills/<nombre>`. Para OpenCode queda pendiente VERIFICAR su ruta global y si ya lee `~/.claude/skills` (ver BACKLOG), para no enlazar dos veces.

## Consecuencias

Mejorar una skill en el repo la actualiza al instante en el agente. Las skills no contienen lógica: solo llaman a `forja`.

## Plan B

Copiar las skills en lugar de enlazarlas.
