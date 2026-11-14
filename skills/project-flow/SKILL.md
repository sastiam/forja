---
name: project-flow
description: "Flujo diario de un proyecto: AWS local con Floci y CDK, tests y PR con Conventional Commits. Úsala para 'levanta AWS en local', 'despliega en Floci', 'corre los tests' o 'abre la PR'."
status: complete
---

# project-flow

Esta skill **no contiene lógica**: encadena comandos del proyecto, de Floci, de CDK y de `gh`.

## AWS local (Floci)
1. Docker debe ir por Colima: `docker context show` → `colima` (si no, `colima start`; skill `mac-doctor`).
2. `floci start --persist`. Los datos se guardan en `.floci-data/`, que Zed y git ignoran.
3. Todos los comandos usan `AWS_PROFILE=floci` (cuenta `000000000000`, endpoint `http://localhost:4566`). Si el proyecto tiene `[floci] enabled = true`, el worktree ya lo exporta en `.env.worktree`.
4. CDK contra Floci:
   ```sh
   AWS_PROFILE=floci cdk bootstrap aws://000000000000/us-east-1
   AWS_PROFILE=floci cdk synth && AWS_PROFILE=floci cdk deploy --require-approval never
   ```
   Nunca uses un perfil real (`aws.local.config`) sin que el usuario lo diga explícitamente.

## Desarrollo
- Secretos: `op run --env-file=.env.tpl -- pnpm dev`. Nunca crees `.env` reales.
- Puerto del worktree: `WT_PORT` en `.env.worktree`.
- Tests y tipos: `pnpm -s test`, `pnpm -s typecheck` (en Zed: `cmd-alt-t`, `cmd-alt-y`).

## PR
1. `forja wt integrate <rama>` (skill `worktree-integrate`) para ponerla al día y correr los checks.
2. Commits con Conventional Commits y scope.
3. `git push origin HEAD` (sin `-u` dentro del sandbox) y `gh pr create --fill`. Rellena la plantilla del repo si la hay.
4. Nunca hagas push a `main` ni force-push.
