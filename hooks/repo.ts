// Datos del repo de la sesión: git local y GitHub/GitLab. Puro como format.ts:
// register.tsx corre git/gh/glab con $.process.run y acá solo se parsea.

export type Forge = 'github' | 'gitlab'
export type Remote = { forge: Forge | null; host: string; path: string }

export type GitState = {
  /** null: HEAD separado. */
  branch: string | null
  /** null: repo sin commits. */
  sha: string | null
  upstream: string | null
  ahead: number
  behind: number
  staged: number
  unstaged: number
  untracked: number
  conflicts: number
  subject: string | null
}

export type CiState = 'ok' | 'falla' | 'corriendo'
export type Ci = { state: CiState; ok: number; failing: number; running: number; failed: string[] }

export type ChangeState = 'abierto' | 'borrador' | 'mergeado' | 'cerrado'
/** El PR (GitHub) o MR (GitLab) de la rama. */
export type Change = { number: number; title: string; state: ChangeState; review: string | null; url: string }

export type ForgeData = {
  change: Change | null
  /** null: el commit no está en el remoto o no tiene checks. */
  ci: Ci | null
  openIssues: number | null
  openChanges: number | null
  assigned: number | null
  reviewRequested: number | null
  /** GitLab cuenta MRs listando hasta 100: el número es "100+". */
  isCapped: boolean
}

export type RepoInfo = {
  root: string
  remote: Remote | null
  git: GitState | null
  forge: ForgeData | null
  forgeError: string | null
  /** Última consulta a GitHub/GitLab (ms). */
  updatedAt: number | null
}

const forgeOf = (host: string): Forge | null => {
  const h = host.toLowerCase()
  if (h.includes('github')) return 'github'
  if (h.includes('gitlab')) return 'gitlab'
  return null
}

/**
 * git@github.com:o/r.git, https://github.com/o/r, ssh://git@host:2222/g/sub/r.git
 * → host y path "o/r"; null si no tiene forma de remoto.
 */
export const parseRemote = (url: string): Remote | null => {
  const u = url.trim()
  const m =
    u.match(/^[a-z][a-z0-9+.-]*:\/\/(?:[^@/]+@)?([^/:]+)(?::\d+)?\/(.+?)(?:\.git)?\/?$/i) ??
    u.match(/^(?:[^@/]+@)?([^/:]+):(?!\/)(.+?)(?:\.git)?\/?$/)
  if (!m?.[1] || !m[2] || !m[2].includes('/')) return null
  return { forge: forgeOf(m[1]), host: m[1], path: m[2] }
}

/** Salida de `git status --porcelain=v2 --branch`. */
export const parseStatus = (out: string): Omit<GitState, 'subject'> => {
  const git: Omit<GitState, 'subject'> = {
    branch: null,
    sha: null,
    upstream: null,
    ahead: 0,
    behind: 0,
    staged: 0,
    unstaged: 0,
    untracked: 0,
    conflicts: 0,
  }
  for (const line of out.split('\n')) {
    if (line.startsWith('# branch.oid ')) {
      const v = line.slice('# branch.oid '.length)
      git.sha = v === '(initial)' ? null : v
    } else if (line.startsWith('# branch.head ')) {
      const v = line.slice('# branch.head '.length)
      git.branch = v === '(detached)' ? null : v
    } else if (line.startsWith('# branch.upstream ')) {
      git.upstream = line.slice('# branch.upstream '.length)
    } else if (line.startsWith('# branch.ab ')) {
      const m = line.match(/\+(\d+) -(\d+)/)
      git.ahead = Number(m?.[1] ?? 0)
      git.behind = Number(m?.[2] ?? 0)
    } else if (line.startsWith('1 ') || line.startsWith('2 ')) {
      if (line[2] !== '.') git.staged += 1
      if (line[3] !== '.') git.unstaged += 1
    } else if (line.startsWith('u ')) {
      git.conflicts += 1
    } else if (line.startsWith('? ')) {
      git.untracked += 1
    }
  }
  return git
}

/** Salida de `git log -1 --format=%s` (vacía en un repo sin commits). */
export const parseSubject = (out: string): string | null => out.trim() || null

const asObj = (v: unknown): Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : {}
const asArr = (v: unknown): unknown[] => (Array.isArray(v) ? v : [])
const asNum = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)
const asStr = (v: unknown): string => (typeof v === 'string' ? v : '')

/** Junta checks como ok/fallando/corriendo; null si no hay ninguno. */
const summarizeCi = (checks: { name: string; result: CiState }[]): Ci | null => {
  if (checks.length === 0) return null
  const count = (r: CiState) => checks.filter(c => c.result === r).length
  const ok = count('ok')
  const failing = count('falla')
  const running = count('corriendo')
  return {
    state: failing > 0 ? 'falla' : running > 0 ? 'corriendo' : 'ok',
    ok,
    failing,
    running,
    failed: checks.filter(c => c.result === 'falla').map(c => c.name),
  }
}

const GITHUB_OK = ['SUCCESS', 'NEUTRAL', 'SKIPPED']

/** Un nodo de `statusCheckRollup.contexts`: CheckRun (Actions, apps) o StatusContext. */
const githubCheck = (node: unknown): { name: string; result: CiState } => {
  const n = asObj(node)
  if (n.__typename === 'StatusContext') {
    const state = asStr(n.state)
    return {
      name: asStr(n.context),
      result: state === 'SUCCESS' ? 'ok' : state === 'PENDING' || state === 'EXPECTED' ? 'corriendo' : 'falla',
    }
  }
  return {
    name: asStr(n.name),
    result: n.status !== 'COMPLETED' ? 'corriendo' : GITHUB_OK.includes(asStr(n.conclusion)) ? 'ok' : 'falla',
  }
}

const GITHUB_REVIEW: Record<string, string> = {
  APPROVED: 'aprobado',
  CHANGES_REQUESTED: 'cambios pedidos',
  REVIEW_REQUIRED: 'review pendiente',
}

/** La consulta que corre `gh api graphql` (ver Doc/funcionalidades/repo.md). */
export const GITHUB_QUERY = `query($owner: String!, $name: String!, $branch: String!, $sha: GitObjectID!, $mine: String!, $review: String!) {
  repository(owner: $owner, name: $name) {
    issues(states: OPEN) { totalCount }
    pullRequests(states: OPEN) { totalCount }
    object(oid: $sha) {
      ... on Commit {
        statusCheckRollup {
          contexts(first: 100) {
            nodes {
              __typename
              ... on CheckRun { name status conclusion }
              ... on StatusContext { context state }
            }
          }
        }
      }
    }
    branchPrs: pullRequests(headRefName: $branch, first: 5, orderBy: { field: CREATED_AT, direction: DESC }) {
      nodes { number title state isDraft reviewDecision url }
    }
  }
  mine: search(query: $mine, type: ISSUE) { issueCount }
  review: search(query: $review, type: ISSUE) { issueCount }
}`

/** Las variables de GITHUB_QUERY para un repo "owner/name". */
export const githubVariables = (path: string, git: GitState): Record<string, string> => {
  const [owner = '', name = ''] = path.split('/')
  return {
    owner,
    name,
    branch: git.branch ?? '',
    // Un repo sin commits pregunta por un oid que no existe: object null.
    sha: git.sha ?? '0'.repeat(40),
    mine: `repo:${path} is:issue is:open assignee:@me`,
    review: `repo:${path} is:pr is:open review-requested:@me`,
  }
}

/** Respuesta de GITHUB_QUERY; con HEAD separado no hay PR de rama. */
export const parseGithub = (json: unknown, git: GitState): ForgeData => {
  const data = asObj(asObj(json).data)
  const repo = asObj(data.repository)
  const prs = asArr(asObj(repo.branchPrs).nodes).map(asObj)
  const pr = git.branch === null ? undefined : (prs.find(p => p.state === 'OPEN') ?? prs[0])
  const state = asStr(pr?.state)
  const contexts = asArr(asObj(asObj(asObj(repo.object).statusCheckRollup).contexts).nodes)

  return {
    change:
      pr === undefined
        ? null
        : {
            number: asNum(pr.number) ?? 0,
            title: asStr(pr.title),
            state: state === 'MERGED' ? 'mergeado' : state === 'CLOSED' ? 'cerrado' : pr.isDraft === true ? 'borrador' : 'abierto',
            review: state === 'OPEN' ? (GITHUB_REVIEW[asStr(pr.reviewDecision)] ?? null) : null,
            url: asStr(pr.url),
          },
    ci: summarizeCi(contexts.map(githubCheck)),
    openIssues: asNum(asObj(repo.issues).totalCount),
    openChanges: asNum(asObj(repo.pullRequests).totalCount),
    assigned: asNum(asObj(data.mine).issueCount),
    reviewRequested: asNum(asObj(data.review).issueCount),
    isCapped: false,
  }
}

/** Las rutas de la API REST de GitLab (v4) que se piden con `glab api`. */
export const gitlabPaths = (path: string, git: GitState) => {
  const p = `projects/${encodeURIComponent(path)}`
  return {
    user: 'user',
    mrs: `${p}/merge_requests?source_branch=${encodeURIComponent(git.branch ?? '')}&order_by=updated_at&per_page=5`,
    pipelines: `${p}/pipelines?sha=${git.sha ?? ''}&per_page=1`,
    issues: `${p}/issues_statistics`,
    assigned: `${p}/issues_statistics?scope=assigned_to_me`,
    openMrs: `${p}/merge_requests?state=opened&view=simple&per_page=100`,
    reviewMrs: (username: string) =>
      `${p}/merge_requests?state=opened&view=simple&per_page=100&reviewer_username=${encodeURIComponent(username)}`,
  }
}

const GITLAB_CI: Record<string, CiState> = {
  success: 'ok',
  skipped: 'ok',
  failed: 'falla',
  canceled: 'falla',
  running: 'corriendo',
  pending: 'corriendo',
  created: 'corriendo',
  preparing: 'corriendo',
  waiting_for_resource: 'corriendo',
  scheduled: 'corriendo',
}

const GITLAB_REVIEW: Record<string, string> = {
  not_approved: 'review pendiente',
  mergeable: 'listo para merge',
}

/** Las respuestas de gitlabPaths, ya parseadas como JSON. */
export const parseGitlab = (
  r: { mrs: unknown; pipelines: unknown; issues: unknown; assigned: unknown; openMrs: unknown; reviewMrs: unknown },
  git: GitState,
): ForgeData => {
  const mrs = asArr(r.mrs).map(asObj)
  const mr = git.branch === null ? undefined : (mrs.find(m => m.state === 'opened') ?? mrs[0])
  const state = asStr(mr?.state)
  const pipeline = asObj(asArr(r.pipelines)[0])
  const ciState = GITLAB_CI[asStr(pipeline.status)]
  const openMrs = asArr(r.openMrs).length

  return {
    change:
      mr === undefined
        ? null
        : {
            number: asNum(mr.iid) ?? 0,
            title: asStr(mr.title),
            state: state === 'merged' ? 'mergeado' : state === 'opened' ? (mr.draft === true ? 'borrador' : 'abierto') : 'cerrado',
            review: state === 'opened' ? (GITLAB_REVIEW[asStr(mr.detailed_merge_status)] ?? null) : null,
            url: asStr(mr.web_url),
          },
    ci:
      ciState === undefined
        ? null
        : summarizeCi([{ name: `pipeline ${asNum(pipeline.id) ?? ''}`.trim(), result: ciState }]),
    openIssues: asNum(asObj(asObj(asObj(r.issues).statistics).counts).opened),
    openChanges: Array.isArray(r.openMrs) ? openMrs : null,
    assigned: asNum(asObj(asObj(asObj(r.assigned).statistics).counts).opened),
    reviewRequested: Array.isArray(r.reviewMrs) ? r.reviewMrs.length : null,
    isCapped: openMrs >= 100,
  }
}

/** Lo que identifica un estado de la rama: si cambia, se vuelve a preguntar al remoto. */
export const gitKey = (git: GitState | null): string =>
  git === null ? '' : `${git.branch ?? ''}@${git.sha ?? ''}+${git.ahead}-${git.behind}`

export const changeLabel = (forge: Forge | null): string => (forge === 'gitlab' ? 'MR' : 'PR')
export const changeRef = (forge: Forge | null, n: number): string => `${forge === 'gitlab' ? '!' : '#'}${n}`

export const CI_GLYPH: Record<CiState, string> = { ok: '✓', falla: '✗', corriendo: '○' }

export const dirtyCount = (git: GitState): number => git.staged + git.unstaged + git.untracked + git.conflicts

/** "una-rama-muy-larga" → "una-rama-mu…" si pasa de `max`. */
export const clip = (s: string, max: number): string => (s.length <= max ? s : `${s.slice(0, max - 1)}…`)

/** "/home/yo/workdir/app" → "~/workdir/app"; si pasa de `max`, conserva el final: "…/workdir/app". */
export const formatPath = (path: string, home: string | null | undefined, max: number): string => {
  const short = home && (path === home || path.startsWith(`${home}/`)) ? `~${path.slice(home.length)}` : path
  return short.length <= max ? short : `…${short.slice(short.length - max + 1)}`
}

export type RepoShow = { branch?: boolean; sync?: boolean; changes?: boolean; change?: boolean; ci?: boolean }

/**
 * El tramo del repo en la línea de estado:
 * compacta  "main ✓"
 * media/completa  "main ⇡2⇣1 ±3 #12 ✓" (⇡⇣ para no confundir con ↑↓ de tokens)
 * Con `show`, solo las partes que valen true (sin `show`, todas).
 */
export const repoSummary = (repo: RepoInfo | null | undefined, compact: boolean, show: RepoShow = {}): string => {
  const git = repo?.git
  if (!repo || !git) return ''
  const on = (k: keyof RepoShow) => show[k] !== false
  const name = on('branch') ? clip(git.branch ?? git.sha?.slice(0, 7) ?? '?', compact ? 12 : 24) : ''
  const ci = on('ci') && repo.forge?.ci ? CI_GLYPH[repo.forge.ci.state] : ''
  if (compact) return [name, ci].filter(Boolean).join(' ')

  const sync = on('sync') ? `${git.ahead > 0 ? `⇡${git.ahead}` : ''}${git.behind > 0 ? `⇣${git.behind}` : ''}` : ''
  const dirty = on('changes') && dirtyCount(git) > 0 ? `±${dirtyCount(git)}` : ''
  const change = on('change') && repo.forge?.change ? changeRef(repo.remote?.forge ?? null, repo.forge.change.number) : ''
  return [name, sync, dirty, change, ci].filter(Boolean).join(' ')
}

/** "hace 40 s", "hace 3 min", "hace 2 h". */
export const formatAgo = (thenMs: number, nowMs: number): string => {
  const s = Math.max(0, Math.round((nowMs - thenMs) / 1000))
  if (s < 60) return `hace ${s} s`
  if (s < 3600) return `hace ${Math.floor(s / 60)} min`
  return `hace ${Math.floor(s / 3600)} h`
}

/** "1 en conflicto · 3 preparados · 1 modificado · 2 sin seguir", o "limpio". */
export const formatChanges = (git: GitState): string => {
  const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`
  const parts = [
    git.conflicts > 0 ? `${git.conflicts} en conflicto` : '',
    git.staged > 0 ? plural(git.staged, 'preparado', 'preparados') : '',
    git.unstaged > 0 ? plural(git.unstaged, 'modificado', 'modificados') : '',
    git.untracked > 0 ? `${git.untracked} sin seguir` : '',
  ].filter(Boolean)
  return parts.length === 0 ? 'limpio' : parts.join(' · ')
}

/** "main → origin/main · ⇡2 ⇣1", "main (sin upstream)", "HEAD separado en abc1234". */
export const formatBranch = (git: GitState): string => {
  if (git.branch === null) return `HEAD separado en ${git.sha?.slice(0, 7) ?? '?'}`
  if (git.upstream === null) return `${git.branch} (sin upstream)`
  const sync =
    git.ahead === 0 && git.behind === 0
      ? 'al día'
      : [git.ahead > 0 ? `⇡${git.ahead}` : '', git.behind > 0 ? `⇣${git.behind}` : ''].filter(Boolean).join(' ')
  return `${git.branch} → ${git.upstream} · ${sync}`
}

/** "✗ 2 fallando (build, lint) · 1 corriendo · 5 ok". */
export const formatCi = (ci: Ci): string => {
  const shown = ci.failed.slice(0, 3).join(', ') + (ci.failed.length > 3 ? ', …' : '')
  const parts = [
    ci.failing > 0 ? `${ci.failing} fallando (${shown})` : '',
    ci.running > 0 ? `${ci.running} corriendo` : '',
    ci.ok > 0 ? `${ci.ok} ok` : '',
  ].filter(Boolean)
  return `${CI_GLYPH[ci.state]} ${parts.join(' · ')}`
}

export const formatCount = (n: number | null, isCapped = false): string =>
  n === null ? '--' : isCapped ? `${n}+` : String(n)

/** El primer renglón de un error de gh/glab, recortado. */
export const firstLine = (s: string): string => clip(s.trim().split('\n')[0] ?? '', 120)
