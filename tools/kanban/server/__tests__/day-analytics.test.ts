import { describe, it, beforeAll, afterAll, beforeEach, afterEach, expect } from 'vitest'
import { createServer } from 'http'
import type { AddressInfo } from 'net'
import { mkdtemp, rm, writeFile, readFile, stat } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { app } from '../api'
import { KANBAN_CONFIG } from '../../config'
import { NO_CHANGE, NOT_COLLECTED, SECTION_KEYS, gate, percentLabel, emptySections, type RawRead, type StoredRead } from '../../scripts/analytics-gate'
import { check, run } from '../../scripts/weekly-analytics'

const ORIGIN = `http://localhost:${KANBAN_CONFIG.ports.frontend}`

/** A collected read whose rows are all inside the Poisson range. */
const calm = (date = '2026-11-02'): RawRead => {
  const sections = emptySections()
  for (const k of SECTION_KEYS) sections[k] = { reconciled: false, rows: [{ label: `${k} row`, current: 105, previous: 100 }] }
  return { date, status: 'collected', clean_data_since: '2026-11-01', sections, failures: [], firsts: [] }
}
const stored = (r: RawRead, g = gate(r, [], [])): StoredRead => ({ ...r, ...g })

describe('P1640 gate', () => {
  it('an in-range change gives the no-change headline and no insight', () => {
    const g = gate(calm(), [], [])
    expect(g.headline).toBe('No change worth your attention.')
    expect(g.headline).toBe(NO_CHANGE)
    expect(g.insights).toEqual([])
  })

  it('a shift outside the Poisson range on a base of 30+ raises an insight; the same shift under 30 does not', () => {
    const r = calm()
    r.sections.who.rows = [{ label: 'Real visitors', current: 200, previous: 100 }]
    expect(gate(r, [], []).insights.map((i) => i.key)).toEqual(['shift:who:Real visitors:up'])
    r.sections.who.rows = [{ label: 'Real visitors', current: 20, previous: 10 }]
    expect(gate(r, [], []).insights).toEqual([])
  })

  it('durations and rates are not Poisson counts: time and returns never raise a shift', () => {
    const r = calm()
    r.sections.time.rows = [{ label: 'Session length', current: 200, previous: 120 }]
    r.sections.returns.rows = [{ label: 'Return rate', current: 90, previous: 40 }]
    expect(gate(r, [], []).insights).toEqual([])
  })

  it('dismissing a rise does not hide a later collapse', () => {
    const r = calm()
    r.sections.who.rows = [{ label: 'v', current: 50, previous: 200 }]
    expect(gate(r, [], [{ key: 'shift:who:v:up', decision: 'dismiss' }]).insights.map((i) => i.key)).toEqual(['shift:who:v:down'])
  })

  it('a failure cut by the cap is still raised on the next read', () => {
    const r = calm()
    r.failures = ['a', 'b', 'c', 'd'].map((key) => ({ key, label: key, count: 1 }))
    const first = gate(r, [], [])
    expect(first.insights).toHaveLength(3)
    const prior = { ...stored({ ...calm('2026-10-26'), failures: r.failures }), insights: first.insights }
    expect(gate(r, [prior], []).insights.map((i) => i.key)).toContain('failure:d')
  })

  it('a new failure class gives exactly one insight with every field', () => {
    const r = calm()
    r.failures = [{ key: 'magic-link', label: 'Magic link failed', count: 4, link: 'https://example.com/replay/1' }]
    const g = gate(r, [stored(calm('2026-10-26'))], [])
    expect(g.insights).toHaveLength(1)
    const i = g.insights[0]
    expect(i).toMatchObject({ key: 'failure:magic-link', confidence: 'medium', seen_count: 0, pattern: false, link: 'https://example.com/replay/1' })
    for (const f of ['observation', 'numbers', 'base', 'comparison', 'next_step'] as const) expect(i[f].length).toBeGreaterThan(0)
    expect(g.headline).not.toBe(NO_CHANGE)
  })

  it('an undecided failure repeats; a confirmed one does not', () => {
    const r = calm()
    r.failures = [{ key: 'magic-link', label: 'Magic link failed', count: 4 }]
    const prior = { ...stored({ ...calm('2026-10-26'), failures: r.failures }), insights: gate(r, [], []).insights }
    expect(gate(r, [prior], []).insights[0].seen_count).toBe(1)
    expect(gate(r, [prior], [{ key: 'failure:magic-link', decision: 'confirm' }]).insights).toEqual([])
  })

  it('a first the ledger has not seen is raised; one the ledger holds is not', () => {
    const r = calm()
    r.firsts = [{ key: 'first-signup', label: 'First real signup' }]
    expect(gate(r, [], []).insights.map((i) => i.key)).toEqual(['first:first-signup'])
    expect(gate(r, [], [{ key: 'first:first-signup', decision: 'confirm' }]).insights).toEqual([])
  })

  it('priority is failure, then first, then shift; at most three', () => {
    const r = calm()
    r.sections.who.rows = [{ label: 'a', current: 200, previous: 100 }, { label: 'b', current: 300, previous: 100 }]
    r.firsts = [{ key: 'f1', label: 'First one' }]
    r.failures = [{ key: 'x', label: 'X', count: 1 }]
    const keys = gate(r, [], []).insights.map((i) => i.key)
    expect(keys).toEqual(['failure:x', 'first:f1', 'shift:who:a:up'])
  })

  it('a base under 30 shows no percentage', () => {
    expect(percentLabel(20, 10)).toBeNull()
    expect(percentLabel(5, null)).toBeNull()
    expect(percentLabel(60, 30)).toBe('+100%')
    expect(percentLabel(75, 100)).toBe('-25%')
  })

  it('a dismissed key is suppressed; seen_count counts earlier reads and 2 makes a pattern', () => {
    const r = calm()
    r.failures = [{ key: 'k', label: 'K', count: 1 }]
    expect(gate(r, [], [{ key: 'failure:k', decision: 'dismiss' }]).insights).toEqual([])
    const r2 = calm()
    r2.failures = [{ key: 'k2', label: 'K2', count: 1 }]
    const withInsight = (d: string): StoredRead => ({ ...stored(calm(d)), insights: [{ key: 'failure:k2' } as never] })
    const priors = [withInsight('2026-10-12'), withInsight('2026-10-19')]
    const i = gate(r2, priors, []).insights[0]
    expect(i.seen_count).toBe(2)
    expect(i.pattern).toBe(true)
  })

  it('a not-collected read raises nothing and says so', () => {
    const g = gate({ ...calm(), status: 'not-collected', reason: 'mcp down', failures: [{ key: 'z', label: 'Z', count: 9 }] }, [], [])
    expect(g).toEqual({ headline: NOT_COLLECTED, insights: [] })
  })
})

describe('P1640 weekly-analytics CLI', () => {
  let dir: string
  let inputDir: string
  const NOW = new Date('2026-11-06T12:00:00Z')
  const io = () => {
    const l = { out: '', err: '' }
    return { l, io: { out: (s: string) => (l.out += s), err: (s: string) => (l.err += s) } }
  }
  const feed = async (name: string, body: unknown) => {
    const p = join(inputDir, name)
    await writeFile(p, typeof body === 'string' ? body : JSON.stringify(body))
    return p
  }
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'an-dir-'))
    inputDir = await mkdtemp(join(tmpdir(), 'an-in-'))
  })
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
    await rm(inputDir, { recursive: true, force: true })
  })

  it('writes a private read, exits 0, and --check says ok when fresh', async () => {
    const { io: o, l } = io()
    expect(run(['--input', await feed('a.json', calm('2026-11-05')), '--dir', dir], o, NOW)).toBe(0)
    expect(l.out).toContain('collected 2026-11-05')
    expect((await stat(join(dir, 'reads', '2026-11-05.json'))).mode & 0o777).toBe(0o600)
    expect((await stat(dir)).mode & 0o777).toBe(0o700)
    expect(check(dir, NOW)).toEqual({ code: 0, line: 'ok latest read 2026-11-05, 1 days old' })
    const c = io()
    expect(run(['--check', '--dir', dir], c.io, NOW)).toBe(0)
    expect(c.l.out.startsWith('ok ')).toBe(true)
  })

  it('--check: stale, missing and not-collected are problems', async () => {
    expect(check(dir, NOW).line).toBe('problem no weekly read yet')
    const c = io()
    expect(run(['--check', '--dir', dir], c.io, NOW)).toBe(1)
    expect(c.l.out.startsWith('problem ')).toBe(true)

    run(['--input', await feed('old.json', calm('2026-10-25')), '--dir', dir], io().io, NOW)
    expect(check(dir, NOW)).toMatchObject({ code: 1 })
    expect(check(dir, NOW).line).toMatch(/^problem .*12 days old/)

    run(['--input', await feed('nc.json', { ...calm('2026-11-06'), status: 'not-collected', reason: 'mcp down' }), '--dir', dir], io().io, NOW)
    expect(check(dir, NOW)).toMatchObject({ code: 1 })
    expect(check(dir, NOW).line).toMatch(/^problem .*not collected/)
  })

  it('a read exactly 8 days old is stale, 7 is fine', async () => {
    run(['--input', await feed('a.json', calm('2026-10-30')), '--dir', dir], io().io, NOW)
    expect(check(dir, NOW).code).toBe(0)
    expect(check(dir, new Date('2026-11-07T12:00:00Z')).code).toBe(1)
  })

  it('not-collected input exits 3 and writes a not-collected read with the reason', async () => {
    const { io: o } = io()
    expect(run(['--input', await feed('nc.json', { ...calm('2026-11-05'), status: 'not-collected', reason: 'mcp down' }), '--dir', dir], o, NOW)).toBe(3)
    const w = JSON.parse(await readFile(join(dir, 'reads', '2026-11-05.json'), 'utf-8'))
    expect(w).toMatchObject({ status: 'not-collected', reason: 'mcp down', headline: 'Not collected', insights: [] })
  })

  it('invalid input exits 3 and writes a not-collected read', async () => {
    expect(run(['--input', await feed('bad.json', '{not json'), '--dir', dir], io().io, NOW)).toBe(3)
    expect(JSON.parse(await readFile(join(dir, 'reads', '2026-11-06.json'), 'utf-8')).status).toBe('not-collected')
    expect(run(['--input', await feed('bad2.json', { date: '2026-11-05', status: 'collected' }), '--dir', dir], io().io, NOW)).toBe(3)
    expect(JSON.parse(await readFile(join(dir, 'reads', '2026-11-05.json'), 'utf-8')).reason).toBeTruthy()
  })

  it('a week with few users still produces a read', async () => {
    const r = calm('2026-11-05')
    for (const k of SECTION_KEYS) r.sections[k].rows = [{ label: `${k} row`, current: 2, previous: 1 }]
    expect(run(['--input', await feed('few.json', r), '--dir', dir], io().io, NOW)).toBe(0)
    expect(JSON.parse(await readFile(join(dir, 'reads', '2026-11-05.json'), 'utf-8')).headline).toBe(NO_CHANGE)
  })
})

describe('P1640 routes', () => {
  let server: ReturnType<typeof createServer>
  let API: string
  let dir: string
  let dayDir: string
  const NOW = new Date('2026-11-06T12:00:00Z')

  beforeAll(async () => {
    server = createServer(app)
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()))
    API = `http://localhost:${(server.address() as AddressInfo).port}`
  })
  afterAll(() => new Promise<void>((r) => server.close(() => r())))
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'an-routes-'))
    dayDir = await mkdtemp(join(tmpdir(), 'an-day-'))
    process.env.KANBAN_ANALYTICS_DIR = dir
    process.env.KANBAN_DAY_DIR = dayDir
  })
  afterEach(async () => {
    delete process.env.KANBAN_ANALYTICS_DIR
    delete process.env.KANBAN_DAY_DIR
    await rm(dir, { recursive: true, force: true })
    await rm(dayDir, { recursive: true, force: true })
  })

  const input = async (body: unknown) => {
    const p = join(dir, '..', `an-${Math.random().toString(36).slice(2)}.json`)
    await writeFile(p, JSON.stringify(body))
    return p
  }
  const decide = (body: unknown, headers: Record<string, string> = { 'Content-Type': 'application/json', Origin: ORIGIN }) =>
    fetch(`${API}/api/day/analytics/decision`, { method: 'POST', headers, body: typeof body === 'string' ? body : JSON.stringify(body) })
  const withFailure = async (date: string, key = 'magic-link') => {
    const r = calm(date)
    r.failures = [{ key, label: 'Magic link failed', count: 4 }]
    expect(run(['--input', await input(r), '--dir', dir], { out: () => undefined, err: () => undefined }, NOW)).toBe(0)
  }

  it('GET with no read says none', async () => {
    expect(await (await fetch(`${API}/api/day/analytics`)).json()).toEqual({ status: 'none' })
  })

  it('GET returns the latest read and the dismissed keys', async () => {
    await withFailure('2026-11-05')
    expect((await decide({ key: 'failure:magic-link', decision: 'dismiss' })).status).toBe(200)
    const body = await (await fetch(`${API}/api/day/analytics`)).json()
    expect(body.status).toBe('collected')
    expect(body.read.date).toBe('2026-11-05')
    expect(body.dismissed).toEqual(['failure:magic-link'])
  })

  it('a dismissed insight does not reappear on the next weekly read', async () => {
    await withFailure('2026-10-29')
    await decide({ key: 'failure:magic-link', decision: 'dismiss' })
    // a different new failure key the next week still raises; the dismissed key never does
    const next = calm('2026-11-05')
    next.failures = [{ key: 'magic-link', label: 'Magic link failed', count: 9 }]
    expect(run(['--input', await input(next), '--dir', dir], { out: () => undefined, err: () => undefined }, NOW)).toBe(0)
    const body = await (await fetch(`${API}/api/day/analytics`)).json()
    expect(body.read.insights).toEqual([])
    expect(body.read.headline).toBe(NO_CHANGE)
  })

  it('the guard: a bad origin, no origin, text/plain and a stranger key are refused and write nothing', async () => {
    await withFailure('2026-11-05')
    const ledger = () => readFile(join(dir, 'ledger.jsonl'), 'utf-8').catch(() => '')
    expect((await decide({ key: 'failure:magic-link', decision: 'dismiss' }, { 'Content-Type': 'application/json', Origin: 'http://evil.example' })).status).toBe(403)
    expect((await decide({ key: 'failure:magic-link', decision: 'dismiss' }, { 'Content-Type': 'application/json' })).status).toBe(403)
    expect((await decide(JSON.stringify({ key: 'failure:magic-link', decision: 'dismiss' }), { 'Content-Type': 'text/plain', Origin: ORIGIN })).status).toBe(415)
    expect((await decide({ key: 'failure:nope', decision: 'dismiss' })).status).toBe(409)
    expect((await decide({ key: 'failure:magic-link', decision: 'delete' })).status).toBe(400)
    expect(await ledger()).toBe('')
  })

  it('both routes are 404 when the Day page is not enabled', async () => {
    delete process.env.KANBAN_DAY_DIR
    expect((await fetch(`${API}/api/day/analytics`)).status).toBe(404)
    expect((await decide({ key: 'k', decision: 'confirm' })).status).toBe(404)
  })
})
