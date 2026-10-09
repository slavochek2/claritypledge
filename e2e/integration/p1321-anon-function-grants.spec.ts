/**
 * @file p1321-anon-function-grants.spec.ts
 * @description P1321 step 3: the function-grant drift check's gating findings, each given a
 * verdict. None has a real anonymous call site, so anonymous EXECUTE is revoked — from the
 * role and from PUBLIC (P1066) — and signed-in callers keep their direct grant.
 *
 * Asserted by MESSAGE, not by "an error occurred": the refusal must happen at the grant, which
 * PostgREST reports as "permission denied for function". Each half carries a control, so a
 * failure cannot be explained by an unreachable API or a broken sign-in.
 *
 * get_listener_calibration_avgs / get_speaker_calibration_avgs exist on prod only (object drift,
 * no migration creates them), so they cannot be asserted here; the migration revokes them only
 * where they exist, and the post-deploy re-run of function-grant-drift-check.py proves prod.
 */
import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';

const ZERO = '00000000-0000-0000-0000-000000000000';

const REVOKED: Array<{ fn: string; args: Record<string, unknown> }> = [
  { fn: 'create_letter_delivery_on_open', args: { p_letter_id: ZERO } },
  { fn: 'create_transcription_job', args: { p_session_id: ZERO } },
  { fn: 'get_deliveries_with_progress', args: { p_letter_ids: [ZERO] } },
  { fn: 'get_inbox_items', args: {} },
  { fn: 'get_letter_by_token', args: { p_token: ZERO } },
  { fn: 'get_letter_results', args: { p_letter_id: ZERO } },
  { fn: 'retry_transcription', args: { p_session_id: ZERO } },
  { fn: 'same_variant_misunderstanding', args: { src_tags: [], tgt_tags: [] } },
  { fn: 'update_last_activity', args: { p_session_id: ZERO } },
];

function anonClient() {
  return createClient(process.env.VITE_SUPABASE_URL!, process.env.VITE_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

test.describe('P1321: anonymous EXECUTE revoked where no anonymous caller exists', () => {
  for (const { fn, args } of REVOKED) {
    test(`anon is refused at the grant: ${fn}`, async () => {
      const { error } = await anonClient().rpc(fn, args);
      expect(error?.message ?? '(no error)', `anon must not be able to execute ${fn}`)
        .toMatch(/permission denied for function/i);
    });
  }

  test('control: anon still reaches an allowlisted function', async () => {
    const { error } = await anonClient().rpc('get_session_by_code', { p_code: 'ZZZZZZ' });
    expect(error, 'anon must still reach get_session_by_code').toBeNull();
  });

  test('signed-in callers keep their grant', async () => {
    const email = process.env.TEST_LISTENER_EMAIL;
    const password = process.env.TEST_LISTENER_PASSWORD;
    test.skip(!email || !password, 'TEST_LISTENER_EMAIL/PASSWORD not set — cannot sign in');
    const client = anonClient();
    const { error: signInError } = await client.auth.signInWithPassword({ email: email!, password: password! });
    expect(signInError, `sign-in failed: ${signInError?.message}`).toBeNull();

    const inbox = await client.rpc('get_inbox_items');
    expect(inbox.error, `get_inbox_items as a signed-in user: ${inbox.error?.message}`).toBeNull();
    expect(Array.isArray(inbox.data)).toBe(true);

    const progress = await client.rpc('get_deliveries_with_progress', { p_letter_ids: [ZERO] });
    expect(progress.error, `get_deliveries_with_progress: ${progress.error?.message}`).toBeNull();

    const tags = await client.rpc('same_variant_misunderstanding', { src_tags: [], tgt_tags: [] });
    expect(tags.error, `same_variant_misunderstanding: ${tags.error?.message}`).toBeNull();
  });
});
