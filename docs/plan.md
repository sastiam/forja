# Plan de iteración: 0.1.1 → 0.3.0

> **Estado:** 0.1.1 integrado en `main` (PRs #7, #8, #10, #11; falta activar los workflows desde el Mac). El resto de 0.2.0 y 0.3.0 va en una sola PR (`feat/refinamiento-0.2-0.3`), salvo la PR 7 (Hermes), que espera el diagnóstico.

Plan vivo. Cada fila es una PR pequeña desde `main`. Lo marcado con **Mac** se ejecuta en local (Claude Code en el
Mac), porque depende de brew, chezmoi o `pmset` reales.

## Fase 0 — En el Mac, antes de nada

- [ ] No ejecutar `forja apply` hasta cerrar la PR 4 (borraría claves de `~/.claude/settings.json`).
- [ ] Copia de seguridad de `~/.claude/settings.json` y `~/.zshrc`.
- [ ] `git branch -d feat/colima-report` (ya integrada en `main`, PR #5).
- [ ] Diagnóstico de Hermes: `which hermes`, origen de la instalación y `hermes --version` con salida detallada.

## 0.1.1 — Fiabilidad y CI

| # | Rama | Contenido |
|---|---|---|
| 1 | `fix/brew-offline` | `bundleCheck`/`bundleMissing` con `--no-upgrade`, `HOMEBREW_NO_AUTO_UPDATE=1` y `HOMEBREW_NO_ANALYTICS=1`, con test. Arregla `drift`, `plan` y `report`. |
| 2 | `ci/activate` | Activar `ci.yml` y `release.yml` (CodeQL fuera). Auto-merge de Dependabot patch/minor con CI en verde. **GitHub:** activar «Allow auto-merge» y proteger `main` exigiendo `ci`. |
| 3 | `feat/doctor-agents` | Checks de doctor para Hermes y OpenCode (`--version`, origen del binario). OpenCode al Brewfile de `agents`; fuera `~/.opencode/bin` de `.zshrc`. **Mac:** `rm -rf ~/.opencode`. |
| 4 | `feat/claude-settings-template` | `settings.json` como plantilla de chezmoi: `statusLine` común, sandbox (`allowedDomains`, `allowRead`) desde el perfil del host. ADR 0010. **Mac:** `chezmoi diff` vacío antes de aplicar. |
| — | tag `v0.1.1` | CHANGELOG + release automática. |

## 0.2.0 — Módulos, capture y skills

| # | Contenido |
|---|---|
| 5 | **containers** activo en `macbook`: Colima, Docker CLI, compose, cdk, floci con versión fijada; awscli adoptado. Nota en ADR 0007 y se cierra el benchmark. **Mac:** `brew uninstall --cask orbstack`, `colima start`. |
| 6 | **security** (gitleaks en pre-commit, `op`) y **browsers** (Chrome y Dia adoptados). |
| 7 | Arreglo de Hermes según el diagnóstico; versión fijada en el módulo. |
| 8 | Comando `capture` sobre el filtro existente (ADR 0006). |
| 9 | Skills `forja-maintain`, `mac-doctor`, `worktree-integrate` + `wt integrate`. |

## 0.3.0 — Refinar: potencia, energía, Zed y looper

Perfil de uso: MacBook Pro/Max, casi siempre con corriente.

| # | Contenido |
|---|---|
| 10 | **Energía** (`macos-base`/`macos-aggressive`): alto rendimiento con corriente (`pmset -c powermode`, si el modelo lo admite), bajo consumo con batería, guía del límite de carga al 80 % (Tahoe 26.4+), `launchctl limit maxfiles`, Spotlight y Time Machine fuera de `~/code` y de los worktrees. Todo con `--revert` y backup de `pmset`. |
| 11 | **Modo tapa del looper**: `forja awake on|off|status`. Solo se activa mientras corre `wt night` (`pmset disablesleep 1`), con restauración garantizada al terminar (trap + archivo de estado + check de doctor que avisa si quedó activo). Corta si la batería baja del 20 % sin cargador. `caffeinate -i` de openspec-cascade no cubre la tapa cerrada; esto sí. |
| 12 | **Colima a medida**: CPU/RAM/disco según el chip (`sysctl hw.ncpu`, `hw.memsize`), virtiofs, perfil por host. |
| 13 | **Zed**: (a) consumo — `maxTsServerMemory` según RAM, un solo LSP de TS, desactivar LSP sobrantes; (b) monorepo — `file_scan_exclusions` y watcher para worktrees y symlinks de pnpm; (c) agentes — Claude Code y OpenCode vía ACP, tareas y keymaps para abrir worktrees; (d) pulido — tema, fuente, tareas de test/lint. |
| 14 | **Skills de worktrees para Claude Code**: que Claude use `forja wt` (worktrees fuera del repo, ADR 0005) en vez de los nativos en `.claude/worktrees`; revisar `worktree-new`, `worktree-status`, `worktree-integrate` y evaluar un hook de creación de worktree. |
| 15 | **Módulo `looper`**: Bun vía mise, clon de `sastiam/openspec-cascade` con ref fijado, `bun install` + `bun link`, check en doctor. |
| 16 | **`forja wt night <repo> --changes a,b [--engine]`**: worktree `--agent` (firma ssh) → dependencias → `sandbox-check` → `forja awake on` → openspec-cascade → `awake off` → `forja report` + notificación. Skill `night-run` completa. |
| 17 | Skills `project-flow` y `forja-onboarding` (setup con Claude). `self update`. |

## Decisiones tomadas

- Versionado: 0.1.1 ya; `capture` en 0.2.0.
- `settings.json`: plantilla por host.
- OpenCode: brew.
- Contenedores: Colima, fuera OrbStack.
- Hermes: investigar y arreglar.
- CI: `ci.yml` + `release.yml`; Dependabot con auto-merge patch/minor.
- Módulos nuevos activos: containers, security, browsers. `op` y awscli adoptados.
- Tapa: no dormir solo mientras corre el looper.
- Looper: `wt night` envuelve openspec-cascade.
- Flujo: código y PRs desde la nube; lo que toca la máquina, checklist para el Mac.
