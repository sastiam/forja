`forja apply containers --revert` descarga el LaunchAgent de apagado automático (`dev.forja.colima-idle`) y borra su plist. Para quitarlo todo: `colima stop && colima delete`, `brew uninstall colima docker docker-compose floci awscli aws-cdk` y retira el perfil `[floci]` de `~/.aws/config`. Los scripts `~/.config/forja/bin/colima-*`, el hook `colima-up.sh` y las funciones de `~/.zshrc` dejan de usarse al desactivar el módulo.


En Linux no hay nada que revertir: forja no instala Docker ni toca grupos. `forja apply containers --revert` solo lo indica; para desactivar el servicio: `sudo systemctl disable --now docker`.
