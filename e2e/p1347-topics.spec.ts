/**
 * P1347: /topics in a real browser.
 *   - smoke: loads, no console errors, signed out sees one sign-in prompt and no stars;
 *   - signed in: a star tap saves (survives a reload), and the result shows on that topic only.
 */
import { test, expect } from '@playwright/test';
import { createTestUser, deleteTestUser, setTestSession, type TestUser } from './helpers/test-user';

test.describe('P1347 /topics', () => {
  let voter: TestUser;

  test.beforeAll(async () => {
    voter = await createTestUser({ name: 'P1347 E2E Voter' });
    // Pledger, so the ring is checkable.
    const { supabaseAdmin } = await import('./helpers/supabase-admin');
    await supabaseAdmin.from('profiles').update({ has_pledged: true, is_verified: true }).eq('id', voter.user.id);
  });
  test.afterAll(async () => {
    await deleteTestUser(voter.user.id);
  });

  test('smoke: page loads and has no console errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
    await page.goto('/topics');
    await expect(page.getByRole('heading', { name: 'Vote for the next Clarity Night topic' })).toBeVisible();
    await expect(page.getByTestId('topic-row').first()).toBeVisible();
    await expect(page.getByTestId('sign-in-to-vote')).toBeVisible();
    await expect(page.getByRole('radio')).toHaveCount(0);
    expect(errors.filter((e) => !/404|favicon/i.test(e))).toEqual([]);
  });

  test('a signed-in vote saves and shows the result on that topic only', async ({ page }) => {
    await setTestSession(page, voter.email);
    await page.goto('/topics');
    const rows = page.getByTestId('topic-row');
    await expect(rows.first().getByRole('radio', { name: '4 stars' })).toBeVisible();
    const target = rows.nth(1);
    const title = await target.locator('p').first().innerText();

    await target.getByRole('radio', { name: '4 stars' }).click();
    await expect(target.getByTestId('topic-average')).toBeVisible();
    await expect(page.getByTestId('topic-average')).toHaveCount(1);

    await page.reload();
    const again = page.getByTestId('topic-row').filter({ hasText: title });
    await expect(again.getByRole('radio', { name: '4 stars' })).toHaveAttribute('aria-checked', 'true');
    await expect(again.getByTestId('topic-voters')).toBeVisible();

    // Faces: round with the pledger ring for a pledger, and the name on hover.
    const face = again.getByTestId('topic-voters').getByTestId('gravatar-avatar').first();
    await expect(face).toHaveAttribute('data-pledger', 'true');
    await face.hover();
    await expect(page.getByRole('tooltip').filter({ hasText: 'P1347 E2E Voter' }).first()).toBeVisible();
    await again.screenshot({ path: 'test-results/p1347-voter-face.png' });
  });
});
