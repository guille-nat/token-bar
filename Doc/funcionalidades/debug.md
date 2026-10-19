# `/token-bar-debug`
> Última actualización: 2026-10-19

## Qué hace
Imprime un JSON con: `usage()` crudo, el modelo (crudo y como se muestra), los `kind` de `rateLimits` con su etiqueta, si vino Fable, los campos numéricos del último `turn.complete` (aplanados: `usage.input_tokens`, `durationMs`…), los contadores, el estado del repo (`repo`, con `forgeError` si gh/glab fallaron), las columnas detectadas (terminal, banda, panel, comando), el nivel efectivo de la barra, los ajustes, la zona horaria y la última línea de estado.

## Decisiones y por qué
- **Decisión:** la salida se dibuja con un hook `ui.render` en `CommandOutput` que devuelve un `Code` JSON.
  **Por qué:** verificado en vivo, la fila de salida de un comando juntaba todas las líneas en un párrafo ilegible.
- **Decisión:** `presentation?.columns` con optional chaining.
  **Por qué:** el engine siempre lo estampa, pero en los tests puede faltar y el hook se saltaba entero.

## Historial
- 2026-10-19: versión inicial.
- 2026-10-19: campos `modelo` y `repo`.
