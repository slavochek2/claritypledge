/**
 * @file p1336-db-schema.spec.ts
 * @description P270 canary + RLS proof for P1336 (20261001120000_p1336_event_preparations.sql),
 * run live against the test DB with real user JWTs:
 *   - anon and another attendee read 0 event_preparations rows; the host reads their event's rows
 *   - the public aggregate returns counts/avatars only — no opt-out, score or volunteer data
 *   - places-left is floored at 1 (overbooking accepted)
 *   - opt-in chosen in prep seeds the room on entry; a room change writes back with a new timestamp
 *   - research consent is stored with its policy version
 *   - a host cannot read a volunteer's transcript; the research path (service role) can
 */
import { test, expect } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { supabaseAdmin } from '../helpers/supabase-admin';
import { createTestUser, deleteTestUser, TEST_PASSWORD, type TestUser } from '../helpers/test-user';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY!;

const anon = () =>
  createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { autoRefreshToken: false, persistSession: false } });

async function clientFor(u: TestUser): Promise<SupabaseClient> {
  const { data, error } = await supabaseAdmin.auth.signInWithPassword({ email: u.email, password: TEST_PASSWORD });
  expect(error).toBeNull();
  const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${data!.session!.access_token}` } },
    auth: { autoRefreshToken: false, persistSession: false },
  });
  await supabaseAdmin.auth.signOut();
  return client;
}

test.describe('P1336: event_preparations + per-event setup', () => {
  test.describe.configure({ mode: 'serial' });
  let host: TestUser;
  let alice: TestUser; // prepares, opts in
  let bob: TestUser; // another attendee, opts out
  let eventId: string;
  const roomIds: string[] = [];
  const sessionIds: string[] = [];

  test.beforeAll(async () => {
    host = await createTestUser({ name: 'P1336 Host' });
    alice = await createTestUser({ name: 'P1336 Alice' });
    bob = await createTestUser({ name: 'P1336 Bob' });
    const { data: ev, error } = await supabaseAdmin
      .from('events')
      .insert({
        slug: `p1336-it-${Date.now()}`,
        title: 'Clarity Night #99: Integration. Test',
        description: 'P1336 integration test event',
        datetime: new Date(Date.now() + 2 * 24 * 3600 * 1000).toISOString(),
        location: 'Test venue',
        host_id: host.user.id,
        preparation_enabled: true,
        research_places: 1,
      })
      .select('id')
      .single();
    expect(error).toBeNull();
    eventId = ev!.id;
    await supabaseAdmin.from('event_rsvps').insert([
      { event_id: eventId, profile_id: alice.user.id },
      { event_id: eventId, profile_id: bob.user.id },
    ]);
  });

  test.afterAll(async () => {
    if (roomIds.length) await supabaseAdmin.from('transcribe_rooms').delete().in('id', roomIds);
    if (sessionIds.length) await supabaseAdmin.from('clarity_sessions').delete().in('id', sessionIds);
    if (eventId) await supabaseAdmin.from('events').delete().eq('id', eventId);
    for (const u of [host, alice, bob]) if (u?.user?.id) await deleteTestUser(u.user.id);
  });

  test('schema: events columns have their defaults', async () => {
    const { data, error } = await supabaseAdmin
      .from('events').select('preparation_enabled, statement_tag, research_places').eq('id', eventId).single();
    expect(error).toBeNull();
    expect(data).toEqual({ preparation_enabled: true, statement_tag: null, research_places: 1 });
  });

  test('a registrant writes their own row; a non-registrant cannot', async () => {
    const a = await clientFor(alice);
    const { data, error } = await a
      .from('event_preparations')
      .upsert({ event_id: eventId, profile_id: alice.user.id, opted_in: true, principle_rating: 8, completed_at: new Date().toISOString() }, { onConflict: 'event_id,profile_id' })
      .select('opted_in, opted_in_at, rsvp_id')
      .single();
    expect(error).toBeNull();
    expect(data!.opted_in).toBe(true);
    expect(data!.opted_in_at).not.toBeNull();
    expect(data!.rsvp_id).not.toBeNull();

    const h = await clientFor(host); // the host has no RSVP row
    const { error: hostInsert } = await h.from('event_preparations').insert({ event_id: eventId, profile_id: host.user.id });
    expect(hostInsert, 'insert must require an RSVP').not.toBeNull();

    const b = await clientFor(bob);
    const { error: bobErr } = await b
      .from('event_preparations')
      .upsert({ event_id: eventId, profile_id: bob.user.id, opted_in: false }, { onConflict: 'event_id,profile_id' });
    expect(bobErr).toBeNull();
  });

  test('anon and another attendee read 0 rows; the host reads the event rows', async () => {
    const { data: anonRows } = await anon().from('event_preparations').select('profile_id').eq('event_id', eventId);
    expect(anonRows ?? []).toHaveLength(0);

    const b = await clientFor(bob);
    const { data: bobRows } = await b.from('event_preparations').select('profile_id').eq('event_id', eventId);
    expect((bobRows ?? []).map((r) => r.profile_id)).toEqual([bob.user.id]); // own row only

    const h = await clientFor(host);
    const { data: hostRows } = await h.from('event_preparations').select('profile_id').eq('event_id', eventId);
    expect((hostRows ?? []).map((r) => r.profile_id).sort()).toEqual([alice.user.id, bob.user.id].sort());

    const { data: hostView, error: hvErr } = await h.rpc('get_event_prep_host_view', { p_event_id: eventId });
    expect(hvErr).toBeNull();
    expect((hostView as unknown[]).length).toBe(2);
    const { error: notHost } = await b.rpc('get_event_prep_host_view', { p_event_id: eventId });
    expect(notHost, 'host view must refuse a non-host').not.toBeNull();
  });

  test('the public aggregate returns counts and opted-in/prepared avatars only', async () => {
    const { data, error } = await anon().rpc('get_event_prep_social_proof', { p_event_id: eventId });
    expect(error).toBeNull();
    const proof = data as Record<string, unknown> & { optedInPeople: { profileId: string }[] };
    expect(proof.optedInThis).toBe(1);
    expect(proof.preparedThis).toBe(1);
    expect(proof.optedInPeople.map((p) => p.profileId)).toEqual([alice.user.id]);
    const serialized = JSON.stringify(proof);
    expect(serialized).not.toContain(bob.user.id); // the opt-out is never shown
    expect(serialized).not.toMatch(/rating|research|mic|opted_in"|false/);
  });

  test('research consent is stored with its policy version; places-left floors at 1', async () => {
    const a = await clientFor(alice);
    const { data, error } = await a
      .from('event_preparations')
      .update({ research_state: 'confirmed', mic_setup: 'usbc', research_consented_at: new Date().toISOString(), research_policy_version: 'p1336-research-v1' })
      .eq('event_id', eventId).eq('profile_id', alice.user.id)
      .select('research_consented_at, research_policy_version').single();
    expect(error).toBeNull();
    expect(data!.research_policy_version).toBe('p1336-research-v1');

    const b = await clientFor(bob);
    await b.from('event_preparations').update({ research_state: 'confirmed', mic_setup: 'own', research_consented_at: new Date().toISOString(), research_policy_version: 'p1336-research-v1' })
      .eq('event_id', eventId).eq('profile_id', bob.user.id);
    const { data: left } = await b.rpc('get_event_research_places_left', { p_event_id: eventId });
    expect(left).toBe(1); // 1 place, 2 confirmed → still 1
  });

  test('prep opt-in seeds the room on entry; a room change writes back with a new timestamp', async () => {
    const a = await clientFor(alice);
    const { data: before } = await a.from('event_preparations').select('opted_in_at').eq('event_id', eventId).eq('profile_id', alice.user.id).single();
    const { data: joined, error } = await a.rpc('join_event_room', { p_event_id: eventId, p_display_name: 'P1336 Alice' });
    expect(error).toBeNull();
    const member = (joined as { id: string; opted_in: boolean; comprehension_rating: number }[])[0]!;
    expect(member.opted_in).toBe(true);
    expect(member.comprehension_rating).toBe(8);

    await new Promise((r) => setTimeout(r, 50));
    const { error: setErr } = await a.rpc('set_room_opt_in', { p_member_id: member.id, p_opted_in: false, p_comprehension: null });
    expect(setErr).toBeNull();
    const { data: after } = await a.from('event_preparations').select('opted_in, opted_in_at').eq('event_id', eventId).eq('profile_id', alice.user.id).single();
    expect(after!.opted_in).toBe(false);
    expect(new Date(after!.opted_in_at).getTime()).toBeGreaterThan(new Date(before!.opted_in_at).getTime());
  });

  test('a walk-in-style join without a prep row uses the room flow (no seeded answer)', async () => {
    const { data: carol } = await supabaseAdmin.from('event_room_members')
      .insert({ event_id: eventId, display_name: 'P1336 Walk-in' }).select('opted_in').single();
    expect(carol!.opted_in).toBeNull();
  });

  test('review fixes: seeding writes no room history; a prepared opt-out has a "prepared" face, never an "opted in" one', async () => {
    const { data: aliceMember } = await supabaseAdmin.from('event_room_members').select('id').eq('event_id', eventId).eq('profile_id', alice.user.id).single();
    const { data: hist } = await supabaseAdmin.from('event_room_answers').select('id, opted_in').eq('room_member_id', aliceMember!.id);
    // Only the room tap (set_room_opt_in → false) is room history; the seeded prep answer is not.
    expect((hist ?? []).map((h) => h.opted_in)).toEqual([false]);

    const b = await clientFor(bob);
    await b.from('event_preparations').update({ completed_at: new Date().toISOString() }).eq('event_id', eventId).eq('profile_id', bob.user.id);
    const { data } = await anon().rpc('get_event_prep_social_proof', { p_event_id: eventId });
    const proof = data as { preparedPeople: { profileId: string }[]; optedInPeople: { profileId: string }[] };
    // Founder 2026-10-01: every prepared person has a face (opt-outs are visible in the room anyway);
    // the opted-in faces still never include an opt-out.
    expect(proof.preparedPeople.map((x) => x.profileId)).toContain(bob.user.id);
    expect(proof.optedInPeople.map((x) => x.profileId)).not.toContain(bob.user.id);
  });

  test('review fixes: a client-supplied rsvp_id is ignored; a cancelled RSVP stops counting', async () => {
    const dave = await createTestUser({ name: 'P1336 Dave' });
    try {
      await supabaseAdmin.from('event_rsvps').insert({ event_id: eventId, profile_id: dave.user.id });
      const { data: aliceRsvp } = await supabaseAdmin.from('event_rsvps').select('id').eq('event_id', eventId).eq('profile_id', alice.user.id).single();
      const d = await clientFor(dave);
      const { data: row, error } = await d.from('event_preparations')
        .insert({ event_id: eventId, profile_id: dave.user.id, rsvp_id: aliceRsvp!.id, opted_in: true, completed_at: new Date().toISOString(), research_state: 'confirmed', mic_setup: 'own', research_consented_at: new Date().toISOString(), research_policy_version: 'p1336-research-v1' })
        .select('rsvp_id').single();
      expect(error).toBeNull();
      expect(row!.rsvp_id).not.toBe(aliceRsvp!.id);

      const before = (await anon().rpc('get_event_prep_social_proof', { p_event_id: eventId })).data as { optedInThis: number };
      await supabaseAdmin.from('event_rsvps').delete().eq('event_id', eventId).eq('profile_id', dave.user.id);
      const after = (await anon().rpc('get_event_prep_social_proof', { p_event_id: eventId })).data as { optedInThis: number };
      expect(after.optedInThis).toBe(before.optedInThis - 1);
    } finally {
      await deleteTestUser(dave.user.id);
    }
  });

  test('review fixes: after the room freezes, editing the prep row does not rewrite the roster', async () => {
    const { data: frozen } = await supabaseAdmin.from('events').insert({
      slug: `p1336-frozen-${Date.now()}`, title: 'Clarity Night frozen', description: 'P1336 frozen room test',
      datetime: new Date(Date.now() - 48 * 3600 * 1000).toISOString(), location: 'x', host_id: host.user.id, preparation_enabled: true,
    }).select('id').single();
    try {
      await supabaseAdmin.from('event_rsvps').insert({ event_id: frozen!.id, profile_id: alice.user.id });
      await supabaseAdmin.from('event_room_members').insert({ event_id: frozen!.id, profile_id: alice.user.id, display_name: 'P1336 Alice', opted_in: false });
      const a = await clientFor(alice);
      await a.from('event_preparations').upsert({ event_id: frozen!.id, profile_id: alice.user.id, opted_in: true }, { onConflict: 'event_id,profile_id' });
      const { data: m } = await supabaseAdmin.from('event_room_members').select('opted_in').eq('event_id', frozen!.id).eq('profile_id', alice.user.id).single();
      expect(m!.opted_in).toBe(false);
    } finally {
      await supabaseAdmin.from('events').delete().eq('id', frozen!.id);
    }
  });

  test('UAT: opt-ins given in past Clarity Night rooms (before prep existed) count in the series', async () => {
    const proofOf = async () =>
      (await anon().rpc('get_event_prep_social_proof', { p_event_id: eventId })).data as {
        optedInSeries: number; optedInPrevious: number; optedInThis: number; optedInPeople: { profileId: string }[];
      };
    const before = await proofOf();
    const carol = await createTestUser({ name: 'P1336 Carol' });
    const past = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();
    const { data: evs } = await supabaseAdmin.from('events').insert([
      // The series' first night ran the room only: no preparation.
      { slug: `p1336-past-cn-${Date.now()}`, title: 'Clarity Night #98: Past. Test', description: 'P1336 past room', datetime: past, location: 'x', host_id: host.user.id, preparation_enabled: false },
      // Another series by the same host: never counted as "Clarity Nights".
      { slug: `p1336-past-hike-${Date.now()}`, title: 'Sunday hike', description: 'P1336 other series', datetime: past, location: 'x', host_id: host.user.id, preparation_enabled: false },
    ]).select('id, title');
    const pastCn = evs!.find((e) => e.title.startsWith('Clarity Night'))!.id;
    const hike = evs!.find((e) => e.title === 'Sunday hike')!.id;
    try {
      // Carol opts in for this event in prep AND at the past night's room: one person.
      await supabaseAdmin.from('event_rsvps').insert({ event_id: eventId, profile_id: carol.user.id });
      await supabaseAdmin.from('event_preparations').insert({ event_id: eventId, profile_id: carol.user.id, opted_in: true });
      await supabaseAdmin.from('event_room_members').insert([
        { event_id: pastCn, profile_id: carol.user.id, display_name: 'P1336 Carol', opted_in: true },
        { event_id: pastCn, profile_id: null, display_name: 'P1336 Walk-in', opted_in: true },
        { event_id: pastCn, profile_id: host.user.id, display_name: 'P1336 Host', opted_in: true },
        { event_id: pastCn, profile_id: bob.user.id, display_name: 'P1336 Bob', opted_in: false },
        { event_id: hike, profile_id: null, display_name: 'P1336 Hiker', opted_in: true },
      ]);
      const after = await proofOf();
      // Carol (once) + the walk-in; the host, the opt-out and the other series never count.
      expect(after.optedInSeries - before.optedInSeries).toBe(2);
      expect(after.optedInThis - before.optedInThis).toBe(1);
      // "previous Clarity Nights": earlier events only — Carol and the walk-in, both at the past night.
      expect(after.optedInPrevious - before.optedInPrevious).toBe(2);
      expect(before.optedInPrevious).toBe(0); // no earlier night before this test's past event
      const ids = after.optedInPeople.map((p) => p.profileId);
      expect(ids).toContain(carol.user.id);
      expect(ids).not.toContain(host.user.id);
      expect(ids).not.toContain(bob.user.id);
    } finally {
      await supabaseAdmin.from('events').delete().in('id', [pastCn, hike]);
      await supabaseAdmin.from('event_preparations').delete().eq('event_id', eventId).eq('profile_id', carol.user.id);
      await supabaseAdmin.from('event_rsvps').delete().eq('event_id', eventId).eq('profile_id', carol.user.id);
      await deleteTestUser(carol.user.id);
    }
  });

  test('UAT: the room roster can see who prepared — completed prep, registered, in the room; callers must be registered or the host', async () => {
    // Alice prepared and joined the room (earlier tests); Bob completed prep but never joined.
    const erin = await createTestUser({ name: 'P1336 Erin' }); // registered, in the room, prep NOT complete
    const finn = await createTestUser({ name: 'P1336 Finn' }); // completed prep, in the room, RSVP cancelled
    const stranger = await createTestUser({ name: 'P1336 Stranger' }); // signed in, not registered
    try {
      await supabaseAdmin.from('event_rsvps').insert([
        { event_id: eventId, profile_id: erin.user.id },
        { event_id: eventId, profile_id: finn.user.id },
      ]);
      await supabaseAdmin.from('event_preparations').insert([
        { event_id: eventId, profile_id: erin.user.id, opted_in: true },
        { event_id: eventId, profile_id: finn.user.id, opted_in: true, completed_at: new Date().toISOString() },
      ]);
      await supabaseAdmin.from('event_room_members').insert([
        { event_id: eventId, profile_id: erin.user.id, display_name: 'P1336 Erin' },
        { event_id: eventId, profile_id: finn.user.id, display_name: 'P1336 Finn' },
        { event_id: eventId, profile_id: null, display_name: 'P1336 Walk-in 2' },
      ]);
      await supabaseAdmin.from('event_rsvps').delete().eq('event_id', eventId).eq('profile_id', finn.user.id);

      const b = await clientFor(bob);
      const { data, error } = await b.rpc('get_event_room_prepared', { p_event_id: eventId });
      expect(error).toBeNull();
      const ids = data as string[];
      expect(ids).toContain(alice.user.id);
      expect(ids).not.toContain(bob.user.id); // not in the room
      expect(ids).not.toContain(erin.user.id); // preparation not complete
      expect(ids).not.toContain(finn.user.id); // no longer registered
      expect(ids.every((id) => id !== null)).toBe(true); // walk-ins never appear

      const h = await clientFor(host);
      const { data: hostIds } = await h.rpc('get_event_room_prepared', { p_event_id: eventId });
      expect(hostIds as string[]).toContain(alice.user.id);

      const st = await clientFor(stranger);
      const { data: strangerIds, error: strangerErr } = await st.rpc('get_event_room_prepared', { p_event_id: eventId });
      expect(strangerErr).toBeNull();
      expect(strangerIds as string[]).toEqual([]); // not registered, not the host: nothing

      const { error: anonErr } = await anon().rpc('get_event_room_prepared', { p_event_id: eventId });
      expect(anonErr, 'anon must not call it').not.toBeNull();
    } finally {
      await supabaseAdmin.from('event_room_members').delete().eq('event_id', eventId).in('display_name', ['P1336 Erin', 'P1336 Finn', 'P1336 Walk-in 2']);
      for (const u of [erin, finn]) {
        await supabaseAdmin.from('event_preparations').delete().eq('event_id', eventId).eq('profile_id', u.user.id);
        await supabaseAdmin.from('event_rsvps').delete().eq('event_id', eventId).eq('profile_id', u.user.id);
      }
      for (const u of [erin, finn, stranger]) await deleteTestUser(u.user.id);
    }
  });

  test('review fixes: anon cannot call places-left', async () => {
    const { error } = await anon().rpc('get_event_research_places_left', { p_event_id: eventId });
    expect(error).not.toBeNull();
  });

  test("a host cannot read a volunteer's transcript; the research path (service role) can", async () => {
    const code = `P1336T${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
    const { data: room } = await supabaseAdmin.from('transcribe_rooms').insert({ code, event_id: eventId, ended_at: new Date().toISOString() }).select('id').single();
    roomIds.push(room!.id);
    const { data: session } = await supabaseAdmin.from('clarity_sessions')
      .insert({ code: `${code}-S`, creator_name: 'P1336 Alice', creator_profile_id: alice.user.id }).select('id').single();
    sessionIds.push(session!.id);
    await supabaseAdmin.from('transcribe_room_members').insert({
      room_id: room!.id, profile_id: alice.user.id, display_name: 'P1336 Alice', session_id: session!.id, consent_given_at: new Date().toISOString(),
    });
    const { error: tErr } = await supabaseAdmin.from('transcribe_room_transcripts').insert({ room_id: room!.id, segments: [{ text: 'hello' }] });
    expect(tErr).toBeNull();

    const h = await clientFor(host);
    const { data: hostRead } = await h.from('transcribe_room_transcripts').select('room_id').eq('room_id', room!.id);
    expect(hostRead ?? []).toHaveLength(0);

    const a = await clientFor(alice);
    const { data: memberRead } = await a.from('transcribe_room_transcripts').select('room_id').eq('room_id', room!.id);
    expect(memberRead ?? []).toHaveLength(1); // control: the volunteer reads their own

    const { data: researchRead } = await supabaseAdmin.from('transcribe_room_transcripts').select('room_id').eq('room_id', room!.id);
    expect(researchRead ?? []).toHaveLength(1);
  });
});
