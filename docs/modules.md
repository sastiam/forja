# Módulos

> Generado con `node scripts/gen-modules-doc.ts`. No editar a mano.

| Módulo | Qué hace | Paquetes | Rutas (chezmoi) | Riesgo | Cómo revertir |
|---|---|---|---|---|---|
| `agents` | Claude Code (sandbox), OpenCode, Hermes y skills enlazadas | opencode | `~/.claude`, `~/.config/opencode` | medium | Borra los symlinks `~/.claude/skills/*` que apuntan a forja, `~/.claude/settings.json` y `~/.config/opencode`; `brew uninstall opencode`. |
| `browsers` | Chrome y Dia (solo instala, sin flags no documentados) | google-chrome, dia | — | low | `brew uninstall --cask google-chrome dia`. |
| `containers` | Colima + Docker CLI + Floci + AWS CLI + CDK (AWS local) | floci-io/floci, colima, docker, docker-compose, floci-io/floci/floci, awscli, aws-cdk | `~/.aws/config`, `~/.aws/credentials` | medium | `colima stop && colima delete`, `brew uninstall colima docker docker-compose floci awscli aws-cdk` y retira el perfil `[floci]` de `~/.aws/config`. Si usabas OrbStack: `brew uninstall --cask orbstack`. |
| `core` | Xcode CLT, Homebrew y utilidades base | coreutils, jq, gh, 1password-cli | — | low | `brew uninstall coreutils jq gh` y `brew uninstall --cask 1password-cli`. Homebrew se desinstala con su script oficial. |
| `editor` | Zed con vtsls y Biome | zed, biome | `~/.config/zed` | low | `brew uninstall --cask zed` y borra `~/.config/zed`. |
| `git` | Git moderno, conflictos con mergiraf + Sublime Merge, rerere, zdiff3 | git, git-delta, lazygit, mergiraf, sublime-merge | `~/.config/git`, `~/.config/lazygit` | low | Borra `~/.config/git` y `~/.config/lazygit`; `brew uninstall git-delta lazygit mergiraf` y `brew uninstall --cask sublime-merge`. |
| `macos-aggressive` | Capa opcional agresiva (exige confirmación escrita) | — | — | high | Pendiente de v0.3.0 (`forja apply macos-aggressive --revert`). Manual: `pmset -a disablesleep 0`. |
| `macos-base` | Capa conservadora y reversible de ajustes de macOS | — | — | medium | Ver tabla en docs/SPEC.md A.9: `sudo rm /etc/pam.d/sudo_local`, restaurar `pmset` desde `~/.local/state/forja/pmset-backup.txt`, `tmutil removeexclusion`. |
| `runtimes` | mise global: Node, pnpm, uv, Python y Rust | mise | `~/.config/mise` | low | Borra `~/.config/mise` y `mise implode` si quieres eliminar todo lo instalado por mise. |
| `security` | gitleaks, firewall de aplicaciones y check de FileVault | gitleaks | — | medium | `sudo /usr/libexec/ApplicationFirewall/socketfilterfw --setglobalstate off` y `brew uninstall gitleaks`. |
| `shell` | zsh con mise, starship, zoxide, fzf y utilidades modernas | starship, zoxide, fzf, eza, bat, ripgrep, fd, btop | `~/.zshrc` | low | Restaura tu `~/.zshrc` anterior (chezmoi guarda copias con `chezmoi apply --backup` si lo activas) y `brew uninstall` de los paquetes del Brewfile. |
| `terminal` | Ghostty con integración de shell | ghostty | `~/.config/ghostty` | low | `brew uninstall --cask ghostty` y borra `~/.config/ghostty`. |
| `worktrees` | Hooks de Claude Code y plantillas para `forja wt` | — | `~/.claude/settings.json`, `~/.claude/hooks/worktree-create.sh`, `~/.claude/hooks/worktree-remove.sh` | low | Quita los hooks `WorktreeCreate`/`WorktreeRemove` de `~/.claude/settings.json`. |
