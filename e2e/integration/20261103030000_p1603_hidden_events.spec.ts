/**
 * @file 20261103030000_p1603_hidden_events.spec.ts
 * @description P270 canary for 20261103030000_p1603_hidden_events.sql — runs against the TEST database.
 *
 * Invariant under test: hidden means the DATABASE refuses it, not that a screen filters it. Every read below is made
 * with the public anon key or a signed-in user's JWT (never the service role), and each "does not see it" claim has a
 * control that DOES see a row through the identical client and query, so a client that sees nothing at all (blind
 * probe) cannot pass for a policy that works:
 *   - control: a PUBLIC event is returned to anon by the same direct read that must not return the hidden one;
 *   - known-bad control: the service role reads the hidden row (it exists), proving "absent for anon" is the policy.
 *
 * P1603 design change (spec review): an event id must not become access. A stranger who knows only the id cannot insert an
 * RSVP for a hidden event, cannot read the event, cannot list its RSVPs, practice rooms or room members; the only door is
 * rsvp_to_event_by_slug(slug). Migrations: 20261103030000 (column, first policy, get_event_by_slug) and
 * 20261103040000 (private helpers, RSVP/room policies, rsvp_to_event_by_slug).
 *
 * Covered: anon direct read; get_event_by_slug (exact slug, wildcard / partial / empty / null -> nothing, no id lookup);
 * a signed-in stranger (list excludes it, RPC returns it); after an RSVP (the stranger reads it directly); the host;
 * the RSVP insert path for a link holder (policy + triggers); the host-embed shape the event page selects; the default.
 */
import { test, expect } from '@playwright/test';
import { supabaseAdmin } from '../helpers/supabase-admin';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { createTestUser, deleteTestUser, generateTestEmail, TEST_PASSWORD, type TestUser } from '../helpers/test-user';
import { createTestEvent, deleteTestEvent, type TestEvent } from '../helpers/test-event';
import { seedRoomMember } from '../helpers/test-event-room';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY!;

const HOST_EMBED = `
  *,
  host:profiles!events_host_id_fkey (id, full_name:name, slug, headline:role, avatar_color, avatar_url, has_pledged, ears_count)
`;

const anonClient = () =>
  createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { autoRefreshToken: false, persistSession: false } });

test.describe('P1603: hidden events — the database refuses a stranger, the exact link opens it', () => {
  let host: TestUser;
  let stranger: TestUser;
  let hidden: TestEvent;
  let visible: TestEvent;
  let strangerClient: SupabaseClient;
  let hostClient: SupabaseClient;

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

  // Later tests depend on the RSVP made by an earlier one, so they run in order in one worker.
  test.describe.configure({ mode: 'serial' });

  test.beforeAll(async () => {
    test.setTimeout(120_000); // two users + two events on a shared TEST server
    host = await createTestUser({ email: generateTestEmail(), name: 'P1603 Host' });
    stranger = await createTestUser({ email: generateTestEmail(), name: 'P1603 Stranger' });
    const soon = new Date(Date.now() + 3 * 24 * 3600 * 1000);
    hidden = await createTestEvent(host.user.id, soon, { title: 'P1603 hidden event', isHidden: true });
    visible = await createTestEvent(host.user.id, soon, { title: 'P1603 public event' });
    strangerClient = await clientFor(stranger);
    hostClient = await clientFor(host);
  });

  test.afterAll(async () => {
    for (const e of [hidden, visible]) if (e) await deleteTestEvent(e.id);
    for (const u of [host, stranger]) if (u) await deleteTestUser(u.user.id);
  });

  test('the column defaults to false: an event created without it is public', async () => {
    const { data, error } = await supabaseAdmin.from('events').select('is_hidden').eq('id', visible.id).single();
    expect(error).toBeNull();
    expect(data?.is_hidden).toBe(false);
  });

  test('known-bad control: the hidden row exists (service role reads it)', async () => {
    const { data, error } = await supabaseAdmin.from('events').select('id, is_hidden').eq('id', hidden.id).single();
    expect(error).toBeNull();
    expect(data?.is_hidden).toBe(true);
  });

  test('anon: a direct read returns the public event (control) and NOT the hidden one', async () => {
    const anon = anonClient();
    const pub = await anon.from('events').select('id').eq('slug', visible.slug);
    expect(pub.error).toBeNull();
    expect(pub.data).toHaveLength(1);

    const hid = await anon.from('events').select('id').eq('slug', hidden.slug);
    expect(hid.error).toBeNull();
    expect(hid.data).toEqual([]);
  });

  test('anon: a read by id, a wildcard read and a full-table list do not return the hidden event', async () => {
    const anon = anonClient();
    const byId = await anon.from('events').select('id').eq('id', hidden.id);
    expect(byId.data).toEqual([]);
    const like = await anon.from('events').select('id').ilike('slug', 'test-event-%');
    expect(like.error).toBeNull();
    expect(like.data!.some(r => r.id === hidden.id)).toBe(false);
    expect(like.data!.some(r => r.id === visible.id)).toBe(true);
    const all = await anon.from('events').select('id').limit(1000);
    expect(all.data!.some(r => r.id === hidden.id)).toBe(false);
  });

  test('anon: get_event_by_slug returns the hidden event for its exact slug, with the host embed the page selects', async () => {
    const { data, error } = await anonClient()
      .rpc('get_event_by_slug', { p_slug: hidden.slug })
      .select(HOST_EMBED)
      .maybeSingle();
    expect(error, error?.message).toBeNull();
    expect(data?.id).toBe(hidden.id);
    expect(data?.is_hidden).toBe(true);
    expect(data?.title).toBe('P1603 hidden event');
    expect(data?.host?.id).toBe(host.user.id);
    expect(data?.host?.full_name).toBeTruthy();
  });

  test('anon: get_event_by_slug also returns a public event (the share preview uses it for every event)', async () => {
    const { data, error } = await anonClient().rpc('get_event_by_slug', { p_slug: visible.slug });
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
    expect(data![0].id).toBe(visible.id);
  });

  test('get_event_by_slug: wildcard, partial, prefix, wrong case, padded, empty and null slugs return nothing', async () => {
    const anon = anonClient();
    const probes = [
      '%',
      '_',
      `${hidden.slug.slice(0, -3)}%`,
      hidden.slug.slice(0, -1),
      hidden.slug.slice(1),
      hidden.slug.toUpperCase(),
      ` ${hidden.slug}`,
      `${hidden.slug} `,
      `${hidden.slug}%`,
      'test-event-%',
      hidden.id,
      '',
    ];
    for (const p of probes) {
      const { data, error } = await anon.rpc('get_event_by_slug', { p_slug: p });
      expect(error, `probe ${JSON.stringify(p)}`).toBeNull();
      expect(data, `probe ${JSON.stringify(p)} must return nothing`).toEqual([]);
    }
    const nul = await anon.rpc('get_event_by_slug', { p_slug: null as unknown as string });
    expect(nul.error).toBeNull();
    expect(nul.data).toEqual([]);
  });

  test('get_event_by_slug is the only door: there is no function taking an id that returns an events row', async () => {
    const { error } = await anonClient().rpc('get_event_by_id', { p_id: hidden.id });
    expect(error).not.toBeNull(); // function does not exist
  });

  test('signed-in stranger: the list excludes the hidden event, includes the public one (control)', async () => {
    const list = await strangerClient.from('events').select('id').order('datetime', { ascending: true }).limit(1000);
    expect(list.error).toBeNull();
    expect(list.data!.some(r => r.id === visible.id)).toBe(true);
    expect(list.data!.some(r => r.id === hidden.id)).toBe(false);

    const direct = await strangerClient.from('events').select('id').eq('slug', hidden.slug);
    expect(direct.data).toEqual([]);
  });

  test('signed-in stranger: get_event_by_slug returns it', async () => {
    const viaRpc = await strangerClient.rpc('get_event_by_slug', { p_slug: hidden.slug }).select(HOST_EMBED).maybeSingle();
    expect(viaRpc.error).toBeNull();
    expect(viaRpc.data?.id).toBe(hidden.id);
  });

  test('an id is not access: a stranger who knows only the id cannot insert an RSVP for a hidden event, or read the event', async () => {
    // Control: the SAME client and the SAME insert shape succeeds for a public event.
    const control = await strangerClient.from('event_rsvps').insert({ event_id: visible.id, profile_id: stranger.user.id });
    expect(control.error, control.error?.message).toBeNull();
    await strangerClient.from('event_rsvps').delete().eq('event_id', visible.id).eq('profile_id', stranger.user.id);

    const direct = await strangerClient.from('event_rsvps').insert({ event_id: hidden.id, profile_id: stranger.user.id });
    expect(direct.error, 'a direct insert for a hidden event must be refused').not.toBeNull();

    const row = await supabaseAdmin.from('event_rsvps').select('id').eq('event_id', hidden.id).eq('profile_id', stranger.user.id);
    expect(row.data).toEqual([]);
    const read = await strangerClient.from('events').select('id').eq('id', hidden.id);
    expect(read.data).toEqual([]);
  });

  test('anon cannot register through the slug door; a wrong slug and a null slug find nothing', async () => {
    const anon = await anonClient().rpc('rsvp_to_event_by_slug', { p_slug: hidden.slug });
    expect(anon.error).not.toBeNull();
    const wrong = await strangerClient.rpc('rsvp_to_event_by_slug', { p_slug: `${hidden.slug}x` });
    expect(wrong.error).toBeNull();
    expect(wrong.data).toBe('not_found');
    const none = await strangerClient.rpc('rsvp_to_event_by_slug', { p_slug: null as unknown as string });
    expect(none.data).toBe('not_found');
    const row = await supabaseAdmin.from('event_rsvps').select('id').eq('event_id', hidden.id).eq('profile_id', stranger.user.id);
    expect(row.data).toEqual([]);
  });

  test('a hidden event\'s RSVP list, practice rooms and room members are not readable by a stranger or anon (public-event controls included)', async () => {
    // A registered person to look for, on each event; the stranger is registered on neither yet.
    const other = await createTestUser({ email: generateTestEmail(), name: 'P1603 Other' });
    try {
      await supabaseAdmin.from('event_rsvps').insert([
        { event_id: hidden.id, profile_id: other.user.id },
        { event_id: visible.id, profile_id: other.user.id },
      ]);
      const hiddenMember = await seedRoomMember(hidden.id, { displayName: 'P1603 hidden member', profileId: other.user.id });
      const visibleMember = await seedRoomMember(visible.id, { displayName: 'P1603 public member', profileId: other.user.id });
      try {
        for (const [who, client] of [['anon', anonClient()], ['stranger', strangerClient]] as const) {
          const hiddenRsvps = await client.from('event_rsvps').select('profile_id').eq('event_id', hidden.id);
          expect(hiddenRsvps.error, who).toBeNull();
          expect(hiddenRsvps.data, `${who} sees no RSVP of the hidden event`).toEqual([]);
          const visibleRsvps = await client.from('event_rsvps').select('profile_id').eq('event_id', visible.id);
          expect(visibleRsvps.data!.map(r => r.profile_id), `${who} control: public RSVPs stay visible`).toContain(other.user.id);

          const everyone = await client.from('event_rsvps').select('event_id').limit(5000);
          expect(everyone.data!.some(r => r.event_id === hidden.id), `${who}: the id is not in the full list`).toBe(false);

          const members = await client.from('event_room_members').select('id').in('id', [hiddenMember.id, visibleMember.id]);
          expect(members.error, who).toBeNull();
          expect(members.data!.map(m => m.id), `${who}: room members`).toEqual([visibleMember.id]);
        }
        // The host sees both; the registered person sees both of their own.
        const hostSees = await hostClient.from('event_rsvps').select('profile_id').eq('event_id', hidden.id);
        expect(hostSees.data!.map(r => r.profile_id)).toContain(other.user.id);
        const hostMembers = await hostClient.from('event_room_members').select('id').eq('id', hiddenMember.id);
        expect(hostMembers.data).toHaveLength(1);
      } finally {
        await supabaseAdmin.from('event_room_members').delete().in('id', [hiddenMember.id, visibleMember.id]);
      }
    } finally {
      await supabaseAdmin.from('event_rsvps').delete().eq('profile_id', other.user.id);
      await deleteTestUser(other.user.id);
    }
  });

  test('practice rooms of a hidden event are not readable by a stranger (public control)', async () => {
    const mk = async (eventId: string) => {
      const { data, error } = await supabaseAdmin.from('event_practice_rooms')
        .insert({ event_id: eventId, creator_id: host.user.id }).select('id').single();
      expect(error, error?.message).toBeNull();
      return data!.id as string;
    };
    const hiddenRoom = await mk(hidden.id);
    const visibleRoom = await mk(visible.id);
    try {
      const seen = await strangerClient.from('event_practice_rooms').select('id').in('id', [hiddenRoom, visibleRoom]);
      expect(seen.error).toBeNull();
      expect(seen.data!.map(r => r.id)).toEqual([visibleRoom]);
      const anonSeen = await anonClient().from('event_practice_rooms').select('id').in('id', [hiddenRoom, visibleRoom]);
      expect(anonSeen.data!.map(r => r.id)).toEqual([visibleRoom]);
      const hostSeen = await hostClient.from('event_practice_rooms').select('id').in('id', [hiddenRoom, visibleRoom]);
      expect(hostSeen.data).toHaveLength(2);
    } finally {
      await supabaseAdmin.from('event_practice_rooms').delete().in('id', [hiddenRoom, visibleRoom]);
    }
  });

  test('the policy helpers are not callable from the browser (private schema), and the API does not expose app_private', async () => {
    const viaDefault = await anonClient().rpc('event_is_hidden', { p_event_id: hidden.id });
    expect(viaDefault.error).not.toBeNull();
    const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/event_is_hidden`, {
      method: 'POST',
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}`, 'Content-Type': 'application/json', 'Content-Profile': 'app_private' },
      body: JSON.stringify({ p_event_id: hidden.id }),
    });
    expect(res.ok, `app_private must not be reachable as an RPC (status ${res.status})`).toBe(false);
  });

  test('the link holder registers through the slug door: ok, rsvped_at stamped by the server, then "already"', async () => {
    const first = await strangerClient.rpc('rsvp_to_event_by_slug', { p_slug: hidden.slug });
    expect(first.error, first.error?.message).toBeNull();
    expect(first.data).toBe('ok');
    const row = await supabaseAdmin
      .from('event_rsvps').select('id, rsvped_at').eq('event_id', hidden.id).eq('profile_id', stranger.user.id).single();
    expect(row.error).toBeNull();
    expect(Math.abs(Date.now() - new Date(row.data!.rsvped_at as string).getTime())).toBeLessThan(60_000);
    const again = await strangerClient.rpc('rsvp_to_event_by_slug', { p_slug: hidden.slug });
    expect(again.data).toBe('already');
  });

  test('after the RSVP the person reads the hidden event directly, by slug and in the list', async () => {
    const direct = await strangerClient.from('events').select('id, is_hidden').eq('slug', hidden.slug).single();
    expect(direct.error).toBeNull();
    expect(direct.data?.is_hidden).toBe(true);
    const list = await strangerClient.from('events').select('id').limit(1000);
    expect(list.data!.some(r => r.id === hidden.id)).toBe(true);
    const roster = await strangerClient.from('event_rsvps').select('profile_id').eq('event_id', hidden.id);
    expect(roster.data!.map(r => r.profile_id)).toContain(stranger.user.id);
  });

  test('the RSVP no longer opens it to anyone else: anon still gets nothing from a direct read', async () => {
    const hid = await anonClient().from('events').select('id').eq('slug', hidden.slug);
    expect(hid.data).toEqual([]);
  });

  test('the host reads the hidden event directly and in the list, and can update it', async () => {
    const direct = await hostClient.from('events').select('id').eq('slug', hidden.slug).single();
    expect(direct.error).toBeNull();
    expect(direct.data?.id).toBe(hidden.id);
    const list = await hostClient.from('events').select('id').limit(1000);
    expect(list.data!.some(r => r.id === hidden.id)).toBe(true);

    // The host can switch it off and on again (UPDATE .select() passes the SELECT policy for the new row).
    const off = await hostClient.from('events').update({ is_hidden: false }).eq('id', hidden.id).select('id, is_hidden');
    expect(off.error).toBeNull();
    expect(off.data![0].is_hidden).toBe(false);
    const on = await hostClient.from('events').update({ is_hidden: true }).eq('id', hidden.id).select('id, is_hidden');
    expect(on.data![0].is_hidden).toBe(true);
  });

  test('a host can create an event as hidden through the client, and a stranger cannot read it', async () => {
    const slug = `p1603-created-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    const created = await hostClient
      .from('events')
      .insert({
        slug, title: 'P1603 created hidden', description: 'created by the host through the client',
        datetime: new Date(Date.now() + 5 * 24 * 3600 * 1000).toISOString(), duration_minutes: 90,
        timezone: 'UTC', location: 'Somewhere', host_id: host.user.id, is_hidden: true,
      })
      .select('id, is_hidden')
      .single();
    expect(created.error, created.error?.message).toBeNull();
    expect(created.data?.is_hidden).toBe(true);
    try {
      const seenByAnon = await anonClient().from('events').select('id').eq('slug', slug);
      expect(seenByAnon.data).toEqual([]);
    } finally {
      await supabaseAdmin.from('events').delete().eq('id', created.data!.id);
    }
  });

  test('the slug door keeps the checks of the direct path: cancelled, full and removed are refused', async () => {
    const soon = new Date(Date.now() + 4 * 24 * 3600 * 1000);
    const cancelled = await createTestEvent(host.user.id, soon, { title: 'P1603 cancelled', isHidden: true, status: 'cancelled' });
    const full = await createTestEvent(host.user.id, soon, { title: 'P1603 full', isHidden: true });
    const removed = await createTestEvent(host.user.id, soon, { title: 'P1603 removed', isHidden: true });
    const seat = await createTestUser({ email: generateTestEmail(), name: 'P1603 Seat' });
    try {
      expect((await strangerClient.rpc('rsvp_to_event_by_slug', { p_slug: cancelled.slug })).data).toBe('cancelled');

      await supabaseAdmin.from('events').update({ max_attendees: 1 }).eq('id', full.id);
      await supabaseAdmin.from('event_rsvps').insert({ event_id: full.id, profile_id: seat.user.id });
      expect((await strangerClient.rpc('rsvp_to_event_by_slug', { p_slug: full.slug })).data).toBe('full');

      await supabaseAdmin.from('event_removals').insert({ event_id: removed.id, user_id: stranger.user.id, removed_by: host.user.id });
      const gone = await strangerClient.rpc('rsvp_to_event_by_slug', { p_slug: removed.slug });
      expect(gone.error, 'a removed person is refused by the trigger').not.toBeNull();

      for (const e of [cancelled, full, removed]) {
        const rows = await supabaseAdmin.from('event_rsvps').select('id').eq('event_id', e.id).eq('profile_id', stranger.user.id);
        expect(rows.data).toEqual([]);
      }
    } finally {
      for (const e of [cancelled, full, removed]) await deleteTestEvent(e.id);
      await deleteTestUser(seat.user.id);
    }
  });

  test('get_event_prep_social_proof: a hidden event answers a stranger or anon like an unknown id (NULL), and no hidden event joins a public series', async () => {
    const day = 24 * 3600 * 1000;
    const mk = (title: string, days: number, hiddenFlag: boolean) =>
      createTestEvent(host.user.id, new Date(Date.now() + days * day), { title, isHidden: hiddenFlag });
    const hA = await mk('P1603 proof hidden A', 5, true);
    const hB = await mk('P1603 proof hidden B', 1, true);
    const pubY = await mk('P1603 proof public Y', 2, false);
    const pubX = await mk('P1603 proof public X', 6, false);
    const att1 = await createTestUser({ email: generateTestEmail(), name: 'P1603 Proof One' });
    const att2 = await createTestUser({ email: generateTestEmail(), name: 'P1603 Proof Two' });
    const att3 = await createTestUser({ email: generateTestEmail(), name: 'P1603 Proof Three' });
    const events = [hA, hB, pubY, pubX];
    try {
      for (const e of events) {
        const u = await supabaseAdmin.from('events').update({ preparation_enabled: true }).eq('id', e.id);
        expect(u.error).toBeNull();
      }
      const prepared = async (e: TestEvent, u: TestUser) => {
        const r = await supabaseAdmin.from('event_rsvps').insert({ event_id: e.id, profile_id: u.user.id });
        expect(r.error, r.error?.message).toBeNull();
        const p = await supabaseAdmin.from('event_preparations')
          .insert({ event_id: e.id, profile_id: u.user.id, completed_at: new Date().toISOString(), opted_in: true });
        expect(p.error, p.error?.message).toBeNull();
      };
      await prepared(pubY, att1); // public history: counted, named
      await prepared(hB, att2);   // another hidden event of the same host: must never count
      await prepared(hA, att3);   // the hidden event itself

      const call = (c: SupabaseClient, id: string) => c.rpc('get_event_prep_social_proof', { p_event_id: id });
      const names = (j: { preparedPeople: { name: string }[]; optedInPeople: { name: string }[] }) =>
        [...j.preparedPeople, ...j.optedInPeople].map((x) => x.name);

      // Control: a public event, through anon, shows its public series only.
      const pub = await call(anonClient(), pubX.id);
      expect(pub.error).toBeNull();
      expect(pub.data.preparedSeries, 'public history is counted (control)').toBe(1);
      expect(pub.data.preparedPrevious).toBe(1);
      expect(names(pub.data)).toContain('P1603 Proof One');
      expect(names(pub.data), 'a hidden event never joins a public series').not.toContain('P1603 Proof Two');

      // Anon and a stranger get exactly what an unknown id gets (NULL): the answer does not say a hidden event exists.
      const unknown = await call(anonClient(), '00000000-0000-4000-8000-000000000000');
      expect(unknown.error).toBeNull();
      expect(unknown.data).toBeNull();
      const aA = await call(anonClient(), hA.id);
      expect(aA.error).toBeNull();
      expect(aA.data).toEqual(unknown.data);
      expect((await call(strangerClient, hA.id)).data).toEqual(unknown.data);

      // The host and a registered person see it (and only their own event's people, not hidden B's).
      const att3Client = await clientFor(att3);
      for (const c of [hostClient, att3Client]) {
        const r = await call(c, hA.id);
        expect(r.error).toBeNull();
        expect(r.data.preparedThis).toBe(1);
        expect(names(r.data)).toContain('P1603 Proof Three');
        expect(names(r.data)).not.toContain('P1603 Proof Two');
      }
    } finally {
      for (const e of events) await deleteTestEvent(e.id);
      for (const u of [att1, att2, att3]) await deleteTestUser(u.user.id);
    }
  });
});
