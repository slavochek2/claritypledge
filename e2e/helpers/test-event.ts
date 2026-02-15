/**
 * @file test-event.ts
 *
 * E2E Test Helpers for Event Management
 *
 * These helpers use the Supabase Admin API to:
 * 1. Create test events with hosts
 * 2. RSVP users to events
 * 3. Create sub-rooms for waiting room tests
 * 4. Clean up test data after tests
 *
 * All helpers use service_role key which bypasses RLS via
 * "Test data: service_role bypass" policies.
 */

import { supabaseAdmin } from '../../src/lib/supabase-admin';

export interface TestEvent {
  id: string;
  slug: string;
  hostId: string;
  title: string;
}

export interface TestSubRoom {
  id: string;
  eventId: string;
  initiatorId: string;
  targetId: string;
  status: 'pending' | 'active' | 'completed' | 'cancelled';
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
  } = {}
): Promise<TestEvent> {
  const slug = `test-event-${Date.now()}`;
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
    })
    .select('id, slug, host_id, title')
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
 * Creates a sub-room for waiting room tests
 * @param eventId - ID of the event
 * @param initiatorId - ID of the user who initiated the sub-room
 * @param targetId - ID of the target user
 * @param options - Optional overrides for sub-room properties
 */
export async function createTestSubRoom(
  eventId: string,
  initiatorId: string,
  targetId: string,
  options: {
    status?: 'pending' | 'active' | 'completed' | 'cancelled';
    expiresAt?: Date;
  } = {}
): Promise<TestSubRoom> {
  console.log(`[TEST HELPER] Creating sub-room: ${initiatorId} → ${targetId} at event ${eventId}`);

  const expiresAt = options.expiresAt || new Date(Date.now() + 15 * 60 * 1000); // 15 minutes from now

  const { data, error } = await supabaseAdmin
    .from('event_sub_rooms')
    .insert({
      event_id: eventId,
      initiator_id: initiatorId,
      target_id: targetId,
      status: options.status || 'pending',
      expires_at: expiresAt.toISOString(),
    })
    .select('id, event_id, initiator_id, target_id, status')
    .single();

  if (error) {
    console.error('[TEST HELPER] Failed to create sub-room:', error);
    throw new Error(`Failed to create sub-room: ${error.message}`);
  }

  console.log(`[TEST HELPER] Sub-room created: ${data.id}`);

  return {
    id: data.id,
    eventId: data.event_id,
    initiatorId: data.initiator_id,
    targetId: data.target_id,
    status: data.status as 'pending' | 'active' | 'completed' | 'cancelled',
  };
}

/**
 * Gets a sub-room by event and initiator
 * @param eventId - ID of the event
 * @param initiatorId - ID of the initiator
 */
export async function getSubRoom(
  eventId: string,
  initiatorId: string
): Promise<TestSubRoom> {
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

  return {
    id: data.id,
    eventId: data.event_id,
    initiatorId: data.initiator_id,
    targetId: data.target_id,
    status: data.status,
  };
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
