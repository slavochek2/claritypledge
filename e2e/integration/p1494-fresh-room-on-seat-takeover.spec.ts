/**
 * P1494 — "fresh room": a guest who takes over an inactive guest seat must start with nothing
 * from the previous guest's conversation.
 *
 * Group R reproduces the current behaviour and is EXPECTED TO FAIL until a mechanism is chosen
 * (see the spec — the choice is a founder decision). Group C are legitimate flows that must keep
 * passing under any fix (epistemic gate 7c).
 */

import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { supabaseAdmin } from '../helpers/supabase-admin';
import { createTestUser, generateTestEmail, deleteTestUser, TEST_PASSWORD, type TestUser } from '../helpers/test-user';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY!;
const noAuth = { autoRefreshToken: false, persistSession: false } as const;

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const makeRoomCode = () => Array.from({ length: 6 }, () => ALPHABET[Math.floor(Math.random() * 32)]).join('');
const PRIOR = 'SENTINEL p1494 prior conversation';

function client(opts: { token?: string; code?: string; secret?: string } = {}) {
  const headers: Record<string, string> = {};
  if (opts.token) headers.Authorization = `Bearer ${opts.token}`;
  if (opts.code) headers['x-clarity-room-code'] = opts.code;
  if (opts.secret) headers['x-clarity-seat-secret'] = opts.secret;
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { global: { headers }, auth: noAuth });
}

type Row = Record<string, unknown>;
const one = (data: unknown): Row | undefined => (Array.isArray(data) ? (data[0] as Row | undefined) : (data as Row | undefined));

test.describe('P1494: fresh room on seat takeover', () => {
  test.describe.configure({ mode: 'default' });

  let host: TestUser;
  const createdSessionIds: string[] = [];

  async function hostToken() {
    const { data, error } = await supabaseAdmin.auth.signInWithPassword({ email: host.email, password: TEST_PASSWORD });
    expect(error, `sign-in failed: ${error?.message}`).toBeNull();
    await supabaseAdmin.auth.signOut();
    return data!.session!.access_token;
  }

  async function openRoom() {
    const code = makeRoomCode();
    const { data, error } = await supabaseAdmin
      .from('clarity_sessions')
      .insert({
        code,
        creator_name: 'p1494 host',
        creator_profile_id: host.user.id,
        is_private: true,
        status: 'active',
        demo_status: 'in_progress',
        partnership_status: 'pending',
        mode: 'live',
        expires_at: new Date(Date.now() + 86_400_000).toISOString(),
        last_activity_at: new Date().toISOString(),
        live_state: { sessionHistory: [] },
      })
      .select('id')
      .single();
    if (error) throw new Error(`p1494 fixture: ${error.message}`);
    createdSessionIds.push(data.id);
    return { id: data.id as string, code };
  }

  const claim = (code: string, name: string, secret?: string) =>
    client().rpc('claim_joiner_seat', { p_code: code, p_joiner_name: name, ...(secret ? { p_seat_secret: secret } : {}) });

  /** A first guest holds a conversation, then goes quiet past the inactivity window. */
  async function roomWithAbandonedConversation() {
    const room = await openRoom();
    const first = await claim(room.code, 'first guest');
    expect(first.error).toBeNull();
    const firstSecret = one(first.data)!.joiner_seat_secret as string;

    await supabaseAdmin.from('clarity_sessions').update({
      live_state: { sessionHistory: [{ title: PRIOR, type: 'point', partnerName: 'first guest' }] },
    }).eq('id', room.id);
    const turn = await supabaseAdmin.from('clarity_live_turns').insert({
      session_id: room.id, speaker_name: 'p1494 host', listener_name: 'first guest',
      actor_name: 'first guest', role: 'listener', transcript: PRIOR, self_rating: 6,
    });
    expect(turn.error, turn.error?.message).toBeNull();

    const stale = new Date(Date.now() - 16 * 60_000).toISOString();
    await supabaseAdmin.from('clarity_sessions')
      .update({ joiner_seat_claimed_at: stale, joiner_last_seen_at: stale })
      .eq('id', room.id);
    return { ...room, firstSecret };
  }

  test.beforeAll(async () => {
    host = await createTestUser({ email: generateTestEmail(), name: 'P1494 Host' });
  });

  test.afterAll(async () => {
    if (createdSessionIds.length) {
      await supabaseAdmin.from('clarity_live_turns').delete().in('session_id', createdSessionIds);
      await supabaseAdmin.from('clarity_sessions').delete().in('id', createdSessionIds);
    }
    if (host) await deleteTestUser(host.user.id);
  });

  // ---------------------------------------------------------------- GROUP R (red until fixed)

  test('R1: the newcomer who takes over an inactive seat reads none of the prior conversation', async () => {
    const room = await roomWithAbandonedConversation();
    const taken = await claim(room.code, 'newcomer');
    expect(taken.error, taken.error?.message).toBeNull();
    const secret = one(taken.data)!.joiner_seat_secret as string;

    expect(JSON.stringify(one(taken.data)?.live_state ?? null), 'claim result carries prior state').not.toContain(PRIOR);

    const g = client({ code: room.code, secret });
    const byCode = await g.rpc('get_session_by_code', { p_code: room.code });
    expect(JSON.stringify(one(byCode.data)?.live_state ?? null), 'lookup carries prior state').not.toContain(PRIOR);

    const turns = await g.from('clarity_live_turns').select('transcript').eq('session_id', room.id);
    expect(turns.error).toBeNull();
    expect(JSON.stringify(turns.data ?? []), 'newcomer reads prior turns').not.toContain(PRIOR);
  });

  // ---------------------------------------------------------------- GROUP C (must stay green)

  test('C1: the creator still reads the full history after a takeover', async () => {
    const room = await roomWithAbandonedConversation();
    expect((await claim(room.code, 'newcomer')).error).toBeNull();
    const h = client({ token: await hostToken() });
    const row = await h.from('clarity_sessions').select('live_state').eq('id', room.id).single();
    expect(JSON.stringify(row.data?.live_state)).toContain(PRIOR);
    const turns = await h.from('clarity_live_turns').select('transcript').eq('session_id', room.id);
    expect(JSON.stringify(turns.data)).toContain(PRIOR);
  });

  test('C2: the original guest with its credential still reads its own conversation (no takeover)', async () => {
    const room = await openRoom();
    const first = await claim(room.code, 'guest');
    const secret = one(first.data)!.joiner_seat_secret as string;
    await supabaseAdmin.from('clarity_live_turns').insert({
      session_id: room.id, speaker_name: 'p1494 host', listener_name: 'guest',
      actor_name: 'guest', role: 'listener', transcript: PRIOR, self_rating: 6,
    });
    const again = await claim(room.code, 'guest', secret);
    expect(again.error).toBeNull();
    const turns = await client({ code: room.code, secret }).from('clarity_live_turns').select('transcript').eq('session_id', room.id);
    expect(JSON.stringify(turns.data)).toContain(PRIOR);
  });

  test('C3: a fresh join into an empty seat works', async () => {
    const room = await openRoom();
    const r = await claim(room.code, 'fresh guest');
    expect(r.error).toBeNull();
    expect(typeof one(r.data)?.joiner_seat_secret).toBe('string');
  });

  test('C4: the takeover itself still succeeds (recovery path / creator can seat a new partner)', async () => {
    const room = await roomWithAbandonedConversation();
    const taken = await claim(room.code, 'first guest on a new device');
    expect(taken.error).toBeNull();
    expect(one(taken.data)?.joiner_seat_secret).not.toBe(room.firstSecret);
  });
});
