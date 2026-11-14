# Verificación manual en la Mac real

Checklist tras `forja apply`. CI no aplica la capa macOS, así que esto se hace a mano.

## Herramientas

```sh
forja version && forja doctor
brew bundle check --file modules/core/Brewfile
git --version && mergiraf --version && smerge --version
mise ls && node --version && pnpm --version
docker context show            # debe ser: orbstack
floci --version
zed --version && ghostty --version
claude --version && opencode --version
gitleaks version
```

## Configuración

```sh
chezmoi --source ~/.local/share/forja/home verify
git config --get merge.conflictStyle           # zdiff3
git config --get merge.mergiraf.driver
```

## macOS (módulo macos-base y security)

```sh
sudo -k && sudo true                           # debe pedir Touch ID
pmset -g custom                                # compara con ~/.local/state/forja/pmset-backup.txt
/usr/libexec/ApplicationFirewall/socketfilterfw --getglobalstate
fdesetup status                                # FileVault activo
```

## Worktrees

```sh
cd ~/code/<area>/<repo>
forja wt new prueba/verificacion
forja wt ls
forja wt rm prueba/verificacion --force
```

## Pendientes manuales conocidos

Ver los comentarios `VERIFICAR` (`grep -rn VERIFICAR .`).
