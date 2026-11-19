# looper

[openspec-cascade](https://github.com/sastiam/openspec-cascade) con un ref fijado, para `forja wt night`.

- Bun viene de mise (módulo `runtimes`).
- Clona el repo en `~/.local/share/openspec-cascade`, hace checkout del ref fijado en `cli/src/core/looper.ts` (`LOOPER_REF`) y ejecuta `bun install --frozen-lockfile` y `bun link`. El binario `openspec-cascade` queda en `~/.bun/bin`, que la plantilla de `.zshrc` añade al PATH.
- Subir de versión es una PR que cambia `LOOPER_REF` (skill `forja-maintain`), nunca un `git pull` silencioso. Si el clon tiene cambios locales, `apply` no cambia de versión.

Uso: `forja wt night --changes a,b` (ver la skill `night-run`).

## Qué cambió con cascade v2

- **Ref fijado** en `6c3da8c` (cascade v2: pipeline `--mode v2`, QA autónomo, detección de pnpm/npm/yarn/bun). Antes `0e0b74b`. Se comprobó que las banderas que usa `wt night` (`--repo`, `--changes`, `--engine`, `--log-dir`, `--model`, `--effort`, `--full-gate`, `--settings`) siguen existiendo.
- **`--mode v1|v2`** de `wt night` se pasa tal cual a cascade. `jules` no se ofrece como motor: corre en la nube y no admite el sandbox que `wt night` exige.
- **Comprobación previa:** `wt night` ejecuta `openspec-cascade doctor` y aborta si alguna línea es `fail`.
- **No se usa `bin/install.mjs` de cascade.** Ese instalador registra el marketplace de cascade desde una carpeta local y copia un workflow a `~/.claude/workflows/`. Forja ya declara el plugin `cascade@openspec-cascade` desde GitHub en `settings.json` (módulo `agents`) y el módulo `looper` ya hace `bun install` y `bun link`, así que el instalador duplicaría el marketplace con otro origen.
- **En Linux** funciona igual: Bun viene de mise y el modo tapa lo da `systemd-inhibit` (ADR 0016).
