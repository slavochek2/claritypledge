/**
 * @file p766-reproduce.spec.ts
 * Canary for P766: receiver's story card hidden even AFTER speaker submits rating.
 *
 * Root cause: live-mode-view.tsx:1236 — the gate
 *   isListenerDuringLocalRating = ratingInitiatedByIsCreator !== undefined
 *                              && ratingInitiatedByIsCreator !== isCreator
 * stays TRUE through the entire rating phase, but P617's design intent is
 * "hide story card until round starts (speaker submits)". After speaker submits,
 * the gate should release — but `ratingInitiatedByIsCreator` is still set, so
 * the listener sees the slider ("How confident are you that you understand X?")
 * with no story card to reference.
 *
 * Flow reproduced (post-submit first-round state):
 *  1. Creator selects a story — atomic write sets selectedStoryData +
 *     ratingInitiatedBy + ratingInitiatedByIsCreator=true + checkerName.
 *  2. Creator submits their rating — sets ratingPhase='waiting',
 *     checkerSubmitted=true, checkerRating.
 *  3. Guest enters branch 5a (`ratingPhase='waiting' && !myRatingSubmitted &&
 *     partnerRatingSubmitted`) → 'responder-drawer' view → slider appears.
 *  4. On guest, isListenerDuringLocalRating is STILL true → story card hidden.
 *
 * Pre-fix: guest drawer slider visible, story card NOT visible → FAIL.
 * Post-fix: both slider and story card visible together → PASS.
 */

import { test, expect } from '@playwright/test';
import { createTwoPartySession } from './helpers/test-session';
import { advanceSessionState } from './helpers/test-realtime';
import { createTestStory, deleteTestStory } from './helpers/test-story';

test.describe('P766: receiver sees story card after speaker submits rating', () => {
  test('first round post-submit — story card visible alongside slider on receiver', async ({ browser }) => {
    const hostName = 'P766 Speaker';
    const guestName = 'P766 Listener';

    const session = await createTwoPartySession(browser, { hostName, guestName });
    let storyId: string | undefined;

    // Surface console errors from the guest page to help diagnose setup failures.
    session.guest.page.on('pageerror', (err) => console.log('[guest pageerror]', err.message));
    session.guest.page.on('console', (msg) => {
      if (msg.type() === 'error' || msg.type() === 'warning') {
        console.log(`[guest console.${msg.type()}]`, msg.text());
      }
    });

    try {
      // Wait for both pages' session UI to settle before mutating state.
      // (Matches p666-two-party-infra-proof.spec.ts — writing live_state
      // before the page has fully loaded puts the guest into an error boundary.)
      await expect(
        session.host.page.locator(`text=/${session.sessionCode}|Speak|Waiting|End Session/i`).first()
      ).toBeVisible({ timeout: 10_000 });
      await expect(
        session.guest.page.locator(`text=/${session.sessionCode}|Speak|Waiting|End Session/i`).first()
      ).toBeVisible({ timeout: 10_000 });

      // Sanity check: no error boundary on guest after settling.
      await expect(session.guest.page.getByText('Something went wrong')).not.toBeVisible({ timeout: 2000 });
      console.log('[test] both pages settled, advancing state…');

      // Create a story authored by the host (speaker). In real flow, handleSelectStory
      // atomically writes selectedStoryId + selectedStoryData + ratingInitiatedBy fields.
      // We bypass the UI by writing the post-selection + post-submit state directly.
      const story = await createTestStory(session.host.user.user.id, {
        title: 'P766 first-round story',
        content: 'The body of the first-round story that the listener must be able to see while rating.',
        visibility: 'public',
      });
      storyId = story.id;

      // Simulate: speaker selected the story AND submitted their rating.
      // This is the exact moment the screenshot in the bug report captures.
      await advanceSessionState(session.sessionCode, {
        // Story selection (atomic write from handleSelectStory)
        selectedStoryId: story.id,
        selectedStoryData: {
          id: story.id,
          title: story.title,
          content: story.content,
          authorId: story.authorId,
          points: [],
        },
        selectedContentTitle: story.title,
        // Rating initiation (atomic with story selection, per P643)
        ratingInitiatedBy: hostName,
        ratingInitiatedByIsCreator: true,
        checkerName: hostName,
        checkerIsCreator: true,
        // Speaker submission
        ratingPhase: 'waiting',
        checkerRating: 7,
        checkerSubmitted: true,
      });

      // On the guest (listener), the branch 5a view (responder-drawer) should render.
      // The slider's question text confirms we reached that view.
      const guestSlider = session.guest.page.getByText(/How confident are you that you understand/i);
      await expect(guestSlider).toBeVisible({ timeout: 15000 });

      // KEY ASSERTION: once the guest can see the slider, they must also see
      // the story card within a short window. Pre-fix this FAILS (gate hides it).
      // Post-fix this PASSES (gate released because speaker has submitted).
      const guestStoryCard = session.guest.page.getByTestId('live-story-card-expanded');
      await expect(guestStoryCard).toBeVisible({ timeout: 3000 });

      // Sanity: the story body should be in the card the listener can read.
      await expect(guestStoryCard).toContainText(story.title);
    } finally {
      if (storyId) await deleteTestStory(storyId);
      await session.cleanup();
    }
  });
});
