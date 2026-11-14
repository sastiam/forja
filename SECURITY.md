# Política de seguridad

## Versiones soportadas

| Versión | Soporte |
|---|---|
| `main` y la última release `0.x` | ✅ |
| Anteriores | ❌ |

## Reportar una vulnerabilidad

Usa **GitHub Private Vulnerability Reporting**: pestaña *Security* → *Report a vulnerability*. No abras un issue público.

Responderemos lo antes posible. Incluye versión de forja (`forja version`), pasos de reproducción e impacto.

## Alcance

forja ejecuta scripts con privilegios elevados en tu máquina, así que son prioritarios:

- `bootstrap.sh` y los pasos con `sudo` (`security`, `macos-base`, `macos-aggressive`).
- Ejecución de instaladores descargados (Homebrew, Claude Code, Hermes).
- Filtración de datos personales o secretos al repo (`capture`, `.gitignore`, gitleaks).
- Copia de `.env` reales a worktrees de agentes.

Fuera de alcance: vulnerabilidades de las herramientas de terceros que forja instala (repórtalas a sus proyectos).
