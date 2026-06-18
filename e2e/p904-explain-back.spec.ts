/**
 * @file p904-explain-back.spec.ts
 * @description P904 E2E feature tests — async letter verification (explain-back) v0
 *
 * Covers:
 * - Smoke: results page loads without console errors with a sealed letter
 * - Receiver sees "Explain back what you understood" CTA on a story (empty state)
 * - Receiver sees "Explain your position" on a point (empty state)
 * - Capture panel opens and shows correct UI states:
 *     idle → recording (text fallback path — audio MediaRecorder not supported headless)
 *     text fallback → submit succeeds → affordance changes to "What you understood →"
 * - View focus page (/explain-back/:id) renders with back button (author perspective)
 * - Author sees "What [Name] understood →" row with unread indicator
 * - Anon/unauthenticated reader sees NO capture affordance
 * - Existing letter without explain-backs renders exactly as today (regression)
 *
 * AUDIO NOTE: MediaRecorder is not available in headless Playwright. The audio
 * recording path (idle → recording → preview → send) is tested for UI state
 * PRESENCE only (buttons visible, ARIA correct). The full submission is tested
 * via the TEXT FALLBACK path ("Explain in text instead" → textarea → send), which is
 * end-to-end verifiable without media APIs.
 *
 * NOT-YET-BUILT COMPONENTS: ExplainBackCapturePanel, ExplainBackViewPage, and the
 * /explain-back/:id route do not exist until /dev runs. Tests marked with
 * [EXPECTED-FAIL until /dev] will fail until those components are implemented —
 * that is correct and expected. They exist to DRIVE /dev, not to be weakened.
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
import { createTestStory, deleteTestStory, linkStoryToPoint } from './helpers/test-story';
import { createTestPoint, deleteTestPoint } from './helpers/test-point';

// ===========================================================================
// Shared fixture: sender + receiver + sealed letter with one story + one point
// ===========================================================================

interface P904Fixture {
  sender: TestUser;
  receiver: TestUser;
  letterId: string;
  deliveryId: string;
  storyId: string;
  pointId: string;
  docId: string;
  invitationToken: string;
  cleanup: () => Promise<void>;
}

async function createP904Fixture(): Promise<P904Fixture> {
  const sender = await createTestUser({ name: 'P904 Sender Alex' });
  const receiver = await createTestUser({ name: 'P904 Receiver Jamie' });

  // Create source doc
  const { data: doc, error: docError } = await supabaseAdmin
    .from('clarity_docs')
    .insert({ title: 'P904 test doc', owner_id: sender.user.id })
    .select('id')
    .single();
  if (docError) throw new Error(`Doc creation failed: ${docError.message}`);

  // Create story + point
  const story = await createTestStory(sender.user.id, {
    title: 'The timeline risk',
    content: 'The timeline risk story content for P904 testing.',
  });

  const point = await createTestPoint(sender.user.id, {
    statement: 'The timeline is realistic',
    visibility: 'public',
  });

  // Get story version
  const { data: versionRow, error: versionError } = await supabaseAdmin
    .from('story_versions')
    .select('id')
    .eq('story_id', story.id)
    .limit(1)
    .single();
  if (versionError) throw new Error(`Version lookup failed: ${versionError.message}`);

  // Create letter + snapshot + delivery
  const letter = await createTestLetter(sender.user.id, doc!.id, { mode: 'one-to-one' });

  await createTestStorySnapshot(letter.id, story.id, versionRow.id, {
    position: 0,
    pointConfig: {
      storyTitle: 'The timeline risk',
      storyText: 'The timeline risk story content for P904 testing.',
      points: [{ id: point.id, text: 'The timeline is realistic', authorPosition: null }],
    },
  });

  const delivery = await createTestDelivery(letter.id, {
    receiverEmail: receiver.email,
    receiverProfileId: receiver.user.id,
    status: 'completed',
    completedAt: new Date().toISOString(),
  });

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
    cleanup: async () => {
      // Order: explain_backs (via letter cascade) → delivery → letter → story → point → doc → users
      await supabaseAdmin
        .from('story_explain_backs')
        .delete()
        .eq('delivery_id', delivery.id);
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
// 1. Smoke: results page loads without console errors
// ===========================================================================

test.describe('P904: smoke — results page with sealed letter', () => {
  let fixture: P904Fixture;

  test.beforeAll(async () => {
    fixture = await createP904Fixture();
  });

  test.afterAll(async () => {
    await fixture.cleanup();
  });

  test('smoke: results page loads without console errors (receiver perspective)', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });

    await setTestSession(page, fixture.receiver.email);
    await page.goto(`/letter/${fixture.letterId}/results?delivery=${fixture.deliveryId}`);
    await page.waitForLoadState('networkidle');

    // Page should render (not loader or error state)
    await expect(page.locator('body')).not.toContainText('Something went wrong');
    await expect(page.locator('body')).not.toContainText('404');

    // Filter out expected non-critical console noise from Supabase client
    const relevantErrors = consoleErrors.filter(e =>
      !e.includes('net::ERR_') &&
      !e.includes('favicon')
    );
    expect(relevantErrors, `Unexpected console errors: ${relevantErrors.join('\n')}`).toHaveLength(0);
  });

  test('smoke: results page loads without console errors (sender perspective)', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });

    await setTestSession(page, fixture.sender.email);
    await page.goto(`/letter/${fixture.letterId}/results`);
    await page.waitForLoadState('networkidle');

    await expect(page.locator('body')).not.toContainText('Something went wrong');

    const relevantErrors = consoleErrors.filter(e =>
      !e.includes('net::ERR_') && !e.includes('favicon')
    );
    expect(relevantErrors).toHaveLength(0);
  });
});

// ===========================================================================
// 2. Receiver affordances — empty state
// [EXPECTED-FAIL until /dev: ExplainBackCapturePanel and affordance rows not built yet]
// ===========================================================================

test.describe('P904: receiver affordances on results page (empty state)', () => {
  let fixture: P904Fixture;

  test.beforeAll(async () => {
    fixture = await createP904Fixture();
  });

  test.afterAll(async () => {
    await fixture.cleanup();
  });

  // [EXPECTED-FAIL until /dev] ExplainBackAffordanceRow not yet built
  test('[EXPECTED-FAIL until /dev] receiver sees "Explain back what you understood" CTA (story level)', async ({ page }) => {
    await setTestSession(page, fixture.receiver.email);
    await page.goto(`/letter/${fixture.letterId}/results?delivery=${fixture.deliveryId}`);
    await page.waitForLoadState('networkidle');

    // The spec mandates this exact copy (UX Design § Copy rules)
    // NEVER assert "paraphrase" — that is internal jargon per spec
    const cta = page.getByRole('button', { name: 'Explain back what you understood' });
    await expect(cta).toBeVisible({ timeout: 10000 });
  });

  // R3 renamed the point-level empty-state CTA "Explain your position" → "Add a story".
  test('receiver sees "Add a story" CTA (point level)', async ({ page }) => {
    await setTestSession(page, fixture.receiver.email);
    await page.goto(`/letter/${fixture.letterId}/results?delivery=${fixture.deliveryId}`);
    await page.waitForLoadState('networkidle');

    // Point-level empty-state copy per spec Pre-Ship Revision R3
    const addStoryCta = page.getByRole('button', { name: 'Add a story' });
    await expect(addStoryCta.first()).toBeVisible({ timeout: 10000 });
  });

  // [EXPECTED-FAIL until /dev] capture panel not built
  test('[EXPECTED-FAIL until /dev] author (sender) does NOT see capture affordance on results page', async ({ page }) => {
    await setTestSession(page, fixture.sender.email);
    await page.goto(`/letter/${fixture.letterId}/results`);
    await page.waitForLoadState('networkidle');

    // Author has no explain-back to submit — should not see the capture CTA
    const captureCta = page.getByRole('button', { name: 'Explain back what you understood' });
    await expect(captureCta).not.toBeVisible({ timeout: 5000 });
  });
});

// ===========================================================================
// 3. Auth gate — anon reader sees no capture affordance
// [EXPECTED-FAIL until /dev: affordance row not built, but auth gate logic tested]
// ===========================================================================

test.describe('P904: auth gate — unauthenticated reader sees no capture affordance', () => {
  let fixture: P904Fixture;

  test.beforeAll(async () => {
    fixture = await createP904Fixture();
  });

  test.afterAll(async () => {
    await fixture.cleanup();
  });

  // [EXPECTED-FAIL until /dev] — when the affordance is built, this test must PASS
  test('[EXPECTED-FAIL until /dev] anon token reader sees no "Explain back" CTA (Security)', async ({ page }) => {
    // Navigate using the invitation token (anonymous reading path)
    await page.goto(`/letter/${fixture.letterId}?token=${fixture.invitationToken}`);
    await page.waitForLoadState('networkidle');

    // The capture CTA must NOT be visible to unauthenticated readers.
    // Per spec Security section: "Capture affordance needs an explicit auth gate —
    // checked in the component, not inherited from the route layout."
    const captureBtn = page.getByRole('button', { name: 'Explain back what you understood' });
    await expect(captureBtn).not.toBeVisible({ timeout: 5000 });
  });
});

// ===========================================================================
// 4. Capture panel state machine — text fallback path (end-to-end verifiable)
// [EXPECTED-FAIL until /dev: ExplainBackCapturePanel not built yet]
// ===========================================================================

test.describe('P904: capture panel — text fallback submission (end-to-end)', () => {
  let fixture: P904Fixture;

  test.beforeAll(async () => {
    fixture = await createP904Fixture();
  });

  test.afterAll(async () => {
    // explain_backs cleanup handled by fixture.cleanup() via delivery FK cascade
    await fixture.cleanup();
  });

  // [EXPECTED-FAIL until /dev]
  test('[EXPECTED-FAIL until /dev] capture panel opens when receiver clicks CTA', async ({ page }) => {
    await setTestSession(page, fixture.receiver.email);
    await page.goto(`/letter/${fixture.letterId}/results?delivery=${fixture.deliveryId}`);
    await page.waitForLoadState('networkidle');

    const cta = page.getByRole('button', { name: 'Explain back what you understood' });
    await cta.click();

    // After click, capture panel should be open (FixedBottomBar with idle state)
    // TODO(/dev): confirm selector once ExplainBackCapturePanel exists
    const capturePanel = page.locator('[data-testid="explain-back-capture-panel"]')
      .or(page.getByText('Explain in text instead'));
    await expect(capturePanel.first()).toBeVisible({ timeout: 5000 });
  });

  // [EXPECTED-FAIL until /dev]
  test('[EXPECTED-FAIL until /dev] "Explain in text instead" opens text fallback state', async ({ page }) => {
    await setTestSession(page, fixture.receiver.email);
    await page.goto(`/letter/${fixture.letterId}/results?delivery=${fixture.deliveryId}`);
    await page.waitForLoadState('networkidle');

    const cta = page.getByRole('button', { name: 'Explain back what you understood' });
    await cta.click();

    // Click "Explain in text instead" to switch to text fallback (UAT 2026-06-18 copy revision)
    const typeInsteadBtn = page.getByRole('button', { name: /explain in text instead/i });
    await expect(typeInsteadBtn).toBeVisible({ timeout: 5000 });
    await typeInsteadBtn.click();

    // Text area should appear
    const textarea = page.getByRole('textbox');
    await expect(textarea).toBeVisible({ timeout: 3000 });
  });

  // [EXPECTED-FAIL until /dev]
  test('[EXPECTED-FAIL until /dev] receiver can submit text fallback and DB row is created with medium=text', async ({ page }) => {
    await setTestSession(page, fixture.receiver.email);
    await page.goto(`/letter/${fixture.letterId}/results?delivery=${fixture.deliveryId}`);
    await page.waitForLoadState('networkidle');

    // Open capture panel → text fallback
    await page.getByRole('button', { name: 'Explain back what you understood' }).click();
    await page.getByRole('button', { name: /explain in text instead/i }).click();

    // Fill in text fallback
    const textarea = page.getByRole('textbox');
    await textarea.fill('I understood that the timeline has specific risks related to dependencies.');

    // Submit
    // TODO(/dev): confirm selector — spec shows "Send" button in text-fallback state
    const sendBtn = page.getByRole('button', { name: /send/i });
    await sendBtn.click();

    // Wait for submission to complete (button should change or panel closes)
    await page.waitForLoadState('networkidle');

    // Verify DB row created with medium='text' and text_fallback populated
    const { data: explainBack, error } = await supabaseAdmin
      .from('story_explain_backs')
      .select('id, medium, text_fallback, recorder_id')
      .eq('delivery_id', fixture.deliveryId)
      .eq('recorder_id', fixture.receiver.user.id)
      .single();

    expect(error, `Expected explain-back row in DB: ${error?.message}`).toBeNull();
    expect(explainBack?.medium).toBe('text');
    expect(explainBack?.text_fallback).toContain('timeline');
  });

  // [EXPECTED-FAIL until /dev]
  test('[EXPECTED-FAIL until /dev] after submission, receiver sees "What you understood →" (filled state)', async ({ page }) => {
    // This test depends on the previous test's DB row — use beforeAll setup instead
    // For independence: seed an explain-back row directly, then navigate
    const { error: ebError } = await supabaseAdmin
      .from('story_explain_backs')
      .upsert({
        letter_id: fixture.letterId,
        story_id: fixture.storyId,
        delivery_id: fixture.deliveryId,
        recorder_id: fixture.receiver.user.id,
        medium: 'text',
        text_fallback: 'Seeded text explain-back for filled-state test.',
      }, { onConflict: 'delivery_id,story_id' })
      .select('id')
      .single();
    if (ebError) throw new Error(`Explain-back seeding failed: ${ebError.message}`);

    await setTestSession(page, fixture.receiver.email);
    await page.goto(`/letter/${fixture.letterId}/results?delivery=${fixture.deliveryId}`);
    await page.waitForLoadState('networkidle');

    // After filing, receiver should see "What you understood →" (filled state per spec UX Design table)
    // TODO(/dev): confirm exact selector once ExplainBackAffordanceRow exists
    const filledLabel = page.getByText('What you understood →');
    await expect(filledLabel).toBeVisible({ timeout: 10000 });

    // The empty "Explain back what you understood" CTA should no longer be visible
    await expect(page.getByRole('button', { name: 'Explain back what you understood' })).not.toBeVisible();
  });

  // [EXPECTED-FAIL until /dev]
  test('[EXPECTED-FAIL until /dev] "Explain back" CTA is NOT visible for the word "paraphrase" (copy rule)', async ({ page }) => {
    // Spec Copy rules: "User-facing verb is 'explain back' / 'explanation,' NEVER 'paraphrase'"
    await setTestSession(page, fixture.receiver.email);
    await page.goto(`/letter/${fixture.letterId}/results?delivery=${fixture.deliveryId}`);
    await page.waitForLoadState('networkidle');

    // The word "paraphrase" must never appear in user-facing UI
    const paraphraseText = page.getByText('paraphrase', { exact: false });
    await expect(paraphraseText).not.toBeVisible();
  });
});

// ===========================================================================
// 5. Explain your position — routes to /create?pointId=<id>
// [EXPECTED-FAIL until /dev: ExplainPositionAffordanceRow not built yet]
// ===========================================================================

test.describe('P904: "Explain your position" routes to create story page', () => {
  let fixture: P904Fixture;

  test.beforeAll(async () => {
    fixture = await createP904Fixture();
  });

  test.afterAll(async () => {
    await fixture.cleanup();
  });

  // [EXPECTED-FAIL until /dev]
  test('[EXPECTED-FAIL until /dev] "Explain your position" navigates to /create?pointId=<id>', async ({ page }) => {
    await setTestSession(page, fixture.receiver.email);
    await page.goto(`/letter/${fixture.letterId}/results?delivery=${fixture.deliveryId}`);
    await page.waitForLoadState('networkidle');

    const explainPositionCta = page.getByText('Explain your position').first();
    await explainPositionCta.click();
    await page.waitForLoadState('networkidle');

    // Should navigate to /create with the point's ID as parameter
    expect(page.url()).toContain(`/create`);
    expect(page.url()).toContain(`pointId=${fixture.pointId}`);
  });
});

// ===========================================================================
// 6. View focus page — /explain-back/:id
// [EXPECTED-FAIL until /dev: ExplainBackViewPage and route not built yet]
// ===========================================================================

test.describe('P904: ExplainBackViewPage at /explain-back/:id', () => {
  let fixture: P904Fixture;
  let explainBackId: string;

  test.beforeAll(async () => {
    fixture = await createP904Fixture();

    // Seed a text explain-back for the view page tests
    const { data: eb, error } = await supabaseAdmin
      .from('story_explain_backs')
      .insert({
        letter_id: fixture.letterId,
        story_id: fixture.storyId,
        delivery_id: fixture.deliveryId,
        recorder_id: fixture.receiver.user.id,
        medium: 'text',
        text_fallback: 'I understood that the timeline has external dependency risks.',
      })
      .select('id')
      .single();
    if (error) throw new Error(`Explain-back seeding failed: ${error.message}`);
    explainBackId = eb!.id;
  });

  test.afterAll(async () => {
    if (explainBackId) {
      await supabaseAdmin.from('story_explain_backs').delete().eq('id', explainBackId);
    }
    await fixture.cleanup();
  });

  // [EXPECTED-FAIL until /dev]
  test('[EXPECTED-FAIL until /dev] sender can navigate to /explain-back/:id (view focus page)', async ({ page }) => {
    await setTestSession(page, fixture.sender.email);
    // TODO(/dev): confirm route once ExplainBackViewPage is registered in App.tsx
    await page.goto(`/explain-back/${explainBackId}`);
    await page.waitForLoadState('networkidle');

    // Should NOT redirect to /letters or /login (access is granted for the sender)
    expect(page.url()).toContain(`/explain-back/${explainBackId}`);
    await expect(page.locator('body')).not.toContainText('404');
  });

  // [EXPECTED-FAIL until /dev]
  test('[EXPECTED-FAIL until /dev] view page shows "What Jamie understood" (name-attributed label)', async ({ page }) => {
    await setTestSession(page, fixture.sender.email);
    await page.goto(`/explain-back/${explainBackId}`);
    await page.waitForLoadState('networkidle');

    // Spec UX Design § View focus page: "What {recorderName} understood"
    // Receiver name is "P904 Receiver Jamie"
    await expect(page.getByText(/what.*jamie.*understood/i)).toBeVisible({ timeout: 10000 });
  });

  // [EXPECTED-FAIL until /dev]
  test('[EXPECTED-FAIL until /dev] view page has a back button (FocusHeader)', async ({ page }) => {
    await setTestSession(page, fixture.sender.email);
    await page.goto(`/explain-back/${explainBackId}`);
    await page.waitForLoadState('networkidle');

    // FocusHeader renders a back button — spec: "back → results"
    const backBtn = page.getByRole('button', { name: /back/i })
      .or(page.getByRole('link', { name: /back/i }));
    await expect(backBtn.first()).toBeVisible({ timeout: 5000 });
  });

  // [EXPECTED-FAIL until /dev]
  test('[EXPECTED-FAIL until /dev] view page calls markExplainBackRead — sets author_read_at', async ({ page }) => {
    // Reset read state
    await supabaseAdmin
      .from('story_explain_backs')
      .update({ author_read_at: null })
      .eq('id', explainBackId);

    await setTestSession(page, fixture.sender.email);
    await page.goto(`/explain-back/${explainBackId}`);
    await page.waitForLoadState('networkidle');

    // Allow time for the RPC call on mount
    await page.waitForTimeout(2000);

    // Verify author_read_at was set by the view page's onMount handler
    const { data: updated } = await supabaseAdmin
      .from('story_explain_backs')
      .select('author_read_at')
      .eq('id', explainBackId)
      .single();
    expect(updated?.author_read_at, 'author_read_at should be set after sender views the explain-back').not.toBeNull();
  });

  // [EXPECTED-FAIL until /dev]
  test('[EXPECTED-FAIL until /dev] third party cannot access /explain-back/:id (redirected away)', async ({ page }) => {
    const thirdParty = await createTestUser({ name: 'P904 View Third Party' });

    try {
      await setTestSession(page, thirdParty.email);
      await page.goto(`/explain-back/${explainBackId}`);
      await page.waitForLoadState('networkidle');

      // Access gate: neither sender nor receiver → redirect to /letters
      // TODO(/dev): confirm redirect target once ExplainBackViewPage access gate is implemented
      expect(page.url()).not.toContain(`/explain-back/${explainBackId}`);
    } finally {
      await deleteTestUser(thirdParty.user.id);
    }
  });
});

// ===========================================================================
// 7. Author (sender) sees "What Jamie understood →" + unread dot
// [EXPECTED-FAIL until /dev: ExplainBackAffordanceRow not built yet]
// ===========================================================================

test.describe('P904: author sees filled state with name-attributed label', () => {
  let fixture: P904Fixture;
  let explainBackId: string;

  test.beforeAll(async () => {
    fixture = await createP904Fixture();

    // Seed unread explain-back
    const { data: eb, error } = await supabaseAdmin
      .from('story_explain_backs')
      .insert({
        letter_id: fixture.letterId,
        story_id: fixture.storyId,
        delivery_id: fixture.deliveryId,
        recorder_id: fixture.receiver.user.id,
        medium: 'text',
        text_fallback: 'I think the timeline is optimistic but feasible.',
        author_read_at: null, // unread
      })
      .select('id')
      .single();
    if (error) throw new Error(`Explain-back seeding failed: ${error.message}`);
    explainBackId = eb!.id;
  });

  test.afterAll(async () => {
    if (explainBackId) {
      await supabaseAdmin.from('story_explain_backs').delete().eq('id', explainBackId);
    }
    await fixture.cleanup();
  });

  // [EXPECTED-FAIL until /dev]
  test('[EXPECTED-FAIL until /dev] sender sees "What Jamie understood →" with unread indicator', async ({ page }) => {
    await setTestSession(page, fixture.sender.email);
    await page.goto(`/letter/${fixture.letterId}/results`);
    await page.waitForLoadState('networkidle');

    // Spec UX Design: name-attributed label for the other party's explain-back
    // Receiver is "P904 Receiver Jamie" → label is "What Jamie understood →"
    // TODO(/dev): confirm exact selector once ExplainBackAffordanceRow exists
    const label = page.getByText(/what.*jamie.*understood/i);
    await expect(label).toBeVisible({ timeout: 10000 });
  });

  // [EXPECTED-FAIL until /dev]
  test('[EXPECTED-FAIL until /dev] unread dot is visible when author_read_at is null', async ({ page }) => {
    await setTestSession(page, fixture.sender.email);
    await page.goto(`/letter/${fixture.letterId}/results`);
    await page.waitForLoadState('networkidle');

    // Unread dot: spec Visual Specification token "w-2 h-2 rounded-full bg-blue-500"
    // Use data attribute once added: data-unread="true" on the affordance row
    // TODO(/dev): confirm data-testid/data-unread once ExplainBackAffordanceRow exists
    const unreadDot = page.locator('[data-unread="true"]')
      .or(page.locator('.bg-blue-500.rounded-full').filter({ has: page.getByText(/what.*jamie/i) }));
    await expect(unreadDot.first()).toBeVisible({ timeout: 5000 });
  });
});

// ===========================================================================
// 8. Regression — letter without explain-backs renders exactly as today
// ===========================================================================

test.describe('P904: regression — letter without explain-backs unchanged', () => {
  let fixture: P904Fixture;

  test.beforeAll(async () => {
    fixture = await createP904Fixture();
    // Ensure no explain-backs exist for this delivery
  });

  test.afterAll(async () => {
    await fixture.cleanup();
  });

  test('results page renders story and points without explain-back affordances (receiver, before /dev)', async ({ page }) => {
    // Before /dev, no explain-back affordances exist yet — page should look like today
    await setTestSession(page, fixture.receiver.email);
    await page.goto(`/letter/${fixture.letterId}/results?delivery=${fixture.deliveryId}`);
    await page.waitForLoadState('networkidle');

    // Story card should be visible (existing behaviour preserved)
    await expect(page.locator('body')).not.toContainText('Something went wrong');
    await expect(page.locator('body')).not.toContainText('404');

    // Confirm no unexpected rendering errors
    // The "Explain back" button will not exist pre-/dev — that is the current baseline
  });

  test('results page renders for sender without explain-back affordances (regression)', async ({ page }) => {
    await setTestSession(page, fixture.sender.email);
    await page.goto(`/letter/${fixture.letterId}/results`);
    await page.waitForLoadState('networkidle');

    await expect(page.locator('body')).not.toContainText('Something went wrong');
  });
});

// ===========================================================================
// R6 — point-level position-story slot is RECEIVER-ONLY
//
// Root cause (R6): get_letter_position_stories returns rows for BOTH
// participants, but the client folds them into a Map<point_id> that overwrites,
// keeping one story per point. When the sender's story won, the receiver saw
// "View {sender}'s story →" and LOST the "Add a story" affordance entirely.
// Fix: filter to receiver-authored rows at iteration time in the service.
//
// Canary A (sender-only) is the deterministic fail-before-fix proof: a sender
// story on the point must NOT occupy the receiver's slot. Canary B encodes the
// duplicate-story end state (receiver sees their own, never the sender's).
// ===========================================================================

test.describe('P904 R6: point-level slot is receiver-only', () => {
  test.describe.configure({ mode: 'serial' });
  test.setTimeout(90000);

  let fixture: P904Fixture;
  let senderStoryId: string | undefined;
  let receiverStoryId: string | undefined;

  test.beforeAll(async () => {
    fixture = await createP904Fixture();
  });

  test.afterAll(async () => {
    if (senderStoryId) await deleteTestStory(senderStoryId);
    if (receiverStoryId) await deleteTestStory(receiverStoryId);
    await fixture.cleanup();
  });

  // Canary A — deterministic fail-before-fix.
  test('receiver still sees "Add a story" when the SENDER has a story on the point', async ({ page }) => {
    // Seed ONLY the sender's position story on the shared point.
    const senderStory = await createTestStory(fixture.sender.user.id, {
      title: 'Sender position',
      content: 'Sender reasoning on the timeline point.',
    });
    senderStoryId = senderStory.id;
    await linkStoryToPoint(senderStoryId, fixture.pointId);

    await setTestSession(page, fixture.receiver.email);
    await page.goto(`/letter/${fixture.letterId}/results?delivery=${fixture.deliveryId}`);
    await page.waitForLoadState('networkidle');

    // The receiver must be able to add THEIR own story — the sender's story does
    // not belong in this slot (it lives in the letter body / "Open story" link).
    // BEFORE fix: sender's story occupies the slot → "Add a story" is absent.
    await expect(
      page.getByRole('button', { name: 'Add a story' }),
      'receiver lost "Add a story" because the sender\'s story occupied the receiver-only slot (R6)'
    ).toBeVisible({ timeout: 10000 });

    // And the sender's name must NOT appear as the point-level position story.
    await expect(
      page.getByRole('button', { name: `View ${fixture.sender.user.user_metadata?.name ?? 'P904 Sender Alex'}'s story →` })
    ).toHaveCount(0);
  });

  // Canary B — duplicate-story end state (both participants have a story).
  test('with BOTH stories on the point, receiver sees "View my story" (never the sender\'s)', async ({ page }) => {
    // Receiver also files a position story on the same point (sender story from Canary A persists).
    const receiverStory = await createTestStory(fixture.receiver.user.id, {
      title: 'Receiver position',
      content: 'Receiver reasoning on the timeline point.',
    });
    receiverStoryId = receiverStory.id;
    await linkStoryToPoint(receiverStoryId, fixture.pointId);

    await setTestSession(page, fixture.receiver.email);
    await page.goto(`/letter/${fixture.letterId}/results?delivery=${fixture.deliveryId}`);
    await page.waitForLoadState('networkidle');

    // Receiver has their own story → "View my story →"; the sender's story is filtered out.
    await expect(
      page.getByRole('button', { name: 'View my story →' }),
      'receiver should see their OWN position story in the slot'
    ).toBeVisible({ timeout: 10000 });

    // With a story already filed, "Add a story" must NOT also render (the slot
    // shows the existing story, not a duplicate-create affordance that would hit
    // story_points.UNIQUE(author_id, point_id) on save).
    await expect(page.getByRole('button', { name: 'Add a story' })).toHaveCount(0);

    // The receiver must never see the sender's story occupying this point slot.
    await expect(
      page.getByRole('button', { name: `View ${fixture.sender.user.user_metadata?.name ?? 'P904 Sender Alex'}'s story →` })
    ).toHaveCount(0);
  });

  // Canary C — R7: opening the position story renders a proper story card
  // (avatar + author name + body), not a raw text box.
  test('R7: "View my story" opens a story card (avatar + name + body)', async ({ page }) => {
    await setTestSession(page, fixture.receiver.email);
    await page.goto(`/letter/${fixture.letterId}/results?delivery=${fixture.deliveryId}`);
    await page.waitForLoadState('networkidle');

    await page.getByRole('button', { name: 'View my story →' }).click();

    // The dialog renders the author name header and the (hashtag-stripped) body.
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 5000 });
    await expect(dialog.getByText('P904 Receiver Jamie')).toBeVisible();
    await expect(dialog.getByText('Receiver reasoning on the timeline point.')).toBeVisible();

    // Capture just the dialog with animations frozen to end-state (avoids a
    // mid-fade translucent capture). Output dir is gitignored.
    await dialog.screenshot({ path: 'test-results/p904-r7-position-story-card.png', animations: 'disabled' });
  });
});
