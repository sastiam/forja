# ADR 0003 — Parser TOML propio de subconjunto

- **Estado:** aceptada
- **Fecha:** 2026-11-14

## Contexto

La SPEC permite una dependencia fijada (`smol-toml`) o TOML nativo de Node. Node no trae parser TOML (VERIFICAR en Node 26: no se pudo comprobar en este entorno, que usa Node 22).

## Decisión

Escribir `cli/src/core/toml.ts`: un parser mínimo (tablas, strings, números, booleanos, arrays) más `stringify`, con tests. Es suficiente para `module.toml`, `hosts/*.toml`, `profile.toml` y `.forja/project.toml`.

## Consecuencias

Se mantiene el objetivo de cero dependencias de runtime. No soporta arrays de tablas, tablas inline ni fechas: si un archivo futuro lo necesita, hay que ampliar el parser.

## Plan B

Sustituirlo por `smol-toml` fijado (la interfaz `parse`/`stringify` es la misma).
