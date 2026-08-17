/**
 * @file p1057-db-schema.spec.ts
 * @description Migration-layer canaries for P1057 (Migration A): the four SECURITY DEFINER
 * read accessors that must exist before the `code` column can be revoked from clients.
 *
 * WHAT THIS FILE IS FOR — and what it deliberately does NOT cover.
 *
 * The room `code` is the capability `claim_joiner_seat` accepts. Migration B revokes it from
 * `anon`/`authenticated`; that revocation and its behavioural proof live in
 * `p1057-code-column-gate.spec.ts`. THIS file asserts only the additive half:
 *
 *   1. Each RPC exists and carries exactly the EXECUTE grant it is supposed to carry —
 *      including the negative (`get_room_code_for_invite` must NOT be anon-executable).
 *   2. Each RPC returns exactly its declared column set, and that set never contains `code`.
 *      This is the assertion that catches a `RETURNS SETOF clarity_sessions` slipping back
 *      in later: SETOF binds the output to the table ROW TYPE, which contains `code`, and
 *      SECURITY DEFINER means no grant would stop it being handed back.
 *   3. Unknown code / bad length / ended / expired all return the SAME empty result — never
 *      a distinguishable error. The read must not become an existence oracle that today's
 *      code does not provide (today all these collapse to `return null` in JS).
 *   4. `get_room_code_for_invite` authorizes on IDENTITY, not on possession of the code:
 *      the invite's open target and the session creator may learn it; a third party may not,
 *      and a CLOSED invite revokes it from the former invitee.
 *
 * On (4) specifically — the negative test is the point of the function. The projection it
 * replaces (`clarity_live_invites … clarity_sessions(code)`) let ANY authenticated caller who
 * could read the invite row read the code beside it, so this is a strengthening rather than a
 * port, and an untested strengthening is just a claim.
 *
 * Every assertion re-reads through the ADMIN client (service_role, unconstrained by these
 * grants) when it needs ground truth, and asserts on persisted state rather than on the
 * absence of an error. Prior art for the structure: p1053-claim-joiner-seat.spec.ts.
 */

import { test, expect } from '@playwright/test';
import { supabaseAdmin } from '../helpers/supabase-admin';
import { createClient } from '@supabase/supabase-js';
import { createTestUser, generateTestEmail, deleteTestUser, TEST_PASSWORD, type TestUser } from '../helpers/test-user';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY!;

/** A client carrying NO session — PostgREST resolves this to the `anon` role. */
function makeAnonClient() {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/** A client carrying a real user JWT — PostgREST resolves this to `authenticated`. */
function makeUserClient(accessToken: string) {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function makeRoomCode() {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

/**
 * The 21 columns both session accessors declare — the full clarity_sessions column set
 * MINUS `code`. Asserted as an exact set, not a subset: a superset means a column leaked
 * into the output, a subset means the RETURNS TABLE drifted from the table.
 */
const EXPECTED_SESSION_COLUMNS = [
  'created_at', 'creator_name', 'creator_note', 'creator_profile_id', 'demo_status',
  'ended_at', 'expires_at', 'id', 'is_private', 'joiner_name', 'joiner_profile_id',
  'joiner_seat_claimed_at', 'last_activity_at', 'live_state', 'mode', 'partnership_status',
  'source_letter_id', 'source_story_id', 'state', 'status', 'target_listener_id',
].sort();

test.describe('P1057 Migration A: session read accessors', () => {
  let creator: TestUser;
  let invitee: TestUser;
  /**
   * A SECOND invitee, used only by the closed-invite test. clarity_live_invites carries a
   * unique partial index (idx_live_invites_one_open_per_user, target_user_id WHERE closed_at
   * IS NULL): one open invite per user, ever. Reusing `invitee` across both invite tests
   * makes the second insert collide with the first test's still-open invite, which surfaced
   * as an order-dependent flake rather than a clean failure. Separate users keep each test
   * independent of execution order instead of relying on a retry.
   */
  let invitee2: TestUser;
  let stranger: TestUser;
  const createdSessionIds: string[] = [];
  const createdInviteIds: string[] = [];

  /** Signs a test user in once and caches the JWT-carrying client (p1053 prior art). */
  const signInCache = new Map<string, ReturnType<typeof makeUserClient>>();
  async function signInAs(user: TestUser) {
    const cached = signInCache.get(user.user.id);
    if (cached) return cached;
    const { data: signIn, error: signInError } = await supabaseAdmin.auth.signInWithPassword({
      email: user.email, password: TEST_PASSWORD,
    });
    expect(signInError, `sign-in failed for ${user.email}: ${signInError?.message}`).toBeNull();
    const client = makeUserClient(signIn!.session!.access_token);
    await supabaseAdmin.auth.signOut();
    signInCache.set(user.user.id, client);
    return client;
  }

  /** Seeds the shape 94% of live rows are in: target_listener_id IS NULL. */
  async function seedRoom(
    label: string,
    opts: { ended?: boolean; stale?: boolean; code?: string } = {},
  ) {
    const code = opts.code ?? makeRoomCode();
    // `stale` puts last_activity_at well outside the 120s grace window so
    // get_active_session_by_code must refuse it while get_session_by_code still returns it.
    const lastActivity = opts.stale
      ? new Date(Date.now() - 3600_000).toISOString()
      : new Date().toISOString();

    const { data, error } = await supabaseAdmin
      .from('clarity_sessions')
      .insert({
        code,
        creator_name: `P1057 ${label}`,
        creator_profile_id: creator.user.id,
        target_listener_id: null,
        state: {},
        demo_status: 'waiting',
        partnership_status: 'pending',
        last_activity_at: lastActivity,
        live_state: opts.ended ? { sessionEnded: true } : {},
      })
      .select('id')
      .single();

    expect(error, `seed ${label} must succeed`).toBeNull();
    createdSessionIds.push(data!.id);
    return { id: data!.id as string, code };
  }

  test.beforeAll(async () => {
    creator = await createTestUser({ email: generateTestEmail(), name: 'P1057 Creator' });
    invitee = await createTestUser({ email: generateTestEmail(), name: 'P1057 Invitee' });
    invitee2 = await createTestUser({ email: generateTestEmail(), name: 'P1057 Invitee Two' });
    stranger = await createTestUser({ email: generateTestEmail(), name: 'P1057 Stranger' });
  });

  test.afterAll(async () => {
    if (createdInviteIds.length) {
      await supabaseAdmin.from('clarity_live_invites').delete().in('id', createdInviteIds);
    }
    if (createdSessionIds.length) {
      await supabaseAdmin.from('clarity_sessions').delete().in('id', createdSessionIds);
    }
    for (const u of [creator, invitee, invitee2, stranger]) {
      if (u?.user?.id) await deleteTestUser(u.user.id);
    }
  });

  // ── 1. Grants ───────────────────────────────────────────────────────────────────────

  test('get_session_by_code and get_active_session_by_code are anon-executable', async () => {
    // Deliberate: the guest join path has no session. A cold /live/:code visit resolves the
    // room before any auth exists. Recorded in scripts/anon-execute-allowlist.txt.
    const anon = makeAnonClient();

    for (const fn of ['get_session_by_code', 'get_active_session_by_code']) {
      const { error } = await anon.rpc(fn, { p_code: 'ZZZZZ9' });
      expect(error, `${fn} must be reachable by anon`).toBeNull();
    }
  });

  test('get_practice_room_codes is anon-executable (P406 public event pages)', async () => {
    const anon = makeAnonClient();
    const { error } = await anon.rpc('get_practice_room_codes', {
      p_event_id: '00000000-0000-0000-0000-000000000000',
    });
    expect(error).toBeNull();
  });

  test('get_room_code_for_invite is NOT anon-executable', async () => {
    // The negative half of the grant. `REVOKE ALL … FROM PUBLIC` and `FROM anon,
    // authenticated` are each a silent no-op against the other's grant, so this asserts the
    // live ACL rather than the migration text.
    const anon = makeAnonClient();
    const { error } = await anon.rpc('get_room_code_for_invite', {
      p_session_id: '00000000-0000-0000-0000-000000000000',
    });
    expect(error, 'anon must be refused').not.toBeNull();
    expect(error!.code).toBe('42501');
  });

  // ── 2. Return shape — the SETOF regression guard ─────────────────────────────────────

  test('get_session_by_code returns exactly its declared 21 columns, and never `code`', async () => {
    const room = await seedRoom('shape');
    const anon = makeAnonClient();

    const { data, error } = await anon.rpc('get_session_by_code', { p_code: room.code });
    expect(error).toBeNull();
    expect(Array.isArray(data)).toBe(true);
    expect(data).toHaveLength(1);

    const keys = Object.keys(data![0]).sort();
    expect(keys).not.toContain('code');
    expect(keys).toEqual(EXPECTED_SESSION_COLUMNS);
  });

  test('get_active_session_by_code returns exactly its declared 21 columns, and never `code`', async () => {
    const room = await seedRoom('shape-active');
    const anon = makeAnonClient();

    const { data, error } = await anon.rpc('get_active_session_by_code', { p_code: room.code });
    expect(error).toBeNull();
    expect(data).toHaveLength(1);

    const keys = Object.keys(data![0]).sort();
    expect(keys).not.toContain('code');
    expect(keys).toEqual(EXPECTED_SESSION_COLUMNS);
  });

  test('the lookup normalizes case and surrounding whitespace, like claim_joiner_seat', async () => {
    const room = await seedRoom('normalize');
    const anon = makeAnonClient();

    const { data } = await anon.rpc('get_session_by_code', { p_code: room.code.toLowerCase() });
    expect(data, 'a lowercased code must resolve the same room').toHaveLength(1);

    const { data: padded } = await anon.rpc('get_session_by_code', { p_code: ` ${room.code} ` });
    expect(padded, 'surrounding whitespace must be trimmed').toHaveLength(1);
  });

  // ── 3. One refusal channel — no existence oracle ─────────────────────────────────────

  test('unknown code, wrong length and NULL all return the SAME empty result', async () => {
    const anon = makeAnonClient();

    for (const p_code of ['ZZZZZ9', 'AB', '', null]) {
      const { data, error } = await anon.rpc('get_session_by_code', { p_code });
      expect(error, `p_code=${JSON.stringify(p_code)} must not raise`).toBeNull();
      expect(data, `p_code=${JSON.stringify(p_code)} must be an empty set`).toEqual([]);
    }
  });

  test('get_active_session_by_code refuses ended and stale rooms — indistinguishably from unknown', async () => {
    const ended = await seedRoom('ended', { ended: true });
    const stale = await seedRoom('stale', { stale: true });
    const anon = makeAnonClient();

    // Both refusals must look exactly like the unknown-code refusal above: [] and no error.
    const { data: endedData, error: endedErr } = await anon.rpc('get_active_session_by_code', { p_code: ended.code });
    expect(endedErr).toBeNull();
    expect(endedData).toEqual([]);

    const { data: staleData, error: staleErr } = await anon.rpc('get_active_session_by_code', { p_code: stale.code });
    expect(staleErr).toBeNull();
    expect(staleData).toEqual([]);

    // Control: the SAME rooms are still visible through the unfiltered accessor. Without
    // this, a function that always returned [] would pass the two assertions above.
    const { data: endedViaPlain } = await anon.rpc('get_session_by_code', { p_code: ended.code });
    expect(endedViaPlain, 'get_session_by_code must NOT apply the ended/grace filter').toHaveLength(1);
    const { data: staleViaPlain } = await anon.rpc('get_session_by_code', { p_code: stale.code });
    expect(staleViaPlain).toHaveLength(1);
  });

  // ── 4. get_room_code_for_invite — authorization is identity, not possession ──────────

  test('the invite target learns the code; a third party does not', async () => {
    const room = await seedRoom('invite');

    const { data: invite, error: inviteErr } = await supabaseAdmin
      .from('clarity_live_invites')
      .insert({ session_id: room.id, target_user_id: invitee.user.id })
      .select('id')
      .single();
    expect(inviteErr).toBeNull();
    createdInviteIds.push(invite!.id);

    // The invitee — being invited IS the capability grant.
    const inviteeClient = await signInAs(invitee);
    const { data: asInvitee, error: inviteeErr } = await inviteeClient.rpc('get_room_code_for_invite', {
      p_session_id: room.id,
    });
    expect(inviteeErr).toBeNull();
    expect(asInvitee).toBe(room.code);

    // The creator — minted the code, always allowed.
    const creatorClient = await signInAs(creator);
    const { data: asCreator } = await creatorClient.rpc('get_room_code_for_invite', {
      p_session_id: room.id,
    });
    expect(asCreator).toBe(room.code);

    // A third authenticated party — refused. This is the case the embedded projection this
    // function replaces did NOT refuse.
    const strangerClient = await signInAs(stranger);
    const { data: asStranger, error: strangerErr } = await strangerClient.rpc('get_room_code_for_invite', {
      p_session_id: room.id,
    });
    expect(strangerErr, 'refusal must be silent, not a distinguishable error').toBeNull();
    expect(asStranger, 'a stranger must learn nothing').toBeNull();
  });

  test('closing the invite revokes the code from the former invitee', async () => {
    const room = await seedRoom('invite-closed');

    const { data: invite, error: inviteErr } = await supabaseAdmin
      .from('clarity_live_invites')
      .insert({ session_id: room.id, target_user_id: invitee2.user.id })
      .select('id')
      .single();
    // Assert the seed rather than dereferencing it — a unique-index collision here must read
    // as "the fixture is wrong", not as a null-property TypeError three lines later.
    expect(inviteErr, 'invite seed must succeed').toBeNull();
    createdInviteIds.push(invite!.id);

    const inviteeClient = await signInAs(invitee2);

    // Control first: while open, the invitee CAN read it. Without this the test below
    // would pass against a function that never returns anything.
    const { data: whileOpen } = await inviteeClient.rpc('get_room_code_for_invite', {
      p_session_id: room.id,
    });
    expect(whileOpen).toBe(room.code);

    await supabaseAdmin
      .from('clarity_live_invites')
      .update({ closed_at: new Date().toISOString() })
      .eq('id', invite!.id);

    const { data: afterClose } = await inviteeClient.rpc('get_room_code_for_invite', {
      p_session_id: room.id,
    });
    expect(afterClose, 'a closed invite must no longer yield the code').toBeNull();

    // …but the creator still can. Closing an invite is not a lockout of the room's owner.
    const creatorClient = await signInAs(creator);
    const { data: creatorAfterClose } = await creatorClient.rpc('get_room_code_for_invite', {
      p_session_id: room.id,
    });
    expect(creatorAfterClose).toBe(room.code);
  });

  test('a NULL session id yields nothing rather than an error', async () => {
    const creatorClient = await signInAs(creator);
    const { data, error } = await creatorClient.rpc('get_room_code_for_invite', {
      p_session_id: null,
    });
    expect(error).toBeNull();
    expect(data).toBeNull();
  });

  // ── 5. claim_joiner_seat is unaffected ──────────────────────────────────────────────

  test('claim_joiner_seat still exists and still refuses a bad code with the generic message', async () => {
    // P1057 must not touch the write path. This is the regression control for the claim in
    // the spec's Dependencies section: claim_joiner_seat is SECURITY DEFINER, so the column
    // grants do not constrain it, and its signature is explicitly out of scope.
    const anon = makeAnonClient();
    const { error } = await anon.rpc('claim_joiner_seat', {
      p_code: 'ZZZZZ9',
      p_joiner_name: 'p1057 control',
    });
    expect(error, 'the RPC must exist (a PGRST202 here means it was dropped)').not.toBeNull();
    expect(error!.code).toBe('42501');
    expect(error!.message).toBe('cannot join this room');
  });
});
