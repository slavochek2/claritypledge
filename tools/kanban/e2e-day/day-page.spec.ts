// P1399 Phase A — the Day page, end to end, on SYNTHETIC data (scripts/day-seed.ts).
// Each test re-seeds the temp day dir; the API reads it at request time.

import { expect, test, type Locator, type Page } from '@playwright/test'
import { existsSync, readFileSync, writeFileSync } from 'fs'
import { join, resolve } from 'path'
import { createRequire } from 'module'
import { DAY_E2E_DIR, OFF, ON } from '../playwright.day.config'
import { EARLIER_ID, LATEST_ID, NEWER_ID, seedDay, type Variant } from '../scripts/day-seed'
import { CHECKS, synthReport } from '../server/__tests__/fixtures/day-fixture'
import { sentKey, type DayCloud, type DayReport } from '../src/lib/day'
import { storyHash } from '../server/dayStories'

/** P1442: budget rows + AI prepaid key cards, invented names only. */
const CARDS_CLOUD = JSON.parse(readFileSync(new URL('../server/__tests__/fixtures/day-cloud-cards.json', import.meta.url), 'utf-8')) as DayCloud

type CardsCloud = DayCloud & { budgets: NonNullable<DayCloud['budgets']>; keys: NonNullable<DayCloud['keys']> }
function cardsCloud(): CardsCloud {
  const c = JSON.parse(JSON.stringify(CARDS_CLOUD)) as DayCloud
  if (!c.budgets || !c.keys) throw new Error('day-cloud-cards fixture lost budgets or keys')
  return c as CardsCloud
}
function keyOf(c: CardsCloud, id: string): CardsCloud['keys'][number] {
  const k = c.keys.find((x) => x.id === id)
  if (!k) throw new Error(`fixture has no key ${id}`)
  return k
}

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
  return (await r.json()) as {
    view: { issues: ViewIssue[]; checks: { id: string; status: string; covered_by?: string; connection?: string; issue_fp?: string }[]; connections: { id: string; state: string }[] }
    report: { reflection?: { statements: { id: string }[] } }
    collectedCount: number
  }
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
// P1463: the button says only "Start fixing"; what it sends is named beside it, its count is data-send-count
const startBtn = (page: Page) => page.getByRole('button', { name: /^Start fixing$/ })
/** A value that must exist, or the test fails right here with a name. */
function must<T>(v: T | null | undefined, what: string): T {
  if (v === null || v === undefined) throw new Error(`missing: ${what}`)
  return v
}
const rectOf = async (l: Locator, what = 'element') => must(await l.boundingBox(), `${what} box`)
/** The board's sidebar animates its width: wait until the Day page has the room before measuring. */
async function collapseSidebar(page: Page) {
  await page.locator('button[title="Collapse sidebar"]').click()
  // the collapsed sidebar is 44px wide; the page starts right after it once the animation ends
  await expect.poll(async () => Math.round((await rectOf(page.locator('.day-root'), 'day root')).x)).toBe(44)
}
const startCount = async (page: Page) => Number(must(await startBtn(page).getAttribute('data-send-count'), 'Start fixing count'))
/** P1463: no "Cards X of N resolved" bar — the card list's ✓ rows are the progress */
const answeredRows = (page: Page) => page.locator('[data-card-list] .d-clrow .d-sdot.done')
/** P1468: the agent's work is named once, in its panel — the bottom bar has no link (count must be 0) */
const agentLink = (page: Page) => page.locator('[data-bottom-bar] [data-agent-link]')
/** P1468: the founder's story box opens from CP's "+ Add a story" when there is no story or draft yet */
const storyBox = (page: Page) => page.locator('.d-cpcard').getByRole('textbox', { name: 'Your story' })
const addStoryBtn = (page: Page) => page.locator('.d-cpcard').getByRole('button', { name: 'Add a story for this point' })
async function openStory(page: Page, how: 'click' | 'tap' = 'click') {
  if (await addStoryBtn(page).isVisible()) await (how === 'tap' ? addStoryBtn(page).tap() : addStoryBtn(page).click())
  await expect(storyBox(page)).toBeVisible()
}
async function fillStory(page: Page, text: string) {
  await openStory(page)
  await storyBox(page).fill(text)
}
/** The seed run's statements: they follow its founder cards in the one queue (P1463). */
const STMTS = 4
const SEED_CARDS = 4
/** a statement's place in the queue: after the seed's founder cards */
const stmtPos = (k: number) => `${SEED_CARDS + k} of ${SEED_CARDS + STMTS}`
/** P1463 round 3: a card answered before you arrived is folded to its answer — Change (or Show the card) opens it */
async function unfold(page: Page) {
  const f = page.locator('.d-focus[data-folded]')
  if (await f.count()) await f.getByRole('button', { name: /^(Change|Show the card)$/ }).click()
  await expect(page.locator('.d-focus .d-opts')).toBeVisible()
}
/**
 * P1463 round 3: Reflection is not a tab — its statements follow the cards. P1468: they are rows of
 * the same list under a `Stories` divider (the Reflection row is gone), so this opens the first
 * statement not yet answered (else the first), as the Reflection row did.
 */
async function openReflection(page: Page) {
  const rows = page.locator('[data-card-list] [data-list-statement]')
  await rows.first().waitFor({ state: 'attached' })
  const states = await rows.evaluateAll((els) => els.map((e) => e.getAttribute('data-list-state')))
  // an earlier run is read-only: the Reflection row opened its first statement there
  const readOnly = (await page.locator('[data-bottom-bar] .d-ro').count()) > 0
  // the row's rule ignored drafts: a statement with only an unsaved draft was still "to rate"
  const open = states.findIndex((st) => st === 'unrated' || st === 'unsaved')
  const row = rows.nth(readOnly ? 0 : Math.max(0, open))
  if (!(await row.isVisible())) await page.locator('[data-card-list] .d-cltog').click()
  await row.click()
  await expect(page.locator('[data-statement]')).toBeVisible()
}
/** a tab by name — "Reflection" is reached through the queue (P1463) */
async function goTab(page: Page, name: string) {
  if (name === 'Reflection') {
    await page.locator('.d-tabs').getByRole('tab', { name: 'Daily report', exact: true }).click()
    return openReflection(page)
  }
  await page.locator('.d-tabs').getByRole('tab', { name, exact: true }).click()
}
/** P1463: Status opens as one line; the full panel is one click away */
const openStatus = async (page: Page) => {
  await page.locator('.d-sline, .d-status').first().waitFor()
  const t = page.locator('[data-status-toggle]')
  if (await t.count()) await t.click()
  await expect(page.locator('.d-status')).toBeVisible()
}
const OWN_LABEL = 'Your answer or question…'
const ownRow = (page: Page) => card(page).locator('.d-optrow').filter({ hasText: OWN_LABEL })
const ownBox = (page: Page) => card(page).getByRole('textbox', { name: 'Your answer or question' })
const stillYours = (page: Page) => page.locator('[data-still-yours]')
/** P1445 E: agent work is a list under the card, not pager cards */
const agentList = (page: Page) => page.locator('[data-agent-list]')
const openAgentList = async (page: Page) => {
  const fold = agentList(page).locator('.d-fold')
  if ((await fold.getAttribute('aria-expanded')) !== 'true') await fold.click()
}
/** The seed's Stats has one series; this adds one the run did not collect (a placeholder to measure). */
const withUncollectedSeries = (b: RunBody) =>
  b.report?.stats?.series?.unshift({ id: 'reachouts', label: 'Reach-outs per week', collected: false, target: 10, target_proposed: true, points: [] })
/** Patch what the page reads for a run (the server's real answer, edited): for states the seed does not have. */
interface RunBody {
  report?: DayReport
  /** P1468: `parked` — a run with nothing parked (AC4) */
  view?: { issues: ViewIssue[]; parked?: unknown[] }
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
  test('three tabs (P1463: Reflection is in the Daily report queue), one switcher below, no tab repeats its own name as a heading', async ({ page }) => {
    await openDay(page)
    const tabs = page.getByRole('tab')
    await expect(page.locator('.d-tabs .d-tl')).toHaveText(['Daily report', 'Stats', 'Monitoring'])
    await expect(page.locator('[data-run-date]')).toHaveText('Sun 4 Oct')
    for (const name of ['Daily report', 'Stats', 'Monitoring']) {
      await page.locator('.d-tabs').getByRole('tab', { name, exact: true }).click()
      await expect(page.locator('.d-tabs').getByRole('tab', { name, exact: true })).toHaveAttribute('aria-selected', 'true')
      await expect(page.locator('.d-main').getByRole('heading', { name, exact: true })).toHaveCount(0)
      await expect(page.locator('[data-run-date]')).toBeVisible()
    }
    expect(await tabs.count()).toBeGreaterThanOrEqual(3)
  })
})

test.describe('status panel', () => {
  test('P1463: Status is sorted by outcome — every check once, what didn’t work grouped under its cause, each with its action', async ({ page }) => {
    await openDay(page, 'unknown')
    await openStatus(page)
    const panel = page.locator('.d-status')
    await panel.getByRole('button', { name: /Worked \(\d+\)/ }).click()
    // one home each: what worked/skipped in the fold, what didn't under "Didn't work"
    for (const c of [...CHECKS.map((c) => c.id), 'mystery']) await expect(panel.locator(`[data-check="${c}"]`)).toHaveCount(1)
    await expect(panel.locator('[data-check="site"] [data-status-word]')).toHaveText('Worked')
    await expect(panel.locator('[data-check="video"] [data-status-word]')).toHaveText('Skipped')
    await expect(panel.locator('[data-check="video"] .d-w')).toHaveText('Skipped · not scheduled today')
    await expect(panel.locator('[data-check="mystery"] [data-status-word]')).toHaveText('Not proven')
    // the count is the groups: each broken connection once, plus each failing check nothing explains
    const { view } = await runView(page)
    const broken = view.connections.filter((c: { state: string }) => c.state !== 'ok').map((c: { id: string }) => c.id)
    const loose = view.checks.filter(
      (c: { status: string; covered_by?: string; connection?: string }) => c.status !== 'ok' && c.status !== 'skipped' && !c.covered_by && !(c.connection && broken.includes(c.connection)),
    )
    expect(broken.length).toBeGreaterThan(0) // known-bad control: the seed has a broken connection
    await expect(panel.locator('[data-fails-head]')).toHaveText(`Didn’t work (${broken.length + loose.length})`)
    // a broken connection carries what it breaks: Chat groups sits under Beeper, not on its own
    await expect(panel.locator('[data-fail="c:beeper"] [data-check="chats"]')).toHaveCount(1)
    await expect(panel.locator('[data-fail="k:chats"]')).toHaveCount(0)
    // known-bad control: the unknown check with no write-up is a failure, never "worked"
    await expect(panel.locator('.d-plist [data-check="mystery"]')).toHaveCount(0)
    // its card is agent work (P1445 E): "Open card" opens the agent list on it
    await panel.locator('[data-check="mystery"] [data-open-card]').click()
    await expect(agentList(page).locator('.d-focusrow')).toContainText('Mystery check')
  })

  test('Fix records the decision, never shows ✓, and the panel collapses to a line that reopens', async ({ page, context }) => {
    await context.route('https://sentry.io/**', (r) => r.fulfill({ status: 200, body: 'signin' }))
    await openDay(page)
    await openStatus(page)
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
    await panel.getByRole('button', { name: 'Collapse' }).click()
    const line = page.locator('.d-sline')
    await expect(line).toContainText('2 connection fixes in Start fixing')
    await expect(line.locator('.d-chip').filter({ hasText: 'connection fixes' })).not.toContainText('✓')
    await expect(line).toContainText('12 unpushed commits')
    expect(lines()).toHaveLength(2)

    await page.locator('[data-status-toggle]').click()
    await expect(page.locator('.d-status')).toBeVisible()
    await page.locator('.d-status').getByRole('button', { name: 'Collapse' }).click()
    await expect(page.locator('.d-sline')).toBeVisible()
  })
})

test.describe('new people', () => {
  test('three rows with source, unconfirmed email and a safe LinkedIn link; nothing written', async ({ page }) => {
    await openDay(page)
    // P1463 round 3: new people are not status — their chip opens their own box
    await page.locator('[data-people-chip]').click()
    const panel = page.locator('[data-people-box]')
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
    await expect(page.locator('.d-status')).toHaveCount(0) // not inside Status any more
    expect(fileText()).toBe('')
  })

  test('the collapsed status line counts new people', async ({ page }) => {
    await openDay(page, 'connected')
    // P1463: one chip per fact, in this order, no separators
    const chips = page.locator('.d-sline > *')
    await expect(chips.first()).toHaveText(/^▶✓ \d+ worked$/)
    await expect(page.locator('[data-people-chip]')).toHaveText('3 new people')
    await expect(page.locator('.d-sline .d-chip').last()).toHaveText(/^\d+ unpushed commits$/)
    expect(await page.locator('.d-sline').innerText()).not.toContain('·')
  })

  test('P1463: no new people (or none collected) is no chip and no box — nothing to read', async ({ page }) => {
    await openDay(page, 'no-people')
    await expect(page.locator('.d-sline')).toBeVisible()
    await expect(page.locator('[data-people-chip]')).toHaveCount(0)
    await openDay(page, 'people-absent')
    await expect(page.locator('.d-sline')).toBeVisible()
    await expect(page.locator('[data-people-chip]')).toHaveCount(0)
    await openStatus(page)
    await expect(page.locator('.d-status')).not.toContainText('New people')
  })

  test('the phone strip summary says how many are new', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 760 })
    await openDay(page)
    await collapseSidebar(page)
    // P1463: the one-line status carries it as a chip
    await expect(page.locator('[data-people-chip]')).toHaveText('3 new people')
    await expect(page.locator('[data-people-chip]')).toBeInViewport()
  })
})

test.describe('issues', () => {
  test('the pager walks the founder’s cards in view order; the card shows A / Obstacle / B and the preselected recommendation', async ({ page }) => {
    await openDay(page)
    const v = await runView(page)
    const yours = yoursOf(v)
    expect(yours.length).toBeGreaterThan(1)
    expect(yours.length).toBeLessThan(v.view.issues.length)
    // the seed the queue constants describe (P1463): its cards, then its statements
    expect(yours.length).toBe(SEED_CARDS)
    expect(v.report.reflection?.statements.length).toBe(STMTS)
    await expect(page.locator('.d-bpos')).toHaveText(`1 of ${yours.length + STMTS}`)
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
    // P1463: the last card pages on into the statements; Accept (its own button) is enabled and says it moves on
    await expect(nextBtn(page)).toBeEnabled()
    await expect(acceptBtn(page)).toHaveAttribute('aria-label', 'Accept and next')
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
    // arrows on a focused radio page too, instead of changing the answer (the answered card opens with Change)
    await unfold(page)
    await card(page).locator('.d-opt').filter({ hasText: 'Agent drafts, you send' }).locator('input').focus()
    await page.keyboard.press('ArrowRight')
    await expect(cardTitle(page)).toHaveText(yours[1].title)
    // typing in a text box is left alone
    await ownRow(page).click()
    await page.keyboard.press('ArrowRight')
    await expect(cardTitle(page)).toHaveText(yours[1].title)

    await page.waitForTimeout(300)
    expect(fileText()).toBe(before)
    await expect(page.locator('[data-progress]')).toHaveCount(0) // P1463: no progress bar on the Daily report
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
      await goTab(page, tab)
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
    // P1463: answered before you arrived, the card is its answer; Change shows the pick kept
    await expect(card(page).locator('[data-chosen]')).toContainText('You chose: Agent drafts, you send')
    await unfold(page)
    await expect(card(page).locator('.d-opt').filter({ hasText: 'Agent drafts, you send' }).locator('input')).toBeChecked()
    await expect(answeredRows(page)).toHaveCount(1)
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
    await expect(startBtn(page)).toHaveAttribute('data-send-count', String(expected))

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
    await openStatus(page)
    await page.locator('.d-status').getByRole('button', { name: /Worked \(\d+\)/ }).click()
    // P1463 round 3: one row each — under Didn't work, or in the Worked fold
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
    await expect(add).toHaveCount(0) // P955: no disabled Add as decoration
    await input.fill('300')
    await expect(add).toHaveCount(0)
    await expect(page.locator('[data-raise="account"]')).toContainText('Must be more than €400')
    await input.fill('600')
    await add.click()
    await expect(page.locator('[data-raise="account"]')).toContainText('✓ Monthly budget → €600 · in Start fixing')
    await expect(startBtn(page)).toHaveAttribute('data-send-count', String(n0 + 1))
    expect(lines().at(-1)).toMatchObject({ kind: 'budget', target: 'account', amount: 600, scope: 'monthly' })
    await page.locator('[data-raise="account"]').getByRole('button', { name: 'Undo' }).click()
    await expect(startBtn(page)).toHaveAttribute('data-send-count', String(n0))
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

  test('P1442: every budget row shows, grouped account / alarms / key cards / unmatched; each card has one state, cap and alert facts', async ({ page }) => {
    await patchRun(page, (b) => {
      if (b.report?.monitoring) b.report.monitoring.cloud = CARDS_CLOUD
    })
    await openDay(page)
    await page.locator('.d-tabs').getByRole('tab', { name: 'Monitoring' }).click()
    await page.getByRole('button', { name: /^Google Cloud/ }).click()
    await expect(page.locator('.d-h3')).toHaveText(['Account budget', 'Alarms', 'AI prepaid key cards · closest to limit first', 'Unmatched budgets'])
    // W7: the €400 account budget shows once — the list row merges onto the account card
    await expect(page.locator('[data-section="account"]')).toHaveCount(0)
    await expect(page.locator('.d-acctrow [data-budget="Whole account monthly"]')).toHaveText('Whole account monthly · 3 thresholds')
    await expect(page.locator('.d-acctrow')).toHaveText(/^Account budget €400\/month/)
    await expect(page.locator('[data-section="alarm"] [data-budget]')).toHaveText([/Leak alarm.*€100\/month/])
    await expect(page.locator('[data-section="unmatched"] [data-budget]')).toHaveText([/Old sandbox budget.*€5\/month/])
    // every one of the 11 budget rows is on the page by display name
    for (const b of CARDS_CLOUD.budgets ?? []) await expect(page.locator('.d-main')).toContainText(b.name)
    // the four states, exactly one label per card
    const cards = page.locator('[data-section="keys"] [data-key]')
    await expect(cards).toHaveCount(6)
    for (let i = 0; i < 6; i++) await expect(cards.nth(i).locator('[data-kstate]')).toHaveCount(1)
    const st = (id: string) => page.locator(`[data-key="${id}"] [data-kstate]`)
    await expect(st('key-owl')).toHaveText('Spent')
    await expect(st('key-heron')).toHaveText('Unused this month')
    await expect(st('key-lynx')).toHaveText('No spend recorded')
    await expect(st('key-otter')).toHaveText('Unmeasurable')
    // QA2: measured keys first by their own ratio (Owl 70%, Badger 20%), then the keys with no measured spend
    const order = await page.locator('[data-section="keys"] [data-key]').evaluateAll((els) => els.map((e) => e.getAttribute('data-key')))
    expect(order.slice(0, 2)).toEqual(['key-owl', 'key-badger'])
    // QA2: every closed card shows its Raise affordance
    await expect(page.locator('[data-section="keys"] [data-key] .d-keyrow .d-go')).toHaveCount(6)
    await expect(page.locator('[data-key="key-otter"]')).toContainText('billing export 3 days stale')
    await expect(page.locator('[data-key="key-owl"]')).toContainText('€1.40 of €2')
    // cap state with its meaning; no cap reads as a warning; alert present / missing
    await expect(page.locator('[data-key="key-owl"] [data-cap="set"]')).toHaveText('Cap €2 (Owl cap): set up')
    await expect(page.locator('[data-key="key-owl"] [data-cap="set"]')).toHaveAttribute('title', /Configured.*not proof it stops spend/)
    await expect(page.locator('[data-cap-legend]')).toHaveCount(1)
    // W8: every card has the same shape — a track, filled only for spend
    // QA2: a track only for measured spend or a measured zero against a cap; no bar for unmeasurable / no spend recorded / no cap
    await expect(page.locator('[data-section="keys"] [data-key] [data-track]')).toHaveCount(3)
    await expect(page.locator('[data-key="key-heron"] [data-track]')).toHaveAttribute('data-track', 'zero')
    for (const id of ['key-otter', 'key-lynx', 'key-mole']) await expect(page.locator(`[data-key="${id}"] [data-track]`)).toHaveCount(0)
    await expect(page.locator('[data-key="key-owl"] [data-alert="set"]')).toHaveText('Alert budget €1 (Owl alert)')
    // the cap meaning and alert line describe the button; they are not part of its name
    const owlBtn = page.locator('[data-key="key-owl"] .d-keyrow')
    await expect(owlBtn).toHaveAccessibleName(/^Owl/)
    expect(await owlBtn.getAttribute('aria-label')).toBeNull()
    expect(await owlBtn.evaluate((b) => b.textContent ?? '')).not.toContain('Cap')
    await expect(owlBtn).toHaveAccessibleDescription(/Cap €2 \(Owl cap\): set up/)
    expect(await page.locator('[data-kstate]').first().evaluate((e) => parseFloat(getComputedStyle(e).fontSize))).toBeGreaterThanOrEqual(12)
    await expect(page.locator('[data-key="key-otter"] [data-alert="none"]')).toHaveText('No alert budget')
    await expect(page.locator('[data-key="key-mole"] [data-cap="none"]')).toHaveText('No cap')
    await expect(page.locator('[data-key="key-mole"] [data-cap="none"]')).toHaveClass(/need/)
    await page.locator('[data-key="key-owl"]').screenshot({ path: 'test-results/p1442-owl-raise-closed-1280.png' })
    // the Raise button still works on a card; no dead Add until an amount is valid (P955)
    await page.locator('[data-key="key-owl"] .d-keyrow').click()
    await expect(page.locator('[data-raise="key-owl"]')).toBeVisible()
    await expect(page.locator('[data-raise="key-owl"]').getByRole('button', { name: 'Add' })).toHaveCount(0)
    await page.locator('[data-raise="key-owl"]').getByLabel('New monthly budget in euros').fill('5')
    await expect(page.locator('[data-raise="key-owl"]').getByRole('button', { name: 'Add' })).toBeEnabled()
    await page.locator('[data-key="key-owl"]').screenshot({ path: 'test-results/p1442-owl-raise-open-typed-1280.png' })
    await page.locator('[data-key="key-badger"]').screenshot({ path: 'test-results/p1442-badger-1280.png' })
    await page.locator('[data-section="unmatched"]').screenshot({ path: 'test-results/p1442-unmatched-1280.png' })
    // W5: the budget-pace line stays inside the chart
    const paceOut = await page.locator('.d-chart svg').first().evaluate((svg) => {
      const r = svg.getBoundingClientRect()
      return [...svg.querySelectorAll('polyline')].some((p) => { const b = p.getBoundingClientRect(); return b.top < r.top - 0.5 || b.bottom > r.bottom + 0.5 })
    })
    expect(paceOut).toBe(false)
    await page.locator('.d-chart').first().screenshot({ path: 'test-results/p1442-chart-1280.png' })
    await page.locator('[data-key="key-owl"] .d-keyrow').click()
    for (const w of [1280, 375, 320]) {
      await page.setViewportSize({ width: w, height: 1400 })
      await expect.poll(() => page.evaluate(() => window.innerWidth)).toBe(w)
      if (w === 375) await collapseSidebar(page)
      // B1: nothing on the page scrolls sideways once the sidebar is collapsed
      if (w < 900) expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0)
      // nothing in a budget section or key card sticks out of its card
      const escapes = await page.locator('[data-section]').evaluateAll((cards) =>
        cards.flatMap((card) => {
          const r = card.getBoundingClientRect()
          return [...card.querySelectorAll('*')]
            .filter((c) => {
              const b = c.getBoundingClientRect()
              return b.width > 0 && (b.left < r.left - 0.5 || b.right > r.right + 0.5)
            })
            .map((c) => `${w}px: ${c.textContent}`)
        }),
      )
      expect(escapes).toEqual([])
      // QA2: each section label sits closer to its own card than to the one above
      const gaps = await page.locator('.d-main .d-h3').evaluateAll((hs) =>
        hs.map((h) => {
          const r = h.getBoundingClientRect()
          const prev = h.previousElementSibling?.getBoundingClientRect()
          const next = h.nextElementSibling?.getBoundingClientRect()
          return { t: h.textContent, above: prev ? r.top - prev.bottom : 99, below: next ? next.top - r.bottom : 0 }
        }),
      )
      for (const g of gaps) expect(g.above, `${w}px space above vs below "${g.t}"`).toBeGreaterThan(g.below)
      // QA2: the "closest to limit first" part never wraps, so no orphan word
      expect(await page.locator('.d-h3 .d-nowrap').evaluate((e) => e.getClientRects().length)).toBe(1)
      // the "·" separator wraps with its subtitle, never left dangling at a line end (visual QA, 320/375)
      await expect(page.locator('.d-h3 .d-nowrap')).toHaveText(/^· closest to limit first$/)
      // QA2: Raise tap targets are at least 40px tall
      for (const sel of ['.d-acctrow', '[data-key="key-owl"] .d-keyrow']) expect((await rectOf(page.locator(sel), sel)).height).toBeGreaterThanOrEqual(40)
      // QA2: scrolled to the end, the sticky footer covers no card
      await page.setViewportSize({ width: w, height: 700 })
      await page.evaluate(() => {
        window.scrollTo(0, document.documentElement.scrollHeight)
        for (const e of document.querySelectorAll('*')) if (e.scrollHeight > e.clientHeight + 1 && /(auto|scroll)/.test(getComputedStyle(e).overflowY)) e.scrollTop = e.scrollHeight
      })
      const lastBottom = await page.locator('.d-main [data-section]').last().evaluate((e) => e.getBoundingClientRect().bottom)
      const footTop = (await rectOf(page.locator('[data-bottom-bar]'), 'footer')).y
      expect(lastBottom, `${w}px last card bottom vs footer top`).toBeLessThanOrEqual(footTop)
      // full-page screenshot at a viewport tall enough that nothing scrolls under the sticky bars
      await page.setViewportSize({ width: w, height: 3600 })
      await page.evaluate(() => window.scrollTo(0, 0))
      await page.screenshot({ path: `test-results/p1442-monitor-${w}.png`, fullPage: true })
      await page.setViewportSize({ width: w, height: 1400 })
    }
  })

  test('P1442 review: two caps and two alerts all show on the key card; a cap row unlike the recorded budget shows both; nothing lands in unmatched', async ({ page }) => {
    await patchRun(page, (b) => {
      const c = cardsCloud()
      c.budgets.push({ name: 'Owl cap spare', amount_eur: 3, kind: 'key-cap', key_id: 'key-owl' }, { name: 'Owl alert spare', amount_eur: 1.5, kind: 'key-alert', key_id: 'key-owl' })
      keyOf(c, 'key-badger').budget_eur = 4 // recorded budget differs from its €1 cap row
      if (b.report?.monitoring) b.report.monitoring.cloud = c
    })
    await openDay(page)
    await page.locator('.d-tabs').getByRole('tab', { name: 'Monitoring' }).click()
    await page.getByRole('button', { name: /^Google Cloud/ }).click()
    const owl = page.locator('[data-key="key-owl"]')
    await expect(owl.locator('[data-cap="set"]')).toHaveCount(2)
    await expect(owl.locator('[data-alert="set"]')).toHaveCount(2)
    await expect(owl).toContainText('Owl cap spare')
    await expect(owl).toContainText('Owl alert spare')
    // each cap row shows its OWN state: the spare row reported none (G4)
    await expect(owl.locator('[data-cap="set"][data-budget="Owl cap spare"]')).toHaveText('Cap €3 (Owl cap spare): state not reported')
    await expect(page.locator('[data-section="unmatched"] [data-budget]')).toHaveCount(1)
    await expect(page.locator('[data-key="key-badger"] [data-cap-mismatch]')).toHaveText('Cap row €1 ≠ recorded budget €4')
    await expect(page.locator('[data-key="key-badger"]')).toContainText('€0.20 of €1')
    // Raise floor is the same cap the card shows
    await page.locator('[data-key="key-badger"] .d-keyrow').click()
    await page.getByLabel('New monthly budget in euros').fill('1')
    await expect(page.locator('[data-raise="key-badger"]')).toContainText('Must be more than €1')
  })

  test('P1442 round 3: blind cap list reads "Cap state unknown" (not a cap); a non-EUR budget names its currency; spend with no cap sorts first', async ({ page }) => {
    await patchRun(page, (b) => {
      const c = cardsCloud()
      c.budgets = c.budgets.filter((x) => x.key_id !== 'key-mole')
      c.budgets.push({ name: 'Dollar budget', currency: 'USD', kind: 'unmatched', why: 'does not bound this key: currency:USD' })
      Object.assign(keyOf(c, 'key-mole'), { collected: true, spent_eur: 0.5, state: 'spent', cap_state: 'UNKNOWN', cap_note: 'the budget list showed no caps this run, so caps cannot be checked' })
      if (b.report?.monitoring) b.report.monitoring.cloud = c
    })
    await openDay(page)
    await page.locator('.d-tabs').getByRole('tab', { name: 'Monitoring' }).click()
    await page.getByRole('button', { name: /^Google Cloud/ }).click()
    const mole = page.locator('[data-key="key-mole"]')
    await expect(mole.locator('[data-cap="unknown"]')).toHaveText('Cap state unknown: the budget list showed no caps this run, so caps cannot be checked')
    await expect(mole.locator('[data-cap="set"]')).toHaveCount(0)
    await expect(mole).toContainText('€0.50 · no cap')
    await expect(page.locator('[data-section="keys"] [data-key]').first()).toHaveAttribute('data-key', 'key-mole')
    const usd = page.locator('[data-section="unmatched"] [data-budget="Dollar budget"]')
    await expect(usd).toContainText('amount in USD/month')
    await expect(usd).not.toContainText('€')
    await expect(usd).toContainText('does not bound this key: currency:USD')
  })

  test('P1442 review: spend collection failed — budgets and key cards still render, every card unmeasurable with a reason', async ({ page }) => {
    await patchRun(page, (b) => {
      if (b.report?.monitoring) b.report.monitoring.cloud = { ...CARDS_CLOUD, collected: false }
    })
    await openDay(page)
    await page.locator('.d-tabs').getByRole('tab', { name: 'Monitoring' }).click()
    await page.getByRole('button', { name: /^Google Cloud/ }).click()
    await expect(page.locator('[data-cloud-not-collected]')).toBeVisible()
    await expect(page.locator('.d-h3')).toHaveText(['Account budget', 'Alarms', 'AI prepaid key cards · closest to limit first', 'Unmatched budgets'])
    const states = page.locator('[data-section="keys"] [data-kstate]')
    await expect(states).toHaveCount(6)
    await expect(states).toHaveText(Array(6).fill('Unmeasurable'))
    await expect(page.locator('[data-key="key-badger"]')).toContainText('spend collection failed this run')
  })

  test('P1442 review: a 120-character why stays inside its card at 320px', async ({ page }) => {
    const why = 'Billing export query failed: the table for this month was not found, so spend for this key cannot be read today.'
    expect(why.length).toBeGreaterThanOrEqual(110)
    await patchRun(page, (b) => {
      const c = cardsCloud()
      keyOf(c, 'key-otter').why = why
      if (b.report?.monitoring) b.report.monitoring.cloud = c
    })
    await page.setViewportSize({ width: 320, height: 1400 })
    await openDay(page)
    await collapseSidebar(page)
    await page.locator('.d-tabs').getByRole('tab', { name: 'Monitoring' }).click()
    await page.getByRole('button', { name: /^Google Cloud/ }).click()
    await expect(page.locator('[data-key="key-otter"]')).toContainText(why)
    const escapes = await page.locator('[data-section]').evaluateAll((cards) =>
      cards.flatMap((card) => {
        const r = card.getBoundingClientRect()
        return [...card.querySelectorAll('*')].filter((c) => {
          const b = c.getBoundingClientRect()
          return b.width > 0 && (b.left < r.left - 0.5 || b.right > r.right + 0.5)
        }).map((c) => c.textContent)
      }),
    )
    expect(escapes).toEqual([])
    // B3: the whole reason is visible (no clipping box), and the footer keeps its gutters
    const clipped = await page.locator('[data-key="key-otter"] .d-kwhy').evaluate((e) => e.scrollHeight > e.clientHeight + 1 || e.scrollWidth > e.clientWidth + 1)
    expect(clipped).toBe(false)
    // P1468: on Monitoring the progress area is empty now (the agent link it held is gone). Review H4: so every
    // visible piece of the bar — not the row's own box — must keep the gutter on both sides
    const pieces = await page.locator('[data-bottom-bar] .d-gin').evaluate((row) =>
      [...row.querySelectorAll('button, span, a')].map((e) => e.getBoundingClientRect()).filter((r) => r.width > 0 && r.height > 0).map((r) => ({ left: r.left, right: r.right })),
    )
    expect(pieces.length).toBeGreaterThanOrEqual(2) // Start fixing and the copy icon at least
    for (const r of pieces) {
      expect(r.left).toBeGreaterThanOrEqual(44 + 8)
      expect(r.right).toBeLessThanOrEqual(320)
    }
    const copy = await rectOf(page.getByRole('button', { name: 'Copy prompt' }), 'copy')
    expect(copy.x + copy.width).toBeLessThanOrEqual(320)
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0)
    await page.locator('[data-key="key-otter"]').screenshot({ path: 'test-results/p1442-why120-320.png' })
    await page.locator('[data-bottom-bar]').screenshot({ path: 'test-results/p1442-footer-320.png' })
  })

  test('P1442: an older report (no budgets, no key states) shows no cap/alert lines and no new sections', async ({ page }) => {
    await openDay(page)
    await page.locator('.d-tabs').getByRole('tab', { name: 'Monitoring' }).click()
    await page.getByRole('button', { name: /^Google Cloud/ }).click()
    await expect(page.locator('.d-h3')).toHaveText(['Account budget', 'AI prepaid key cards · closest to limit first'])
    await expect(page.locator('[data-cap]')).toHaveCount(0)
    await expect(page.locator('[data-key="key-search"] [data-kstate]')).toHaveText('Unmeasurable')
    await expect(page.locator('[data-key="key-gemini"] [data-kstate]')).toHaveText('Spent')
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
    // P1468: the chat tiles (mentions, help requests) are no longer shown; the other readings are
    await expect(page.locator('[data-reading="mentions"]')).toHaveCount(0)
    await expect(page.locator('[data-reading="unconfirmed"]')).toContainText('3')
    const order = await page.locator('[data-funnel], [data-series], [data-reading]').evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.funnel !== undefined ? 'funnel' : (e as HTMLElement).dataset.series ? 'series' : 'reading'))
    expect(order[0]).toBe('funnel')
    expect(order.lastIndexOf('series')).toBeLessThan(order.indexOf('reading'))
    await expect(page.locator('[data-series="reachouts"]')).toContainText('not collected yet')
    await expect(page.locator('[data-series="reachouts"]')).toContainText('target 10 · proposed')
    await expect(page.locator('[data-series="events"] svg')).toBeVisible()
  })

  // P1468: the chat tiles (Help requests, Mentions) and the chat digest note are gone (AC11); a tile
  // that links a note still opens it — now only a review note, under "Review notes"
  test('Stats: a tile linked to a review note opens it and scrolls to it; a tile without a note stays plain', async ({ page }) => {
    await patchRun(page, (b) => {
      b.report?.stats?.readings?.push({ id: 'reachouts', label: 'Reach-outs this week', collected: true, value: 6, note: 'week-measures' })
    })
    await openDay(page)
    await page.locator('.d-tabs').getByRole('tab', { name: 'Stats' }).click()
    const linked = page.locator('[data-reading="reachouts"]')
    const plain = page.locator('[data-reading="unconfirmed"]')
    expect(await linked.evaluate((e) => e.tagName)).toBe('BUTTON')
    expect(await plain.evaluate((e) => e.tagName)).not.toBe('BUTTON') // known-bad control: no note, no button
    await expect(page.locator('[data-reading="help_requests"], [data-reading="mentions"]')).toHaveCount(0)
    const note = page.locator('[data-review-notes] [data-note="week-measures"]')
    await expect(note.getByRole('button').first()).toHaveAttribute('aria-expanded', 'false')
    await expect(note.locator('.d-notebody')).toHaveCount(0)
    await linked.click()
    await expect(note.getByRole('button').first()).toHaveAttribute('aria-expanded', 'true')
    await expect(note.locator('.d-notebody')).toContainText('Champion talks: 2')
    // scrolled to: the note's title is below the sticky header and above the bottom bar
    await expect.poll(async () => {
      const t = await rectOf(note.getByRole('button').first(), 'note title')
      const top = await rectOf(page.locator('.d-topbar'), 'header')
      const bar = await rectOf(page.locator('[data-bottom-bar]'), 'bar')
      return t.y >= top.y + top.height - 1 && t.y + t.height <= bar.y + 1
    }).toBe(true)
    // a second click keeps it open
    await linked.click()
    await expect(note.getByRole('button').first()).toHaveAttribute('aria-expanded', 'true')
  })

  test('Reflection: the story box is there before a position; keys 1 2 3 rate and cycle; Clear position keeps the story', async ({ page }) => {
    await openDay(page)
    await openReflection(page)
    const cardR = page.locator('.d-cpcard')
    // P1440: a story without a position is kept, so the box no longer waits for a position.
    // P1468: it opens from CP's "+ Add a story", offered before and after a position alike.
    await expect(addStoryBtn(page)).toBeVisible()
    await cardR.locator('[data-testid=agree-group]').click()
    await expect(addStoryBtn(page)).toBeVisible()
    await expect.poll(() => lines().at(-1)?.position).toBe(2)
    await fillStory(page, 'Spent Tuesday on a feature instead of calls.')
    // P1440 review: a story is saved by Accept only (leaving the box saves nothing)
    await page.locator('[data-bottom-bar] [data-accept]').click()
    await expect.poll(() => lines().at(-1)?.story).toBe('Spent Tuesday on a feature instead of calls.')
    await expect(page.locator('.d-bpos')).toHaveText(stmtPos(2))
    await page.locator('[data-bottom-bar]').getByRole('button', { name: /^Previous/ }).click()
    await cardR.locator('[data-testid=agree-group]').click()
    await page.getByRole('option', { name: /Strongly Agree/ }).click()
    await expect.poll(() => lines().at(-1)?.position).toBe(3)
    expect(lines().at(-1)?.story).toBe('Spent Tuesday on a feature instead of calls.')
    await cardR.locator('[data-testid=agree-group]').click()
    await page.getByRole('option', { name: 'Clear position' }).click()
    // P1440: clearing the position keeps the story (a story-only answer), never remove:true
    await expect.poll(() => lines().length).toBe(4)
    expect(lines().at(-1)).toEqual(expect.objectContaining({ kind: 'reflection', target: 'c1', story: 'Spent Tuesday on a feature instead of calls.' }))
    expect(lines().at(-1)?.position).toBeUndefined()
    expect(lines().at(-1)?.remove).toBeUndefined()
    // a story alone is answered, not rated (P1440 review O5)
    await expect(page.locator('[data-progress]')).toHaveText('0 of 4 rated · 1 story only')

    // keyboard: next statement, 3 = Agree (2), 3 again = Strongly agree (3)
    await page.locator('.d-pst').click()
    await page.keyboard.press('ArrowRight')
    await expect(page.locator('.d-bpos')).toHaveText(stmtPos(2))
    const n = lines().length
    await page.keyboard.press('3')
    await expect.poll(() => lines().length).toBe(n + 1)
    expect(lines().at(-1)).toMatchObject({ kind: 'reflection', target: 'c2', position: 2 })
    await page.keyboard.press('3')
    await expect.poll(() => lines().at(-1)?.position).toBe(3)
    await expect(page.locator('.d-cpcard [aria-pressed=true]')).toHaveText('Agree+')
    await expect(page.locator('[data-progress]')).toHaveText('1 of 4 rated · 1 story only')
  })

  test('a weekly-review run shows its badge and its items in Issues and Reflection', async ({ page }) => {
    await openDay(page, 'weekly')
    await expect(page.locator('.d-subrow .d-runbadge')).toHaveText('Weekly review')
    await card(page).waitFor()
    const { view } = await runView(page)
    const i = yoursOf({ view }).findIndex((x) => x.fp === 'weekly:reach-target')
    expect(i).toBeGreaterThanOrEqual(0)
    for (let k = 0; k < i; k++) await nextBtn(page).click()
    await expect(card(page).locator('.d-topic .d-runbadge')).toHaveText('Weekly review')
    await openReflection(page)
    for (let k = 0; k < 4; k++) await nextBtn(page).click()
    await expect(page.locator('.d-cpcard .d-runbadge')).toHaveText('Weekly review')
  })

  test('a monthly-review run shows its badge and its proposals in Issues and Reflection', async ({ page }) => {
    await openDay(page, 'monthly')
    await expect(page.locator('.d-subrow .d-runbadge')).toHaveText('Monthly review')
    await card(page).waitFor()
    const { view } = await runView(page)
    const i = yoursOf({ view }).findIndex((x) => x.fp === 'monthly:archive-stale-specs')
    expect(i).toBeGreaterThanOrEqual(0)
    for (let k = 0; k < i; k++) await nextBtn(page).click()
    await expect(card(page).locator('.d-topic .d-runbadge')).toHaveText('Monthly review')
    await openReflection(page)
    for (let k = 0; k < 4; k++) await nextBtn(page).click()
    await expect(page.locator('.d-cpcard .d-runbadge')).toHaveText('Monthly review')
  })
})

test.describe('review round 1', () => {
  test('an empty custom answer is not an answer: not resolved, and Start fixing sends you back to it', async ({ page }) => {
    await openDay(page)
    expect(yoursOf(await runView(page)).length).toBeGreaterThan(2)
    await acceptBtn(page).click()
    await acceptBtn(page).click()
    // Accept wrote the two cards left behind; the empty box must not add a third
    await expect(answeredRows(page)).toHaveCount(2)
    await ownRow(page).click()
    await expect(ownBox(page)).toBeFocused()
    await expect(answeredRows(page)).toHaveCount(2)
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
    await expect(answeredRows(page)).toHaveCount(3)
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
    await expect(card(page).locator('[data-chosen]')).toContainText('Is the draft safe to send?') // P1463: folded to the own answer
    await unfold(page)
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
    await openStatus(page)
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
    await page.locator('[data-status-toggle]').click()
    await expect(page.locator('.d-spanel')).toBeVisible()
    await page.locator('.d-spanel').getByRole('button', { name: 'Collapse' }).click()
    await expect(page.locator('.d-sline')).toBeVisible()
  })
})

test.describe('review round 2', () => {
  test('one status word: "Skipped" is never spelled out on the page; both Fix buttons look the same', async ({ page }) => {
    await openDay(page)
    await openStatus(page)
    await page.locator('.d-status').getByRole('button', { name: /Worked \(\d+\)/ }).click() // P1463: skipped sits in the Worked fold
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
    await openStatus(page)
    // P1463: the status toggle and the panel's fold (the phone strip is gone — the line is the strip)
    for (const sel of ['.d-morebtn', '.d-sfold']) {
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
    await openReflection(page)
    const card = page.locator('.d-cpcard')
    await card.locator('[data-testid=disagree-group]').click()
    await expect(card.locator('[data-testid=disagree-group]')).toHaveAttribute('aria-pressed', 'true')
    const clipped = await page.locator('.d-cpcard [data-testid$=-group]').evaluateAll((els) => els.filter((e) => e.scrollWidth > e.clientWidth + 1 || e.scrollHeight > e.clientHeight + 1).length)
    expect(clipped).toBe(0)
    const cardBox = await rectOf(card, 'card')
    const rowBox = await rectOf(page.locator('[data-position-control]'), 'position control')
    expect(rowBox.x + rowBox.width).toBeLessThanOrEqual(cardBox.x + cardBox.width)
    await card.locator('[data-testid=disagree-group]').click()
    const menu = page.locator('[data-cp-portal] [role=listbox]')
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
    // P1468: the agent link is gone (its panel names the work); "N still yours" is the progress text
    await expect(agentLink(page)).toHaveCount(0)
    const prog = await rectOf(stillYours(page), 'still yours')
    // P1468 review F12: the same words as on a desktop ("N still yours"), never a short "yours: N"
    const yours = yoursOf(await runView(page))
    await expect(stillYours(page)).toHaveText(`${yours.length} still yours`)
    expect(await stillYours(page).evaluate((e) => ({ size: getComputedStyle(e).fontSize, after: getComputedStyle(e, '::after').content }))).toEqual({ size: '12px', after: 'none' })
    const start = await rectOf(startBtn(page), 'Start fixing')
    const overlap = prog.x < start.x + start.width && start.x < prog.x + prog.width && prog.y < start.y + start.height && start.y < prog.y + prog.height
    expect(overlap).toBe(false)
  })

  test('status lines never carry a separator (P1463: chips wrap whole, nothing dangles)', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 760 })
    await openDay(page)
    await collapseSidebar(page)
    const chips = await page.locator('.d-sline .d-chip').count()
    expect(chips).toBeGreaterThanOrEqual(2)
    expect(await page.locator('.d-sline').innerText()).not.toContain('·')
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

// P1468: "From this run" is gone — only weekly / monthly review notes show, under "Review notes"
test.describe('notes (P1468: review notes only)', () => {
  test('a review note is a fold under Stats that opens on click, keeping its line breaks; a daily note is not shown', async ({ page }) => {
    await openDay(page)
    await page.locator('.d-tabs').getByRole('tab', { name: 'Stats' }).click()
    const notes = page.locator('[data-review-notes]')
    await expect(notes.locator('.d-h3')).toHaveText('Review notes')
    await expect(notes.locator('[data-note]')).toHaveCount(1)
    await expect(page.locator('[data-note="shipped"]')).toHaveCount(0) // a daily note, still in the report
    const week = notes.locator('[data-note="week-measures"]')
    const fold = week.getByRole('button')
    await expect(fold).toHaveAttribute('aria-expanded', 'false')
    expect((await rectOf(fold, 'note fold')).height).toBeGreaterThanOrEqual(40)
    await expect(week.locator('.d-notebody')).toHaveCount(0)
    await fold.click()
    await expect(week.locator('.d-notebody')).toHaveText('Reach-outs: 6 (target 10)\nChampion talks: 2')
    expect(await week.locator('.d-notebody').evaluate((e) => getComputedStyle(e).whiteSpace)).toBe('pre-wrap')
    // the title already says "review": no badge repeating it
    await expect(week.locator('.d-runbadge')).toHaveCount(0)
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

  test('a run without review notes shows no "Review notes" (P1468: and never "From this run")', async ({ page }) => {
    await openDay(page, 'people-absent')
    await page.locator('.d-tabs').getByRole('tab', { name: 'Stats' }).click()
    await expect(page.locator('[data-funnel]')).toBeVisible()
    await expect(page.getByText('Review notes')).toHaveCount(1)
    await expect(page.getByText('From this run')).toHaveCount(0)
    await openDay(page, 'no-notes')
    await page.locator('.d-tabs').getByRole('tab', { name: 'Stats' }).click()
    await expect(page.locator('[data-funnel]')).toBeVisible()
    await expect(page.getByText('Review notes')).toHaveCount(0)
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
    await expect(card(page).locator('[data-chosen]')).toContainText('old question?') // P1463: folded on a read-only run too
    await unfold(page)
    await expect(card(page).locator('[data-own-text]')).toHaveText('old question?')
    await expect(card(page).locator('textarea')).toHaveCount(0)
    expect(await card(page).locator('input[type=radio]:enabled').count()).toBe(0)
    // a card recommended for the agent that the founder answered himself is HIS: it stays in the pager
    // with his text (P1445 E, Codex review), never hidden in the agent list
    await nextBtn(page).click()
    await expect(cardTitle(page)).toHaveText('Some guests may be turned away on Tuesday')
    await unfold(page)
    await expect(card(page).locator('[data-own-text]')).toHaveText('old other answer')
    await openAgentList(page)
    await expect(agentList(page).locator('[data-agent-item]').filter({ hasText: 'Some guests may be turned away on Tuesday' })).toHaveCount(0)
    await expect(agentList(page).locator('input, textarea')).toHaveCount(0)
  })
})

test.describe('Phase D: fit, risk and cause on the card', () => {
  test('the recommended option says "Fit N%" or "Fit not rated", with one Main risk line under it; only a suspected cause is labelled (P1463)', async ({ page }) => {
    // P1463 round 3: a checked cause is the normal case and carries no label; known-bad control: one card suspected
    await patchRun(page, (b) => {
      const i = b.view?.issues.find((x: ViewIssue) => x.fp === 'replies:event-post') as (ViewIssue & { evidence?: string }) | undefined
      if (i) i.evidence = 'unverified'
    })
    await openDay(page)
    const rec = (label: string) => card(page).locator('.d-opt').filter({ hasText: label })
    // 1 · no fit rated: never a made-up number; the cause was checked
    await expect(cardTitle(page)).toHaveText('Replies waiting on your event post')
    await expect(rec('I’ll reply today').locator('.d-rec')).toHaveText('Recommended · Fit not rated')
    await expect(card(page).locator('.d-risk')).toHaveCount(0)
    await expect(card(page).locator('.d-cause')).toHaveText('Cause suspected')
    // the tag is neutral: neither the worked green nor the needs-you amber
    const colours = await card(page).locator('.d-cause').evaluate((e) => {
      const c = getComputedStyle(e)
      return [c.color, c.backgroundColor, c.borderTopColor]
    })
    for (const c of colours) expect(['rgb(22, 163, 74)', 'rgb(22, 101, 52)', 'rgb(217, 119, 6)', 'rgb(146, 64, 14)', 'rgb(255, 251, 235)', 'rgb(240, 253, 244)']).not.toContain(c)
    // 2 · fit 95, no risk written, cause checked: no tag
    await nextBtn(page).click()
    await expect(rec('I’ll read it today').locator('.d-rec')).toHaveText('Recommended · Fit 95%')
    await expect(card(page).locator('.d-risk')).toHaveCount(0)
    await expect(card(page).locator('.d-cause')).toHaveCount(0)
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

  test('P1445 E: agent work shows no card detail at all — a row is its title and where it is', async ({ page }) => {
    await openDay(page)
    await openAgentList(page)
    const row = agentList(page).locator('[data-agent-item]').filter({ hasText: 'Database rules are live before review' })
    await expect(row.locator('.d-ptitle')).toHaveText('Database rules are live before review')
    await expect(row.locator('[data-agent-state]')).toHaveText('Not sent')
    await expect(row.locator('.d-opt, .d-rec, .d-risk, .d-cause')).toHaveCount(0)
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
    // P1445 E: agent work is not in the pager at all: every card it walks is the founder's
    await expect(page.locator('.d-bpos')).toHaveText(`1 of ${yours.length + STMTS}`)
    await expect(agentList(page)).toBeVisible()
  })

  test('the last founder card can be accepted: written at once, Start fixing includes it, and (P1463) the queue goes on into the statements', async ({ page }) => {
    await openDay(page)
    const v = await runView(page)
    const yours = yoursOf(v)
    const base = agentOf(v).length
    const total = yours.length + STMTS
    for (let k = 0; k < yours.length - 1; k++) await nextBtn(page).click()
    await expect(page.locator('.d-bpos')).toHaveText(`${yours.length} of ${total}`)
    expect(fileText()).toBe('') // paging wrote nothing
    await expect(acceptBtn(page)).toBeEnabled()
    await expect(acceptBtn(page)).toHaveAttribute('aria-label', 'Accept and next')
    await expect(startBtn(page)).toHaveAttribute('data-send-count', String(base))
    await acceptBtn(page).click()
    await expect.poll(() => lines().length).toBe(1)
    await expect(startBtn(page)).toHaveAttribute('data-send-count', String(base + 1))
    // P1463: the last card's Accept & next moves on to the first statement, like Next
    await expect(page.locator('.d-bpos')).toHaveText(`${yours.length + 1} of ${total}`)
    await expect(page.locator('[data-statement]')).toBeVisible()
    // and Previous comes back to the card, now answered (folded to its answer)
    await prevBtn(page).click()
    await expect(page.locator('.d-bpos')).toHaveText(`${yours.length} of ${total}`)
    await expect(card(page).locator('[data-chosen]')).toBeVisible()
    expect(lines()).toHaveLength(1) // paging wrote nothing
  })

  test('P1463 Codex review: a slow Accept on the last card never pulls you back after you paged on into the statements', async ({ page }) => {
    await openDay(page)
    const yours = yoursOf(await runView(page))
    for (let k = 0; k < yours.length - 1; k++) await nextBtn(page).click()
    // hold the save so the founder moves on before it lands
    let release: () => void = () => {}
    const held = new Promise<void>((r) => (release = r))
    await page.route('**/api/day/decisions', async (route) => {
      await held
      await route.continue()
    })
    await acceptBtn(page).click()
    await nextBtn(page).click()
    await nextBtn(page).click()
    await expect(page.locator('.d-bpos')).toHaveText(stmtPos(2))
    release()
    await expect.poll(() => lines().length).toBe(1)
    await page.waitForTimeout(300)
    await expect(page.locator('.d-bpos')).toHaveText(stmtPos(2)) // stayed where the founder went
  })

  // P1432 replaces "Next accepts in the page only": Accept writes one line per card at once; → and Next write nothing.
  test('"Accept & next" writes one option line per card at once; → and Next write nothing; "N still yours" jumps to the first unanswered card', async ({ page }) => {
    await openDay(page)
    const v = await runView(page)
    const yours = yoursOf(v)
    const base = agentOf(v).length
    expect(base).toBeGreaterThan(0)
    await expect(startBtn(page)).toHaveAttribute('data-send-count', String(base))
    await expect(stillYours(page)).toHaveText(`${yours.length} still yours`)

    await acceptBtn(page).click()
    await expect.poll(() => lines().length).toBe(1)
    await expect(startBtn(page)).toHaveAttribute('data-send-count', String(base + 1))
    await expect(stillYours(page)).toHaveText(`${yours.length - 1} still yours`)
    await acceptBtn(page).click()
    await expect.poll(() => lines().length).toBe(2)
    await expect(startBtn(page)).toHaveAttribute('data-send-count', String(base + 2))
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
    await expect(startBtn(page)).toHaveAttribute('data-send-count', String(base + 2))
    await expect(stillYours(page)).toHaveText(`${yours.length - 2} still yours`)

    // the link jumps to the first card nobody answered: not the two that were accepted
    await stillYours(page).click()
    await expect(page.locator('.d-bpos')).toHaveText(`3 of ${yours.length + STMTS}`)
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
    await expect(startBtn(page)).toHaveAttribute('data-send-count', String(base))
    await expect(stillYours(page)).toHaveText(`${yours.length} still yours`)
    await ownBox(page).fill('A real answer')
    await expect(startBtn(page)).toHaveAttribute('data-send-count', String(base + 1))
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
        for (const [n, l] of [['agent', agentLink(page)], ['still', stillYours(page)], ['start', startBtn(page)]] as const) {
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
      // and the full-width state with More info open does not move it either (P1463: the last Accept went on to the statements)
      await prevBtn(page).click()
      await unfold(page)
      await card(page).getByRole('button', { name: /More info/ }).click()
      expect(Math.abs((await rectOf(bar, 'bar')).height - h0)).toBeLessThan(0.5)
    })
  }
})

test.describe('P1445 E: agent work is a list, not cards', () => {
  test('the pager walks only the founder\'s cards; the list holds the agent work with its state, and Start fixing still sends it', async ({ page }) => {
    await openDay(page)
    const v = await runView(page)
    const yours = yoursOf(v)
    const agents = agentOf(v)
    await expect(page.locator('.d-bpos')).toHaveText(`1 of ${yours.length + STMTS}`)
    await expect(agentList(page).locator('.d-fold')).toHaveText(`▶Start fixing also sends these · ${agents.length} not sent`) // P1468 header
    await openAgentList(page)
    await expect(agentList(page).locator('[data-agent-item]')).toHaveCount(agents.length)
    await expect(agentList(page).locator('[data-agent-item] .d-ptitle')).toHaveText(agents.map((a) => a.title))
    await expect(agentList(page).locator('[data-agent-state="not-sent"]')).toHaveCount(agents.length)
    // every card the pager walks can be accepted (none is agent work); paging the whole set never shows one
    for (let i = 0; i < yours.length; i++) {
      await expect(cardTitle(page)).toHaveText(yours[i].title)
      await expect(acceptBtn(page)).toBeVisible()
      if (i < yours.length - 1) await nextBtn(page).click()
    }
    // agent work still goes with Start fixing, without an answer from the founder
    await expect(startBtn(page)).toHaveAttribute('data-send-count', String(agents.length))
  })

  // P1468 supersedes P1463 point 4: the bottom bar no longer names the agent work (the panel does)
  test('P1468: no bottom-bar link; the panel is folded until asked, and a Status check opens it on its row', async ({ page }) => {
    await openDay(page)
    const k = (await runView(page)).view.issues.filter(isAgent).length
    expect(k).toBeGreaterThan(1)
    await expect(agentLink(page)).toHaveCount(0)
    await expect(agentList(page).locator('[data-agent-item]')).toHaveCount(0) // folded until asked
    await openAgentList(page)
    await expect(agentList(page).locator('[data-agent-item]')).toHaveCount(k)
    // P1468 review H4: toBeInViewport held because the bottom-bar link scrolled the list into view; the link is
    // gone and the fold does not scroll (the row is below the fold at 1440x900), so here it is only shown — the
    // scroll is asserted where it still happens, the Status jump at the end of this test
    await expect(agentList(page).locator('[data-agent-item]').filter({ hasText: 'Backup · repo C' })).toBeVisible()
    await openAgentList(page) // already open: stays open
    await agentList(page).locator('.d-fold').click()
    await expect(agentList(page).locator('[data-agent-item]')).toHaveCount(0)
    // P1463 round 3: in Status the check it came from is one line under "Didn't work", whose action opens that card
    await openStatus(page)
    await page.locator('.d-status [data-check="bk-c"] [data-open-card]').click()
    await expect(agentList(page).locator('.d-focusrow')).toContainText('Backup · repo C')
    await expect(agentList(page).locator('.d-focusrow')).toBeInViewport() // P1468 review H4: the scroll the link used to do
  })

  test('with no agent work there is no list', async ({ page }) => {
    await patchRun(page, (b) => {
      if (b.view) b.view.issues = b.view.issues.filter((i: ViewIssue) => !isAgent(i))
    })
    await openDay(page)
    await expect(card(page)).toBeVisible()
    await expect(agentList(page)).toHaveCount(0)
  })

  test('on a phone the list fits without horizontal scroll', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 })
    await openDay(page)
    await collapseSidebar(page)
    await openAgentList(page)
    const over = await page.evaluate(() => (document.querySelector('.day-root') as HTMLElement).scrollWidth - (document.querySelector('.day-root') as HTMLElement).clientWidth)
    expect(over).toBeLessThanOrEqual(0)
  })
})

test.describe('narrow widths', () => {
  for (const width of [375, 320]) {
    test(`no horizontal scroll inside the page at ${width}px; Status is a strip that opens`, async ({ page }) => {
      await page.setViewportSize({ width, height: 760 })
      await openDay(page)
      await collapseSidebar(page)
      for (const tab of ['Daily report', 'Stats', 'Monitoring', 'Reflection']) {
        await goTab(page, tab)
        const over = await page.evaluate(() => {
          const r = document.querySelector('.day-root') as HTMLElement
          return r.scrollWidth - r.clientWidth
        })
        expect(over, tab).toBeLessThanOrEqual(0)
        const right = await page.evaluate(() => document.querySelector('.day-root')?.getBoundingClientRect().right ?? Infinity)
        expect(right, tab).toBeLessThanOrEqual(width)
      }
      await page.locator('.d-tabs').getByRole('tab', { name: 'Daily report' }).click()
      // P1463: Status is one line until opened
      await expect(page.locator('.d-sline')).toBeVisible()
      await expect(page.locator('.d-spanel')).toHaveCount(0)
      await page.locator('[data-status-toggle]').click()
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
    await startBtn(page).click() // exact name: P1468's agent panel header also says "Start fixing also sends these"
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
    await expect(answeredRows(page)).toHaveCount(1)
    await expect(listRow(page, first.fp)).toHaveAttribute('data-list-state', 'answered')
    await expect(listRow(page, yours[1].fp)).toHaveAttribute('data-list-state', 'open')
    await expect(startBtn(page)).toHaveAttribute('data-send-count', String(base + 1))

    // the same answer already sent: it is not counted again, and the card says Sent
    writeFileSync(DECISIONS, fileText() + receipt('launch-1', [optionKey(first.fp, rec.id)], 'started'))
    await reopen(page)
    await listRow(page, first.fp).click()
    await expect(stateOf(page)).toHaveAttribute('data-state', 'sent')
    await expect(stateOf(page)).toHaveText(/^✓Sent \d\d:\d\d$/)
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
    await unfold(page)
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
    await expect(stateOf(page)).toHaveText(`Back again · you answered on 3 Oct: ${opt.label}`)
    await expect(listRow(page, both.fp)).toHaveAttribute('data-list-state', 'before')

    // the earlier run, read-only: that card answered, another not
    await page.getByRole('button', { name: 'Previous run' }).click()
    await expect(page.locator('[data-run-date]')).toHaveText('Sat 3 Oct')
    expect(yoursOf({ view: earlier.view }).map((i) => i.fp)).toEqual([both.fp]) // that run's only founder card opens first
    await expect(cardTitle(page)).toHaveText(both.title)
    await expect(stateOf(page)).toHaveAttribute('data-state', 'answered')
    await expect(stateOf(page)).toHaveText(/^✓Answered on this run · \d\d:\d\d$/)
    // that run's agent work: a list, read-only, each row saying where it is
    await openAgentList(page)
    await expect(agentList(page).locator('[data-agent-state]').first()).toHaveAttribute('data-agent-state', /^(not-sent|sent)$/)
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
    await expect(page.locator('.d-parked:not([data-agent-list]) .d-fold')).toHaveAttribute('aria-expanded', 'true')
    await list.locator('[data-list-card]').nth(2).click()
    await expect(page.locator('.d-bpos')).toHaveText(`3 of ${yours.length - 1 + STMTS}`)
    await expect(list.locator('[data-list-card]').nth(2)).toHaveAttribute('aria-current', 'true')
    expect(lines()).toHaveLength(1) // opening Parked and jumping write nothing
  })

  test('phone: the list folds to its count and opens with a toggle', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 })
    await openDay(page)
    await collapseSidebar(page)
    const yours = yoursOf(await runView(page))
    const tog = page.locator('[data-card-list] .d-cltog')
    // P1468: one list, one line for cards and statements (UI Contract)
    await expect(tog).toHaveText(`▶${yours.length + STMTS} still need you`) // P1468 review F12: equal numbers say it once
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
  const reflTab = (page: Page) => ({ click: () => goTab(page, 'Reflection'), tap: () => goTab(page, 'Reflection') })

  test('1280x720: the card title, its first option and the card list are all on screen without scrolling', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 })
    await openDay(page)
    const yours = yoursOf(await runView(page))
    await expect(listRow(page, yours[0].fp)).toBeVisible()
    expect(await inView(page, '.d-focus h2'), 'card title').toBe(true)
    expect(await inView(page, '.d-focus .d-optrow'), 'first option').toBe(true)
    await expect(page.locator('[data-card-list] [data-list-summary]')).toHaveCount(0) // P1463: the rows' ✓ and the pager already count
    // side by side: the list is left of the card, not above it
    const l = must(await page.locator('[data-card-list]').boundingBox(), 'list')
    const c = must(await card(page).boundingBox(), 'card')
    expect(l.x + l.width).toBeLessThanOrEqual(c.x)
    await expect(page.locator('[data-card-list] .d-cltog')).toHaveText(`▶${yours.length + STMTS} still need you`) // the narrow fold keeps its line (P1468 wording; review F12: equal numbers said once)
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
    const yours = yoursOf(await runView(page))
    const rows = page.locator('[data-list-statement]')
    // P1468: the statements are rows of the one list; its folded line counts both halves (no "All N rated" head)
    const tog = page.locator('[data-card-list] .d-cltog')
    await expect(rows).toHaveCount(4)
    await expect(page.locator('[data-list-summary]')).toHaveCount(0)
    await expect(tog).toHaveText(`▶${yours.length + 4} still need you`) // P1468 review F12: equal numbers said once
    await expect(rows.first()).toContainText('Not rated')
    expect(await inView(page, '.d-pst'), 'statement').toBe(true)
    expect(await inView(page, '[data-position-control]'), 'position buttons').toBe(true)
    // Unsure is a position (0), never "Not rated"
    await page.locator('.d-cpcard [data-testid=unsure-group]').click()
    await expect.poll(() => lines().at(-1)?.position).toBe(0)
    await expect(rows.first()).toContainText('Unsure')
    await expect(rows.first()).toHaveAttribute('data-list-state', 'rated')
    await expect(tog).toHaveText(`▶${yours.length + 3} still need you · ${yours.length + 4} items`)
    await rows.nth(2).click()
    await expect(page.locator('.d-bpos')).toHaveText(stmtPos(3))
    await expect(rows.nth(2)).toHaveAttribute('aria-current', 'true')
    // a reload opens on the first statement not rated
    await reopen(page)
    await reflTab(page).click()
    await expect(page.locator('.d-bpos')).toHaveText(stmtPos(2))
  })

  test('3 pressed twice at once cycles Agree to Agree+, never writes Agree twice', async ({ page }) => {
    await openDay(page)
    await reflTab(page).click()
    await page.locator('.d-pst').click()
    await page.keyboard.press('3')
    await page.keyboard.press('3') // no wait: the first save has not been reloaded yet
    await expect.poll(() => lines().filter((d) => d.kind === 'reflection').map((d) => d.position)).toEqual([2, 3])
    await expect(page.locator('.d-cpcard [aria-pressed=true]')).toHaveText('Agree+')
  })

  // P1468: the "✓ All N rated" head is gone — the rows' ✓ say it (P1463 point 9), and the folded line counts only the cards left
  test('when every statement is rated, each row says so with its ✓ and the folded line counts only the cards left', async ({ page }) => {
    await openDay(page)
    const yours = yoursOf(await runView(page))
    await reflTab(page).click()
    for (let k = 0; k < 4; k++) {
      await page.locator('[data-list-statement]').nth(k).click()
      await page.locator('.d-cpcard [data-testid=agree-group]').click()
      await expect(page.locator('[data-list-statement]').nth(k)).toHaveAttribute('data-list-state', 'rated')
    }
    await expect(page.locator('[data-list-statement] .d-sdot.done')).toHaveCount(4)
    await expect(page.locator('[data-card-list] .d-cltog')).toHaveText(`▶${yours.length} still need you · ${yours.length + 4} items`)
  })

  for (const width of [375, 320]) {
    test(`${width}px: the one list (P1468) folds to one line with what still needs you; a pick folds it again; no horizontal scroll`, async ({ page }) => {
      await page.setViewportSize({ width, height: 760 })
      await openDay(page)
      await collapseSidebar(page)
      const yours = yoursOf(await runView(page))
      const tog = page.locator('[data-card-list] .d-cltog')
      const line = `▶${yours.length + 4} still need you` // P1468: one line for both halves (review F12: equal numbers said once)
      await expect(tog).toHaveText(line)
      await expect(listRow(page, yours[0].fp)).toBeHidden()
      await tog.click()
      await listRow(page, yours[1].fp).click()
      await expect(cardTitle(page)).toHaveText(yours[1].title)
      await expect(listRow(page, yours[1].fp)).toBeHidden()
      await reflTab(page).click()
      await expect(page.locator('[data-card-list] .d-cltog')).toHaveText(line)
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
  const reflTab = (page: Page) => ({ click: () => goTab(page, 'Reflection'), tap: () => goTab(page, 'Reflection') })
  // P1468: storyBox / fillStory / openStory are the shared helpers (the box opens from "+ Add a story")
  const reflLines = () => lines().filter((d) => d.kind === 'reflection')
  const bpos = (page: Page) => page.locator('.d-bpos')
  const STORY = 'Invented story: the test widget took two tries.'
  const LATEST_PASS = '2026-10-04T05-37-45Z'
  const EARLIER_PASS = '2026-10-03T05-05-00Z'
  const writeLines = (ls: object[]) => writeFileSync(DECISIONS, ls.map((l) => JSON.stringify(l)).join('\n') + '\n')
  const refl = (target: string, extra: object, run_id = LATEST_PASS, at = '2026-10-04T09:00:00.000Z') => ({ kind: 'reflection', target, run_id, at, ...extra })

  test('a story with no position is saved by Accept, says "Story, no position" and "not sent yet", and is answered, not rated', async ({ page }) => {
    await openDay(page)
    await reflTab(page).click()
    await fillStory(page, STORY)
    await page.locator('.d-pst').click() // leaving the box saves nothing (P1440 review)
    await page.waitForTimeout(300)
    expect(fileText()).toBe('')
    await acceptBtn(page).click()
    await expect(bpos(page)).toHaveText(stmtPos(2))
    expect(reflLines()).toHaveLength(1)
    expect(reflLines()[0]).toEqual(expect.objectContaining({ kind: 'reflection', target: 'c1', story: STORY }))
    expect(reflLines()[0].position).toBeUndefined()
    const row = page.locator('[data-list-statement="c1"]')
    await expect(row).toContainText('Story, no position')
    await expect(row).toHaveAttribute('data-list-state', 'story')
    await expect(row.locator('.d-sdot')).toHaveClass(/done/)
    // P1468: the list's head is gone; its folded line counts a story-only statement as answered (3 of 4 still open)
    const yours = yoursOf(await runView(page))
    await expect(page.locator('[data-card-list] .d-cltog')).toHaveText(`▶${yours.length + 3} still need you · ${yours.length + 4} items`)
    await expect(page.locator('[data-progress]')).toHaveText('0 of 4 rated · 1 story only')
    await prevBtn(page).click()
    await expect(page.locator('.d-cpcard [data-story-line]')).toHaveText('Not sent')
    // O4: emptying a saved story and pressing Accept deletes it (no position: the answer goes)
    await fillStory(page, '')
    await acceptBtn(page).click()
    await expect.poll(() => reflLines().at(-1)?.remove).toBe(true)
    expect(reflLines()).toHaveLength(2)
    await prevBtn(page).click()
    await expect(page.locator('.d-cpcard [data-story-line]')).toHaveCount(0)
  })

  test('O3: Accept is offered only when there is something to save, writes once, and on the last statement saves and stays', async ({ page }) => {
    await openDay(page)
    await reflTab(page).click()
    await expect(acceptBtn(page)).toHaveCount(0) // nothing picked or typed
    await page.locator('.d-cpcard [data-testid=disagree-group]').click() // a pick is saved at once …
    await expect.poll(() => reflLines().length).toBe(1)
    await expect(acceptBtn(page)).toHaveCount(0) // … so there is nothing left to accept
    await fillStory(page, STORY) // typed, never left
    await expect(acceptBtn(page)).toHaveAttribute('aria-label', 'Accept and next')
    await acceptBtn(page).click()
    await expect(bpos(page)).toHaveText(stmtPos(2))
    expect(reflLines()).toHaveLength(2)
    expect(reflLines()[1]).toEqual(expect.objectContaining({ target: 'c1', position: -2, story: STORY }))
    await prevBtn(page).click()
    await expect(acceptBtn(page)).toHaveCount(0) // saved as shown: nothing to accept
    // the last statement: Accept saves and stays
    await page.locator('[data-list-statement="c4"]').click()
    await fillStory(page, 'Invented story for the last statement.')
    await expect(acceptBtn(page)).toHaveAttribute('aria-label', 'Accept')
    await acceptBtn(page).click()
    await expect.poll(() => reflLines().length).toBe(3)
    await expect(bpos(page)).toHaveText(stmtPos(4))
    await expect(acceptBtn(page)).toHaveCount(0)
  })

  test('a failed Accept stays on the statement, says so, and keeps the typed story', async ({ page }) => {
    await openDay(page)
    await reflTab(page).click()
    await page.route('**/api/day/decisions', (r) => r.fulfill({ status: 500, json: { error: 'Failed to record decisions' } }))
    await fillStory(page, STORY)
    // the page re-reads the run after a failed write: only once that has landed can a wrong move show
    const reread = page.waitForResponse((r) => r.url().includes('/api/day/runs/'))
    await acceptBtn(page).click()
    await expect(page.locator('.d-toast')).toHaveText('Not saved: Failed to record decisions')
    await reread
    await page.waitForTimeout(200)
    await expect(bpos(page)).toHaveText(stmtPos(1))
    await expect(storyBox(page)).toHaveValue(STORY)
    await expect(page.locator('[data-story-unsaved]')).toBeVisible()
    expect(fileText()).toBe('')
  })

  test('Next, Previous, the statement list and the tabs never write a typed story', async ({ page }) => {
    await openDay(page)
    await reflTab(page).click()
    await fillStory(page, STORY)
    await nextBtn(page).click()
    await expect(bpos(page)).toHaveText(stmtPos(2))
    await prevBtn(page).click()
    await expect(bpos(page)).toHaveText(stmtPos(1))
    await expect(storyBox(page)).toHaveValue(STORY) // the draft is kept on the page
    await page.locator('[data-list-statement="c3"]').click()
    await expect(bpos(page)).toHaveText(stmtPos(3))
    await page.locator('[data-list-statement="c1"]').click()
    await storyBox(page).focus()
    await page.locator('.d-tabs').getByRole('tab', { name: 'Stats' }).click()
    await page.keyboard.press('Tab')
    await page.waitForTimeout(300)
    expect(fileText()).toBe('')
  })

  test('O1 + O2: a typed story is kept across runs and reloads, and shows as not saved on the card, the list and the bar', async ({ page }) => {
    await openDay(page)
    await reflTab(page).click()
    await fillStory(page, STORY)
    await expect(page.locator('.d-cpcard [data-story-unsaved]')).toHaveText('Not saved')
    await expect(page.locator('[data-list-statement="c1"]')).toContainText('Unsaved')
    await expect(page.locator('[data-unsaved-stories]')).toHaveText('1 unsaved')
    // another run and back: still there
    await page.getByRole('button', { name: 'Previous run' }).click()
    await expect(page.locator('[data-run-date]')).toHaveText('Sat 3 Oct')
    await page.getByRole('button', { name: 'Next run' }).click()
    await expect(page.locator('[data-run-date]')).toHaveText('Sun 4 Oct')
    await reflTab(page).click()
    await expect(storyBox(page)).toHaveValue(STORY)
    // a reload: still there
    await reopen(page)
    await reflTab(page).click()
    await expect(storyBox(page)).toHaveValue(STORY)
    await expect(page.locator('[data-unsaved-stories]')).toBeVisible()
    // Start fixing never writes a draft
    await startBtn(page).click() // exact name: P1468's agent panel (now under statements too) starts "Start fixing also sends these"
    await expect(page.locator('.d-toast')).toBeVisible()
    expect(reflLines()).toHaveLength(0)
    // Accept saves it, and the draft is gone (also from the browser's storage)
    await reflTab(page).click()
    await page.locator('[data-list-statement="c1"]').click()
    await acceptBtn(page).click()
    await expect.poll(() => reflLines().length).toBe(1)
    await expect(page.locator('[data-unsaved-stories]')).toHaveCount(0)
    // the page clears its draft when the save RESPONSE arrives, which is after the server wrote the
    // line: poll, never read once (P1445 — a single read raced the response under load)
    await expect.poll(() => page.evaluate(() => localStorage.getItem('day:story-drafts') ?? '')).not.toContain('two tries')
    await reopen(page)
    await reflTab(page).click()
    await page.locator('[data-list-statement="c1"]').click()
    await expect(storyBox(page)).toHaveValue(STORY)
    await expect(page.locator('[data-story-unsaved]')).toHaveCount(0)
  })

  test('a draft kept in storage never comes back over a story saved after it (storage failing in between)', async ({ page }) => {
    await openDay(page)
    await reflTab(page).click()
    await fillStory(page, 'Invented draft A, kept in storage.')
    await expect.poll(() => page.evaluate(() => localStorage.getItem('day:story-drafts') ?? '')).toContain('draft A')
    // storage starts refusing writes: the stored copy is stuck at A
    await page.evaluate(() => {
      Storage.prototype.setItem = () => {
        throw new Error('QuotaExceededError')
      }
      Storage.prototype.removeItem = () => {
        throw new Error('SecurityError')
      }
    })
    await fillStory(page, 'Invented story B, the one accepted.')
    await acceptBtn(page).click()
    await expect.poll(() => reflLines().length).toBe(1)
    expect(reflLines()[0]).toEqual(expect.objectContaining({ target: 'c1', story: 'Invented story B, the one accepted.' }))
    expect(await page.evaluate(() => localStorage.getItem('day:story-drafts') ?? '')).toContain('draft A') // the stale copy is still there
    await reopen(page) // a fresh page: storage works again and still holds A
    await reflTab(page).click()
    await page.locator('[data-list-statement="c1"]').click()
    await expect(storyBox(page)).toHaveValue('Invented story B, the one accepted.')
    await expect(page.locator('[data-story-unsaved]')).toHaveCount(0)
    await expect(page.locator('[data-unsaved-stories]')).toHaveCount(0)
    await expect(acceptBtn(page)).toHaveCount(0)
  })

  test('text typed while an Accept is being saved is kept as a new unsaved edit, never dropped', async ({ page }) => {
    await openDay(page)
    await reflTab(page).click()
    await page.locator('[data-list-statement="c4"]').click() // the last statement: Accept saves and stays
    await page.route('**/api/day/decisions', async (r) => {
      await new Promise((res) => setTimeout(res, 500))
      await r.continue()
    })
    await fillStory(page, 'Invented story, first part.')
    await acceptBtn(page).click()
    await fillStory(page, 'Invented story, first part. Second part typed during the save.')
    await expect.poll(() => reflLines().length).toBe(1)
    await page.waitForTimeout(300)
    await expect(storyBox(page)).toHaveValue('Invented story, first part. Second part typed during the save.')
    await expect(page.locator('[data-story-unsaved]')).toBeVisible()
    await reopen(page)
    await reflTab(page).click()
    await page.locator('[data-list-statement="c4"]').click()
    await expect(storyBox(page)).toHaveValue('Invented story, first part. Second part typed during the save.')
  })

  test('each story says where it is; Mark done closes it once; earlier open stories are listed by name until marked', async ({ page }) => {
    await openDay(page)
    writeLines([refl('c2', { story: 'Invented story from an earlier day.' }, EARLIER_PASS, '2026-10-03T09:00:00.000Z')])
    await reopen(page)
    await reflTab(page).click()
    const earlier = page.locator('[data-earlier-stories]')
    await expect(earlier).toContainText('Earlier stories (1)')
    await expect(earlier).toContainText('Invented story from an earlier day.')
    await expect(earlier.locator('[data-story-line]')).toHaveText('Not sent')
    // this run's story: saved by Accept, then marked done on its card
    await fillStory(page, STORY)
    await acceptBtn(page).click()
    await expect(bpos(page)).toHaveText(stmtPos(2))
    await prevBtn(page).click()
    await expect(page.locator('.d-cpcard [data-story-line]')).toHaveText('Not sent')
    // O5: a slow Mark done clicked twice posts once
    let posts = 0
    await page.route('**/api/day/stories/done', async (r) => {
      posts++
      await new Promise((res) => setTimeout(res, 400))
      await r.continue()
    })
    await page.locator('.d-cpcard [data-story-done]').click()
    await page.locator('.d-cpcard [data-story-done]').click({ force: true })
    await expect(page.locator('.d-cpcard [data-story-line]')).toHaveText('Done · acted')
    expect(posts).toBe(1)
    expect(lines().filter((l) => l.kind === 'story_done')).toHaveLength(1)
    expect(lines().at(-1)).toEqual(expect.objectContaining({ kind: 'story_done', target: 'c1', outcome: 'acted', note: 'marked on the board' }))
    expect(lines().at(-1)?.story_hash).toMatch(/^[0-9a-f]{64}$/)
    // the earlier one, by its accessible name: Mark done takes it off the list
    await earlier.getByRole('button', { name: 'Mark done: Weekly events are a hobby until one produces a champion talk.' }).click()
    await expect(page.locator('[data-earlier-stories]')).toHaveCount(0)
    expect(lines().at(-1)).toEqual(expect.objectContaining({ kind: 'story_done', run_id: EARLIER_PASS, target: 'c2' }))
    // editing a done story reopens it once saved
    await fillStory(page, `${STORY} And one more line.`)
    await acceptBtn(page).click()
    await prevBtn(page).click()
    await expect(page.locator('.d-cpcard [data-story-line]')).toHaveText('Not sent')
  })

  test('O5: Mark done waits while the card has an unsaved story, and says why', async ({ page }) => {
    await openDay(page)
    writeLines([refl('c1', { position: 2, story: STORY })])
    await reopen(page)
    await reflTab(page).click()
    await page.locator('[data-list-statement="c1"]').click()
    await expect(page.locator('.d-cpcard [data-story-done]')).toBeEnabled()
    await fillStory(page, `${STORY} Edited.`)
    await expect(page.locator('.d-cpcard [data-story-done]')).toBeDisabled()
    // one line says both, and it outweighs the grey state line (review visual 4)
    const marker = page.locator('.d-cpcard [data-story-unsaved]')
    await expect(marker).toHaveText('Not saved')
    await expect(page.locator('.d-cpcard [data-story-done-hint]')).toHaveCount(0)
    // the reason lives on the disabled Done only (tooltip and accessible name)
    await expect(page.locator('.d-cpcard [data-story-done]')).toHaveAttribute('title', /Accept the edited story first/)
    await expect(page.locator('.d-cpcard [data-story-done]')).toHaveAccessibleName(/^Mark done: .*Accept the edited story first/)
    const look = (sel: string) => page.locator(sel).evaluate((e) => ({ color: getComputedStyle(e).color, weight: getComputedStyle(e).fontWeight }))
    expect(await look('.d-cpcard [data-story-unsaved]')).toEqual({ color: 'rgb(146, 64, 14)', weight: '600' }) // --amber-800, the "needs you" colour
    expect((await look('.d-cpcard [data-story-state]')).color).not.toBe('rgb(146, 64, 14)')
  })

  test('P1445: the agent\'s note on a handled story opens from its chip (tap/keyboard), never as a standing line', async ({ page }) => {
    await openDay(page)
    const NOTE = 'Answered: the three names went into the follow-up list.'
    writeLines([
      refl('c1', { position: 2, story: STORY }, LATEST_PASS, '2026-10-04T09:00:00.000Z'),
      { kind: 'story_done', run_id: LATEST_PASS, target: 'c1', story_hash: storyHash(STORY), outcome: 'answered', note: NOTE, at: '2026-10-04T10:00:00.000Z' },
    ])
    await reopen(page)
    await reflTab(page).click()
    await page.locator('[data-list-statement="c1"]').click()
    const chip = page.locator('.d-cpcard [data-story-line]')
    await expect(chip).toHaveText('Done · answered ⓘ')
    await expect(page.locator('.d-cpcard [data-story-note]')).toHaveCount(0) // no standing line
    await chip.focus()
    await page.keyboard.press('Enter')
    await expect(page.locator('.d-cpcard [data-story-note]')).toHaveText(NOTE)
    await expect(chip).toHaveAttribute('aria-expanded', 'true')
  })

  test('an earlier run shows its stories without buttons', async ({ page }) => {
    await openDay(page)
    writeLines([refl('c1', { story: 'Invented story on the earlier run.' }, EARLIER_PASS, '2026-10-03T09:00:00.000Z')])
    await reopen(page)
    await page.getByRole('button', { name: 'Previous run' }).click()
    await expect(page.locator('[data-run-date]')).toHaveText('Sat 3 Oct')
    await reflTab(page).click()
    await expect(page.locator('.d-cpcard [data-story-line]')).toHaveText('Not sent')
    await expect(page.locator('.d-story-ro')).toHaveText('Invented story on the earlier run.')
    await expect(page.locator('[data-story-done], [data-story-resend]')).toHaveCount(0)
  })

  test.describe('on a phone (touch, 375px)', () => {
    test.use({ hasTouch: true, viewport: { width: 375, height: 760 } })

    test('O7: typing a story then tapping Next writes nothing; tapping Accept writes exactly one line', async ({ page }) => {
      await openDay(page)
      await collapseSidebar(page)
      await reflTab(page).tap()
      await openStory(page, 'tap')
      await fillStory(page, STORY)
      await nextBtn(page).tap()
      await expect(bpos(page)).toHaveText(stmtPos(2))
      await page.waitForTimeout(300)
      expect(fileText()).toBe('')
      await prevBtn(page).tap()
      await expect(storyBox(page)).toHaveValue(STORY)
      await acceptBtn(page).tap()
      await expect(bpos(page)).toHaveText(stmtPos(2))
      await page.waitForTimeout(300)
      expect(reflLines()).toHaveLength(1)
      expect(reflLines()[0]).toEqual(expect.objectContaining({ target: 'c1', story: STORY }))
    })

    test('O7: the folded statement list never writes a typed story', async ({ page }) => {
      await openDay(page)
      await collapseSidebar(page)
      await reflTab(page).tap()
      await openStory(page, 'tap')
      await fillStory(page, STORY)
      await page.locator('[data-card-list] .d-cltog').tap()
      await page.locator('[data-list-statement="c3"]').tap()
      await expect(bpos(page)).toHaveText(stmtPos(3))
      await page.waitForTimeout(300)
      expect(fileText()).toBe('')
    })
  })

  /** Every box in the bottom bar stays inside its cell (nav · progress · actions), and the cells do not overlap. */
  const barOverflow = (page: Page) =>
    page.evaluate(() => {
      const bad: string[] = []
      const cells = [...document.querySelectorAll('[data-bottom-bar] .d-bnav, [data-bottom-bar] .d-bprog, [data-bottom-bar] .d-bact')]
      const rects = cells.map((c) => c.getBoundingClientRect())
      const bar = document.querySelector('[data-bottom-bar] .d-col')?.getBoundingClientRect()
      cells.forEach((cell, i) => {
        const r = rects[i]
        if (bar && (r.left < bar.left - 1 || r.right > bar.right + 1)) bad.push(`${cell.className} leaves the bar`)
        rects.forEach((o, j) => {
          if (j > i && r.left < o.right - 1 && o.left < r.right - 1 && r.top < o.bottom - 1 && o.top < r.bottom - 1) bad.push(`${cell.className} overlaps ${cells[j].className}`)
        })
        for (const el of cell.querySelectorAll('*')) {
          const e = el as HTMLElement
          if (!e.offsetParent && getComputedStyle(e).position !== 'fixed') continue
          const b = e.getBoundingClientRect()
          if (!b.width) continue
          // .d-still widens its tap area with a -6px side margin, on purpose
          const slack = e.classList.contains('d-still') ? 7 : 1
          if (b.left < r.left - slack || b.right > r.right + slack) bad.push(`${e.className || e.tagName} spills out of ${cell.className} (${Math.round(b.left)}–${Math.round(b.right)} in ${Math.round(r.left)}–${Math.round(r.right)})`)
          if (e.scrollWidth > e.clientWidth + 1 && getComputedStyle(e).overflow !== 'visible') bad.push(`${e.className || e.tagName} clips its text`)
        }
      })
      return bad
    })

  for (const [width, height] of [[1440, 900], [375, 760], [320, 700]] as const) {
    test(`${width}px: the bottom bar lays out without clipping when a typed story is not saved`, async ({ page }) => {
      await page.setViewportSize({ width, height })
      await openDay(page)
      if (width < 500) await collapseSidebar(page)
      await reflTab(page).click()
      await fillStory(page, STORY)
      await expect(page.locator('[data-unsaved-stories]')).toBeVisible()
      expect(await barOverflow(page), 'reflection').toEqual([])
      await page.locator('.d-tabs').getByRole('tab', { name: 'Daily report', exact: true }).click()
      await expect(page.locator('[data-unsaved-stories]')).toBeVisible()
      expect(await barOverflow(page), 'daily report').toEqual([])
    })
  }

  const stuckEarlier = (texts: string[]) => {
    const ls: object[] = []
    texts.forEach((story, k) => {
      const target = `c${k + 1}`
      ls.push(refl(target, { story }, EARLIER_PASS, '2026-10-03T09:00:00.000Z'))
    })
    // three launches that carried the first one: it is stuck
    const key = sentKey.story(EARLIER_PASS, 'c1', storyHash(texts[0]))
    for (const n of [1, 2, 3]) {
      ls.push({ kind: 'sent', id: `l${n}`, run_id: LATEST_PASS, state: 'pending', at: `2026-10-04T0${n}:00:00.000Z`, items: [key] })
      ls.push({ kind: 'sent', id: `l${n}`, run_id: LATEST_PASS, state: 'started', at: `2026-10-04T0${n}:00:01.000Z` })
    }
    writeLines(ls)
  }
  const LONG = `https://example.invalid/${'a'.repeat(200)}`

  for (const width of [375, 320]) {
    test(`${width}px: earlier stories wrap long words, their buttons are 40px tall, and the last one scrolls clear of the bottom bar`, async ({ page }) => {
      await page.setViewportSize({ width, height: 700 })
      await openDay(page)
      stuckEarlier([`Invented stuck story ${LONG}`, 'Invented second earlier story.', `Invented third earlier story ${LONG}`])
      await reopen(page)
      await collapseSidebar(page)
      await reflTab(page).click()
      const earlier = page.locator('[data-earlier-stories]')
      await expect(earlier).toContainText('Earlier stories (3)')
      await expect(earlier.locator('[data-story-state="stuck"] [data-story-line]')).toHaveText('Stuck')
      // O6: no horizontal overflow, anywhere on the page or in a story
      const over = await page.evaluate(() => {
        const r = document.querySelector('.day-root')
        const wide = [...document.querySelectorAll('.d-story-ro, [data-earlier-story] *, .d-cpcard *')].filter((e) => e.scrollWidth > e.clientWidth + 1 && getComputedStyle(e).display !== 'inline' && getComputedStyle(e).textOverflow !== 'ellipsis').length
        return { root: r ? r.scrollWidth - r.clientWidth : -1, wide }
      })
      expect(over).toEqual({ root: 0, wide: 0 })
      // V1: touch targets
      for (const b of await earlier.locator('[data-story-done], [data-story-resend]').all()) {
        expect((await rectOf(b, 'story button')).height, 'story button height').toBeGreaterThanOrEqual(40)
      }
      // V2: scrolled to the bottom, the last row's Mark done sits fully above the bar
      await page.evaluate(() => {
        const sc = document.querySelector('.day-root')?.parentElement
        if (sc) sc.scrollTop = sc.scrollHeight
      })
      const last = earlier.locator('[data-earlier-story]').last().locator('[data-story-done]')
      const b = await rectOf(last, 'last Mark done')
      const bar = await rectOf(page.locator('[data-bottom-bar]'), 'bottom bar')
      expect(b.y + b.height).toBeLessThanOrEqual(bar.y)
    })
  }
})

test.describe('P1445 D: the reflection card is CP\'s point card, with "Agent on Slava"', () => {
  const reflTab = (page: Page) => ({ click: () => goTab(page, 'Reflection'), tap: () => goTab(page, 'Reflection') })
  const open = async (page: Page, id: string) => {
    await openDay(page)
    await reflTab(page).click()
    await page.locator(`[data-list-statement="${id}"]`).click()
  }

  test('the clear control is CP\'s: "Clear position", in CP\'s red (computed), and it clears', async ({ page }) => {
    await open(page, 'c1')
    const card = page.locator('.d-cpcard')
    await card.locator('[data-testid=agree-group]').click()
    await expect(card.locator('[data-testid=agree-group]')).toHaveAttribute('aria-pressed', 'true')
    await card.locator('[data-testid=agree-group]').click()
    const clear = page.getByRole('option', { name: 'Clear position' })
    await expect(clear).toBeVisible()
    // CP renders Clear as text-red-600; Tailwind's red-600 is rgb(220, 38, 38)
    expect(await clear.evaluate((e) => getComputedStyle(e).color)).toBe('rgb(220, 38, 38)')
    // the card frame is CP's too: its left stripe (border-l-4 border-l-slate-300) is drawn
    expect(await card.locator('article').evaluate((e) => [getComputedStyle(e).borderLeftWidth, getComputedStyle(e).borderLeftStyle])).toEqual(['4px', 'solid'])
    // CP's bg-card resolves to CP's white, not to the board's own --card (Opus review)
    expect(await card.locator('article').evaluate((e) => getComputedStyle(e).backgroundColor)).toBe('rgb(255, 255, 255)')
    await clear.click()
    await expect(card.locator('[aria-pressed=true]')).toHaveCount(0)
  })

  // P1468 §2: the agent's byline and stance are in its story, not a row above the statement
  test('a statement with a checked agent view shows AGENT on Slava, its own stance and its quotes in "Their story" — and never sets the founder\'s position', async ({ page }) => {
    await open(page, 'c2')
    await expect(page.locator('.d-cpcard [data-agent-owner]')).toHaveCount(0)
    // P1449: the story opens from the footer's "Their story" toggle
    await page.locator('.d-cpcard [data-testid=point-story-expander]').click()
    const row = page.locator('.d-cpcard [data-agent-view]')
    await expect(row.getByTestId('agent-byline-name')).toHaveText('Slava')
    await expect(row.getByTestId('story-author-stance')).toContainText('Disagrees−') // CP's PositionBadge for the agent's -1
    await expect(row).toContainText('no champion talk yet')
    await expect(row.getByTestId('story-video-quote')).toHaveText(['no champion talk yet'])
    // the founder's own control is untouched by the agent's view
    await expect(page.locator('.d-cpcard [data-position-control] [aria-pressed=true]')).toHaveCount(0)
    // a statement without one shows no agent row
    await page.locator('[data-list-statement="c1"]').click()
    await expect(page.locator('.d-cpcard [data-agent-view], .d-cpcard [data-agent-owner]')).toHaveCount(0)
  })
})


/**
 * P1449 iteration 4: CP's classes must resolve to CP's CSS on the board. The oracle is CP's own
 * stylesheet — CP's src/index.css compiled by CP's own Tailwind config (never a copied value) —
 * applied to the very markup the board rendered; the board's computed styles must match it.
 */
const CP_ROOT = resolve(new URL('.', import.meta.url).pathname, '../../..')
async function compileCpCss(): Promise<string> {
  const req = createRequire(join(CP_ROOT, 'package.json'))
  const postcss = req('postcss')
  const tailwind = req('tailwindcss')
  const cfg = req('tailwindcss/loadConfig')(join(CP_ROOT, 'tailwind.config.js')) // CP's config as Tailwind itself loads it
  const css = readFileSync(join(CP_ROOT, 'src/index.css'), 'utf-8')
  const out = await postcss([tailwind({ ...cfg, content: [join(CP_ROOT, 'src/**/*.{ts,tsx}')] })]).process(css, { from: join(CP_ROOT, 'src/index.css') })
  return out.css
}
const STYLE_PROBES: Record<string, { sel: string; props: string[] }> = {
  // P1468: the owner row is gone — the same CP pieces (stance badge, avatar, AGENT label) head the agent's story
  badge: { sel: '[data-agent-view] [data-testid=story-author-stance] .bg-blue-100', props: ['borderRadius', 'fontWeight'] },
  avatar: { sel: '[data-agent-view] [data-testid=gravatar-avatar]', props: ['borderRadius'] },
  agentLabel: { sel: '[data-agent-view] [data-testid=machine-chip]', props: ['fontWeight', 'letterSpacing', 'fontFamily', 'fontSize'] },
  statement: { sel: '.d-pst', props: ['fontSize', 'fontFamily', 'fontWeight', 'lineHeight'] },
  agreeButton: { sel: '[data-testid=agree-group]', props: ['height', 'fontSize'] },
  pin: { sel: '.lucide-pin', props: ['transform'] },
}
async function probeStyles(page: Page, root: string) {
  return page.evaluate(({ probes, root }) => {
    const out: Record<string, Record<string, string>> = {}
    const scope = document.querySelector(root) ?? document
    for (const [k, { sel, props }] of Object.entries(probes)) {
      const el = scope.querySelector(sel) as HTMLElement | null
      if (!el) { out[k] = { missing: sel }; continue }
      const cs = getComputedStyle(el)
      out[k] = Object.fromEntries(props.map((p) => [p, p === 'height' ? `${Math.round(el.getBoundingClientRect().height)}px` : (cs as unknown as Record<string, string>)[p]]))
    }
    return out
  }, { probes: STYLE_PROBES, root })
}

test.describe('P1449: the reflection card is CP\'s profile point card with CP\'s story card', () => {
  const reflTab = (page: Page) => ({ click: () => goTab(page, 'Reflection'), tap: () => goTab(page, 'Reflection') })
  const toggle = (page: Page) => page.locator('.d-cpcard [data-testid=point-story-expander]')

  // P1468 §2 supersedes P1449's owner row: on the Day page the point is the founder's, so nothing sits above it
  test('P1468: no owner row above the statement; the avatar, AGENT on Slava and the stance head the agent\'s story', async ({ page }) => {
    await openDay(page)
    await reflTab(page).click()
    await page.locator('[data-list-statement="c2"]').click()
    await expect(page.locator('.d-cpcard [data-testid=point-owner-row]')).toHaveCount(0)
    await toggle(page).click()
    const head = page.locator('.d-cpcard [data-agent-view]')
    await expect(head.getByTestId('gravatar-avatar')).toHaveAttribute('data-agent', 'true')
    await expect(head.getByTestId('gravatar-avatar')).toHaveText('S')
    await expect(head.getByTestId('agent-byline')).toContainText(/^Agent/) // shown as AGENT by CSS
    await expect(head.getByTestId('story-author-stance')).toContainText('Disagrees−')
    const stmt = await rectOf(page.locator('.d-cpcard .d-pst'), 'statement')
    const stance = await rectOf(head.getByTestId('story-author-stance'), 'stance')
    expect(stance.y).toBeGreaterThan(stmt.y + stmt.height) // below the point, inside the story
  })

  test('the footer shows CP\'s "Their story" toggle, closed by default, with no Details; a statement without an agent view has none', async ({ page }) => {
    await openDay(page)
    await reflTab(page).click()
    await page.locator('[data-list-statement="c2"]').click()
    await expect(toggle(page)).toHaveText('Their story')
    await expect(toggle(page)).toHaveAttribute('aria-expanded', 'false')
    await expect(page.locator('.d-cpcard [data-agent-view]')).toHaveCount(0)
    await expect(page.locator('.d-cpcard [data-testid=point-card-footer]').getByRole('button', { name: /Details/ })).toHaveCount(0)
    await page.locator('[data-list-statement="c1"]').click()
    await expect(toggle(page)).toHaveCount(0)
  })

  test('opened: CP\'s story in the thread line — avatar + AGENT byline, prose with no tier labels, supporting quotes with no timecode; paging closes it', async ({ page }) => {
    await openDay(page)
    await reflTab(page).click()
    await page.locator('[data-list-statement="c2"]').click()
    await toggle(page).click()
    await expect(toggle(page)).toHaveAttribute('aria-expanded', 'true')
    const row = page.locator('.d-cpcard [data-agent-view]')
    await expect(row).toBeVisible()
    // CP's ThreadLineItem: the horizontal branch sits beside the row
    await expect(row.locator('xpath=ancestor::div[contains(@class,"pl-4")][1]/div[contains(@class,"w-3")]')).toHaveCount(1)
    await expect(row.getByTestId('quoted-story')).toHaveCount(1)
    await expect(row.getByTestId('gravatar-avatar')).toHaveAttribute('data-agent', 'true')
    await expect(row.getByTestId('agent-byline-name')).toHaveText('Slava')
    // P1468 §2: the stance is the story's own (QuotedStoryShell's authorPosition), not an owner row's
    await expect(row.getByTestId('story-author-stance')).toHaveCount(1)
    await expect(row).not.toContainText(/Fact:|Connection:|Speculation:/)
    await expect(row.getByTestId('story-video-quotes-heading')).toHaveText('1 supporting quote')
    await expect(row.getByTestId('story-video-quote')).toHaveText(['no champion talk yet'])
    await expect(row.getByTestId('story-video-quote-timecode')).toHaveCount(0)
    await expect(row.locator('details')).toHaveCount(0)
    await expect(page.locator('.d-cpcard [data-position-control] [aria-pressed=true]')).toHaveCount(0)
    await page.locator('[data-list-statement="c1"]').click()
    await page.locator('[data-list-statement="c2"]').click()
    await expect(toggle(page)).toHaveAttribute('aria-expanded', 'false')
  })

  test('an agent picture (avatarUrl) is shown as CP\'s photo avatar', async ({ page }) => {
    // a real image, or GravatarAvatar's onError falls back to initials
    const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64')
    await page.route('https://example.invalid/agent.png', (r) => r.fulfill({ contentType: 'image/png', body: PNG }))
    await patchRun(page, (b) => {
      const st = b.report?.reflection?.statements.find((x) => x.id === 'c2')
      if (st?.agent) st.agent.avatarUrl = 'https://example.invalid/agent.png'
    })
    await openDay(page)
    await reflTab(page).click()
    await page.locator('[data-list-statement="c2"]').click()
    await expect(page.locator('.d-cpcard [data-testid=point-owner-row]')).toHaveCount(0) // P1468: no owner row
    await toggle(page).click()
    await expect(page.locator('.d-cpcard [data-agent-view] [data-testid=gravatar-avatar] img')).toHaveAttribute('src', 'https://example.invalid/agent.png')
  })

  test('a selected position button is visible: Disagree / Unsure / Agree each get a solid background and readable text (computed)', async ({ page }) => {
    await openDay(page)
    await reflTab(page).click()
    await page.locator('[data-list-statement="c1"]').click()
    for (const g of ['disagree', 'unsure', 'agree']) {
      const btn = page.locator(`.d-cpcard [data-testid=${g}-group]`)
      await btn.click()
      await expect(btn).toHaveAttribute('aria-pressed', 'true')
      // read after the button's colour transition (transition-colors) has finished, never mid-fade
      const { bg, fg } = await btn.evaluate(async (e) => {
        await Promise.all(e.getAnimations().map((a) => a.finished))
        return { bg: getComputedStyle(e).backgroundColor, fg: getComputedStyle(e).color }
      })
      const alpha = Number(bg.match(/rgba?\([^)]*?,[^)]*?,[^)]*?(?:,\s*([\d.]+))?\)/)?.[1] ?? 1)
      expect(alpha, `${g} selected background ${bg} is opaque`).toBeGreaterThan(0.9)
      expect(fg, `${g} selected text vs background`).not.toBe(bg)
    }
  })

  test('theme parity: CP\'s classes on the board compute to what CP\'s own stylesheet gives the same markup', async ({ page, browser }) => {
    test.setTimeout(120_000)
    await page.setViewportSize({ width: 1280, height: 900 })
    await openDay(page)
    await reflTab(page).click()
    await page.locator('[data-list-statement="c2"]').click()
    await toggle(page).click() // P1468: the probed pieces live in the agent's story
    await page.mouse.move(0, 0)
    const board = await probeStyles(page, '.d-cpcard')
    for (const [k, v] of Object.entries(board)) expect(v, `${k} is on the board`).not.toHaveProperty('missing')
    const html = await page.locator('.d-cpcard').evaluate((e) => e.outerHTML)
    const css = await compileCpCss()
    const cp = await browser.newPage({ viewport: { width: 1280, height: 900 } })
    await cp.route('http://cp.test/**', async (r) => {
      const u = new URL(r.request().url())
      if (u.pathname.startsWith('/fonts/')) return r.fulfill({ path: join(CP_ROOT, 'public', u.pathname) })
      return r.fulfill({ contentType: 'text/html', body: `<!doctype html><html><head><style>${css}</style></head><body><div style="max-width:640px;margin:24px auto">${html}</div></body></html>` })
    })
    await cp.goto('http://cp.test/')
    await cp.evaluate(() => document.fonts.ready)
    await page.evaluate(() => document.fonts.ready)
    const ref = await probeStyles(cp, '.d-cpcard')
    await cp.close()
    console.log('THEME-PARITY ' + JSON.stringify({ board, cp: ref }))
    expect(board).toEqual(ref)
    // CP's Inter is really loaded on the board (the stack names it; this proves the face is there)
    expect(await page.evaluate(() => document.fonts.check('16px Inter'))).toBe(true)
  })

  test('CP\'s grey box holds only pin, statement and position buttons; the founder\'s story box and chip sit under it; no 1·2·3 row', async ({ page }) => {
    await openDay(page)
    await reflTab(page).click()
    await page.locator('[data-list-statement="c2"]').click()
    const box = page.locator('.d-cpcard .bg-gray-50').first()
    await expect(box.locator('[data-position-control]')).toHaveCount(1)
    // P1468: the founder's box opens from "+ Add a story" in the card's footer, under the grey box
    await expect(box.getByRole('button', { name: 'Add a story for this point' })).toHaveCount(0)
    await openStory(page)
    await expect(box.getByRole('textbox')).toHaveCount(0)
    await expect(page.locator('.d-cpcard .d-founder').getByRole('textbox', { name: 'Your story' })).toHaveCount(1)
    const b = await rectOf(box, 'grey box')
    const story = await rectOf(page.locator('.d-cpcard .d-founder'), 'founder')
    expect(story.y).toBeGreaterThanOrEqual(b.y + b.height)
    await expect(page.locator('.d-cpcard')).not.toContainText('1 · 2 · 3')
  })

  // P1468 supersedes P1449's rule (one statement = no list): the list rule is the same for every item
  // — it shows when the queue holds 2+ rows. AC4 covers one item in all; here cards come first.
  test('P1468: a single statement after the cards is a row of the one list, not a centred card alone', async ({ page }) => {
    await page.setViewportSize({ width: 1400, height: 900 })
    await patchRun(page, (b) => {
      const r = b.report?.reflection
      if (r) r.statements = r.statements.filter((x) => x.id === 'c2')
    })
    await openDay(page)
    await collapseSidebar(page)
    await reflTab(page).click()
    await expect(page.locator('[data-statement="c2"]')).toBeVisible()
    await expect(page.locator('[data-card-list] [data-list-statement]')).toHaveCount(1)
    await expect(page.locator('[data-card-list] [data-list-divider]')).toHaveText('Stories')
    await expect(page.locator('.d-md.d-single')).toHaveCount(0)
  })
})

// P1468: cards and statements are one list and one layout — the status line, the list and the agent
// panel sit around whichever item is open.
test.describe('P1468: one list, one top, for cards and stories', () => {
  /**
   * AC1's positions: the status line's top, and the list's left edge, top and width. P1468 review
   * F2: and the right pane — its left edge, the open item's left edge and width, the agent panel's.
   */
  const positions = async (page: Page) => {
    const s = await rectOf(page.locator('[data-status-line]'), 'status line')
    const l = await rectOf(page.locator('[data-card-list]'), 'list')
    const pane = await rectOf(page.locator('.d-mdmain'), 'pane')
    const item = await rectOf(page.locator('[data-issue], [data-statement]'), 'open item')
    const agent = await rectOf(page.locator('[data-agent-list]'), 'agent panel')
    return { statusY: s.y, listX: l.x, listY: l.y, listW: l.width, paneX: pane.x, itemX: item.x, itemW: item.width, agentX: agent.x, agentW: agent.width }
  }

  test('AC1 + AC19: paging from the last card into the first statement moves neither the status line nor the list (1440px)', async ({ page }) => {
    await openDay(page) // the config's viewport: 1440x900
    expect(must(page.viewportSize(), 'viewport').width).toBe(1440)
    const yours = yoursOf(await runView(page))
    expect(yours.length).toBeGreaterThanOrEqual(2)
    const last = must(yours.at(-1), 'last card')
    await listRow(page, last.fp).click()
    await expect(cardTitle(page)).toHaveText(last.title)
    await expect(page.locator('[data-card-list]')).toHaveCount(1)
    await expect(page.locator('[data-status-line]')).toHaveCount(1)
    const onCard = await positions(page)
    await nextBtn(page).click()
    await expect(page.locator('[data-statement]')).toBeVisible()
    await expect(page.locator('.d-bpos')).toHaveText(stmtPos(1))
    await expect(page.locator('[data-card-list]')).toHaveCount(1)
    await expect(page.locator('[data-status-line]')).toHaveCount(1)
    const onStatement = await positions(page)
    for (const k of Object.keys(onCard) as (keyof typeof onCard)[]) expect(Math.abs(onStatement[k] - onCard[k]), `${k}: card ${onCard[k]}, statement ${onStatement[k]}`).toBeLessThanOrEqual(1)
  })

  const list = (page: Page) => page.locator('[data-card-list]')
  const stmtRow = (page: Page, id: string) => page.locator(`[data-card-list] [data-list-statement="${id}"]`)
  const addStory = (page: Page) => page.locator('.d-cpcard').getByRole('button', { name: 'Add a story for this point' })
  const box = (page: Page) => page.locator('.d-cpcard').getByRole('textbox', { name: 'Your story' })
  const LATEST_PASS = '2026-10-04T05-37-45Z'
  const EARLIER_PASS = '2026-10-03T05-05-00Z'
  const writeLines = (ls: object[]) => writeFileSync(DECISIONS, ls.map((l) => JSON.stringify(l)).join('\n') + '\n')
  const refl = (target: string, extra: object, run_id = LATEST_PASS, at = '2026-10-04T09:00:00.000Z') => ({ kind: 'reflection', target, run_id, at, ...extra })
  /** A launch receipt the way the server writes one (as in the P1432 tests). */
  const receipt = (id: string, items: string[]) =>
    [
      JSON.stringify({ kind: 'sent', id, run_id: LATEST_ID, state: 'pending', at: new Date().toISOString(), items, count: items.length }),
      JSON.stringify({ kind: 'sent', id, run_id: LATEST_ID, state: 'started', at: new Date().toISOString() }),
    ].join('\n') + '\n'
  const agentKey = (i: ViewIssue) => `option:${i.fp}:${i.options[i.recommended_index].id}:`
  const fold = (page: Page) => agentList(page).locator('.d-fold')

  test('AC2: the same rows on a card and on a statement; one "Stories" divider between the halves, not a control; aria-current is the open item', async ({ page }) => {
    await openDay(page)
    const yours = yoursOf(await runView(page))
    const counts = async () => ({
      rows: await list(page).locator('li').count(),
      cards: await list(page).locator('[data-list-card]').count(),
      parked: await list(page).locator('[data-list-parked]').count(),
      statements: await list(page).locator('[data-list-statement]').count(),
    })
    const onCard = await counts()
    expect(onCard).toMatchObject({ cards: yours.length, statements: STMTS })
    const div = list(page).locator('[data-list-divider]')
    await expect(div).toHaveCount(1)
    await expect(div).toHaveText('Stories')
    expect(await div.evaluate((e) => ({ tag: e.tagName, focusable: e.tabIndex >= 0 || !!e.querySelector('button, a, input, [tabindex]') }))).toEqual({ tag: 'LI', focusable: false })
    const order = await list(page)
      .locator('[data-list-card], [data-list-divider], [data-list-statement]')
      .evaluateAll((els) => els.map((e) => (e.hasAttribute('data-list-card') ? 'card' : e.hasAttribute('data-list-divider') ? 'divider' : 'statement')))
    expect(order).toEqual([...yours.map(() => 'card'), 'divider', ...Array(STMTS).fill('statement')])
    await expect(list(page).locator('[aria-current=true]')).toHaveCount(1)
    await expect(list(page).locator('[aria-current=true]')).toHaveAttribute('data-list-card', yours[0].fp)
    await stmtRow(page, 'c3').click()
    await expect(page.locator('[data-statement="c3"]')).toBeVisible()
    expect(await counts()).toEqual(onCard)
    await expect(list(page).locator('[aria-current=true]')).toHaveCount(1)
    await expect(list(page).locator('[aria-current=true]')).toHaveAttribute('data-list-statement', 'c3')
  })

  test('AC3: a row opens its item from either half; ← → and the pager span both; the parked row opens Parked from a statement in one click; the divider does nothing', async ({ page }) => {
    await openDay(page)
    const all = yoursOf(await runView(page))
    // one card parked on an earlier run (as in the P1432 list test): the list gets its parked row
    const earlier = (await (await page.request.get(`/api/day/runs/${EARLIER_ID}`)).json()) as { report: { pass_id: string; started_at: string } }
    const at = new Date(Date.parse(earlier.report.started_at) + 3_600_000).toISOString()
    writeFileSync(DECISIONS, JSON.stringify({ kind: 'option', target: all[0].fp, option_id: 'park', run_id: earlier.report.pass_id, at }) + '\n')
    await reopen(page)
    const yours = all.slice(1)
    const n = yours.length + STMTS
    await stmtRow(page, 'c2').click()
    await expect(page.locator('[data-statement="c2"]')).toBeVisible()
    await expect(page.locator('.d-bpos')).toHaveText(`${yours.length + 2} of ${n}`)
    await listRow(page, yours[1].fp).click()
    await expect(cardTitle(page)).toHaveText(yours[1].title)
    await expect(page.locator('.d-bpos')).toHaveText(`2 of ${n}`)
    const last = must(yours.at(-1), 'last card')
    await listRow(page, last.fp).click()
    await page.keyboard.press('ArrowRight')
    await expect(page.locator('[data-statement="c1"]')).toBeVisible()
    await expect(page.locator('.d-bpos')).toHaveText(`${yours.length + 1} of ${n}`)
    await page.keyboard.press('ArrowLeft')
    await expect(cardTitle(page)).toHaveText(last.title)
    await page.keyboard.press('ArrowRight')
    await expect(page.locator('[data-statement="c1"]')).toBeVisible()
    // the divider is a label: clicking it changes nothing
    await list(page).locator('[data-list-divider]').click()
    await expect(page.locator('[data-statement="c1"]')).toBeVisible()
    await expect(page.locator('.d-bpos')).toHaveText(`${yours.length + 1} of ${n}`)
    // the parked row, from a statement: the card view, Parked open and on screen — one click
    await list(page).locator('[data-list-parked]').click()
    await expect(card(page)).toBeVisible()
    const parked = page.locator('.d-parked:not([data-agent-list])')
    await expect(parked.locator('.d-fold')).toHaveAttribute('aria-expanded', 'true')
    await expect(parked).toBeInViewport()
    expect(lines()).toHaveLength(1) // only the park line: moving writes nothing
  })

  test('AC3 (re-review): every founder card parked on an earlier run and a statement open — the parked row opens Parked, and Bring back returns the card', async ({ page }) => {
    await openDay(page)
    const yours = yoursOf(await runView(page))
    const earlier = (await (await page.request.get(`/api/day/runs/${EARLIER_ID}`)).json()) as { report: { pass_id: string; started_at: string } }
    const at = new Date(Date.parse(earlier.report.started_at) + 3_600_000).toISOString()
    writeLines(yours.map((i) => ({ kind: 'option', target: i.fp, option_id: 'park', run_id: earlier.report.pass_id, at })))
    // reopen() waits for a card, and every founder card is parked
    await page.goto('/')
    await page.locator('button').filter({ hasText: /^\W*Day$/u }).first().click()
    await expect(page.locator('[data-statement]')).toBeVisible()
    await expect(list(page).locator('[data-list-card]')).toHaveCount(0)
    await expect(list(page).locator('[data-list-parked]')).toHaveText(new RegExp(`${yours.length} parked`))
    await list(page).locator('[data-list-parked]').click()
    const parked = page.locator('.d-parked:not([data-agent-list])')
    await expect(parked.locator('.d-fold')).toHaveAttribute('aria-expanded', 'true')
    await expect(parked).toBeInViewport()
    const back = parked.locator(`[data-parked="${yours[0].fp}"]`).getByRole('button', { name: 'Bring back' })
    await expect(back).toBeVisible()
    expect(lines()).toHaveLength(yours.length) // opening Parked writes nothing
    await back.click()
    await expect(cardTitle(page)).toHaveText(yours[0].title)
    await expect(listRow(page, yours[0].fp)).toHaveCount(1)
    await expect(list(page).locator('[data-list-parked]')).toHaveText(new RegExp(`${yours.length - 1} parked`))
    expect(lines().at(-1)).toMatchObject({ kind: 'option', target: yours[0].fp, remove: true, run_id: LATEST_PASS })
  })

  test('AC4: one item in all — one card, or one statement and no cards — with nothing parked: no list, the item centred', async ({ page }) => {
    await page.setViewportSize({ width: 1400, height: 900 })
    let mode: 'card' | 'statement' = 'card'
    await patchRun(page, (b) => {
      if (b.view) {
        const founder = b.view.issues.filter((i) => !isAgent(i))
        b.view.issues = mode === 'card' ? founder.slice(0, 1) : []
        b.view.parked = []
      }
      const r = b.report?.reflection
      if (r) r.statements = mode === 'card' ? [] : r.statements.filter((x) => x.id === 'c2')
    })
    const centred = async (item: string) => {
      const pane = await rectOf(page.locator('.d-md.d-single'), 'pane')
      const it = await rectOf(page.locator(item), 'item')
      expect(Math.abs(it.x - pane.x - (pane.x + pane.width - it.x - it.width))).toBeLessThanOrEqual(2)
    }
    await openDay(page)
    await expect(card(page)).toBeVisible()
    await expect(list(page)).toHaveCount(0)
    await centred('.d-focus')
    mode = 'statement'
    await openDay(page)
    await expect(page.locator('[data-statement="c2"]')).toBeVisible()
    await expect(list(page)).toHaveCount(0)
    await centred('.d-cpcard')
    // P1468 review F1: the lone statement is reachable after Stats → Daily report (the tab is not the queue)
    await page.locator('.d-tabs').getByRole('tab', { name: 'Stats' }).click()
    await page.locator('.d-tabs').getByRole('tab', { name: 'Daily report' }).click()
    await expect(page.locator('[data-statement="c2"]')).toBeVisible()
    await expect(page.locator('.d-bpos')).toHaveText('1 of 1')
  })

  test('AC4 (review F1): no founder cards, only agent work, and one statement already answered — the statement opens, not "Nothing needs you"', async ({ page }) => {
    await patchRun(page, (b) => {
      if (b.view) {
        b.view.issues = b.view.issues.filter(isAgent)
        b.view.parked = []
      }
      const r = b.report?.reflection
      if (r) r.statements = r.statements.filter((x) => x.id === 'c2')
    })
    await openDay(page)
    writeLines([refl('c2', { position: 1 })])
    // reopen() waits for a card, and this run has none
    await page.goto('/')
    await page.locator('button').filter({ hasText: /^\W*Day$/u }).first().click()
    await expect(page.locator('[data-statement="c2"]')).toBeVisible()
    await expect(page.locator('.d-cpcard [data-position-control] [aria-pressed=true]')).toHaveCount(1) // it is the answered one
    await expect(list(page)).toHaveCount(0)
    await expect(page.locator('.d-bpos')).toHaveText('1 of 1')
    await expect(agentList(page)).toHaveCount(1) // the agent's work still sits under it
    await page.locator('.d-tabs').getByRole('tab', { name: 'Stats' }).click()
    await page.locator('.d-tabs').getByRole('tab', { name: 'Daily report' }).click()
    await expect(page.locator('[data-statement="c2"]')).toBeVisible()
  })

  // Codex re-review: the two cases above have no founder card, so the statement fallback would hide
  // a reset to the card half — here there are cards, so only the kept state can bring c3 back
  test('AC4 (review F1): founder cards and statements — a statement opened, Stats, then Daily report: the same statement is still open', async ({ page }) => {
    await openDay(page)
    expect(yoursOf(await runView(page)).length).toBeGreaterThan(0)
    await stmtRow(page, 'c3').click()
    await expect(page.locator('[data-statement="c3"]')).toBeVisible()
    await expect(page.locator('.d-bpos')).toHaveText(stmtPos(3))
    await page.locator('.d-tabs').getByRole('tab', { name: 'Stats' }).click()
    await expect(page.locator('[data-statement]')).toHaveCount(0)
    await page.locator('.d-tabs').getByRole('tab', { name: 'Daily report' }).click()
    await expect(page.locator('[data-statement="c3"]')).toBeVisible()
    await expect(page.locator('.d-bpos')).toHaveText(stmtPos(3))
    await expect(list(page).locator('[aria-current=true]')).toHaveAttribute('data-list-statement', 'c3')
    await expect(card(page)).toHaveCount(0)
  })

  test('AC5: no agent row above the point; with "Their story" open, the AGENT byline and the agent\'s stance are inside it', async ({ page }) => {
    await openDay(page)
    await stmtRow(page, 'c2').click()
    await expect(page.locator('.d-cpcard [data-agent-owner], .d-cpcard [data-testid=point-owner-row]')).toHaveCount(0)
    await page.locator('.d-cpcard [data-testid=point-story-expander]').click()
    const view = page.locator('.d-cpcard [data-agent-view]')
    await expect(view.getByTestId('agent-byline-name')).toHaveText('Slava')
    await expect(view.getByTestId('story-author-stance')).toHaveText('Disagrees−') // CP's PositionBadge for the agent's -1
    await expect(page.locator('.d-cpcard [data-position-control] [aria-pressed=true]')).toHaveCount(0) // never the founder's
  })

  test('AC6: no saved story and no draft: "+ Add a story" and no box; a click opens the box, focused, and the button goes', async ({ page }) => {
    await openDay(page)
    await stmtRow(page, 'c1').click()
    await expect(addStory(page)).toHaveText('+ Add a story')
    expect((await rectOf(addStory(page), '+ Add a story')).height, 'hit area (visual-qa: ≥ 40px)').toBeGreaterThanOrEqual(40)
    await expect(page.locator('.d-cpcard textarea')).toHaveCount(0)
    await addStory(page).click()
    await expect(box(page)).toBeFocused()
    await expect(addStory(page)).toHaveCount(0)
    expect(lines()).toHaveLength(0) // opening the box writes nothing
  })

  test('AC7: a saved story or a draft (even one emptied over a saved story) opens the box on arrival; a box opened and left untouched closes again after paging', async ({ page }) => {
    await openDay(page)
    writeLines([refl('c1', { story: 'Invented saved story.' })])
    await reopen(page)
    await stmtRow(page, 'c1').click()
    await expect(box(page)).toHaveValue('Invented saved story.')
    await expect(addStory(page)).toHaveCount(0)
    // emptied over the saved story: unsaved, so it is a draft and stays open
    await box(page).fill('')
    await stmtRow(page, 'c3').click()
    await stmtRow(page, 'c1').click()
    await expect(box(page)).toHaveValue('')
    await expect(addStory(page)).toHaveCount(0)
    // a draft on a statement with nothing saved
    await stmtRow(page, 'c3').click()
    await addStory(page).click()
    await box(page).fill('Invented draft.')
    await stmtRow(page, 'c4').click()
    await stmtRow(page, 'c3').click()
    await expect(box(page)).toHaveValue('Invented draft.')
    await expect(addStory(page)).toHaveCount(0)
    // opened, untouched, paged away and back: the button again
    await stmtRow(page, 'c4').click()
    await addStory(page).click()
    await expect(box(page)).toBeVisible()
    await stmtRow(page, 'c3').click()
    await stmtRow(page, 'c4').click()
    await expect(addStory(page)).toBeVisible()
    await expect(page.locator('.d-cpcard textarea')).toHaveCount(0)
    expect(lines()).toHaveLength(1) // none of it wrote
  })

  // P1468 review F9 (visual QA S7): the founder's box sat between "Their story" and the agent's story, so it read
  // as part of theirs — the agent's story now follows its toggle, then the founder's own box under a "Your story" label
  test('AC7b: point → position → footer row → agent story → "Your story" box → "Not saved" → chip; no agent: the row holds only "+ Add a story"; no ledger entry: no chip', async ({ page }) => {
    await openDay(page)
    await stmtRow(page, 'c1').click()
    const footer = page.locator('.d-cpcard [data-testid=point-card-footer]')
    await expect(footer.getByRole('button')).toHaveCount(1)
    await expect(footer.getByRole('button')).toHaveAccessibleName('Add a story for this point')
    await expect(page.locator('.d-cpcard [data-story-line]')).toHaveCount(0)
    // c2 (has an agent): a saved story makes the chip, an edit after it makes "Not saved"
    await stmtRow(page, 'c2').click()
    await addStory(page).click()
    await box(page).fill('Invented story.')
    await acceptBtn(page).click()
    await expect(page.locator('[data-statement="c3"]')).toBeVisible()
    await prevBtn(page).click()
    await expect(page.locator('.d-cpcard [data-story-line]')).toHaveText('Not sent')
    await box(page).fill('Invented story, edited.')
    await expect(page.locator('.d-cpcard [data-story-unsaved]')).toBeVisible()
    await page.locator('.d-cpcard [data-testid=point-story-expander]').click()
    const label = page.locator('.d-cpcard .d-founder label')
    await expect(label).toHaveText('Your story') // CP's visible label for a story input (create-story-page)
    expect(await label.getAttribute('for')).toBe(await box(page).getAttribute('id'))
    const parts = ['.d-pst', '[data-position-control]', '[data-testid=point-card-footer]', '[data-agent-view]', '.d-founder label', 'textarea', '[data-story-unsaved]', '[data-story-line]']
    const ys: number[] = []
    for (const sel of parts) ys.push((await rectOf(page.locator(`.d-cpcard ${sel}`).first(), sel)).y)
    expect(ys, parts.join(' → ')).toEqual([...ys].sort((a, b) => a - b))
  })

  test('AC8: an earlier (read-only) run: no button, no box; a saved story shows as text', async ({ page }) => {
    await openDay(page)
    writeLines([refl('c1', { story: 'Invented story on the earlier run.' }, EARLIER_PASS, '2026-10-03T09:00:00.000Z')])
    await reopen(page)
    await page.getByRole('button', { name: 'Previous run' }).click()
    await expect(page.locator('[data-run-date]')).toHaveText('Sat 3 Oct')
    await stmtRow(page, 'c1').click()
    await expect(page.locator('.d-cpcard .d-story-ro')).toHaveText('Invented story on the earlier run.')
    await expect(page.locator('.d-cpcard textarea')).toHaveCount(0)
    await expect(addStory(page)).toHaveCount(0)
    await stmtRow(page, 'c3').click()
    await expect(page.locator('[data-statement="c3"]')).toBeVisible()
    await expect(page.locator('.d-cpcard textarea')).toHaveCount(0)
    await expect(addStory(page)).toHaveCount(0)
  })

  test('AC9: the agent panel is on the page once, on a card and on a statement, with no bottom-bar link; its header counts the rows not sent', async ({ page }) => {
    await openDay(page)
    const agents = agentOf(await runView(page))
    expect(agents.length).toBeGreaterThan(1)
    for (const where of ['card', 'statement']) {
      if (where === 'statement') {
        await stmtRow(page, 'c1').click()
        await expect(page.locator('[data-statement="c1"]')).toBeVisible()
      }
      await expect(page.locator('[data-agent-link]'), where).toHaveCount(0)
      await expect(agentList(page), where).toHaveCount(1)
    }
    await openAgentList(page)
    await expect(agentList(page).locator('[data-agent-state="not-sent"]')).toHaveCount(agents.length)
    await expect(fold(page)).toHaveText(`▶Start fixing also sends these · ${agents.length} not sent`)
    writeFileSync(DECISIONS, fileText() + receipt('launch-all', agents.map(agentKey)))
    await reopen(page)
    await openAgentList(page)
    await expect(agentList(page).locator('[data-agent-state="not-sent"]')).toHaveCount(0)
    await expect(agentList(page).locator('[data-agent-item]')).toHaveCount(agents.length)
    await expect(fold(page)).toHaveText(`▶Sent to the fixing agent · ${agents.length}`)
  })

  test('AC9b: after a first send, with a founder answers queued and n agent rows not sent, the button reads "Send {a+n} changes" and the panel "{n} not sent"', async ({ page }) => {
    await openDay(page)
    const agents = agentOf(await runView(page))
    const sent = agents.slice(1)
    const n = agents.length - sent.length
    writeFileSync(DECISIONS, receipt('launch-1', sent.map(agentKey)))
    await reopen(page)
    // a = 2: two founder cards answered (Accept writes at once)
    await acceptBtn(page).click()
    await expect.poll(() => lines().filter((l) => l.kind === 'option').length).toBe(1)
    await acceptBtn(page).click()
    await expect.poll(() => lines().filter((l) => l.kind === 'option').length).toBe(2)
    await expect(page.getByRole('button', { name: `Send ${2 + n} change${2 + n === 1 ? '' : 's'}` })).toBeVisible()
    await openAgentList(page)
    await expect(agentList(page).locator('[data-agent-state="not-sent"]')).toHaveCount(n)
    // P1468 review F4: after the first send the button reads "Send N changes" — the header no longer names "Start fixing"
    await expect(startBtn(page)).toHaveCount(0)
    await expect(fold(page)).toHaveText(`▶Sent with your answers · ${n} not sent yet`)
  })

  test('AC9 (review F4): an earlier, read-only run has no Start fixing — the header is neutral', async ({ page }) => {
    await openDay(page)
    const k = agentOf(await runView(page, EARLIER_ID)).length
    expect(k).toBeGreaterThan(0)
    await page.getByRole('button', { name: 'Previous run' }).click()
    await expect(page.locator('[data-run-date]')).toHaveText('Sat 3 Oct')
    await expect(page.locator('[data-bottom-bar] .d-ro')).toHaveText('Read only')
    await expect(startBtn(page)).toHaveCount(0)
    await expect(fold(page)).toHaveText(`▶The fixing agent’s work · ${k}`)
  })

  test('AC10: a Status "Open card ›" on an agent card opens the panel and focuses that row — from a statement too', async ({ page }) => {
    await openDay(page)
    await stmtRow(page, 'c1').click()
    await expect(page.locator('[data-statement="c1"]')).toBeVisible()
    await openStatus(page)
    await page.locator('.d-status [data-check="bk-c"] [data-open-card]').click()
    await expect(agentList(page).locator('.d-focusrow')).toContainText('Backup · repo C')
    await expect(agentList(page).locator('.d-focusrow')).toBeInViewport()
    // P1468 review F5: an agent row is not a card — the statement stays open under the panel
    await expect(page.locator('[data-statement="c1"]')).toBeVisible()
    await expect(page.locator('.d-bpos')).toHaveText(stmtPos(1))
  })

  test('AC11: Stats shows no "From this run", no daily note and no chat tile, on a run that still carries every one of them', async ({ page }) => {
    await patchRun(page, (b) => {
      b.report?.notes?.push(
        { id: 'whats-next', title: 'What’s next', body: 'PIPELINE 2 conversations' },
        { id: 'branches', title: 'Branches and specs', body: 'none' },
        { id: 'cloud-spend', title: 'Cloud spend estimate', body: 'about €1 a day' },
      )
    })
    await openDay(page)
    await page.locator('.d-tabs').getByRole('tab', { name: 'Stats' }).click()
    await expect(page.locator('[data-funnel]')).toBeVisible()
    const ids = await page.request.get(`/api/day/runs/${LATEST_ID}`).then(async (r) => ((await r.json()) as { report: DayReport }).report)
    expect(ids.notes?.map((x) => x.id)).toEqual(expect.arrayContaining(['shipped', 'chat-digest'])) // the run really carries them
    await expect(page.getByText('From this run')).toHaveCount(0)
    for (const id of ['shipped', 'whats-next', 'branches', 'cloud-spend', 'chat-digest']) await expect(page.locator(`[data-note="${id}"]`), id).toHaveCount(0)
    await expect(page.locator('[data-reading="mentions"], [data-reading="help_requests"]')).toHaveCount(0)
    // known-good controls: the other tile and the review note still show
    await expect(page.locator('[data-reading="unconfirmed"]')).toBeVisible()
    await expect(page.locator('[data-note="week-measures"]')).toHaveCount(1)
  })

  test('AC12: Goals — headed "Goal and next steps" with a goal, "Next steps" without; at most 3 rows in goals.md order, no step label; absent says "not collected yet"; empty says "No open next steps found in docs/goals.md"; review notes fold under "Review notes"', async ({ page }) => {
    let mode: 'as-is' | 'absent' | 'empty' | 'empty-no-goal' = 'as-is'
    await patchRun(page, (b) => {
      if (!b.report) return
      if (mode === 'absent') {
        delete b.report.goals
        delete b.report.goal
      }
      if (mode === 'empty' || mode === 'empty-no-goal') b.report.goals = []
      if (mode === 'empty-no-goal') delete b.report.goal
    })
    const stats = () => page.locator('.d-tabs').getByRole('tab', { name: 'Stats' }).click()
    const goals = page.locator('[data-goals]')
    await openDay(page)
    await stats()
    await expect(goals.locator('.d-h3')).toHaveText('Goal and next steps') // review G1: the fixture run has a goal
    await expect(goals).toHaveAttribute('aria-label', 'Goal and next steps')
    await expect(goals.locator('[data-goal]')).toHaveText(['One free practice evening for people who sell', 'A use case on the landing page, in attendees’ words', 'The same format online, once.'])
    await expect(goals.locator('[data-goal]').first()).toHaveAttribute('data-goal', '3a')
    await expect(goals).not.toContainText('3a')
    const review = page.locator('[data-review-notes]')
    await expect(review.locator('.d-h3')).toHaveText('Review notes')
    const note = review.locator('[data-note="week-measures"]')
    await expect(note.getByRole('button')).toHaveAttribute('aria-expanded', 'false')
    await note.getByRole('button').click()
    await expect(note.locator('.d-notebody')).toHaveText('Reach-outs: 6 (target 10)\nChampion talks: 2')
    // order: the readings, then Goals, then Review notes
    const ys = [await rectOf(page.locator('[data-reading]').last(), 'last reading'), await rectOf(goals, 'goals'), await rectOf(review, 'review notes')].map((r) => r.y)
    expect(ys).toEqual([...ys].sort((a, b) => a - b))
    mode = 'absent'
    await openDay(page)
    await stats()
    await expect(goals.locator('.d-h3')).toHaveText('Next steps') // no goal on the run
    await expect(goals).toHaveAttribute('aria-label', 'Next steps')
    await expect(goals).toContainText('not collected yet')
    await expect(goals.locator('[data-goal]')).toHaveCount(0)
    mode = 'empty'
    await openDay(page)
    await stats()
    // review G2: both empty branches (under a goal line, and the bare card) say "next steps"
    await expect(goals.locator('.d-h3')).toHaveText('Goal and next steps')
    await expect(goals).toContainText('No open next steps found in docs/goals.md')
    await expect(goals).not.toContainText('No open goals found')
    await expect(goals.locator('[data-goal]')).toHaveCount(0)
    mode = 'empty-no-goal'
    await openDay(page)
    await stats()
    await expect(goals.locator('.d-h3')).toHaveText('Next steps')
    await expect(goals.locator('[data-goal-line]')).toHaveCount(0)
    await expect(goals).toContainText('No open next steps found in docs/goals.md')
    await expect(goals).not.toContainText('No open goals found')
    await expect(goals.locator('[data-goal]')).toHaveCount(0)
  })

  // P1468 Decided 7: the goal above the next steps
  test('AC12 (Decided 7): Goals shows the goal as its first line, then the 3 next steps; a run with no goal renders the same card as before, headed "Next steps"', async ({ page }) => {
    let mode: 'as-is' | 'old' = 'as-is'
    await patchRun(page, (b) => {
      if (b.report && mode === 'old') delete b.report.goal
    })
    const stats = () => page.locator('.d-tabs').getByRole('tab', { name: 'Stats' }).click()
    const goals = page.locator('[data-goals]')
    const steps = ['One free practice evening for people who sell', 'A use case on the landing page, in attendees’ words', 'The same format online, once.']
    const firstInCard = () => goals.evaluate((el) => el.querySelector('.d-card')?.firstElementChild?.outerHTML.slice(0, 80) ?? '')
    await openDay(page)
    await stats()
    const line = goals.locator('[data-goal-line]')
    await expect(line).toHaveText('Five paid pilots by year end')
    await expect(line).toHaveClass(/\bd-ct\b/) // the existing card-lead style, no new element
    expect(await firstInCard()).toContain('data-goal-line')
    await expect(goals.locator('[data-goal]')).toHaveText(steps) // the goal is not one of the 3
    const lineY = (await rectOf(line, 'goal line')).y
    const stepY = (await rectOf(goals.locator('[data-goal]').first(), 'first step')).y
    expect(lineY).toBeLessThan(stepY)
    await expect(goals).toHaveText(['Goal and next steps', 'Five paid pilots by year end', ...steps].join(''))
    mode = 'old'
    await openDay(page)
    await stats()
    await expect(goals.locator('[data-goal-line]')).toHaveCount(0)
    await expect(goals.locator('[data-goal]')).toHaveText(steps)
    expect(await firstInCard()).toContain('data-goal="3a"')
    await expect(goals.locator('.d-card > *')).toHaveCount(3) // only the 3 step rows, nothing added
    await expect(goals).toHaveText(['Next steps', ...steps].join(''))
  })

  for (const width of [375, 320]) {
    test(`AC15 ${width}px: the folded list says "{u} still need you · {N} items", the same on a card and on a statement; no horizontal scroll`, async ({ page }) => {
      await page.setViewportSize({ width, height: 760 })
      await openDay(page)
      await collapseSidebar(page)
      expect(await page.evaluate(() => window.innerWidth)).toBe(width)
      const yours = yoursOf(await runView(page))
      const want = `▶${yours.length + STMTS} still need you` // review F12: u = N, so it is said once
      const tog = list(page).locator('.d-cltog')
      await expect(tog).toHaveText(want)
      await tog.click()
      await stmtRow(page, 'c1').click()
      await expect(page.locator('[data-statement="c1"]')).toBeVisible()
      await expect(tog).toHaveText(want)
      await expect(stmtRow(page, 'c1')).toBeHidden() // a pick folds it again
      const over = await page.evaluate(() => {
        const r = document.querySelector('.day-root')
        return r ? r.scrollWidth - r.clientWidth : -1
      })
      expect(over).toBeLessThanOrEqual(0)
    })
  }
})
