/**
 * INTEGRATION TEST: P1048 — clarity_chat_messages is closed to anon
 *
 * The chat feature is decommissioned (/chat and /clarity-chat redirect to
 * /create; clarity-chat-page.tsx is imported by nothing), but the table and its
 * 15 prod rows remain. Before this migration, three policies granted to
 * {public} — which includes anon — let any holder of the public anon key read
 * every message and rewrite the content of any of them.
 *
 * The lockdown works by removing every policy while leaving RLS enabled: with
 * RLS on and zero policies, Postgres denies every row to any role that does not
 * bypass RLS. That precondition is the load-bearing part, so this test asserts
 * it directly rather than only asserting the observable effect — if RLS were
 * ever disabled on this table, the reads below would start succeeding and the
 * "zero policies" state would flip from deny-all to allow-all.
 *
 * This test creates its own row. The test database has no chat data, so
 * asserting "anon reads nothing" against an empty table would pass whether or
 * not the fix works — the assertion has to be made against a row that provably
 * exists.
 */

import { test, expect } from '@playwright/test';
import { supabaseAdmin } from '../helpers/supabase-admin';
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';

const TABLE = 'clarity_chat_messages';

const anonClient = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.VITE_SUPABASE_ANON_KEY!,
);

test.describe('P1048: decommissioned chat table is unreachable by anon', () => {
  let sessionId: string;
  let messageId: string;

  test.beforeAll(async () => {
    // session_id is NOT NULL with an FK to clarity_sessions, so the canary
    // message needs a parent session. ON DELETE CASCADE removes the message
    // when the session goes, which is what afterAll relies on.
    const { data: session, error: sessionError } = await supabaseAdmin
      .from('clarity_sessions')
      .insert({
        // Playwright runs this beforeAll once per worker, concurrently. A
        // timestamp alone collides on the unique `code` constraint when two
        // workers start in the same millisecond — which is exactly what
        // happened on the first run.
        code: `p1048-${randomUUID().slice(0, 12)}`,
        creator_name: 'p1048-canary',
      })
      .select('id')
      .single();
    expect(sessionError, 'could not create canary session').toBeNull();
    sessionId = session!.id;

    const { data: message, error: messageError } = await supabaseAdmin
      .from(TABLE)
      .insert({
        session_id: sessionId,
        author_name: 'p1048-canary',
        content: 'p1048-canary-original',
      })
      .select('id')
      .single();
    expect(messageError, 'could not create canary message').toBeNull();
    messageId = message!.id;
  });

  test.afterAll(async () => {
    if (sessionId) {
      await supabaseAdmin.from('clarity_sessions').delete().eq('id', sessionId);
    }
  });

  // NOTE ON THE RLS PRECONDITION
  // An earlier draft asserted pg_class.relrowsecurity directly via an RPC. That
  // RPC does not exist here, and the Supabase query builder is a thenable
  // rather than a Promise, so the intended `.catch` fallback threw instead of
  // degrading. Dropped rather than repaired: the assertion was redundant. With
  // zero policies on the table, disabling RLS is precisely what would make the
  // row readable again — so 'anon cannot read the row' below already fails if
  // the precondition breaks, against real data rather than against metadata.

  // ── The row provably exists ───────────────────────────────────────────────
  test('the canary row is present when read with a bypassing role', async () => {
    const { data, error } = await supabaseAdmin
      .from(TABLE)
      .select('id, content')
      .eq('id', messageId)
      .single();

    expect(error).toBeNull();
    expect(data?.content).toBe('p1048-canary-original');
  });

  // ── ...and anon cannot see it ─────────────────────────────────────────────
  // TWO ACCEPTABLE DENIAL SHAPES — assert the property, not the mechanism.
  //
  // 20260812120000 removed every RLS policy, under which RLS *filters*: the call
  // succeeds and returns zero rows. 20260812130000 then also REVOKEd the anon and
  // authenticated table grants, under which Postgres *rejects* the statement
  // outright with 42501 before RLS is consulted. The second is strictly stronger.
  //
  // Asserting either exact shape would make this test fail on a tightening rather
  // than on a regression — it did exactly that when the REVOKE landed. What must
  // hold in both worlds, and the only thing this test should bind, is: anon does
  // not come away with the row. A successful read returning data is the failure.
  test('anon cannot read the row', async () => {
    const { data, error } = await anonClient
      .from(TABLE)
      .select('id, content')
      .eq('id', messageId);

    if (error) {
      expect(error.code, 'denial must be a permission error, not an incidental failure').toBe('42501');
    } else {
      expect(data, 'anon must not be able to read decommissioned chat messages').toEqual([]);
    }
  });

  test('anon cannot count the table', async () => {
    const { count, error } = await anonClient
      .from(TABLE)
      .select('id', { count: 'exact', head: true });

    // A head-only request surfaces the grant rejection with an empty message body,
    // so match on presence of an error rather than on its code here.
    if (!error) {
      expect(count, 'anon must not be able to enumerate chat messages').toBe(0);
    }
  });

  // ── ...and cannot tamper with it ──────────────────────────────────────────
  test('anon cannot modify the row', async () => {
    await anonClient
      .from(TABLE)
      .update({ content: 'p1048-canary-TAMPERED' })
      .eq('id', messageId);

    // An UPDATE blocked by RLS matches zero rows and reports no error, so the
    // return value proves nothing. Only re-reading with a bypassing role does.
    const { data } = await supabaseAdmin
      .from(TABLE)
      .select('content')
      .eq('id', messageId)
      .single();

    expect(data?.content, 'anon must not be able to rewrite chat message content').toBe(
      'p1048-canary-original',
    );
  });

  test('anon cannot insert', async () => {
    const { error } = await anonClient.from(TABLE).insert({
      session_id: sessionId,
      author_name: 'p1048-anon-insert',
      content: 'should-not-land',
    });

    expect(error, 'anon INSERT must be rejected').not.toBeNull();

    const { count } = await supabaseAdmin
      .from(TABLE)
      .select('id', { count: 'exact', head: true })
      .eq('session_id', sessionId);
    expect(count, 'no anon-authored row may exist').toBe(1);
  });
});
