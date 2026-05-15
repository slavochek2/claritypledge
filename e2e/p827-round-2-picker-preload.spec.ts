/**
 * P827 — Round-2 picker preload on joiner side.
 *
 * Hypothesis from the 16:11 manual test: the creator's `handleSelectStory` writes
 * a full preload state to live_state, but the JOINER's UI stays on the rating-capture
 * drawer instead of advancing to explain-back. The creator side reaches explain-back
 * correctly (their local React state advances directly), but the joiner only receives
 * the state via realtime — and something on that path drops or stale-merges the patch.
 *
 * This test bypasses the picker UI entirely. It writes the full preload state directly
 * via `advanceSessionState` (which writes live_state to the DB → realtime delivers to
 * both browsers). If realtime delivery works correctly, both pages should land at the
 * explain-back "understanding" view. If the joiner stays at the rating drawer, the bug
 * is in the realtime/merge path, not in `handleSelectStory`.
 *
 * Scenarios:
 *   - T1: single-round preload. Write full preload state once → both reach explain-back.
 *   - T2: round-2 regression. Round 1 preload → clear → round 2 preload → both reach
 *         explain-back again. This is the actual P827 bug; T1 is the canary.
 */

import { test, expect, type Browser } from '@playwright/test';
import {
  createTwoPartySession,
  type TwoPartySession,
} from './helpers/test-session';
import { advanceSessionState, waitForUIUpdate } from './helpers/test-realtime';
import { createTestStory, deleteTestStory, type TestStory } from './helpers/test-story';
import { supabaseAdmin } from './helpers/supabase-admin';

const PRELOAD_TIMEOUT = 15000;

function buildPreloadState(opts: {
  storyId: string;
  storyTitle: string;
  storyContent: string;
  storyAuthorId: string;
  storyAuthorName: string;
  checkerName: string;
  checkerIsCreator: boolean;
  speakerRating: number;
  listenerRating: number;
  ratingInitiatedBy: string;
  ratingInitiatedByIsCreator: boolean;
}): Record<string, unknown> {
  return {
    currentRound: 1,
    roleSelections: {},
    sliderRatings: {},
    listenActivelyRatings: {},
    checksCount: 0,
    checksTotal: 0,
    ideasDiscussed: 0,
    ideasUnderstood: 0,
    talkTime: {},
    explainBackRound: 0,
    explainBackRatings: [],
    explainBackDone: false,
    sessionHistory: [],
    ratingPhase: 'explain-back',
    checkerName: opts.checkerName,
    checkerIsCreator: opts.checkerIsCreator,
    checkerRating: opts.checkerIsCreator ? opts.speakerRating : opts.listenerRating,
    responderRating: opts.checkerIsCreator ? opts.listenerRating : opts.speakerRating,
    checkerSubmitted: true,
    responderSubmitted: true,
    selectedStoryId: opts.storyId,
    selectedContentTitle: opts.storyTitle,
    selectedStoryData: {
      id: opts.storyId,
      content: opts.storyContent,
      authorId: opts.storyAuthorId,
      authorName: opts.storyAuthorName,
      authorSlug: opts.storyAuthorName.toLowerCase().replace(/\s+/g, '-'),
      authorAvatarColor: null,
      authorAvatarUrl: null,
      authorRole: null,
      authorEarsCount: 0,
      authorHasPledged: false,
      visibility: 'public',
      points: [],
    },
    ratingInitiatedBy: opts.ratingInitiatedBy,
    ratingInitiatedByIsCreator: opts.ratingInitiatedByIsCreator,
    livePositionsCreator: {},
    livePositionsJoiner: {},
  };
}

function buildClearState(): Record<string, unknown> {
  return {
    selectedStoryId: null,
    selectedPointId: null,
    selectedContentTitle: null,
    selectedStoryData: null,
    ratingPhase: 'idle',
    checkerName: '',
    checkerRating: null,
    responderRating: null,
    checkerSubmitted: false,
    responderSubmitted: false,
    ratingInitiatedBy: '',
    ratingInitiatedByIsCreator: false,
  };
}

test.describe('P827 — round-2 picker preload via realtime', () => {
  test.setTimeout(120000);

  let session: TwoPartySession | undefined;
  let story1: TestStory | undefined;
  let story2: TestStory | undefined;

  test.afterEach(async () => {
    if (story1) await deleteTestStory(story1.id).catch(() => {});
    if (story2) await deleteTestStory(story2.id).catch(() => {});
    if (session) await session.cleanup();
  });

  test('T1 canary: writing full preload state to live_state delivers explain-back to BOTH pages', async ({
    browser,
  }: { browser: Browser }) => {
    session = await createTwoPartySession(browser, {
      hostName: 'P827 Host',
      guestName: 'P827 Guest',
    });

    story1 = await createTestStory(session.host.user.user.id, {
      title: 'P827 Story 1',
      content: 'Story 1 content for P827 round-1 canary',
    });

    // Wait for both pages to be on the live view (joiner detected by host)
    await Promise.all([
      session.host.page.waitForLoadState('networkidle'),
      session.guest.page.waitForLoadState('networkidle'),
    ]);

    const preload = buildPreloadState({
      storyId: story1.id,
      storyTitle: story1.title,
      storyContent: story1.content,
      storyAuthorId: session.host.user.user.id,
      storyAuthorName: 'P827 Host',
      checkerName: 'P827 Host',
      checkerIsCreator: true,
      speakerRating: 7,
      listenerRating: 5,
      ratingInitiatedBy: 'P827 Host',
      ratingInitiatedByIsCreator: true,
    });

    await advanceSessionState(session.sessionCode, preload);

    // Both pages: the rating-capture drawer ("How well do you believe…") must NOT be visible.
    // Both must reach the "understanding" view (post-submission, explain-back phase).
    const hostRatingDrawer = session.host.page.getByText(/How well do you believe|How confident are you/i);
    const guestRatingDrawer = session.guest.page.getByText(/How well do you believe|How confident are you/i);

    await expect(hostRatingDrawer, 'Host: rating drawer should NOT be visible after preload').toHaveCount(0, { timeout: PRELOAD_TIMEOUT });
    await expect(guestRatingDrawer, 'Guest: rating drawer should NOT be visible after preload').toHaveCount(0, { timeout: PRELOAD_TIMEOUT });

    // Both pages should show some explain-back marker (story content visible, journey header, etc.)
    await waitForUIUpdate(session.host.page, session.host.page.getByText(story1.content).first(), PRELOAD_TIMEOUT);
    await waitForUIUpdate(session.guest.page, session.guest.page.getByText(story1.content).first(), PRELOAD_TIMEOUT);
  });

  test('T2: round-1 → clear → round-2 preload — both pages reach explain-back twice (P827 regression)', async ({
    browser,
  }: { browser: Browser }) => {
    session = await createTwoPartySession(browser, {
      hostName: 'P827 Host',
      guestName: 'P827 Guest',
    });

    story1 = await createTestStory(session.host.user.user.id, {
      title: 'P827 Story 1',
      content: 'Story 1 content for P827 round-1',
    });
    story2 = await createTestStory(session.host.user.user.id, {
      title: 'P827 Story 2',
      content: 'Story 2 content for P827 round-2',
    });

    await Promise.all([
      session.host.page.waitForLoadState('networkidle'),
      session.guest.page.waitForLoadState('networkidle'),
    ]);

    const round1 = buildPreloadState({
      storyId: story1.id,
      storyTitle: story1.title,
      storyContent: story1.content,
      storyAuthorId: session.host.user.user.id,
      storyAuthorName: 'P827 Host',
      checkerName: 'P827 Host',
      checkerIsCreator: true,
      speakerRating: 7,
      listenerRating: 5,
      ratingInitiatedBy: 'P827 Host',
      ratingInitiatedByIsCreator: true,
    });

    // ── ROUND 1 ───────────────────────────────────────────────────────────────
    await advanceSessionState(session.sessionCode, round1);

    await waitForUIUpdate(session.host.page, session.host.page.getByText(story1.content).first(), PRELOAD_TIMEOUT);
    await waitForUIUpdate(session.guest.page, session.guest.page.getByText(story1.content).first(), PRELOAD_TIMEOUT);

    // ── CLEAR ─────────────────────────────────────────────────────────────────
    // advanceSessionState merges with current state; use a direct DB write to truly clear
    // (matches what handleClearStory writes after the P827 fix).
    await supabaseAdmin
      .from('clarity_sessions')
      .update({ live_state: { ...round1, ...buildClearState() } })
      .eq('code', session.sessionCode);

    // Story 1 content should disappear from both pages
    await expect(session.host.page.getByText(story1.content).first()).toBeHidden({ timeout: PRELOAD_TIMEOUT });
    await expect(session.guest.page.getByText(story1.content).first()).toBeHidden({ timeout: PRELOAD_TIMEOUT });

    // ── ROUND 2 (the actual P827 regression) ──────────────────────────────────
    const round2 = buildPreloadState({
      storyId: story2.id,
      storyTitle: story2.title,
      storyContent: story2.content,
      storyAuthorId: session.host.user.user.id,
      storyAuthorName: 'P827 Host',
      checkerName: 'P827 Host',
      checkerIsCreator: true,
      speakerRating: 8,
      listenerRating: 6,
      ratingInitiatedBy: 'P827 Host',
      ratingInitiatedByIsCreator: true,
    });
    await advanceSessionState(session.sessionCode, round2);

    // BOTH pages must reach explain-back for story 2 (this is the previously-broken path)
    const hostRatingDrawerR2 = session.host.page.getByText(/How well do you believe|How confident are you/i);
    const guestRatingDrawerR2 = session.guest.page.getByText(/How well do you believe|How confident are you/i);

    await expect(hostRatingDrawerR2, 'Round 2 — Host: rating drawer should NOT be visible').toHaveCount(0, { timeout: PRELOAD_TIMEOUT });
    await expect(guestRatingDrawerR2, 'Round 2 — Guest: rating drawer should NOT be visible (P827 bug)').toHaveCount(0, { timeout: PRELOAD_TIMEOUT });

    await waitForUIUpdate(session.host.page, session.host.page.getByText(story2.content).first(), PRELOAD_TIMEOUT);
    await waitForUIUpdate(session.guest.page, session.guest.page.getByText(story2.content).first(), PRELOAD_TIMEOUT);
  });
});
