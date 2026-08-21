/**
 * @file p406-practice-rooms.spec.ts
 * @description E2E tests for P406: Practice Rooms — Event-Native Session Start
 *
 * Tests the user flows for the Practice Rooms feature, now hosted on `/meet` (P1114
 * round 4 — Practice Rooms moved off the event Details page, under the room roster):
 * 1. Empty state: Practice Rooms section visible with [+ Open a room] button
 * 2. Open a room: [+ Open a room] navigates to /live with returnTo param set
 * 3. Rooms list: waiting room shows creator name + [Join →] button
 * 4. In-session room: shows creator+joiner names with locked indicator, no [Join →]
 * 5. Your room row: shows "You · waiting..." + [Leave] button, not [Join →]
 * 6. [Leave]: removes your room from the list (optimistic update)
 * 7. [Join →]: navigates to /live/[code] join flow
 * 8. [+ Open a room] disabled when you already have an open room
 *
 * No unauthenticated-access test: `/meet` has no anonymous path (it sits behind
 * `useEventRoomAccess`'s `granted = isLoggedIn && (isRegistered || isHost)` gate, same as
 * every other room route), unlike the old event Details page which rendered Practice
 * Rooms for logged-out visitors too. The P406 "unauthenticated user sees Practice Rooms
 * but [+ Open a room] requires auth" case has no equivalent on `/meet` and is deleted
 * rather than retargeted.
 *
 * Test data setup: rooms created directly via supabaseAdmin (bypasses RLS). Every
 * viewing user is either the event host or `rsvpToEvent`'d, so `granted` passes and
 * `/meet` actually renders instead of the gate screen.
 * No live real-time polling is tested here — that is covered by integration tests.
 * No actual two-party /live session is started.
 *
 * Note: Tests run against a real event page. Polling every 5s means UI may
 * update between clicks — tests use specific data-testid / aria selectors.
 */

import { test, expect } from '@playwright/test';
import { supabaseAdmin } from './helpers/supabase-admin';
import {
  createTestUser,
  setTestSession,
  deleteTestUser,
} from './helpers/test-user';
import { createTestEvent, deleteTestEvent, rsvpToEvent, type TestEvent } from './helpers/test-event';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Creates a practice room row for a given event+creator via admin. */
async function createPracticeRoom(options: {
  eventId: string;
  creatorId: string;
  status?: 'waiting' | 'active' | 'closed';
  sessionId?: string | null;
}): Promise<string> {
  const { eventId, creatorId, status = 'waiting', sessionId = null } = options;

  const { data, error } = await supabaseAdmin
    .from('event_practice_rooms')
    .insert({
      event_id: eventId,
      creator_id: creatorId,
      status,
      session_id: sessionId,
    })
    .select('id')
    .single();

  if (error) throw new Error(`Failed to create practice room: ${error.message}`);
  return data!.id;
}

async function deletePracticeRooms(eventId: string) {
  await supabaseAdmin.from('event_practice_rooms').delete().eq('event_id', eventId);
}

// ─── Tests ────────────────────────────────────────────────────────────────────

test.describe('P406: Practice Rooms — empty state', () => {
  test.describe.configure({ timeout: 30000 });

  test('Practice Rooms section is visible with [+ Open a room] when no rooms exist', async ({ page }) => {
    let testUser: Awaited<ReturnType<typeof createTestUser>> | null = null;
    let event: TestEvent | null = null;

    const consoleErrors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });

    try {
      testUser = await createTestUser({ name: 'P406 EmptyState User' });
      event = await createTestEvent(testUser.user.id, undefined, {
        title: 'P406 EmptyState Event',
      });

      await setTestSession(page, testUser.email);
      await page.goto(`/events/${event.slug}/meet`);
      await page.waitForLoadState('networkidle');

      // Practice Rooms section heading
      await expect(
        page.getByRole('heading', { name: /practice rooms/i })
      ).toBeVisible({ timeout: 10000 });

      // Empty state message
      await expect(
        page.getByText(/no open rooms yet|be the first/i)
      ).toBeVisible({ timeout: 10000 });

      // [+ Open a room] button present and enabled
      const openBtn = page.getByRole('button', { name: /open a room/i });
      await expect(openBtn).toBeVisible({ timeout: 10000 });
      await expect(openBtn).toBeEnabled();

      // No console errors
      const appErrors = consoleErrors.filter(
        e => !e.includes('ResizeObserver') && !e.includes('favicon')
      );
      expect(appErrors).toHaveLength(0);
    } finally {
      if (event) await deletePracticeRooms(event.id);
      if (event) await deleteTestEvent(event.id);
      if (testUser) await deleteTestUser(testUser.user.id);
    }
  });
});

test.describe('P406: Practice Rooms — open a room', () => {
  test.describe.configure({ timeout: 30000 });

  test('[+ Open a room] navigates to /live waiting screen with returnTo param', async ({ page }) => {
    let testUser: Awaited<ReturnType<typeof createTestUser>> | null = null;
    let event: TestEvent | null = null;

    try {
      testUser = await createTestUser({ name: 'P406 OpenRoom User' });
      event = await createTestEvent(testUser.user.id, undefined, {
        title: 'P406 OpenRoom Event',
      });

      await setTestSession(page, testUser.email);
      await page.goto(`/events/${event.slug}/meet`);
      await page.waitForLoadState('networkidle');

      await page.getByRole('button', { name: /open a room/i }).click();

      // Should navigate to /live (waiting screen) — may be /live directly or with params
      await expect(page).toHaveURL(/\/live/, { timeout: 10000 });

      // returnTo must point back to /meet specifically, not just the event slug — a bare
      // `/events/${slug}` (no /meet) would land a finished /live session on the event
      // Details page, outside the room the person actually launched from. Round 4's only
      // render site is /meet now (code review finding), so this is the one correct target.
      const url = page.url();
      expect(url).toContain(`returnTo=`);
      expect(url).toContain(encodeURIComponent(`/events/${event.slug}/meet`));
    } finally {
      if (event) await deletePracticeRooms(event.id);
      if (event) await deleteTestEvent(event.id);
      if (testUser) await deleteTestUser(testUser.user.id);
    }
  });
});

test.describe('P406: Practice Rooms — rooms list (waiting state)', () => {
  test.describe.configure({ timeout: 30000 });

  test('waiting room shows creator name and [Join →] button', async ({ page }) => {
    let viewer: Awaited<ReturnType<typeof createTestUser>> | null = null;
    let creator: Awaited<ReturnType<typeof createTestUser>> | null = null;
    let event: TestEvent | null = null;

    try {
      creator = await createTestUser({ name: 'P406 RoomCreator' });
      viewer = await createTestUser({ name: 'P406 RoomViewer' });
      // Use viewer as host so creator name only appears in Practice Rooms, not in organizer card
      event = await createTestEvent(viewer.user.id, undefined, {
        title: 'P406 Waiting Rooms Event',
      });

      // Create a waiting room for the creator
      await createPracticeRoom({
        eventId: event.id,
        creatorId: creator.user.id,
        status: 'waiting',
      });

      // View the event page as a different user
      await setTestSession(page, viewer.email);
      await page.goto(`/events/${event.slug}/meet`);
      await page.waitForLoadState('networkidle');

      // Creator's name should appear in the rooms list
      await expect(
        page.getByText(/P406 RoomCreator/i)
      ).toBeVisible({ timeout: 10000 });

      // "waiting..." indicator
      await expect(
        page.getByText(/waiting\.\.\./i)
      ).toBeVisible({ timeout: 10000 });

      // [Join →] button for this room
      // Anchored to the START of the accessible name ("Join …'s room"), not a bare
      // substring match: on `/meet` (P1114 round 4 moved Practice Rooms here) the
      // viewing user is auto-joined into the visible public roster, and a test fixture
      // name that happens to CONTAIN "join" (e.g. "P406 JoinViewer") would otherwise
      // collide with this locator via their own roster PersonRow link.
      const joinBtn = page.getByRole('button', { name: /^join /i })
        .or(page.getByRole('link', { name: /^join /i }))
        .first();
      await expect(joinBtn).toBeVisible({ timeout: 10000 });
    } finally {
      if (event) await deletePracticeRooms(event.id);
      if (event) await deleteTestEvent(event.id);
      if (creator) await deleteTestUser(creator.user.id);
      if (viewer) await deleteTestUser(viewer.user.id);
    }
  });

  test('[Join →] navigates to /live/[code] join flow', async ({ page }) => {
    let viewer: Awaited<ReturnType<typeof createTestUser>> | null = null;
    let creator: Awaited<ReturnType<typeof createTestUser>> | null = null;
    let host: Awaited<ReturnType<typeof createTestUser>> | null = null;
    let event: TestEvent | null = null;
    let claritySessionId: string | undefined;

    try {
      creator = await createTestUser({ name: 'P406 JoinCreator' });
      viewer = await createTestUser({ name: 'P406 JoinViewer' });
      // Use a neutral host so "join" doesn't appear in the organizer card link
      host = await createTestUser({ name: 'P406 EventHost' });
      event = await createTestEvent(host.user.id, undefined, {
        title: 'P406 Join Flow Event',
      });

      // Create a clarity session for this room so we have a valid session code
      const sessionCode = `P406JOIN${Date.now()}`;
      const { data: session, error: sessionError } = await supabaseAdmin
        .from('clarity_sessions')
        .insert({
          code: sessionCode,
          creator_profile_id: creator.user.id,
          creator_name: 'P406 JoinCreator',
        })
        .select('id')
        .single();

      if (sessionError) throw new Error(`Failed to create session: ${sessionError.message}`);
      claritySessionId = session!.id;

      // Create a waiting room linked to the session
      await createPracticeRoom({
        eventId: event.id,
        creatorId: creator.user.id,
        status: 'waiting',
        sessionId: claritySessionId,
      });

      // View as a different user and join — must be registered (or host) for `/meet`'s
      // access gate to pass.
      await rsvpToEvent(event.id, viewer.user.id);
      await setTestSession(page, viewer.email);
      await page.goto(`/events/${event.slug}/meet`);
      await page.waitForLoadState('networkidle');

      // Wait for the [Join →] button and click it
      // Anchored to the START of the accessible name ("Join …'s room"), not a bare
      // substring match: on `/meet` (P1114 round 4 moved Practice Rooms here) the
      // viewing user is auto-joined into the visible public roster, and a test fixture
      // name that happens to CONTAIN "join" (e.g. "P406 JoinViewer") would otherwise
      // collide with this locator via their own roster PersonRow link.
      const joinBtn = page.getByRole('button', { name: /^join /i })
        .or(page.getByRole('link', { name: /^join /i }))
        .first();
      await expect(joinBtn).toBeVisible({ timeout: 10000 });
      await joinBtn.click();

      // Should navigate to /live/[code]
      await expect(page).toHaveURL(new RegExp(`/live/${sessionCode}`), { timeout: 10000 });
    } finally {
      if (claritySessionId) {
        await supabaseAdmin.from('clarity_sessions').delete().eq('id', claritySessionId);
      }
      if (event) await deletePracticeRooms(event.id);
      if (event) await deleteTestEvent(event.id);
      if (creator) await deleteTestUser(creator.user.id);
      if (viewer) await deleteTestUser(viewer.user.id);
      if (host) await deleteTestUser(host.user.id);
    }
  });
});

test.describe('P406: Practice Rooms — in-session room (locked)', () => {
  test.describe.configure({ timeout: 30000 });

  test('active (in-session) room shows locked indicator and no [Join →] button', async ({ page }) => {
    let viewer: Awaited<ReturnType<typeof createTestUser>> | null = null;
    let creator: Awaited<ReturnType<typeof createTestUser>> | null = null;
    let event: TestEvent | null = null;

    try {
      creator = await createTestUser({ name: 'P406 ActiveCreator' });
      viewer = await createTestUser({ name: 'P406 ActiveViewer' });
      event = await createTestEvent(creator.user.id, undefined, {
        title: 'P406 Active Rooms Event',
      });

      // Create an active (in-session) room
      await createPracticeRoom({
        eventId: event.id,
        creatorId: creator.user.id,
        status: 'active',
      });

      // Must be registered (or host) for `/meet`'s access gate to pass.
      await rsvpToEvent(event.id, viewer.user.id);
      await setTestSession(page, viewer.email);
      await page.goto(`/events/${event.slug}/meet`);
      await page.waitForLoadState('networkidle');

      // Should show "in session" indicator
      await expect(
        page.getByText(/in session/i)
      ).toBeVisible({ timeout: 10000 });

      // No [Join →] button for an active room. Anchored — see the comment on the
      // earlier locator in this file for why a bare /join/i substring match is unsafe
      // on `/meet`.
      const joinBtn = page.getByRole('button', { name: /^join /i })
        .or(page.getByRole('link', { name: /^join /i }));
      await expect(joinBtn).not.toBeVisible({ timeout: 5000 });
    } finally {
      if (event) await deletePracticeRooms(event.id);
      if (event) await deleteTestEvent(event.id);
      if (creator) await deleteTestUser(creator.user.id);
      if (viewer) await deleteTestUser(viewer.user.id);
    }
  });
});

test.describe('P406: Practice Rooms — your own room', () => {
  test.describe.configure({ timeout: 30000 });

  test('your own waiting room shows "You · waiting..." and [Leave] button', async ({ page }) => {
    let creator: Awaited<ReturnType<typeof createTestUser>> | null = null;
    let event: TestEvent | null = null;

    try {
      creator = await createTestUser({ name: 'P406 OwnRoom User' });
      event = await createTestEvent(creator.user.id, undefined, {
        title: 'P406 OwnRoom Event',
      });

      // Create a waiting room for the creator (simulates having opened a room)
      await createPracticeRoom({
        eventId: event.id,
        creatorId: creator.user.id,
        status: 'waiting',
      });

      await setTestSession(page, creator.email);
      await page.goto(`/events/${event.slug}/meet`);
      await page.waitForLoadState('networkidle');

      // Should show "You" in the row (not the creator's name)
      await expect(
        page.getByText(/you.*waiting/i)
      ).toBeVisible({ timeout: 10000 });

      // [Leave] button present
      const leaveBtn = page.getByRole('button', { name: /leave/i });
      await expect(leaveBtn).toBeVisible({ timeout: 10000 });

      // [Join →] must NOT appear on your own row
      const joinBtn = page.getByRole('button', { name: /^join/i });
      await expect(joinBtn).not.toBeVisible({ timeout: 5000 });
    } finally {
      if (event) await deletePracticeRooms(event.id);
      if (event) await deleteTestEvent(event.id);
      if (creator) await deleteTestUser(creator.user.id);
    }
  });

  test('[+ Open a room] is disabled when you already have a waiting room', async ({ page }) => {
    let creator: Awaited<ReturnType<typeof createTestUser>> | null = null;
    let event: TestEvent | null = null;

    try {
      creator = await createTestUser({ name: 'P406 Disabled User' });
      event = await createTestEvent(creator.user.id, undefined, {
        title: 'P406 Disabled Button Event',
      });

      // Pre-create a waiting room for the creator
      await createPracticeRoom({
        eventId: event.id,
        creatorId: creator.user.id,
        status: 'waiting',
      });

      await setTestSession(page, creator.email);
      await page.goto(`/events/${event.slug}/meet`);
      await page.waitForLoadState('networkidle');

      // [+ Open a room] must be disabled / aria-disabled
      const openBtn = page.getByRole('button', { name: /open a room/i });
      await expect(openBtn).toBeVisible({ timeout: 10000 });

      // Check it is either disabled or aria-disabled
      const isDisabled = await openBtn.isDisabled();
      const ariaDisabled = await openBtn.getAttribute('aria-disabled');
      expect(isDisabled || ariaDisabled === 'true').toBe(true);
    } finally {
      if (event) await deletePracticeRooms(event.id);
      if (event) await deleteTestEvent(event.id);
      if (creator) await deleteTestUser(creator.user.id);
    }
  });

  test('[Leave] removes your room from the list (optimistic update)', async ({ page }) => {
    let creator: Awaited<ReturnType<typeof createTestUser>> | null = null;
    let event: TestEvent | null = null;

    try {
      creator = await createTestUser({ name: 'P406 Leave User' });
      event = await createTestEvent(creator.user.id, undefined, {
        title: 'P406 Leave Event',
      });

      // Create a waiting room for the creator
      await createPracticeRoom({
        eventId: event.id,
        creatorId: creator.user.id,
        status: 'waiting',
      });

      await setTestSession(page, creator.email);
      await page.goto(`/events/${event.slug}/meet`);
      await page.waitForLoadState('networkidle');

      // Confirm room is shown
      await expect(page.getByText(/you.*waiting/i)).toBeVisible({ timeout: 10000 });

      // Click [Leave]
      await page.getByRole('button', { name: /leave/i }).click();

      // Room row should disappear — empty state or no "You · waiting"
      await expect(page.getByText(/you.*waiting/i)).not.toBeVisible({ timeout: 10000 });

      // Empty state message should reappear (no other rooms exist)
      await expect(
        page.getByText(/no open rooms yet|be the first/i)
      ).toBeVisible({ timeout: 10000 });
    } finally {
      if (event) await deletePracticeRooms(event.id);
      if (event) await deleteTestEvent(event.id);
      if (creator) await deleteTestUser(creator.user.id);
    }
  });
});
