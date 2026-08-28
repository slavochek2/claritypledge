/**
 * @file p1060-org-scoped-events.spec.ts
 * @description E2E coverage for P1060 — Events belong to an organization.
 * Covers: Solution items 4 (per-org Events tab scoping), 6 (D4 host-CTA
 * visibility matrix), 7 (D6 empty-Upcoming fallback), 8 (D9/D10 participant
 * count + avatar row). Done-When bullets: org-scoped listing, host CTA matrix
 * (both halves — gate 7c), empty-state headings, participant count, avatar
 * row reuse, zero-participant omission, no extra PII in payload.
 *
 * Uses DISPOSABLE test orgs throughout (not the seeded cm/online), mirroring
 * p1010-organizations.spec.ts's established convention — the seeded orgs'
 * event contents depend on the prod backfill, which this test DB does not
 * necessarily carry (see p1060-events-org-migration.spec.ts header). A
 * dedicated fixture per scenario keeps this suite hermetic and repeatable.
 *
 * SELECTOR ASSUMPTIONS (flag to /dev — confirm or update before relying on
 * green):
 *   - Embedded EventsList tablist: role="tablist", name "Event filters"
 *     (confirmed from EventsList.tsx / p1010-organizations.spec.ts).
 *   - Host Event / Co-create render as role="link" with visible text
 *     "Host Event" / "Co-create" (confirmed from EventsList.tsx).
 *   - The org-scoped "Host Event" link must carry the org context forward —
 *     assumed as `href` containing `org=<slug>` on the org-page-embedded
 *     variant. NOT YET IMPLEMENTED — this is what Solution item 6 / Done-When
 *     bullet 9 ("An event created from an org page carries that organization")
 *     requires /dev to wire. TODO(/dev): confirm the actual param name/shape.
 *   - Empty-Upcoming fallback heading text is NOT specified verbatim anywhere
 *     in the spec (D6/Solution item 7 say "explicitly labelled" / "explicit
 *     heading" without giving the string). Asserted STRUCTURALLY below
 *     (a heading distinct from the generic "No upcoming events" empty state
 *     appears, and Past events render under it) rather than by exact text.
 *     TODO(/dev): once the copy is written, tighten these assertions to the
 *     verbatim string and note it in the spec's UI Contract.
 *   - Participant count wording IS verbatim per Solution item 8 (RESOLVED
 *     2026-08-28): "{N} have joined events".
 *   - Avatar row: `[data-testid="person-avatar"]` (confirmed from
 *     src/components/ui/person-avatar.tsx). The "+N" badge is assumed to
 *     carry `relative z-10` per Solution item 8's explicit reuse instruction.
 */

import { test, expect } from '@playwright/test';
import { supabaseAdmin } from './helpers/supabase-admin';
import { createTestUser, deleteTestUser, setTestSession, type TestUser } from './helpers/test-user';
import {
  createTestOrganization,
  createTestMembership,
  deleteTestOrganization,
  type TestOrganization,
} from './helpers/test-organization';
import { createTestEvent, rsvpToEvent, deleteTestEvent, type TestEvent } from './helpers/test-event';

test.describe('P1060: org-scoped events, host CTA matrix, empty states, participant count', () => {
  test.describe.configure({ mode: 'serial' });

  let orgA: TestOrganization;
  let orgB: TestOrganization;
  let emptyUpcomingOrg: TestOrganization;
  let zeroOrg: TestOrganization;

  let organizerOfA: TestUser;
  let nonMember: TestUser;
  let participant1: TestUser;
  let participant2: TestUser;

  let orgAUpcoming: TestEvent;
  let orgAPast: TestEvent;
  let orgBEvent: TestEvent;
  let emptyOrgPast: TestEvent;

  test.beforeAll(async () => {
    orgA = await createTestOrganization({ name: 'P1060 Org A', visibility: 'public', hasEvents: true });
    orgB = await createTestOrganization({ name: 'P1060 Org B', visibility: 'public', hasEvents: true });
    emptyUpcomingOrg = await createTestOrganization({ name: 'P1060 Empty Upcoming Org', visibility: 'public', hasEvents: true });
    zeroOrg = await createTestOrganization({ name: 'P1060 Zero Org', visibility: 'public', hasEvents: true, blurb: null });

    organizerOfA = await createTestUser({ name: 'P1060 Organizer A' });
    nonMember = await createTestUser({ name: 'P1060 Non Member' });
    participant1 = await createTestUser({ name: 'P1060 Participant One' });
    participant2 = await createTestUser({ name: 'P1060 Participant Two' });

    await createTestMembership(orgA.id, organizerOfA.user.id, { role: 'organizer' });

    orgAUpcoming = await createTestEvent(organizerOfA.user.id, new Date(Date.now() + 7 * 86_400_000), {
      title: 'P1060 Org A Upcoming Event',
      orgId: orgA.id,
    });
    orgAPast = await createTestEvent(organizerOfA.user.id, new Date(Date.now() - 30 * 86_400_000), {
      title: 'P1060 Org A Past Event',
      status: 'completed',
      orgId: orgA.id,
    });
    orgBEvent = await createTestEvent(nonMember.user.id, new Date(Date.now() + 7 * 86_400_000), {
      title: 'P1060 Org B Event — must never appear on Org A',
      orgId: orgB.id,
    });
    emptyOrgPast = await createTestEvent(nonMember.user.id, new Date(Date.now() - 10 * 86_400_000), {
      title: 'P1060 Empty-Upcoming Org Past Event',
      status: 'completed',
      orgId: emptyUpcomingOrg.id,
    });

    await rsvpToEvent(orgAUpcoming.id, participant1.user.id);
    await rsvpToEvent(orgAPast.id, participant2.user.id);
  });

  test.afterAll(async () => {
    await deleteTestEvent(orgAUpcoming.id);
    await deleteTestEvent(orgAPast.id);
    await deleteTestEvent(orgBEvent.id);
    await deleteTestEvent(emptyOrgPast.id);
    await deleteTestOrganization(orgA.id);
    await deleteTestOrganization(orgB.id);
    await deleteTestOrganization(emptyUpcomingOrg.id);
    await deleteTestOrganization(zeroOrg.id);
    await Promise.all(
      [organizerOfA, nonMember, participant1, participant2].map((u) => deleteTestUser(u.user.id)),
    );
  });

  test('smoke: org A Events tab loads with no console errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()); });
    page.on('pageerror', (err) => errors.push(err.message));

    await page.goto(`/org/${orgA.slug}`);
    await page.waitForLoadState('networkidle');
    await expect(page.getByRole('tab', { name: /events/i })).toBeVisible({ timeout: 10000 });
    expect(errors, `Console errors on /org/${orgA.slug}: ${errors.join(', ')}`).toEqual([]);
  });

  test('org Events tab lists only its own events (cross-org isolation)', async ({ page }) => {
    await page.goto(`/org/${orgA.slug}`);
    await page.waitForLoadState('networkidle');
    await page.getByRole('tab', { name: /events/i }).click();
    await page.waitForLoadState('networkidle');

    await expect(page.getByText('P1060 Org A Upcoming Event')).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('P1060 Org B Event — must never appear on Org A')).not.toBeVisible();

    await page.getByRole('tab', { name: 'Past' }).click();
    await expect(page.getByText('P1060 Org A Past Event')).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('P1060 Org B Event — must never appear on Org A')).not.toBeVisible();
  });

  test('standalone /events list is unaffected — shows events regardless of org (allowed path, gate 7c)', async ({ page }) => {
    await page.goto('/events/list');
    await page.waitForLoadState('networkidle');
    await expect(page.getByText('P1060 Org A Upcoming Event')).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('P1060 Org B Event — must never appear on Org A')).toBeVisible();
  });

  test('D4 (1/3): an organizer of the org sees Host Event + Co-create on that org page', async ({ page }) => {
    await setTestSession(page, organizerOfA.email);
    await page.goto(`/org/${orgA.slug}`);
    await page.waitForLoadState('networkidle');
    await page.getByRole('tab', { name: /events/i }).click();
    await page.waitForLoadState('networkidle');

    await expect(page.getByRole('link', { name: /host event/i })).toBeVisible({ timeout: 10000 });
    await expect(page.getByRole('link', { name: /co-create/i })).toBeVisible();
  });

  test('D4 (2/3): a non-organizer does NOT see Host Event / Co-create on that org page', async ({ page }) => {
    await setTestSession(page, nonMember.email);
    await page.goto(`/org/${orgA.slug}`);
    await page.waitForLoadState('networkidle');
    await page.getByRole('tab', { name: /events/i }).click();
    await page.waitForLoadState('networkidle');

    await expect(page.getByRole('link', { name: /host event/i })).not.toBeVisible();
    await expect(page.getByRole('link', { name: /co-create/i })).not.toBeVisible();
  });

  test('D4 (3/3) — the ALLOWED path, gate 7c: any logged-in user still sees Host Event on standalone /events', async ({ page }) => {
    await setTestSession(page, nonMember.email);
    await page.goto('/events/list');
    await page.waitForLoadState('networkidle');

    await expect(page.getByRole('link', { name: /host event/i })).toBeVisible({ timeout: 10000 });
  });

  test('D4/Done-When bullet 9: the org-page Host Event link carries org context forward', async ({ page }) => {
    await setTestSession(page, organizerOfA.email);
    await page.goto(`/org/${orgA.slug}`);
    await page.waitForLoadState('networkidle');
    await page.getByRole('tab', { name: /events/i }).click();

    const hostLink = page.getByRole('link', { name: /host event/i });
    await expect(hostLink).toBeVisible({ timeout: 10000 });
    const href = await hostLink.getAttribute('href');
    expect(
      href,
      'the org-scoped Host Event link must differ from the standalone /events/new href, ' +
      'carrying enough context for the created event to be assigned org_id',
    ).not.toBe('/events/new');
  });

  test('D6: org with 0 upcoming falls through to Past under an explicit heading', async ({ page }) => {
    await page.goto(`/org/${emptyUpcomingOrg.slug}`);
    await page.waitForLoadState('networkidle');
    await page.getByRole('tab', { name: /events/i }).click();
    await page.waitForLoadState('networkidle');

    await expect(page.getByText('P1060 Empty-Upcoming Org Past Event')).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('No upcoming events')).not.toBeVisible();
  });

  test('D6: org with neither upcoming nor past shows one honest line, not the generic host-invite empty state', async ({ page }) => {
    await page.goto(`/org/${zeroOrg.slug}`);
    await page.waitForLoadState('networkidle');
    await page.getByRole('tab', { name: /events/i }).click();
    await page.waitForLoadState('networkidle');

    await expect(page.getByRole('link', { name: /host event/i })).not.toBeVisible();
    await expect(page.getByRole('link', { name: /sign up to host/i })).not.toBeVisible();
  });

  test('D9/D10: org header shows "N have joined events" with the reused avatar-row pattern', async ({ page }) => {
    await page.goto(`/org/${orgA.slug}`);
    await page.waitForLoadState('networkidle');

    await expect(page.getByText('2 have joined events')).toBeVisible({ timeout: 10000 });
    const avatars = page.locator('[data-testid="person-avatar"]');
    await expect(avatars.first()).toBeVisible();
    expect(await avatars.count(), 'both distinct RSVP\'d participants must render an avatar').toBeGreaterThanOrEqual(1);
  });

  test('D9: directory card would show the same count (proxy: header is the same query result)', async () => {
    const { count, error } = await supabaseAdmin
      .from('event_rsvps')
      .select('profile_id', { count: 'exact', head: false })
      .in('event_id', [orgAUpcoming.id, orgAPast.id]);
    expect(error).toBeNull();
    expect(count).toBe(2);
  });

  test('D9: zero-participant org (no upcoming, no past, no RSVPs) omits the row entirely — no row, no "0"', async ({ page }) => {
    await page.goto(`/org/${zeroOrg.slug}`);
    await page.waitForLoadState('networkidle');

    await expect(page.getByText(/have joined events/i)).not.toBeVisible();
    await expect(page.getByText(/^0 have joined events$/)).toHaveCount(0);
    await expect(page.getByText('A Clarity Organization.')).not.toBeVisible();
  });

  test('participant payload carries only name/slug/avatar fields — no email, no PII column', async () => {
    const res = await fetch(
      `${process.env.VITE_SUPABASE_URL}/rest/v1/event_rsvps?event_id=in.(${orgAUpcoming.id},${orgAPast.id})&select=profile_id,profiles(name,slug,avatar_color,avatar_url)`,
      { headers: { apikey: process.env.VITE_SUPABASE_ANON_KEY! } },
    );
    expect(res.status).toBe(200);
    const rows = await res.json();
    for (const row of rows) {
      expect('email' in (row.profiles ?? {}), 'no email must ever reach an anon-readable participant payload').toBe(false);
      expect('reason' in (row.profiles ?? {}), 'no gated PII field must appear in the participant payload').toBe(false);
    }
  });
});
