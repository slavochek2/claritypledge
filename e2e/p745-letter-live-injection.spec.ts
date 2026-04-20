/**
 * E2E tests for P745: Letter-hosted /live injection with pause/resume.
 *
 * Coverage:
 * - Smoke: letter reading page loads, no console errors
 * - Author trigger: "Start Clarity Live now" button visible on per-recipient surface
 * - Author trigger: disabled with tooltip "Invite already pending" when invite exists
 * - Receiver banner: appears in realtime when invite is seeded (two-party)
 * - Receiver banner: exact UI copy from spec UI Contract
 * - Receiver banner: Later (defer) dismisses locally; invite persists
 * - Pause state: accept captures current story index in letter_deliveries.saved_story_index
 * - Return affordance: "Welcome back — continuing your letter" appears after /live complete
 * - Guest exclusion: unverified guest sees NO banner
 * - Regression: P703 inbox-based invite still appears in inbox tab
 * - One outstanding invite: second trigger does not create duplicate row
 *
 * Two-party tests use waitForUIUpdate() — no page.reload() (banned per tests.md).
 */

import { test, expect } from '@playwright/test';
import { supabaseAdmin } from './helpers/supabase-admin';
import {
  createTestUser,
  deleteTestUser,
  setTestSession,
  type TestUser,
} from './helpers/test-user';
import {
  createTestLetter,
  createTestDelivery,
  createTestStorySnapshot,
  sealTestLetter,
  deleteTestLetter,
} from './helpers/test-letter';
import { createTestStory, deleteTestStory } from './helpers/test-story';
import { waitForUIUpdate } from './helpers/test-realtime';

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function seedDocAndSealedLetter(opts: {
  senderId: string;
  receiverEmail: string;
  receiverProfileId: string;
}) {
  const { data: doc, error: docError } = await supabaseAdmin
    .from('clarity_docs')
    .insert({ title: `P745 E2E Doc ${Date.now()}`, owner_id: opts.senderId })
    .select('id')
    .single();
  if (docError || !doc) throw new Error(`Doc creation failed: ${docError?.message}`);

  const story = await createTestStory(opts.senderId, {
    title: `P745 E2E Story ${Date.now()}`,
    summary: 'Test story for P745 live injection',
  });

  const { data: version } = await supabaseAdmin
    .from('story_versions')
    .select('id')
    .eq('story_id', story.id)
    .order('version_number', { ascending: true })
    .limit(1)
    .single();
  if (!version) throw new Error('story_versions row missing after story insert');

  const letter = await createTestLetter(opts.senderId, doc.id, { mode: 'one-to-one' });
  await createTestStorySnapshot(letter.id, story.id, version.id, {
    position: 0,
    pointConfig: {
      storyTitle: `P745 E2E Story ${Date.now()}`,
      storyText: 'Story text for testing.',
      points: [],
    },
  });
  const delivery = await createTestDelivery(letter.id, {
    receiverEmail: opts.receiverEmail,
    receiverProfileId: opts.receiverProfileId,
    status: 'in_progress',
  });
  await sealTestLetter(letter.id);

  return { docId: doc.id, letter, delivery, story, versionId: version.id };
}

async function seedOpenInvite(opts: {
  creatorProfileId: string;
  targetUserId: string;
  letterId?: string;
}): Promise<{ sessionId: string; inviteId: string; sessionCode: string }> {
  const code = `P745E${Date.now().toString(36).toUpperCase().slice(0, 4)}`;
  const { data: session, error: sessionError } = await supabaseAdmin
    .from('clarity_sessions')
    .insert({
      code,
      creator_name: 'P745 E2E Author',
      creator_profile_id: opts.creatorProfileId,
      target_listener_id: opts.targetUserId,
      source_letter_id: opts.letterId ?? null,
      live_state: { checksCount: 0 },
      last_activity_at: new Date().toISOString(),
    })
    .select('id, code')
    .single();
  if (sessionError || !session) throw new Error(`Session seed failed: ${sessionError?.message}`);

  const { data: invite, error: inviteError } = await supabaseAdmin
    .from('clarity_live_invites')
    .insert({ session_id: session.id, target_user_id: opts.targetUserId })
    .select('id')
    .single();
  if (inviteError || !invite) throw new Error(`Invite seed failed: ${inviteError?.message}`);

  return { sessionId: session.id, inviteId: invite.id, sessionCode: session.code };
}

async function closeInvite(inviteId: string) {
  await supabaseAdmin
    .from('clarity_live_invites')
    .update({ closed_at: new Date().toISOString() })
    .eq('id', inviteId);
}

// ─── Shared fixture ───────────────────────────────────────────────────────────

let author: TestUser;
let receiver: TestUser;
let docId: string;
let letterId: string;
let deliveryId: string;
let storyId: string;

test.beforeAll(async () => {
  [author, receiver] = await Promise.all([
    createTestUser({ name: 'P745 E2E Author' }),
    createTestUser({ name: 'P745 E2E Receiver' }),
  ]);

  const seeded = await seedDocAndSealedLetter({
    senderId: author.user.id,
    receiverEmail: receiver.email,
    receiverProfileId: receiver.user.id,
  });
  docId = seeded.docId;
  letterId = seeded.letter.id;
  deliveryId = seeded.delivery.id;
  storyId = seeded.story.id;
});

test.afterAll(async () => {
  await deleteTestLetter(letterId);
  await deleteTestStory(storyId);
  await supabaseAdmin.from('clarity_docs').delete().eq('id', docId);
  await Promise.all([deleteTestUser(author.user.id), deleteTestUser(receiver.user.id)]);
});

// =============================================================================
// Smoke test (first test in file — gates the rest)
// =============================================================================

test('smoke: letter reading page loads and has no console errors', async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on('console', msg => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });

  await setTestSession(page, receiver.email);
  await page.goto(`/letter/${deliveryId}`);
  await page.waitForLoadState('networkidle');

  await expect(page.locator('body')).toBeVisible();

  const appErrors = consoleErrors.filter(
    e => !e.includes('ResizeObserver') && !e.includes('favicon')
  );
  expect(appErrors, `Console errors on letter page: ${appErrors.join('\n')}`).toHaveLength(0);
});

// =============================================================================
// Author trigger: "Start Clarity Live now" button
// =============================================================================

test('author trigger button "Start Clarity Live now" is visible on per-recipient results page', async ({ page }) => {
  await setTestSession(page, author.email);
  await page.goto(`/letter/${letterId}/results?delivery=${deliveryId}`);
  await page.waitForLoadState('networkidle');

  const triggerButton = page.getByRole('button', { name: 'Start Clarity Live now' });
  await expect(triggerButton).toBeVisible({ timeout: 10000 });
});

test('author trigger button is enabled when no invite is pending', async ({ page }) => {
  await setTestSession(page, author.email);
  await page.goto(`/letter/${letterId}/results?delivery=${deliveryId}`);
  await page.waitForLoadState('networkidle');

  const triggerButton = page.getByRole('button', { name: 'Start Clarity Live now' });
  await expect(triggerButton).toBeEnabled({ timeout: 10000 });
});

test('author trigger button is disabled with tooltip "Invite already pending" when invite exists', async ({ page }) => {
  const { sessionId, inviteId } = await seedOpenInvite({
    creatorProfileId: author.user.id,
    targetUserId: receiver.user.id,
    letterId,
  });

  try {
    await setTestSession(page, author.email);
    await page.goto(`/letter/${letterId}/results?delivery=${deliveryId}`);
    await page.waitForLoadState('networkidle');

    const triggerButton = page.getByRole('button', { name: 'Start Clarity Live now' });
    await expect(triggerButton).toBeDisabled({ timeout: 10000 });

    const tooltipText =
      (await triggerButton.getAttribute('aria-label')) ??
      (await triggerButton.getAttribute('title')) ??
      '';
    expect(tooltipText).toContain('Invite already pending');
  } finally {
    await closeInvite(inviteId);
    await supabaseAdmin.from('clarity_sessions').delete().eq('id', sessionId);
  }
});

// =============================================================================
// Receiver banner: realtime appearance
// =============================================================================

test('receiver sees banner when author seeds invite — exact UI copy from spec', async ({ browser }) => {
  const receiverContext = await browser.newContext();
  const receiverPage = await receiverContext.newPage();

  let sessionId: string | undefined;
  let inviteId: string | undefined;

  try {
    await setTestSession(receiverPage, receiver.email);
    await receiverPage.goto(`/letter/${deliveryId}`);
    await receiverPage.waitForLoadState('networkidle');

    // Enter reading view — LetterLiveBanner lives inside LetterReadingFlow,
    // which only mounts when viewState === 'reading' (not on the cover).
    const openButton = receiverPage.getByRole('button', { name: 'Open the Letter' });
    await expect(openButton).toBeVisible({ timeout: 10000 });
    await openButton.click();
    await expect(openButton).not.toBeVisible({ timeout: 10000 });

    // Seed invite AFTER receiver is on the page (realtime delivery test)
    const seeded = await seedOpenInvite({
      creatorProfileId: author.user.id,
      targetUserId: receiver.user.id,
      letterId,
    });
    sessionId = seeded.sessionId;
    inviteId = seeded.inviteId;

    // Must arrive via Realtime — no page.reload()
    const bannerTitle = receiverPage.getByText('P745 E2E Author is inviting you to Clarity');
    await waitForUIUpdate(receiverPage, bannerTitle, 20000);

    const joinButton = receiverPage.getByRole('button', { name: 'Join' });
    await expect(joinButton).toBeVisible({ timeout: 5000 });

    const laterButton = receiverPage.getByRole('button', { name: 'Later' });
    await expect(laterButton).toBeVisible({ timeout: 5000 });
  } finally {
    if (inviteId) await closeInvite(inviteId);
    if (sessionId) await supabaseAdmin.from('clarity_sessions').delete().eq('id', sessionId);
    await receiverContext.close();
  }
});

test('receiver banner disappears when author cancels invite (realtime)', async ({ browser }) => {
  const receiverContext = await browser.newContext();
  const receiverPage = await receiverContext.newPage();

  let sessionId: string | undefined;
  let inviteId: string | undefined;

  try {
    const seeded = await seedOpenInvite({
      creatorProfileId: author.user.id,
      targetUserId: receiver.user.id,
      letterId,
    });
    sessionId = seeded.sessionId;
    inviteId = seeded.inviteId;

    await setTestSession(receiverPage, receiver.email);
    await receiverPage.goto(`/letter/${deliveryId}`);
    await receiverPage.waitForLoadState('networkidle');

    // Enter reading view so LetterLiveBanner mounts.
    const openButton = receiverPage.getByRole('button', { name: 'Open the Letter' });
    await expect(openButton).toBeVisible({ timeout: 10000 });
    await openButton.click();
    await expect(openButton).not.toBeVisible({ timeout: 10000 });

    const bannerTitle = receiverPage.getByText('P745 E2E Author is inviting you to Clarity');
    await expect(bannerTitle).toBeVisible({ timeout: 15000 });

    // Author cancels
    await closeInvite(inviteId);

    // Banner should disappear in realtime — no page.reload()
    await expect(bannerTitle).not.toBeVisible({ timeout: 20000 });
  } finally {
    if (inviteId) await closeInvite(inviteId);
    if (sessionId) await supabaseAdmin.from('clarity_sessions').delete().eq('id', sessionId);
    await receiverContext.close();
  }
});

// =============================================================================
// Defer (Later): dismisses locally, invite persists in DB
// =============================================================================

test('clicking Later dismisses banner locally but invite persists in DB', async ({ browser }) => {
  const receiverContext = await browser.newContext();
  const receiverPage = await receiverContext.newPage();

  let sessionId: string | undefined;
  let inviteId: string | undefined;

  try {
    const seeded = await seedOpenInvite({
      creatorProfileId: author.user.id,
      targetUserId: receiver.user.id,
      letterId,
    });
    sessionId = seeded.sessionId;
    inviteId = seeded.inviteId;

    await setTestSession(receiverPage, receiver.email);
    await receiverPage.goto(`/letter/${deliveryId}`);
    await receiverPage.waitForLoadState('networkidle');

    const bannerTitle = receiverPage.getByText('P745 E2E Author is inviting you to Clarity');
    await expect(bannerTitle).toBeVisible({ timeout: 15000 });

    await receiverPage.getByRole('button', { name: 'Later' }).click();

    await expect(bannerTitle).not.toBeVisible({ timeout: 5000 });

    // Invite row still in DB with closed_at=NULL (not cancelled)
    const { data: inviteRow } = await supabaseAdmin
      .from('clarity_live_invites')
      .select('closed_at')
      .eq('id', inviteId)
      .single();
    expect(inviteRow?.closed_at).toBeNull();
  } finally {
    if (inviteId) await closeInvite(inviteId);
    if (sessionId) await supabaseAdmin.from('clarity_sessions').delete().eq('id', sessionId);
    await receiverContext.close();
  }
});

// =============================================================================
// Pause state: accept saves story index to letter_deliveries
// =============================================================================

test('accepting invite saves current story index to letter_deliveries.saved_story_index', async ({ browser }) => {
  const receiverContext = await browser.newContext();
  const receiverPage = await receiverContext.newPage();

  let sessionId: string | undefined;
  let inviteId: string | undefined;

  try {
    const seeded = await seedOpenInvite({
      creatorProfileId: author.user.id,
      targetUserId: receiver.user.id,
      letterId,
    });
    sessionId = seeded.sessionId;
    inviteId = seeded.inviteId;

    await setTestSession(receiverPage, receiver.email);
    await receiverPage.goto(`/letter/${deliveryId}`);
    await receiverPage.waitForLoadState('networkidle');

    const bannerTitle = receiverPage.getByText('P745 E2E Author is inviting you to Clarity');
    await expect(bannerTitle).toBeVisible({ timeout: 15000 });

    await receiverPage.getByRole('button', { name: 'Join' }).click();

    // Wait for async write to complete
    await receiverPage.waitForTimeout(2000);

    const { data: deliveryRow } = await supabaseAdmin
      .from('letter_deliveries')
      .select('saved_story_index')
      .eq('id', deliveryId)
      .single();

    expect(
      deliveryRow?.saved_story_index,
      'saved_story_index should be set after receiver clicks Join'
    ).not.toBeNull();
    expect(deliveryRow?.saved_story_index).toBeGreaterThanOrEqual(0);
    expect(deliveryRow?.saved_story_index).toBeLessThanOrEqual(999);
  } finally {
    await supabaseAdmin
      .from('letter_deliveries')
      .update({ saved_story_index: null })
      .eq('id', deliveryId);
    if (inviteId) await closeInvite(inviteId);
    if (sessionId) await supabaseAdmin.from('clarity_sessions').delete().eq('id', sessionId);
    await receiverContext.close();
  }
});

// =============================================================================
// Return affordance: "Welcome back — continuing your letter"
// =============================================================================

test('return affordance "Welcome back — continuing your letter" appears after /live completes', async ({ page }) => {
  await supabaseAdmin
    .from('letter_deliveries')
    .update({ saved_story_index: 0 })
    .eq('id', deliveryId);

  try {
    await setTestSession(page, receiver.email);
    await page.goto(`/letter/${deliveryId}?returnFromLive=1`);
    await page.waitForLoadState('networkidle');

    const returnAffordance = page.getByText('Welcome back — continuing your letter');
    await expect(returnAffordance).toBeVisible({ timeout: 10000 });
  } finally {
    await supabaseAdmin
      .from('letter_deliveries')
      .update({ saved_story_index: null })
      .eq('id', deliveryId);
  }
});

// =============================================================================
// Guest exclusion: unverified guest sees NO banner
// =============================================================================

test('unverified guest sees no injection banner (structural gate via useOpenLiveInvite)', async ({ page }) => {
  let sessionId: string | undefined;
  let inviteId: string | undefined;

  try {
    const seeded = await seedOpenInvite({
      creatorProfileId: author.user.id,
      targetUserId: receiver.user.id,
      letterId,
    });
    sessionId = seeded.sessionId;
    inviteId = seeded.inviteId;

    // Navigate without authentication (anonymous/guest)
    await page.goto(`/letter/${deliveryId}`);
    await page.waitForLoadState('networkidle');

    await expect(page.locator('body')).toBeVisible();
    await expect(
      page.getByText('is inviting you to Clarity')
    ).not.toBeVisible({ timeout: 5000 });
  } finally {
    if (inviteId) await closeInvite(inviteId);
    if (sessionId) await supabaseAdmin.from('clarity_sessions').delete().eq('id', sessionId);
  }
});

// =============================================================================
// Regression: P703 inbox-based invite still appears in inbox
// =============================================================================

test('P703 regression: inbox-based invite still visible in letters inbox tab', async ({ page }) => {
  let sessionId: string | undefined;
  let inviteId: string | undefined;

  try {
    const seeded = await seedOpenInvite({
      creatorProfileId: author.user.id,
      targetUserId: receiver.user.id,
    });
    sessionId = seeded.sessionId;
    inviteId = seeded.inviteId;

    await setTestSession(page, receiver.email);
    await page.goto('/letters?tab=inbox');
    await page.waitForLoadState('networkidle');

    const joinButton = page.getByRole('button', { name: 'Join' }).or(
      page.getByRole('link', { name: 'Join' })
    );
    await expect(joinButton.first()).toBeVisible({ timeout: 10000 });
  } finally {
    if (inviteId) await closeInvite(inviteId);
    if (sessionId) await supabaseAdmin.from('clarity_sessions').delete().eq('id', sessionId);
  }
});

// =============================================================================
// One outstanding invite guard: second trigger does not create duplicate
// =============================================================================

test('one outstanding invite per delivery — DB unique partial index enforced', async () => {
  const seeded = await seedOpenInvite({
    creatorProfileId: author.user.id,
    targetUserId: receiver.user.id,
    letterId,
  });

  try {
    const { error } = await supabaseAdmin
      .from('clarity_live_invites')
      .insert({
        session_id: seeded.sessionId,
        target_user_id: receiver.user.id,
        // closed_at not set → open invite → partial unique index fires
      });

    expect(
      error,
      'idx_live_invites_one_open_per_user partial unique index missing — ' +
      'two open invites for same listener were allowed. Run: ./scripts/migrate.sh'
    ).not.toBeNull();
    expect(error?.code).toBe('23505');
  } finally {
    await closeInvite(seeded.inviteId);
    await supabaseAdmin.from('clarity_sessions').delete().eq('id', seeded.sessionId);
  }
});
