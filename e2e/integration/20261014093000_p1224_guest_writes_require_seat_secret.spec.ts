/**
 * @file 20261014093000_p1224_guest_writes_require_seat_secret.spec.ts
 * @description P1224 — guest writes require the seat credential.
 *
 * P270 coverage — this file is the integration test for:
 *   - 20261014093000_p1224_guest_writes_require_seat_secret
 *
 * GROUP A — refusals for any caller who is not the seated guest. FAIL before the migration,
 *           PASS after it.
 * GROUP C — controls. PASS before and after: the seated guest (including after a reload),
 *           the signed-in joiner and the creator keep working (epistemic gate 7c).
 *
 * Every verdict is read back from the row through the admin client — never from `error` alone
 * (the P1058 convention: only the row proves what happened).
 */

import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { supabaseAdmin } from '../helpers/supabase-admin';
import { createTestUser, generateTestEmail, deleteTestUser, TEST_PASSWORD, type TestUser } from '../helpers/test-user';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY!;
const ROOM_CODE_HEADER = 'x-clarity-room-code';
const SEAT_SECRET_HEADER = 'x-clarity-seat-secret';
const noAuth = { autoRefreshToken: false, persistSession: false };

function makeRoomCode() {
  // Six alphanumerics — the shape the database's header parse accepts.
  let code = '';
  while (code.length < 6) code += Math.random().toString(36).slice(2).toUpperCase();
  return code.slice(0, 6);
}

/** An account-less caller presenting whatever capabilities it holds. */
function anonWith(opts: { code?: string; secret?: string } = {}) {
  const headers: Record<string, string> = {};
  if (opts.code) headers[ROOM_CODE_HEADER] = opts.code;
  if (opts.secret) headers[SEAT_SECRET_HEADER] = opts.secret;
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { global: { headers }, auth: noAuth });
}

function userClient(accessToken: string) {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: noAuth,
  });
}

async function readRow(id: string) {
  const { data, error } = await supabaseAdmin
    .from('clarity_sessions')
    .select('live_state, state, mode, demo_status, joiner_seat_secret')
    .eq('id', id)
    .single();
  if (error) throw new Error(`admin readback failed: ${error.message}`);
  return data as {
    live_state: Record<string, unknown> | null;
    state: Record<string, unknown> | null;
    mode: string | null;
    demo_status: string | null;
    joiner_seat_secret: string | null;
  };
}

async function resetRow(id: string) {
  const { error } = await supabaseAdmin
    .from('clarity_sessions')
    .update({ live_state: { seed: 'p1224', keep: 'partner-key' }, state: { seed: 'p1224' } })
    .eq('id', id);
  if (error) throw new Error(`admin reset failed: ${error.message}`);
}

test.describe('P1224: a guest room is written only by its seated guest', () => {
  test.describe.configure({ mode: 'default' });

  let host: TestUser;
  let joiner: TestUser;
  let stranger: TestUser;

  /** Guest seat with a known secret (a seat claimed after P1269). */
  let guestRoom: { id: string; code: string; secret: string };
  /** A second guest room — its secret must not open the first. */
  let otherRoom: { id: string; code: string; secret: string };
  /** A seat claimed before P1269: occupied, no secret. */
  let legacyRoom: { id: string; code: string };
  /** A room whose seat is held by a signed-in joiner. */
  let signedInRoom: { id: string; code: string };

  const createdSessionIds: string[] = [];
  const tokens = new Map<string, string>();

  async function tokenFor(user: TestUser) {
    const cached = tokens.get(user.user.id);
    if (cached) return cached;
    // A dedicated client: signing in on the shared admin client would turn every later admin
    // call into a call as this user.
    const signer = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: noAuth });
    const { data, error } = await signer.auth.signInWithPassword({ email: user.email, password: TEST_PASSWORD });
    expect(error, `sign-in failed for ${user.email}: ${error?.message}`).toBeNull();
    const token = data!.session!.access_token;
    tokens.set(user.user.id, token);
    return token;
  }

  async function seed(row: Record<string, unknown>) {
    const code = makeRoomCode();
    const { data, error } = await supabaseAdmin
      .from('clarity_sessions')
      .insert({
        code,
        creator_name: 'p1224 host',
        creator_profile_id: host.user.id,
        live_state: { seed: 'p1224', keep: 'partner-key' },
        state: { seed: 'p1224' },
        ...row,
      })
      .select('id')
      .single();
    if (error) throw new Error(`p1224 fixture: ${error.message}`);
    createdSessionIds.push(data.id);
    return { id: data.id as string, code };
  }

  test.beforeAll(async () => {
    host = await createTestUser({ email: generateTestEmail(), name: 'P1224 Host' });
    joiner = await createTestUser({ email: generateTestEmail(), name: 'P1224 Joiner' });
    stranger = await createTestUser({ email: generateTestEmail(), name: 'P1224 Stranger' });

    const now = new Date().toISOString();
    const guestSecret = crypto.randomUUID();
    guestRoom = {
      ...(await seed({
        joiner_name: 'p1224 guest', joiner_seat_claimed_at: now, joiner_last_seen_at: now,
        joiner_seat_secret: guestSecret,
      })),
      secret: guestSecret,
    };
    const otherSecret = crypto.randomUUID();
    otherRoom = {
      ...(await seed({
        joiner_name: 'p1224 other guest', joiner_seat_claimed_at: now, joiner_last_seen_at: now,
        joiner_seat_secret: otherSecret,
      })),
      secret: otherSecret,
    };
    legacyRoom = await seed({ joiner_name: 'p1224 legacy guest', joiner_seat_claimed_at: now });
    signedInRoom = await seed({
      joiner_name: 'p1224 joiner', joiner_profile_id: joiner.user.id, joiner_seat_claimed_at: now,
    });
  });

  test.afterAll(async () => {
    if (createdSessionIds.length) {
      await supabaseAdmin.from('clarity_sessions').delete().in('id', createdSessionIds);
    }
    for (const u of [host, joiner, stranger]) if (u) await deleteTestUser(u.user.id);
  });

  // ==========================================================================================
  // GROUP A — a caller who is not the seated guest is refused.
  // ==========================================================================================

  test('A1: a caller who is not the seated guest is refused by the partial-merge path', async () => {
    await resetRow(guestRoom.id);
    const { error } = await anonWith({ code: guestRoom.code })
      .rpc('patch_live_state', { p_session_id: guestRoom.id, p_patch: { tampered: 'A1' } });
    const after = await readRow(guestRoom.id);
    expect(after.live_state?.tampered, 'a non-guest patched live_state').toBeUndefined();
    expect(error?.code, 'the refusal must be a permission error, not a silent no-op').toBe('42501');
  });

  test('A2: a caller who is not the seated guest cannot write the session row', async () => {
    await resetRow(guestRoom.id);
    const client = anonWith({ code: guestRoom.code });
    await client.from('clarity_sessions').update({ live_state: { tampered: 'A2' }, mode: 'live' }).eq('id', guestRoom.id);
    await client.from('clarity_sessions').update({ state: { tampered: 'A2' } }).eq('id', guestRoom.id);
    await client.from('clarity_sessions').update({ demo_status: 'completed' }).eq('id', guestRoom.id);
    const after = await readRow(guestRoom.id);
    expect(after.live_state?.tampered, 'a non-guest overwrote live_state').toBeUndefined();
    expect(after.state?.tampered, 'a non-guest overwrote state').toBeUndefined();
    expect(after.demo_status, 'a non-guest changed demo_status').not.toBe('completed');
  });

  test('A3: another seat\'s credential does not open this room', async () => {
    await resetRow(guestRoom.id);
    const client = anonWith({ code: guestRoom.code, secret: otherRoom.secret });
    await client.rpc('patch_live_state', { p_session_id: guestRoom.id, p_patch: { tampered: 'A3-rpc' } });
    await client.from('clarity_sessions').update({ state: { tampered: 'A3-row' } }).eq('id', guestRoom.id);
    const after = await readRow(guestRoom.id);
    expect(after.live_state?.tampered).toBeUndefined();
    expect(after.state?.tampered).toBeUndefined();
  });

  test('A4: a seat with no credential (claimed before P1269) accepts no guest write — fail closed', async () => {
    await resetRow(legacyRoom.id);
    const client = anonWith({ code: legacyRoom.code });
    await client.rpc('patch_live_state', { p_session_id: legacyRoom.id, p_patch: { tampered: 'A4-rpc' } });
    await client.from('clarity_sessions').update({ state: { tampered: 'A4-row' } }).eq('id', legacyRoom.id);
    const after = await readRow(legacyRoom.id);
    expect(after.live_state?.tampered, 'a credential-less seat was written by a non-guest').toBeUndefined();
    expect(after.state?.tampered).toBeUndefined();
  });

  test('A5: the credential parser is not callable by a client role', async () => {
    const { error } = await anonWith().rpc('clarity_request_seat_secrets');
    // 42501 = exists and is refused. PGRST202 (no such function) would mean this test is blind.
    expect(error?.code).toBe('42501');
  });

  test('A6: a seat with no credential cannot be released by a caller who is not its guest', async () => {
    const room = await seed({ joiner_name: 'p1224 legacy leaver', joiner_seat_claimed_at: new Date().toISOString() });
    const { error } = await anonWith({ code: room.code })
      .rpc('release_joiner_seat', { p_session_id: room.id, p_code: room.code });
    const { data } = await supabaseAdmin
      .from('clarity_sessions').select('joiner_name, joiner_seat_claimed_at, live_state').eq('id', room.id).single();
    expect(data?.joiner_seat_claimed_at, 'a non-guest vacated a credential-less seat').not.toBeNull();
    expect(data?.joiner_name).toBe('p1224 legacy leaver');
    expect((data?.live_state as Record<string, unknown>)?.joinerEnded, 'a non-guest wrote live_state via release').toBeUndefined();
    expect(error?.code).toBe('42501');
  });

  test('A7: a seat with a credential cannot be released without it', async () => {
    const secret = crypto.randomUUID();
    const room = await seed({
      joiner_name: 'p1224 guarded leaver', joiner_seat_claimed_at: new Date().toISOString(), joiner_seat_secret: secret,
    });
    await anonWith({ code: room.code }).rpc('release_joiner_seat', { p_session_id: room.id, p_code: room.code });
    await anonWith({ code: room.code, secret: otherRoom.secret })
      .rpc('release_joiner_seat', { p_session_id: room.id, p_code: room.code, p_seat_secret: otherRoom.secret });
    const { data } = await supabaseAdmin
      .from('clarity_sessions').select('joiner_seat_claimed_at, live_state').eq('id', room.id).single();
    expect(data?.joiner_seat_claimed_at).not.toBeNull();
    expect((data?.live_state as Record<string, unknown>)?.joinerEnded).toBeUndefined();
  });

  test('A8: a guest who has left the seat keeps no write authority with its old credential', async () => {
    const secret = crypto.randomUUID();
    const room = await seed({
      joiner_name: 'p1224 departed guest', joiner_seat_claimed_at: new Date().toISOString(), joiner_seat_secret: secret,
    });
    const client = anonWith({ code: room.code, secret });
    const left = await client.rpc('release_joiner_seat', { p_session_id: room.id, p_code: room.code, p_seat_secret: secret });
    expect(left.error, left.error?.message).toBeNull();
    await resetRow(room.id);

    await client.rpc('patch_live_state', { p_session_id: room.id, p_patch: { tampered: 'A8-rpc' } });
    await client.from('clarity_sessions').update({ live_state: { tampered: 'A8-row' }, mode: 'live' }).eq('id', room.id);
    await client.from('clarity_sessions').update({ state: { tampered: 'A8-row' } }).eq('id', room.id);
    await client.from('clarity_sessions').update({ demo_status: 'completed' }).eq('id', room.id);
    const after = await readRow(room.id);
    expect(after.live_state?.tampered, 'a departed guest still wrote live_state').toBeUndefined();
    expect(after.state?.tampered, 'a departed guest still wrote state').toBeUndefined();
    expect(after.demo_status).not.toBe('completed');
    expect(after.joiner_seat_secret, 'leaving must retire the seat credential').toBeNull();
  });

  // ==========================================================================================
  // GROUP C — the product still works.
  // ==========================================================================================

  test('C1: the seated guest still patches live_state — the P399 merge keeps the partner\'s keys', async () => {
    await resetRow(guestRoom.id);
    const { error } = await anonWith({ code: guestRoom.code, secret: guestRoom.secret })
      .rpc('patch_live_state', { p_session_id: guestRoom.id, p_patch: { written: 'C1' } });
    const after = await readRow(guestRoom.id);
    expect(error, error?.message).toBeNull();
    expect(after.live_state?.written).toBe('C1');
    expect(after.live_state?.keep, 'the partial merge dropped a partner key').toBe('partner-key');
  });

  test('C2: the seated guest still writes the row directly (full overwrite, state, demo status)', async () => {
    await resetRow(guestRoom.id);
    const client = anonWith({ code: guestRoom.code, secret: guestRoom.secret });
    const r1 = await client.from('clarity_sessions').update({ live_state: { written: 'C2' }, mode: 'live' }).eq('id', guestRoom.id);
    const r2 = await client.from('clarity_sessions').update({ state: { written: 'C2' } }).eq('id', guestRoom.id);
    const r3 = await client.from('clarity_sessions').update({ demo_status: 'in_progress' }).eq('id', guestRoom.id);
    const after = await readRow(guestRoom.id);
    expect([r1.error, r2.error, r3.error]).toEqual([null, null, null]);
    expect(after.live_state?.written).toBe('C2');
    expect(after.mode).toBe('live');
    expect(after.state?.written).toBe('C2');
    expect(after.demo_status).toBe('in_progress');
  });

  test('C3: a real guest — claim, write, reload (reclaim with the stored secret), write again', async () => {
    const room = await seed({});
    // First claim, exactly as the client does it: no account, no secret held yet.
    const first = await anonWith({ code: room.code })
      .rpc('claim_joiner_seat', { p_code: room.code, p_joiner_name: 'p1224 real guest' });
    expect(first.error, first.error?.message).toBeNull();
    const minted = (Array.isArray(first.data) ? first.data[0] : first.data)?.joiner_seat_secret as string;
    expect(minted, 'claim_joiner_seat returned no secret to the guest').toMatch(/^[0-9a-f-]{36}$/);

    const tab = anonWith({ code: room.code, secret: minted });
    const w1 = await tab.rpc('patch_live_state', { p_session_id: room.id, p_patch: { step: 'before-reload' } });
    expect(w1.error, w1.error?.message).toBeNull();
    expect((await readRow(room.id)).live_state?.step).toBe('before-reload');

    // Reload: a fresh client restores the secret from storage and re-claims with it.
    const reloaded = anonWith({ code: room.code, secret: minted });
    const again = await reloaded.rpc('claim_joiner_seat', {
      p_code: room.code, p_joiner_name: 'p1224 real guest', p_seat_secret: minted,
    });
    expect(again.error, again.error?.message).toBeNull();
    const kept = (Array.isArray(again.data) ? again.data[0] : again.data)?.joiner_seat_secret;
    expect(kept, 'a reload must keep the same secret').toBe(minted);

    const w2 = await reloaded.rpc('patch_live_state', { p_session_id: room.id, p_patch: { step: 'after-reload' } });
    const w3 = await reloaded.from('clarity_sessions').update({ state: { step: 'after-reload' } }).eq('id', room.id);
    expect(w2.error, w2.error?.message).toBeNull();
    expect(w3.error, w3.error?.message).toBeNull();
    const after = await readRow(room.id);
    expect(after.live_state?.step).toBe('after-reload');
    expect(after.state?.step).toBe('after-reload');
  });

  test('C4: a guest of a secret-less seat recovers through the join path, then writes', async () => {
    // P1269 reads a secret-less seat's presence as its claim time; one claimed long ago is free.
    const room = await seed({
      joiner_name: 'p1224 returning legacy guest',
      joiner_seat_claimed_at: new Date(Date.now() - 60 * 60_000).toISOString(),
    });
    const claim = await anonWith({ code: room.code })
      .rpc('claim_joiner_seat', { p_code: room.code, p_joiner_name: 'p1224 returning legacy guest' });
    expect(claim.error, claim.error?.message).toBeNull();
    const fresh = (Array.isArray(claim.data) ? claim.data[0] : claim.data)?.joiner_seat_secret as string;
    expect(fresh).toMatch(/^[0-9a-f-]{36}$/);
    const w = await anonWith({ code: room.code, secret: fresh })
      .rpc('patch_live_state', { p_session_id: room.id, p_patch: { recovered: true } });
    expect(w.error, w.error?.message).toBeNull();
    expect((await readRow(room.id)).live_state?.recovered).toBe(true);
  });

  test('C5: a signed-in joiner writes by identity, no seat secret, on both paths (unchanged)', async () => {
    await resetRow(signedInRoom.id);
    const client = userClient(await tokenFor(joiner));
    const r1 = await client.rpc('patch_live_state', { p_session_id: signedInRoom.id, p_patch: { written: 'C5' } });
    const r2 = await client.from('clarity_sessions').update({ state: { written: 'C5' } }).eq('id', signedInRoom.id);
    const after = await readRow(signedInRoom.id);
    expect(r1.error, r1.error?.message).toBeNull();
    expect(r2.error, r2.error?.message).toBeNull();
    expect(after.live_state?.written).toBe('C5');
    expect(after.state?.written).toBe('C5');
  });

  test('C6: the creator of a guest room writes by identity, no seat secret, on both paths (unchanged)', async () => {
    await resetRow(guestRoom.id);
    const client = userClient(await tokenFor(host));
    const r1 = await client.rpc('patch_live_state', { p_session_id: guestRoom.id, p_patch: { written: 'C6' } });
    const r2 = await client.from('clarity_sessions').update({ state: { written: 'C6' } }).eq('id', guestRoom.id);
    const after = await readRow(guestRoom.id);
    expect(r1.error, r1.error?.message).toBeNull();
    expect(r2.error, r2.error?.message).toBeNull();
    expect(after.live_state?.written).toBe('C6');
    expect(after.state?.written).toBe('C6');
  });

  test('C7: a signed-in non-participant is still refused, and still without an error (contract unchanged)', async () => {
    await resetRow(guestRoom.id);
    const { error } = await userClient(await tokenFor(stranger))
      .rpc('patch_live_state', { p_session_id: guestRoom.id, p_patch: { tampered: 'C7' } });
    const after = await readRow(guestRoom.id);
    expect(after.live_state?.tampered).toBeUndefined();
    expect(error, 'the signed-in refusal contract changed').toBeNull();
  });

  test('C9: the seated guest can still leave — the release vacates the seat and tells the creator', async () => {
    const secret = crypto.randomUUID();
    const room = await seed({
      joiner_name: 'p1224 leaving guest', joiner_seat_claimed_at: new Date().toISOString(), joiner_seat_secret: secret,
    });
    // Exactly what the deployed client sends (api.ts clearSessionJoiner): id, code and secret.
    const { error } = await anonWith({ code: room.code, secret })
      .rpc('release_joiner_seat', { p_session_id: room.id, p_code: room.code, p_seat_secret: secret });
    const { data } = await supabaseAdmin
      .from('clarity_sessions').select('joiner_name, joiner_seat_claimed_at, live_state').eq('id', room.id).single();
    expect(error, error?.message).toBeNull();
    expect(data?.joiner_seat_claimed_at).toBeNull();
    expect(data?.joiner_name).toBeNull();
    expect((data?.live_state as Record<string, unknown>)?.joinerEnded).toBe(true);
  });

  test('C11: a guest who left can re-join, gets a NEW credential, and writes with it', async () => {
    const room = await seed({});
    const join = () => anonWith({ code: room.code })
      .rpc('claim_joiner_seat', { p_code: room.code, p_joiner_name: 'p1224 returning guest' });
    const first = await join();
    expect(first.error, first.error?.message).toBeNull();
    const s1 = (Array.isArray(first.data) ? first.data[0] : first.data)?.joiner_seat_secret as string;
    const left = await anonWith({ code: room.code, secret: s1 })
      .rpc('release_joiner_seat', { p_session_id: room.id, p_code: room.code, p_seat_secret: s1 });
    expect(left.error, left.error?.message).toBeNull();

    const second = await join();
    expect(second.error, second.error?.message).toBeNull();
    const s2 = (Array.isArray(second.data) ? second.data[0] : second.data)?.joiner_seat_secret as string;
    expect(s2).toMatch(/^[0-9a-f-]{36}$/);
    expect(s2, 're-joining must issue a new credential').not.toBe(s1);

    const w = await anonWith({ code: room.code, secret: s2 })
      .rpc('patch_live_state', { p_session_id: room.id, p_patch: { back: true } });
    expect(w.error, w.error?.message).toBeNull();
    expect((await readRow(room.id)).live_state?.back).toBe(true);
  });

  test('C10: a signed-in joiner still leaves by identity, with no code and no secret', async () => {
    const room = await seed({
      joiner_name: 'p1224 signed-in leaver', joiner_profile_id: joiner.user.id, joiner_seat_claimed_at: new Date().toISOString(),
    });
    const { error } = await userClient(await tokenFor(joiner)).rpc('release_joiner_seat', { p_session_id: room.id });
    const { data } = await supabaseAdmin
      .from('clarity_sessions').select('joiner_seat_claimed_at, live_state').eq('id', room.id).single();
    expect(error, error?.message).toBeNull();
    expect(data?.joiner_seat_claimed_at).toBeNull();
    expect((data?.live_state as Record<string, unknown>)?.joinerEnded).toBe(true);
  });

  test('C8: the seat secret is still unreadable by a guest (P1269 property this fix depends on)', async () => {
    const { error } = await anonWith({ code: guestRoom.code, secret: guestRoom.secret })
      .from('clarity_sessions').select('joiner_seat_secret').eq('id', guestRoom.id);
    expect(error?.code, 'anon could select the seat secret').toBe('42501');
  });
});
