# ADR 0009 — Comprobación previa y lanzador para loops en sandbox

- **Estado:** aceptada
- **Fecha:** 2026-11-14

## Contexto

Un loop sin supervisión que corre dentro del sandbox se puede parar a mitad de tarea por un permiso que nadie previó (git que no lee su configuración, red a un dominio no permitido, `.git/worktrees` de solo lectura, firma de commits). El sandbox es deseable para esos loops: limita el daño de una inyección de instrucciones o de una dependencia comprometida.

## Decisión

1. **Preparar fuera, ejecutar dentro.** El lanzador (fuera del sandbox) crea el worktree con `forja wt new --agent`, instala dependencias y solo entonces arranca el loop dentro del sandbox con el directorio de trabajo en ese worktree.
2. **Comprobación previa.** `forja sandbox-check [--host h]…` se ejecuta dentro del mismo entorno que usará el loop y comprueba git, escritura (git-dir, directorio de trabajo y temporal), la firma de agentes y la red de cada `--host`. Sale con 1 y sugiere el arreglo de cada fallo; el lanzador no arranca el loop si falla.
3. **Fallar con claridad.** Si un permiso se deniega durante el loop, no se reintenta: se escribe el bloqueo en un archivo y se notifica.
4. **Permisos por tarea.** Dominios y rutas de cada tarea van en la configuración del proyecto o en un `--settings` del lanzador, no en los ajustes globales.

## Consecuencias

- Los fallos de permisos aparecen antes de empezar, con el cambio concreto que hay que hacer.
- El sandbox sigue activo para los loops, que es donde más protege.
- Límite conocido: `sandbox-check` no prueba la creación de worktrees ni escribir en `.git/config`; por eso `wt new` va en el lanzador y los pushes no usan `-u`.
- El git-dir de un worktree creado por forja puede ser de solo lectura dentro del sandbox; el check lo detectaría, pero esto no se ha probado con un worktree real.

## Plan B

Ejecutar los loops sin sandbox solo con confirmación explícita por tarea y sin acceso a secretos.
