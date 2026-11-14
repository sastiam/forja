#!/usr/bin/env bash
# Hook WorktreeCreate: imprime SOLO la ruta del worktree en stdout.
# VERIFICAR: campos exactos del JSON que Claude Code envía por stdin (aquí se asume `.name`).
set -euo pipefail
name="$(jq -r '.name // empty')"
[[ -n "$name" ]] || { echo "worktree-create: falta name en la entrada" >&2; exit 1; }
exec forja wt new "$name" --agent claude --print-path
