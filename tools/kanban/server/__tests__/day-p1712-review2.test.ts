// P1712 review round 2: the defects a review of round 1 found. Each describe names its review item.
// Synthetic fixtures only (fixtures/day-fixture.ts) — never the founder's ~/.claude-day or ~/.claude-analytics.
import { describe, it, expect } from 'vitest'
import { mkdirSync, mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { confirmHides } from '../analyticsStore'
import { run as evaluatedCli } from '../../scripts/day-evaluated'
import { buildPrompt, buildView, carriedNotes, insightIssue, insightNextStep, parseReport, withInsights, type DayDecision, type DayReport } from '../../src/lib/day'
import { SECTION_KEYS, emptySections, gate, type Insight, type LedgerEntry, type RawRead, type StoredRead } from '../../src/lib/weeklyRead'
import { synthReport } from './fixtures/day-fixture'

const deadClicks = (over: Partial<Insight> = {}): Insight => ({
  key: 'failure:dead_click',
  observation: 'A new kind of failure appeared: Dead clicks.',
  numbers: '102 this week',
  base: 'no earlier weekly read raised this failure',
  comparison: 'first week it is raised',
  confidence: 'medium',
  next_step: 'Open the linked replay or report and decide whether it is a real user problem.',
  seen_count: 0,
  pattern: false,
  ...over,
})
const parsed = (r: DayReport): DayReport => {
  const p = parseReport(JSON.parse(JSON.stringify(r)))
  if (p.kind !== 'ok') throw new Error('fixture did not parse')
  return p.report
}
/** A collected raw read with calm rows and the given failures. */
const raw = (date: string, failures: { key: string; count: number }[]): RawRead => {
  const sections = emptySections()
  for (const k of SECTION_KEYS) sections[k] = { reconciled: false, rows: [{ label: `${k} row`, current: 105, previous: 100 }] }
  return { date, status: 'collected', clean_data_since: '2026-09-01', sections, failures: failures.map((f) => ({ ...f, label: f.key })), firsts: [] }
}
const confirm = (key: string, at: string, count?: number): LedgerEntry => ({ key, decision: 'confirm', at, ...(count !== undefined ? { count } : {}) })
const stored = (date: string, over: Partial<StoredRead>): StoredRead => ({ date, status: 'collected', headline: 'h', insights: [], ...over }) as StoredRead

describe('review 1: a confirm that still hides is filtered before the cap, never taking a slot', () => {
  it('three confirmed failures within 30 days and one undecided: the undecided one is raised', () => {
    const r = raw('2026-10-08', [
      { key: 'a', count: 10 },
      { key: 'b', count: 10 },
      { key: 'c', count: 10 },
      { key: 'd', count: 10 },
    ])
    const ledger = ['a', 'b', 'c'].map((k) => confirm(`failure:${k}`, '2026-10-02T09:00:00Z', 10))
    expect(gate(r, [], ledger).insights.map((i) => i.key)).toEqual(['failure:d'])
  })

  it('a confirm whose count has since doubled is raised again by the gate', () => {
    const r = raw('2026-10-08', [{ key: 'a', count: 20 }])
    expect(gate(r, [], [confirm('failure:a', '2026-10-02T09:00:00Z', 10)]).insights.map((i) => i.key)).toEqual(['failure:a'])
  })
})

describe('review 2: the 30 days are counted in calendar days, confirm UTC date to read date', () => {
  it('a confirm at 20:00Z: shown on the read dated exactly 30 days later, hidden on the read a day before', () => {
    const e = confirm('failure:dead_click', '2026-09-01T20:00:00Z', 50)
    const read = (date: string) => stored(date, { failures: [{ key: 'dead_click', label: 'Dead clicks', count: 60 }] })
    expect(confirmHides(e, read('2026-09-30'))).toBe(true)
    expect(confirmHides(e, read('2026-10-01'))).toBe(false)
  })
})

describe('review 3: doubling only for a failure or an upward shift; anything else only expires', () => {
  const read = stored('2026-09-10', {
    sections: {
      who: { reconciled: true, rows: [{ label: 'Visitors', current: 400, previous: 1000 }] },
      time: { reconciled: true, rows: [{ label: 'Session length', current: 400, previous: 100 }] },
    } as unknown as StoredRead['sections'],
  })
  it('a downward shift whose value doubles stays hidden (a doubling of a drop is not the drop getting worse)', () => {
    expect(confirmHides(confirm('shift:who:Visitors:down', '2026-09-01T09:00:00Z', 200), read)).toBe(true)
  })
  it('a key without a meaningful count (a duration row) stays hidden whatever its value', () => {
    expect(confirmHides(confirm('shift:time:Session length:up', '2026-09-01T09:00:00Z', 100), read)).toBe(true)
  })
  it('must-allow: an upward count shift that doubles comes back', () => {
    const up = stored('2026-09-10', { sections: { who: { reconciled: true, rows: [{ label: 'Visitors', current: 400, previous: 150 }] } } as unknown as StoredRead['sections'] })
    expect(confirmHides(confirm('shift:who:Visitors:up', '2026-09-01T09:00:00Z', 200), up)).toBe(false)
  })
})

describe('review 4: an old read never presents its observation as new in the title', () => {
  it('a read 7 days old: the title says it was first seen in that dated read', () => {
    const c = insightIssue(deadClicks(), { date: '2026-09-27', asOf: '2026-10-04T05:37:45Z' })
    expect(c.title).not.toMatch(/appeared/i)
    expect(c.title).toBe('A new kind of failure, first seen in the weekly read of 2026-09-27: Dead clicks.')
  })
  it('must-allow: a read from the run day keeps its own title', () => {
    expect(insightIssue(deadClicks(), { date: '2026-10-04', asOf: '2026-10-04T05:37:45Z' }).title).toBe('A new kind of failure appeared: Dead clicks.')
  })
})

describe('review 5: a new read stores the action wording, never "decide whether it is a real user problem"', () => {
  it('the gate writes the same next step the card shows, for every insight kind', () => {
    const r = raw('2026-10-08', [{ key: 'a', count: 10 }])
    r.firsts = [{ key: 'p1', label: 'first signup' }]
    r.sections.who.rows = [{ label: 'Visitors', current: 300, previous: 100 }]
    const insights = gate(r, [], []).insights
    expect(insights.map((i) => i.key).sort()).toEqual(['failure:a', 'first:p1', 'shift:who:Visitors:up'])
    for (const i of insights) {
      expect(i.next_step).toBe(insightNextStep(i.key))
      expect(i.next_step).not.toMatch(/real user problem|decide whether/i)
    }
  })
})

describe('review 6: a malformed fingerprint starting "insight:" gets the malformed refusal', () => {
  it('exit 1, "not a valid fingerprint", and the malformed text is never echoed back as a command', async () => {
    const d = mkdtempSync(join(tmpdir(), 'p1712-r6-'))
    try {
      mkdirSync(join(d, 'reports'))
      let err = ''
      const bad = 'insight:abc; rm -rf x'
      const code = await evaluatedCli(['--dir', d, '--fp', bad, '--cause', 'c', '--verdict', 'fixed', '--expires', '2026-11-20'], { out: () => {}, err: (s) => (err += s) }, {}, () => new Date('2026-11-01T00:00:00Z'))
      expect(code).toBe(1)
      expect(err).toContain('not a valid fingerprint')
      expect(err).not.toContain('day-insight.ts')
      expect(err).not.toContain('rm -rf')
    } finally {
      rmSync(d, { recursive: true, force: true })
    }
  })
})

describe('review 8: a carried note under "Notes I wrote on earlier days" prints its date once', () => {
  it('an insight card with an unsent note from an earlier run and no pick today: the note date appears once', () => {
    const r = withInsights(parsed(synthReport()), [deadClicks()])
    const fp = insightIssue(deadClicks()).fp
    const lines: DayDecision[] = [{ kind: 'option', target: fp, option_id: 'own', text: 'Why is this back?', is_question: false, run_id: 'r16', at: '2026-10-01T06:00:00Z' }]
    const carried = carriedNotes(lines, r, [], [r])
    expect(carried).toHaveLength(1)
    const p = buildPrompt(r, buildView(r, []), new Set(), undefined, { ledger: [], cli: 's', insightCli: 'insight-cli', carried })
    const section = p.slice(p.indexOf('Notes I wrote on earlier days'))
    expect(section).toContain('Why is this back?')
    expect(section.match(/2026-10-01/g)?.length).toBe(1)
  })
})
