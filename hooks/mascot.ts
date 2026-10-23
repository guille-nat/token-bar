// Clawd, el bichito de Claude Code, como compañero de desarrollo. Se dibuja con
// medios bloques en un lienzo de 3 filas × 11 columnas: el cuerpo ocupa las 9 del
// medio y los bordes quedan para las partículas (corazones, confeti, zzz, el
// destello que orbita). Reacciona a lo que pasa: qué herramienta corre Claude,
// si un test pasó, un commit, un push, un error, que escribas o que le hagas
// clic. Puro: el cuadro sale del número de tick y del ánimo, así se testea sin
// reloj.

import { CLAUDE_GLOW, CLAUDE_ORANGE, sparkFrame } from './format'

/** Ancho del lienzo: el cuerpo (9) y una columna de partículas a cada lado. */
export const MASCOT_WIDTH = 11
const BODY_WIDTH = 9

export type Tone = 'clawd' | 'glow' | 'heart' | 'ok' | 'error' | 'sleep' | 'sweat' | 'gold' | 'violet' | 'shades' | 'shine'

/** Colores de cada tono: hex o nombres del tema. */
export const TONE_COLOR: Record<Tone, string> = {
  clawd: CLAUDE_ORANGE,
  glow: CLAUDE_GLOW,
  heart: '#F7768E',
  ok: '#9ECE6A',
  error: 'error',
  sleep: 'subtle',
  sweat: '#7DCFFF',
  gold: '#E0AF68',
  violet: '#BB9AF7',
  shades: '#000000',
  shine: '#FFFFFF',
}

/** Un tramo de una fila con un solo color (y un fondo, en los lentes). */
export type Seg = { text: string; tone: Tone | null; bg?: Tone }

export type MascotFrame = {
  /** Las 3 filas del lienzo, cada una de 11 columnas en tramos de color. */
  rows: readonly [Seg[], Seg[], Seg[]]
  /** El símbolo que antecede al comentario (♪, z, !, el destello), o ''. */
  mark: string
  /** Lo que dice al lado, o null. */
  say: string | null
  /** El color del comentario. */
  sayTone: Tone
  /** Cambia solo cuando cambia el dibujo: el reloj redibuja si cambia. */
  key: string
}

/** Lo que está haciendo Claude, sacado de la herramienta que corre. */
export type ActivityKind = 'think' | 'read' | 'search' | 'edit' | 'bash' | 'test' | 'git' | 'web' | 'agent'
export type Activity = { kind: ActivityKind; detail: string }

export type ReactionKind =
  | 'greet'
  | 'pet'
  | 'submit'
  | 'done'
  | 'abort'
  | 'fail'
  | 'oops'
  | 'testsOk'
  | 'testsFail'
  | 'commit'
  | 'push'
  | 'wake'
  | 'cool'

/** Algo que pasó: dura unos ticks desde `at`. `seed` elige la frase. */
export type Reaction = { kind: ReactionKind; at: number; seed: number; hour?: number }

export type Mood = {
  isWorking: boolean
  /** El medidor más alto ≥90 %, con su etiqueta, o null. */
  alert: { label: string; pct: number } | null
  /** El porcentaje más alto entre los medidores (0 sin datos). */
  maxPct: number
  /** Sin animaciones: Clawd queda quieto en su pose base. */
  isStill?: boolean
  /** Qué herramienta corre mientras trabaja. */
  activity?: Activity | null
  /** Lo último que pasó. */
  reaction?: Reaction | null
  /** Escribís en el prompt: `at` es el tick de la última tecla, `ratio` (0–1) hacia dónde mira. */
  typing?: { at: number; ratio: number } | null
  /** Ticks sin que pase nada: pasado `SLEEP_AFTER`, se duerme. */
  idleTicks?: number
  /** Ticks desde que arrancó el turno. */
  workTicks?: number
}

/** 3 minutos sin nada (en ticks de 100 ms) y se echa una siesta. */
export const SLEEP_AFTER = 1_800
/** Desde los 90 s de turno, transpira. */
const LONG_WORK = 900
/** Cuánto sigue mirando el prompt después de la última tecla. */
const TYPING_TICKS = 25

export const REACTION_TICKS: Record<ReactionKind, number> = {
  greet: 40,
  pet: 25,
  submit: 12,
  done: 28,
  abort: 15,
  fail: 25,
  oops: 15,
  testsOk: 30,
  testsFail: 30,
  commit: 25,
  push: 30,
  wake: 15,
  cool: 40,
}

// --- El cuerpo -------------------------------------------------------------

const BLANK = '         '
const EYES = {
  base: ' ▐▛███▜▌ ',
  blink: ' ▐█████▌ ',
  left: ' ▐▛███▛▌ ',
  right: ' ▐▜███▜▌ ',
  happy: ' ▐▀███▀▌ ',
  sad: ' ▐▄███▄▌ ',
  // Ojos altos (media celda de ancho, toda la altura): sorprendido.
  wide: ' ▐▌███▐▌ ',
}
const BODY = '▝▜█████▛▘'
const LEGS = '  ▘▘ ▝▝  '

type Pose = { head: string; body: string; legs: string }

const pose = (head: string, body = BODY, legs = LEGS): Pose => ({ head, body, legs })

/** Brazos arriba, festejando. */
const cheer = (eyes = EYES.happy): Pose => pose(`▝${eyes.slice(1, 8)}▘`, ' ▜█████▛ ')
const waveUp = (eyes = EYES.base): Pose => pose(`${eyes.slice(0, 8)}▝`, '▝▜█████▛ ')
const waveDown = (eyes = EYES.base): Pose => pose(`${eyes.slice(0, 8)}▗`, '▝▜█████▛ ')
/** Tecleando: los brazos suben y bajan alternados. */
const typing = (t: number, eyes = EYES.base): Pose =>
  Math.floor(t / 2) % 2 === 0 ? pose(eyes, '▗▜█████▛▘', LEGS) : pose(eyes, '▝▜█████▛▖', LEGS)
/** Rascándose la cabeza, como el meme: la mano sobre la cabeza va y viene. */
const scratch = (t: number): Pose =>
  pose(`${(Math.floor(t / 12) % 2 === 0 ? EYES.left : EYES.right).slice(0, 8)}${Math.floor(t / 2) % 2 === 0 ? '▝' : '▘'}`, '▝▜█████▛ ')
const crouch = (eyes = EYES.base): Pose => pose(eyes, '▗▟█████▙▖', '  ▀▀ ▀▀  ')
const jump = (eyes = EYES.base): Pose => pose(eyes, BODY, BLANK)
const dance = (t: number): Pose =>
  Math.floor(t / 3) % 2 === 0
    ? pose('▗▐▛███▜▌ ', ' ▜█████▛▘', '   ▘▘▝▝  ')
    : pose(' ▐▛███▜▌▖', '▝▜█████▛ ', '  ▘▘ ▝▝  ')

// --- El lienzo y las partículas ---------------------------------------------

/** Una partícula va en un hueco del lienzo, nunca encima del cuerpo. */
type Particle = { r: number; c: number; ch: string; tone: Tone }

/**
 * Los lentes de "deal with it" en pixel art: cada celda son 2 píxeles
 * verticales (el de arriba es el color del carácter `▀`, el de abajo el fondo),
 * así entran tres colores en la cara: la frente naranja arriba, la banda negra
 * con un brillo blanco por cristal, y los cristales con el puente naranja en el
 * medio. Píxeles del lienzo: filas 0–1 son la cabeza, 2–3 el cuerpo. En su
 * lugar (`drop` 0) la banda va en la fila 1, donde están los ojos; con `drop`
 * -1 o -2 están más arriba, cayendo.
 */
const SHADES_PX: readonly (readonly [number, number, Tone])[] = [
  ...[1, 2, 3, 4, 5, 6, 7, 8, 9].map(c => [1, c, c === 2 || c === 6 ? 'shine' : 'shades'] as const),
  [2, 2, 'shades'], [2, 3, 'shine'], [2, 4, 'shades'],
  [2, 6, 'shades'], [2, 7, 'shine'], [2, 8, 'shades'],
]

/** El color de la cara debajo de los lentes: naranja entre las columnas 2 y 8. */
const facePx = (c: number): Tone | null => (c >= 2 && c <= 8 ? 'clawd' : null)

type Cell = { ch: string; tone: Tone | null; bg?: Tone }

/** Una celda con dos píxeles: arriba y abajo. */
const halfBlock = (top: Tone | null, bottom: Tone | null): Cell => {
  if (top === null && bottom === null) return { ch: ' ', tone: null }
  if (bottom === null) return { ch: '▀', tone: top }
  if (top === null) return { ch: '▄', tone: bottom }
  if (top === bottom) return { ch: '█', tone: top }
  return { ch: '▀', tone: top, bg: bottom }
}

const putShades = (grid: Cell[][], drop: number) => {
  const px = new Map(SHADES_PX.map(([r, c, tone]) => [`${r + drop},${c}`, tone]))
  for (const r of [0, 1]) {
    for (let c = 0; c < MASCOT_WIDTH; c++) {
      const top = px.get(`${2 * r},${c}`)
      const bottom = px.get(`${2 * r + 1},${c}`)
      if (top === undefined && bottom === undefined) continue
      grid[r]![c] = halfBlock(top ?? facePx(c), bottom ?? facePx(c))
    }
  }
}

/** Arma las filas: el cuerpo corrido `shift` columnas, los lentes y las partículas en los huecos. */
const paint = (p: Pose, particles: readonly Particle[] = [], shift = 0, shades?: number): MascotFrame['rows'] => {
  const grid = [p.head, p.body, p.legs].map(row => {
    const cells: Cell[] = Array.from({ length: MASCOT_WIDTH }, () => ({ ch: ' ', tone: null }))
    ;[...row].slice(0, BODY_WIDTH).forEach((ch, i) => {
      const c = 1 + shift + i
      if (c >= 0 && c < MASCOT_WIDTH && ch !== ' ') cells[c] = { ch, tone: 'clawd' }
    })
    return cells
  })
  if (shades !== undefined) putShades(grid, shades)
  for (const { r, c, ch, tone } of particles) {
    if (grid[r]?.[c]?.ch === ' ') grid[r]![c] = { ch, tone }
  }
  const rows = grid.map(cells => {
    const segs: Seg[] = []
    for (const { ch, tone, bg } of cells) {
      const last = segs[segs.length - 1]
      // Los espacios se pegan al tramo anterior si no tiene fondo: menos nodos para dibujar.
      if (last !== undefined && last.bg === bg && (last.tone === tone || (ch === ' ' && bg === undefined))) last.text += ch
      else segs.push({ text: ch, tone: ch === ' ' ? null : tone, ...(bg === undefined ? {} : { bg }) })
    }
    return segs
  })
  return [rows[0]!, rows[1]!, rows[2]!]
}

/** Pseudoaleatorio estable: el mismo tick da el mismo confeti. */
const hash = (n: number): number => {
  let x = (n ^ 0x9e3779b9) >>> 0
  x = Math.imul(x ^ (x >>> 16), 0x85ebca6b) >>> 0
  x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35) >>> 0
  return (x ^ (x >>> 16)) >>> 0
}

/** Las celdas de alrededor del cuerpo donde caben partículas. */
const AROUND: readonly (readonly [number, number])[] = [
  [0, 0], [0, 1], [0, 9], [0, 10], [1, 0], [1, 10], [2, 0], [2, 1], [2, 9], [2, 10],
]
const CONFETTI = ['✦', '✧', '*', '+', '·', '°'] as const
const CONFETTI_TONES: readonly Tone[] = ['gold', 'violet', 'sweat', 'ok', 'heart', 'glow']

const confetti = (t: number, count = 5): Particle[] =>
  Array.from({ length: count }, (_, i) => {
    const h = hash(Math.floor(t / 2) * 31 + i * 7)
    const [r, c] = AROUND[h % AROUND.length]!
    return { r, c, ch: CONFETTI[(h >>> 8) % CONFETTI.length]!, tone: CONFETTI_TONES[(h >>> 16) % CONFETTI_TONES.length]! }
  })

/** Corazones que suben por los costados. */
const hearts = (t: number): Particle[] => {
  const rise = (phase: number) => 2 - (Math.floor(phase / 3) % 3)
  return [
    { r: rise(t), c: 10, ch: '♥', tone: 'heart' },
    { r: rise(t + 4), c: 0, ch: '♥', tone: 'heart' },
  ]
}

/** Las z suben por la derecha, de chica a grande. */
const zzz = (t: number): Particle[] => {
  const step = Math.floor(t / 6) % 4
  const all: Particle[] = [
    { r: 2, c: 10, ch: 'z', tone: 'sleep' },
    { r: 1, c: 10, ch: 'z', tone: 'sleep' },
    { r: 0, c: 10, ch: 'Z', tone: 'sleep' },
  ]
  return all.slice(0, step)
}

/** Las flechas del push suben por los dos costados. */
const arrows = (t: number): Particle[] => {
  const r = 2 - (Math.floor(t / 2) % 3)
  return [
    { r, c: 0, ch: '⇡', tone: 'ok' },
    { r, c: 10, ch: '⇡', tone: 'ok' },
  ]
}

/** El destello de Claude orbitando alrededor mientras trabaja. */
const ORBIT: readonly (readonly [number, number])[] = [
  [0, 9], [0, 10], [1, 10], [2, 10], [2, 9], [2, 1], [2, 0], [1, 0], [0, 0], [0, 1],
]
const orbit = (t: number): Particle => {
  const [r, c] = ORBIT[Math.floor(t / 2) % ORBIT.length]!
  return { r, c, ch: sparkFrame(t), tone: 'clawd' }
}

/** Una gota de sudor que cae por la izquierda. */
const sweat = (t: number): Particle => ({ r: Math.floor(t / 4) % 3, c: 0, ch: '°', tone: 'sweat' })

/** Los lentes caen desde arriba (dos pasos) y se calzan sobre los ojos. */
const shadesDrop = (t: number): number => (t < 2 ? -2 : t < 4 ? -1 : 0)
/** Al calzarse, un destello. */
const shadesSpark = (t: number): Particle[] => (t >= 4 && t < 12 ? [{ r: 0, c: 9, ch: t % 4 < 2 ? '✦' : '✧', tone: 'shine' }] : [])

const notes = (t: number): Particle[] =>
  Math.floor(t / 3) % 2 === 0 ? [{ r: 0, c: 10, ch: '♪', tone: 'glow' }] : [{ r: 0, c: 0, ch: '♫', tone: 'glow' }]

// --- Frases --------------------------------------------------------------------

const pick = <T,>(list: readonly T[], seed: number): T => list[((seed % list.length) + list.length) % list.length]!

const greeting = (hour: number | undefined): string => {
  if (hour === undefined) return '¡Hola!'
  if (hour < 6) return '¡Hola! ¿trasnochando?'
  if (hour < 12) return '¡Hola! ¡buen día!'
  if (hour < 20) return '¡Hola! ¡buenas tardes!'
  return '¡Hola! ¿noche de código?'
}

const PHRASES = {
  pet: ['¡jeje!', '¡gracias!', '¡me hacés cosquillas!', 'prr…', '¡otra vez!'],
  submit: ['¡a darle!', '¡vamos!', 'dale, me pongo', '¡manos a la obra!'],
  done: ['¡listo!', '¡terminé!', 'ahí lo tenés', '¡hecho!'],
  abort: ['ok, freno', 'listo, paro', 'frené'],
  fail: ['uy, algo salió mal', 'no pude…', 'se complicó'],
  oops: ['uy…', 'mmm, falló', 'eso no anduvo', 'probemos otra'],
  long: ['esto viene largo…', 'sigo en eso…', 'ya casi…', 'paciencia…'],
  watch: ['te leo…', 'ajá…', 'mhm…'],
  think: ['pensando…', 'mmm…', 'a ver, a ver…'],
  cool: ['deal with it', 'todo bajo control', 'tranqui, lo tengo', 'con estilo', 'fachero, ¿no?'],
} as const

const sayOf = (a: Activity): string => {
  const d = a.detail
  switch (a.kind) {
    case 'think': return 'pensando…'
    case 'read': return d === '' ? 'leyendo…' : `leyendo ${d}`
    case 'search': return d === '' ? 'buscando…' : `buscando ${d}`
    case 'edit': return d === '' ? 'escribiendo…' : `editando ${d}`
    case 'bash': return d === '' ? 'corriendo…' : `corriendo ${d}`
    case 'test': return 'corriendo tests…'
    case 'git': return `git ${d}…`
    case 'web': return d === '' ? 'buscando en la web' : `mirando ${d}`
    case 'agent': return d === '' ? 'mandé un ayudante' : `ayudante: ${d}`
  }
}

// --- Qué hace cada herramienta ------------------------------------------------------

const basename = (path: unknown): string => (typeof path === 'string' ? (path.split('/').pop() ?? '') : '')
const str = (v: unknown): string => (typeof v === 'string' ? v : '')
const TEST_RE = /\b(test|tests|vitest|jest|pytest|mocha|rspec|phpunit)\b/

/** Los tramos de un comando de shell sin los `cd` ni las variables del principio. */
const commandParts = (command: string): string[] =>
  command
    .split(/&&|\|\||;|\|/)
    .map(s => s.trim().replace(/^(\w+=\S*\s+)+/, ''))
    .filter(s => s !== '' && !/^cd\b/.test(s))

/** Qué hace Claude según la herramienta y sus argumentos. */
export const activityOf = (tool: string, input: Record<string, unknown>): Activity => {
  switch (tool) {
    case 'Read':
    case 'NotebookRead':
      return { kind: 'read', detail: basename(input.file_path ?? input.notebook_path) }
    case 'Grep':
    case 'Glob':
      return { kind: 'search', detail: str(input.pattern) === '' ? '' : `«${str(input.pattern)}»` }
    case 'Edit':
    case 'MultiEdit':
    case 'Write':
    case 'NotebookEdit':
      return { kind: 'edit', detail: basename(input.file_path ?? input.notebook_path) }
    case 'WebFetch': {
      const host = /^\w+:\/\/([^/]+)/.exec(str(input.url))?.[1] ?? ''
      return { kind: 'web', detail: host }
    }
    case 'WebSearch':
      return { kind: 'web', detail: '' }
    case 'Agent':
    case 'Task':
      return { kind: 'agent', detail: str(input.description) }
    case 'Bash': {
      const parts = commandParts(str(input.command))
      if (parts.some(p => TEST_RE.test(p))) return { kind: 'test', detail: '' }
      const git = parts.find(p => /^git\s/.test(p))
      if (git !== undefined) return { kind: 'git', detail: git.split(/\s+/)[1] ?? '' }
      return { kind: 'bash', detail: (parts[0] ?? '').split(/\s+/)[0] ?? '' }
    }
    default:
      return { kind: 'think', detail: '' }
  }
}

/** Cómo reacciona cuando la herramienta terminó, o null si no hay nada que festejar ni lamentar. */
export const outcomeOf = (tool: string, input: Record<string, unknown>, isError: boolean): ReactionKind | null => {
  if (tool === 'Bash') {
    const parts = commandParts(str(input.command))
    if (parts.some(p => TEST_RE.test(p))) return isError ? 'testsFail' : 'testsOk'
    if (!isError && parts.some(p => /^git\s+push\b/.test(p))) return 'push'
    if (!isError && parts.some(p => /^git\s+commit\b/.test(p))) return 'commit'
  }
  return isError ? 'oops' : null
}

// --- El bucle en reposo ---------------------------------------------------------

type IdleStep = 'base' | 'blink' | 'lookLeft' | 'lookRight' | 'crouch' | 'jump' | 'dance' | 'stretch' | 'cool'

/** El bucle en reposo, en ticks de 100 ms: unos 17 s por vuelta. */
const LOOP: readonly (readonly [IdleStep, number])[] = [
  ['base', 20], ['blink', 2], ['base', 15],
  ['lookLeft', 8], ['lookRight', 8], ['base', 6], ['blink', 2], ['base', 10],
  ['crouch', 2], ['jump', 3], ['crouch', 2], ['jump', 3], ['base', 12],
  ['dance', 24],
  ['base', 12], ['blink', 2], ['base', 8],
  ['stretch', 12], ['base', 10], ['blink', 2], ['base', 10],
  ['cool', 40], ['base', 10],
]

export const LOOP_TICKS = LOOP.reduce((n, [, t]) => n + t, 0)

/** El paso del bucle en un tick y cuántos ticks lleva en él. */
const loopStep = (tick: number): [IdleStep, number] => {
  let t = ((tick % LOOP_TICKS) + LOOP_TICKS) % LOOP_TICKS
  for (const [name, ticks] of LOOP) {
    if (t < ticks) return [name, t]
    t -= ticks
  }
  return ['base', 0]
}

export const loopPose = (tick: number): IdleStep => loopStep(tick)[0]

type Scene = { pose: Pose; particles?: Particle[]; shift?: number; shades?: number; mark?: string; say?: string | null; sayTone?: Tone }

const coolScene = (t: number, seed: number): Scene => ({
  pose: pose(EYES.base),
  shades: shadesDrop(t),
  particles: shadesSpark(t),
  say: t < 4 ? null : pick(PHRASES.cool, seed),
  sayTone: 'gold',
})

const idleScene = (tick: number): Scene => {
  const [step, t] = loopStep(tick)
  switch (step) {
    case 'blink': return { pose: pose(EYES.blink) }
    case 'lookLeft': return { pose: pose(EYES.left) }
    case 'lookRight': return { pose: pose(EYES.right) }
    case 'crouch': return { pose: crouch() }
    case 'jump': return { pose: jump(), say: '¡hop!' }
    case 'dance': return { pose: dance(tick), particles: notes(tick), mark: Math.floor(tick / 3) % 2 === 0 ? '♪' : '♫', sayTone: 'glow' }
    case 'stretch': return { pose: cheer(EYES.blink), say: 'me estiro un poco' }
    case 'cool': return coolScene(t, Math.floor(tick / LOOP_TICKS))
    default: return { pose: pose(EYES.base) }
  }
}

/** Lo que dice según cómo vienen los límites, cuando la escena no dice nada. */
const remark = (mood: Mood, scene: Scene): string | null => {
  if (mood.maxPct >= 75) return 'conviene dosificar'
  if (scene.mark !== undefined && mood.maxPct < 50) return 'todo tranqui'
  return null
}

const reactionScene = (r: Reaction, t: number): Scene => {
  const shake = t < 6 ? (t % 2 === 0 ? -1 : 1) : 0
  switch (r.kind) {
    case 'greet':
      return { pose: Math.floor(t / 3) % 2 === 0 ? waveUp() : waveDown(), say: greeting(r.hour) }
    case 'pet':
      return {
        pose: t % 4 < 2 ? pose(EYES.happy) : crouch(EYES.happy),
        particles: hearts(t),
        mark: '♥',
        say: pick(PHRASES.pet, r.seed),
        sayTone: 'heart',
      }
    case 'submit':
      return { pose: t < 4 ? crouch() : jump(EYES.happy), say: pick(PHRASES.submit, r.seed) }
    case 'done':
      return {
        pose: Math.floor(t / 3) % 2 === 0 ? cheer() : jump(EYES.happy),
        particles: confetti(t),
        mark: '✦',
        say: pick(PHRASES.done, r.seed),
        sayTone: 'gold',
      }
    case 'abort':
      return { pose: pose(EYES.base), mark: '■', say: pick(PHRASES.abort, r.seed) }
    case 'fail':
      return { pose: pose(EYES.sad), shift: shake, mark: '✗', say: pick(PHRASES.fail, r.seed), sayTone: 'error' }
    case 'oops':
      return { pose: pose(t < 6 ? EYES.wide : EYES.sad), shift: shake, mark: '✗', say: pick(PHRASES.oops, r.seed), sayTone: 'error' }
    case 'testsOk':
      return { pose: Math.floor(t / 3) % 2 === 0 ? cheer() : jump(EYES.happy), particles: confetti(t), mark: '✓', say: '¡tests en verde!', sayTone: 'ok' }
    case 'testsFail':
      return { pose: pose(EYES.sad), shift: shake, particles: [sweat(t)], mark: '✗', say: 'tests en rojo…', sayTone: 'error' }
    case 'commit':
      return { pose: t < 10 ? cheer() : pose(EYES.happy), particles: t < 10 ? confetti(t, 3) : [], mark: '✓', say: '¡commit hecho!', sayTone: 'ok' }
    case 'push':
      return { pose: pose(EYES.base), shades: shadesDrop(t), particles: [...shadesSpark(t), ...arrows(t)], mark: '⇡', say: '¡pusheado!', sayTone: 'ok' }
    case 'cool':
      return coolScene(t, r.seed)
    case 'wake':
      return { pose: pose(EYES.wide), particles: [{ r: 0, c: 10, ch: '!', tone: 'gold' }], say: '¡eh! ¡volviste!' }
  }
}

const workScene = (tick: number, mood: Mood): Scene => {
  const activity = mood.activity ?? { kind: 'think', detail: '' }
  const work = mood.workTicks ?? 0
  const isLong = work >= LONG_WORK
  const particles = [orbit(tick), ...(isLong ? [sweat(tick)] : [])]
  // Cada tanto, en un turno largo, comenta en vez de decir qué hace.
  const say =
    isLong && Math.floor(work / 40) % 4 === 3
      ? pick(PHRASES.long, Math.floor(work / 160))
      : activity.kind === 'think'
        ? pick(PHRASES.think, Math.floor(tick / 30))
        : sayOf(activity)
  const scan = Math.floor(tick / 3) % 2 === 0 ? EYES.left : EYES.right
  let body: Pose
  switch (activity.kind) {
    case 'read':
    case 'search':
    case 'web':
      body = pose(scan)
      break
    case 'think':
      body = scratch(tick)
      // El signo de pregunta titila arriba, antes que el destello.
      if (Math.floor(tick / 6) % 2 === 0) particles.unshift({ r: 0, c: 10, ch: '?', tone: 'gold' })
      break
    case 'agent':
      body = Math.floor(tick / 3) % 2 === 0 ? waveUp() : waveDown()
      break
    default:
      body = typing(tick)
  }
  return { pose: body, particles, mark: sparkFrame(tick), say, sayTone: 'clawd' }
}

const keyOf = (f: Omit<MascotFrame, 'key'>): string =>
  `${f.rows.map(r => r.map(s => `${s.tone ?? ''}:${s.bg ?? ''}:${s.text}`).join('|')).join('/')}#${f.mark}#${f.say ?? ''}#${f.sayTone}`

const frameOf = (scene: Scene, say: string | null): MascotFrame => {
  const f = {
    rows: paint(scene.pose, scene.particles, scene.shift, scene.shades),
    mark: scene.mark ?? '',
    say,
    sayTone: scene.sayTone ?? 'glow',
  }
  return { ...f, key: keyOf(f) }
}

export const mascotFrame = (tick: number, mood: Mood): MascotFrame => {
  if (mood.isStill) {
    const say = mood.isWorking
      ? 'trabajando…'
      : mood.alert !== null
        ? `¡ojo! ${mood.alert.label} al ${Math.round(mood.alert.pct)}%`
        : remark(mood, { pose: pose(EYES.base) })
    return frameOf({ pose: pose(EYES.base), sayTone: mood.alert !== null && !mood.isWorking ? 'error' : 'glow' }, say)
  }

  const r = mood.reaction
  if (r != null && tick - r.at >= 0 && tick - r.at < REACTION_TICKS[r.kind]) {
    const scene = reactionScene(r, tick - r.at)
    return frameOf(scene, scene.say ?? null)
  }

  if (mood.isWorking) {
    const scene = workScene(tick, mood)
    return frameOf(scene, scene.say ?? null)
  }

  if (mood.alert !== null) {
    const scene = idleScene(tick)
    const blink = Math.floor(tick / 5) % 2 === 0
    return frameOf(
      { ...scene, particles: blink ? [{ r: 0, c: 10, ch: '!', tone: 'error' }] : [], mark: '', sayTone: 'error' },
      `¡ojo! ${mood.alert.label} al ${Math.round(mood.alert.pct)}%`,
    )
  }

  const typed = mood.typing
  if (typed != null && tick - typed.at >= 0 && tick - typed.at < TYPING_TICKS) {
    const eyes = typed.ratio < 0.35 ? EYES.left : typed.ratio > 0.65 ? EYES.right : EYES.base
    return frameOf({ pose: pose(eyes) }, pick(PHRASES.watch, Math.floor(tick / 30)))
  }

  if ((mood.idleTicks ?? 0) >= SLEEP_AFTER) {
    return frameOf(
      { pose: pose(EYES.blink), particles: zzz(tick), mark: 'z', sayTone: 'sleep' },
      Math.floor(tick / 10) % 2 === 0 ? 'zzz…' : 'zZz…',
    )
  }

  const scene = idleScene(tick)
  return frameOf(scene, scene.say ?? remark(mood, scene))
}
