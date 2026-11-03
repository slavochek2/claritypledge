/**
 * @file 20261103060000_p1603_event_id_is_worth_nothing.spec.ts
 * @description P270 canary for 20261103060000_p1603_event_id_is_worth_nothing.sql, against the TEST database.
 *
 * Invariant: for a hidden event, knowing its id is worth nothing. Every "refused" below is made by a signed-in stranger
 * who knows ONLY the id (or by anon), and each has a control through the same client and call that DOES work: a public
 * event, or the host / a registered person on the hidden one. Nothing here sends mail: the refusal of the rsvp email for
 * a caller without an RSVP is tested at unit level (supabase/functions/_shared/p1603-rsvp-guard.test.ts).
 *
 * The last two tests DERIVE the open surface from TEST's catalog (tables with an event id column and an open SELECT
 * policy; anon-executable definer functions that take an event id or read events) and fail when something new appears
 * that this file has not classified, so a table or function added later cannot slip past unread.
 */
import { test, expect } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { supabaseAdmin } from '../helpers/supabase-admin';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { createTestUser, deleteTestUser, generateTestEmail, TEST_PASSWORD, type TestUser } from '../helpers/test-user';
import { createTestEvent, deleteTestEvent, type TestEvent } from '../helpers/test-event';
import { seedRoomMember } from '../helpers/test-event-room';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY!;
const DAY = 24 * 3600 * 1000;
const UNKNOWN_ID = '00000000-0000-4000-8000-000000000000';

const anonClient = () =>
  createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { autoRefreshToken: false, persistSession: false } });

/** Read-only catalog query on the active TEST server; null when the helper cannot run (never read as "no rows"). */
function catalog(sql: string): Array<Record<string, unknown>> | null {
  try {
    const out = execFileSync('python3', ['scripts/supabase-readonly-sql.py', '--env', 'test', sql], { encoding: 'utf8', timeout: 90_000 });
    return JSON.parse(out);
  } catch {
    return null;
  }
}

test.describe('P1603: an event id is worth nothing for a hidden event', () => {
  test.describe.configure({ mode: 'serial' });

  let host: TestUser;
  let stranger: TestUser;
  let member: TestUser;
  let earlier1: TestUser;
  let earlier2: TestUser;
  let hidden: TestEvent;
  let visible: TestEvent;
  let hiddenEarlier: TestEvent;
  let visibleEarlier: TestEvent;
  let hostClient: SupabaseClient;
  let strangerClient: SupabaseClient;
  let memberClient: SupabaseClient;

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

  test.beforeAll(async () => {
    test.setTimeout(180_000);
    host = await createTestUser({ email: generateTestEmail(), name: 'P1603b Host' });
    stranger = await createTestUser({ email: generateTestEmail(), name: 'P1603b Stranger' });
    member = await createTestUser({ email: generateTestEmail(), name: 'P1603b Member' });
    earlier1 = await createTestUser({ email: generateTestEmail(), name: 'P1603b Earlier One' });
    earlier2 = await createTestUser({ email: generateTestEmail(), name: 'P1603b Earlier Two' });
    const soon = new Date(Date.now() + 3 * DAY);
    hidden = await createTestEvent(host.user.id, soon, { title: 'P1603b hidden', isHidden: true });
    visible = await createTestEvent(host.user.id, soon, { title: 'P1603b public' });
    hiddenEarlier = await createTestEvent(host.user.id, new Date(Date.now() - 5 * DAY), { title: 'P1603b hidden earlier', isHidden: true });
    visibleEarlier = await createTestEvent(host.user.id, new Date(Date.now() - 4 * DAY), { title: 'P1603b public earlier' });
    for (const [e, u] of [[hidden, member], [visible, member], [hiddenEarlier, earlier1], [visibleEarlier, earlier2]] as const) {
      const r = await supabaseAdmin.from('event_rsvps').insert({ event_id: e.id, profile_id: u.user.id });
      expect(r.error, r.error?.message).toBeNull();
    }
    hostClient = await clientFor(host);
    strangerClient = await clientFor(stranger);
    memberClient = await clientFor(member);
  });

  test.afterAll(async () => {
    for (const e of [hidden, visible, hiddenEarlier, visibleEarlier]) if (e) await deleteTestEvent(e.id);
    for (const u of [host, stranger, member, earlier1, earlier2]) if (u) await deleteTestUser(u.user.id);
  });

  test('banner buckets: anon cannot list folders, public image URLs still return 200 (known-good control: the service role lists them)', async () => {
    for (const bucket of ['banners', 'event-banners']) {
      const top = await supabaseAdmin.storage.from(bucket).list('', { limit: 100 });
      expect(top.error).toBeNull();
      let folder: string | undefined;
      let file: string | undefined;
      for (const f of top.data!.filter(o => o.id === null)) {
        const inside = await supabaseAdmin.storage.from(bucket).list(f.name, { limit: 20 });
        const hit = inside.data?.find(o => o.id !== null)?.name;
        if (hit) { folder = f.name; file = hit; break; }
      }
      expect(folder && file, `known-good control: ${bucket} has a folder with a file the service role can list`).toBeTruthy();

      const anonList = await anonClient().storage.from(bucket).list(folder!, { limit: 5 });
      expect(anonList.data ?? []).toEqual([]);
      const anonRoot = await anonClient().storage.from(bucket).list('', { limit: 5 });
      expect(anonRoot.data ?? []).toEqual([]);

      const url = anonClient().storage.from(bucket).getPublicUrl(`${folder}/${file}`).data.publicUrl;
      const res = await fetch(url);
      expect(res.status, `public object URL in ${bucket}`).toBe(200);
    }
  });

  test('join_event_room: a stranger who knows only the id is refused like an unknown id; the host and a registered person get in; a public event is unchanged', async () => {
    const unknown = await strangerClient.rpc('join_event_room', { p_event_id: UNKNOWN_ID, p_display_name: 'x' });
    expect(unknown.error).not.toBeNull();
    const refused = await strangerClient.rpc('join_event_room', { p_event_id: hidden.id, p_display_name: 'x' });
    expect(refused.error?.message).toBe(unknown.error?.message);
    expect(refused.error?.code).toBe(unknown.error?.code);
    const rows = await supabaseAdmin.from('event_room_members').select('id').eq('event_id', hidden.id).eq('profile_id', stranger.user.id);
    expect(rows.data).toEqual([]);

    const control = await strangerClient.rpc('join_event_room', { p_event_id: visible.id, p_display_name: 'Stranger' });
    expect(control.error, 'control: a public event is joinable').toBeNull();
    expect((await memberClient.rpc('join_event_room', { p_event_id: hidden.id, p_display_name: 'Member' })).error).toBeNull();
    expect((await hostClient.rpc('join_event_room', { p_event_id: hidden.id, p_display_name: 'Host' })).error).toBeNull();
  });

  test('can_see_event_rounds: a leftover room row does not open a hidden event (a removed person), registered people and the host still see; public unchanged', async () => {
    const leftover = await seedRoomMember(hidden.id, { profileId: stranger.user.id, displayName: 'Left over' });
    expect(leftover.profile_id).toBe(stranger.user.id);
    const publicRow = await supabaseAdmin.from('event_room_members').select('id').eq('event_id', visible.id).eq('profile_id', stranger.user.id);
    expect(publicRow.data).toHaveLength(1); // seeded by the join above: the public control has a room row too
    const call = (c: SupabaseClient, id: string) => c.rpc('can_see_event_rounds', { p_event_id: id });
    expect((await call(strangerClient, hidden.id)).data, 'room row without an RSVP: no access to a hidden event').toBe(false);
    expect((await call(strangerClient, visible.id)).data, 'control: the same row on a public event').toBe(true);
    expect((await call(memberClient, hidden.id)).data).toBe(true);
    expect((await call(hostClient, hidden.id)).data).toBe(true);
  });

  test('a practice room cannot be moved onto a hidden event; a hidden event writes no public review', async () => {
    const room = await strangerClient.from('event_practice_rooms').insert({ event_id: visible.id, creator_id: stranger.user.id }).select('id').single();
    expect(room.error, 'control: a room on a public event').toBeNull();
    const moved = await strangerClient.from('event_practice_rooms').update({ event_id: hidden.id }).eq('id', room.data!.id).select('id');
    expect(moved.error, 'moving it onto the hidden event').not.toBeNull();
    await supabaseAdmin.from('event_practice_rooms').delete().eq('id', room.data!.id); // one waiting room per person
    const row = { series_slug: 'p1603-test', quote: 'A quote', author_name: 'Someone', status: 'pending' };
    const fromHidden = await supabaseAdmin.from('series_reviews').insert({ ...row, source_event_id: hidden.id }).select('id');
    expect(fromHidden.error).toBeNull();
    expect(fromHidden.data, 'no row from a hidden event').toEqual([]);
    const fromPublic = await supabaseAdmin.from('series_reviews').insert({ ...row, source_event_id: visible.id }).select('id');
    expect(fromPublic.error, 'control: a public event writes as before').toBeNull();
    expect(fromPublic.data).toHaveLength(1);
    await supabaseAdmin.from('series_reviews').delete().eq('id', fromPublic.data![0].id);
  });

  test('readiness: a leftover room row returns nothing on a hidden event; the public control and the host still read', async () => {
    const memberRow = await supabaseAdmin.from('event_room_members').update({ readiness_value: 7 }).eq('event_id', hidden.id).eq('profile_id', member.user.id);
    expect(memberRow.error).toBeNull();
    await seedRoomMember(visible.id, { profileId: member.user.id, displayName: 'Member' });
    const pub = await supabaseAdmin.from('event_room_members').update({ readiness_value: 7 }).eq('event_id', visible.id).eq('profile_id', member.user.id);
    expect(pub.error).toBeNull();
    const call = (c: SupabaseClient, id: string) => c.rpc('get_room_readiness_distribution', { p_event_id: id });
    const refused = await call(strangerClient, hidden.id);
    expect(refused.error).toBeNull();
    expect(refused.data, 'a leftover room row on a hidden event').toEqual([]);
    expect((await call(strangerClient, visible.id)).data, 'control: the same row on a public event').toEqual([7]);
    expect((await call(hostClient, hidden.id)).data).toEqual([7]);
  });

  test('event_practice_rooms and event_sub_rooms inserts: refused for a stranger on a hidden event, allowed on a public one and for the registered', async () => {
    const insRoom = (c: SupabaseClient, who: TestUser, eventId: string) =>
      c.from('event_practice_rooms').insert({ event_id: eventId, creator_id: who.user.id }).select('id');
    const refused = await insRoom(strangerClient, stranger, hidden.id);
    expect(refused.error).not.toBeNull();
    const control = await insRoom(strangerClient, stranger, visible.id);
    expect(control.error, 'control: public event').toBeNull();
    expect((await insRoom(memberClient, member, hidden.id)).error).toBeNull();
    expect((await insRoom(hostClient, host, hidden.id)).error).toBeNull();

    const insSub = (c: SupabaseClient, who: TestUser, eventId: string) =>
      c.from('event_sub_rooms').insert({ event_id: eventId, initiator_id: who.user.id, target_id: host.user.id }).select('id');
    expect((await insSub(strangerClient, stranger, hidden.id)).error).not.toBeNull();
    expect((await insSub(strangerClient, stranger, visible.id)).error, 'control: public event').toBeNull();
    expect((await insSub(memberClient, member, hidden.id)).error).toBeNull();
    // Reads: a sub-room row is visible only to its two people (policy), hidden or not.
    const seen = await anonClient().from('event_sub_rooms').select('id').in('event_id', [hidden.id, visible.id]);
    expect(seen.data ?? []).toEqual([]);
  });

  test('research places, community slug, series people: an unauthorised hidden event answers like an unknown id; the series never counts a hidden event', async () => {
    // Control that the public event answers (a real number) and the hidden one answers the registered person.
    const places = (c: SupabaseClient, id: string) => c.rpc('get_event_research_places_left', { p_event_id: id });
    const unknownPlaces = await places(strangerClient, UNKNOWN_ID);
    expect(unknownPlaces.data).toBeNull();
    expect((await places(strangerClient, hidden.id)).data).toEqual(unknownPlaces.data);
    expect(typeof (await places(strangerClient, visible.id)).data, 'control: public event').toBe('number');
    expect(typeof (await places(memberClient, hidden.id)).data, 'registered').toBe('number');
    expect(typeof (await places(hostClient, hidden.id)).data, 'host').toBe('number');

    const slug = (c: SupabaseClient, id: string) => c.rpc('get_event_community_slug', { p_event_id: id });
    const org = await supabaseAdmin.from('organization').select('id').eq('slug', 'cm').maybeSingle();
    for (const e of [hidden, visible]) await supabaseAdmin.from('events').update({ location: 'Chiang Mai test venue' }).eq('id', e.id);
    expect((await slug(strangerClient, hidden.id)).data).toBeNull();
    expect((await slug(strangerClient, UNKNOWN_ID)).data).toBeNull();
    if (org.data) {
      expect((await slug(strangerClient, visible.id)).data, 'control: public event in Chiang Mai').toBe('cm');
      expect((await slug(memberClient, hidden.id)).data, 'registered').toBe('cm');
    }

    const people = (c: SupabaseClient, id: string) => c.rpc('get_event_series_people', { p_event_id: id });
    expect((await people(strangerClient, UNKNOWN_ID)).data).toBe(0);
    expect((await people(strangerClient, hidden.id)).data, 'unauthorised hidden event: like an unknown id').toBe(0);
    // The public event's series: the public earlier event (1 person) counts, the hidden earlier event (1 person) does not.
    expect((await people(strangerClient, visible.id)).data).toBe(1);
    expect((await people(memberClient, hidden.id)).data, 'registered on the hidden event: still never the hidden earlier one').toBe(1);
  });

  test('social proof: NULL for an unauthorised hidden event, exactly the answer for an unknown id; the host and the registered get the object', async () => {
    const call = (c: SupabaseClient, id: string) => c.rpc('get_event_prep_social_proof', { p_event_id: id });
    const unknown = await call(anonClient(), UNKNOWN_ID);
    expect(unknown.data).toBeNull();
    expect((await call(anonClient(), hidden.id)).data).toEqual(unknown.data);
    expect((await call(strangerClient, hidden.id)).data).toEqual(unknown.data);
    expect((await call(anonClient(), visible.id)).data, 'control: public event').not.toBeNull();
    expect((await call(memberClient, hidden.id)).data).not.toBeNull();
    expect((await call(hostClient, hidden.id)).data).not.toBeNull();
  });

  // ── Derived surface ────────────────────────────────────────────────────────────────────────────────────────────────

  // Every table with an event id column and a SELECT-capable policy for anon/authenticated/public, and what it is.
  // 'gated': the policy goes through viewer_sees_event / can_see_event_rounds (a hidden event's rows need host or RSVP).
  // 'own': only the person's own rows, or the host's event. 'accepted': open by decision, written in the spec.
  const TABLES: Record<string, { verdict: 'gated' | 'own' | 'accepted'; why: string }> = {
    event_rsvps: { verdict: 'gated', why: 'viewer_sees_event' },
    event_room_members: { verdict: 'gated', why: 'viewer_sees_event' },
    event_practice_rooms: { verdict: 'gated', why: 'viewer_sees_event' },
    event_rounds: { verdict: 'gated', why: 'can_see_event_rounds (host, or room member who is also registered)' },
    event_round_seats: { verdict: 'gated', why: 'through event_rounds / can_see_event_rounds' },
    event_round_tables: { verdict: 'gated', why: 'through event_rounds / can_see_event_rounds' },
    event_sub_rooms: { verdict: 'own', why: 'initiator or target only' },
    event_arrivals: { verdict: 'own', why: 'host of the event, or own row' },
    event_preparations: { verdict: 'own', why: 'host of the event, or own row' },
    event_round_presence: { verdict: 'own', why: 'host only' },
    event_private_info: { verdict: 'own', why: 'host or a registered attendee (RSVP / host test in the policy)' },
    email_send_log: { verdict: 'own', why: 'own rows' },
    chat_conversations: { verdict: 'own', why: 'members of the conversation' },
    transcribe_rooms: { verdict: 'own', why: 'members of the room' },
    series_reviews: { verdict: 'accepted', why: 'approved reviews are public; a hidden event writes none (trigger). Was: source_event_id needs a service-role series slug (spec: Known Limitations)' },
  };

  test('derived: every table with an event id and an open SELECT policy is classified here (known member asserted)', async () => {
    const rows = catalog(`
      SELECT DISTINCT p.tablename t, p.qual q
        FROM pg_policies p
       WHERE p.schemaname='public' AND p.cmd IN ('SELECT','ALL')
         AND p.roles::text ~ 'public|anon|authenticated'
         AND (p.tablename IN (SELECT table_name FROM information_schema.columns WHERE table_schema='public' AND column_name IN ('event_id','source_event_id'))
              OR p.qual ~* 'event_rounds|can_see_event_rounds')`);
    test.skip(rows === null, 'catalog helper unavailable (no read-only token): the derived check cannot run');
    const found = new Map<string, string>();
    for (const r of rows!) found.set(String(r.t), `${found.get(String(r.t)) ?? ''} ${String(r.q ?? '')}`);
    expect([...found.keys()], 'known member: event_rsvps must be derived, or the probe is blind').toContain('event_rsvps');
    const unclassified = [...found.keys()].filter(t => !(t in TABLES));
    expect(unclassified, `new table(s) with an open SELECT policy: classify them in this file after reading the policy`).toEqual([]);
    for (const [t, { verdict }] of Object.entries(TABLES)) {
      if (verdict !== 'gated' || !found.has(t)) continue;
      expect(found.get(t), `${t} must stay gated`).toMatch(/viewer_sees_event|can_see_event_rounds|event_rounds/);
    }
  });

  // Anon-executable SECURITY DEFINER functions that take an event id or read the event tables.
  const ANON_FUNCTIONS: Record<string, string> = {
    get_event_by_slug: 'exact slug is the proof; hidden returned by design',
    get_event_prep_social_proof: 'NULL for an unauthorised hidden event (this migration)',
    get_practice_room_codes: 'returns nothing unless signed in and host or registered (P1314)',
    get_canvas: 'keyed by canvas owner and name, not by an event id',
    claim_joiner_seat: 'keyed by a session code and the seat secret, not by an event id',
  };

  test('derived: every anon-executable definer function that takes an event id or reads events is classified here (known member asserted)', async () => {
    const rows = catalog(`
      SELECT DISTINCT p.proname n FROM pg_proc p
       WHERE p.pronamespace='public'::regnamespace AND p.prosecdef AND p.prorettype<>'trigger'::regtype
         AND has_function_privilege('anon', p.oid, 'EXECUTE')
         AND (pg_get_function_arguments(p.oid) ~* 'event'
              OR p.prosrc ~* '[[:<:]]events[[:>:]]|event_rsvps|event_room_members|event_practice_rooms|event_rounds')`);
    test.skip(rows === null, 'catalog helper unavailable (no read-only token): the derived check cannot run');
    const names = rows!.map(r => String(r.n));
    expect(names, 'known member: get_event_by_slug must be derived, or the probe is blind').toContain('get_event_by_slug');
    expect(names.filter(n => !(n in ANON_FUNCTIONS)), 'new anon-executable function touching events: classify it here after reading it').toEqual([]);
  });
});
