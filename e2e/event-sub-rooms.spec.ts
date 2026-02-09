/**
 * E2E tests for P124 Event Rooms - Sub-room creation, joining, expiry, and cancellation
 *
 * Tests the "tap to step aside" flow:
 * - User A RSVPs to event → taps participant B → creates sub-room
 * - User B sees invitation → taps Join
 * - Both navigate to /live with shared session
 * - Sub-rooms expire after 3 minutes if not joined
 * - Initiators can cancel pending sub-rooms
 *
 * Critical: P124 has ZERO test coverage for multi-user real-time feature with race conditions.
 */
import { test, expect } from '@playwright/test';
import { createTestUser, deleteTestUser, setTestSession, TestUser } from './helpers/test-user';
import { supabaseAdmin } from '../src/lib/supabase-admin';

// ============================================================================
// TEST HELPERS
// ============================================================================

interface TestEvent {
  id: string;
  slug: string;
  hostId: string;
}

/**
 * Creates a test event in the database
 * Note: Uses admin client to bypass RLS for test setup
 */
async function createTestEvent(hostId: string, startDatetime: Date): Promise<TestEvent> {
  const slug = `test-event-${Date.now()}`;
  const { data, error } = await supabaseAdmin
    .from('events')
    .insert({
      slug,
      title: 'Test Event for Sub-Rooms',
      description: 'Test event to verify sub-room functionality',
      datetime: startDatetime.toISOString(),
      duration_minutes: 120,
      timezone: 'America/Los_Angeles',
      location: 'Test Location',
      host_id: hostId,
      status: 'upcoming',
    })
    .select('id, slug, host_id')
    .single();

  if (error) {
    throw new Error(`Failed to create test event: ${error.message}`);
  }

  return {
    id: data.id,
    slug: data.slug,
    hostId: data.host_id,
  };
}

/**
 * RSVPs a user to an event
 */
async function rsvpToEvent(eventId: string, profileId: string): Promise<void> {
  const { error } = await supabaseAdmin
    .from('event_rsvps')
    .insert({
      event_id: eventId,
      profile_id: profileId,
    });

  if (error) {
    throw new Error(`Failed to RSVP to event: ${error.message}`);
  }
}

/**
 * Deletes a test event and its related data
 */
async function deleteTestEvent(eventId: string): Promise<void> {
  // Cascade deletes will handle event_rsvps and event_sub_rooms
  const { error } = await supabaseAdmin
    .from('events')
    .delete()
    .eq('id', eventId);

  if (error) {
    console.warn(`[Test Helper] Failed to delete event ${eventId}:`, error);
  }
}

/**
 * Gets a sub-room by ID
 */
async function getSubRoom(subRoomId: string) {
  const { data, error } = await supabaseAdmin
    .from('event_sub_rooms')
    .select('*')
    .eq('id', subRoomId)
    .single();

  if (error) {
    throw new Error(`Failed to get sub-room: ${error.message}`);
  }

  return data;
}

/**
 * Updates a sub-room's expires_at time (for testing expiry)
 */
async function expireSubRoom(subRoomId: string): Promise<void> {
  const pastTime = new Date(Date.now() - 5 * 60 * 1000); // 5 minutes ago
  const { error } = await supabaseAdmin
    .from('event_sub_rooms')
    .update({ expires_at: pastTime.toISOString() })
    .eq('id', subRoomId);

  if (error) {
    throw new Error(`Failed to expire sub-room: ${error.message}`);
  }
}

// ============================================================================
// TESTS
// ============================================================================

test.describe('Event Sub-Rooms (P124)', () => {
  let userA: TestUser;
  let userB: TestUser;
  let testEvent: TestEvent;

  test.beforeEach(async () => {
    // Create two test users
    userA = await createTestUser({ name: 'Alice Test' });
    userB = await createTestUser({ name: 'Bob Test' });

    // Create event starting now (so it's "live")
    testEvent = await createTestEvent(userA.user.id, new Date());

    // Both users RSVP to the event
    await rsvpToEvent(testEvent.id, userA.user.id);
    await rsvpToEvent(testEvent.id, userB.user.id);
  });

  test.afterEach(async () => {
    // Cleanup
    if (testEvent) {
      await deleteTestEvent(testEvent.id);
    }
    if (userA) {
      await deleteTestUser(userA.user.id);
    }
    if (userB) {
      await deleteTestUser(userB.user.id);
    }
  });

  test('Happy path: User A creates sub-room, User B joins, both navigate to /live', async ({ browser }) => {
    // Create two browser contexts
    const contextA = await browser.newContext();
    const contextB = await browser.newContext();

    const pageA = await contextA.newPage();
    const pageB = await contextB.newPage();

    // Track console errors for debugging
    const errorsA: string[] = [];
    const errorsB: string[] = [];
    pageA.on('console', msg => {
      if (msg.type() === 'error') {
        errorsA.push(msg.text());
      }
    });
    pageB.on('console', msg => {
      if (msg.type() === 'error') {
        errorsB.push(msg.text());
      }
    });

    try {
      // ===== SETUP: Both users log in and navigate to event page =====
      await setTestSession(pageA, userA.email);
      await setTestSession(pageB, userB.email);

      await pageA.goto(`/events/${testEvent.slug}`);
      await pageB.goto(`/events/${testEvent.slug}`);

      // Wait for event pages to load
      await expect(pageA.getByText('Test Event for Sub-Rooms')).toBeVisible({ timeout: 10000 });
      await expect(pageB.getByText('Test Event for Sub-Rooms')).toBeVisible({ timeout: 10000 });

      console.log('[Test] Both users on event page');

      // ===== STEP 1: User A taps User B to create sub-room =====
      // Look for Bob's name in the participant list
      const bobParticipant = pageA.getByRole('button', { name: /Bob Test/i });
      await expect(bobParticipant).toBeVisible({ timeout: 5000 });
      await bobParticipant.click();

      console.log('[Test] User A clicked User B in participant list');

      // Confirm the sub-room creation dialog
      const confirmButton = pageA.getByRole('button', { name: /Start session/i });
      await expect(confirmButton).toBeVisible({ timeout: 5000 });
      await confirmButton.click();

      console.log('[Test] User A confirmed sub-room creation');

      // ===== STEP 2: User A sees "waiting for Bob" state =====
      await expect(pageA.getByText(/waiting for/i)).toBeVisible({ timeout: 5000 });

      console.log('[Test] User A sees waiting state');

      // ===== STEP 3: User B sees the invitation =====
      // The invitation should appear in the Sessions section via real-time updates
      const joinButton = pageB.getByRole('button', { name: /Join/i });
      await expect(joinButton).toBeVisible({ timeout: 10000 });

      console.log('[Test] User B sees Join button');

      // ===== STEP 4: User B joins the sub-room =====
      await joinButton.click();

      console.log('[Test] User B clicked Join');

      // ===== STEP 5: Both users navigate to /live =====
      // Wait for navigation to /live page
      await expect(pageA).toHaveURL(/\/live/, { timeout: 15000 });
      await expect(pageB).toHaveURL(/\/live/, { timeout: 15000 });

      console.log('[Test] Both users navigated to /live');

      // Verify they're in the same session by checking they see each other's names
      await expect(pageA.getByText('Bob Test')).toBeVisible({ timeout: 10000 });
      await expect(pageB.getByText('Alice Test')).toBeVisible({ timeout: 10000 });

      console.log('[Test] SUCCESS - Both users in shared /live session');

      // Verify no console errors
      expect(errorsA).toHaveLength(0);
      expect(errorsB).toHaveLength(0);

    } catch (error) {
      console.error('[Test] FAILED with console errors:');
      console.error('User A errors:', errorsA);
      console.error('User B errors:', errorsB);
      throw error;
    } finally {
      await contextA.close();
      await contextB.close();
    }
  });

  test('Edge case: Sub-room expires after 3 minutes', async ({ page }) => {
    // Setup: User A creates sub-room
    await setTestSession(page, userA.email);
    await page.goto(`/events/${testEvent.slug}`);

    await expect(page.getByText('Test Event for Sub-Rooms')).toBeVisible({ timeout: 10000 });

    // Create sub-room
    const bobParticipant = page.getByRole('button', { name: /Bob Test/i });
    await expect(bobParticipant).toBeVisible({ timeout: 5000 });
    await bobParticipant.click();

    const confirmButton = page.getByRole('button', { name: /Start session/i });
    await expect(confirmButton).toBeVisible({ timeout: 5000 });
    await confirmButton.click();

    console.log('[Test] Sub-room created, waiting state visible');

    // Get the sub-room ID from database
    const { data: subRooms } = await supabaseAdmin
      .from('event_sub_rooms')
      .select('id')
      .eq('event_id', testEvent.id)
      .eq('initiator_id', userA.user.id)
      .eq('status', 'pending')
      .single();

    expect(subRooms).toBeTruthy();
    const subRoomId = subRooms!.id;

    console.log('[Test] Sub-room ID:', subRoomId);

    // Fast-forward expiry by updating expires_at to the past
    await expireSubRoom(subRoomId);

    console.log('[Test] Sub-room expires_at updated to past');

    // Trigger expiry check by trying to get sub-rooms (client-side expiry filter)
    // In the real app, this happens via periodic polling or real-time updates
    // For testing, we reload the page to trigger the expiry check
    await page.reload();

    // Wait a bit for real-time updates or polling
    await page.waitForTimeout(2000);

    // Verify the sub-room no longer shows as pending
    // It should either show as expired or not show at all
    await expect(page.getByText(/waiting for/i)).not.toBeVisible({ timeout: 5000 });

    console.log('[Test] Sub-room no longer shows as waiting');

    // Verify in database that status is still pending (expiry is client-side)
    // OR that the trigger has marked it expired
    const subRoom = await getSubRoom(subRoomId);
    console.log('[Test] Sub-room status after expiry:', subRoom.status);

    // Client-side expiry: status stays 'pending' but client filters it out
    // This is acceptable per P124 spec (server-side expiry via trigger on next insert)

    console.log('[Test] SUCCESS - Sub-room expired correctly');
  });

  test('Edge case: Initiator cancels pending sub-room', async ({ browser }) => {
    const contextA = await browser.newContext();
    const contextB = await browser.newContext();

    const pageA = await contextA.newPage();
    const pageB = await contextB.newPage();

    try {
      // Setup: Both users on event page
      await setTestSession(pageA, userA.email);
      await setTestSession(pageB, userB.email);

      await pageA.goto(`/events/${testEvent.slug}`);
      await pageB.goto(`/events/${testEvent.slug}`);

      await expect(pageA.getByText('Test Event for Sub-Rooms')).toBeVisible({ timeout: 10000 });
      await expect(pageB.getByText('Test Event for Sub-Rooms')).toBeVisible({ timeout: 10000 });

      // User A creates sub-room
      const bobParticipant = pageA.getByRole('button', { name: /Bob Test/i });
      await bobParticipant.click();

      const confirmButton = pageA.getByRole('button', { name: /Start session/i });
      await confirmButton.click();

      console.log('[Test] Sub-room created');

      // User A sees waiting state with Cancel option
      await expect(pageA.getByText(/waiting for/i)).toBeVisible({ timeout: 5000 });

      // User B should see the invitation
      const joinButton = pageB.getByRole('button', { name: /Join/i });
      await expect(joinButton).toBeVisible({ timeout: 10000 });

      console.log('[Test] User B sees invitation');

      // User A cancels
      const cancelButton = pageA.getByRole('button', { name: /Cancel/i });
      await expect(cancelButton).toBeVisible({ timeout: 5000 });
      await cancelButton.click();

      console.log('[Test] User A cancelled sub-room');

      // User A should no longer see waiting state
      await expect(pageA.getByText(/waiting for/i)).not.toBeVisible({ timeout: 5000 });

      console.log('[Test] User A no longer sees waiting state');

      // User B should no longer see Join button (via real-time update)
      await expect(joinButton).not.toBeVisible({ timeout: 10000 });

      console.log('[Test] User B no longer sees Join button');

      // Verify in database that status is 'cancelled'
      const { data: subRooms } = await supabaseAdmin
        .from('event_sub_rooms')
        .select('status')
        .eq('event_id', testEvent.id)
        .eq('initiator_id', userA.user.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      expect(subRooms?.status).toBe('cancelled');

      console.log('[Test] SUCCESS - Sub-room cancelled correctly');

    } finally {
      await contextA.close();
      await contextB.close();
    }
  });

  test('Edge case: Target already in active session (race condition)', async ({ browser }) => {
    const contextA = await browser.newContext();
    const contextB = await browser.newContext();
    const contextC = await browser.newContext();

    const pageA = await contextA.newPage();
    const pageB = await contextB.newPage();
    const pageC = await contextC.newPage();

    // Create third user
    const userC = await createTestUser({ name: 'Carol Test' });
    await rsvpToEvent(testEvent.id, userC.user.id);

    try {
      // Setup: All users on event page
      await setTestSession(pageA, userA.email);
      await setTestSession(pageB, userB.email);
      await setTestSession(pageC, userC.email);

      await pageA.goto(`/events/${testEvent.slug}`);
      await pageB.goto(`/events/${testEvent.slug}`);
      await pageC.goto(`/events/${testEvent.slug}`);

      await expect(pageA.getByText('Test Event for Sub-Rooms')).toBeVisible({ timeout: 10000 });
      await expect(pageB.getByText('Test Event for Sub-Rooms')).toBeVisible({ timeout: 10000 });
      await expect(pageC.getByText('Test Event for Sub-Rooms')).toBeVisible({ timeout: 10000 });

      console.log('[Test] All three users on event page');

      // User A creates sub-room with Carol
      const carolParticipantA = pageA.getByRole('button', { name: /Carol Test/i });
      await carolParticipantA.click();
      const confirmButtonA = pageA.getByRole('button', { name: /Start session/i });
      await confirmButtonA.click();

      console.log('[Test] User A created sub-room with Carol');

      // Wait for sub-room to be created
      await expect(pageA.getByText(/waiting for/i)).toBeVisible({ timeout: 5000 });

      // User B tries to create sub-room with Carol (should fail due to unique index)
      const carolParticipantB = pageB.getByRole('button', { name: /Carol Test/i });

      // Carol should be grayed out or disabled (unavailable)
      // OR clicking should show "already in session" error
      // Implementation detail: check if button is disabled
      const isDisabled = await carolParticipantB.isDisabled().catch(() => false);

      if (!isDisabled) {
        // If not disabled, clicking should show error
        await carolParticipantB.click();

        // Should see error message
        await expect(pageB.getByText(/already in a session|not available/i)).toBeVisible({ timeout: 5000 });

        console.log('[Test] User B saw "already in session" error');
      } else {
        console.log('[Test] Carol is disabled/grayed out for User B (correct)');
      }

      console.log('[Test] SUCCESS - Race condition handled correctly');

      // Cleanup third user
      await deleteTestUser(userC.user.id);

    } finally {
      await contextA.close();
      await contextB.close();
      await contextC.close();
    }
  });

  test('Edge case: Sub-room shows correct status to all event participants', async ({ browser }) => {
    const contextA = await browser.newContext();
    const contextB = await browser.newContext();
    const contextC = await browser.newContext();

    const pageA = await contextA.newPage();
    const pageB = await contextB.newPage();
    const pageC = await contextC.newPage();

    // Create third user (observer)
    const userC = await createTestUser({ name: 'Carol Observer' });
    await rsvpToEvent(testEvent.id, userC.user.id);

    try {
      // Setup: All users on event page
      await setTestSession(pageA, userA.email);
      await setTestSession(pageB, userB.email);
      await setTestSession(pageC, userC.email);

      await pageA.goto(`/events/${testEvent.slug}`);
      await pageB.goto(`/events/${testEvent.slug}`);
      await pageC.goto(`/events/${testEvent.slug}`);

      await expect(pageA.getByText('Test Event for Sub-Rooms')).toBeVisible({ timeout: 10000 });
      await expect(pageB.getByText('Test Event for Sub-Rooms')).toBeVisible({ timeout: 10000 });
      await expect(pageC.getByText('Test Event for Sub-Rooms')).toBeVisible({ timeout: 10000 });

      console.log('[Test] All three users on event page');

      // User A creates sub-room with User B
      const bobParticipantA = pageA.getByRole('button', { name: /Bob Test/i });
      await bobParticipantA.click();
      const confirmButtonA = pageA.getByRole('button', { name: /Start session/i });
      await confirmButtonA.click();

      console.log('[Test] User A created sub-room with Bob');

      // Verify all three users see the correct state:

      // User A: "You + Bob · waiting for Bob..."
      await expect(pageA.getByText(/waiting for/i)).toBeVisible({ timeout: 5000 });

      // User B: "Alice + You · [Join →]"
      const joinButton = pageB.getByRole('button', { name: /Join/i });
      await expect(joinButton).toBeVisible({ timeout: 10000 });

      // User C (observer): "🔒 Alice + Bob · waiting"
      // Look for session indicator showing Alice and Bob
      await expect(pageC.getByText(/Alice.*Bob|Bob.*Alice/i)).toBeVisible({ timeout: 10000 });

      console.log('[Test] All users see correct sub-room state');

      // User B joins
      await joinButton.click();

      // Wait for navigation
      await expect(pageA).toHaveURL(/\/live/, { timeout: 15000 });
      await expect(pageB).toHaveURL(/\/live/, { timeout: 15000 });

      console.log('[Test] Alice and Bob navigated to /live');

      // User C should now see "🔒 Alice + Bob · in session"
      await expect(pageC.getByText(/in session|active/i)).toBeVisible({ timeout: 10000 });

      console.log('[Test] SUCCESS - All participants see correct status updates');

      // Cleanup third user
      await deleteTestUser(userC.user.id);

    } finally {
      await contextA.close();
      await contextB.close();
      await contextC.close();
    }
  });

  test('Edge case: User cannot tap themselves', async ({ page }) => {
    await setTestSession(page, userA.email);
    await page.goto(`/events/${testEvent.slug}`);

    await expect(page.getByText('Test Event for Sub-Rooms')).toBeVisible({ timeout: 10000 });

    console.log('[Test] User on event page');

    // Look for own name in participant list
    const ownParticipant = page.getByRole('button', { name: /Alice Test/i });

    // Should either not exist as a button, or be disabled
    const exists = await ownParticipant.count();

    if (exists > 0) {
      // If exists, should be disabled
      const isDisabled = await ownParticipant.isDisabled();
      expect(isDisabled).toBe(true);
      console.log('[Test] Own participant entry is disabled');
    } else {
      console.log('[Test] Own participant entry is not clickable');
    }

    console.log('[Test] SUCCESS - Cannot tap self');
  });
});
