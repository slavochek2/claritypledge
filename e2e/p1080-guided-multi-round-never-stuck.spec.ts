/**
 * @file p1080-guided-multi-round-never-stuck.spec.ts
 * @description P1080 evaluator — the "never stuck" invariant for the guided /live loop.
 *
 * # What this is
 * This is the EVALUATOR, written before any fix. It mechanizes the requirement
 * P525 stated in prose on 2026-03-16 and never turned into a test:
 *
 *   "No user should ever be stuck in a state with no actionable next step in /live."
 *
 * # The invariant
 * /live is turn-based, so it is legitimate for ONE participant to be waiting while
 * the other acts. The failure is when BOTH are waiting on each other. So the
 * pairwise invariant is:
 *
 *   At every settled point in a session, at least ONE of the two participants has
 *   an enabled control that advances the round.
 *
 * "Advances the round" excludes the escape hatches ("Speak freely", "Skip without
 * waiting", "Cancel request") — those abandon the structured round rather than
 * continue it. A screen whose only control is "Speak freely" is stuck, which is
 * P525's own description of the symptom.
 *
 * # Why it drives the UI instead of injecting state
 * Every prior deep test of this flow (p674, p671, p525, p617) advances phases with
 * `advanceSessionState` DB writes. A DB jump lands the app in a valid phase by
 * construction, so a bug living in the TRANSITION is unreachable by those tests.
 * This spec therefore uses real clicks only — no `advanceSessionState`.
 *
 * # Coverage this closes
 * `clarificationPhase` had zero occurrences in e2e/ before this file, and no test
 * drove `explainBackRound` past 1. The clarify sub-loop (speaker-deciding →
 * speaker-clarifying → listener-responding) is the round-2+ machine and was
 * entirely unexercised.
 */

import { test, expect, type Page } from '@playwright/test';
import { createTwoPartySession, type TwoPartySession } from './helpers/test-session';
import { waitForDBStateKey } from './helpers/test-realtime';
import { supabaseAdmin } from './helpers/supabase-admin';

/** How many consecutive clarify rounds to drive. Prod data shows real sessions reach 5. */
const ROUNDS = 4;

/**
 * Controls that do NOT count as "advancing the round" — they abandon the
 * structured round or back out of a negotiation.
 */
const ESCAPE_LABELS = [
  'speak freely',
  'skip without waiting',
  'cancel request',
  'skip',
];

function isEscape(label: string): boolean {
  return ESCAPE_LABELS.includes(label.trim().toLowerCase());
}

/**
 * The three containers the /live flow uses to present actions. Scoping to these
 * (rather than to every button on the page) means page chrome — the header exit,
 * the Open/Guided mode pill, story-card position taps — cannot mask a stuck state
 * by counting as a "forward control".
 *
 * All three are needed, and finding that out cost one false red:
 *   1. action-area  — the sticky container used by every clarify-loop state
 *                     (live-mode-view.tsx:3636+), and by idle once a story is picked
 *   2. start-check  — the idle "Speak" button, which on a clean idle screen is NOT
 *                     inside an ActionArea (live-mode-view.tsx:1367) but in a plain
 *                     two-zone layout div
 *   3. dialog/drawer — the sealed-bid rating drawer, where the only forward control
 *                     ("Submit") lives outside the action area entirely
 */
const ACTION_SURFACES = [
  '[data-testid="action-area"] button',
  '[data-testid="start-check"]',
  '[role="dialog"] button',
].join(', ');

/** Enabled, visible controls that advance the round. */
async function forwardControls(page: Page): Promise<string[]> {
  const buttons = page.locator(ACTION_SURFACES);
  const count = await buttons.count();
  const labels: string[] = [];
  for (let i = 0; i < count; i++) {
    const btn = buttons.nth(i);
    if (!(await btn.isVisible())) continue;
    if (!(await btn.isEnabled())) continue;
    const text = ((await btn.textContent()) ?? '').trim();
    if (text && !isEscape(text)) labels.push(text);
  }
  return labels;
}

/** Full diagnostic dump — makes a red run actionable instead of just red. */
async function dumpDeadlock(
  speaker: Page,
  listener: Page,
  code: string,
  context: string,
): Promise<string> {
  const readArea = async (p: Page) => {
    const parts: string[] = [];
    for (const sel of ['[data-testid="action-area"]', '[role="dialog"]', '[data-testid="start-check"]']) {
      const el = p.locator(sel);
      if ((await el.count()) === 0) continue;
      if (!(await el.first().isVisible())) continue;
      parts.push(`${sel} → ${((await el.first().innerText()) ?? '').replace(/\n+/g, ' / ').trim()}`);
    }
    return parts.length ? parts.join('  ||  ') : '(no action surface rendered)';
  };
  const { data } = await supabaseAdmin
    .from('clarity_sessions')
    .select('live_state')
    .eq('code', code)
    .single();
  const ls = (data?.live_state ?? {}) as Record<string, unknown>;
  return [
    `DEADLOCK at: ${context}`,
    `  speaker action-area : ${await readArea(speaker)}`,
    `  listener action-area: ${await readArea(listener)}`,
    `  ratingPhase         : ${String(ls.ratingPhase)}`,
    `  clarificationPhase  : ${String(ls.clarificationPhase)}`,
    `  explainBackRound    : ${String(ls.explainBackRound)}`,
    `  explainBackRatings  : ${JSON.stringify(ls.explainBackRatings)}`,
    `  explainBackDone     : ${String(ls.explainBackDone)}`,
    `  checkerSubmitted    : ${String(ls.checkerSubmitted)}`,
    `  responderSubmitted  : ${String(ls.responderSubmitted)}`,
    `  sessionMode         : ${String(ls.sessionMode)}`,
  ].join('\n');
}

/**
 * THE INVARIANT.
 *
 * Polls until at least one participant has a forward control. Polling (rather
 * than an instant read) is deliberate: mid-transition both sides can briefly
 * show a waiting indicator, and that is not a deadlock. A deadlock is that state
 * PERSISTING. If the whole window elapses with neither side able to act, the
 * session cannot progress by any means except abandoning the round.
 */
async function assertPairCanProgress(
  speaker: Page,
  listener: Page,
  code: string,
  context: string,
  timeoutMs = 15000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let speakerFwd: string[] = [];
  let listenerFwd: string[] = [];

  while (Date.now() < deadline) {
    speakerFwd = await forwardControls(speaker);
    listenerFwd = await forwardControls(listener);
    if (speakerFwd.length > 0 || listenerFwd.length > 0) return;
    await speaker.waitForTimeout(500);
  }

  const dump = await dumpDeadlock(speaker, listener, code, context);
  throw new Error(
    `P1080 never-stuck invariant VIOLATED — neither participant has a forward ` +
      `control after ${timeoutMs}ms.\n${dump}\n` +
      `  (escape-only controls are not forward controls: ${ESCAPE_LABELS.join(', ')})`,
  );
}

/**
 * Click that survives the entrance animation. The animated container applies
 * pointer-events: none while running, so a click during it lands on the element
 * below. Playwright actionability does not catch this; the settle delay does.
 * (Documented incident, carried over from the p562 helper.)
 */
async function settledClick(page: Page, name: RegExp): Promise<void> {
  const btn = page.getByRole('button', { name });
  await expect(btn).toBeVisible({ timeout: 15000 });
  await page.waitForTimeout(500);
  await btn.click();
}

/** Pick a rating in the sealed-bid drawer and submit it. */
async function submitRating(page: Page, value: number): Promise<void> {
  await expect(page.getByRole('button', { name: /Submit/i })).toBeVisible({ timeout: 20000 });
  await page.locator('button').filter({ hasText: new RegExp(`^${value}$`) }).click();
  await page.getByRole('button', { name: /Submit/i }).click();
}

test.describe('P1080: guided /live never strands both participants', () => {
  test.describe.configure({ timeout: 300000 });

  let session: TwoPartySession;

  test.afterEach(async () => {
    if (session) await session.cleanup();
  });

  test(`guided mode survives ${ROUNDS} consecutive clarify rounds with no deadlock`, async ({
    browser,
  }) => {
    session = await createTwoPartySession(browser, { hostName: 'Alice', guestName: 'Bob' });
    const speaker = session.host.page;
    const listener = session.guest.page;
    const code = session.sessionCode;

    // --- Switch to guided mode (open/free is the default) ---
    await expect(speaker.getByText('Guided mode')).toBeVisible({ timeout: 15000 });
    await speaker.getByText('Guided mode').click();
    await waitForDBStateKey(
      'clarity_sessions', 'live_state', 'sessionMode', 'guided', 'code', code, 15000,
    );
    await assertPairCanProgress(speaker, listener, code, 'after switching to guided mode');

    // --- Round 1: open a check and reveal a gap ---
    await speaker.getByTestId('start-check').click();
    await submitRating(speaker, 8);
    await submitRating(listener, 5);
    await assertPairCanProgress(speaker, listener, code, 'round 1 — after sealed bids revealed');

    // --- Drive N consecutive clarify rounds through the UI only ---
    for (let round = 1; round <= ROUNDS; round++) {
      const at = (step: string) => `round ${round} — ${step}`;

      // Listener paraphrases
      await assertPairCanProgress(speaker, listener, code, at('before explain-back'));
      await settledClick(listener, /Explain back what I heard/i);
      await waitForDBStateKey(
        'clarity_sessions', 'live_state', 'ratingPhase', 'explain-back', 'code', code, 15000,
      );
      await assertPairCanProgress(speaker, listener, code, at('during explain-back'));

      await settledClick(listener, /I'm done with active listening/i);
      await waitForDBStateKey(
        'clarity_sessions', 'live_state', 'explainBackDone', true, 'code', code, 15000,
      );
      await assertPairCanProgress(speaker, listener, code, at('after explain-back done'));

      // Speaker re-rates below 10 → clarificationPhase becomes 'speaker-deciding'
      await submitRating(speaker, 9);
      await waitForDBStateKey(
        'clarity_sessions', 'live_state', 'clarificationPhase', 'speaker-deciding',
        'code', code, 15000,
      );

      // THE SUSPECT STATE. Both sides render a WaitingIndicator here if the
      // speaker's "Share what's missing" button is gated off.
      await assertPairCanProgress(speaker, listener, code, at('speaker-deciding'));

      // Speaker clarifies, closing the loop back to the listener
      await settledClick(speaker, /Share what's missing/i);
      await waitForDBStateKey(
        'clarity_sessions', 'live_state', 'clarificationPhase', 'speaker-clarifying',
        'code', code, 15000,
      );
      await assertPairCanProgress(speaker, listener, code, at('speaker-clarifying'));

      await settledClick(speaker, /I'm done clarifying/i);
      await waitForDBStateKey(
        'clarity_sessions', 'live_state', 'clarificationPhase', 'listener-responding',
        'code', code, 15000,
      );
      await assertPairCanProgress(speaker, listener, code, at('listener-responding'));
    }

    // --- The loop actually ran: the counter proves rounds were recorded ---
    const { data } = await supabaseAdmin
      .from('clarity_sessions')
      .select('live_state')
      .eq('code', code)
      .single();
    const ratings = (data?.live_state as Record<string, unknown>)?.explainBackRatings;
    expect(Array.isArray(ratings) ? ratings.length : 0).toBeGreaterThanOrEqual(ROUNDS);
  });
});
