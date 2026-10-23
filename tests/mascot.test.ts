import { describe, expect, test } from 'claude-code/testing'

import { activityOf, LOOP_TICKS, loopPose, MASCOT_WIDTH, mascotFrame, type Mood, outcomeOf, REACTION_TICKS, SLEEP_AFTER } from '../hooks/mascot'

const CALM: Mood = { isWorking: false, alert: null, maxPct: 20 }
const WORKING: Mood = { ...CALM, isWorking: true, workTicks: 0 }

const text = (f: ReturnType<typeof mascotFrame>): string => f.rows.map(r => r.map(s => s.text).join('')).join('\n')

describe('Clawd', () => {
  test('todo cuadro mide 3 filas de 11 columnas, con partículas o sacudiéndose', () => {
    const moods: Mood[] = [
      CALM,
      { ...WORKING, activity: { kind: 'edit', detail: 'mascot.ts' } },
      { ...WORKING, workTicks: 2_000 },
      { ...CALM, alert: { label: 'Semana', pct: 93 } },
      { ...CALM, idleTicks: SLEEP_AFTER },
      { ...CALM, typing: { at: 0, ratio: 0.9 } },
      ...Object.keys(REACTION_TICKS).map(kind => ({ ...CALM, reaction: { kind, at: 0, seed: 3 } }) as Mood),
    ]
    for (const mood of moods) {
      for (let t = 0; t < LOOP_TICKS; t += 3) {
        const f = mascotFrame(t, mood)
        expect(f.rows.length).toBe(3)
        for (const row of f.rows) expect([...row.map(s => s.text).join('')].length).toBe(MASCOT_WIDTH)
      }
    }
  })

  test('en reposo mira, salta, baila y se estira; el bucle vuelve a empezar', () => {
    const poses = new Set(Array.from({ length: LOOP_TICKS }, (_, t) => loopPose(t)))
    for (const p of ['blink', 'lookLeft', 'jump', 'dance', 'stretch']) expect(poses.has(p as never)).toBe(true)
    expect(loopPose(LOOP_TICKS)).toBe(loopPose(0))
  })

  test('saluda según la hora y la reacción se termina sola', () => {
    const greet = { kind: 'greet', at: 0, seed: 0, hour: 9 } as const
    expect(mascotFrame(0, { ...CALM, reaction: greet }).say).toBe('¡Hola! ¡buen día!')
    expect(mascotFrame(0, { ...CALM, reaction: { ...greet, hour: 23 } }).say).toBe('¡Hola! ¿noche de código?')
    expect(mascotFrame(REACTION_TICKS.greet, { ...CALM, reaction: greet }).say ?? '').not.toMatch(/Hola/)
  })

  test('trabajando dice qué hace y el destello orbita', () => {
    const editing = { ...WORKING, activity: { kind: 'edit', detail: 'mascot.ts' } } as const
    const a = mascotFrame(0, editing)
    const b = mascotFrame(2, editing)
    expect(a.say).toBe('editando mascot.ts')
    expect(a.mark).not.toBe(b.mark)
    expect(text(a)).not.toBe(text(b))
    expect(mascotFrame(0, WORKING).say).toBe('pensando…')
  })

  test('pensando se rasca la cabeza como el meme, con un ? que titila', () => {
    const heads = new Set(Array.from({ length: 8 }, (_, t) => mascotFrame(t, WORKING).rows[0].map(s => s.text).join('')))
    expect([...heads].some(h => h.includes('▝')) && [...heads].some(h => h.includes('▘'))).toBe(true)
    expect(text(mascotFrame(0, WORKING))).toContain('?')
    expect(mascotFrame(0, { ...WORKING, activity: { kind: 'read', detail: 'a.ts' } }).say).toBe('leyendo a.ts')
  })

  test('un turno largo transpira y cada tanto lo comenta', () => {
    const says = new Set(Array.from({ length: 400 }, (_, i) => mascotFrame(i, { ...WORKING, workTicks: 1_000 + i }).say))
    expect([...says].some(s => /largo|sigo|casi|paciencia/.test(s ?? ''))).toBe(true)
    expect(text(mascotFrame(0, { ...WORKING, workTicks: 1_000 }))).toContain('°')
  })

  test('festeja con confeti, se pone contento con caricias y se queja si son muchas', () => {
    const done = mascotFrame(0, { ...CALM, reaction: { kind: 'done', at: 0, seed: 0 } })
    expect(done.say).toBe('¡listo!')
    expect(done.rows.flat().some(s => s.tone !== 'clawd' && s.tone !== null)).toBe(true)
    const pet = mascotFrame(0, { ...CALM, reaction: { kind: 'pet', at: 0, seed: 0 } })
    expect(text(pet)).toContain('♥')
    expect(mascotFrame(0, { ...CALM, reaction: { kind: 'pet', at: 0, seed: 9 } }).say).toMatch(/ya|gastar|insistente/)
  })

  test('fachero: los lentes caen, se calzan sobre los ojos y brillan', () => {
    const cool = { ...CALM, reaction: { kind: 'cool', at: 0, seed: 0 } } as const
    const tones = (t: number, r: 0 | 1) => mascotFrame(t, cool).rows[r].flatMap(s => [s.tone, s.bg])
    // Ya calzados: banda negra con brillo blanco en la cabeza, sobre la frente naranja,
    // y los cristales en el cuerpo.
    const head = mascotFrame(10, cool).rows[0]
    expect(head.some(s => s.tone === 'clawd' && s.bg === 'shades')).toBe(true)
    expect(tones(10, 0)).toContain('shine')
    expect(tones(10, 1)).toContain('shades')
    expect(tones(10, 1)).toContain('shine')
    // Mientras caen todavía no llegaron al cuerpo.
    expect(tones(0, 1)).not.toContain('shades')
    expect(text(mascotFrame(0, cool))).not.toBe(text(mascotFrame(10, cool)))
    expect(mascotFrame(10, cool).say).toBe('deal with it')
    expect(mascotFrame(0, cool).say).toBeNull()
    // En reposo también se los pone, y con el push.
    expect(new Set(Array.from({ length: LOOP_TICKS }, (_, t) => loopPose(t))).has('cool' as never)).toBe(true)
    expect(mascotFrame(10, { ...CALM, reaction: { kind: 'push', at: 0, seed: 0 } }).rows[0].some(s => s.bg === 'shades')).toBe(true)
  })

  test('mientras escribís te sigue con los ojos; solo un rato después se duerme', () => {
    const left = mascotFrame(5, { ...CALM, typing: { at: 0, ratio: 0.1 } })
    const right = mascotFrame(5, { ...CALM, typing: { at: 0, ratio: 0.9 } })
    expect(left.say).toMatch(/te leo|ajá|mhm/)
    expect(text(left)).not.toBe(text(right))
    expect(mascotFrame(0, { ...CALM, idleTicks: SLEEP_AFTER - 1 }).say ?? '').not.toMatch(/zzz/i)
    expect(mascotFrame(0, { ...CALM, idleTicks: SLEEP_AFTER }).say).toMatch(/z.z…/i)
  })

  test('al límite avisa cuál; sin animaciones queda quieto pero avisa igual', () => {
    expect(mascotFrame(50, { ...CALM, alert: { label: 'Semana', pct: 92.6 } }).say).toBe('¡ojo! Semana al 93%')
    const still = { ...CALM, isStill: true, reaction: { kind: 'done', at: 0, seed: 0 } } as const
    expect(text(mascotFrame(0, still))).toBe(text(mascotFrame(7, still)))
    expect(mascotFrame(0, { ...still, alert: { label: 'Semana', pct: 95 } }).say).toBe('¡ojo! Semana al 95%')
  })

  test('activityOf: cada herramienta, con su archivo o comando', () => {
    expect(activityOf('Read', { file_path: '/a/b/register.tsx' })).toEqual({ kind: 'read', detail: 'register.tsx' })
    expect(activityOf('Grep', { pattern: 'mascot' })).toEqual({ kind: 'search', detail: '«mascot»' })
    expect(activityOf('Bash', { command: 'cd /x && FOO=1 claude plugin test .' }).kind).toBe('test')
    expect(activityOf('Bash', { command: 'git push origin main' })).toEqual({ kind: 'git', detail: 'push' })
    expect(activityOf('Bash', { command: 'ls -la' })).toEqual({ kind: 'bash', detail: 'ls' })
    expect(activityOf('WebFetch', { url: 'https://docs.github.com/x' })).toEqual({ kind: 'web', detail: 'docs.github.com' })
    expect(activityOf('mcp__x__y', {}).kind).toBe('think')
  })

  test('outcomeOf: tests, commit, push y errores', () => {
    expect(outcomeOf('Bash', { command: 'npm test' }, false)).toBe('testsOk')
    expect(outcomeOf('Bash', { command: 'npm test' }, true)).toBe('testsFail')
    expect(outcomeOf('Bash', { command: 'git add . && git commit -m x' }, false)).toBe('commit')
    expect(outcomeOf('Bash', { command: 'git push' }, false)).toBe('push')
    expect(outcomeOf('Read', { file_path: '/no' }, true)).toBe('oops')
    expect(outcomeOf('Read', { file_path: '/si' }, false)).toBeNull()
  })
})
