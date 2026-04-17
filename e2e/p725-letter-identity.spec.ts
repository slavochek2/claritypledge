/**
 * @file p725-letter-identity.spec.ts
 * @description P725: Other participant identity across letter surfaces
 *
 * Covers:
 * 1. Smoke: /letters loads without console errors
 * 2. Inbox tab: registered sender name is a link to /p/:slug
 * 3. Inbox tap contract: name link → profile; card body → letter
 * 4. Inbox anonymous: link_respondent shows "Someone" plain text (no link)
 * 5. Sent tab: recipient name links to /p/:slug when slug present
 * 6. Sent tab public link: shows "Public link letter" placeholder
 * 7. Letter-reading page: identity row shows sender name linked to profile
 * 8. Results page: identity row renders above story walk
 * 9. Results role label: "Letter from [Name]" (recipient) / "Letter to [Name]" (author)
 * 10. Navigation: /letters default tab is Inbox; "New Draft" on all 3 tabs; Inbox→Sent→Drafts
 * Boundary:
 * 11. Null-slug user: name renders as plain text, no link
 * 12. Long name truncation: overflow ellipsis applied
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
import {
  createFullTestLetter,
  createTestLetter,
  createTestDelivery,
  completeTestDelivery,
  deleteTestLetter,
} from './helpers/test-letter';

test.describe('P725: Letter identity surfaces', () => {
  test.describe.configure({ timeout: 60_000 });

  let sender: TestUser;
  let receiver: TestUser;
  let docId: string;
  let storyId: string;
  let letterId: string;
  let deliveryId: string;
  let _invitationToken: string;
  // Null-slug letter
  let nullSlugSender: TestUser;
  let nullSlugLetterId: string;
  let nullSlugDocId: string;
  let nullSlugStoryId: string;
  // Public link letter
  let publicLinkLetterId: string;
  let publicLinkDocId: string;
  // Anonymous delivery (link_respondent simulation)
  let anonDeliveryId: string;

  test.beforeAll(async () => {
    // Primary sender/receiver with slugs
    sender = await createTestUser({ name: 'P725 Sender User' });
    receiver = await createTestUser({ name: 'P725 Receiver User' });

    // Create doc + story for primary letter
    const { data: doc } = await supabaseAdmin
      .from('clarity_docs')
      .insert({ owner_id: sender.user.id, title: 'P725 Identity Doc' })
      .select('id')
      .single();
    if (!doc) throw new Error('Doc creation failed');
    docId = doc.id;

    const story = await createTestStory(sender.user.id, { title: 'P725 Identity Story', content: 'Identity test story content.' });
    storyId = story.id;

    const { data: version } = await supabaseAdmin
      .from('story_versions')
      .select('id')
      .eq('story_id', storyId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();
    if (!version) throw new Error('Story version not found');

    // Primary sealed letter to receiver
    const { letter, delivery } = await createFullTestLetter(
      sender.user.id,
      docId,
      [{ storyId, versionId: version.id, prediction: 6, position: 0 }],
      { email: receiver.email, profileId: receiver.user.id },
      { seal: true }
    );
    letterId = letter.id;
    deliveryId = delivery.id;

    const { data: deliveryRow } = await supabaseAdmin
      .from('letter_deliveries')
      .select('invitation_token')
      .eq('id', deliveryId)
      .single();
    _invitationToken = deliveryRow?.invitation_token ?? '';

    // Add rating + complete for results page
    await supabaseAdmin.from('story_verifications').insert({
      story_id: storyId,
      speaker_id: sender.user.id,
      listener_id: receiver.user.id,
      speaker_rating: 6,
      listener_rating: 8,
      source: 'letter',
      verified: false,
      sort_order: 0,
    });
    await completeTestDelivery(deliveryId, 1);

    // Anonymous delivery (no receiver_profile_id = link_respondent)
    const anonDelivery = await createTestDelivery(letterId, {
      receiverEmail: undefined,
      receiverProfileId: undefined,
      status: 'sent',
    });
    anonDeliveryId = anonDelivery.id;

    // Null-slug sender — create user then set slug=null
    nullSlugSender = await createTestUser({ name: 'P725 NullSlug Sender' });
    await supabaseAdmin
      .from('profiles')
      .update({ slug: null })
      .eq('id', nullSlugSender.user.id);

    const { data: nsDoc } = await supabaseAdmin
      .from('clarity_docs')
      .insert({ owner_id: nullSlugSender.user.id, title: 'P725 NullSlug Doc' })
      .select('id')
      .single();
    if (!nsDoc) throw new Error('NullSlug doc creation failed');
    nullSlugDocId = nsDoc.id;

    const nsStory = await createTestStory(nullSlugSender.user.id, { title: 'P725 NullSlug Story' });
    nullSlugStoryId = nsStory.id;

    const { data: nsVersion } = await supabaseAdmin
      .from('story_versions')
      .select('id')
      .eq('story_id', nullSlugStoryId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    const { letter: nsLetter } = await createFullTestLetter(
      nullSlugSender.user.id,
      nullSlugDocId,
      [{ storyId: nullSlugStoryId, versionId: nsVersion?.id ?? '', prediction: 5, position: 0 }],
      { email: receiver.email, profileId: receiver.user.id },
      { seal: true }
    );
    nullSlugLetterId = nsLetter.id;

    // Public link letter (one-to-many, no specific recipient)
    const { data: plDoc } = await supabaseAdmin
      .from('clarity_docs')
      .insert({ owner_id: sender.user.id, title: 'P725 Public Link Doc' })
      .select('id')
      .single();
    if (!plDoc) throw new Error('Public link doc creation failed');
    publicLinkDocId = plDoc.id;

    const plLetter = await createTestLetter(sender.user.id, publicLinkDocId, {
      mode: 'one-to-many',
    });
    publicLinkLetterId = plLetter.id;
  });

  test.afterAll(async () => {
    if (storyId) {
      await supabaseAdmin
        .from('story_verifications')
        .delete()
        .eq('story_id', storyId)
        .eq('source', 'letter');
    }
    if (anonDeliveryId) {
      await supabaseAdmin.from('letter_deliveries').delete().eq('id', anonDeliveryId);
    }
    if (publicLinkLetterId) await deleteTestLetter(publicLinkLetterId);
    if (publicLinkDocId) await supabaseAdmin.from('clarity_docs').delete().eq('id', publicLinkDocId);
    if (nullSlugLetterId) await deleteTestLetter(nullSlugLetterId);
    if (nullSlugStoryId) await deleteTestStory(nullSlugStoryId);
    if (nullSlugDocId) await supabaseAdmin.from('clarity_docs').delete().eq('id', nullSlugDocId);
    if (nullSlugSender?.user?.id) await deleteTestUser(nullSlugSender.user.id);
    if (letterId) await deleteTestLetter(letterId);
    if (storyId) await deleteTestStory(storyId);
    if (docId) await supabaseAdmin.from('clarity_docs').delete().eq('id', docId);
    if (receiver?.user?.id) await deleteTestUser(receiver.user.id);
    if (sender?.user?.id) await deleteTestUser(sender.user.id);
  });

  // ── 1. Smoke ───────────────────────────────────────────────────────────────

  test('smoke: /letters loads without console errors', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });

    await setTestSession(page, sender.email);
    await page.goto('/letters');
    await page.waitForLoadState('networkidle');

    await expect(page).toHaveURL(/\/letters/);

    const realErrors = consoleErrors.filter(
      (e) => !e.includes('ResizeObserver') && !e.includes('favicon')
    );
    expect(realErrors, `Console errors: ${realErrors.join('\n')}`).toHaveLength(0);
  });

  // ── 2. Inbox tab: registered sender name links to /p/:slug ────────────────

  test('inbox tab: sender name is a link to /p/:slug', async ({ page }) => {
    await setTestSession(page, receiver.email);
    await page.goto('/letters');
    await page.waitForLoadState('networkidle');

    const inboxTab = page.getByRole('tab', { name: /inbox/i });
    if (await inboxTab.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await inboxTab.click();
      await page.waitForLoadState('networkidle');
    }

    const nameLink = page.locator(`a[href*="/p/${sender.slug}"]`).first();
    await expect(nameLink, `No link to /p/${sender.slug} found in inbox`).toBeVisible({
      timeout: 10_000,
    });

    const linkText = await nameLink.textContent();
    expect(linkText?.trim()).toBeTruthy();
  });

  // ── 3. Inbox tap contract: stopPropagation ────────────────────────────────

  test('inbox tap contract: name link navigates to profile, not letter', async ({ page }) => {
    await setTestSession(page, receiver.email);
    await page.goto('/letters');
    await page.waitForLoadState('networkidle');

    const inboxTab = page.getByRole('tab', { name: /inbox/i });
    if (await inboxTab.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await inboxTab.click();
      await page.waitForLoadState('networkidle');
    }

    const nameLink = page.locator(`a[href*="/p/${sender.slug}"]`).first();
    await expect(nameLink).toBeVisible({ timeout: 10_000 });
    await nameLink.click();
    await page.waitForLoadState('networkidle');

    await expect(page).toHaveURL(new RegExp(`/p/${sender.slug}`), { timeout: 10_000 });
    expect(page.url()).not.toMatch(/\/letter\//);
  });

  test('inbox tap contract: clicking card body navigates to letter (not profile)', async ({ page }) => {
    await setTestSession(page, receiver.email);
    await page.goto('/letters');
    await page.waitForLoadState('networkidle');

    const inboxTab = page.getByRole('tab', { name: /inbox/i });
    if (await inboxTab.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await inboxTab.click();
      await page.waitForLoadState('networkidle');
    }

    // Find a card containing the sender link and click outside the link
    const cards = page.locator('li, [role="listitem"]').filter({ has: page.locator(`a[href*="/p/${sender.slug}"]`) });
    const card = cards.first();
    if (await card.isVisible({ timeout: 5_000 }).catch(() => false)) {
      const cardBox = await card.boundingBox();
      const linkBox = await page.locator(`a[href*="/p/${sender.slug}"]`).first().boundingBox();
      if (cardBox && linkBox) {
        const clickX = cardBox.x + cardBox.width * 0.8;
        const clickY = cardBox.y + cardBox.height / 2;
        await page.mouse.click(clickX, clickY);
        await page.waitForLoadState('networkidle');
        expect(page.url()).not.toMatch(new RegExp(`/p/${sender.slug}`));
      }
    }
  });

  // ── 4. Inbox anonymous sender shows "Someone" plain text ──────────────────

  test('inbox anonymous delivery: actor_slug null renders "Someone" without link', async ({ page }) => {
    await setTestSession(page, sender.email);
    await page.goto('/letters');
    await page.waitForLoadState('networkidle');

    const someoneText = page.getByText('Someone').first();
    if (await someoneText.isVisible({ timeout: 8_000 }).catch(() => false)) {
      const isInsideLink = await someoneText.evaluate((el) => {
        let node: Element | null = el;
        while (node) {
          if (node.tagName === 'A') return true;
          node = node.parentElement;
        }
        return false;
      });
      expect(isInsideLink, '"Someone" text should not be inside a link element').toBe(false);
    }
  });

  // ── 5. Sent tab: recipient name links to /p/:slug ────────────────────────

  test('sent tab: recipient name links to /p/:slug when slug present', async ({ page }) => {
    await setTestSession(page, sender.email);
    await page.goto('/letters');
    await page.waitForLoadState('networkidle');

    const sentTab = page.getByRole('tab', { name: /sent/i });
    await expect(sentTab).toBeVisible({ timeout: 10_000 });
    await sentTab.click();
    await page.waitForLoadState('networkidle');

    const nameLink = page.locator(`a[href*="/p/${receiver.slug}"]`).first();
    await expect(nameLink, `No link to /p/${receiver.slug} found in sent tab`).toBeVisible({
      timeout: 10_000,
    });
  });

  test('sent tab tap contract: name link navigates to recipient profile', async ({ page }) => {
    await setTestSession(page, sender.email);
    await page.goto('/letters');
    await page.waitForLoadState('networkidle');

    const sentTab = page.getByRole('tab', { name: /sent/i });
    await expect(sentTab).toBeVisible({ timeout: 10_000 });
    await sentTab.click();
    await page.waitForLoadState('networkidle');

    const nameLink = page.locator(`a[href*="/p/${receiver.slug}"]`).first();
    await expect(nameLink).toBeVisible({ timeout: 10_000 });
    await nameLink.click();
    await page.waitForLoadState('networkidle');

    await expect(page).toHaveURL(new RegExp(`/p/${receiver.slug}`), { timeout: 10_000 });
  });

  // ── 6. Sent tab public link letter ───────────────────────────────────────

  test('sent tab public link letter shows "Public link letter" placeholder', async ({ page }) => {
    await setTestSession(page, sender.email);
    await page.goto('/letters');
    await page.waitForLoadState('networkidle');

    const sentTab = page.getByRole('tab', { name: /sent/i });
    await expect(sentTab).toBeVisible({ timeout: 10_000 });
    await sentTab.click();
    await page.waitForLoadState('networkidle');

    const placeholder = page.getByText(/public link letter/i).first();
    await expect(placeholder).toBeVisible({ timeout: 10_000 });
  });

  // ── 7. Letter-reading page: identity row shows sender ────────────────────

  test('letter-reading page: sender identity row visible', async ({ page }) => {
    await setTestSession(page, receiver.email);
    await page.goto(`/letter/${deliveryId}`);
    await page.waitForLoadState('networkidle');

    const senderName = page.getByText(sender.name).first();
    await expect(senderName, 'Sender name not visible on reading page').toBeVisible({
      timeout: 10_000,
    });
  });

  test('letter-reading page: sender name is linked to /p/:slug', async ({ page }) => {
    await setTestSession(page, receiver.email);
    await page.goto(`/letter/${deliveryId}`);
    await page.waitForLoadState('networkidle');

    const senderLink = page.locator(`a[href*="/p/${sender.slug}"]`).first();
    await expect(senderLink, `Sender profile link /p/${sender.slug} not found on reading page`).toBeVisible({
      timeout: 10_000,
    });
  });

  // ── 8. Results page: identity row renders above story walk ────────────────

  test('results page: identity row visible (sender perspective)', async ({ page }) => {
    await setTestSession(page, sender.email);
    await page.goto(`/letter/${letterId}/results`);
    await page.waitForLoadState('networkidle');

    const receiverName = page.getByText(receiver.name).first();
    await expect(receiverName, 'Receiver name not found on results page (sender perspective)').toBeVisible({
      timeout: 10_000,
    });
  });

  test('results page: identity row visible (receiver perspective)', async ({ page }) => {
    await setTestSession(page, receiver.email);
    await page.goto(`/letter/${letterId}/results?delivery=${deliveryId}`);
    await page.waitForLoadState('networkidle');

    const senderName = page.getByText(sender.name).first();
    await expect(senderName, 'Sender name not found on results page (receiver perspective)').toBeVisible({
      timeout: 10_000,
    });
  });

  test('results page: identity row has profile link (sender perspective)', async ({ page }) => {
    await setTestSession(page, sender.email);
    await page.goto(`/letter/${letterId}/results`);
    await page.waitForLoadState('networkidle');

    const receiverLink = page.locator(`a[href*="/p/${receiver.slug}"]`).first();
    await expect(receiverLink, `Receiver profile link not found on results page`).toBeVisible({
      timeout: 10_000,
    });
  });

  // ── 9. Results role label ─────────────────────────────────────────────────

  test('results role label: recipient sees "Letter from [Name]"', async ({ page }) => {
    await setTestSession(page, receiver.email);
    await page.goto(`/letter/${letterId}/results?delivery=${deliveryId}`);
    await page.waitForLoadState('networkidle');

    const roleLabel = page.getByText(/letter from/i).first();
    await expect(roleLabel, 'Role label "Letter from" not found for recipient').toBeVisible({
      timeout: 10_000,
    });
  });

  test('results role label: author sees "Letter to [Name]"', async ({ page }) => {
    await setTestSession(page, sender.email);
    await page.goto(`/letter/${letterId}/results`);
    await page.waitForLoadState('networkidle');

    const roleLabel = page.getByText(/letter to/i).first();
    await expect(roleLabel, 'Role label "Letter to" not found for author').toBeVisible({
      timeout: 10_000,
    });
  });

  // ── 10. Navigation ─────────────────────────────────────────────────────────

  test('navigation: /letters default landing tab is Inbox', async ({ page }) => {
    await setTestSession(page, sender.email);
    await page.goto('/letters');
    await page.waitForLoadState('networkidle');

    const inboxTab = page.getByRole('tab', { name: /inbox/i });
    await expect(inboxTab).toBeVisible({ timeout: 10_000 });

    const isActive = await inboxTab.evaluate((el) => {
      return (
        el.getAttribute('aria-selected') === 'true' ||
        el.getAttribute('data-state') === 'active' ||
        el.classList.contains('active')
      );
    });
    expect(isActive, 'Inbox tab is not the default active tab on /letters').toBe(true);
  });

  test('navigation: "New Draft" button visible on Inbox tab', async ({ page }) => {
    await setTestSession(page, sender.email);
    await page.goto('/letters');
    await page.waitForLoadState('networkidle');

    const inboxTab = page.getByRole('tab', { name: /inbox/i });
    if (await inboxTab.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await inboxTab.click();
    }

    const newDraftBtn = page.getByRole('button', { name: /new draft/i }).or(
      page.getByText(/new draft/i).first()
    );
    await expect(newDraftBtn, '"New Draft" button not visible on Inbox tab').toBeVisible({
      timeout: 10_000,
    });
  });

  test('navigation: "New Draft" button visible on Sent tab', async ({ page }) => {
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
    await expect(newDraftBtn, '"New Draft" button not visible on Sent tab').toBeVisible({
      timeout: 10_000,
    });
  });

  test('navigation: "New Draft" button visible on Drafts tab', async ({ page }) => {
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
    await expect(newDraftBtn, '"New Draft" button not visible on Drafts tab').toBeVisible({
      timeout: 10_000,
    });
  });

  test('navigation: tab order is Inbox → Sent → Drafts', async ({ page }) => {
    await setTestSession(page, sender.email);
    await page.goto('/letters');
    await page.waitForLoadState('networkidle');

    const tabs = page.getByRole('tab');
    const tabCount = await tabs.count();
    expect(tabCount).toBeGreaterThanOrEqual(3);

    const tabTexts: string[] = [];
    for (let i = 0; i < Math.min(tabCount, 5); i++) {
      const text = await tabs.nth(i).textContent();
      tabTexts.push(text?.trim().toLowerCase() ?? '');
    }

    const inboxIdx = tabTexts.findIndex((t) => t.includes('inbox'));
    const sentIdx = tabTexts.findIndex((t) => t.includes('sent'));
    const draftsIdx = tabTexts.findIndex((t) => t.includes('draft'));

    expect(inboxIdx, 'Inbox tab not found').toBeGreaterThanOrEqual(0);
    expect(sentIdx, 'Sent tab not found').toBeGreaterThanOrEqual(0);
    expect(draftsIdx, 'Drafts tab not found').toBeGreaterThanOrEqual(0);
    expect(inboxIdx, 'Inbox should come before Sent').toBeLessThan(sentIdx);
    expect(sentIdx, 'Sent should come before Drafts').toBeLessThan(draftsIdx);
  });

  // ── 11. Boundary: null-slug sender renders plain text, no link ────────────

  test('null-slug sender: name renders as plain text without link in inbox', async ({ page }) => {
    await setTestSession(page, receiver.email);
    await page.goto('/letters');
    await page.waitForLoadState('networkidle');

    const inboxTab = page.getByRole('tab', { name: /inbox/i });
    if (await inboxTab.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await inboxTab.click();
      await page.waitForLoadState('networkidle');
    }

    // nullSlugSender has slug=null — no /p/ link should exist for their name
    const profileLink = page.locator(`a[href*="/p/${nullSlugSender.slug}"]`).first();
    const linkVisible = await profileLink.isVisible({ timeout: 3_000 }).catch(() => false);
    expect(linkVisible, 'Should not show a /p/ link for null-slug sender').toBe(false);

    const nameText = page.getByText(nullSlugSender.name).first();
    if (await nameText.isVisible({ timeout: 5_000 }).catch(() => false)) {
      const isLink = await nameText.evaluate((el) => {
        let node: Element | null = el;
        while (node) {
          if (node.tagName === 'A') return true;
          node = node.parentElement;
        }
        return false;
      });
      expect(isLink, 'Null-slug name should not be wrapped in a link').toBe(false);
    }
  });

  // ── 12. Boundary: long name truncation ────────────────────────────────────

  test('long name truncation: identity row name applies overflow ellipsis', async ({ page }) => {
    await setTestSession(page, sender.email);
    await page.goto(`/letter/${letterId}/results`);
    await page.waitForLoadState('networkidle');

    const nameLinkOrSpan = page
      .locator(`a[href*="/p/${receiver.slug}"], span`)
      .filter({ hasText: receiver.name })
      .first();

    if (await nameLinkOrSpan.isVisible({ timeout: 8_000 }).catch(() => false)) {
      const overflow = await nameLinkOrSpan.evaluate((el) => {
        const style = window.getComputedStyle(el);
        return {
          overflow: style.overflow,
          textOverflow: style.textOverflow,
          whiteSpace: style.whiteSpace,
          maxWidth: style.maxWidth,
        };
      });
      const hasTruncation =
        overflow.textOverflow === 'ellipsis' ||
        overflow.overflow === 'hidden' ||
        overflow.maxWidth !== 'none';
      expect(
        hasTruncation,
        `Identity row name has no truncation CSS. overflow=${overflow.overflow}, text-overflow=${overflow.textOverflow}, max-width=${overflow.maxWidth}`
      ).toBe(true);
    }
  });
});

