/**
 * @file 20260908170300_p1236_d_revoke_anon_join_rpc.spec.ts
 * @description P270 canary for 20260908170300_p1236_d_revoke_anon_join_rpc.sql.
 *
 * `join_transcribe_room()` was reachable by the `anon` role after its own migration ran,
 * because Supabase's ALTER DEFAULT PRIVILEGES grants EXECUTE on every new function to anon
 * ROLE-DIRECTLY and `REVOKE ALL ... FROM PUBLIC` does not touch a role-direct grant
 * (docs/technical/database.md §P1065 — the half-revoke trap; P1063 found four live on prod).
 *
 * THE ASSERTION HAS TO DISTINGUISH TWO REFUSALS, and this is the whole difficulty. Before
 * the fix an anonymous call already failed — the function's first line raises "not
 * authenticated". A test that only asserted `error !== null` would have passed against the
 * unfixed grant and measured nothing. So it asserts the refusal comes from the GRANT
 * (permission denied, 42501 from PostgREST's function lookup) and specifically NOT from the
 * function body, which would prove the grant is still there.
 */
import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { supabaseAdmin } from '../helpers/supabase-admin';
import { createTestUser, deleteTestUser, TEST_PASSWORD, type TestUser } from '../helpers/test-user';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY!;

const NOWHERE_ROOM = '00000000-0000-4000-8000-000000000000';
const NOWHERE_SESSION = '00000000-0000-4000-8000-000000000001';

test.describe('P1236: join_transcribe_room is not reachable by the anon role', () => {
  test('an unauthenticated caller is refused by the GRANT, not by the function body', async () => {
    const anonClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { error } = await anonClient.rpc('join_transcribe_room', {
      p_room_id: NOWHERE_ROOM,
      p_display_name: 'anon probe',
      p_session_id: NOWHERE_SESSION,
      p_consent: true,
    });

    expect(error).not.toBeNull();
    const message = `${error!.message} ${error!.code ?? ''}`.toLowerCase();
    // The grant refused: PostgREST cannot even resolve a function the role may not execute.
    expect(message).toMatch(/permission denied|could not find the function|does not exist|42501|pgrst202/);
    // The body did NOT refuse — if it had, the anon grant would still be live.
    expect(message).not.toContain('not authenticated');
  });

  test('control: an authenticated caller still reaches the function body', async () => {
    // Without this the test above passes just as well against a function that was dropped,
    // renamed, or revoked from everyone — i.e. against a broken product.
    const alice: TestUser = await createTestUser({ name: 'P1236 Grant Control' });
    try {
      const { data: signIn } = await supabaseAdmin.auth.signInWithPassword({
        email: alice.email, password: TEST_PASSWORD,
      });
      const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        global: { headers: { Authorization: `Bearer ${signIn!.session!.access_token}` } },
        auth: { autoRefreshToken: false, persistSession: false },
      });
      await supabaseAdmin.auth.signOut();

      const { error } = await userClient.rpc('join_transcribe_room', {
        p_room_id: NOWHERE_ROOM,
        p_display_name: 'P1236 Grant Control',
        p_session_id: NOWHERE_SESSION,
        p_consent: true,
      });

      // Reaching the body is the point. The room does not exist, so the body refuses —
      // with ITS message, which is exactly the one the anon case must never produce.
      expect(error).not.toBeNull();
      expect(error!.message).toContain('room not found or already ended');
    } finally {
      await deleteTestUser(alice.user.id);
    }
  });
});
