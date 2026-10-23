// Clawd dibujado en una región propia (`Client`) en vez de en botones: así un
// clic sobre el dibujo llega como evento del puntero sin que el engine invierta
// las celdas, como hace con un Button bajo el mouse. Cada clic se manda al
// módulo de hooks (`ui.message`), que decide la reacción.

import type { ClientModule, JsonValue } from 'claude-code'

/** Un tramo ya con sus colores resueltos: texto, color y fondo. */
export type ClawdSeg = { t: string; c?: string; b?: string }
export type ClawdProps = { rows: ClawdSeg[][] }

const ClawdClient: ClientModule<JsonValue> = (props, surface) => {
  const { Box, Text } = surface.elements
  const { rows } = props as unknown as ClawdProps
  surface.onPointer(e => {
    if (e.type === 'down' && e.button === 'left') surface.post({ tap: true })
  })
  return Box({
    flexDirection: 'column',
    children: rows.map((row, i) =>
      Box({
        key: `r${i}`,
        flexDirection: 'row',
        children: row.map(s =>
          Text({ ...(s.c === undefined ? {} : { color: s.c }), ...(s.b === undefined ? {} : { backgroundColor: s.b }), children: s.t }),
        ),
      }),
    ),
  })
}

export default ClawdClient
