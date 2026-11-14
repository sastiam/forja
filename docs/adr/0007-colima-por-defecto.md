# ADR 0007 — Colima como runtime de contenedores por defecto

- **Estado:** aceptada
- **Fecha:** 2026-11-14

## Contexto

La SPEC eligió OrbStack por su I/O de bind mounts y su RAM en reposo, pero exige licencia Pro en uso comercial. Colima es MIT y expone un socket Docker que Floci puede usar. No hay un benchmark público de `pnpm install` que compare ambos; el único dato fiable es el de OrbStack (88 % de la velocidad nativa).

## Decisión

El módulo `containers` instala Colima, Docker CLI y docker-compose. Se arranca con `--vm-type vz --mount-type virtiofs --vz-rosetta`. El check acepta el contexto `colima` o `orbstack`, de modo que pasarse a OrbStack no rompe `forja doctor`. OrbStack queda comentado en el `Brewfile`.

## Consecuencias

- Sin coste de licencia. La memoria de la VM es fija y se dimensiona a mano.
- Colima no arranca solo; hay que ejecutar `colima start`.
- Criterio para volver a OrbStack: `pnpm install` o el hot reload del monorepo claramente más lentos con virtiofs, o Floci inestable por el socket o la red de Lambda.

## Plan B

Descomentar `cask "orbstack"` en `modules/containers/Brewfile`, quitar Colima y usar `docker context use orbstack`.
