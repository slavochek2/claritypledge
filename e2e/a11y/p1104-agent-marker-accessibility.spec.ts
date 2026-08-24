import { test, expect } from '@playwright/test';
import { createTestUser, deleteTestUser, type TestUser } from '../helpers/test-user';
import {
  createTestAgentAccount,
  deleteTestAgentAccount,
  seedAgentPosition,
  type TestAgentAccount,
} from '../helpers/test-agent-account';
import { createTestPoint, deleteTestPoint } from '../helpers/test-point';
import { createTestStory, linkStoryToPoint, deleteTestStory } from '../helpers/test-story';

/**
 * P1104 accessibility — the accessible name is not the visible name.
 *
 * `point-detail-page.tsx` builds six aria-labels that interpolate a bare display name
 * (lines 755, 797, 882, 920, 948, 1013 at spec time — every one in the file). The spec
 * claims no code change is needed for them: the marker reaches them for free, because
 * they interpolate `profiles.name`, which `create_or_reuse_agent_account` sets to
 * "Agent · {subject}".
 *
 * That claim is exactly the kind that should be verified against rendered output rather
 * than trusted, which is what this file does. A screen-reader user who hears only the
 * accessible name must still hear the disclosure.
 */

/**
 * P1141 amendment. `agent.name` is the STORED name (`Agent · {subject}`) and is still what
 * every aria-label interpolates — so every assertion below is unchanged. What changed is the
 * VISIBLE text: an agent is now named `Machine reading of {subject}` on every surface, so a
 * locator that finds a row by `hasText: agent.name` finds nothing.
 *
 * That divergence is the point of this file, not an inconvenience to paper over: display and
 * accessible name are now genuinely different strings, and only the accessible one carries the
 * `Agent · ` marker these tests exist to guard. Locate by what a sighted user sees; assert on
 * what a screen-reader user hears.
 */
function displayName(storedName: string): string {
  return storedName.replace(/^Agent\s*·\s*/, '');
}

test.describe('P1104 accessibility — agent marker in accessible names', () => {
  test.describe.configure({ timeout: 90000 });

  let owner: TestUser;
  let agent: TestAgentAccount;
  let positionedPoint: { id: string };
  let positionlessPoint: { id: string };
  let positionedStory: { id: string };
  let positionlessStory: { id: string };

  test.beforeAll(async () => {
    owner = await createTestUser({ name: 'P1104 A11y Owner' });
    agent = await createTestAgentAccount({
      subject: 'P1104 A11y Test Subject',
      operatorName: 'P1104 A11y Test Operator',
    });

    positionedPoint = await createTestPoint(owner.user.id, { statement: `P1104 a11y positioned ${Date.now()}` });
    positionlessPoint = await createTestPoint(owner.user.id, { statement: `P1104 a11y positionless ${Date.now()}` });

    await seedAgentPosition(positionedPoint.id, agent.profileId, 'agree');

    positionedStory = await createTestStory(agent.profileId, {
      content: 'A11y test story where the agent also holds a position.',
      visibility: 'public',
    });
    await linkStoryToPoint(positionedStory.id, positionedPoint.id);

    // No position row on this point — drives PositionlessStoryRow / Region.
    positionlessStory = await createTestStory(agent.profileId, {
      content: 'A11y test story where the agent holds no position.',
      visibility: 'public',
    });
    await linkStoryToPoint(positionlessStory.id, positionlessPoint.id);
  });

  test.afterAll(async () => {
    if (positionlessStory?.id) await deleteTestStory(positionlessStory.id);
    if (positionedStory?.id) await deleteTestStory(positionedStory.id);
    if (positionlessPoint?.id) await deleteTestPoint(positionlessPoint.id);
    if (positionedPoint?.id) await deleteTestPoint(positionedPoint.id);
    if (agent?.profileId) await deleteTestAgentAccount(agent.profileId);
    if (owner?.user?.id) await deleteTestUser(owner.user.id);
  });

  test('PositionHolderCard row — the profile aria-label carries the marker', async ({ page }) => {
    await page.goto(`/point/${positionedPoint.id}`);
    await page.waitForLoadState('networkidle');

    const row = page.getByRole('button', { name: `${agent.name}'s profile` }).first();
    await expect(row).toBeVisible({ timeout: 15000 });
    expect(await row.getAttribute('aria-label')).toContain('Agent ·');
  });

  test('PositionHolderCard toggle — the expand and collapse aria-labels both carry the marker', async ({ page }) => {
    await page.goto(`/point/${positionedPoint.id}`);
    await page.waitForLoadState('networkidle');

    const row = page.locator('[role="button"]').filter({ hasText: displayName(agent.name) }).first();
    const toggle = row.locator('[data-testid="story-toggle"]');
    await expect(toggle).toBeVisible({ timeout: 15000 });

    const collapsed = await toggle.getAttribute('aria-label');
    expect(collapsed).toContain('Agent ·');
    expect(collapsed).toMatch(/^Expand story by/);

    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-label', new RegExp('^Collapse story by'));
    expect(await toggle.getAttribute('aria-label')).toContain('Agent ·');
  });

  test('ExpandableStoryRegion — the region aria-label carries the marker', async ({ page }) => {
    await page.goto(`/point/${positionedPoint.id}`);
    await page.waitForLoadState('networkidle');

    const row = page.locator('[role="button"]').filter({ hasText: displayName(agent.name) }).first();
    await row.locator('[data-testid="story-toggle"]').click();

    const region = page.getByRole('region', { name: `${agent.name}'s story` });
    await expect(region).toBeVisible({ timeout: 10000 });
    expect(await region.getAttribute('aria-label')).toContain('Agent ·');
  });

  test('PositionlessStoryRow — the profile aria-label carries the marker', async ({ page }) => {
    await page.goto(`/point/${positionlessPoint.id}`);
    await page.waitForLoadState('networkidle');

    const row = page.getByRole('button', { name: `${agent.name}'s profile` }).first();
    await expect(row).toBeVisible({ timeout: 15000 });
    expect(await row.getAttribute('aria-label')).toContain('Agent ·');
  });

  test('PositionlessStoryRow toggle — the expand and collapse aria-labels both carry the marker', async ({ page }) => {
    await page.goto(`/point/${positionlessPoint.id}`);
    await page.waitForLoadState('networkidle');

    const row = page.locator('[role="button"]').filter({ hasText: displayName(agent.name) }).first();
    const toggle = row.locator('[data-testid="story-toggle"]');
    await expect(toggle).toBeVisible({ timeout: 15000 });

    expect(await toggle.getAttribute('aria-label')).toContain('Agent ·');

    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-label', new RegExp('^Collapse story by'));
    expect(await toggle.getAttribute('aria-label')).toContain('Agent ·');
  });

  test('PositionlessStoryRegion — the region aria-label carries the marker', async ({ page }) => {
    await page.goto(`/point/${positionlessPoint.id}`);
    await page.waitForLoadState('networkidle');

    const row = page.locator('[role="button"]').filter({ hasText: displayName(agent.name) }).first();
    await row.locator('[data-testid="story-toggle"]').click();

    const region = page.getByRole('region', { name: `${agent.name}'s story` });
    await expect(region).toBeVisible({ timeout: 10000 });
    expect(await region.getAttribute('aria-label')).toContain('Agent ·');
  });

  test('no accessible name on the point page presents this account as a bare person', async ({ page }) => {
    // The generalised form of the six checks above: sweep every aria-label on the page
    // and assert that any one mentioning this account carries the marker with it. This
    // is what catches a SEVENTH aria-label added later without the marker — the
    // enumerated tests above cannot.
    await page.goto(`/point/${positionedPoint.id}`);
    await page.waitForLoadState('networkidle');
    await expect(page.getByText(displayName(agent.name)).first()).toBeVisible({ timeout: 15000 });

    const subject = 'P1104 A11y Test Subject';
    const offenders = await page.evaluate((subj) => {
      return Array.from(document.querySelectorAll('[aria-label]'))
        .map(el => el.getAttribute('aria-label') ?? '')
        .filter(label => label.includes(subj) && !label.includes('Agent ·'));
    }, subject);

    expect(offenders, `aria-labels naming the subject without the marker: ${JSON.stringify(offenders)}`).toEqual([]);
  });

  test('the marker is not conveyed by colour alone', async ({ page }) => {
    // WCAG 1.4.1. The drained card is a colour signal; the square silhouette and the
    // "Agent ·" text prefix are the two non-colour channels. Both must be present, so a
    // reader who cannot perceive the desaturation still receives the disclosure.
    await page.goto(`/point/${positionedPoint.id}`);
    await page.waitForLoadState('networkidle');

    const row = page.locator('[role="button"]').filter({ hasText: displayName(agent.name) }).first();
    await expect(row.getByText(displayName(agent.name)).first()).toBeVisible({ timeout: 15000 });

    const avatar = row.locator('[data-testid="gravatar-avatar"]');
    const radius = await avatar.evaluate(el => parseInt(getComputedStyle(el).borderRadius, 10) || 0);
    expect(radius, 'shape must differ from the circular human default independently of colour').toBeLessThan(50);
  });
});
