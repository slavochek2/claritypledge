import { describe, it, expect } from 'vitest'
import { mkdtempSync, mkdirSync, readFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { buildView, parseReport, type DayIssue, type DayReport, type EvaluatedLine } from '../../src/lib/day'
import { applyLoops, type GitFacts } from '../../scripts/day-loops'
import { run as cli } from '../../scripts/day-evaluated'
import { FP_ALIASES } from '../../scripts/day-fp-aliases'
import { lhCauseSlug } from '../../scripts/day-lh-cause'
import { readSidecar } from '../../scripts/day-render'
import { emittedFaultKeys } from '../../scripts/day-fault-keys'

/**
 * P1655 — /day cards that can never ask the founder for anything are folded, not shown.
 * Same path as P1605: the real applyLoops and buildView on the real 2026-10-26/27 reports.
 */

const FIX = new URL('./fixtures/day-p1578/', import.meta.url)
const load = (name: string) => {
  const p = parseReport(JSON.parse(readFileSync(new URL(name, FIX), 'utf-8')))
  if (p.kind !== 'ok') throw new Error(`fixture ${name} unreadable`)
  return p.report
}
const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x))
const R26 = load('report-1026.json')
const R27 = load('report-1027.json')
const NOW = new Date('2026-10-27T06:00:00Z')
const NO_GIT: GitFacts = { ok: true, branches: [], specs: [] }

/** a card cloned from a real one, under another fingerprint and check (the check ran: problem) */
function addCard(r: DayReport, fp: string, extra: Partial<DayIssue> = {}, status: 'problem' | 'ok' | 'not-run' = 'problem') {
  const check = fp.split(':')[0]
  const base = clone(r.issues.find((i) => i.fp === 'cp.testdb:testdb:slow') as DayIssue)
  r.issues.push({ ...base, fp, check, ...extra })
  r.checks = r.checks.filter((c) => c.id !== check).concat([{ id: check, label: check, status } as DayReport['checks'][number]])
}
function render(mutate: (r: DayReport) => void, records: EvaluatedLine[] = []) {
  const report = clone(R27)
  mutate(report)
  applyLoops(report, { receipts: [], outcomes: [], earlier: [R26], git: NO_GIT, now: NOW, evaluated: records })
  const view = buildView(report, [])
  return { view, shown: (fp: string) => view.issues.some((i) => i.fp === fp), hidden: (fp: string) => view.evaluated.some((i) => i.fp === fp) }
}
const rec = (fps: string[], over: Partial<EvaluatedLine> = {}): EvaluatedLine => ({
  kind: 'evaluated', id: 'ev-1', fps, cause: 'named cause', verdict: 'accepted', expires: '2026-11-10', at: '2026-10-26T12:00:00.000Z', ...over,
})

const OVER = 'disp.budgets:budgets:projected-over:b1'
const OVER80 = 'disp.budgets:budgets:over-80:b1'

describe('P1655 rule 1: projected over with a verified hard cap', () => {
  it('folds when the same run verified the cap', () => {
    const r = render((x) => addCard(x, OVER, { cap_verified: true }))
    expect(r.hidden(OVER)).toBe(true)
    expect(r.shown(OVER)).toBe(false)
  })
  it('shows without the verification (control)', () => {
    const r = render((x) => addCard(x, OVER))
    expect(r.shown(OVER)).toBe(true)
  })
  it('an 80% warning on a prod key still shows even with a verified cap', () => {
    const r = render((x) => addCard(x, OVER80, { cap_verified: true }))
    expect(r.shown(OVER80)).toBe(true)
  })
  it('fails open: a budgets check that did not run never folds', () => {
    const r = render((x) => addCard(x, OVER, { cap_verified: true }, 'not-run'))
    expect(r.shown(OVER)).toBe(true)
  })
  it('a different check carrying cap_verified is not folded by this rule', () => {
    const r = render((x) => addCard(x, 'disp.aikeys:aikeys:cap-absent:k', { cap_verified: true }))
    expect(r.shown('disp.aikeys:aikeys:cap-absent:k')).toBe(true)
  })
})

describe('P1655 rule 1b: a retiring key', () => {
  it('folds its projection, but an 80%/cap warning still shows (Opus review: it may still serve prod)', () => {
    const r = render((x) => {
      addCard(x, OVER, { retiring: true })
      addCard(x, OVER80, { retiring: true })
    })
    expect(r.hidden(OVER)).toBe(true)
    expect(r.shown(OVER80)).toBe(true)
  })
  it('never folds an account-wide budget finding, even if flagged retiring (Gemini review)', () => {
    const UNB = 'disp.budgets:budgets:unbudgeted-spend'
    const r = render((x) => { addCard(x, UNB, { retiring: true }) })
    expect(r.shown(UNB)).toBe(true)
  })
  it('an unreadable registry (no flag) shows them', () => {
    const r = render((x) => {
      addCard(x, OVER)
      addCard(x, OVER80)
    })
    expect(r.shown(OVER)).toBe(true)
    expect(r.shown(OVER80)).toBe(true)
  })
  it('the flags travel through a finding sidecar', () => {
    const s = readSidecar(JSON.stringify({ check: 'disp.budgets', fault_key: 'budgets:projected-over:b1', title: 't', cap_verified: true, retiring: true }))
    expect(s).toMatchObject({ cap_verified: true, retiring: true })
    const plain = readSidecar(JSON.stringify({ check: 'disp.budgets', fault_key: 'budgets:projected-over:b1', title: 't' }))
    expect(plain?.cap_verified).toBeUndefined()
  })
})

const RENAMES: [string, string, string][] = [
  ['cp.quota:quota:claritypledge-test:log-ingestion', 'cp.quota:quota:jwpujlzsdkkeohiggxpt:log-ingestion', 'cp.quota'],
  ['cp.health:kdd:uncaptured', 'cp.reflect:kdd:uncaptured', 'cp.reflect'],
  ['cp.testfns:testfns:branch-only-deploy', 'cp.testfns:testfns:differs', 'cp.testfns'],
]

describe('P1655 rule 2: aliases', () => {
  for (const [oldFp, newFp] of RENAMES) {
    it(`a record under ${oldFp} hides the renamed card`, () => {
      expect(FP_ALIASES[oldFp]).toBe(newFp)
      const r = render((x) => addCard(x, newFp), [rec([oldFp])])
      expect(r.hidden(newFp)).toBe(true)
    })
    it(`control: without an alias entry the renamed card shows (${newFp})`, () => {
      const r = render((x) => addCard(x, newFp), [rec(['cp.unrelated:other:thing'])])
      expect(r.shown(newFp)).toBe(true)
    })
  }
  it('an alias never joins a different fault', () => {
    const other = 'cp.testfns:testfns:something-else'
    const r = render((x) => addCard(x, other), [rec(['cp.testfns:testfns:branch-only-deploy'])])
    expect(r.shown(other)).toBe(true)
  })
})

describe('P1655 rule 2b: an emitted fault key cannot change without an alias', () => {
  const dir = new URL('../../scripts/', import.meta.url)
  const snapshot: string[] = JSON.parse(readFileSync(new URL('day-fault-keys.snapshot.json', dir), 'utf-8'))
  it('every key in the snapshot is still emitted, or has an alias to its successor', () => {
    const now = emittedFaultKeys()
    const lost = snapshot.filter((fp) => !now.has(fp) && !FP_ALIASES[fp])
    expect(lost, `fault keys removed or renamed with no alias: ${lost.join(', ')}`).toEqual([])
  })
  it('control: the extractor sees real keys (it is not blind)', () => {
    const now = emittedFaultKeys()
    expect(now.size).toBeGreaterThan(10)
    expect(snapshot.length).toBeGreaterThan(10)
  })
})

describe('P1655 rule 3: the LinkedIn cause is part of the fingerprint', () => {
  const key = (slug: string) => `disp.lhcodex:lhcodex:needs-you:${slug}`
  it('out of credits, crash and unreadable give three different slugs', () => {
    const slugs = [
      lhCauseSlug('Linked Helper shows "Out of Data Credits" on the runner screen'),
      lhCauseSlug('Linked Helper runner crashed: TOOLING-FAILURE'),
      lhCauseSlug(''),
    ]
    expect(slugs).toEqual(['out-of-credits', 'crashed', 'unknown'])
    expect(new Set(slugs).size).toBe(3)
  })
  it('each fingerprint is accepted by day-evaluated.ts', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'p1655-'))
    mkdirSync(join(dir, 'reports'))
    for (const slug of ['out-of-credits', 'crashed', 'unknown']) {
      const out: string[] = []
      const err: string[] = []
      const code = await cli(['--fp', key(slug), '--cause', 'named', '--verdict', 'accepted', '--expires', '2026-11-30', '--dir', dir], { out: (s) => out.push(s), err: (s) => err.push(s) }, {}, () => NOW)
      expect(code, err.join('')).toBe(0)
    }
  })
  it('a record on one cause does not hide a different stall; the old key is aliased to out-of-credits', () => {
    expect(FP_ALIASES['disp.lhcodex:lhcodex:needs-you']).toBe(key('out-of-credits'))
    const records = [rec(['disp.lhcodex:lhcodex:needs-you'])]
    expect(render((x) => addCard(x, key('out-of-credits')), records).hidden(key('out-of-credits'))).toBe(true)
    expect(render((x) => addCard(x, key('crashed')), records).shown(key('crashed'))).toBe(true)
    expect(render((x) => addCard(x, key('unknown')), records).shown(key('unknown'))).toBe(true)
  })
})

describe('P1655 review fixes', () => {
  it('a crash with a stale out-of-credits title is a crash, never folded as credits (Opus review)', () => {
    expect(lhCauseSlug('Out of Data Credits ... container crashed')).toBe('crashed')
  })
})
