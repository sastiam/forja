---
name: night-run
description: "Prepara y lanza una tarea de agente nocturna. Úsala con 'déjalo trabajando esta noche'."
status: draft
---

# night-run (borrador, v0.3.0)

> status: draft — `forja wt night` llega en v0.3.0. Mientras tanto, este es el flujo manual.

Ayuda a escribir el archivo de prompt (objetivo, criterios de terminado, `.agent-done`) y a lanzar el loop sin que se pare por permisos. La skill no contiene lógica: explica cuándo usar cada comando.

## Antes de lanzar (fuera del sandbox)

1. `forja wt new <rama> --agent claude --print-path`: crea el worktree. Hazlo aquí porque `git worktree add` no puede escribir en `.git/worktrees` desde el sandbox.
2. Instala las dependencias del proyecto (por ejemplo `pnpm install`) para que el loop no necesite la red de paquetes.
3. `forja doctor`: confirma que la clave de firma de agentes está en verde (permisos 600, menos de 90 días, FileVault).

## Comprobación previa (dentro del sandbox)

4. Desde el worktree y dentro del mismo sandbox del loop: `forja sandbox-check --host github.com` (añade un `--host` por cada dominio que la tarea vaya a usar).
5. Si sale con ✖, no lances el loop. Cada fallo trae el arreglo: un dominio para `sandbox.network.allowedDomains`, un archivo para `sandbox.filesystem.allowRead`, o mover un paso al lanzador. Pon los permisos de la tarea en la configuración del proyecto, no en los ajustes globales.

## Durante el loop

- Si un permiso se deniega, no reintentes: escribe el bloqueo en `.agent-blocked` y avisa (`ntfy`).
- Empuja con `git push origin HEAD` (sin `-u`: el sandbox protege `.git/config`).
- Nunca empujes a `main`: trabaja en la rama `agent/…` y abre un PR.
