/**
 * @file p888-letter-results-nav.spec.ts
 * @description P888 canary tests — letter results/overview lost top navigation
 * (P852 prefix sweep regression).
 *
 * Root cause: clarity-landing-layout.tsx isLetterPage = pathname.startsWith("/letter/")
 * (P852, d7eec751) suppresses SimpleNavigation on ALL /letter/* routes — including
 * /letter/:id/results and /letter/:id/overview, which P699/P700 designed with the
 * top menu visible. Mid-walk on multi-story results there is NO exit affordance at all.
 *
 * Canary tests (FAIL before fix, PASS after):
 *   p888-1: results page shows top nav
 *   p888-2: results page has "Back to Letters" exit on every story (incl. mid-walk)
 *   p888-3: overview page shows top nav (existing FocusHeader retained)
 *
 * Regression guards (PASS before AND after fix — protect intended immersive routes):
 *   p888-4: mobile bottom nav stays hidden on results (focus-page pattern)
 *   p888-5: reading flow stays chrome-free (UUID + shortcode pathname forms)
 *   p888-6: compose stays chrome-free (relies on the layout predicate, not chromeFree)
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
  deleteTestLetter,
} from './helpers/test-letter';
import { createTestSessionInDB } from './helpers/test-session';

const TOP_NAV = 'nav[data-nav="main"]';
const BOTTOM_NAV = 'nav[data-nav="bottom"]';

test.describe('P888: Letter results/overview navigation chrome', () => {
  test.describe.configure({ timeout: 60000 });

  let sender: TestUser;
  let receiver: TestUser;
  let docId: string;
  let storyId1: string;
  let storyId2: string;
  let letterId: string;
  let deliveryToken: string;

  test.beforeAll(async () => {
    sender = await createTestUser({ name: 'P888 Sender' });
    receiver = await createTestUser({ name: 'P888 Receiver' });

    const { data: doc } = await supabaseAdmin
      .from('clarity_docs')
      .insert({ owner_id: sender.user.id, title: 'P888 Nav Test Doc', visibility: 'public' })
      .select('id')
      .single();
    if (!doc) throw new Error('Doc creation failed');
    docId = doc.id;

    // 2 stories → multi-story walk; story 1 is mid-walk (the dead-end variant)
    const story1 = await createTestStory(sender.user.id, {
      title: 'P888 Story 1',
      content: 'First story — mid-walk, no exit affordance before fix.',
    });
    const story2 = await createTestStory(sender.user.id, {
      title: 'P888 Story 2',
      content: 'Second story — last in walk.',
    });
    storyId1 = story1.id;
    storyId2 = story2.id;

    // Attach stories to the doc — compose redirects to the draft editor
    // ("Add stories before composing") when the doc has no doc_stories rows
    await supabaseAdmin.from('doc_stories').insert([
      { doc_id: docId, story_id: storyId1, position: 0 },
      { doc_id: docId, story_id: storyId2, position: 1 },
    ]);

    const versions = await Promise.all(
      [storyId1, storyId2].map(async (sid) => {
        const { data: v } = await supabaseAdmin
          .from('story_versions')
          .select('id')
          .eq('story_id', sid)
          .order('created_at', { ascending: false })
          .limit(1)
          .single();
        return v?.id;
      })
    );
    if (versions.some((v) => !v)) throw new Error('Story versions not found');

    const { letter, delivery } = await createFullTestLetter(
      sender.user.id,
      docId,
      [
        { storyId: storyId1, versionId: versions[0]!, prediction: 5, position: 0 },
        { storyId: storyId2, versionId: versions[1]!, prediction: 7, position: 1 },
      ],
      { email: receiver.email, profileId: receiver.user.id },
      { seal: true }
    );
    letterId = letter.id;
    deliveryToken = delivery.invitationToken;
  });

  test.afterAll(async () => {
    try { await deleteTestLetter(letterId); } catch { /* noop */ }
    try { await supabaseAdmin.from('doc_stories').delete().eq('doc_id', docId); } catch { /* noop */ }
    try { await deleteTestStory(storyId1); } catch { /* noop */ }
    try { await deleteTestStory(storyId2); } catch { /* noop */ }
    try { await supabaseAdmin.from('clarity_docs').delete().eq('id', docId); } catch { /* noop */ }
    try { await deleteTestUser(receiver.user.id); } catch { /* noop */ }
    try { await deleteTestUser(sender.user.id); } catch { /* noop */ }
  });

  // ── Canary: FAIL before fix ────────────────────────────────────────────────

  test('p888-1: results page shows top nav, no console errors', async ({ page }) => {
    // Smoke pattern (tests.md): first test also gates console errors
    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });

    await setTestSession(page, sender.email);
    await page.goto(`/letter/${letterId}/results`);
    await page.waitForLoadState('networkidle');

    // Page content rendered (proves we're past loading, on the real results walk)
    await expect(page.getByText(/story 1 of 2/i)).toBeVisible({ timeout: 10000 });

    // Symptom: SimpleNavigation suppressed by the isLetterPage prefix sweep
    await expect(page.locator(TOP_NAV)).toBeVisible({ timeout: 10000 });

    const appErrors = consoleErrors.filter(
      (e) => !/favicon|net::ERR|Failed to load resource/i.test(e)
    );
    expect(appErrors).toEqual([]);
  });

  test('p888-2: results walk has "Back to Letters" exit on every story', async ({ page }) => {
    await setTestSession(page, sender.email);
    await page.goto(`/letter/${letterId}/results`);
    await page.waitForLoadState('networkidle');
    await expect(page.getByText(/story 1 of 2/i)).toBeVisible({ timeout: 10000 });

    // Exit affordance = any element named "Back to Letters" (link or button —
    // symptom-level, not mechanism-level)
    const exitAffordance = page
      .getByRole('button', { name: /back to letters/i })
      .or(page.getByRole('link', { name: /back to letters/i }))
      .first();

    // Mid-walk (story 1 of 2, NOT last): dead-end before fix — no exit anywhere
    await expect(exitAffordance).toBeVisible({ timeout: 10000 });

    // Last story: StoryWalk's own link already provides an exit (must keep working)
    await page.getByRole('button', { name: /next story/i }).click();
    await expect(page.getByText(/story 2 of 2/i)).toBeVisible({ timeout: 10000 });
    await expect(exitAffordance).toBeVisible({ timeout: 10000 });
  });

  test('p888-3: overview page shows top nav, FocusHeader retained', async ({ page }) => {
    await setTestSession(page, sender.email);
    await page.goto(`/letter/${letterId}/overview`);
    await page.waitForLoadState('networkidle');

    // Existing FocusHeader back button must remain (regression guard within the canary)
    await expect(
      page.getByRole('button', { name: /back to sent tab|back/i }).first()
    ).toBeVisible({ timeout: 10000 });

    // Symptom: top nav suppressed by the same prefix sweep
    await expect(page.locator(TOP_NAV)).toBeVisible({ timeout: 10000 });
  });

  // ── Regression guards: PASS before AND after fix ──────────────────────────

  test.describe('mobile viewport', () => {
    test.use({ viewport: { width: 375, height: 812 } });

    test('p888-4: bottom nav hidden on results (focus-page), visible on /letters (control)', async ({ page }) => {
      await setTestSession(page, sender.email);

      // Control: bottom nav DOES render for this user on a browse page —
      // makes the negative assertion below meaningful
      await page.goto('/letters');
      await page.waitForLoadState('networkidle');
      await expect(page.locator(BOTTOM_NAV)).toBeVisible({ timeout: 10000 });

      // Focus-page pattern: hidden on results (avoids StoryWalk FixedBottomBar collision)
      await page.goto(`/letter/${letterId}/results`);
      await page.waitForLoadState('networkidle');
      await expect(page.getByText(/story 1 of 2/i)).toBeVisible({ timeout: 10000 });
      await expect(page.locator(BOTTOM_NAV)).not.toBeAttached();

      // Same focus-page treatment on overview (AC: both pages)
      await page.goto(`/letter/${letterId}/overview`);
      await page.waitForLoadState('networkidle');
      await expect(page.locator(TOP_NAV)).toBeVisible({ timeout: 10000 });
      await expect(page.locator(BOTTOM_NAV)).not.toBeAttached();
    });
  });

  test('p888-5: reading flow stays chrome-free (UUID + shortcode pathname forms)', async ({ page }) => {
    // UUID form — receiver opens the sealed letter
    await setTestSession(page, receiver.email);
    await page.goto(`/letter/${letterId}?token=${deliveryToken}`);
    await page.waitForLoadState('networkidle');
    await expect(page.locator(TOP_NAV)).not.toBeAttached();

    // Shortcode pathname form (P772): unknown shortcode keeps the pathname and
    // renders the layout — the chrome decision is observable without a real shortcode
    await page.goto('/letter/zz9');
    await page.waitForLoadState('networkidle');
    expect(new URL(page.url()).pathname).toBe('/letter/zz9');
    await expect(page.locator(TOP_NAV)).not.toBeAttached();
  });

  test('p888-6: compose stays chrome-free (relies on layout predicate)', async ({ page }) => {
    await setTestSession(page, sender.email);
    await page.goto(`/letter/${docId}/compose`);
    await page.waitForLoadState('networkidle');
    expect(new URL(page.url()).pathname).toBe(`/letter/${docId}/compose`);
    await expect(page.locator(TOP_NAV)).not.toBeAttached();
  });

  test('p888-7: ActiveSessionBanner renders on results below the top nav (no collision)', async ({ page }) => {
    // AC: "ActiveSessionBanner renders on results/overview when a live session is
    // active, without layout collision" — P852 excluded the banner from letter
    // routes because the reading flow's progress bar is fixed at top-0; results
    // has no such bar, so the banner must come back with the nav.
    const session = await createTestSessionInDB(sender.user.id, 'P888 Partner', {
      hostName: 'P888 Sender',
    });
    try {
      await setTestSession(page, sender.email);
      // Seed the restored-session pointer the way the app persists it (P511);
      // useActiveSession validates the code against the DB row created above.
      await page.context().addInitScript(
        ({ code }) => {
          localStorage.setItem(
            'cp_active_session',
            JSON.stringify({
              code,
              partnerName: 'P888 Partner',
              role: 'creator',
              timestamp: new Date().toISOString(),
            })
          );
        },
        { code: session.sessionCode }
      );
      await page.goto(`/letter/${letterId}/results`);
      await page.waitForLoadState('networkidle');
      await expect(page.getByText(/story 1 of 2/i)).toBeVisible({ timeout: 10000 });

      const banner = page.getByRole('status', { name: 'Active session notification' });
      await expect(banner).toBeVisible({ timeout: 10000 });
      await expect(page.locator(TOP_NAV)).toBeVisible({ timeout: 10000 });

      // No collision: banner's top edge sits at/below the fixed nav's bottom edge
      const navBox = await page.locator(TOP_NAV).boundingBox();
      const bannerBox = await banner.boundingBox();
      expect(navBox).not.toBeNull();
      expect(bannerBox).not.toBeNull();
      expect(bannerBox!.y).toBeGreaterThanOrEqual(navBox!.y + navBox!.height);
    } finally {
      await session.cleanup();
    }
  });
});
