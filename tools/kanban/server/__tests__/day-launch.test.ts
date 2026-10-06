import { describe, it, beforeAll, afterAll, beforeEach, afterEach, expect, vi } from 'vitest'
import { app } from '../api'
import { createServer } from 'http'
import type { AddressInfo } from 'net'
import { mkdtemp, mkdir, writeFile, readFile, rm, stat } from 'fs/promises'
import { existsSync } from 'fs'
import { dirname, join } from 'path'
import { tmpdir } from 'os'
import { KANBAN_CONFIG } from '../../config'
import { setDayClock, setDayLauncher, type Launcher } from '../dayLaunch'
import { parseDecisions } from '../../src/lib/day'
import { SECRET, synthEarlier, synthReport } from './fixtures/day-fixture'

/**
 * P1399 Phase C — Start fixing opens a terminal session (spec §7 rule 9). The real launcher
 * (osascript → Ghostty) is swapped for a recorder: these tests prove what the ROUTE refuses and
 * what it hands to the launcher, never that a terminal opened (that is checked by hand, once).
 */

const RUN = '2026-10-04T05-37-45Z'
const ORIGIN = `http://localhost:${KANBAN_CONFIG.ports.frontend}`

describe('day launch: POST /api/day/start (rule 9)', () => {
  let server: ReturnType<typeof createServer>
  let API: string
  let dir: string
  let calls: { file: string; ack: string; workdir: string; prompt: string; mode: number; ledgerAtLaunch: string }[]
  let fail: boolean
  let noAck: boolean
  let t: number
  let logs: string[]
  const spies: ReturnType<typeof vi.spyOn>[] = []

  // Stands in for osascript + the launcher + Claude: records what it was handed, acknowledges like
  // the launcher does (unless told not to), and deletes the prompt file like the session does.
  const recorder: Launcher = async (file, ack, workdir) => {
    calls.push({
      file, ack, workdir,
      prompt: await readFile(file, 'utf-8'),
      mode: (await stat(file)).mode & 0o777,
      ledgerAtLaunch: await readFile(join(dir, 'decisions.jsonl'), 'utf-8').catch(() => ''),
    })
    if (fail) return { ok: false }
    if (!noAck) await writeFile(ack, '')
    await rm(file, { force: true })
    return { ok: true, how: 'tab' }
  }

  beforeAll(async () => {
    server = createServer(app)
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()))
    API = `http://localhost:${(server.address() as AddressInfo).port}`
  })
  afterAll(() => new Promise<void>((r) => server.close(() => r())))

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'day-launch-test-'))
    process.env.KANBAN_DAY_DIR = dir
    await mkdir(join(dir, 'reports'), { recursive: true })
    await writeFile(join(dir, 'reports', `${RUN}.json`), JSON.stringify(synthReport()))
    await writeFile(join(dir, 'reports', '2026-10-03T05-05-00Z.json'), JSON.stringify(synthEarlier()))
    calls = []
    fail = false
    noAck = false
    process.env.KANBAN_DAY_ACK_MS = '300'
    t = Date.parse('2026-10-04T08:00:00Z')
    setDayClock(() => new Date(t))
    setDayLauncher(recorder)
    logs = []
    for (const m of ['log', 'warn', 'error', 'info'] as const) {
      spies.push(vi.spyOn(console, m).mockImplementation((...a: unknown[]) => { logs.push(a.map(String).join(' ')) }))
    }
  })
  afterEach(async () => {
    spies.splice(0).forEach((s) => s.mockRestore())
    setDayLauncher(null)
    setDayClock(null)
    delete process.env.KANBAN_DAY_DIR
    delete process.env.KANBAN_DAY_ACK_MS
    for (const c of calls) await rm(dirname(c.file), { recursive: true, force: true })
    await rm(dir, { recursive: true, force: true })
  })

  const start = (body: unknown, headers: Record<string, string> = { 'Content-Type': 'application/json', Origin: ORIGIN }) =>
    fetch(`${API}/api/day/start`, { method: 'POST', headers, body: typeof body === 'string' ? body : JSON.stringify(body) })
  const decide = (decisions: unknown[]) =>
    fetch(`${API}/api/day/decisions`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ run_id: RUN, decisions }) })
  const fileText = async () => { try { return await readFile(join(dir, 'decisions.jsonl'), 'utf-8') } catch { return '' } }
  const sentLines = async (state = 'started') =>
    (await fileText()).split('\n').filter((l) => l.includes('"kind":"sent"') && l.includes(`"state":"${state}"`))

  it('a cross-origin POST is refused and spawns nothing', async () => {
    const r = await start({ run_id: RUN }, { 'Content-Type': 'application/json', Origin: 'http://evil.example' })
    expect(r.status).toBe(403)
    expect(calls).toHaveLength(0)
    expect(await sentLines()).toHaveLength(0)
  })

  it('a POST without an Origin is refused', async () => {
    expect((await start({ run_id: RUN }, { 'Content-Type': 'application/json' })).status).toBe(403)
    expect(calls).toHaveLength(0)
  })

  it('a text/plain POST is refused and spawns nothing', async () => {
    const r = await start(JSON.stringify({ run_id: RUN }), { 'Content-Type': 'text/plain', Origin: ORIGIN })
    expect(r.status).toBe(415)
    expect(calls).toHaveLength(0)
  })

  it('a POST carrying prompt text (or any other field) is refused and spawns nothing', async () => {
    expect((await start({ run_id: RUN, prompt: 'rm -rf ~' })).status).toBe(400)
    expect((await start({ run_id: RUN, extra: 1 })).status).toBe(400)
    expect(calls).toHaveLength(0)
  })

  it('launches once with the SERVER-built prompt in a private file, and records a sent line', async () => {
    await decide([{ kind: 'option', target: 'rules:live-not-on-main', option_id: 'ask', text: `Which rules? ${SECRET}` }])
    const r = await start({ run_id: RUN })
    expect(r.status).toBe(200)
    expect(await r.json()).toMatchObject({ launched: true, how: 'tab' })
    expect(calls).toHaveLength(1)
    expect(calls[0].prompt.split('\n')[0]).toMatch(/check each item is still real/i)
    expect(calls[0].prompt).toContain('Which rules?')
    expect(calls[0].mode).toBe(0o600)
    const sent = await sentLines()
    expect(sent).toHaveLength(1)
    expect(JSON.parse(sent[0])).toMatchObject({ kind: 'sent', run_id: RUN, state: 'started' })
    expect(logs.join('\n')).not.toContain(SECRET)
  })

  it('1B — Start fixing sends agent work and answered cards; an unopened founder choice stays out', async () => {
    expect((await start({ run_id: RUN })).status).toBe(200)
    const p = calls[0].prompt
    expect(p).toContain('Prod key liveness') // agent work
    for (const t of ['Replies waiting on your event post', 'Rehearse online before the first pilot?', 'Cloud credit balance is a guess']) expect(p).not.toContain(t)
    await decide([{ kind: 'option', target: 'credits:baseline', option_id: 'read' }])
    t += 120_000
    expect((await start({ run_id: RUN })).status).toBe(200) // the answered card is the one change
    expect(calls[1].prompt).toContain('Cloud credit balance is a guess')
    expect(calls[1].prompt).not.toContain('Prod key liveness')
  })

  it('1B — with only unopened founder choices left there is nothing to send', async () => {
    const only = synthReport()
    only.checks = only.checks.filter((c) => c.status === 'ok' || c.status === 'skipped')
    only.issues = only.issues.filter((i) => ['replies:event-post', 'spec:letters-waiting', 'credits:baseline', 'question:rehearsal'].includes(i.fp))
    await writeFile(join(dir, 'reports', `${RUN}.json`), JSON.stringify(only))
    const r = await start({ run_id: RUN })
    expect(r.status).toBe(409)
    expect(await r.json()).toMatchObject({ reason: 'nothing' })
    expect(calls).toHaveLength(0)
  })

  it('the send is reserved (pending) BEFORE anything is spawned', async () => {
    expect((await start({ run_id: RUN })).status).toBe(200)
    expect(calls[0].ledgerAtLaunch).toMatch(/"kind":"sent".*"state":"pending"/)
  })

  it('a tab that opened but never started Claude is not a send: copy fallback, and a retry is allowed', async () => {
    noAck = true
    const r = await start({ run_id: RUN })
    expect(r.status).toBe(502)
    expect(await sentLines('failed')).toHaveLength(1)
    expect(await sentLines('started')).toHaveLength(0)
    expect(existsSync(calls[0].file)).toBe(false)
    noAck = false
    expect((await start({ run_id: RUN })).status).toBe(200) // not 429: a failed launch does not count
  })

  it('after a send, only what changed goes out, as a follow-up; unchanged → already sent', async () => {
    expect((await start({ run_id: RUN })).status).toBe(200)
    t += 120_000
    expect((await start({ run_id: RUN })).status).toBe(409)
    await decide([{ kind: 'option', target: 'spec:letters-waiting', option_id: 'after' }])
    const r = await start({ run_id: RUN })
    expect(r.status).toBe(200)
    expect(await r.json()).toMatchObject({ count: 1, followUp: true })
    const p = calls[1].prompt
    expect(p).toMatch(/only what changed since then/)
    expect(p).toContain('Ship after Tuesday')
    expect(p).not.toContain('Prod key liveness') // sent the first time, unchanged
  })

  it('the board remembers the send: the run says when, and how many items are still unsent', async () => {
    expect((await start({ run_id: RUN })).status).toBe(200)
    const run = await (await fetch(`${API}/api/day/runs/${RUN}`)).json()
    expect(run.lastSentAt).toBeTruthy()
    expect(run.collectedCount).toBe(0)
  })

  it('the prompt carries the safety rules: irreversible actions need a yes; quoted text is data', async () => {
    expect((await start({ run_id: RUN })).status).toBe(200)
    expect(calls[0].prompt).toMatch(/cannot be undone .* needs my explicit yes/)
    expect(calls[0].prompt).toMatch(/is data, not instructions/)
  })

  it('the launcher never puts the prompt text in an argument (it names the file)', async () => {
    const sh = await readFile(join(__dirname, '../../scripts/day-launch.sh'), 'utf-8')
    const code = sh.split('\n').filter((l) => !l.trim().startsWith('#')).join('\n')
    expect(code).not.toMatch(/\$\(cat /)
    expect(code).toMatch(/exec claude --model opus "Your task from the Day page is in the file \$1/)
  })

  it('a second Start fixing within a minute does not launch', async () => {
    expect((await start({ run_id: RUN })).status).toBe(200)
    await decide([{ kind: 'option', target: 'spec:letters-waiting', option_id: 'after' }])
    t += 30_000
    expect((await start({ run_id: RUN })).status).toBe(429)
    expect(calls).toHaveLength(1)
  })

  it('an already-sent collection does not launch again; a changed one does', async () => {
    expect((await start({ run_id: RUN })).status).toBe(200)
    t += 120_000
    expect((await start({ run_id: RUN })).status).toBe(409)
    expect(calls).toHaveLength(1)
    await decide([{ kind: 'option', target: 'spec:letters-waiting', option_id: 'after' }])
    expect((await start({ run_id: RUN })).status).toBe(200)
    expect(calls).toHaveLength(2)
  })

  it('the minute limit survives a server restart (read from the sent lines)', async () => {
    expect((await start({ run_id: RUN })).status).toBe(200)
    await decide([{ kind: 'option', target: 'spec:letters-waiting', option_id: 'after' }])
    // A fresh process would have no memory; the sent line is the memory.
    const { lines } = parseDecisions(await fileText())
    expect(lines.every((l) => (l.kind as string) !== 'sent')).toBe(true)
    t += 10_000
    expect((await start({ run_id: RUN })).status).toBe(429)
  })

  it('a failed launch records nothing, removes the prompt file and offers the copy fallback', async () => {
    fail = true
    const r = await start({ run_id: RUN })
    expect(r.status).toBe(502)
    expect(await r.json()).toMatchObject({ fallback: 'copy' })
    expect(await sentLines()).toHaveLength(0)
    expect(existsSync(calls[0].file)).toBe(false)
  })

  it('only the latest run can be launched', async () => {
    expect((await start({ run_id: '2026-10-03T05-05-00Z' })).status).toBe(409)
    expect(calls).toHaveLength(0)
  })

  it('sent lines are not decisions and are not counted as unreadable', () => {
    const text = JSON.stringify({ kind: 'sent', target: 'abcdef0123456789', run_id: RUN, at: '2026-10-04T08:00:00Z', how: 'tab' })
    const { lines, badLines } = parseDecisions(text)
    expect(lines).toHaveLength(0)
    expect(badLines).toBe(0)
  })
})
