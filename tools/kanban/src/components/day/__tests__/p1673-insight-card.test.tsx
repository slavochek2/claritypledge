// P1673: a weekly insight is drawn by the normal finding card, with the normal list and counts.
import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { buildView, insightIssue, parseReport, withInsights, type DayReport } from '../../../lib/day'
import type { Insight } from '../../../lib/weeklyRead'
import { DailyReport } from '../DailyReport'
import { synthReport } from '../../../../server/__tests__/fixtures/day-fixture'

const insight = (key: string, over: Partial<Insight> = {}): Insight => ({
  key,
  observation: `Obs ${key}`,
  numbers: '102 dead clicks',
  base: 'base 40',
  comparison: 'vs 12 last week',
  confidence: 'medium',
  next_step: 'Open the replay',
  seen_count: 0,
  pattern: false,
  link: 'https://eu.mixpanel.com/p/AAA111',
  ...over,
})

const base = (): DayReport => {
  const p = parseReport(JSON.parse(JSON.stringify(synthReport())))
  if (p.kind !== 'ok') throw new Error('fixture')
  return p.report
}
const noop = () => {}

function html(insights: Insight[], index = 0, readOnly = false): string {
  const report = withInsights(base(), insights)
  const view = buildView(report, [])
  return renderToStaticMarkup(
    <DailyReport
      report={report}
      view={view}
      readOnly={readOnly}
      issues={view.issues}
      index={index}
      agent={{ items: [], open: false, setOpen: noop, header: 'first' }}
      onJump={noop}
      selected={() => ''}
      draftOf={() => ''}
      onChoose={noop}
      onDraft={noop}
      onDraftBlur={noop}
      ownFocus={0}
      onFix={noop}
      onUndoFix={noop}
      onBringBack={noop}
      sent={{}}
      statements={{ rows: [], current: -1, open: 0, onPick: noop }}
      onCards={noop}
    />,
  )
}

describe('an insight in the normal finding card', () => {
  it('is the one card style: tag, Point A / Obstacle / Point B, More info, and the three numbered choices', () => {
    const h = html([insight('a')])
    expect(h).toContain('data-insight-tag')
    expect(h).toContain('Weekly insight')
    expect(h).toContain('<dt>Point A</dt><dd>102 dead clicks, first week it is raised</dd>')
    expect(h).toContain('<dt>Obstacle</dt>')
    expect(h).toContain('<dt>Point B</dt><dd>Open the replay</dd>')
    expect(h).toContain('More info')
    expect(h).toContain('Real problem')
    expect(h).toContain('Not a problem')
    expect(h).toContain('Your answer or question')
    // exactly three numbered choices, and the separate insight block is gone
    const slice = h.slice(h.indexOf('data-insight-tag'), h.indexOf('</article>'))
    expect(slice.match(/type="radio"/g)).toHaveLength(3)
    expect(h).not.toContain('data-insights')
    expect(h).not.toContain('Dismiss')
    expect(h).not.toContain('Confirm')
  })

  it('nothing is marked recommended and nothing is preselected', () => {
    const h = html([insight('a')])
    const card = h.slice(h.indexOf('data-insight-tag'), h.indexOf('</article>'))
    expect(card).not.toContain('Recommended')
    expect(card).not.toContain('checked=""')
    expect(card).toContain('Not answered yet')
    expect(card).not.toContain('recommended:')
  })

  it('the first card is the insight, listed first in the one sidebar list', () => {
    const h = html([insight('a')])
    const list = h.slice(h.indexOf('data-list-card'))
    expect(list.indexOf('data-list-card="insight:')).toBeLessThan(list.indexOf('data-list-card="', 20))
  })

  it('the day totals do not count the insight', () => {
    const without = html([])
    const withOne = html([insight('a')])
    const summary = (h: string) => h.match(/(All \d+ answered|\d+ still need you(?: · \d+ items)?)/)?.[0]
    expect(summary(withOne)).toBeDefined()
    expect(summary(withOne)).toBe(summary(without))
  })

  it('More info carries base, comparison, confidence and the repeat pattern; the link is dropped when there is none', () => {
    // More info is folded until opened, so the text is asserted on the card data the open panel prints
    const c = insightIssue(insight('a', { seen_count: 3, pattern: true }))
    for (const t of ['Base: base 40', 'Comparison: vs 12 last week', 'Confidence: medium', 'Pattern: seen 3 times before']) expect(c.more_info).toContain(t)
    expect(c.insight_link).toBe('https://eu.mixpanel.com/p/AAA111')
    expect(insightIssue(insight('b', { link: undefined })).insight_link).toBeUndefined()
  })
})
