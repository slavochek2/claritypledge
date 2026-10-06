/**
 * @file p1429-host-view-room-answer.test.ts
 * @description P1429 A2: someone who answered the principle only in the room (no preparation row)
 * reaches the host's event-page view with that answer and its N/10. The room→prep trigger only
 * updates existing prep rows, and must not start creating them (that would mark people
 * "prepared" who never were), so the host view reads the room answer itself.
 *
 *   npm run test:integration -- p1429
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { supabaseAdmin } from '../../../e2e/helpers/supabase-admin';
import { createTestUser, deleteTestUser, TEST_PASSWORD, type TestUser } from '../../../e2e/helpers/test-user';

const URL = process.env.VITE_SUPABASE_URL!;
const ANON = process.env.VITE_SUPABASE_ANON_KEY!;

async function signedIn(user: TestUser): Promise<SupabaseClient> {
  const c = createClient(URL, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error } = await c.auth.signInWithPassword({ email: user.email, password: TEST_PASSWORD });
  if (error) throw error;
  return c;
}

type HostRow = { profile_id: string; opted_in: boolean | null; room_opted_in: boolean | null; room_rating: number | null; completed_at: string | null };

describe('P1429 A2: the host view carries the room answer', () => {
  let host: TestUser;
  let roomOnly: TestUser; // answered in the room, never prepared
  let prepOnly: TestUser; // prepared, never entered the room
  let eventId: string;

  beforeAll(async () => {
    host = await createTestUser({ name: 'P1429 Host' });
    roomOnly = await createTestUser({ name: 'P1429 Room Only' });
    prepOnly = await createTestUser({ name: 'P1429 Prep Only' });
    const { data: ev, error } = await supabaseAdmin
      .from('events')
      .insert({
        slug: `p1429-it-${Date.now()}`,
        title: 'Clarity Night #99: P1429. Test',
        description: 'P1429 integration test event',
        datetime: new Date(Date.now() + 2 * 24 * 3600 * 1000).toISOString(),
        location: 'Test venue',
        host_id: host.user.id,
        preparation_enabled: true,
      })
      .select('id')
      .single();
    if (error) throw error;
    eventId = ev!.id;
    await supabaseAdmin.from('event_rsvps').insert([
      { event_id: eventId, profile_id: roomOnly.user.id },
      { event_id: eventId, profile_id: prepOnly.user.id },
    ]);
    await supabaseAdmin.from('event_preparations').insert({ event_id: eventId, profile_id: prepOnly.user.id, opted_in: false, principle_rating: 4 });
    const { error: mErr } = await supabaseAdmin
      .from('event_room_members')
      .insert({ event_id: eventId, profile_id: roomOnly.user.id, display_name: 'P1429 Room Only', opted_in: true, comprehension_rating: 7 });
    if (mErr) throw mErr;
  });

  afterAll(async () => {
    if (eventId) await supabaseAdmin.from('events').delete().eq('id', eventId);
    for (const u of [host, roomOnly, prepOnly]) if (u?.user?.id) await deleteTestUser(u.user.id);
  });

  it('a room-only answer comes back with its rating; it does not create a preparation', async () => {
    const h = await signedIn(host);
    const { data, error } = await h.rpc('get_event_prep_host_view', { p_event_id: eventId });
    expect(error).toBeNull();
    const rows = data as HostRow[];
    const room = rows.find((r) => r.profile_id === roomOnly.user.id)!;
    expect([room.room_opted_in, room.room_rating]).toEqual([true, 7]);
    expect(room.opted_in).toBeNull(); // the prep columns stay the preparation's own
    expect(room.completed_at).toBeNull();
    const prep = rows.find((r) => r.profile_id === prepOnly.user.id)!;
    expect([prep.opted_in, prep.room_opted_in, prep.room_rating]).toEqual([false, null, null]);

    const { count } = await supabaseAdmin
      .from('event_preparations')
      .select('*', { count: 'exact', head: true })
      .eq('event_id', eventId)
      .eq('profile_id', roomOnly.user.id);
    expect(count).toBe(0);
  });

  it('still refuses anyone but the host', async () => {
    const a = await signedIn(roomOnly);
    const { error } = await a.rpc('get_event_prep_host_view', { p_event_id: eventId });
    expect(error?.message).toMatch(/only the host/);
  });
});
