// Clawd, el bichito de Claude Code, dibujado con medios bloques: 4 filas de 9
// columnas (efecto arriba, cabeza, cuerpo, patas). Puro: el cuadro sale del
// número de tick y del ánimo, así se testea sin reloj.

import { sparkFrame } from './format'

export type Fx = 'none' | 'notes' | 'sleep' | 'spark' | 'alert'

export type MascotFrame = {
  /** Las 4 filas, cada una de 9 columnas. */
  rows: readonly [string, string, string, string]
  fx: Fx
  /** Lo que dice al lado, o null. */
  say: string | null
  /** Cambia solo cuando cambia el dibujo: el reloj redibuja si cambia. */
  key: string
}

export type Mood = {
  isWorking: boolean
  /** El medidor más alto ≥90 %, con su etiqueta, o null. */
  alert: { label: string; pct: number } | null
  /** El porcentaje más alto entre los medidores (0 sin datos). */
  maxPct: number
}

const BLANK = '         '
const HEAD = ' ▐▛███▜▌ '
const BODY = '▝▜█████▛▘'
const LEGS = '  ▘▘ ▝▝  '

type Pose = { top: string; head: string; body: string; legs: string; fx?: Fx; say?: string }

const base: Pose = { top: BLANK, head: HEAD, body: BODY, legs: LEGS }

const POSES = {
  base,
  blink: { ...base, head: ' ▐█████▌ ' },
  lookLeft: { ...base, head: ' ▐▛███▛▌ ' },
  lookRight: { ...base, head: ' ▐▜███▜▌ ' },
  waveUp: { ...base, head: ' ▐▛███▜▌▝', body: '▝▜█████▛ ', say: '¡Hola!' },
  waveDown: { ...base, head: ' ▐▛███▜▌▗', body: '▝▜█████▛ ', say: '¡Hola!' },
  crouch: { ...base, body: '▗▟█████▙▖', legs: '  ▀▀ ▀▀  ' },
  jump: { top: HEAD, head: BODY, body: LEGS, legs: BLANK, say: '¡hop!' },
  danceA: { top: '  ♪      ', head: '▗▐▛███▜▌ ', body: ' ▜█████▛▘', legs: '   ▘▘▝▝  ', fx: 'notes' },
  danceB: { top: '      ♫  ', head: ' ▐▛███▜▌▖', body: '▝▜█████▛ ', legs: '  ▘▘ ▝▝  ', fx: 'notes' },
  sleepA: { top: '      z  ', head: ' ▐█████▌ ', body: BODY, legs: LEGS, fx: 'sleep', say: 'zzz…' },
  sleepB: { top: '     zZ  ', head: ' ▐█████▌ ', body: BODY, legs: LEGS, fx: 'sleep', say: 'zzz…' },
} satisfies Record<string, Pose>

type PoseName = keyof typeof POSES

/** El bucle en reposo, en ticks de 100 ms: unos 17 s por vuelta. */
const LOOP: readonly (readonly [PoseName, number])[] = [
  ['waveUp', 3], ['waveDown', 3], ['waveUp', 3], ['waveDown', 3], ['waveUp', 3], ['waveDown', 3],
  ['base', 15], ['blink', 2], ['base', 10],
  ['lookLeft', 8], ['lookRight', 8], ['base', 5], ['blink', 2], ['base', 6],
  ['crouch', 2], ['jump', 3], ['crouch', 2], ['jump', 3], ['base', 8],
  ['danceA', 3], ['danceB', 3], ['danceA', 3], ['danceB', 3], ['danceA', 3], ['danceB', 3], ['danceA', 3], ['danceB', 3],
  ['base', 10], ['blink', 2], ['base', 8],
  ['sleepA', 5], ['sleepB', 5], ['sleepA', 5], ['sleepB', 5], ['sleepA', 5], ['sleepB', 5],
  ['blink', 2], ['base', 6],
]

export const LOOP_TICKS = LOOP.reduce((n, [, t]) => n + t, 0)

/** La pose del bucle en un tick. */
export const loopPose = (tick: number): PoseName => {
  let t = ((tick % LOOP_TICKS) + LOOP_TICKS) % LOOP_TICKS
  for (const [name, ticks] of LOOP) {
    if (t < ticks) return name
    t -= ticks
  }
  return 'base'
}

/** Lo que dice según cómo vienen los límites, cuando la pose no dice nada. */
const remark = (mood: Mood, pose: PoseName): string | null => {
  if (pose.startsWith('dance')) return mood.maxPct < 50 ? 'todo tranqui ♪' : '♪'
  if (mood.maxPct >= 75) return 'conviene dosificar'
  return null
}

export const mascotFrame = (tick: number, mood: Mood): MascotFrame => {
  if (mood.isWorking) {
    // Teclea: patas alternadas y el destello de Claude girando sobre la cabeza.
    const spark = sparkFrame(tick)
    const legs = Math.floor(tick / 2) % 2 === 0 ? '  ▘▘ ▝▝  ' : '   ▘▘▝▝  '
    return {
      rows: [`    ${spark}    `, HEAD, BODY, legs],
      fx: 'spark',
      say: 'trabajando…',
      key: `work-${spark}-${legs}`,
    }
  }

  const name = loopPose(tick)
  const pose: Pose = POSES[name]
  if (mood.alert !== null) {
    return {
      rows: ['    !    ', pose.head, pose.body, pose.legs],
      fx: 'alert',
      say: `¡ojo! ${mood.alert.label} al ${Math.round(mood.alert.pct)}%`,
      key: `alert-${name}`,
    }
  }
  return {
    rows: [pose.top, pose.head, pose.body, pose.legs],
    fx: pose.fx ?? 'none',
    say: pose.say ?? remark(mood, name),
    key: name,
  }
}
