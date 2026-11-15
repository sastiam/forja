#!/usr/bin/env bash
# Gestionado por forja (módulo containers). PreToolUse de Bash: si el comando usa
# Docker (docker, docker-compose, floci, cdk, sam), arranca Colima antes. Los
# hooks corren fuera del sandbox; nunca bloquea el comando.
cmd="$(jq -r '.tool_input.command // empty' 2>/dev/null)"
re='(^|[^[:alnum:]_./-])(docker|docker-compose|floci|cdk|sam)([^[:alnum:]_-]|$)'
[[ "$cmd" =~ $re ]] || exit 0
ensure="$HOME/.config/forja/bin/colima-ensure"
[[ -x "$ensure" ]] && "$ensure"
exit 0
