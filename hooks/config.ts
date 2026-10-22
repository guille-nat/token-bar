// Configuración de token-bar: qué se muestra y cómo. Puro: sin `$`, todo
// testeable. Es lo que se guarda en `$.store`, lo que se exporta a un JSON
// (para llevarlo a otra máquina o compartirlo) y lo que importa un preset.

import type { Density } from './format'

/** Cada dato que la banda puede mostrar u ocultar. */
export const SHOW_KEYS = [
  'model',
  'session',
  'week',
  'fable',
  'context',
  'tokens',
  'cost',
  'resets',
  'cwd',
  'repoBranch',
  'repoSync',
  'repoChanges',
  'repoChange',
  'repoCi',
] as const

export type ShowKey = (typeof SHOW_KEYS)[number]
export type Show = Record<ShowKey, boolean>

export const SHOW_LABELS: Record<ShowKey, string> = {
  model: 'Modelo',
  session: 'Sesión',
  week: 'Semana',
  fable: 'Fable',
  context: 'Contexto',
  tokens: 'Tokens ↑↓',
  cost: 'Costo',
  resets: 'Hora de reinicio',
  cwd: 'Ruta de trabajo',
  repoBranch: 'Rama',
  repoSync: 'Sync ⇡⇣',
  repoChanges: 'Cambios ±',
  repoChange: 'PR / MR',
  repoCi: 'CI',
}

/** Los cortes de color: desde dónde es amarillo, naranja y rojo. */
export type Levels = readonly [number, number, number]

export const LEVEL_SETS: readonly Levels[] = [
  [50, 75, 90],
  [60, 80, 95],
  [40, 65, 85],
]

export type Settings = {
  statusOn: boolean
  bandOn: boolean
  density: Density
  repoOn: boolean
  dotsOn: boolean
  /** Clawd dibujado en la banda. */
  mascotOn: boolean
  /** Los comentarios de Clawd ("¡Hola!", "trabajando…"). */
  clawdSay: boolean
  /** Destello, barras que se llenan, pulso y poses de Clawd. */
  animations: boolean
  show: Show
  levels: Levels
}

/**
 * v2: la banda (con colores y animaciones) pasa a ser la vista por defecto y la
 * línea de texto se apaga, porque el engine la dibuja toda en amarillo con "⚠".
 */
export const SETTINGS_VERSION = 2

export const DEFAULT_SHOW: Show = {
  model: true,
  session: true,
  week: true,
  fable: true,
  context: true,
  tokens: true,
  cost: false,
  resets: true,
  cwd: true,
  repoBranch: true,
  repoSync: true,
  repoChanges: true,
  repoChange: true,
  repoCi: true,
}

export const DEFAULTS: Settings = {
  statusOn: false,
  bandOn: true,
  density: 'auto',
  repoOn: true,
  dotsOn: true,
  mascotOn: true,
  clawdSay: true,
  animations: true,
  show: DEFAULT_SHOW,
  levels: LEVEL_SETS[0] ?? [50, 75, 90],
}

export type PresetName = 'minima' | 'normal' | 'completa'
export const PRESET_NAMES: readonly PresetName[] = ['minima', 'normal', 'completa']

const only = (keys: readonly ShowKey[]): Show =>
  Object.fromEntries(SHOW_KEYS.map(k => [k, keys.includes(k)])) as Show

/** Lo que cambia cada preset; el resto de los ajustes (barra de texto, puntos…) queda. */
const PRESETS: Record<PresetName, Pick<Settings, 'density' | 'mascotOn' | 'clawdSay' | 'animations' | 'show'>> = {
  minima: {
    density: 'compacta',
    mascotOn: false,
    clawdSay: false,
    animations: true,
    show: only(['model', 'session', 'week', 'context', 'repoBranch']),
  },
  normal: { density: 'auto', mascotOn: true, clawdSay: true, animations: true, show: { ...DEFAULT_SHOW } },
  completa: {
    density: 'completa',
    mascotOn: true,
    clawdSay: true,
    animations: true,
    show: only(SHOW_KEYS),
  },
}

export const isPreset = (name: unknown): name is PresetName => PRESET_NAMES.includes(name as PresetName)

export const applyPreset = (settings: Settings, name: PresetName): Settings => {
  const p = PRESETS[name]
  return { ...settings, ...p, show: { ...p.show } }
}

const DENSITY_VALUES: readonly string[] = ['auto', 'compacta', 'media', 'completa']

const readLevels = (raw: unknown): Levels => {
  const a = Array.isArray(raw) ? raw : []
  const [x, y, z] = a
  const ok = [x, y, z].every(n => typeof n === 'number' && Number.isFinite(n)) && x < y && y < z && x > 0 && z <= 100
  return ok ? [x, y, z] : DEFAULTS.levels
}

/**
 * Lee ajustes de donde vengan (el store, un archivo importado) sin confiar en
 * nada: lo que falta o no es del tipo esperado queda en su valor por defecto.
 * Los ajustes guardados antes de v2 conservan todo menos dónde se dibuja.
 */
export const readSettings = (raw: unknown): Settings => {
  const s = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>
  const bool = (v: unknown, fallback: boolean) => (typeof v === 'boolean' ? v : fallback)
  const isCurrent = s.v === SETTINGS_VERSION
  const rawShow = (typeof s.show === 'object' && s.show !== null ? s.show : {}) as Record<string, unknown>
  return {
    statusOn: isCurrent ? bool(s.statusOn, DEFAULTS.statusOn) : DEFAULTS.statusOn,
    bandOn: isCurrent ? bool(s.bandOn, DEFAULTS.bandOn) : DEFAULTS.bandOn,
    density: DENSITY_VALUES.includes(String(s.density)) ? (s.density as Density) : DEFAULTS.density,
    repoOn: bool(s.repoOn, DEFAULTS.repoOn),
    dotsOn: bool(s.dotsOn, DEFAULTS.dotsOn),
    mascotOn: bool(s.mascotOn, DEFAULTS.mascotOn),
    clawdSay: bool(s.clawdSay, DEFAULTS.clawdSay),
    animations: bool(s.animations, DEFAULTS.animations),
    show: Object.fromEntries(SHOW_KEYS.map(k => [k, bool(rawShow[k], DEFAULT_SHOW[k])])) as Show,
    levels: readLevels(s.levels),
  }
}

/** Lo que se guarda y se exporta. */
export const toStored = (settings: Settings) => ({ v: SETTINGS_VERSION, ...settings })

/** El JSON portable: se pega en otra máquina, se guarda en los dotfiles o se comparte. */
export const exportConfig = (settings: Settings): string =>
  `${JSON.stringify({ tokenBar: 'config', ...toStored(settings) }, null, 2)}\n`

export type ImportResult = { settings: Settings; ignored: string[] } | { error: string }

/**
 * Lee un JSON de `exportConfig`. Acepta archivos a mano con solo algunos campos
 * (el resto queda por defecto) y avisa de las claves que no conoce, que se ignoran.
 */
export const parseConfig = (text: string): ImportResult => {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    return { error: 'no es un JSON válido' }
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return { error: 'el JSON tiene que ser un objeto' }
  const obj = raw as Record<string, unknown>
  const known = new Set(['tokenBar', 'v', ...Object.keys(toStored(DEFAULTS))])
  const ignored = Object.keys(obj).filter(k => !known.has(k))
  const show = typeof obj.show === 'object' && obj.show !== null ? (obj.show as Record<string, unknown>) : {}
  ignored.push(...Object.keys(show).filter(k => !(SHOW_KEYS as readonly string[]).includes(k)).map(k => `show.${k}`))
  // Un archivo importado manda también sobre dónde se dibuja.
  return { settings: readSettings({ ...obj, v: SETTINGS_VERSION }), ignored }
}

/** "50/75/90" para mostrarlo. */
export const formatLevels = (l: Levels): string => l.join('/')

export const nextLevels = (l: Levels): Levels => {
  const i = LEVEL_SETS.findIndex(set => set.join() === l.join())
  return LEVEL_SETS[(i + 1) % LEVEL_SETS.length] ?? DEFAULTS.levels
}

/** A qué interruptor de `show` responde un límite. */
export const limitKey = (label: string): ShowKey => {
  if (label.startsWith('Sesión')) return 'session'
  if (label === 'Fable semanal') return 'fable'
  return 'week'
}

/** "~/x" → "/home/yo/x"; sin HOME, null. */
export const expandHome = (path: string, home: string | undefined): string | null => {
  if (!path.startsWith('~')) return path
  return home === undefined || home === '' ? null : `${home}${path.slice(1)}`
}

export const DEFAULT_CONFIG_PATH = '~/.config/token-bar/config.json'
