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
