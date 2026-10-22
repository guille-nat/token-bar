import type { EngineInterface, Register } from 'claude-code'

import {
  addTokens,
  CLAUDE_GLOW,
  CLAUDE_ORANGE,
  CONTEXT_COLOR,
  type Counters,
  type Density,
  easeToward,
  emptyCounters,
  fitStatusLine,
  formatInt,
  formatModel,
  formatPct,
  formatReset,
  formatTokens,
  formatUsd,
  hasFable,
  kindColor,
  labelFor,
  levelFor,
  lineBar,
  nextDensity,
  numericFields,
  shimmerIndex,
  shortLabelFor,
  sortLimits,
  SPARK_IDLE,
  sparkFrame,
  toneFor,
  totalInput,
  type TurnTokens,
  type Usage,
  USAGE_LEVELS,
} from './format'
import { type Fx, mascotFrame, type Mood } from './mascot'
import {
  type ChangeState,
  changeLabel,
  changeRef,
  type CiState,
  firstLine,
  type ForgeData,
  formatAgo,
  formatBranch,
  formatChanges,
  formatCi,
  formatCount,
  type GitState,
  GITHUB_QUERY,
  githubVariables,
  gitKey,
  gitlabPaths,
  parseGithub,
  parseGitlab,
  parseRemote,
  parseStatus,
  parseSubject,
  type Remote,
  type RepoInfo,
  repoSummary,
} from './repo'

// $.session, $.ui, $.store, $.clock, $.command y, para el repo, $.process
// (ver Doc/arquitectura.md): sin $.state, así que el estado vive en el módulo
// y se redibuja con $.ui.invalidate; lo que debe sobrevivir a un hot-reload va
// a $.store.

type Tab = 'limits' | 'tokens' | 'settings' | 'repo' | 'legend'
type Settings = { statusOn: boolean; bandOn: boolean; density: Density; repoOn: boolean; dotsOn: boolean; mascotOn: boolean }

const PANE = 'token-bar'
const REFRESH_MS = 30_000
/** Cada cuánto se vuelve a preguntar a GitHub/GitLab si la rama no se movió. */
const FORGE_MS = 120_000
/** Cuadro de las animaciones: destello, barrido del modelo y barras que se llenan. */
const FRAME_MS = 100
/**
 * v2: la banda (con colores y animaciones) pasa a ser la vista por defecto y la
 * línea de texto se apaga, porque el engine la dibuja toda en amarillo con "⚠".
 */
const SETTINGS_VERSION = 2
const DEFAULTS: Settings = { statusOn: false, bandOn: true, density: 'auto', repoOn: true, dotsOn: true, mascotOn: true }
/** Por debajo de este ancho de banda, Clawd no entra junto a los medidores. */
const MASCOT_MIN_COLUMNS = 60

let usage: Usage | null = null
let model: string | null = null
let counters: Counters = emptyCounters()
let settings: Settings = { ...DEFAULTS }
let tab: Tab = 'limits'
let lastStatus: string | undefined
let statusLevel: string = 'media'
let lastTurnRaw: Record<string, number> | null = null
let repo: RepoInfo | null = null
let repoJob: Promise<void> | null = null
let frame = 0
let isWorking = false
let mascotKey = ''
/** Lo que muestra cada barra mientras se acerca a su valor (clave: kind o "ctx"). */
const shown = new Map<string, number>()
const columns: { status: number | null; band: number | null; pane: number | null; command: number | null } = {
  status: null,
  band: null,
  pane: null,
  command: null,
}

const offsetMin = (iso: string): number => new Date(iso).getTimezoneOffset()

const readSettings = (raw: unknown): Settings => {
  const s = (typeof raw === 'object' && raw !== null ? raw : {}) as Partial<Settings>
  const bool = (v: unknown, fallback: boolean) => (typeof v === 'boolean' ? v : fallback)
  // Ajustes guardados antes de v2: se respeta todo menos dónde se dibuja.
  const isCurrent = (s as { v?: unknown }).v === SETTINGS_VERSION
  return {
    statusOn: isCurrent ? bool(s.statusOn, DEFAULTS.statusOn) : DEFAULTS.statusOn,
    bandOn: isCurrent ? bool(s.bandOn, DEFAULTS.bandOn) : DEFAULTS.bandOn,
    density: ['auto', 'compacta', 'media', 'completa'].includes(String(s.density))
      ? (s.density as Density)
      : DEFAULTS.density,
    repoOn: bool(s.repoOn, DEFAULTS.repoOn),
    dotsOn: bool(s.dotsOn, DEFAULTS.dotsOn),
    mascotOn: bool(s.mascotOn, DEFAULTS.mascotOn),
  }
}

const saveSettings = ($: EngineInterface) => $.store.set('settings', { ...settings, v: SETTINGS_VERSION })

/** Los valores de las barras: cada límite y el contexto. */
const targets = (): [string, number][] => [
  ...(usage?.rateLimits ?? []).map(l => [l.kind, l.percentUsed] as [string, number]),
  ...(usage?.context.percent === undefined ? [] : [['ctx', usage.context.percent] as [string, number]]),
]

/** El valor animado de una barra; arranca en 0 para que se llene al abrir. */
const shownPct = (key: string, pct: number): number => shown.get(key) ?? (shown.set(key, 0), 0)

/** Arriba de 90 % el porcentaje late (medio segundo encendido, medio atenuado). */
const isPulseDim = (pct: number | undefined): boolean => pct !== undefined && pct >= 90 && Math.floor(frame / 5) % 2 === 1

/**
 * Un cuadro: avanza las barras hacia su valor y redibuja solo si algo se mueve
 * (un turno corriendo, una barra llenándose, un medidor al límite latiendo).
 */
const tick = ($: EngineInterface) => {
  frame += 1
  let isMoving = false
  for (const [key, pct] of targets()) {
    const from = shown.get(key)
    if (from === undefined) continue
    const to = easeToward(from, pct)
    if (to !== from) {
      shown.set(key, to)
      isMoving = true
    }
  }
  const isAlert = targets().some(([, pct]) => pct >= 90)
  // Clawd cambia de pose cada tantos ticks: se redibuja solo cuando cambia.
  const nextMascot = settings.bandOn && settings.mascotOn ? mascotFrame(frame, mood()).key : ''
  const isMascotMoving = nextMascot !== mascotKey
  mascotKey = nextMascot
  if (isMoving || isWorking || isMascotMoving || (isAlert && frame % 5 === 0)) $.ui.invalidate('ui.render')
}

/** Cómo está Clawd: trabajando, al límite (el medidor más alto ≥90 %) o tranquilo. */
const mood = (): Mood => {
  const limits = (usage?.rateLimits ?? []).map(l => ({ label: labelFor(l.kind), pct: l.percentUsed }))
  if (usage?.context.percent !== undefined) limits.push({ label: 'el contexto', pct: usage.context.percent })
  const top = limits.reduce<{ label: string; pct: number } | null>((a, b) => (a === null || b.pct > a.pct ? b : a), null)
  return { isWorking, alert: top !== null && top.pct >= 90 ? top : null, maxPct: top?.pct ?? 0 }
}

const FX_COLOR: Record<Fx, string | undefined> = {
  none: undefined,
  notes: CLAUDE_GLOW,
  sleep: 'subtle',
  spark: CLAUDE_ORANGE,
  alert: 'error',
}

const saveCounters = async ($: EngineInterface) =>
  $.store.set('counters', { sessionId: await $.session.id(), counters })

const loadCounters = async ($: EngineInterface): Promise<Counters> => {
  const raw = (await $.store.get('counters')) as { sessionId?: string; counters?: Counters } | undefined
  return raw?.sessionId === (await $.session.id()) && raw.counters ? raw.counters : emptyCounters()
}

const updateStatus = async ($: EngineInterface) => {
  const fit = fitStatusLine({
    usage,
    counters,
    density: settings.density,
    columns: columns.status ?? columns.command,
    nowMs: await $.clock.now(),
    offsetMin,
    model,
    dots: settings.dotsOn,
    repo: settings.repoOn ? repo : null,
  })
  statusLevel = fit.level
  const text = settings.statusOn ? fit.text : undefined
  if (text === lastStatus) return
  lastStatus = text
  $.ui.status(text)
}

const repaint = async ($: EngineInterface) => {
  await updateStatus($)
  $.ui.invalidate('ui.render')
}

const refresh = async ($: EngineInterface) => {
  const [nextUsage, nextModel] = await Promise.all([$.session.usage(), $.session.model().catch(() => model)])
  usage = nextUsage
  model = nextModel
  await repaint($)
}

/** Corre un comando; si no arranca (no instalado), lo dice con su nombre. */
const cli = async ($: EngineInterface, argv: string[], timeoutMs = 20_000) => {
  try {
    return await $.process.run(argv, { timeoutMs })
  } catch {
    throw new Error(`${argv[0]} no está instalado o no se pudo ejecutar`)
  }
}

const readGit = async ($: EngineInterface): Promise<GitState | null> => {
  // --no-optional-locks: no pelea el index.lock con los git que corre Claude.
  const status = await cli($, ['git', '--no-optional-locks', 'status', '--porcelain=v2', '--branch'], 10_000).catch(() => null)
  if (status === null || status.exitCode !== 0) return null
  const base = parseStatus(status.stdout)
  const log = base.sha === null ? null : await cli($, ['git', 'log', '-1', '--format=%s'], 10_000).catch(() => null)
  return { ...base, subject: log?.exitCode === 0 ? parseSubject(log.stdout) : null }
}

const readGithub = async ($: EngineInterface, remote: Remote, git: GitState): Promise<ForgeData> => {
  const vars = Object.entries(githubVariables(remote.path, git)).flatMap(([k, v]) => ['-f', `${k}=${v}`])
  const r = await cli($, ['gh', 'api', 'graphql', '--hostname', remote.host, '-f', `query=${GITHUB_QUERY}`, ...vars])
  if (r.exitCode === 4) throw new Error('gh sin sesión: corré gh auth login')
  if (r.exitCode !== 0) throw new Error(firstLine(r.stderr) || `gh salió con ${r.exitCode}`)
  return parseGithub(JSON.parse(r.stdout), git)
}

const readGitlab = async ($: EngineInterface, remote: Remote, git: GitState): Promise<ForgeData> => {
  const api = async (path: string): Promise<unknown> => {
    const r = await cli($, ['glab', 'api', '--hostname', remote.host, path])
    if (r.exitCode !== 0) throw new Error(firstLine(r.stderr) || `glab salió con ${r.exitCode}`)
    return JSON.parse(r.stdout)
  }
  const paths = gitlabPaths(remote.path, git)
  const [user, mrs, pipelines, issues, assigned, openMrs] = await Promise.all([
    api(paths.user),
    api(paths.mrs),
    // Sin sha, `pipelines?sha=` traería los de cualquier commit.
    git.sha === null ? Promise.resolve([]) : api(paths.pipelines),
    api(paths.issues),
    api(paths.assigned),
    api(paths.openMrs),
  ])
  const username = (user as { username?: unknown }).username
  const reviewMrs = typeof username === 'string' ? await api(paths.reviewMrs(username)) : null
  return parseGitlab({ mrs, pipelines, issues, assigned, openMrs, reviewMrs }, git)
}

/**
 * git local en cada llamada; GitHub/GitLab solo si `force`, si la rama se movió
 * (rama, commit, adelante/atrás) o si pasaron FORGE_MS desde la última consulta.
 */
const readRepo = async ($: EngineInterface, force: boolean) => {
  if (!settings.repoOn) {
    repo = null
    return repaint($)
  }
  const found = await $.session.repo().catch(() => null)
  if (found === null) {
    repo = null
    return repaint($)
  }
  const prev = repo?.root === found.root ? repo : null
  const remote = found.remote === null ? null : parseRemote(found.remote)
  const git = await readGit($)
  const base: RepoInfo = {
    root: found.root,
    remote,
    git,
    forge: prev?.forge ?? null,
    forgeError: prev?.forgeError ?? null,
    updatedAt: prev?.updatedAt ?? null,
  }
  repo = base
  if (remote?.forge == null || git === null) {
    repo = { ...base, forge: null, forgeError: null }
    return repaint($)
  }
  await repaint($)

  const now = await $.clock.now()
  const isStale = prev?.updatedAt == null || now - prev.updatedAt >= FORGE_MS
  if (!force && !isStale && gitKey(prev?.git ?? null) === gitKey(git)) return

  try {
    const forge = remote.forge === 'github' ? await readGithub($, remote, git) : await readGitlab($, remote, git)
    repo = { ...base, forge, forgeError: null, updatedAt: now }
  } catch (err) {
    repo = { ...base, forge: null, forgeError: err instanceof Error ? err.message : String(err), updatedAt: now }
  }
  await repaint($)
}

/** Una lectura a la vez; `force` con una en curso espera y lee de nuevo. */
const refreshRepo = ($: EngineInterface, force = false): Promise<void> => {
  if (repoJob !== null) return force ? repoJob.then(() => refreshRepo($, true)) : repoJob
  repoJob = readRepo($, force)
    .catch(() => {})
    .finally(() => {
      repoJob = null
    })
  return repoJob
}

const tokensOf = (u: { input_tokens: number; output_tokens: number; cache_read_input_tokens: number; cache_creation_input_tokens: number }): TurnTokens => ({
  input: u.input_tokens,
  output: u.output_tokens,
  cacheRead: u.cache_read_input_tokens,
  cacheWrite: u.cache_creation_input_tokens,
})

const CI_TONE: Record<CiState, string> = { ok: 'success', falla: 'error', corriendo: 'warning' }
const CHANGE_TONE: Record<ChangeState, string | undefined> = {
  abierto: 'success',
  borrador: undefined,
  mergeado: 'merged',
  cerrado: 'error',
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    settings = readSettings(await $.store.get('settings'))
    counters = await loadCounters($)
    await $.command.register({ name: 'token-bar', description: 'Panel de consumo, límites, modelo y repo' })
    await $.command.register({ name: 'token-bar-debug', description: 'Datos crudos de token-bar para depurar' })
    await refresh($)
    // git y gh pueden tardar: el inicio de la sesión no los espera.
    void refreshRepo($)
    $.clock.every(FRAME_MS, () => tick($))
    $.clock.every(REFRESH_MS, () => {
      void refresh($)
      void refreshRepo($)
    })

    return next(e)
  })

  on('session.end', async ($, e, next) => {
    if (e.reason === 'clear') {
      counters = emptyCounters()
      lastTurnRaw = null
    }

    return next(e)
  })

  on('session.measure', async ($, e, next) => {
    await refresh($)

    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    lastTurnRaw = numericFields(e)
    if (e.usage !== undefined) {
      const turn = tokensOf(e.usage)
      counters =
        e.agentId === undefined
          ? { ...counters, turns: counters.turns + 1, main: addTokens(counters.main, turn), last: { ...turn, model: e.usage.model } }
          : { ...counters, agents: addTokens(counters.agents, turn) }
      await saveCounters($)
      await repaint($)
    }
    // Un turno pudo commitear, pushear o cambiar de rama.
    if (e.agentId === undefined) void refreshRepo($)

    return next(e)
  })

  on('command.run', { command: 'token-bar' }, async ($, e) => {
    columns.command = e.presentation?.columns ?? columns.command
    const opened = await $.ui.open({ id: PANE, title: 'Token bar', focus: true, closeOnEscape: true })

    return { text: opened.isPlaced ? 'Panel de token-bar abierto (Esc cierra).' : `token-bar: el panel no se pudo ubicar (${opened.reason}).` }
  })

  on('command.run', { command: 'token-bar-debug' }, async ($, e) => {
    columns.command = e.presentation?.columns ?? columns.command
    const raw = await $.session.usage()
    const sample = new Date(await $.clock.now())
    const report = {
      usage: raw,
      modelo: { crudo: model, mostrado: formatModel(model) },
      rateLimitKinds: raw.rateLimits.map(l => ({ kind: l.kind, etiqueta: labelFor(l.kind) })),
      fableEnRateLimits: hasFable(raw.rateLimits),
      ultimoTurnComplete: lastTurnRaw,
      contadores: counters,
      repo,
      columnas: columns,
      densidadEfectiva: statusLevel,
      ajustes: settings,
      zonaHoraria: { offsetMin: sample.getTimezoneOffset(), local: sample.toString() },
      lineaDeEstado: lastStatus ?? null,
    }

    return { text: JSON.stringify(report, null, 2) }
  })

  // La fila de salida de un comando junta las líneas: el JSON del debug se
  // dibuja como bloque de código para que se lea.
  on('ui.render', { component: 'CommandOutput', props: { command: 'token-bar-debug' } }, async ($, e, next) => {
    if (e.props.isErrored || !e.props.text.trimStart().startsWith('{')) return next(e)
    const { Code } = $.ui.resolve(e)

    return <Code source={e.props.text} language="json" />
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    // Cualquier dibujo de la banda trae el ancho de la terminal: de acá sale
    // el ancho de la línea de estado, aunque la banda esté apagada.
    const width = e.viewport?.columns ?? null
    columns.band = e.props.bodyColumns
    if (width !== columns.status) {
      columns.status = width
      void updateStatus($).catch(() => {})
    }

    isWorking = e.props.isWorking
    if (!settings.bandOn || e.props.hasSurvey) return next(e)

    const { Box, Text, Button } = $.ui.resolve(e)
    const others = await next(e)
    const now = await $.clock.now()
    const level = levelFor(settings.density, e.props.bodyColumns)
    const isCompact = level === 'compacta'
    const barWidth = level === 'completa' ? 10 : level === 'media' ? 6 : 0
    const limits = sortLimits(usage?.rateLimits ?? [])
    const repoText = settings.repoOn ? repoSummary(repo, isCompact) : ''

    // El modelo con un brillo que lo recorre mientras Claude trabaja.
    const modelText = isCompact ? formatModel(model).split(' ')[0] ?? '--' : formatModel(model)
    const glow = isWorking ? shimmerIndex(frame, modelText.length) : modelText.length
    const brand = (
      <Box key="brand" flexDirection="row">
        <Text color={CLAUDE_ORANGE} bold>{isWorking ? sparkFrame(frame) : SPARK_IDLE} </Text>
        <Text color={CLAUDE_ORANGE} bold>{modelText.slice(0, glow)}</Text>
        <Text color={CLAUDE_GLOW} bold>{modelText.slice(glow, glow + 1)}</Text>
        <Text color={CLAUDE_ORANGE} bold>{modelText.slice(glow + 1)}</Text>
      </Box>
    )

    const gauge = (key: string, label: string, labelColor: string, pct: number | undefined, resetsAt?: string) => {
      const tone = pct === undefined ? undefined : toneFor(pct)
      const parts = lineBar(pct === undefined ? 0 : shownPct(key, pct), barWidth)
      const reset = level === 'completa' && resetsAt !== undefined ? formatReset(resetsAt, now, offsetMin(resetsAt)) : ''
      return (
        <Box key={`band-${key}`} flexDirection="row">
          <Text color={labelColor}>{label} </Text>
          {barWidth > 0 && <Text color={tone}>{parts.filled}</Text>}
          {barWidth > 0 && <Text dimColor>{parts.empty}</Text>}
          <Text color={tone} bold dimColor={isPulseDim(pct)}>{barWidth > 0 ? ' ' : ''}{formatPct(pct)}</Text>
          {reset !== '' && <Text dimColor> ↻ {reset}</Text>}
        </Box>
      )
    }

    const t = addTokens(counters.main, counters.agents)
    const segments = [
      brand,
      ...(limits.length === 0
        ? ['five_hour', 'seven_day'].map(kind => gauge(kind, isCompact ? shortLabelFor(kind) : labelFor(kind), kindColor(kind), undefined))
        : limits.map(l =>
            gauge(l.kind, isCompact ? shortLabelFor(l.kind) : labelFor(l.kind), kindColor(l.kind), l.percentUsed, l.resetsAt),
          )),
      gauge('ctx', 'ctx', CONTEXT_COLOR, usage?.context.percent),
      ...(isCompact ? [] : [<Text key="band-tokens" dimColor>↑{formatTokens(totalInput(t))} ↓{formatTokens(t.output)}</Text>]),
      ...(repoText === ''
        ? []
        : [
            <Box key="band-repo" flexDirection="row">
              <Text color="suggestion">⎇ </Text>
              <Text dimColor>{repoText}</Text>
            </Box>,
          ]),
    ]

    const stats = (
      <Box flexDirection="row" flexWrap="wrap">
        {segments.flatMap((segment, i) => (i === 0 ? [segment] : [<Text key={`sep-${i}`} dimColor> │ </Text>, segment]))}
        {!isCompact && (
          <Box key="band-actions" flexDirection="row" marginLeft={2}>
            <Button key="band-panel" plain dimColor hotkey="t" label="panel" onPress={() => $.ui.open({ id: PANE, title: 'Token bar', focus: true, closeOnEscape: true })} />
          </Box>
        )}
      </Box>
    )

    if (!settings.mascotOn || e.props.bodyColumns < MASCOT_MIN_COLUMNS) {
      return (
        <Box flexDirection="column">
          {stats}
          {others}
        </Box>
      )
    }

    const clawd = mascotFrame(frame, mood())
    return (
      <Box flexDirection="column">
        <Box flexDirection="row" columnGap={2}>
          <Box key="clawd" flexDirection="column" flexShrink={0}>
            <Text key="clawd-fx" color={FX_COLOR[clawd.fx]} bold>{clawd.rows[0]}</Text>
            {clawd.rows.slice(1).map((row, i) => (
              <Text key={`clawd-${i}`} color={CLAUDE_ORANGE}>{row}</Text>
            ))}
          </Box>
          <Box flexDirection="column" flexShrink={1} justifyContent="center">
            {stats}
            {clawd.say !== null && (
              <Text key="clawd-say" color={clawd.fx === 'alert' ? 'error' : CLAUDE_GLOW} italic>
                ╰ {clawd.say}
              </Text>
            )}
          </Box>
        </Box>
        {others}
      </Box>
    )
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button } = $.ui.resolve(e)
    columns.pane = e.props.bodyColumns
    const now = await $.clock.now()
    // Ancho: etiqueta 15 + barra + porcentaje 5 + cola ~30 ("se reinicia lun 7:00 a. m.").
    // Por debajo de 80 columnas la cola baja a su propia línea.
    const isWide = e.props.bodyColumns >= 80
    const barWidth = isWide
      ? Math.max(10, Math.min(30, e.props.bodyColumns - 52))
      : Math.max(6, Math.min(20, e.props.bodyColumns - 22))
    const limits = sortLimits(usage?.rateLimits ?? [])

    const setTab = (next: Tab) => () => {
      tab = next
      $.ui.invalidate('ui.render')
    }
    const changeSettings = (change: Partial<Settings>) => async () => {
      settings = { ...settings, ...change }
      await saveSettings($)
      if (change.repoOn !== undefined) await refreshRepo($, true)
      await repaint($)
    }

    const meter = (key: string, label: string, labelColor: string, pct: number | undefined, tail: string) => {
      const parts = lineBar(pct === undefined ? 0 : shownPct(key.replace(/^lim-/, ''), pct), barWidth)
      const tone = pct === undefined ? undefined : toneFor(pct)
      return (
        <Box key={key} flexDirection={isWide ? 'row' : 'column'}>
          <Box flexDirection="row" flexShrink={0}>
            <Text color={labelColor}>{label.padEnd(15)}</Text>
            <Text color={tone}>{pct === undefined ? '' : parts.filled}</Text>
            <Text dimColor>{parts.empty}</Text>
            <Text color={tone} weight="semibold" dimColor={isPulseDim(pct)}> {formatPct(pct).padStart(4)}</Text>
          </Box>
          {tail !== '' && (
            <Box flexShrink={1} paddingLeft={isWide ? 0 : 15}>
              <Text dimColor wrap="truncate-end">{isWide ? tail : tail.trimStart()}</Text>
            </Box>
          )}
        </Box>
      )
    }

    const row = (key: string, label: string, value: string) => (
      <Box key={key} flexDirection="row">
        <Text dimColor>{label.padEnd(18)}</Text>
        <Text>{value.padStart(12)}</Text>
      </Box>
    )

    // Etiqueta fija y valor que se corta con "…" si no entra.
    const field = (key: string, label: string, value: string, color?: string) => (
      <Box key={key} flexDirection="row">
        <Box flexShrink={0}>
          <Text dimColor>{label.padEnd(12)}</Text>
        </Box>
        <Box flexShrink={1}>
          <Text color={color} wrap="truncate-end">{value}</Text>
        </Box>
      </Box>
    )

    const tokenRows = (prefix: string, t: TurnTokens) => [
      row(`${prefix}-in`, 'Entrada', formatInt(t.input)),
      row(`${prefix}-out`, 'Salida', formatInt(t.output)),
      row(`${prefix}-cr`, 'Caché leída', formatInt(t.cacheRead)),
      row(`${prefix}-cw`, 'Caché escrita', formatInt(t.cacheWrite)),
      row(`${prefix}-tot`, 'Entrada total', formatTokens(totalInput(t))),
    ]

    const limitsTab = (
      <Box flexDirection="column">
        <Box flexDirection="row">
          <Text dimColor>{'Modelo'.padEnd(15)}</Text>
          <Text color={CLAUDE_ORANGE} weight="semibold">{SPARK_IDLE} {formatModel(model)}</Text>
        </Box>
        {limits.length === 0 &&
          ['five_hour', 'seven_day'].map(kind => meter(`lim-${kind}`, labelFor(kind), kindColor(kind), undefined, '  sin datos'))}
        {limits.map(l =>
          meter(
            `lim-${l.kind}`,
            labelFor(l.kind),
            kindColor(l.kind),
            l.percentUsed,
            l.resetsAt === undefined ? '' : `  se reinicia ${formatReset(l.resetsAt, now, offsetMin(l.resetsAt))}`,
          ),
        )}
        {meter(
          'ctx',
          'Contexto',
          CONTEXT_COLOR,
          usage?.context.percent,
          `  ${usage?.context.tokens === undefined ? '--' : formatTokens(usage.context.tokens)} / ${formatTokens(usage?.context.window ?? 0)}`,
        )}
        {usage?.cost !== undefined && row('cost', 'Costo de la sesión', formatUsd(usage.cost.usd))}
        <Box marginTop={1} flexDirection="column">
          {limits.length === 0 && (
            <Text dimColor>Los límites llegan con la primera respuesta del modelo; hasta entonces, "--".</Text>
          )}
          {limits.length > 0 && !hasFable(limits) && (
            <Text color="warning">
              Fable semanal: no viene en rateLimits (llegaron: {limits.map(l => l.kind).join(', ')}). No se muestra un valor inventado.
            </Text>
          )}
          <Text dimColor>5 abre la leyenda de colores y símbolos.</Text>
        </Box>
      </Box>
    )

    const tokensTab = (
      <Box flexDirection="column">
        <Text weight="semibold">Último turno{counters.last ? ` · ${formatModel(counters.last.model)}` : ''}</Text>
        {counters.last === null ? <Text dimColor>Todavía no terminó ningún turno.</Text> : tokenRows('last', counters.last)}
        <Box marginTop={1}>
          <Text weight="semibold">Sesión, hilo principal · {counters.turns} turnos</Text>
        </Box>
        {tokenRows('main', counters.main)}
        <Box marginTop={1}>
          <Text weight="semibold">Subagentes</Text>
        </Box>
        {tokenRows('agents', counters.agents)}
      </Box>
    )

    const repoTab = (() => {
      if (!settings.repoOn) return <Text dimColor>Los datos del repo están apagados (Ajustes, g).</Text>
      if (repo === null) return <Text dimColor>La sesión no corre dentro de un repo git (o todavía no se leyó: u refresca).</Text>
      const { remote, git, forge, forgeError } = repo
      const kind = remote?.forge ?? null
      const label = changeLabel(kind)
      const where = remote === null ? 'sin remoto origin' : `${remote.host}/${remote.path}`
      const lines = [field('repo-remote', 'Remoto', where, kind === null ? undefined : 'suggestion')]

      if (git === null) {
        lines.push(field('repo-git', 'git', 'no se pudo leer git status', 'warning'))
      } else {
        lines.push(field('repo-branch', 'Rama', formatBranch(git), git.behind > 0 ? 'warning' : undefined))
        lines.push(
          field(
            'repo-changes',
            'Cambios',
            formatChanges(git),
            git.conflicts > 0 ? 'error' : formatChanges(git) === 'limpio' ? 'success' : 'warning',
          ),
        )
        lines.push(field('repo-commit', 'Commit', git.sha === null ? 'sin commits' : `${git.sha.slice(0, 7)} ${git.subject ?? ''}`))
      }

      if (remote !== null && kind === null) {
        lines.push(field('repo-forge', 'Remoto', `${remote.host} no es GitHub ni GitLab: solo datos locales`, 'warning'))
      }
      if (forgeError !== null) lines.push(field('repo-error', kind === 'gitlab' ? 'GitLab' : 'GitHub', forgeError, 'error'))

      if (forge !== null) {
        const c = forge.change
        lines.push(
          c === null
            ? field('repo-change', label, git?.branch == null ? 'HEAD separado: sin rama' : `la rama no tiene ${label}`)
            : field('repo-change', `${label} ${changeRef(kind, c.number)}`, c.title),
        )
        if (c !== null) {
          lines.push(
            field('repo-change-state', '', [c.state, c.review].filter(Boolean).join(' · '), CHANGE_TONE[c.state]),
            field('repo-change-url', '', c.url),
          )
        }
        lines.push(
          forge.ci === null
            ? field('repo-ci', 'CI', 'sin checks (o el commit no está en el remoto)')
            : field('repo-ci', 'CI', formatCi(forge.ci), CI_TONE[forge.ci.state]),
          field('repo-issues', 'Issues', `${formatCount(forge.openIssues)} abiertos · ${formatCount(forge.assigned)} asignados a vos`),
          field(
            'repo-changes-open',
            `${label}s`,
            `${formatCount(forge.openChanges, forge.isCapped)} abiertos · ${formatCount(forge.reviewRequested)} te piden review`,
          ),
        )
      }
      if (kind !== null) {
        lines.push(
          field('repo-updated', '', repo.updatedAt === null ? 'consultando…' : `${kind === 'gitlab' ? 'GitLab' : 'GitHub'} consultado ${formatAgo(repo.updatedAt, now)} · u refresca`),
        )
      }

      return <Box flexDirection="column">{lines}</Box>
    })()

    const range = (i: number) => {
      const min = USAGE_LEVELS[i]?.min ?? 0
      const nextMin = USAGE_LEVELS[i + 1]?.min
      return nextMin === undefined ? `≥${min}%` : i === 0 ? `<${nextMin}%` : `${min}–${nextMin - 1}%`
    }
    const legendRow = (key: string, sign: string, text: string, color?: string) => (
      <Box key={key} flexDirection="row">
        <Box flexShrink={0}>
          <Text color={color}>{sign.padEnd(15)}</Text>
        </Box>
        <Box flexShrink={1}>
          <Text dimColor>{text}</Text>
        </Box>
      </Box>
    )
    const legendTab = (
      <Box flexDirection="column">
        <Text weight="semibold">Medidores (el color del nombre dice cuál es)</Text>
        {legendRow('lg-model', 'Modelo', 'el modelo del hilo principal (/model)', 'claude')}
        {legendRow('lg-session', 'Sesión', 'ventana de 5 h del plan', kindColor('five_hour'))}
        {legendRow('lg-week', 'Semana', 'límite de 7 días del plan', kindColor('seven_day'))}
        {legendRow('lg-fable', 'Fable semanal', 'límite semanal de Fable, si viene en rateLimits', kindColor('seven_day_fable'))}
        {legendRow('lg-ctx', 'Contexto / ctx', 'cuánto de la ventana de contexto ocupa la conversación', CONTEXT_COLOR)}
        <Box marginTop={1}>
          <Text weight="semibold">Niveles de uso (color de la barra; bajo el prompt, el punto)</Text>
        </Box>
        {USAGE_LEVELS.map((l, i) => legendRow(`lg-level-${l.name}`, `${l.dot} ${range(i)}`, `${l.name}: ${l.meaning}`, l.tone))}
        {legendRow('lg-level-none', '⚪ --', 'todavía sin dato')}
        <Box marginTop={1}>
          <Text weight="semibold">Símbolos</Text>
        </Box>
        {legendRow('lg-tokens', '↑ ↓', 'tokens de entrada / salida de la sesión')}
        {legendRow('lg-sync', '⇡ ⇣', 'commits sin pushear / por traer del remoto')}
        {legendRow('lg-dirty', '±N', 'archivos con cambios sin commitear')}
        {legendRow('lg-change', '#N  !N', 'PR de GitHub / MR de GitLab de la rama')}
        {legendRow('lg-ci', '✓ ✗ ○', 'CI del último commit: ok / fallando / corriendo')}
      </Box>
    )

    const onOff = (isOn: boolean) => (isOn ? 'activada' : 'desactivada')
    const settingsTab = (
      <Box flexDirection="column">
        <Button key="toggle-status" plain hotkey="b" label={`Barra bajo el prompt: ${onOff(settings.statusOn)}`} onPress={changeSettings({ statusOn: !settings.statusOn })} />
        <Button key="toggle-band" plain hotkey="a" label={`Banda sobre el prompt: ${onOff(settings.bandOn)}`} onPress={changeSettings({ bandOn: !settings.bandOn })} />
        <Button
          key="density"
          plain
          hotkey="d"
          label={`Densidad: ${settings.density} (barra: ${statusLevel})`}
          onPress={changeSettings({ density: nextDensity(settings.density) })}
        />
        <Button key="toggle-mascot" plain hotkey="m" label={`Clawd en la banda: ${onOff(settings.mascotOn)}`} onPress={changeSettings({ mascotOn: !settings.mascotOn })} />
        <Button key="toggle-dots" plain hotkey="p" label={`Puntos de color en la barra: ${onOff(settings.dotsOn)}`} onPress={changeSettings({ dotsOn: !settings.dotsOn })} />
        <Button
          key="toggle-repo"
          plain
          hotkey="g"
          label={`Datos del repo (git, GitHub/GitLab): ${onOff(settings.repoOn)}`}
          onPress={changeSettings({ repoOn: !settings.repoOn })}
        />
        <Button
          key="reset"
          plain
          hotkey="r"
          label="Reiniciar contadores de tokens"
          onPress={async () => {
            counters = emptyCounters()
            await saveCounters($)
            await repaint($)
            $.ui.toast('Contadores de tokens reiniciados')
          }}
        />
        <Box marginTop={1}>
          <Text dimColor>
            Columnas: terminal {columns.status ?? '?'} · banda {columns.band ?? '?'} · panel {e.props.bodyColumns}
          </Text>
        </Box>
      </Box>
    )

    return (
      <Box flexDirection="column">
        <Box flexDirection="row" flexWrap="wrap" columnGap={2}>
          <Button key="tab-limits" plain hotkey="1" label="Límites" dimColor={tab !== 'limits'} onPress={setTab('limits')} />
          <Button key="tab-tokens" plain hotkey="2" label="Tokens" dimColor={tab !== 'tokens'} onPress={setTab('tokens')} />
          <Button key="tab-settings" plain hotkey="3" label="Ajustes" dimColor={tab !== 'settings'} onPress={setTab('settings')} />
          <Button key="tab-repo" plain hotkey="4" label="Repo" dimColor={tab !== 'repo'} onPress={setTab('repo')} />
          <Button key="tab-legend" plain hotkey="5" label="Leyenda" dimColor={tab !== 'legend'} onPress={setTab('legend')} />
          <Button key="refresh" plain hotkey="u" label="Refrescar" onPress={() => Promise.all([refresh($), refreshRepo($, true)])} />
          <Text dimColor>Esc cierra</Text>
        </Box>
        <Box marginTop={1} flexDirection="column">
          {tab === 'limits' && limitsTab}
          {tab === 'tokens' && tokensTab}
          {tab === 'settings' && settingsTab}
          {tab === 'repo' && repoTab}
          {tab === 'legend' && legendTab}
        </Box>
      </Box>
    )
  })
}
