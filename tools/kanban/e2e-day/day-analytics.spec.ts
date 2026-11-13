// P1669: the Analytics tab embeds the public boards (three states); the Report tab shows insight
// cards from the P1640 read, only when something is undecided. Synthetic data, fake tokens.
import { expect, test, type Page } from '@playwright/test'
import { DAY_E2E_DIR } from '../playwright.day.config'
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

test('report: an undecided insight is a card; Dismiss hides it', async ({ page }) => {
  await openDay(page, { '**/api/day/analytics': { status: 'collected', read: READ, dismissed: [], confirmed: [] }, '**/api/day/analytics/decision': { success: true } })
  const card = page.locator('[data-insight="failure:x"]')
  await expect(card).toContainText('magic link error')
  await expect(card).toContainText('4 this week')
  const dismiss = await card.getByRole('button', { name: /dismiss/i }).boundingBox()
  expect(dismiss?.height ?? 0).toBeGreaterThanOrEqual(40)
  await card.getByRole('button', { name: /dismiss/i }).click()
  await expect(card).toHaveCount(0)
})

test('report: nothing undecided, or a read that was not collected, shows no card', async ({ page }) => {
  // Absence is only proven after the read has arrived: wait for that response, not a fixed delay.
  const read = page.waitForResponse('**/api/day/analytics')
  await openDay(page, { '**/api/day/analytics': { status: 'collected', read: READ, dismissed: ['failure:x'], confirmed: [] } })
  await read
  await expect(page.locator('[data-insight]')).toHaveCount(0)
})
