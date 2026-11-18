// P1707 round 2 (visual QA on real data): a card with a typed note says it is a note and where it goes;
// an answered insight is ticked in the list like any answered card; an insight's recommendation has no fit chip.
import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { buildView, insightIssue, parseReport, sentKey, withInsights, type DayDecision, type DayReport } from '../../../lib/day'
import type { Insight } from '../../../lib/weeklyRead'
import { DailyReport } from '../DailyReport'
import { synthReport } from '../../../../server/__tests__/fixtures/day-fixture'

const insight = (key: string): Insight => ({ key, observation: `Obs ${key}`, numbers: '102 dead clicks', base: 'b', comparison: 'c', confidence: 'medium', next_step: 'n', seen_count: 0, pattern: false })
const base = (): DayReport => {
  const p = parseReport(JSON.parse(JSON.stringify(synthReport())))
  if (p.kind !== 'ok') throw new Error('fixture')
  return p.report
}
const noop = () => {}
const AT = '2026-10-04T08:00:00Z'
const own = (target: string, text: string): DayDecision => ({ kind: 'option', target, option_id: 'own', text, is_question: text.endsWith('?'), run_id: '2026-10-04T05-37-45Z', at: AT })

function html(lines: DayDecision[], opts: { fp?: string; sent?: Record<string, string>; header?: 'first' | 'follow-up'; insights?: Insight[] } = {}): string {
  const report = withInsights(base(), opts.insights ?? [])
  const view = buildView(report, lines)
  const index = opts.fp ? view.issues.findIndex((i) => i.fp === opts.fp) : 0
  return renderToStaticMarkup(
    <DailyReport
      report={report}
      view={view}
      readOnly={false}
      issues={view.issues}
      index={index}
      agent={{ items: [], open: false, setOpen: noop, header: opts.header ?? 'first' }}
      onJump={noop}
      selected={(i) => i.decision?.option_id ?? ''}
      draftOf={(i) => i.decision?.text ?? ''}
      onChoose={noop}
      onDraft={noop}
      onDraftBlur={noop}
      ownFocus={0}
      onFix={noop}
      onUndoFix={noop}
      onBringBack={noop}
      sent={opts.sent ?? {}}
      statements={{ rows: [], current: -1, open: 0, onPick: noop }}
      onCards={noop}
    />,
  )
}
const card = (h: string, fp: string) => h.slice(h.indexOf(`data-issue="${fp}"`), h.indexOf('</article>', h.indexOf(`data-issue="${fp}"`)))

describe('a typed note says it is a note and where it goes', () => {
  it('not sent yet: "Your note" and that Start fixing will send it (the button\'s own word)', () => {
    const c = card(html([own('credits:baseline', 'I read it: 412 EUR')], { fp: 'credits:baseline' }), 'credits:baseline')
    expect(c).toContain('Your note')
    expect(c).toContain('Goes to the fixing agent when you press Start fixing')
    expect(c).toContain('I read it: 412 EUR')
    expect(c).not.toContain('You chose')
    expect(c).not.toContain('Your answer · saved')
  })

  it('after a send the button reads Send, so the line does too', () => {
    const c = card(html([own('credits:baseline', 'I read it')], { fp: 'credits:baseline', header: 'follow-up' }), 'credits:baseline')
    expect(c).toContain('Goes to the fixing agent when you press Send')
  })

  it('a note ending in ? is "Your question"', () => {
    const c = card(html([own('credits:baseline', 'Which account?')], { fp: 'credits:baseline' }), 'credits:baseline')
    expect(c).toContain('Your question')
    expect(c).not.toContain('Your note')
  })

  it('already in a sent receipt: "Sent to the fixing agent on <date>"', () => {
    const sent = { [sentKey.option('credits:baseline', 'own', 'I read it')]: '2026-10-04T09:00:00Z' }
    const c = card(html([own('credits:baseline', 'I read it')], { fp: 'credits:baseline', sent }), 'credits:baseline')
    expect(c).toMatch(/Your note · Sent to the fixing agent on 4 Oct/)
    expect(c).not.toContain('Goes to the fixing agent when')
  })

  it('the same on an insight card', () => {
    const fp = insightIssue(insight('a')).fp
    const c = card(html([own(fp, 'Look at the replays')], { fp, insights: [insight('a')] }), fp)
    expect(c).toContain('Your note')
    expect(c).toContain('Goes to the fixing agent when you press Start fixing')
  })

  it('must-allow: an option pick still says "You chose"', () => {
    const pick: DayDecision = { kind: 'option', target: 'credits:baseline', option_id: 'read', run_id: '2026-10-04T05-37-45Z', at: AT }
    const c = card(html([pick], { fp: 'credits:baseline' }), 'credits:baseline')
    expect(c).toContain('You chose')
    expect(c).not.toContain('Your note')
  })
})

describe('an answered insight is ticked in the list', () => {
  it('a saved note on an insight shows the same answered mark as any answered card', () => {
    const fp = insightIssue(insight('a')).fp
    const h = html([own(fp, 'Look at the replays'), own('credits:baseline', 'x')], { insights: [insight('a')] })
    const row = (f: string) => {
      const r = h.slice(h.indexOf(`data-list-card="${f}"`))
      return r.slice(0, r.indexOf('</button>'))
    }
    const mark = (r: string) => r.match(/<span class="d-sdot[^"]*"[^>]*>[^<]*<\/span>/)?.[0]
    expect(mark(row(fp))).toBe(mark(row('credits:baseline')))
    expect(mark(row(fp))).toContain('✓')
  })
})

describe('an insight\'s recommendation has no fit chip', () => {
  it('"Recommended" without "Fit not rated" on the insight; ordinary cards unchanged', () => {
    const fp = insightIssue(insight('a')).fp
    const h = html([], { fp, insights: [insight('a')] })
    const c = card(h, fp)
    expect(c).toContain('Recommended')
    expect(c).not.toContain('Fit not rated')
    const ordinary = card(html([], { fp: 'replies:event-post' }), 'replies:event-post')
    expect(ordinary).toContain('Recommended · Fit not rated')
  })
})
