import { describe, it, beforeAll, afterAll, expect } from 'vitest'
import { createServer } from 'http'
import type { AddressInfo } from 'net'
import { mkdirSync, writeFileSync, mkdtempSync, realpathSync, rmSync } from 'fs'
import { execFileSync } from 'child_process'
import { join } from 'path'
import { tmpdir } from 'os'
import { renderToStaticMarkup } from 'react-dom/server'
import { createElement } from 'react'
import type { Express } from 'express'

// P1507: the main board also shows sensitive (disclosure: embargo) specs, tagged
// private: true, read-only. Sources: <root>/.private/features/ and live worktrees.

let app: Express
let server: ReturnType<typeof createServer>
let BASE: string
let ROOT: string
let WT: string

const spec = (status: string, extra = '', title = 'T') =>
  `---\nstatus: ${status}\nrank: 1.0\n${extra}---\n\n# ${title}\n`
const put = (path: string, body: string) => {
  mkdirSync(join(path, '..'), { recursive: true })
  writeFileSync(path, body, 'utf-8')
}
const git = (cwd: string, ...args: string[]) => execFileSync('git', args, { cwd, stdio: 'pipe' })

beforeAll(async () => {
  ROOT = realpathSync(mkdtempSync(join(tmpdir(), 'kanban-p1507-')))
  git(ROOT, 'init', '-q', '-b', 'main')
  git(ROOT, 'config', 'user.email', 't@example.com')
  git(ROOT, 'config', 'user.name', 't')
  put(join(ROOT, 'features', 'p1001_public.md'), spec('today', '', 'Public one'))
  put(join(ROOT, 'features', 'p1002_public.md'), spec('backlog', '', 'Public two'))
  git(ROOT, 'add', 'features')
  git(ROOT, 'commit', '-q', '-m', 'init')

  // archived private spec + companions that must not become cards
  put(join(ROOT, '.private', 'features', 'done', '2026-10-16', 'p9999_x.md'), spec('all-done', 'disclosure: embargo\n', 'Archived secret'))
  put(join(ROOT, '.private', 'features', 'done', '2026-10-16', 'uat', 'p9999.md'), spec('all-done', '', 'UAT companion'))
  put(join(ROOT, '.private', 'features', 'done', '2026-10-16', 'p9999_x.manifest'), 'sha\n')
  // same pN also in flight in a worktree: .private must win
  WT = join(ROOT, '.claude', 'worktrees', 'w9')
  git(ROOT, 'worktree', 'add', '-q', '-b', 'feature/p9999', WT)
  put(join(WT, 'features', 'p9999_x.md'), spec('in-progress', 'disclosure: "Embargo"\n', 'Worktree copy'))
  // embargo spec only in a worktree
  put(join(WT, 'features', 'p9998_wt.md'), spec('in-progress', "disclosure: ' EMBARGO '\n", 'In flight secret'))
  // public spec only in a worktree must NOT show on main
  put(join(WT, 'features', 'p9997_pub.md'), spec('today', '', 'Public in worktree'))
  // not embargo
  put(join(WT, 'features', 'p9996_other.md'), spec('today', 'disclosure: public\n', 'Other'))

  process.env.KANBAN_PROJECT_ROOT = ROOT
  process.env.KANBAN_OPEN_DRY_RUN = 'true'
  delete process.env.KANBAN_DISABLE_WORKTREES
  const mod = await import('../api')
  app = mod.app
  server = app.listen(0)
  BASE = `http://localhost:${(server.address() as AddressInfo).port}`
  await new Promise((r) => setTimeout(r, 50))
})

afterAll(() => {
  server?.close()
  delete process.env.KANBAN_PROJECT_ROOT
  delete process.env.KANBAN_OPEN_DRY_RUN
  try { git(ROOT, 'worktree', 'remove', '--force', WT) } catch { /* best effort */ }
  rmSync(ROOT, { recursive: true, force: true })
})

type F = { id: string; status: string; private?: boolean; title: string; path: string }
const main = async (): Promise<F[]> =>
  (await fetch(`${BASE}/api/features?refresh=true`)).json() as Promise<F[]>

describe('P1507: private specs on the main board', () => {
  it('shows a .private archived spec with private:true in its frontmatter status', async () => {
    const f = (await main()).find((x) => x.id === 'p9999_x')
    expect(f?.private).toBe(true)
    expect(f?.status).toBe('all-done')
    expect(f?.path).toContain(join('.private', 'features'))
  })

  it('keeps public specs unmarked', async () => {
    const f = (await main()).find((x) => x.id === 'p1001_public')
    expect(f).toBeDefined()
    expect(f?.private).toBeUndefined()
  })

  it('ignores uat companions and .manifest files', async () => {
    const ids = (await main()).map((x) => x.id)
    expect(ids.filter((i) => i.startsWith('p9999'))).toEqual(['p9999_x'])
    expect(ids.some((i) => i.includes('manifest'))).toBe(false)
  })

  it('shows an embargo spec from a live worktree (case/space/quote tolerant)', async () => {
    const f = (await main()).find((x) => x.id === 'p9998_wt')
    expect(f?.private).toBe(true)
    expect(f?.status).toBe('in-progress')
  })

  it('does not show public or non-embargo worktree specs', async () => {
    const ids = (await main()).map((x) => x.id)
    expect(ids).not.toContain('p9997_pub')
    expect(ids).not.toContain('p9996_other')
  })

  it('dedupes by P-number, .private copy wins over the worktree copy', async () => {
    const hits = (await main()).filter((x) => x.id.startsWith('p9999'))
    expect(hits).toHaveLength(1)
    expect(hits[0].title).toBe('Archived secret')
  })

  it('leaves a worktree board unchanged (own specs only, no private flag)', async () => {
    const res = await fetch(`${BASE}/api/features?refresh=true&worktree=${encodeURIComponent(WT)}`)
    const list = (await res.json()) as F[]
    expect(list.map((x) => x.id).sort()).toEqual(['p1001_public', 'p1002_public', 'p9996_other', 'p9997_pub', 'p9998_wt', 'p9999_x'])
    expect(list.every((x) => x.private === undefined)).toBe(true)
  })

  it('refuses PATCH on a private card with a clear message and does not write', async () => {
    const before = (await main()).find((x) => x.id === 'p9999_x')!
    const res = await fetch(`${BASE}/api/features/p9999_x`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'today' }),
    })
    expect(res.status).toBe(403)
    expect(((await res.json()) as { error: string }).error).toBe(
      'private spec: change it on its worktree board, or it is archived'
    )
    expect((await main()).find((x) => x.id === 'p9999_x')!.status).toBe(before.status)
  })

  it('does not put .private paths on the /api/open allowlist', async () => {
    const f = (await main()).find((x) => x.id === 'p9999_x')!
    const res = await fetch(`${BASE}/api/open`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: f.path }),
    })
    expect(res.status).toBe(403)
  })
})

describe('P1507: .private tag', () => {
  it('renders the exact text .private', async () => {
    const { PrivateTag } = await import('../../src/components/PrivateTag')
    expect(renderToStaticMarkup(createElement(PrivateTag))).toContain('>.private<')
  })
})
