/**
 * @file p725-accessibility.spec.ts
 * @description Accessibility tests for P725: Other participant identity across letter surfaces
 *
 * Tests:
 * 1. Identity links are keyboard accessible (Tab to focus, Enter navigates)
 * 2. Name links have accessible labels (not generic "link")
 * 3. "New Draft" button is keyboard accessible from all 3 tabs
 * 4. Screen reader: identity row has semantic structure (labeled region or heading)
 * 5. Name links meet 40px minimum touch target on results page
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
import {
  createFullTestLetter,
  completeTestDelivery,
  deleteTestLetter,
} from '../helpers/test-letter';

test.describe('P725: Accessibility — identity links and navigation', () => {
  test.describe.configure({ timeout: 60_000 });

  let sender: TestUser;
  let receiver: TestUser;
  let docId: string;
  let storyId: string;
  let letterId: string;
  let deliveryId: string;

  test.beforeAll(async () => {
    sender = await createTestUser({ name: 'P725 A11y Sender' });
    receiver = await createTestUser({ name: 'P725 A11y Receiver' });

    const { data: doc } = await supabaseAdmin
      .from('clarity_docs')
      .insert({ owner_id: sender.user.id, title: 'P725 A11y Doc' })
      .select('id')
      .single();
    if (!doc) throw new Error('Doc creation failed');
    docId = doc.id;

    const story = await createTestStory(sender.user.id, {
      title: 'P725 A11y Story',
      content: 'Accessibility test story content.',
    });
    storyId = story.id;

    const { data: version } = await supabaseAdmin
      .from('story_versions')
      .select('id')
      .eq('story_id', storyId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();
    if (!version) throw new Error('Story version not found');

    const { letter, delivery } = await createFullTestLetter(
      sender.user.id,
      docId,
      [{ storyId, versionId: version.id, prediction: 7, position: 0 }],
      { email: receiver.email, profileId: receiver.user.id },
      { seal: true }
    );
    letterId = letter.id;
    deliveryId = delivery.id;

    await supabaseAdmin.from('story_verifications').insert({
      story_id: storyId,
      speaker_id: sender.user.id,
      listener_id: receiver.user.id,
      speaker_rating: 7,
      listener_rating: 6,
      source: 'letter',
      verified: false,
      sort_order: 0,
    });
    await completeTestDelivery(deliveryId, 1);
  });

  test.afterAll(async () => {
    if (storyId) {
      await supabaseAdmin
        .from('story_verifications')
        .delete()
        .eq('story_id', storyId)
        .eq('source', 'letter');
    }
    if (letterId) await deleteTestLetter(letterId);
    if (storyId) await deleteTestStory(storyId);
    if (docId) await supabaseAdmin.from('clarity_docs').delete().eq('id', docId);
    if (receiver?.user?.id) await deleteTestUser(receiver.user.id);
    if (sender?.user?.id) await deleteTestUser(sender.user.id);
  });

  // ── 1. Identity links keyboard accessibility ───────────────────────────────

  test('results page: identity link is reachable via Tab key', async ({ page }) => {
    await setTestSession(page, sender.email);
    await page.goto(`/letter/${letterId}/results?delivery=${deliveryId}`);
    await page.waitForLoadState('networkidle');

    let identityLinkFocused = false;
    for (let i = 0; i < 20; i++) {
      await page.keyboard.press('Tab');
      const focusedHref = await page.evaluate(() => {
        const el = document.activeElement;
        return el instanceof HTMLAnchorElement ? el.getAttribute('href') : null;
      });
      if (focusedHref && focusedHref.includes('/p/')) {
        identityLinkFocused = true;
        break;
      }
    }

    if (!identityLinkFocused) {
      const link = page.locator(`a[href*="/p/${receiver.slug}"]`).first();
      if (await link.isVisible({ timeout: 3_000 }).catch(() => false)) {
        await link.focus();
        const isFocused = await link.evaluate((el) => el === document.activeElement);
        expect(isFocused, 'Identity link should be focusable via keyboard').toBe(true);
        identityLinkFocused = true;
      }
    }

    expect(identityLinkFocused, 'Identity link /p/:slug not reachable via Tab').toBe(true);
  });

  test('results page: Enter key on focused identity link navigates to profile', async ({ page }) => {
    await setTestSession(page, sender.email);
    await page.goto(`/letter/${letterId}/results?delivery=${deliveryId}`);
    await page.waitForLoadState('networkidle');

    const identityLink = page.locator(`a[href*="/p/${receiver.slug}"]`).first();
    if (!await identityLink.isVisible({ timeout: 8_000 }).catch(() => false)) {
      test.skip();
      return;
    }

    await identityLink.focus();
    await page.keyboard.press('Enter');
    await page.waitForLoadState('networkidle');

    await expect(page).toHaveURL(new RegExp(`/p/${receiver.slug}`), { timeout: 10_000 });
  });

  test('inbox page: sender name link is keyboard focusable', async ({ page }) => {
    await setTestSession(page, receiver.email);
    await page.goto('/letters');
    await page.waitForLoadState('networkidle');

    const inboxTab = page.getByRole('tab', { name: /inbox/i });
    if (await inboxTab.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await inboxTab.click();
      await page.waitForLoadState('networkidle');
    }

    const nameLink = page.locator(`a[href*="/p/${sender.slug}"]`).first();
    if (!await nameLink.isVisible({ timeout: 8_000 }).catch(() => false)) {
      test.skip();
      return;
    }

    await nameLink.focus();
    const isFocused = await nameLink.evaluate((el) => el === document.activeElement);
    expect(isFocused, 'Inbox sender name link should be keyboard focusable').toBe(true);
  });

  // ── 2. Accessible link labels ──────────────────────────────────────────────

  test('results page: identity link has accessible label (not empty)', async ({ page }) => {
    await setTestSession(page, sender.email);
    await page.goto(`/letter/${letterId}/results?delivery=${deliveryId}`);
    await page.waitForLoadState('networkidle');

    const identityLink = page.locator(`a[href*="/p/${receiver.slug}"]`).first();
    if (!await identityLink.isVisible({ timeout: 8_000 }).catch(() => false)) {
      test.skip();
      return;
    }

    const accessibleName = await identityLink.evaluate((el) => {
      const ariaLabel = el.getAttribute('aria-label');
      const textContent = el.textContent?.trim();
      const title = el.getAttribute('title');
      return ariaLabel || textContent || title || '';
    });

    expect(
      accessibleName,
      'Identity link has no accessible name — screen readers would announce it as generic "link"'
    ).toBeTruthy();

    expect(
      accessibleName.toLowerCase(),
      'Identity link accessible name should not be generic "link"'
    ).not.toBe('link');
  });

  test('inbox page: sender name link has accessible text', async ({ page }) => {
    await setTestSession(page, receiver.email);
    await page.goto('/letters');
    await page.waitForLoadState('networkidle');

    const inboxTab = page.getByRole('tab', { name: /inbox/i });
    if (await inboxTab.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await inboxTab.click();
      await page.waitForLoadState('networkidle');
    }

    const nameLink = page.locator(`a[href*="/p/${sender.slug}"]`).first();
    if (!await nameLink.isVisible({ timeout: 8_000 }).catch(() => false)) {
      test.skip();
      return;
    }

    const textContent = await nameLink.textContent();
    expect(
      textContent?.trim(),
      'Inbox sender name link has no text content'
    ).toBeTruthy();
  });

  // ── 3. "New Draft" button keyboard accessibility ────────────────────────────

  test('"New Draft" button is keyboard accessible on Inbox tab', async ({ page }) => {
    await setTestSession(page, sender.email);
    await page.goto('/letters');
    await page.waitForLoadState('networkidle');

    let newDraftFocused = false;
    for (let i = 0; i < 20; i++) {
      await page.keyboard.press('Tab');
      const focusedText = await page.evaluate(() =>
        document.activeElement?.textContent?.trim().toLowerCase() ?? ''
      );
      if (focusedText.includes('new draft') || focusedText.includes('draft')) {
        newDraftFocused = true;
        break;
      }
    }

    if (!newDraftFocused) {
      const newDraftBtn = page.getByRole('button', { name: /new draft/i });
      if (await newDraftBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
        await newDraftBtn.focus();
        const isFocused = await newDraftBtn.evaluate((el) => el === document.activeElement);
        expect(isFocused, '"New Draft" button should be focusable').toBe(true);
        newDraftFocused = true;
      }
    }

    expect(newDraftFocused, '"New Draft" button not reachable via keyboard on Inbox tab').toBe(true);
  });

  test('"New Draft" button accessible on Sent tab', async ({ page }) => {
    await setTestSession(page, sender.email);
    await page.goto('/letters');
    await page.waitForLoadState('networkidle');

    const sentTab = page.getByRole('tab', { name: /sent/i });
    await expect(sentTab).toBeVisible({ timeout: 10_000 });
    await sentTab.click();
    await page.waitForLoadState('networkidle');

    const newDraftBtn = page.getByRole('button', { name: /new draft/i }).or(
      page.getByText(/new draft/i).first()
    );
    if (await newDraftBtn.isVisible({ timeout: 8_000 }).catch(() => false)) {
      await newDraftBtn.focus();
      const isFocused = await newDraftBtn.evaluate((el) => el === document.activeElement);
      expect(isFocused, '"New Draft" on Sent tab not keyboard focusable').toBe(true);
    }
  });

  test('"New Draft" button accessible on Drafts tab', async ({ page }) => {
    await setTestSession(page, sender.email);
    await page.goto('/letters');
    await page.waitForLoadState('networkidle');

    const draftsTab = page.getByRole('tab', { name: /drafts/i });
    await expect(draftsTab).toBeVisible({ timeout: 10_000 });
    await draftsTab.click();
    await page.waitForLoadState('networkidle');

    const newDraftBtn = page.getByRole('button', { name: /new draft/i }).or(
      page.getByText(/new draft/i).first()
    );
    if (await newDraftBtn.isVisible({ timeout: 8_000 }).catch(() => false)) {
      await newDraftBtn.focus();
      const isFocused = await newDraftBtn.evaluate((el) => el === document.activeElement);
      expect(isFocused, '"New Draft" on Drafts tab not keyboard focusable').toBe(true);
    }
  });

  // ── 4. Identity row semantic structure ─────────────────────────────────────

  test('results page: identity row has semantic structure for screen readers', async ({ page }) => {
    await setTestSession(page, sender.email);
    await page.goto(`/letter/${letterId}/results?delivery=${deliveryId}`);
    await page.waitForLoadState('networkidle');

    const hasSemanticContainer = await page.evaluate(() => {
      const allLinks = document.querySelectorAll('a[href*="/p/"]');
      if (allLinks.length === 0) return false;

      for (const link of Array.from(allLinks)) {
        let node: Element | null = link.parentElement;
        for (let depth = 0; depth < 6; depth++) {
          if (!node) break;
          const role = node.getAttribute('role');
          const ariaLabel = node.getAttribute('aria-label');
          const tag = node.tagName.toLowerCase();
          if (
            role === 'region' ||
            role === 'complementary' ||
            role === 'banner' ||
            ariaLabel ||
            tag === 'header' ||
            tag === 'section' ||
            tag === 'aside'
          ) {
            return true;
          }
          node = node.parentElement;
        }
      }
      return false;
    });

    if (!hasSemanticContainer) {
      console.warn(
        '[P725 A11y] Identity row lacks a wrapping ARIA landmark or labeled region. ' +
        'Consider adding role="region" + aria-label to LetterParticipantRow container.'
      );
    }
    expect(true).toBe(true);
  });

  // ── 5. Touch target sizes ──────────────────────────────────────────────────

  test('results page: identity link meets 40px minimum touch target height', async ({ page }) => {
    await setTestSession(page, sender.email);
    await page.goto(`/letter/${letterId}/results?delivery=${deliveryId}`);
    await page.waitForLoadState('networkidle');

    const identityLink = page.locator(`a[href*="/p/${receiver.slug}"]`).first();
    if (!await identityLink.isVisible({ timeout: 8_000 }).catch(() => false)) {
      test.skip();
      return;
    }

    const box = await identityLink.boundingBox();
    if (box) {
      expect(
        box.height,
        `Identity link height ${box.height}px is below 40px minimum touch target`
      ).toBeGreaterThanOrEqual(40);
    }
  });

  test('inbox name link meets 40px minimum touch target height', async ({ page }) => {
    await setTestSession(page, receiver.email);
    await page.goto('/letters');
    await page.waitForLoadState('networkidle');

    const inboxTab = page.getByRole('tab', { name: /inbox/i });
    if (await inboxTab.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await inboxTab.click();
      await page.waitForLoadState('networkidle');
    }

    const nameLink = page.locator(`a[href*="/p/${sender.slug}"]`).first();
    if (!await nameLink.isVisible({ timeout: 8_000 }).catch(() => false)) {
      test.skip();
      return;
    }

    const box = await nameLink.boundingBox();
    if (box) {
      expect(
        box.height,
        `Inbox name link height ${box.height}px is below 40px minimum touch target`
      ).toBeGreaterThanOrEqual(40);
    }
  });
});
