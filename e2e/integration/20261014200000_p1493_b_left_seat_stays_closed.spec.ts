/**
 * P1493 (b) — "seat closes": once the occupant of a room's joiner seat has left it, nobody else
 * can claim that seat. A first claim on an open seat and the seated guest's own reclaim are
 * unchanged.
 *
 * Group D FAIL before 20261014200000_p1493_b_left_seat_stays_closed.sql and PASS after it.
 * Group C are legitimate flows that pass before and after (epistemic gate 7c).
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

function client(token?: string) {
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { global: { headers }, auth: noAuth });
}

type Row = Record<string, unknown>;
const one = (data: unknown): Row | undefined => (Array.isArray(data) ? (data[0] as Row | undefined) : (data as Row | undefined));

test.describe('P1493 (b): a left seat stays closed', () => {
  test.describe.configure({ mode: 'default' });

  let host: TestUser;
  let joiner: TestUser;
  let other: TestUser;
  const createdSessionIds: string[] = [];

  async function tokenFor(user: TestUser) {
    const { data, error } = await supabaseAdmin.auth.signInWithPassword({ email: user.email, password: TEST_PASSWORD });
    expect(error, `sign-in failed: ${error?.message}`).toBeNull();
    await supabaseAdmin.auth.signOut();
    return data!.session!.access_token;
  }

  async function openRoom(extra: Row = {}) {
    const code = makeRoomCode();
    const { data, error } = await supabaseAdmin
      .from('clarity_sessions')
      .insert({
        code,
        creator_name: 'p1493b host',
        creator_profile_id: host.user.id,
        is_private: true,
        status: 'active',
        demo_status: 'in_progress',
        partnership_status: 'pending',
        mode: 'live',
        expires_at: new Date(Date.now() + 86_400_000).toISOString(),
        last_activity_at: new Date().toISOString(),
        live_state: { sessionHistory: [{ rating: 7 }] },
        ...extra,
      })
      .select('id')
      .single();
    if (error) throw new Error(`p1493b fixture: ${error.message}`);
    createdSessionIds.push(data.id);
    return { id: data.id as string, code };
  }

  async function claim(code: string, name: string, opts: { secret?: string; token?: string } = {}) {
    return client(opts.token).rpc('claim_joiner_seat', {
      p_code: code,
      p_joiner_name: name,
      ...(opts.secret ? { p_seat_secret: opts.secret } : {}),
    });
  }

  test.beforeAll(async () => {
    host = await createTestUser({ email: generateTestEmail(), name: 'P1493b Host' });
    joiner = await createTestUser({ email: generateTestEmail(), name: 'P1493b Joiner' });
    other = await createTestUser({ email: generateTestEmail(), name: 'P1493b Other' });
  });

  test.afterAll(async () => {
    if (createdSessionIds.length) {
      await supabaseAdmin.from('clarity_sessions').delete().in('id', createdSessionIds);
    }
    for (const u of [host, joiner, other]) if (u) await deleteTestUser(u.user.id);
  });

  // ---------------------------------------------------------------- GROUP D

  test('D1: after a guest leaves, another guest cannot claim the seat', async () => {
    const room = await openRoom();
    const first = await claim(room.code, 'first guest');
    expect(first.error).toBeNull();
    const secret = one(first.data)!.joiner_seat_secret as string;

    const left = await client().rpc('release_joiner_seat', { p_session_id: room.id, p_code: room.code, p_seat_secret: secret });
    expect(left.error).toBeNull();

    const second = await claim(room.code, 'second guest');
    expect(second.error?.code).toBe('42501');
    expect(one(second.data) ?? undefined).toBeUndefined();
  });

  test('D2: after a guest leaves, a signed-in newcomer cannot claim the seat either', async () => {
    const room = await openRoom();
    const first = await claim(room.code, 'first guest');
    const secret = one(first.data)!.joiner_seat_secret as string;
    await client().rpc('release_joiner_seat', { p_session_id: room.id, p_code: room.code, p_seat_secret: secret });

    const second = await claim(room.code, 'newcomer', { token: await tokenFor(other) });
    expect(second.error?.code).toBe('42501');
  });

  test('D3: a seat marked as left by an earlier client stays closed', async () => {
    const room = await openRoom({ live_state: { joinerEnded: true, sessionHistory: [{ rating: 7 }] } });
    const second = await claim(room.code, 'newcomer');
    expect(second.error?.code).toBe('42501');
  });

  // ---------------------------------------------------------------- GROUP C

  test('C1: a guest joining an open seat gets the seat and a credential', async () => {
    const room = await openRoom();
    const r = await claim(room.code, 'fresh guest');
    expect(r.error).toBeNull();
    expect(one(r.data)?.id).toBe(room.id);
    expect(typeof one(r.data)?.joiner_seat_secret).toBe('string');
  });

  test('C2: the seated guest rejoins with its credential and keeps it', async () => {
    const room = await openRoom();
    const first = await claim(room.code, 'guest');
    const secret = one(first.data)!.joiner_seat_secret as string;
    const again = await claim(room.code, 'guest', { secret });
    expect(again.error).toBeNull();
    expect(one(again.data)?.joiner_seat_secret).toBe(secret);
  });

  test('C3: a signed-in joiner who left can return to their own seat', async () => {
    const room = await openRoom();
    const token = await tokenFor(joiner);
    const first = await claim(room.code, 'joiner', { token });
    expect(first.error).toBeNull();
    const left = await client(token).rpc('release_joiner_seat', { p_session_id: room.id });
    expect(left.error).toBeNull();
    const back = await claim(room.code, 'joiner', { token });
    expect(back.error).toBeNull();
    expect(one(back.data)?.joiner_profile_id).toBe(joiner.user.id);
  });

  test('C4: a seated guest is still refused to a second caller (unchanged)', async () => {
    const room = await openRoom();
    expect((await claim(room.code, 'guest')).error).toBeNull();
    expect((await claim(room.code, 'second')).error?.code).toBe('42501');
  });
});
