# macos-base

Capa conservadora y reversible de ajustes de macOS (`forja apply macos-base --revert`).

| Ajuste | Cómo | Revertir |
|---|---|---|
| Touch ID para sudo | `/etc/pam.d/sudo_local` | `sudo rm /etc/pam.d/sudo_local` |
| Con corriente: no dormir y alto rendimiento | `pmset -c sleep 0 displaysleep 15 powermode 2` (con backup de `pmset -g custom`) | `--revert` restaura desde el backup |
| Con batería: bajo consumo | `pmset -b powermode 1` | `--revert` |
| Regla sudo de `forja awake` | `/etc/sudoers.d/forja-awake` (solo `pmset -a disablesleep 0/1` y `pmset sleepnow`, validado con `visudo -c`) | `--revert` |
| Time Machine | excluye `~/.colima`, `node_modules` y las carpetas `<repo>.wt` | `--revert` |
| Límite de carga 80 %, Spotlight fuera de `~/code`, reducir transparencia | guías manuales | en Ajustes |

`powermode` solo se aplica si `pmset -g cap` lo lista. En los modelos sin alto rendimiento, `pmset` avisa y se sigue adelante.

## Modo tapa (`forja awake`)

Al cerrar la tapa, macOS duerme el Mac aunque `caffeinate` esté activo. `forja awake on` usa `pmset -a disablesleep 1` para que siga trabajando. Solo se usa **mientras corre un loop**: `wt night` lo activa y lo quita al terminar, y lo corta antes si la batería baja del 20 % sin cargador. `forja doctor` avisa si queda activo sin loop.
