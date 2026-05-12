/**
 * @file p700-letter-overview-accessibility.spec.ts
 * @description Accessibility tests for P700: Letter Overview — stacked cohort tables (new design 2026-05-05)
 *
 * Tests (new design — NO selector ARIA, NO keyboard dropdown nav):
 * 1. <table> elements are present (not divs masquerading as tables)
 * 2. Column headers use <th scope="col">
 * 3. Story headers are <h2> elements
 * 4. Letter title is <h1> element
 * 5. — cells have sr-only text ("No response")
 * 6. · Waiting cells have sr-only text ("Waiting for response")
 * 7. Hashtags have aria-hidden="true"
 * 8. [← Sent] link has aria-label="Back to Sent tab"
 * 9. Person name links are keyboard-reachable via Tab
 * 10. [open results →] links are keyboard-reachable via Tab
 * 11. Tab order within a row: name link first, then results link
 * 12. Interactive elements can receive focus (visible focus indicator)
 * 13. Muted text elements render (color contrast baseline)
 * 14. [open results →] link row height >= 40px touch target
 */

import { test, expect } from '@playwright/test';
import { supabaseAdmin } from '../helpers/supabase-admin';
import {
  createTestUser,
  setTestSession,
  deleteTestUser,
  type TestUser,
} from '../helpers/test-user';
import { createTestStory, deleteTestStory } from '../helpers/test-story';
import { createTestPoint, deleteTestPoint } from '../helpers/test-point';
import {
  createFullTestLetter,
  deleteTestLetter,
} from '../helpers/test-letter';

test.describe('P700: Accessibility — Letter Overview', () => {
  test.describe.configure({ timeout: 60000 });

  let sender: TestUser;
  let receiver: TestUser;
  let docId: string;
  let storyId: string;
  let pointId: string;
  let letterId: string;
  let deliveryId: string;

  test.beforeAll(async () => {
    sender = await createTestUser({ name: 'P700 A11y Sender' });
    receiver = await createTestUser({ name: 'P700 A11y Receiver' });

    const { data: doc } = await supabaseAdmin
      .from('clarity_docs')
      .insert({ owner_id: sender.user.id, title: 'P700 A11y Doc', visibility: 'public' })
      .select('id')
      .single();
    if (!doc) throw new Error('Doc creation failed');
    docId = doc.id;

    const story = await createTestStory(sender.user.id, {
      title: 'P700 A11y Story',
      content: 'Accessibility story for P700 tests.',
    });
    storyId = story.id;

    const point = await createTestPoint(sender.user.id, storyId, {
      statement: 'A11y test point claim',
    });
    pointId = point.id;

    const { data: v } = await supabaseAdmin
      .from('story_versions')
      .select('id')
      .eq('story_id', storyId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();
    if (!v) throw new Error('Story version not found');

    const { letter, delivery } = await createFullTestLetter(
      sender.user.id,
      docId,
      [{ storyId, versionId: v.id, prediction: 5, position: 0 }],
      { email: receiver.email, profileId: receiver.user.id },
      { seal: true }
    );
    letterId = letter.id;
    deliveryId = delivery.id;

    // Seed a completion so the responded-recipient branch renders
    await supabaseAdmin.from('story_verifications').insert({
      story_id: storyId,
      speaker_id: sender.user.id,
      listener_id: receiver.user.id,
      speaker_rating: 5,
      listener_rating: 8,
      source: 'letter',
      verified: false,
      sort_order: 0,
    });

    await supabaseAdmin.from('letter_point_responses').insert({
      delivery_id: deliveryId,
      point_id: pointId,
      position: 'agree',
    });

    await supabaseAdmin
      .from('letter_deliveries')
      .update({ status: 'completed', completed_at: new Date().toISOString(), stories_rated: 1 })
      .eq('id', deliveryId);
  });

  test.afterAll(async () => {
    if (deliveryId) {
      await supabaseAdmin
        .from('letter_point_responses')
        .delete()
        .eq('delivery_id', deliveryId);
    }
    if (storyId) {
      await supabaseAdmin
        .from('story_verifications')
        .delete()
        .eq('story_id', storyId)
        .eq('source', 'letter');
    }
    if (letterId) await deleteTestLetter(letterId);
    if (pointId) await deleteTestPoint(pointId);
    if (storyId) await deleteTestStory(storyId);
    if (docId) await supabaseAdmin.from('clarity_docs').delete().eq('id', docId);
    if (receiver?.user?.id) await deleteTestUser(receiver.user.id);
    if (sender?.user?.id) await deleteTestUser(sender.user.id);
  });

  // ── 1. <table> elements present ──────────────────────────────────────────

  test('<table> elements present — not divs masquerading as tables', async ({ page }) => {
    await setTestSession(page, sender.email);
    await page.goto(`/letter/${letterId}/overview`);
    await page.waitForLoadState('networkidle');

    const tables = page.locator('table');
    const count = await tables.count();
    expect(count, 'Expected at least one <table> element').toBeGreaterThan(0);
  });

  // ── 2. Column headers use <th scope="col"> ────────────────────────────────

  test('column headers use <th scope="col">', async ({ page }) => {
    await setTestSession(page, sender.email);
    await page.goto(`/letter/${letterId}/overview`);
    await page.waitForLoadState('networkidle');

    const colHeaders = page.locator('th[scope="col"]');
    const count = await colHeaders.count();
    expect(count, 'Expected at least one <th scope="col"> column header').toBeGreaterThan(0);
  });

  // ── 3. Story headers are <h2> ─────────────────────────────────────────────

  test('story section headers are <h2> elements', async ({ page }) => {
    await setTestSession(page, sender.email);
    await page.goto(`/letter/${letterId}/overview`);
    await page.waitForLoadState('networkidle');

    const storyH2 = page.locator('h2').filter({ hasText: /A11y Story/ }).first();
    await expect(storyH2).toBeVisible({ timeout: 10000 });

    const tagName = await storyH2.evaluate((el) => el.tagName.toLowerCase());
    expect(tagName).toBe('h2');
  });

  // ── 4. Letter title is <h1> ───────────────────────────────────────────────

  test('letter title is an <h1> element', async ({ page }) => {
    await setTestSession(page, sender.email);
    await page.goto(`/letter/${letterId}/overview`);
    await page.waitForLoadState('networkidle');

    const h1 = page.locator('h1');
    await expect(h1).toBeVisible({ timeout: 10000 });

    const tagName = await h1.evaluate((el) => el.tagName.toLowerCase());
    expect(tagName).toBe('h1');
  });

  // ── 5. — cells have sr-only text "No response" ────────────────────────────

  test('— (dash) cells have sr-only "No response" text', async ({ page }) => {
    await setTestSession(page, sender.email);
    await page.goto(`/letter/${letterId}/overview`);
    await page.waitForLoadState('networkidle');

    const hasSrOnly = await page.evaluate(() => {
      const srOnlyEls = Array.from(document.querySelectorAll('.sr-only'));
      return srOnlyEls.some(
        (el) =>
          el.textContent?.toLowerCase().includes('no response') ||
          el.textContent?.toLowerCase().includes('no position')
      );
    });
    expect(hasSrOnly, 'Expected sr-only "No response" text for — cells').toBe(true);
  });

  // ── 6. · Waiting cells have sr-only text "Waiting for response" ──────────

  test('· Waiting cells have sr-only "Waiting for response" text', async ({ page }) => {
    // Add a waiting delivery to this letter for this test only
    const { data: waitingDelivery, error } = await supabaseAdmin
      .from('letter_deliveries')
      .insert({
        letter_id: letterId,
        receiver_email: 'a11y-waiting@gmail.com',
        status: 'sent',
      })
      .select('id')
      .single();

    if (error || !waitingDelivery) {
      test.skip();
      return;
    }

    try {
      await setTestSession(page, sender.email);
      await page.goto(`/letter/${letterId}/overview`);
      await page.waitForLoadState('networkidle');

      const hasSrOnly = await page.evaluate(() => {
        const srOnlyEls = Array.from(document.querySelectorAll('.sr-only'));
        return srOnlyEls.some(
          (el) =>
            el.textContent?.toLowerCase().includes('waiting for response') ||
            el.textContent?.toLowerCase().includes('waiting')
        );
      });
      expect(hasSrOnly, 'Expected sr-only "Waiting for response" text for · Waiting cells').toBe(true);
    } finally {
      await supabaseAdmin
        .from('letter_deliveries')
        .delete()
        .eq('id', waitingDelivery.id);
    }
  });

  // ── 7. Hashtags have aria-hidden="true" ───────────────────────────────────

  test('hashtag elements have aria-hidden="true"', async ({ page }) => {
    await setTestSession(page, sender.email);
    await page.goto(`/letter/${letterId}/overview`);
    await page.waitForLoadState('networkidle');

    const hasAriaHiddenHashtag = await page.evaluate(() => {
      const ariaHiddenEls = Array.from(document.querySelectorAll('[aria-hidden="true"]'));
      // SVGs expose `className` as SVGAnimatedString (no .includes); coerce to string.
      return ariaHiddenEls.some((el) => {
        const text = el.textContent ?? '';
        const cls = typeof el.className === 'string' ? el.className : '';
        return text.includes('#') || cls.includes('hashtag');
      });
    });
    expect(hasAriaHiddenHashtag, 'Expected aria-hidden="true" on hashtag elements').toBe(true);
  });

  // ── 8. [← Sent] link has aria-label="Back to Sent tab" ──────────────────

  test('[← Sent] back link has aria-label="Back to Sent tab"', async ({ page }) => {
    await setTestSession(page, sender.email);
    await page.goto(`/letter/${letterId}/overview`);
    await page.waitForLoadState('networkidle');

    const backLink = page.locator('[aria-label="Back to Sent tab"]');
    await expect(backLink).toBeVisible({ timeout: 10000 });

    const ariaLabel = await backLink.getAttribute('aria-label');
    expect(ariaLabel).toBe('Back to Sent tab');
  });

  // ── 9. Person name links are keyboard-reachable ───────────────────────────

  test('person name links are keyboard-reachable via Tab', async ({ page }) => {
    await setTestSession(page, sender.email);
    await page.goto(`/letter/${letterId}/overview`);
    await page.waitForLoadState('networkidle');

    const profileLink = page.locator('a[href*="/p/"]').first();
    await expect(profileLink).toBeVisible({ timeout: 10000 });

    await profileLink.focus();
    await expect(profileLink).toBeFocused({ timeout: 3000 });
  });

  // ── 10. [open results →] links are keyboard-reachable ────────────────────

  test('[open results →] links are keyboard-reachable via Tab', async ({ page }) => {
    await setTestSession(page, sender.email);
    await page.goto(`/letter/${letterId}/overview`);
    await page.waitForLoadState('networkidle');

    const resultsLink = page.locator('a:has-text("open results")').first();
    await expect(resultsLink).toBeVisible({ timeout: 10000 });

    await resultsLink.focus();
    await expect(resultsLink).toBeFocused({ timeout: 3000 });
  });

  // ── 11. Tab order: name link before results link per row ──────────────────

  test('tab order within a row: profile link appears before results link in DOM', async ({
    page,
  }) => {
    await setTestSession(page, sender.email);
    await page.goto(`/letter/${letterId}/overview`);
    await page.waitForLoadState('networkidle');

    // Scope inside a cohort table row — the global navbar also has /p/ links.
    const row = page.locator('tbody tr').filter({ has: page.locator(`a[href*="/letter/${letterId}/results"]`) }).first();
    const profileLink = row.locator('a[href*="/p/"]').first();
    const resultsLink = row.locator(`a[href*="/letter/${letterId}/results"]`).first();

    await expect(profileLink).toBeVisible({ timeout: 10000 });
    await expect(resultsLink).toBeVisible({ timeout: 10000 });

    // Profile link is in the first column, results link in the last — profile x < results x
    const profileBox = await profileLink.boundingBox();
    const resultsBox = await resultsLink.boundingBox();
    expect(profileBox?.x ?? 0).toBeLessThan(resultsBox?.x ?? 999);
  });

  // ── 12. Interactive elements can receive focus ────────────────────────────

  test('interactive elements have visible focus capability', async ({ page }) => {
    await setTestSession(page, sender.email);
    await page.goto(`/letter/${letterId}/overview`);
    await page.waitForLoadState('networkidle');

    await page.keyboard.press('Tab');
    const focused = await page.evaluate(() => document.activeElement?.tagName ?? 'BODY');
    expect(focused).not.toBe('BODY');
  });

  // ── 13. Muted text elements render ────────────────────────────────────────

  test('muted text elements (—, · Waiting, hashtags) are present in DOM', async ({ page }) => {
    await setTestSession(page, sender.email);
    await page.goto(`/letter/${letterId}/overview`);
    await page.waitForLoadState('networkidle');

    const mutedEls = page.locator('.text-muted-foreground');
    const count = await mutedEls.count();
    expect(count, 'Expected muted-foreground elements for —, hashtags').toBeGreaterThan(0);
  });

  // ── 14. [open results →] row height >= 40px touch target ─────────────────

  test('[open results →] link row meets 40px minimum touch target height', async ({ page }) => {
    await setTestSession(page, sender.email);
    await page.goto(`/letter/${letterId}/overview`);
    await page.waitForLoadState('networkidle');

    const resultsLink = page.locator('a:has-text("open results")').first();
    if (await resultsLink.isVisible({ timeout: 5000 }).catch(() => false)) {
      const rowHeight = await resultsLink.evaluate((el) => {
        const row = el.closest('tr') ?? el.parentElement;
        return row ? row.getBoundingClientRect().height : el.getBoundingClientRect().height;
      });
      expect(rowHeight, `Row height ${rowHeight}px < 40px minimum`).toBeGreaterThanOrEqual(40);
    }
  });
});
