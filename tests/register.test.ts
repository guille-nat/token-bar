import { expect, mock, test } from 'claude-code/testing'
import type { On, SessionUsage } from 'claude-code'

// Lunes 2026-10-19, 12:00 en Argentina.
const NOW = Date.parse('2026-10-19T12:00:00-03:00')

const WITH_FABLE: SessionUsage = {
  startedAt: NOW - 60_000,
  context: { tokens: 24_000, window: 200_000, percent: 12 },
  rateLimits: [
    { kind: 'five_hour', percentUsed: 23, resetsAt: '2026-10-19T16:50:00Z' },
    { kind: 'seven_day', percentUsed: 75.5, resetsAt: '2026-10-26T10:00:00Z' },
    { kind: 'seven_day_fable', percentUsed: 92, resetsAt: '2026-10-26T10:00:00Z' },
  ],
  cost: { usd: 0.42 },
}

const WITHOUT_LIMITS: SessionUsage = {
  startedAt: NOW - 60_000,
  context: { window: 200_000 },
  rateLimits: [],
}

const WITHOUT_FABLE: SessionUsage = { ...WITH_FABLE, rateLimits: WITH_FABLE.rateLimits.slice(0, 2) }

const PANE = {
  plugin: 'token-bar',
  component: 'Pane',
  requestId: 'token-bar',
  viewport: { columns: 140, rows: 40 },
  props: {
    title: 'Token bar',
    isFocused: true,
    bodyColumns: 90,
    placement: 'inline',
    scroll: { offset: 0, bodyRows: 20 },
    view: {},
  },
} as const

const BAND = {
  plugin: 'token-bar',
  component: 'AbovePrompt',
  viewport: { columns: 140, rows: 40 },
  props: {
    hasSurvey: false,
    isWorking: false,
    maxRows: 10,
    bodyColumns: 135,
    scroll: { offset: 0, bodyRows: 10 },
    view: {},
  },
} as const

type Run = { exitCode: number; stdout?: string; stderr?: string }
type Repo = { remote: string | null; run: (argv: readonly string[]) => Run | 'no instalado' }

const ok = (stdout: string): Run => ({ exitCode: 0, stdout })

/**
 * Todos los stubs que el mod necesita; devuelve lo que el mod escribió. Sin
 * `repo`, la sesión no corre en un repo git.
 */
const stubEngine = (
  on: On,
  usage: SessionUsage,
  onUsage: () => void = () => {},
  repo?: Repo,
  // La línea de texto viene apagada desde v2: casi todas las pruebas la miran.
  settings: unknown = { v: 2, statusOn: true },
) => {
  const statuses: (string | undefined)[] = []
  const saved = new Map<string, unknown>([['settings', settings]])
  const runs: string[][] = []
  const clock = mock.clock(on, { now: NOW })
  on('session.usage', () => {
    onUsage()
    return { value: usage }
  })
  on('session.model', () => ({ value: 'claude-opus-5-5' }))
  on('session.repo', () => ({
    value: repo === undefined ? null : { root: '/work', remote: repo.remote, internal: false, name: null },
  }))
  on('process.run', ($, e) => {
    runs.push([...e.argv])
    const r = repo?.run(e.argv) ?? { exitCode: 128, stderr: 'fatal: not a git repository' }
    if (r === 'no instalado') return { deny: `${e.argv[0]}: not found` }
    return { value: { stdout: '', stderr: '', isStdoutTruncated: false, isStderrTruncated: false, ...r } }
  })
  on('session.id', () => ({ value: 'sesion-de-prueba' }))
  on('session.start', () => ({ cwd: '/work' }))
  on('session.measure', ($, e) => ({ changed: e.changed }))
  on('turn.complete', () => ({ text: '' }))
  on('command.register', ($, e) => ({ value: { command: e.name } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('ui.toast', () => ({ value: undefined }))
  on('ui.status', ($, e) => {
    statuses.push(e.text)
    return { value: undefined }
  })
  on('store.get', ($, e) => ({ value: saved.get(e.key) }))
  on('store.set', ($, e) => {
    saved.set(e.key, e.value)
    return { value: undefined }
  })
  on('ui.render', () => ({ type: 'Text', props: {}, children: ['banda de otro mod'] }))
  return { statuses, saved, clock, runs }
}

const STATUS = [
  '# branch.oid 1234567890abcdef1234567890abcdef12345678',
  '# branch.head feat/repo',
  '# branch.upstream origin/feat/repo',
  '# branch.ab +2 -0',
  '1 M. N... 100644 100644 100644 aaa bbb hooks/repo.ts',
  '1 .M N... 100644 100644 100644 aaa bbb hooks/format.ts',
  '? Doc/funcionalidades/repo.md',
].join('\n')

const GITHUB = {
  data: {
    repository: {
      issues: { totalCount: 7 },
      pullRequests: { totalCount: 3 },
      object: {
        statusCheckRollup: {
          contexts: {
            nodes: [
              { __typename: 'CheckRun', name: 'build', status: 'COMPLETED', conclusion: 'SUCCESS' },
              { __typename: 'CheckRun', name: 'lint', status: 'COMPLETED', conclusion: 'FAILURE' },
            ],
          },
        },
      },
      branchPrs: {
        nodes: [{ number: 12, title: 'Datos del repo', state: 'OPEN', isDraft: false, reviewDecision: 'APPROVED', url: 'https://github.com/o/r/pull/12' }],
      },
    },
    mine: { issueCount: 1 },
    review: { issueCount: 2 },
  },
}

/** git y gh contestan como un repo de GitHub con un PR y un check fallando. */
const githubRepo = (gh: () => Run | 'no instalado' = () => ok(JSON.stringify(GITHUB))): Repo => ({
  remote: 'git@github.com:o/r.git',
  run: argv => {
    if (argv[0] === 'git' && argv.includes('status')) return ok(STATUS)
    if (argv[0] === 'git' && argv[1] === 'log') return ok('feat: datos del repo\n')
    if (argv[0] === 'gh') return gh()
    return { exitCode: 1 }
  },
})

test('el panel dibuja en terminal y desktop con un límite Fable', async ($, on) => {
  stubEngine(on, WITH_FABLE)
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })
    expect(await ui.find({ key: 'tab-limits' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /Fable semanal/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /se reinicia 1:50 p\. m\./ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /se reinicia lun 7:00 a\. m\./ })).toBeDefined()
    // Con Fable presente no hay aviso de que falta
    expect(await ui.find({ type: 'Text', text: /no viene en rateLimits/ })).toBeUndefined()

    await ui.press({ key: 'tab-tokens' })
    expect(await ui.find({ type: 'Text', text: /Último turno/ })).toBeDefined()
    await ui.press({ key: 'tab-settings' })
    expect(await ui.find({ key: 'toggle-band' })).toBeDefined()
    await ui.press({ key: 'tab-limits' })
    await ui.unmount()
  }
})

test('sin límites: "--" en la barra y "sin datos" en el panel', async ($, on) => {
  const { statuses } = stubEngine(on, WITHOUT_LIMITS)
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })

  expect(statuses.at(-1)).toBe('Opus 5.5 · ⚪ Sesión -- · ⚪ Semana -- · ⚪ ctx -- · ↑0 ↓0')
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: /sin datos/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /primera respuesta del modelo/ })).toBeDefined()
})

test('sin Fable en rateLimits el panel lo dice y no lo inventa', async ($, on) => {
  stubEngine(on, WITHOUT_FABLE)
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })

  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: /Fable semanal: no viene en rateLimits/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /^Fable semanal\s+$/ })).toBeUndefined()
})

test('turn.complete suma tokens y la barra se adapta al ancho', async ($, on) => {
  const { statuses, saved } = stubEngine(on, WITH_FABLE)
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
  await $.turn.complete({
    turnId: 't1',
    answer: 'ok',
    durationMs: 1000,
    isAborted: false,
    reason: 'answer',
    usage: { input_tokens: 100, output_tokens: 4_500, cache_read_input_tokens: 12_000, cache_creation_input_tokens: 200, model: 'claude-test' },
  })
  expect(statuses.at(-1)).toContain('↑12,3k ↓4,5k')
  expect((saved.get('counters') as { counters: { turns: number } }).counters.turns).toBe(1)

  // Un dibujo de la banda con 60 columnas pasa la barra a compacta
  const band = await $.ui.mount({ ...BAND, surface: 'terminal', viewport: { columns: 60, rows: 40 } })
  await band.unmount()
  expect(statuses.at(-1)).toBe('Opus · 🟢S 23% · 🟠W 76% · 🔴F 92% · 🟢ctx 12%')
})

test('la banda está encendida por defecto, conserva la de otros mods y se apaga', async ($, on) => {
  const { saved } = stubEngine(on, WITH_FABLE)
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })

  const band = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(await band.find({ type: 'Text', text: /Sesión/ })).toBeDefined()
  expect(await band.find({ type: 'Text', text: 'banda de otro mod' })).toBeDefined()
  expect(await band.find({ key: 'band-panel' })).toBeDefined()
  await band.unmount()

  const pane = await $.ui.mount({ ...PANE, surface: 'terminal' })
  await pane.press({ key: 'tab-settings' })
  await pane.press({ key: 'toggle-band' })
  expect((saved.get('settings') as { bandOn: boolean; v: number })).toMatchObject({ bandOn: false, v: 2 })

  const off = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(await off.find({ type: 'Text', text: /Sesión/ })).toBeUndefined()
})

test('ajustes de antes de v2: pasa a la banda y apaga la línea de texto', async ($, on) => {
  const { statuses } = stubEngine(on, WITH_FABLE, () => {}, undefined, { statusOn: true, bandOn: false, density: 'compacta' })
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })

  expect(statuses.filter(s => s !== undefined)).toEqual([])
  const band = await $.ui.mount({ ...BAND, surface: 'terminal' })
  // La densidad guardada se respeta: compacta usa las etiquetas cortas.
  expect(await band.find({ type: 'Text', text: /^S $/ })).toBeDefined()
})

test('animaciones: el destello gira mientras trabaja y las barras se llenan', async ($, on) => {
  const { clock } = stubEngine(on, WITH_FABLE)
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })

  const idle = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(await idle.find({ type: 'Text', text: '✻ ' })).toBeDefined()
  // La barra arranca vacía y, unos cuadros después, llega a su valor.
  expect(await idle.find({ type: 'Text', text: /^─{10}$/ })).toBeDefined()
  await idle.unmount()
  await clock.advance(3_000)
  const filled = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(await filled.find({ type: 'Text', text: /^━━╸$/ })).toBeDefined()
  await filled.unmount()

  const working = { ...BAND, surface: 'terminal', props: { ...BAND.props, isWorking: true } } as const
  const first = await $.ui.mount(working)
  const sparkA = (await first.find({ type: 'Text', text: /^[·✢✳✶✻✽] $/ }))?.children
  await first.unmount()
  await clock.advance(100)
  const second = await $.ui.mount(working)
  const sparkB = (await second.find({ type: 'Text', text: /^[·✢✳✶✻✽] $/ }))?.children
  expect(sparkA).toBeDefined()
  expect(sparkB).not.toEqual(sparkA)
})

test('ajustes: apagar la barra la limpia con undefined y la densidad cicla', async ($, on) => {
  const { statuses, saved } = stubEngine(on, WITH_FABLE)
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })

  const pane = await $.ui.mount({ ...PANE, surface: 'terminal' })
  await pane.press({ key: 'tab-settings' })
  await pane.press({ key: 'density' })
  expect((saved.get('settings') as { density: string }).density).toBe('compacta')
  expect(statuses.at(-1)).toBe('Opus · 🟢S 23% · 🟠W 76% · 🔴F 92% · 🟢ctx 12%')

  await pane.press({ key: 'toggle-dots' })
  expect(statuses.at(-1)).toBe('Opus · S 23% · W 76% · F 92% · ctx 12%')

  await pane.press({ key: 'toggle-status' })
  expect(statuses.at(-1)).toBeUndefined()
  expect((saved.get('settings') as { statusOn: boolean }).statusOn).toBe(false)
})

test('reiniciar contadores y refresco cada 30 s', async ($, on) => {
  let calls = 0
  const { saved, clock } = stubEngine(on, WITH_FABLE, () => {
    calls += 1
  })
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
  const before = calls
  await clock.advance(30_000)
  expect(calls).toBe(before + 1)

  await $.turn.complete({
    turnId: 't1',
    answer: 'ok',
    durationMs: 1,
    isAborted: false,
    reason: 'answer',
    usage: { input_tokens: 1, output_tokens: 1, cache_read_input_tokens: 0, cache_creation_input_tokens: 0, model: 'm' },
  })
  const pane = await $.ui.mount({ ...PANE, surface: 'terminal' })
  await pane.press({ key: 'tab-settings' })
  await pane.press({ key: 'reset' })
  expect((saved.get('counters') as { counters: { turns: number } }).counters.turns).toBe(0)
})

test('/token-bar-debug imprime usage crudo, kinds y columnas', async ($, on) => {
  stubEngine(on, WITH_FABLE)
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
  const out = await $.command.run({ command: 'token-bar-debug', args: '', presentation: { isFullscreen: true, columns: 132 } } as never)
  expect(out.text).toContain('"kind": "seven_day_fable"')
  expect(out.text).toContain('"fableEnRateLimits": true')
  expect(out.text).toContain('"command": 132')
  expect(JSON.parse(out.text ?? '').rateLimitKinds).toHaveLength(3)
})


test('la salida de /token-bar-debug se dibuja como bloque JSON', async ($, on) => {
  stubEngine(on, WITH_FABLE)
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({
      plugin: 'token-bar',
      surface,
      component: 'CommandOutput',
      props: { command: 'token-bar-debug', args: '', text: '{\n  "a": 1\n}', isErrored: false },
    })
    expect(await ui.drawn()).toMatchObject({ type: 'Code', props: { language: 'json' } })
    await ui.unmount()
  }
})

test('repo de GitHub: tramo en la barra y pestaña Repo', async ($, on) => {
  const { statuses, runs } = stubEngine(on, WITH_FABLE, () => {}, githubRepo())
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })

  const pane = await $.ui.mount({ ...PANE, surface: 'terminal' })
  await pane.press({ key: 'refresh' })
  expect(statuses.at(-1)).toContain(' · feat/repo ⇡2 ±3 #12 ✗')
  // Un solo gh: la consulta GraphQL trae todo junto
  const gh = runs.filter(r => r[0] === 'gh')
  expect(gh.length >= 1).toBe(true)
  expect(gh[0]).toContain('graphql')
  expect(gh[0]).toContain('branch=feat/repo')

  await pane.press({ key: 'tab-repo' })
  expect(await pane.find({ type: 'Text', text: 'github.com/o/r' })).toBeDefined()
  expect(await pane.find({ type: 'Text', text: 'feat/repo → origin/feat/repo · ⇡2' })).toBeDefined()
  expect(await pane.find({ type: 'Text', text: '1 preparado · 1 modificado · 1 sin seguir' })).toBeDefined()
  expect(await pane.find({ type: 'Text', text: 'Datos del repo' })).toBeDefined()
  expect(await pane.find({ type: 'Text', text: 'abierto · aprobado' })).toBeDefined()
  expect(await pane.find({ type: 'Text', text: '✗ 1 fallando (lint) · 1 ok' })).toBeDefined()
  expect(await pane.find({ type: 'Text', text: '7 abiertos · 1 asignados a vos' })).toBeDefined()
  expect(await pane.find({ type: 'Text', text: '3 abiertos · 2 te piden review' })).toBeDefined()
})

test('GitHub se consulta de nuevo solo si la rama se movió o pasaron 2 min', async ($, on) => {
  const { runs, clock } = stubEngine(on, WITH_FABLE, () => {}, githubRepo())
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
  const pane = await $.ui.mount({ ...PANE, surface: 'terminal' })
  await pane.press({ key: 'refresh' })
  const before = runs.filter(r => r[0] === 'gh').length

  // 30 s: git sí, gh no (la rama no se movió)
  const gitBefore = runs.filter(r => r[0] === 'git').length
  await clock.advance(30_000)
  await pane.press({ key: 'tab-repo' })
  expect(runs.filter(r => r[0] === 'git').length > gitBefore).toBe(true)
  expect(runs.filter(r => r[0] === 'gh').length).toBe(before)

  // Pasados 2 min, vuelve a preguntar
  await clock.advance(120_000)
  await pane.press({ key: 'refresh' })
  expect(runs.filter(r => r[0] === 'gh').length > before).toBe(true)
})

for (const [name, gh, message] of [
  ['sin gh instalado', () => 'no instalado' as const, /gh no está instalado/],
  ['gh sin sesión', () => ({ exitCode: 4, stderr: 'To get started with GitHub CLI, please run: gh auth login' }), /gh sin sesión/],
] as const) {
  test(`${name}: el panel lo explica y git sigue`, async ($, on) => {
    const { statuses } = stubEngine(on, WITH_FABLE, () => {}, githubRepo(gh))
    await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
    const pane = await $.ui.mount({ ...PANE, surface: 'terminal' })
    await pane.press({ key: 'refresh' })
    await pane.press({ key: 'tab-repo' })
    expect(await pane.find({ type: 'Text', text: message })).toBeDefined()
    expect(statuses.at(-1)).toContain('feat/repo ⇡2 ±3')
  })
}

test('repo de GitLab: MR y pipeline con glab api', async ($, on) => {
  const { statuses } = stubEngine(on, WITH_FABLE, () => {}, {
    remote: 'https://gitlab.com/grupo/sub/r.git',
    run: argv => {
      if (argv[0] === 'git' && argv.includes('status')) return ok(STATUS)
      if (argv[0] === 'git') return ok('feat: x\n')
      const path = String(argv.at(-1))
      if (path === 'user') return ok(JSON.stringify({ username: 'yo' }))
      if (path.includes('source_branch=feat%2Frepo'))
        return ok(JSON.stringify([{ iid: 5, title: 'MR de prueba', state: 'opened', draft: true, web_url: 'https://gitlab.com/grupo/sub/r/-/merge_requests/5' }]))
      if (path.includes('pipelines?sha=1234567890')) return ok(JSON.stringify([{ id: 9, status: 'running' }]))
      if (path.includes('issues_statistics?scope=assigned_to_me')) return ok(JSON.stringify({ statistics: { counts: { opened: 0 } } }))
      if (path.includes('issues_statistics')) return ok(JSON.stringify({ statistics: { counts: { opened: 4 } } }))
      if (path.includes('reviewer_username=yo')) return ok(JSON.stringify([{}]))
      if (path.includes('merge_requests?state=opened')) return ok(JSON.stringify([{}, {}]))
      return { exitCode: 1, stderr: `ruta inesperada ${path}` }
    },
  })
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
  const pane = await $.ui.mount({ ...PANE, surface: 'terminal' })
  await pane.press({ key: 'refresh' })
  expect(statuses.at(-1)).toContain('feat/repo ⇡2 ±3 !5 ○')

  await pane.press({ key: 'tab-repo' })
  expect(await pane.find({ type: 'Text', text: 'gitlab.com/grupo/sub/r' })).toBeDefined()
  expect(await pane.find({ type: 'Text', text: 'borrador' })).toBeDefined()
  expect(await pane.find({ type: 'Text', text: '○ 1 corriendo' })).toBeDefined()
  expect(await pane.find({ type: 'Text', text: '2 abiertos · 1 te piden review' })).toBeDefined()
})

test('apagar el repo en Ajustes lo saca de la barra y no corre git', async ($, on) => {
  const { statuses, runs } = stubEngine(on, WITH_FABLE, () => {}, githubRepo())
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
  const pane = await $.ui.mount({ ...PANE, surface: 'terminal' })
  await pane.press({ key: 'refresh' })
  expect(statuses.at(-1)).toContain('feat/repo')

  await pane.press({ key: 'tab-settings' })
  await pane.press({ key: 'toggle-repo' })
  expect(statuses.at(-1)).not.toContain('feat/repo')
  const count = runs.length
  await pane.press({ key: 'refresh' })
  expect(runs.length).toBe(count)
})

test('el modelo va en la barra y en el panel; la leyenda explica colores y símbolos', async ($, on) => {
  const { statuses } = stubEngine(on, WITH_FABLE)
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
  expect(statuses.at(-1)?.startsWith('Opus 5.5 · 🟢 Sesión')).toBe(true)

  const pane = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await pane.find({ type: 'Text', text: 'Opus 5.5' })).toBeDefined()
  await pane.press({ key: 'tab-legend' })
  for (const text of [/🟢 <50%/, /🟡 50–74%/, /🟠 75–89%/, /🔴 ≥90%/, /ventana de 5 h/, /commits sin pushear/, /PR de GitHub/]) {
    expect(await pane.find({ type: 'Text', text })).toBeDefined()
  }
})
