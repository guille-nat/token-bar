// Formateo puro de token-bar: sin `$`, sin efectos, todo testeable.
// Las formas de entrada copian los tipos de la 2.1.303 (SessionRateLimit,
// SessionContextUsage, ModelUsage) para no depender del runtime.

import { type RepoInfo, repoSummary } from './repo'

export type RateLimit = { kind: string; percentUsed: number; resetsAt?: string }

export type Usage = {
  startedAt: number
  context: { tokens?: number; window: number; percent?: number }
  rateLimits: readonly RateLimit[]
  cost?: { usd: number }
}

export type TurnTokens = {
  input: number
  output: number
  cacheRead: number
  cacheWrite: number
}

export type Counters = {
  turns: number
  main: TurnTokens
  agents: TurnTokens
  last: (TurnTokens & { model: string }) | null
}

export type Density = 'auto' | 'compacta' | 'media' | 'completa'
export type Level = Exclude<Density, 'auto'>
export type Tone = 'success' | 'warning' | 'claude' | 'error'

export const DENSITIES: readonly Density[] = ['auto', 'compacta', 'media', 'completa']

export const ZERO: TurnTokens = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }

export const emptyCounters = (): Counters => ({
  turns: 0,
  main: { ...ZERO },
  agents: { ...ZERO },
  last: null,
})

export const addTokens = (a: TurnTokens, b: TurnTokens): TurnTokens => ({
  input: a.input + b.input,
  output: a.output + b.output,
  cacheRead: a.cacheRead + b.cacheRead,
  cacheWrite: a.cacheWrite + b.cacheWrite,
})

/** Entrada total = sin caché + caché leída + caché escrita, como la cuenta el contexto. */
export const totalInput = (t: TurnTokens): number => t.input + t.cacheRead + t.cacheWrite

export const nextDensity = (d: Density): Density =>
  DENSITIES[(DENSITIES.indexOf(d) + 1) % DENSITIES.length] ?? 'auto'

/** auto: <80 columnas compacta, <120 media, si no completa; sin medir, media. */
export const levelFor = (density: Density, columns: number | null): Level => {
  if (density !== 'auto') return density
  if (columns === null) return 'media'
  if (columns < 80) return 'compacta'
  if (columns < 120) return 'media'
  return 'completa'
}

/**
 * Los 4 niveles de uso, de menos a más. `tone` es la clave del tema (sigue al
 * tema del usuario; `claude` es su naranja) y `dot` el punto para la barra,
 * que no admite colores.
 */
export const USAGE_LEVELS = [
  { min: 0, name: 'holgado', tone: 'success', dot: '🟢', color: 'verde', meaning: 'sin preocupación' },
  { min: 50, name: 'a mitad', tone: 'warning', dot: '🟡', color: 'amarillo', meaning: 'ya se usó la mitad' },
  { min: 75, name: 'atención', tone: 'claude', dot: '🟠', color: 'naranja', meaning: 'conviene dosificar' },
  { min: 90, name: 'al límite', tone: 'error', dot: '🔴', color: 'rojo', meaning: 'está por cortarse' },
] as const

export type UsageLevel = (typeof USAGE_LEVELS)[number]

export const usageLevel = (pct: number): UsageLevel =>
  [...USAGE_LEVELS].reverse().find(l => pct >= l.min) ?? USAGE_LEVELS[0]

/** Verde <50, amarillo 50–74, naranja 75–89, rojo ≥90. */
export const toneFor = (pct: number): Tone => usageLevel(pct).tone

/** El punto de color del nivel; ⚪ sin dato. */
export const dotFor = (pct: number | undefined): string =>
  pct === undefined || !Number.isFinite(pct) ? '⚪' : usageLevel(pct).dot

/** Color fijo del nombre de cada medidor, para distinguirlos de un vistazo. */
export const CONTEXT_COLOR = 'ide'
export const kindColor = (kind: string): string => {
  const label = labelFor(kind)
  if (label.startsWith('Sesión')) return 'suggestion'
  if (label === 'Fable semanal') return 'planMode'
  if (label.startsWith('Semana')) return 'merged'
  if (label === 'Gasto') return 'permission'
  return 'text'
}

/**
 * claude-opus-5-5 → "Opus 5.5", claude-sonnet-5-5[1m] → "Sonnet 5.5 1M",
 * claude-3-5-haiku-20241022 → "Haiku 3.5"; lo que no empieza con claude- queda igual.
 */
export const formatModel = (raw: string | null | undefined): string => {
  if (!raw) return '--'
  const m = raw.trim().match(/^claude-([a-z0-9-]+?)(?:-\d{8})?(\[1m\])?$/i)
  if (!m?.[1]) return raw.trim()
  const parts = m[1].split('-')
  const family = parts.find(p => /^[a-z]+$/i.test(p))
  const version = parts.filter(p => /^\d+$/.test(p)).join('.')
  if (family === undefined) return raw.trim()
  return [capitalize(family), version, m[2] ? '1M' : ''].filter(Boolean).join(' ')
}

/** "Opus 5.5" → "Opus", para el nivel compacto. */
export const shortModel = (model: string): string => model.split(' ')[0] ?? model

const WORDS: Record<string, string> = {
  five: '5',
  hour: 'h',
  seven: '7',
  day: 'd',
  spend: 'Gasto',
  limit: 'límite',
  opus: 'Opus',
  sonnet: 'Sonnet',
  haiku: 'Haiku',
  oauth: 'OAuth',
}

/** five_hour → Sesión, seven_day → Semana, *fable* → Fable semanal, el resto legible. */
export const labelFor = (kind: string): string => {
  const k = kind.toLowerCase()
  if (k.includes('fable')) return 'Fable semanal'
  if (k === 'five_hour') return 'Sesión'
  if (k === 'seven_day') return 'Semana'
  if (k === 'spend_limit') return 'Gasto'
  if (k.startsWith('seven_day_')) return `Semana ${readable(k.slice('seven_day_'.length))}`
  if (k.startsWith('five_hour_')) return `Sesión ${readable(k.slice('five_hour_'.length))}`
  return capitalize(readable(k))
}

const readable = (k: string): string =>
  k
    .split(/[_\-\s]+/)
    .filter(Boolean)
    .map(w => WORDS[w] ?? capitalize(w))
    .join(' ')

const capitalize = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1)

/** Etiqueta corta para el nivel compacto. */
export const shortLabelFor = (kind: string): string => {
  const label = labelFor(kind)
  if (label === 'Sesión') return 'S'
  if (label === 'Semana') return 'W'
  if (label === 'Fable semanal') return 'F'
  return label.slice(0, 3)
}

export const hasFable = (limits: readonly RateLimit[]): boolean =>
  limits.some(l => l.kind.toLowerCase().includes('fable'))

/** Orden estable: Sesión, Semana, Fable, el resto por nombre. */
export const sortLimits = (limits: readonly RateLimit[]): RateLimit[] => {
  const rank = (l: RateLimit) => {
    const label = labelFor(l.kind)
    return label === 'Sesión' ? 0 : label === 'Semana' ? 1 : label === 'Fable semanal' ? 2 : 3
  }
  return [...limits].sort((a, b) => rank(a) - rank(b) || a.kind.localeCompare(b.kind))
}

export const bar = (pct: number, width: number): string => {
  const filled = Math.max(0, Math.min(width, Math.round((pct / 100) * width)))
  return '█'.repeat(filled) + '░'.repeat(width - filled)
}

/** El naranja de Claude y su brillo, para el destello y el nombre del modelo. */
export const CLAUDE_ORANGE = '#D97757'
export const CLAUDE_GLOW = '#FBD3BF'

/** El destello de Claude mientras corre un turno, de ida y vuelta como su spinner. */
export const SPARK_FRAMES = ['·', '✢', '✳', '✶', '✻', '✽', '✻', '✶', '✳', '✢'] as const
export const SPARK_IDLE = '✻'

export const sparkFrame = (frame: number): string =>
  SPARK_FRAMES[((frame % SPARK_FRAMES.length) + SPARK_FRAMES.length) % SPARK_FRAMES.length] ?? SPARK_IDLE

/**
 * Barra fina con media celda: "━━━━╸────". `filled` va con el color del nivel
 * y `empty` atenuada; solo usa caracteres de cajas, que traen todas las fuentes.
 */
export const lineBar = (pct: number, width: number): { filled: string; empty: string } => {
  const halves = Math.max(0, Math.min(width * 2, Math.round((pct / 100) * width * 2)))
  const full = Math.floor(halves / 2)
  const half = halves % 2
  return { filled: '━'.repeat(full) + (half === 1 ? '╸' : ''), empty: '─'.repeat(width - full - half) }
}

/**
 * El carácter que brilla en el barrido sobre un texto de `length` letras;
 * `length` o más es la pausa entre pasadas (no brilla ninguno).
 */
export const shimmerIndex = (frame: number, length: number): number => frame % (length + 8)

/** Un paso de una barra hacia su valor: rápido al principio, suave al llegar. */
export const easeToward = (from: number, to: number): number => {
  const d = to - from
  return Math.abs(d) < 0.4 ? to : from + d * 0.3
}

/** Las dos mitades de una barra, para colorear la llena y atenuar la vacía. */
export const barParts = (pct: number, width: number): { filled: string; empty: string } => {
  const b = bar(pct, width)
  const n = b.indexOf('░') === -1 ? width : b.indexOf('░')
  return { filled: b.slice(0, n), empty: b.slice(n) }
}

export const formatPct = (pct: number | undefined): string =>
  pct === undefined || !Number.isFinite(pct) ? '--' : `${Math.round(pct)}%`

/** 1234 → "1,2k", 1234567 → "1,2M", con coma decimal es-AR. */
export const formatTokens = (n: number): string => {
  const one = (x: number) => (Math.round(x * 10) / 10).toString().replace('.', ',')
  if (n >= 1_000_000) return `${one(n / 1_000_000)}M`
  if (n >= 1_000) return `${one(n / 1_000)}k`
  return String(n)
}

/** 1234567 → "1.234.567" (separador de miles es-AR). */
export const formatInt = (n: number): string =>
  String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '.')

export const formatUsd = (usd: number): string => `US$ ${usd.toFixed(2).replace('.', ',')}`

const DAYS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb']

/**
 * Hora de reinicio en 12 h es-AR: "1:50 p. m." si es hoy, "lun 7:00 a. m." si
 * es otro día de los próximos 7, "19/10 7:00 a. m." más lejos. `offsetMin` es el de
 * `Date#getTimezoneOffset` (180 en Argentina): se pasa para que sea pura.
 */
export const formatReset = (
  iso: string | undefined,
  nowMs: number,
  offsetMin: number,
): string => {
  if (iso === undefined) return '--'
  const at = Date.parse(iso)
  if (!Number.isFinite(at)) return '--'
  const local = new Date(at - offsetMin * 60_000)
  const today = new Date(nowMs - offsetMin * 60_000)
  const h24 = local.getUTCHours()
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12
  const mm = String(local.getUTCMinutes()).padStart(2, '0')
  const time = `${h12}:${mm} ${h24 < 12 ? 'a. m.' : 'p. m.'}`
  const dayOf = (d: Date) => Math.floor(d.getTime() / 86_400_000)
  const diff = dayOf(local) - dayOf(today)
  if (diff === 0) return time
  if (diff > 0 && diff <= 7) return `${DAYS[local.getUTCDay()]} ${time}`
  return `${local.getUTCDate()}/${local.getUTCMonth() + 1} ${time}`
}

/** Los dos límites que se esperan antes de la primera respuesta del modelo. */
const PLACEHOLDER_KINDS = ['five_hour', 'seven_day']

/**
 * La línea de estado bajo el prompt, en texto plano, para un nivel:
 * compacta  "S 23% · W 41% · ctx 12%"
 * media     "Sesión ██████░░ 23% 1:50 p. m. · Semana … · ctx 12%"
 * completa  lo de media con barras más largas, más "↑12,3k ↓4,5k" y costo.
 * Con `model` va primero ("Opus 5.5", "Opus" en compacta); con `dots`, cada
 * medidor lleva el punto de su nivel (🟢 Sesión …); con `repo`, el tramo del
 * repo va al final ("main ⇡2 ±3 #12 ✓").
 */
export const statusLine = (args: {
  usage: Usage | null
  counters: Counters
  level: Level
  nowMs: number
  offsetMin: (iso: string) => number
  model?: string | null
  dots?: boolean
  repo?: RepoInfo | null
}): string => {
  const { usage, counters, level, nowMs } = args
  const limits = sortLimits(usage?.rateLimits ?? [])
  const parts: string[] = []
  const isCompact = level === 'compacta'
  // En compacta el punto va pegado ("🟢S 23%"); en las otras, separado.
  const dot = (pct: number | undefined) => (args.dots ? `${dotFor(pct)}${isCompact ? '' : ' '}` : '')

  if (args.model) {
    const model = formatModel(args.model)
    parts.push(isCompact ? shortModel(model) : model)
  }

  if (limits.length === 0) {
    for (const kind of PLACEHOLDER_KINDS) {
      parts.push(`${dot(undefined)}${isCompact ? shortLabelFor(kind) : labelFor(kind)} --`)
    }
  } else {
    for (const l of limits) {
      const pct = formatPct(l.percentUsed)
      if (isCompact) {
        parts.push(`${dot(l.percentUsed)}${shortLabelFor(l.kind)} ${pct}`)
        continue
      }
      const width = level === 'completa' ? 10 : 6
      const reset = l.resetsAt === undefined ? '' : ` ${formatReset(l.resetsAt, nowMs, args.offsetMin(l.resetsAt))}`
      parts.push(`${dot(l.percentUsed)}${labelFor(l.kind)} ${bar(l.percentUsed, width)} ${pct}${reset}`)
    }
  }

  parts.push(`${dot(usage?.context.percent)}ctx ${formatPct(usage?.context.percent)}`)

  if (!isCompact) {
    const t = addTokens(counters.main, counters.agents)
    parts.push(`↑${formatTokens(totalInput(t))} ↓${formatTokens(t.output)}`)
  }
  if (level === 'completa' && usage?.cost !== undefined) {
    parts.push(formatUsd(usage.cost.usd))
  }

  const repo = repoSummary(args.repo, isCompact)
  if (repo !== '') parts.push(repo)

  return parts.join(' · ')
}

/** Lo que el engine antepone a la línea de un plugin: "  ⚠ token-bar: ". */
export const STATUS_PREFIX = '  ⚠ token-bar: '.length

/**
 * La línea de estado para una densidad. En `auto`, el nivel más detallado que
 * entra en las columnas que quedan tras el prefijo del engine (que corta con
 * "…" lo que sobra); sin medir, media.
 */
export const fitStatusLine = (
  args: Omit<Parameters<typeof statusLine>[0], 'level'> & { density: Density; columns: number | null },
): { text: string; level: Level } => {
  const { density, columns, ...rest } = args
  if (density !== 'auto') return { text: statusLine({ ...rest, level: density }), level: density }
  if (columns === null) return { text: statusLine({ ...rest, level: 'media' }), level: 'media' }
  for (const level of ['completa', 'media'] as const) {
    const text = statusLine({ ...rest, level })
    if (text.length <= columns - STATUS_PREFIX) return { text, level }
  }
  return { text: statusLine({ ...rest, level: 'compacta' }), level: 'compacta' }
}

/** Los campos numéricos de un objeto, aplanados con punto ("usage.input_tokens"). */
export const numericFields = (value: unknown, prefix = ''): Record<string, number> => {
  const out: Record<string, number> = {}
  if (typeof value !== 'object' || value === null) return out
  for (const [k, v] of Object.entries(value)) {
    const path = prefix === '' ? k : `${prefix}.${k}`
    if (typeof v === 'number') out[path] = v
    else if (typeof v === 'object' && v !== null && !Array.isArray(v)) Object.assign(out, numericFields(v, path))
  }
  return out
}
