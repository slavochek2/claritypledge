/**
 * @file p860-verify.spec.ts
 * @description P860 live UAT — story-rate content centers above the pinned
 *   drawer (Option A: flex-col + my-auto safe centering).
 *
 * Reachability: a 1-point story is story-first (D36), so after "Open the
 * Letter" the FIRST phase is story-rate — no position-lock drive needed.
 * Seed mirrors p581-letter-reading. Short story → the dead-gap case.
 *
 * Verifies the REAL LetterFlowContent (not the CSS harness): screenshots at
 * desktop + mobile AND a geometric assertion that the card sits between the
 * top bar and the fixed drawer with roughly symmetric gaps.
 */

import { test, expect, type Page } from '@playwright/test';
import { supabaseAdmin } from './helpers/supabase-admin';
import { createTestUser, setTestSession, deleteTestUser, type TestUser } from './helpers/test-user';
import { createTestStory, deleteTestStory } from './helpers/test-story';
import { createTestPoint, deleteTestPoint } from './helpers/test-point';

// Repo-relative, gitignored (Playwright output dir) — no absolute /Users paths.
const SHOT_DIR = 'test-results/p860';

test.describe('P860: story-rate centering — live verify', () => {
  test.describe.configure({ timeout: 90000 });

  let sender: TestUser;
  let receiver: TestUser;
  let docId: string;
  let storyId: string;
  let pointId: string;
  let letterId: string;
  let deliveryId: string;

  test.beforeAll(async () => {
    sender = await createTestUser({ name: 'P860 Sender' });
    receiver = await createTestUser({ name: 'P860 Receiver' });

    const { data: doc } = await supabaseAdmin
      .from('clarity_docs')
      .insert({ owner_id: sender.user.id, title: 'P860 Test Doc', visibility: 'public' })
      .select('id')
      .single();
    if (!doc) throw new Error('Doc creation failed');
    docId = doc.id;

    // SHORT story — the dead-gap / centering case
    const story = await createTestStory(sender.user.id, {
      title: 'P860 short story',
      content: 'I almost did not send this. But I think you deserve to hear it plainly.',
    });
    storyId = story.id;

    const point = await createTestPoint(sender.user.id, {
      statement: 'Mutual understanding matters more than speed of agreement.',
    });
    pointId = point.id;

    await supabaseAdmin.from('doc_stories').insert({ doc_id: docId, story_id: storyId, position: 0 });
    await supabaseAdmin.from('story_points').insert({ story_id: storyId, point_id: pointId, author_id: sender.user.id });

    const { data: letter } = await supabaseAdmin
      .from('clarity_letters')
      .insert({
        source_doc_id: docId,
        sender_id: sender.user.id,
        mode: 'one-to-one',
        status: 'sealed',
        sealed_at: new Date().toISOString(),
      })
      .select('id')
      .single();
    if (!letter) throw new Error('Letter creation failed');
    letterId = letter.id;

    const { data: version } = await supabaseAdmin
      .from('story_versions')
      .select('id')
      .eq('story_id', storyId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();
    if (version) {
      await supabaseAdmin.from('letter_story_snapshots').insert({
        letter_id: letterId,
        story_id: storyId,
        version_id: version.id,
        position: 0,
        visibility: 'public',
      });
    }

    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const { data: delivery } = await supabaseAdmin
      .from('letter_deliveries')
      .insert({
        letter_id: letterId,
        receiver_email: receiver.email,
        receiver_profile_id: receiver.user.id,
        invitation_expires_at: expiresAt,
      })
      .select('id')
      .single();
    if (!delivery) throw new Error('Delivery creation failed');
    deliveryId = delivery.id;

    await supabaseAdmin.from('letter_predictions').insert({
      letter_id: letterId,
      delivery_id: deliveryId,
      story_id: storyId,
      prediction: 3,
    });
  });

  test.afterAll(async () => {
    if (letterId) {
      await supabaseAdmin.from('letter_predictions').delete().eq('letter_id', letterId);
      await supabaseAdmin.from('letter_story_snapshots').delete().eq('letter_id', letterId);
      await supabaseAdmin.from('letter_deliveries').delete().eq('letter_id', letterId);
      await supabaseAdmin.from('clarity_letters').delete().eq('id', letterId);
    }
    if (storyId) await supabaseAdmin.from('story_points').delete().eq('story_id', storyId);
    if (docId) await supabaseAdmin.from('doc_stories').delete().eq('doc_id', docId);
    if (storyId) await deleteTestStory(storyId).catch(() => {});
    if (pointId) await deleteTestPoint(pointId).catch(() => {});
    if (docId) await supabaseAdmin.from('clarity_docs').delete().eq('id', docId);
    if (sender?.user?.id) await deleteTestUser(sender.user.id);
    if (receiver?.user?.id) await deleteTestUser(receiver.user.id);
  });

  async function openToStoryRate(page: Page) {
    await setTestSession(page, receiver.email);
    // Preview route renders the SAME real LetterFlowContent, non-persisting,
    // no token/delivery → no consent/auth cover gate (the reading-page route
    // stalls at cover in this seeded harness — orthogonal to P860).
    await page.goto(`/letter/${docId}/preview`);
    await page.waitForLoadState('networkidle');

    const openBtn = page.getByRole('button', { name: /open the letter/i }).first();
    await expect(openBtn).toBeVisible({ timeout: 10000 });
    // CTA uses aria-disabled while isAuthenticating — wait until it clears.
    await expect(openBtn).not.toHaveAttribute('aria-disabled', 'true', { timeout: 10000 });
    await page.waitForTimeout(300); // hydration settle

    // Click and confirm the cover actually leaves (viewState → reading).
    let advanced = false;
    for (let attempt = 0; attempt < 3 && !advanced; attempt++) {
      await openBtn.click();
      advanced = await openBtn
        .waitFor({ state: 'detached', timeout: 4000 })
        .then(() => true)
        .catch(() => false);
    }
    // story-rate: the comprehension question is the unambiguous marker
    await expect(page.getByText(/how well do you believe you understand/i)).toBeVisible({ timeout: 10000 });
    // let drawerHeight settle (paddingBottom measurement) before measuring
    await page.waitForTimeout(400);
  }

  test('desktop 1280x900: card centered between top bar and pinned drawer', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await openToStoryRate(page);
    await page.screenshot({ path: `${SHOT_DIR}/p860-live-desktop.png` });

    const m = await page.evaluate(() => {
      const card = document.querySelector('[data-testid="live-story-card-expanded"]') as HTMLElement | null;
      const bar = document.querySelector('[role="progressbar"]') as HTMLElement | null;
      const fixedEls = Array.from(document.querySelectorAll('div')).filter(
        (el) => getComputedStyle(el).position === 'fixed'
      );
      const drawer = fixedEls.find(
        (el) => /Continue/.test(el.textContent || '') &&
          el.getBoundingClientRect().bottom >= window.innerHeight - 8
      );
      const c = card!.getBoundingClientRect();
      const b = bar ? bar.getBoundingClientRect() : ({ bottom: 0 } as DOMRect);
      const d = drawer ? drawer.getBoundingClientRect() : ({ top: window.innerHeight } as DOMRect);
      return {
        found: { card: !!card, bar: !!bar, drawer: !!drawer },
        gapTop: Math.round(c.top - b.bottom),
        gapBottom: Math.round(d.top - c.bottom),
        cardTop: Math.round(c.top),
        cardBottom: Math.round(c.bottom),
        barBottom: Math.round(b.bottom),
        drawerTop: Math.round(d.top),
        vh: window.innerHeight,
      };
    });
    expect(m.found.card, 'story card present').toBe(true);
    expect(m.found.drawer, 'fixed drawer present').toBe(true);
    // The AC: "centered above the drawer; no dead band stranded at the top."
    // Encode that as: real breathing room on BOTH sides (proves it is not
    // top-aligned, the old bug), and the card center sits within 20% of the
    // region center between the top bar and the drawer (proves "centered").
    expect(m.gapTop, 'breathing room above card').toBeGreaterThan(40);
    expect(m.gapBottom, 'breathing room below card (to drawer)').toBeGreaterThan(40);
    const cardCenter = (m.cardTop + m.cardBottom) / 2;
    const regionCenter = (m.barBottom + m.drawerTop) / 2;
    const regionHeight = m.drawerTop - m.barBottom;
    const offCenterFrac = Math.abs(cardCenter - regionCenter) / regionHeight;
    expect(offCenterFrac, 'card roughly centered in the band (not stranded)').toBeLessThan(0.2);
  });

  test('mobile 390x844: card visible, rating drawer on screen, no overflow', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openToStoryRate(page);
    await page.screenshot({ path: `${SHOT_DIR}/p860-live-mobile.png` });

    await expect(page.getByText(/how well do you believe you understand/i)).toBeInViewport();
    const card = page.locator('[data-testid="live-story-card-expanded"]');
    await expect(card).toBeVisible();
    // no horizontal overflow
    const overflowed = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth + 1
    );
    expect(overflowed, 'no horizontal overflow at 390px').toBe(false);
  });
});
