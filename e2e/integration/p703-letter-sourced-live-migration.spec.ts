/**
 * @file p703-letter-sourced-live-migration.spec.ts
 * @description P703: Letter-sourced /live — DB migration + RLS canaries
 *
 * Verifies:
 * 1. Schema: new columns on clarity_sessions, new clarity_live_invites table
 * 2. RLS canaries (Build Sequence step 8, Security Review):
 *    (a) Non-recipient UPDATE letter-sourced session → blocked (42501)
 *    (b) Unauthenticated SELECT letter-sourced session → 0 rows (SELECT gate RLS-4)
 *    (c) Non-author INSERT session with foreign source_letter_id → blocked (RLS-2)
 *    (d) Author INSERT invite for non-recipient listener → blocked (RLS-3)
 *    (e) complete_clarity_session called by non-participant → error (Authz-2)
 * 3. complete_clarity_session atomicity: session.status + invite.closed_at in one call
 * 4. Resend rate-limit: second bump within 30s rejected
 * 5. Unique partial index: second open invite for same listener → 23505
 *
 * If tests fail: run `./scripts/migrate.sh` to apply P703 migration.
 *
 * TWO-CLIENT PATTERN:
 * - supabaseAdmin: schema-level ops, seeding (bypasses RLS)
 * - signIn() → makeUserClient(): RLS assertions (user JWT)
 * - makeAnonClient(): unauthenticated assertions
 */

import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { supabaseAdmin } from '../helpers/supabase-admin';
import { createTestUser, deleteTestUser, type TestUser } from '../helpers/test-user';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY!;
const TEST_PASSWORD = 'test-password-12345'; // gitleaks:allow

// ─── Client factories ─────────────────────────────────────────────────────────

function makeAnonClient() {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function makeUserClient(accessToken: string) {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function signIn(email: string): Promise<string> {
  // Use a fresh temp client — never sign in on supabaseAdmin (corrupts its session)
  const tempClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data, error } = await tempClient.auth.signInWithPassword({
    email,
    password: TEST_PASSWORD,
  });
  if (error || !data.session) throw new Error(`Sign-in failed for ${email}: ${error?.message}`);
  return data.session.access_token;
}

// ─── Seed helpers ─────────────────────────────────────────────────────────────

/**
 * Seeds a letter-sourced clarity_session via admin (bypasses RLS).
 * Returns the session id and code for use in canary tests.
 */
async function seedLetterSourcedSession(opts: {
  creatorProfileId: string;
  targetListenerId: string;
  sourceLetterId?: string;
  sourceStoryId?: string;
}): Promise<{ id: string; code: string }> {
  const code = `P703T${Date.now().toString(36).toUpperCase()}`;
  const { data, error } = await supabaseAdmin
    .from('clarity_sessions')
    .insert({
      code,
      creator_name: 'P703 Test Author',
      creator_profile_id: opts.creatorProfileId,
      target_listener_id: opts.targetListenerId,
      source_letter_id: opts.sourceLetterId ?? null,
      source_story_id: opts.sourceStoryId ?? null,
      live_state: { checksCount: 0 },
      last_activity_at: new Date().toISOString(),
    })
    .select('id, code')
    .single();
  if (error || !data) throw new Error(`Failed to seed letter-sourced session: ${error?.message}`);
  return { id: data.id, code: data.code };
}

/**
 * Seeds a clarity_live_invites row via admin.
 * Returns the invite id.
 */
async function seedInvite(sessionId: string, targetUserId: string): Promise<string> {
  const { data, error } = await supabaseAdmin
    .from('clarity_live_invites')
    .insert({ session_id: sessionId, target_user_id: targetUserId })
    .select('id')
    .single();
  if (error || !data) throw new Error(`Failed to seed invite: ${error?.message}`);
  return data.id;
}

async function cleanupSession(id: string | undefined) {
  if (id) {
    // Invites cascade-delete via FK ON DELETE CASCADE
    await supabaseAdmin.from('clarity_sessions').delete().eq('id', id);
  }
}

async function cleanupInvite(id: string | undefined) {
  if (id) {
    await supabaseAdmin.from('clarity_live_invites').delete().eq('id', id);
  }
}

// =============================================================================
// 1. Schema existence
// =============================================================================

test.describe('P703 Migration — Schema existence', () => {
  test.setTimeout(30000);

  test('clarity_sessions has source_story_id column', async () => {
    const { error } = await supabaseAdmin
      .from('clarity_sessions')
      .select('source_story_id')
      .limit(1);
    expect(error, 'source_story_id missing from clarity_sessions — run ./scripts/migrate.sh').toBeNull();
  });

  test('clarity_sessions has target_listener_id column', async () => {
    const { error } = await supabaseAdmin
      .from('clarity_sessions')
      .select('target_listener_id')
      .limit(1);
    expect(error, 'target_listener_id missing from clarity_sessions — run ./scripts/migrate.sh').toBeNull();
  });

  test('clarity_live_invites table exists with required columns', async () => {
    const columns = ['id', 'session_id', 'target_user_id', 'created_at', 'closed_at'];
    for (const col of columns) {
      const { error } = await supabaseAdmin
        .from('clarity_live_invites')
        .select(col)
        .limit(1);
      expect(error, `clarity_live_invites.${col} missing — run ./scripts/migrate.sh`).toBeNull();
    }
  });

  test('complete_clarity_session RPC exists', async () => {
    // Call with a bogus UUID — we expect an authorization error, not "function does not exist"
    const { error } = await supabaseAdmin.rpc('complete_clarity_session', {
      p_session_id: '00000000-0000-0000-0000-000000000000',
    });
    // "not authorized" error is expected (no matching session) — that's fine
    // "function does not exist" (SQLSTATE 42883) means migration not applied
    expect(
      error?.code ?? '',
      `complete_clarity_session RPC missing — run ./scripts/migrate.sh. Got: ${error?.message}`
    ).not.toBe('42883');
  });
});

// =============================================================================
// 2. RLS canary (a) — non-recipient UPDATE → blocked
//    Security finding: RLS-1 (UPDATE WITH CHECK must carry target_listener predicate)
// =============================================================================

test.describe('P703 RLS canary (a) — non-recipient cannot UPDATE letter-sourced session', () => {
  test.setTimeout(30000);

  let author: TestUser;
  let listener: TestUser;
  let stranger: TestUser;
  let sessionId: string | undefined;

  test.beforeAll(async () => {
    [author, listener, stranger] = await Promise.all([
      createTestUser({ name: 'P703 Author A' }),
      createTestUser({ name: 'P703 Listener A' }),
      createTestUser({ name: 'P703 Stranger A' }),
    ]);
    const s = await seedLetterSourcedSession({
      creatorProfileId: author.user.id,
      targetListenerId: listener.user.id,
    });
    sessionId = s.id;
  });

  test.afterAll(async () => {
    await cleanupSession(sessionId);
    await Promise.all([
      deleteTestUser(author.user.id),
      deleteTestUser(listener.user.id),
      deleteTestUser(stranger.user.id),
    ]);
  });

  test('stranger cannot UPDATE a letter-sourced session (join gate)', async () => {
    const token = await signIn(stranger.email);
    const strangerClient = makeUserClient(token);

    // RLS USING clause silently blocks — no error is thrown, but 0 rows are updated.
    // Verify by checking the row state: joiner_profile_id must still be null.
    await strangerClient
      .from('clarity_sessions')
      .update({ joiner_name: 'Intruder', joiner_profile_id: stranger.user.id })
      .eq('id', sessionId!);

    const { data: row } = await supabaseAdmin
      .from('clarity_sessions')
      .select('joiner_profile_id')
      .eq('id', sessionId!)
      .single();

    expect(
      row?.joiner_profile_id,
      `RLS-1 not enforced: stranger joined a letter-sourced session. ` +
      `target_listener_id predicate missing from UPDATE WITH CHECK.`
    ).toBeNull();
  });

  test('target listener CAN UPDATE the letter-sourced session (positive)', async () => {
    const token = await signIn(listener.email);
    const listenerClient = makeUserClient(token);

    const { error } = await listenerClient
      .from('clarity_sessions')
      .update({ joiner_name: 'Real Listener', joiner_profile_id: listener.user.id })
      .eq('id', sessionId!);

    expect(error, `Target listener should be able to join: ${error?.message}`).toBeNull();
  });
});

// =============================================================================
// 3. RLS canary (b) — unauthenticated SELECT letter-sourced session → 0 rows
//    Security finding: RLS-4 (SELECT policy must gate letter-sourced rows)
// =============================================================================

test.describe('P703 RLS canary (b) — unauthenticated SELECT letter-sourced session', () => {
  test.setTimeout(20000);

  let author: TestUser;
  let listener: TestUser;
  let sessionId: string | undefined;

  test.beforeAll(async () => {
    [author, listener] = await Promise.all([
      createTestUser({ name: 'P703 Author B' }),
      createTestUser({ name: 'P703 Listener B' }),
    ]);
    const s = await seedLetterSourcedSession({
      creatorProfileId: author.user.id,
      targetListenerId: listener.user.id,
    });
    sessionId = s.id;
  });

  test.afterAll(async () => {
    await cleanupSession(sessionId);
    await Promise.all([deleteTestUser(author.user.id), deleteTestUser(listener.user.id)]);
  });

  test('anonymous caller cannot SELECT a letter-sourced session by id', async () => {
    const anonClient = makeAnonClient();
    const { data } = await anonClient
      .from('clarity_sessions')
      .select('id, target_listener_id')
      .eq('id', sessionId!);

    expect(
      (data ?? []).length,
      `RLS-4 not enforced: unauthenticated caller read a letter-sourced session. ` +
      `SELECT policy must gate rows where target_listener_id IS NOT NULL.`
    ).toBe(0);
  });
});

// =============================================================================
// 4. RLS canary (c) — non-author INSERT session with foreign source_letter_id → blocked
//    Security finding: RLS-2 (INSERT must validate letter authorship)
// =============================================================================

test.describe('P703 RLS canary (c) — non-author cannot INSERT session with foreign source_letter_id', () => {
  test.setTimeout(30000);

  let realAuthor: TestUser;
  let impostor: TestUser;
  let listener: TestUser;
  let letterId: string | undefined;
  let docId: string | undefined;

  test.beforeAll(async () => {
    [realAuthor, impostor, listener] = await Promise.all([
      createTestUser({ name: 'P703 RealAuthor C' }),
      createTestUser({ name: 'P703 Impostor C' }),
      createTestUser({ name: 'P703 Listener C' }),
    ]);

    // Seed a real letter owned by realAuthor
    const { data: doc } = await supabaseAdmin
      .from('clarity_docs')
      .insert({ title: 'P703 Canary C Doc', owner_id: realAuthor.user.id })
      .select('id').single();
    docId = doc!.id;

    const { data: letter } = await supabaseAdmin
      .from('clarity_letters')
      .insert({ source_doc_id: docId, sender_id: realAuthor.user.id, mode: 'one-to-one', status: 'sealed', sealed_at: new Date().toISOString() })
      .select('id').single();
    letterId = letter!.id;
  });

  test.afterAll(async () => {
    if (letterId) await supabaseAdmin.from('clarity_letters').delete().eq('id', letterId);
    if (docId) await supabaseAdmin.from('clarity_docs').delete().eq('id', docId);
    await Promise.all([
      deleteTestUser(realAuthor.user.id),
      deleteTestUser(impostor.user.id),
      deleteTestUser(listener.user.id),
    ]);
  });

  test('impostor cannot INSERT a session citing someone else\'s source_letter_id', async () => {
    const token = await signIn(impostor.email);
    const impostorClient = makeUserClient(token);

    let sessionId: string | undefined;
    try {
      const { data, error } = await impostorClient
        .from('clarity_sessions')
        .insert({
          // P1097: no client-supplied code — the column is INSERT-revoked; the server mints it.
          creator_name: 'Impostor',
          creator_profile_id: impostor.user.id,
          source_letter_id: letterId,
          target_listener_id: listener.user.id,
        })
        .select('id').single();
      sessionId = data?.id;

      expect(
        error,
        `RLS-2 not enforced: impostor created a session citing another user's letter. ` +
        `INSERT WITH CHECK must validate letter.author_id = auth.uid().`
      ).not.toBeNull();
    } finally {
      await cleanupSession(sessionId);
    }
  });
});

// =============================================================================
// 5. RLS canary (d) — author INSERT invite for non-recipient listener → blocked
//    Security finding: RLS-3 (invite INSERT WITH CHECK validates delivery membership)
// =============================================================================

test.describe('P703 RLS canary (d) — author cannot invite non-recipient listener', () => {
  test.setTimeout(30000);

  let author: TestUser;
  let recipient: TestUser;
  let nonRecipient: TestUser;
  let sessionId: string | undefined;
  let letterId: string | undefined;
  let docId: string | undefined;

  test.beforeAll(async () => {
    [author, recipient, nonRecipient] = await Promise.all([
      createTestUser({ name: 'P703 Author D' }),
      createTestUser({ name: 'P703 Recipient D' }),
      createTestUser({ name: 'P703 NonRecipient D' }),
    ]);

    // Seed a letter + delivery to recipient only
    const { data: doc } = await supabaseAdmin
      .from('clarity_docs')
      .insert({ title: 'P703 Canary D Doc', owner_id: author.user.id })
      .select('id').single();
    docId = doc!.id;

    const { data: letter } = await supabaseAdmin
      .from('clarity_letters')
      .insert({ source_doc_id: docId, sender_id: author.user.id, mode: 'one-to-one', status: 'sealed', sealed_at: new Date().toISOString() })
      .select('id').single();
    letterId = letter!.id;

    // Delivery to recipient (not to nonRecipient)
    await supabaseAdmin.from('letter_deliveries').insert({
      letter_id: letterId,
      receiver_email: recipient.email,
      receiver_profile_id: recipient.user.id,
      status: 'sent',
    });

    // Session targeting the non-recipient (seeded via admin to test invite RLS in isolation)
    const s = await seedLetterSourcedSession({
      creatorProfileId: author.user.id,
      targetListenerId: nonRecipient.user.id,
      sourceLetterId: letterId,
    });
    sessionId = s.id;
  });

  test.afterAll(async () => {
    await cleanupSession(sessionId);
    if (letterId) await supabaseAdmin.from('clarity_letters').delete().eq('id', letterId);
    if (docId) await supabaseAdmin.from('clarity_docs').delete().eq('id', docId);
    await Promise.all([
      deleteTestUser(author.user.id),
      deleteTestUser(recipient.user.id),
      deleteTestUser(nonRecipient.user.id),
    ]);
  });

  test('author cannot INSERT invite for a listener who is not a letter recipient', async () => {
    const token = await signIn(author.email);
    const authorClient = makeUserClient(token);

    let inviteId: string | undefined;
    try {
      const { data, error } = await authorClient
        .from('clarity_live_invites')
        .insert({ session_id: sessionId!, target_user_id: nonRecipient.user.id })
        .select('id').single();
      inviteId = data?.id;

      expect(
        error,
        `RLS-3 not enforced: author inserted invite for a non-recipient. ` +
        `INSERT WITH CHECK on clarity_live_invites must validate target_user_id ∈ letter receivers.`
      ).not.toBeNull();
    } finally {
      await cleanupInvite(inviteId);
    }
  });
});

// =============================================================================
// 6. RLS canary (e) — complete_clarity_session called by non-participant → error
//    Security finding: Authz-2 (RPC must assert auth.uid() ∈ participants)
// =============================================================================

test.describe('P703 RLS canary (e) — complete_clarity_session blocked for non-participant', () => {
  test.setTimeout(30000);

  let author: TestUser;
  let listener: TestUser;
  let outsider: TestUser;
  let sessionId: string | undefined;

  test.beforeAll(async () => {
    [author, listener, outsider] = await Promise.all([
      createTestUser({ name: 'P703 Author E' }),
      createTestUser({ name: 'P703 Listener E' }),
      createTestUser({ name: 'P703 Outsider E' }),
    ]);
    const s = await seedLetterSourcedSession({
      creatorProfileId: author.user.id,
      targetListenerId: listener.user.id,
    });
    sessionId = s.id;
  });

  test.afterAll(async () => {
    await cleanupSession(sessionId);
    await Promise.all([
      deleteTestUser(author.user.id),
      deleteTestUser(listener.user.id),
      deleteTestUser(outsider.user.id),
    ]);
  });

  test('non-participant cannot call complete_clarity_session', async () => {
    const token = await signIn(outsider.email);
    const outsiderClient = makeUserClient(token);

    const { error } = await outsiderClient.rpc('complete_clarity_session', {
      p_session_id: sessionId!,
    });

    expect(
      error,
      `Authz-2 not enforced: non-participant completed a session. ` +
      `complete_clarity_session must assert auth.uid() ∈ (creator, joiner, target_listener).`
    ).not.toBeNull();
  });

  test('session author CAN call complete_clarity_session (positive)', async () => {
    const token = await signIn(author.email);
    const authorClient = makeUserClient(token);

    const { error } = await authorClient.rpc('complete_clarity_session', {
      p_session_id: sessionId!,
    });

    expect(error, `Author should be able to complete their own session: ${error?.message}`).toBeNull();
  });
});

// =============================================================================
// 7. complete_clarity_session atomicity
//    Both session.status='completed' AND invite.closed_at set in one call
// =============================================================================

test.describe('P703 complete_clarity_session — atomicity', () => {
  test.setTimeout(30000);

  let author: TestUser;
  let listener: TestUser;
  let sessionId: string | undefined;
  let inviteId: string | undefined;

  test.beforeAll(async () => {
    [author, listener] = await Promise.all([
      createTestUser({ name: 'P703 Author Atom' }),
      createTestUser({ name: 'P703 Listener Atom' }),
    ]);
    const s = await seedLetterSourcedSession({
      creatorProfileId: author.user.id,
      targetListenerId: listener.user.id,
    });
    sessionId = s.id;
    inviteId = await seedInvite(sessionId, listener.user.id);
  });

  test.afterAll(async () => {
    // Session cascade-deletes the invite; delete session only
    await cleanupSession(sessionId);
    await Promise.all([deleteTestUser(author.user.id), deleteTestUser(listener.user.id)]);
  });

  test('complete_clarity_session sets session.status=completed AND invite.closed_at in one call', async () => {
    // Call via author JWT (a participant) to satisfy the RPC's auth.uid() check
    const token = await signIn(author.email);
    const authorClient = makeUserClient(token);

    const { error } = await authorClient.rpc('complete_clarity_session', {
      p_session_id: sessionId!,
    });
    expect(error, `complete_clarity_session failed: ${error?.message}`).toBeNull();

    // Verify both mutations happened
    const [{ data: session }, { data: invite }] = await Promise.all([
      supabaseAdmin.from('clarity_sessions').select('status').eq('id', sessionId!).single(),
      supabaseAdmin.from('clarity_live_invites').select('closed_at').eq('id', inviteId!).single(),
    ]);

    expect(session?.status, 'session.status should be completed after RPC').toBe('completed');
    expect(invite?.closed_at, 'invite.closed_at should be set after RPC').not.toBeNull();
  });
});

// =============================================================================
// 8. Unique partial index — second open invite for same listener → 23505
// =============================================================================

test.describe('P703 Unique partial index — singleton invite enforcement', () => {
  test.setTimeout(20000);

  let author: TestUser;
  let listener: TestUser;
  let sessionA: string | undefined;
  let sessionB: string | undefined;
  let _inviteId: string | undefined;

  test.beforeAll(async () => {
    [author, listener] = await Promise.all([
      createTestUser({ name: 'P703 Author Idx' }),
      createTestUser({ name: 'P703 Listener Idx' }),
    ]);
    const sA = await seedLetterSourcedSession({
      creatorProfileId: author.user.id,
      targetListenerId: listener.user.id,
    });
    const sB = await seedLetterSourcedSession({
      creatorProfileId: author.user.id,
      targetListenerId: listener.user.id,
    });
    sessionA = sA.id;
    sessionB = sB.id;
    _inviteId = await seedInvite(sessionA, listener.user.id);
  });

  test.afterAll(async () => {
    await Promise.all([cleanupSession(sessionA), cleanupSession(sessionB)]);
    await Promise.all([deleteTestUser(author.user.id), deleteTestUser(listener.user.id)]);
  });

  test('inserting a second open invite for the same listener fails with unique constraint (23505)', async () => {
    const { error } = await supabaseAdmin
      .from('clarity_live_invites')
      .insert({ session_id: sessionB!, target_user_id: listener.user.id });

    expect(
      error,
      'Unique partial index missing: two open invites for the same listener should be rejected.'
    ).not.toBeNull();
    expect(error?.code ?? '', 'Expected UNIQUE VIOLATION (23505)').toBe('23505');
  });
});

// =============================================================================
// 9. Resend rate-limit — second bump within 30s rejected
//    Security finding: Authz-3
// =============================================================================

test.describe('P703 Resend rate-limit — 30s window', () => {
  test.setTimeout(20000);

  let author: TestUser;
  let listener: TestUser;
  let sessionId: string | undefined;
  let inviteId: string | undefined;

  test.beforeAll(async () => {
    [author, listener] = await Promise.all([
      createTestUser({ name: 'P703 Author RL' }),
      createTestUser({ name: 'P703 Listener RL' }),
    ]);
    const s = await seedLetterSourcedSession({
      creatorProfileId: author.user.id,
      targetListenerId: listener.user.id,
    });
    sessionId = s.id;
    inviteId = await seedInvite(sessionId, listener.user.id);
  });

  test.afterAll(async () => {
    await cleanupSession(sessionId);
    await Promise.all([deleteTestUser(author.user.id), deleteTestUser(listener.user.id)]);
  });

  test('first Resend (updated_at bump) succeeds', async () => {
    const { error } = await supabaseAdmin
      .from('clarity_live_invites')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', inviteId!);
    expect(error, `First resend failed: ${error?.message}`).toBeNull();
  });

  test('second Resend within 30s is rejected', async () => {
    // FIXME(generate-tests): If the rate-limit is implemented as a DB trigger/constraint,
    // this test will correctly catch a 23514 CHECK violation or a custom SQLSTATE.
    // If implemented as application-layer rate limiting (e.g., in the RPC), adjust accordingly.
    // The test assumes a DB-level enforcement that raises an error on the second UPDATE within 30s.
    const { error } = await supabaseAdmin
      .from('clarity_live_invites')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', inviteId!);

    expect(
      error,
      'Authz-3 not enforced: second Resend within 30s should be rejected by rate-limit.'
    ).not.toBeNull();
  });
});
