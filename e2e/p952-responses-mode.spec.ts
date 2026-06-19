/**
 * @file p952-responses-mode.spec.ts
 * @description P952 E2E tests — Reveal-moment response CTAs + author responses gate
 *
 * Covers:
 * - Skip-path (AC #8): at story-revealed in invite letter, skip/advance CTA is present + advances
 * - off mode: reading flow has zero response CTAs anywhere
 * - invite mode, story-revealed: "Explain back" primary + secondary skip both present
 * - invite mode, point-revealed: advance is primary; no second bottom-bar CTA
 * - Dialog cancel (AC #3): opening then cancelling capture Dialog leaves advance promoted
 * - Anonymous reader: no response CTAs at any reveal phase
 * - Results page: off mode → no affordances; invite mode → affordances present
 * - Regression: existing P904 results-page affordances intact for invite letters
 *
 * [EXPECTED-FAIL until /dev]: Tests for CTAs that don't exist yet (LetterFlowContent wiring,
 * secondary variant, cancel transition) will fail until /dev implements them — that is correct.
 * They exist to DRIVE /dev.
 *
 * PHASE MACHINE: point-engage → point-revealed → story-rate → story-revealed → remaining-point-revealed
 * The reading flow is async; these tests use DB fixtures and page navigation to drive phases.
 */

import { test, expect } from '@playwright/test';
import { supabaseAdmin } from './helpers/supabase-admin';
import { createTestUser, deleteTestUser, setTestSession, type TestUser } from './helpers/test-user';
import {
  createTestLetter,
  createTestDelivery,
  createTestStorySnapshot,
  sealTestLetter,
  deleteTestLetter,
} from './helpers/test-letter';
import { createTestStory, deleteTestStory } from './helpers/test-story';
import { createTestPoint, deleteTestPoint } from './helpers/test-point';

// ===========================================================================
// Shared fixture: sender + receiver + sealed letter (invite or off)
// ===========================================================================

interface P952Fixture {
  sender: TestUser;
  receiver: TestUser;
  letterId: string;
  deliveryId: string;
  storyId: string;
  pointId: string;
  docId: string;
  invitationToken: string;
  responsesMode: 'off' | 'invite';
  cleanup: () => Promise<void>;
}

async function createP952Fixture(
  responsesMode: 'off' | 'invite' = 'invite',
  senderName = 'P952 Sender',
  receiverName = 'P952 Receiver'
): Promise<P952Fixture> {
  const sender = await createTestUser({ name: senderName });
  const receiver = await createTestUser({ name: receiverName });

  const { data: doc, error: docError } = await supabaseAdmin
    .from('clarity_docs')
    .insert({ title: `P952 test doc (${responsesMode})`, owner_id: sender.user.id })
    .select('id')
    .single();
  if (docError) throw new Error(`Doc creation failed: ${docError.message}`);

  const story = await createTestStory(sender.user.id, {
    title: 'The timeline risk',
    content: 'The timeline has external dependency risks worth discussing.',
  });

  const point = await createTestPoint(sender.user.id, {
    statement: 'The timeline is realistic',
    visibility: 'public',
  });

  const { data: versionRow, error: versionError } = await supabaseAdmin
    .from('story_versions')
    .select('id')
    .eq('story_id', story.id)
    .limit(1)
    .single();
  if (versionError) throw new Error(`Version lookup failed: ${versionError.message}`);

  const letter = await createTestLetter(sender.user.id, doc!.id, { mode: 'one-to-one' });

  await createTestStorySnapshot(letter.id, story.id, versionRow.id, {
    position: 0,
    pointConfig: {
      storyTitle: 'The timeline risk',
      storyText: 'The timeline has external dependency risks worth discussing.',
      points: [{ id: point.id, text: 'The timeline is realistic', authorPosition: null }],
    },
  });

  const delivery = await createTestDelivery(letter.id, {
    receiverEmail: receiver.email,
    receiverProfileId: receiver.user.id,
    status: 'completed',
    completedAt: new Date().toISOString(),
  });

  // Set the responses_mode
  await supabaseAdmin
    .from('clarity_letters')
    .update({ responses_mode: responsesMode })
    .eq('id', letter.id);

  await sealTestLetter(letter.id);

  return {
    sender,
    receiver,
    letterId: letter.id,
    deliveryId: delivery.id,
    storyId: story.id,
    pointId: point.id,
    docId: doc!.id,
    invitationToken: delivery.invitationToken,
    responsesMode,
    cleanup: async () => {
      await supabaseAdmin.from('story_explain_backs').delete().eq('delivery_id', delivery.id);
      await deleteTestLetter(letter.id);
      await deleteTestStory(story.id);
      await deleteTestPoint(point.id);
      await supabaseAdmin.from('clarity_docs').delete().eq('id', doc!.id);
      await deleteTestUser(receiver.user.id);
      await deleteTestUser(sender.user.id);
    },
  };
}

// ===========================================================================
// 1. Smoke: reading page loads for both modes without errors
// ===========================================================================

test.describe('P952: smoke — reading and results pages load for invite and off modes', () => {
  let inviteFixture: P952Fixture;
  let offFixture: P952Fixture;

  test.beforeAll(async () => {
    [inviteFixture, offFixture] = await Promise.all([
      createP952Fixture('invite', 'P952 Invite Smoke Sender', 'P952 Invite Smoke Receiver'),
      createP952Fixture('off', 'P952 Off Smoke Sender', 'P952 Off Smoke Receiver'),
    ]);
  });

  test.afterAll(async () => {
    await Promise.all([inviteFixture.cleanup(), offFixture.cleanup()]);
  });

  test('smoke: invite letter reading page loads without console errors', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });

    await setTestSession(page, inviteFixture.receiver.email);
    await page.goto(`/letter/${inviteFixture.deliveryId}`);
    await page.waitForLoadState('networkidle');

    await expect(page.locator('body')).not.toContainText('Something went wrong');
    await expect(page.locator('body')).not.toContainText('404');

    const relevantErrors = consoleErrors.filter(e => !e.includes('net::ERR_') && !e.includes('favicon'));
    expect(relevantErrors, `Unexpected console errors: ${relevantErrors.join('\n')}`).toHaveLength(0);
  });

  test('smoke: off letter reading page loads without console errors', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });

    await setTestSession(page, offFixture.receiver.email);
    await page.goto(`/letter/${offFixture.deliveryId}`);
    await page.waitForLoadState('networkidle');

    await expect(page.locator('body')).not.toContainText('Something went wrong');

    const relevantErrors = consoleErrors.filter(e => !e.includes('net::ERR_') && !e.includes('favicon'));
    expect(relevantErrors).toHaveLength(0);
  });
});

// ===========================================================================
// 2. AC #8 (mandatory automated): Skip-path at story-revealed in invite mode
// The skip/advance CTA is present and advances the flow
// ===========================================================================

test.describe('P952 AC#8: Skip-path — advance CTA present at story-revealed (invite)', () => {
  let fixture: P952Fixture;

  test.beforeAll(async () => {
    fixture = await createP952Fixture('invite', 'P952 Skip Sender', 'P952 Skip Receiver');
  });

  test.afterAll(async () => {
    await fixture.cleanup();
  });

  // [EXPECTED-FAIL until /dev] — two-CTA bar at story-revealed not yet built
  test('[EXPECTED-FAIL until /dev] AC#8: skip/advance CTA present at story-revealed in invite letter', async ({ page }) => {
    await setTestSession(page, fixture.receiver.email);
    await page.goto(`/letter/${fixture.deliveryId}`);
    await page.waitForLoadState('networkidle');

    // Navigate to story-revealed phase via the reading flow
    // At point-engage: engage with the point (rate/answer it) to advance to point-revealed
    // Then advance to story-rate, then story-revealed
    // Selectors are based on the existing phase machine CTAs
    // (These will need updating if CTA text changes in /dev)
    const advanceThroughPhases = async () => {
      // Phase: letter cover → click to open
      const openBtn = page.getByRole('button', { name: /open/i }).or(
        page.getByRole('button', { name: /start/i })
      );
      if (await openBtn.first().isVisible({ timeout: 3000 }).catch(() => false)) {
        await openBtn.first().click();
        await page.waitForLoadState('networkidle');
      }

      // Advance through point-engage and point-revealed phases
      // by clicking the primary CTA multiple times until story-revealed
      for (let i = 0; i < 8; i++) {
        const primaryCta = page.locator('[data-testid="letter-primary-cta"]')
          .or(page.getByRole('button', { name: /next/i }))
          .or(page.getByRole('button', { name: /continue/i }))
          .or(page.getByRole('button', { name: /i've read/i }));

        if (await primaryCta.first().isVisible({ timeout: 2000 }).catch(() => false)) {
          await primaryCta.first().click();
          await page.waitForTimeout(500);
        }
      }
    };

    await advanceThroughPhases();

    // At story-revealed phase (invite + authenticated receiver):
    // The secondary skip CTA "Skip to..." must be present alongside "Explain back"
    // Both are in the FixedBottomBar
    const explainBackCta = page.getByRole('button', { name: /explain back/i });
    const skipCta = page.getByRole('button', { name: /skip/i })
      .or(page.getByRole('button', { name: /next story/i }))
      .or(page.getByRole('button', { name: /skip to/i }));

    await expect(
      explainBackCta,
      '"Explain back what you understood" primary CTA must be present at story-revealed'
    ).toBeVisible({ timeout: 10000 });

    await expect(
      skipCta.first(),
      'Skip/advance secondary CTA must be present at story-revealed — the skip path must always be reachable (AC#8)'
    ).toBeVisible({ timeout: 5000 });
  });

  // [EXPECTED-FAIL until /dev] — secondary CTA click must advance the flow
  test('[EXPECTED-FAIL until /dev] AC#8: clicking skip/advance CTA at story-revealed advances the flow', async ({ page }) => {
    await setTestSession(page, fixture.receiver.email);
    await page.goto(`/letter/${fixture.deliveryId}`);
    await page.waitForLoadState('networkidle');

    // Advance to story-revealed phase
    for (let i = 0; i < 10; i++) {
      const primaryCta = page.locator('[data-testid="letter-primary-cta"]')
        .or(page.getByRole('button', { name: /next/i }))
        .or(page.getByRole('button', { name: /continue/i }));

      if (await primaryCta.first().isVisible({ timeout: 2000 }).catch(() => false)) {
        await primaryCta.first().click();
        await page.waitForTimeout(400);

        // Stop once we see the two-CTA bar (skip present = story-revealed)
        const skipVisible = await page.getByRole('button', { name: /skip/i }).isVisible().catch(() => false);
        if (skipVisible) break;
      }
    }

    const skipCta = page.getByRole('button', { name: /skip/i })
      .or(page.getByRole('button', { name: /skip to/i }));

    await expect(skipCta.first()).toBeVisible({ timeout: 5000 });

    // Click the skip — should advance to the next phase (NOT open a Dialog)
    await skipCta.first().click();
    await page.waitForTimeout(500);

    // After skip, the "Explain back" CTA should be gone (moved to next phase or results)
    // and no dialog should have opened
    const captureDialog = page.locator('[role="dialog"]');
    await expect(captureDialog).not.toBeVisible({ timeout: 2000 }).catch(() => {
      // If dialog is visible, the skip incorrectly opened it — this is the failure case
      throw new Error('Skip CTA opened the capture Dialog instead of advancing the flow');
    });
  });
});

// ===========================================================================
// 3. off mode — no response CTAs in reading flow or results page
// ===========================================================================

test.describe('P952: off mode — advance-only reading flow, no response affordances', () => {
  let fixture: P952Fixture;

  test.beforeAll(async () => {
    fixture = await createP952Fixture('off', 'P952 Off Sender', 'P952 Off Receiver');
  });

  test.afterAll(async () => {
    await fixture.cleanup();
  });

  // [EXPECTED-FAIL until /dev] — story-walk off gating not yet built
  test('[EXPECTED-FAIL until /dev] off mode: no "Explain back" CTA anywhere in reading flow', async ({ page }) => {
    await setTestSession(page, fixture.receiver.email);
    await page.goto(`/letter/${fixture.deliveryId}`);
    await page.waitForLoadState('networkidle');

    // Navigate through entire reading flow
    for (let i = 0; i < 12; i++) {
      const primaryCta = page.locator('[data-testid="letter-primary-cta"]')
        .or(page.getByRole('button', { name: /next/i }))
        .or(page.getByRole('button', { name: /continue/i }))
        .or(page.getByRole('button', { name: /finish/i }));

      if (await primaryCta.first().isVisible({ timeout: 1500 }).catch(() => false)) {
        // Verify no "Explain back" CTA is ever visible
        await expect(
          page.getByRole('button', { name: /explain back/i }),
          `"Explain back" CTA must never appear in off-mode reading flow (phase ${i})`
        ).not.toBeVisible();

        await primaryCta.first().click();
        await page.waitForTimeout(400);
      }
    }
  });

  // [EXPECTED-FAIL until /dev] — story-walk off gating not yet built
  test('[EXPECTED-FAIL until /dev] off mode: results page has zero response affordances', async ({ page }) => {
    await setTestSession(page, fixture.receiver.email);
    await page.goto(`/letter/${fixture.letterId}/results?delivery=${fixture.deliveryId}`);
    await page.waitForLoadState('networkidle');

    // No "Explain back" button
    await expect(
      page.getByRole('button', { name: /explain back what you understood/i }),
      'off mode: "Explain back what you understood" must not appear on results page'
    ).not.toBeVisible();

    // No "Add a story" button
    await expect(
      page.getByRole('button', { name: /add a story/i }),
      'off mode: "Add a story" must not appear on results page'
    ).not.toBeVisible();
  });
});

// ===========================================================================
// 4. invite mode — story-revealed: primary + secondary CTA hierarchy
// ===========================================================================

test.describe('P952: invite mode — story-revealed CTA hierarchy', () => {
  let fixture: P952Fixture;

  test.beforeAll(async () => {
    fixture = await createP952Fixture('invite', 'P952 Invite CTA Sender', 'P952 Invite CTA Receiver');
  });

  test.afterAll(async () => {
    await fixture.cleanup();
  });

  // [EXPECTED-FAIL until /dev] — two-CTA bar not yet built
  test('[EXPECTED-FAIL until /dev] story-revealed: "Explain back" is primary CTA, advance is secondary', async ({ page }) => {
    await setTestSession(page, fixture.receiver.email);
    await page.goto(`/letter/${fixture.deliveryId}`);
    await page.waitForLoadState('networkidle');

    // Advance to story-revealed
    for (let i = 0; i < 10; i++) {
      const primaryCta = page.locator('[data-testid="letter-primary-cta"]')
        .or(page.getByRole('button', { name: /next/i }))
        .or(page.getByRole('button', { name: /continue/i }));

      if (await primaryCta.first().isVisible({ timeout: 2000 }).catch(() => false)) {
        await primaryCta.first().click();
        await page.waitForTimeout(400);
        const skipVisible = await page.getByRole('button', { name: /skip/i }).isVisible().catch(() => false);
        if (skipVisible) break;
      }
    }

    const explainBackBtn = page.getByRole('button', { name: /explain back what you understood/i });
    const skipBtn = page.getByRole('button', { name: /skip/i })
      .or(page.getByRole('button', { name: /skip to/i }));

    await expect(explainBackBtn, '"Explain back what you understood" primary must be present at story-revealed').toBeVisible({ timeout: 10000 });
    await expect(skipBtn.first(), 'Secondary skip/advance must be present at story-revealed').toBeVisible({ timeout: 5000 });

    // Verify hierarchy: primary should have the blue pill style, secondary should be ghost/lighter
    // Proxy check: primary button should NOT have 'secondary' in its variant class
    const explainBackClass = await explainBackBtn.getAttribute('class') ?? '';
    const skipClass = await skipBtn.first().getAttribute('class') ?? '';

    // The primary CTA should have a solid/primary style (bg-blue, etc.)
    // The secondary CTA should appear visually lighter
    expect(
      explainBackClass,
      'Primary CTA should not have secondary/ghost/outline styling'
    ).not.toMatch(/secondary|ghost|outline|border-only/i);

    // Secondary must look different (lighter, outline, or ghost)
    // This is a soft check — /dev will add data-variant= or class markers
    expect(
      skipClass !== explainBackClass,
      'Skip (secondary) CTA should have different visual styling than the primary CTA'
    ).toBe(true);
  });

  // [EXPECTED-FAIL until /dev] — quiet inline link not yet built
  test('[EXPECTED-FAIL until /dev] point-revealed: advance is primary; "Add a story" is inline link, not a second primary', async ({ page }) => {
    await setTestSession(page, fixture.receiver.email);
    await page.goto(`/letter/${fixture.deliveryId}`);
    await page.waitForLoadState('networkidle');

    // Advance to point-revealed (one advance from cover)
    for (let i = 0; i < 5; i++) {
      const primaryCta = page.locator('[data-testid="letter-primary-cta"]')
        .or(page.getByRole('button', { name: /next/i }))
        .or(page.getByRole('button', { name: /continue/i }));

      if (await primaryCta.first().isVisible({ timeout: 2000 }).catch(() => false)) {
        // Stop when we see the advance CTA without a skip (that's point-revealed)
        const skipVisible = await page.getByRole('button', { name: /skip/i }).isVisible().catch(() => false);
        const explainVisible = await page.getByRole('button', { name: /explain back/i }).isVisible().catch(() => false);
        if (!skipVisible && !explainVisible) break;
        await primaryCta.first().click();
        await page.waitForTimeout(400);
      }
    }

    // At point-revealed: bottom bar has ONE primary (advance), no second primary CTA
    const allPrimaries = page.locator('[data-testid="letter-primary-cta"]:not([data-variant="secondary"])');

    await expect(
      page.getByRole('button', { name: /add a story/i }),
      '"Add a story" should be a quiet inline link at point-revealed, not a full bottom-bar primary'
    ).toBeVisible({ timeout: 5000 });

    // "Add a story" should NOT be a full bottom-bar pill — it's an inline link
    const addAStoryCount = await allPrimaries.filter({ hasText: /add a story/i }).count();
    expect(addAStoryCount, '"Add a story" must not render as a primary FixedBottomBar CTA at point-revealed').toBe(0);
  });
});

// ===========================================================================
// 5. AC #3: Dialog cancel — advance is promoted after cancel
// ===========================================================================

test.describe('P952 AC#3: Capture Dialog cancel leaves reader able to advance', () => {
  let fixture: P952Fixture;

  test.beforeAll(async () => {
    fixture = await createP952Fixture('invite', 'P952 Cancel Sender', 'P952 Cancel Receiver');
  });

  test.afterAll(async () => {
    await fixture.cleanup();
  });

  // [EXPECTED-FAIL until /dev] — Dialog cancel transition not yet built
  test('[EXPECTED-FAIL until /dev] AC#3: cancelling capture Dialog promotes advance to primary', async ({ page }) => {
    await setTestSession(page, fixture.receiver.email);
    await page.goto(`/letter/${fixture.deliveryId}`);
    await page.waitForLoadState('networkidle');

    // Advance to story-revealed
    for (let i = 0; i < 10; i++) {
      const primaryCta = page.locator('[data-testid="letter-primary-cta"]')
        .or(page.getByRole('button', { name: /next/i }))
        .or(page.getByRole('button', { name: /continue/i }));

      if (await primaryCta.first().isVisible({ timeout: 2000 }).catch(() => false)) {
        await primaryCta.first().click();
        await page.waitForTimeout(400);
        const skipVisible = await page.getByRole('button', { name: /skip/i }).isVisible().catch(() => false);
        if (skipVisible) break;
      }
    }

    // Open the capture Dialog
    const explainBackBtn = page.getByRole('button', { name: /explain back what you understood/i });
    await expect(explainBackBtn).toBeVisible({ timeout: 10000 });
    await explainBackBtn.click();

    const captureDialog = page.locator('[role="dialog"]');
    await expect(captureDialog).toBeVisible({ timeout: 5000 });

    // Cancel the Dialog
    const cancelBtn = page.getByRole('button', { name: /cancel/i })
      .or(page.getByRole('button', { name: /close/i }))
      .or(page.locator('[aria-label="Close"]'));

    await expect(cancelBtn.first()).toBeVisible({ timeout: 3000 });
    await cancelBtn.first().click();

    // Dialog should be closed
    await expect(captureDialog).not.toBeVisible({ timeout: 3000 });

    // After cancel: advance should be promoted to primary (no dead-end / loop)
    // The reader must be able to move forward
    const advanceCta = page.getByRole('button', { name: /next/i })
      .or(page.getByRole('button', { name: /continue/i }))
      .or(page.getByRole('button', { name: /finish/i }))
      .or(page.getByRole('button', { name: /next story/i }));

    await expect(
      advanceCta.first(),
      'After cancelling the capture Dialog, an advance/primary CTA must be visible — no loop (AC#3)'
    ).toBeVisible({ timeout: 5000 });
  });
});

// ===========================================================================
// 6. Anonymous reader — no response CTAs
// ===========================================================================

test.describe('P952: anonymous/public reader sees no response CTAs', () => {
  let fixture: P952Fixture;

  test.beforeAll(async () => {
    fixture = await createP952Fixture('invite', 'P952 Anon Sender', 'P952 Anon Receiver');
  });

  test.afterAll(async () => {
    await fixture.cleanup();
  });

  // [EXPECTED-FAIL until /dev] — isAuthenticatedReceiver gate not yet threaded
  test('[EXPECTED-FAIL until /dev] anonymous token reader sees no "Explain back" CTA at any reveal phase', async ({ page }) => {
    // Navigate as anonymous user using invitation token
    await page.goto(`/letter/${fixture.letterId}?token=${fixture.invitationToken}`);
    await page.waitForLoadState('networkidle');

    // Advance through phases without auth
    for (let i = 0; i < 12; i++) {
      const primaryCta = page.locator('[data-testid="letter-primary-cta"]')
        .or(page.getByRole('button', { name: /next/i }))
        .or(page.getByRole('button', { name: /continue/i }));

      if (await primaryCta.first().isVisible({ timeout: 1500 }).catch(() => false)) {
        // The "Explain back" CTA must NEVER appear for anonymous readers
        await expect(
          page.getByRole('button', { name: /explain back/i }),
          `Anonymous reader must not see "Explain back" CTA (phase ${i})`
        ).not.toBeVisible();

        await primaryCta.first().click();
        await page.waitForTimeout(400);
      }
    }
  });

  test('anonymous token reader sees no "Add a story" affordance in reading flow', async ({ page }) => {
    await page.goto(`/letter/${fixture.letterId}?token=${fixture.invitationToken}`);
    await page.waitForLoadState('networkidle');

    // Advance through reading flow as anonymous user
    for (let i = 0; i < 6; i++) {
      const primaryCta = page.locator('[data-testid="letter-primary-cta"]')
        .or(page.getByRole('button', { name: /next/i }));

      if (await primaryCta.first().isVisible({ timeout: 1500 }).catch(() => false)) {
        await primaryCta.first().click();
        await page.waitForTimeout(400);
      }
    }

    // "Add a story" inline link should not appear for anonymous readers
    // (The receiver-only slot in point-revealed is gated by isAuthenticatedReceiver)
    // This assertion is on the READING FLOW, not the results page
    await expect(
      page.locator('[data-testid="add-story-inline-link"]'),
      'Anonymous reader must not see inline "Add a story" link in reading flow'
    ).not.toBeVisible();
  });
});

// ===========================================================================
// 7. Results page: mode gates
// ===========================================================================

test.describe('P952: results page — invite keeps affordances, off removes them', () => {
  let inviteFixture: P952Fixture;
  let offFixture: P952Fixture;

  test.beforeAll(async () => {
    [inviteFixture, offFixture] = await Promise.all([
      createP952Fixture('invite', 'P952 Results Invite Sender', 'P952 Results Invite Receiver'),
      createP952Fixture('off', 'P952 Results Off Sender', 'P952 Results Off Receiver'),
    ]);
  });

  test.afterAll(async () => {
    await Promise.all([inviteFixture.cleanup(), offFixture.cleanup()]);
  });

  test('invite mode: results page has "Explain back what you understood" affordance', async ({ page }) => {
    await setTestSession(page, inviteFixture.receiver.email);
    await page.goto(`/letter/${inviteFixture.letterId}/results?delivery=${inviteFixture.deliveryId}`);
    await page.waitForLoadState('networkidle');

    // P904 affordance must persist on the results page for invite mode (skip-recovery)
    const cta = page.getByRole('button', { name: 'Explain back what you understood' });
    await expect(cta, 'invite mode: "Explain back what you understood" must be visible on results page').toBeVisible({ timeout: 10000 });
  });

  // [EXPECTED-FAIL until /dev] — story-walk off gating not yet built
  test('[EXPECTED-FAIL until /dev] off mode: results page has NO response affordances at all', async ({ page }) => {
    await setTestSession(page, offFixture.receiver.email);
    await page.goto(`/letter/${offFixture.letterId}/results?delivery=${offFixture.deliveryId}`);
    await page.waitForLoadState('networkidle');

    await expect(
      page.getByRole('button', { name: /explain back what you understood/i }),
      'off mode: "Explain back what you understood" must NOT appear on results page'
    ).not.toBeVisible({ timeout: 5000 });

    await expect(
      page.getByRole('button', { name: /add a story/i }),
      'off mode: "Add a story" must NOT appear on results page'
    ).not.toBeVisible({ timeout: 5000 });
  });
});

// ===========================================================================
// 8. AC #9 regression: backfilled invite letters still show P904 affordances
// ===========================================================================

test.describe('P952 AC#9: regression — backfilled invite letters retain P904 affordances', () => {
  let fixture: P952Fixture;

  test.beforeAll(async () => {
    // Simulate an existing P904 letter: set responses_mode = 'invite' (the backfill value)
    fixture = await createP952Fixture('invite', 'P952 Regression Sender', 'P952 Regression Receiver');
  });

  test.afterAll(async () => {
    await fixture.cleanup();
  });

  test('pre-P952 backfilled letter (responses_mode=invite) still shows results-page affordances', async ({ page }) => {
    await setTestSession(page, fixture.receiver.email);
    await page.goto(`/letter/${fixture.letterId}/results?delivery=${fixture.deliveryId}`);
    await page.waitForLoadState('networkidle');

    // The P904 results-page affordances must be present (backfill is additive — removes nothing)
    await expect(page.locator('body')).not.toContainText('Something went wrong');
    await expect(page.locator('body')).not.toContainText('404');

    // "Explain back what you understood" row should be visible (P904 behavior preserved)
    const cta = page.getByRole('button', { name: 'Explain back what you understood' });
    await expect(
      cta,
      'Backfilled invite letter must still show P904 affordances on the results page — additive change'
    ).toBeVisible({ timeout: 10000 });
  });

  test('non-receiver viewer renders unchanged for backfilled letter (no affordances shown to sender)', async ({ page }) => {
    await setTestSession(page, fixture.sender.email);
    await page.goto(`/letter/${fixture.letterId}/results`);
    await page.waitForLoadState('networkidle');

    await expect(page.locator('body')).not.toContainText('Something went wrong');

    // Sender should not see the explain-back capture CTA (they're not the receiver)
    await expect(
      page.getByRole('button', { name: /explain back what you understood/i }),
      'Sender must not see the explain-back capture CTA on results page'
    ).not.toBeVisible({ timeout: 5000 });
  });
});
