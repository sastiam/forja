# ADR 0002 — CLI en TypeScript ejecutada con Node, sin build

- **Estado:** aceptada
- **Fecha:** 2026-11-14

## Contexto

La CLI debe ser legible y mantenible para el autor (stack TypeScript) y fácil de probar. Bash se vuelve frágil al crecer.

## Decisión

TypeScript con sintaxis borrable (`erasableSyntaxOnly`), ejecutado directamente por Node (>= 22.18 con type stripping; objetivo Node 26). Sin dependencias de runtime; `typescript`, `@types/node` y Biome solo como devDependencies. Tests con `node:test`. El único Bash es `bootstrap.sh`.

## Consecuencias

No hay paso de compilación. Los imports llevan extensión `.ts` y los tipos se importan con `import type`. No se pueden usar `enum` ni parameter properties.

## Plan B

Go o Rust si el rendimiento de arranque llegara a importar.
