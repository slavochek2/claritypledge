// P1399 Phase A — the Day page, end to end, on SYNTHETIC data (scripts/day-seed.ts).
// Each test re-seeds the temp day dir; the API reads it at request time.

import { expect, test, type Locator, type Page } from '@playwright/test'
import { existsSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { DAY_E2E_DIR, OFF, ON } from '../playwright.day.config'
import { EARLIER_ID, LATEST_ID, NEWER_ID, seedDay, type Variant } from '../scripts/day-seed'
import { CHECKS, synthReport } from '../server/__tests__/fixtures/day-fixture'

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

async function runView(page: Page, id = LATEST_ID) {
  const r = await page.request.get(`/api/day/runs/${id}`)
  return (await r.json()) as { view: { issues: { fp: string; title: string; options: { id: string; label: string }[] }[] }; collectedCount: number }
}

const card = (page: Page) => page.locator('.d-focus')
const cardTitle = (page: Page) => card(page).locator('h2')
const nextBtn = (page: Page) => page.locator('[data-bottom-bar]').getByRole('button', { name: /^Next/ })
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
  test('cards follow the view order; the card shows A / Obstacle / B, the preselected recommendation, Ask and Other', async ({ page }) => {
    await openDay(page)
    const { view } = await runView(page)
    await expect(page.locator('.d-bpos')).toHaveText(`1 of ${view.issues.length}`)
    await expect(cardTitle(page)).toHaveText('Database rules are live before review')
    await expect(card(page).locator('.d-pill.urg')).toHaveText('Urgent')
    await expect(card(page).locator('.d-pill.imp')).toHaveText('Important')
    await expect(card(page).locator('dt')).toHaveText(['Point A', 'Obstacle', 'Point B'])
    const rec = card(page).locator('.d-opt').filter({ hasText: 'Give to the agent' })
    await expect(rec).toContainText('Recommended · 85%')
    await expect(rec.locator('input')).toBeChecked()

    await card(page).getByRole('button', { name: /More info/ }).click()
    await expect(card(page).locator('.d-moreinfo')).toContainText('Verified against the source')
    await expect(card(page).locator('.d-moreinfo')).toContainText('2 policies on live, 0 in migrations')

    await card(page).locator('.d-optrow').filter({ hasText: 'Ask a question…' }).click()
    await expect(card(page).getByRole('textbox', { name: 'Your question' })).toBeVisible()
    await card(page).locator('.d-optrow').filter({ hasText: 'Other…' }).click()
    await expect(card(page).getByRole('textbox', { name: 'Your answer' })).toBeVisible()
    expect(fileText()).toBe('') // Ask/Other without text writes nothing

    for (let i = 0; i < view.issues.length; i++) {
      await expect(cardTitle(page)).toHaveText(view.issues[i].title)
      if (i < view.issues.length - 1) await nextBtn(page).click()
    }
    await expect(nextBtn(page)).toBeDisabled()
  })

  test('Previous / Next and ← → move between cards and write nothing', async ({ page }) => {
    await openDay(page)
    const { view } = await runView(page)
    // put one line in the file so "unchanged" is about bytes, not just existence
    await card(page).locator('.d-optrow').filter({ hasText: 'Roll back now' }).click()
    await expect.poll(() => lines().length).toBe(1)
    const before = fileText()

    await nextBtn(page).click()
    await expect(cardTitle(page)).toHaveText(view.issues[1].title)
    await cardTitle(page).click() // a neutral spot: focus leaves the controls
    await page.keyboard.press('ArrowRight')
    await expect(cardTitle(page)).toHaveText(view.issues[2].title)
    await page.keyboard.press('ArrowLeft')
    await expect(cardTitle(page)).toHaveText(view.issues[1].title)
    await prevBtn(page).click()
    await expect(cardTitle(page)).toHaveText(view.issues[0].title)
    // arrows on a focused radio page too, instead of changing the answer
    await card(page).locator('.d-opt').filter({ hasText: 'Roll back now' }).locator('input').focus()
    await page.keyboard.press('ArrowRight')
    await expect(cardTitle(page)).toHaveText(view.issues[1].title)
    // typing in a text box is left alone
    await card(page).locator('.d-optrow').filter({ hasText: 'Other…' }).click()
    await page.keyboard.press('ArrowRight')
    await expect(cardTitle(page)).toHaveText(view.issues[1].title)

    await page.waitForTimeout(300)
    expect(fileText()).toBe(before)
    await expect(page.locator('[data-progress]')).toContainText(`of ${view.issues.length} resolved`)
  })

  test('the bottom bar does not move when More info or Other expands', async ({ page }) => {
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
    await card(page).locator('.d-optrow').filter({ hasText: 'Other…' }).click()
    await expect(card(page).getByRole('textbox', { name: 'Your answer' })).toBeVisible()
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
    await card(page).locator('.d-optrow').filter({ hasText: 'Roll back now' }).click()
    await expect.poll(() => lines().length).toBe(1)
    expect(lines()[0]).toMatchObject({ kind: 'option', target: 'rules:live-not-on-main', option_id: 'rollback', run_id: '2026-10-04T05-37-45Z' })
    await reopen(page)
    await expect(card(page).locator('.d-opt').filter({ hasText: 'Roll back now' }).locator('input')).toBeChecked()
    await expect(page.locator('[data-progress]')).toContainText('1 of')
  })

  test('keys 1–9 pick the Nth option and write one line', async ({ page }) => {
    await openDay(page)
    const { view } = await runView(page)
    await cardTitle(page).click() // a neutral spot: focus leaves the controls
    await page.keyboard.press('2')
    await expect(card(page).locator('.d-opt').nth(1).locator('input')).toBeChecked()
    await expect.poll(() => lines().length).toBe(1)
    expect(lines()[0]).toMatchObject({ kind: 'option', target: view.issues[0].fp, option_id: view.issues[0].options[1].id })
    await expect(card(page).locator('.d-key').first()).toHaveText('1')
  })

  test('Start fixing writes the preselected batch and copies a verify-first prompt with the question first', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: `http://localhost:${ON.web}` })
    await openDay(page)
    const { view, collectedCount } = await runView(page)
    await nextBtn(page).click()
    await card(page).locator('.d-optrow').filter({ hasText: 'Ask a question…' }).click()
    const QUESTION = 'Is the room error the same bug as last week?'
    await card(page).getByRole('textbox', { name: 'Your question' }).fill(QUESTION)
    await expect(startBtn(page)).toHaveText(`Start fixing (${collectedCount})`)

    const promptRes = page.waitForResponse((r) => r.url().endsWith('/api/day/prompt'))
    await startBtn(page).click()
    const { prompt } = await (await promptRes).json()
    // the suite's server never opens a terminal (KANBAN_DAY_LAUNCH=off): the real 502 path copies instead
    await expect(page.locator('.d-toast')).toHaveText('Couldn’t open the terminal — prompt copied instead.')
    const clip = await page.evaluate(() => navigator.clipboard.readText())
    expect(clip).toBe(prompt)
    expect(clip.split('\n')[0]).toContain('still real')
    const q = clip.indexOf(QUESTION)
    expect(q).toBeGreaterThan(0)
    expect(q).toBeLessThan(clip.indexOf(view.issues[0].title))

    const written = lines()
    expect(written).toHaveLength(view.issues.length) // one batch: the ask + every preselected answer
    expect(written.filter((d) => d.option_id === 'ask')).toEqual([expect.objectContaining({ text: QUESTION, is_question: true })])
    expect(new Set(written.map((d) => d.at)).size).toBeLessThanOrEqual(2)
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
    await expect(card(page).getByText('Ask a question…')).toHaveCount(0)
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
    await expect(page.locator('.d-note')).toContainText('in this run couldn’t be read.')
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
  test('Monitoring: Systems lists every non-money check; a budget raise joins Start fixing and can be undone', async ({ page }) => {
    await openDay(page)
    await page.locator('.d-tabs').getByRole('tab', { name: 'Monitoring' }).click()
    const sys = page.locator('[data-systems]')
    for (const c of CHECKS) await expect(sys.locator(`[data-check="${c.id}"]`)).toHaveCount(c.group === 'Money' ? 0 : 1)
    await expect(sys.locator('[data-check="keyspend"] .d-w')).toHaveText('Not proven · no result')
    await expect(page.locator('.d-srcc').first()).toContainText('+ 2 money checks under Google Cloud')

    await page.getByRole('button', { name: /^Codex/ }).click()
    await expect(page.locator('.d-main')).toContainText('not collected yet')
    await page.getByRole('button', { name: /^Claude/ }).click()
    await expect(page.locator('.d-main')).toContainText('5-hour window')
    await expect(page.locator('.d-main')).toContainText('Runs out Tue')

    await page.getByRole('button', { name: /^Google Cloud/ }).click()
    await expect(page.locator('.d-credits')).toHaveText('Credits ~€585 · unverified (baseline 37 days old)')
    // every check appears somewhere in Monitoring: the money ones here
    for (const c of CHECKS.filter((c) => c.group === 'Money')) {
      await expect(page.locator(`[data-money-checks] [data-check="${c.id}"]`)).toHaveCount(1)
    }
    await expect(page.locator('[data-key]').first()).toContainText('no data')
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

  test('Stats: readings show; what is not collected says so, never 0', async ({ page }) => {
    await openDay(page)
    await page.locator('.d-tabs').getByRole('tab', { name: 'Stats' }).click()
    await expect(page.locator('[data-reading="mentions"]')).toContainText('1')
    await expect(page.locator('[data-funnel]')).toContainText('not collected yet')
    await expect(page.locator('[data-funnel] .d-fb')).toHaveCount(0) // no sample bars
    await expect(page.locator('[data-funnel]')).not.toContainText(/\b0\b/)
    // funnel first, then the lines, then the readings
    const order = await page.locator('[data-funnel], [data-series], [data-reading]').evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.funnel !== undefined ? 'funnel' : (e as HTMLElement).dataset.series ? 'series' : 'reading'))
    expect(order[0]).toBe('funnel')
    expect(order.lastIndexOf('series')).toBeLessThan(order.indexOf('reading'))
    await expect(page.locator('[data-series="reachouts"]')).toContainText('not collected yet')
    await expect(page.locator('[data-series="reachouts"]')).toContainText('target 10 · proposed')
    await expect(page.locator('[data-series="events"] svg')).toBeVisible()
  })

  test('Reflection: a position opens the story box; keys 1 2 3 rate and cycle; Remove position undoes', async ({ page }) => {
    await openDay(page)
    await page.locator('.d-tabs').getByRole('tab', { name: 'Reflection' }).click()
    const cardR = page.locator('.d-pcard')
    await expect(cardR.getByLabel(/Add your story/)).toHaveCount(0)
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
    await expect.poll(() => lines().at(-1)?.remove).toBe(true)
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
    const i = view.issues.findIndex((x) => x.fp === 'weekly:reach-target')
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
    const i = view.issues.findIndex((x) => x.fp === 'monthly:archive-stale-specs')
    expect(i).toBeGreaterThanOrEqual(0)
    for (let k = 0; k < i; k++) await nextBtn(page).click()
    await expect(card(page).locator('.d-topic .d-runbadge')).toHaveText('Monthly review')
    await page.locator('.d-tabs').getByRole('tab', { name: 'Reflection' }).click()
    for (let k = 0; k < 4; k++) await nextBtn(page).click()
    await expect(page.locator('.d-pcard .d-runbadge')).toHaveText('Monthly review')
  })
})

test.describe('review round 1', () => {
  test('an empty Ask is not an answer: not resolved, and Start fixing sends you back to it', async ({ page }) => {
    await openDay(page)
    await nextBtn(page).click()
    await nextBtn(page).click()
    // Next marked the two cards left behind as resolved; the empty Ask must not add a third
    await expect(page.locator('[data-progress]')).toHaveText(/^2 of/)
    await card(page).locator('.d-optrow').filter({ hasText: 'Ask a question…' }).click()
    await expect(card(page).getByRole('textbox', { name: 'Your question' })).toBeFocused()
    await expect(page.locator('[data-progress]')).toHaveText(/^2 of/)
    await prevBtn(page).click()
    await prevBtn(page).click()
    await expect(page.locator('.d-bpos')).toHaveText(/^1 of/)
    await startBtn(page).click()
    await expect(page.locator('.d-toast')).toHaveText('Write your question first, or pick another answer')
    await expect(page.locator('.d-bpos')).toHaveText(/^3 of/)
    expect(fileText()).toBe('')
    // with text it counts once saved
    await card(page).getByRole('textbox', { name: 'Your question' }).fill('Which guests hit it?')
    await cardTitle(page).click()
    await expect.poll(() => lines().length).toBe(1)
    await expect(page.locator('[data-progress]')).toHaveText(/^3 of/)
  })

  test('paging past an issue answered with Ask is not trapped in its text box; ↑ ↓ on a radio change nothing', async ({ page }) => {
    await openDay(page)
    const { view } = await runView(page)
    await card(page).locator('.d-optrow').filter({ hasText: 'Ask a question…' }).click()
    await card(page).getByRole('textbox', { name: 'Your question' }).fill('Is rollback safe?')
    await cardTitle(page).click()
    await expect.poll(() => lines().length).toBe(1)
    await page.keyboard.press('ArrowRight')
    await expect(cardTitle(page)).toHaveText(view.issues[1].title)
    await page.keyboard.press('ArrowLeft')
    await expect(cardTitle(page)).toHaveText(view.issues[0].title)
    await expect(card(page).getByRole('textbox', { name: 'Your question' })).not.toBeFocused()
    await page.keyboard.press('ArrowRight')
    await expect(cardTitle(page)).toHaveText(view.issues[1].title)

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
    await card(page).locator('.d-optrow').filter({ hasText: 'Roll back now' }).click()
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

  test('the request body is exactly { run_id }; 200 shows "Running in terminal" until a decision changes', async ({ page }) => {
    await openDay(page)
    let body: unknown = null
    await page.route('**/api/day/start', async (route) => {
      body = route.request().postDataJSON()
      await new Promise((r) => setTimeout(r, 400))
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ launched: true, how: 'tab' }) })
    })
    await startBtn(page).click()
    await expect(page.locator('[data-launch="opening"]')).toHaveText('Opening…')
    await expect(page.locator('[data-launch="running"]')).toHaveText('✓ Running in terminal')
    await expect(page.locator('.d-toast')).toHaveText('Opened a new tab in your terminal')
    await expect(startBtn(page)).toHaveCount(0)
    expect(body).toEqual({ run_id: LATEST_ID })
    await pick(page, 'Roll back now')
    await expect(startBtn(page)).toBeVisible()
    await expect(page.locator('[data-launch]')).toHaveCount(0)
  })

  test('how=window says so', async ({ page }) => {
    await openDay(page)
    await page.route('**/api/day/start', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ launched: true, how: 'window' }) }),
    )
    await startBtn(page).click()
    await expect(page.locator('.d-toast')).toHaveText('Opened a new window in your terminal')
  })

  test('429 asks to wait; the button stays', async ({ page }) => {
    await openDay(page)
    await page.route('**/api/day/start', (route) =>
      route.fulfill({ status: 429, contentType: 'application/json', body: JSON.stringify({ error: 'Too soon' }) }),
    )
    await startBtn(page).click()
    await expect(page.locator('.d-toast')).toHaveText('Started less than a minute ago. Wait a moment, or copy the prompt.')
    await expect(startBtn(page)).toBeVisible()
  })

  test('409 already-sent offers Copy, which copies the prompt', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: `http://localhost:${ON.web}` })
    await openDay(page)
    await page.route('**/api/day/start', (route) =>
      route.fulfill({ status: 409, contentType: 'application/json', body: JSON.stringify({ error: 'Already sent', reason: 'already-sent' }) }),
    )
    await startBtn(page).click()
    const toast = page.locator('.d-toast')
    await expect(toast).toContainText('This was already sent to a terminal. Copy it instead?')
    await toast.getByRole('button', { name: 'Copy' }).click()
    await expect(toast).toHaveText('Prompt copied')
    expect((await page.evaluate(() => navigator.clipboard.readText())).split('\n')[0]).toContain('still real')
    await expect(startBtn(page)).toBeVisible()
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
    await expect(notes.locator('[data-note]')).toHaveCount(3)
    const shipped = notes.locator('[data-note="shipped"]')
    const fold = shipped.getByRole('button')
    await expect(fold).toHaveAttribute('aria-expanded', 'false')
    expect((await rectOf(fold, 'note fold')).height).toBeGreaterThanOrEqual(40)
    await expect(shipped.locator('.d-notebody')).toHaveCount(0)
    await fold.click()
    await expect(shipped.locator('.d-notebody')).toHaveText('Event page: room-ended message reworded.\nBoard: Day page phase A.')
    expect(await shipped.locator('.d-notebody').evaluate((e) => getComputedStyle(e).whiteSpace)).toBe('pre-wrap')
    await expect(notes.locator('[data-note="week-measures"] .d-runbadge')).toHaveText('Weekly review')
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
      await card(page).locator('.d-optrow').filter({ hasText: 'Other…' }).click()
      const box = card(page).getByRole('textbox', { name: 'Your answer' })
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
