# Changelog

Formato basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/) y [SemVer](https://semver.org/lang/es/).

## [Unreleased]

### Added
- Host **Fedora** (hito v0.4.0, en curso): `hosts/fedora.toml` pasa a `supported` con `core`, `shell`, `git`, `runtimes` y `agents`. Cada módulo declara sus paquetes en `packages.fedora.txt` (el equivalente al Brewfile); `plan` muestra lo que falta y `apply` instala solo eso con `sudo dnf install -y`. `bootstrap.sh` ya no sale en Linux: instala git con dnf y mise con su instalador oficial en `~/.local/bin`. Los repos de terceros (COPR, docker-ce…) no se añaden solos.
- `module.toml`: comprobaciones por SO (`[checks.darwin]`, `[checks.linux]`); `core` ya no exige `brew` en Linux.
- `runtimes`: en Linux, mise instala `opencode`, `rtk` y `biome` (no están en dnf; en macOS los trae el Brewfile).
- `core` (macOS): el Brewfile instala `chezmoi`, que ningún módulo instalaba y del que dependen `plan` y `apply`.
- Identidad y firma de git por repo (ADR 0014): `[git.identities]` y `[git.repos]` en el perfil; `wt new` y `wt night` la aplican a cualquier worktree sin intervención, y `forja git identity apply|check` cubre los existentes. Los worktrees de agente llevan también el email de la identidad.
- Mods de Claude Code en `plugins/` (marketplace local `forja`, ADR 0012): `token-saver` (Bash por `rtk rewrite`, búsqueda con codebase-memory, banda de contexto y ahorro), `forja-status` (banda de estado y `/forja` con `forja doctor` en un panel), `tdd-guard` (`/tdd`, primero un test) y `quality-guard` (números mágicos tras cada edición y confirmación antes de tocar AWS fuera de Floci). `npm run plugins:check` los valida y prueba con Claude Code.
- `agents`: `settings.json` declara los marketplaces y plugins (los mods, `aws-core` y `codebase-memory`), `apply` instala los que falten y `doctor` avisa de los que no están, de rtk y de uvx. Brewfile con `rtk` y `uv`. Perfil: `[claude] plugins_skip`.
- `agents`: declara los plugins `egm@egm` y `cascade@openspec-cascade` (este desde `main` en GitHub, no desde el repo de desarrollo). Antes, `apply` reescribía `settings.json` desde la plantilla y los desactivaba, y sin EGM no hay revisión de specs.
- Skills `tdd`, `no-magic-numbers` y `well-architected`.
- `containers`: Colima **bajo demanda** y **Docker para agentes** (ADR 0012). La VM solo monta `~/code` (`[containers] mounts`), arranca sola al usar `docker`/`docker-compose`/`floci`/`cdk`/`sam` (hook `PreToolUse` de Claude Code y funciones de `~/.zshrc`) y se apaga tras 15 min sin contenedores (LaunchAgent `dev.forja.colima-idle`, `[containers] idle_minutes`). El sandbox de Claude permite el socket de Colima. `plan` ya no marca la VM apagada como pendiente.
- `containers`: en Apple Silicon, `plan` y `doctor` comprueban Rosetta 2 y `apply` la instala antes de arrancar Colima (y la reinicia si ya corría); sin ella, Colima arranca sin `--vz-rosetta`.

- `wt night` corre el agente **dentro del sandbox de Claude Code** (ADR 0013). Escribe un settings por noche (`~/.local/state/forja/night/`), se lo pasa a openspec-cascade con `--settings` y comprueba el entorno real del agente con una sesión corta de `claude -p` que ejecuta `forja sandbox-check --inside-loop`. `--no-sandbox` lo desactiva de forma explícita.

- `runtimes`: mise instala el CLI de OpenSpec (`npm:@fission-ai/openspec`, fijado a 2.0.0, con `OPENSPEC_TELEMETRY=0` en `[env]`), del que dependen openspec-cascade y su ciclo (`openspec new change`, `archive`). `looper` lo comprueba con `openspec --version`.

- `agents`: instala las skills de OpenSpec (`openspec-propose`, `-apply-change`, `-archive-change`…) en `~/.claude/skills`, generadas con `openspec init` a la versión fijada; Claude Code y OpenCode las leen de ahí. `doctor` avisa si faltan o si su `generatedBy` no coincide con `openspec --version` (arreglo: `forja apply agents`).
- `wt night` ejecuta `openspec-cascade spec-gate check --stage review --changes <lista>` en las comprobaciones previas y aborta, sin crear el worktree, si no sale 0. La skill `night-run` lo documenta.

### Changed
- Lint arreglado: `biome.json` migrado al esquema de Biome 2.6.6 (CI fallaba en `main`).
- Sandbox de Claude Code configurable en sesiones interactivas (ADR 0015): `[claude] sandbox` en el host y en el perfil (perfil > host > activo). En `macbook` queda desactivado; `wt night` lo exige siempre. `forja doctor` avisa si `settings.json` no coincide.
- `editor`: la plantilla de Zed fija el tema Tokyo Night Storm, los iconos Catppuccin Macchiato y el panel de proyecto a la izquierda, para que `forja apply editor` no pise las preferencias personales.
- `editor`: TypeScript y TSX usan tsgo (extensión `tsgo`, servidor `typescript-ls`) en lugar de vtsls, que sigue para JavaScript. La plantilla deja de excluir `typescript-ls` en esos lenguajes y declara `auto_install_extensions` (`html`, `tsgo` y los temas). Probado en un monorepo pnpm sin el bug de watchers.

### Fixed
- `token-saver`: en modo auto ya no reescribe los comandos de Bash con `rtk`. El clasificador revisa en el servidor el comando tal como lo escribió el modelo, y la reescritura invalidaba esa revisión: cada llamada se rechazaba una vez y los subagentes no podían usar git. El modo se lee del `permission_mode` de los eventos clásicos (inicio de sesión, cada prompt y cada herramienta), así que sigue a un cambio con shift+tab.
- `wt night`: el agente corría sin sandbox (openspec-cascade solo carga los ajustes del proyecto) y `sandbox-check` se ejecutaba fuera del sandbox, así que salía en verde aunque dentro fuera a fallar.
- `~/.claude/CLAUDE.md` solo pide usar `op://` y `op run` si el perfil tiene `[secrets] provider = "1password"`; con `"none"` la regla se queda en no leer ni escribir secretos.
- `settings.json` ya no pierde el tema que guarda `/config`: el perfil admite `[claude] theme` y la plantilla lo escribe solo si está definido.
- `editor`: el terminal de Zed mostraba `?` en los iconos de starship (p. ej. Node) por no haber Nerd Font. El Brewfile instala `font-jetbrains-mono-nerd-font` y la plantilla fija `terminal.font_family`.

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
