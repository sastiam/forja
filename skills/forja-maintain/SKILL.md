---
name: forja-maintain
description: "Mantiene el setup: añadir herramientas, detectar desvíos, capturar cambios. Úsala con 'añade X a mi setup', 'qué cambió', 'captura esto'."
status: draft
---

# forja-maintain (borrador, v0.2.0)

> status: draft — depende de `forja capture` (v0.2.0).

Usa `forja drift`, `forja capture`, `forja module info` y `forja backlog add`. Para añadir una herramienta: elegir módulo → editar Brewfile/config → `forja plan` → `forja apply <módulo>` → proponer commit Conventional Commits en una rama + PR (nunca push a `main`).
