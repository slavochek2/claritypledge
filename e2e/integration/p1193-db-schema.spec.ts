/**
 * INTEGRATION TEST: P1194 — event_private_info
 * (filename tracks the migration 20260831120000_p1193_*, which the P270 check
 * pairs by number; the spec itself is P1194 — see the migration header) + events.has_group_chat
 *
 * The unit suite (src/tests/p1194-event-group-chat.test.tsx) asserts the policy
 * SQL as text; it cannot execute it. This file runs the four cases that matter
 * against the real database with real clients:
 *
 *   anon                    → 0 rows
 *   authenticated, no RSVP  → 0 rows
 *   RSVP'd attendee         → 1 row
 *   host                    → 1 row
 *
 * The two positive cases are the control: without them, a policy that returns
 * nothing to anybody would pass the two negative cases and look correct.
 */
import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { supabaseAdmin } from '../helpers/supabase-admin';
import { createTestUser, generateTestEmail, TEST_PASSWORD } from '../helpers/test-user';
import { createTestEvent, rsvpToEvent, deleteTestEvent } from '../helpers/test-event';

const GROUP_CHAT_URL = 'https://chat.whatsapp.com/p1194-integration';

function anonClient() {
  return createClient(process.env.VITE_SUPABASE_URL!, process.env.VITE_SUPABASE_ANON_KEY!);
}

async function clientFor(email: string) {
  // Sign in through a THROWAWAY client. Signing in on supabaseAdmin swaps its
  // session to that user, so every later "admin" read silently runs under RLS
  // as them — which is exactly how the write-guard assertion below first failed.
  const { data, error } = await anonClient().auth.signInWithPassword({ email, password: TEST_PASSWORD });
  expect(error).toBeNull();
  return createClient(
    process.env.VITE_SUPABASE_URL!,
    process.env.VITE_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: `Bearer ${data!.session!.access_token}` } } }
  );
}

test.describe('P1194: event_private_info is readable only by the host and registered attendees', () => {
  let hostId: string;
  let hostEmail: string;
  let attendeeId: string;
  let attendeeEmail: string;
  let strangerEmail: string;
  let strangerId: string;
  let eventId: string;

  test.beforeAll(async () => {
    hostEmail = generateTestEmail();
    attendeeEmail = generateTestEmail();
    strangerEmail = generateTestEmail();
    hostId = (await createTestUser({ email: hostEmail, name: 'P1194 Host' })).user.id;
    attendeeId = (await createTestUser({ email: attendeeEmail, name: 'P1194 Attendee' })).user.id;
    strangerId = (await createTestUser({ email: strangerEmail, name: 'P1194 Stranger' })).user.id;

    const event = await createTestEvent(hostId, new Date(Date.now() + 7 * 24 * 3600 * 1000), {
      title: 'P1194 group chat gate',
      location: 'Somewhere',
    });
    eventId = event.id;

    await supabaseAdmin
      .from('event_private_info')
      .insert({ event_id: eventId, group_chat_url: GROUP_CHAT_URL });

    await rsvpToEvent(eventId, attendeeId);
  });

  test.afterAll(async () => {
    if (eventId) await deleteTestEvent(eventId);
    for (const id of [hostId, attendeeId, strangerId]) {
      if (id) await supabaseAdmin.auth.admin.deleteUser(id);
    }
  });

  test('the table exists and the trigger set events.has_group_chat', async () => {
    const { data, error } = await supabaseAdmin.from('events').select('has_group_chat').eq('id', eventId).single();
    expect(error).toBeNull();
    expect(data?.has_group_chat).toBe(true);
  });

  test('anon reads zero rows', async () => {
    const { data } = await anonClient().from('event_private_info').select('group_chat_url').eq('event_id', eventId);
    expect(data ?? []).toHaveLength(0);
  });

  test('an authenticated non-attendee reads zero rows', async () => {
    const client = await clientFor(strangerEmail);
    const { data } = await client.from('event_private_info').select('group_chat_url').eq('event_id', eventId);
    expect(data ?? []).toHaveLength(0);
  });

  test('a registered attendee reads the link — the control that proves the gate is not blind', async () => {
    const client = await clientFor(attendeeEmail);
    const { data } = await client.from('event_private_info').select('group_chat_url').eq('event_id', eventId);
    expect(data).toHaveLength(1);
    expect(data![0].group_chat_url).toBe(GROUP_CHAT_URL);
  });

  test('the host reads the link without an RSVP', async () => {
    const client = await clientFor(hostEmail);
    const { data } = await client.from('event_private_info').select('group_chat_url').eq('event_id', eventId);
    expect(data).toHaveLength(1);
  });

  test('a non-host cannot write private info for someone else’s event', async () => {
    const client = await clientFor(strangerEmail);
    const { error } = await client
      .from('event_private_info')
      .update({ group_chat_url: 'https://chat.whatsapp.com/hijacked' })
      .eq('event_id', eventId);
    // RLS makes the row invisible to the update; either an error or zero rows changed is correct.
    const { data } = await supabaseAdmin.from('event_private_info').select('group_chat_url').eq('event_id', eventId).single();
    expect(data?.group_chat_url).toBe(GROUP_CHAT_URL);
    void error;
  });

  test('an attendee who cancels their RSVP loses access again', async () => {
    const client = await clientFor(attendeeEmail);
    await supabaseAdmin.from('event_rsvps').delete().eq('event_id', eventId).eq('profile_id', attendeeId);
    const { data } = await client.from('event_private_info').select('group_chat_url').eq('event_id', eventId);
    expect(data ?? []).toHaveLength(0);
    // restore for the remaining tests
    await rsvpToEvent(eventId, attendeeId);
  });

  test('deleting the private row clears the public flag', async () => {
    await supabaseAdmin.from('event_private_info').delete().eq('event_id', eventId);
    const { data } = await supabaseAdmin.from('events').select('has_group_chat').eq('id', eventId).single();
    expect(data?.has_group_chat).toBe(false);
    // restore for any later run in this file
    await supabaseAdmin.from('event_private_info').insert({ event_id: eventId, group_chat_url: GROUP_CHAT_URL });
  });
});
