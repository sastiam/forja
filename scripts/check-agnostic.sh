#!/bin/sh
# Falla si el repo contiene datos personales: emails reales y patrones de .github/agnostic-patterns.txt.
set -eu
cd "$(dirname "$0")/.."

# Dominios permitidos en emails (ficticios o de plataforma).
ALLOWED='@(example\.(com|org|invalid)|users\.noreply\.github\.com|noreply\.github\.com|anthropic\.com)'
EXCLUDES='--exclude-dir=.git --exclude-dir=node_modules --exclude=package-lock.json --exclude=check-agnostic.sh --exclude=agnostic-patterns.txt'
fail=0

# shellcheck disable=SC2086
emails=$(grep -rEIn $EXCLUDES '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}' . | grep -Ev "$ALLOWED" || true)
if [ -n "$emails" ]; then
  echo "Emails no permitidos (usa @example.invalid en fixtures):" >&2
  echo "$emails" >&2
  fail=1
fi

grep -Ev '^[[:space:]]*(#|$)' .github/agnostic-patterns.txt | while IFS= read -r pat; do
  # shellcheck disable=SC2086
  hits=$(grep -rEIn $EXCLUDES -e "$pat" . || true)
  if [ -n "$hits" ]; then
    echo "Patrón prohibido /$pat/:" >&2
    echo "$hits" >&2
    exit 1
  fi
done || fail=1

if [ "$fail" -ne 0 ]; then exit 1; fi
echo "agnostic: ok"
