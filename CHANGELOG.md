# Changelog

Formato basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/) y [SemVer](https://semver.org/lang/es/).

## [Unreleased]

### Added
- `containers`: Colima **bajo demanda** y **Docker para agentes** (ADR 0012). La VM solo monta `~/code` (`[containers] mounts`), arranca sola al usar `docker`/`docker-compose`/`floci`/`cdk`/`sam` (hook `PreToolUse` de Claude Code y funciones de `~/.zshrc`) y se apaga tras 15 min sin contenedores (LaunchAgent `dev.forja.colima-idle`, `[containers] idle_minutes`). El sandbox de Claude permite el socket de Colima. `plan` ya no marca la VM apagada como pendiente.
- `containers`: en Apple Silicon, `plan` y `doctor` comprueban Rosetta 2 y `apply` la instala antes de arrancar Colima (y la reinicia si ya corría); sin ella, Colima arranca sin `--vz-rosetta`.

### Fixed
- `~/.claude/CLAUDE.md` solo pide usar `op://` y `op run` si el perfil tiene `[secrets] provider = "1password"`; con `"none"` la regla se queda en no leer ni escribir secretos.
- `settings.json` ya no pierde el tema que guarda `/config`: el perfil admite `[claude] theme` y la plantilla lo escribe solo si está definido.

## [0.2.0] - 2026-11-14

### Added
- `forja capture [módulo] [--yes] [--json]`: paquetes de brew fuera de los Brewfiles (pregunta el módulo y lo añade) y archivos cambiados en el disco (`chezmoi re-add`), con el filtro de rutas sensibles. Las plantillas se señalan para integrarlas a mano.
- `forja wt integrate <rama> [--onto] [--strategy rebase|merge] [--json]`: pone la rama al día (mergiraf y rerere actúan solos), se detiene y lista los conflictos (abre `git mergetool` en TTY) y corre `[checks].integrate`. Nunca hace push.
- `forja wt night --changes a,b`: lanza [openspec-cascade](https://github.com/sastiam/openspec-cascade) en un worktree `agent/night-…` con comprobaciones previas, `sandbox-check`, modo tapa y notificación (ADR 0011).
- Módulo `looper`: openspec-cascade con ref fijado, Bun por mise y `~/.bun/bin` en el PATH.
- `forja awake on|off|status`: no dormir al cerrar la tapa (`pmset disablesleep`) solo mientras corre un loop; corta con batería < 20 % sin cargador y `doctor` avisa si queda huérfano.
- `forja apply <módulo> --revert`: `macos-base` (pmset desde el backup, regla sudo, exclusiones de Time Machine) y `macos-aggressive` (maxfiles).
- `macos-base`: con corriente no duerme y va a alto rendimiento (`powermode 2` si el modelo lo admite); con batería, bajo consumo; regla sudo mínima para `forja awake`; Time Machine excluye `~/.colima` y las carpetas de worktrees.
- `macos-aggressive`: `maxfiles` persistente (LaunchDaemon) y developer mode para la terminal.
- `security`: pre-commit de gitleaks en el clon de forja (no pisa hooks ajenos).
- `setup` abre Claude Code con `forja-onboarding` si no hay perfil; `doctor --fix` abre una sesión con `mac-doctor`.
- `forja self update`: `git pull --ff-only` + `mise install` + versiones nuevas del CHANGELOG.
- Skills completas: `forja-maintain`, `mac-doctor`, `worktree-integrate`, `night-run`, `project-flow`, `forja-onboarding`.
- `forja sandbox-check [--host h]…`: comprobación previa de un loop (git, escritura, firma de agentes y red) con el arreglo sugerido para cada fallo (ADR 0009).
- Firma ssh de agentes: campo `[signing] agent_key` del perfil, `wt new --agent` la activa por worktree y `doctor` comprueba la clave (ADR 0008).
- `doctor`/`drift` (módulo `agents`): `opencode --version` y `hermes --version` deben responder; aviso si `opencode` es la copia del instalador oficial (`~/.opencode/bin`) en vez de la de brew. Los checks de módulo admiten `warn` (se muestran con `!` y no cambian el código de salida de doctor).
- `forja report [-o archivo.md]`: exporta el estado de la máquina (módulos y diagnóstico) a Markdown.

### Changed
- CI activo en `.github/workflows/`: `ci.yml` con un check agregado `ci` para la protección de `main`, `release.yml` y auto-merge de Dependabot para subidas patch/minor. CodeQL sigue inactivo (`docs/pending-workflows/`).
- Dependabot: `@types/node` no sube de major (sigue a `engines`).
- `containers`: Colima es el único runtime (ADR 0007, actualizado). `apply` arranca la VM con un tamaño según la máquina. `doctor` avisa si OrbStack sigue instalado o el contexto no es `colima`. Checks de `aws` y `cdk`.
- `editor`: Zed con `maxTsServerMemory` según la RAM, ESLint fuera, Biome solo con `biome.json`, más exclusiones de escaneo, OpenCode por ACP, tareas y atajos de forja.
- `browsers`: casks con `--adopt` (Chrome y Dia ya instalados a mano); el cask de Dia es `thebrowsercompany-dia`.

### Fixed
- Primer `apply` de un módulo con un tap de terceros (Homebrew 7 exige `brew trust`): `plan` muestra «confiar en el tap …» y `apply` lo hace antes de `brew bundle`, en vez de fallar a mitad (`containers` con `floci-io/floci`).
- `chezmoi apply` de archivos cuya carpeta aún no existe (`~/.aws` en una máquina sin AWS CLI configurado) fallaba con `stat … no such file or directory`; ahora se usa `--parent-dirs` solo en ese caso.
- `apply --yes` sin TTY ya no falla a medias cuando un archivo gestionado se cambió fuera de chezmoi: lo detecta antes de escribir nada, lo lista con qué hacer (`forja capture` o `--force`) y sale con 3. `plan` y `drift` lo señalan. Nueva opción `apply --force`.
- `settings.json` ya no pierde el modelo que guarda `/model`: el perfil admite `[claude] model` y la plantilla lo escribe solo si está definido.
- `runtimes` ejecuta `mise install` tras escribir la config (antes una herramienta nueva, como `bun`, quedaba sin instalar) y `plan` lo marca pendiente con `mise ls --missing`.
- `looper`: el error de falta de `bun` indica `mise install`; `drift` ya no da por pendiente el clonado con el ref correcto, y `doctor` distingue «sin enlazar» (fallo) de «enlazado pero fuera del PATH de esta shell» (aviso: terminal nueva o reiniciar Claude Code).
- `git`: `doctor` avisa si la identidad o la firma (`user.*`, `gpg.*`, `commit.gpgsign`…) están en la config global en vez de en `git.local.gitconfig`, con los comandos para moverlas; `capture` no sube esa config al repo.
- `doctor` ya no muestra «actívalo manualmente» junto a FileVault cuando está activo.
- Test de `wt integrate` aislado de la config global de git de quien lo ejecuta.
- `drift`, `plan` y `report` marcaban como pendientes paquetes instalados: `brew bundle check` se ejecuta ahora con `--no-upgrade`, `HOMEBREW_NO_AUTO_UPDATE=1` y `HOMEBREW_NO_ANALYTICS=1`, sin red (dentro del sandbox no llega a analytics.brew.sh).

## [0.1.0] - 2026-11-14

### Added
- `bootstrap.sh` (POSIX sh, idempotente, `--dry-run`, `--no-claude`, `--dir`, `--ref`).
- CLI `forja` en TypeScript sin build y sin dependencias de runtime: `setup --no-claude`, `plan`, `apply`, `drift`, `doctor` (sin `--fix`), `module`, `backlog`, `version`.
- Subcomandos `forja wt new|ls|rm|prune|init-project`.
- Módulos `core, shell, git, runtimes, containers, editor, terminal, browsers, agents, worktrees, security, macos-base` (y `macos-aggressive` como esqueleto).
- Hosts `macbook` (soportado), `fedora` y `raspi` (planificados).
- Skills `worktree-new` y `worktree-status` completas; el resto en borrador.
- Archivos de comunidad de GitHub, plantillas, Dependabot y workflows de CI, release y CodeQL.
- ADRs de las decisiones iniciales.

[Unreleased]: https://github.com/sastiam/forja/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/sastiam/forja/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/sastiam/forja/releases/tag/v0.1.0
