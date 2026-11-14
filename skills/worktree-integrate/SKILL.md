---
name: worktree-integrate
description: "Pone al día una rama de worktree con main (rebase o merge), explica los conflictos y corre los checks de integración. Úsala con 'integra la rama…', 'actualiza mi rama con main', 'hay conflictos' o antes de abrir una PR."
status: complete
---

# worktree-integrate

Esta skill **no contiene lógica**: solo llama a la CLI `forja`.

## Pasos
1. Identifica la rama. Si dudas, ejecuta `forja wt ls --json` y pregunta una vez.
2. Ejecuta:
   ```sh
   forja wt integrate <rama> --json
   ```
   Por defecto hace rebase sobre `origin/main` tras un fetch. Usa `--strategy merge` si la rama ya está publicada y compartida, y `--onto <ref>` para otra base.
3. Lee el JSON:
   - `status: "ok"`: informa de `ahead` y `behind` y de los checks. Propón abrir la PR (`gh pr create`) y **no hagas push sin pedirlo**.
   - `status: "checks-failed"`: muestra qué check de `[checks].integrate` falló y su salida. Ofrece arreglarlo en el worktree.
   - `status: "conflicts"`: son los conflictos que mergiraf y rerere no resolvieron. Para cada archivo de `conflicts`:
     - Explica qué cambió en cada lado: `git diff` en el worktree, o `git log --oneline -3 -- <archivo>` en cada rama.
     - Si la resolución es obvia, propónla y aplícala tras el «sí».
     - Si no, sugiere `git mergetool`, que abre Sublime Merge con la base visible.
     - Después: `git rebase --continue` (o `git commit --no-edit` si es un merge) y vuelve a ejecutar `forja wt integrate <rama>`.
4. Si el usuario quiere abandonar: `git rebase --abort` o `git merge --abort` en el worktree.

## Reglas
- `forja wt integrate` nunca hace push. Tú tampoco, sin permiso explícito. Nunca hagas force-push sobre ramas de otros.
- Exige un árbol limpio: si hay cambios sin commit, pregunta si se hace commit o stash.
