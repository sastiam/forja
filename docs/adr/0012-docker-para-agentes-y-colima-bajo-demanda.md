# ADR 0012 — Docker para agentes y Colima bajo demanda

- **Estado:** aceptada
- **Fecha:** 2026-11-14

## Contexto

Los agentes no podían usar Docker: el sandbox de Claude Code bloquea el socket de Colima
(`permission denied … docker.sock`). Abrirlo sin más sería un agujero: Colima monta `$HOME` entero con escritura por
defecto (`mounts: []`), así que `docker run -v ~/.ssh:/x …` leería lo que el sandbox niega (`~/.ssh`, `~/.aws`,
`~/.config/forja/local`).

Además, `forja apply containers` dejaba la VM encendida y `plan`/`drift` la daban por pendiente si estaba apagada:
4 CPU y 6 GB reservados todo el día, con calor y menos batería en una Mac de uso intensivo.

## Decisión

1. **La VM solo monta `~/code`** (proyectos y carpetas `<repo>.wt`), con escritura. Se cambia con
   `[containers] mounts` en el perfil, que no admite una lista vacía porque significaría `$HOME` entero.
   `plan` reinicia la VM si monta otra cosa y `doctor` lo marca.
2. **Socket en el sandbox.** Con el módulo `containers` activo, `settings.json` añade
   `sandbox.network.allowUnixSockets` con `~/.colima/default/docker.sock` (ruta absoluta).
3. **Arranque bajo demanda.** `~/.config/forja/bin/colima-ensure` arranca la VM si está apagada, con un lock para los
   arranques simultáneos. Lo llaman:
   - el hook `PreToolUse` de Bash (`~/.claude/hooks/colima-up.sh`), solo si el comando usa
     `docker|docker-compose|floci|cdk|sam`. Los hooks corren fuera del sandbox, así que pueden arrancar la VM;
   - las funciones de `~/.zshrc` con esos mismos nombres, en tu terminal (no dentro de Claude Code).
4. **Apagado automático.** El LaunchAgent `dev.forja.colima-idle` corre `colima-idle <min>` cada 5 minutos. Apaga la
   VM tras `[containers] idle_minutes` (15 por defecto; 0 = nunca) sin contenedores ni Floci. Ante la duda (docker no
   responde, arranque en curso) no la apaga.
5. **Apagada no es un desvío.** `plan` solo pide crearla o reconfigurarla (CPU, RAM, disco, montajes).

## Consecuencias

- Los agentes usan Docker sin pasos manuales y sin ver nada fuera de `~/code`.
- Riesgo residual: un contenedor lee y escribe todo `~/code` (otros proyectos y worktrees) y tiene red sin el filtro
  del sandbox. Es el precio de poder montar el proyecto. Si hace falta más aislamiento, se pueden limitar los
  montajes a `~/code/<org>` con `[containers] mounts`.
- El primer comando Docker tras un rato parado espera el arranque (unos 10–30 s; el hook tiene 120 s de margen).
- Un proceso que usa el socket sin pasar por esos comandos (por ejemplo, testcontainers desde `pnpm test`) no arranca
  la VM: hay que lanzar antes `docker info`.

## Plan B

Si un agente necesita aislamiento por tarea, un perfil de Colima por worktree (`colima start -p <wt>`) que monte solo
ese worktree.
