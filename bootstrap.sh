#!/bin/sh
# forja bootstrap — único punto de entrada en una máquina limpia (POSIX sh, idempotente).
# Uso: curl -fsSL https://raw.githubusercontent.com/<usuario>/forja/main/bootstrap.sh | sh
#   --dry-run     muestra los pasos sin ejecutarlos
#   --no-claude   camino 100 % determinista (sin Claude Code)
#   --dir <ruta>  dónde clonar forja (por defecto ~/.local/share/forja)
#   --ref <ref>   tag o rama a usar (por defecto main)
#   --repo <url>  repositorio a clonar
set -eu

DRY_RUN=0
NO_CLAUDE=0
DIR="${HOME}/.local/share/forja"
REF="main"
REPO="${FORJA_REPO:-https://github.com/sastiam/forja.git}"

while [ $# -gt 0 ]; do
  case "$1" in
    --dry-run) DRY_RUN=1 ;;
    --no-claude) NO_CLAUDE=1 ;;
    --dir) shift; DIR="${1:?--dir requiere una ruta}" ;;
    --ref) shift; REF="${1:?--ref requiere un valor}" ;;
    --repo) shift; REPO="${1:?--repo requiere una URL}" ;;
    -h | --help) echo 'uso: bootstrap.sh [--dry-run] [--no-claude] [--dir ruta] [--ref ref] [--repo url]'; exit 0 ;;
    *) echo "forja: opción desconocida: $1" >&2; exit 1 ;;
  esac
  shift
done

say() { printf '==> %s\n' "$*"; }

# Ejecuta (o, con --dry-run, solo muestra) un comando.
run() {
  if [ "$DRY_RUN" -eq 1 ]; then
    printf '[dry-run] %s\n' "$*"
  else
    "$@"
  fi
}

have() { command -v "$1" >/dev/null 2>&1; }

OS=$(uname -s)
case "$OS" in
  Darwin)
    if [ "$(uname -m)" != "arm64" ]; then
      echo "forja: se requiere Apple silicon (arm64)." >&2
      exit 1
    fi
    # FORJA_SKIP_OS_CHECK=1 se usa solo en CI (los runners pueden ir por detrás de macOS 26).
    MACOS_MAJOR=$(sw_vers -productVersion 2>/dev/null | cut -d. -f1 || echo 0)
    if [ -z "${FORJA_SKIP_OS_CHECK:-}" ] && [ "${MACOS_MAJOR:-0}" -lt 26 ]; then
      echo "forja: se requiere macOS 26 o superior (detectado: $(sw_vers -productVersion 2>/dev/null || echo desconocido))." >&2
      exit 1
    fi
    ;;
  Linux)
    # shellcheck disable=SC1091
    DISTRO=$( . /etc/os-release 2>/dev/null && echo "${ID:-}")
    if [ "$DISTRO" != "fedora" ]; then
      echo "forja: en Linux solo Fedora está soportado (detectado: ${DISTRO:-desconocido})." >&2
      exit 1
    fi
    if [ "$(uname -m)" != "x86_64" ]; then
      echo "forja: en Fedora se requiere x86_64 (detectado: $(uname -m))." >&2
      exit 1
    fi
    ;;
  *)
    echo "forja: sistema no soportado: $OS" >&2
    exit 1
    ;;
esac

# ~/.local/bin: aquí van forja y, en Fedora, mise. Se antepone al PATH de esta ejecución.
case ":$PATH:" in
  *":$HOME/.local/bin:"*) ;;
  *) PATH="$HOME/.local/bin:$PATH"; export PATH ;;
esac

if [ "$OS" = "Darwin" ]; then
  # 1. Xcode Command Line Tools (interactivo: espera a que termine).
  if ! xcode-select -p >/dev/null 2>&1; then
    say "Instalando Xcode Command Line Tools (sigue el diálogo)"
    run xcode-select --install || true
    if [ "$DRY_RUN" -eq 0 ]; then
      until xcode-select -p >/dev/null 2>&1; do sleep 5; done
    fi
  else
    say "Xcode CLT: ok"
  fi

  # 2. Homebrew.
  if ! have brew && [ ! -x /opt/homebrew/bin/brew ]; then
    say "Instalando Homebrew"
    if [ "$DRY_RUN" -eq 1 ]; then
      # shellcheck disable=SC2016
      echo '[dry-run] /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"'
    else
      /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
    fi
  else
    say "Homebrew: ok"
  fi
  if [ -x /opt/homebrew/bin/brew ]; then
    eval "$(/opt/homebrew/bin/brew shellenv)"
  fi

  # 3. git y mise.
  for pkg in git mise; do
    if have "$pkg" && [ "$DRY_RUN" -eq 0 ]; then
      say "$pkg: ok"
    else
      say "brew install $pkg"
      run brew install "$pkg"
    fi
  done
else
  # 1-3 (Fedora). git sale de dnf (pide sudo); mise no está en los repos de Fedora y se baja
  # con su instalador oficial a ~/.local/bin (sin sudo). MISE_VERSION fija la versión.
  if have git; then
    say "git: ok"
  else
    say "dnf install git (pide sudo)"
    run sudo dnf install -y git
  fi
  if have mise; then
    say "mise: ok"
  else
    say "Instalando mise (instalador oficial de mise.jdx.dev en ~/.local/bin)"
    run mkdir -p "$HOME/.local/bin"
    if [ "$DRY_RUN" -eq 1 ]; then
      # shellcheck disable=SC2016
      echo '[dry-run] curl -fsSL https://mise.run | MISE_INSTALL_PATH=$HOME/.local/bin/mise sh'
    else
      curl -fsSL https://mise.run | MISE_INSTALL_PATH="$HOME/.local/bin/mise" sh
    fi
  fi
fi

# 4. Clonar o actualizar el repo.
if [ -d "$DIR/.git" ]; then
  say "Actualizando $DIR"
  run git -C "$DIR" fetch --tags origin
  run git -C "$DIR" checkout "$REF"
  run git -C "$DIR" pull --ff-only origin "$REF" || true
else
  say "Clonando $REPO en $DIR"
  run git clone "$REPO" "$DIR"
  run git -C "$DIR" checkout "$REF"
fi

# 5. Node fijado en mise.toml.
say "mise install"
if [ "$DRY_RUN" -eq 1 ]; then
  echo "[dry-run] (cd $DIR && mise install)"
else
  (cd "$DIR" && mise trust >/dev/null 2>&1 || true; cd "$DIR" && mise install)
fi

# 6. Enlazar bin/forja en ~/.local/bin.
say "Enlazando forja en ~/.local/bin"
run mkdir -p "$HOME/.local/bin"
run ln -sf "$DIR/bin/forja" "$HOME/.local/bin/forja"
# 7. Claude Code (salvo --no-claude).
if [ "$NO_CLAUDE" -eq 0 ]; then
  if have claude; then
    say "Claude Code: ok"
  else
    say "Instalando Claude Code (instalador nativo oficial)"
    if [ "$DRY_RUN" -eq 1 ]; then
      echo '[dry-run] curl -fsSL https://claude.ai/install.sh | bash'
    else
      curl -fsSL https://claude.ai/install.sh | bash
    fi
  fi
  say "Si aún no has iniciado sesión, ejecuta: claude (y completa el login)"
fi

# 8. forja setup.
if [ "$DRY_RUN" -eq 1 ]; then
  echo "[dry-run] forja setup$([ "$NO_CLAUDE" -eq 1 ] && echo ' --no-claude')"
  say "dry-run completado: no se modificó nada"
  exit 0
fi
if [ "$NO_CLAUDE" -eq 1 ]; then
  exec "$DIR/bin/forja" setup --no-claude
fi
exec "$DIR/bin/forja" setup
