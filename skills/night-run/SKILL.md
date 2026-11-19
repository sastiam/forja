---
name: night-run
description: "Prepara y lanza un loop de desarrollo autónomo con openspec-cascade (forja wt night), por ejemplo durante la noche con la tapa cerrada. Úsala con 'déjalo trabajando esta noche', 'ejecuta estos changes de OpenSpec' o 'lanza el looper'."
status: complete
---

# night-run

Esta skill **no contiene lógica**: explica y lanza `forja wt night`, que envuelve [openspec-cascade](https://github.com/sastiam/openspec-cascade).

## Qué hace `forja wt night`
1. **Comprobaciones:**
   - `openspec-cascade` instalado (`forja apply looper`) y su propio diagnóstico, `openspec-cascade doctor --repo <repo>`: solo sus líneas `fail` abortan (runtime, git, OpenSpec, motores, hooks del plugin); los `warn` no.
   - Cada change está **commiteado** en la rama base del worktree (`--base`, por defecto `origin/main`): `openspec/changes/<nombre>/tasks.md`. Si el change solo está en tu rama de trabajo, lanza con `--base <tu-rama>`. Si el worktree ya existe, se busca ahí.
   - **Spec-gate:** `openspec-cascade spec-gate check --stage review --changes <lista>` (en el repo principal). Si no sale 0, aborta antes de crear nada y muestra su salida.
   - Corriente conectada (o `--allow-battery`).
2. **Worktree de agente:** rama `agent/night-…`, con la firma ssh de agentes. Si ya existe, lo reutiliza.
3. **Sandbox del agente** (ADR 0013): escribe `~/.local/state/forja/night/<rama>.settings.json` (sandbox obligatorio, dominios del host/perfil/`--host`, Docker) y comprueba:
   - **arnés**, fuera del sandbox: git, escritura en el git-dir y firma;
   - **agente**, dentro del sandbox, con una sesión corta de `claude -p` (Haiku) y el mismo settings: git, escritura, red de cada `--host` y que el sandbox está activo.
4. **Modo tapa** (`forja awake`): el Mac no duerme al cerrar la tapa. Se quita al terminar, con Ctrl-C o si la batería baja del 20 % sin cargador.
5. **openspec-cascade** con `--repo <worktree> --changes … --engine … --settings <settings de la noche>`: una sesión por tarea, el arnés verifica y hace los commits. Logs en `~/.local/state/forja/logs/night/`.
6. **Notificación** por ntfy al terminar o al fallar. **Nunca hace push.**

## Pasos
1. Comprueba que los changes están listos: `openspec list` en el repo y que cada `tasks.md` tenga sus `Verify:`. Si faltan, ayuda a escribirlos antes de lanzar.
2. Instala las dependencias del proyecto en el repo principal (`pnpm install`): el loop no debe necesitar la red de paquetes. Si alguna tarea necesita un dominio (una API, un registry), pásalo con `--host dominio`; lo que no esté permitido fallará de noche en vez de pedir permiso.
3. Previsualiza el plan:
   ```sh
   forja wt night --changes a,b --dry-run
   ```
4. Lanza en una terminal que quede abierta (Ghostty), no dentro de esta sesión:
   ```sh
   forja wt night --changes a,b [--base rama] [--engine claude|opencode|antigravity] [--mode v1|v2] [--full-gate]
   ```
   `--mode` elige el pipeline de cascade: `v1` (por defecto, tarea a tarea) o `v2` (desarrollo guiado por especificaciones con QA autónomo). Usa `--full-gate` en changes de dependencias o toolchain. `wt night` no reenvía flags a openspec-cascade: un argumento que no reconoce es un error.
5. Por la mañana: `forja wt ls`, revisa la rama `agent/night-…` y las tareas humanas que openspec-cascade listó al final. Luego `forja wt integrate` (skill `worktree-integrate`) y PR.

## Reglas
- No lances el loop si alguna comprobación falla: cada fallo trae su arreglo.
- Si el spec-gate falla, corrige los specs del change y repite; no lo saltes ni lances `openspec-cascade` a mano para esquivarlo.
- El sandbox solo cubre el motor `claude`. `--no-sandbox` (o los motores `opencode`/`antigravity`) deja al agente sin sandbox: úsalo solo a propósito y sin secretos al alcance.
- Con la tapa cerrada, el Mac debe estar sobre una superficie ventilada, nunca en una mochila.
- Si el loop murió y `forja awake status` sale «huérfano», ejecuta `forja awake off`.
