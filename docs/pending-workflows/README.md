# Workflows inactivos

`ci.yml`, `release.yml` y `dependabot-automerge.yml` ya están activos en `.github/workflows/`.

`codeql.yml` se queda aquí a propósito: en un repo personal pequeño aporta poco frente a su coste. Para activarlo,
muévelo a `.github/workflows/` desde el Mac (las sesiones de Claude Code en la nube no tienen el permiso `workflow` de
GitHub para escribir ahí).

Configuración de GitHub que necesitan los workflows activos (Settings):

1. **General → Pull Requests:** «Allow auto-merge», para el auto-merge de Dependabot.
2. **Branches (o Rules) → `main`:** exige el status check `ci` antes de integrar. `ci` es un job que agrupa al resto,
   así que no hay que tocar la regla cuando se añaden jobs.
