---
name: tdd
description: "Desarrollo guiado por tests: rojo, verde, refactor. Úsala al implementar una funcionalidad o corregir un bug, antes de escribir código de producción, y cuando tdd-guard bloquee una edición con 'escribe primero un test que falle'."
status: complete
---

# tdd

Primero el test que falla, después el código mínimo que lo pasa, después limpiar. El mod `tdd-guard` lo hace cumplir: bloquea editar código de producción hasta que la sesión haya tocado un test.

## Ciclo
1. **Rojo.** Escribe **un** test para el siguiente comportamiento, por su interfaz pública (entrada → salida o efecto observable), no por su implementación.
2. **Ejecútalo y míralo fallar.** Debe fallar por la razón correcta: la aserción, no un import roto ni un error de tipos. Si pasa sin cambios, el test no prueba nada nuevo: cámbialo.
3. **Verde.** Escribe el código mínimo para pasarlo. Nada de casos que ningún test pide.
4. **Ejecuta toda la suite** del área (no solo el test nuevo).
5. **Refactor** con la suite en verde: nombres, duplicación, constantes (skill `no-magic-numbers`). Vuelve a ejecutar.
6. Repite con el siguiente comportamiento. Commit cuando la suite esté verde.

## Bugs
Primero un test que **reproduce** el bug y falla. Después el arreglo. El test se queda como regresión.

## Runners habituales
| Stack | Un test | La suite |
|---|---|---|
| Node (node:test) | `node --test ruta/a.test.ts` | `pnpm -s test` |
| Vitest | `pnpm vitest run ruta -t "nombre"` | `pnpm -s test` |
| Python | `pytest ruta::test_x -q` | `pytest -q` |
| Go | `go test ./pkg -run TestX` | `go test ./...` |
| CDK | test de aserciones (`Template.fromStack`) | `pnpm -s test` |

## Qué testear y qué no
- Sí: reglas de negocio, bordes (vacío, límite, error), contratos entre módulos, regresiones.
- Con dobles solo en los bordes (red, reloj, AWS: usa Floci antes que mocks cuando el test es de integración).
- No: getters triviales, el framework, ni el mock que tú mismo configuraste.

## tdd-guard
- `/tdd status` muestra el modo, los tests tocados y el último resultado (rojo/verde).
- Spikes, prototipos o cambios sin comportamiento (renombrar, mover): el **usuario** decide `/tdd off`. No lo pidas para saltarte el ciclo.
- Config, docs, tipos `.d.ts` y archivos generados no se bloquean.
