/**
 * @file p1302-session-select-scope.spec.ts
 * @description Canaries for P1302: who may read (and, through the same premise, write) a
 * `clarity_sessions` row.
 *
 * The defect: the row policy treats "no named listener" as "public". Almost every session has
 * no named listener, so almost every session is readable — and its live_state overwritable — by
 * anyone holding the publishable key, signed in or not.
 *
 * The constraint that makes the fix non-trivial: that same branch is also how GUESTS work. A
 * guest joins /live by room code, holds no account, and has no auth.uid(). The fix keeps them
 * working by moving their access from "everyone" to "whoever presents the room code" — the
 * capability they already hold and that claim_joiner_seat / get_session_by_code already accept.
 * The browser sends it as the `x-clarity-room-code` request header.
 *
 * Two groups, by what they must do before and after the fix:
 *
 *   GROUP A — exploit canaries. MUST FAIL against the current policy, MUST PASS after.
 *
 *   GROUP C — legitimate readers and writers. MUST PASS now AND after. They are the controls
 *   (epistemic gate 7c): a Group A assertion alone passes just as well against a database where
 *   every read was broken. Group C is what fails if the fix over-tightens — and the guest cases
 *   in it are the ones a naive fix breaks silently (UPDATE matches zero rows, no error).
 *
 * Every write assertion re-reads the row through the ADMIN client and asserts the persisted
 * value. PostgREST reports a USING-filtered UPDATE as 204 with zero rows changed — no error — so
 * asserting on `error` alone would prove nothing.
 *
 * Detail (measured exposure, request shapes): .private/docs/security-log.md 2026-09-11.
 */

import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { supabaseAdmin } from '../helpers/supabase-admin';
import { createTestUser, generateTestEmail, deleteTestUser, TEST_PASSWORD, type TestUser } from '../helpers/test-user';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY!;
const ROOM_CODE_HEADER = 'x-clarity-room-code';

/** Room code alphabet (P1097): A-Z minus I and O, plus 2-9. */
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function makeRoomCode() {
  let s = '';
  for (let i = 0; i < 6; i++) s += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  return s;
}

const noAuth = { autoRefreshToken: false, persistSession: false } as const;

/** No session, no code — PostgREST resolves this to `anon`. The stranger-without-an-account. */
function anon() {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: noAuth });
}

/** No session, presenting room code(s) — a guest who joined by code. */
function guest(codes: string) {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { [ROOM_CODE_HEADER]: codes } },
    auth: noAuth,
  });
}

function userClient(accessToken: string) {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: noAuth,
  });
}

async function liveStateOf(id: string) {
  const { data, error } = await supabaseAdmin.from('clarity_sessions').select('live_state').eq('id', id).single();
  if (error) throw new Error(`admin readback failed: ${error.message}`);
  return data.live_state as Record<string, unknown> | null;
}

async function resetLiveState(id: string) {
  const { error } = await supabaseAdmin.from('clarity_sessions').update({ live_state: { seed: 'p1302' } }).eq('id', id);
  if (error) throw new Error(`admin reset failed: ${error.message}`);
}

test.describe('P1302: a clarity_sessions row is readable only by its parties, or by whoever holds its room code', () => {
  test.describe.configure({ mode: 'default' });

  let host: TestUser;
  let joiner: TestUser;
  let listener: TestUser;
  let invitee: TestUser;
  let stranger: TestUser;

  /** Signed-in open room: host created it, a signed-in joiner holds the seat. */
  let openId: string;
  /** Guest room: host created it, an account-less guest holds the seat. */
  let guestId: string;
  let guestCode: string;
  /** Directed room: addressed to a named listener. */
  let directedId: string;
  let directedCode: string;
  /** Directed room addressed to `invitee`, with the open invite production creates alongside it. */
  let invitedId: string;
  /** Directed room addressed to `listener`, plus an invite to `stranger` (a shape the INSERT policy allows). */
  let crossInvitedId: string;
  /** Guest room whose session has ended. */
  let endedId: string;
  let endedCode: string;

  const createdSessionIds: string[] = [];

  const signInCache = new Map<string, { client: ReturnType<typeof userClient>; token: string }>();
  async function signIn(user: TestUser) {
    const cached = signInCache.get(user.user.id);
    if (cached) return cached;
    const { data, error } = await supabaseAdmin.auth.signInWithPassword({ email: user.email, password: TEST_PASSWORD });
    expect(error, `sign-in failed for ${user.email}: ${error?.message}`).toBeNull();
    const token = data!.session!.access_token;
    const entry = { client: userClient(token), token };
    await supabaseAdmin.auth.signOut();
    signInCache.set(user.user.id, entry);
    return entry;
  }
  async function as(user: TestUser) {
    return (await signIn(user)).client;
  }

  async function seed(row: Record<string, unknown>) {
    const code = makeRoomCode();
    const { data, error } = await supabaseAdmin
      .from('clarity_sessions')
      .insert({ code, creator_name: 'p1302 host', creator_note: 'SENTINEL p1302 note', live_state: { seed: 'p1302' }, ...row })
      .select('id')
      .single();
    if (error) throw new Error(`p1302 fixture: ${error.message}`);
    createdSessionIds.push(data.id);
    return { id: data.id as string, code };
  }

  test.beforeAll(async () => {
    host = await createTestUser({ email: generateTestEmail(), name: 'P1302 Host' });
    joiner = await createTestUser({ email: generateTestEmail(), name: 'P1302 Joiner' });
    listener = await createTestUser({ email: generateTestEmail(), name: 'P1302 Listener' });
    invitee = await createTestUser({ email: generateTestEmail(), name: 'P1302 Invitee' });
    stranger = await createTestUser({ email: generateTestEmail(), name: 'P1302 Stranger' });

    ({ id: openId } = await seed({
      creator_profile_id: host.user.id, joiner_profile_id: joiner.user.id, joiner_name: 'p1302 joiner',
    }));
    ({ id: guestId, code: guestCode } = await seed({
      creator_profile_id: host.user.id, joiner_name: 'p1302 guest',
    }));
    ({ id: directedId, code: directedCode } = await seed({
      creator_profile_id: host.user.id, target_listener_id: listener.user.id,
    }));
    // The only shape production creates: start-clarity-session-button makes a directed session to
    // the letter's receiver and invites that same receiver.
    ({ id: invitedId } = await seed({ creator_profile_id: host.user.id, target_listener_id: invitee.user.id }));
    // A shape the invite INSERT policy also allows (any recipient of the letter): directed to one
    // person, invite to another. Seeded as admin — the point is what the invite GRANTS, not whether
    // it can be created.
    ({ id: crossInvitedId } = await seed({ creator_profile_id: host.user.id, target_listener_id: listener.user.id }));
    ({ id: endedId, code: endedCode } = await seed({
      creator_profile_id: host.user.id, joiner_name: 'p1302 guest', ended_at: new Date().toISOString(),
    }));

    const inv = await supabaseAdmin.from('clarity_live_invites').insert([
      { session_id: invitedId, target_user_id: invitee.user.id },
      { session_id: crossInvitedId, target_user_id: stranger.user.id },
    ]);
    if (inv.error) throw new Error(`p1302 fixture: invite: ${inv.error.message}`);

    const turn = await supabaseAdmin.from('clarity_live_turns').insert({
      session_id: guestId, speaker_name: 'p1302 host', listener_name: 'p1302 guest',
      actor_name: 'p1302 host', role: 'speaker', transcript: 'SENTINEL p1302 transcript', self_rating: 7,
    });
    if (turn.error) throw new Error(`p1302 fixture: live turn: ${turn.error.message}`);
  });

  test.afterAll(async () => {
    if (createdSessionIds.length) {
      await supabaseAdmin.from('clarity_live_turns').delete().in('session_id', createdSessionIds);
      await supabaseAdmin.from('clarity_live_invites').delete().in('session_id', createdSessionIds);
      await supabaseAdmin.from('clarity_sessions').delete().in('id', createdSessionIds);
    }
    for (const u of [host, joiner, listener, invitee, stranger]) if (u) await deleteTestUser(u.user.id);
  });

  // ==========================================================================================
  // GROUP A — exploit canaries. FAIL now, PASS after the fix.
  // ==========================================================================================

  test('A1: a caller with no account and no room code reads no session at all', async () => {
    // An explicit column list, never `*`: `*` includes the grant-protected `code` column and is
    // refused wholesale, which makes the table LOOK protected on a casual probe.
    const { data, error } = await anon()
      .from('clarity_sessions').select('id, creator_name, creator_note, live_state').in('id', createdSessionIds);
    expect(error, error?.message).toBeNull();
    expect(data ?? [], `anon enumerated sessions: ${JSON.stringify(data)}`).toEqual([]);
  });

  test('A2: a signed-in stranger reads no session they are not a party to', async () => {
    const { data, error } = await (await as(stranger))
      .from('clarity_sessions').select('id, creator_name, creator_note').in('id', createdSessionIds);
    expect(error, error?.message).toBeNull();
    expect(data ?? [], `stranger read sessions: ${JSON.stringify(data)}`).toEqual([]);
  });

  test('A3: presenting a room code that is not this room\'s reads nothing', async () => {
    let wrong = makeRoomCode();
    while (wrong === guestCode) wrong = makeRoomCode();
    const { data, error } = await guest(wrong).from('clarity_sessions').select('id').eq('id', guestId);
    expect(error, error?.message).toBeNull();
    expect(data ?? []).toEqual([]);
  });

  test('A4: a caller with no account and no room code cannot overwrite a guest room\'s live_state', async () => {
    await resetLiveState(guestId);
    await anon().from('clarity_sessions').update({ live_state: { tampered: 'A4' } }).eq('id', guestId);
    const after = await liveStateOf(guestId);
    await resetLiveState(guestId);
    expect(after?.tampered, 'anon overwrote a stranger\'s live_state').toBeUndefined();
  });

  test('A5: a signed-in stranger cannot overwrite live_state', async () => {
    await resetLiveState(openId);
    await (await as(stranger)).from('clarity_sessions').update({ live_state: { tampered: 'A5' } }).eq('id', openId);
    const after = await liveStateOf(openId);
    await resetLiveState(openId);
    expect(after?.tampered, 'a stranger overwrote live_state').toBeUndefined();
  });

  test('A6: a caller with no account and no room code reads none of a room\'s live turns', async () => {
    const { data, error } = await anon().from('clarity_live_turns').select('transcript').eq('session_id', guestId);
    expect(error, error?.message).toBeNull();
    expect(data ?? [], `anon read a transcript: ${JSON.stringify(data)}`).toEqual([]);
  });

  test('A7: patch_live_state from a caller holding only the session id does not touch a guest room', async () => {
    // Session ids are not secret — event practice rooms publish theirs to every visitor — so the
    // guest arm of patch_live_state must ask for the room code too, like every other guest path.
    await resetLiveState(guestId);
    await anon().rpc('patch_live_state', { p_session_id: guestId, p_patch: { tampered: 'A7' } });
    const after = await liveStateOf(guestId);
    await resetLiveState(guestId);
    expect(after?.tampered, 'a caller with only the id patched a guest room').toBeUndefined();
  });

  test('A8: a room code grants a guest\'s writes only — never the creator\'s name, note or status', async () => {
    await guest(guestCode).from('clarity_sessions').update({ creator_note: 'TAMPERED A8', status: 'cancelled' }).eq('id', guestId);
    const { data } = await supabaseAdmin.from('clarity_sessions').select('creator_note, status').eq('id', guestId).single();
    expect(data?.creator_note, 'a code holder rewrote the creator\'s note').toBe('SENTINEL p1302 note');
    expect(data?.status, 'a code holder cancelled the room').not.toBe('cancelled');
  });

  test('A9: a room code does not write to a room whose session has ended', async () => {
    await resetLiveState(endedId);
    await guest(endedCode).from('clarity_sessions').update({ live_state: { tampered: 'A9' } }).eq('id', endedId);
    const after = await liveStateOf(endedId);
    expect(after?.tampered, 'a code holder wrote to an ended room').toBeUndefined();
  });

  // ==========================================================================================
  // GROUP C — legitimate access. PASS now AND after the fix.
  // ==========================================================================================

  test('C1: the creator reads every session they created', async () => {
    const { data, error } = await (await as(host))
      .from('clarity_sessions').select('id').in('id', [openId, guestId, directedId, invitedId]);
    expect(error, error?.message).toBeNull();
    expect((data ?? []).map((r) => r.id).sort()).toEqual([openId, guestId, directedId, invitedId].sort());
  });

  test('C2: a signed-in joiner reads the session whose seat they hold', async () => {
    const { data, error } = await (await as(joiner)).from('clarity_sessions').select('id, live_state').eq('id', openId);
    expect(error, error?.message).toBeNull();
    expect(data ?? []).toHaveLength(1);
  });

  test('C3: the named listener reads the directed session addressed to them', async () => {
    const { data, error } = await (await as(listener)).from('clarity_sessions').select('id').eq('id', directedId);
    expect(error, error?.message).toBeNull();
    expect(data ?? []).toHaveLength(1);
  });

  test('C4: an invited listener reads the session they were invited to (invite enrichment)', async () => {
    const { data, error } = await (await as(invitee))
      .from('clarity_sessions').select('creator_name, source_letter_id').eq('id', invitedId);
    expect(error, error?.message).toBeNull();
    expect(data ?? []).toHaveLength(1);
  });

  test('C11: an invite does not open a directed session to anyone but its named listener', async () => {
    const { data, error } = await (await as(stranger)).from('clarity_sessions').select('id').eq('id', crossInvitedId);
    expect(error, error?.message).toBeNull();
    expect(data ?? [], 'an invite to a non-listener exposed a directed session').toEqual([]);
  });

  test('C12: a guest presenting the room code can still patch live_state (the partial-merge path)', async () => {
    await resetLiveState(guestId);
    const { error } = await guest(guestCode).rpc('patch_live_state', { p_session_id: guestId, p_patch: { written: 'C12' } });
    const after = await liveStateOf(guestId);
    await resetLiveState(guestId);
    expect(error, error?.message).toBeNull();
    expect(after?.written, 'the guest\'s partial-merge write must land').toBe('C12');
  });

  test('C13: a signed-in joiner still receives realtime updates for their room', async () => {
    test.setTimeout(60_000);
    // Before P1302 a signed-in joiner matched the row only through the open branch; after it,
    // by identity. Realtime authorizes from the JWT, so this is the path that must not go dark.
    const { token } = await signIn(joiner);
    const client = userClient(token);
    client.realtime.setAuth(token);
    const received: unknown[] = [];
    const channel = client
      .channel(`p1302-joiner:${openId}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'clarity_sessions', filter: `id=eq.${openId}` },
        (payload) => { received.push(payload.new); });
    try {
      await new Promise<void>((resolve, reject) => {
        const t = setTimeout(() => reject(new Error('channel never reached SUBSCRIBED')), 15_000);
        channel.subscribe((status) => {
          if (status === 'SUBSCRIBED') { clearTimeout(t); resolve(); }
          if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') { clearTimeout(t); reject(new Error(status)); }
        });
      });
      // Re-fire: SUBSCRIBED can precede the replication slot forwarding this table (see p1057).
      const deadline = Date.now() + 15_000;
      for (let n = 0; received.length === 0 && Date.now() < deadline; n++) {
        await supabaseAdmin.from('clarity_sessions').update({ live_state: { seed: 'p1302', n } }).eq('id', openId);
        for (let i = 0; i < 8 && received.length === 0; i++) await new Promise((r) => setTimeout(r, 250));
      }
      expect(received.length, 'the signed-in joiner received no realtime update for their own room').toBeGreaterThan(0);
    } finally {
      await client.removeChannel(channel);
    }
  });

  test('C5: a guest presenting the room code reads the room, live_state included', async () => {
    const { data, error } = await guest(guestCode).from('clarity_sessions').select('id, live_state').eq('id', guestId);
    expect(error, error?.message).toBeNull();
    expect(data ?? [], 'the account-less guest flow must keep reading its own room').toHaveLength(1);
  });

  test('C6: a guest presenting the room code can overwrite live_state (the full-overwrite write path)', async () => {
    await resetLiveState(guestId);
    const { error } = await guest(guestCode).from('clarity_sessions').update({ live_state: { written: 'C6' } }).eq('id', guestId);
    const after = await liveStateOf(guestId);
    await resetLiveState(guestId);
    expect(error, error?.message).toBeNull();
    expect(after?.written, 'the guest\'s own write must land — a zero-row UPDATE here is silent data loss').toBe('C6');
  });

  test('C7: a guest presenting the room code reads the room\'s live turns', async () => {
    const { data, error } = await guest(guestCode).from('clarity_live_turns').select('transcript').eq('session_id', guestId);
    expect(error, error?.message).toBeNull();
    expect(data ?? []).toHaveLength(1);
  });

  test('C8: presenting the code of a DIRECTED session reads nothing — directed stays two-party', async () => {
    const { data, error } = await guest(directedCode).from('clarity_sessions').select('id').eq('id', directedId);
    expect(error, error?.message).toBeNull();
    expect(data ?? []).toEqual([]);
  });

  test('C9: a tab holding two room codes reads both rooms (comma-separated header)', async () => {
    const other = await seed({ creator_profile_id: host.user.id, joiner_name: 'p1302 guest 2' });
    const { data, error } = await guest(`${guestCode},${other.code}`)
      .from('clarity_sessions').select('id').in('id', [guestId, other.id]);
    expect(error, error?.message).toBeNull();
    expect((data ?? []).map((r) => r.id).sort()).toEqual([guestId, other.id].sort());
  });

  test('A8b: a SIGNED-IN caller holding the room code still writes nothing — writing is by identity', async () => {
    // The read predicate is role-agnostic on purpose (a signed-in visitor to a public event page
    // holds that room's published code and may read it). Writing is not: a signed-in participant
    // is always a party, so the code write path is a guest's only. Without this, any free account
    // holding a published code could rewrite the creator's note or cancel the room —
    // `authenticated` keeps those column grants, only `anon` was revoked.
    await resetLiveState(guestId);
    const strangerWithCode = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${(await signIn(stranger)).token}`, [ROOM_CODE_HEADER]: guestCode } },
      auth: noAuth,
    });
    await strangerWithCode.from('clarity_sessions')
      .update({ creator_note: 'TAMPERED A8b', status: 'cancelled' }).eq('id', guestId);
    await strangerWithCode.from('clarity_sessions')
      .update({ live_state: { tampered: 'A8b' } }).eq('id', guestId);

    const { data } = await supabaseAdmin.from('clarity_sessions')
      .select('creator_note, status, live_state').eq('id', guestId).single();
    await resetLiveState(guestId);
    expect(data?.creator_note, 'a signed-in code holder rewrote the creator\'s note').toBe('SENTINEL p1302 note');
    expect(data?.status, 'a signed-in code holder cancelled the room').not.toBe('cancelled');
    expect((data?.live_state as Record<string, unknown>)?.tampered,
      'a signed-in non-party wrote live_state by presenting a code').toBeUndefined();
  });

  test('A10: only the first two presented codes are read — a third is ignored', async () => {
    // Bounds guessing: one request tests at most two codes, never a batch.
    const { data, error } = await guest(`AAAAAA,BBBBBB,${guestCode}`)
      .from('clarity_sessions').select('id').eq('id', guestId);
    expect(error, error?.message).toBeNull();
    expect(data ?? [], 'a third presented code was parsed — the per-request bound is not enforced').toEqual([]);
  });

  test('A11: a guest presenting the code cannot patch an ended room', async () => {
    await resetLiveState(endedId);
    await guest(endedCode).rpc('patch_live_state', { p_session_id: endedId, p_patch: { tampered: 'A11' } });
    const after = await liveStateOf(endedId);
    expect(after?.tampered, 'a guest patched a room whose session has ended').toBeUndefined();
  });

  test('A12: a signed-in stranger cannot insert a live turn into a room they cannot read', async () => {
    // The child INSERT policies gate on "this session is not cancelled", evaluated as the caller.
    // Once a foreign row is invisible, that guard reads true for a row the caller cannot see — so
    // the INSERT must be scoped to the same predicate as the read.
    const { error } = await (await as(stranger)).from('clarity_live_turns').insert({
      session_id: guestId, speaker_name: 'p1302 intruder', listener_name: 'p1302 guest',
      actor_name: 'p1302 intruder', role: 'speaker', transcript: 'INTRUDER p1302', self_rating: 1,
    });
    const { data } = await supabaseAdmin.from('clarity_live_turns')
      .select('id').eq('session_id', guestId).eq('actor_name', 'p1302 intruder');
    expect(data ?? [], `a stranger wrote into another room's transcript: ${error?.message}`).toEqual([]);
  });

  test('A12b: a signed-in stranger PRESENTING the room code still cannot insert a live turn', async () => {
    // A12 sends no header, so it cannot see the hole this guards: the child INSERTs were scoped with
    // the READ predicate, whose code arm is role-agnostic on purpose. Writing is a participant act,
    // so a published event-room code must not buy a signed-in account the right to fabricate turns.
    const strangerWithCode = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${(await signIn(stranger)).token}`, [ROOM_CODE_HEADER]: guestCode } },
      auth: noAuth,
    });
    const { error } = await strangerWithCode.from('clarity_live_turns').insert({
      session_id: guestId, speaker_name: 'p1302 intruder2', listener_name: 'p1302 guest',
      actor_name: 'p1302 intruder2', role: 'speaker', transcript: 'INTRUDER2 p1302', self_rating: 1,
    });
    const { data } = await supabaseAdmin.from('clarity_live_turns')
      .select('id').eq('session_id', guestId).eq('actor_name', 'p1302 intruder2');
    expect(data ?? [],
      `a signed-in code holder fabricated a turn in someone else's room: ${error?.message}`).toEqual([]);
  });

  test('A13: an anon subscriber receives no realtime updates for a room it holds no code for', async () => {
    test.setTimeout(60_000);
    // The negative of C13, on the channel P1057 showed the REST suite structurally cannot reach.
    // Realtime authorizes from the JWT alone, so an anon subscriber must now receive nothing.
    const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: noAuth });
    const received: unknown[] = [];
    const channel = client
      .channel(`p1302-anon:${openId}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'clarity_sessions', filter: `id=eq.${openId}` },
        (payload) => { received.push(payload.new); });
    try {
      await new Promise<void>((resolve, reject) => {
        const t = setTimeout(() => reject(new Error('channel never reached SUBSCRIBED')), 15_000);
        channel.subscribe((status) => {
          if (status === 'SUBSCRIBED') { clearTimeout(t); resolve(); }
          if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') { clearTimeout(t); reject(new Error(status)); }
        });
      });
      for (let n = 0; n < 6; n++) {
        await supabaseAdmin.from('clarity_sessions').update({ live_state: { seed: 'p1302', anon: n } }).eq('id', openId);
        await new Promise((r) => setTimeout(r, 500));
      }
      expect(received, 'an anon subscriber still receives this room over the WebSocket').toEqual([]);
    } finally {
      await client.removeChannel(channel);
      await resetLiveState(openId);
    }
  });

  test('C14: a signed-in creator creates a session and reads it back in the same request', async () => {
    // INSERT … RETURNING checks the SELECT policy against the NEW row. createClaritySession does
    // exactly this (`.insert().select()`); a policy that re-reads the row by id cannot see a row
    // its own statement is inserting, and refuses every creator. Payload mirrors the client: no
    // `code` (minted server-side, P1097).
    const { data, error } = await (await as(host))
      .from('clarity_sessions')
      .insert({ creator_name: 'p1302 creator', creator_profile_id: host.user.id, state: {} })
      .select('id, creator_profile_id')
      .single();
    if (data?.id) createdSessionIds.push(data.id);
    expect(error, `creator could not read back their own new session: ${error?.message}`).toBeNull();
    expect(data?.creator_profile_id).toBe(host.user.id);
  });

  test('C10: the guest poll path (get_session_by_code) is unaffected', async () => {
    const { data, error } = await anon().rpc('get_session_by_code', { p_code: guestCode });
    expect(error, error?.message).toBeNull();
    const row = Array.isArray(data) ? data[0] : data;
    expect(row?.id).toBe(guestId);
  });
});
