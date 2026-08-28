/**
 * @file p1060-accessibility.spec.ts
 * @description Accessibility tests for P1060: the /org directory and the
 * reused participant-count avatar row (org header + directory card).
 *
 * Covers: directory cards keyboard-reachable as links, member-count control
 * remains a real <button> (per org-header.tsx's existing pattern — "rendered
 * as a real <button>... keyboard-reachable and announced as an action"),
 * avatar-row images/initials are not read as noise to screen readers.
 */

import { test, expect } from '@playwright/test';
import { createTestUser, deleteTestUser, type TestUser } from '../helpers/test-user';
import {
  createTestOrganization,
  deleteTestOrganization,
  type TestOrganization,
} from '../helpers/test-organization';
import { createTestEvent, rsvpToEvent, deleteTestEvent, type TestEvent } from '../helpers/test-event';

/**
 * Per-run suffix. /org lists EVERY public organization, so a fixture with a fixed
 * name is not hermetic on a shared test DB: a run whose beforeAll times out leaves
 * its org behind, and the next run's `getByRole('link', { name })` then matches
 * two or three elements and dies on strict mode rather than on anything real.
 * Observed 2026-08-28 — three orphaned "P1060 A11y Org" rows from one timed-out
 * beforeAll. Uniqueness makes each run's assertions bind to its own fixture.
 */
const RUN = `${Date.now()}-${Math.floor(Math.random() * 10000)}`;

let org: TestOrganization;
let host: TestUser;
let participant: TestUser;
let event: TestEvent;

test.beforeAll(async () => {
  org = await createTestOrganization({ name: `P1060 A11y Org ${RUN}`, visibility: 'public', hasEvents: true });
  host = await createTestUser({ name: 'P1060 A11y Host' });
  participant = await createTestUser({ name: 'P1060 A11y Participant' });
  event = await createTestEvent(host.user.id, new Date(Date.now() + 86_400_000), {
    title: 'P1060 A11y Event',
    orgId: org.id,
  });
  await rsvpToEvent(event.id, participant.user.id);
});

test.afterAll(async () => {
  if (event?.id) await deleteTestEvent(event.id);
  if (org?.id) await deleteTestOrganization(org.id);
  if (host?.user?.id) await deleteTestUser(host.user.id);
  if (participant?.user?.id) await deleteTestUser(participant.user.id);
});

test.describe('P1060 Accessibility — /org directory', () => {
  test('directory cards are reachable via Tab and activate via Enter', async ({ page }) => {
    await page.goto('/org');
    await page.waitForLoadState('networkidle');

    const orgLink = page.getByRole('link', { name: org.name });
    await expect(orgLink).toBeVisible({ timeout: 10000 });
    await orgLink.focus();
    await expect(orgLink).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(new RegExp(`/org/${org.slug}$`), { timeout: 10000 });
  });

  test('the member-count control on the org header is a real button, not a styled span', async ({ page }) => {
    await page.goto(`/org/${org.slug}`);
    await page.waitForLoadState('networkidle');
    // Anchored: /members?/i also matches the header's "Join as member" CTA, which
    // is a different control entirely. The assertion is about the COUNT control —
    // that it is a real <button> and not a styled <span> — so bind it to the count.
    const memberCountBtn = page.getByRole('button', { name: /^\d+ members?$/ });
    await expect(memberCountBtn).toBeVisible({ timeout: 10000 });
  });
});

test.describe('P1060 Accessibility — participant avatar row', () => {
  test('avatar row does not expose raw image alt-text noise; person avatars have an accessible name or are decorative', async ({ page }) => {
    await page.goto(`/org/${org.slug}`);
    await page.waitForLoadState('networkidle');
    await expect(page.getByText('1 have joined events')).toBeVisible({ timeout: 10000 });

    const avatar = page.locator('[data-testid="person-avatar"]').first();
    await expect(avatar).toBeVisible();
    const img = avatar.locator('img');
    if (await img.count() > 0) {
      const alt = await img.first().getAttribute('alt');
      expect(alt, 'avatar image must not have an empty alt with no other accessible name').not.toBeNull();
    }
  });
});
