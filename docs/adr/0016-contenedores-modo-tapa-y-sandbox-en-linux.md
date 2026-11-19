# ADR 0016 — Contenedores, modo tapa y sandbox en Linux (Fedora)

- **Estado:** aceptada
- **Fecha:** 2026-11-19

## Contexto

En macOS, forja usa Colima (una VM que solo monta `~/code`, ADR 0012), `pmset` con una regla sudo para el modo tapa (ADR 0011) y el sandbox de Claude Code. Nada de eso existe en Linux, y dos piezas cambian de naturaleza:

- **Docker nativo no tiene VM.** El socket `/var/run/docker.sock` lo atiende un daemon que corre como root, y el grupo `docker` equivale a root: un contenedor puede montar `/`. En macOS la VM de Colima era la frontera que permitía dar el socket al sandbox de Claude sin exponer `~/.ssh` ni `~/.aws`.
- **El modo tapa no necesita sudo.** logind deja a la sesión gráfica activa tomar un «inhibidor» (`systemd-inhibit`).

## Decisión

1. **Docker nativo, sin Colima.** El módulo `containers` en Linux solo comprueba y arranca: `docker.service` activo y habilitado (`sudo systemctl enable --now docker`) y acceso con el usuario. **No instala el motor** (puede ser `moby-engine` de Fedora o `docker-ce` del repo de Docker: elegir uno es una decisión de confianza) y **nunca añade a nadie al grupo `docker`**: solo lo indica, con la advertencia de que equivale a root.
2. **Sin socket de Docker en el sandbox de Claude en Linux.** La plantilla de `settings.json` solo declara `allowUnixSockets` y el hook `colima-up.sh` en macOS. Dar el socket nativo a un agente permitiría escapar del sandbox con `docker run -v /:/host`.
3. **Modo tapa con `systemd-inhibit`.** `forja awake on` lanza `systemd-inhibit --what=handle-lid-switch:sleep --who=forja --mode=block sleep infinity` en su propio grupo de procesos; `off` lo mata. Sin sudo ni reglas en `/etc`. El guardián de batería (20 %) lee `/sys/class/power_supply` y suspende con `systemctl suspend` si la tapa está cerrada.
4. **Sandbox con bubblewrap.** Claude Code lo exige en Linux junto con `socat`; `agents` los instala con dnf y `forja doctor` comprueba que `bwrap` realmente pueda aislar (`bwrap --ro-bind / / --dev /dev --unshare-user true`), no solo que esté instalado.

## Consecuencias

- En Linux los agentes dentro del sandbox **no pueden usar Docker**. Es deliberado.
- `containers` no puede dejar Docker «listo» desde cero en una máquina sin motor: lo dice claramente en `plan`.
- Floci no tiene binario instalable en Linux (solo el tap de Homebrew); queda en el BACKLOG, por eso `floci --version` solo se comprueba en macOS.
- Un host sin batería (sobremesa) nunca corta el modo tapa por batería.

## Plan B

- Para dar Docker a los agentes en Linux: Podman *rootless* o Docker *rootless* (socket en `$XDG_RUNTIME_DIR`, sin privilegios de root), declarado en el perfil. Se evaluará en una fase posterior.
- Si `systemd-inhibit` no basta en algún entorno de escritorio, se puede configurar `HandleLidSwitch=ignore` en logind, a costa de pedir sudo y tocar `/etc`.
