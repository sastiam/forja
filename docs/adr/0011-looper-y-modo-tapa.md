# ADR 0011 — Looper con openspec-cascade y modo tapa

- **Estado:** aceptada
- **Fecha:** 2026-11-14

## Contexto

La SPEC preveía que `wt night` corriera `claude -p` en bucle con un archivo de prompt. Mientras tanto, el usuario construyó [openspec-cascade](https://github.com/sastiam/openspec-cascade). Ejecuta changes de OpenSpec tarea a tarea, con una sesión nueva por tarea, verifica cada tarea ejecutando sus checks y solo hace commit del trabajo verificado. Admite varios motores (Claude Agent SDK, OpenCode, Antigravity). Ya resuelve la parte difícil: el criterio de terminado, los reintentos y el límite de uso del plan.

Para usarlo sin supervisión en un MacBook faltaban tres cosas:
- un entorno preparado (worktree aislado, firma de agente, comprobación previa);
- que el Mac no se duerma con la tapa cerrada. Su `caffeinate -i` solo evita el reposo por inactividad, y al cerrar la tapa macOS duerme el Mac igualmente;
- avisar al terminar.

## Decisión

1. **forja no reimplementa el loop.** El módulo `looper` instala openspec-cascade con un ref fijado (`LOOPER_REF`) y `bun link`. Para subir de versión hay que abrir una PR.
2. **`wt night` es el lanzador** (ADR 0009). En orden:
   - comprobaciones previas (binario, changes y corriente);
   - worktree `agent/night-…` con firma de agente;
   - `sandbox-check`;
   - openspec-cascade con `--repo <worktree>`;
   - notificación por ntfy.
   Nunca hace push.
3. **Modo tapa solo durante el loop.** `forja awake` usa `pmset -a disablesleep 1`, con una regla sudoers mínima instalada por `macos-base` (solo `disablesleep 0/1` y `sleepnow`, validada con `visudo -c`). `wt night` lo envuelve: lo quita al terminar y ante SIGINT o SIGTERM. Un guardián lo corta y duerme el Mac si la batería baja del 20 % sin cargador. Si queda activo sin loop (huérfano), `doctor` avisa.
4. **Corriente por defecto.** `wt night` exige cargador, salvo `--allow-battery`.

## Consecuencias

- El Mac puede trabajar con la tapa cerrada sin cambiar el comportamiento normal del resto del tiempo.
- Si el proceso muere con SIGKILL, el modo tapa queda activo hasta que `doctor` lo detecta o se ejecuta `forja awake off`. Es el riesgo aceptado.
- Calor: con la tapa cerrada, el Mac tiene que estar sobre una superficie ventilada. La skill `night-run` lo recuerda.
- openspec-cascade tiene que estar en el `PATH` (`~/.bun/bin`), y se comprueba con `doctor`.

## Plan B

Si `disablesleep` deja de funcionar en una versión de macOS, usar el modo clamshell con un monitor externo o dejar la tapa abierta con la pantalla apagada (`pmset displaysleepnow`).
