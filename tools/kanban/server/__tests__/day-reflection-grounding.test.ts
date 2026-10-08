import { describe, it, beforeEach, afterEach, expect } from 'vitest'
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { run as contextRun } from '../../scripts/day-reflection-context'
import { run as checkRun } from '../../scripts/day-reflection-check'
import { parseReport, type DayStatement } from '../../src/lib/day'
import { synthReport } from './fixtures/day-fixture'

/**
 * P1445 B + C: the reflection writer's grounding block, and the checks between its reply and the
 * report. Every text here is invented (public repo): no real decision, conversation or story.
 */

const NOW = '2026-10-08T09:00:00Z'
let root: string
let dayDir: string

/** A stand-in for ~/.agents/bin/hist --jsonl: filters a fixture by the last argument (regex) and --since. */
function fakeHist(turns: object[], exitCode = 0): string {
  const data = join(root, 'turns.json')
  writeFileSync(data, JSON.stringify(turns))
  const bin = join(root, 'hist')
  writeFileSync(
    bin,
    `#!/usr/bin/env node
const a = process.argv.slice(2)
if (${exitCode}) process.exit(${exitCode})
const rx = new RegExp(a[a.length - 1], 'i')
const since = a[a.indexOf('--since') + 1]
const hits = JSON.parse(require('fs').readFileSync(${JSON.stringify(data)}, 'utf-8')).filter((t) => rx.test(t.text) && t.ts.slice(0, 10) >= since)
for (const h of hits) console.log(JSON.stringify(h))
process.exit(hits.length ? 0 : 1)
`
  )
  chmodSync(bin, 0o755)
  return bin
}
const turn = (ts: string, session: string, text: string) => ({ ts, harness: 'claude', cwd: '/x', role: 'user', session, path: `/x/${session}.jsonl`, text })

function cli(fn: typeof contextRun, argv: string[]) {
  let out = ''
  let err = ''
  return fn(argv, { out: (s) => (out += s), err: (s) => (err += s) }).then((code) => ({ code, out, err }))
}
function check(argv: string[], stdin: string) {
  let out = ''
  let err = ''
  return checkRun(argv, stdin, { out: (s) => (out += s), err: (s) => (err += s) }).then((code) => ({ code, out, err }))
}

const CP_LOG = `# Decisions

## 2026-10-07 [process]: Reflection statements are strategy, never task micromanagement
**Decision:** statements never repeat an item already on that day's board.

## 2026-09-01 [product]: Venue partners get a monthly slot
Unrelated to anything below.
`
const PP_LOG = `# Personal decisions

## 2026-03-02 — Small rehearsal evenings rebuild motivation after a shaky event — #events
Decision: after an event that drains motivation, rehearse with a smaller group before the next one.

## 2026-10-06 — Laptop backup moved to a new disk — #infra
Context: the old disk filled up.
`

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'day-ground-'))
  dayDir = join(root, 'day')
  mkdirSync(join(dayDir, 'reports'), { recursive: true })
  writeFileSync(join(root, 'cp.md'), CP_LOG)
  writeFileSync(join(root, 'pp.md'), PP_LOG)
  writeFileSync(join(root, 'findings.txt'), 'Three keys report no billing data\nThe nightly backup is late\n')
  const r = synthReport({ pass_id: '2026-10-07T05-00-00Z', started_at: '2026-10-07T05:00:00Z', reflection: { model: 'm', statements: [{ id: 'r1', text: 'Run fewer public evenings.' }] } })
  writeFileSync(join(dayDir, 'reports', '2026-10-07T05-00-00Z.json'), JSON.stringify(r))
  writeFileSync(
    join(dayDir, 'decisions.jsonl'),
    JSON.stringify({ kind: 'reflection', target: 'r1', run_id: '2026-10-07T05-00-00Z', position: -1, story: 'The evening shook my motivation; the evening felt empty.', at: '2026-10-07T10:00:00Z' }) + '\n'
  )
})
afterEach(() => rmSync(root, { recursive: true, force: true }))

const ctxArgs = (hist: string, extra: string[] = []) => ['--day-dir', dayDir, '--now', NOW, '--decisions', `cp=${join(root, 'cp.md')}`, '--decisions', `pp=${join(root, 'pp.md')}`, '--findings', join(root, 'findings.txt'), '--hist', hist, '--sources-out', join(root, 'sources.json'), ...extra]

describe('P1445 B: the grounding block', () => {
  it('carries the post-event conversation, the dedup rule, an OLDER matching pp decision, every story and the issue cards — each with a citable id', async () => {
    const hist = fakeHist([
      turn('2026-10-07T08:07:49', 'sess-post-event', 'After the evening I want to understand what to maximize here: my motivation, honestly.'),
      turn('2026-10-08T07:00:00', 'sess-infra', 'Fix the backup script please.'),
      turn('2026-10-08T10:00:00', 'sess-later', 'This turn is after the pass ran and must not appear.'),
    ])
    const r = await cli(contextRun, ctxArgs(hist, ['--terms', 'motivation,smaller,event']))
    expect(r.code).toBe(0)
    const L = r.out.split('\n')
    expect(L).toContain('D1 [cp] 2026-10-07 [process]: Reflection statements are strategy, never task micromanagement — Decision: statements never repeat an item already on that day\'s board.')
    // the older pp entry is outside the 14-day window but matches the draft's terms
    expect(L.some((l) => /^D\d \[pp\] 2026-03-02 — Small rehearsal evenings rebuild motivation/.test(l))).toBe(true)
    expect(L.some((l) => /^C\d \[2026-10-07 08:07\] .*my motivation/.test(l))).toBe(true)
    expect(r.out).not.toContain('after the pass ran')
    expect(L.some((l) => /^S1 \[2026-10-07 · open · Somewhat disagree\] on "Run fewer public evenings\.": The evening shook my motivation/.test(l))).toBe(true)
    expect(L).toContain('F1 Three keys report no billing data')
    expect(r.out).not.toContain('MISSING')
    const sources = JSON.parse(readFileSync(join(root, 'sources.json'), 'utf-8'))
    expect(sources.D1).toMatchObject({ kind: 'decision', source: 'cp', date: '2026-10-07' })
    expect(Object.values(sources).some((s) => (s as { session?: string }).session === 'sess-post-event')).toBe(true)
  })

  it('a source that cannot be read is named MISSING, never silently empty (pp unreadable, hist failing)', async () => {
    const hist = fakeHist([], 2)
    const r = await cli(contextRun, ['--day-dir', dayDir, '--now', NOW, '--decisions', `pp=${join(root, 'nope.md')}`, '--findings', join(root, 'findings.txt'), '--hist', hist])
    expect(r.code).toBe(0)
    expect(r.out).toContain(`MISSING: pp decisions — ${join(root, 'nope.md')} unreadable`)
    expect(r.out).toContain('MISSING: conversations (last 3 days) — hist recent query failed (exit 2)')
  })

  it('the cap holds for the WHOLE block, keeps a share per class, and counts every fetched turn not shown', async () => {
    const many = Array.from({ length: 60 }, (_, i) => turn(`2026-10-07T0${i % 10}:${String(i).padStart(2, '0')}:00`, `s${i}`, `motivation note ${i}`))
    const r = await cli(contextRun, ctxArgs(fakeHist(many), ['--max-lines', '40', '--terms', 'motivation']))
    expect(r.out.trimEnd().split('\n').length).toBeLessThanOrEqual(40)
    const cov = r.out.split('\n').find((l) => l.startsWith('Coverage:'))!
    expect(cov).toMatch(/conversations \(terms\) \d+ shown, \d+ truncated/)
    expect(cov).toMatch(/issue cards 2 shown/)
    expect(cov).toMatch(/stories 1 shown/)
  })

  it('one session: at most 2 of its turns per pool, newest first, and the hidden ones are counted (Codex review 4)', async () => {
    const one = Array.from({ length: 8 }, (_, i) => turn(`2026-10-07T0${7 - i}:00:00`, 'busy', `motivation turn ${i}`))
    const r = await cli(contextRun, ctxArgs(fakeHist(one), ['--terms', 'motivation']))
    const C = r.out.split('\n').filter((l) => /^C\d/.test(l))
    // 2 from the term pool, 2 more (never the same turn) from the recent pool — newest first, none skipped
    expect(C.map((l) => l.slice(0, 21))).toEqual(['C1 [2026-10-07 07:00]', 'C2 [2026-10-07 06:00]', 'C3 [2026-10-07 05:00]', 'C4 [2026-10-07 04:00]'])
    expect(r.out).toMatch(/conversations \(terms\) 2 shown, 6 truncated/)
    expect(r.out).toMatch(/conversations \(last 3 days\) 2 shown, 4 truncated/)
  })
})

/** A writer reply in the shape the brief asks for. */
const reply = (statements: object[]) => `MODEL: claude-opus-test\n\`\`\`json\n${JSON.stringify({ statements })}\n\`\`\``
const agent = (sources: object[], position = -2) => ({ position, story: 'Quoted fact: the log says so. My connection: this pattern repeats. Speculation: it may pass.', sources })
const three = (sources: object[]) => [
  { text: 'Rehearse with a small group before the next public evening.', agent: agent(sources) },
  { text: 'Stop building tools while waiting to feel ready.', agent: agent(sources, 1) },
  { text: 'Charge for the second session.', agent: agent(sources, 0) },
]

describe('P1445 C: --parse', () => {
  it('a well-formed reply → ids r1…, the agent named Slava with its own position, story and sources', async () => {
    const r = await check(['--parse'], reply(three([{ ref: 'D1', quote: 'never task micromanagement' }])))
    expect(r.code).toBe(0)
    const o = JSON.parse(r.out)
    expect(o.model).toBe('claude-opus-test')
    expect(o.statements.map((s: { id: string }) => s.id)).toEqual(['r1', 'r2', 'r3'])
    expect(o.statements[1].agent).toMatchObject({ name: 'Slava', position: 1, sources: [{ ref: 'D1', quote: 'never task micromanagement' }] })
  })

  it.each([
    ['no source', three([]), 'r1: the story cites no source'],
    ['a source without a quote', three([{ ref: 'D1', quote: '  ' }]), 'r1: source D1 has no quote'],
    ['a position outside the scale', [{ text: 'a', agent: { ...agent([{ ref: 'D1', quote: 'a quoted phrase' }]), position: 4 } }, ...three([{ ref: 'D1', quote: 'a quoted phrase' }]).slice(1)], 'r1: agent position must be an integer from -3 to 3'],
    ['two statements', three([{ ref: 'D1', quote: 'a quoted phrase' }]).slice(1), 'need 3 to 5 statements, got 2'],
  ])('refuses %s (exit 1, the reason on stderr)', async (_n, st, why) => {
    const r = await check(['--parse'], reply(st as object[]))
    expect(r.code).toBe(1)
    expect(r.out).toBe('')
    expect(r.err).toBe(`day-reflection-check: ${why}\n`)
  })
})

describe('P1445 C: --quotes (the mechanical quote check)', () => {
  async function parsedWith(sources: object[]) {
    return (await check(['--parse'], reply(three(sources)))).out
  }
  async function grounding(turns: object[]) {
    const hist = fakeHist(turns)
    await cli(contextRun, ctxArgs(hist, ['--terms', 'motivation']))
    return { hist, sources: JSON.parse(readFileSync(join(root, 'sources.json'), 'utf-8')) as Record<string, { kind: string; session?: string }> }
  }

  it('quotes found verbatim in each kind of source pass, and refs become stable references', async () => {
    const { hist, sources } = await grounding([turn('2026-10-07T08:07:49', 'sess-post-event', 'what to maximize here: my motivation, honestly.')])
    const c = Object.keys(sources).find((k) => sources[k].session === 'sess-post-event')!
    const s = Object.keys(sources).find((k) => sources[k].kind === 'story')!
    const parsed = await parsedWith([
      { ref: 'D1', quote: "statements never repeat an item already on that day's board" },
      { ref: c, quote: 'my motivation, honestly' },
      { ref: s, quote: 'shook my motivation' },
      { ref: 'F1', quote: 'report no billing data' },
    ])
    const r = await check(['--quotes', '--sources', join(root, 'sources.json'), '--day-dir', dayDir, '--hist', hist], parsed)
    expect(r.err).toBe('')
    expect(r.code).toBe(0)
    const got = JSON.parse(r.out).statements[0].agent.sources
    // the grounding id stays (a merged file can be checked again); the stable reference is beside it
    expect(got.map((x: { ref: string }) => x.ref)).toEqual(['D1', c, s, 'F1'])
    expect(got.map((x: { source: string }) => x.source)).toEqual([
      'cp decisions 2026-10-07 [process]: Reflection statements are strategy, never task micromanagement',
      'conversation sess-post-event at 2026-10-07T08:07:49',
      'founder story 2026-10-07T05-00-00Z/r1',
      'issue card: Three keys report no billing data',
    ])
  })

  it('FAILING CONTROL — a quote the source does not contain, and an id the block never had → exit 1, one line per miss', async () => {
    const { hist } = await grounding([turn('2026-10-07T08:07:49', 'sess-post-event', 'my motivation, honestly.')])
    const parsed = await parsedWith([
      { ref: 'D1', quote: 'statements must always repeat the board' },
      { ref: 'D99', quote: 'anything at all here' },
    ])
    const r = await check(['--quotes', '--sources', join(root, 'sources.json'), '--day-dir', dayDir, '--hist', hist], parsed)
    expect(r.code).toBe(1)
    expect(r.out).toBe('')
    const lines = r.err.split('\n').filter(Boolean)
    expect(lines).toContain('r1: quote from D1 not found in that source: "statements must always repeat the board"')
    expect(lines).toContain('r1: quote from D99 cites an id the grounding block never had: "anything at all here"')
  })

  it('a conversation the history tool cannot reach is "unavailable", not "not found"', async () => {
    const { sources } = await grounding([turn('2026-10-07T08:07:49', 'sess-post-event', 'my motivation, honestly.')])
    const c = Object.keys(sources).find((k) => sources[k].session === 'sess-post-event')!
    const parsed = await parsedWith([{ ref: c, quote: 'my motivation, honestly' }])
    const r = await check(['--quotes', '--sources', join(root, 'sources.json'), '--day-dir', dayDir, '--hist', fakeHist([], 2)], parsed)
    expect(r.code).toBe(1)
    expect(r.err).toContain(`r1: quote from ${c} unavailable (hist failed (exit 2))`)
  })
})

describe('P1445 C: --finalize (the checker verdicts; it re-verifies every kept quote)', () => {
  let hist: string
  let fin: (v: object) => string[]
  async function quoted(sources: object[] = [{ ref: 'F1', quote: 'report no billing data' }]) {
    hist = fakeHist([])
    await cli(contextRun, ctxArgs(hist))
    return (await check(['--quotes', '--sources', join(root, 'sources.json'), '--day-dir', dayDir, '--hist', hist], (await check(['--parse'], reply(three(sources)))).out)).out
  }
  beforeEach(() => {
    fin = (v: object) => {
      writeFileSync(join(root, 'verdicts.json'), JSON.stringify(v))
      return ['--finalize', '--verdicts', join(root, 'verdicts.json'), '--sources', join(root, 'sources.json'), '--day-dir', dayDir, '--hist', hist]
    }
  })

  it('FAILING CONTROL — a statement that fails twice is dropped and named; the rest carry checker "pass" and stable refs', async () => {
    const q = await quoted()
    const r = await check(fin({ r1: ['pass'], r2: ['fail: cites nothing about tools', 'fail: still unsupported'], r3: ['fail: duplicate of a card', 'pass'] }), q)
    expect(r.code).toBe(0)
    expect(r.err).toBe('dropped r2 after two failed checks: "Stop building tools while waiting to feel ready."\n')
    const o = JSON.parse(r.out)
    expect(o.statements.map((s: { id: string }) => s.id)).toEqual(['r1', 'r3'])
    expect(o.statements.every((s: { agent: { checker: string } }) => s.agent.checker === 'pass')).toBe(true)
    expect(o.statements[0].agent.sources).toEqual([{ ref: 'issue card: Three keys report no billing data', quote: 'report no billing data' }])
  })

  it('never published unchecked: one fail with no second check, or no verdict → exit 2', async () => {
    const q = await quoted()
    const once = await check(fin({ r1: ['pass'], r2: ['fail'], r3: ['pass'] }), q)
    expect(once.code).toBe(2)
    expect(once.err).toContain('r2 failed the checker once and was not checked again after a rewrite')
    const none = await check(fin({ r1: ['pass'], r3: ['pass'] }), q)
    expect(none.code).toBe(2)
    expect(none.err).toContain('r2 has no checker verdict')
  })

  it('a third round is refused (Codex review 2: fail, fail, pass must not survive)', async () => {
    const r = await check(fin({ r1: ['fail', 'fail', 'pass'], r2: ['pass'], r3: ['pass'] }), await quoted())
    expect(r.code).toBe(2)
    expect(r.err).toContain('r1 has 3 verdicts: a statement gets at most two checker rounds')
  })

  it('a forged "source" does not pass: the quote is checked again (Codex review 1)', async () => {
    const o = JSON.parse(await quoted())
    o.statements[0].agent.sources = [{ ref: 'F1', quote: 'Fabricated source text here', source: 'forged stable reference' }]
    const r = await check(fin({ r1: ['pass'], r2: ['pass'], r3: ['pass'] }), JSON.stringify(o))
    expect(r.code).toBe(2)
    expect(r.err).toContain('a passed statement has a quote that does not verify: r1: quote from F1 not found')
    expect(r.out).toBe('')
  })

  it('every statement dropped → exit 1, nothing recorded', async () => {
    const r = await check(fin({ r1: ['fail', 'fail'], r2: ['fail', 'fail'], r3: ['fail', 'fail'] }), await quoted())
    expect(r.code).toBe(1)
    expect(r.out).toBe('')
  })

  it('--lenient: a mechanical miss prints the reflection anyway (it becomes a checker fail); finalize still refuses it as a pass', async () => {
    hist = fakeHist([])
    await cli(contextRun, ctxArgs(hist))
    const parsed = (await check(['--parse'], reply(three([{ ref: 'F1', quote: 'words not in the card' }])))).out
    const r = await check(['--quotes', '--lenient', '--sources', join(root, 'sources.json'), '--day-dir', dayDir, '--hist', hist], parsed)
    expect(r.code).toBe(0)
    expect(r.err).toContain('r1: quote from F1 not found')
    expect(JSON.parse(r.out).statements).toHaveLength(3)
    const f = await check(fin({ r1: ['pass'], r2: ['pass'], r3: ['pass'] }), r.out)
    expect(f.code).toBe(2)
  })
})

describe('P1445 C: a quote across markdown in the raw turn is still found (Codex review 6)', () => {
  it('turn "**Run** a smaller event soon", quote "Run a smaller event" → pass', async () => {
    const hist = fakeHist([turn('2026-10-07T08:00:00', 'md', '**Run** a smaller event soon, honestly motivation matters')])
    await cli(contextRun, ctxArgs(hist, ['--terms', 'motivation']))
    const sources = JSON.parse(readFileSync(join(root, 'sources.json'), 'utf-8')) as Record<string, { session?: string }>
    const c = Object.keys(sources).find((k) => sources[k].session === 'md')!
    const parsed = (await check(['--parse'], reply(three([{ ref: c, quote: 'Run a smaller event' }])))).out
    const r = await check(['--quotes', '--sources', join(root, 'sources.json'), '--day-dir', dayDir, '--hist', hist], parsed)
    expect(r.err).toBe('')
    expect(r.code).toBe(0)
  })
})

describe('P1445 C: the report keeps only a checked agent view', () => {
  const statement = (agent: object) => ({ id: 'r1', text: 'A statement.', agent }) as unknown as DayStatement
  const base = { name: 'Slava', position: -2, story: 'A story.', sources: [{ ref: 'issue card: X', quote: 'X' }] }
  it('checker "pass" → shown; no checker, or a bad position → the statement stays, the agent view goes', () => {
    const read = (agent: object) => {
      const p = parseReport(synthReport({ reflection: { model: 'm', statements: [statement(agent)] } }))
      return p.kind === 'ok' ? p.report.reflection?.statements[0] : undefined
    }
    expect(read({ ...base, checker: 'pass' })?.agent).toEqual(base)
    expect(read(base)).toEqual({ id: 'r1', text: 'A statement.' })
    expect(read({ ...base, checker: 'pass', position: 5 })).toEqual({ id: 'r1', text: 'A statement.' })
  })
})

describe('P1445 review fixes: round 2, re-checking, short quotes', () => {
  it('a quote under 3 words is refused at --parse (one letter matched anything before)', async () => {
    const r = await check(['--parse'], reply(three([{ ref: 'F1', quote: 'o' }])))
    expect(r.code).toBe(1)
    expect(r.err).toBe('day-reflection-check: r1: the quote from F1 is under 3 words\n')
  })

  it('a quote must match whole words: "report no bill" is not in "report no billing data"', async () => {
    const hist = fakeHist([])
    await cli(contextRun, ctxArgs(hist))
    const parsed = (await check(['--parse'], reply(three([{ ref: 'F1', quote: 'report no bill' }])))).out
    const r = await check(['--quotes', '--sources', join(root, 'sources.json'), '--day-dir', dayDir, '--hist', hist], parsed)
    expect(r.code).toBe(1)
  })

  it('--rewrite keeps the ids it was asked for, --merge puts them back, and the merged file passes --quotes again', async () => {
    const hist = fakeHist([])
    await cli(contextRun, ctxArgs(hist))
    const q = ['--quotes', '--sources', join(root, 'sources.json'), '--day-dir', dayDir, '--hist', hist]
    const base = (await check(q, (await check(['--parse'], reply(three([{ ref: 'F1', quote: 'report no billing data' }])))).out)).out
    writeFileSync(join(root, 'base.json'), base)
    const redo = `MODEL: m\n${JSON.stringify({ statements: [{ id: 'r2', text: 'Rewritten second statement.', agent: agent([{ ref: 'F2', quote: 'nightly backup is late' }]) }] })}`
    const one = await check(['--parse', '--rewrite', 'r2'], redo)
    expect(one.code).toBe(0)
    expect(JSON.parse(one.out).statements.map((x: { id: string }) => x.id)).toEqual(['r2'])
    const merged = await check(['--merge', '--base', join(root, 'base.json')], (await check(q, one.out)).out)
    expect(merged.code).toBe(0)
    const m = JSON.parse(merged.out)
    expect(m.statements.map((x: { id: string; text: string }) => `${x.id} ${x.text}`)).toEqual([
      'r1 Rehearse with a small group before the next public evening.',
      'r2 Rewritten second statement.',
      'r3 Charge for the second session.',
    ])
    const again = await check(q, merged.out)
    expect(again.err).toBe('')
    expect(again.code).toBe(0)
  })

  it('--rewrite refuses a statement without one of the asked ids', async () => {
    const r = await check(['--parse', '--rewrite', 'r2'], `MODEL: m\n${JSON.stringify({ statements: [{ id: 'r5', text: 'x', agent: agent([{ ref: 'F1', quote: 'a b c' }]) }] })}`)
    expect(r.code).toBe(1)
    expect(r.err).toContain('must carry one of the ids r2 once')
  })

  it('--finalize verifies quotes itself, so a statement that skipped --quotes still gets checked', async () => {
    const parsed = (await check(['--parse'], reply(three([{ ref: 'F1', quote: 'no billing data' }])))).out
    const hist = fakeHist([])
    await cli(contextRun, ctxArgs(hist))
    writeFileSync(join(root, 'v.json'), JSON.stringify({ r1: ['pass'], r2: ['pass'], r3: ['pass'] }))
    // not run through --quotes: finalize verifies it itself and publishes the stable reference
    const r = await check(['--finalize', '--verdicts', join(root, 'v.json'), '--sources', join(root, 'sources.json'), '--day-dir', dayDir, '--hist', hist], parsed)
    expect(r.code).toBe(0)
    expect(JSON.parse(r.out).statements[0].agent.sources[0].ref).toBe('issue card: Three keys report no billing data')
  })
})
