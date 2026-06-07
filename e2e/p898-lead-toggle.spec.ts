/**
 * @file p898-lead-toggle.spec.ts
 * @description P898: per-point "lead" toggle on doc-detail point rows.
 *
 * Verifies the compose-side control for the pre/post-story split:
 *  - default: first visible point renders pre-marked as lead (aria-pressed)
 *  - marking a second point moves it to the end of the lead group in
 *    point_config.order and persists lead_count=2
 *  - unmarking the last lead persists lead_count=0 (story-first is allowed)
 *
 * Also captures screenshots at 3 viewports for visual QA
 * (test-results/p898-visual/).
 */

import { test, expect } from '@playwright/test';
import { supabaseAdmin } from './helpers/supabase-admin';
import { createTestUser, deleteTestUser, setTestSession, type TestUser } from './helpers/test-user';
import { createTestStory, deleteTestStory, linkStoryToPoint } from './helpers/test-story';
import { createTestPoint, deleteTestPoint } from './helpers/test-point';

test.describe.configure({ mode: 'serial' });

test.describe('P898: doc-detail lead toggle', () => {
  test.setTimeout(90000);

  let owner: TestUser;
  let docId: string;
  let storyId: string;
  const pointIds: string[] = [];

  test.beforeAll(async () => {
    owner = await createTestUser({ name: 'P898-Lead-Toggle-Owner' });

    const { data: doc } = await supabaseAdmin
      .from('clarity_docs')
      .insert({ owner_id: owner.user.id, title: 'P898 lead toggle doc', visibility: 'private' })
      .select('id')
      .single();
    if (!doc) throw new Error('Doc creation failed');
    docId = doc.id;

    const story = await createTestStory(owner.user.id, {
      content: 'P898: story content for the lead toggle test',
      visibility: 'private',
    });
    storyId = story.id;

    for (let i = 0; i < 3; i++) {
      const point = await createTestPoint(owner.user.id, {
        statement: `P898 point ${i}`,
        visibility: 'private',
      });
      pointIds.push(point.id);
      await linkStoryToPoint(storyId, point.id);
    }

    await supabaseAdmin.from('doc_stories').insert({
      doc_id: docId,
      story_id: storyId,
      position: 0,
      point_config: { order: pointIds },
    });
  });

  test.afterAll(async () => {
    if (docId) await supabaseAdmin.from('doc_stories').delete().eq('doc_id', docId);
    for (const id of pointIds) await deleteTestPoint(id);
    if (storyId) await deleteTestStory(storyId);
    if (docId) await supabaseAdmin.from('clarity_docs').delete().eq('id', docId);
    if (owner?.user?.id) await deleteTestUser(owner.user.id);
  });

  test('smoke: doc detail loads, points expand, lead toggle visible with first point pre-marked', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });

    await setTestSession(page, owner.email);
    await page.goto(`/d/${docId}`);

    // Expand the collapsed points section
    const expandButton = page.getByRole('button', { name: 'Expand linked points', exact: true });
    await expect(expandButton).toBeVisible({ timeout: 15000 });
    await expandButton.click();

    // Default: exactly one pre-marked lead (the first point), two unmarked
    const markedLeads = page.getByRole('button', { name: 'Move after the story' });
    const unmarkedLeads = page.getByRole('button', { name: 'Show before the story' });
    await expect(markedLeads).toHaveCount(1);
    await expect(unmarkedLeads).toHaveCount(2);
    await expect(markedLeads.first()).toHaveAttribute('aria-pressed', 'true');

    // Tooltips fire even on DISABLED buttons (first row's Move up is disabled;
    // shadcn's disabled:pointer-events-none would swallow hover without the
    // span wrapper in DocBlockControls)
    const firstRowMoveUp = page.getByRole('button', { name: 'Move up' }).first();
    await expect(firstRowMoveUp).toBeDisabled();
    await firstRowMoveUp.locator('..').hover(); // hover the span wrapper
    await expect(page.getByRole('tooltip', { name: 'Move up' })).toBeVisible();

    // Visual QA captures — desktop / tablet / mobile
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.locator('.group\\/point').first().hover(); // reveal hover-gated controls
    await page.screenshot({ path: 'test-results/p898-visual/doc-detail-desktop.png', fullPage: true });
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.screenshot({ path: 'test-results/p898-visual/doc-detail-tablet.png', fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: 'test-results/p898-visual/doc-detail-mobile.png', fullPage: true });

    const realErrors = consoleErrors.filter(
      (e) => !e.includes('favicon') && !e.includes('Failed to load resource'),
    );
    expect(realErrors, `Console errors: ${realErrors.join('\n')}`).toHaveLength(0);
  });

  test('marking a point as lead moves it to the end of the lead group and persists lead_count=2', async ({ page }) => {
    await setTestSession(page, owner.email);
    await page.goto(`/d/${docId}`);
    await page.getByRole('button', { name: 'Expand linked points', exact: true }).click();

    // Mark the LAST point (index 2) as lead
    await page.getByRole('button', { name: 'Show before the story' }).nth(1).click();

    // Optimistic UI: now two marked leads
    await expect(page.getByRole('button', { name: 'Move after the story' })).toHaveCount(2);

    // DB write: lead_count=2, marked point moved to end of lead group (index 1)
    await expect
      .poll(
        async () => {
          const { data } = await supabaseAdmin
            .from('doc_stories')
            .select('point_config')
            .eq('doc_id', docId)
            .eq('story_id', storyId)
            .single();
          return data?.point_config as { order?: string[]; lead_count?: number };
        },
        { timeout: 10000 },
      )
      .toMatchObject({
        lead_count: 2,
        order: [pointIds[0], pointIds[2], pointIds[1]],
      });

    await page.setViewportSize({ width: 1280, height: 900 });
    await page.locator('.group\\/point').first().hover();
    await page.screenshot({ path: 'test-results/p898-visual/doc-detail-two-leads.png', fullPage: true });
  });

  test('unmarking every lead persists lead_count=0 (story-first)', async ({ page }) => {
    await setTestSession(page, owner.email);
    await page.goto(`/d/${docId}`);
    await page.getByRole('button', { name: 'Expand linked points', exact: true }).click();

    // Unmark both leads (re-query after each click — the list re-renders)
    await page.getByRole('button', { name: 'Move after the story' }).first().click();
    await expect(page.getByRole('button', { name: 'Move after the story' })).toHaveCount(1);
    await page.getByRole('button', { name: 'Move after the story' }).first().click();
    await expect(page.getByRole('button', { name: 'Move after the story' })).toHaveCount(0);

    await expect
      .poll(
        async () => {
          const { data } = await supabaseAdmin
            .from('doc_stories')
            .select('point_config')
            .eq('doc_id', docId)
            .eq('story_id', storyId)
            .single();
          return (data?.point_config as { lead_count?: number })?.lead_count;
        },
        { timeout: 10000 },
      )
      .toBe(0);
  });
});
