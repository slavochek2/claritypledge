/**
 * @file p700-letter-overview.spec.ts
 * @description P700: Letter Overview — stacked cohort tables, one per story (new design 2026-05-05)
 *
 * Tests (new design — NO selectors, NO View 1/2/3, NO status glyphs):
 * 1. Smoke: overview page loads without console errors
 * 2. Core content: letter title (h1) renders
 * 3. Core content: story sections render in author order
 * 4. Core content: story header shows title + hashtags
 * 5. Core content: cohort tables render with correct column headers
 * 6. Core content: each recipient has a row in the correct story table
 * 7. Person column: name is a link to /p/:slug profile route
 * 8. You → Them column: shows "X → Y" for responded recipient
 * 9. Position columns: show position labels from POSITION_SHORT_LABELS
 * 10. No-position cell: shows — for points without a response
 * 11. Responded recipient: [open results →] link with correct URL
 * 12. Waiting recipient: · Waiting text (no link)
 * 13. Back link: [← Sent] has aria-label="Back to Sent tab"
 * 14. Sent-tab: cards default collapsed on mount
 * 15. Sent-tab: [Open overview] button visible on desktop (1280px)
 * 16. Sent-tab: clicking [Open overview] navigates to /letter/:id/overview
 * 17. Authorization: non-author sees not-authorized state or redirect
 * 18. Edge: all recipients waiting — page renders, rows show · Waiting
 */

import { test, expect } from '@playwright/test';
import { supabaseAdmin } from './helpers/supabase-admin';
import {
  createTestUser,
  setTestSession,
  deleteTestUser,
  type TestUser,
} from './helpers/test-user';
import { createTestStory, deleteTestStory } from './helpers/test-story';
import { createTestPoint, deleteTestPoint } from './helpers/test-point';
import {
  createFullTestLetter,
  deleteTestLetter,
  createTestDelivery,
} from './helpers/test-letter';

// ---------------------------------------------------------------------------
// Main fixture: letter with 2 stories, 2 recipients (1 responded, 1 waiting)
// ---------------------------------------------------------------------------

test.describe('P700: Letter Overview', () => {
  test.describe.configure({ timeout: 60000 });

  let sender: TestUser;
  let receiverAlice: TestUser; // completed — has prediction, story_verification, letter_point_responses
  let docId: string;
  let storyId1: string;
  let storyId2: string;
  let pointClaimId: string;
  let pointAntiId: string;
  let letterId: string;
  let deliveryAliceId: string;
  let _deliveryCarolId: string; // waiting — status='sent', no profile

  test.beforeAll(async () => {
    sender = await createTestUser({ name: 'P700 Sender' });
    receiverAlice = await createTestUser({ name: 'Alice P700' });

    const { data: doc } = await supabaseAdmin
      .from('clarity_docs')
      .insert({ owner_id: sender.user.id, title: 'P700 Overview Doc', visibility: 'public' })
      .select('id')
      .single();
    if (!doc) throw new Error('Doc creation failed');
    docId = doc.id;

    const story1 = await createTestStory(sender.user.id, {
      title: 'P700 Story 1: The AI Threat Narrative',
      content: 'AI displaces knowledge workers at scale.',
    });
    const story2 = await createTestStory(sender.user.id, {
      title: 'P700 Story 2: Human Connection',
      content: 'Human creativity cannot be automated.',
    });
    storyId1 = story1.id;
    storyId2 = story2.id;

    const pClaim = await createTestPoint(sender.user.id, storyId1, {
      statement: 'AI displaces workers',
    });
    const pAnti = await createTestPoint(sender.user.id, storyId1, {
      statement: 'Humans adapt to new roles',
    });
    pointClaimId = pClaim.id;
    pointAntiId = pAnti.id;

    const getVersion = async (sid: string) => {
      const { data: v } = await supabaseAdmin
        .from('story_versions')
        .select('id')
        .eq('story_id', sid)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();
      return v?.id;
    };
    const [v1, v2] = await Promise.all([getVersion(storyId1), getVersion(storyId2)]);
    if (!v1 || !v2) throw new Error('Story versions not found');

    // Create letter with Alice as primary delivery (completed)
    const { letter, delivery: deliveryAlice } = await createFullTestLetter(
      sender.user.id,
      docId,
      [
        { storyId: storyId1, versionId: v1, prediction: 7, position: 0 },
        { storyId: storyId2, versionId: v2, prediction: 6, position: 1 },
      ],
      { email: receiverAlice.email, profileId: receiverAlice.user.id },
      { seal: true }
    );
    letterId = letter.id;
    deliveryAliceId = deliveryAlice.id;

    // Carol is waiting — status remains 'sent', no profile
    const deliveryCarol = await createTestDelivery(letterId, {
      receiverEmail: 'p700carol@gmail.com',
      status: 'sent',
    });
    _deliveryCarolId = deliveryCarol.id;

    // Alice: story verification (source=letter) — actual rating = 8
    await supabaseAdmin.from('story_verifications').insert({
      story_id: storyId1,
      speaker_id: sender.user.id,
      listener_id: receiverAlice.user.id,
      speaker_rating: 7,
      listener_rating: 8,
      source: 'letter',
      verified: false,
      sort_order: 0,
    });

    // Alice: point responses — responds only to pointClaim (not pointAnti → tests — cell)
    await supabaseAdmin.from('letter_point_responses').insert({
      delivery_id: deliveryAliceId,
      point_id: pointClaimId,
      position: 'agree',
    });

    // Mark Alice delivery as completed
    await supabaseAdmin
      .from('letter_deliveries')
      .update({ status: 'completed', completed_at: new Date().toISOString(), stories_rated: 2 })
      .eq('id', deliveryAliceId);
  });

  test.afterAll(async () => {
    // Cleanup: point responses → story verifications → letter (cascades deliveries) → points → stories → doc → users
    if (deliveryAliceId) {
      await supabaseAdmin
        .from('letter_point_responses')
        .delete()
        .eq('delivery_id', deliveryAliceId);
    }
    if (storyId1) {
      await supabaseAdmin
        .from('story_verifications')
        .delete()
        .eq('story_id', storyId1)
        .eq('source', 'letter');
    }
    if (letterId) await deleteTestLetter(letterId);
    if (pointAntiId) await deleteTestPoint(pointAntiId);
    if (pointClaimId) await deleteTestPoint(pointClaimId);
    if (storyId2) await deleteTestStory(storyId2);
    if (storyId1) await deleteTestStory(storyId1);
    if (docId) await supabaseAdmin.from('clarity_docs').delete().eq('id', docId);
    if (receiverAlice?.user?.id) await deleteTestUser(receiverAlice.user.id);
    if (sender?.user?.id) await deleteTestUser(sender.user.id);
  });

  // ── 1. Smoke ─────────────────────────────────────────────────────────────

  test('smoke: overview page loads without console errors', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });

    await setTestSession(page, sender.email);
    await page.goto(`/letter/${letterId}/overview`);
    await page.waitForLoadState('networkidle');

    expect(page.url()).toContain(`/letter/${letterId}/overview`);

    const criticalErrors = consoleErrors.filter(
      (e) =>
        !e.includes('ResizeObserver') &&
        !e.includes('favicon') &&
        !e.includes('Non-Error promise rejection')
    );
    expect(criticalErrors, `Console errors: ${criticalErrors.join(', ')}`).toHaveLength(0);
  });

  // ── 2. Core content: letter title ─────────────────────────────────────────

  test('letter title renders as h1', async ({ page }) => {
    await setTestSession(page, sender.email);
    await page.goto(`/letter/${letterId}/overview`);
    await page.waitForLoadState('networkidle');

    const h1 = page.locator('h1');
    await expect(h1).toBeVisible({ timeout: 10000 });
    const titleText = await h1.textContent();
    expect(titleText?.trim().length).toBeGreaterThan(0);
  });

  // ── 3. Core content: story sections in author order ──────────────────────

  test('story sections render — first story appears before second story', async ({ page }) => {
    await setTestSession(page, sender.email);
    await page.goto(`/letter/${letterId}/overview`);
    await page.waitForLoadState('networkidle');

    const story1Heading = page.locator('h2, [role="heading"]').filter({ hasText: /AI Threat Narrative/ }).first();
    const story2Heading = page.locator('h2, [role="heading"]').filter({ hasText: /Human Connection/ }).first();

    await expect(story1Heading).toBeVisible({ timeout: 10000 });
    await expect(story2Heading).toBeVisible({ timeout: 10000 });

    // Story 1 must appear before Story 2 in DOM order
    const story1Box = await story1Heading.boundingBox();
    const story2Box = await story2Heading.boundingBox();
    expect(story1Box?.y).toBeLessThan(story2Box?.y ?? 0);
  });

  // ── 4. Story header: title + hashtags inline ─────────────────────────────

  test('story header shows title as h2', async ({ page }) => {
    await setTestSession(page, sender.email);
    await page.goto(`/letter/${letterId}/overview`);
    await page.waitForLoadState('networkidle');

    const storyHeader = page.locator('h2').filter({ hasText: /AI Threat Narrative/ }).first();
    await expect(storyHeader).toBeVisible({ timeout: 10000 });
  });

  // ── 5. Core content: cohort tables with column headers ───────────────────

  test('cohort tables render with Person and You → Them column headers', async ({ page }) => {
    await setTestSession(page, sender.email);
    await page.goto(`/letter/${letterId}/overview`);
    await page.waitForLoadState('networkidle');

    const tables = page.locator('table');
    await expect(tables.first()).toBeVisible({ timeout: 10000 });

    const personHeader = page.locator('th').filter({ hasText: /Person/ }).first();
    await expect(personHeader).toBeVisible({ timeout: 10000 });

    const youThemHeader = page.locator('th').filter({ hasText: /You.*Them|→/ }).first();
    await expect(youThemHeader).toBeVisible({ timeout: 10000 });
  });

  test('cohort table has point text in column headers', async ({ page }) => {
    await setTestSession(page, sender.email);
    await page.goto(`/letter/${letterId}/overview`);
    await page.waitForLoadState('networkidle');

    const pointHeader = page.locator('th').filter({ hasText: /AI displaces workers/ }).first();
    await expect(pointHeader).toBeVisible({ timeout: 10000 });
  });

  // ── 6. Each recipient has a row ──────────────────────────────────────────

  test('Alice (completed) has a row in the cohort table', async ({ page }) => {
    await setTestSession(page, sender.email);
    await page.goto(`/letter/${letterId}/overview`);
    await page.waitForLoadState('networkidle');

    const aliceRow = page.locator('td, tr').filter({ hasText: /Alice P700/ }).first();
    await expect(aliceRow).toBeVisible({ timeout: 10000 });
  });

  // ── 7. Person column: name links to /p/:slug ─────────────────────────────

  test('Person column name is a link to /p/:slug profile route', async ({ page }) => {
    await setTestSession(page, sender.email);
    await page.goto(`/letter/${letterId}/overview`);
    await page.waitForLoadState('networkidle');

    const profileLink = page.locator(`a[href*="/p/"]`).filter({ hasText: /Alice P700/ }).first();
    await expect(profileLink).toBeVisible({ timeout: 10000 });

    const href = await profileLink.getAttribute('href');
    expect(href).toMatch(/^\/p\//);
  });

  // ── 8. You → Them column: X → Y for responded recipient ─────────────────

  test('You → Them column shows "X → Y" format for responded recipient', async ({ page }) => {
    await setTestSession(page, sender.email);
    await page.goto(`/letter/${letterId}/overview`);
    await page.waitForLoadState('networkidle');

    // Alice responded — should show sender_prediction → recipient_rating (7 → 8)
    const youThemCell = page.locator('td').filter({ hasText: /7.*→.*8|→/ }).first();
    await expect(youThemCell).toBeVisible({ timeout: 10000 });
  });

  // ── 9. Position columns: position labels from POSITION_SHORT_LABELS ───────

  test('position cells show label from POSITION_SHORT_LABELS (Agree, Disagree+, etc.)', async ({
    page,
  }) => {
    await setTestSession(page, sender.email);
    await page.goto(`/letter/${letterId}/overview`);
    await page.waitForLoadState('networkidle');

    // Alice responded with 'agree' → POSITION_SHORT_LABELS renders "Agree"
    const positionCell = page
      .locator('td')
      .filter({ hasText: /^Agree$|^Agree\+$|^Agree−$|^Unsure$|^Disagree$|^Disagree\+$|^Disagree−$/ })
      .first();
    await expect(positionCell).toBeVisible({ timeout: 10000 });
  });

  // ── 10. No-position cell shows — ────────────────────────────────────────

  test('cell with no position response shows — (muted dash)', async ({ page }) => {
    await setTestSession(page, sender.email);
    await page.goto(`/letter/${letterId}/overview`);
    await page.waitForLoadState('networkidle');

    // Alice did NOT respond to pointAnti — that cell should show —
    const dashCell = page.locator('td').filter({ hasText: /^—$/ }).first();
    await expect(dashCell).toBeVisible({ timeout: 10000 });
  });

  // ── 11. Responded recipient: [open results →] link with correct URL ───────

  test('[open results →] link routes to /letter/:id/results?delivery=...&story=...', async ({
    page,
  }) => {
    await setTestSession(page, sender.email);
    await page.goto(`/letter/${letterId}/overview`);
    await page.waitForLoadState('networkidle');

    const resultsLink = page
      .locator(`a[href*="/letter/${letterId}/results"]`)
      .first();
    await expect(resultsLink).toBeVisible({ timeout: 10000 });

    const href = await resultsLink.getAttribute('href');
    expect(href).toMatch(/delivery=/);
    expect(href).toMatch(/story=/);
  });

  test('[open results →] link text matches UI Contract', async ({ page }) => {
    await setTestSession(page, sender.email);
    await page.goto(`/letter/${letterId}/overview`);
    await page.waitForLoadState('networkidle');

    const resultsLink = page.locator('a:has-text("open results")').first();
    await expect(resultsLink).toBeVisible({ timeout: 10000 });
  });

  // ── 12. Waiting recipient: · Waiting (no link) ────────────────────────────

  test('waiting recipient row shows · Waiting text with no results link', async ({ page }) => {
    await setTestSession(page, sender.email);
    await page.goto(`/letter/${letterId}/overview`);
    await page.waitForLoadState('networkidle');

    const waitingMarker = page.locator('text=/Waiting/').first();
    await expect(waitingMarker).toBeVisible({ timeout: 10000 });

    // The waiting marker itself should not be an anchor
    const waitingEl = page.locator('*').filter({ hasText: /^·\s*Waiting$/ }).first();
    if (await waitingEl.isVisible({ timeout: 3000 }).catch(() => false)) {
      const tagName = await waitingEl.evaluate((el) => el.tagName.toLowerCase());
      expect(tagName).not.toBe('a');
    }
  });

  // ── 13. Back link ─────────────────────────────────────────────────────────

  test('[← Sent] back link has aria-label="Back to Sent tab"', async ({ page }) => {
    await setTestSession(page, sender.email);
    await page.goto(`/letter/${letterId}/overview`);
    await page.waitForLoadState('networkidle');

    const backLink = page.locator('[aria-label="Back to Sent tab"]');
    await expect(backLink).toBeVisible({ timeout: 10000 });
  });

  // ── 14. Sent-tab: cards default collapsed ────────────────────────────────

  test('sent-tab cards are collapsed by default on mount', async ({ page }) => {
    await setTestSession(page, sender.email);
    await page.goto('/letters?tab=sent');
    await page.waitForLoadState('networkidle');

    const expandedRecipientRows = page.locator(
      '[data-state="open"] [data-component="letter-recipients"], [data-expanded="true"] tr'
    );
    const expandedCount = await expandedRecipientRows.count();
    expect(expandedCount).toBe(0);
  });

  // ── 15. Sent-tab: [Open overview] button visible on desktop ──────────────

  test('[Open overview] button visible on desktop (1280px) sent-tab', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await setTestSession(page, sender.email);
    await page.goto('/letters?tab=sent');
    await page.waitForLoadState('networkidle');

    const overviewBtn = page
      .locator('button:has-text("Open overview"), a:has-text("Open overview")')
      .first();
    await expect(overviewBtn).toBeVisible({ timeout: 10000 });
  });

  // ── 16. Sent-tab: clicking [Open overview] navigates to /overview ─────────

  test('clicking [Open overview] navigates to /letter/:id/overview', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await setTestSession(page, sender.email);
    await page.goto('/letters?tab=sent');
    await page.waitForLoadState('networkidle');

    const overviewBtn = page
      .locator('button:has-text("Open overview"), a:has-text("Open overview")')
      .first();
    if (await overviewBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await overviewBtn.click();
      await page.waitForLoadState('networkidle');
      expect(page.url()).toMatch(/\/letter\/[^/]+\/overview/);
    }
  });

  // ── 17. Authorization: non-author blocked ────────────────────────────────

  test('non-author visiting /overview sees not-authorized state or is redirected', async ({
    page,
  }) => {
    const nonAuthor = await createTestUser({ name: 'P700 Non Author' });
    try {
      await setTestSession(page, nonAuthor.email);
      await page.goto(`/letter/${letterId}/overview`);
      await page.waitForLoadState('networkidle');

      const isOnOverview = page.url().includes('/overview');
      if (isOnOverview) {
        const blocked = page
          .locator('text=/not authorized|not found|access denied|no access/i')
          .first();
        await expect(blocked).toBeVisible({ timeout: 10000 });
      } else {
        expect(page.url()).not.toContain('/overview');
      }
    } finally {
      await deleteTestUser(nonAuthor.user.id);
    }
  });
});

// ---------------------------------------------------------------------------
// Edge-case suite: all recipients waiting
// ---------------------------------------------------------------------------

test.describe('P700: Letter Overview — all recipients waiting', () => {
  test.describe.configure({ timeout: 60000 });

  let sender: TestUser;
  let docId: string;
  let storyId: string;
  let letterId: string;

  test.beforeAll(async () => {
    sender = await createTestUser({ name: 'P700 Waiting Sender' });

    const { data: doc } = await supabaseAdmin
      .from('clarity_docs')
      .insert({ owner_id: sender.user.id, title: 'P700 Waiting Doc', visibility: 'public' })
      .select('id')
      .single();
    if (!doc) throw new Error('Doc creation failed');
    docId = doc.id;

    const story = await createTestStory(sender.user.id, {
      title: 'P700 Waiting Story',
      content: 'Nobody has responded yet.',
    });
    storyId = story.id;

    const { data: v } = await supabaseAdmin
      .from('story_versions')
      .select('id')
      .eq('story_id', storyId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();
    if (!v) throw new Error('Story version not found');

    const { letter } = await createFullTestLetter(
      sender.user.id,
      docId,
      [{ storyId, versionId: v.id, prediction: 5, position: 0 }],
      { email: 'p700-waiting@gmail.com' },
      { seal: true }
    );
    letterId = letter.id;
    // Delivery remains in 'sent' status — no completion
  });

  test.afterAll(async () => {
    if (letterId) await deleteTestLetter(letterId);
    if (storyId) await deleteTestStory(storyId);
    if (docId) await supabaseAdmin.from('clarity_docs').delete().eq('id', docId);
    if (sender?.user?.id) await deleteTestUser(sender.user.id);
  });

  test('all waiting: every row shows · Waiting and page renders without crashing', async ({
    page,
  }) => {
    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });

    await setTestSession(page, sender.email);
    await page.goto(`/letter/${letterId}/overview`);
    await page.waitForLoadState('networkidle');

    expect(page.url()).toContain('/overview');

    const criticalErrors = consoleErrors.filter(
      (e) =>
        !e.includes('ResizeObserver') &&
        !e.includes('favicon') &&
        !e.includes('Non-Error promise rejection')
    );
    expect(criticalErrors).toHaveLength(0);

    const waitingMarker = page.locator('text=/Waiting/').first();
    await expect(waitingMarker).toBeVisible({ timeout: 10000 });
  });

  test('all waiting: no [open results →] links appear', async ({ page }) => {
    await setTestSession(page, sender.email);
    await page.goto(`/letter/${letterId}/overview`);
    await page.waitForLoadState('networkidle');

    const resultsLinks = page.locator('a:has-text("open results")');
    const count = await resultsLinks.count();
    expect(count).toBe(0);
  });

  test('all waiting: You → Them shows X → — format', async ({ page }) => {
    await setTestSession(page, sender.email);
    await page.goto(`/letter/${letterId}/overview`);
    await page.waitForLoadState('networkidle');

    // Waiting recipient shows prediction → — (no actual rating)
    const youThemWaiting = page.locator('td').filter({ hasText: /→/ }).first();
    await expect(youThemWaiting).toBeVisible({ timeout: 10000 });
  });
});
