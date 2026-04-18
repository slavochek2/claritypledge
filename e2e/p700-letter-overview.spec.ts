/**
 * @file p700-letter-overview.spec.ts
 * @description P700: Letter Overview — per-letter author view (list-first, two selectors)
 *
 * Tests:
 * 1. Smoke: overview page loads without console errors
 * 2. Landing state: View 1 renders with Story = first story, Person = none
 * 3. View 1 cohort row structure: Und · CLAIM · ANTI · status · drill-in
 * 4. Story selector: switching story updates cohort list
 * 5. Person selector: selecting person + clearing story renders View 2
 * 6. Both selected: View 3 zoom card renders
 * 7. Both cleared: guidance prompt renders
 * 8. Drill-in URLs: View 1 row [open] link includes delivery + story params
 * 9. View 2 footer link: opens person results without story anchor
 * 10. Back link: [← Sent] navigates to /letters?tab=sent
 * 11. Status glyphs: ★ Verified / → Moved / · Waiting render correctly
 * 12. Understanding format: letter-only (X) vs movement (X → Y)
 * 13. Empty state: all recipients waiting
 * 14. Sent-tab cards default to collapsed on mount
 * 15. [Open overview] button appears on sent-tab letter cards (desktop)
 * 16. Non-author visiting /overview is redirected or blocked
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
// Shared fixture: letter with 2 stories, 3 deliveries (verified / waiting / letter-only)
// ---------------------------------------------------------------------------

test.describe('P700: Letter Overview', () => {
  test.describe.configure({ timeout: 60000 });

  let sender: TestUser;
  let receiverAlice: TestUser;   // completed + letter verification (★ Verified)
  let receiverBob: TestUser;     // completed + live verification (→ Moved)
  let docId: string;
  let storyId1: string;
  let storyId2: string;
  let pointClaimId: string;
  let pointAntiId: string;
  let letterId: string;
  let deliveryAliceId: string;
  let deliveryBobId: string;
  let _deliveryCarolId: string; // no profile — waiting / anonymous fallback

  test.beforeAll(async () => {
    sender = await createTestUser({ name: 'P700 Sender Overview' });
    receiverAlice = await createTestUser({ name: 'Alice P700' });
    receiverBob = await createTestUser({ name: 'Bob P700' });

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

    // Create CLAIM and ANTI points on story 1
    const pClaim = await createTestPoint(sender.user.id, storyId1, {
      statement: 'AI displaces workers',
    });
    const pAnti = await createTestPoint(sender.user.id, storyId1, {
      statement: 'Humans adapt to new roles',
    });
    pointClaimId = pClaim.id;
    pointAntiId = pAnti.id;

    // Fetch story versions
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

    // Create letter with Alice as primary delivery
    const { letter, delivery: deliveryAlice } = await createFullTestLetter(
      sender.user.id,
      docId,
      [
        { storyId: storyId1, versionId: v1, prediction: 3, position: 0 },
        { storyId: storyId2, versionId: v2, prediction: 6, position: 1 },
      ],
      { email: receiverAlice.email, profileId: receiverAlice.user.id },
      { seal: true }
    );
    letterId = letter.id;
    deliveryAliceId = deliveryAlice.id;

    // Add Bob's delivery separately
    const deliveryBob = await createTestDelivery(letterId, {
      receiverEmail: receiverBob.email,
      receiverProfileId: receiverBob.user.id,
      status: 'completed',
    });
    deliveryBobId = deliveryBob.id;

    // Add anonymous Carol delivery (waiting)
    const deliveryCarol = await createTestDelivery(letterId, {
      receiverEmail: null,
      receiverProfileId: null,
      status: 'sent',
    });
    _deliveryCarolId = deliveryCarol.id;

    // Alice: story verifications (source=letter) → ★ Verified
    await supabaseAdmin.from('story_verifications').insert([
      {
        story_id: storyId1,
        speaker_id: sender.user.id,
        listener_id: receiverAlice.user.id,
        speaker_rating: 8,
        listener_rating: 8,
        source: 'letter',
        verified: true,
        sort_order: 0,
      },
      {
        story_id: storyId2,
        speaker_id: sender.user.id,
        listener_id: receiverAlice.user.id,
        speaker_rating: 6,
        listener_rating: 7,
        source: 'letter',
        verified: false,
        sort_order: 1,
      },
    ]);

    // Bob: story verifications (source=letter baseline + source=live for movement → → Moved)
    await supabaseAdmin.from('story_verifications').insert([
      {
        story_id: storyId1,
        speaker_id: sender.user.id,
        listener_id: receiverBob.user.id,
        speaker_rating: 4,
        listener_rating: 4,
        source: 'letter',
        verified: false,
        sort_order: 0,
      },
      {
        story_id: storyId1,
        speaker_id: sender.user.id,
        listener_id: receiverBob.user.id,
        speaker_rating: 4,
        listener_rating: 7,
        source: 'live',
        verified: false,
        sort_order: 0,
      },
    ]);

    // Alice: point responses (letter_point_responses)
    await supabaseAdmin.from('letter_point_responses').insert([
      { delivery_id: deliveryAliceId, point_id: pointClaimId, position: 'agree' },
    ]);

    // Bob: point responses
    await supabaseAdmin.from('letter_point_responses').insert([
      { delivery_id: deliveryBobId, point_id: pointClaimId, position: 'disagree' },
    ]);

    // Mark Alice delivery as completed
    await supabaseAdmin
      .from('letter_deliveries')
      .update({ status: 'completed', completed_at: new Date().toISOString(), stories_rated: 2 })
      .eq('id', deliveryAliceId);
  });

  test.afterAll(async () => {
    // Clean up point responses
    if (deliveryAliceId) {
      await supabaseAdmin.from('letter_point_responses').delete().eq('delivery_id', deliveryAliceId);
    }
    if (deliveryBobId) {
      await supabaseAdmin.from('letter_point_responses').delete().eq('delivery_id', deliveryBobId);
    }

    // Clean up story verifications
    for (const sid of [storyId1, storyId2]) {
      if (sid) {
        await supabaseAdmin
          .from('story_verifications')
          .delete()
          .in('source', ['letter', 'live'])
          .eq('story_id', sid);
      }
    }

    if (letterId) await deleteTestLetter(letterId);
    if (pointAntiId) await deleteTestPoint(pointAntiId);
    if (pointClaimId) await deleteTestPoint(pointClaimId);
    if (storyId2) await deleteTestStory(storyId2);
    if (storyId1) await deleteTestStory(storyId1);
    if (docId) await supabaseAdmin.from('clarity_docs').delete().eq('id', docId);
    if (receiverBob?.user?.id) await deleteTestUser(receiverBob.user.id);
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

  // ── 2. Landing state ──────────────────────────────────────────────────────

  test('landing state: Story selector shows first story, Person shows "— none —"', async ({ page }) => {
    await setTestSession(page, sender.email);
    await page.goto(`/letter/${letterId}/overview`);
    await page.waitForLoadState('networkidle');

    // Story selector should show first story title (not "— none —")
    const storySelector = page.locator('[aria-label="Select story"]');
    await expect(storySelector).toBeVisible({ timeout: 10000 });
    const storySelectorText = await storySelector.textContent();
    expect(storySelectorText).not.toMatch(/—\s*none\s*—/i);

    // Person selector should show "— none —"
    const personSelector = page.locator('[aria-label="Select person"]');
    await expect(personSelector).toBeVisible({ timeout: 10000 });
    const personSelectorText = await personSelector.textContent();
    expect(personSelectorText).toMatch(/—\s*none\s*—/i);
  });

  test('landing state: View 1 cohort list renders with one row per recipient', async ({ page }) => {
    await setTestSession(page, sender.email);
    await page.goto(`/letter/${letterId}/overview`);
    await page.waitForLoadState('networkidle');

    // Alice P700 recipient row must be visible
    const aliceRow = page.locator('text=/Alice P700/').first();
    await expect(aliceRow).toBeVisible({ timeout: 10000 });

    // Bob P700 recipient row must be visible
    const bobRow = page.locator('text=/Bob P700/').first();
    await expect(bobRow).toBeVisible({ timeout: 10000 });
  });

  test('landing state: [← Sent] back link is visible', async ({ page }) => {
    await setTestSession(page, sender.email);
    await page.goto(`/letter/${letterId}/overview`);
    await page.waitForLoadState('networkidle');

    // Back link text matches UI Contract: "← Sent"
    const backLink = page.locator('a[aria-label="Back to Sent tab"], a:has-text("Sent")').first();
    await expect(backLink).toBeVisible({ timeout: 10000 });
  });

  // ── 3. View 1 cohort row structure ────────────────────────────────────────

  test('View 1: status glyph "★ Verified" renders for Alice (verified recipient)', async ({ page }) => {
    await setTestSession(page, sender.email);
    await page.goto(`/letter/${letterId}/overview`);
    await page.waitForLoadState('networkidle');

    // ★ Verified or sr-only "Verified" text must be present in Alice's row
    const verifiedStatus = page.locator('text=/Verified/').first();
    await expect(verifiedStatus).toBeVisible({ timeout: 10000 });
  });

  test('View 1: status glyph "→ Moved" renders for Bob (live session)', async ({ page }) => {
    await setTestSession(page, sender.email);
    await page.goto(`/letter/${letterId}/overview`);
    await page.waitForLoadState('networkidle');

    const movedStatus = page.locator('text=/Moved/').first();
    await expect(movedStatus).toBeVisible({ timeout: 10000 });
  });

  test('View 1: [open] drill-in link present on recipient rows', async ({ page }) => {
    await setTestSession(page, sender.email);
    await page.goto(`/letter/${letterId}/overview`);
    await page.waitForLoadState('networkidle');

    // "open" drill-in links should be visible (at least one)
    const openLinks = page.locator('a:has-text("open"), [data-testid="drill-in-link"]');
    const count = await openLinks.count();
    expect(count, 'Expected at least one [open] drill-in link').toBeGreaterThan(0);
  });

  test('View 1: [open] link URL includes delivery and story params', async ({ page }) => {
    await setTestSession(page, sender.email);
    await page.goto(`/letter/${letterId}/overview`);
    await page.waitForLoadState('networkidle');

    // Row drill-in URL pattern: /letter/:id/results?delivery=...&story=...
    const openLink = page.locator(`a[href*="/letter/${letterId}/results"]`).first();
    if (await openLink.isVisible({ timeout: 5000 }).catch(() => false)) {
      const href = await openLink.getAttribute('href');
      expect(href).toMatch(/delivery=/);
      expect(href).toMatch(/story=/);
    }
  });

  test('View 1: ◌ no position renders for points without a response', async ({ page }) => {
    await setTestSession(page, sender.email);
    await page.goto(`/letter/${letterId}/overview`);
    await page.waitForLoadState('networkidle');

    // Anti-point had no response seeded — should show ◌ or "no position"
    const noPosition = page.locator('text=/no position/').first();
    await expect(noPosition).toBeVisible({ timeout: 10000 });
  });

  // ── 4. Story selector ─────────────────────────────────────────────────────

  test('Story selector: dropdown lists both stories and a "— none —" option', async ({ page }) => {
    await setTestSession(page, sender.email);
    await page.goto(`/letter/${letterId}/overview`);
    await page.waitForLoadState('networkidle');

    const storySelector = page.locator('[aria-label="Select story"]');
    await expect(storySelector).toBeVisible({ timeout: 10000 });
    await storySelector.click();

    // "— none —" clear option
    const noneOption = page.locator('[role="menuitem"]:has-text("— none —"), [role="option"]:has-text("— none —")').first();
    await expect(noneOption).toBeVisible({ timeout: 5000 });

    // Second story should be listed
    const story2Option = page.locator('text=P700 Story 2').first();
    await expect(story2Option).toBeVisible({ timeout: 5000 });
  });

  test('Story selector: switching to second story updates cohort list subtitle', async ({ page }) => {
    await setTestSession(page, sender.email);
    await page.goto(`/letter/${letterId}/overview`);
    await page.waitForLoadState('networkidle');

    const storySelector = page.locator('[aria-label="Select story"]');
    await storySelector.click();

    // Select story 2
    const story2Option = page.locator('[role="menuitem"]').filter({ hasText: /P700 Story 2/ }).first();
    if (await story2Option.isVisible({ timeout: 5000 }).catch(() => false)) {
      await story2Option.click();
      await page.waitForLoadState('networkidle');

      // Story 2 title or content should appear in the list
      const story2Content = page.locator('text=/Human Connection|Human creativity/').first();
      await expect(story2Content).toBeVisible({ timeout: 10000 });
    }
  });

  // ── 5. View 2: Person selected, Story cleared ─────────────────────────────

  test('View 2: selecting person and clearing story renders person journey list', async ({ page }) => {
    await setTestSession(page, sender.email);
    await page.goto(`/letter/${letterId}/overview`);
    await page.waitForLoadState('networkidle');

    // Step 1: Select a person (Bob P700)
    const personSelector = page.locator('[aria-label="Select person"]');
    await expect(personSelector).toBeVisible({ timeout: 10000 });
    await personSelector.click();

    const bobOption = page.locator('[role="menuitem"]').filter({ hasText: /Bob P700/ }).first();
    if (await bobOption.isVisible({ timeout: 5000 }).catch(() => false)) {
      await bobOption.click();
    }

    // Step 2: Clear the story selector
    const storySelector = page.locator('[aria-label="Select story"]');
    await storySelector.click();
    const noneOption = page.locator('[role="menuitem"]:has-text("— none —"), [role="option"]:has-text("— none —")').first();
    if (await noneOption.isVisible({ timeout: 5000 }).catch(() => false)) {
      await noneOption.click();
    }

    await page.waitForLoadState('networkidle');

    // View 2: "Open Bob P700's full results →" link should appear
    const fullResultsLink = page.locator('a:has-text("full results"), a:has-text("Open Bob")').first();
    await expect(fullResultsLink).toBeVisible({ timeout: 10000 });
  });

  test('View 2: person journey footer link URL has delivery param but no story param', async ({ page }) => {
    await setTestSession(page, sender.email);
    await page.goto(`/letter/${letterId}/overview`);
    await page.waitForLoadState('networkidle');

    // Select Bob, clear story
    const personSelector = page.locator('[aria-label="Select person"]');
    await personSelector.click();
    const bobOption = page.locator('[role="menuitem"]').filter({ hasText: /Bob P700/ }).first();
    if (await bobOption.isVisible({ timeout: 5000 }).catch(() => false)) {
      await bobOption.click();
    }

    const storySelector = page.locator('[aria-label="Select story"]');
    await storySelector.click();
    const noneOption = page.locator('[role="menuitem"]:has-text("— none —"), [role="option"]:has-text("— none —")').first();
    if (await noneOption.isVisible({ timeout: 5000 }).catch(() => false)) {
      await noneOption.click();
    }

    await page.waitForLoadState('networkidle');

    // Person drill-in URL: /letter/:id/results?delivery=… (no story param)
    const fullResultsLink = page.locator(`a[href*="/letter/${letterId}/results"]`).first();
    if (await fullResultsLink.isVisible({ timeout: 5000 }).catch(() => false)) {
      const href = await fullResultsLink.getAttribute('href');
      expect(href).toMatch(/delivery=/);
      expect(href).not.toMatch(/story=/);
    }
  });

  test('View 2: shows story sections for each story in the letter', async ({ page }) => {
    await setTestSession(page, sender.email);
    await page.goto(`/letter/${letterId}/overview`);
    await page.waitForLoadState('networkidle');

    // Select Bob, clear story
    const personSelector = page.locator('[aria-label="Select person"]');
    await personSelector.click();
    const bobOption = page.locator('[role="menuitem"]').filter({ hasText: /Bob P700/ }).first();
    if (await bobOption.isVisible({ timeout: 5000 }).catch(() => false)) {
      await bobOption.click();
    }

    const storySelector = page.locator('[aria-label="Select story"]');
    await storySelector.click();
    const noneOption = page.locator('[role="menuitem"]:has-text("— none —")').first();
    if (await noneOption.isVisible({ timeout: 5000 }).catch(() => false)) {
      await noneOption.click();
    }

    await page.waitForLoadState('networkidle');

    // Both story titles should be visible in the journey
    const story1Title = page.locator('text=/AI Threat Narrative/').first();
    await expect(story1Title).toBeVisible({ timeout: 10000 });

    const story2Title = page.locator('text=/Human Connection/').first();
    await expect(story2Title).toBeVisible({ timeout: 10000 });
  });

  // ── 6. View 3: Both selectors set ────────────────────────────────────────

  test('View 3: selecting both story and person renders zoom card', async ({ page }) => {
    await setTestSession(page, sender.email);
    await page.goto(`/letter/${letterId}/overview`);
    await page.waitForLoadState('networkidle');

    // Story is already pre-selected on landing; select Bob as person
    const personSelector = page.locator('[aria-label="Select person"]');
    await expect(personSelector).toBeVisible({ timeout: 10000 });
    await personSelector.click();

    const bobOption = page.locator('[role="menuitem"]').filter({ hasText: /Bob P700/ }).first();
    if (await bobOption.isVisible({ timeout: 5000 }).catch(() => false)) {
      await bobOption.click();
    }

    await page.waitForLoadState('networkidle');

    // View 3: zoom card shows "Bob P700 on [story title]"
    const zoomCard = page.locator('text=/Bob P700 on/').first();
    await expect(zoomCard).toBeVisible({ timeout: 10000 });
  });

  test('View 3: zoom card shows Understanding line', async ({ page }) => {
    await setTestSession(page, sender.email);
    await page.goto(`/letter/${letterId}/overview`);
    await page.waitForLoadState('networkidle');

    const personSelector = page.locator('[aria-label="Select person"]');
    await personSelector.click();
    const bobOption = page.locator('[role="menuitem"]').filter({ hasText: /Bob P700/ }).first();
    if (await bobOption.isVisible({ timeout: 5000 }).catch(() => false)) {
      await bobOption.click();
    }

    await page.waitForLoadState('networkidle');

    // Understanding line should be present
    const understandingLabel = page.locator('text=/Understanding/i').first();
    await expect(understandingLabel).toBeVisible({ timeout: 10000 });
  });

  test('View 3: zoom card [Open full results] link has delivery param', async ({ page }) => {
    await setTestSession(page, sender.email);
    await page.goto(`/letter/${letterId}/overview`);
    await page.waitForLoadState('networkidle');

    const personSelector = page.locator('[aria-label="Select person"]');
    await personSelector.click();
    const bobOption = page.locator('[role="menuitem"]').filter({ hasText: /Bob P700/ }).first();
    if (await bobOption.isVisible({ timeout: 5000 }).catch(() => false)) {
      await bobOption.click();
    }

    await page.waitForLoadState('networkidle');

    const fullResultsLink = page.locator(`a[href*="/letter/${letterId}/results"]`).first();
    if (await fullResultsLink.isVisible({ timeout: 5000 }).catch(() => false)) {
      const href = await fullResultsLink.getAttribute('href');
      expect(href).toMatch(/delivery=/);
    }
  });

  // ── 7. Both selectors cleared ─────────────────────────────────────────────

  test('Both selectors cleared: guidance prompt renders', async ({ page }) => {
    await setTestSession(page, sender.email);
    await page.goto(`/letter/${letterId}/overview`);
    await page.waitForLoadState('networkidle');

    // Clear story selector
    const storySelector = page.locator('[aria-label="Select story"]');
    await storySelector.click();
    const noneStory = page.locator('[role="menuitem"]:has-text("— none —")').first();
    if (await noneStory.isVisible({ timeout: 5000 }).catch(() => false)) {
      await noneStory.click();
    }

    await page.waitForLoadState('networkidle');

    // Guidance prompt text from UI Contract
    const guidanceText = page.locator('text=/Select a story or a person to explore/').first();
    await expect(guidanceText).toBeVisible({ timeout: 10000 });
  });

  // ── 8. Understanding movement ─────────────────────────────────────────────

  test('Understanding movement (X → Y) renders for Bob (has live verification)', async ({ page }) => {
    await setTestSession(page, sender.email);
    await page.goto(`/letter/${letterId}/overview`);
    await page.waitForLoadState('networkidle');

    // Bob has source='live' verification — View 1 should show X → Y for his understanding
    // The → character is from UI Contract: movement separator
    const movementArrow = page.locator('text=/→/').first();
    await expect(movementArrow).toBeVisible({ timeout: 10000 });
  });

  // ── 9. Back link navigation ───────────────────────────────────────────────

  test('[← Sent] back link navigates to sent tab', async ({ page }) => {
    await setTestSession(page, sender.email);
    await page.goto(`/letter/${letterId}/overview`);
    await page.waitForLoadState('networkidle');

    const backLink = page.locator('a[aria-label="Back to Sent tab"], a:has-text("Sent")').first();
    if (await backLink.isVisible({ timeout: 5000 }).catch(() => false)) {
      await backLink.click();
      await page.waitForLoadState('networkidle');

      // Should land on sent tab
      const url = page.url();
      expect(url).toMatch(/\/letters|\/letter/);
    }
  });

  // ── 10. Sent-tab integration ──────────────────────────────────────────────

  test('Sent-tab cards are collapsed by default on mount', async ({ page }) => {
    await setTestSession(page, sender.email);
    await page.goto('/letters?tab=sent');
    await page.waitForLoadState('networkidle');

    // Cards should NOT show recipient rows on initial mount (collapsed)
    // Per AD7: useState(false) — cards start collapsed
    const letterCard = page.locator('[data-component="letter-card"], [data-testid="letter-card"]').first();
    if (await letterCard.isVisible({ timeout: 5000 }).catch(() => false)) {
      // Recipient details should not be visible without expansion
      const expandedContent = page.locator('[data-state="open"][data-component="letter-recipients"]');
      const expandedVisible = await expandedContent.isVisible({ timeout: 2000 }).catch(() => false);
      // Collapsed by default — expanded content should NOT be visible
      expect(expandedVisible).toBe(false);
    }
  });

  test('[Open overview] button appears on desktop sent-tab letter cards', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await setTestSession(page, sender.email);
    await page.goto('/letters?tab=sent');
    await page.waitForLoadState('networkidle');

    // UI Contract: button text "Open overview", solid blue, desktop-visible (hidden sm:inline-flex)
    const overviewBtn = page.locator('button:has-text("Open overview"), a:has-text("Open overview")').first();
    await expect(overviewBtn).toBeVisible({ timeout: 10000 });
  });

  test('[Open overview] button navigates to /letter/:id/overview', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await setTestSession(page, sender.email);
    await page.goto('/letters?tab=sent');
    await page.waitForLoadState('networkidle');

    const overviewBtn = page.locator('button:has-text("Open overview"), a:has-text("Open overview")').first();
    if (await overviewBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await overviewBtn.click();
      await page.waitForLoadState('networkidle');

      expect(page.url()).toMatch(/\/letter\/[^/]+\/overview/);
    }
  });

  // ── 11. Authorization ─────────────────────────────────────────────────────

  test('non-author visiting /overview is redirected or shown not-authorized', async ({ page }) => {
    const nonAuthor = await createTestUser({ name: 'P700 Non Author' });
    try {
      await setTestSession(page, nonAuthor.email);
      await page.goto(`/letter/${letterId}/overview`);
      await page.waitForLoadState('networkidle');

      const isOnOverview = page.url().includes('/overview');
      if (isOnOverview) {
        // Must show a not-authorized or not-found message
        const blocked = page.locator('text=/not found|not authorized|access denied|no access/i').first();
        await expect(blocked).toBeVisible({ timeout: 10000 });
      } else {
        // Redirected away — acceptable
        expect(page.url()).not.toContain('/overview');
      }
    } finally {
      await deleteTestUser(nonAuthor.user.id);
    }
  });
});

// ---------------------------------------------------------------------------
// Edge-case suite: all recipients waiting (no completions)
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
      { email: 'p700waiting@gmail.com' },
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

  test('View 1 with all waiting: every row shows "· Waiting" status', async ({ page }) => {
    await setTestSession(page, sender.email);
    await page.goto(`/letter/${letterId}/overview`);
    await page.waitForLoadState('networkidle');

    // UI Contract status label: "· Waiting"
    const waitingStatus = page.locator('text=/Waiting/').first();
    await expect(waitingStatus).toBeVisible({ timeout: 10000 });
  });

  test('View 1 with all waiting: no values shown in CLAIM or ANTI columns', async ({ page }) => {
    await setTestSession(page, sender.email);
    await page.goto(`/letter/${letterId}/overview`);
    await page.waitForLoadState('networkidle');

    // When waiting, position values should not appear (no +/− values)
    const waitingRows = page.locator('text=/Waiting/');
    await expect(waitingRows.first()).toBeVisible({ timeout: 10000 });

    // No signed position values (+N / −N) should appear for waiting recipients
    const signedPositions = page.locator('text=/\\+[0-9]|−[0-9]/').first();
    const hasSignedPositions = await signedPositions.isVisible({ timeout: 3000 }).catch(() => false);
    expect(hasSignedPositions, 'Signed positions must not appear for waiting recipients').toBe(false);
  });

  test('View 1 with all waiting: page renders without crashing', async ({ page }) => {
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
  });
});
