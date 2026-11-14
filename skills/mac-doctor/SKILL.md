---
name: mac-doctor
description: "Diagnostica una Mac lenta o con problemas a partir de forja doctor --json y propone arreglos reversibles. Úsala con 'la Mac va lenta', 'se calienta', 'se queda sin batería', 'no duerme' o cuando forja doctor --fix te pase hallazgos."
status: complete
---

# mac-doctor

Esta skill **no contiene lógica**: interpreta la salida de `forja doctor --json` (o los hallazgos que te pasa `forja doctor --fix`) y propone acciones.

## Pasos
1. Si no te pasaron hallazgos, ejecuta `forja doctor --json`. Céntrate en `status: "fail"` y luego en `"warn"`.
2. Ordena por impacto y explica cada punto en una línea: qué pasa, por qué importa y cuál es el arreglo.
3. Propón **una acción a la vez**, reversible, y espera el «sí» antes de ejecutarla.

## Hallazgos frecuentes
| Hallazgo | Arreglo |
|---|---|
| `memoria` < 15 % libre | Cierra las ventanas de Zed de worktrees viejos (un tsserver por ventana); revisa con `forja wt ls`. Baja la VM de Colima (`colima stop`) si no la usas. |
| `disco` > 90 % | Mira las cachés que lista doctor. Para pnpm, `pnpm store prune`. Para `~/Library/Caches`, borra solo lo que el usuario confirme. `forja wt prune --merged --dry-run`. |
| caché de `~/.colima` grande | Es el disco de la VM: `colima prune` o `docker system prune`, con confirmación. |
| `modo tapa (forja awake)` huérfano | El Mac no dormirá al cerrar la tapa. `forja awake off`. |
| `perfil de energía` | `forja apply macos-base`. |
| `opencode instalado con brew` | El binario es el del instalador oficial: quita `~/.opencode/bin` del PATH en `~/.zshrc` y borra `~/.opencode`. |
| `hermes --version` falla | Reinstala con su instalador oficial (forja lo muestra antes de ejecutarlo) y abre un issue si persiste. |
| `contexto docker = colima` | `docker context use colima`. Si sale OrbStack: `brew uninstall --cask orbstack`. |
| worktrees huérfanos | `forja wt prune --dry-run`, luego confirmar. |
| `FileVault activo` falla | Solo se activa a mano: Ajustes → Privacidad y seguridad. |

## Reglas
- Nunca borres sin confirmar. Nunca uses `sudo` sin mostrar el comando exacto antes.
- Prefiere los comandos de forja (`forja apply <módulo>`, `forja awake off`, `forja wt prune`) a comandos sueltos: así el cambio queda registrado y es reversible.
- Si un arreglo debería ser permanente, propón un cambio en el repo con la skill `forja-maintain`.
