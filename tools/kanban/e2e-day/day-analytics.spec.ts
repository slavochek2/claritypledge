// P1640: the Analytics tab answers all seven questions at each width, on a synthetic read.
import { expect, test, type Page } from '@playwright/test'
import { join } from 'path'
import { DAY_E2E_DIR } from '../playwright.day.config'
import { seedDay } from '../scripts/day-seed'

const OUT = process.env.P1640_SHOTS
const QUESTIONS = ['who', 'what', 'time', 'returns', 'explore', 'stuck', 'practice']
const section = (n: number) => ({ reconciled: false, rows: [{ label: `Measure with quite a long descriptive label ${n}`, current: 40 + n, previous: 30 + n, note: 'open time, not attention' }] })
const READ = {
  date: '2026-11-06',
  status: 'collected',
  clean_data_since: '2026-11-06',
  headline: '1 thing worth your attention',
  sections: Object.fromEntries(QUESTIONS.map((k, i) => [k, section(i)])),
  failures: [],
  firsts: [],
  insights: [{ key: 'failure:x', observation: 'A new kind of failure appeared: magic link error.', numbers: '4 this week', base: 'no earlier weekly read carried this failure', comparison: 'first week it appears', confidence: 'medium', next_step: 'Open the linked report.', seen_count: 0, pattern: false, link: 'https://eu.mixpanel.com/project/1' }],
}

async function open(page: Page, body: unknown, width: number) {
  // Tall, so the screenshot shows all seven sections inside the page's own scroller.
  await page.setViewportSize({ width, height: 2400 })
  seedDay(DAY_E2E_DIR, 'default')
  await page.route('**/api/day/analytics', (r) => r.fulfill({ json: body }))
  await page.goto('/')
  await page.locator('button').filter({ hasText: /^\W*Day$/u }).first().click()
  // The board's sidebar is open by default at every width; the Day tests measure with it collapsed.
  await page.locator('button[title="Collapse sidebar"]').click()
  await page.waitForTimeout(400)
  await page.getByRole('tab', { name: /Analytics/ }).click()
}

for (const width of [320, 375, 1280]) {
  test(`seven questions, no overflow at ${width}px`, async ({ page }) => {
    await open(page, { status: 'collected', read: READ, dismissed: [], confirmed: [] }, width)
    for (const k of QUESTIONS) await expect(page.locator(`[data-an-section="${k}"]`)).toBeVisible()
    await expect(page.getByText('not yet reconciled').first()).toBeVisible()
    await expect(page.getByText('Measure with quite a long descriptive label 6')).toBeVisible()
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
    expect(overflow).toBeLessThanOrEqual(0)
    const dismiss = await page.getByRole('button', { name: /dismiss/i }).first().boundingBox()
    expect(dismiss?.height ?? 0).toBeGreaterThanOrEqual(40)
    if (OUT) await page.screenshot({ path: join(OUT, `analytics-${width}.png`), fullPage: true })
  })
}

test('a read that was not collected says so and shows no numbers', async ({ page }) => {
  await open(page, { status: 'not-collected', read: { date: '2026-11-06', status: 'not-collected', reason: 'simulated failure', headline: 'Not collected', insights: [] }, dismissed: [], confirmed: [] }, 375)
  await expect(page.getByText('Not collected').first()).toBeVisible()
  await expect(page.getByText('simulated failure')).toBeVisible()
  await expect(page.locator('[data-an-section="who"]')).toHaveCount(0)
})
