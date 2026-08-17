/**
 * @file test-ready.ts
 * @description P1083 test helpers for `/ready`'s ephemeral distribution table.
 * Uses the admin client to bypass RLS — real visits go through the anon-key path,
 * which these helpers exist to seed/inspect around.
 */
import { supabaseAdmin } from './supabase-admin';

/** Seeds one submission. `minutesAgo` backdates `created_at` to simulate the
 * retention window elapsing without an actual wait — the RLS SELECT policy filters
 * on `created_at`, so a backdated row reproduces "expired" deterministically. */
export async function seedReadySubmission(value: number, minutesAgo = 0): Promise<string> {
  const createdAt = new Date(Date.now() - minutesAgo * 60_000).toISOString();
  const { data, error } = await supabaseAdmin
    .from('ready_submissions')
    .insert({ value, created_at: createdAt })
    .select('id')
    .single();
  if (error || !data) throw new Error(`seedReadySubmission failed: ${error?.message}`);
  return data.id as string;
}

/** Deletes only the given rows — safe to call from a file that runs concurrently
 * with other files/projects touching this table (ready_submissions has no owner
 * column by design, so a table-wide wipe races anything else reading/asserting on
 * it at the same time; scoping by id is the only collision-free cleanup here). */
export async function deleteReadySubmissions(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const { error } = await supabaseAdmin.from('ready_submissions').delete().in('id', ids);
  if (error) throw new Error(`deleteReadySubmissions failed: ${error.message}`);
}
