# Panel `/token-bar` y banda sobre el prompt
> Última actualización: 2026-10-19

## Qué hace
`/token-bar` abre un pane con cinco pestañas: 1 Límites (con el modelo arriba), 2 Tokens, 3 Ajustes, 4 Repo ([repo.md](repo.md)) y 5 Leyenda. Las barras se pintan por nivel de uso y el nombre de cada medidor tiene su propio color. Esc lo cierra. La banda sobre el prompt (apagada por defecto) muestra en una fila el modelo, los límites, ctx y el resumen del repo.

## Cómo funciona
- `command.run` → `$.ui.open({ id: 'token-bar', focus: true, closeOnEscape: true })`; el `ui.render` del `Pane` dibuja la pestaña activa (`tab`, variable del módulo).
- Botones, todos `plain` con `hotkey`: `1`–`5` pestañas, `u` refrescar (uso, modelo y repo forzado), y en Ajustes `b` barra inferior, `a` banda, `d` densidad (auto → compacta → media → completa), `p` puntos de color en la barra, `g` datos del repo, `r` reiniciar contadores.
- Los ajustes (`statusOn`, `bandOn`, `density`, `dotsOn`, `repoOn`) se guardan en `$.store` bajo `settings`; los que faltan toman el valor por defecto (los dos nuevos, activados).
- Colores (`hooks/format.ts`):
  - Nivel de uso, `USAGE_LEVELS`: 🟢 <50% holgado (`success`), 🟡 50–74% a mitad (`warning`), 🟠 75–89% atención (`claude`), 🔴 ≥90% al límite (`error`).
  - Nombre del medidor, `kindColor`: Sesión `suggestion`, Semana `merged`, Fable `planMode`, Gasto `permission`, Contexto `ide` (`CONTEXT_COLOR`), modelo `claude`.
- La Leyenda sale de `USAGE_LEVELS` y `kindColor`, así no queda desfasada si cambian los umbrales.
- La banda (`ui.render` `AbovePrompt`) incluye `await next(e)` como último hijo, así no pisa la banda de otros mods. Se aparta si hay una encuesta (`hasSurvey`).
- Si `rateLimits` no trae un kind con "fable", la pestaña Límites lo dice en amarillo y lista los kinds recibidos.

## Decisiones y por qué
- **Decisión:** colores con las claves del tema, no RGB fijos.
  **Por qué:** siguen el tema del usuario (verificado: 13% se pintó con el verde del tema).
- **Decisión:** 4 niveles (corte en 50/75/90) en vez de 3 (70/90). (Reemplaza el 2026-10-19 a: verde <70, amarillo 70–89, rojo ≥90.)
  **Por qué:** pedido del usuario, colores "con niveles de avance" que se entiendan de un vistazo; el naranja avisa antes del rojo.
- **Decisión:** dos ejes de color: el nombre por tipo de medidor y la barra por nivel, más una pestaña Leyenda.
  **Por qué:** pedido del usuario, saber "qué es cada uno" a simple vista sin leer la etiqueta.
- **Decisión:** "Refrescar" y "Esc cierra" van en la fila de pestañas, no al pie.
  **Por qué:** verificado en vivo, el pane inline toma un tercio de la altura y el pie quedaba fuera de vista.
- **Decisión:** por debajo de 80 columnas de cuerpo, la hora de reinicio baja a su propia línea.
  **Por qué:** a 46 columnas, la fila partía la barra y el texto a la mitad.
- **Decisión:** el panel separa los tokens del hilo principal de los de subagentes.
  **Por qué:** los subagentes también consumen plan, pero mezclados confunden el "último turno".

## Cómo modificarlo
Las teclas no pueden repetirse dentro de un mismo dibujo (gana la última). Los tests de `tests/register.test.ts` presionan por `key` (`tab-tokens`, `tab-repo`, `tab-legend`, `toggle-band`, `toggle-dots`, `toggle-repo`, `density`, `reset`, `refresh`): si renombrás una key, actualizalos. Los umbrales se cambian solo en `USAGE_LEVELS`.

## Historial
- 2026-10-19: versión inicial.
- 2026-10-19: modelo, pestañas Repo y Leyenda, 4 niveles de color, color por medidor, ajustes `p` y `g`.
