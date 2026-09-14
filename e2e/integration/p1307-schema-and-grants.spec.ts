/**
 * @file p1307-schema-and-grants.spec.ts
 * @description P270 canary for P1307's four migrations (per spec §Files to Create):
 *   20260914120000_p1307_transcribe_member_capture_end.sql
 *   20260914120100_p1307_transcribe_chunk_sequence.sql
 *   20260914120200_p1307_transcribe_member_cap_source.sql
 *   20260914120300_p1307_transcribe_room_jobs_transcripts_sweep.sql
 *
 * Written before those migrations exist (test-first) — every test here is EXPECTED TO FAIL
 * until /dev applies them. That is correct: it proves the schema/grant check is reachable
 * rather than assumed (epistemic.md gate 7).
 *
 * Scope: existence only — new columns, new tables, and that every new SECURITY DEFINER
 * function this spec adds has no anon EXECUTE grant. Behavior of each RPC/table's RLS is
 * covered in the sibling p1307-*.spec.ts files (split by concern, per the spec's own
 * "Files to Create" grouping).
 */
import { test, expect } from '@playwright/test';
import { supabaseAdmin } from '../helpers/supabase-admin';
import { createClient } from '@supabase/supabase-js';

// ── 1. New columns on transcribe_room_members (Decisions 1, 2, 6) ──────────────

test.describe('P1307: transcribe_room_members gains capture_ended_at, last_seen_at, next_chunk_seq', () => {
  test('capture_ended_at exists', async () => {
    const { error } = await supabaseAdmin
      .from('transcribe_room_members')
      .select('capture_ended_at')
      .limit(1);
    expect(error, `Migration not applied: capture_ended_at missing. ${error?.message}`).toBeNull();
  });

  test('last_seen_at exists (Decision 2 correction — not last_slice_at)', async () => {
    const { error } = await supabaseAdmin
      .from('transcribe_room_members')
      .select('last_seen_at')
      .limit(1);
    expect(error, `Migration not applied: last_seen_at missing. ${error?.message}`).toBeNull();
  });

  test('next_chunk_seq exists', async () => {
    const { error } = await supabaseAdmin
      .from('transcribe_room_members')
      .select('next_chunk_seq')
      .limit(1);
    expect(error, `Migration not applied: next_chunk_seq missing. ${error?.message}`).toBeNull();
  });
});

// ── 2. New tables (Decisions 4, 5, Parent verification 4) ──────────────────────

test.describe('P1307: transcribe_room_transcription_jobs and transcribe_room_transcripts exist', () => {
  test('transcribe_room_transcription_jobs is selectable by service role', async () => {
    const { error } = await supabaseAdmin
      .from('transcribe_room_transcription_jobs')
      .select('id, room_id, member_id, status')
      .limit(1);
    expect(error, `Migration not applied: transcribe_room_transcription_jobs missing. ${error?.message}`).toBeNull();
  });

  test('transcribe_room_transcripts is selectable by service role', async () => {
    const { error } = await supabaseAdmin
      .from('transcribe_room_transcripts')
      .select('room_id, segments, speaker_map, incomplete_member_ids, de_duplication_note, created_at')
      .limit(1);
    expect(error, `Migration not applied: transcribe_room_transcripts missing. ${error?.message}`).toBeNull();
  });
});

// ── 3. Anon EXECUTE — every new SECURITY DEFINER function ──────────────────────
// P1065/P1236 pattern (re-cited by the spec's own Security Review): REVOKE ... FROM PUBLIC
// does not remove a role-direct grant, so this asserts the EFFECT (the error message),
// not the presence of a REVOKE statement in the migration text.

const NEW_FUNCTIONS: Array<{ name: string; args: Record<string, unknown> }> = [
  { name: 'end_transcribe_room_capture', args: { p_room_id: '00000000-0000-4000-8000-000000000000' } },
  { name: 'reserve_room_chunk_number', args: { p_room_id: '00000000-0000-4000-8000-000000000000' } },
  { name: 'touch_transcribe_room_capture', args: { p_room_id: '00000000-0000-4000-8000-000000000000' } },
  { name: 'transcribe_room_sweep_tick', args: {} },
];

test.describe('P1307: no new SECURITY DEFINER function is reachable by anon', () => {
  for (const fn of NEW_FUNCTIONS) {
    test(`anon has no EXECUTE grant on ${fn.name}`, async () => {
      const anon = createClient(process.env.VITE_SUPABASE_URL!, process.env.VITE_SUPABASE_ANON_KEY!);
      const { error } = await anon.rpc(fn.name, fn.args);
      expect(error, `${fn.name} must be unreachable by anon`).not.toBeNull();
      // "permission denied for function" (grant absent) vs "not authenticated" (grant
      // present, auth.uid() check fires instead) are told apart by the MESSAGE, not the
      // code — asserting only "an error occurred" would be vacuous against a function that
      // happens to also gate on auth.uid().
      expect(
        error!.message,
        `${fn.name}: expected a permission-denied message, got "${error!.message}" — ` +
          'this could mean the anon grant is present and only the internal auth check fired.',
      ).toMatch(/permission denied for function/i);
    });
  }

  test('control: anon can still reach a function it IS granted', async () => {
    // Without this, a probe that cannot reach ANY function would produce the identical
    // verdict above for every row and the sweep above this line would be blind
    // (epistemic.md gate 7b's "known-good and known-bad control" requirement).
    const anon = createClient(process.env.VITE_SUPABASE_URL!, process.env.VITE_SUPABASE_ANON_KEY!);
    const granted = await anon.rpc('get_session_by_code', { p_code: 'ZZZZZZ' });
    expect(granted.error, 'control: anon must still reach a function it is granted').toBeNull();
  });
});
