import { test, expect, type Locator, type Page } from '@playwright/test';
import { createTestUser, deleteTestUser, type TestUser } from './helpers/test-user';
import { createTestAgentAccount, deleteTestAgentAccount, seedAgentPosition, type TestAgentAccount } from './helpers/test-agent-account';
import { createTestPoint, createTestPosition, deleteTestPoint } from './helpers/test-point';
import { createTestStory, linkStoryToPoint, deleteTestStory } from './helpers/test-story';
import { supabaseAdmin } from './helpers/supabase-admin';

/**
 * P1104 — an account that is a machine's reading of a person must never render as that
 * person, on any surface it can reach.
 *
 * Every fixture here is a SEEDED agent account created through
 * `create_or_reuse_agent_account`. P1096's pipeline is unbuilt, so no real subject and
 * no generated avatar exist; the fixtures carry no `avatar_url` and render initials.
 * That is deliberate — it means these tests prove the SHAPE and CHROME channels, which
 * are the two that survive 20px, without depending on an image that does not exist yet.
 */

/** Computed border-radius in px. A circle at these sizes reads as >= 50px (9999px). */
async function borderRadiusPx(locator: Locator): Promise<number> {
  const value = await locator.evaluate(el => getComputedStyle(el).borderRadius);
  return parseInt(value, 10) || 0;
}

async function filterOf(locator: Locator): Promise<string> {
  return locator.evaluate(el => getComputedStyle(el).filter);
}

/** The row/card element carrying the drained treatment for a given person. */
function rowFor(page: Page, name: string): Locator {
  return page.locator('[role="button"]').filter({ hasText: name }).first();
}

test.describe('P1104 — agent accounts must never render as a person', () => {
  test.describe.configure({ timeout: 90000 });

  let owner: TestUser;
  let human: TestUser;
  let agent: TestAgentAccount;
  let pointA: { id: string };
  let pointB: { id: string };
  let agentStoryOnA: { id: string };
  let agentStoryOnB: { id: string };
  let feedTag: string;

  test.beforeAll(async () => {
    owner = await createTestUser({ name: 'P1104 Marker Test Owner' });
    human = await createTestUser({ name: 'P1104 Marker Test Human' });

    // A human whose profile photo is BLACK AND WHITE — the case that killed the
    // avatar-only greyscale rule. Measured mean saturation on a real product photo:
    // 0.00, greyer than the robotified portrait's 0.17. Any rule keyed to avatar
    // saturation marks this person as a machine.
    await supabaseAdmin
      .from('profiles')
      .update({ avatar_url: 'https://placehold.co/96x96/000000/FFFFFF.png?text=BW' })
      .eq('id', human.user.id);

    agent = await createTestAgentAccount({
      subject: 'P1104 Marker Test Subject',
      operatorName: 'P1104 Marker Test Operator',
    });

    // Defensive-suppression check: force has_pledged TRUE on the agent row AFTER
    // creation. The RPC sets it false, so this simulates a future writer getting it
    // wrong — the render layer must still refuse the ring. Belt and braces, and this
    // test is what proves the second layer is real rather than decorative.
    await supabaseAdmin.from('profiles').update({ has_pledged: true }).eq('id', agent.profileId);

    feedTag = `p1104feed${Date.now()}`;

    pointA = await createTestPoint(owner.user.id, { statement: `P1104 marker test point A ${Date.now()}` });
    pointB = await createTestPoint(owner.user.id, { statement: `P1104 marker test point B ${Date.now()}` });

    await seedAgentPosition(pointA.id, agent.profileId, 'agree');
    await createTestPosition(pointA.id, human.user.id, 'agree');

    // The hashtag goes in the CONTENT, not the tags array: a BEFORE INSERT trigger
    // (trg_stories_extract_hashtags) derives stories.tags from the content and
    // overwrites anything passed in, so a tags option alone is silently discarded.
    agentStoryOnA = await createTestStory(agent.profileId, {
      content: `According to this source, the argument holds because feedback loops compound. #${feedTag}`,
      visibility: 'public',
    });
    await linkStoryToPoint(agentStoryOnA.id, pointA.id);

    // A story on pointB with NO position row for the agent — exercises
    // PositionlessStoryRow / PositionlessStoryRegion and their aria-labels.
    agentStoryOnB = await createTestStory(agent.profileId, {
      content: 'A second reading, from a different source, on an unrelated point.',
      visibility: 'public',
    });
    await linkStoryToPoint(agentStoryOnB.id, pointB.id);
  });

  test.afterAll(async () => {
    if (agentStoryOnB?.id) await deleteTestStory(agentStoryOnB.id);
    if (agentStoryOnA?.id) await deleteTestStory(agentStoryOnA.id);
    if (pointB?.id) await deleteTestPoint(pointB.id);
    if (pointA?.id) await deleteTestPoint(pointA.id);
    if (agent?.profileId) await deleteTestAgentAccount(agent.profileId);
    if (human?.user?.id) await deleteTestUser(human.user.id);
    if (owner?.user?.id) await deleteTestUser(owner.user.id);
  });

  test('smoke: point page loads and has no console errors', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', msg => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });

    await page.goto(`/point/${pointA.id}`);
    await page.waitForLoadState('networkidle');

    await expect(page.getByText(agent.name).first()).toBeVisible({ timeout: 15000 });
    expect(
      consoleErrors.filter(e => !e.includes('ResizeObserver')),
      `Console errors: ${consoleErrors.join('; ')}`,
    ).toHaveLength(0);
  });

  test.describe('position row (PositionHolderCard)', () => {
    test.beforeEach(async ({ page }) => {
      await page.goto(`/point/${pointA.id}`);
      await page.waitForLoadState('networkidle');
      await expect(page.getByText(agent.name).first()).toBeVisible({ timeout: 15000 });
    });

    test('renders the "Agent · {subject}" name', async ({ page }) => {
      await expect(page.getByText(agent.name).first()).toBeVisible();
    });

    test('avatar is marked as an agent and is not circular', async ({ page }) => {
      const avatar = rowFor(page, agent.name).locator('[data-testid="gravatar-avatar"]');
      await expect(avatar).toHaveAttribute('data-agent', 'true');

      const radius = await borderRadiusPx(avatar);
      expect(radius, 'agent avatar must not use the circular rounded-full shape').toBeLessThan(50);
    });

    test('has NO pledger ring, even though has_pledged is true on the underlying row', async ({ page }) => {
      const avatar = rowFor(page, agent.name).locator('[data-testid="gravatar-avatar"]');
      await expect(avatar).not.toHaveAttribute('data-pledger', 'true');
    });

    test('has NO ear count badge', async ({ page }) => {
      // EarBadge's markup (ear-badge.tsx): a span carrying bg-blue-50 AND border-blue-200.
      // The component is documented "never conditionally hide — 0 is meaningful", so the
      // suppression must happen at the call site, which is what this asserts.
      await expect(rowFor(page, agent.name).locator('[data-testid="ear-badge"]')).toHaveCount(0);
    });

    test('row chrome is drained of colour, and the avatar is exempt from that filter', async ({ page }) => {
      const row = rowFor(page, agent.name);
      expect(await filterOf(row), 'agent row chrome must carry a grayscale filter').toContain('grayscale');

      // The exemption is the decision, not a detail: a blanket filter over the card kills
      // the portrait's sensor accent and the result reads as a DISABLED CONTROL.
      const wrapper = row.locator('[data-testid="gravatar-avatar-wrapper"]');
      expect(await filterOf(wrapper), 'the avatar must be un-filtered inside a drained card').toBe('grayscale(0)');
    });

    test('row aria-label carries the marker', async ({ page }) => {
      await expect(page.getByRole('button', { name: `${agent.name}'s profile` }).first()).toBeVisible();
    });
  });

  test.describe('negative control — a human must still render as a person', () => {
    test.beforeEach(async ({ page }) => {
      await page.goto(`/point/${pointA.id}`);
      await page.waitForLoadState('networkidle');
      await expect(page.getByText(human.name).first()).toBeVisible({ timeout: 15000 });
    });

    test('a profile that exists but is NOT in agent_accounts renders circular, ringed and with an ear count', async ({ page }) => {
      const row = rowFor(page, human.name);
      const avatar = row.locator('[data-testid="gravatar-avatar"]');

      await expect(avatar).not.toHaveAttribute('data-agent', 'true');
      await expect(avatar).toHaveAttribute('data-pledger', 'true');
      await expect(row.locator('[data-testid="ear-badge"]')).toHaveCount(1);

      const radius = await borderRadiusPx(avatar);
      expect(radius, 'registry absence must mean "person", not "agent"').toBeGreaterThanOrEqual(50);
    });

    test('a human with a BLACK AND WHITE profile photo is not drained', async ({ page }) => {
      const row = rowFor(page, human.name);
      expect(
        await filterOf(row),
        'the card-level treatment must never collide with a monochrome human photo',
      ).not.toContain('grayscale');
    });
  });

  test.describe('expanded story (ExpandableStoryRegion)', () => {
    test('the expanded story carries the same treatment', async ({ page }) => {
      await page.goto(`/point/${pointA.id}`);
      await page.waitForLoadState('networkidle');

      const row = rowFor(page, agent.name);
      await row.locator('[data-testid="story-toggle"]').click();

      const region = page.getByRole('region', { name: `${agent.name}'s story` });
      await expect(region).toBeVisible({ timeout: 10000 });

      const avatar = region.locator('[data-testid="gravatar-avatar"]').first();
      await expect(avatar).toHaveAttribute('data-agent', 'true');
      await expect(avatar).not.toHaveAttribute('data-pledger', 'true');
      await expect(region.locator('[data-testid="ear-badge"]')).toHaveCount(0);
    });
  });

  test.describe('positionless story (PositionlessStoryRow / Region) — pointB', () => {
    test('the positionless row and region both carry the marker', async ({ page }) => {
      await page.goto(`/point/${pointB.id}`);
      await page.waitForLoadState('networkidle');

      const row = page.getByRole('button', { name: `${agent.name}'s profile` }).first();
      await expect(row).toBeVisible({ timeout: 15000 });

      const avatar = row.locator('[data-testid="gravatar-avatar"]');
      await expect(avatar).toHaveAttribute('data-agent', 'true');
      await expect(row.locator('[data-testid="ear-badge"]')).toHaveCount(0);

      await row.locator('[data-testid="story-toggle"]').click();
      const region = page.getByRole('region', { name: `${agent.name}'s story` });
      await expect(region).toBeVisible({ timeout: 10000 });
    });
  });

  test.describe('?embed=true route — builds its own author objects', () => {
    test('the embed route shows the marker for the agent as profileOwner', async ({ page }) => {
      await page.goto(`/point/${pointA.id}?embed=true&from=${agent.profileId}`);
      await page.waitForLoadState('networkidle');

      await expect(page.getByText(agent.name).first()).toBeVisible({ timeout: 15000 });

      const avatar = page.locator('[data-testid="gravatar-avatar"]').first();
      await expect(avatar).toHaveAttribute('data-agent', 'true');
      await expect(avatar).not.toHaveAttribute('data-pledger', 'true');

      const radius = await borderRadiusPx(avatar);
      expect(radius).toBeLessThan(50);
    });
  });

  test.describe('profile page', () => {
    test.beforeEach(async ({ page }) => {
      await page.goto(`/p/${agent.slug}`);
      await page.waitForLoadState('networkidle');
    });

    test('shows the "Agent · {subject}" name and the operator line', async ({ page }) => {
      await expect(page.getByText(agent.name).first()).toBeVisible({ timeout: 15000 });
      // The public-figure policy approval is CONDITIONAL on this line. An avatar shipped
      // without it violates the approval, not merely the plan.
      await expect(page.getByTestId('agent-operator-line')).toHaveText(`Published by ${agent.operatorName}`);
    });

    test('the profile avatar is square, un-ringed, and exempt from the drain', async ({ page }) => {
      const avatar = page.locator('[data-testid="profile-avatar"] [data-testid="gravatar-avatar"]');
      await expect(avatar).toHaveAttribute('data-agent', 'true');
      await expect(avatar).not.toHaveAttribute('data-pledger', 'true');

      const radius = await borderRadiusPx(avatar);
      expect(radius).toBeLessThan(50);
    });

    test('the profile header shows no ear count', async ({ page }) => {
      await expect(page.getByText(agent.name).first()).toBeVisible({ timeout: 15000 });
      // The profile header renders its own inline ear pill (not the EarBadge component),
      // with the same bg-blue-50 + border-blue-200 pair.
      await expect(page.locator('[data-testid="ear-badge"]')).toHaveCount(0);
    });

    test('a human profile still shows its ear count — the suppression is agent-scoped', async ({ page }) => {
      await page.goto(`/p/${human.slug}`);
      await page.waitForLoadState('networkidle');
      await expect(page.getByTestId('agent-operator-line')).toHaveCount(0);
      await expect(page.locator('[data-testid="ear-badge"]').first()).toBeVisible({ timeout: 15000 });
    });
  });

  test.describe('the registry row is what drives the marker', () => {
    test('an agent-shaped profile whose agent_accounts row is removed renders as a person again', async ({ page }) => {
      // Gate 7 — exercise the failure path rather than trusting the happy one. This is
      // the only test that proves the marker is driven by ROW EXISTENCE in the registry
      // and not by something incidental that correlates with it on the other fixtures —
      // the "Agent · " name string, has_pledged, or is_verified, all of which stay
      // exactly as they are across the two halves of this test.
      const throwaway = await createTestAgentAccount({ subject: 'P1104 Registry Dependence Subject' });
      const pointC = await createTestPoint(owner.user.id, { statement: `P1104 registry dependence ${Date.now()}` });

      try {
        await seedAgentPosition(pointC.id, throwaway.profileId, 'agree');

        await page.goto(`/point/${pointC.id}`);
        await page.waitForLoadState('networkidle');
        const before = rowFor(page, throwaway.name).locator('[data-testid="gravatar-avatar"]');
        await expect(before).toHaveAttribute('data-agent', 'true', { timeout: 15000 });
        expect(await borderRadiusPx(before)).toBeLessThan(50);

        // Remove ONLY the registry row. The profile, its name, its flags all survive.
        const { error } = await supabaseAdmin
          .from('agent_accounts').delete().eq('profile_id', throwaway.profileId);
        expect(error).toBeNull();

        await page.goto(`/point/${pointC.id}`);
        await page.waitForLoadState('networkidle');
        const after = rowFor(page, throwaway.name).locator('[data-testid="gravatar-avatar"]');
        await expect(after).toBeVisible({ timeout: 15000 });
        await expect(
          after,
          'with no registry row the marker must disappear — proving the registry, not the name, is the source of truth',
        ).not.toHaveAttribute('data-agent', 'true');
        expect(await borderRadiusPx(after)).toBeGreaterThanOrEqual(50);
      } finally {
        await deleteTestPoint(pointC.id);
        await deleteTestAgentAccount(throwaway.profileId);
      }
    });
  });

  test.describe('public feed (feed-story-card)', () => {
    test('a story authored by an agent shows the marker on the feed', async ({ page }) => {
      // Scoped by a unique fixture tag so this does not depend on where the story lands
      // in a shared, paginated feed.
      await page.goto(`/feed?tab=stories&tag=${feedTag}`);
      await page.waitForLoadState('networkidle');

      await expect(page.getByText(agent.name).first()).toBeVisible({ timeout: 20000 });

      const card = page.locator('[data-agent-row="true"]').first();
      await expect(card).toBeVisible();
      expect(await filterOf(card)).toContain('grayscale');

      const avatar = card.locator('[data-testid="gravatar-avatar"]').first();
      await expect(avatar).toHaveAttribute('data-agent', 'true');
      await expect(card.locator('[data-testid="ear-badge"]')).toHaveCount(0);
    });
  });
});
