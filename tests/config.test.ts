import { describe, expect, test } from 'claude-code/testing'

import {
  applyPreset,
  DEFAULTS,
  exportConfig,
  expandHome,
  limitKey,
  nextLevels,
  parseConfig,
  readSettings,
  SHOW_KEYS,
  toStored,
} from '../hooks/config'
import { setLevelMins, toneFor } from '../hooks/format'
import { repoSummary } from '../hooks/repo'

describe('readSettings', () => {
  test('sin nada: los valores por defecto', () => {
    expect(readSettings(undefined)).toEqual(DEFAULTS)
    expect(readSettings('basura')).toEqual(DEFAULTS)
  })

  test('lo que no es del tipo esperado vuelve a su valor por defecto', () => {
    const s = readSettings({ v: 2, density: 'enorme', repoOn: 'si', show: { tokens: 1, cost: true }, levels: [90, 50, 10] })
    expect(s.density).toBe('auto')
    expect(s.repoOn).toBe(true)
    expect(s.show.tokens).toBe(true)
    expect(s.show.cost).toBe(true)
    expect(s.levels).toEqual([50, 75, 90])
  })

  test('los ajustes de antes de v2 conservan todo menos dónde se dibuja', () => {
    const s = readSettings({ statusOn: true, bandOn: false, density: 'compacta', dotsOn: false })
    expect(s).toMatchObject({ statusOn: false, bandOn: true, density: 'compacta', dotsOn: false })
  })
})

describe('presets', () => {
  test('mínima deja lo justo y sin Clawd; completa muestra todo', () => {
    const min = applyPreset(DEFAULTS, 'minima')
    expect(min.mascotOn).toBe(false)
    expect(min.show.tokens).toBe(false)
    expect(min.show.session && min.show.week && min.show.context).toBe(true)
    const full = applyPreset(DEFAULTS, 'completa')
    expect(SHOW_KEYS.every(k => full.show[k])).toBe(true)
  })

  test('no pisan la barra de texto ni los puntos', () => {
    const s = applyPreset({ ...DEFAULTS, statusOn: true, dotsOn: false }, 'minima')
    expect(s.statusOn).toBe(true)
    expect(s.dotsOn).toBe(false)
  })
})

describe('exportar e importar', () => {
  test('lo exportado se importa igual', () => {
    const mine = applyPreset({ ...DEFAULTS, levels: [60, 80, 95] }, 'minima')
    const back = parseConfig(exportConfig(mine))
    expect('settings' in back && back.settings).toEqual(mine)
    expect('ignored' in back && back.ignored).toEqual([])
  })

  test('un archivo hecho a mano con pocos campos completa el resto y avisa lo que no conoce', () => {
    const r = parseConfig('{ "show": { "tokens": false, "colores": true }, "tema": "oscuro" }')
    expect('settings' in r && r.settings.show.tokens).toBe(false)
    expect('settings' in r && r.settings.show.session).toBe(true)
    expect('ignored' in r && r.ignored).toEqual(['tema', 'show.colores'])
  })

  test('un archivo importado manda también sobre dónde se dibuja', () => {
    const r = parseConfig('{ "bandOn": false, "statusOn": true }')
    expect('settings' in r && r.settings).toMatchObject({ bandOn: false, statusOn: true })
  })

  test('JSON roto o que no es un objeto: error claro', () => {
    expect(parseConfig('{ no')).toEqual({ error: 'no es un JSON válido' })
    expect(parseConfig('[1]')).toEqual({ error: 'el JSON tiene que ser un objeto' })
  })

  test('lo guardado lleva la versión', () => {
    expect(toStored(DEFAULTS).v).toBe(2)
  })
})

test('limitKey: cada límite responde al interruptor de su familia', () => {
  expect(limitKey('Sesión')).toBe('session')
  expect(limitKey('Semana')).toBe('week')
  expect(limitKey('Semana Opus')).toBe('week')
  expect(limitKey('Fable semanal')).toBe('fable')
})

test('los cortes de color se pueden cambiar', () => {
  expect(toneFor(55)).toBe('warning')
  setLevelMins([60, 80, 95])
  expect(toneFor(55)).toBe('success')
  expect(toneFor(85)).toBe('claude')
  setLevelMins([50, 75, 90])
  expect(nextLevels([50, 75, 90])).toEqual([60, 80, 95])
})

test('expandHome', () => {
  expect(expandHome('~/a/b.json', '/home/yo')).toBe('/home/yo/a/b.json')
  expect(expandHome('/x.json', undefined)).toBe('/x.json')
  expect(expandHome('~/x.json', undefined)).toBeNull()
})

test('repoSummary con partes ocultas', () => {
  const repo = {
    root: '/w',
    remote: { host: 'github.com', path: 'a/b', forge: 'github' as const },
    git: { branch: 'main', upstream: 'origin/main', sha: 'abcdef1', subject: '', ahead: 2, behind: 0, staged: 0, unstaged: 3, untracked: 0, conflicts: 0 },
    forge: null,
    forgeError: null,
    updatedAt: null,
  }
  expect(repoSummary(repo, false)).toBe('main ⇡2 ±3')
  expect(repoSummary(repo, false, { sync: false })).toBe('main ±3')
  expect(repoSummary(repo, false, { branch: false, changes: false })).toBe('⇡2')
})
