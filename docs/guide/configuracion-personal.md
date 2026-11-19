# Configuración personal: qué hacer con lo que ya tienes

**El problema.** forja escribe varios archivos de configuración enteros (`~/.claude/settings.json`, `~/.config/ghostty/config`…). Si en tu máquina ya existen con tus ajustes, un `forja apply` los reemplazaría. Para evitarlo, forja tiene una carpeta de **archivos locales** (`~/.config/forja/local/`): viven fuera del repo (el repo es público y no contiene nada personal) y forja los **añade encima** de lo suyo.

> Antes de aplicar, mira qué cambiaría: `forja plan` marca «modificado fuera de chezmoi» los archivos tuyos que pisaría, y `chezmoi diff` te enseña línea por línea qué se perdería.

## Qué archivo local usar para cada cosa

| Tu archivo | Cópialo a | Cómo se combina | Qué pasa con lo tuyo |
|---|---|---|---|
| `~/.claude/CLAUDE.md` | `~/.config/forja/local/CLAUDE.local.md` | forja escribe 4 reglas generales y, debajo, importa tu archivo (`@…`). | Se conserva. Las reglas de forja van primero; las tuyas después. |
| `~/.claude/settings.json` | `~/.config/forja/local/claude.settings.json` | Las claves de primer nivel de tu archivo se añaden **al final**: conservan lo que forja no gestiona (`model`, `theme`, `tui`, `autoMode`, `effortLevel`…) y, si coinciden con una de forja, **ganan tú**. | Se conserva. `forja apply` avisa si tocas `sandbox` o `permissions`, que son la parte de seguridad. |
| `~/.config/ghostty/config` | `~/.config/forja/local/ghostty.conf` | La config de forja termina con `config-file = ?~/.config/forja/local/ghostty.conf`: tu archivo se lee después y gana. | Se conserva. Si el archivo no existe, se ignora. |
| `~/.aws/config` (perfiles SSO) | `~/.config/forja/local/aws.local.config` | La plantilla de forja lo incluye al final. | Se conserva. |
| Identidad y firma de git | `~/.config/forja/local/git.local.gitconfig` | Se incluye desde la config de git de forja. | Se conserva. |
| `~/.config/zed/settings.json` | — | **Aún no hay capa personal**: Zed no admite incluir otros archivos. | Se reemplazaría. Si ya tienes Zed configurado, excluye el módulo `editor` (`modules_skip`). |

## Pasos para `settings.json`

```sh
mkdir -p ~/.config/forja/local && chmod 700 ~/.config/forja/local
# Copia todo lo tuyo salvo lo que forja gestiona siempre:
jq 'del(.permissions, .sandbox, .hooks, .extraKnownMarketplaces, .enabledPlugins, .statusLine)' \
  ~/.claude/settings.json > ~/.config/forja/local/claude.settings.json
chmod 600 ~/.config/forja/local/claude.settings.json
```

Si más adelante quieres que una de esas claves de forja sea distinta, añádela a ese archivo: gana. Ejemplo: desactivar el sandbox en sesiones interactivas se hace mejor con `[claude] sandbox = false` en tu `profile.toml` (ADR 0015) que con el overlay.

## Por qué son archivos aparte y no un solo perfil

- **Privacidad:** forja no sube nada de esto al repo, y el sandbox de los agentes **no puede leer** `~/.config/forja/local/**`.
- **Seguridad:** un archivo local nunca cambia lo que forja instala; solo lo que escribe en tu configuración.
- **Si el archivo está roto** (JSON inválido), `forja apply` se detiene con un error en vez de ignorarlo en silencio.

## Permisos

Los archivos de forja con datos de acceso o de cuenta se escriben en modo `0600` (solo tú): `~/.aws/config`, `~/.aws/credentials`, `~/.claude/settings.json`, `~/.config/zed/settings.json` y `~/.config/opencode/opencode.json`. Antes salían `0644` (legibles por otros usuarios del equipo).
