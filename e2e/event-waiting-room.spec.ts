/**
 * E2E tests for P135 Event Waiting Room - Dedicated waiting room page
 *
 * Tests the "Verify together" button flow:
 * - User A clicks "Verify together" on User B → navigates to /events/{slug}/waiting/{subRoomId}
 * - Waiting room shows countdown, target name, cancel/back buttons
 * - When User B joins → User A auto-navigates to /live
 * - User A can go back to event page → sub-room stays pending
 * - If User B joins while User A is back on event page → "Session ready" appears
 *
 * This test covers the P135 changes that fix the "surprise redirect" issue in P124.
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
 */
async function createTestEvent(hostId: string, startDatetime: Date): Promise<TestEvent> {
  const slug = `test-event-${Date.now()}`;
  const { data, error } = await supabaseAdmin
    .from('events')
    .insert({
      slug,
      title: 'Test Event for Waiting Room',
      description: 'Test event to verify waiting room functionality',
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
  const { error } = await supabaseAdmin
    .from('events')
    .delete()
    .eq('id', eventId);

  if (error) {
    console.warn(`[Test Helper] Failed to delete event ${eventId}:`, error);
  }
}

/**
 * Gets a sub-room by event and initiator
 */
async function getSubRoom(eventId: string, initiatorId: string) {
  const { data, error } = await supabaseAdmin
    .from('event_sub_rooms')
    .select('*')
    .eq('event_id', eventId)
    .eq('initiator_id', initiatorId)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (error) {
    throw new Error(`Failed to get sub-room: ${error.message}`);
  }

  return data;
}

// ============================================================================
// TESTS
// ============================================================================

test.describe('Event Waiting Room (P135)', () => {
  let userA: TestUser;
  let userB: TestUser;
  let testEvent: TestEvent;

  test.beforeEach(async () => {
    // Create two test users
    userA = await createTestUser({ name: 'Alice Initiator' });
    userB = await createTestUser({ name: 'Bob Target' });

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

  test('Happy path: Click "Verify together" → Navigate to waiting room', async ({ page }) => {
    // Setup: User A logs in and navigates to event page
    await setTestSession(page, userA.email);
    await page.goto(`/events/${testEvent.slug}`);

    // Wait for event page to load
    await expect(page.getByText('Test Event for Waiting Room')).toBeVisible({ timeout: 10000 });

    console.log('[Test] User A on event page');

    // Find Bob in participant list
    const bobParticipant = page.getByRole('button', { name: /Bob Target/i });
    await expect(bobParticipant).toBeVisible({ timeout: 5000 });

    console.log('[Test] Found "Verify together" button for Bob');

    // Click "Verify together" button
    await bobParticipant.click();

    console.log('[Test] Clicked "Verify together" button');

    // Confirm the sub-room creation dialog
    const confirmButton = page.getByRole('button', { name: /Start session/i });
    await expect(confirmButton).toBeVisible({ timeout: 5000 });
    await confirmButton.click();

    console.log('[Test] Confirmed sub-room creation');

    // ===== KEY ASSERTION: Should navigate to waiting room =====
    await expect(page).toHaveURL(/\/events\/.*\/waiting\/.*/, { timeout: 10000 });

    console.log('[Test] ✓ Navigated to waiting room page');

    // Verify waiting room content
    await expect(page.getByText(/Waiting for Bob/i)).toBeVisible({ timeout: 5000 });
    await expect(page.getByText(/expires in|Sub-room expires/i)).toBeVisible({ timeout: 5000 });
    await expect(page.getByRole('button', { name: /Cancel/i })).toBeVisible({ timeout: 5000 });

    console.log('[Test] ✓ Waiting room displays correctly');

    // Verify back button exists
    const backButton = page.getByRole('link', { name: /Back to event/i });
    await expect(backButton).toBeVisible({ timeout: 5000 });

    console.log('[Test] SUCCESS - "Verify together" button navigates to waiting room');
  });

  test('Waiting room: User B joins → User A auto-navigates to /live', async ({ browser }) => {
    // Create two browser contexts
    const contextA = await browser.newContext();
    const contextB = await browser.newContext();

    const pageA = await contextA.newPage();
    const pageB = await contextB.newPage();

    try {
      // Setup: Both users log in
      await setTestSession(pageA, userA.email);
      await setTestSession(pageB, userB.email);

      // User A creates sub-room and lands on waiting room
      await pageA.goto(`/events/${testEvent.slug}`);
      await expect(pageA.getByText('Test Event for Waiting Room')).toBeVisible({ timeout: 10000 });

      const bobParticipant = pageA.getByRole('button', { name: /Bob Target/i });
      await bobParticipant.click();

      const confirmButton = pageA.getByRole('button', { name: /Start session/i });
      await confirmButton.click();

      // Verify User A is on waiting room
      await expect(pageA).toHaveURL(/\/events\/.*\/waiting\/.*/, { timeout: 10000 });
      await expect(pageA.getByText(/Waiting for Bob/i)).toBeVisible({ timeout: 5000 });

      console.log('[Test] User A on waiting room');

      // User B navigates to event page and sees Join button
      await pageB.goto(`/events/${testEvent.slug}`);
      await expect(pageB.getByText('Test Event for Waiting Room')).toBeVisible({ timeout: 10000 });

      const joinButton = pageB.getByRole('button', { name: /Join/i });
      await expect(joinButton).toBeVisible({ timeout: 10000 });

      console.log('[Test] User B sees Join button');

      // User B joins
      await joinButton.click();

      console.log('[Test] User B clicked Join');

      // ===== KEY ASSERTION: Both navigate to /live =====
      await expect(pageA).toHaveURL(/\/live/, { timeout: 15000 });
      await expect(pageB).toHaveURL(/\/live/, { timeout: 15000 });

      console.log('[Test] ✓ Both users navigated to /live');

      // Verify they're in the same session
      await expect(pageA.getByText('Bob Target')).toBeVisible({ timeout: 10000 });
      await expect(pageB.getByText('Alice Initiator')).toBeVisible({ timeout: 10000 });

      console.log('[Test] SUCCESS - Auto-navigation from waiting room works');

    } finally {
      await contextA.close();
      await contextB.close();
    }
  });

  test('Waiting room: Cancel button deletes sub-room and returns to event', async ({ page }) => {
    // Setup: User A creates sub-room and lands on waiting room
    await setTestSession(page, userA.email);
    await page.goto(`/events/${testEvent.slug}`);

    await expect(page.getByText('Test Event for Waiting Room')).toBeVisible({ timeout: 10000 });

    const bobParticipant = page.getByRole('button', { name: /Bob Target/i });
    await bobParticipant.click();

    const confirmButton = page.getByRole('button', { name: /Start session/i });
    await confirmButton.click();

    // Verify on waiting room
    await expect(page).toHaveURL(/\/events\/.*\/waiting\/.*/, { timeout: 10000 });

    console.log('[Test] User A on waiting room');

    // Click Cancel button
    const cancelButton = page.getByRole('button', { name: /Cancel/i });
    await cancelButton.click();

    console.log('[Test] Clicked Cancel button');

    // ===== KEY ASSERTION: Should navigate back to event page =====
    await expect(page).toHaveURL(/\/events\/.*/, { timeout: 10000 });
    await expect(page).not.toHaveURL(/\/waiting/, { timeout: 5000 });

    console.log('[Test] ✓ Navigated back to event page');

    // Verify sub-room no longer shows as pending
    await expect(page.getByText(/waiting for/i)).not.toBeVisible({ timeout: 5000 });

    console.log('[Test] ✓ Sub-room no longer visible on event page');

    // Verify in database that sub-room is cancelled
    const subRoom = await getSubRoom(testEvent.id, userA.user.id);
    expect(subRoom.status).toBe('cancelled');

    console.log('[Test] SUCCESS - Cancel from waiting room works');
  });

  test('Waiting room: Back button returns to event, sub-room stays pending', async ({ page }) => {
    // Setup: User A creates sub-room and lands on waiting room
    await setTestSession(page, userA.email);
    await page.goto(`/events/${testEvent.slug}`);

    await expect(page.getByText('Test Event for Waiting Room')).toBeVisible({ timeout: 10000 });

    const bobParticipant = page.getByRole('button', { name: /Bob Target/i });
    await bobParticipant.click();

    const confirmButton = page.getByRole('button', { name: /Start session/i });
    await confirmButton.click();

    // Verify on waiting room
    await expect(page).toHaveURL(/\/events\/.*\/waiting\/.*/, { timeout: 10000 });

    console.log('[Test] User A on waiting room');

    // Click Back button
    const backButton = page.getByRole('link', { name: /Back to event/i });
    await backButton.click();

    console.log('[Test] Clicked Back button');

    // ===== KEY ASSERTION: Should navigate back to event page =====
    await expect(page).toHaveURL(/\/events\/.*/, { timeout: 10000 });
    await expect(page).not.toHaveURL(/\/waiting/, { timeout: 5000 });

    console.log('[Test] ✓ Navigated back to event page');

    // ===== KEY ASSERTION: Sub-room should still show as pending =====
    await expect(page.getByText(/waiting for Bob/i)).toBeVisible({ timeout: 5000 });

    console.log('[Test] ✓ Sub-room still shows as pending on event page');

    // Verify in database that sub-room is still pending
    const subRoom = await getSubRoom(testEvent.id, userA.user.id);
    expect(subRoom.status).toBe('pending');

    console.log('[Test] SUCCESS - Back button keeps sub-room pending');
  });

  test('Event page: If User B joins while User A is back on event page → "Session ready" appears', async ({ browser }) => {
    const contextA = await browser.newContext();
    const contextB = await browser.newContext();

    const pageA = await contextA.newPage();
    const pageB = await contextB.newPage();

    try {
      // Setup: Both users log in
      await setTestSession(pageA, userA.email);
      await setTestSession(pageB, userB.email);

      // User A creates sub-room
      await pageA.goto(`/events/${testEvent.slug}`);
      await expect(pageA.getByText('Test Event for Waiting Room')).toBeVisible({ timeout: 10000 });

      const bobParticipant = pageA.getByRole('button', { name: /Bob Target/i });
      await bobParticipant.click();

      const confirmButton = pageA.getByRole('button', { name: /Start session/i });
      await confirmButton.click();

      // Verify User A is on waiting room
      await expect(pageA).toHaveURL(/\/events\/.*\/waiting\/.*/, { timeout: 10000 });

      console.log('[Test] User A on waiting room');

      // User A goes back to event page
      const backButton = pageA.getByRole('link', { name: /Back to event/i });
      await backButton.click();

      await expect(pageA).toHaveURL(/\/events\/.*/, { timeout: 10000 });
      await expect(pageA).not.toHaveURL(/\/waiting/, { timeout: 5000 });

      console.log('[Test] User A returned to event page');

      // User B navigates to event page
      await pageB.goto(`/events/${testEvent.slug}`);
      await expect(pageB.getByText('Test Event for Waiting Room')).toBeVisible({ timeout: 10000 });

      const joinButton = pageB.getByRole('button', { name: /Join/i });
      await expect(joinButton).toBeVisible({ timeout: 10000 });

      console.log('[Test] User B sees Join button');

      // User B joins
      await joinButton.click();

      console.log('[Test] User B clicked Join');

      // User B navigates to /live
      await expect(pageB).toHaveURL(/\/live/, { timeout: 15000 });

      console.log('[Test] User B navigated to /live');

      // ===== KEY ASSERTION: User A should see "Session ready" on event page =====
      // Look for "Enter" button or "Session ready" text
      const enterButton = pageA.getByRole('button', { name: /Enter/i });
      await expect(enterButton).toBeVisible({ timeout: 10000 });

      console.log('[Test] ✓ User A sees "Enter" button (session ready)');

      // User A clicks Enter button
      await enterButton.click();

      // User A should now navigate to /live
      await expect(pageA).toHaveURL(/\/live/, { timeout: 15000 });

      console.log('[Test] ✓ User A manually navigated to /live via Enter button');

      console.log('[Test] SUCCESS - "Session ready" flow works');

    } finally {
      await contextA.close();
      await contextB.close();
    }
  });

  test('Edge case: Direct URL to waiting room validates user is initiator', async ({ page }) => {
    // Create a sub-room as User A
    await setTestSession(page, userA.email);
    await page.goto(`/events/${testEvent.slug}`);

    await expect(page.getByText('Test Event for Waiting Room')).toBeVisible({ timeout: 10000 });

    const bobParticipant = page.getByRole('button', { name: /Bob Target/i });
    await bobParticipant.click();

    const confirmButton = page.getByRole('button', { name: /Start session/i });
    await confirmButton.click();

    // Get the waiting room URL
    await expect(page).toHaveURL(/\/events\/.*\/waiting\/.*/, { timeout: 10000 });
    const waitingRoomUrl = page.url();

    console.log('[Test] User A created waiting room:', waitingRoomUrl);

    // Log out User A and log in as User B (target)
    await setTestSession(page, userB.email);

    // Try to access User A's waiting room as User B
    await page.goto(waitingRoomUrl);

    // ===== KEY ASSERTION: Should redirect to event page (not authorized) =====
    await expect(page).toHaveURL(/\/events\/.*/, { timeout: 10000 });
    await expect(page).not.toHaveURL(/\/waiting/, { timeout: 5000 });

    console.log('[Test] ✓ User B redirected to event page (not authorized)');

    // OR: Should show error message
    // await expect(page.getByText(/not authorized|access denied/i)).toBeVisible({ timeout: 5000 });

    console.log('[Test] SUCCESS - Direct URL access validated');
  });

  test('Edge case: Page refresh on waiting room resumes waiting', async ({ page }) => {
    // Setup: User A creates sub-room and lands on waiting room
    await setTestSession(page, userA.email);
    await page.goto(`/events/${testEvent.slug}`);

    await expect(page.getByText('Test Event for Waiting Room')).toBeVisible({ timeout: 10000 });

    const bobParticipant = page.getByRole('button', { name: /Bob Target/i });
    await bobParticipant.click();

    const confirmButton = page.getByRole('button', { name: /Start session/i });
    await confirmButton.click();

    // Verify on waiting room
    await expect(page).toHaveURL(/\/events\/.*\/waiting\/.*/, { timeout: 10000 });
    await expect(page.getByText(/Waiting for Bob/i)).toBeVisible({ timeout: 5000 });

    console.log('[Test] User A on waiting room');

    // Refresh the page
    await page.reload();

    console.log('[Test] Page refreshed');

    // ===== KEY ASSERTION: Should still be on waiting room and show waiting state =====
    await expect(page).toHaveURL(/\/events\/.*\/waiting\/.*/, { timeout: 10000 });
    await expect(page.getByText(/Waiting for Bob/i)).toBeVisible({ timeout: 5000 });

    console.log('[Test] ✓ Still on waiting room after refresh');

    // Verify in database that sub-room is still pending
    const subRoom = await getSubRoom(testEvent.id, userA.user.id);
    expect(subRoom.status).toBe('pending');

    console.log('[Test] SUCCESS - Page refresh resumes waiting');
  });
});
