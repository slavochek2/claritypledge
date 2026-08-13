/**
 * @file p1063-db-schema.spec.ts
 * @description Regression guard for P1063 — four SECURITY DEFINER RPCs that were executable by
 * unauthenticated callers on both test and production.
 *
 * WHY THIS TEST IS THE POINT, NOT A FORMALITY
 * -------------------------------------------
 * The defect was invisible in the migration source. Every one of these functions already carried
 * `REVOKE ALL ON FUNCTION ... FROM PUBLIC; GRANT EXECUTE ... TO authenticated;` — the lockdown
 * was written, reviewed and shipped, and the privilege was still there. Two separate ACL causes
 * produced it (a role-direct `anon` grant on some, a surviving PUBLIC grant on others), and a
 * `REVOKE ... FROM anon` is a SILENT NO-OP against the second: it succeeds, errors nothing, and
 * changes nothing. Reading the migrations cannot detect any of that. Only asking the live
 * database can, which is what this file does.
 *
 * So these assertions deliberately do NOT parse SQL or check that a migration ran. They call the
 * functions as a real anonymous client and require refusal.
 *
 * The exploits below were REPRODUCED before the fix — an anon caller sealed another user's draft
 * letter (HTTP 200, draft -> sealed) and ended a live session (ended_at stamped). Neither is
 * hypothetical, and neither is recoverable in-product: there is no unseal path, and ended_at is
 * what claim_joiner_seat gates on, so an ended room can never be rejoined.
 *
 * The two POSITIVE controls at the bottom matter as much as the refusals. P1047's failure mode
 * was over-tightening — a fix that closed the hole and broke the guest journey with it. Guests
 * joining rooms without an account is the product, so claim_joiner_seat / release_joiner_seat
 * MUST stay anon-reachable. If those two controls ever fail, this fix went too far.
 */

import { test, expect } from '@playwright/test';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY!;
const NIL_UUID = '00000000-0000-0000-0000-000000000000';

/**
 * Calls an RPC over raw HTTP as the `anon` role and returns the status + PostgREST error code.
 *
 * Deliberately not supabase-js: this must exercise the wire path an attacker uses, with no
 * client library able to short-circuit it. Argument values are inert (a nil UUID matches no row),
 * so a refusal and a no-op are distinguishable by STATUS, not by side effects — nothing here
 * mutates data even if a guard were missing.
 */
async function callAsAnon(fn: string, body: Record<string, unknown>) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: { apikey: SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  let code: string | undefined;
  try {
    code = ((await res.json()) as { code?: string })?.code;
  } catch {
    code = undefined; // 204 / empty body — which for these RPCs means it RAN
  }
  return { status: res.status, code };
}

test.describe('P1063: signed-in-only RPCs must refuse anonymous callers', () => {
  const CLOSED: Array<{ fn: string; args: Record<string, unknown>; harm: string }> = [
    {
      fn: 'seal_and_send_letter',
      args: { p_letter_id: NIL_UUID, p_predictions: [], p_deliveries: [], p_responses_mode: 'invite' },
      harm: "an anonymous caller can permanently seal another user's draft letter",
    },
    {
      fn: 'complete_clarity_session',
      args: { p_session_id: NIL_UUID },
      harm: 'an anonymous caller can end any live session, making the room permanently unjoinable',
    },
    {
      fn: 'create_letter_delivery',
      args: { p_letter_id: NIL_UUID, p_stories_rated: 0 },
      harm: 'an anonymous caller can create letter deliveries',
    },
    {
      fn: 'persist_anonymous_completion',
      args: { p_nonce: NIL_UUID, p_letter_id: NIL_UUID, p_ratings: {}, p_positions: {} },
      harm: 'an anonymous caller can write completion data',
    },
  ];

  for (const { fn, args, harm } of CLOSED) {
    test(`${fn} rejects an anonymous caller`, async () => {
      const { status, code } = await callAsAnon(fn, args);

      // 42501 = insufficient_privilege. A 2xx here means the function RAN for an anonymous
      // caller — the internal `IF owner != auth.uid()` guard does not help, because that
      // condition is NULL for anon and plpgsql skips an IF whose condition is NULL.
      expect(code, `P1063 REGRESSION: ${harm} (HTTP ${status}, code ${code ?? 'none'})`).toBe('42501');
      expect(status, `${fn} did not refuse an anonymous caller`).toBeGreaterThanOrEqual(400);
    });
  }

  // ── Positive controls: the guest journey must survive the fix ────────────────────────────

  const OPEN: Array<{ fn: string; args: Record<string, unknown> }> = [
    { fn: 'claim_joiner_seat', args: { p_code: 'ZZZZZZ', p_joiner_name: 'Guest' } },
    { fn: 'release_joiner_seat', args: { p_session_id: NIL_UUID } },
  ];

  for (const { fn, args } of OPEN) {
    test(`control: ${fn} stays reachable by anonymous guests`, async () => {
      const { status, code } = await callAsAnon(fn, args);

      // These reach the function body and refuse on their OWN authorization logic — also 42501,
      // but raised by a RAISE EXCEPTION inside the function rather than by the executor. The
      // discriminator is the message, not the code, so assert on what would actually differ:
      // a privilege failure returns PostgREST's own 'permission denied for function ...'.
      const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
        method: 'POST',
        headers: { apikey: SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify(args),
      });
      const msg = ((await res.json().catch(() => ({}))) as { message?: string })?.message ?? '';

      expect(
        msg,
        `P1063 OVER-TIGHTENED: ${fn} is no longer callable by anonymous guests, which breaks ` +
          `joining a room without an account (HTTP ${status}, code ${code ?? 'none'})`,
      ).not.toContain('permission denied for function');
    });
  }
});
