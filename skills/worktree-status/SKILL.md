---
name: worktree-status
description: "Muestra y limpia los worktrees de forja. Úsala cuando pregunten 'qué worktrees tengo', 'quién usa cuál' o 'limpia los worktrees'."
status: complete
---

# worktree-status

Esta skill **no contiene lógica**: solo llama a la CLI `forja`.

## Cuándo usarla
- "qué worktrees tengo", "cuáles están sucios", "limpia los viejos".

## Pasos
1. Ejecuta `forja wt ls --json` y resume en una tabla: rama, owner (`human|claude|opencode|hermes|night`), ahead/behind, sucio, edad, puerto y PR.
2. Señala los candidatos a limpieza: fusionados, con más de 14 días, o entradas huérfanas.
3. Si el usuario quiere limpiar:
   ```sh
   forja wt prune --merged --older-than 14d --dry-run
   ```
   Muestra lo que se eliminaría y **pide confirmación**.
4. Tras el "sí", ejecuta el mismo comando sin `--dry-run`.

5. Para una rama que va por detrás de main, ofrece la skill `worktree-integrate`. Para los worktrees `night`, revisa también `forja awake status`: si el loop terminó, el modo tapa debe estar inactivo.

## Reglas
- Nunca uses `--force` sin que el usuario lo pida explícitamente para ese worktree.
- `forja wt rm` rechaza worktrees con cambios sin commit o sin push: respeta ese rechazo y explícalo.
