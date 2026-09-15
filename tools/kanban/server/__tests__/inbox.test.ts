import { describe, it, beforeAll, afterAll, beforeEach, afterEach, expect, vi } from 'vitest'
import { app } from '../api'
import { createServer } from 'http'
import type { AddressInfo } from 'net'
import { mkdtemp, mkdir, writeFile, rename, rm } from 'fs/promises'
import { join } from 'path'
import { tmpdir } from 'os'

/**
 * P1317 — inbox endpoints against synthetic stores.
 *
 * Fixtures only: no real store content ever enters this suite, its logs, or its
 * assertions. KANBAN_INBOX_ROOT points the server at a temp "main checkout".
 */

let server: ReturnType<typeof createServer>
let API: string
let root: string

const SECRET_TITLE = 'FIXTURE-SECRET-TITLE-7f3a'

const PUBLIC_STORE = [
  '# Process Learnings',
  '',
  '**Next ID:** 4',
  '',
  '## First open entry',
  '',
  '**ID:** INBOX-1',
  '**Status:** proposed',
  '**due:** week',
  '',
  '---',
  '',
  '## Second open entry',
  '',
  '**ID:** INBOX-3',
  '**Status:** proposed',
  '**due:** month',
  '',
  '---',
  '',
  `## ${SECRET_TITLE}`,
  '',
  // A distinctive non-`proposed` value, so the log assertion below can tell the
  // file's content apart from the fixed reason vocabulary (`status-not-proposed`).
  '**Status:** FIXTURE-SECRET-STATUS-2b9d',
  '',
].join('\n')

const PRIVATE_STORE = [
  '# Process Learnings (private)',
  '',
  '**Next ID:** 2',
  '',
  '## Private open entry',
  '',
  '**ID:** INBOX-P1',
  '**Status:** proposed',
  '',
].join('\n')

async function writeStores() {
  await mkdir(join(root, 'docs'), { recursive: true })
  await mkdir(join(root, '.private', 'docs'), { recursive: true })
  await writeFile(join(root, 'docs', 'process-learnings.md'), PUBLIC_STORE)
  await writeFile(join(root, '.private', 'docs', 'process-learnings.md'), PRIVATE_STORE)
}

const post = (path: string, body: unknown) =>
  fetch(`${API}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })

beforeAll(async () => {
  process.env.KANBAN_OPEN_DRY_RUN = 'true'
  server = app.listen(0)
  API = `http://localhost:${(server.address() as AddressInfo).port}`
  await new Promise((r) => setTimeout(r, 50))
})

afterAll(() => {
  server.close()
  delete process.env.KANBAN_OPEN_DRY_RUN
})

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'p1317-inbox-'))
  await writeStores()
  process.env.KANBAN_INBOX_ROOT = root
  delete process.env.KANBAN_PROJECT_ROOT
  delete process.env.KANBAN_INBOX
})

afterEach(async () => {
  delete process.env.KANBAN_INBOX_ROOT
  delete process.env.KANBAN_PROJECT_ROOT
  delete process.env.KANBAN_INBOX
  vi.restoreAllMocks()
  await rm(root, { recursive: true, force: true })
})

describe('GET /api/inbox', () => {
  it('returns one card per section, open and unparseable, from both stores', async () => {
    const body = await (await fetch(`${API}/api/inbox`)).json()
    expect(body.enabled).toBe(true)
    const [pub, priv] = body.stores
    expect(pub).toMatchObject({ kind: 'public', state: 'present', open: 2, unparseable: 1, nextId: 4, counterBehind: false })
    expect(priv).toMatchObject({ kind: 'private', state: 'present', open: 1, unparseable: 0 })
    expect(pub.entries.map((e: { key: string }) => e.key)).toEqual(['INBOX-1', 'INBOX-3', 'public:L21'])
    expect(priv.entries[0]).toMatchObject({ key: 'INBOX-P1', kind: 'private', state: 'open' })
    // The response never carries a filesystem path.
    expect(JSON.stringify(body)).not.toContain(root)
  })

  it('a newly appended entry appears on the next load, a deleted one disappears — no other step', async () => {
    const path = join(root, 'docs', 'process-learnings.md')
    await writeFile(path, PUBLIC_STORE + '\n## Added later\n\n**ID:** INBOX-4\n**Status:** proposed\n')
    let keys = (await (await fetch(`${API}/api/inbox`)).json()).stores[0].entries.map((e: { key: string }) => e.key)
    expect(keys).toContain('INBOX-4')
    await writeFile(path, PUBLIC_STORE.replace(/## First open entry[\s\S]*?---\n\n/, ''))
    keys = (await (await fetch(`${API}/api/inbox`)).json()).stores[0].entries.map((e: { key: string }) => e.key)
    expect(keys).not.toContain('INBOX-1')
    expect(keys).toContain('INBOX-3')
  })

  it('an absent private store renders as absent, never as an empty store', async () => {
    await rename(join(root, '.private', 'docs', 'process-learnings.md'), join(root, '.private', 'docs', 'moved-away.md'))
    const priv = (await (await fetch(`${API}/api/inbox`)).json()).stores[1]
    expect(priv.state).toBe('absent')
    expect(priv.open).toBeUndefined()
    expect(priv.entries).toEqual([])
  })

  it('is off for an embedder that sets KANBAN_PROJECT_ROOT (pp), and never touches a store', async () => {
    process.env.KANBAN_PROJECT_ROOT = join(root, 'elsewhere')
    delete process.env.KANBAN_INBOX_ROOT
    const body = await (await fetch(`${API}/api/inbox`)).json()
    expect(body).toEqual({ enabled: false })
    const cfg = await (await fetch(`${API}/api/config`)).json()
    expect(cfg.inboxEnabled).toBe(false)
    expect((await post('/api/inbox/open', { id: 'INBOX-1' })).status).toBe(404)
  })

  it('logs path and line only for an unparseable entry — the title never reaches the log', async () => {
    const lines: string[] = []
    const capture = (...args: unknown[]) => { lines.push(args.map(String).join(' ')) }
    vi.spyOn(console, 'warn').mockImplementation(capture)
    vi.spyOn(console, 'error').mockImplementation(capture)
    vi.spyOn(console, 'log').mockImplementation(capture)
    await fetch(`${API}/api/inbox`)
    const log = lines.join('\n')
    expect(log).toContain(`${join(root, 'docs', 'process-learnings.md')}:21`)
    expect(log).not.toContain(SECRET_TITLE)
    expect(log).not.toContain('FIXTURE-SECRET-STATUS-2b9d')
  })
})

describe('POST /api/inbox/open', () => {
  it('opens an entry by ID at its heading line', async () => {
    const res = await post('/api/inbox/open', { id: 'INBOX-3' })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ success: true, dryRun: true, kind: 'public', line: 13 })
    const priv = await post('/api/inbox/open', { id: 'INBOX-P1' })
    expect(await priv.json()).toMatchObject({ kind: 'private', line: 5 })
  })

  it('opens an unparseable section by its line key', async () => {
    const res = await post('/api/inbox/open', { id: 'public:L21' })
    expect(await res.json()).toMatchObject({ success: true, line: 21 })
    expect((await post('/api/inbox/open', { id: 'public:L22' })).status).toBe(404)
  })

  it('rejects an unknown ID, a path, and a non-string', async () => {
    expect((await post('/api/inbox/open', { id: 'INBOX-99' })).status).toBe(404)
    expect((await post('/api/inbox/open', { id: 'INBOX-P99' })).status).toBe(404)
    expect((await post('/api/inbox/open', { id: join(root, 'docs', 'process-learnings.md') })).status).toBe(400)
    expect((await post('/api/inbox/open', { id: '../../etc/passwd' })).status).toBe(400)
    expect((await post('/api/inbox/open', { id: 12 })).status).toBe(400)
    expect((await post('/api/inbox/open', {})).status).toBe(400)
  })

  it('refuses to pick one of two sections sharing an ID', async () => {
    await writeFile(join(root, 'docs', 'process-learnings.md'), PUBLIC_STORE.replace('INBOX-3', 'INBOX-1'))
    expect((await post('/api/inbox/open', { id: 'INBOX-1' })).status).toBe(409)
  })
})

describe('DNS rebinding guard', () => {
  it('refuses a request whose Host is not loopback, and allows localhost and 127.0.0.1', async () => {
    const { request } = await import('http')
    const get = (host: string) =>
      new Promise<number>((resolve, reject) => {
        const port = new URL(API).port
        const req = request({ host: '127.0.0.1', port, path: '/api/inbox', headers: { Host: host } }, (res) => {
          res.resume()
          resolve(res.statusCode ?? 0)
        })
        req.on('error', reject)
        req.end()
      })
    expect(await get('attacker.example')).toBe(403)
    expect(await get('attacker.example:9051')).toBe(403)
    expect(await get('localhost:9050')).toBe(200)
    expect(await get('127.0.0.1:9051')).toBe(200)
  })
})

describe('the generic /api/open allowlist is not widened', () => {
  it('still refuses the real inbox store paths', async () => {
    const wt = (await (await fetch(`${API}/api/worktrees`)).json())[0].path as string
    for (const p of [join(wt, 'docs', 'process-learnings.md'), join(wt, '.private', 'docs', 'process-learnings.md')]) {
      const res = await post('/api/open', { path: p })
      expect(res.status).toBe(403)
    }
  })
})
