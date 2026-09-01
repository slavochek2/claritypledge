/**
 * @file p1097-csprng-room-code-migration.spec.ts
 * @description P1097 — room codes are minted server-side from a CSPRNG; the client can
 * no longer supply one.
 *
 * Migration A (20260901200000): BEFORE INSERT trigger fills `code` via
 *   mint_clarity_room_code() — gen_random_bytes() over a 32-symbol alphabet, retry on
 *   collision. Callable by service_role only.
 * Migration B (20260901200100): INSERT on clarity_sessions.code revoked from anon and
 *   authenticated (table-level INSERT replaced by an explicit column list).
 *
 * The collision-retry branch is PROVEN, not assumed: with p_length = 1 the keyspace is 32
 * codes. Pre-inserting 31 of them makes a free first draw a 1-in-32 event; five consecutive
 * correct returns (p ≈ 3e-8 by luck) prove the loop re-drew past the taken codes. Then the
 * 32nd is taken and the mint must refuse rather than spin.
 *
 * Run: npx playwright test --project=integration e2e/integration/p1097-csprng-room-code-migration.spec.ts
 */

import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { supabaseAdmin } from '../helpers/supabase-admin';
import {
  createTestUser,
  generateTestEmail,
  deleteTestUser,
  TEST_PASSWORD,
  type TestUser,
} from '../helpers/test-user';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY!;

// The alphabet in mint_clarity_room_code(): A-Z minus I and O, 2-9 (no 0, 1).
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_RE = /^[A-HJ-NP-Z2-9]{6}$/;

function makeUserClient(accessToken: string) {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function signIn(email: string): Promise<string> {
  const { data, error } = await supabaseAdmin.auth.signInWithPassword({ email, password: TEST_PASSWORD });
  await supabaseAdmin.auth.signOut();
  if (error || !data.session) throw new Error(`sign-in failed for ${email}: ${error?.message}`);
  return data.session.access_token;
}

async function cleanupSessions(ids: string[]) {
  if (ids.length === 0) return;
  await supabaseAdmin.from('clarity_sessions').delete().in('id', ids);
}

test.describe('P1097 Migration A — server-side mint', () => {
  let host: TestUser;
  let stranger: TestUser;

  test.beforeAll(async () => {
    host = await createTestUser({ email: generateTestEmail(), name: 'P1097 Host' });
    stranger = await createTestUser({ email: generateTestEmail(), name: 'P1097 Stranger' });
  });

  test.afterAll(async () => {
    await deleteTestUser(host.user.id);
    await deleteTestUser(stranger.user.id);
  });

  test('a row inserted without a code receives a 6-symbol code from the alphabet', async () => {
    const ids: string[] = [];
    try {
      const { data, error } = await supabaseAdmin
        .from('clarity_sessions')
        .insert({ creator_name: 'P1097 trigger', creator_profile_id: host.user.id, state: {} })
        .select('id, code')
        .single();
      expect(error, `insert without code should succeed: ${error?.message}`).toBeNull();
      ids.push(data!.id);
      expect(data!.code).toMatch(CODE_RE);
    } finally {
      await cleanupSessions(ids);
    }
  });

  test('a supplied code is respected (service_role fixtures keep working)', async () => {
    const ids: string[] = [];
    const explicit = `P1097-${Date.now().toString(36).toUpperCase()}`;
    try {
      const { data, error } = await supabaseAdmin
        .from('clarity_sessions')
        .insert({ code: explicit, creator_name: 'P1097 explicit', creator_profile_id: host.user.id, state: {} })
        .select('id, code')
        .single();
      expect(error).toBeNull();
      ids.push(data!.id);
      expect(data!.code).toBe(explicit);
    } finally {
      await cleanupSessions(ids);
    }
  });

  test('a verified user creates a room without a code and learns it via get_room_code_for_invite; a stranger learns nothing', async () => {
    const ids: string[] = [];
    try {
      const hostClient = makeUserClient(await signIn(host.email));
      const { data, error } = await hostClient
        .from('clarity_sessions')
        .insert({ creator_name: 'P1097 host room', creator_profile_id: host.user.id, state: {} })
        .select('id')
        .single();
      expect(error, `verified host insert without code should pass RLS: ${error?.message}`).toBeNull();
      ids.push(data!.id);

      const { data: code, error: revealError } = await hostClient.rpc('get_room_code_for_invite', {
        p_session_id: data!.id,
      });
      expect(revealError).toBeNull();
      expect(code).toMatch(CODE_RE);

      // Ground truth: the revealed code is the row's code.
      const { data: row } = await supabaseAdmin.from('clarity_sessions').select('code').eq('id', data!.id).single();
      expect(row!.code).toBe(code);

      const strangerClient = makeUserClient(await signIn(stranger.email));
      const { data: leaked, error: strangerError } = await strangerClient.rpc('get_room_code_for_invite', {
        p_session_id: data!.id,
      });
      expect(strangerError).toBeNull();
      expect(leaked).toBeNull();
    } finally {
      await cleanupSessions(ids);
    }
  });

  test('25 default draws are distinct and well-formed', async () => {
    const codes = new Set<string>();
    for (let i = 0; i < 25; i++) {
      const { data, error } = await supabaseAdmin.rpc('mint_clarity_room_code');
      expect(error, `mint failed: ${error?.message}`).toBeNull();
      expect(data).toMatch(CODE_RE);
      codes.add(data as string);
    }
    expect(codes.size).toBe(25);
  });

  test('collision retry, proven on a 1-symbol keyspace: 31 of 32 taken → the free one is returned; 32 of 32 → refuses', async () => {
    const ids: string[] = [];
    const freeSymbol = ALPHABET[Math.floor(Math.random() * ALPHABET.length)]; // which one is free is irrelevant
    try {
      // Occupy every 1-symbol code except `freeSymbol`. Real rooms are 6+ symbols, so these
      // collide with nothing else on the shared test DB.
      const taken = ALPHABET.split('').filter((c) => c !== freeSymbol);
      const { data: rows, error: seedError } = await supabaseAdmin
        .from('clarity_sessions')
        .insert(taken.map((c) => ({ code: c, creator_name: 'P1097 keyspace seed', state: {} })))
        .select('id, code');
      expect(seedError, `seeding 31 one-symbol rows failed: ${seedError?.message}`).toBeNull();
      expect(rows!.length).toBe(31);
      ids.push(...rows!.map((r) => r.id));

      for (let i = 0; i < 5; i++) {
        const { data, error } = await supabaseAdmin.rpc('mint_clarity_room_code', {
          p_length: 1,
          p_max_attempts: 512,
        });
        expect(error, `mint on a 31/32-full keyspace failed: ${error?.message}`).toBeNull();
        expect(data, 'the only code the retry loop can legally return is the one free symbol').toBe(freeSymbol);
      }

      // Take the last one: the mint must now fail loudly, not loop forever or return a dup.
      const { data: last, error: lastSeedError } = await supabaseAdmin
        .from('clarity_sessions')
        .insert({ code: freeSymbol, creator_name: 'P1097 keyspace seed (last)', state: {} })
        .select('id')
        .single();
      expect(lastSeedError).toBeNull();
      ids.push(last!.id);

      const { data: exhausted, error: exhaustedError } = await supabaseAdmin.rpc('mint_clarity_room_code', {
        p_length: 1,
        p_max_attempts: 64,
      });
      expect(exhausted).toBeNull();
      expect(exhaustedError).not.toBeNull();
      expect(exhaustedError!.message).toMatch(/no free room code after 64 attempts/);
    } finally {
      await cleanupSessions(ids);
    }
  });

  test('authenticated cannot call mint_clarity_room_code directly', async () => {
    const hostClient = makeUserClient(await signIn(host.email));
    const { data, error } = await hostClient.rpc('mint_clarity_room_code');
    expect(data).toBeNull();
    expect(error).not.toBeNull();
    expect(error!.code).toBe('42501');
  });
});

test.describe('P1097 Migration B — the client cannot supply a code', () => {
  let host: TestUser;

  test.beforeAll(async () => {
    host = await createTestUser({ email: generateTestEmail(), name: 'P1097 Host B' });
  });

  test.afterAll(async () => {
    await deleteTestUser(host.user.id);
  });

  test('a verified user inserting WITH a code is refused at the column grant (42501)', async () => {
    const ids: string[] = [];
    try {
      const hostClient = makeUserClient(await signIn(host.email));
      const { data, error } = await hostClient
        .from('clarity_sessions')
        .insert({ code: 'CHOSEN', creator_name: 'P1097 chosen code', creator_profile_id: host.user.id, state: {} })
        .select('id')
        .single();
      if (data?.id) ids.push(data.id);
      expect(error, 'Migration B not applied: a client chose its own room code').not.toBeNull();
      expect(error!.code).toBe('42501');
    } finally {
      await cleanupSessions(ids);
    }
  });

  test('positive control: the same user inserting WITHOUT a code still succeeds', async () => {
    const ids: string[] = [];
    try {
      const hostClient = makeUserClient(await signIn(host.email));
      const { data, error } = await hostClient
        .from('clarity_sessions')
        .insert({ creator_name: 'P1097 no code', creator_profile_id: host.user.id, state: {} })
        .select('id')
        .single();
      expect(error, `the column-list GRANT is narrower than the client payload: ${error?.message}`).toBeNull();
      ids.push(data!.id);
    } finally {
      await cleanupSessions(ids);
    }
  });

  test('positive control: every column the production INSERT payload sends is still grantable', async () => {
    // Mirrors the createClaritySession payload (api.ts) including the letter-sourced
    // fields, with NULLs — the grant check is per column, not per value.
    const ids: string[] = [];
    try {
      const hostClient = makeUserClient(await signIn(host.email));
      const { data, error } = await hostClient
        .from('clarity_sessions')
        .insert({
          creator_name: 'P1097 full payload',
          creator_note: 'note',
          creator_profile_id: host.user.id,
          state: {},
          demo_status: 'waiting',
          partnership_status: 'pending',
          is_private: true,
          source_letter_id: null,
          source_story_id: null,
          target_listener_id: null,
        })
        .select('id')
        .single();
      expect(error, `production payload rejected: ${error?.message}`).toBeNull();
      ids.push(data!.id);
    } finally {
      await cleanupSessions(ids);
    }
  });
});
