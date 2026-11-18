// P1705 section C: the plugin runs the check in a child process, never blocks, and skips when it should.
import { describe, it, expect, afterAll } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { runFunctionsCheck, testFunctionsCheckPlugin } from '../dev/test-functions-plugin'
import { FUNCTIONS_CHECK_EVENT, FUNCTIONS_CHECK_REQUEST, toState } from '../dev/functions-check-state'

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'p1705-plugin-'))
afterAll(() => fs.rmSync(dir, { recursive: true, force: true }))
const stub = (name: string, body: string) => {
  const f = path.join(dir, name)
  fs.writeFileSync(f, `#!/bin/bash\n${body}\n`)
  return f
}

describe('runFunctionsCheck', () => {
  it('a stub that sleeps past the deadline yields unknown', async () => {
    const s = await runFunctionsCheck({
      repoDir: dir,
      env: { PATH: process.env.PATH, CP_BRANCH_FUNCTIONS_CHECK: stub('sleep.sh', 'sleep 30'), P1705_FUNCTIONS_CHECK_TIMEOUT_MS: '300' },
    })
    expect(s.kind).toBe('unknown')
    expect(s.reason).toMatch(/deadline/)
  }, 10_000)
  it('a stub that matches yields match', async () => {
    const s = await runFunctionsCheck({
      repoDir: dir,
      env: { PATH: process.env.PATH, CP_BRANCH_FUNCTIONS_CHECK: stub('match.sh', 'echo "match: 2 file(s)"; echo "STARTED: 123"') },
    })
    expect(s.kind).toBe('match')
  })
  it('a stub that differs (exit 1) yields differs', async () => {
    const s = await runFunctionsCheck({
      repoDir: dir,
      env: { PATH: process.env.PATH, CP_BRANCH_FUNCTIONS_CHECK: stub('differs.sh', 'echo "differs: fn-a (server has feature/x from now)"; echo "STARTED: 123"; echo "  scripts/selfhosted/deploy-functions.sh fn-a"; exit 1') },
    })
    expect(s.kind).toBe('differs')
    expect(s.functions).toEqual(['fn-a'])
  })
})

function fakeServer() {
  const sent: unknown[] = []
  const handlers: Record<string, (data?: unknown, client?: unknown) => void> = {}
  return {
    sent,
    handlers,
    server: {
      ws: { send: (m: unknown) => sent.push(m), on: (e: string, cb: (data?: unknown, client?: unknown) => void) => { handlers[e] = cb } },
      httpServer: null,
    },
  }
}
const configure = (p: ReturnType<typeof testFunctionsCheckPlugin>, server: unknown) =>
  (p.configureServer as unknown as (s: unknown) => void)(server)
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))

describe('testFunctionsCheckPlugin', () => {
  it('serve only', () => expect(testFunctionsCheckPlugin({ repoDir: dir }).apply).toBe('serve'))

  it.each([
    ['VITEST set', { VITEST: 'true' }],
    ['Playwright marker set', { P1705_SKIP_FUNCTIONS_CHECK: '1' }],
    ['load driver', { E2E_LOADTEST: '1' }],
  ])('runs nothing when %s', async (_n, env) => {
    const f = fakeServer(); let ran = 0
    configure(testFunctionsCheckPlugin({ repoDir: dir, env, run: async () => { ran++; return toState({ status: 0, stdout: '', now: 0 }) }, isOnline: async () => true }), f.server)
    await wait(50)
    expect(ran).toBe(0)
    expect(f.sent).toEqual([])
  })

  it('runs nothing when offline, but tells the page it is unknown (never silence)', async () => {
    const f = fakeServer(); let ran = 0
    configure(testFunctionsCheckPlugin({ repoDir: dir, env: {}, run: async () => { ran++; return toState({ status: 0, stdout: '', now: 0 }) }, isOnline: async () => false }), f.server)
    await wait(50)
    expect(ran).toBe(0)
    expect(f.sent).toHaveLength(1)
    const data = (f.sent[0] as { data: { kind: string; reason: string } }).data
    expect(data.kind).toBe('unknown')
    expect(data.reason).toMatch(/offline/)
    // A page that loads later and asks gets the same answer.
    const replies: unknown[] = []
    f.handlers[FUNCTIONS_CHECK_REQUEST](undefined, { send: (event: string, d: unknown) => replies.push({ event, d }) })
    expect(replies).toHaveLength(1)
  })

  it('runs in the background and pushes the result on the dev channel, and answers a late page that asks', async () => {
    const f = fakeServer()
    const state = toState({ status: 0, stdout: 'match: 1 file(s)\nSTARTED: 5\n', now: 1 })
    configure(testFunctionsCheckPlugin({ repoDir: dir, env: {}, run: async () => state, isOnline: async () => true }), f.server)
    await wait(50)
    expect(f.sent).toEqual([{ type: 'custom', event: FUNCTIONS_CHECK_EVENT, data: state }])
    // The banner module loads after the page's dev client has connected, so a replay on connect is
    // lost; the page asks once it is listening, and only that page is answered.
    const replies: unknown[] = []
    f.handlers[FUNCTIONS_CHECK_REQUEST](undefined, { send: (event: string, data: unknown) => replies.push({ event, data }) })
    expect(replies).toEqual([{ event: FUNCTIONS_CHECK_EVENT, data: state }])
    expect(f.sent).toHaveLength(1)
  })

  it('a page that asks before any result exists gets nothing yet', async () => {
    const f = fakeServer()
    configure(testFunctionsCheckPlugin({ repoDir: dir, env: {}, run: () => new Promise(() => {}), isOnline: async () => true }), f.server)
    const replies: unknown[] = []
    f.handlers[FUNCTIONS_CHECK_REQUEST](undefined, { send: (event: string, data: unknown) => replies.push({ event, data }) })
    expect(replies).toEqual([])
  })
})
