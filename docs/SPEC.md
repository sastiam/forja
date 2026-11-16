# forja — Especificación del repositorio

> Provisionamiento y optimización de estaciones de desarrollo con un solo comando, asistido por Claude Code.
> Primer host: MacBook Pro M4 Pro 48 GB (macOS Tahoe 26.x). Futuro: Lenovo (Fedora) y Raspberry Pi 4.

- **Versión de la especificación:** 1.0 (14 de noviembre de 2026)
- **Destino:** guardar este archivo como `docs/SPEC.md` en el repo vacío `forja` y pedirle a Claude Code en web que lo implemente (ver Parte 3).
- **Base técnica:** decisiones del informe de investigación verificado del 14 de noviembre de 2026 (OrbStack + Floci, mise, Zed + vtsls, Ghostty, Sublime Merge + mergiraf, Claude Code con sandbox, etc.). Este documento no repite toda la investigación; resume lo que se eligió y por qué.

---

## Índice

- **Parte 1 — Qué es forja y por qué está diseñado así** (explicación sencilla)
- **Parte 2 — Plan detallado** (arquitectura, CLI, módulos, skills, worktrees, estándares de GitHub, pruebas, hitos)
- **Parte 3 — Prompt para Claude Code en web**
- **Apéndice A — Configuraciones de referencia**
- **Apéndice B — Backlog inicial**

---

# PARTE 1 — Qué es forja y por qué está diseñado así

## 1.1 La idea en una frase

Formateas la Mac, ejecutas un comando y, en una conversación corta con Claude Code, la máquina queda instalada, configurada y optimizada. Desde ese día, el mismo repo te sirve para mantenerla, detectar cambios y mejorarla poco a poco.

## 1.2 Los cinco principios

| # | Principio | Qué significa | Por qué |
|---|---|---|---|
| 1 | **Repo agnóstico** | El repo es público y no contiene nada tuyo: ni emails, ni cuentas de AWS, ni nombres de empresa, ni reglas de trabajo. | Así cualquiera puede usarlo (y tú puedes mostrarlo) sin filtrar nada. Lo personal vive en tu máquina, no en GitHub. |
| 2 | **Perfil local generado por Claude** | La primera vez, Claude Code te entrevista y escribe tu perfil en `~/.config/forja/`. Ahí quedan tus datos y las reglas que Claude considere para tu perfil (trabajo/personal). | Cumple tu pedido: "el repo no debe conocer; Claude toma las reglas que considere necesarias para el perfil". |
| 3 | **Híbrido: script determinista + IA** | La instalación la hace código predecible. Claude entra para entrevistarte, verificar y diagnosticar errores. | Si la IA instalara todo, cada ejecución podría ser distinta. Con un script, el resultado se puede repetir; con Claude, los errores se resuelven rápido. |
| 4 | **Módulos + hosts** | Cada pieza (git, shell, agentes, contenedores…) es un módulo independiente. Cada máquina (host) elige qué módulos aplica. | Hoy la Mac; mañana el Lenovo y la Raspberry reutilizan los mismos módulos sin duplicar nada. |
| 5 | **Una herramienta por función** | No hay "alternativas" instaladas en paralelo. Cada decisión queda documentada (ADR) con su plan B. | Menos procesos, menos RAM, menos cosas que mantener. |

## 1.3 Cómo se ve usarlo

**Primera vez (Mac recién formateada):**

```sh
curl -fsSL https://raw.githubusercontent.com/<usuario>/forja/main/bootstrap.sh | sh
```

1. El bootstrap instala lo mínimo: herramientas de línea de comandos de Xcode, Homebrew, mise, Node 26, Claude Code y la CLI `forja`.
2. Se abre `forja setup`: Claude Code te hace preguntas (qué máquina es, perfil trabajo/personal, identidad de git, qué módulos quieres) y guarda tu perfil local.
3. `forja plan` te muestra todo lo que va a cambiar. Confirmas.
4. `forja apply` instala y configura módulo por módulo.
5. `forja doctor` verifica. Si algo falla, Claude lee el log y te propone la solución.

**Día a día:**

| Quiero… | Comando |
|---|---|
| Ver qué cambiaría sin tocar nada | `forja plan` |
| Aplicar solo un módulo | `forja apply git` |
| Saber si la Mac se desvió del repo | `forja drift` |
| Guardar en el repo algo que cambié a mano | `forja capture` |
| Diagnosticar la Mac (memoria, disco, procesos) | `forja doctor` |
| Crear un worktree listo para trabajar | `forja wt new feat/login` |
| Ver todos los worktrees y quién los usa | `forja wt ls` |
| Integrar una rama y resolver conflictos | `forja wt integrate feat/login` |
| Dejar un agente trabajando de noche | `forja wt night feat/refactor --prompt tarea.md` |
| Anotar una mejora para después | `forja backlog add "probar tsgo cuando arreglen pnpm"` |

Las mismas acciones existen como **skills** para Claude Code y OpenCode: puedes pedirle al agente "créame un worktree para el ticket X" y él llama a `forja wt new`.

## 1.4 Por qué cada decisión de diseño

**¿Por qué una CLI propia en vez de solo scripts?**
Necesitas cuatro cosas que los scripts sueltos hacen mal: aplicar por módulos, detectar desvíos, capturar cambios y probar con tests. Una CLI pequeña las coordina. Pero **no reinventa nada**: delega en herramientas probadas.

**¿Por qué TypeScript y no Bash, Rust o Go?**
- Es tu stack principal: lo lees, lo depuras y lo mejoras sin cambiar de contexto.
- Node 26 ejecuta TypeScript directamente (eliminación de tipos nativa), así que no hay paso de compilación.
- Se prueba fácil con el test runner integrado de Node.
- Bash se vuelve frágil cuando crece; Rust y Go son más lentos de iterar para ti.
- El único Bash es `bootstrap.sh`, corto, porque en una Mac limpia todavía no hay Node.

**¿Por qué chezmoi para los archivos de configuración?**
Ya resuelve tres de tus cuatro pedidos de iteración: `chezmoi diff` (desvíos), `chezmoi re-add` (capturar cambios) y aplicar rutas concretas (por módulo). Además, sus datos personales viven en `~/.config/chezmoi/chezmoi.toml`, **fuera del repo**, que es justo lo que pide el principio 1. Funciona igual en macOS, Fedora y Raspberry Pi.

**¿Por qué Brewfile por módulo?**
`brew bundle check` detecta paquetes que faltan y `brew bundle dump` permite capturar lo que instalaste a mano. Cada módulo trae su propio Brewfile, así que aplicar `forja apply git` solo instala lo de git.

**¿Por qué mise?**
Una sola herramienta fija las versiones de Node, pnpm, Python (vía uv) y Rust por proyecto, y funciona en las tres máquinas.

**¿Por qué las skills solo llaman a la CLI?**
Si la lógica de worktrees viviera dentro de una skill, solo funcionaría a través de un agente y cada agente podría interpretarla distinto. Con la lógica en `forja wt`:
- Tú la usas a mano.
- Claude Code y OpenCode la usan igual.
- Los hooks de Claude Code (`WorktreeCreate`/`WorktreeRemove`) también llaman a `forja wt`, así que todos los caminos crean worktrees idénticos.

**¿Por qué una sola carpeta de skills enlazada a ambos agentes?**
Escribes cada skill una vez. forja crea enlaces simbólicos a las carpetas de skills de Claude Code y de OpenCode. Si mejoras una skill en el repo, ambos agentes la ven al instante.

**¿Por qué el perfil de trabajo no está en el repo?**
Porque el repo es público. Durante el onboarding, Claude genera en tu máquina archivos como `~/.config/forja/local/CLAUDE.local.md` (reglas para trabajar en repos de la empresa) y los configs públicos solo *importan* esos archivos locales si existen.

## 1.5 Stack que instala forja en la Mac (resumen de la investigación)

| Función | Herramienta | Por qué (una línea) | Plan B |
|---|---|---|---|
| Paquetes | Homebrew + Brewfile por módulo | Estándar en macOS, permite check/dump | — |
| Archivos de config | chezmoi | Desvíos, captura y plantillas multi-OS | Symlinks propios |
| Runtimes | mise (Node 26 LTS / 24, pnpm, uv, Rust) | Una herramienta, versión por proyecto | fnm (solo Node) |
| Contenedores | OrbStack (licencia Pro si es uso comercial) | Mejor I/O de bind mounts y menor RAM en reposo | Colima |
| AWS local | Floci + AWS CLI + CDK | MIT, sin cuenta; Lambda necesita socket Docker → OrbStack | LocalStack de pago |
| Editor | Zed + tsgo (TS/TSX) + vtsls (JS) + Biome | vtsls en todo: tsgo tenía un bug con symlinks de pnpm que no se reprodujo en la prueba | — |
| Terminal | Ghostty | ~28 MB en reposo, notificaciones, sin telemetría | iTerm2 |
| Conflictos | mergiraf (automático) + Zed (triviales) + Sublime Merge (3 paneles) | Lo más parecido a GitKraken verificado | Fork |
| Worktrees | `git worktree` + `forja wt` + `claude --worktree` | Lógica única para humano y agentes | — |
| Agentes | Claude Code (sandbox), OpenCode (API key), Hermes (instalador oficial) | Sandbox Seatbelt nativo; OpenCode sin suscripción por términos de Anthropic | — |
| Secretos | 1Password CLI (`op run`, `op://`) | Cero `.env` reales en worktrees de agentes | — |
| Seguridad del repo | gitleaks (pre-commit + CI) | El repo es público | — |
| Navegadores | Dia + Chrome | Roles separados | — |

---

# PARTE 2 — Plan detallado

## 2.1 Árbol del repositorio

```
forja/
├── bootstrap.sh                     # único punto de entrada en máquina limpia (POSIX sh)
├── mise.toml                        # fija la versión de Node con la que corre la CLI
├── package.json                     # "type": "module", sin dependencias de runtime si es posible
├── tsconfig.json                    # solo para chequeo de tipos (noEmit, erasableSyntaxOnly)
├── bin/
│   └── forja                        # shim sh: exec node "$FORJA_HOME/cli/src/main.ts" "$@"
├── cli/
│   ├── src/
│   │   ├── main.ts                  # parseo de argumentos (node:util parseArgs) y despacho
│   │   ├── commands/                # setup, plan, apply, drift, capture, doctor, module, wt, backlog, self
│   │   ├── core/
│   │   │   ├── modules.ts           # carga module.toml, resuelve dependencias (orden topológico)
│   │   │   ├── hosts.ts             # carga hosts/*.toml y el perfil local
│   │   │   ├── profile.ts           # lee/valida ~/.config/forja/profile.toml
│   │   │   ├── runners/             # brew.ts, chezmoi.ts, mise.ts, shell.ts (con dry-run)
│   │   │   ├── plan.ts              # calcula acciones por módulo sin ejecutarlas
│   │   │   ├── state.ts             # ~/.local/state/forja (logs, último apply, worktrees.json)
│   │   │   ├── claude.ts            # invoca `claude -p` para diagnóstico con logs
│   │   │   └── log.ts
│   │   └── wt/                      # new, ls, rm, prune, integrate, night, ports, env
│   └── test/                        # node:test; fixtures de repos git temporales
├── modules/
│   ├── core/            # Xcode CLT, Homebrew, coreutils, jq, gh, 1password-cli
│   ├── shell/           # zsh, starship, zoxide, fzf, eza, bat, ripgrep, fd, btop
│   ├── git/             # git, delta, lazygit, mergiraf, sublime-merge, config global
│   ├── runtimes/        # mise config global: node, pnpm, uv, python, rust
│   ├── containers/      # OrbStack + Floci + awscli + aws-cdk + ~/.aws/config (plantilla)
│   ├── editor/          # Zed + settings/keymap
│   ├── terminal/        # Ghostty + config
│   ├── browsers/        # Chrome + Dia (sin flags no documentados)
│   ├── agents/          # Claude Code, OpenCode, Hermes, enlaces de skills, settings, hooks
│   ├── worktrees/       # integración wt con zsh (completions), hooks de Claude, templates de proyecto
│   ├── security/        # gitleaks, firewall, FileVault check
│   ├── macos-base/      # capa conservadora y reversible
│   └── macos-aggressive/# capa opcional, exige confirmación escrita
├── home/                            # ÚNICO source dir de chezmoi (chezmoi no admite varios)
│   ├── .chezmoiignore.tmpl          # ignora rutas de módulos no habilitados en el host
│   ├── dot_zshrc.tmpl
│   ├── private_dot_config/...
│   └── private_dot_claude/...
├── hosts/
│   ├── macbook.toml                 # host de referencia (genérico, sin datos personales)
│   ├── fedora.toml                  # stub, status = "planned"
│   └── raspi.toml                   # stub, status = "planned"
├── skills/                          # fuente única de skills (formato SKILL.md)
│   ├── forja-onboarding/
│   ├── forja-maintain/
│   ├── mac-doctor/
│   ├── worktree-new/
│   ├── worktree-status/
│   ├── worktree-integrate/
│   ├── night-run/
│   └── project-flow/
├── templates/
│   └── project/                     # para copiar a un proyecto: .forja/project.toml, .worktreeinclude,
│                                    # .env.tpl de ejemplo, mise.toml, compose.floci.yml, .zed/settings.json
├── docs/
│   ├── SPEC.md                      # este documento
│   ├── guide/                       # guía para humanos: explicación + porqué por módulo
│   ├── adr/                         # 0001-chezmoi.md, 0002-typescript-cli.md, ...
│   └── modules.md                   # tabla generada: módulo → qué instala → cómo revertir
├── BACKLOG.md
├── CHANGELOG.md
├── README.md
├── LICENSE
├── CODE_OF_CONDUCT.md
├── CONTRIBUTING.md
├── SECURITY.md
├── SUPPORT.md
├── .github/                         # ver 2.10
├── .editorconfig
├── .gitattributes
├── .gitignore
└── .gitleaks.toml
```

> **Nota sobre chezmoi:** chezmoi solo admite **un** directorio fuente. Por eso los archivos de configuración viven en `home/`, y cada `module.toml` declara qué rutas destino le pertenecen (`targets`). `forja apply git` ejecuta `chezmoi apply <targets de git>`. El archivo `.chezmoiignore.tmpl` excluye las rutas de los módulos no habilitados, usando los datos del perfil.

## 2.2 Perfil local (lo que el repo no conoce)

Todo vive en la máquina y nunca se sube:

```
~/.config/forja/
├── profile.toml          # generado por la skill forja-onboarding
└── local/
    ├── CLAUDE.local.md   # reglas que Claude decidió para tu perfil (p. ej. trabajo)
    ├── opencode.local.md
    ├── git.local.gitconfig   # identidad, includeIf por carpeta (trabajo/personal)
    └── aws.local.config      # perfiles SSO reales
~/.config/chezmoi/chezmoi.toml  # [data] derivado de profile.toml (lo escribe forja)
~/.local/state/forja/           # logs, último plan/apply, worktrees.json, lock
```

`profile.toml` (esquema; validar con un tipo TS):

```toml
schema = 1
host = "macbook"                     # archivo de hosts/ que aplica
modules_extra = []                   # módulos añadidos sobre el host
modules_skip = ["macos-aggressive"]  # módulos excluidos

[identity]
name = "…"
email = "…"                          # nunca en el repo

[profiles.work]
enabled = true
code_dir = "~/code/work"             # git includeIf gitdir:~/code/work/
claude_rules = "local/CLAUDE.local.md"
aws_config = "local/aws.local.config"

[profiles.personal]
code_dir = "~/code/personal"

[notify]
ntfy_topic_file = "~/.config/ntfy/topic"   # el tópico tampoco va al repo

[secrets]
provider = "1password"               # o "none"
```

**Cómo los configs públicos usan lo local sin conocerlo:**

| Config público (en el repo) | Engancha lo local con |
|---|---|
| `~/.claude/CLAUDE.md` | Línea de importación `@~/.config/forja/local/CLAUDE.local.md` (Claude Code soporta imports con `@ruta`; si el archivo no existe se ignora — **VERIFICAR** el comportamiento ante archivo faltante) |
| `~/.config/git/config` | `[include] path = ~/.config/forja/local/git.local.gitconfig` (git ignora includes inexistentes) |
| `~/.aws/config` | Plantilla chezmoi que concatena el perfil `floci` público + `aws.local.config` si existe |
| `.zshrc` | `[[ -r ~/.config/forja/local/zshrc.local ]] && source …` |

## 2.3 Bootstrap (`bootstrap.sh`)

Requisitos:
- POSIX `sh`, `set -eu`, comprobado con shellcheck. Idempotente: se puede volver a ejecutar sin romper nada.
- Flags: `--dry-run`, `--no-claude` (camino 100 % determinista), `--dir <ruta>` (por defecto `~/.local/share/forja`), `--ref <tag|rama>`.
- Verifica: Apple silicon (`uname -m` = `arm64`) y macOS ≥ 26. En Linux, imprime "host planificado, aún no soportado" y sale con código 0 (hasta el hito de Linux).

Pasos:
1. `xcode-select --install` si falta (espera a que termine; es interactivo).
2. Instala Homebrew si falta y ejecuta `eval "$(/opt/homebrew/bin/brew shellenv)"`.
3. `brew install git mise`.
4. Clona el repo en `--dir` (o `git pull --ff-only` si ya existe) y hace checkout de `--ref`.
5. `mise install` dentro del repo (Node fijado en `mise.toml`).
6. Enlaza `bin/forja` → `~/.local/bin/forja` y asegura `~/.local/bin` en el PATH de la sesión.
7. Salvo con `--no-claude`: instala Claude Code con el instalador oficial nativo y pide `claude` login si no hay sesión.
8. Ejecuta `forja setup` (o `forja setup --no-claude`).

## 2.4 CLI `forja`

**Reglas técnicas:**
- Node 26 ejecuta `.ts` directamente. Usa solo sintaxis "borrable": sin `enum`, sin `namespace` con valores, sin parameter properties. Activa `erasableSyntaxOnly` en `tsconfig.json`.
- **Cero dependencias de runtime** como objetivo. Usa `node:util` (`parseArgs`, `styleText`), `node:child_process`, `node:fs/promises` y `node:test`.
- Para TOML necesitas un parser. Opciones:
  - Una dependencia pequeña y fijada (`smol-toml`).
  - Si Node trae soporte TOML nativo en ese momento, úsalo. **VERIFICAR.**
- Toda acción con efectos pasa por un `Runner` que soporta `dryRun`. `plan` usa los mismos runners en modo `dryRun`.
- Salida legible por humanos por defecto, y `--json` en `plan`, `drift`, `doctor` y `wt ls` (para skills y CI).
- Códigos de salida: `0` ok · `1` error · `2` desvío detectado (drift) · `3` requiere confirmación.

**Comandos:**

| Comando | Comportamiento |
|---|---|
| `forja setup [--no-claude]` | Si no existe el perfil: lanza Claude Code con la skill `forja-onboarding` (o un cuestionario en TTY con `--no-claude`). Luego ejecuta `plan`, pide confirmación, `apply` y `doctor`. |
| `forja plan [módulo…] [--json]` | Lista por módulo las acciones previstas: paquetes que faltan, archivos que cambiarían (`chezmoi diff`), comandos de configuración. No modifica nada. |
| `forja apply [módulo…] [--yes] [--dry-run] [--force]` | Resuelve dependencias, ejecuta los módulos en orden y registra en `state`. Cada módulo es idempotente. Antes de escribir nada lista los archivos cambiados fuera de chezmoi: sin TTY se detiene (código 3) salvo con `--force`, que los sobrescribe. `macos-aggressive` exige `--i-understand-the-risks` además de estar habilitado. |
| `forja drift [--json]` | `brew bundle check` por módulo + `chezmoi verify`/`diff` + checks de módulo. Sale con `2` si hay desvío. |
| `forja capture [módulo]` | Detecta fórmulas y casks instalados que no están en ningún Brewfile y propone a qué módulo añadirlos. Ejecuta `chezmoi re-add` en archivos modificados. Muestra el diff y pide confirmación antes de escribir en el repo. Nunca captura nada que coincida con `.gitleaks.toml`. |
| `forja doctor [--fix]` | Checks de módulos + salud de la Mac: presión de memoria (`memory_pressure`), disco (`df -h /System/Volumes/Data`), procesos colgados, tamaño de cachés (pnpm store, `~/Library/Caches`, OrbStack), worktrees huérfanos. Con `--fix`: envía el reporte a `claude -p` con la skill `mac-doctor` y aplica correcciones solo tras confirmación. |
| `forja module ls / info <m>` | Muestra módulos, estado, dependencias y cómo revertir. |
| `forja wt …` | Ver 2.6. |
| `forja backlog add "<texto>" [--module m]` / `backlog ls` | Añade o lista entradas en `BACKLOG.md` con fecha y módulo. |
| `forja self update` | `git pull --ff-only` del repo + `mise install` + muestra el `CHANGELOG` entre versiones. |
| `forja version` | Versión de forja, commit, Node y host. |

## 2.5 Módulos

Cada módulo es una carpeta `modules/<nombre>/` con:

```
modules/git/
├── module.toml
├── Brewfile              # solo darwin (opcional)
├── packages.fedora.txt   # futuro (opcional)
├── apply.ts              # pasos extra idempotentes (opcional), exporta apply(ctx), plan(ctx), check(ctx)
├── revert.md             # cómo deshacerlo a mano
└── README.md             # qué hace y por qué (alimenta docs/guide)
```

`module.toml`:

```toml
name = "git"
summary = "Git moderno, conflictos con mergiraf + Sublime Merge, rerere, zdiff3"
os = ["darwin", "linux"]
depends = ["core"]
targets = ["~/.config/git", "~/.config/lazygit"]   # rutas chezmoi que posee
risk = "low"                                         # low | medium | high
requires_sudo = false
optional = false

[checks]
commands = ["git --version", "mergiraf --version", "smerge --version"]
```

**Módulos de `hosts/macbook.toml`:** `core, shell, git, runtimes, containers, editor, terminal, browsers, agents, worktrees, security, macos-base`. El módulo `macos-aggressive` existe pero no se incluye por defecto.

**Contenido por módulo** (los valores exactos están en el Apéndice A):

- **core:** CLT, Homebrew, `coreutils jq gh 1password-cli`.
- **shell:** `.zshrc` con mise, starship, zoxide y fzf; aliases; carga de `wt` completions; enganche a `zshrc.local`.
- **git:** config global (zdiff3, rerere, histogram, fsmonitor, delta), driver de mergiraf, `smerge` como mergetool, `git maintenance start` en los repos registrados, `includeIf` del perfil local.
- **runtimes:** `~/.config/mise/config.toml` global (node 26, pnpm, uv, python 3.13, rust stable), `idiomatic_version_file_enable_tools = ["node"]`. Rust **sin** `target-dir` compartido y sin sccache por defecto.
- **containers:** OrbStack (avisar sobre la licencia Pro para uso comercial), Floci (`brew install floci-io/floci/floci`), awscli, aws-cdk, perfil `floci` público en `~/.aws/config`. Check: `docker context show` = `orbstack` y `floci doctor`.
- **editor:** Zed con tsgo para TypeScript y TSX y vtsls para JavaScript, Biome, `maxTsServerMemory` (solo vtsls) y `file_scan_exclusions`.
- **terminal:** Ghostty, notificaciones al terminar comandos largos y `shell-integration = zsh`.
- **browsers:** casks de Chrome y Dia. Solo instala; no aplica flags no documentados.
- **agents:**
  - Claude Code: instalador nativo, `~/.claude/settings.json` con sandbox obligatorio, `deny` de secretos, hooks y statusline.
  - OpenCode: brew, `opencode.json` con permisos restrictivos y autenticación por API key, **nunca** suscripción.
  - Hermes: instalador oficial descargado, mostrado al usuario y luego ejecutado. **No** activa el gateway.
  - Enlaces de `skills/` (ver 2.7).
- **worktrees:** registra los hooks `WorktreeCreate`/`WorktreeRemove` de Claude Code que llaman a `forja wt`, y copia `templates/project` al pedirlo (`forja wt init-project`).
- **security:** gitleaks, firewall de aplicaciones activado y check de FileVault (solo avisa; no lo activa solo).
- **macos-base:** límite de carga al 80 % (es manual en Ajustes: el módulo lo **comprueba y guía**), exclusión de `~/code` en Spotlight (guía), `tmutil addexclusion` para `node_modules`, Touch ID para sudo (`sudo_local`), `pmset -c sleep 0 displaysleep 15` previo backup (`pmset -g custom`), y Reducir transparencia (guía).
- **macos-aggressive:** `spctl developer-mode enable-terminal`, `launchctl limit maxfiles`, `pmset -a disablesleep 1`. Cada paso con su reversión en `forja apply macos-aggressive --revert`.

## 2.6 Worktrees (`forja wt`)

**Convenciones:**
- Worktrees **fuera** del repo, como hermanos: `~/code/<area>/<repo>.wt/<slug>`. Así se evita que `pnpm install` dentro del worktree suba hasta el `pnpm-workspace.yaml` del padre.
- Ramas de agentes con prefijo `agent/<nombre>`; ramas manuales con el nombre que tú elijas.
- Metadatos en `~/.local/state/forja/worktrees.json`: `path, repo, branch, base, owner (human|claude|opencode|hermes|night), created_at, port`.

**Configuración opcional por proyecto:** `.forja/project.toml` dentro de cada proyecto. Es agnóstica: forja no asume nada si no existe.

```toml
[worktree]
copy = [".env.tpl"]                 # además de lo que diga .worktreeinclude
setup = ["pnpm install --frozen-lockfile --prefer-offline"]
teardown = []
port_base = 3000                    # puerto = port_base + hash(slug) % 100

[checks]
integrate = ["pnpm -s typecheck", "pnpm -s test"]

[floci]
enabled = true                      # exporta AWS_PROFILE=floci en .env.worktree
```

**Subcomandos:**

| Subcomando | Qué hace |
|---|---|
| `wt new <rama> [--base origin/main] [--agent claude\|opencode\|hermes] [--print-path] [--open]` | `git fetch` → `git worktree add` → copia `.worktreeinclude` + `copy` → escribe `.env.worktree` (`WT_NAME`, `WT_PORT`, `COMPOSE_PROJECT_NAME`, `AWS_PROFILE` si Floci) → ejecuta `setup` → registra en state → `--open` abre Zed. Con `--print-path` imprime **solo** la ruta en stdout y todo lo demás en stderr (lo exige el hook `WorktreeCreate` de Claude Code). |
| `wt ls [--json]` | Tabla: rama, owner, ahead/behind, sucio sí/no, último commit, puerto, edad, PR (si `gh` está disponible). |
| `wt rm <rama\|ruta> [--force]` | Rechaza si hay cambios sin commit o sin push (salvo `--force`). Corre `teardown` → `git worktree remove` → `prune` → limpia state. |
| `wt prune [--merged] [--older-than 14d] [--dry-run]` | Limpia worktrees fusionados o viejos y entradas huérfanas en state. |
| `wt integrate <rama> [--onto main] [--strategy rebase\|merge]` | `fetch` → rebase o merge con mergiraf y rerere activos → si quedan conflictos, abre `smerge mergetool` y espera → corre `[checks].integrate` → reporta. Nunca hace push. |
| `wt night --changes a,b [--engine claude\|opencode\|antigravity] [--branch b] [--full-gate] [--allow-battery] [--host h]… [--no-sandbox] [--dry-run]` | **(ADR 0011, 0013)** Comprobaciones: openspec-cascade instalado (módulo `looper`), changes existentes en `openspec/changes/`, corriente conectada. Crea o reutiliza el worktree `agent/night-…` con firma de agente, escribe el settings de sandbox de la noche, comprueba el arnés y, con `claude -p`, el agente dentro del sandbox (`sandbox-check --inside-loop`), y lanza openspec-cascade con `--settings` con el modo tapa activo (`forja awake`), que se quita al terminar, con señales o con batería < 20 % sin cargador. Logs en `~/.local/state/forja/logs/night/`. Notifica por ntfy. Nunca hace push. |
| `wt init-project` | Copia `templates/project` al repo actual sin sobrescribir archivos existentes. |

**Puertos:** `port_base + (cksum(slug) % 100)`. Es determinista: el mismo worktree siempre recibe el mismo puerto. Debe tener test unitario.

**Secretos:** nunca copia `.env`. Si existe `.env.tpl` (con referencias `op://`), las skills y la documentación indican correr `op run --env-file=.env.tpl -- pnpm dev`.

## 2.7 Skills (fuente única)

- Formato: `skills/<nombre>/SKILL.md` con frontmatter `name` y `description`, más archivos de apoyo si hacen falta.
- Distribución: el módulo `agents` crea **enlaces simbólicos** de cada carpeta hacia `~/.claude/skills/<nombre>` y hacia la carpeta global de skills de OpenCode.
  - **VERIFICAR** en la documentación de OpenCode la ruta exacta (p. ej. `~/.config/opencode/skills/`) y si OpenCode también lee `~/.claude/skills`. En ese caso, **no** enlazar dos veces para evitar duplicados.
- Regla: las skills **no contienen lógica**. Explican cuándo usar cada comando de `forja`, cómo interpretar su salida `--json` y qué preguntar al usuario.

| Skill | Cuándo se activa | Qué hace |
|---|---|---|
| `forja-onboarding` | `forja setup` sin perfil | Entrevista: host, perfiles trabajo/personal, identidad, carpetas de código, AWS SSO, módulos opcionales, notificaciones. Escribe `profile.toml` y los archivos de `local/`. Redacta `CLAUDE.local.md` con reglas según el perfil (p. ej. "en `~/code/work` nunca hacer push a main"). No escribe secretos: usa referencias `op://`. |
| `forja-maintain` | "añade X a mi setup", "qué cambió", "captura esto" | Usa `drift`, `capture`, `module info` y `backlog add`. Para añadir una herramienta: elige módulo → edita el Brewfile/config → `plan` → `apply <módulo>` → propone commit con Conventional Commits. |
| `mac-doctor` | "la Mac va lenta", `forja doctor --fix` | Interpreta `doctor --json`, prioriza por impacto y propone acciones reversibles. Nunca borra sin confirmar. |
| `worktree-new` | "créame un worktree para…" | `forja wt new … --agent <yo>` y reporta ruta, puerto y cómo arrancar con `op run`. |
| `worktree-status` | "qué worktrees tengo", "limpia" | `wt ls --json` → resumen → `wt prune --dry-run` → confirma → `wt prune`. |
| `worktree-integrate` | "integra la rama…", conflictos | `wt integrate`; explica los conflictos que mergiraf no resolvió; sugiere abrir Sublime Merge. |
| `night-run` | "déjalo trabajando esta noche" | Ayuda a escribir el archivo de prompt (objetivo, criterios de terminado, `.agent-done`), corre los checks y lanza `wt night`. |
| `project-flow` | Floci / CDK / tests / PR | `floci start --persist`, `cdk synth`/`deploy` contra Floci (cuenta `000000000000`), tests y PR con `gh` y Conventional Commits. |
| `tdd` | implementar o corregir con tests, bloqueo de `tdd-guard` | Ciclo rojo-verde-refactor con los runners del stack; bug = test de reproducción primero. |
| `no-magic-numbers` | timeouts, límites, umbrales; avisos de `quality-guard` | Constantes con nombre y unidad, excepciones y la regla de linter de cada lenguaje. |
| `well-architected` | diseñar o revisar infraestructura AWS | Checklist de los 6 pilares aterrizado a CDK y Floci; la revisión formal la hace `aws-well-architected-review` (plugin `aws-core`). |

**Mods y plugins (ADR 0012):** `plugins/` es un marketplace local con los mods `token-saver`, `forja-status`, `tdd-guard` y `quality-guard`. `settings.json` declara ese marketplace, `agent-toolkit-for-aws` (`aws-core`) y `codebase-memory`; `forja apply agents` instala lo que falte. Lista y fuentes en `cli/src/core/claude-plugins.ts`; `[claude] plugins_skip` en el perfil quita alguno.

## 2.8 Claude Code en el flujo (modo híbrido)

| Momento | Rol de Claude | Límite |
|---|---|---|
| `setup` | Entrevista y escribe el perfil local | No ejecuta `apply`; eso lo hace el script tras tu confirmación |
| `doctor --fix` | Diagnostica con logs y propone correcciones | Cada corrección se confirma; nunca usa `sudo` sin que lo veas |
| Uso diario | Skills que llaman a `forja` | Sandbox activo y `deny` de secretos (ver Apéndice A) |
| Mantenimiento del repo | `forja-maintain` | Cambios en una rama + PR; nunca push a `main` |

`--no-claude` debe funcionar siempre de punta a punta: la IA mejora la experiencia, pero no es requisito.

## 2.9 Seguridad del repo público

- `.gitleaks.toml` + pre-commit (`gitleaks protect --staged`) + job de CI.
- `capture` filtra rutas sensibles: `~/.ssh`, `~/.aws/credentials`, `~/.config/op`, cualquier archivo `*.local.*` y todo `~/.config/forja/local/`.
- `.gitignore` incluye `*.local.*`, `.env`, `.env.*` (excepto `.env.tpl`) y `profile.toml`.
- Ningún archivo del repo menciona empresas, dominios internos ni cuentas. Hay un test de CI que busca patrones prohibidos configurables, por ejemplo emails reales.

## 2.10 Estándares de GitHub (requisito explícito)

**Archivos de comunidad** (para completar el *Community Standards* de Insights):

| Archivo | Contenido |
|---|---|
| `LICENSE` | MIT, `Copyright (c) 2026 <nombre del autor>` |
| `README.md` | Ver estructura abajo |
| `CODE_OF_CONDUCT.md` | Contributor Covenant 2.1 (texto oficial completo); contacto vía *private vulnerability reporting* o un email de contacto que el autor añada después (dejar `<!-- TODO: contacto -->`) |
| `CONTRIBUTING.md` | Cómo correr tests, Conventional Commits, cómo crear un módulo, cómo escribir una skill, la regla "sin datos personales", proceso de PR |
| `SECURITY.md` | Versiones soportadas; reportar por GitHub Private Vulnerability Reporting; alcance (scripts que corren con sudo) |
| `SUPPORT.md` | Dónde preguntar (Discussions/Issues) |
| `CHANGELOG.md` | Formato *Keep a Changelog*, SemVer, sección `Unreleased` |
| `.github/ISSUE_TEMPLATE/` | Formularios YAML: `bug_report.yml` (host, macOS, `forja version`, salida de `doctor --json`), `feature_request.yml`, `new_module.yml`; `config.yml` con `blank_issues_enabled: false` |
| `.github/PULL_REQUEST_TEMPLATE.md` | Checklist: tests, `plan` probado, docs y ADR si cambia una decisión, sin datos personales, CHANGELOG |
| `.github/CODEOWNERS` | `* @<usuario>` |
| `.github/dependabot.yml` | Ecosistemas `github-actions` y `npm`, semanal |
| `.github/FUNDING.yml` | Opcional; omitir si no aplica |

**Estructura del README:**
1. Nombre, descripción en una línea y badges (CI, licencia, versión).
2. Qué es y para quién.
3. Inicio rápido (comando del bootstrap).
4. Cómo funciona (diagrama de las fases del setup en Mermaid).
5. Comandos.
6. Módulos (tabla).
7. Skills.
8. Hosts soportados (Mac ✅, Fedora 🗓, Raspberry Pi 🗓).
9. Seguridad y privacidad (repo agnóstico + perfil local).
10. Contribuir.
11. Licencia.

**Workflows de CI:**

| Workflow | Disparador | Jobs |
|---|---|---|
| `ci.yml` | push y PR | `test` (ubuntu + macos: `node --test`, chequeo de tipos con `tsc --noEmit`), `lint` (shellcheck de `bootstrap.sh` y `bin/forja`, Biome), `plan` (macos-latest: bootstrap con `--dry-run --no-claude` usando un perfil de fixture + `forja plan --json`), `secrets` (gitleaks), `agnostic` (búsqueda de patrones prohibidos) |
| `release.yml` | tag `v*.*.*` | Valida que CHANGELOG tenga la versión y crea un GitHub Release con esas notas |
| `codeql.yml` | semanal y PR | Análisis de JavaScript/TypeScript (opcional, recomendado) |

**Versionado y etiquetas:**
- SemVer con tags `vMAJOR.MINOR.PATCH`. Primera release: `v0.1.0`.
- Conventional Commits (`feat:`, `fix:`, `docs:`, `chore:`, `refactor:`, `test:`) con scope de módulo, por ejemplo `feat(git): …`.
- Etiquetas de issues: `module:<nombre>`, `type:bug|feature|docs|chore`, `host:macos|fedora|raspi`, `good first issue`, `help wanted`, `backlog`.

**Metadatos del repo** (los aplica el autor con `gh` porque requieren permisos de admin):

```sh
gh repo edit <usuario>/forja \
  --description "One-command, Claude Code–assisted provisioning for dev workstations (macOS first; Fedora & Raspberry Pi planned)." \
  --add-topic dotfiles --add-topic macos --add-topic apple-silicon --add-topic chezmoi \
  --add-topic homebrew --add-topic claude-code --add-topic opencode --add-topic git-worktree \
  --add-topic developer-environment --add-topic typescript \
  --enable-issues --enable-discussions --delete-branch-on-merge
```

Además, en Settings: activar *Private vulnerability reporting*, crear un ruleset para `main` (PR obligatorio, CI en verde y sin force-push) y subir una social preview (opcional).

## 2.11 Pruebas

- **Unitarias (`node:test`):**
  - Resolución de dependencias de módulos (incluye la detección de ciclos).
  - Carga y validación de `profile.toml`.
  - Cálculo de puertos.
  - Parseo de `git worktree list --porcelain`.
  - `wt new`/`rm`/`prune` sobre repos git temporales creados en el test.
  - Construcción del `plan` con runners falsos.
  - Filtro de `capture`.
- **Dry-run:** todos los runners respetan `dryRun`. Un test verifica que `apply --dry-run` no escribe nada fuera de un directorio temporal.
- **CI en macOS:** el runner `macos-latest` ejecuta el bootstrap en modo dry-run y `forja plan`. No se aplica la capa macOS en CI.
- **Manual (en la Mac real):** checklist de `docs/guide/verificacion.md` con los comandos de verificación del informe.

## 2.12 Hitos

| Versión | Alcance |
|---|---|
| **v0.1.0** | Bootstrap, CLI (`setup --no-claude`, `plan`, `apply`, `drift`, `doctor` sin `--fix`, `module`, `backlog`, `version`), módulos `core, shell, git, runtimes, containers, editor, terminal, browsers, agents, security, macos-base`, `wt new/ls/rm/prune`, todos los archivos de GitHub y CI completo |
| **v0.2.0** | `setup` con Claude (`forja-onboarding`), `doctor --fix`, `capture`, `wt integrate`, skills `worktree-*`, `mac-doctor`, `forja-maintain`, containers solo con Colima, gitleaks en pre-commit |
| **v0.3.0** | `wt night` sobre openspec-cascade (módulo `looper`) + skill `night-run`, `forja awake`, perfiles de energía, `macos-aggressive` con revert, Zed optimizado, `project-flow`, `self update` |
| **v0.4.0** | Host Fedora (paquetes dnf, sin módulos macOS) |
| **v0.5.0** | Host Raspberry Pi (arm64 Linux, módulos mínimos) |

---

# PARTE 3 — Prompt para Claude Code en web

**Antes de lanzarlo:**
1. Crea en GitHub el repo **público y vacío** `forja`, con un README mínimo para que tenga rama `main`.
2. Sube este archivo como `docs/SPEC.md`.
3. Abre Claude Code en web sobre ese repo y pega el prompt.

```
Eres un ingeniero de plataforma senior. En este repositorio está docs/SPEC.md: es la especificación completa y vinculante de "forja". Léela entera antes de escribir código.

OBJETIVO DE ESTA SESIÓN: implementar el hito v0.1.0 (sección 2.12) dejando además la estructura completa del repo (sección 2.1) para que los hitos siguientes solo agreguen código.

REGLAS:
1. Sigue la SPEC. Si algo es ambiguo, elige la opción más simple, documéntala en un ADR en docs/adr/ y continúa. No añadas herramientas fuera del stack de la Parte 1.
2. El repo es PÚBLICO y AGNÓSTICO: ningún email, nombre de empresa, cuenta, dominio interno ni secreto. Todo dato personal vive en ~/.config/forja/ (sección 2.2). Añade el job "agnostic" de CI.
3. CLI en TypeScript ejecutada directamente con Node 26 (sin build), sintaxis borrable (erasableSyntaxOnly), cero dependencias de runtime salvo un parser TOML fijado si hace falta. Tests con node:test.
4. Toda acción con efectos pasa por runners con soporte de dry-run. `plan` no modifica nada.
5. bootstrap.sh en POSIX sh, idempotente, shellcheck limpio, con --dry-run y --no-claude.
6. chezmoi con un ÚNICO source dir `home/`; cada module.toml declara sus `targets`.
7. Skills: crea las 8 carpetas de skills/ con SKILL.md (frontmatter name + description). En v0.1.0 deben estar completas worktree-new y worktree-status; las demás pueden quedar como borrador marcado "status: draft". Las skills solo llaman a `forja`, no contienen lógica.
8. Usa los contenidos del Apéndice A como base de los configs. Donde la SPEC dice VERIFICAR o no estés seguro de una clave de configuración (Zed, Ghostty, OpenCode, Claude Code), deja un comentario `# VERIFICAR: <qué y dónde>` en vez de inventar.
9. Cumple TODOS los estándares de GitHub de la sección 2.10: LICENSE MIT, README con la estructura indicada, CODE_OF_CONDUCT (Contributor Covenant 2.1 completo), CONTRIBUTING, SECURITY, SUPPORT, CHANGELOG (Keep a Changelog con v0.1.0), plantillas de issues como formularios YAML, plantilla de PR, CODEOWNERS, dependabot, workflows ci.yml, release.yml y codeql.yml, .editorconfig, .gitattributes, .gitignore, .gitleaks.toml.
10. Este entorno es Linux: no puedes probar macOS aquí. Asegúrate de que los tests unitarios pasen localmente y de que el job `plan` de CI en macos-latest esté bien definido.
11. Commits pequeños con Conventional Commits y scope de módulo. Trabaja en una rama `feat/v0.1.0` y abre un PR hacia main con un resumen.
12. Copia el Apéndice B en BACKLOG.md.

AL TERMINAR, reporta:
- Árbol de archivos creado.
- Qué quedó con "VERIFICAR" y por qué.
- Resultado de los tests.
- Pasos manuales pendientes del autor: gh repo edit con descripción y topics (sección 2.10), activar Private vulnerability reporting y el ruleset de main, crear el tag v0.1.0 tras el merge, licencia de OrbStack, login de 1Password, aws configure sso y tópico de ntfy.
```

**Siguientes sesiones** (una por hito):

```
Lee docs/SPEC.md y BACKLOG.md. Implementa el hito v0.2.0 (sección 2.12) siguiendo las mismas reglas de la sesión anterior. Rama feat/v0.2.0, PR a main y actualiza CHANGELOG.
```

---

# Apéndice A — Configuraciones de referencia

> Contenido verificado en la investigación del 14 de noviembre de 2026. Las claves marcadas con "VERIFICAR" deben confirmarse en la documentación oficial vigente antes de fijarlas.

### A.1 `~/.config/mise/config.toml` (módulo runtimes)

```toml
[tools]
node = "26"          # Active LTS desde el 28-oct-2026
pnpm = "latest"
python = "3.13"
uv = "latest"
rust = "stable"      # uso ocasional; sin target-dir compartido, sin sccache por defecto

[settings]
idiomatic_version_file_enable_tools = ["node"]   # respeta .nvmrc / .node-version
```

En proyectos con worktrees, `pnpm-workspace.yaml`:

```yaml
virtualStoreType: global   # pnpm 12; en pnpm 11 la clave era enableGlobalVirtualStore: true — VERIFICAR según la versión fijada
```

### A.2 `~/.config/git/config` (módulo git)

```ini
[init]
  defaultBranch = main
[core]
  pager = delta
  fsmonitor = true
  untrackedCache = true
[interactive]
  diffFilter = delta --color-only
[delta]
  navigate = true
  side-by-side = true
[merge]
  conflictStyle = zdiff3
  tool = smerge
[mergetool "smerge"]
  cmd = smerge mergetool \"$BASE\" \"$LOCAL\" \"$REMOTE\" -o \"$MERGED\"
  trustExitCode = true
[mergetool]
  keepBackup = false
[merge "mergiraf"]
  name = mergiraf
  driver = mergiraf merge --git %O %A %B -s %S -x %X -y %Y -p %P -l %L
[rerere]
  enabled = true
  autoUpdate = true
[extensions]
  worktreeConfig = true
[pull]
  rebase = true
[rebase]
  autoStash = true
  updateRefs = true
[fetch]
  prune = true
[diff]
  algorithm = histogram
  colorMoved = default
[include]
  path = ~/.config/forja/local/git.local.gitconfig   # identidad + includeIf (local, no versionado)
```

`~/.config/git/attributes`:

```
* merge=mergiraf
pnpm-lock.yaml merge=text
```

Con `rerere` y worktrees, la caché `rr-cache` vive en el directorio git común y se comparte entre todos los worktrees.

### A.3 `~/.claude/settings.json` (módulo agents)

```json
{
  "permissions": {
    "deny": [
      "Read(./.env)", "Read(./.env.*)", "Read(~/.aws/**)", "Read(~/.ssh/**)",
      "Read(~/.config/op/**)", "Read(~/.config/forja/local/**)",
      "Edit(./.git/hooks/**)", "Edit(./.git/config)",
      "Bash(git push --force*)", "Bash(git push origin main*)"
    ],
    "allow": ["Bash(pnpm *)", "Bash(forja *)", "Bash(git status)", "Bash(git diff*)", "Bash(git commit*)"]
  },
  "sandbox": { "enabled": true, "failIfUnavailable": true, "allowUnsandboxedCommands": false },
  "hooks": {
    "Notification": [{ "hooks": [{ "type": "command", "command": "~/.claude/hooks/notify.sh" }] }],
    "Stop":         [{ "hooks": [{ "type": "command", "command": "~/.claude/hooks/notify.sh done" }] }]
  },
  "statusLine": { "type": "command", "command": "~/.claude/statusline.sh" }
}
```

- Las reglas que dependen del perfil (por ejemplo, denegar `aws * --profile <perfil-de-trabajo>`) **no** van aquí. Las escribe el onboarding en el `settings.local` o en el `CLAUDE.local.md` correspondiente (**VERIFICAR** cuál es el mecanismo de settings locales a nivel usuario).
- Los hooks `WorktreeCreate`/`WorktreeRemove` llaman a `forja wt new --agent claude --print-path` y `forja wt rm`. Mientras exista el hook `WorktreeCreate`, Claude Code **no** procesa `.worktreeinclude`; por eso `forja wt new` hace esa copia.

`~/.claude/hooks/notify.sh`:

```bash
#!/usr/bin/env bash
TOPIC_FILE="${FORJA_NTFY_TOPIC_FILE:-$HOME/.config/ntfy/topic}"
[[ -r "$TOPIC_FILE" ]] || exit 0
curl -s -H "Title: Claude Code" -d "${1:-attention} · $(basename "$PWD")" "https://ntfy.sh/$(cat "$TOPIC_FILE")" >/dev/null
```

### A.4 OpenCode y Hermes (módulo agents)

```bash
opencode auth login anthropic --method key   # API key de Console; NUNCA la suscripción de Claude
# Servidor compartido: opencode service set env ANTHROPIC_API_KEY "$(op read 'op://…')"  — la referencia op:// viene del perfil local
```

`~/.config/opencode/opencode.json`: permisos que piden confirmación para `bash` y `edit` fuera del proyecto, y solo los MCP necesarios (**VERIFICAR** las claves en la documentación de configuración de OpenCode 2.x).

Hermes:

```bash
curl -fsSL https://hermes-agent.nousresearch.com/install.sh -o /tmp/hermes-install.sh
# forja muestra el script, pide confirmación y luego:
bash /tmp/hermes-install.sh && hermes doctor
```

No se activa `hermes gateway install`. brew y pip no son métodos soportados para Hermes.

### A.5 Zed (módulo editor)

```json
{
  "languages": {
    "TypeScript": { "language_servers": ["vtsls", "biome", "!typescript-language-server", "!typescript-ls", "..."], "formatter": { "language_server": { "name": "biome" } } },
    "TSX":        { "language_servers": ["vtsls", "biome", "!typescript-language-server", "!typescript-ls", "..."], "formatter": { "language_server": { "name": "biome" } } },
    "JavaScript": { "language_servers": ["vtsls", "biome", "!typescript-language-server", "!typescript-ls", "..."], "formatter": { "language_server": { "name": "biome" } } }
  },
  "lsp": {
    "vtsls": { "settings": {
      "typescript": { "tsserver": { "maxTsServerMemory": 4096 } },
      "javascript": { "tsserver": { "maxTsServerMemory": 4096 } }
    } }
  },
  "format_on_save": "on",
  "file_scan_exclusions": ["**/.git", "**/node_modules", "**/.floci-data", "**/cdk.out", "**/target", "**/.claude/worktrees"]
}
```

tsgo se activó tras probarlo en un monorepo pnpm sin el bug de watchers; si reaparece, volver a vtsls en la plantilla y reabrir la entrada del backlog.

### A.6 Ghostty (módulo terminal)

```ini
macos-option-as-alt = true
window-save-state = always
shell-integration = zsh
notify-on-command-finish = unfocused   # VERIFICAR con: ghostty +show-config --default --docs
```

### A.7 AWS (módulo containers)

Parte pública de `~/.aws/config`. Los perfiles SSO reales se añaden desde `aws.local.config`:

```ini
[profile floci]
region = us-east-1
endpoint_url = http://localhost:4566
output = json
```

En `~/.aws/credentials`, solo el perfil `[floci]` con `aws_access_key_id = test` y `aws_secret_access_key = test` (son valores ficticios de emulador, no secretos).

CDK contra Floci:

```bash
AWS_PROFILE=floci cdk bootstrap aws://000000000000/us-east-1
AWS_PROFILE=floci cdk deploy --require-approval never
```

`templates/project/compose.floci.yml`: imagen `floci/floci:<versión fijada>` (no `latest`), puerto `4566`, `/var/run/docker.sock` montado (necesario para Lambda/RDS/ECS), volumen en `/app/data`, `FLOCI_STORAGE_MODE: hybrid`.

### A.8 Shell (módulo shell)

```zsh
eval "$(/opt/homebrew/bin/brew shellenv)"
eval "$(mise activate zsh)"
eval "$(starship init zsh)"
eval "$(zoxide init zsh)"
source <(fzf --zsh)
alias ls='eza --group-directories-first' cat='bat --paging=never' lg='lazygit'
export EDITOR="zed --wait"
[[ -r ~/.config/forja/local/zshrc.local ]] && source ~/.config/forja/local/zshrc.local
```

### A.9 macOS base (módulo macos-base)

| Ajuste | Cómo lo hace forja | Revertir |
|---|---|---|
| Límite de carga 80 % (Tahoe 26.4+) | Guía manual + check | Subir a 100 % en Ajustes |
| Spotlight fuera de `~/code` | Guía manual | Quitar de la lista |
| Time Machine sin `node_modules` | `tmutil addexclusion` en los repos registrados | `tmutil removeexclusion` |
| Touch ID para sudo | `/etc/pam.d/sudo_local` desde el template | `sudo rm /etc/pam.d/sudo_local` |
| Firewall | `socketfilterfw --setglobalstate on` | `--setglobalstate off` |
| No dormir con corriente | Backup `pmset -g custom` + `pmset -c sleep 0 displaysleep 15` | Restaurar desde el backup |
| Reducir transparencia | Guía manual | Desactivar |

Nota clave para trabajo nocturno: con la tapa cerrada y sin monitor externo, el Mac se duerme y `caffeinate` no lo evita. Hay que dejar la tapa abierta con la pantalla apagada, o usar modo clamshell con monitor externo.

---

# Apéndice B — Backlog inicial

```markdown
# Backlog

## Por evaluar
- [x] editor: tsgo en Zed (activado; ver BACKLOG.md).
- [ ] containers: medir pnpm install + hot reload del monorepo real en OrbStack vs Colima y registrar resultados en un ADR.
- [ ] agents: confirmar si OpenCode lee ~/.claude/skills para no duplicar enlaces.
- [ ] agents: evaluar servidores MCP HTTP compartidos para no multiplicar procesos stdio por sesión.
- [ ] git: evaluar si Fork reemplaza a Sublime Merge (falta verificar si muestra la base en conflictos).
- [ ] macos: evaluar compatibilidad con macOS 27 antes de actualizar (OrbStack, Zed, Claude Code).
- [ ] containers: revisar madurez de Floci (fijar versión; probar compat-cdk con los stacks reales).

## Hosts
- [ ] fedora: módulos core/shell/git/runtimes/agents con dnf.
- [ ] raspi: perfil mínimo arm64.

## Ideas
- [ ] `forja report`: exportar el estado de la máquina a Markdown para el vault de Obsidian.
- [ ] Rust: módulo opcional con sccache (CARGO_INCREMENTAL=0) si el uso deja de ser ocasional.
```
