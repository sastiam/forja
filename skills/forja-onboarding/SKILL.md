---
name: forja-onboarding
description: "Entrevista de primera configuración: escribe el perfil local en ~/.config/forja. Úsala cuando 'forja setup' no encuentre perfil."
status: draft
---

# forja-onboarding (borrador, v0.2.0)

> status: draft — se completa en v0.2.0. Hasta entonces `forja setup --no-claude` usa un cuestionario de terminal.

Objetivo: entrevistar al usuario (host, perfiles trabajo/personal, identidad, carpetas de código, AWS SSO, módulos opcionales, notificaciones) y escribir `~/.config/forja/profile.toml` y los archivos de `~/.config/forja/local/`.

Reglas: no escribe secretos (usa referencias `op://`); no ejecuta `apply` (lo hace la CLI tras confirmación); nada de lo generado se sube al repo.
