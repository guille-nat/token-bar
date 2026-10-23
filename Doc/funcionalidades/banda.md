# Banda sobre el prompt (vista por defecto)
> Última actualización: 2026-10-23

## Qué hace
Una fila con colores reales sobre el prompt:

`✻ Opus 5.5 │ Sesión ━━╸─── 23% ↻ 1:50 p. m. │ Semana ━━━━╸─ 76% │ ctx ━╸──── 12% │ ↑12,3k ↓4,5k │ ⎇ main ⇡2 ±3 #12 ✓   panel`

- **Destello de Claude** (`✻`, naranja `#D97757`): quieto en reposo; mientras corre un turno gira `· ✢ ✳ ✶ ✻ ✽` de ida y vuelta, como el spinner de Claude Code.
- **Brillo sobre el modelo:** mientras corre un turno, una letra más clara (`#FBD3BF`) recorre el nombre del modelo.
- **Barras finas** `━╸─` con media celda, del color del nivel de uso (verde, amarillo, naranja, rojo). Al abrir la sesión se llenan desde 0 y, cuando un valor cambia, se deslizan hasta el nuevo.
- **Pulso al límite:** desde 90 % el porcentaje late cada medio segundo.
- **Interactiva:** `panel` (tecla `t` con la banda enfocada, o un clic) abre `/token-bar`. La banda se enfoca con un clic o ctrl+x tab.
- La densidad (`auto`, compacta, media, completa) sale del ancho de la banda (`levelFor`), igual que antes.

### Clawd, compañero de desarrollo
A la izquierda de los medidores (`hooks/mascot.ts`), en un lienzo de 3 filas × 11 columnas: el cuerpo en las 9 del medio y una columna de partículas a cada lado (corazones, confeti, zzz, flechas, el destello que orbita). Reacciona a lo que pasa en la sesión:

- **Al abrir:** saluda según la hora ("¡Hola! ¡buen día!", "¿noche de código?").
- **Mientras escribís:** te sigue con los ojos ("te leo…"). Al mandar el prompt salta ("¡a darle!").
- **Mientras trabaja:** dice qué hace según la herramienta (`activityOf`): "leyendo register.tsx", "editando mascot.ts", "buscando «foo»", "corriendo npm", "git push…", "mirando docs.github.com", "ayudante: …". Si lee o busca mueve los ojos; si edita o corre comandos teclea; el destello de Claude orbita alrededor. Pasados 90 s transpira y cada tanto lo comenta ("esto viene largo…").
- **Cuando termina una herramienta** (`outcomeOf`): tests que pasan → confeti y "¡tests en verde!"; tests que fallan → triste; `git commit` → "¡commit hecho!"; `git push` → flechas ⇡ y "¡pusheado!"; cualquier otro error → se sacude ("uy…").
- **Al terminar el turno:** festeja con confeti ("¡listo!"); si lo frenaste, "ok, freno"; si falló, triste.
- **Clic sobre Clawd:** corazones ♥ y "¡jeje!". Muchos clics seguidos: "¡ya, ya! a trabajar".
- **3 minutos sin nada:** se duerme (zzz que suben); lo próximo que pase lo despierta ("¡eh! ¡volviste!").
- **En reposo:** parpadea, mira a los costados, salta, baila con ♪ ♫ y se estira.
- **Un medidor ≥90 %:** un `!` rojo titila y dice "¡ojo! Semana al 93%". Desde 75 %: "conviene dosificar".

Prioridad: reacción reciente > trabajando > alerta > te mira escribir > dormido > bucle en reposo. Con animaciones apagadas queda quieto, sin reacciones, pero sigue avisando de los límites.

Se apaga con `m` en Ajustes y se esconde sola si la banda mide menos de 40 columnas. El reloj redibuja solo cuando cambia el cuadro (`key`), no en cada tick.

**Eventos que escucha** (`hooks/register.tsx`): `session.start` (saludo), `prompt.edit` y `prompt.submit` (te mira, salta), `turn.start` y `turn.complete` (empieza a trabajar, festeja), `tool.call` (qué hace y cómo salió; nunca cambia la llamada y, si algo de Clawd fallara, la herramienta corre igual). Cada fila de Clawd es un `Button` para el clic.

**Layout:** 3 filas. A la izquierda Clawd (3 filas, 11 columnas) con, a su lado, el modelo y su comentario (`╰ trabajando…`, `╰ ¡Hola!`): van juntos para que se entienda que lo hace Claude. Esa columna tiene ancho fijo (`SAY_WIDTH`) y su fila de comentario siempre está reservada. Después, una raya vertical `│` (de 2 filas, las que tienen contenido) y los datos fijos: medidores, y debajo tokens + repo + `panel`. Como el comentario no comparte fila con los datos, estos no se mueven cuando Clawd habla. El efecto (♪, destello, `¡ojo!`) va como prefijo del comentario; Clawd ya no tiene fila de efectos, de ahí que sea 3 filas en vez de 4.

## Cómo funciona
- `ui.render` `AbovePrompt` en `hooks/register.tsx`; los helpers puros (`lineBar`, `sparkFrame`, `shimmerIndex`, `easeToward`) en `hooks/format.ts`.
- Un reloj de 100 ms (`tick`) avanza el cuadro, acerca cada barra a su valor (`shown`) y llama a `$.ui.invalidate('ui.render')` **solo** si algo se mueve: un turno en curso, una barra llenándose o un medidor ≥90 % (cada 5 cuadros). En reposo no redibuja nada.
- `isWorking` se toma de la prop de la banda en cada dibujo.
- El panel usa las mismas barras animadas (la clave de animación es el `kind`, o `ctx`).

## Decisiones y por qué
- **Decisión:** Clawd reacciona a eventos reales (herramientas, prompt, fin de turno) en vez de un bucle fijo, y duerme solo tras 3 min sin actividad.
  **Por qué:** la idea es un compañero de desarrollo: que cuente qué hace Claude y celebre o lamente lo que pasa, sin estorbar. El bucle queda para el reposo.
  **Alternativa descartada:** sonidos y toasts por cada evento; demasiado ruido.
- **Decisión:** el lienzo pasa de 9 a 11 columnas, con una columna de partículas a cada lado y colores por tramo.
  **Por qué:** el confeti, los corazones y el destello que orbita necesitan lugar y color propio sin tapar el cuerpo.
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
- 2026-10-23: Clawd compañero de desarrollo: reacciona a herramientas, tests, commits, push, errores, al prompt y a clics; partículas de color y siesta tras 3 min.
- 2026-10-22: Clawd de 3 filas; comentario junto a Clawd y datos separados por una raya.
- 2026-10-22: los comentarios de Clawd pasan a una fila propia para que la info no se mueva.
- 2026-10-22: Clawd animado en bucle, con frases según el estado.
- 2026-10-22: banda rediseñada con animaciones y pasa a ser la vista por defecto.
