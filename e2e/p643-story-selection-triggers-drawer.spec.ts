import { test, expect } from '@playwright/test';
import { createTwoPartySessionRealistic, TwoPartySession } from './helpers/test-session';
import { createTestStory, deleteTestStory } from './helpers/test-story';

/**
 * P643: Story selection should auto-trigger rating drawer
 *
 * Regression test for the root cause: selecting a story closed the picker
 * but did NOT call handleStartCheck, leaving the speaker at idle with the
 * Speak button visible. The fix adds onStartCheck() after story selection.
 */

test.describe('P643: Story selection triggers rating drawer', () => {
  let session: TwoPartySession;
  let storyId: string | undefined;

  test.afterEach(async () => {
    if (storyId) {
      await deleteTestStory(storyId).catch(() => {});
      storyId = undefined;
    }
    await session?.cleanup();
  });

  test('selecting a story opens rating drawer (not back to Speak button)', async ({ browser }) => {
    // Create session with skipNavigation so we can insert the story BEFORE
    // the page loads (stories are fetched on mount — must exist first)
    session = await createTwoPartySessionRealistic(browser, {
      hostName: 'E2E Speaker',
      guestName: 'E2E Listener',
      skipNavigation: true,
    });

    const { host, guest, sessionCode } = session;

    // Create a story owned by the host user so it appears in their picker
    // Picker shows story.content (not title), truncated to 80 chars
    const storyContent = 'P643 canary story for selection drawer test';
    const story = await createTestStory(host.user.user.id, {
      title: 'P643 Canary',
      content: storyContent,
    });
    storyId = story.id;

    // NOW navigate — story exists in DB before page loads
    await host.page.goto(`/live/${sessionCode}?skipMicCheck=true`);
    await guest.page.goto(`/live/${sessionCode}?skipMicCheck=true`);

    // Wait for idle screen with story picker available
    await expect(host.page.getByText('Speak')).toBeVisible({ timeout: 15000 });

    // Open story picker
    await host.page.getByText('Select your story').click();
    await expect(host.page.getByPlaceholder('Search your stories')).toBeVisible({ timeout: 5000 });

    // Select the test story (picker renders content, not title)
    await host.page.getByText(storyContent).click();

    // CANARY ASSERTION: Rating drawer should open (not back to idle with Speak button)
    // Before fix: picker closes → Speak button reappears (bug)
    // After fix: picker closes → rating drawer opens automatically
    await expect(host.page.getByText('How well do you believe')).toBeVisible({ timeout: 5000 });

    // Layer 2 regression guard: guest should NOT see the story card before speaker submits.
    // The atomic write (P643 Bug 3 fix) ensures ratingInitiatedBy arrives with story data,
    // so the listener knows the speaker is rating and suppresses premature story card display.
    await expect(guest.page.getByText(storyContent)).not.toBeVisible({ timeout: 3000 });
  });

  test('Speak button still works as standalone path (no story selected)', async ({ browser }) => {
    session = await createTwoPartySessionRealistic(browser, {
      hostName: 'E2E Speaker',
      guestName: 'E2E Listener',
    });

    const { host } = session;

    // Wait for idle screen
    await expect(host.page.getByText('Speak')).toBeVisible({ timeout: 15000 });

    // Click Speak directly (without selecting a story)
    await host.page.getByText('Speak').first().click();

    // Rating drawer should open
    await expect(host.page.getByText('How well do you believe')).toBeVisible({ timeout: 5000 });
  });
});
