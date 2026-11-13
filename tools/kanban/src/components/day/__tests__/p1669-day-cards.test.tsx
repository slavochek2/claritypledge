// P1669: the Analytics tab's three states, and the Report tab's insight cards (fake tokens only).
import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { BoardsView } from '../BoardsTab'
import { InsightCardsView } from '../InsightCards'
import { undecidedInsights } from '../insightCardsModel'
import type { WeeklyReadPayload } from '../api'

const insight = (key: string) => ({
  key,
  observation: `Obs ${key}`,
  numbers: '12 people',
  base: 'base 40',
  comparison: 'c',
  confidence: 'medium',
  next_step: 'n',
  seen_count: 0,
  pattern: false,
  link: 'https://eu.mixpanel.com/p/AAA111',
})
const payload = (over: Record<string, unknown> = {}, status = 'collected') =>
  ({ status, read: { date: '2026-11-09', status, insights: [insight('a'), insight('b')] }, dismissed: [], confirmed: [], ...over }) as unknown as WeeklyReadPayload
const noop = () => {}

describe('BoardsView', () => {
  it('no board configured: names the env vars and Public Boards', () => {
    const html = renderToStaticMarkup(<BoardsView data={{ boards: [], invalid: [] }} />)
    for (const v of ['MIXPANEL_BOARD_PULSE', 'MIXPANEL_BOARD_PATH', 'MIXPANEL_BOARD_RETURN', 'MIXPANEL_BOARD_FRICTION', 'MIXPANEL_BOARD_USE']) expect(html).toContain(v)
    expect(html).toContain('Public Boards')
    expect(html).not.toContain('<iframe')
  })

  it('invalid value: names the keys and the required link form, embeds nothing', () => {
    const html = renderToStaticMarkup(<BoardsView data={{ boards: [], invalid: ['MIXPANEL_BOARD_PATH'] }} />)
    expect(html).toContain('MIXPANEL_BOARD_PATH')
    expect(html).toContain('https://eu.mixpanel.com/p/')
    expect(html).not.toContain('<iframe')
  })

  it('valid boards: one iframe per board with its label and an Open in Mixpanel link', () => {
    const boards = [
      { key: 'pulse', label: 'Pulse', url: 'https://eu.mixpanel.com/public/AAA111' },
      { key: 'use', label: 'What do people use?', url: 'https://eu.mixpanel.com/public/BBB222' },
    ]
    const html = renderToStaticMarkup(<BoardsView data={{ boards, invalid: [] }} />)
    expect(html.match(/<iframe/g)).toHaveLength(2)
    expect(html.match(/Open in Mixpanel/g)).toHaveLength(2)
    expect(html).toContain('What do people use?')
    expect(html.match(/sandbox="allow-scripts allow-same-origin allow-popups"/g)).toHaveLength(2)
    expect(html).toContain('Public Boards is on')
  })
})

describe('insight cards on the Report tab', () => {
  it('shows a card per undecided insight with what, how many, and where to look', () => {
    const html = renderToStaticMarkup(<InsightCardsView data={payload()} onDecide={noop} />)
    expect(html.match(/data-insight=/g)).toHaveLength(2)
    expect(html).toContain('Obs a')
    expect(html).toContain('12 people')
    expect(html).toContain('base 40')
    expect(html).toContain('Confirm')
    expect(html).toContain('Dismiss')
    expect(html).toContain('href="https://eu.mixpanel.com/p/AAA111"')
  })

  it('keeps the P1640 hypothesis on each card: comparison, confidence, next step, and the pattern badge', () => {
    const data = { ...payload(), read: { date: '2026-11-09', status: 'collected', insights: [{ ...insight('a'), comparison: 'vs last week', confidence: 'low', next_step: 'Open the replay', pattern: true, seen_count: 3 }] } } as unknown as WeeklyReadPayload
    const html = renderToStaticMarkup(<InsightCardsView data={data} onDecide={noop} />)
    for (const t of ['Comparison: vs last week', 'Confidence: low', 'Next step: Open the replay', 'pattern: seen 3 times before']) expect(html).toContain(t)
    expect(renderToStaticMarkup(<InsightCardsView data={payload()} onDecide={noop} />)).not.toContain('pattern:')
  })

  it('while a decision is saving, that card cannot be decided again', () => {
    const html = renderToStaticMarkup(<InsightCardsView data={payload()} onDecide={noop} pending={['a']} />)
    const cardA = html.slice(html.indexOf('data-insight="a"'), html.indexOf('data-insight="b"'))
    const cardB = html.slice(html.indexOf('data-insight="b"'))
    expect(cardA.match(/disabled=""/g)).toHaveLength(2)
    expect(cardB).not.toContain('disabled=""')
  })

  it('confirmed or dismissed insights are hidden', () => {
    expect(undecidedInsights(payload({ dismissed: ['a'], confirmed: ['b'] }))).toEqual([])
    const html = renderToStaticMarkup(<InsightCardsView data={payload({ dismissed: ['a'] })} onDecide={noop} />)
    expect(html).not.toContain('Obs a')
    expect(html).toContain('Obs b')
  })

  it('nothing undecided, not collected, none, or not loaded: no card at all', () => {
    for (const d of [payload({ dismissed: ['a', 'b'] }), payload({}, 'not-collected'), { status: 'none' } as WeeklyReadPayload, null]) {
      expect(renderToStaticMarkup(<InsightCardsView data={d} onDecide={noop} />)).toBe('')
    }
  })
})
