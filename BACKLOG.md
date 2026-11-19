# Backlog

## Por evaluar
- [x] editor: tsgo en Zed. Probado en un monorepo pnpm con la extensión `tsgo` (servidor `typescript-ls`): 0,0–0,1 % de CPU en reposo y unos 814 MiB, sin rastro del bug de watchers con symlinks. Activado para TypeScript y TSX; falta medir la línea base de vtsls y la CPU al editar.
- [x] containers: benchmark Colima vs OrbStack descartado; OrbStack fuera (actualización de ADR 0007).
- [x] agents: confirmar si OpenCode lee ~/.claude/skills para no duplicar enlaces. Sí: lo lee (docs de OpenCode, «Global compatibility»).
- [ ] agents: evaluar servidores MCP HTTP compartidos para no multiplicar procesos stdio por sesión.
- [ ] git: evaluar si Fork reemplaza a Sublime Merge (falta verificar si muestra la base en conflictos).
- [x] macos: compatibilidad con macOS 27. Zed 1.28.1 y Claude Code 2.1.325 funcionan en 27.2.1; OrbStack declara soporte desde v2.2.2 (ago-2026) con arreglos posteriores, pendiente de probar al instalarlo.
- [ ] containers: revisar madurez de Floci. Última release vista: 1.5.32, cadencia quincenal. Falta fijar versión en el Brewfile y probar compat-cdk con los stacks reales.
- [ ] agents: medir el ahorro real de rtk y codebase-memory tras dos semanas (`rtk gain`, `/cost`, `/context`) y decidir si se quedan.
- [ ] agents: comprobar en el Mac que `rtk` escribe su historial dentro del sandbox (`allowWrite`) y que los permisos no piden confirmación por la reescritura `rtk …`.
- [ ] agents: valorar `--config` en `claude plugin install` para fijar las opciones de los mods desde el perfil.

## Hosts
- [x] fedora: módulos core/shell/git/runtimes/agents con dnf (en la rama feat/linux-fedora-host).
- [x] fedora: `containers` con Docker nativo, `awake` con systemd-inhibit y sandbox de Claude con bubblewrap (ADR 0016).
- [ ] fedora: Floci no tiene binario instalable (solo tap de Homebrew); `doctor` no lo exige en Linux.
- [ ] fedora: Docker/Podman *rootless* para que los agentes usen contenedores sin dar root (plan B del ADR 0016).
- [x] fedora: `looper` en el host y cascade v2 (fase 3).
- [ ] cascade: su devDependency `@fission-ai/openspec` está en ^1.17 y `openspec-cascade doctor` usa ese binario local, no el global 2.x; valorar subirla a 2.1 en el repo de cascade.
- [ ] ci: las acciones de `ci.yml` (`actions/*`, `gitleaks/gitleaks-action`) van por etiqueta (`@v4`), no por SHA completo; fijarlas por SHA como pide la línea base de seguridad.
- [x] fedora: `terminal`, `editor` y `browsers` (fase 4, ADR 0017).
- [ ] fedora: `mergiraf` y `1password-cli` no están en dnf ni en mise. mergiraf se podría instalar con `cargo:mergiraf` de mise (compila desde fuente: necesita gcc) o con el binario de Codeberg fijado por SHA-256.
- [ ] fedora: `dnf` + `rpm --import` de claves GPG de los repos de terceros: hoy se confía en que `dnf -y` importe la clave del repo al instalar.
- [ ] fedora: job de CI con contenedor `fedora` que ejecute `forja plan --json`.
- [ ] raspi: perfil mínimo arm64.

- [ ] zed: sin capa personal (Zed no admite includes en `settings.json`); valorar un merge con `modify_` y jq si el archivo es JSON puro, o `create_` (no pisar) solo en Linux.
- [ ] agents: valorar la misma capa personal para `~/.config/opencode/opencode.json`.

## Ideas
- [x] `forja report`: exportar el estado de la máquina a Markdown para el vault de Obsidian (hecho en Unreleased).
- [ ] Rust: módulo opcional con sccache (CARGO_INCREMENTAL=0) si el uso deja de ser ocasional.

## Inbox
- [ ] 2026-11-16 editor: tras instalar la Nerd Font (cask font-jetbrains-mono-nerd-font), macOS no la registra y Zed no la lista (Font Book tampoco la ve), así que el terminal de Zed muestra `?` en los iconos de starship. Confirmado: limpiar la base de datos y la caché de fuentes de macOS lo arregla. Quitar la cuarentena de los .ttf y volver a añadirlos desde Font Book no bastó. Falta anotar el comando exacto que se usó (evaluar atsutil databases -remove, reinicio de fontd o cierre de sesión), automatizarlo en apply del módulo editor tras instalar el cask, o avisarlo en doctor.
