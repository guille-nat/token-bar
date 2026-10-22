import { describe, expect, test } from 'claude-code/testing'

import { LOOP_TICKS, loopPose, mascotFrame } from '../hooks/mascot'

const CALM = { isWorking: false, alert: null, maxPct: 20 }

describe('Clawd', () => {
  test('todas las poses miden 4 filas de 9 columnas', () => {
    for (let t = 0; t < LOOP_TICKS; t++) {
      for (const mood of [CALM, { ...CALM, isWorking: true }, { ...CALM, alert: { label: 'Semana', pct: 93 } }]) {
        const f = mascotFrame(t, mood)
        expect(f.rows.length).toBe(4)
        for (const row of f.rows) expect([...row].length).toBe(9)
      }
    }
  })

  test('arranca saludando, después baila, duerme y vuelve a empezar', () => {
    expect(mascotFrame(0, CALM).say).toBe('¡Hola!')
    const poses = new Set(Array.from({ length: LOOP_TICKS }, (_, t) => loopPose(t)))
    for (const p of ['waveUp', 'blink', 'lookLeft', 'jump', 'danceA', 'sleepA']) expect(poses.has(p as never)).toBe(true)
    expect(loopPose(LOOP_TICKS)).toBe(loopPose(0))
  })

  test('trabajando gira el destello; al límite avisa cuál', () => {
    const a = mascotFrame(0, { ...CALM, isWorking: true })
    const b = mascotFrame(1, { ...CALM, isWorking: true })
    expect(a.say).toBe('trabajando…')
    expect(a.rows[0]).not.toBe(b.rows[0])
    expect(mascotFrame(50, { ...CALM, alert: { label: 'Semana', pct: 92.6 } }).say).toBe('¡ojo! Semana al 93%')
  })
})
