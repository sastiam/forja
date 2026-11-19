#!/bin/sh
# Comprueba que cada paquete de modules/*/packages.fedora.txt existe en los repos de Fedora
# (sin repos de terceros). Pensado para correr en un Fedora limpio (CI: contenedor fedora:44).
# Un paquete que solo existe en un COPR u otro repo ajeno debe ir en thirdparty.fedora.toml
# o en mise, no aquí. Uso: sh scripts/check-fedora-packages.sh
set -eu
cd "$(dirname "$0")/.."

command -v dnf >/dev/null 2>&1 || { echo "check-fedora-packages: falta dnf (¿es Fedora?)" >&2; exit 2; }

missing=$(mktemp)
trap 'rm -f "$missing"' EXIT

for file in modules/*/packages.fedora.txt; do
  # Un paquete por línea; `#` comenta.
  sed 's/#.*//' "$file" | while read -r pkg; do
    [ -n "$pkg" ] || continue
    if [ -z "$(dnf -q repoquery --available --latest-limit=1 "$pkg" 2>/dev/null)" ]; then
      echo "  $pkg  (en $file)" >> "$missing"
    fi
  done
done

if [ -s "$missing" ]; then
  echo "Paquetes que NO están en los repos de Fedora:" >&2
  cat "$missing" >&2
  echo "Muévelos a thirdparty.fedora.toml (repo de terceros) o a mise." >&2
  exit 1
fi
echo "check-fedora-packages: ok"
