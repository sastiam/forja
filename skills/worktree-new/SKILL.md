---
name: worktree-new
description: "Crea un worktree listo para trabajar con forja. Úsala cuando el usuario diga 'créame un worktree para…', 'rama nueva aislada' o quiera trabajar en paralelo sin tocar la rama actual."
status: complete
---

# worktree-new

Esta skill **no contiene lógica**: solo llama a la CLI `forja`.

## Cuándo usarla
- "créame un worktree para el ticket X", "necesito una rama aislada para …".

## Pasos
1. Deduce el nombre de la rama (p. ej. `feat/login`). Si es ambiguo, pregunta una vez.
2. Ejecuta desde el repo del proyecto:
   ```sh
   forja wt new <rama> --agent <claude|opencode|hermes> --print-path
   ```
   Usa tu propio agente en `--agent`. Los agentes trabajan en ramas `agent/<nombre>` (forja añade el prefijo).
3. Si el proyecto no tiene `.forja/project.toml`, ofrece `forja wt init-project`.
4. Reporta al usuario: **ruta**, **rama**, **puerto** (`WT_PORT` en `.env.worktree`) y cómo arrancar con secretos:
   ```sh
   op run --env-file=.env.tpl -- pnpm dev
   ```

## Reglas
- Nunca copies ni crees `.env` reales; forja ya los excluye. Usa `.env.tpl` con referencias `op://`.
- Si `forja wt new` falla, muestra el error tal cual y no improvises con `git worktree`.
- Salida estructurada: `forja wt ls --json`.
