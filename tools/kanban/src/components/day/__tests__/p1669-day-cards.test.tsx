// P1669: the Analytics tab's three states (fake tokens only). P1673 moved the insight cards into the
// normal finding card: see server/__tests__/day-p1673-insights.test.ts and p1673-insight-card.test.tsx.
import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { BoardsView } from '../BoardsTab'

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
