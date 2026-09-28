import { describe, it, expect } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { readings, describe as label, checkSlugDate, eventSlug, localDate } from '../../scripts/events/event-date.mjs'
import { parseNow, crossCheck, handoffPath } from '../../scripts/events/run-status.mjs'

/** P1367 S2: dates are chosen, not guessed. S3: the handoff's Now block, checked against the DB. */
describe('event-date', () => {
  it('"next Tuesday" on Monday 2026-09-28 has two readings, 29 Sep and 6 Oct', () => {
    expect(readings('next Tuesday', '2026-09-28').candidates).toEqual(['2026-09-29', '2026-10-06'])
  })
  it('a weekday named on that same weekday has two readings, today and a week out', () => {
    expect(readings('Monday', '2026-09-28').candidates).toEqual(['2026-09-28', '2026-10-05'])
    expect(readings('next Monday', '2026-09-28').candidates).toEqual(['2026-09-28', '2026-10-05'])
  })
  it('"Tuesday" alone is the coming one', () => {
    expect(readings('Tuesday', '2026-09-28').candidates).toEqual(['2026-09-29'])
  })
  it('an absolute date is echoed with weekday and Bangkok time, as UTC', () => {
    const d = label('2026-10-06', '18:30')
    expect(d.label).toBe('Tuesday 6 Oct 2026, 18:30 Bangkok')
    expect(d.datetime).toBe('2026-10-06T11:30:00+00:00')
  })
  it('an unreadable phrase yields no candidate rather than a guess', () => {
    expect(readings('sometime soon', '2026-09-28').candidates).toEqual([])
  })
  it('slug/date check: fails on the Clarity Night #2 pair, passes on a matching one', () => {
    expect(checkSlugDate('clarity-night-ai-and-your-ikigai-2026-09-29', '2026-10-06T11:30:00+00:00').ok).toBe(false)
    expect(checkSlugDate('clarity-night-x-2026-10-06-ab12', '2026-10-06T11:30:00+00:00').ok).toBe(true)
  })
  it('the slug carries the event date in Bangkok, not the UTC date and not today', () => {
    // 06:00 Bangkok on 7 Oct is 23:00 UTC on 6 Oct.
    expect(localDate('2026-10-06T23:00:00+00:00')).toBe('2026-10-07')
    expect(eventSlug('Clarity Night #3: X', '2026-10-06T23:00:00+00:00', 'Asia/Bangkok', 'abcd')).toBe('clarity-night-3-x-2026-10-07-abcd')
  })
})

const BLOCK = `# Handoff

## Now
- done: publish on TEST
- next: promote; gate: founder says move to PROD
- see: test http://localhost:5001/events/e
- date: Tuesday 6 Oct 2026, 18:30 Bangkok
- not on PROD: everything
- check: env=test tag=t1 event=e datetime=2026-10-06T11:30:00+00:00

## Log
old stuff
`
const fake = (points: number, datetime: string | null) => async (_env: string, qs: string) =>
  qs.startsWith('points') ? Array.from({ length: points }, (_, i) => ({ id: i })) : datetime ? [{ datetime }] : []

describe('run-status', () => {
  it('parses the Now block and its check line', () => {
    const p = parseNow(BLOCK)
    expect(p.ok).toBe(true)
    expect(p.check).toEqual({ env: 'test', tag: 't1', event: 'e', datetime: '2026-10-06T11:30:00+00:00' })
  })
  it('a handoff without the block is unreadable, and so is one missing a field', () => {
    expect(parseNow('# Handoff\n\n## Log\n').ok).toBe(false)
    expect(parseNow(BLOCK.replace(/- date:.*\n/, '')).error).toMatch(/missing: date/)
  })
  it('fresh when the env has the points and the event date matches', async () => {
    const r = await crossCheck(parseNow(BLOCK).check, { fetchJson: fake(6, '2026-10-06T11:30:00+00:00'), vars: {} })
    expect(r.stale).toEqual([])
  })
  it('stale when the tag has no points on the named env', async () => {
    const r = await crossCheck(parseNow(BLOCK).check, { fetchJson: fake(0, '2026-10-06T11:30:00+00:00'), vars: {} })
    expect(r.stale.join()).toMatch(/no points tagged t1/)
  })
  it('stale when the event row date differs from the block', async () => {
    const r = await crossCheck(parseNow(BLOCK).check, { fetchJson: fake(6, '2026-09-29T11:30:00+00:00'), vars: {} })
    expect(r.stale.join()).toMatch(/date: block says/)
  })
  it('finds the event folder before the legacy points-runs handoff', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'p1367-'))
    mkdirSync(path.join(root, '.private/events/s'), { recursive: true })
    mkdirSync(path.join(root, '.private/points-runs'), { recursive: true })
    writeFileSync(path.join(root, '.private/points-runs/s.handoff.md'), BLOCK)
    expect(handoffPath('s', root)).toMatch(/points-runs\/s\.handoff\.md$/)
    writeFileSync(path.join(root, '.private/events/s/handoff.md'), BLOCK)
    expect(handoffPath('s', root)).toMatch(/events\/s\/handoff\.md$/)
  })
})
