#!/usr/bin/env bash
# Statusline mínima: directorio y rama.
printf '%s' "$(basename "$PWD")$(git branch --show-current 2>/dev/null | sed 's/^/ ⎇ /')"
