import { describe, expect, test } from 'claude-code/testing'

import {
  formatAgo,
  formatBranch,
  formatChanges,
  formatCi,
  type GitState,
  githubVariables,
  gitKey,
  gitlabPaths,
  parseGithub,
  parseGitlab,
  parseRemote,
  parseStatus,
  repoSummary,
} from '../hooks/repo'

const GIT: GitState = {
  branch: 'main',
  sha: '1234567890abcdef1234567890abcdef12345678',
  upstream: 'origin/main',
  ahead: 0,
  behind: 0,
  staged: 0,
  unstaged: 0,
  untracked: 0,
  conflicts: 0,
  subject: 'feat: x',
}

describe('remoto', () => {
  test('scp, https y ssh con puerto', () => {
    expect(parseRemote('git@github.com:guille-nat/token-bar.git')).toEqual({ forge: 'github', host: 'github.com', path: 'guille-nat/token-bar' })
    expect(parseRemote('https://github.com/o/r')).toEqual({ forge: 'github', host: 'github.com', path: 'o/r' })
    expect(parseRemote('https://user@gitlab.com/g/sub/r.git/')).toEqual({ forge: 'gitlab', host: 'gitlab.com', path: 'g/sub/r' })
    expect(parseRemote('ssh://git@gitlab.empresa.com:2222/g/r.git')).toEqual({ forge: 'gitlab', host: 'gitlab.empresa.com', path: 'g/r' })
    expect(parseRemote('git@bitbucket.org:o/r.git')?.forge).toBeNull()
    expect(parseRemote('/ruta/local')).toBeNull()
  })
})

describe('git status --porcelain=v2', () => {
  test('rama, upstream, adelante/atrás y cambios', () => {
    const git = parseStatus(
      [
        '# branch.oid abc',
        '# branch.head main',
        '# branch.upstream origin/main',
        '# branch.ab +3 -1',
        '1 MM N... 1 1 1 a b x',
        '2 R. N... 1 1 1 a b R100 y\tz',
        'u UU N... 1 1 1 1 a b c w',
        '? nuevo',
        '! ignorado',
      ].join('\n'),
    )
    expect(git).toEqual({ branch: 'main', sha: 'abc', upstream: 'origin/main', ahead: 3, behind: 1, staged: 2, unstaged: 1, untracked: 1, conflicts: 1 })
  })

  test('repo sin commits y HEAD separado', () => {
    expect(parseStatus('# branch.oid (initial)\n# branch.head main\n').sha).toBeNull()
    expect(parseStatus('# branch.oid abc\n# branch.head (detached)\n').branch).toBeNull()
  })
})

describe('GitHub', () => {
  test('variables de la consulta', () => {
    const vars = githubVariables('o/r', GIT)
    expect(vars.owner).toBe('o')
    expect(vars.name).toBe('r')
    expect(vars.mine).toBe('repo:o/r is:issue is:open assignee:@me')
    expect(githubVariables('o/r', { ...GIT, sha: null }).sha).toBe('0'.repeat(40))
  })

  test('prefiere el PR abierto y junta los checks', () => {
    const data = parseGithub(
      {
        data: {
          repository: {
            issues: { totalCount: 10 },
            pullRequests: { totalCount: 2 },
            object: {
              statusCheckRollup: {
                contexts: {
                  nodes: [
                    { __typename: 'CheckRun', name: 'build', status: 'IN_PROGRESS', conclusion: null },
                    { __typename: 'CheckRun', name: 'docs', status: 'COMPLETED', conclusion: 'SKIPPED' },
                    { __typename: 'StatusContext', context: 'ci/ext', state: 'ERROR' },
                  ],
                },
              },
            },
            branchPrs: {
              nodes: [
                { number: 3, title: 'viejo', state: 'CLOSED', isDraft: false, reviewDecision: null, url: 'u3' },
                { number: 4, title: 'nuevo', state: 'OPEN', isDraft: true, reviewDecision: 'CHANGES_REQUESTED', url: 'u4' },
              ],
            },
          },
          mine: { issueCount: 1 },
          review: { issueCount: 0 },
        },
      },
      GIT,
    )
    expect(data.change).toEqual({ number: 4, title: 'nuevo', state: 'borrador', review: 'cambios pedidos', url: 'u4' })
    expect(data.ci).toEqual({ state: 'falla', ok: 1, failing: 1, running: 1, failed: ['ci/ext'] })
    expect([data.openIssues, data.openChanges, data.assigned, data.reviewRequested]).toEqual([10, 2, 1, 0])
  })

  test('commit sin pushear: sin CI; HEAD separado: sin PR', () => {
    const json = { data: { repository: { object: null, branchPrs: { nodes: [{ number: 1, state: 'OPEN' }] } } } }
    expect(parseGithub(json, GIT).ci).toBeNull()
    expect(parseGithub(json, { ...GIT, branch: null }).change).toBeNull()
  })
})

describe('GitLab', () => {
  test('rutas con el proyecto codificado', () => {
    const paths = gitlabPaths('g/sub/r', { ...GIT, branch: 'feat/x' })
    expect(paths.mrs).toBe('projects/g%2Fsub%2Fr/merge_requests?source_branch=feat%2Fx&order_by=updated_at&per_page=5')
    expect(paths.reviewMrs('yo')).toContain('reviewer_username=yo')
  })

  test('MR, pipeline y conteos', () => {
    const data = parseGitlab(
      {
        mrs: [{ iid: 7, title: 't', state: 'merged', web_url: 'w' }],
        pipelines: [{ id: 1, status: 'failed' }],
        issues: { statistics: { counts: { opened: 3 } } },
        assigned: { statistics: { counts: { opened: 1 } } },
        openMrs: Array.from({ length: 100 }, () => ({})),
        reviewMrs: [],
      },
      GIT,
    )
    expect(data.change).toEqual({ number: 7, title: 't', state: 'mergeado', review: null, url: 'w' })
    expect(data.ci?.state).toBe('falla')
    expect([data.openIssues, data.openChanges, data.assigned, data.reviewRequested, data.isCapped]).toEqual([3, 100, 1, 0, true])
  })
})

describe('textos', () => {
  const repo = (git: GitState) => ({ root: '/w', remote: null, git, forge: null, forgeError: null, updatedAt: null })

  test('tramo de la barra', () => {
    expect(repoSummary(repo({ ...GIT, ahead: 2, behind: 1, unstaged: 3 }), false)).toBe('main ⇡2⇣1 ±3')
    expect(repoSummary(repo({ ...GIT, branch: 'una-rama-con-un-nombre-larguisimo' }), true)).toBe('una-rama-co…')
    expect(repoSummary(repo({ ...GIT, branch: null }), false)).toBe('1234567')
    expect(repoSummary(null, false)).toBe('')
  })

  test('rama, cambios, CI y antigüedad', () => {
    expect(formatBranch(GIT)).toBe('main → origin/main · al día')
    expect(formatBranch({ ...GIT, upstream: null })).toBe('main (sin upstream)')
    expect(formatChanges(GIT)).toBe('limpio')
    expect(formatChanges({ ...GIT, staged: 2, untracked: 1 })).toBe('2 preparados · 1 sin seguir')
    expect(formatCi({ state: 'falla', ok: 2, failing: 4, running: 0, failed: ['a', 'b', 'c', 'd'] })).toBe('✗ 4 fallando (a, b, c, …) · 2 ok')
    expect(formatAgo(0, 45_000)).toBe('hace 45 s')
    expect(formatAgo(0, 180_000)).toBe('hace 3 min')
  })

  test('la clave cambia con la rama, el commit o el push', () => {
    expect(gitKey(GIT)).not.toBe(gitKey({ ...GIT, ahead: 1 }))
    expect(gitKey(GIT)).toBe(gitKey({ ...GIT, unstaged: 5 }))
  })
})
