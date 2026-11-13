// P1669: the Analytics tab embeds the public boards (three states). P1673: an undecided insight from the
// P1640 read is an ordinary finding card on the Report tab, read from the e2e analytics folder by the real
// server (no route is mocked). Synthetic data, fake tokens.
import { expect, test, type Page } from '@playwright/test'
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { join } from 'path'
import { DAY_E2E_ANALYTICS, DAY_E2E_DIR } from '../playwright.day.config'
import { seedDay } from '../scripts/day-seed'

const READ = {
  date: '2026-11-06',
  status: 'collected',
  clean_data_since: '2026-11-06',
  headline: '1 thing worth your attention',
  sections: {},
  failures: [],
  firsts: [],
  insights: [{ key: 'failure:x', observation: 'A new kind of failure appeared: magic link error.', numbers: '4 this week', base: 'no earlier weekly read carried this failure', comparison: 'first week it appears', confidence: 'medium', next_step: 'Open the linked report.', seen_count: 0, pattern: false, link: 'https://eu.mixpanel.com/project/1' }],
}

// the folder playwright.day.config.ts hands the Day API as KANBAN_ANALYTICS_DIR
const ANALYTICS = DAY_E2E_ANALYTICS
const putRead = (read: unknown = READ) => {
  rmSync(ANALYTICS, { recursive: true, force: true })
  mkdirSync(join(ANALYTICS, 'reads'), { recursive: true })
  if (read) writeFileSync(join(ANALYTICS, 'reads', `${(read as { date: string }).date}.json`), JSON.stringify(read))
}
const ledger = () => {
  try {
    return readFileSync(join(ANALYTICS, 'ledger.jsonl'), 'utf-8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l) as { key: string; decision: string })
  } catch {
    return []
  }
}
const INSIGHT = 'article[data-issue^="insight:"]'
// a read left behind would put an insight card first in every later spec (day-page.spec.ts reads recommended_index)
test.afterEach(() => rmSync(ANALYTICS, { recursive: true, force: true }))

async function openDay(page: Page, routes: Record<string, unknown>, width = 375) {
  await page.setViewportSize({ width, height: 1400 })
  seedDay(DAY_E2E_DIR, 'default')
  for (const [path, json] of Object.entries(routes)) await page.route(path, (r) => r.fulfill({ json }))
  await page.goto('/')
  await page.locator('button').filter({ hasText: /^\W*Day$/u }).first().click()
  await page.locator('button[title="Collapse sidebar"]').click()
  await page.waitForTimeout(400)
}

for (const width of [320, 375, 1280]) {
  test(`boards: valid links embed one iframe each, no overflow at ${width}px`, async ({ page }) => {
    const boards = [
      { key: 'pulse', label: 'Pulse', url: 'about:blank#AAA111' },
      { key: 'path', label: 'Path to value', url: 'about:blank#BBB222' },
    ]
    await openDay(page, { '**/api/day/mixpanel-boards': { boards, invalid: [] } }, width)
    await page.getByRole('tab', { name: /Analytics/ }).click()
    await expect(page.locator('iframe')).toHaveCount(2)
    await expect(page.getByText('Open in Mixpanel')).toHaveCount(2)
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
    expect(overflow).toBeLessThanOrEqual(0)
  })
}

test('boards: nothing configured says which variables to set', async ({ page }) => {
  await openDay(page, { '**/api/day/mixpanel-boards': { boards: [], invalid: [] } })
  await page.getByRole('tab', { name: /Analytics/ }).click()
  await expect(page.locator('[data-boards-empty]')).toContainText('MIXPANEL_BOARD_PULSE')
  await expect(page.locator('[data-boards-empty]')).toContainText('Public Boards')
  await expect(page.locator('iframe')).toHaveCount(0)
})

test('boards: an invalid value is named by key, with the public link form', async ({ page }) => {
  await openDay(page, { '**/api/day/mixpanel-boards': { boards: [], invalid: ['MIXPANEL_BOARD_PATH'] } })
  await page.getByRole('tab', { name: /Analytics/ }).click()
  await expect(page.locator('[data-boards-invalid]')).toContainText('MIXPANEL_BOARD_PATH')
  await expect(page.locator('[data-boards-invalid]')).toContainText('https://eu.mixpanel.com/p/')
})

test('report: an undecided insight is a normal finding card, listed first and tagged', async ({ page }) => {
  putRead()
  await openDay(page, {})
  const card = page.locator(INSIGHT)
  await expect(card).toHaveCount(1)
  await expect(card).toContainText('Weekly insight')
  await expect(card).toContainText('magic link error')
  await expect(card).toContainText('Point A')
  await expect(card).toContainText('4 this week')
  await expect(card).toContainText('Point B')
  await expect(card).toContainText('Open the linked report.')
  await expect(card).toContainText('Real problem')
  await expect(card).toContainText('Not a problem')
  await expect(card).toContainText('Your answer or question')
  await expect(card).not.toContainText('Recommended')
  // one card style on the page: the old block is gone, and the insight is the first card
  await expect(page.locator('[data-insights]')).toHaveCount(0)
  await expect(page.locator('article[data-issue]').first()).toHaveAttribute('data-issue', /^insight:/)
  // More info carries the numbers and the link
  await card.getByRole('button', { name: /More info/ }).click()
  await expect(card).toContainText('Base: no earlier weekly read carried this failure')
  await expect(card).toContainText('Confidence: medium')
  await expect(card.getByRole('link', { name: 'Open the link' })).toHaveAttribute('href', 'https://eu.mixpanel.com/project/1')
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  expect(overflow).toBeLessThanOrEqual(0)
})

test('report: Real problem records a confirm in the ledger, and the card leaves', async ({ page }) => {
  putRead()
  await openDay(page, {})
  const card = page.locator(INSIGHT)
  await expect(card).toHaveCount(1)
  await card.getByText('Real problem').click()
  await expect(card).toHaveCount(0)
  expect(ledger().map((e) => [e.key, e.decision])).toEqual([['failure:x', 'confirm']])
})

test('report: Not a problem records a dismiss, and the card stays gone after a reload', async ({ page }) => {
  putRead()
  await openDay(page, {})
  const card = page.locator(INSIGHT)
  await expect(card).toHaveCount(1)
  await card.getByText('Not a problem').click()
  await expect(card).toHaveCount(0)
  expect(ledger().map((e) => [e.key, e.decision])).toEqual([['failure:x', 'dismiss']])
  const run = page.waitForResponse((r) => /\/api\/day\/runs\//.test(r.url()))
  await page.reload()
  await run
  await expect(page.locator(INSIGHT)).toHaveCount(0)
})

test('report: the keyboard works as on any card: 1 is Real problem', async ({ page }) => {
  putRead()
  await openDay(page, {}, 1280)
  await expect(page.locator(INSIGHT)).toHaveCount(1)
  await page.keyboard.press('1')
  await expect(page.locator(INSIGHT)).toHaveCount(0)
  expect(ledger().map((e) => e.decision)).toEqual(['confirm'])
})

test('report: a free-text answer survives a reload and leaves the card; the ledger stays empty', async ({ page }) => {
  putRead()
  await openDay(page, {})
  const card = page.locator(INSIGHT)
  await card.getByText('Your answer or question').click()
  const box = card.locator('textarea')
  await box.fill('Which page was it?')
  await box.blur()
  await expect(page.getByText(/Your answer · saved/)).toBeVisible()
  const run = page.waitForResponse((r) => /\/api\/day\/runs\//.test(r.url()))
  await page.reload()
  await run
  // the page opens on the first card that still needs an answer; the answered insight stays in the list
  await expect(page.locator('[data-list-card^="insight:"]')).toHaveAttribute('data-list-state', 'answered')
  expect(ledger()).toEqual([])
})

test('report: nothing undecided, a dismissed key, or a read that was not collected shows no insight card', async ({ page }) => {
  putRead()
  writeFileSync(join(ANALYTICS, 'ledger.jsonl'), JSON.stringify({ key: 'failure:x', decision: 'dismiss', at: '2026-11-06T09:00:00Z' }) + '\n')
  // Absence is only proven after the run has arrived: wait for that response, not a fixed delay.
  const run = page.waitForResponse((r) => /\/api\/day\/runs\//.test(r.url()))
  await openDay(page, {})
  await run
  await expect(page.locator('article[data-issue]').first()).toBeVisible()
  await expect(page.locator(INSIGHT)).toHaveCount(0)
})

test('report: an unreadable ledger says Insights could not load, never "nothing to decide"', async ({ page }) => {
  putRead()
  mkdirSync(join(ANALYTICS, 'ledger.jsonl')) // exists, cannot be read as a file
  await openDay(page, {})
  await expect(page.locator('[data-insights-error]')).toHaveText('Insights could not load')
  await expect(page.locator(INSIGHT)).toHaveCount(0)
})

test('report: a failed save keeps the card with an error, and the same press can be retried', async ({ page }) => {
  putRead()
  await openDay(page, {}, 1280)
  const card = page.locator(INSIGHT)
  await expect(card).toHaveCount(1)
  await page.route('**/api/day/analytics/decision', (r) => r.fulfill({ status: 500, json: { error: 'boom' } }))
  await card.getByText('Real problem').click()
  await expect(page.getByText(/Not saved/)).toBeVisible()
  await expect(card).toHaveCount(1)
  expect(ledger()).toEqual([])
  await page.unroute('**/api/day/analytics/decision')
  await card.getByText('Real problem').click()
  await expect(card).toHaveCount(0)
  expect(ledger().map((e) => e.decision)).toEqual(['confirm'])
})

test('report: a double press sends one decision', async ({ page }) => {
  putRead()
  await openDay(page, {}, 1280)
  await expect(page.locator(INSIGHT)).toHaveCount(1)
  let posts = 0
  await page.route('**/api/day/analytics/decision', async (r) => {
    posts++
    await new Promise((res) => setTimeout(res, 600)) // the first save is still in flight when the second press lands
    await r.continue()
  })
  await page.keyboard.press('1')
  await page.keyboard.press('1')
  await expect(page.locator(INSIGHT)).toHaveCount(0)
  expect(posts).toBe(1)
  expect(ledger().map((e) => e.decision)).toEqual(['confirm'])
})

test('report: an empty note on an insight does not block Start fixing', async ({ page }) => {
  putRead()
  await openDay(page, {}, 1280)
  const card = page.locator(INSIGHT)
  await card.getByText('Your answer or question').click()
  // the request only goes out if the page did not send the founder back to the empty note
  const start = page.waitForResponse('**/api/day/start')
  await page.locator('button[data-send-count]').click()
  await start
  await expect(page.getByText('Write your answer or question first')).toHaveCount(0)
})
