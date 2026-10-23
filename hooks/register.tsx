import type { EngineInterface, PluginOptions, Register, RenderChildren } from 'claude-code'

import {
  applyPreset,
  DEFAULT_CONFIG_PATH,
  exportConfig,
  expandHome,
  formatLevels,
  isPreset,
  limitKey,
  nextLevels,
  parseConfig,
  PRESET_NAMES,
  readSettings,
  type Settings,
  SHOW_KEYS,
  SHOW_LABELS,
  type ShowKey,
  toStored,
} from './config'
import {
  addTokens,
  CLAUDE_GLOW,
  CLAUDE_ORANGE,
  CONTEXT_COLOR,
  currentLevelMins,
  type Counters,
  type Level,
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
  barParts,
  lineBar,
  nextDensity,
  numericFields,
  shimmerIndex,
  shortModel,
  setLevelMins,
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
import {
  type Activity,
  activityOf,
  MASCOT_WIDTH,
  mascotFrame,
  type Mood,
  outcomeOf,
  type Reaction,
  type ReactionKind,
  SLEEP_AFTER,
  TONE_COLOR,
} from './mascot'
import {
  type ChangeState,
  changeLabel,
  changeRef,
  type CiState,
  firstLine,
  type ForgeData,
  formatAgo,
  formatBranch,
  formatPath,
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

type Tab = 'limits' | 'tokens' | 'settings' | 'repo' | 'legend' | 'info'

const PANE = 'token-bar'
const REFRESH_MS = 30_000
/** Cada cuánto se vuelve a preguntar a GitHub/GitLab si la rama no se movió. */
const FORGE_MS = 120_000
/** Cuadro de las animaciones: destello, barrido del modelo y barras que se llenan. */
const FRAME_MS = 100
/** Por debajo de este ancho de banda, Clawd no entra ni con su comentario. */
const MASCOT_MIN_COLUMNS = 40
/** Ancho de la columna donde Clawd dice su comentario (y debajo del modelo). */
const SAY_WIDTH = 28
const MASCOT_COLUMNS = MASCOT_WIDTH

let usage: Usage | null = null
let model: string | null = null
let counters: Counters = emptyCounters()
let settings: Settings = readSettings(undefined)
let tab: Tab = 'limits'
/** null: todavía no se mandó nada, así el primer status siempre llega (y limpia el de un módulo anterior). */
let lastStatus: string | undefined | null = null
let statusLevel: string = 'media'
let lastTurnRaw: Record<string, number> | null = null
let repo: RepoInfo | null = null
let repoJob: Promise<void> | null = null
/** Dónde trabaja la sesión (absoluta) y el HOME para abreviarla con `~`. */
let cwd: string | null = null
let home: string | null = null
let frame = 0
let isWorking = false
let mascotKey = ''
/** Lo que vive Clawd: lo último que pasó, qué corre, si escribís y desde cuándo no pasa nada. */
let reaction: Reaction | null = null
let reactionSeed = 0
let activity: Activity | null = null
let typing: { at: number; ratio: number } | null = null
let lastActive = 0
let workStart = 0
/** Clics seguidos sobre Clawd: con muchos, se queja. */
let pets = { count: 0, at: -Infinity }
/** Lo que muestra cada barra mientras se acerca a su valor (clave: kind o "ctx"). */
const shown = new Map<string, number>()
const columns: { status: number | null; band: number | null; pane: number | null; command: number | null } = {
  status: null,
  band: null,
  pane: null,
  command: null,
}

const offsetMin = (iso: string): number => new Date(iso).getTimezoneOffset()

const saveSettings = ($: EngineInterface) => $.store.set('settings', toStored(settings))

/** Aplica ajustes: son los de la sesión y fijan los cortes de color. */
const applySettings = (next: Settings) => {
  settings = next
  setLevelMins(next.levels)
}

/** Desde dónde el medidor es "al límite": late y hace que Clawd avise. */
const alertAt = (): number => currentLevelMins()[3] ?? 90

type Loaded = { settings: Settings; ignored: string[]; path: string } | { error: string }

/** Lee un config.json (`~` vale HOME); no lo aplica. */
const readConfigFile = async ($: EngineInterface, path: string): Promise<Loaded> => {
  const full = expandHome(path, await $.env.get('HOME'))
  if (full === null) return { error: `no se pudo resolver ${path}: falta HOME` }
  const text = await $.fs.read(full).catch(() => null)
  if (typeof text !== 'string') return { error: `no se pudo leer ${full}` }
  const parsed = parseConfig(text)
  return 'error' in parsed ? { error: `${full}: ${parsed.error}` } : { ...parsed, path: full }
}

const writeConfigFile = async ($: EngineInterface, path: string): Promise<string> => {
  const full = expandHome(path, await $.env.get('HOME'))
  if (full === null) throw new Error(`no se pudo resolver ${path}: falta HOME`)
  await $.fs.write(full, exportConfig(settings))
  return full
}

/**
 * La primera vez en una máquina (sin nada guardado) la configuración sale de
 * las opciones del mod: `configFile` si apunta a un config.json que se pueda
 * leer, si no el preset elegido. Después manda lo que se guarda desde el panel.
 */
const seedSettings = async ($: EngineInterface, options: PluginOptions): Promise<Settings> => {
  const file = typeof options.configFile === 'string' ? options.configFile.trim() : ''
  if (file !== '') {
    const loaded = await readConfigFile($, file)
    if (!('error' in loaded)) return loaded.settings
    $.ui.toast(`token-bar: ${loaded.error}`)
  }
  return isPreset(options.preset) ? applyPreset(readSettings(undefined), options.preset) : readSettings(undefined)
}

/** Aplica, guarda y redibuja; si cambió lo del repo, lo vuelve a leer. */
const applyAndSave = async ($: EngineInterface, next: Settings) => {
  const repoChanged = next.repoOn !== settings.repoOn
  applySettings(next)
  await saveSettings($)
  if (repoChanged) await refreshRepo($, true)
  await repaint($)
}

const CONFIG_HELP = [
  `/token-bar-config export [ruta]   guarda la config en un JSON (por defecto ${DEFAULT_CONFIG_PATH}) y la copia`,
  '/token-bar-config import [ruta]   lee ese JSON (o un JSON pegado a continuación) y lo aplica',
  '/token-bar-config preset <minima|normal|completa>',
  '/token-bar-config reset           vuelve a los valores por defecto',
].join('\n')

/** Los subcomandos de /token-bar-config; devuelve el texto que se muestra. */
const runConfig = async ($: EngineInterface, args: string): Promise<string> => {
  const trimmed = args.trim()
  const sub = trimmed.split(/\s+/)[0] ?? ''
  const arg = trimmed.slice(sub.length).trim()

  if (sub === '' || sub === 'export') {
    const path = await writeConfigFile($, arg === '' ? DEFAULT_CONFIG_PATH : arg)
    const json = exportConfig(settings)
    const copied = await $.ui.copy({ text: json }).catch(() => ({ isCopied: false }))
    return `Config guardada en ${path}${copied.isCopied ? ' y copiada al portapapeles' : ''}.\n\n${json}`
  }
  if (sub === 'import') {
    const loaded = arg.startsWith('{') ? parseConfig(arg) : await readConfigFile($, arg === '' ? DEFAULT_CONFIG_PATH : arg)
    if ('error' in loaded) return `token-bar: ${loaded.error}`
    await applyAndSave($, loaded.settings)
    const ignored = loaded.ignored.length === 0 ? '' : ` Claves ignoradas: ${loaded.ignored.join(', ')}.`
    return `Config importada y guardada.${ignored}`
  }
  if (sub === 'preset') {
    if (!isPreset(arg)) return `token-bar: preset desconocido. Los hay: ${PRESET_NAMES.join(', ')}.`
    await applyAndSave($, applyPreset(settings, arg))
    return `Preset ${arg} aplicado.`
  }
  if (sub === 'reset') {
    await applyAndSave($, readSettings(undefined))
    return 'Config restablecida a los valores por defecto.'
  }
  return `Subcomandos de /token-bar-config:\n${CONFIG_HELP}`
}

/** Los valores de las barras: cada límite y el contexto. */
const targets = (): [string, number][] => [
  ...(usage?.rateLimits ?? []).map(l => [l.kind, l.percentUsed] as [string, number]),
  ...(usage?.context.percent === undefined ? [] : [['ctx', usage.context.percent] as [string, number]]),
]

/** El valor animado de una barra; arranca en 0 para que se llene al abrir. */
const shownPct = (key: string, pct: number): number => {
  if (!settings.animations) return pct
  return shown.get(key) ?? (shown.set(key, 0), 0)
}

/** Arriba de 90 % el porcentaje late (medio segundo encendido, medio atenuado). */
const isPulseDim = (pct: number | undefined): boolean =>
  settings.animations && pct !== undefined && pct >= alertAt() && Math.floor(frame / 5) % 2 === 1

/**
 * Un cuadro: avanza las barras hacia su valor y redibuja solo si algo se mueve
 * (un turno corriendo, una barra llenándose, un medidor al límite latiendo).
 */
const tick = ($: EngineInterface) => {
  if (!settings.animations) return
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
  const isAlert = targets().some(([, pct]) => pct >= alertAt())
  // Clawd cambia de pose cada tantos ticks: se redibuja solo cuando cambia.
  const nextMascot = settings.bandOn && settings.mascotOn ? mascotFrame(frame, mood()).key : ''
  const isMascotMoving = nextMascot !== mascotKey
  mascotKey = nextMascot
  if (isMoving || isWorking || isMascotMoving || (isAlert && frame % 5 === 0)) $.ui.invalidate('ui.render')
}

/** Cómo está Clawd: trabajando, al límite (el medidor más alto ≥90 %) o tranquilo. */
const mood = (): Mood => {
  // Un dato que el usuario ocultó no da alertas.
  const limits = (usage?.rateLimits ?? [])
    .filter(l => settings.show[limitKey(labelFor(l.kind))])
    .map(l => ({ label: labelFor(l.kind), pct: l.percentUsed }))
  if (settings.show.context && usage?.context.percent !== undefined) limits.push({ label: 'el contexto', pct: usage.context.percent })
  const top = limits.reduce<{ label: string; pct: number } | null>((a, b) => (a === null || b.pct > a.pct ? b : a), null)
  return {
    isWorking,
    alert: top !== null && top.pct >= alertAt() ? top : null,
    maxPct: top?.pct ?? 0,
    isStill: !settings.animations,
    activity,
    reaction,
    typing,
    idleTicks: frame - lastActive,
    workTicks: frame - workStart,
  }
}

/** Colores de los datos de la banda, para que no se lean como un solo bloque gris. */
const TOKENS_IN_COLOR = '#7DCFFF'
const TOKENS_OUT_COLOR = '#9ECE6A'
const COST_COLOR = '#E0AF68'
const CWD_COLOR = '#BB9AF7'

/** Algo pasó: si estaba dormido se despierta, y no se duerme hasta un rato después. */
const touch = () => {
  if (settings.animations && !isWorking && frame - lastActive >= SLEEP_AFTER) react('wake')
  lastActive = frame
}

/** Clawd reacciona: dura unos ticks y el reloj lo redibuja. */
const react = (kind: ReactionKind, extra: Partial<Reaction> = {}) => {
  if (!settings.animations || !settings.mascotOn) return
  reaction = { kind, at: frame, seed: reactionSeed++, ...extra }
}

/** Un clic sobre Clawd: se pone contento; muchos seguidos, se queja. */
const pet = () => {
  pets = frame - pets.at < 100 ? { count: pets.count + 1, at: frame } : { count: 0, at: frame }
  touch()
  react('pet', { seed: pets.count })
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
  cwd = await $.session.cwd().catch(() => cwd)
  home = (await $.env.get('HOME').catch(() => undefined)) ?? home
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

export const register: Register = (on, options) => {
  on('session.start', async ($, e, next) => {
    const stored = await $.store.get('settings')
    applySettings(stored === undefined ? await seedSettings($, options) : readSettings(stored))
    if (stored === undefined) await saveSettings($)
    counters = await loadCounters($)
    await $.command.register({ name: 'token-bar', description: 'Panel de consumo, límites, modelo y repo' })
    await $.command.register({ name: 'token-bar-debug', description: 'Datos crudos de token-bar para depurar' })
    await $.command.register({ name: 'token-bar-config', description: 'Exportar, importar o cambiar la config de token-bar' })
    await refresh($)
    // git y gh pueden tardar: el inicio de la sesión no los espera.
    void refreshRepo($)
    lastActive = frame
    react('greet', { hour: new Date(await $.clock.now()).getHours() })
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

  on('turn.start', async ($, e, next) => {
    if (e.agentId === undefined) {
      touch()
      workStart = frame
      activity = { kind: 'think', detail: '' }
    }

    return next(e)
  })

  // Clawd mira qué herramienta corre y festeja o lamenta cómo salió. Nunca
  // toca la llamada: si algo de esto fallara, la herramienta corre igual.
  on('tool.call', async ($, e, next) => {
    const input = e as unknown as Record<string, unknown>
    try {
      activity = activityOf(e.tool, input)
    } catch {}
    const ran = await next(e)
    try {
      if (ran.deny === undefined) {
        const outcome = outcomeOf(e.tool, input, ran.isError === true)
        if (outcome !== null) react(outcome)
      }
      if (isWorking) activity = { kind: 'think', detail: '' }
    } catch {}

    return ran
  })

  on('prompt.edit', async ($, e, next) => {
    touch()
    // Los ojos siguen lo que escribís, de izquierda a derecha.
    typing = { at: frame, ratio: ((e.start + e.inputText.length) % 40) / 40 }

    return next(e)
  })

  on('prompt.submit', async ($, e, next) => {
    touch()
    typing = null
    if (e.text.trim() !== '') react('submit')

    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    if (e.agentId === undefined) {
      activity = null
      lastActive = frame
      // Si no se dijo nada más fuerte (un test, un push) en el último segundo, reacciona al final.
      const isFresh = reaction !== null && frame - reaction.at < 10 && reaction.kind !== 'submit'
      // Un turno largo que salió bien merece los lentes.
      const won = frame - workStart >= 600 ? 'cool' : 'done'
      if (!isFresh) react(e.reason === 'answer' ? won : e.reason === 'aborted' ? 'abort' : 'fail')
    }
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

  on('command.run', { command: 'token-bar-config' }, async ($, e) => {
    try {
      return { text: await runConfig($, e.args) }
    } catch (err) {
      return { text: `token-bar: ${err instanceof Error ? err.message : String(err)}` }
    }
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
    let stacked = false
    const showMascot = settings.mascotOn && e.props.bodyColumns >= MASCOT_MIN_COLUMNS
    // A la izquierda Clawd y su comentario (ancho fijo); luego una raya; el resto
    // es de los datos, que se miden con lo que sobra.
    const roomFor = (withMascot: boolean) => e.props.bodyColumns - (withMascot ? MASCOT_COLUMNS + 1 + SAY_WIDTH + 3 : 0)
    const show = settings.show
    // Cada límite responde al interruptor de su familia (Sesión, Semana, Fable).
    const limits = sortLimits(usage?.rateLimits ?? []).filter(l => show[limitKey(labelFor(l.kind))])
    const withSeps = (prefix: string, nodes: RenderChildren[]) =>
      nodes.flatMap((node, i) => (i === 0 ? [node] : [<Text key={`${prefix}-sep-${i}`} dimColor> │ </Text>, node]))

    // Acomoda piezas de ancho conocido en líneas de a lo sumo `max` columnas, sin
    // partir ninguna: lo que no entra baja a la línea siguiente.
    const pack = (prefix: string, items: [number, RenderChildren][], max: number): RenderChildren => {
      const lines: [number, RenderChildren][][] = [[]]
      let used = 0
      for (const item of items) {
        const line = lines[lines.length - 1]!
        const need = item[0] + (line.length === 0 ? 0 : 3)
        if (line.length > 0 && used + need > max) {
          lines.push([item])
          used = item[0]
        } else {
          line.push(item)
          used += need
        }
      }
      return (
        <Box key={`${prefix}-pack`} flexDirection="column">
          {lines.map((line, i) => (
            <Box key={`${prefix}-line-${i}`} flexDirection="row">
              {withSeps(`${prefix}-${i}`, line.map(([, node]) => node))}
            </Box>
          ))}
        </Box>
      )
    }

    // El modelo con un brillo que lo recorre mientras Claude trabaja.
    const brandOf = (modelText: string): RenderChildren => {
      const isLive = isWorking && settings.animations
      const glow = isLive ? shimmerIndex(frame, modelText.length) : modelText.length
      return (
        <Box key="brand" flexDirection="row">
          <Text color={CLAUDE_ORANGE} bold>{isLive ? sparkFrame(frame) : SPARK_IDLE} </Text>
          <Text color={CLAUDE_ORANGE} bold>{modelText.slice(0, glow)}</Text>
          <Text color={CLAUDE_GLOW} bold>{modelText.slice(glow, glow + 1)}</Text>
          <Text color={CLAUDE_ORANGE} bold>{modelText.slice(glow + 1)}</Text>
        </Box>
      )
    }

    // Fila de medidores, con el detalle que entre en `room`. Sin Clawd, el
    // modelo abre la fila; con Clawd, va a su lado.
    const gaugesRow = ([level, withResets]: readonly [Level, boolean]) => {
      const isCompact = level === 'compacta'
      const barWidth = level === 'completa' ? 10 : level === 'media' ? 6 : 0

      const gauge = (key: string, kind: string, labelColor: string, pct: number | undefined, resetsAt?: string): [number, RenderChildren] => {
        const label = key === 'ctx' ? 'ctx' : isCompact ? shortLabelFor(kind) : labelFor(kind)
        const tone = pct === undefined ? undefined : toneFor(pct)
        const parts = barParts(pct === undefined ? 0 : shownPct(key, pct), barWidth)
        const reset = !isCompact && withResets && resetsAt !== undefined ? formatReset(resetsAt, now, offsetMin(resetsAt)) : ''
        const length = label.length + 1 + barWidth + (barWidth > 0 ? 1 : 0) + formatPct(pct).length + (reset === '' ? 0 : reset.length + 3)
        return [
          length,
          <Box key={`band-${key}`} flexDirection="row" flexShrink={0}>
            <Text color={labelColor}>{label} </Text>
            {barWidth > 0 && <Text color={tone}>{parts.filled}</Text>}
            {barWidth > 0 && <Text dimColor>{parts.empty}</Text>}
            <Text color={tone} bold dimColor={isPulseDim(pct)}>{barWidth > 0 ? ' ' : ''}{formatPct(pct)}</Text>
            {reset !== '' && <Text dimColor> ↻ {reset}</Text>}
          </Box>,
        ]
      }

      const items: [number, RenderChildren][] = [
        ...((usage?.rateLimits.length ?? 0) === 0
          ? [
              ...(show.session ? [gauge('five_hour', 'five_hour', kindColor('five_hour'), undefined)] : []),
              ...(show.week ? [gauge('seven_day', 'seven_day', kindColor('seven_day'), undefined)] : []),
            ]
          : limits.map(l => gauge(l.kind, l.kind, kindColor(l.kind), l.percentUsed, l.resetsAt))),
        ...(show.context ? [gauge('ctx', 'ctx', CONTEXT_COLOR, usage?.context.percent)] : []),
      ]
      return {
        level,
        length: items.reduce((n, [len]) => n + len, 0) + 3 * Math.max(0, items.length - 1),
        node: pack('gauges', items, stacked ? e.props.bodyColumns : roomFor(showMascot)),
      }
    }
    // Con `auto` se prefiere el más detallado que entra; la hora de reinicio es lo
    // primero que se suelta, antes de achicar las barras o pasar a compacta.
    const candidates: (readonly [Level, boolean])[] =
      settings.density === 'auto'
        ? [['completa', show.resets], ['media', show.resets], ['media', false], ['compacta', false]]
        : [[settings.density, show.resets]]
    let rows = candidates.map(gaugesRow)
    // Si ni la fila más compacta entra al lado de Clawd, la terminal es angosta:
    // Clawd queda arriba con su comentario y los datos van debajo, a todo el ancho.
    if (showMascot && rows[rows.length - 1]!.length > roomFor(true)) {
      stacked = true
      rows = candidates.map(gaugesRow)
    }
    const room = stacked ? e.props.bodyColumns : roomFor(showMascot)
    const top = rows.find(r => r.length <= room) ?? rows[rows.length - 1]!

    const t = addTokens(counters.main, counters.agents)
    const repoText = settings.repoOn
      ? repoSummary(repo, top.level === 'compacta', {
          branch: show.repoBranch,
          sync: show.repoSync,
          changes: show.repoChanges,
          change: show.repoChange,
          ci: show.repoCi,
        })
      : ''
    // Con Clawd, la ruta va debajo de él; sin Clawd, entre los detalles.
    const cwdText = <Text key="band-cwd" color={CWD_COLOR}>{cwd === null ? '' : formatPath(cwd, home, top.level === 'compacta' ? 24 : 40)}</Text>
    const repoSegments: [number, RenderChildren][] = repoText === '' ? [] : [[repoText.length, <Text key="band-repo" color="suggestion">{repoText}</Text>]]
    const cwdLabel = cwd === null ? '' : formatPath(cwd, home, top.level === 'compacta' ? 24 : 40)
    const usageItems: [number, RenderChildren][] = [
      ...(show.tokens
        ? ([[
            formatTokens(totalInput(t)).length + formatTokens(t.output).length + 4,
            <Box key="band-tokens" flexDirection="row" flexShrink={0}>
              <Text color={TOKENS_IN_COLOR}>↑{formatTokens(totalInput(t))}</Text>
              <Text color={TOKENS_OUT_COLOR}> ↓{formatTokens(t.output)}</Text>
            </Box>,
          ]] as [number, RenderChildren][])
        : []),
      ...(show.cost && usage?.cost !== undefined
        ? ([[formatUsd(usage.cost.usd).length, <Text key="band-cost" color={COST_COLOR}>{formatUsd(usage.cost.usd)}</Text>]] as [number, RenderChildren][])
        : []),
    ]
    const cwdItems: [number, RenderChildren][] = show.cwd && cwd !== null ? [[cwdLabel.length, cwdText]] : []
    const panelItem: [number, RenderChildren] = [
      8,
      <Button key="band-panel" plain dimColor hotkey="t" label="panel" onPress={() => $.ui.open({ id: PANE, title: 'Token bar', focus: true, closeOnEscape: true })} />,
    ]
    const details = [...usageItems, ...repoSegments, panelItem]
    const info = (
      <Box key="band-info" flexDirection="column" flexShrink={1}>
        {top.node}
        {pack('details', details, room)}
      </Box>
    )

    // Sin Clawd, tres líneas que agrupan por tema: qué corre (modelo, tokens,
    // costo), cuánto queda (los límites) y dónde se trabaja (ruta, repo, panel).
    if (!showMascot) {
      const modelText = top.level === 'compacta' ? shortModel(formatModel(model)) : formatModel(model)
      const runItems: [number, RenderChildren][] = [
        ...(show.model ? ([[2 + modelText.length, brandOf(modelText)]] as [number, RenderChildren][]) : []),
        ...usageItems,
      ]
      const whereItems = [...cwdItems, ...repoSegments, panelItem]
      return (
        <Box flexDirection="column">
          {runItems.length > 0 && pack('run', runItems, room)}
          {top.node}
          {pack('where', whereItems, room)}
          {others}
        </Box>
      )
    }

    // Clawd y su comentario van juntos: así se entiende que lo hace Claude. El
    // comentario tiene su fila reservada y un ancho fijo, y la raya lo separa de
    // los datos, que por eso no se mueven cuando Clawd habla.
    const clawd = mascotFrame(frame, mood())
    const say = clawd.say === null ? ' ' : `╰ ${clawd.mark === '' ? '' : `${clawd.mark} `}${clawd.say}`
    return (
      <Box flexDirection="column">
        <Box flexDirection="row">
          <Box key="clawd" flexDirection="column" flexShrink={0}>
            {clawd.rows.map((row, i) => (
              <Box key={`clawd-${i}`} flexDirection="row">
                {row.map((seg, j) => (
                  <Text
                    key={`clawd-${i}-${j}`}
                    color={seg.tone === null ? undefined : TONE_COLOR[seg.tone]}
                    backgroundColor={seg.bg === undefined ? undefined : TONE_COLOR[seg.bg]}
                  >
                    {seg.text}
                  </Text>
                ))}
              </Box>
            ))}
          </Box>
          <Box key="clawd-text" flexDirection="column" flexShrink={0} width={SAY_WIDTH} marginLeft={1}>
            {show.model ? brandOf(formatModel(model)) : <Text key="brand-off"> </Text>}
            {/* El clic va en el comentario y no en Clawd: un botón se invierte
                bajo el puntero, y sobre el dibujo quedaban bloques blancos. */}
            <Button key="clawd-pet" plain onPress={pet}>
              {/* Sin nada que decir, un ♡ tenue: siempre hay algo para tocar. */}
              {clawd.say === null || !settings.clawdSay ? (
                <Text dimColor>╰ ♡</Text>
              ) : (
                <Text color={TONE_COLOR[clawd.sayTone]} italic wrap="truncate-end">{say}</Text>
              )}
            </Button>
          </Box>
          {!stacked && (
            <Box key="band-rule" flexDirection="column" flexShrink={0}>
              {[0, 1].map(i => (
                <Text key={`rule-${i}`} dimColor> │ </Text>
              ))}
            </Box>
          )}
          {!stacked && info}
        </Box>
        {show.cwd && cwd !== null && cwdText}
        {stacked && info}
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
    const changeSettings = (change: Partial<Settings>) => () => applyAndSave($, { ...settings, ...change })
    const toggleShow = (key: ShowKey) => () => applyAndSave($, { ...settings, show: { ...settings.show, [key]: !settings.show[key] } })
    const notify = (text: string) => $.ui.toast(text)

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
      const mins = currentLevelMins()
      const min = mins[i] ?? 0
      const nextMin = mins[i + 1]
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

    const dot = (isOn: boolean) => (isOn ? '●' : '○')
    const toggle = (key: string, label: string, isOn: boolean, onPress: () => unknown, hotkey?: string) => (
      <Button key={key} plain hotkey={hotkey} dimColor={!isOn} label={`${dot(isOn)} ${label}`} onPress={onPress} />
    )
    const group = (title: string, items: RenderChildren[]) => (
      <Box key={`group-${title}`} flexDirection="column" marginTop={1}>
        <Text weight="semibold">{title}</Text>
        <Box flexDirection="row" flexWrap="wrap" columnGap={3}>
          {items}
        </Box>
      </Box>
    )
    const showToggles = (keys: readonly ShowKey[]) => keys.map(k => toggle(`show-${k}`, SHOW_LABELS[k], settings.show[k], toggleShow(k)))
    const exportNow = async () => {
      try {
        const path = await writeConfigFile($, DEFAULT_CONFIG_PATH)
        const copied = await $.ui.copy({ text: exportConfig(settings), surface: e.surface }).catch(() => ({ isCopied: false }))
        notify(`Config guardada en ${path}${copied.isCopied ? ' y copiada' : ''}`)
      } catch (err) {
        notify(`token-bar: ${err instanceof Error ? err.message : String(err)}`)
      }
    }
    const importNow = async () => {
      const loaded = await readConfigFile($, DEFAULT_CONFIG_PATH)
      if ('error' in loaded) return notify(`token-bar: ${loaded.error}`)
      await applyAndSave($, loaded.settings)
      notify(`Config importada de ${loaded.path}`)
    }
    const infoTab = (
      <Box flexDirection="column">
        <Text dimColor>Qué se ve en la banda. Se guarda solo; los presets cambian varias cosas de una vez.</Text>
        {group(
          'Presets',
          PRESET_NAMES.map((name, i) => <Button key={`preset-${name}`} plain hotkey={'zxc'[i]} label={name} onPress={() => applyAndSave($, applyPreset(settings, name))} />),
        )}
        {group('Medidores', showToggles(['model', 'session', 'week', 'fable', 'context']))}
        {group('Datos', showToggles(['tokens', 'cost', 'resets', 'cwd']))}
        {group('Repo', showToggles(['repoBranch', 'repoSync', 'repoChanges', 'repoChange', 'repoCi']))}
        {group('Clawd y estilo', [
          toggle('toggle-mascot', 'Clawd', settings.mascotOn, changeSettings({ mascotOn: !settings.mascotOn }), 'm'),
          toggle('toggle-say', 'Comentarios', settings.clawdSay, changeSettings({ clawdSay: !settings.clawdSay }), 's'),
          toggle('toggle-animations', 'Animaciones', settings.animations, changeSettings({ animations: !settings.animations }), 'n'),
          <Button key="levels" plain hotkey="l" label={`Cortes de color: ${formatLevels(settings.levels)} %`} onPress={changeSettings({ levels: nextLevels(settings.levels) })} />,
        ])}
        {group('Configuración portable', [
          <Button key="cfg-export" plain hotkey="e" label="Exportar" onPress={exportNow} />,
          <Button key="cfg-import" plain hotkey="i" label="Importar" onPress={importNow} />,
        ])}
        <Box marginTop={1}>
          <Text dimColor wrap="truncate-end">{DEFAULT_CONFIG_PATH} · también /token-bar-config</Text>
        </Box>
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
          <Button key="tab-info" plain hotkey="6" label="Info" dimColor={tab !== 'info'} onPress={setTab('info')} />
          <Button key="refresh" plain hotkey="u" label="Refrescar" onPress={() => Promise.all([refresh($), refreshRepo($, true)])} />
          <Text dimColor>Esc cierra</Text>
        </Box>
        <Box marginTop={1} flexDirection="column">
          {tab === 'limits' && limitsTab}
          {tab === 'tokens' && tokensTab}
          {tab === 'settings' && settingsTab}
          {tab === 'repo' && repoTab}
          {tab === 'legend' && legendTab}
          {tab === 'info' && infoTab}
        </Box>
      </Box>
    )
  })
}
