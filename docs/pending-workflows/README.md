# Workflows pendientes de activar

Estos tres workflows (`ci.yml`, `release.yml`, `codeql.yml`) están completos pero viven aquí porque la sesión que generó el repo no tenía el permiso `workflow` de GitHub para escribir en `.github/workflows/`.

Actívalos desde tu máquina:

```sh
git mv docs/pending-workflows/*.yml .github/workflows/   # crea la carpeta si no existe
git rm docs/pending-workflows/README.md
git commit -m "ci: activate workflows" && git push
```
