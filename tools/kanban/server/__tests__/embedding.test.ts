import { describe, it, beforeAll, afterAll, expect } from 'vitest'
import { createServer } from 'http'
import type { AddressInfo } from 'net'
import { mkdir, rm, writeFile } from 'fs/promises'
import { join } from 'path'
import { tmpdir } from 'os'
import type { Express } from 'express'

// Embedding-mode test: verifies the env-var config surface introduced for
// non-cp consumers (pp, sd, ladischenski-com). All env vars must be set BEFORE
// importing api.ts, so the import is dynamic inside beforeAll.

let app: Express
let server: ReturnType<typeof createServer>
let API_BASE_URL: string

const TEST_ROOT = join(tmpdir(), 'kanban-embedding-test')
const TEST_FEATURES_DIR_NAME = 'tasks_test_fixture'

beforeAll(async () => {
  // Clean & seed fixture root
  await rm(TEST_ROOT, { recursive: true, force: true })
  await mkdir(join(TEST_ROOT, TEST_FEATURES_DIR_NAME), { recursive: true })
  await writeFile(
    join(TEST_ROOT, TEST_FEATURES_DIR_NAME, 'p1_test.md'),
    '---\nstatus: today\nrank: 1.0\n---\n\n# Test feature\n',
    'utf-8'
  )

  process.env.KANBAN_PROJECT_ROOT = TEST_ROOT
  process.env.KANBAN_FEATURES_DIR = TEST_FEATURES_DIR_NAME
  process.env.KANBAN_DISABLE_WORKTREES = 'true'
  process.env.KANBAN_HIDE_PAGES = 'goals,content'
  process.env.KANBAN_HIDE_COLUMNS = 'qa'

  // Dynamic import — env must be set before module-load resolves the constants
  const mod = await import('../api')
  app = mod.app

  server = app.listen(0)
  const port = (server.address() as AddressInfo).port
  API_BASE_URL = `http://localhost:${port}`
  await new Promise((r) => setTimeout(r, 50))
})

afterAll(async () => {
  server?.close()
  await rm(TEST_ROOT, { recursive: true, force: true })
  delete process.env.KANBAN_PROJECT_ROOT
  delete process.env.KANBAN_FEATURES_DIR
  delete process.env.KANBAN_DISABLE_WORKTREES
  delete process.env.KANBAN_HIDE_PAGES
  delete process.env.KANBAN_HIDE_COLUMNS
})

describe('Embedding: env-var config surface', () => {
  it('KANBAN_FEATURES_DIR overrides the scanned directory name', async () => {
    const res = await fetch(`${API_BASE_URL}/api/features`)
    expect(res.status).toBe(200)
    const features = await res.json()
    expect(Array.isArray(features)).toBe(true)
    // The seeded fixture lives under tasks_test_fixture/, not features/
    expect(features.some((f: { id: string }) => f.id === 'p1_test')).toBe(true)
  })

  it('KANBAN_DISABLE_WORKTREES=true returns a single stub worktree (NOT empty array)', async () => {
    // Empty array would break /api/open's allowlist — every card-open click
    // would 403. The stub keeps the allowlist functional.
    const res = await fetch(`${API_BASE_URL}/api/worktrees`)
    expect(res.status).toBe(200)
    const worktrees = await res.json()
    expect(Array.isArray(worktrees)).toBe(true)
    expect(worktrees).toHaveLength(1)
    expect(worktrees[0]).toMatchObject({
      path: TEST_ROOT,
      branch: 'main',
      name: 'main',
      isCurrent: true,
    })
  })

  it('KANBAN_DISABLE_WORKTREES + /api/open with valid path is NOT 403', async () => {
    // The allowlist must accept paths under the project root even when
    // worktrees are disabled. Anything other than 403 means the allowlist
    // matched (200 = cursor opened, 500 = cursor CLI missing on this machine).
    const filePath = join(TEST_ROOT, TEST_FEATURES_DIR_NAME, 'p1_test.md')
    const res = await fetch(`${API_BASE_URL}/api/open`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: filePath }),
    })
    expect(res.status).not.toBe(403)
  })

  it('GET /api/config exposes runtime config to clients', async () => {
    const res = await fetch(`${API_BASE_URL}/api/config`)
    expect(res.status).toBe(200)
    const cfg = await res.json()
    expect(cfg.featuresDir).toBe(TEST_FEATURES_DIR_NAME)
    expect(cfg.disableWorktrees).toBe(true)
    expect(cfg.hidePages).toEqual(expect.arrayContaining(['goals', 'content']))
    expect(cfg.hideColumns).toEqual(['qa'])
    expect(typeof cfg.apiPort).toBe('number')
    expect(typeof cfg.frontendPort).toBe('number')
  })

  it('hidden goals page: GET /api/goals-strategic returns 404', async () => {
    const res = await fetch(`${API_BASE_URL}/api/goals-strategic`)
    expect(res.status).toBe(404)
  })

  it('hidden goals page: PATCH /api/goals-strategic/0 returns 404 (prevents stale-client writes)', async () => {
    const res = await fetch(`${API_BASE_URL}/api/goals-strategic/0`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ done: true }),
    })
    expect(res.status).toBe(404)
  })

  it('hidden content page: GET /api/articles returns 404', async () => {
    const res = await fetch(`${API_BASE_URL}/api/articles`)
    expect(res.status).toBe(404)
  })
})
