# macos-aggressive

Capa opcional agresiva. Exige estar habilitada en el perfil (`modules_extra`) y `--i-understand-the-risks`.

- **maxfiles persistente:** un LaunchDaemon (`/Library/LaunchDaemons/dev.forja.maxfiles.plist`) fija `launchctl limit maxfiles 524288 524288` en cada arranque. Sirve para monorepos grandes, watchers y LSP.
- **Developer mode para la terminal:** `spctl developer-mode enable-terminal`. Los binarios que lanza la terminal se saltan la verificación de Gatekeeper, así que los builds van más rápido. Después hay que activarlo a mano en Ajustes.

El **modo tapa** (`pmset disablesleep`) **no** está aquí: se activa solo mientras corre un loop, con `forja awake` / `wt night`.

Revertir: `forja apply macos-aggressive --revert`.
