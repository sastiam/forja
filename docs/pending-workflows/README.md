# Workflows pendientes de activar

Las sesiones de Claude Code en la nube no tienen el permiso `workflow` de GitHub, así que no pueden escribir en
`.github/workflows/`. Los workflows se preparan aquí y se activan desde el Mac:

```sh
mkdir -p .github/workflows
git mv docs/pending-workflows/ci.yml docs/pending-workflows/release.yml docs/pending-workflows/dependabot-automerge.yml .github/workflows/
git commit -m "ci: activa ci.yml, release.yml y auto-merge de Dependabot"
git push
```

`codeql.yml` se queda aquí a propósito: en un repo personal pequeño aporta poco frente a su coste.

Después de activarlos, en GitHub → Settings:

1. **General → Pull Requests:** marca «Allow auto-merge».
2. **Branches (o Rules) → `main`:** exige el status check `ci` antes de integrar. `ci` es un job que agrupa al resto,
   así que no hay que tocar la regla cuando se añaden jobs.
