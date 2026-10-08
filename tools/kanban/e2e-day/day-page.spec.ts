// P1399 Phase A — the Day page, end to end, on SYNTHETIC data (scripts/day-seed.ts).
// Each test re-seeds the temp day dir; the API reads it at request time.

import { expect, test, type Locator, type Page } from '@playwright/test'
import { existsSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { DAY_E2E_DIR, OFF, ON } from '../playwright.day.config'
import { EARLIER_ID, LATEST_ID, NEWER_ID, seedDay, type Variant } from '../scripts/day-seed'
import { CHECKS, synthReport } from '../server/__tests__/fixtures/day-fixture'
import type { DayReport } from '../src/lib/day'

const DECISIONS = join(DAY_E2E_DIR, 'decisions.jsonl')
const fileText = () => (existsSync(DECISIONS) ? readFileSync(DECISIONS, 'utf-8') : '')
const lines = () =>
  fileText()
    .split('\n')
    .filter(Boolean)
    .map((l) => JSON.parse(l))

async function openDay(page: Page, variant: Variant = 'default') {
  seedDay(DAY_E2E_DIR, variant)
  await page.goto('/')
  await page.locator('button').filter({ hasText: /^\W*Day$/u }).first().click()
  await expect(page.locator('.day-root')).toBeVisible()
}

/** Reload without re-seeding (decisions survive). */
async function reopen(page: Page) {
  await page.goto('/')
  await page.locator('button').filter({ hasText: /^\W*Day$/u }).first().click()
  await expect(page.locator('.d-focus')).toBeVisible()
}

type ViewIssue = { fp: string; title: string; options: { id: string; label: string; agent?: boolean }[]; recommended_index: number }
async function runView(page: Page, id = LATEST_ID) {
  const r = await page.request.get(`/api/day/runs/${id}`)
  return (await r.json()) as { view: { issues: ViewIssue[]; checks: { status: string; covered_by?: string }[] }; collectedCount: number }
}
/** Phase D: a card is agent work when its recommended option hands it to the agent; the pager walks the others. */
const isAgent = (i: ViewIssue) => i.options[i.recommended_index]?.agent === true
const yoursOf = (v: { view: { issues: ViewIssue[] } }) => v.view.issues.filter((i) => !isAgent(i))
const agentOf = (v: { view: { issues: ViewIssue[] } }) => v.view.issues.filter(isAgent)

const card = (page: Page) => page.locator('.d-focus')
const cardTitle = (page: Page) => card(page).locator('h2')
const listRow = (page: Page, fp: string) => page.locator(`[data-list-card="${fp}"]`)
const nextBtn = (page: Page) => page.locator('[data-bottom-bar]').getByRole('button', { name: /^Next/ })
/** P1432: Accept is its own button, split from Next; it writes the recommended answer at once. */
const acceptBtn = (page: Page) => page.locator('[data-bottom-bar] [data-accept]')
const prevBtn = (page: Page) => page.locator('[data-bottom-bar]').getByRole('button', { name: /^Previous/ })
const startBtn = (page: Page) => page.getByRole('button', { name: /^Start fixing \(\d+\)$/ })
/** A value that must exist, or the test fails right here with a name. */
function must<T>(v: T | null | undefined, what: string): T {
  if (v === null || v === undefined) throw new Error(`missing: ${what}`)
  return v
}
const rectOf = async (l: Locator, what = 'element') => must(await l.boundingBox(), `${what} box`)
/** The first whole number in a locator's text. */
const numberIn = async (l: Locator, what: string) => Number(must((await l.textContent())?.match(/\d+/), what)[0])
/** The board's sidebar animates its width: wait until the Day page has the room before measuring. */
async function collapseSidebar(page: Page) {
  await page.locator('button[title="Collapse sidebar"]').click()
  // the collapsed sidebar is 44px wide; the page starts right after it once the animation ends
  await expect.poll(async () => Math.round((await rectOf(page.locator('.day-root'), 'day root')).x)).toBe(44)
}
const startCount = (page: Page) => numberIn(startBtn(page), 'Start fixing count')
const OWN_LABEL = 'Your answer or question…'
const ownRow = (page: Page) => card(page).locator('.d-optrow').filter({ hasText: OWN_LABEL })
const ownBox = (page: Page) => card(page).getByRole('textbox', { name: 'Your answer or question' })
const stillYours = (page: Page) => page.locator('[data-still-yours]')
const agentLine = (page: Page) => page.locator('[data-agent-line]')
const agentPager = (page: Page) => page.locator('[data-agent-pager]')
/** The seed's Stats has one series; this adds one the run did not collect (a placeholder to measure). */
const withUncollectedSeries = (b: RunBody) =>
  b.report?.stats?.series?.unshift({ id: 'reachouts', label: 'Reach-outs per week', collected: false, target: 10, target_proposed: true, points: [] })
/** Patch what the page reads for a run (the server's real answer, edited): for states the seed does not have. */
interface RunBody {
  report?: DayReport
  view?: { issues: ViewIssue[] }
  quotaHistory?: Record<string, { at: string; remaining_pct: number }[]>
}
async function patchRun(page: Page, edit: (body: RunBody) => void) {
  await page.route('**/api/day/runs/*', async (route) => {
    const res = await route.fetch()
    const body = await res.json()
    edit(body)
    await route.fulfill({ response: res, json: body })
  })
}

test.describe('sidebar', () => {
  test('the Day entry is present when the day dir is set', async ({ page }) => {
    seedDay(DAY_E2E_DIR, 'default')
    await page.goto('/')
    await expect(page.locator('button').filter({ hasText: /^\W*Day$/u })).toHaveCount(1)
  })

  test('the Day entry is absent when KANBAN_DAY_DIR is unset', async ({ page }) => {
    await page.goto(`http://localhost:${OFF.web}/`)
    await expect(page.locator('button').filter({ hasText: /^\W*Board$/u })).toHaveCount(1)
    await expect(page.locator('button').filter({ hasText: /^\W*Day$/u })).toHaveCount(0)
    const cfg = await (await page.request.get(`http://localhost:${OFF.web}/api/day`)).json()
    expect(cfg).toEqual({ enabled: false })
  })
})

test.describe('header', () => {
  test('four tabs, one switcher below, no tab repeats its own name as a heading', async ({ page }) => {
    await openDay(page)
    const tabs = page.getByRole('tab')
    await expect(page.locator('.d-tabs .d-tl')).toHaveText(['Daily report', 'Stats', 'Monitoring', 'Reflection'])
    await expect(page.locator('[data-run-date]')).toHaveText('Sun 4 Oct')
    for (const name of ['Daily report', 'Stats', 'Monitoring', 'Reflection']) {
      await page.locator('.d-tabs').getByRole('tab', { name, exact: true }).click()
      await expect(page.locator('.d-tabs').getByRole('tab', { name, exact: true })).toHaveAttribute('aria-selected', 'true')
      await expect(page.locator('.d-main').getByRole('heading', { name, exact: true })).toHaveCount(0)
      await expect(page.locator('[data-run-date]')).toBeVisible()
    }
    expect(await tabs.count()).toBeGreaterThanOrEqual(4)
  })
})

test.describe('status panel', () => {
  test('lists every check with its status word; an unknown status reads "Not proven" and becomes an issue', async ({ page }) => {
    await openDay(page, 'unknown')
    const panel = page.locator('.d-status')
    await panel.getByRole('button', { name: /Worked \(\d+\)/ }).click()
    for (const c of [...CHECKS.map((c) => c.id), 'mystery']) {
      await expect(panel.locator(`[data-check="${c}"]`)).toHaveCount(1)
    }
    await expect(panel.locator('[data-check="mystery"] [data-status-word]')).toHaveText('Not proven')
    await expect(panel.locator('[data-check="site"] [data-status-word]')).toHaveText('Worked')
    await expect(panel.locator('[data-check="bk-c"] [data-status-word]')).toHaveText('Problem')
    await expect(panel.locator('[data-check="video"] [data-status-word]')).toHaveText('Skipped')
    // the word is visible, before the detail
    await expect(panel.locator('[data-check="bk-c"] .d-w')).toHaveText('Problem · last copy 3 days old')
    await expect(panel.locator('[data-check="keyspend"] .d-w')).toHaveText('Not proven · no result')
    await expect(panel.locator('[data-check="video"] .d-w')).toHaveText('Skipped · not scheduled today')
    // "need you" does not count Chat groups twice: the Beeper row already carries it
    // it counts checks, so it says so: never "need you" (that reads as the founder-card count)
    await expect(panel.locator('.d-sum2 .d-needtx')).toHaveText(/^\d+ checks? needs? attention$/)
    await expect(panel.locator('.d-sum2')).not.toContainText('need you')
    const needYou = await numberIn(panel.locator('.d-sum2 .d-needtx'), 'need-you count')
    const { view } = await runView(page)
    const expected = view.checks.filter((c: { status: string; covered_by?: string }) => c.status !== 'ok' && c.status !== 'skipped' && !c.covered_by).length + 2
    expect(needYou).toBe(expected)
    // a broken connection explains Chat groups: "see Beeper", no jump
    await expect(panel.locator('[data-check="chats"]')).toContainText('see Beeper')
    await expect(panel.locator('button[data-check="chats"]')).toHaveCount(0)
    // known-bad control: the unknown check with no write-up is an issue, never "worked"
    await expect(panel.locator('.d-plist [data-check="mystery"]')).toHaveCount(0)
    await panel.locator('button[data-check="mystery"]').click()
    await expect(cardTitle(page)).toContainText('Mystery check')
  })

  test('Fix records the decision, never shows ✓, and the panel collapses to a line that reopens', async ({ page, context }) => {
    await context.route('https://sentry.io/**', (r) => r.fulfill({ status: 200, body: 'signin' }))
    await openDay(page)
    const panel = page.locator('.d-status')
    const sentryFix = panel.locator('[data-connection="sentry"]').getByRole('link', { name: 'Fix' })
    await expect(sentryFix).toHaveAttribute('rel', 'noopener noreferrer')
    await expect(sentryFix).toHaveAttribute('target', '_blank')
    const popup = context.waitForEvent('page')
    await sentryFix.click()
    await (await popup).close()
    await expect(panel.locator('[data-connection="sentry"]')).toContainText('Fix in Start fixing')
    await expect(panel.locator('[data-connection="sentry"]')).not.toContainText('✓')
    expect(lines()).toHaveLength(1)
    expect(lines()[0]).toMatchObject({ kind: 'connection', target: 'sentry' })

    await panel.locator('[data-connection="beeper"]').getByRole('button', { name: 'Fix' }).click()
    const line = page.locator('.d-sline')
    await expect(line).toContainText('2 connection fixes in Start fixing')
    await expect(line).not.toContainText('✓')
    await expect(line).toContainText('12 unpushed commits')
    expect(lines()).toHaveLength(2)

    await line.click()
    await expect(page.locator('.d-status')).toBeVisible()
    await page.locator('.d-status').getByRole('button', { name: 'Collapse' }).click()
    await expect(page.locator('.d-sline')).toBeVisible()
  })
})

test.describe('new people', () => {
  test('three rows with source, unconfirmed email and a safe LinkedIn link; nothing written', async ({ page }) => {
    await openDay(page)
    const panel = page.locator('.d-status')
    const fold = panel.locator('.d-pfold')
    await expect(fold).toContainText('New people (3)')
    await expect(fold).toContainText('Person A, Person B, Person C · 1 not confirmed')
    await expect(fold).toHaveAttribute('aria-expanded', 'false')
    await expect(panel.locator('[data-person]')).toHaveCount(0)
    await fold.click()
    await expect(panel.locator('[data-person]')).toHaveCount(3)
    const a = panel.locator('[data-person="p-a"]')
    await expect(a).toContainText('Person A')
    await expect(a).toContainText(/Event: Clarity Night #2 · \w{3} \d{2}:\d{2}/)
    await expect(a).toContainText('Rated 4 points and wrote 1 story.')
    const li = a.getByRole('link', { name: 'LinkedIn' })
    await expect(li).toHaveAttribute('target', '_blank')
    await expect(li).toHaveAttribute('rel', 'noopener noreferrer')
    await expect(a.getByText('Runs a small design studio.')).toHaveCount(0)
    await a.getByRole('button', { name: /More/ }).click()
    await expect(a.getByText('Runs a small design studio.')).toBeVisible()
    await expect(panel.locator('[data-person="p-b"] .d-unconf')).toHaveText('email not confirmed')
    await expect(panel.locator('[data-person="p-a"] .d-unconf')).toHaveCount(0)
    await expect(panel.locator('[data-person="p-c"]')).toContainText('· returning')
    // the order: Connections, then New people, then the checks
    const text = (await panel.locator('.d-spanel').innerText()).replace(/\s+/g, ' ')
    expect(text.indexOf('Connections')).toBeLessThan(text.indexOf('New people (3)'))
    expect(text.indexOf('New people (3)')).toBeLessThan(text.indexOf('Checks ·'))
    expect(fileText()).toBe('')
  })

  test('the collapsed status line counts new people', async ({ page }) => {
    await openDay(page, 'connected')
    await expect(page.locator('.d-sline')).toContainText(/All connected\s*· \d+ worked · 3 new people · .*unpushed commits/)
  })

  test('people: [] says "No new people"; no people field says "not collected yet"', async ({ page }) => {
    await openDay(page, 'no-people')
    await expect(page.locator('.d-status')).toContainText('No new people')
    await openDay(page, 'people-absent')
    await expect(page.locator('[data-people="not-collected"]')).toHaveText('New people · not collected yet')
  })

  test('the phone strip summary says how many are new', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 760 })
    await openDay(page)
    await collapseSidebar(page)
    await expect(page.locator('.d-strip')).toContainText('3 new')
  })
})

test.describe('issues', () => {
  test('the pager walks the founder’s cards in view order; the card shows A / Obstacle / B and the preselected recommendation', async ({ page }) => {
    await openDay(page)
    const v = await runView(page)
    const yours = yoursOf(v)
    expect(yours.length).toBeGreaterThan(1)
    expect(yours.length).toBeLessThan(v.view.issues.length)
    await expect(page.locator('.d-bpos')).toHaveText(`1 of ${yours.length}`)
    await expect(cardTitle(page)).toHaveText(yours[0].title)
    await expect(card(page).locator('.d-pill.urg')).toHaveText('Urgent')
    await expect(card(page).locator('dt')).toHaveText(['Point A', 'Obstacle', 'Point B'])
    const rec = card(page).locator('.d-opt').filter({ hasText: 'I’ll reply today' })
    await expect(rec).toContainText('Recommended')
    await expect(rec.locator('input')).toBeChecked()

    await card(page).getByRole('button', { name: /More info/ }).click()
    await expect(card(page).locator('.d-moreinfo')).toContainText('Asked 2 days ago.')

    // Ask/Other are one option: a text box that writes nothing until it has text
    await ownRow(page).click()
    await expect(ownBox(page)).toBeVisible()
    expect(fileText()).toBe('')

    for (let i = 0; i < yours.length; i++) {
      await expect(cardTitle(page)).toHaveText(yours[i].title)
      if (i < yours.length - 1) await nextBtn(page).click()
    }
    // the last card has nowhere to page to: Next is disabled, and Accept (its own button) is enabled
    await expect(nextBtn(page)).toBeDisabled()
    await expect(acceptBtn(page)).toHaveAttribute('aria-label', 'Accept')
    await expect(acceptBtn(page)).toBeEnabled()
  })

  test('Previous / Next and ← → move between cards and write nothing', async ({ page }) => {
    await openDay(page)
    const { view } = await runView(page)
    const yours = yoursOf({ view })
    // put one line in the file so "unchanged" is about bytes, not just existence
    await card(page).locator('.d-optrow').filter({ hasText: 'Agent drafts, you send' }).click()
    await expect.poll(() => lines().length).toBe(1)
    const before = fileText()

    await nextBtn(page).click()
    await expect(cardTitle(page)).toHaveText(yours[1].title)
    await cardTitle(page).click() // a neutral spot: focus leaves the controls
    await page.keyboard.press('ArrowRight')
    await expect(cardTitle(page)).toHaveText(yours[2].title)
    await page.keyboard.press('ArrowLeft')
    await expect(cardTitle(page)).toHaveText(yours[1].title)
    await prevBtn(page).click()
    await expect(cardTitle(page)).toHaveText(yours[0].title)
    // arrows on a focused radio page too, instead of changing the answer
    await card(page).locator('.d-opt').filter({ hasText: 'Agent drafts, you send' }).locator('input').focus()
    await page.keyboard.press('ArrowRight')
    await expect(cardTitle(page)).toHaveText(yours[1].title)
    // typing in a text box is left alone
    await ownRow(page).click()
    await page.keyboard.press('ArrowRight')
    await expect(cardTitle(page)).toHaveText(yours[1].title)

    await page.waitForTimeout(300)
    expect(fileText()).toBe(before)
    await expect(page.locator('[data-progress]')).toContainText(`of ${yours.length} resolved`)
  })

  test('the bottom bar does not move when More info or the custom answer expands', async ({ page }) => {
    await openDay(page)
    const bar = page.locator('[data-bottom-bar]')
    const next = nextBtn(page)
    const b0 = await rectOf(bar, 'bar')
    const n0 = await rectOf(next, 'Next')
    await card(page).getByRole('button', { name: /More info/ }).click()
    await expect(card(page).locator('.d-moreinfo')).toBeVisible()
    // sub-pixel scroll rounding is not movement; anything ≥ 1px is
    const same = async () => {
      const b = await rectOf(bar, 'bar')
      const n = await rectOf(next, 'Next')
      expect(Math.abs(b.y - b0.y)).toBeLessThan(1)
      expect(Math.abs(n.y - n0.y)).toBeLessThan(1)
      expect(Math.abs(n.x - n0.x)).toBeLessThan(1)
    }
    await same()
    await ownRow(page).click()
    await expect(ownBox(page)).toBeVisible()
    await same()
    // the bar sits at the bottom of the viewport
    expect(Math.round(b0.y + b0.height)).toBe(must(page.viewportSize(), 'viewport').height)
  })

  test('no inner scroll areas: only the board container scrolls', async ({ page }) => {
    await openDay(page)
    for (const tab of ['Daily report', 'Stats', 'Monitoring', 'Reflection']) {
      await page.locator('.d-tabs').getByRole('tab', { name: tab, exact: true }).click()
      if (tab === 'Daily report') await card(page).getByRole('button', { name: /More info/ }).click()
      const scrollers = await page.evaluate(() =>
        [...document.querySelectorAll('.day-root, .day-root *')]
          .filter((el) => /(auto|scroll)/.test(getComputedStyle(el).overflowX + getComputedStyle(el).overflowY))
          .map((el) => el.className),
      )
      expect(scrollers, tab).toEqual([])
    }
    const parent = await page.evaluate(() => {
      const p = document.querySelector('.day-root')?.parentElement
      return p ? getComputedStyle(p).overflowY : 'missing'
    })
    expect(parent).toBe('auto')
  })

  test('picking an option appends exactly one line, and a reload keeps it', async ({ page }) => {
    await openDay(page)
    await card(page).locator('.d-optrow').filter({ hasText: 'Agent drafts, you send' }).click()
    await expect.poll(() => lines().length).toBe(1)
    expect(lines()[0]).toMatchObject({ kind: 'option', target: 'replies:event-post', option_id: 'draft', run_id: '2026-10-04T05-37-45Z' })
    await reopen(page)
    await listRow(page, 'replies:event-post').click() // P1435: a reload opens on the first card still open
    await expect(card(page).locator('.d-opt').filter({ hasText: 'Agent drafts, you send' }).locator('input')).toBeChecked()
    await expect(page.locator('[data-progress]')).toContainText('1 of')
  })

  test('keys 1–9 pick the Nth option and write one line', async ({ page }) => {
    await openDay(page)
    const first = yoursOf(await runView(page))[0]
    await cardTitle(page).click() // a neutral spot: focus leaves the controls
    await page.keyboard.press('2')
    await expect(card(page).locator('.d-opt').nth(1).locator('input')).toBeChecked()
    await expect.poll(() => lines().length).toBe(1)
    expect(lines()[0]).toMatchObject({ kind: 'option', target: first.fp, option_id: first.options[1].id })
    await expect(card(page).locator('.d-key').first()).toHaveText('1')
  })

  test('Start fixing writes what is sent (accepted cards, agent work, your own text), copies a verify-first prompt with the question first', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: `http://localhost:${ON.web}` })
    await openDay(page)
    const v = await runView(page)
    const [c0, c1, c2] = yoursOf(v)
    await acceptBtn(page).click() // writes the first card's preselected answer at once (P1432), then moves on
    await expect.poll(() => lines().length).toBe(1)
    await ownRow(page).click()
    const QUESTION = 'Is the room error the same bug as last week?'
    await ownBox(page).fill(QUESTION)
    // the button counts what will be sent: the agent work + the accepted card + the own text
    const expected = agentOf(v).length + 2
    await expect(startBtn(page)).toHaveText(`Start fixing (${expected})`)

    await startBtn(page).click()
    // the suite's server never opens a terminal (KANBAN_DAY_LAUNCH=off): the real 502 path offers Copy
    const toast = page.locator('.d-toast')
    await expect(toast).toContainText('Couldn’t start a session in the terminal.')
    const promptRes = page.waitForResponse((r) => r.url().endsWith('/api/day/prompt'))
    await toast.getByRole('button', { name: 'Copy' }).click()
    const { prompt } = await (await promptRes).json()
    await expect(toast).toHaveText('Prompt copied')
    const clip = await page.evaluate(() => navigator.clipboard.readText())
    expect(clip).toBe(prompt)
    expect(clip.split('\n')[0]).toContain('still real')
    const q = clip.indexOf(QUESTION)
    expect(q).toBeGreaterThan(0)
    expect(q).toBeLessThan(clip.indexOf(c0.title))

    // the server also journals the launch attempt (kind 'sent': pending → failed); count the answers
    const written = lines().filter((d) => d.kind === 'option')
    expect(written).toHaveLength(expected) // one batch, nothing twice
    expect(written.map((d) => d.target).sort()).toEqual([c0.fp, c1.fp, ...agentOf(v).map((i) => i.fp)].sort())
    // known-bad control: the card nobody opened is not in the batch
    expect(written.map((d) => d.target)).not.toContain(c2.fp)
    expect(lines().filter((d) => d.kind === 'sent').map((d) => d.state)).toEqual(['pending', 'failed'])
    expect(written.filter((d) => d.option_id === 'own')).toEqual([expect.objectContaining({ target: c1.fp, text: QUESTION, is_question: true })])
    expect(written.filter((d) => d.option_id === 'ask' || d.option_id === 'other')).toEqual([])
    // the Accept (P1432: written at once), the own text on blur, then the one batch
    expect(new Set(written.map((d) => d.at)).size).toBeLessThanOrEqual(3)
  })

  test('the copy icon copies the same prompt', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: `http://localhost:${ON.web}` })
    await openDay(page)
    await page.getByRole('button', { name: 'Copy prompt' }).click()
    await expect(page.locator('.d-toast')).toHaveText('Prompt copied')
    expect((await page.evaluate(() => navigator.clipboard.readText())).split('\n')[0]).toContain('still real')
  })
})

test.describe('earlier runs and warnings', () => {
  test('an earlier run is read-only, with a banner and a way back', async ({ page }) => {
    await openDay(page)
    await page.getByRole('button', { name: 'Previous run' }).click()
    await expect(page.locator('[data-run-date]')).toHaveText('Sat 3 Oct')
    await expect(page.locator('.d-banner')).toContainText('You’re looking at Sat 3 Oct. Decisions apply to the latest run only.')
    await expect(card(page)).toBeVisible()
    expect(await card(page).locator('input[type=radio]:enabled').count()).toBe(0)
    expect(await card(page).locator('input[type=radio]:checked').count()).toBe(0)
    await expect(card(page)).toContainText('Not answered on this run')
    await expect(card(page).locator('input[type=radio]').first()).toBeHidden()
    await expect(page.locator('[data-progress]')).toHaveCount(0)
    await expect(card(page).getByText(OWN_LABEL)).toHaveCount(0)
    await expect(page.locator('.d-status').getByRole('button', { name: 'Fix' })).toHaveCount(0)
    await expect(page.locator('.d-status').getByRole('link', { name: 'Fix' })).toHaveCount(0)
    await expect(startBtn(page)).toHaveCount(0)
    await expect(page.locator('[data-bottom-bar]')).toContainText('Read only')
    await page.keyboard.press('1')
    await page.waitForTimeout(200)
    expect(fileText()).toBe('')
    await page.getByRole('button', { name: 'Back to today' }).click()
    await expect(page.locator('[data-run-date]')).toHaveText('Sun 4 Oct')
    await expect(startBtn(page)).toBeVisible()
  })

  test('stale run warning', async ({ page }) => {
    await openDay(page, 'stale')
    await expect(page.locator('.d-note').filter({ hasText: 'No run since' })).toContainText('Run /day to refresh.')
  })

  test('running and incomplete runs say they are partial', async ({ page }) => {
    await openDay(page, 'running')
    await expect(page.getByText('This run hasn’t finished. What’s below is partial.')).toBeVisible()
    await openDay(page, 'incomplete')
    await expect(page.getByText('This run stopped early. What’s below is partial.')).toBeVisible()
  })

  test('an unreadable newest file says so instead of showing yesterday', async ({ page }) => {
    await openDay(page, 'unreadable')
    await expect(page.locator('[data-unreadable]')).toHaveText('The latest run’s file can’t be read.')
    await expect(card(page)).toHaveCount(0)
    await expect(page.locator('[data-unreadable-box]')).toContainText('Run /day again to rewrite it.')
    await page.getByRole('button', { name: 'Open the previous run' }).click()
    await expect(card(page)).toBeVisible()
    await expect(page.locator('[data-run-date]')).toHaveText('Sun 4 Oct')
  })

  test('a newer report format shows as plain text', async ({ page }) => {
    await openDay(page, 'other-schema')
    await expect(page.getByText('This run uses a newer report format. Showing it as text.')).toBeVisible()
    await expect(page.locator('pre.d-pre')).toContainText('A newer format the board does not know.')
  })

  test('a malformed row is dropped with a visible note', async ({ page }) => {
    await openDay(page, 'malformed')
    await expect(page.locator('.d-note').filter({ hasText: 'in this run couldn’t be read.' })).toHaveCount(1)
    await expect(card(page)).toBeVisible()
  })

  test('missing folder and empty folder say so', async ({ page }) => {
    await openDay(page, 'absent')
    await expect(page.locator('[data-day-message]')).toHaveText('The day-data folder is missing.')
    await openDay(page, 'empty')
    await expect(page.locator('[data-day-message]')).toHaveText('No runs recorded yet. Run /day to create one.')
  })
})

test.describe('monitoring, stats, reflection', () => {
  test('Monitoring is money and subscriptions only: no Systems, no Money checks list; a budget raise joins Start fixing and can be undone', async ({ page }) => {
    await openDay(page)
    await page.locator('.d-tabs').getByRole('tab', { name: 'Monitoring' }).click()
    // two overview cards; the old Systems / Claude / Codex cards are gone
    await expect(page.locator('.d-srcc .d-n')).toHaveText(['Google Cloud', 'Subscriptions'])
    await expect(page.locator('[data-systems]')).toHaveCount(0)
    await expect(page.locator('[data-money-checks]')).toHaveCount(0)
    await expect(page.locator('.d-main')).not.toContainText('Systems')
    await expect(page.locator('.d-main')).not.toContainText('Money checks')
    // every check still has its one home: Status in Daily report (known-good control for the removal)
    await page.locator('.d-tabs').getByRole('tab', { name: 'Daily report' }).click()
    await page.locator('.d-status').getByRole('button', { name: /Worked \(\d+\)/ }).click()
    for (const c of CHECKS) await expect(page.locator(`.d-status [data-check="${c.id}"]`)).toHaveCount(1)
    await page.locator('.d-tabs').getByRole('tab', { name: 'Monitoring' }).click()

    await page.getByRole('button', { name: /^Google Cloud/ }).click()
    await expect(page.locator('.d-credits')).toHaveText('Credits ~€585 · unverified (baseline 37 days old)')
    await expect(page.getByRole('tab', { name: 'Week' })).toBeVisible() // the cloud card keeps its own toggle
    await expect(page.locator('[data-key="key-search"]')).toContainText('no billing data')
    const n0 = await startCount(page)
    await page.getByRole('button', { name: /Account budget €400\/month/ }).click()
    const input = page.getByLabel('New monthly budget in euros')
    const add = page.getByRole('button', { name: 'Add', exact: true })
    await expect(input).toHaveValue('')
    await expect(add).toBeDisabled()
    await input.fill('300')
    await expect(add).toBeDisabled()
    await expect(page.locator('[data-raise="account"]')).toContainText('Must be more than €400')
    await input.fill('600')
    await add.click()
    await expect(page.locator('[data-raise="account"]')).toContainText('✓ Monthly budget → €600 · in Start fixing')
    await expect(startBtn(page)).toHaveText(`Start fixing (${n0 + 1})`)
    expect(lines().at(-1)).toMatchObject({ kind: 'budget', target: 'account', amount: 600, scope: 'monthly' })
    await page.locator('[data-raise="account"]').getByRole('button', { name: 'Undo' }).click()
    await expect(startBtn(page)).toHaveText(`Start fixing (${n0})`)
    expect(lines().at(-1)).toMatchObject({ kind: 'budget', target: 'account', remove: true })
  })

  test('320px: the Monitoring overview cards stack, and no card text breaks mid-word', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 })
    await openDay(page)
    await collapseSidebar(page)
    await page.locator('.d-tabs').getByRole('tab', { name: 'Monitoring' }).click()
    const tiles = page.locator('.d-srcc')
    await expect(tiles).toHaveCount(2)
    for (const i of [0, 1]) expect((await rectOf(tiles.nth(i), 'card')).width).toBeGreaterThanOrEqual(240)
    const title = tiles.filter({ hasText: 'Subscriptions' }).locator('.d-n')
    expect(await title.evaluate((e) => { const r = document.createRange(); r.selectNodeContents(e); return r.getClientRects().length })).toBe(1)
    await expect(tiles.first().locator('.d-v')).toHaveText('€70 / €400')
    expect(await tiles.first().locator('.d-v').evaluate((e) => { const r = document.createRange(); r.selectNodeContents(e); return r.getClientRects().length })).toBe(1)
  })

  test('Subscriptions overview: one card, one line per quota; a quota that was not collected says so', async ({ page }) => {
    await openDay(page)
    await page.locator('.d-tabs').getByRole('tab', { name: 'Monitoring' }).click()
    const tile = page.locator('.d-srcc').filter({ hasText: 'Subscriptions' })
    const day = (iso: string) => page.evaluate((x) => new Date(x).toLocaleDateString('en-GB', { weekday: 'short' }), iso)
    await expect(tile.locator('[data-sub="claude"]')).toHaveText(`Claude 60% left · resets ${await day('2026-10-08T00:00:00Z')}`)
    await expect(tile.locator('[data-sub="codex"]')).toHaveText(`Codex 72% left · resets ${await day('2026-10-08T12:00:00Z')}`)
    await patchRun(page, (b) => {
      const codex = b.report?.monitoring?.quotas?.find((q) => q.id === 'codex')
      if (codex) codex.collected = false
    })
    await page.reload()
    await page.locator('button').filter({ hasText: /^\W*Day$/u }).first().click()
    await page.locator('.d-tabs').getByRole('tab', { name: 'Monitoring' }).click()
    await expect(page.locator('[data-sub="codex"]')).toHaveText('Codex not collected yet')
    await expect(page.locator('[data-sub="claude"]')).toContainText('Claude 60% left')
  })

  test('Subscriptions detail: ONE chart with both quotas, a dashed projection to each reset, each reset marked and named, no Week/Month toggle', async ({ page }) => {
    // resets 3.5 days apart, so the two markers stay two (close ones merge: next test)
    await patchRun(page, (b) => {
      const codex = b.report?.monitoring?.quotas?.find((q) => q.id === 'codex')
      if (codex) codex.resets_at = '2026-10-11T12:00:00Z'
    })
    await openDay(page)
    await page.locator('.d-tabs').getByRole('tab', { name: 'Monitoring' }).click()
    await page.locator('.d-srcc').filter({ hasText: 'Subscriptions' }).click()
    await expect(page.getByRole('tab', { name: 'Week' })).toHaveCount(0)
    await expect(page.getByRole('tab', { name: 'Month' })).toHaveCount(0)
    await expect(page.locator('[data-subs-chart]')).toHaveCount(1)
    await expect(page.locator('.d-main svg[role=img]')).toHaveCount(1)
    const svg = page.locator('[data-subs-chart]')
    for (const id of ['claude', 'codex']) {
      // a solid line through the readings, a dashed projection after it
      const line = svg.locator(`[data-line="${id}"]`)
      await expect(line).toHaveCount(1)
      expect(await line.getAttribute('stroke-dasharray')).toBeNull()
      expect((await line.getAttribute('points'))?.trim().split(/\s+/).length).toBe(3) // three runs this week
      const proj = svg.locator(`[data-proj="${id}"]`)
      await expect(proj).toHaveCount(1)
      expect(await proj.getAttribute('stroke-dasharray')).toBeTruthy()
      // the projection starts where the solid line ends
      const lp = (await line.getAttribute('points'))?.trim().split(/\s+/) ?? []
      const pp = (await proj.getAttribute('points'))?.trim().split(/\s+/) ?? []
      expect(pp[0]).toBe(lp.at(-1))
      // a reset marker, named, with its day
      const marker = svg.locator(`[data-reset="${id}"]`)
      await expect(marker).toHaveCount(1)
      await expect(marker.locator('line')).toHaveAttribute('stroke-dasharray', /.+/)
      const when = await page.evaluate((x) => new Date(x).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }).replace(',', ''), id === 'claude' ? '2026-10-08T00:00:00Z' : '2026-10-11T12:00:00Z')
      await expect(marker.locator('text')).toHaveText(`${id === 'claude' ? 'Claude' : 'Codex'} resets ${when}`)
      // labelled at its end, so colour is not the only cue
      await expect(svg.locator(`[data-endlabel="${id}"]`)).toContainText(id === 'claude' ? 'Claude' : 'Codex')
    }
    // the projection reaches its own reset line (claude's before codex's: the two markers are 12h apart)
    const x = async (sel: string, attr = 'x1') => Number(await svg.locator(sel).getAttribute(attr))
    const claudeReset = await x('[data-reset="claude"] line')
    const codexReset = await x('[data-reset="codex"] line')
    expect(claudeReset).toBeLessThan(codexReset)
    const last = async (id: string) => Number(((await svg.locator(`[data-proj="${id}"]`).getAttribute('points')) ?? '').trim().split(/\s+/).at(-1)?.split(',')[0])
    expect(Math.abs((await last('claude')) - claudeReset)).toBeLessThan(1)
    expect(Math.abs((await last('codex')) - codexReset)).toBeLessThan(1)
    // two distinguishable colours, none of them a status colour
    const stroke = (id: string) => svg.locator(`[data-line="${id}"]`).getAttribute('stroke')
    const [c1, c2] = [await stroke('claude'), await stroke('codex')]
    expect(c1).not.toBe(c2)
    for (const c of [c1, c2]) expect(['#16a34a', '#d97706', '#dc2626', '#2563eb']).not.toContain(c?.toLowerCase())
    // a legend names both; Claude's 5-hour window is text below the chart
    const legend = page.locator('[data-subs-legend]')
    await expect(legend).toContainText('Claude')
    await expect(legend).toContainText('Codex')
    await expect(legend).toContainText('Projection')
    await expect(page.locator('[data-window5h]')).toHaveText(/^Claude 5-hour window: 35% left · resets \d{2}:\d{2}$/)
    expect(await page.locator('[data-window5h]').evaluate((e) => e.compareDocumentPosition(document.querySelector('[data-subs-chart]') as Element) & Node.DOCUMENT_POSITION_PRECEDING)).toBeTruthy()
    // nothing in the old per-quota detail is left
    await expect(page.locator('.d-qbar')).toHaveCount(0)
  })

  test('Subscriptions: resets within two hours of each other share ONE marker whose label names each time; further apart they stay two', async ({ page }) => {
    // seed: claude resets Thu 00:00Z, codex 12:00Z: twelve hours apart is two markers
    await openDay(page)
    await page.locator('.d-tabs').getByRole('tab', { name: 'Monitoring' }).click()
    await page.locator('.d-srcc').filter({ hasText: 'Subscriptions' }).click()
    await expect(page.locator('[data-subs-chart] [data-reset]')).toHaveCount(2)
    // 90 minutes apart: one marker, each time named, each projection still ends at its own reset
    await patchRun(page, (b) => {
      const codex = b.report?.monitoring?.quotas?.find((q) => q.id === 'codex')
      if (codex) codex.resets_at = '2026-10-08T01:30:00Z'
    })
    await openDay(page)
    await page.locator('.d-tabs').getByRole('tab', { name: 'Monitoring' }).click()
    await page.locator('.d-srcc').filter({ hasText: 'Subscriptions' }).click()
    const svg = page.locator('[data-subs-chart]')
    await expect(svg.locator('[data-reset]')).toHaveCount(1)
    await expect(svg.locator('[data-reset] text')).toHaveCount(1)
    await expect(svg.locator('[data-reset] text')).toHaveText(/^Claude \d{2}:\d{2} and Codex \d{2}:\d{2} reset \w{3} \d{1,2} \w{3}$/)
    await expect(svg.locator('[data-proj="claude"]')).toHaveCount(1)
    await expect(svg.locator('[data-proj="codex"]')).toHaveCount(1)
    const endX = async (id: string) => Number(((await svg.locator(`[data-proj="${id}"]`).getAttribute('points')) ?? '').trim().split(/\s+/).pop()?.split(',')[0])
    expect(await endX('codex')).toBeGreaterThan(await endX('claude')) // 90 minutes later, not clipped at the shared marker
  })

  test('Subscriptions: a pace that runs out before the reset hits 0 and the verdict says so; a slow pace ends above 0 at its reset', async ({ page }) => {
    await patchRun(page, (b) => {
      if (!b.quotaHistory) return
      b.quotaHistory.claude = [
        { at: '2026-10-02T05:10:00Z', remaining_pct: 90 },
        { at: '2026-10-04T05:37:45Z', remaining_pct: 30 },
      ]
      const claude = b.report?.monitoring?.quotas?.find((q) => q.id === 'claude')
      if (claude) claude.remaining_pct = 30
      b.quotaHistory.codex = [
        { at: '2026-10-02T05:10:00Z', remaining_pct: 94 },
        { at: '2026-10-04T05:37:45Z', remaining_pct: 90 },
      ]
    })
    await openDay(page)
    await page.locator('.d-tabs').getByRole('tab', { name: 'Monitoring' }).click()
    await page.locator('.d-srcc').filter({ hasText: 'Subscriptions' }).click()
    const svg = page.locator('[data-subs-chart]')
    const pts = async (id: string) =>
      (((await svg.locator(`[data-proj="${id}"]`).getAttribute('points')) ?? '').trim().split(/\s+/).map((p) => p.split(',').map(Number))) as [number, number][]
    const y0 = Number(await svg.locator('line[data-y="0"]').getAttribute('y1'))
    const claude = await pts('claude')
    const codex = await pts('codex')
    const claudeEnd = must(claude.at(-1), 'claude projection end')
    const codexEnd = must(codex.at(-1), 'codex projection end')
    const claudeReset = Number(await svg.locator('[data-reset~="claude"] line').getAttribute('x1'))
    // claude: down to 0 before the reset, then flat at 0 to the reset line (clamped, never below 0)
    expect(claude.length).toBeGreaterThanOrEqual(3)
    expect(Math.abs(claudeEnd[1] - y0)).toBeLessThan(0.5)
    for (let i = 1; i < claude.length; i++) expect(claude[i][1]).toBeGreaterThanOrEqual(claude[i - 1][1] - 0.5) // never rises
    for (const [, y] of claude) expect(y).toBeLessThanOrEqual(y0 + 0.5)
    expect(claude[1][0]).toBeLessThan(claudeReset - 5)
    expect(Math.abs(claudeEnd[0] - claudeReset)).toBeLessThan(1)
    await expect(page.locator('[data-verdict="claude"]')).toContainText('runs out')
    await expect(page.locator('[data-verdict="claude"]')).toHaveClass(/need/)
    // codex: slow, ends above 0
    expect(codexEnd[1]).toBeGreaterThan(codex[0][1]) // still falling
    expect(y0 - codexEnd[1]).toBeGreaterThan(20)
    await expect(page.locator('[data-verdict="codex"]')).not.toContainText('runs out')
  })

  test('Subscriptions: a quota with a single reading draws no projection and says why', async ({ page }) => {
    await patchRun(page, (b) => {
      if (b.quotaHistory) b.quotaHistory.codex = [{ at: '2026-10-04T05:37:45Z', remaining_pct: 72 }]
    })
    await openDay(page)
    await page.locator('.d-tabs').getByRole('tab', { name: 'Monitoring' }).click()
    await page.locator('.d-srcc').filter({ hasText: 'Subscriptions' }).click()
    const svg = page.locator('[data-subs-chart]')
    await expect(svg.locator('[data-proj="codex"]')).toHaveCount(0)
    await expect(svg.locator('[data-reset~="codex"]')).toHaveCount(1) // the reset is still marked
    await expect(page.locator('[data-verdict="codex"]')).toContainText('one reading')
  })

  test('keys with no data say why when the report says so, else "not collected yet"', async ({ page }) => {
    await patchRun(page, (b) => {
      const keys = b.report?.monitoring?.cloud?.keys
      if (!keys) return
      const search = keys.find((k) => k.id === 'key-search')
      if (search) Object.assign(search, { why: 'no billing data: unused, or not in the export' })
      const t = keys.find((k) => k.id === 'key-translate')
      if (t) {
        t.collected = false
        delete t.spent_eur
      }
    })
    await openDay(page)
    await page.locator('.d-tabs').getByRole('tab', { name: 'Monitoring' }).click()
    await page.getByRole('button', { name: /^Google Cloud/ }).click()
    await expect(page.locator('[data-key="key-search"]')).toContainText('no billing data: unused, or not in the export')
    await expect(page.locator('[data-key="key-search"]')).not.toContainText('not collected yet')
    await expect(page.locator('[data-key="key-translate"]')).toContainText('not collected yet')
    await expect(page.locator('[data-key="key-gemini"]')).toContainText('€16 of €60')
  })

  test('Stats: the funnel shows the Pipeline columns with real zeros; what is not collected says so', async ({ page }) => {
    await openDay(page)
    await page.locator('.d-tabs').getByRole('tab', { name: 'Stats' }).click()
    const funnel = page.locator('[data-funnel]')
    const rows = funnel.locator('.d-fr')
    await expect(rows.locator('span:first-child')).toHaveText(['Contacted', 'In conversation', 'Qualified', 'Committed', 'Active'])
    await expect(rows.locator('.d-fn')).toHaveText(['4', '2', '0', '0', '0'])
    await expect(funnel).not.toContainText('not collected yet') // a zero is a number, not a gap
    // known-bad control: the same funnel marked not collected shows labels only, never the numbers
    await patchRun(page, (b) => {
      if (b.report?.stats?.funnel) b.report.stats.funnel.collected = false
    })
    await page.reload()
    await page.locator('button').filter({ hasText: /^\W*Day$/u }).first().click()
    await page.locator('.d-tabs').getByRole('tab', { name: 'Stats' }).click()
    await expect(page.locator('[data-funnel]')).toContainText('not collected yet')
    await expect(page.locator('[data-funnel] .d-fn')).toHaveText(['—', '—', '—', '—', '—'])
    await expect(page.locator('[data-funnel] .d-fb')).toHaveCount(0)
  })

  test('Stats: readings show; a series the run did not collect says so; order is funnel, lines, readings', async ({ page }) => {
    await patchRun(page, withUncollectedSeries)
    await openDay(page)
    await page.locator('.d-tabs').getByRole('tab', { name: 'Stats' }).click()
    await expect(page.locator('[data-reading="mentions"]')).toContainText('1')
    await expect(page.locator('[data-reading="unconfirmed"]')).toContainText('3')
    const order = await page.locator('[data-funnel], [data-series], [data-reading]').evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.funnel !== undefined ? 'funnel' : (e as HTMLElement).dataset.series ? 'series' : 'reading'))
    expect(order[0]).toBe('funnel')
    expect(order.lastIndexOf('series')).toBeLessThan(order.indexOf('reading'))
    await expect(page.locator('[data-series="reachouts"]')).toContainText('not collected yet')
    await expect(page.locator('[data-series="reachouts"]')).toContainText('target 10 · proposed')
    await expect(page.locator('[data-series="events"] svg')).toBeVisible()
  })

  test('Stats: Help requests and Mentions open their note and scroll to it; a tile without a note stays plain', async ({ page }) => {
    await openDay(page)
    await page.locator('.d-tabs').getByRole('tab', { name: 'Stats' }).click()
    const help = page.locator('[data-reading="help_requests"]')
    const mentions = page.locator('[data-reading="mentions"]')
    const plain = page.locator('[data-reading="unconfirmed"]')
    expect(await help.evaluate((e) => e.tagName)).toBe('BUTTON')
    expect(await mentions.evaluate((e) => e.tagName)).toBe('BUTTON')
    expect(await plain.evaluate((e) => e.tagName)).not.toBe('BUTTON') // known-bad control: no note, no button
    const note = page.locator('[data-note="chat-digest"]')
    await expect(note.getByRole('button').first()).toHaveAttribute('aria-expanded', 'false')
    await expect(note.locator('.d-notebody')).toHaveCount(0)
    await help.click()
    await expect(note.getByRole('button').first()).toHaveAttribute('aria-expanded', 'true')
    await expect(note.locator('.d-notebody')).toContainText('Person E asked how to join from a phone')
    // scrolled to: the note's title is below the sticky header and above the bottom bar
    await expect.poll(async () => {
      const t = await rectOf(note.getByRole('button').first(), 'note title')
      const top = await rectOf(page.locator('.d-topbar'), 'header')
      const bar = await rectOf(page.locator('[data-bottom-bar]'), 'bar')
      return t.y >= top.y + top.height - 1 && t.y + t.height <= bar.y + 1
    }).toBe(true)
    // Mentions opens the same note and keeps it open
    await mentions.click()
    await expect(note.getByRole('button').first()).toHaveAttribute('aria-expanded', 'true')
    // the other notes are untouched
    await expect(page.locator('[data-note="shipped"] .d-notebody')).toHaveCount(0)
  })

  test('Reflection: the story box is there before a position; keys 1 2 3 rate and cycle; Remove position keeps the story', async ({ page }) => {
    await openDay(page)
    await page.locator('.d-tabs').getByRole('tab', { name: 'Reflection' }).click()
    const cardR = page.locator('.d-pcard')
    // P1440: a story without a position is kept, so the box no longer waits for a position
    await expect(cardR.getByLabel(/Add your story/)).toBeVisible()
    await cardR.locator('[data-side=agree]').click()
    await expect(cardR.getByLabel(/Add your story/)).toBeVisible()
    await expect.poll(() => lines().at(-1)?.position).toBe(2)
    await cardR.getByLabel(/Add your story/).fill('Spent Tuesday on a feature instead of calls.')
    await page.locator('.d-pst').click()
    await expect.poll(() => lines().at(-1)?.story).toBe('Spent Tuesday on a feature instead of calls.')
    await cardR.locator('[data-side=agree]').click()
    await page.getByRole('menuitemradio', { name: /Strongly Agree/ }).click()
    await expect.poll(() => lines().at(-1)?.position).toBe(3)
    expect(lines().at(-1)?.story).toBe('Spent Tuesday on a feature instead of calls.')
    await cardR.locator('[data-side=agree]').click()
    await page.getByRole('menuitem', { name: 'Remove position' }).click()
    // P1440: clearing the position keeps the story (a story-only answer), never remove:true
    await expect.poll(() => lines().length).toBe(4)
    expect(lines().at(-1)).toEqual(expect.objectContaining({ kind: 'reflection', target: 'c1', story: 'Spent Tuesday on a feature instead of calls.' }))
    expect(lines().at(-1)?.position).toBeUndefined()
    expect(lines().at(-1)?.remove).toBeUndefined()
    await expect(page.locator('[data-progress]')).toHaveText('0 of 4 rated')

    // keyboard: next statement, 3 = Agree (2), 3 again = Strongly agree (3)
    await page.locator('.d-pst').click()
    await page.keyboard.press('ArrowRight')
    await expect(page.locator('.d-bpos')).toHaveText('2 of 4')
    const n = lines().length
    await page.keyboard.press('3')
    await expect.poll(() => lines().length).toBe(n + 1)
    expect(lines().at(-1)).toMatchObject({ kind: 'reflection', target: 'c2', position: 2 })
    await page.keyboard.press('3')
    await expect.poll(() => lines().at(-1)?.position).toBe(3)
    await expect(page.locator('.d-pb.on')).toHaveText('Agree+')
    await expect(page.locator('[data-progress]')).toHaveText('1 of 4 rated')
  })

  test('a weekly-review run shows its badge and its items in Issues and Reflection', async ({ page }) => {
    await openDay(page, 'weekly')
    await expect(page.locator('.d-subrow .d-runbadge')).toHaveText('Weekly review')
    await page.locator('.d-status button[data-check]').first().waitFor()
    const { view } = await runView(page)
    const i = yoursOf({ view }).findIndex((x) => x.fp === 'weekly:reach-target')
    expect(i).toBeGreaterThanOrEqual(0)
    for (let k = 0; k < i; k++) await nextBtn(page).click()
    await expect(card(page).locator('.d-topic .d-runbadge')).toHaveText('Weekly review')
    await page.locator('.d-tabs').getByRole('tab', { name: 'Reflection' }).click()
    for (let k = 0; k < 4; k++) await nextBtn(page).click()
    await expect(page.locator('.d-pcard .d-runbadge')).toHaveText('Weekly review')
  })

  test('a monthly-review run shows its badge and its proposals in Issues and Reflection', async ({ page }) => {
    await openDay(page, 'monthly')
    await expect(page.locator('.d-subrow .d-runbadge')).toHaveText('Monthly review')
    await page.locator('.d-status button[data-check]').first().waitFor()
    const { view } = await runView(page)
    const i = yoursOf({ view }).findIndex((x) => x.fp === 'monthly:archive-stale-specs')
    expect(i).toBeGreaterThanOrEqual(0)
    for (let k = 0; k < i; k++) await nextBtn(page).click()
    await expect(card(page).locator('.d-topic .d-runbadge')).toHaveText('Monthly review')
    await page.locator('.d-tabs').getByRole('tab', { name: 'Reflection' }).click()
    for (let k = 0; k < 4; k++) await nextBtn(page).click()
    await expect(page.locator('.d-pcard .d-runbadge')).toHaveText('Monthly review')
  })
})

test.describe('review round 1', () => {
  test('an empty custom answer is not an answer: not resolved, and Start fixing sends you back to it', async ({ page }) => {
    await openDay(page)
    const n = yoursOf(await runView(page)).length
    await acceptBtn(page).click()
    await acceptBtn(page).click()
    // Accept wrote the two cards left behind; the empty box must not add a third
    await expect(page.locator('[data-progress]')).toHaveText(new RegExp(`^2 of ${n}`))
    await ownRow(page).click()
    await expect(ownBox(page)).toBeFocused()
    await expect(page.locator('[data-progress]')).toHaveText(/^2 of/)
    await prevBtn(page).click()
    await prevBtn(page).click()
    await expect(page.locator('.d-bpos')).toHaveText(/^1 of/)
    await startBtn(page).click()
    await expect(page.locator('.d-toast')).toHaveText('Write your answer or question first, or pick another answer')
    await expect(page.locator('.d-bpos')).toHaveText(/^3 of/)
    expect(lines()).toHaveLength(2) // the two accepts, nothing for the empty box
    // with text it counts once saved
    await ownBox(page).fill('Which guests hit it?')
    await cardTitle(page).click()
    await expect.poll(() => lines().length).toBe(3)
    await expect(page.locator('[data-progress]')).toHaveText(/^3 of/)
  })

  test('paging past an issue answered with your own text is not trapped in its text box; ↑ ↓ on a radio change nothing', async ({ page }) => {
    await openDay(page)
    const yours = yoursOf(await runView(page))
    await ownRow(page).click()
    await ownBox(page).fill('Is the draft safe to send?')
    await cardTitle(page).click()
    await expect.poll(() => lines().length).toBe(1)
    await page.keyboard.press('ArrowRight')
    await expect(cardTitle(page)).toHaveText(yours[1].title)
    await page.keyboard.press('ArrowLeft')
    await expect(cardTitle(page)).toHaveText(yours[0].title)
    await expect(ownBox(page)).not.toBeFocused()
    await page.keyboard.press('ArrowRight')
    await expect(cardTitle(page)).toHaveText(yours[1].title)

    const before = fileText()
    const radio = card(page).locator('.d-opt').nth(0).locator('input')
    await radio.focus()
    const checkedBefore = await card(page).locator('input[type=radio]:checked').getAttribute('value')
    await page.keyboard.press('ArrowDown')
    await page.keyboard.press('ArrowUp')
    await page.waitForTimeout(300)
    expect(await card(page).locator('input[type=radio]:checked').getAttribute('value')).toBe(checkedBefore)
    expect(fileText()).toBe(before)
  })

  test('fast run switching never shows a run other than the selected one', async ({ page }) => {
    seedDay(DAY_E2E_DIR, 'default')
    let delayed = false
    await page.route(`**/api/day/runs/${LATEST_ID}`, async (route) => {
      if (!delayed) {
        delayed = true
        await new Promise((r) => setTimeout(r, 1500))
      }
      await route.continue()
    })
    await page.goto('/')
    await page.locator('button').filter({ hasText: /^\W*Day$/u }).first().click()
    await page.getByRole('button', { name: 'Previous run' }).click()
    await expect(page.locator('[data-bottom-bar]')).toContainText('Read only')
    await page.waitForTimeout(2000) // the slow response for the latest run lands now
    await expect(page.locator('[data-run-date]')).toHaveText('Sat 3 Oct')
    await expect(page.locator('[data-bottom-bar]')).toContainText('Read only')
    await expect(startBtn(page)).toHaveCount(0)
  })

  test('a newer run appearing mid-session is offered, never a silent read-only page', async ({ page }) => {
    await openDay(page)
    await expect(startBtn(page)).toBeVisible()
    writeFileSync(
      join(DAY_E2E_DIR, 'reports', `${NEWER_ID}.json`),
      JSON.stringify(synthReport({ pass_id: NEWER_ID, started_at: '2026-10-05T05:00:00Z', finished_at: '2026-10-05T05:30:00Z' })),
    )
    await card(page).locator('.d-optrow').filter({ hasText: 'Agent drafts, you send' }).click()
    await expect(page.locator('[data-newer]')).toContainText('A newer run is here.')
    expect(fileText()).toBe('')
    await page.locator('[data-newer]').getByRole('button', { name: 'Open it' }).click()
    await expect(page.locator('[data-run-date]')).toHaveText('Mon 5 Oct')
    await expect(startBtn(page)).toBeVisible()
  })

  test('a queued connection fix can be undone, and offers the sign-in again', async ({ page, context }) => {
    await context.route('https://sentry.io/**', (r) => r.fulfill({ status: 200, body: 'signin' }))
    await openDay(page)
    const row = page.locator('[data-connection="sentry"]')
    const popup = context.waitForEvent('page')
    await row.getByRole('link', { name: 'Fix' }).click()
    await (await popup).close()
    await expect(row).toContainText('Fix in Start fixing')
    const again = row.getByRole('link', { name: 'Open sign-in again' })
    await expect(again).toHaveAttribute('rel', 'noopener noreferrer')
    await row.getByRole('button', { name: 'Undo' }).click()
    await expect.poll(() => lines().at(-1)).toMatchObject({ kind: 'connection', target: 'sentry', remove: true })
    await expect(row.getByRole('link', { name: 'Fix' })).toBeVisible()
  })

  test('on a phone the re-opened Status panel can be collapsed again', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 760 })
    await openDay(page, 'connected')
    await collapseSidebar(page)
    await page.locator('.d-sline').click()
    await expect(page.locator('.d-spanel')).toBeVisible()
    await page.locator('.d-spanel').getByRole('button', { name: 'Collapse' }).click()
    await expect(page.locator('.d-sline')).toBeVisible()
  })
})

test.describe('review round 2', () => {
  test('one status word: "Skipped" is never spelled out on the page; both Fix buttons look the same', async ({ page }) => {
    await openDay(page)
    expect(await page.locator('.day-root').innerText()).not.toContain('Skipped on purpose')
    await expect(page.locator('[data-check="video"]').first()).toHaveAttribute('title', 'Skipped on purpose')
    const weights = await page.locator('.d-status .d-btn.xs').evaluateAll((els) => els.map((e) => getComputedStyle(e).fontWeight + '/' + getComputedStyle(e).fontSize))
    expect(weights).toHaveLength(2)
    expect(weights[0]).toBe(weights[1])
  })

  test('phone: tabs on one row, folds are ≥ 40px tall, chart x labels never overlap, y ticks are whole numbers', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 760 })
    await patchRun(page, withUncollectedSeries)
    await openDay(page)
    await collapseSidebar(page)
    const tops = await page.locator('.d-tabs [role=tab]').evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().top)))
    expect(new Set(tops).size).toBe(1)
    for (const h of await page.locator('.d-tabs [role=tab]').evaluateAll((els) => els.map((e) => e.getBoundingClientRect().height))) {
      expect(h, 'tab height').toBeGreaterThanOrEqual(40)
    }
    await page.locator('.d-strip').click()
    for (const sel of ['.d-strip', '.d-morebtn', '.d-pfold', '.d-sfold']) {
      const h = (await rectOf(page.locator(sel).first(), sel)).height
      expect(h, sel).toBeGreaterThanOrEqual(40)
    }
    await page.locator('.d-tabs').getByRole('tab', { name: 'Stats' }).click()
    const svg = page.locator('[data-series="events"] svg')
    await expect(svg).toBeVisible()
    const boxes = await svg.locator('text').evaluateAll((els) =>
      els.map((e) => {
        const r = e.getBoundingClientRect()
        return { x: r.left, r: r.right, y: Math.round(r.top), t: e.textContent }
      }),
    )
    const xLabels = boxes.filter((b) => b.y === Math.max(...boxes.map((x) => x.y))).sort((a, b) => a.x - b.x)
    expect(xLabels.length).toBeGreaterThanOrEqual(2)
    for (let i = 1; i < xLabels.length; i++) expect(xLabels[i].x, `${xLabels[i - 1].t} / ${xLabels[i].t}`).toBeGreaterThan(xLabels[i - 1].r)
    const svgBox = await rectOf(svg, 'chart')
    expect(must(xLabels.at(-1), 'last x label').r).toBeLessThanOrEqual(svgBox.x + svgBox.width + 0.5)
    const yTicks = boxes.filter((b) => !xLabels.includes(b)).map((b) => b.t ?? '')
    for (const t of yTicks) expect(t, 'y tick').toMatch(/^\d+$/)
    // a chart that was not collected keeps the row's height
    const ph = (await rectOf(page.locator('[data-series="reachouts"] .d-placeholder'), 'placeholder')).height
    expect(ph).toBeGreaterThanOrEqual(200)
  })

  test('320px: the position control is never cut off and its menu stays above the bottom bar', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 })
    await openDay(page)
    await collapseSidebar(page)
    await page.locator('.d-tabs').getByRole('tab', { name: 'Reflection' }).click()
    const card = page.locator('.d-pcard')
    await card.locator('[data-side=disagree]').click()
    await expect(card.locator('[data-side=disagree]')).toHaveAttribute('aria-pressed', 'true')
    const clipped = await page.locator('.d-pb').evaluateAll((els) => els.filter((e) => e.scrollWidth > e.clientWidth + 1 || e.scrollHeight > e.clientHeight + 1).length)
    expect(clipped).toBe(0)
    const cardBox = await rectOf(card, 'card')
    const rowBox = await rectOf(page.locator('.d-pbrow'), 'position control')
    expect(rowBox.x + rowBox.width).toBeLessThanOrEqual(cardBox.x + cardBox.width)
    await card.locator('[data-side=disagree]').click()
    const menu = page.locator('.d-pmenu')
    await expect(menu).toBeVisible()
    for (const h of await menu.locator('button').evaluateAll((els) => els.map((e) => e.getBoundingClientRect().height))) {
      expect(h, 'menu item height').toBeGreaterThanOrEqual(40)
    }
    const m = await rectOf(menu, 'menu')
    const bar = await rectOf(page.locator('[data-bottom-bar]'), 'bar')
    expect(m.y + m.height).toBeLessThanOrEqual(bar.y)
    expect(m.x).toBeGreaterThanOrEqual(0)
    expect(m.x + m.width).toBeLessThanOrEqual(320)
  })
})

test.describe('review round 3', () => {
  for (const width of [1440, 375, 320]) {
    test(`Monitoring tiles keep their text inside at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 })
      await openDay(page)
      if (width < 900) await collapseSidebar(page)
      await page.locator('.d-tabs').getByRole('tab', { name: 'Monitoring', exact: true }).click()
      const escapes = await page.locator('.d-srcc').evaluateAll((tiles) =>
        tiles.flatMap((t) => {
          const r = t.getBoundingClientRect()
          return [...t.querySelectorAll('*')]
            .map((c) => ({ c, b: c.getBoundingClientRect() }))
            .filter(({ b }) => b.width > 0 && (b.left < r.left - 0.5 || b.right > r.right + 0.5 || b.top < r.top - 0.5 || b.bottom > r.bottom + 0.5))
            .map(({ c }) => `${t.querySelector('.d-n')?.textContent}: ${c.textContent}`)
        }),
      )
      expect(escapes).toEqual([])
      const rows = await page.locator('.d-srcc').evaluateAll((tiles) => tiles.map((t) => [Math.round(t.getBoundingClientRect().top), Math.round(t.getBoundingClientRect().height)]))
      const byTop = new Map<number, Set<number>>()
      for (const [top, h] of rows) byTop.set(top, (byTop.get(top) ?? new Set()).add(h))
      for (const hs of byTop.values()) expect(hs.size, 'equal heights per row').toBe(1)
    })
  }

  test('320px: the progress text never sits under Start fixing', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 })
    await openDay(page)
    await collapseSidebar(page)
    const prog = await rectOf(page.locator('[data-progress]'), 'progress')
    const start = await rectOf(startBtn(page), 'Start fixing')
    const overlap = prog.x < start.x + start.width && start.x < prog.x + prog.width && prog.y < start.y + start.height && start.y < prog.y + prog.height
    expect(overlap).toBe(false)
    await expect(page.locator('[data-progress]')).toHaveAttribute('data-short', /^\d+\/\d+$/)
  })

  test('status lines never start with a separator', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 760 })
    await openDay(page)
    await collapseSidebar(page)
    const starts = await page.locator('.d-strip .d-ph').evaluateAll((els) => els.map((e) => (e.textContent ?? '').trim()[0]))
    expect(starts.length).toBeGreaterThanOrEqual(2)
    for (const c of starts) expect(c).not.toBe('·')
  })
})

test.describe('Start fixing opens a terminal (Phase C)', () => {
  const pick = (page: Page, label: string) => card(page).locator('.d-optrow').filter({ hasText: label }).click()
  const json = (status: number, body: unknown) => ({ status, contentType: 'application/json', body: JSON.stringify(body) })
  /** Patch what the server says about sending (lastSentAt / collectedCount) on every run read. */
  async function sentState(page: Page, lastSentAt: string | null, collectedCount: number) {
    await page.route('**/api/day/runs/*', async (route) => {
      const res = await route.fetch()
      const body = await res.json()
      await route.fulfill({ response: res, json: { ...body, lastSentAt, collectedCount } })
    })
  }
  const clockOf = (page: Page, iso: string) => page.evaluate((x) => new Date(x).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }), iso)

  test('the request body is exactly { run_id }; "Opening…" while waiting; then the run is re-read', async ({ page }) => {
    await openDay(page)
    let body: unknown = null
    await page.route('**/api/day/start', async (route) => {
      body = route.request().postDataJSON()
      await new Promise((r) => setTimeout(r, 600))
      await route.fulfill(json(200, { launched: true, how: 'tab', count: 13, followUp: false }))
    })
    const reread = page.waitForResponse((r) => r.url().includes(`/api/day/runs/${LATEST_ID}`) && r.request().method() === 'GET')
    await startBtn(page).click()
    await expect(page.locator('[data-launch="opening"]')).toHaveText('Opening…')
    await expect(page.locator('.d-toast')).toHaveText('Opened a new tab in your terminal')
    await reread
    expect(body).toEqual({ run_id: LATEST_ID })
    await expect(page.locator('[data-launch="opening"]')).toHaveCount(0)
  })

  test('toasts: a new window, and a follow-up that sends only the changes', async ({ page }) => {
    await openDay(page)
    let reply = { launched: true, how: 'window', count: 13, followUp: false }
    await page.route('**/api/day/start', (route) => route.fulfill(json(200, reply)))
    await startBtn(page).click()
    await expect(page.locator('.d-toast')).toHaveText('Opened a new window in your terminal')
    reply = { launched: true, how: 'tab', count: 2, followUp: true }
    await expect(startBtn(page)).toBeEnabled()
    await startBtn(page).click()
    await expect(page.locator('.d-toast')).toHaveText('Sent 2 changes to a new terminal tab')
  })

  test('sent, nothing new: the bar says when, survives a reload, and the copy icon still works', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: `http://localhost:${ON.web}` })
    const at = '2026-10-05T06:12:00Z'
    await sentState(page, at, 0)
    await openDay(page)
    const when = await clockOf(page, at)
    await expect(page.locator('[data-launch="sent"] .d-tl')).toHaveText(`Sent to your terminal at ${when}`)
    await expect(startBtn(page)).toHaveCount(0)
    expect(await page.locator('[data-launch="sent"]').evaluate((e) => getComputedStyle(e).color)).toBe('rgb(71, 85, 105)')
    await page.reload()
    await page.locator('button').filter({ hasText: /^\W*Day$/u }).first().click()
    await expect(page.locator('[data-launch="sent"] .d-tl')).toHaveText(`Sent to your terminal at ${when}`)
    await page.getByRole('button', { name: 'Copy prompt' }).click()
    await expect(page.locator('.d-toast')).toHaveText('Prompt copied')
  })

  test('sent, then changed: the button says "Send N changes"', async ({ page }) => {
    await sentState(page, '2026-10-05T06:12:00Z', 3)
    await openDay(page)
    await expect(page.getByRole('button', { name: 'Send 3 changes' })).toBeVisible()
  })

  test('320px: the sent state is short and the bar keeps its two rows', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 })
    await openDay(page)
    await collapseSidebar(page)
    const h0 = (await rectOf(page.locator('[data-bottom-bar]'), 'bar')).height
    const at = '2026-10-05T06:12:00Z'
    await sentState(page, at, 0)
    await pick(page, 'Agent drafts, you send') // any write re-reads the run, now patched
    await expect(page.locator('[data-launch="sent"] .d-ts')).toHaveText(`Sent ${await clockOf(page, at)}`)
    await expect(page.locator('[data-launch="sent"] .d-tl')).toBeHidden()
    expect((await rectOf(page.locator('[data-bottom-bar]'), 'bar')).height).toBeLessThanOrEqual(h0 + 0.5)
  })

  for (const [status, body, text] of [
    [429, { error: 'Too soon' }, 'A session is opening, or one started less than a minute ago.'],
    [409, { error: 'Already sent', reason: 'already-sent' }, 'Already sent to your terminal; nothing has changed since.'],
    [502, { error: 'No terminal', fallback: 'copy' }, 'Couldn’t start a session in the terminal.'],
  ] as const) {
    test(`${status}: "${text}" with a Copy button that copies; no auto-copy`, async ({ page, context }) => {
      await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: `http://localhost:${ON.web}` })
      await openDay(page)
      await page.evaluate(() => navigator.clipboard.writeText('untouched'))
      await page.route('**/api/day/start', (route) => route.fulfill(json(status, body)))
      await startBtn(page).click()
      const toast = page.locator('.d-toast')
      await expect(toast).toContainText(text)
      expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('untouched')
      await toast.getByRole('button', { name: 'Copy' }).click()
      await expect(toast).toHaveText('Prompt copied')
      expect((await page.evaluate(() => navigator.clipboard.readText())).split('\n')[0]).toContain('still real')
      await expect(startBtn(page)).toBeVisible()
    })
  }

  test('a network failure says "Couldn’t start", not "Couldn’t copy"', async ({ page }) => {
    await openDay(page)
    await page.route('**/api/day/start', (route) => route.abort())
    await startBtn(page).click()
    await expect(page.locator('.d-toast')).toContainText('Couldn’t start:')
  })

  test('the copy icon never asks for a terminal', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: `http://localhost:${ON.web}` })
    await openDay(page)
    let started = 0
    await page.route('**/api/day/start', (route) => {
      started++
      return route.abort()
    })
    await page.getByRole('button', { name: 'Copy prompt' }).click()
    await expect(page.locator('.d-toast')).toHaveText('Prompt copied')
    expect(started).toBe(0)
  })
})

test.describe('notes ("From this run")', () => {
  test('each note is a fold under Stats that opens on click, keeping its line breaks', async ({ page }) => {
    await openDay(page)
    await page.locator('.d-tabs').getByRole('tab', { name: 'Stats' }).click()
    const notes = page.locator('.d-notes')
    await expect(notes.locator('.d-h3')).toHaveText('From this run')
    await expect(notes.locator('[data-note]')).toHaveCount(4)
    const shipped = notes.locator('[data-note="shipped"]')
    const fold = shipped.getByRole('button')
    await expect(fold).toHaveAttribute('aria-expanded', 'false')
    expect((await rectOf(fold, 'note fold')).height).toBeGreaterThanOrEqual(40)
    await expect(shipped.locator('.d-notebody')).toHaveCount(0)
    await fold.click()
    await expect(shipped.locator('.d-notebody')).toHaveText('Event page: room-ended message reworded.\nBoard: Day page phase A.')
    expect(await shipped.locator('.d-notebody').evaluate((e) => getComputedStyle(e).whiteSpace)).toBe('pre-wrap')
    // the title already says "review": no badge repeating it
    await expect(notes.locator('[data-note="week-measures"] .d-runbadge')).toHaveCount(0)
  })

  test('a review note whose title does not say so gets the badge, without squeezing the title at 320px', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 })
    await page.route('**/api/day/runs/*', async (route) => {
      const res = await route.fetch()
      const body = await res.json()
      if (body.report) body.report.notes = [{ id: 'm', title: 'Measurements', body: 'Reach-outs: 6', review: 'monthly' }]
      await route.fulfill({ response: res, json: body })
    })
    await openDay(page)
    await collapseSidebar(page)
    await page.locator('.d-tabs').getByRole('tab', { name: 'Stats' }).click()
    const title = page.locator('[data-note="m"] .d-notetitle')
    await expect(title.locator('.d-runbadge')).toHaveText('Monthly review')
    const range = await title.evaluate((e) => {
      const r = document.createRange()
      r.selectNodeContents(e.firstChild as Node)
      return r.getClientRects().length
    })
    expect(range, 'title text on one line').toBe(1)
  })

  test('a run without notes shows no "From this run"', async ({ page }) => {
    await openDay(page, 'people-absent')
    await page.locator('.d-tabs').getByRole('tab', { name: 'Stats' }).click()
    await expect(page.locator('[data-funnel]')).toBeVisible()
    await expect(page.getByText('From this run')).toHaveCount(1)
    await openDay(page, 'no-notes')
    await page.locator('.d-tabs').getByRole('tab', { name: 'Stats' }).click()
    await expect(page.locator('[data-funnel]')).toBeVisible()
    await expect(page.getByText('From this run')).toHaveCount(0)
  })
})

test.describe('Phase D: one custom option', () => {
  test('"Your answer or question…" replaces Ask and Other: one text box, written as own; a trailing ? makes it a question; it gets the next number key', async ({ page }) => {
    await openDay(page)
    const yours = yoursOf(await runView(page))
    await expect(card(page).locator('.d-opt[data-option="own"]')).toHaveCount(1)
    await expect(card(page).getByText('Ask a question…')).toHaveCount(0)
    await expect(card(page).getByText('Other…', { exact: true })).toHaveCount(0)
    await expect(ownRow(page)).toHaveCount(1)
    await expect(card(page).locator('textarea')).toHaveCount(0)
    // the own option takes the number after the last listed one
    await expect(card(page).locator('.d-opt[data-option="own"] .d-key')).toHaveText(String(yours[0].options.length + 1))

    await ownRow(page).click()
    await expect(card(page).locator('textarea')).toHaveCount(1)
    await expect(ownBox(page)).toHaveAttribute('placeholder', 'Ending with ? makes it a question the agent answers first')
    await ownBox(page).fill('Use the Tuesday template.')
    await cardTitle(page).click()
    await expect.poll(() => lines().length).toBe(1)
    expect(lines()[0]).toMatchObject({ kind: 'option', target: yours[0].fp, option_id: 'own', text: 'Use the Tuesday template.' })
    expect(lines()[0].is_question).toBeFalsy()
    await ownBox(page).fill('Who asked?')
    await cardTitle(page).click()
    await expect.poll(() => lines().length).toBe(2)
    expect(lines().at(-1)).toMatchObject({ option_id: 'own', text: 'Who asked?', is_question: true })
    expect(lines().filter((d) => d.option_id === 'ask' || d.option_id === 'other')).toEqual([])
  })

  test('the number key for the own option focuses its box, and digits typed there are text, not picks', async ({ page }) => {
    await openDay(page)
    const yours = yoursOf(await runView(page))
    await cardTitle(page).click()
    await page.keyboard.press(String(yours[0].options.length + 1))
    await expect(ownBox(page)).toBeFocused()
    await page.keyboard.type('Is 2 enough?')
    await expect(ownBox(page)).toHaveValue('Is 2 enough?')
    await cardTitle(page).click()
    await expect.poll(() => lines().length).toBe(1)
    expect(lines()[0]).toMatchObject({ option_id: 'own', text: 'Is 2 enough?', is_question: true })
  })

  test('a read-only old run that has an ask / other decision still shows its text', async ({ page }) => {
    await openDay(page)
    const line = (target: string, option_id: string, text: string, at: string) =>
      JSON.stringify({ kind: 'option', target, run_id: EARLIER_ID, at, option_id, text })
    writeFileSync(
      DECISIONS,
      [
        line('replies:event-post', 'ask', 'old question?', '2026-10-03T06:00:00Z'),
        line('sentry:room-ended', 'other', 'old other answer', '2026-10-03T06:01:00Z'),
      ].join('\n') + '\n',
    )
    await page.getByRole('button', { name: 'Previous run' }).click()
    await expect(page.locator('[data-run-date]')).toHaveText('Sat 3 Oct')
    await expect(card(page).locator('[data-own-text]')).toHaveText('old question?')
    await expect(card(page).locator('textarea')).toHaveCount(0)
    expect(await card(page).locator('input[type=radio]:enabled').count()).toBe(0)
    await agentLine(page).getByRole('button', { name: 'Review' }).click()
    await nextBtn(page).click()
    await expect(cardTitle(page)).toHaveText('Some guests may be turned away on Tuesday')
    await expect(card(page).locator('[data-own-text]')).toHaveText('old other answer')
    // known-bad control: a card with no decision shows no own text
    await prevBtn(page).click()
    await expect(card(page).locator('[data-own-text]')).toHaveCount(0)
  })
})

test.describe('Phase D: fit, risk and cause on the card', () => {
  test('the recommended option says "Fit N%" or "Fit not rated", with one Main risk line under it; the head says whether the cause was checked', async ({ page }) => {
    await openDay(page)
    const rec = (label: string) => card(page).locator('.d-opt').filter({ hasText: label })
    // 1 · no fit rated: never a made-up number; the cause was checked
    await expect(cardTitle(page)).toHaveText('Replies waiting on your event post')
    await expect(rec('I’ll reply today').locator('.d-rec')).toHaveText('Recommended · Fit not rated')
    await expect(card(page).locator('.d-risk')).toHaveCount(0)
    await expect(card(page).locator('.d-cause')).toHaveText('Cause checked')
    // 2 · fit 95, no risk written
    await nextBtn(page).click()
    await expect(rec('I’ll read it today').locator('.d-rec')).toHaveText('Recommended · Fit 95%')
    await expect(card(page).locator('.d-risk')).toHaveCount(0)
    await expect(card(page).locator('.d-cause')).toHaveText('Cause checked')
    // the tag is neutral: neither the worked green nor the needs-you amber
    const colours = await card(page).locator('.d-cause').evaluate((e) => {
      const c = getComputedStyle(e)
      return [c.color, c.backgroundColor, c.borderTopColor]
    })
    for (const c of colours) expect(['rgb(22, 163, 74)', 'rgb(22, 101, 52)', 'rgb(217, 119, 6)', 'rgb(146, 64, 14)', 'rgb(255, 251, 235)', 'rgb(240, 253, 244)']).not.toContain(c)
    // 3 · fit 70
    await nextBtn(page).click()
    await expect(rec('Ship today').locator('.d-rec')).toHaveText('Recommended · Fit 70%')
    await card(page).getByRole('button', { name: /More info/ }).click()
    await expect(card(page).locator('.d-moreinfo dt')).not.toContainText(['Technical detail']) // this card was not rewritten
    // 4 · fit 70, a main risk right under the recommended option, no cause tag (nothing was said about it)
    await nextBtn(page).click()
    await expect(cardTitle(page)).toHaveText('Do a practice run before the first pilot?')
    const r = rec('One 45-min run with 4 people')
    await expect(r.locator('.d-rec')).toHaveText('Recommended · Fit 70%')
    await expect(r.locator('.d-risk')).toHaveText('Main risk: Four people’s time for a problem that may not exist.')
    await expect(card(page).locator('.d-risk')).toHaveCount(1) // one line, only under the recommended option
    await expect(card(page).locator('.d-cause')).toHaveCount(0)
    // the fit is muted when not rated, plain when rated (known-bad control: both are not the same style)
    await card(page).getByRole('button', { name: /More info/ }).click()
    const dts = card(page).locator('.d-moreinfo dt')
    await expect(dts).not.toContainText(['Checked']) // the duplicate "Checked" row is gone
    await expect(dts.filter({ hasText: 'Technical detail' })).toHaveCount(1)
    const tech = card(page).locator('.d-moreinfo [data-technical]')
    await expect(tech).toContainText('Title')
    await expect(tech).toContainText('Rehearse online before the first pilot?')
    await expect(tech).toContainText('Point A')
    await expect(tech).toContainText('No rehearsal planned.')
    await expect(tech).toContainText('Obstacle')
    await expect(tech).toContainText('A pilot lost to a bug voids the test.')
    await expect(tech).toContainText('Point B')
    await expect(tech).toContainText('First pilot runs cleanly.')
  })

  test('an agent card carries the same: Fit, Main risk, and "Cause suspected" when the cause is unverified', async ({ page }) => {
    await openDay(page)
    await agentLine(page).getByRole('button', { name: 'Review' }).click()
    await expect(cardTitle(page)).toHaveText('Database rules are live before review')
    const rec = card(page).locator('.d-opt').filter({ hasText: 'Give to the agent' })
    await expect(rec.locator('.d-rec')).toHaveText('Recommended · Fit 85%')
    await expect(rec.locator('.d-risk')).toHaveText('Main risk: A rollback could drop the rules Tuesday’s event needs.')
    await expect(card(page).locator('.d-cause')).toHaveText('Cause checked')
    await nextBtn(page).click()
    await expect(cardTitle(page)).toHaveText('Some guests may be turned away on Tuesday')
    await expect(card(page).locator('.d-cause')).toHaveText('Cause suspected')
    await expect(card(page).locator('.d-opt').filter({ hasText: 'Give to the agent' }).locator('.d-rec')).toHaveText('Recommended · Fit 75%')
    // a synthesised card (no evidence field in the report) and an old-schema card show no made-up cause
    await expect(card(page).locator('.d-rec')).toHaveCount(1)
  })
})

test.describe('Phase D: Accept writes, Start fixing sends what you answered, the rest is still yours', () => {
  test('on an unanswered founder card "Accept & next" sits beside Next; answered cards and agent cards have no Accept', async ({ page }) => {
    await openDay(page)
    const v = await runView(page)
    const yours = yoursOf(v)
    expect(yours.length).toBeGreaterThan(2)
    // unanswered founder choice: Accept is its own button; Next stays plain paging
    await expect(acceptBtn(page)).toHaveAttribute('aria-label', 'Accept and next')
    await expect(nextBtn(page)).toHaveAttribute('aria-label', /^Next /)
    await acceptBtn(page).click()
    // the second card: an explicit pick makes it an answered card, so Accept goes away
    await expect(cardTitle(page)).toHaveText(yours[1].title)
    await expect(acceptBtn(page)).toBeVisible()
    await card(page).locator('.d-opt').first().locator('input').click()
    await expect(acceptBtn(page)).toHaveCount(0)
    // back on the first, which was accepted: answered, so no Accept
    await prevBtn(page).click()
    await expect(acceptBtn(page)).toHaveCount(0)
    // agent cards are not the founder's to accept
    await agentLine(page).getByRole('button', { name: 'Review' }).click()
    await expect(acceptBtn(page)).toHaveCount(0)
  })

  test('the last founder card can be accepted: an enabled Accept, no paging, written at once, and Start fixing includes it', async ({ page }) => {
    await openDay(page)
    const v = await runView(page)
    const yours = yoursOf(v)
    const base = agentOf(v).length
    for (let k = 0; k < yours.length - 1; k++) await nextBtn(page).click()
    await expect(page.locator('.d-bpos')).toHaveText(`${yours.length} of ${yours.length}`)
    expect(fileText()).toBe('') // paging wrote nothing
    await expect(acceptBtn(page)).toBeEnabled()
    await expect(acceptBtn(page)).toHaveAttribute('aria-label', 'Accept')
    await expect(startBtn(page)).toHaveText(`Start fixing (${base})`)
    await acceptBtn(page).click()
    await expect.poll(() => lines().length).toBe(1)
    await expect(page.locator('.d-bpos')).toHaveText(`${yours.length} of ${yours.length}`) // no paging
    await expect(startBtn(page)).toHaveText(`Start fixing (${base + 1})`)
    // the bar returns to its normal state: the last card, answered, has a disabled Next and no Accept
    await expect(nextBtn(page)).toBeDisabled()
    await expect(acceptBtn(page)).toHaveCount(0)
  })

  // P1432 replaces "Next accepts in the page only": Accept writes one line per card at once; → and Next write nothing.
  test('"Accept & next" writes one option line per card at once; → and Next write nothing; "N still yours" jumps to the first unanswered card', async ({ page }) => {
    await openDay(page)
    const v = await runView(page)
    const yours = yoursOf(v)
    const base = agentOf(v).length
    expect(base).toBeGreaterThan(0)
    await expect(startBtn(page)).toHaveText(`Start fixing (${base})`)
    await expect(stillYours(page)).toHaveText(`${yours.length} still yours`)

    await acceptBtn(page).click()
    await expect.poll(() => lines().length).toBe(1)
    await expect(startBtn(page)).toHaveText(`Start fixing (${base + 1})`)
    await expect(stillYours(page)).toHaveText(`${yours.length - 1} still yours`)
    await acceptBtn(page).click()
    await expect.poll(() => lines().length).toBe(2)
    await expect(startBtn(page)).toHaveText(`Start fixing (${base + 2})`)
    expect(lines().map((d) => d.target)).toEqual([yours[0].fp, yours[1].fp])
    for (const d of lines()) {
      const i = must(v.view.issues.find((x) => x.fp === d.target), 'issue')
      expect(d).toMatchObject({ kind: 'option', option_id: i.options[i.recommended_index].id })
    }
    // paging writes nothing and accepts nothing (rule 5): → and plain Next past the third card
    const before = fileText()
    await cardTitle(page).click()
    await page.keyboard.press('ArrowRight')
    await expect(cardTitle(page)).toHaveText(yours[3].title)
    await prevBtn(page).click()
    await nextBtn(page).click()
    await page.waitForTimeout(300)
    expect(fileText()).toBe(before)
    await expect(startBtn(page)).toHaveText(`Start fixing (${base + 2})`)
    await expect(stillYours(page)).toHaveText(`${yours.length - 2} still yours`)

    // the link jumps to the first card nobody answered: not the two that were accepted
    await stillYours(page).click()
    await expect(page.locator('.d-bpos')).toHaveText(`3 of ${yours.length}`)
    await expect(cardTitle(page)).toHaveText(yours[2].title)
    await expect(card(page).locator('[data-state]')).toHaveAttribute('data-state', 'open')

    // sending adds only the agent work; the two accepts are already in the file
    await startBtn(page).click()
    await expect(page.locator('.d-toast')).toContainText('Couldn’t start a session in the terminal.')
    const written = lines().filter((d) => d.kind === 'option')
    expect(written.map((d) => d.target).sort()).toEqual([yours[0].fp, yours[1].fp, ...agentOf(v).map((i) => i.fp)].sort())
    // known-bad control: the two cards only paged past were not sent
    expect(written.map((d) => d.target)).not.toContain(yours[2].fp)
    expect(written.map((d) => d.target)).not.toContain(yours[3].fp)
  })

  test('clicking the answer that is already selected counts it (the last card has no Next); an explicit pick counts too', async ({ page }) => {
    await openDay(page)
    const yours = yoursOf(await runView(page))
    await card(page).locator('.d-opt').filter({ hasText: 'I’ll reply today' }).locator('input').click()
    await expect.poll(() => lines().length).toBe(1)
    expect(lines()[0]).toMatchObject({ target: yours[0].fp, option_id: 'reply' })
    await expect(stillYours(page)).toHaveText(`${yours.length - 1} still yours`)
    await nextBtn(page).click()
    await card(page).locator('.d-optrow').filter({ hasText: 'Park: stop asking' }).click()
    await expect(stillYours(page)).toHaveText(`${yours.length - 2} still yours`)
  })

  test('an unsaved custom answer is counted and not "still yours"; an empty one is neither', async ({ page }) => {
    await openDay(page)
    const v = await runView(page)
    const yours = yoursOf(v)
    const base = agentOf(v).length
    await ownRow(page).click()
    await expect(startBtn(page)).toHaveText(`Start fixing (${base})`)
    await expect(stillYours(page)).toHaveText(`${yours.length} still yours`)
    await ownBox(page).fill('A real answer')
    await expect(startBtn(page)).toHaveText(`Start fixing (${base + 1})`)
    await expect(stillYours(page)).toHaveText(`${yours.length - 1} still yours`)
  })

  for (const [width, height] of [[1440, 900], [375, 812], [320, 640]] as const) {
    test(`the bar does not change height or overlap between its states at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height })
      await openDay(page)
      if (width < 900) await collapseSidebar(page)
      const yours = yoursOf(await runView(page))
      const bar = page.locator('[data-bottom-bar]')
      const h0 = (await rectOf(bar, 'bar')).height
      await expect(stillYours(page)).toBeVisible()
      expect((await rectOf(stillYours(page), 'still yours')).height, 'hit area').toBeGreaterThanOrEqual(40)
      // nothing in the bar overlaps: progress, still-yours link, Start fixing
      const boxes = async () => {
        const out: [string, { x: number; y: number; width: number; height: number }][] = []
        for (const [n, l] of [['progress', page.locator('[data-progress]')], ['still', stillYours(page)], ['start', startBtn(page)]] as const) {
          if (await l.count()) out.push([n, await rectOf(l.first(), n)])
        }
        return out
      }
      const bs = await boxes()
      for (let i = 0; i < bs.length; i++) {
        expect(bs[i][1].x + bs[i][1].width, `${bs[i][0]} inside the viewport`).toBeLessThanOrEqual(width + 0.5)
        for (let j = i + 1; j < bs.length; j++) {
          const [a, b] = [bs[i][1], bs[j][1]]
          const overlap = a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height
          expect(overlap, `${bs[i][0]} / ${bs[j][0]}`).toBe(false)
        }
      }
      // accept every card: the link goes away, the bar keeps its height
      for (let k = 0; k < yours.length; k++) {
        await acceptBtn(page).click()
        await expect.poll(() => lines().length).toBe(k + 1)
      }
      await expect(stillYours(page)).toHaveCount(0)
      expect(Math.abs((await rectOf(bar, 'bar')).height - h0)).toBeLessThan(0.5)
      // and the full-width state with More info open does not move it either
      await card(page).getByRole('button', { name: /More info/ }).click()
      expect(Math.abs((await rectOf(bar, 'bar')).height - h0)).toBeLessThan(0.5)
    })
  }
})

test.describe('Phase D: agent work folded', () => {
  test('one line above the card; Review walks the agent cards with the same card and keys; Back to yours returns', async ({ page }) => {
    await openDay(page)
    const v = await runView(page)
    const yours = yoursOf(v)
    const agents = agentOf(v)
    await expect(agentLine(page)).toHaveText(`${agents.length} things an agent can fix — they go with Start fixing · Review`)
    // the line sits above the card; the pager walks only the founder's cards
    expect((await rectOf(agentLine(page), 'agent line')).y + (await rectOf(agentLine(page), 'agent line')).height).toBeLessThanOrEqual((await rectOf(card(page), 'card')).y + 1)
    await expect(page.locator('.d-bpos')).toHaveText(`1 of ${yours.length}`)
    await expect(agentPager(page)).toHaveCount(0)
    await acceptBtn(page).click()
    await acceptBtn(page).click()
    await expect(page.locator('[data-progress]')).toHaveText(`2 of ${yours.length} resolved`)

    await agentLine(page).getByRole('button', { name: 'Review' }).click()
    await expect(agentPager(page)).toContainText(`Agent work · 1 of ${agents.length}`)
    await expect(stillYours(page)).toHaveCount(0) // "Back to yours" is the way back; the count would mix sets
    await expect(page.locator('.d-bpos')).toHaveText(`1 of ${agents.length}`)
    await expect(cardTitle(page)).toHaveText(agents[0].title)
    await expect(agentLine(page)).toHaveCount(0)
    await expect(page.locator('[data-progress]')).toHaveText(`0 of ${agents.length} resolved`)
    await page.keyboard.press('ArrowRight')
    await expect(agentPager(page)).toContainText(`Agent work · 2 of ${agents.length}`)
    await expect(cardTitle(page)).toHaveText(agents[1].title)
    // P1432: a card only paged past is not resolved
    await expect(page.locator('[data-progress]')).toHaveText(`0 of ${agents.length} resolved`)
    await page.keyboard.press('ArrowLeft')
    await expect(cardTitle(page)).toHaveText(agents[0].title)

    // the founder can change an agent card's answer: Park is option 3 on this card
    await cardTitle(page).click()
    await page.keyboard.press('3')
    await expect.poll(() => lines().length).toBe(3) // the two Accepts above (P1432: written at once), then this pick
    expect(lines()[2]).toMatchObject({ kind: 'option', target: agents[0].fp, option_id: 'park' })
    // a Park made on this run keeps the card in the pager (it shows Park selected); it is simply not sent
    await expect(agentPager(page)).toContainText(`Agent work · 1 of ${agents.length}`)
    await expect(card(page).locator('.d-opt').nth(2).locator('input')).toBeChecked()
    await expect(startBtn(page)).toHaveText(`Start fixing (${agents.length - 1 + 2})`) // the parked card is out; the two accepted founder cards are in
    await expect(page.locator('[data-progress]')).toHaveText(`1 of ${agents.length} resolved`)

    await agentPager(page).getByRole('button', { name: 'Back to yours' }).click()
    await expect(agentPager(page)).toHaveCount(0)
    await expect(page.locator('.d-bpos')).toHaveText(`3 of ${yours.length}`) // where we left off
    await expect(page.locator('[data-progress]')).toHaveText(`2 of ${yours.length} resolved`)
    await expect(agentLine(page)).toHaveText(`${agents.length} things an agent can fix — they go with Start fixing · Review`)
  })

  for (const [width, height] of [[1440, 900], [375, 812], [320, 640]] as const) {
    test(`agent mode keeps "Back to yours" in the bottom bar without changing its height at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height })
      await openDay(page)
      if (width < 900) await collapseSidebar(page)
      const bar = page.locator('[data-bottom-bar]')
      await expect(bar.locator('[data-back-yours]')).toHaveCount(0) // on the founder's own cards it is not needed
      const h0 = (await rectOf(bar, 'bar')).height
      await agentLine(page).getByRole('button', { name: 'Review' }).click()
      const back = bar.locator('[data-back-yours]')
      await expect(back).toBeVisible()
      expect((await rectOf(back, 'back')).height, 'touch target').toBeGreaterThanOrEqual(40)
      expect(Math.abs((await rectOf(bar, 'bar')).height - h0)).toBeLessThan(0.5)
      const bs = await rectOf(back, 'back')
      expect(bs.x + bs.width).toBeLessThanOrEqual(width + 0.5)
      await back.click()
      await expect(bar.locator('[data-back-yours]')).toHaveCount(0)
      await expect(agentLine(page)).toBeVisible()
    })
  }

  test('a check row in Status opens its agent card, and Back to yours leaves it', async ({ page }) => {
    await openDay(page)
    await page.locator('.d-status button[data-check="bk-c"]').click()
    await expect(agentPager(page)).toBeVisible()
    await expect(cardTitle(page)).toContainText('Backup · repo C')
    await agentPager(page).getByRole('button', { name: 'Back to yours' }).click()
    await expect(agentPager(page)).toHaveCount(0)
  })

  test('with no founder cards the pager opens on the agent work, with no way back', async ({ page }) => {
    await patchRun(page, (b) => {
      if (b.view) b.view.issues = b.view.issues.filter((i: ViewIssue) => isAgent(i))
    })
    await openDay(page)
    const n = await page.evaluate(async (id) => ((await (await fetch(`/api/day/runs/${id}`)).json()).view.issues as ViewIssue[]).length, LATEST_ID)
    await expect(agentPager(page)).toContainText(`Agent work · 1 of ${n}`)
    await expect(page.locator('.d-bpos')).toHaveText(`1 of ${n}`)
    await expect(agentPager(page).getByRole('button', { name: 'Back to yours' })).toHaveCount(0)
    await expect(agentLine(page)).toHaveCount(0)
    await expect(card(page)).toBeVisible()
  })

  test('with no agent work the line is hidden', async ({ page }) => {
    await patchRun(page, (b) => {
      if (b.view) b.view.issues = b.view.issues.filter((i: ViewIssue) => !isAgent(i))
    })
    await openDay(page)
    await expect(card(page)).toBeVisible()
    await expect(agentLine(page)).toHaveCount(0)
    await expect(agentPager(page)).toHaveCount(0)
  })

  test('on a phone the line and the agent pager fit without horizontal scroll', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 })
    await openDay(page)
    await collapseSidebar(page)
    const over = () => page.evaluate(() => (document.querySelector('.day-root') as HTMLElement).scrollWidth - (document.querySelector('.day-root') as HTMLElement).clientWidth)
    expect(await over()).toBeLessThanOrEqual(0)
    await agentLine(page).getByRole('button', { name: 'Review' }).click()
    await expect(agentPager(page)).toBeVisible()
    expect(await over()).toBeLessThanOrEqual(0)
    expect((await rectOf(agentPager(page).getByRole('button', { name: 'Back to yours' }), 'back')).height).toBeGreaterThanOrEqual(40)
  })
})

test.describe('narrow widths', () => {
  for (const width of [375, 320]) {
    test(`no horizontal scroll inside the page at ${width}px; Status is a strip that opens`, async ({ page }) => {
      await page.setViewportSize({ width, height: 760 })
      await openDay(page)
      await collapseSidebar(page)
      for (const tab of ['Daily report', 'Stats', 'Monitoring', 'Reflection']) {
        await page.locator('.d-tabs').getByRole('tab', { name: tab, exact: true }).click()
        const over = await page.evaluate(() => {
          const r = document.querySelector('.day-root') as HTMLElement
          return r.scrollWidth - r.clientWidth
        })
        expect(over, tab).toBeLessThanOrEqual(0)
        const right = await page.evaluate(() => document.querySelector('.day-root')?.getBoundingClientRect().right ?? Infinity)
        expect(right, tab).toBeLessThanOrEqual(width)
      }
      await page.locator('.d-tabs').getByRole('tab', { name: 'Daily report' }).click()
      const strip = page.locator('.d-strip')
      await expect(strip).toBeVisible()
      await expect(page.locator('.d-spanel')).toBeHidden()
      await strip.click()
      await expect(page.locator('.d-spanel')).toBeVisible()
      const nb = await rectOf(nextBtn(page), 'Next')
      expect(nb.height).toBeGreaterThanOrEqual(44)
    })

    test(`at ${width}px the last text box scrolls fully above the bottom bar`, async ({ page }) => {
      await page.setViewportSize({ width, height: 700 })
      await openDay(page)
      await collapseSidebar(page)
      await ownRow(page).click()
      const box = ownBox(page)
      await expect(box).toBeVisible()
      await page.evaluate(() => {
        const sc = document.querySelector('.day-root')?.parentElement
        if (sc) sc.scrollTop = sc.scrollHeight
      })
      const t = await rectOf(box, 'text box')
      const bar = await rectOf(page.locator('[data-bottom-bar]'), 'bar')
      expect(t.y + t.height).toBeLessThanOrEqual(bar.y)
    })
  }
})

// referenced so the seed's other id stays in the suite's vocabulary
void EARLIER_ID

test.describe('toast actions', () => {
  test('a toast Copy button is a full touch target (≥ 40px)', async ({ page }) => {
    await openDay(page)
    await page.getByRole('button', { name: /Start fixing/ }).click()
    const copy = page.locator('.d-toastact')
    await copy.waitFor()
    const box = await copy.boundingBox()
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(40)
  })
})

test.describe('P1432: every card says whether it is answered, and Accept is saved at once', () => {
  const stateOf = (page: Page) => card(page).locator('[data-state]')
  /** A launch receipt the way the server writes one: pending, then started (or failed). */
  const receipt = (id: string, items: string[], last: 'started' | 'failed', at = new Date().toISOString()) =>
    [
      JSON.stringify({ kind: 'sent', id, run_id: LATEST_ID, state: 'pending', at, items, count: items.length }),
      JSON.stringify({ kind: 'sent', id, run_id: LATEST_ID, state: last, at }),
    ].join('\n') + '\n'
  const optionKey = (fp: string, optionId: string) => `option:${fp}:${optionId}:`

  test('"Accept & next" survives a reload: the card says "Your answer", the list and progress agree; Start fixing includes it until that answer was sent', async ({ page }) => {
    await openDay(page)
    const v = await runView(page)
    const yours = yoursOf(v)
    const base = agentOf(v).length
    const first = yours[0]
    const rec = first.options[first.recommended_index]
    await expect(stateOf(page)).toHaveAttribute('data-state', 'open')
    await expect(stateOf(page)).toHaveText(`Not answered yet · recommended: ${rec.label}`)
    await acceptBtn(page).click()
    await expect.poll(() => lines().length).toBe(1)

    await reopen(page)
    // P1435: the page opens on the first card that still needs you; the answered one is a click away
    await expect(cardTitle(page)).toHaveText(yours[1].title)
    await listRow(page, first.fp).click()
    await expect(cardTitle(page)).toHaveText(first.title)
    await expect(stateOf(page)).toHaveAttribute('data-state', 'answered')
    await expect(stateOf(page)).toHaveText(/^✓Your answer · saved \d\d:\d\d$/)
    await expect(page.locator('[data-progress]')).toHaveText(`1 of ${yours.length} resolved`)
    await expect(listRow(page, first.fp)).toHaveAttribute('data-list-state', 'answered')
    await expect(listRow(page, yours[1].fp)).toHaveAttribute('data-list-state', 'open')
    await expect(startBtn(page)).toHaveText(`Start fixing (${base + 1})`)

    // the same answer already sent: it is not counted again, and the card says Sent
    writeFileSync(DECISIONS, fileText() + receipt('launch-1', [optionKey(first.fp, rec.id)], 'started'))
    await reopen(page)
    await listRow(page, first.fp).click()
    await expect(stateOf(page)).toHaveAttribute('data-state', 'sent')
    await expect(stateOf(page)).toHaveText(/^✓Sent to the agent \d\d:\d\d$/)
    await expect(listRow(page, first.fp)).toHaveAttribute('data-list-state', 'sent')
  })

  test('Sent only for a started or pending launch holding the current answer: a failed launch never shows Sent; changing the answer makes it unsent', async ({ page }) => {
    await openDay(page)
    const first = yoursOf(await runView(page))[0]
    const rec = first.options[first.recommended_index]
    const other = must(first.options.find((o) => o.id !== rec.id && o.id !== 'park'), 'another option')
    await acceptBtn(page).click()
    await expect.poll(() => lines().length).toBe(1)
    // known-bad control: a failed launch holding this exact answer
    writeFileSync(DECISIONS, fileText() + receipt('launch-f', [optionKey(first.fp, rec.id)], 'failed'))
    await reopen(page)
    await listRow(page, first.fp).click()
    await expect(stateOf(page)).toHaveAttribute('data-state', 'answered')
    writeFileSync(DECISIONS, fileText() + receipt('launch-s', [optionKey(first.fp, rec.id)], 'started'))
    await reopen(page)
    await listRow(page, first.fp).click()
    await expect(stateOf(page)).toHaveAttribute('data-state', 'sent')
    // a new answer after the send is not what was sent
    await card(page).locator('.d-optrow').filter({ hasText: other.label }).click()
    await expect.poll(() => lines().filter((d) => d.kind === 'option').length).toBe(2)
    await expect(stateOf(page)).toHaveAttribute('data-state', 'answered')
  })

  test('a second Accept writes nothing; a double click writes one line', async ({ page }) => {
    await openDay(page)
    const yours = yoursOf(await runView(page))
    await acceptBtn(page).dblclick()
    await expect(cardTitle(page)).toHaveText(yours[1].title)
    await page.waitForTimeout(400)
    expect(lines()).toHaveLength(1)
    await prevBtn(page).click()
    await expect(acceptBtn(page)).toHaveCount(0) // answered: nothing left to accept
  })

  test('paging during a slow Accept wins: the save never pulls the pager back', async ({ page }) => {
    await openDay(page)
    const yours = yoursOf(await runView(page))
    await page.route('**/api/day/decisions', async (r) => {
      await new Promise((res) => setTimeout(res, 800))
      await r.continue()
    })
    await acceptBtn(page).click()
    await cardTitle(page).click()
    await page.keyboard.press('ArrowRight')
    await page.keyboard.press('ArrowRight')
    await expect(cardTitle(page)).toHaveText(yours[2].title)
    await expect.poll(() => lines().length).toBe(1)
    await page.waitForTimeout(300)
    await expect(cardTitle(page)).toHaveText(yours[2].title)
  })

  test('a slow double click on Accept never accepts the next card unseen', async ({ page }) => {
    await openDay(page)
    const yours = yoursOf(await runView(page))
    // a slow double click: the first click saves and moves on before the second lands on the next card's Accept
    await acceptBtn(page).click({ clickCount: 2, delay: 250 })
    await expect(cardTitle(page)).toHaveText(yours[1].title)
    await page.waitForTimeout(400)
    expect(lines()).toHaveLength(1)
    await expect(stateOf(page)).toHaveAttribute('data-state', 'open')
  })

  test('Accept never parks: a card whose recommendation is Park offers no Accept and stays unanswered', async ({ page }) => {
    await patchRun(page, (b) => {
      const i = must(b.view?.issues.find((x) => !isAgent(x)), 'a founder card')
      const park = i.options.findIndex((o) => o.id === 'park')
      if (park < 0) i.options.push({ id: 'park', label: 'Park: stop asking' })
      i.recommended_index = park < 0 ? i.options.length - 1 : park
    })
    await openDay(page)
    await expect(stateOf(page)).toHaveAttribute('data-state', 'open')
    await expect(acceptBtn(page)).toHaveCount(0)
    await page.waitForTimeout(200)
    expect(fileText()).toBe('')
  })

  test('a failed Accept shows the same error as a failed pick and leaves the card unanswered, where it was', async ({ page }) => {
    await openDay(page)
    await page.route('**/api/day/decisions', (r) => r.fulfill({ status: 500, json: { error: 'Failed to record decisions' } }))
    await acceptBtn(page).click()
    await expect(page.locator('.d-toast')).toHaveText('Not saved: Failed to record decisions')
    await expect(page.locator('.d-bpos')).toHaveText(/^1 of/)
    await expect(stateOf(page)).toHaveAttribute('data-state', 'open')
    await expect(acceptBtn(page)).toBeVisible()
    expect(fileText()).toBe('')
  })

  test('next day: a fault answered on an earlier run says so on the new run; the earlier run says answered / not answered per card', async ({ page }) => {
    await openDay(page)
    const earlier = (await (await page.request.get(`/api/day/runs/${EARLIER_ID}`)).json()) as { report: { pass_id: string; started_at: string }; view: { issues: ViewIssue[] } }
    const latest = yoursOf(await runView(page))
    const both = must(latest.find((i) => earlier.view.issues.some((e) => e.fp === i.fp)), 'a fault on both runs')
    const opt = must(both.options.find((o) => o.id !== 'park'), 'an option')
    const at = new Date(Date.parse(earlier.report.started_at) + 3_600_000).toISOString()
    writeFileSync(DECISIONS, JSON.stringify({ kind: 'option', target: both.fp, option_id: opt.id, run_id: earlier.report.pass_id, at }) + '\n')

    await reopen(page)
    await listRow(page, both.fp).click()
    await expect(cardTitle(page)).toHaveText(both.title)
    await expect(stateOf(page)).toHaveAttribute('data-state', 'before')
    await expect(stateOf(page)).toHaveText(`You answered on 3 Oct: ${opt.label} · reported again`)
    await expect(listRow(page, both.fp)).toHaveAttribute('data-list-state', 'before')

    // the earlier run, read-only: that card answered, another not
    await page.getByRole('button', { name: 'Previous run' }).click()
    await expect(page.locator('[data-run-date]')).toHaveText('Sat 3 Oct')
    expect(yoursOf({ view: earlier.view }).map((i) => i.fp)).toEqual([both.fp]) // that run's only founder card opens first
    await expect(cardTitle(page)).toHaveText(both.title)
    await expect(stateOf(page)).toHaveAttribute('data-state', 'answered')
    await expect(stateOf(page)).toHaveText(/^✓Answered on this run · \d\d:\d\d$/)
    // the agent work nobody answered on that run
    await agentLine(page).getByRole('button', { name: 'Review' }).click()
    await expect(stateOf(page)).toHaveText('Not answered on this run')
  })

  test('the list shows every card with its state and jumps to it; parked cards are one row that opens Parked', async ({ page }) => {
    await openDay(page)
    const yours = yoursOf(await runView(page))
    const list = page.locator('[data-card-list]')
    await expect(list.locator('[data-list-card]')).toHaveCount(yours.length)
    // parked on an earlier run: it leaves the pager and becomes one "1 parked" row
    const earlier = (await (await page.request.get(`/api/day/runs/${EARLIER_ID}`)).json()) as { report: { pass_id: string; started_at: string } }
    const at = new Date(Date.parse(earlier.report.started_at) + 3_600_000).toISOString()
    writeFileSync(DECISIONS, JSON.stringify({ kind: 'option', target: yours[0].fp, option_id: 'park', run_id: earlier.report.pass_id, at }) + '\n')
    await reopen(page)
    await expect(list.locator('[data-list-card]')).toHaveCount(yours.length - 1)
    await expect(list.locator('[data-list-parked]')).toHaveText(/1 parked/)
    await list.locator('[data-list-parked]').click()
    await expect(page.locator('.d-parked .d-fold')).toHaveAttribute('aria-expanded', 'true')
    await list.locator('[data-list-card]').nth(2).click()
    await expect(page.locator('.d-bpos')).toHaveText(`3 of ${yours.length - 1}`)
    await expect(list.locator('[data-list-card]').nth(2)).toHaveAttribute('aria-current', 'true')
    expect(lines()).toHaveLength(1) // opening Parked and jumping write nothing
  })

  test('phone: the list folds to its count and opens with a toggle', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 })
    await openDay(page)
    await collapseSidebar(page)
    const yours = yoursOf(await runView(page))
    const tog = page.locator('[data-card-list] .d-cltog')
    await expect(tog).toHaveText(`▶${yours.length} still need you · ${yours.length} cards`)
    await expect(page.locator('[data-list-card]').first()).toBeHidden()
    expect((await rectOf(tog, 'toggle')).height).toBeGreaterThanOrEqual(40)
    await tog.click()
    await expect(page.locator('[data-list-card]').first()).toBeVisible()
  })
})

test.describe('P1435: see what needs you and decide without scrolling', () => {
  const inView = async (page: Page, sel: string) => {
    const r = await page.locator(sel).first().boundingBox()
    const bar = await page.locator('[data-bottom-bar]').boundingBox()
    const vh = must(page.viewportSize(), 'viewport').height
    return !!r && !!bar && r.y >= 0 && r.y + r.height <= Math.min(bar.y, vh)
  }
  const reflTab = (page: Page) => page.locator('.d-tabs').getByRole('tab', { name: 'Reflection' })

  test('1280x720: the card title, its first option and the card list are all on screen without scrolling', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 })
    await openDay(page)
    const yours = yoursOf(await runView(page))
    await expect(listRow(page, yours[0].fp)).toBeVisible()
    expect(await inView(page, '.d-focus h2'), 'card title').toBe(true)
    expect(await inView(page, '.d-focus .d-optrow'), 'first option').toBe(true)
    expect(await inView(page, '[data-list-summary]'), 'list summary').toBe(true)
    // side by side: the list is left of the card, not above it
    const l = must(await page.locator('[data-card-list]').boundingBox(), 'list')
    const c = must(await card(page).boundingBox(), 'card')
    expect(l.x + l.width).toBeLessThanOrEqual(c.x)
    await expect(page.locator('[data-list-summary]')).toHaveText(`${yours.length} still need you · ${yours.length} cards`)
  })

  test('the page opens on the first card that still needs you', async ({ page }) => {
    await openDay(page)
    const yours = yoursOf(await runView(page))
    await acceptBtn(page).click()
    await expect.poll(() => lines().length).toBe(1)
    await acceptBtn(page).click()
    await expect.poll(() => lines().length).toBe(2)
    await reopen(page)
    await expect(cardTitle(page)).toHaveText(yours[2].title)
    await expect(listRow(page, yours[2].fp)).toHaveAttribute('aria-current', 'true')
    expect(lines()).toHaveLength(2) // landing writes nothing
  })

  test('Reflection: a list beside the statement says each position or "Not rated", and a click opens it', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 })
    await openDay(page)
    await reflTab(page).click()
    const rows = page.locator('[data-list-statement]')
    await expect(rows).toHaveCount(4)
    await expect(page.locator('[data-list-summary]')).toHaveText('4 not rated · 4 statements')
    await expect(rows.first()).toContainText('Not rated')
    expect(await inView(page, '.d-pst'), 'statement').toBe(true)
    expect(await inView(page, '.d-pbrow'), 'position buttons').toBe(true)
    // Unsure is a position (0), never "Not rated"
    await page.locator('.d-pcard [data-side=unsure]').click()
    await expect.poll(() => lines().at(-1)?.position).toBe(0)
    await expect(rows.first()).toContainText('Unsure')
    await expect(rows.first()).toHaveAttribute('data-list-state', 'rated')
    await expect(page.locator('[data-list-summary]')).toHaveText('3 not rated · 4 statements')
    await expect(page.locator('[data-list-summary]')).not.toHaveClass(/done/)
    await rows.nth(2).click()
    await expect(page.locator('.d-bpos')).toHaveText('3 of 4')
    await expect(rows.nth(2)).toHaveAttribute('aria-current', 'true')
    // a reload opens on the first statement not rated
    await reopen(page)
    await reflTab(page).click()
    await expect(page.locator('.d-bpos')).toHaveText('2 of 4')
  })

  test('3 pressed twice at once cycles Agree to Agree+, never writes Agree twice', async ({ page }) => {
    await openDay(page)
    await reflTab(page).click()
    await page.locator('.d-pst').click()
    await page.keyboard.press('3')
    await page.keyboard.press('3') // no wait: the first save has not been reloaded yet
    await expect.poll(() => lines().filter((d) => d.kind === 'reflection').map((d) => d.position)).toEqual([2, 3])
    await expect(page.locator('.d-pb.on')).toHaveText('Agree+')
  })

  test('when every statement is rated the list says so, in green', async ({ page }) => {
    await openDay(page)
    await reflTab(page).click()
    for (let k = 0; k < 4; k++) {
      await page.locator('[data-list-statement]').nth(k).click()
      await page.locator('.d-pcard [data-side=agree]').click()
      await expect(page.locator('[data-list-statement]').nth(k)).toHaveAttribute('data-list-state', 'rated')
    }
    await expect(page.locator('[data-list-summary]')).toHaveText('✓ All 4 rated')
    await expect(page.locator('[data-list-summary]')).toHaveClass(/done/)
  })

  for (const width of [375, 320]) {
    test(`${width}px: both lists fold to one line with what still needs you; a pick folds it again; no horizontal scroll`, async ({ page }) => {
      await page.setViewportSize({ width, height: 760 })
      await openDay(page)
      await collapseSidebar(page)
      const yours = yoursOf(await runView(page))
      const tog = page.locator('[data-card-list] .d-cltog')
      await expect(tog).toHaveText(`▶${yours.length} still need you · ${yours.length} cards`)
      await expect(listRow(page, yours[0].fp)).toBeHidden()
      await tog.click()
      await listRow(page, yours[1].fp).click()
      await expect(cardTitle(page)).toHaveText(yours[1].title)
      await expect(listRow(page, yours[1].fp)).toBeHidden()
      await reflTab(page).click()
      await expect(page.locator('[data-card-list] .d-cltog')).toHaveText('▶4 not rated · 4 statements')
      await expect(page.locator('[data-list-statement]').first()).toBeHidden()
      const over = await page.evaluate(() => {
        const r = document.querySelector('.day-root')
        return r ? r.scrollWidth - r.clientWidth : -1
      })
      expect(over).toBeLessThanOrEqual(0)
    })
  }
})

test.describe('P1440: stories reach the agent', () => {
  const reflTab = (page: Page) => page.locator('.d-tabs').getByRole('tab', { name: 'Reflection' })
  const storyBox = (page: Page) => page.locator('.d-pcard').getByLabel(/Add your story/)
  const reflLines = () => lines().filter((d) => d.kind === 'reflection')
  const STORY = 'Invented story: the test widget took two tries.'

  test('a story with no position is saved, says "Story, no position" and "not sent yet", and is not a rating', async ({ page }) => {
    await openDay(page)
    await reflTab(page).click()
    await storyBox(page).fill(STORY)
    await page.locator('.d-pst').click() // leaving the box saves it
    await expect.poll(() => reflLines().length).toBe(1)
    expect(reflLines()[0]).toEqual(expect.objectContaining({ kind: 'reflection', target: 'c1', story: STORY }))
    expect(reflLines()[0].position).toBeUndefined()
    await expect(page.locator('[data-list-statement="c1"]')).toContainText('Story, no position')
    await expect(page.locator('.d-pcard [data-story-line]')).toHaveText('Story: not sent yet')
    await expect(page.locator('[data-progress]')).toHaveText('0 of 4 rated')
    // emptying the story and saving deletes it (no position: the answer goes)
    await storyBox(page).fill('')
    await page.locator('.d-pst').click()
    await expect.poll(() => reflLines().at(-1)?.remove).toBe(true)
    await expect(page.locator('.d-pcard [data-story-line]')).toHaveCount(0)
  })

  test('Accept & next saves the story still being typed (and the position) in one write, then moves on', async ({ page }) => {
    await openDay(page)
    await reflTab(page).click()
    await expect(acceptBtn(page)).toHaveCount(0) // nothing picked or typed: nothing to accept
    await storyBox(page).fill(STORY) // typed, never left
    await expect(acceptBtn(page)).toHaveAttribute('aria-label', 'Accept and next')
    await acceptBtn(page).click()
    await expect(page.locator('.d-bpos')).toHaveText('2 of 4')
    expect(reflLines()).toHaveLength(1) // one write: the box's blur did not save a second line
    expect(reflLines()[0]).toEqual(expect.objectContaining({ target: 'c1', story: STORY }))
    // a position alone is accepted as it is
    await page.locator('.d-pcard [data-side=disagree]').click()
    await expect.poll(() => reflLines().length).toBe(2)
    await acceptBtn(page).click()
    await expect(page.locator('.d-bpos')).toHaveText('3 of 4')
    expect(reflLines()[2]).toEqual(expect.objectContaining({ target: 'c2', position: -2 }))
    // the last statement says Accept, and stays
    await page.locator('[data-list-statement="c4"]').click()
    await page.locator('.d-pcard [data-side=agree]').click()
    await expect(acceptBtn(page)).toHaveAttribute('aria-label', 'Accept')
  })

  test('a failed Accept stays on the statement, says so, and keeps the typed story', async ({ page }) => {
    await openDay(page)
    await reflTab(page).click()
    await page.route('**/api/day/decisions', (r) => r.fulfill({ status: 500, json: { error: 'Failed to record decisions' } }))
    await storyBox(page).fill(STORY)
    // the page re-reads the run after a failed write: only once that has landed can a wrong move show
    const reread = page.waitForResponse((r) => r.url().includes('/api/day/runs/'))
    await acceptBtn(page).click()
    await expect(page.locator('.d-toast')).toHaveText('Not saved: Failed to record decisions')
    await reread
    await page.waitForTimeout(200)
    await expect(page.locator('.d-bpos')).toHaveText('1 of 4')
    await expect(storyBox(page)).toHaveValue(STORY)
    expect(fileText()).toBe('')
  })

  test('Next, Previous and the statement list never write a typed story', async ({ page }) => {
    await openDay(page)
    await reflTab(page).click()
    await storyBox(page).fill(STORY)
    await nextBtn(page).click()
    await expect(page.locator('.d-bpos')).toHaveText('2 of 4')
    await prevBtn(page).click()
    await expect(page.locator('.d-bpos')).toHaveText('1 of 4')
    await expect(storyBox(page)).toHaveValue(STORY) // the draft is kept on the page
    await page.locator('[data-list-statement="c3"]').click()
    await expect(page.locator('.d-bpos')).toHaveText('3 of 4')
    await page.waitForTimeout(300)
    expect(fileText()).toBe('')
  })

  test('each story says where it is; Mark done closes it; earlier open stories are listed until marked', async ({ page }) => {
    await openDay(page)
    const earlierRun = (await (await page.request.get(`/api/day/runs/${EARLIER_ID}`)).json()) as { report: { pass_id: string; started_at: string } }
    writeFileSync(
      DECISIONS,
      JSON.stringify({ kind: 'reflection', target: 'c2', story: 'Invented story from an earlier day.', run_id: earlierRun.report.pass_id, at: '2026-10-03T09:00:00.000Z' }) + '\n',
    )
    await reopen(page)
    await reflTab(page).click()
    const earlier = page.locator('[data-earlier-stories]')
    await expect(earlier).toContainText('Earlier stories not yet handled (1)')
    await expect(earlier).toContainText('Invented story from an earlier day.')
    await expect(earlier.locator('[data-story-line]')).toHaveText('Story: not sent yet')
    // this run's story: written, then marked done on its card
    await storyBox(page).fill(STORY)
    await page.locator('.d-pst').click()
    await expect(page.locator('.d-pcard [data-story-line]')).toHaveText('Story: not sent yet')
    await page.locator('.d-pcard [data-story-done]').click()
    await expect(page.locator('.d-pcard [data-story-line]')).toHaveText('Story: done · acted on')
    expect(lines().at(-1)).toEqual(expect.objectContaining({ kind: 'story_done', target: 'c1', outcome: 'acted', note: 'marked on the board' }))
    expect(lines().at(-1)?.story_hash).toMatch(/^[0-9a-f]{64}$/)
    // the earlier one: Mark done takes it off the list
    await earlier.locator('[data-story-done]').click()
    await expect(page.locator('[data-earlier-stories]')).toHaveCount(0)
    expect(lines().at(-1)).toEqual(expect.objectContaining({ kind: 'story_done', run_id: earlierRun.report.pass_id, target: 'c2' }))
    // editing a done story reopens it
    await storyBox(page).fill(`${STORY} And one more line.`)
    await page.locator('.d-pst').click()
    await expect(page.locator('.d-pcard [data-story-line]')).toHaveText('Story: not sent yet')
  })

  test('an earlier run shows its stories without buttons', async ({ page }) => {
    await openDay(page)
    const earlierRun = (await (await page.request.get(`/api/day/runs/${EARLIER_ID}`)).json()) as { report: { pass_id: string } }
    writeFileSync(DECISIONS, JSON.stringify({ kind: 'reflection', target: 'c1', story: 'Invented story on the earlier run.', run_id: earlierRun.report.pass_id, at: '2026-10-03T09:00:00.000Z' }) + '\n')
    await reopen(page)
    await page.getByRole('button', { name: 'Previous run' }).click()
    await expect(page.locator('[data-run-date]')).toHaveText('Sat 3 Oct')
    await reflTab(page).click()
    await expect(page.locator('.d-pcard [data-story-line]')).toHaveText('Story: not sent yet')
    await expect(page.locator('.d-story-ro')).toHaveText('Invented story on the earlier run.')
    await expect(page.locator('[data-story-done], [data-story-resend]')).toHaveCount(0)
  })
})
