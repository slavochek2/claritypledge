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
    // P1707: Point B is the outcome; the read's own next step moved to More info (it asked the founder to decide)
    expect(h).toContain('<dt>Point B</dt><dd>The agent has found out whether real users are hurt by it, and fixed it if they are</dd>')
    expect(h).toContain('More info')
    // P1707: an actionable pair replaced "Real problem" / "Not a problem"
    expect(h).toContain("Look into it and fix it if it&#x27;s real")
    expect(h).toContain('Leave it for 90 days')
    expect(h).not.toContain('Real problem')
    expect(h).not.toContain('Not a problem')
    expect(h).toContain('Your answer or question')
    // exactly three numbered choices, and the separate insight block is gone
    const slice = h.slice(h.indexOf('data-insight-tag'), h.indexOf('</article>'))
    expect(slice.match(/type="radio"/g)).toHaveLength(3)
    expect(h).not.toContain('data-insights')
    expect(h).not.toContain('Dismiss')
    expect(h).not.toContain('Confirm')
  })

  // P1707 reverses P1673 here: "Look into it" is the default, so the card no longer waits on a technical judgement
  it('"Look into it" is the recommended default', () => {
    const h = html([insight('a')])
    const card = h.slice(h.indexOf('data-insight-tag'), h.indexOf('</article>'))
    const look = card.slice(card.indexOf('data-option="look"'))
    expect(look.slice(0, look.indexOf('data-option="park"'))).toContain('Recommended')
    expect(card.slice(card.indexOf('data-option="park"'))).not.toContain('Recommended')
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

  // P1707 reverses P1673 here: an insight note IS sent to the agent, so the box must not say otherwise
  it('the note box on an insight is the normal one: no "not sent to the agent"', () => {
    const report = withInsights(base(), [insight('a')])
    const view = buildView(report, [])
    const h = renderToStaticMarkup(
      <DailyReport report={report} view={view} readOnly={false} issues={view.issues} index={0} agent={{ items: [], open: false, setOpen: noop, header: 'first' }} onJump={noop} selected={() => 'own'} draftOf={() => ''} onChoose={noop} onDraft={noop} onDraftBlur={noop} ownFocus={0} onFix={noop} onUndoFix={noop} onBringBack={noop} sent={{}} statements={{ rows: [], current: -1, open: 0, onPick: noop }} onCards={noop} />,
    )
    expect(h).not.toContain('not sent to the agent')
    expect(h).toContain('Ending with ? makes it a question the agent answers first')
  })

  it('a saved note keeps the sidebar row labelled Insight', () => {
    const report = withInsights(base(), [insight('a')])
    const fp = insightIssue(insight('a')).fp
    const view = buildView(report, [{ run_id: report.pass_id, at: '2026-10-04T08:00:00Z', kind: 'option', target: fp, option_id: 'own', text: 'Which page?' }])
    const h = renderToStaticMarkup(
      <DailyReport report={report} view={view} readOnly={false} issues={view.issues} index={0} agent={{ items: [], open: false, setOpen: noop, header: 'first' }} onJump={noop} selected={(i) => i.decision?.option_id ?? ''} draftOf={(i) => i.decision?.text ?? ''} onChoose={noop} onDraft={noop} onDraftBlur={noop} ownFocus={0} onFix={noop} onUndoFix={noop} onBringBack={noop} sent={{}} statements={{ rows: [], current: -1, open: 0, onPick: noop }} onCards={noop} />,
    )
    const row = h.slice(h.indexOf(`data-list-card="${fp}"`))
    expect(row.slice(0, row.indexOf('</button>'))).toContain('<span class="d-clw">Insight</span>')
  })
})
