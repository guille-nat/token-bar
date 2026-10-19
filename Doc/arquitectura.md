# Arquitectura
> Última actualización: 2026-10-19

## Eventos que escucha

| Evento | Para qué |
| :- | :- |
| `session.start` | Carga ajustes y contadores de `$.store`, registra los dos comandos, primer `usage()` y `model()`, lectura del repo sin esperarla, timer de 30 s (uso, modelo y repo) |
| `session.measure` | Refresca `usage()` y `model()` cuando el engine dice que algo se movió (el repo no: ver [repo.md](funcionalidades/repo.md)) |
| `turn.complete` | Suma `e.usage` (sumado sobre los requests del turno) a los contadores; separa subagentes por `e.agentId`; en el hilo principal, relee el repo |
| `session.end` (`reason: 'clear'`) | Reinicia contadores tras `/clear` |
| `ui.render` `AbovePrompt` | Mide columnas (`e.viewport.columns`) y, si está activada, dibuja la banda |
| `ui.render` `Pane` `token-bar` | El panel |
| `ui.render` `CommandOutput` de `token-bar-debug` | Dibuja el JSON del debug como bloque `Code` |
| `command.run` `token-bar` / `token-bar-debug` | Abre el panel / arma el reporte |

## Métodos de `$` que usa

`$.session` (`usage`, `id`, `model`, `repo`), `$.ui` (`status`, `open`, `invalidate`, `resolve`, `toast`), `$.store` (`get`, `set`), `$.clock` (`every`, `now`), `$.command` (`register`) y `$.process` (`run`: git, gh, glab). `claude plugin validate` lo confirma en la línea `calls:`.

## Decisiones y por qué
- **Decisión:** sin `$.state`; el estado vive en variables del módulo y se redibuja con `$.ui.invalidate('ui.render')`.
  **Por qué:** el usuario restringió el mod a `session/ui/store/clock/command`. `$.state` es lo que recomienda la skill para dibujar, pero no está en esa lista.
  **Alternativas descartadas:** `$.state` con `atom/read/update` (sobrevive al hot-reload sin `$.store`), descartado por la restricción.
- **Decisión:** se suma `$.process` a la lista permitida (2026-10-19).
  **Por qué:** el usuario lo habilitó para mostrar datos del repo (git, GitHub, GitLab); detalle en [repo.md](funcionalidades/repo.md). `$.state` sigue afuera.
- **Decisión:** el modelo se lee con `$.session.model()` en cada refresco, no solo al inicio.
  **Por qué:** `/model` puede cambiarlo a mitad de sesión y no hay un evento propio para eso.
- **Decisión:** los contadores se guardan en `$.store` bajo `counters` junto con el `sessionId`.
  **Por qué:** sin `$.state`, un hot-reload borra las variables del módulo; `$.store` se comparte entre sesiones, así que el id evita mezclar los contadores de otra sesión (si no coincide, arranca en cero).
- **Decisión:** tokens por turno desde `turn.complete` y no desde `turn.step`.
  **Por qué:** `turn.complete.usage` ya trae la suma del turno con los cuatro campos (`input_tokens`, `output_tokens`, `cache_read_input_tokens`, `cache_creation_input_tokens`) y `model`; `turn.step` obliga a un generador por request.
- **Decisión:** refresco por `session.measure` más un timer de 30 s.
  **Por qué:** pedido del usuario; `usage()` sin `breakdown` no cuesta nada (no consume el plan).
- **Decisión:** las columnas salen del `ui.render` de `AbovePrompt`, aunque la banda esté apagada.
  **Por qué:** `$.ui.status` no recibe el ancho; el render de la banda se dispara siempre en la terminal (verificado: con la banda apagada detectó 50 columnas). Respaldo: `presentation.columns` de `command.run`.

## Formas verificadas en los tipos (2.1.303) y en vivo
- `rateLimits[].percentUsed`: escala **0–100**, a lo sumo un decimal.
- `rateLimits[].resetsAt`: **string ISO 8601** (ej. `2026-10-19T16:50:00.000Z`), opcional.
- `context.percent`: entero 0–100, opcional; `context.window` llegó en 1.000.000.
- Kinds recibidos en vivo (Max 5x, 2026-10-19): solo `five_hour` y `seven_day`. **No vino ningún kind de Fable.** Los tipos y la doc solo nombran `five_hour`, `seven_day` y `spend_limit`.
- Los límites ya estaban presentes al iniciar la sesión, sin respuesta del modelo todavía (se mantiene el "--" para cuando vienen vacíos).
- El sandbox de hooks y tests corre con la zona local (`America/Argentina/Buenos_Aires`, offset 180).

## Historial
- 2026-10-19: versión inicial.
- 2026-10-19: `$.process`, `$.session.model` y `$.session.repo` (modelo y datos del repo).
