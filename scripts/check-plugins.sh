#!/bin/sh
# Valida y prueba cada mod de plugins/ con el propio Claude Code (claude plugin validate/test).
# Sin `claude` en el PATH (p. ej. en CI) se salta: la lógica pura ya la cubre `npm test`.
set -eu
cd "$(dirname "$0")/.."

if ! command -v claude >/dev/null 2>&1; then
  echo "plugins: claude no está instalado; se omite (npm test cubre la lógica)."
  exit 0
fi

claude plugin validate plugins
for dir in plugins/*/; do
  name=$(basename "$dir")
  echo "== $name"
  claude plugin validate "$dir"
  claude plugin test "$dir"
done
