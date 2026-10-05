/**
 * P1423: cards carry no coloured left stripe, and a private card stays visibly private without it.
 *
 * Seeds an owner with a public and a private story, point and letter draft (plus a stories-only
 * owner for the profile), then walks the signed-in surfaces that render them. On each page every element with a left border of 3px or
 * more must be a quotation (blockquote) — the one *keep* row these surfaces can render.
 * Screenshots land in test-results/p1423/ for the visual review.
 */
import { test, expect, type Page } from '@playwright/test';
import { createTestUser, deleteTestUser, setTestSession, type TestUser } from './helpers/test-user';
import { createTestStory, deleteTestStory } from './helpers/test-story';
import { createTestPoint, deleteTestPoint } from './helpers/test-point';
import { createTestDoc } from './helpers/test-letter';
import { supabaseAdmin } from './helpers/supabase-admin';

const WIDTHS = [375, 320, 1280];
/** InlineVisibilityIcon's accessible name for a private item (visibility-badge.tsx). */
const PRIVATE_LABEL = 'Only people you share with can see this.';

/** Elements with a thick left or top border that are not quotations — the stripes P1423 removed
 *  (the story page also drew a 3px top band in the author's colour). */
async function cardStripes(page: Page): Promise<string[]> {
  return page.evaluate(() =>
    [...document.querySelectorAll('body *')]
      .filter((el) => {
        const s = getComputedStyle(el);
        const thick = (style: string, width: string) => style !== 'none' && parseFloat(width) >= 3;
        return el.tagName !== 'BLOCKQUOTE' && (thick(s.borderLeftStyle, s.borderLeftWidth) || thick(s.borderTopStyle, s.borderTopWidth));
      })
      .map((el) => `${el.tagName}.${String((el as HTMLElement).className).slice(0, 100)}`),
  );
}

async function checkPage(page: Page, name: string, url: string, ready: () => Promise<void>) {
  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(url);
    await ready();
    await page.screenshot({ path: `test-results/p1423/${name}-${width}.png`, fullPage: true });
    expect(await cardStripes(page), `${name} at ${width}px`).toEqual([]);
  }
}

test.describe('P1423 — no left stripe on cards', () => {
  let owner: TestUser;
  const storyIds: string[] = [];
  const pointIds: string[] = [];
  const docIds: string[] = [];
  const tag = `p1423${Date.now().toString(36)}`;

  test.beforeAll(async () => {
    owner = await createTestUser({ name: 'Stripe Owner' });
    const uid = owner.user.id;
    storyIds.push((await createTestStory(uid, { content: `Public story ${tag}`, visibility: 'public' })).id);
    storyIds.push((await createTestStory(uid, { content: `Private story ${tag}`, visibility: 'private' })).id);
    pointIds.push((await createTestPoint(uid, { statement: `Public point ${tag}`, visibility: 'public' })).id);
    pointIds.push((await createTestPoint(uid, { statement: `Private point ${tag}`, visibility: 'private' })).id);
    const pub = await createTestDoc(uid, `Public letter ${tag}`);
    const priv = await createTestDoc(uid, `Private letter ${tag}`);
    docIds.push(pub.id, priv.id);
    const { error } = await supabaseAdmin.from('clarity_docs').update({ visibility: 'public' }).eq('id', pub.id);
    if (error) throw new Error(`doc visibility: ${error.message}`);
  });

  test.afterAll(async () => {
    if (docIds.length) await supabaseAdmin.from('clarity_docs').delete().in('id', docIds);
    for (const id of storyIds) await deleteTestStory(id).catch(() => {});
    for (const id of pointIds) await deleteTestPoint(id).catch(() => {});
    if (owner) await deleteTestUser(owner.user.id);
  });

  test.beforeEach(async ({ page }) => {
    await setTestSession(page, owner.email);
  });

  // A separate owner with stories only: a profile owning points stayed on its loading skeleton on
  // the test DB, on unchanged main as well (p154's profile spec failed 6/6 there), which is not
  // this spec's to fix. The private point's background is pinned by
  // src/tests/p1366-card-footer.test.tsx instead.
  test('profile stories: no stripe', async ({ page }) => {
    test.setTimeout(120_000); // seeds its own user, then loads the profile at three widths
    const storyOwner = await createTestUser({ name: 'Stripe Story Owner' });
    const ids = [
      (await createTestStory(storyOwner.user.id, { content: `Profile public ${tag}`, visibility: 'public' })).id,
      (await createTestStory(storyOwner.user.id, { content: `Profile private ${tag}`, visibility: 'private' })).id,
    ];
    try {
      await setTestSession(page, storyOwner.email);
      await checkPage(page, 'profile-stories', `/p/${storyOwner.slug}`, async () => {
        await expect(page.getByText(`Profile public ${tag}`)).toBeVisible({ timeout: 30000 });
      });
      // A profile lists public stories only (the private one is seeded to prove it stays off it),
      // so no private card renders here; the private story card is checked on its own page.
      await expect(page.getByText(`Profile private ${tag}`)).toHaveCount(0);
    } finally {
      for (const id of ids) await deleteTestStory(id).catch(() => {});
      await deleteTestUser(storyOwner.user.id);
    }
  });

  test('story and point pages: no stripe', async ({ page }) => {
    await checkPage(page, 'story-page', `/story/${storyIds[1]}`, async () => {
      await expect(page.getByText(`Private story ${tag}`).first()).toBeVisible({ timeout: 20000 });
    });
    await checkPage(page, 'point-page', `/point/${pointIds[0]}`, async () => {
      await expect(page.getByText(`Public point ${tag}`).first()).toBeVisible({ timeout: 20000 });
    });
  });

  test('letter drafts: no stripe; the private draft keeps its lock and muted background', async ({ page }) => {
    await checkPage(page, 'letters-drafts', '/letters?tab=drafts', async () => {
      await expect(page.getByText(`Private letter ${tag}`)).toBeVisible({ timeout: 20000 });
    });
    // Private keeps the app's private treatment: the lock and the muted background stories use.
    const privateDraft = page.getByRole('button').filter({ hasText: `Private letter ${tag}` });
    const publicDraft = page.getByRole('button').filter({ hasText: `Public letter ${tag}` });
    await expect(privateDraft.getByRole('img', { name: PRIVATE_LABEL })).toBeVisible();
    await expect(publicDraft.getByRole('img', { name: PRIVATE_LABEL })).toHaveCount(0);
    await expect(privateDraft).toHaveClass(/bg-muted\/60/);
    await expect(publicDraft).not.toHaveClass(/bg-muted\/60/);
  });
});
