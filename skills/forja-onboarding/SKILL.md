---
name: forja-onboarding
description: "Entrevista de primera configuración de forja: escribe el perfil local en ~/.config/forja. La lanza 'forja setup' cuando no hay perfil; úsala también con 'configura forja en esta máquina'."
status: complete
---

# forja-onboarding

Entrevista al usuario y escribe su perfil local. Nada de lo que escribes se sube al repo.

## Preguntas (una a una; ofrece la opción por defecto)
1. **Host:** uno de `hosts/*.toml` del repo de forja (`macbook` en un Mac).
2. **Identidad de git:** nombre y email.
3. **Carpetas de código:** personal (por defecto `~/code/personal`) y de trabajo (opcional).
4. **Módulos:** lista los del host (`forja module ls`). Pregunta cuáles saltar (`modules_skip`; `macos-aggressive` siempre fuera salvo que lo pida) y cuáles añadir (`modules_extra`).
5. **Firma de agentes:** ¿quiere commits de agentes firmados? Si dice que sí, `[signing] agent_key = "~/.config/forja/agent-signing"` (ver `docs/guide/firma.md`).
6. **Notificaciones:** ¿tiene un tópico de ntfy? Si lo tiene, `[notify] ntfy_topic_file`.
7. **Sandbox de Claude Code:** ¿necesita dominios o lecturas extra (registry privado, dominios de empresa)? Van en `[claude] allowed_domains` y `allow_read`. Pregunta también qué modelo usa por defecto en Claude Code (`[claude] model`, p. ej. `"opus"`); si no lo fija aquí, `forja apply` no escribe `model` y `/model` se perderá en el siguiente apply. Igual con el tema (`[claude] theme`, p. ej. `"dark"`), que guarda `/config`.
8. **AWS SSO** (si usa containers): los perfiles reales van en `~/.config/forja/local/aws.local.config`.

## Qué escribes
- `~/.config/forja/profile.toml` (permisos 600):
  ```toml
  schema = 1
  host = "macbook"
  modules_extra = []
  modules_skip = ["macos-aggressive"]

  [identity]
  name = "…"
  email = "…"

  [profiles.personal]
  code_dir = "~/code/personal"

  [secrets]
  provider = "1password"
  ```
- `~/.config/forja/local/git.local.gitconfig`: identidad, e `includeIf` por carpeta si hay perfil de trabajo.
- `~/.config/forja/local/CLAUDE.local.md`: reglas según el perfil (p. ej. «en `~/code/work` nunca hagas push a main»).

## Reglas
- No escribas secretos: usa referencias `op://`.
- No ejecutes `forja apply`: lo hace `forja setup` tras la confirmación del usuario. Termina diciendo «cierra esta sesión para continuar».
