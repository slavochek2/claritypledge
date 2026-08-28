/**
 * @file test-event.ts
 *
 * E2E Test Helpers for Event Management
 *
 * These helpers use the Supabase Admin API to:
 * 1. Create test events with hosts
 * 2. RSVP users to events
 * 3. Clean up test data after tests
 *
 * All helpers use service_role key which bypasses RLS via
 * "Test data: service_role bypass" policies.
 */

import { supabaseAdmin } from './supabase-admin';

export interface TestEvent {
  id: string;
  slug: string;
  hostId: string;
  title: string;
  orgId: string | null;
}

/**
 * Creates a test event in the database
 * @param hostId - User ID of the event host
 * @param startDatetime - Event start time (defaults to now)
 * @param options - Optional overrides for event properties
 */
export async function createTestEvent(
  hostId: string,
  startDatetime?: Date,
  options: {
    title?: string;
    description?: string;
    durationMinutes?: number;
    location?: string;
    timezone?: string;
    status?: 'upcoming' | 'live' | 'completed' | 'cancelled';
    orgId?: string | null;
  } = {}
): Promise<TestEvent> {
  // P1179: `Date.now()` alone is NOT unique across Playwright workers — three
  // workers entering beforeAll in the same millisecond collide on the
  // `events_slug_key` unique constraint, which surfaces as an unrelated-looking
  // flake in whichever spec lost the race. Observed 2026-08-28 on
  // e2e/integration/p1179-events-links-column.spec.ts (1 flaky, passed on retry).
  // The random suffix makes the slug unique per CALL, not per millisecond.
  const slug = `test-event-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const title = options.title || `Test Event ${Date.now()}`;
  const description = options.description || 'Test event for E2E tests';
  const datetime = (startDatetime || new Date()).toISOString();

  console.log(`[TEST HELPER] Creating test event: ${title}`);

  const { data, error } = await supabaseAdmin
    .from('events')
    .insert({
      slug,
      title,
      description,
      datetime,
      duration_minutes: options.durationMinutes || 120,
      timezone: options.timezone || 'America/Los_Angeles',
      location: options.location || 'Test Location',
      host_id: hostId,
      status: options.status || 'upcoming',
      ...(options.orgId !== undefined && { org_id: options.orgId }),
    })
    .select('id, slug, host_id, title, org_id')
    .single();

  if (error) {
    console.error('[TEST HELPER] Failed to create test event:', error);
    throw new Error(`Failed to create test event: ${error.message}`);
  }

  console.log(`[TEST HELPER] Test event created: ${data.id} (slug: ${data.slug})`);

  return {
    id: data.id,
    slug: data.slug,
    hostId: data.host_id,
    title: data.title,
    orgId: data.org_id ?? null,
  };
}

/**
 * RSVPs a user to an event
 * @param eventId - ID of the event
 * @param profileId - ID of the user's profile
 */
export async function rsvpToEvent(eventId: string, profileId: string): Promise<void> {
  console.log(`[TEST HELPER] RSVP user ${profileId} to event ${eventId}`);

  const { error } = await supabaseAdmin
    .from('event_rsvps')
    .insert({
      event_id: eventId,
      profile_id: profileId,
    });

  if (error) {
    console.error('[TEST HELPER] Failed to RSVP to event:', error);
    throw new Error(`Failed to RSVP to event: ${error.message}`);
  }

  console.log(`[TEST HELPER] RSVP created`);
}

/**
 * Deletes a test event and its related data
 * @param eventId - ID of the event to delete
 *
 * Note: CASCADE will automatically delete:
 * - event_rsvps (via event_id FK)
 * - event_sub_rooms (via event_id FK)
 */
export async function deleteTestEvent(eventId: string): Promise<void> {
  console.log(`[TEST HELPER] Deleting test event: ${eventId}`);

  const { error } = await supabaseAdmin
    .from('events')
    .delete()
    .eq('id', eventId);

  if (error) {
    console.warn(`[TEST HELPER] Error deleting event ${eventId}:`, error);
    // Don't throw - event might already be deleted
  } else {
    console.log(`[TEST HELPER] Test event deleted: ${eventId}`);
  }
}
