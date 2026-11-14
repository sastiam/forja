#!/usr/bin/env bash
# Hook WorktreeRemove. VERIFICAR: campo del JSON con la ruta (aquí se asume `.worktree_path`).
set -euo pipefail
path="$(jq -r '.worktree_path // empty')"
[[ -n "$path" ]] || exit 0
exec forja wt rm "$path"
