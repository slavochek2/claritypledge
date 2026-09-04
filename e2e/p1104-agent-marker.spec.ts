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

/** Display strips the stored `Agent · ` marker; the database and aria-labels keep it. */
function stripAgentPrefixForTest(name: string): string {
  return name.replace(/^Agent\s*·\s*/, '');
}

async function filterOf(locator: Locator): Promise<string> {
  return locator.evaluate(el => getComputedStyle(el).filter);
}

/**
 * Mean saturation of what the element ACTUALLY RENDERS, 0 (grey) to 1 (fully saturated).
 *
 * `getComputedStyle(el).filter` was used here originally and is worthless for this
 * question: it returns the DECLARED value, so an assertion that the avatar reads
 * `grayscale(0)` is true by construction and stays true while an ancestor filter greys
 * every pixel. That is exactly what shipped, and adversarial review caught it with a
 * pixel measurement after the declared-value test passed over it. Screenshot the element
 * and look at the colours.
 */
async function meanSaturation(page: Page, locator: Locator): Promise<number> {
  const png = await locator.screenshot();
  return page.evaluate(async (b64) => {
    const img = new Image();
    img.src = 'data:image/png;base64,' + b64;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = img.width; c.height = img.height;
    const g = c.getContext('2d')!;
    g.drawImage(img, 0, 0);
    const { data } = g.getImageData(0, 0, c.width, c.height);
    let total = 0, n = 0;
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] < 8) continue;              // skip transparent
      const r = data[i], gr = data[i + 1], b = data[i + 2];
      const mx = Math.max(r, gr, b), mn = Math.min(r, gr, b);
      total += mx === 0 ? 0 : (mx - mn) / mx;     // HSV saturation
      n++;
    }
    return n === 0 ? 0 : total / n;
  }, png.toString('base64'));
}

/**
 * The row/card element carrying the drained treatment for a given person.
 *
 * P1141 amendment: takes the STORED name and filters on the DISPLAYED one. An agent is now
 * named `Agent on {subject}` everywhere it appears (P1212 §2; was `Machine reading of`),
 * so filtering on the raw
 * `Agent · {subject}` matches nothing. Callers keep passing `agent.name` — the stored name is
 * still the identity these tests are about, and it is still what every aria-label carries.
 */
function rowFor(page: Page, name: string): Locator {
  return page.locator('[role="button"]').filter({ hasText: stripAgentPrefixForTest(name) }).first();
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

    await expect(page.getByText(stripAgentPrefixForTest(agent.name)).first()).toBeVisible({ timeout: 15000 });
    expect(
      consoleErrors.filter(e => !e.includes('ResizeObserver')),
      `Console errors: ${consoleErrors.join('; ')}`,
    ).toHaveLength(0);
  });

  test.describe('position row (PositionHolderCard)', () => {
    test.beforeEach(async ({ page }) => {
      await page.goto(`/point/${pointA.id}`);
      await page.waitForLoadState('networkidle');
      await expect(page.getByText(stripAgentPrefixForTest(agent.name)).first()).toBeVisible({ timeout: 15000 });
    });

    // P1141 amendment, reworded by P1212 §2: the VISIBLE name is now `Agent on {subject}`; the stored
    // name and every aria-label still carry `Agent · `. Renamed so the title states the
    // contract the body actually checks.
    test('renders the subject name, with the stored `Agent · ` marker stripped', async ({ page }) => {
      await expect(page.getByText(stripAgentPrefixForTest(agent.name)).first()).toBeVisible();
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

    test('row chrome is drained of colour — measured on rendered pixels, not declared CSS', async ({ page }) => {
      const row = rowFor(page, agent.name);
      const chrome = row.locator('.agent-drained-chrome').first();
      await expect(chrome).toBeVisible();

      const sat = await meanSaturation(page, chrome);
      expect(sat, `agent row chrome should render desaturated, measured ${sat}`).toBeLessThan(0.05);
    });

    test('the avatar is NOT drained — the exemption asserted on rendered pixels', async ({ page }) => {
      // The original assertion here read getComputedStyle().filter and was true by
      // construction. This one renders the avatar and looks at its colours, so it fails
      // if the avatar is ever nested inside the filtered subtree again.
      const row = rowFor(page, agent.name);
      const wrapper = row.locator('[data-testid="gravatar-avatar-wrapper"]');

      const sat = await meanSaturation(page, wrapper);
      expect(
        sat,
        `the agent avatar must keep its colour inside a drained card, measured saturation ${sat}`,
      ).toBeGreaterThan(0.15);
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
      // Declared CSS is not enough on its own: a human row nested inside a drained
      // ancestor would render grey while its own filter still read 'none'.
      await expect(row.locator('.agent-drained-chrome')).toHaveCount(0);
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

      await expect(page.getByText(stripAgentPrefixForTest(agent.name)).first()).toBeVisible({ timeout: 15000 });

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

    test('shows the subject name and the operator line', async ({ page }) => {
      await expect(page.getByText(stripAgentPrefixForTest(agent.name)).first()).toBeVisible({ timeout: 15000 });
      // The public-figure policy approval is CONDITIONAL on this line. An avatar shipped
      // without it violates the approval, not merely the plan.
      await expect(page.getByTestId('agent-operator-line')).toHaveText(`Operated by ${agent.operatorName}`);
    });

    test('the profile avatar is square, un-ringed, and exempt from the drain', async ({ page }) => {
      const avatar = page.locator('[data-testid="profile-avatar"] [data-testid="gravatar-avatar"]');
      await expect(avatar).toHaveAttribute('data-agent', 'true');
      await expect(avatar).not.toHaveAttribute('data-pledger', 'true');

      const radius = await borderRadiusPx(avatar);
      expect(radius).toBeLessThan(50);
    });

    test('the profile header shows no ear count', async ({ page }) => {
      await expect(page.getByText(stripAgentPrefixForTest(agent.name)).first()).toBeVisible({ timeout: 15000 });
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

    // The three below are regressions found by eye on the running page, after the suite
    // was already green. Each is a surface the Surfaces list did not name, which is why
    // no test covered it: the marker was applied where the spec pointed and nowhere else.

    test('no Clarity Partners line — a partnership is a relationship, not a property', async ({ page }) => {
      await expect(page.getByText(stripAgentPrefixForTest(agent.name)).first()).toBeVisible({ timeout: 15000 });
      // "0 Clarity Partners" is worse than absent: it implies the count could be non-zero.
      await expect(page.getByText(/Clarity Partner/i)).toHaveCount(0);
    });

    test('no listening calibration — it invites a machine to complete sessions', async ({ page }) => {
      await expect(page.getByText(stripAgentPrefixForTest(agent.name)).first()).toBeVisible({ timeout: 15000 });
      await expect(page.getByText(/Listening calibration/i)).toHaveCount(0);
      await expect(page.getByText(/sessions in a listener role/i)).toHaveCount(0);
    });

    test('a human profile keeps both — the suppression is agent-scoped, not a removal', async ({ page }) => {
      await page.goto(`/p/${human.slug}`);
      await page.waitForLoadState('networkidle');
      await expect(page.getByText(stripAgentPrefixForTest(agent.name)).first()).toHaveCount(0);
      // Guards the shape of the fix: gating on the wrong condition would blank these for
      // everyone, and every agent-side assertion above would still pass.
      await expect(page.getByText(/Clarity Partner/i).first()).toBeVisible({ timeout: 15000 });
      await expect(page.getByText(/Listening calibration/i).first()).toBeVisible();
    });

    test('the point-card avatar uses the account\'s own colour, not the default palette', async ({ page }) => {
      // Deliberately NOT the shared `agent` fixture. That one is created with #0044CC,
      // which is byte-identical to GravatarAvatar's own fallback colour — so the broken
      // and the fixed render produce the same pixel and the assertion can never fail.
      // Measured: with the fix reverted, this account's card read rgb(0,68,204) while its
      // header read rgb(57,66,75). A fixture that cannot emit a distinguishing input
      // makes a green run mean nothing (epistemic.md gate 7b).
      const slateAgent = await createTestAgentAccount({ avatarColor: '#39424B' });
      const slatePoint = await createTestPoint(owner.user.id, {
        statement: `Colour-marker point ${Date.now()}`,
      });
      try {
        await seedAgentPosition(slatePoint.id, slateAgent.profileId, 'agree');
        await page.goto(`/p/${slateAgent.slug}`);
        await page.waitForLoadState('networkidle');

        const headerAvatar = page.locator('[data-testid="profile-avatar"] [data-testid="gravatar-avatar"]');
        const cardAvatar = page.locator('[data-agent-row="true"] [data-testid="gravatar-avatar"]').first();
        await expect(cardAvatar).toBeVisible({ timeout: 15000 });

        const bgOf = (loc: typeof cardAvatar) =>
          loc.evaluate((el) => getComputedStyle(el).backgroundColor);
        const headerBg = await bgOf(headerAvatar);
        const cardBg = await bgOf(cardAvatar);

        expect(headerBg, 'the header must resolve the account colour to compare against')
          .toBe('rgb(57, 66, 75)');
        expect(cardBg, `card avatar ${cardBg} should match the header avatar ${headerBg}`)
          .toBe(headerBg);
      } finally {
        await deleteTestPoint(slatePoint.id);
        await deleteTestAgentAccount(slateAgent.profileId);
      }
    });
  });

  test.describe('the photographic avatar branch', () => {
    // Every other fixture is avatar-less and renders INITIALS, so GravatarAvatar's <img>
    // path — the one a real agent will always take, carrying the robotified portrait —
    // is otherwise never executed by any P1104 test.
    test('an agent with a real image renders it square, un-ringed and un-drained', async ({ page }) => {
      const withPhoto = await createTestAgentAccount({
        subject: 'P1104 Photo Subject',
        avatarUrl: 'https://placehold.co/96x96/FF0000/FFFFFF.png?text=A',
      });
      const pointP = await createTestPoint(owner.user.id, { statement: `P1104 photo point ${Date.now()}` });

      try {
        await seedAgentPosition(pointP.id, withPhoto.profileId, 'agree');
        await page.goto(`/point/${pointP.id}`);
        await page.waitForLoadState('networkidle');

        const row = rowFor(page, withPhoto.name);
        const avatar = row.locator('[data-testid="gravatar-avatar"]');
        await expect(avatar).toHaveAttribute('data-agent', 'true', { timeout: 15000 });
        await expect(avatar).not.toHaveAttribute('data-pledger', 'true');
        expect(await borderRadiusPx(avatar), 'a photographic agent avatar is still square').toBeLessThan(50);

        // The alt text must disclose, since a screen reader gets no shape and no colour.
        const img = avatar.locator('img');
        await expect(img).toHaveAttribute('alt', new RegExp('machine-generated reading'));

        // The image must ACTUALLY have loaded before its colour proves anything.
        // GravatarAvatar's onError silently falls back to initials-on-avatarColor, and that
        // fallback is saturated enough (~0.24 on a slate account colour) to satisfy the
        // assertion below WITHOUT the portrait ever arriving. A network failure reaching
        // the external host would then read as a pass. Found 2026-08-24 by adversarial
        // review of a plan that proposed leaning harder on this branch.
        const loaded = await img.evaluate((el: HTMLImageElement) => el.naturalWidth);
        expect(
          loaded,
          'the portrait never loaded — this assertion cannot speak about a fallback',
        ).toBeGreaterThan(0);

        // And the image itself must not be drained by the card treatment.
        const sat = await meanSaturation(page, row.locator('[data-testid="gravatar-avatar-wrapper"]'));
        expect(sat, `the portrait must keep its colour, measured ${sat}`).toBeGreaterThan(0.15);
      } finally {
        await deleteTestPoint(pointP.id);
        await deleteTestAgentAccount(withPhoto.profileId);
      }
    });
  });

  test.describe('the registry row is what drives the marker', () => {
    test('a profile carrying the "Agent · " NAME but no registry row renders as a person', async ({ page }) => {
      // Gate 7, restated. The original version of this test deleted the registry row from
      // under a live agent; that is now impossible by construction (service_role lost
      // DELETE, and a trigger refuses removal while the profile exists), so the test had
      // to prove the same property another way.
      //
      // This is the stronger form anyway: it holds the NAME fixed at the exact reserved
      // marker and varies only registry membership. If anything in the render path ever
      // keys off the "Agent · " string instead of the registry, this fails — and nothing
      // else in the suite would.
      const email = `e2e-unregistered-${Date.now()}@claritypledge-test.com`;
      const { data: minted, error: authErr } = await supabaseAdmin.auth.admin.createUser({
        email, email_confirm: false,
      });
      expect(authErr).toBeNull();
      const impostorId = minted!.user.id;
      const impostorName = `Agent · Unregistered Subject ${Date.now()}`;

      // service_role writes profiles directly — the guard trigger constrains only
      // anon/authenticated, so this is the one role that can produce this state at all.
      const { error: insErr } = await supabaseAdmin.from('profiles').insert({
        id: impostorId, email, name: impostorName,
        slug: `agent-unregistered-${Date.now()}`,
        is_verified: true, has_pledged: true,
      });
      expect(insErr).toBeNull();

      const pointC = await createTestPoint(owner.user.id, { statement: `P1104 unregistered ${Date.now()}` });
      try {
        await seedAgentPosition(pointC.id, impostorId, 'agree');
        await page.goto(`/point/${pointC.id}`);
        await page.waitForLoadState('networkidle');

        const row = rowFor(page, impostorName);
        const avatar = row.locator('[data-testid="gravatar-avatar"]');
        await expect(avatar).toBeVisible({ timeout: 15000 });

        await expect(
          avatar,
          'the marker must follow the registry row, never the display name',
        ).not.toHaveAttribute('data-agent', 'true');
        expect(await borderRadiusPx(avatar)).toBeGreaterThanOrEqual(50);
        await expect(row.locator('.agent-drained-chrome')).toHaveCount(0);
      } finally {
        await deleteTestPoint(pointC.id);
        await supabaseAdmin.auth.admin.deleteUser(impostorId);
      }
    });

    test('the registry row cannot be orphaned — deleting it while the profile lives is refused', async ({ page: _page }) => {
      // The other half of the same guarantee, and the reason the test above had to change:
      // an agent-shaped profile with no registry row must not be REACHABLE, not merely
      // undesirable. Adversarial review demonstrated service_role deleting the row and
      // leaving the profile rendering as an ordinary person.
      const throwaway = await createTestAgentAccount({ subject: 'P1104 Orphan Guard Subject' });
      try {
        const { error } = await supabaseAdmin
          .from('agent_accounts').delete().eq('profile_id', throwaway.profileId);
        expect(error, 'a bare registry delete must be refused while the profile exists').not.toBeNull();

        const { data: still } = await supabaseAdmin
          .from('agent_accounts').select('profile_id').eq('profile_id', throwaway.profileId).maybeSingle();
        expect(still?.profile_id).toBe(throwaway.profileId);
      } finally {
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

      // AMENDED 2026-08-24. This test asserted the literal `Agent · {name}` in feed output
      // and the presence of `.agent-drained-chrome`; both changed and BOTH assertions had
      // been failing on the P1141 branch before this amendment — the feed byline became a
      // component while the colour drain was removed from story surfaces entirely.
      //
      // What the feed marker IS now, and why the drain is not part of it: the filter used
      // to wrap the whole content column, so it greyed the video, the quote pills and the
      // viewer's own controls. Its only legitimate target is the identity/stance cluster,
      // and on a story card that cluster is already monochrome — so on story surfaces the
      // colour channel is deliberately absent. See src/index.css.
      const card = page.locator('[data-agent-row="true"]').first();
      await expect(card).toBeVisible({ timeout: 20000 });

      // Channel 1: the machine chip, which is NOT a link — a status marker must not navigate.
      const chip = card.locator('[data-testid="machine-chip"]').first();
      await expect(chip).toBeVisible();
      expect(
        await chip.evaluate((el) => el.closest('button') !== null),
        'the machine chip must not sit inside an interactive element',
      ).toBe(false);

      // Channel 2: the byline names the subject, with the stored `Agent · ` marker stripped
      // for display only. The DATABASE still forces the prefix, and aria-labels still carry
      // it — that is what the a11y spec asserts.
      const subject = stripAgentPrefixForTest(agent.name);
      await expect(card.getByText(subject, { exact: false }).first()).toBeVisible();

      // Channel 3: the square silhouette, and no reputation.
      const avatar = card.locator('[data-testid="gravatar-avatar"]').first();
      await expect(avatar).toHaveAttribute('data-agent', 'true');
      await expect(card.locator('[data-testid="ear-badge"]')).toHaveCount(0);

      // The colour channel is gone on this surface, deliberately. Asserted as ABSENT so it
      // cannot creep back without a failing test.
      await expect(card.locator('.agent-drained-chrome')).toHaveCount(0);
    });
  });
});
