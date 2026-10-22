# Barra de estado bajo el prompt
> Última actualización: 2026-10-22

> Desde 2026-10-22 viene **apagada por defecto**: la vista principal es la banda ([banda.md](banda.md)). Se prende con `b` en Ajustes.

## Qué hace
Una línea de texto plano con `$.ui.status(text)`: modelo, un punto de color por nivel de uso, barras █░, % usado, hora de reinicio en 12 h es-AR, % de contexto, tokens entrada/salida de la sesión y el resumen del repo ([repo.md](repo.md)).

## Cómo funciona
`updateStatus` en `hooks/register.tsx` llama a `fitStatusLine` (`hooks/format.ts`), que arma la línea en tres niveles:

- **compacta:** `Opus · 🟢S 13% · 🟢W 1% · ⚪ctx -- · main ✓`
- **media:** `Opus 5.5 · 🟢 Sesión █░░░░░ 13% 1:50 p. m. · 🟢 Semana ░░░░░░ 1% lun 7:00 a. m. · 🟢 ctx 12% · ↑12,3k ↓4,5k · main ⇡2 ±3 #12 ✓`
- **completa:** igual, con barras de 10 y el costo `US$ 0,42`

Los puntos (`dotFor`) siguen los 4 niveles de `USAGE_LEVELS` (ver [panel.md](panel.md)); ⚪ es "sin dato". Se apagan con `p` en Ajustes. El modelo sale de `$.session.model()` y `formatModel` lo acorta (`claude-opus-5-5` → `Opus 5.5`).

Solo se llama a `status` si el texto cambió.

## Decisiones y por qué
- **Decisión:** en `auto` se elige el nivel más detallado cuyo texto entra en `columnas − 15`.
  **Por qué:** verificado en vivo, el engine antepone `  ⚠ token-bar: ` (15 columnas) y corta con `…` lo que no entra. Con umbrales fijos de columnas, la media se cortaba.
  **Alternativas descartadas:** umbrales fijos 80/120 (primera versión); siguen en `levelFor`, que usa la banda.
- **Decisión:** se limpia con `status(undefined)`, nunca con `status('')`.
  **Por qué:** verificado en vivo, `status('')` deja una fila vacía `token-bar:`; solo `undefined` la saca.
- **Decisión:** sin colores en la barra.
  **Por qué:** verificado en vivo, el ESC de una secuencia ANSI se reemplaza por U+FFFD (se ve `�[31m`) y el engine pinta toda la línea en ámbar con `⚠`. Los colores van en la banda y el panel.
- **Decisión:** el nivel de uso se muestra con emojis de color (🟢🟡🟠🔴), que no son ANSI.
  **Por qué:** pedido del usuario, ver el nivel a simple vista también en la barra. Un emoji mide 2 en `.length` y ocupa 2 columnas, así que `fitStatusLine` sigue midiendo bien. Verificado en vivo en Linux: sin fuente de emojis a color salen como círculos huecos; por eso la línea pasó a estar apagada por defecto.
- **Decisión:** el modelo va primero y el repo al final.
  **Por qué:** si la terminal corta con `…`, lo último que se pierde es lo que más se mira (modelo y límites).
- **Decisión:** "lun 7:00 a. m." hasta 7 días adelante (inclusive) y "dd/mm" más lejos.
  **Por qué:** el reinicio semanal cae exactamente a 7 días cuando hoy es el mismo día de la semana (un lunes, el reinicio del lunes siguiente).
- **Decisión:** sin límites (`rateLimits` vacío) se muestra `Sesión -- · Semana --`.
  **Por qué:** pedido del usuario; no se inventa un número.
- **Decisión:** las horas se formatean a mano con `getTimezoneOffset`, no con `Intl`.
  **Por qué:** función pura y determinista en los tests, con el formato exacto pedido ("1:50 p. m."), sin depender de los datos de locale del sandbox.

## Cómo modificarlo
Los textos están en `statusLine` y las etiquetas en `labelFor` (`format.ts`). Los tests están en `tests/format.test.ts` ("línea de estado", "auto elige…"). Si el engine cambia su prefijo, ajustá `STATUS_PREFIX`.

## Historial
- 2026-10-19: versión inicial; pasó de umbrales fijos a "lo que entra" después de verlo en vivo.
- 2026-10-19: modelo, puntos de nivel y tramo del repo.
- 2026-10-22: apagada por defecto; la banda la reemplaza.
