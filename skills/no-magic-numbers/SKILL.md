---
name: no-magic-numbers
description: "Evita números y cadenas mágicas al escribir o revisar código: constantes con nombre y unidad. Úsala al escribir timeouts, límites, reintentos, tamaños, umbrales o códigos de estado, al revisar un diff, y cuando quality-guard avise de 'números mágicos'."
status: complete
---

# no-magic-numbers

Un número mágico es un literal cuyo significado no se ve en el código (`3600`, `0.8`, `429`). El lector tiene que adivinar qué es y en qué unidad, y cambiarlo obliga a buscar todas sus copias.

## Regla
1. Extrae el literal a una constante con **nombre de intención y unidad**: `SESSION_TTL_SECONDS = 3600`, `RETRY_LIMIT = 3`, `MAX_UPLOAD_BYTES = 5 * 1024 * 1024`, `LOW_BATTERY_PERCENT = 20`.
2. Ubicación, de menor a mayor alcance:
   - En el módulo que la usa, arriba del archivo (`const`, `UPPER_SNAKE_CASE`), si solo la usa él.
   - En un módulo de constantes del dominio (`limits.ts`, `constants.py`) si la comparten varios.
   - En configuración (variables de entorno, `project.toml`, contexto de CDK) si cambia por entorno. Nunca un secreto.
3. Prefiere tipos que ya llevan la semántica: enums o uniones (`HttpStatus.TooManyRequests`), `Duration.minutes(5)` en CDK, `timedelta(hours=1)` en Python.
4. Expresa el cálculo en lugar del resultado: `24 * 60 * 60` dice más que `86400`.

## Excepciones (no hace falta constante)
- `0`, `1`, `-1`, `2` como identidad, incremento o mitad; índices de array; `100` para porcentajes.
- Literales en **tests**: el valor esperado es la especificación (`expect(total).toBe(42)`).
- Valores iniciales de una declaración con nombre (`let retries = 0`) y valores de un objeto con clave descriptiva (`{ timeoutMs: 500 }`): la clave ya da el nombre.
- Fórmulas conocidas (`Math.PI * r ** 2`).

## Comprobación automática
| Lenguaje | Regla |
|---|---|
| TS/JS | Biome `style/noMagicNumbers` (`biome lint --only=style/noMagicNumbers`) o ESLint `no-magic-numbers` |
| Python | Ruff `PLR2004` (`ruff check --select PLR2004`) |
| Go | golangci-lint `mnd` |

El mod `quality-guard` corre la regla tras cada edición y te pasa los avisos **solo de las líneas que acabas de escribir**. Si un aviso es una excepción de la lista, ignóralo; no añadas comentarios `// biome-ignore` salvo que el usuario lo pida.

## Al revisar un diff
Señala cada literal nuevo sin nombre con la constante que propondrías, y nada más: no reescribas código ajeno al diff.
