# looper

[openspec-cascade](https://github.com/sastiam/openspec-cascade) con un ref fijado, para `forja wt night`.

- Bun viene de mise (módulo `runtimes`).
- Clona el repo en `~/.local/share/openspec-cascade`, hace checkout del ref fijado en `cli/src/core/looper.ts` (`LOOPER_REF`) y ejecuta `bun install --frozen-lockfile` y `bun link`. El binario `openspec-cascade` queda en `~/.bun/bin`, que la plantilla de `.zshrc` añade al PATH.
- Subir de versión es una PR que cambia `LOOPER_REF` (skill `forja-maintain`), nunca un `git pull` silencioso. Si el clon tiene cambios locales, `apply` no cambia de versión.

Uso: `forja wt night --changes a,b` (ver la skill `night-run`).
