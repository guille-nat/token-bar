// Genera las imágenes del README (assets/*.svg) a partir del código real de
// Clawd: cada cuadro sale de `mascotFrame`, así las imágenes no se desfasan
// del mod. GitHub no dibuja bien los medios bloques dentro de un bloque de
// código (salen en blanco y corridos); un SVG con píxeles sí.
//
//   npx -y tsx scripts/readme-art.ts

import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { CLAUDE_GLOW, CLAUDE_ORANGE } from '../hooks/format'
import { type MascotFrame, mascotFrame, type Mood, REACTION_TICKS, type ReactionKind, SLEEP_AFTER, TONE_COLOR, type Tone } from '../hooks/mascot'

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'assets')

/** El fondo y los colores del tema, como los pinta una terminal oscura. */
const BG = '#0D1117'
const PANEL = '#161B22'
const DIM = '#6E7681'
const TEXT = '#C9D1D9'
const THEME: Record<string, string> = { error: '#F7768E', subtle: DIM }
const color = (tone: Tone): string => THEME[TONE_COLOR[tone]] ?? TONE_COLOR[tone]

/** Qué cuartos de la celda llena cada carácter de bloque: [arriba-izq, arriba-der, abajo-izq, abajo-der]. */
const QUADS: Record<string, readonly [number, number, number, number]> = {
  '▀': [1, 1, 0, 0], '▄': [0, 0, 1, 1], '█': [1, 1, 1, 1], '▌': [1, 0, 1, 0], '▐': [0, 1, 0, 1],
  '▘': [1, 0, 0, 0], '▝': [0, 1, 0, 0], '▖': [0, 0, 1, 0], '▗': [0, 0, 0, 1],
  '▛': [1, 1, 1, 0], '▜': [1, 1, 0, 1], '▙': [1, 0, 1, 1], '▟': [0, 1, 1, 1], '▞': [0, 1, 1, 0], '▚': [1, 0, 0, 1],
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/**
 * Un cuadro de Clawd en píxeles: cada celda son 2×2 píxeles (los cuartos de los
 * caracteres de bloque); los píxeles seguidos del mismo color van en un solo
 * rectángulo, y las partículas como texto.
 */
const sprite = (f: MascotFrame, x0: number, y0: number, cw: number, ch: number): string => {
  const px: (string | null)[][] = Array.from({ length: 6 }, () => Array<string | null>(22).fill(null))
  const glyphs: string[] = []
  f.rows.forEach((row, r) => {
    let c = 0
    for (const seg of row) {
      for (const g of seg.text) {
        const q = QUADS[g]
        for (let i = 0; i < 4; i++) {
          const on = q !== undefined && q[i] === 1 && seg.tone !== null
          const fill = on ? color(seg.tone!) : seg.bg !== undefined ? color(seg.bg) : null
          if (fill !== null) px[r * 2 + Math.floor(i / 2)]![c * 2 + (i % 2)] = fill
        }
        if (q === undefined && g !== ' ' && seg.tone !== null) {
          glyphs.push(`<text x="${x0 + c * cw + cw / 2}" y="${y0 + r * ch + ch * 0.75}" font-size="${ch * 0.8}" text-anchor="middle" fill="${color(seg.tone)}">${esc(g)}</text>`)
        }
        c++
      }
    }
  })
  const rects: string[] = []
  px.forEach((line, y) => {
    for (let x = 0; x < line.length; ) {
      const fill = line[x]
      let end = x + 1
      while (end < line.length && line[end] === fill) end++
      if (fill !== null) rects.push(`<rect x="${x0 + (x * cw) / 2}" y="${y0 + (y * ch) / 2}" width="${((end - x) * cw) / 2}" height="${ch / 2}" fill="${fill}"/>`)
      x = end
    }
  })
  return rects.join('') + glyphs.join('')
}

/**
 * Una animación: cada cuadro es un grupo que se ve durante su turno. CSS con
 * `steps`, que GitHub respeta dentro de un <img>.
 */
const animate = (id: string, frames: readonly string[], ms = 100): string => {
  // PREVIEW_FRAME=n deja un solo cuadro fijo, para revisar las imágenes sin navegador.
  const fixed = process.env.PREVIEW_FRAME
  if (fixed !== undefined) return frames[Math.min(Number(fixed), frames.length - 1)] ?? ''
  const total = frames.length * ms
  const slot = 100 / frames.length
  return (
    `<style>.${id}{opacity:0;animation:${id} ${total}ms steps(1,end) infinite}` +
    `@keyframes ${id}{0%{opacity:1}${slot.toFixed(4)}%{opacity:0}100%{opacity:0}}</style>` +
    frames.map((f, i) => `<g class="${id}" style="animation-delay:${i * ms}ms">${f}</g>`).join('')
  )
}

const frames = (mood: (t: number) => Mood, ticks: number): MascotFrame[] => Array.from({ length: ticks }, (_, t) => mascotFrame(t, mood(t)))

const CALM: Mood = { isWorking: false, alert: null, maxPct: 20 }
const react = (kind: ReactionKind, _t: number, extra: object = {}): Mood => ({ ...CALM, reaction: { kind, at: 0, seed: 0, ...extra } })
const working = (kind: string, detail: string) => (t: number): Mood => ({ ...CALM, isWorking: true, workTicks: t, activity: { kind, detail } as Mood['activity'] })

const svg = (w: number, h: number, body: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" shape-rendering="crispEdges" font-family="'JetBrains Mono','Fira Code','SFMono-Regular',Menlo,Consolas,monospace">${body}</svg>\n`

const write = (name: string, content: string) => {
  mkdirSync(OUT, { recursive: true })
  writeFileSync(join(OUT, name), content)
  console.log(`assets/${name}  ${(content.length / 1024).toFixed(1)} KB`)
}

// --- Hero: Clawd grande saluda, parpadea y se pone los lentes -----------------

{
  const cw = 24
  const ch = 48
  const seq: MascotFrame[] = [
    ...frames(t => react('greet', t), 18),
    ...frames(() => CALM, 8),
    mascotFrame(0, { ...CALM, isStill: false, idleTicks: 0, typing: null }),
    ...frames(t => react('cool', t), 34),
    ...frames(t => react('pet', t), 16),
  ].map(f => ({ ...f }))
  const w = 11 * cw + 40
  const h = 3 * ch + 40
  write('clawd.svg', svg(w, h, `<rect width="${w}" height="${h}" rx="18" fill="${BG}"/>` + animate('h', seq.map(f => sprite(f, 20, 20, cw, ch)))))
}

// --- Tiras de escenas con su comentario ------------------------------------------

type Scene = { label: string; seq: MascotFrame[]; say?: string; tone?: Tone }

const strip = (name: string, scenes: Scene[]) => {
  const cw = 14
  const ch = 28
  const tileW = 240
  const w = scenes.length * tileW + 20
  const h = 3 * ch + 90
  const tiles = scenes.map((s, i) => {
    const x = 10 + i * tileW
    const last = s.seq[s.seq.length - 1]!
    const said = s.say ?? (last.say === null ? '' : `╰ ${last.mark === '' ? '' : `${last.mark} `}${last.say}`)
    const tone = s.tone ?? last.sayTone
    return (
      `<rect x="${x}" y="10" width="${tileW - 10}" height="${h - 20}" rx="12" fill="${PANEL}"/>` +
      animate(`${name}${i}`, s.seq.map(f => sprite(f, x + (tileW - 10 - 11 * cw) / 2, 22, cw, ch))) +
      `<text x="${x + 14}" y="${h - 46}" font-size="13" font-style="italic" fill="${color(tone)}">${esc(said)}</text>` +
      `<text x="${x + 14}" y="${h - 22}" font-size="12" fill="${DIM}">${esc(s.label)}</text>`
    )
  })
  write(name, svg(w, h, `<rect width="${w}" height="${h}" rx="16" fill="${BG}"/>` + tiles.join('')))
}

strip('working.svg', [
  { label: 'piensa: se rasca la cabeza', seq: frames(working('think', ''), 24), say: '╰ ✻ pensando…' },
  { label: 'edita: teclea', seq: frames(working('edit', 'app.ts'), 24), say: '╰ ✻ editando app.ts' },
  { label: 'lee: mueve los ojos', seq: frames(working('read', 'README.md'), 24), say: '╰ ✻ leyendo README.md' },
  { label: 'turno largo: transpira', seq: frames(t => ({ ...working('bash', 'npm')(t), workTicks: 1_000 + t }), 24), say: '╰ ✻ corriendo npm' },
])

strip('reactions.svg', [
  { label: 'pasan los tests', seq: frames(t => react('testsOk', t), REACTION_TICKS.testsOk) },
  { label: 'git push', seq: frames(t => react('push', t), REACTION_TICKS.push) },
  { label: 'una herramienta falla', seq: Array.from({ length: 24 }, (_, t) => mascotFrame(t % 12, react('oops', 0))) },
  { label: 'termina la respuesta', seq: frames(t => react('done', t), REACTION_TICKS.done) },
])

strip('companion.svg', [
  { label: 'un clic', seq: frames(t => react('pet', t), REACTION_TICKS.pet) },
  { label: 'tres clics seguidos', seq: frames(t => react('cool', t), REACTION_TICKS.cool), say: '╰ deal with it' },
  { label: 'te mira mientras escribís', seq: frames(t => ({ ...CALM, typing: { at: t, ratio: (t % 20) / 20 } }), 20), say: '╰ te leo…', tone: 'glow' },
  { label: '3 minutos solo', seq: frames(t => ({ ...CALM, idleTicks: SLEEP_AFTER + t }), 24), say: '╰ z zzz…' },
])

// --- La banda completa sobre el prompt -------------------------------------------

{
  const cw = 9.6
  const ch = 22
  const x0 = 24
  const y0 = 24
  type Run = [string, string, { italic?: boolean; bold?: boolean }?]
  /** Una línea de texto en columnas exactas: cada carácter en su x. */
  const line = (col: number, row: number, runs: Run[]) => {
    let c = col
    return runs
      .map(([text, fill, style]) => {
        const xs = [...text].map((_, i) => (x0 + (c + i) * cw).toFixed(1)).join(' ')
        const out = `<text x="${xs}" y="${y0 + row * ch + ch * 0.72}" font-size="16" fill="${fill}"${style?.italic ? ' font-style="italic"' : ''}${style?.bold ? ' font-weight="bold"' : ''} xml:space="preserve">${esc(text)}</text>`
        c += [...text].length
        return out
      })
      .join('')
  }
  const bar = (filled: number, width: number, fill: string): Run[] => [['━'.repeat(filled), fill], ['─'.repeat(width - filled), DIM]]
  const W = 104
  const w = Math.ceil(x0 * 2 + W * cw)
  const h = y0 * 2 + ch * 7
  const think = frames(working('think', ''), 24).map(f => sprite(f, x0, y0, cw, ch))
  const body =
    `<rect width="${w}" height="${h}" rx="16" fill="${BG}"/>` +
    animate('b', think) +
    line(12, 0, [['✻ ', CLAUDE_ORANGE], ['Opus 5.5', CLAUDE_ORANGE, { bold: true }]]) +
    line(12, 1, [['╰ ✳ pensando…', CLAUDE_ORANGE, { italic: true }]]) +
    line(40, 0, [
      [' │ ', DIM], ['Sesión ', '#7AA2F7'], ...bar(3, 8, '#9ECE6A'), [' 23%', '#9ECE6A'], [' ↻ 1:50 p. m.', DIM],
      ['  Semana ', '#BB9AF7'], ...bar(6, 8, CLAUDE_ORANGE), [' 76%', CLAUDE_ORANGE],
    ]) +
    line(40, 1, [
      [' │ ', DIM], ['↑12,3k', '#7DCFFF'], [' ↓4,5k', '#9ECE6A'], ['  US$ 0,42', '#E0AF68'],
      ['  ⎇ main', TEXT], [' ⇡2', '#9ECE6A'], [' ±3', '#E0AF68'], [' #12', '#9ECE6A'], [' ✓', '#9ECE6A'], ['   panel', DIM],
    ]) +
    line(0, 3, [['~/workdir/mi-proyecto', '#BB9AF7']]) +
    `<rect x="${x0 - 4}" y="${y0 + ch * 4.3}" width="${W * cw + 8}" height="${ch * 2.2}" rx="8" fill="none" stroke="${DIM}"/>` +
    line(1, 5, [['> ', TEXT], ['▌', CLAUDE_GLOW]])
  write('band.svg', svg(w, h, body))
}
