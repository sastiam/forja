# ADR 0017 — Repos de terceros y descargas en Fedora

- **Estado:** aceptada
- **Fecha:** 2026-11-19

## Contexto

Ghostty, Sublime Merge, Chrome y Zed no están en los repos de Fedora, ni tampoco la Nerd Font. Tenerlos exige añadir un repo ajeno (COPR, `.repo` de un proveedor), ejecutar un instalador remoto o descargar un archivo. Cada una de esas vías ejecuta código de un tercero, con `sudo` en el caso de los repos, y puede actualizarse sola después. En macOS el equivalente era un tap de Homebrew y ya existía `brew trust` (el plan lo muestra y `apply` confirma).

Además, al comprobar la fase 1 se vio que `starship` tampoco está en Fedora (solo existía en un COPR habilitado en la máquina de desarrollo), y que `* merge=mergiraf` en `~/.config/git/attributes` rompe cualquier fusión a tres vías si `mergiraf` no está instalado.

## Decisión

1. **forja nunca habilita un repo de terceros por su cuenta.** Cada módulo los declara en `thirdparty.fedora.toml` (`kind` = `copr` | `repofile` | `workstation`, `source`, `packages`). Solo se habilitan los que el usuario listó en `[fedora] trusted_repos` de su `profile.toml`, con la clave exacta que `plan` muestra (`copr:scottames/ghostty`). La clave incluye el origen: si un módulo cambia la fuente, deja de estar confiada.
2. **Sin confianza, `plan` da una guía y `apply` omite** el repo y sus paquetes, con un aviso. Un repo ya habilitado en la máquina (por el usuario) no necesita confianza: forja solo instala los paquetes.
3. **Entrada estricta:** los nombres de paquete, `owner/project`, ids y URLs se validan con listas blancas; los `.repo` solo por `https` y sin parámetros. Los comandos se ejecutan sin shell.
4. **`workstation`** usa `fedora-workstation-repositories` (paquete de Fedora que trae las definiciones, deshabilitadas, de repos como el de Google Chrome) y los activa con `dnf config-manager setopt <id>.enabled=1`.
5. **Zed:** su instalador oficial (https://zed.dev/docs/linux), descargado a un directorio temporal, **mostrado** y ejecutado solo con confirmación interactiva (el patrón de Hermes). Sin terminal interactivo se omite.
6. **Nerd Font:** el `.tar.xz` de una release fija (v3.5.1) con su SHA-256 escrito en el código. Si el hash no coincide, no se extrae nada.
7. **Cada paquete de `packages.fedora.txt` debe existir en los repos oficiales.** El job `plan (fedora)` lo comprueba en un contenedor limpio (`scripts/check-fedora-packages.sh`). Lo que no esté va a `thirdparty.fedora.toml` o a mise (`starship` pasó a mise).
8. **mergiraf es condicional:** el driver y el atributo de git solo se declaran si `mergiraf` está en el PATH al aplicar (`lookPath` de chezmoi).

## Consecuencias

- Un usuario nuevo en Fedora debe añadir una línea a su perfil por cada repo ajeno que acepte; es fricción deliberada.
- Un COPR o un repo de proveedor puede publicar paquetes arbitrarios mientras esté habilitado: la confianza es del usuario y queda por escrito en su perfil.
- La descarga de la fuente con hash fijo exige subir el hash en una PR cuando cambie la versión.
- Zed instalado con su script no se actualiza por dnf; se actualiza solo (o volviendo a ejecutar el instalador).

## Plan B

- Un repo de terceros que deje de ser fiable se quita de `thirdparty.fedora.toml`; el usuario lo desactiva con `dnf config-manager setopt <id>.enabled=0` o `dnf copr disable owner/project`.
- Si el instalador de Zed cambia de forma incompatible, Flatpak (`dev.zed.Zed`) o los paquetes de Terra son las alternativas que documenta Zed.
