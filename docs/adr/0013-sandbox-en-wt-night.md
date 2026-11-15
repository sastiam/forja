# ADR 0013 — Sandbox de Claude Code en `wt night`

- **Estado:** aceptada
- **Fecha:** 2026-11-15

## Contexto

openspec-cascade abre las sesiones del Agent SDK con `settingSources: ["project"]`. Por eso **no** carga
`~/.claude/settings.json`, y el sandbox que forja configura ahí (ADR 0010) no llegaba al loop: el agente corría sin
sandbox, con `permissionMode: "dontAsk"` y Bash permitido. Además, el `sandbox-check` de `wt night` corría en el
proceso de forja, fuera de cualquier sandbox, así que salía en verde aunque dentro del loop algo fuera a fallar
(ADR 0009 pedía ejecutarlo «dentro del mismo entorno que usará el loop»).

## Decisión

1. **openspec-cascade acepta `--settings <archivo>`** (y `CASCADE_SETTINGS`), que pasa al SDK como la capa de
   ajustes de flag, por encima de los del proyecto. Solo afecta al motor `claude`.
2. **`wt night` escribe un settings por noche** en `~/.local/state/forja/night/<rama>.settings.json` (modo 600, fuera
   del worktree y fuera de lo que el sandbox deja escribir, para que el agente no pueda reescribir su propio sandbox):
   - `sandbox.enabled`, `failIfUnavailable: true` y `allowUnsandboxedCommands: false`: sin sandbox no hay loop y no
     hay escapes, porque de noche nadie aprueba nada;
   - dominios del host, del perfil y de cada `--host`; socket de Colima si el módulo `containers` está activo;
     `allowLocalBinding` para los tests que levantan servidores;
   - las lecturas y escrituras de `claudeSandbox()` y el mismo `deny` de secretos que el settings global.
3. **Comprobación previa en dos partes:**
   - *Arnés*, en el proceso de forja: git, escritura en el git-dir y firma. Los commits los hace openspec-cascade
     fuera del sandbox.
   - *Agente*, dentro del sandbox: una sesión corta `claude -p --settings <el mismo archivo> --setting-sources project`
     con Haiku ejecuta `forja sandbox-check --json --inside-loop`. Comprueba git, escritura en el worktree y el
     temporal, red de cada `--host` y que el sandbox está activo (no puede escribir en `$HOME`). Si la respuesta no
     se puede leer, falla: un loop sin comprobar no arranca.
4. **Sin sandbox solo a propósito.** `wt night` exige el motor `claude` y una versión de openspec-cascade con
   `--settings`, porque una versión antigua ignoraría el flag sin avisar. `--no-sandbox` lo desactiva y lo avisa
   (es el plan B del ADR 0009).

## Consecuencias

- El agente nocturno queda dentro del sandbox. Un comando que lo necesite fuera falla en vez de esperar una
  aprobación, y la tarea acaba en reintento o en `BLOCKED`.
- La comprobación cuesta una sesión corta de Haiku por lanzamiento, también con `--dry-run`.
- Los dominios que necesita una tarea concreta se pasan con `--host`. Las dependencias se instalan antes del loop
  (skill `night-run`).
- `LOOPER_REF` tiene que apuntar a una versión de openspec-cascade con `--settings`.

## Plan B

Si `claude -p` deja de servir como sonda, usar `@anthropic-ai/sandbox-runtime` (`srt`) con una configuración
derivada del mismo settings.
