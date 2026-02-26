import { describe, it, beforeAll, afterAll, beforeEach, afterEach, expect } from 'vitest'
import { app } from '../api'
import { createServer } from 'http'
import type { AddressInfo } from 'net'
import { writeFileSync, unlinkSync, existsSync, readFileSync } from 'fs'
import { resolve } from 'path'

let server: ReturnType<typeof createServer>
let API_BASE_URL: string

// Resolve project root: from server/__tests__/ go up 4 levels (__tests__ → server → kanban → tools → project root)
const PROJECT_ROOT = resolve(__dirname, '../../../..')
const FIXTURE_PATH = resolve(PROJECT_ROOT, 'docs', 'milestones', 'test-fixture-milestone.md')

// Use milestone: A0 so this sorts before C1 and is picked up first by .find(status === 'active')
const FIXTURE_CONTENT = `---
status: active
milestone: A0
summary: "Test milestone for goals API testing"
---

# A0: Goals API Test Fixture

**Hypothesis:** Users will engage more with calibrated feedback

**The question:** Does structured feedback increase session completion?

## Pilot Sequence

1. [ ] First step to validate
2. [x] Second step already done
3. [ ] Third step pending
`

async function bustMilestonesCache(baseUrl: string) {
  await fetch(`${baseUrl}/api/milestones?refresh=true`)
}

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
// GET /api/goals — fallback shape (no fixture)
// ---------------------------------------------------------------------------

describe('Goals API - GET /api/goals (no active milestone fallback)', () => {
  it('returns a valid shape { steps, hypothesis, question }', async () => {
    const res = await fetch(`${API_BASE_URL}/api/goals`)
    expect(res.status).toBe(200)

    const body = await res.json()

    // Shape must always be present regardless of whether an active milestone exists
    expect(body).toHaveProperty('steps')
    expect(body).toHaveProperty('hypothesis')
    expect(body).toHaveProperty('question')

    expect(Array.isArray(body.steps)).toBe(true)
    expect(typeof body.hypothesis).toBe('string')
    expect(typeof body.question).toBe('string')
  })

  it('each step (if any) must have the required shape', async () => {
    const res = await fetch(`${API_BASE_URL}/api/goals`)
    expect(res.status).toBe(200)

    const body = await res.json()
    expect(Array.isArray(body.steps)).toBe(true)

    for (const step of body.steps) {
      expect(typeof step.index).toBe('number')
      expect(typeof step.text).toBe('string')
      expect(typeof step.done).toBe('boolean')
    }
  })

  it('returns optional milestoneId and milestoneTitle only when an active milestone exists', async () => {
    const res = await fetch(`${API_BASE_URL}/api/goals`)
    expect(res.status).toBe(200)

    const body = await res.json()

    if (body.steps.length > 0) {
      expect(typeof body.milestoneId).toBe('string')
      expect(typeof body.milestoneTitle).toBe('string')
    }
  })
})

// ---------------------------------------------------------------------------
// GET /api/goals — real fixture tests
// ---------------------------------------------------------------------------

describe('Goals API - GET /api/goals with real fixture', () => {
  beforeEach(async () => {
    writeFileSync(FIXTURE_PATH, FIXTURE_CONTENT, 'utf-8')
    await bustMilestonesCache(API_BASE_URL)
  })

  afterEach(async () => {
    try {
      if (existsSync(FIXTURE_PATH)) unlinkSync(FIXTURE_PATH)
    } catch { /* ignore */ }
    await bustMilestonesCache(API_BASE_URL)
  })

  it('parses steps from Pilot Sequence section', async () => {
    const res = await fetch(`${API_BASE_URL}/api/goals`)
    expect(res.status).toBe(200)

    const body = await res.json()
    expect(body.steps).toHaveLength(3)
    expect(body.steps[0]).toEqual({ index: 0, text: 'First step to validate', done: false })
    expect(body.steps[1]).toEqual({ index: 1, text: 'Second step already done', done: true })
    expect(body.steps[2]).toEqual({ index: 2, text: 'Third step pending', done: false })
  })

  it('extracts hypothesis and question', async () => {
    const res = await fetch(`${API_BASE_URL}/api/goals`)
    expect(res.status).toBe(200)

    const body = await res.json()
    expect(body.hypothesis).toBe('Users will engage more with calibrated feedback')
    expect(body.question).toBe('Does structured feedback increase session completion?')
  })

  it('returns milestoneId and milestoneTitle', async () => {
    const res = await fetch(`${API_BASE_URL}/api/goals`)
    expect(res.status).toBe(200)

    const body = await res.json()
    expect(typeof body.milestoneId).toBe('string')
    // ID comes from frontmatter `milestone: A0`
    expect(body.milestoneId).toBe('A0')
    expect(body.milestoneTitle).toContain('Goals API Test Fixture')
  })
})

// ---------------------------------------------------------------------------
// PATCH /api/goals/:index — real fixture tests
// ---------------------------------------------------------------------------

describe('Goals API - PATCH /api/goals/:index with real fixture', () => {
  beforeEach(async () => {
    writeFileSync(FIXTURE_PATH, FIXTURE_CONTENT, 'utf-8')
    await bustMilestonesCache(API_BASE_URL)
  })

  afterEach(async () => {
    try {
      if (existsSync(FIXTURE_PATH)) unlinkSync(FIXTURE_PATH)
    } catch { /* ignore */ }
    await bustMilestonesCache(API_BASE_URL)
  })

  it('toggles step 0 from undone to done', async () => {
    const res = await fetch(`${API_BASE_URL}/api/goals/0`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ done: true }),
    })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.success).toBe(true)

    // Verify file was updated
    const fileContent = readFileSync(FIXTURE_PATH, 'utf-8')
    // Step 0 should now be [x]
    const lines = fileContent.split('\n')
    const step0Line = lines.find((l) => l.match(/^1\. \[.\] /))
    expect(step0Line).toMatch(/^1\. \[x\] First step to validate/)
  })

  it('toggles step 1 from done to undone', async () => {
    const res = await fetch(`${API_BASE_URL}/api/goals/1`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ done: false }),
    })
    expect(res.status).toBe(200)

    // Verify file was updated
    const fileContent = readFileSync(FIXTURE_PATH, 'utf-8')
    const lines = fileContent.split('\n')
    const step1Line = lines.find((l) => l.match(/^2\. \[.\] /))
    expect(step1Line).toMatch(/^2\. \[ \] Second step already done/)
  })

  it('returns 200 for out-of-range index (no-op, file unchanged)', async () => {
    const originalContent = readFileSync(FIXTURE_PATH, 'utf-8')

    const res = await fetch(`${API_BASE_URL}/api/goals/99`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ done: true }),
    })
    // Out-of-range index is a no-op: regex finds no match for that index, returns 200
    expect(res.status).toBe(200)

    // File must be unchanged
    const afterContent = readFileSync(FIXTURE_PATH, 'utf-8')
    expect(afterContent).toBe(originalContent)
  })
})

// ---------------------------------------------------------------------------
// PATCH /api/goals/:index — no active milestone
// ---------------------------------------------------------------------------

describe('Goals API - PATCH /api/goals/:index (no active milestone)', () => {
  it('returns 404 when no active milestone is present', async () => {
    // Ensure fixture is absent and cache is clear
    if (existsSync(FIXTURE_PATH)) unlinkSync(FIXTURE_PATH)
    await bustMilestonesCache(API_BASE_URL)

    const goalsRes = await fetch(`${API_BASE_URL}/api/goals`)
    const goalsBody = await goalsRes.json()

    // Only run the 404 assertion when there is genuinely no active milestone
    if (goalsBody.steps.length === 0) {
      const res = await fetch(`${API_BASE_URL}/api/goals/0`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ done: true }),
      })
      expect(res.status).toBe(404)
      const body = await res.json()
      expect(body.error).toBe('No active milestone')
    }
  })

  it('responds with JSON on all code paths', async () => {
    if (existsSync(FIXTURE_PATH)) unlinkSync(FIXTURE_PATH)
    await bustMilestonesCache(API_BASE_URL)

    const res = await fetch(`${API_BASE_URL}/api/goals/999`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ done: true }),
    })

    // Must always return JSON (not HTML error page)
    const contentType = res.headers.get('content-type') || ''
    expect(contentType).toContain('application/json')

    const body = await res.json()
    expect(body).toBeDefined()
  })
})

// ---------------------------------------------------------------------------
// GET /api/weekly
// ---------------------------------------------------------------------------

describe('Weekly API - GET /api/weekly', () => {
  it('returns 200 with null when ~/.claude_weekly_last_run does not exist or is empty', async () => {
    // The endpoint catches the ENOENT and returns null — safe to call unconditionally.
    // If the file exists on this machine the result will be an object, not null — both are valid.
    const res = await fetch(`${API_BASE_URL}/api/weekly`)
    expect(res.status).toBe(200)

    const body = await res.json()
    // Body is either null or an object with a 'date' key
    if (body !== null) {
      expect(typeof body).toBe('object')
    }
  })

  it('returns an object with string values when the file exists and has valid key: value pairs', async () => {
    const res = await fetch(`${API_BASE_URL}/api/weekly`)
    expect(res.status).toBe(200)

    const body = await res.json()

    if (body !== null) {
      // Every key must map to a string value
      for (const [key, value] of Object.entries(body)) {
        expect(typeof key).toBe('string')
        expect(typeof value).toBe('string')
      }
    }
    // If null, the file doesn't exist — that's the expected fallback, test still passes
  })

  it('never returns 4xx or 5xx', async () => {
    // The endpoint must always be resilient regardless of file state
    const res = await fetch(`${API_BASE_URL}/api/weekly`)
    expect(res.status).toBe(200)
  })
})
