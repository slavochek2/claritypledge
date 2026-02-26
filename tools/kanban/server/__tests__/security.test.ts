import { describe, it, beforeAll, afterAll, expect } from 'vitest'
import { app } from '../api'
import { createServer } from 'http'
import type { AddressInfo } from 'net'
import { join } from 'path'

let server: ReturnType<typeof createServer>
let API_BASE_URL: string

beforeAll(async () => {
  server = app.listen(0)
  const port = (server.address() as AddressInfo).port
  API_BASE_URL = `http://localhost:${port}`
  await new Promise((r) => setTimeout(r, 50))
})

afterAll(() => {
  server.close()
})

// ---------------------------------------------------------------------------
// Bug 1: Path traversal in /api/open
// ---------------------------------------------------------------------------

describe('Security: /api/open path traversal', () => {
  it('allows opening files inside a real features/ directory', async () => {
    // Get a real feature path dynamically so the test works on any machine
    const featuresRes = await fetch(`${API_BASE_URL}/api/features?refresh=true`)
    const features = await featuresRes.json()

    if (features.length === 0) {
      // No features to test with — skip gracefully
      return
    }

    const realFeaturePath = features[0].path

    const res = await fetch(`${API_BASE_URL}/api/open`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: realFeaturePath }),
    })

    // 200 (cursor opened) or 500 (cursor not in PATH) are both acceptable —
    // what matters is NOT 403 (path check passed)
    expect(res.status).not.toBe(403)
    const body = await res.json()
    expect(body).not.toHaveProperty('error', 'Path not allowed')
  })

  it('rejects a path that starts with "features" string but is not inside features/ dir (path traversal)', async () => {
    // Get actual worktree paths so the test works on any machine
    const wtRes = await fetch(`${API_BASE_URL}/api/worktrees`)
    const worktrees = await wtRes.json()
    const mainWt = worktrees.find((wt: { isCurrent: boolean }) => wt.isCurrent) || worktrees[0]

    // Construct attack path: starts with features string but has evil suffix
    // e.g. /actual/path/features-evil/bad.sh — would pass old check without sep fix
    const traversalPath = join(mainWt.path, 'features-evil', 'bad.sh')

    const res = await fetch(`${API_BASE_URL}/api/open`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: traversalPath }),
    })

    expect(res.status).toBe(403)
    const body = await res.json()
    expect(body.error).toBe('Path not allowed')
  })

  it('rejects path with .. traversal that starts with features/ prefix', async () => {
    // Get actual worktree paths so the test works on any machine
    const wtRes = await fetch(`${API_BASE_URL}/api/worktrees`)
    const worktrees = await wtRes.json()
    const mainWt = worktrees.find((wt: { isCurrent: boolean }) => wt.isCurrent) || worktrees[0]

    // IMPORTANT: do NOT use path.join() here — join() normalizes '..' away before
    // the string reaches the server, so the test would never exercise resolve().
    // Send the raw traversal string exactly as an attacker would in a JSON body.
    const traversalPath = mainWt.path + '/features/../.env.local'

    const res = await fetch(`${API_BASE_URL}/api/open`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: traversalPath }),
    })

    expect(res.status).toBe(403)
  })

  it('rejects absolute paths that are entirely outside all known worktrees', async () => {
    const outsidePath = '/etc/passwd'

    const res = await fetch(`${API_BASE_URL}/api/open`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: outsidePath }),
    })

    expect(res.status).toBe(403)
    const body = await res.json()
    expect(body.error).toBe('Path not allowed')
  })

  it('rejects requests with no path field', async () => {
    const res = await fetch(`${API_BASE_URL}/api/open`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })

    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toBe('Path required')
  })
})

// ---------------------------------------------------------------------------
// Bug 3: CORS origin restriction
// ---------------------------------------------------------------------------

describe('Security: CORS origin restriction', () => {
  it('includes Access-Control-Allow-Origin for requests from http://localhost:9050', async () => {
    const res = await fetch(`${API_BASE_URL}/api/worktrees`, {
      headers: { Origin: 'http://localhost:9050' },
    })

    expect(res.status).toBe(200)
    expect(res.headers.get('access-control-allow-origin')).toBe('http://localhost:9050')
  })

  it('does not echo back Access-Control-Allow-Origin for disallowed origins', async () => {
    const res = await fetch(`${API_BASE_URL}/api/worktrees`, {
      headers: { Origin: 'http://evil.example.com' },
    })

    // Server still responds (CORS header is the mechanism, not a blocker at server level),
    // but the response must NOT include ACAO for the untrusted origin.
    const acao = res.headers.get('access-control-allow-origin')
    expect(acao).not.toBe('http://evil.example.com')
    // Should also not be the wildcard '*'
    expect(acao).not.toBe('*')
  })

  it('does not echo back Access-Control-Allow-Origin for localhost on a different port', async () => {
    const res = await fetch(`${API_BASE_URL}/api/worktrees`, {
      headers: { Origin: 'http://localhost:3000' },
    })

    const acao = res.headers.get('access-control-allow-origin')
    expect(acao).not.toBe('http://localhost:3000')
    expect(acao).not.toBe('*')
  })
})
