---
name: forja-maintain
description: "Mantiene el setup de forja: añadir o quitar herramientas, detectar desvíos, capturar cambios hechos a mano y subir versiones fijadas. Úsala con 'añade X a mi setup', 'qué cambió en mi Mac', 'captura esto', 'actualiza forja'."
status: complete
---

# forja-maintain

Esta skill **no contiene lógica**: solo llama a la CLI `forja` y edita los archivos del repo de forja (`~/.local/share/forja`).

## Cuándo usarla
- "añade X a mi setup" / "quita X".
- "qué cambió", "por qué drift sale en rojo".
- "captura lo que instalé a mano".
- "actualiza forja" o "sube la versión del looper".

## Flujos

### Ver desvíos
1. `forja drift --json`. Resume por módulo: paquetes pendientes (`pending`) y checks fallidos (`failedChecks`).
2. Para cada desvío, decide con el usuario: ¿se aplica lo del repo (`forja apply <módulo>`) o se captura lo de la máquina (`forja capture`)?

### Capturar cambios hechos a mano
1. `forja capture --json` lista:
   - `packages`: instalado con brew fuera de los Brewfiles.
   - `files`: archivos cambiados en el disco.
   - `templates`: plantillas cambiadas.
2. Para cada paquete, propone el módulo por afinidad y confírmalo con el usuario. Luego ejecuta `forja capture` en la terminal del usuario: es interactivo y pregunta el módulo.
3. Las **plantillas** (`.tmpl`) no se re-añaden: integra el cambio en el sitio correcto:
   - Lo común a todas las máquinas de ese tipo, en el host (`hosts/<host>.toml`), como `[claude] allowed_domains`.
   - Lo personal, en el perfil (`~/.config/forja/profile.toml`), sin subirlo al repo.
   - Si no, en la plantilla.
4. Nunca captures secretos: `capture` ya filtra `~/.ssh`, `~/.aws/credentials`, `~/.config/op`, `*.local.*` y `~/.config/forja/local/`.

### Añadir una herramienta
1. Elige el módulo (`forja module ls`). Si no encaja en ninguno, propón uno nuevo con `module.toml`, `README.md` y `revert.md`.
2. Edita su `Brewfile` o su configuración en `home/`.
3. `forja plan <módulo>`, enséñaselo al usuario y, tras su «sí», `forja apply <módulo>`.

### Subir una versión fijada (looper, Floci…)
1. El ref de openspec-cascade vive en `cli/src/core/looper.ts` (`LOOPER_REF`). Cámbialo por el commit nuevo y revisa su changelog.
2. `forja apply looper` y `forja doctor`.

### Actualizar forja
`forja self update`. Después, `forja plan` para ver qué cambiaría.

## Al terminar cualquier cambio en el repo
- Rama nueva (`feat/<módulo>-…`), commit con Conventional Commits y scope de módulo (`feat(editor): …`), entrada en `CHANGELOG.md` (Unreleased) y PR con `gh pr create`.
- **Nunca** hagas push a `main` ni force-push.
- Para una idea que no se hace ahora: `forja backlog add "<texto>" --module <m>`.
