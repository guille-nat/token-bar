# Banda sobre el prompt (vista por defecto)
> Última actualización: 2026-10-22

## Qué hace
Una fila con colores reales sobre el prompt:

`✻ Opus 5.5 │ Sesión ━━╸─── 23% ↻ 1:50 p. m. │ Semana ━━━━╸─ 76% │ ctx ━╸──── 12% │ ↑12,3k ↓4,5k │ ⎇ main ⇡2 ±3 #12 ✓   panel`

- **Destello de Claude** (`✻`, naranja `#D97757`): quieto en reposo; mientras corre un turno gira `· ✢ ✳ ✶ ✻ ✽` de ida y vuelta, como el spinner de Claude Code.
- **Brillo sobre el modelo:** mientras corre un turno, una letra más clara (`#FBD3BF`) recorre el nombre del modelo.
- **Barras finas** `━╸─` con media celda, del color del nivel de uso (verde, amarillo, naranja, rojo). Al abrir la sesión se llenan desde 0 y, cuando un valor cambia, se deslizan hasta el nuevo.
- **Pulso al límite:** desde 90 % el porcentaje late cada medio segundo.
- **Interactiva:** `panel` (tecla `t` con la banda enfocada, o un clic) abre `/token-bar`. La banda se enfoca con un clic o ctrl+x tab.
- La densidad (`auto`, compacta, media, completa) sale del ancho de la banda (`levelFor`), igual que antes.

### Clawd, el bichito de Claude Code
A la izquierda de los medidores, en 4 filas de medios bloques (`hooks/mascot.ts`), en bucle (~17 s por vuelta): saluda ("¡Hola!"), parpadea, mira a los costados, salta ("¡hop!"), baila con ♪ ♫ y se echa una siesta (zzz…). Al lado dice algo según el estado:
- **turno corriendo:** teclea con el destello de Claude girando sobre la cabeza ("trabajando…");
- **un medidor ≥90 %:** un `!` rojo y "¡ojo! Semana al 93%";
- **el más alto ≥75 %:** "conviene dosificar".

Se apaga con `m` en Ajustes y se esconde sola si la banda mide menos de 60 columnas. El reloj redibuja solo cuando cambia la pose (`key` del cuadro), no en cada tick.

**Layout:** 3 filas. A la izquierda Clawd (3 filas) con, a su lado, el modelo y su comentario (`╰ trabajando…`, `╰ ¡Hola!`): van juntos para que se entienda que lo hace Claude. Esa columna tiene ancho fijo (`SAY_WIDTH`) y su fila de comentario siempre está reservada. Después, una raya vertical `│` (de 2 filas, las que tienen contenido) y los datos fijos: medidores, y debajo tokens + repo + `panel`. Como el comentario no comparte fila con los datos, estos no se mueven cuando Clawd habla. El efecto (♪, destello, `¡ojo!`) va como prefijo del comentario; Clawd ya no tiene fila de efectos, de ahí que sea 3 filas en vez de 4.

## Cómo funciona
- `ui.render` `AbovePrompt` en `hooks/register.tsx`; los helpers puros (`lineBar`, `sparkFrame`, `shimmerIndex`, `easeToward`) en `hooks/format.ts`.
- Un reloj de 100 ms (`tick`) avanza el cuadro, acerca cada barra a su valor (`shown`) y llama a `$.ui.invalidate('ui.render')` **solo** si algo se mueve: un turno en curso, una barra llenándose o un medidor ≥90 % (cada 5 cuadros). En reposo no redibuja nada.
- `isWorking` se toma de la prop de la banda en cada dibujo.
- El panel usa las mismas barras animadas (la clave de animación es el `kind`, o `ctx`).

## Decisiones y por qué
- **Decisión:** la banda pasa a ser la vista por defecto y la línea de texto bajo el prompt se apaga (ajustes v2).
  **Por qué:** el engine dibuja esa línea entera en amarillo con `⚠ token-bar:` y no acepta colores; en Linux, además, los emojis de nivel salían como círculos huecos por la fuente. La banda acepta colores de tema y hex.
  **Migración:** los ajustes guardados sin `v: 2` conservan densidad, repo y puntos, pero toman `bandOn: true` y `statusOn: false`. La línea se puede volver a prender con `b` en Ajustes.
- **Decisión:** solo caracteres de cajas y símbolos básicos (`━ ╸ ─ ↻ ⎇ ✻`), sin emojis ni Nerd Fonts.
  **Por qué:** se ven igual en cualquier fuente monoespaciada de Linux.
- **Decisión:** el porcentaje muestra el valor real al instante; solo la barra se anima.
  **Por qué:** el número nunca miente mientras la animación corre.

## Cómo modificarlo
Colores en `CLAUDE_ORANGE`/`CLAUDE_GLOW`, cuadros en `SPARK_FRAMES`, velocidad en `FRAME_MS` y `easeToward`. Tests: "animaciones…", "la banda está encendida por defecto…" y "ajustes de antes de v2…" en `tests/register.test.ts`.

## Historial
- 2026-10-22: Clawd de 3 filas; comentario junto a Clawd y datos separados por una raya.
- 2026-10-22: los comentarios de Clawd pasan a una fila propia para que la info no se mueva.
- 2026-10-22: Clawd animado en bucle, con frases según el estado.
- 2026-10-22: banda rediseñada con animaciones y pasa a ser la vista por defecto.
