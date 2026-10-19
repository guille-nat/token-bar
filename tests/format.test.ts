import { describe, expect, test } from 'claude-code/testing'

import {
  bar,
  dotFor,
  emptyCounters,
  fitStatusLine,
  formatInt,
  formatModel,
  kindColor,
  formatPct,
  formatReset,
  formatTokens,
  labelFor,
  levelFor,
  nextDensity,
  numericFields,
  sortLimits,
  statusLine,
  toneFor,
  type Usage,
} from '../hooks/format'

// 2026-10-19 (lunes) 12:00 en Argentina (UTC−3, offset 180).
const NOW = Date.parse('2026-10-19T12:00:00-03:00')
const AR = () => 180

describe('etiquetas', () => {
  test('mapea los kinds conocidos y deja legibles los demás', () => {
    expect(labelFor('five_hour')).toBe('Sesión')
    expect(labelFor('seven_day')).toBe('Semana')
    expect(labelFor('seven_day_fable')).toBe('Fable semanal')
    expect(labelFor('FABLE_weekly')).toBe('Fable semanal')
    expect(labelFor('seven_day_opus')).toBe('Semana Opus')
    expect(labelFor('spend_limit')).toBe('Gasto')
    expect(labelFor('monthly_credits')).toBe('Monthly Credits')
  })

  test('ordena Sesión, Semana, Fable y después el resto', () => {
    const sorted = sortLimits([
      { kind: 'zeta', percentUsed: 1 },
      { kind: 'seven_day_fable', percentUsed: 1 },
      { kind: 'seven_day', percentUsed: 1 },
      { kind: 'five_hour', percentUsed: 1 },
    ])
    expect(sorted.map(l => l.kind)).toEqual(['five_hour', 'seven_day', 'seven_day_fable', 'zeta'])
  })
})

describe('números', () => {
  test('barras, porcentajes y tokens', () => {
    expect(bar(0, 5)).toBe('░░░░░')
    expect(bar(50, 10)).toBe('█████░░░░░')
    expect(bar(140, 4)).toBe('████')
    expect(formatPct(23.5)).toBe('24%')
    expect(formatPct(undefined)).toBe('--')
    expect(formatTokens(950)).toBe('950')
    expect(formatTokens(12_345)).toBe('12,3k')
    expect(formatTokens(1_250_000)).toBe('1,3M')
    expect(formatInt(1234567)).toBe('1.234.567')
  })

  test('cuatro niveles de color y su punto', () => {
    expect(toneFor(49.9)).toBe('success')
    expect(toneFor(50)).toBe('warning')
    expect(toneFor(74.9)).toBe('warning')
    expect(toneFor(75)).toBe('claude')
    expect(toneFor(89.9)).toBe('claude')
    expect(toneFor(90)).toBe('error')
    expect([0, 50, 75, 90, 120].map(dotFor)).toEqual(['🟢', '🟡', '🟠', '🔴', '🔴'])
    expect(dotFor(undefined)).toBe('⚪')
  })

  test('cada medidor tiene su color de nombre', () => {
    expect(kindColor('five_hour')).toBe('suggestion')
    expect(kindColor('seven_day')).toBe('merged')
    expect(kindColor('seven_day_opus')).toBe('merged')
    expect(kindColor('seven_day_fable')).toBe('planMode')
    expect(kindColor('otro')).toBe('text')
  })
})

describe('modelo', () => {
  test('nombre corto legible', () => {
    expect(formatModel('claude-opus-5-5')).toBe('Opus 5.5')
    expect(formatModel('claude-sonnet-5-5[1m]')).toBe('Sonnet 5.5 1M')
    expect(formatModel('claude-haiku-4-5-20251001')).toBe('Haiku 4.5')
    expect(formatModel('claude-3-5-haiku-20241022')).toBe('Haiku 3.5')
    expect(formatModel('Opus 5.5')).toBe('Opus 5.5')
    expect(formatModel(null)).toBe('--')
  })
})

describe('hora de reinicio en 12 h es-AR', () => {
  test('hoy, otro día de la semana y más lejos', () => {
    expect(formatReset('2026-10-19T16:50:00Z', NOW, 180)).toBe('1:50 p. m.')
    expect(formatReset('2026-10-26T10:00:00Z', NOW, 180)).toBe('lun 7:00 a. m.')
    expect(formatReset('2026-10-27T10:00:00Z', NOW, 180)).toBe('27/10 7:00 a. m.')
    expect(formatReset('2026-10-20T03:05:00Z', NOW, 180)).toBe('mar 12:05 a. m.')
    expect(formatReset('2026-10-25T15:00:00Z', NOW, 180)).toBe('dom 12:00 p. m.')
    expect(formatReset(undefined, NOW, 180)).toBe('--')
    expect(formatReset('no es fecha', NOW, 180)).toBe('--')
  })

  test('el lunes 7:00 a. m. de la semana que viene, visto desde el martes', () => {
    const tuesday = Date.parse('2026-10-20T09:00:00-03:00')
    expect(formatReset('2026-10-26T10:00:00Z', tuesday, 180)).toBe('lun 7:00 a. m.')
  })
})

describe('densidad', () => {
  test('auto según columnas y ciclo de valores', () => {
    expect(levelFor('auto', 60)).toBe('compacta')
    expect(levelFor('auto', 100)).toBe('media')
    expect(levelFor('auto', 160)).toBe('completa')
    expect(levelFor('auto', null)).toBe('media')
    expect(levelFor('compacta', 200)).toBe('compacta')
    expect(nextDensity('auto')).toBe('compacta')
    expect(nextDensity('completa')).toBe('auto')
  })
})

describe('línea de estado', () => {
  const usage: Usage = {
    startedAt: 0,
    context: { tokens: 24_000, window: 200_000, percent: 12 },
    rateLimits: [
      { kind: 'seven_day', percentUsed: 41, resetsAt: '2026-10-20T10:00:00Z' },
      { kind: 'five_hour', percentUsed: 23, resetsAt: '2026-10-19T16:50:00Z' },
    ],
    cost: { usd: 1.5 },
  }
  const counters = { ...emptyCounters(), main: { input: 100, output: 4_500, cacheRead: 12_000, cacheWrite: 200 } }

  test('tres niveles de detalle', () => {
    expect(statusLine({ usage, counters, level: 'compacta', nowMs: NOW, offsetMin: AR })).toBe('S 23% · W 41% · ctx 12%')
    expect(statusLine({ usage, counters, level: 'media', nowMs: NOW, offsetMin: AR })).toBe(
      'Sesión █░░░░░ 23% 1:50 p. m. · Semana ██░░░░ 41% mar 7:00 a. m. · ctx 12% · ↑12,3k ↓4,5k',
    )
    expect(statusLine({ usage, counters, level: 'completa', nowMs: NOW, offsetMin: AR })).toBe(
      'Sesión ██░░░░░░░░ 23% 1:50 p. m. · Semana ████░░░░░░ 41% mar 7:00 a. m. · ctx 12% · ↑12,3k ↓4,5k · US$ 1,50',
    )
  })

  test('auto elige el nivel más detallado que entra tras el prefijo del engine', () => {
    const base = { usage, counters, nowMs: NOW, offsetMin: AR, density: 'auto' as const }
    expect(fitStatusLine({ ...base, columns: 50 }).level).toBe('compacta')
    expect(fitStatusLine({ ...base, columns: 110 }).level).toBe('media')
    expect(fitStatusLine({ ...base, columns: 140 }).level).toBe('completa')
    expect(fitStatusLine({ ...base, columns: null }).level).toBe('media')
    expect(fitStatusLine({ ...base, density: 'completa', columns: 50 }).level).toBe('completa')
    for (const columns of [50, 110, 140]) {
      expect(fitStatusLine({ ...base, columns }).text.length <= columns - 15).toBe(true)
    }
  })

  test('modelo primero, puntos por nivel y repo al final', () => {
    const repo = {
      root: '/w',
      remote: { forge: 'github' as const, host: 'github.com', path: 'o/r' },
      git: { branch: 'main', sha: 'abc1234', upstream: 'origin/main', ahead: 1, behind: 0, staged: 0, unstaged: 2, untracked: 0, conflicts: 0, subject: null },
      forge: null,
      forgeError: null,
      updatedAt: null,
    }
    const base = { usage, counters, nowMs: NOW, offsetMin: AR, model: 'claude-opus-5-5', dots: true, repo }
    expect(statusLine({ ...base, level: 'compacta' })).toBe('Opus · 🟢S 23% · 🟢W 41% · 🟢ctx 12% · main')
    expect(statusLine({ ...base, level: 'media' })).toBe(
      'Opus 5.5 · 🟢 Sesión █░░░░░ 23% 1:50 p. m. · 🟢 Semana ██░░░░ 41% mar 7:00 a. m. · 🟢 ctx 12% · ↑12,3k ↓4,5k · main ⇡1 ±2',
    )
  })

  test('sin límites todavía muestra "--"', () => {
    const none: Usage = { startedAt: 0, context: { window: 200_000 }, rateLimits: [] }
    expect(statusLine({ usage: none, counters: emptyCounters(), level: 'compacta', nowMs: NOW, offsetMin: AR })).toBe(
      'S -- · W -- · ctx --',
    )
    expect(statusLine({ usage: null, counters: emptyCounters(), level: 'media', nowMs: NOW, offsetMin: AR })).toBe(
      'Sesión -- · Semana -- · ctx -- · ↑0 ↓0',
    )
  })
})

test('numericFields aplana los números de un objeto', () => {
  expect(numericFields({ durationMs: 5, answer: 'x', usage: { input_tokens: 3, model: 'm' } })).toEqual({
    durationMs: 5,
    'usage.input_tokens': 3,
  })
})
