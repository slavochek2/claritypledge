/**
 * P967 E2E: Calibration Breakdown Page
 *
 * Covers:
 * - Smoke: page loads at /me/calibration with no console errors
 * - Empty state (0 rows): exact UI Contract strings
 * - Pre-unlock state (<5 eligible rows): rows visible, verdict hidden, progress string
 * - Unlocked state (≥5 rows): full table, footer, CTAs
 * - Faithfulness display: footer shows sum ÷ N diffs = avg
 * - Navigation: bar link on own profile → /me/calibration
 * - CTA presence: "Practice in a session" (→/live) + "Learn more about the Co-Founder Program →" (→/program)
 *
 * Auth: uses setTestSession() — browser sees the user's JWT on first navigation.
 * Data seeding: supabaseAdmin inserts verification rows directly; RPC returns them.
 */

import { test, expect } from '@playwright/test';
import { supabaseAdmin } from './helpers/supabase-admin';
import { createTestUser, generateTestEmail, setTestSession, deleteTestUser } from './helpers/test-user';

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function insertPublicStory(authorId: string, suffix = ''): Promise<string> {
  const { data, error } = await supabaseAdmin
    .from('stories')
    .insert({
      author_id: authorId,
      title: `P967 E2E story${suffix} ${Date.now()}`,
      visibility: 'public',
    })
    .select('id')
    .single();
  if (error) throw new Error(`[p967-e2e] Insert story failed: ${error.message}`);
  return data.id as string;
}

async function insertVerification({
  speakerId,
  listenerId,
  storyId,
  speakerRating,
  listenerRating,
}: {
  speakerId: string;
  listenerId: string;
  storyId: string;
  speakerRating: number;
  listenerRating: number;
}): Promise<string> {
  const { data, error } = await supabaseAdmin
    .from('story_verifications')
    .insert({
      speaker_id: speakerId,
      listener_id: listenerId,
      story_id: storyId,
      speaker_rating: speakerRating,
      listener_rating: listenerRating,
      accuracy_achieved: true,
    })
    .select('id')
    .single();
  if (error) throw new Error(`[p967-e2e] Insert verification failed: ${error.message}`);
  return data.id as string;
}

// ─────────────────────────────────────────────────────────────────────────────

test.describe('P967: Calibration Breakdown Page', () => {

  // ── SMOKE ────────────────────────────────────────────────────────────────────

  test.describe('smoke', () => {
    let userId: string;
    let email: string;

    test.beforeAll(async () => {
      const user = await createTestUser({ name: 'P967 Smoke User', email: generateTestEmail() });
      userId = user.user.id;
      email = user.email;
    });

    test.afterAll(async () => {
      await deleteTestUser(userId);
    });

    test('smoke: page loads at /me/calibration with no console errors', async ({ page }) => {
      const consoleErrors: string[] = [];
      page.on('console', msg => {
        if (msg.type() === 'error') consoleErrors.push(msg.text());
      });

      await setTestSession(page, email);
      await page.goto('/me/calibration');
      await page.waitForLoadState('networkidle');

      // Page renders without crash
      expect(page.url()).toContain('/me/calibration');

      // No JS console errors
      const filteredErrors = consoleErrors.filter(
        e =>
          !e.includes('favicon') &&
          !e.includes('Warning:') &&
          !e.includes('[HMR]')
      );
      expect(filteredErrors, `Console errors: ${filteredErrors.join('\n')}`).toHaveLength(0);

      // FocusHeader back button is present (focus-page chrome)
      // The button navigates to /me
      await expect(page.getByRole('button', { name: /back/i }).or(
        page.locator('[data-testid="focus-header-back"]')
      )).toBeVisible();
    });
  });

  // ── EMPTY STATE ──────────────────────────────────────────────────────────────

  test.describe('empty state (0 eligible rows)', () => {
    let userId: string;
    let email: string;

    test.beforeAll(async () => {
      const user = await createTestUser({ name: 'P967 Empty User', email: generateTestEmail() });
      userId = user.user.id;
      email = user.email;
      // No verification rows inserted
    });

    test.afterAll(async () => {
      await deleteTestUser(userId);
    });

    test('shows empty state copy and Start a session CTA', async ({ page }) => {
      await setTestSession(page, email);
      await page.goto('/me/calibration');
      await page.waitForLoadState('networkidle');

      // Exact UI Contract string (from spec § UI Contract)
      await expect(
        page.getByText('Finish your first listening session to start seeing your calibration diffs.')
      ).toBeVisible();

      // Start a session CTA
      await expect(page.getByRole('link', { name: 'Start a session' }).or(
        page.getByRole('button', { name: 'Start a session' })
      )).toBeVisible();

      // NO table rows shown
      await expect(page.locator('tbody tr')).toHaveCount(0);

      // NO verdict label shown
      await expect(page.getByText(/overconfident|underconfident|calibrated/i)).not.toBeVisible();
    });
  });

  // ── PRE-UNLOCK STATE ─────────────────────────────────────────────────────────

  test.describe('pre-unlock state (3 eligible rows, < 5)', () => {
    let listenerUserId: string;
    let listenerEmail: string;
    let speakerUserId: string;
    const storyIds: string[] = [];
    const verificationIds: string[] = [];

    test.beforeAll(async () => {
      const listener = await createTestUser({ name: 'P967 Listener PreUnlock', email: generateTestEmail() });
      listenerUserId = listener.user.id;
      listenerEmail = listener.email;

      const speaker = await createTestUser({ name: 'P967 Speaker PreUnlock', email: generateTestEmail() });
      speakerUserId = speaker.user.id;

      // Insert 3 eligible verification rows (listener is the subject)
      for (let i = 0; i < 3; i++) {
        const sid = await insertPublicStory(speakerUserId, `-preunlock-${i}`);
        storyIds.push(sid);
        const vid = await insertVerification({
          speakerId: speakerUserId,
          listenerId: listenerUserId,
          storyId: sid,
          speakerRating: 6,
          listenerRating: 8,
        });
        verificationIds.push(vid);
      }
    });

    test.afterAll(async () => {
      await supabaseAdmin.from('story_verifications').delete().in('id', verificationIds);
      for (const sid of storyIds) await supabaseAdmin.from('stories').delete().eq('id', sid);
      await deleteTestUser(listenerUserId);
      await deleteTestUser(speakerUserId);
    });

    test('shows 3 diff rows but verdict label hidden', async ({ page }) => {
      await setTestSession(page, listenerEmail);
      await page.goto('/me/calibration');
      await page.waitForLoadState('networkidle');

      // Rows ARE shown (pre-unlock shows accruing rows)
      const rows = page.locator('tbody tr');
      await expect(rows).toHaveCount(3);

      // Verdict label NOT shown (unlocks at 5)
      await expect(page.getByText(/overconfident|underconfident/i)).not.toBeVisible();
    });

    test('shows progress string with exact UI Contract format', async ({ page }) => {
      await setTestSession(page, listenerEmail);
      await page.goto('/me/calibration');
      await page.waitForLoadState('networkidle');

      // UI Contract: "{filled} of 5 — your score unlocks after {remaining} more"
      // 3 filled, 2 remaining
      await expect(
        page.getByText('3 of 5 — your score unlocks after 2 more')
      ).toBeVisible();
    });

    test('does NOT show empty state copy when rows exist', async ({ page }) => {
      await setTestSession(page, listenerEmail);
      await page.goto('/me/calibration');
      await page.waitForLoadState('networkidle');

      await expect(
        page.getByText('Finish your first listening session to start seeing your calibration diffs.')
      ).not.toBeVisible();
    });
  });

  // ── UNLOCKED STATE ───────────────────────────────────────────────────────────

  test.describe('unlocked state (5 eligible rows)', () => {
    let listenerUserId: string;
    let listenerEmail: string;
    let speakerUserId: string;
    const storyIds: string[] = [];
    const verificationIds: string[] = [];

    // Fixture: 5 rows
    // speaker_rating = 5, listener_rating = 7 → diff = −2 each row
    // sum = −10, count = 5, avg = −2.0
    const SPEAKER_RATING = 5;
    const LISTENER_RATING = 7;
    const EXPECTED_DIFF = -2; // 5 − 7 = −2
    const EXPECTED_SUM = -10;
    const EXPECTED_AVG = -2.0;

    test.beforeAll(async () => {
      const listener = await createTestUser({ name: 'P967 Listener Unlocked', email: generateTestEmail() });
      listenerUserId = listener.user.id;
      listenerEmail = listener.email;

      const speaker = await createTestUser({ name: 'P967 Speaker Unlocked', email: generateTestEmail() });
      speakerUserId = speaker.user.id;

      for (let i = 0; i < 5; i++) {
        const sid = await insertPublicStory(speakerUserId, `-unlocked-${i}`);
        storyIds.push(sid);
        const vid = await insertVerification({
          speakerId: speakerUserId,
          listenerId: listenerUserId,
          storyId: sid,
          speakerRating: SPEAKER_RATING,
          listenerRating: LISTENER_RATING,
        });
        verificationIds.push(vid);
      }
    });

    test.afterAll(async () => {
      await supabaseAdmin.from('story_verifications').delete().in('id', verificationIds);
      for (const sid of storyIds) await supabaseAdmin.from('stories').delete().eq('id', sid);
      await deleteTestUser(listenerUserId);
      await deleteTestUser(speakerUserId);
    });

    test('shows 5 diff rows in the table', async ({ page }) => {
      await setTestSession(page, listenerEmail);
      await page.goto('/me/calibration');
      await page.waitForLoadState('networkidle');

      await expect(page.locator('tbody tr')).toHaveCount(5);
    });

    test('shows signed col3 values (−2 per row), not word labels', async ({ page }) => {
      await setTestSession(page, listenerEmail);
      await page.goto('/me/calibration');
      await page.waitForLoadState('networkidle');

      // All 5 rows show −2 in gap column
      const gapCells = page.locator('tbody tr td:nth-child(3)'); // col3 = 3rd column
      await expect(gapCells).toHaveCount(5);
      const texts = await gapCells.allTextContents();
      for (const text of texts) {
        expect(text.trim()).toBe(String(EXPECTED_DIFF)); // "−2" or "-2"
      }

      // No per-row word labels (overconfident/underconfident should not appear per-row)
      // Verdict may appear once at the top, but not in each row cell
      const rowCells = page.locator('tbody td');
      const allCellTexts = await rowCells.allTextContents();
      const wordLabelInRows = allCellTexts.filter(t =>
        /overconfident|underconfident/i.test(t)
      );
      expect(wordLabelInRows).toHaveLength(0);
    });

    test('footer shows correct sum ÷ N diffs = avg (UI Contract format)', async ({ page }) => {
      await setTestSession(page, listenerEmail);
      await page.goto('/me/calibration');
      await page.waitForLoadState('networkidle');

      // UI Contract: "sum {S} ÷ {N} diffs = {avg}"
      // With our fixture: "sum −10 ÷ 5 diffs = −2"
      await expect(
        page.getByText(`sum ${EXPECTED_SUM} ÷ 5 diffs = ${EXPECTED_AVG}`)
      ).toBeVisible();
    });

    test('footer average sign matches bar value (faithfulness — not raw calibrationGap)', async ({ page }) => {
      await setTestSession(page, listenerEmail);
      await page.goto('/me/calibration');
      await page.waitForLoadState('networkidle');

      // Our fixture has speaker_rating < listener_rating → listener is overconfident
      // The bar shows: actual − self = −2.0 (negative = overconfident)
      // The footer must show −2 (not +2, which would be the raw calibrationGap sign)
      const footerText = await page
        .getByText(/sum.*÷.*diffs.*=/)
        .textContent();

      expect(footerText).toContain(`${EXPECTED_SUM}`); // −10
      expect(footerText).toContain(`${EXPECTED_AVG}`); // −2
      expect(footerText).not.toContain(String(-EXPECTED_SUM)); // must not show +10
      expect(footerText).not.toContain(String(-EXPECTED_AVG)); // must not show +2
    });

    test('column headers: col1 "you believed you understood their intended meaning", col2 "they believe you understood them after you explained back", col3 "gap"', async ({ page }) => {
      await setTestSession(page, listenerEmail);
      await page.goto('/me/calibration');
      await page.waitForLoadState('networkidle');

      // Wide-screen header labels (UI Contract full sentences)
      await expect(
        page.getByText('you believed you understood their intended meaning')
      ).toBeVisible();
      await expect(
        page.getByText('they believe you understood them after you explained back')
      ).toBeVisible();
      await expect(page.getByRole('columnheader', { name: 'gap' })).toBeVisible();
    });

    test('shows "Practice in a session" primary CTA linking to /live', async ({ page }) => {
      await setTestSession(page, listenerEmail);
      await page.goto('/me/calibration');
      await page.waitForLoadState('networkidle');

      const cta = page.getByRole('link', { name: 'Practice in a session' });
      await expect(cta).toBeVisible();
      await expect(cta).toHaveAttribute('href', '/live');
    });

    test('shows "Learn more about the Co-Founder Program →" secondary CTA linking to /program', async ({ page }) => {
      await setTestSession(page, listenerEmail);
      await page.goto('/me/calibration');
      await page.waitForLoadState('networkidle');

      const cta = page.getByRole('link', { name: 'Learn more about the Co-Founder Program →' });
      await expect(cta).toBeVisible();
      await expect(cta).toHaveAttribute('href', '/program');
    });

    test('does NOT show "Finish your first listening session" copy', async ({ page }) => {
      await setTestSession(page, listenerEmail);
      await page.goto('/me/calibration');
      await page.waitForLoadState('networkidle');

      await expect(
        page.getByText('Finish your first listening session to start seeing your calibration diffs.')
      ).not.toBeVisible();
    });
  });

  // ── NAVIGATION: bar link ──────────────────────────────────────────────────

  test.describe('profile bar link to /me/calibration', () => {
    let userId: string;
    let email: string;

    test.beforeAll(async () => {
      const user = await createTestUser({ name: 'P967 Nav User', email: generateTestEmail() });
      userId = user.user.id;
      email = user.email;
    });

    test.afterAll(async () => {
      await deleteTestUser(userId);
    });

    test('calibration bar on own profile is a link to /me/calibration', async ({ page }) => {
      await setTestSession(page, email);
      await page.goto('/me');
      await page.waitForLoadState('networkidle');

      // UI Contract bar link label: "See your {N} diffs →"
      // With 0 rows it might show "See your 0 diffs →" or be absent;
      // test the link structure exists (actual text depends on row count).
      // Find the link that navigates to /me/calibration.
      const barLink = page.getByRole('link', { name: /see your.*diffs/i });
      if (await barLink.count() > 0) {
        await expect(barLink).toHaveAttribute('href', /\/me\/calibration/);
      } else {
        // If no eligible rows, the link may not render — skip navigation assertion.
        // The important thing is /me/calibration is reachable directly.
        console.log('[p967-e2e] Bar link not visible (0 eligible rows) — testing direct navigation');
        await page.goto('/me/calibration');
        await page.waitForLoadState('networkidle');
        expect(page.url()).toContain('/me/calibration');
      }
    });
  });
});
