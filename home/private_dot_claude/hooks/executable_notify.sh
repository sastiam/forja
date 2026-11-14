#!/usr/bin/env bash
TOPIC_FILE="${FORJA_NTFY_TOPIC_FILE:-$HOME/.config/ntfy/topic}"
[[ -r "$TOPIC_FILE" ]] || exit 0
curl -s -H "Title: Claude Code" -d "${1:-attention} · $(basename "$PWD")" "https://ntfy.sh/$(cat "$TOPIC_FILE")" >/dev/null
