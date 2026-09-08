import { describe, it, beforeAll, afterAll, expect } from 'vitest'
import { app } from '../api'
import { createServer } from 'http'
import type { AddressInfo } from 'net'

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
// GET /api/goals — fallback shape
//
// Milestone-based goals were removed in 88f5769b6; /api/goals is now a stable
// empty shape. The real-fixture describes that used to sit below this one wrote
// docs/milestones/test-fixture-milestone.md — a directory that same commit
// deleted — so they ENOENT'd on every run. They tested nothing and are gone.
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
// PATCH /api/goals/:index — retired endpoint
// ---------------------------------------------------------------------------

describe('Goals API - PATCH /api/goals/:index (retired endpoint)', () => {
  // Milestone-based goals were deleted in 88f5769b6 (2026-03-21, "remove
  // milestones/workstreams"). PATCH /api/goals/:index is a permanent 404 that
  // points callers at /api/goals-strategic. This pins that, so the endpoint
  // cannot quietly come back to life or start returning HTML.
  it('always returns 404 naming the strategic-goals replacement', async () => {
    const res = await fetch(`${API_BASE_URL}/api/goals/0`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ done: true }),
    })

    expect(res.status).toBe(404)
    const body = await res.json()
    expect(body.error).toContain('goals-strategic')
  })

  it('responds with JSON on all code paths', async () => {
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
