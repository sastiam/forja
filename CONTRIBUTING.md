# Contribuir a forja

Gracias por querer mejorar forja. Este documento resume lo necesario.

## Regla de oro: sin datos personales

El repo es **público y agnóstico**: nada de emails, cuentas, nombres de empresa, dominios internos ni secretos. Lo personal vive en `~/.config/forja/` (ver `docs/SPEC.md` §2.2). Usa `@example.invalid` en fixtures. El job de CI `agnostic` y `gitleaks` lo verifican.

## Entorno

```sh
mise install        # Node fijado en mise.toml (o usa Node >= 22.18)
npm ci
npm test            # node:test, sin build
npm run typecheck   # tsc --noEmit (erasableSyntaxOnly)
npm run lint        # Biome
sh scripts/check-agnostic.sh
```

La CLI se ejecuta directamente con Node (`node cli/src/main.ts`): usa solo sintaxis TypeScript "borrable" (sin `enum`, sin `namespace` con valores, sin parameter properties) y **cero dependencias de runtime**.

## Commits y PR

- [Conventional Commits](https://www.conventionalcommits.org/) con scope de módulo: `feat(git): …`, `fix(wt): …`, `docs: …`.
- Una rama por cambio y un PR hacia `main`; rellena la plantilla (tests, `forja plan`, docs/ADR, sin datos personales, CHANGELOG).
- Nunca push directo a `main`.

## Crear un módulo

1. Crea `modules/<nombre>/` con `module.toml` (ver `docs/SPEC.md` §2.5), `README.md` (qué hace y por qué), `revert.md` (cómo deshacerlo) y, si aplica, `Brewfile` y `apply.ts` (exporta `plan`, `apply`, `check`).
2. Si instala archivos de configuración, colócalos en `home/` (único source dir de chezmoi), declara las rutas en `targets` y añade su bloque a `home/.chezmoiignore.tmpl`.
3. Añade el módulo a `hosts/<host>.toml` si debe habilitarse por defecto.
4. Toda acción con efectos pasa por un `Runner` (soporta `dryRun`). Añade tests.
5. Regenera la tabla: `node scripts/gen-modules-doc.ts`.
6. Si tomas una decisión de diseño, documenta un ADR en `docs/adr/`.

## Escribir una skill

`skills/<nombre>/SKILL.md` con frontmatter `name` y `description`. Las skills **no contienen lógica**: explican cuándo usar cada comando de `forja`, cómo interpretar `--json` y qué preguntar al usuario.

## Claves no verificadas

Si no estás seguro de una clave de configuración (Zed, Ghostty, OpenCode, Claude Code), deja `# VERIFICAR: <qué y dónde>` en lugar de inventarla.
