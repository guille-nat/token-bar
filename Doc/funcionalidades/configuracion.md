# Configuración: qué se muestra, presets y config portable
> Última actualización: 2026-10-22

## Qué hace
Todo lo que la banda muestra se elige desde la pestaña **Info** del panel (`/token-bar`, tecla `6`), se guarda solo y se puede **exportar a un JSON** y **importar en otra máquina**.

- **Presets** (`z`/`x`/`c`): `minima` (modelo, Sesión, Semana, ctx y rama; sin Clawd), `normal` (lo de siempre) y `completa` (todo, con costo y barras largas). Cambian varios interruptores de una vez; no tocan la línea de texto, los puntos ni la banda encendida/apagada.
- **Interruptores:** Modelo, Sesión, Semana, Fable, Contexto · Tokens ↑↓, Costo, Hora de reinicio · Rama, Sync ⇡⇣, Cambios ±, PR/MR, CI · Clawd (`m`), Comentarios (`s`), Animaciones (`n`).
- **Cortes de color** (`l`): desde dónde es amarillo, naranja y rojo: `50/75/90` (por defecto), `60/80/95` o `40/65/85`. El rojo es también el umbral donde el % late y Clawd avisa.
- **Exportar** (`e`) / **Importar** (`i`): guarda o lee `~/.config/token-bar/config.json`.
- Un dato oculto no da alertas: si ocultás Fable, Clawd no avisa de Fable.

## Llevarla a otra máquina o compartirla
1. En la máquina de origen: `/token-bar-config export` (o `e` en la pestaña Info). Escribe `~/.config/token-bar/config.json` y copia el JSON al portapapeles. Se puede dar otra ruta: `/token-bar-config export ~/dotfiles/token-bar.json`.
2. Llevá ese archivo (dotfiles, gist, lo que uses).
3. En la otra máquina, de cualquiera de estas formas:
   - `/token-bar-config import ~/dotfiles/token-bar.json`
   - `/token-bar-config import {"show":{"cost":true}}` (JSON pegado)
   - al instalar el mod, en la pantalla de opciones, poné **Archivo de configuración** con esa ruta: se importa solo la primera vez.

Un JSON hecho a mano puede traer solo algunos campos: lo que falta queda por defecto y las claves que no conoce se avisan y se ignoran. Ejemplo mínimo:

```json
{ "show": { "tokens": false, "cost": true }, "mascotOn": false, "levels": [60, 80, 95] }
```

## Comandos
| Comando | Qué hace |
| --- | --- |
| `/token-bar-config export [ruta]` | Guarda y copia la config. |
| `/token-bar-config import [ruta o JSON]` | La lee y la aplica. |
| `/token-bar-config preset minima\|normal\|completa` | Aplica un preset. |
| `/token-bar-config reset` | Vuelve a los valores por defecto. |

## Cómo funciona
- `hooks/config.ts` (puro, testeado): el tipo `Settings`, los presets, `readSettings` (tolerante: lo que falta o no es del tipo esperado queda por defecto), `exportConfig` y `parseConfig`.
- Se guarda en `$.store` (clave `settings`, con `v: 2`). Importar y exportar usan `$.fs` y `$.ui.copy`.
- `userConfig` en `plugin.json`: `preset` (picker: minima, normal, completa) y `configFile` (ruta opcional). **Solo cuentan la primera vez** (cuando no hay nada guardado, `seedSettings`); después manda lo que se cambia desde el panel. `configFile` pisa a `preset`; si no se puede leer, avisa con un toast y usa el preset.

## Decisiones y por qué
- **Decisión:** `userConfig` solo siembra la primera vez; no manda en cada sesión.
  **Por qué:** si mandara siempre, lo que cambiás en el panel se perdería al reiniciar. Para volver a aplicar el archivo está `import`.
- **Decisión:** la config exportada es el mismo objeto que se guarda, más `"tokenBar": "config"`.
  **Por qué:** una sola forma; lo exportado se importa idéntico (hay un test que lo prueba).
- **Decisión:** un archivo importado manda también sobre "banda encendida / línea de texto".
  **Por qué:** es una importación explícita; la migración v2 solo protege a los ajustes viejos, que no tienen `v`.
- **Decisión:** con densidad `auto` se suelta primero la hora de reinicio y recién después se achican las barras o se pasa a compacta.
  **Por qué:** al mostrar el reinicio siempre, la banda saltaba a compacta demasiado pronto.
- **Decisión:** los interruptores de repo solo actúan en la banda; la línea de texto bajo el prompt sigue mostrando todo.
  **Por qué:** está apagada por defecto y el engine no le da colores; no vale la pena duplicar la lógica.

## Cómo modificarlo
Para sumar un dato elegible: agregá su clave a `SHOW_KEYS`, `SHOW_LABELS` y `DEFAULT_SHOW` (`config.ts`), decidí en qué presets entra, y usalo con `settings.show.<clave>` en la banda. Tests: `tests/config.test.ts` (parte pura) y los de "Info" / "/token-bar-config" en `tests/register.test.ts`.

## Historial
- 2026-10-22: versión inicial (pestaña Info, presets, export/import, `userConfig`).
