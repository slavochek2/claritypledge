/**
 * P1207 — integration test for the two Phase 2 migrations (P270 rule).
 *
 *   20260901100000_p1207_revoke_truncate_class.sql
 *   20260901100100_p1207_drop_idea_votes_update_policy.sql
 *
 * These migrations grant nothing and add no column — one REVOKEs a privilege class, the other
 * DROPs a policy. So the assertions are inverted from the template's: each names a capability
 * that must now be ABSENT, alongside a control in the same probe that must still be PRESENT.
 * A suite where every assertion is "denied" cannot tell a working revoke from a broken
 * connection, an empty table, or a wrong URL.
 *
 * WHAT THIS FILE DELIBERATELY DOES NOT COVER, and why — stated rather than faked.
 * The TRUNCATE/REFERENCES/TRIGGER/MAINTAIN revoke is NOT verifiable from here. PostgREST
 * exposes no TRUNCATE verb and no DDL surface, so there is no request an anon or authenticated
 * client can issue that would exercise the privilege either before or after the migration. That
 * unreachability IS finding F6's "latent, not armed" classification — the privilege was never
 * reachable through the application, which is exactly why it survived four hand-patches.
 * An earlier draft of this file asserted it through a catalog RPC that does not exist in this
 * project; every such test SKIPPED, and a skipped test is not evidence. The privilege floor is
 * asserted instead by scripts/check-p1207-privilege-floor.py, which reads
 * information_schema.table_privileges and pg_default_acl over the Management API — the right
 * tool for a catalog assertion, exercised RED (exit 1, 315 violations) and GREEN (exit 0).
 */

import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { supabaseAdmin } from '../helpers/supabase-admin';

const anonClient = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.VITE_SUPABASE_ANON_KEY!
);

test.describe('P1207: clarity_idea_votes UPDATE is default-denied after the policy drop', () => {
  let seededId: string | null = null;
  let seededIdeaId: string | null = null;

  test.beforeAll(async () => {
    // Seed a real idea FIRST — clarity_idea_votes.idea_id is a FK to clarity_feed_ideas, so a
    // synthetic uuid cannot be inserted. Then seed one vote row, both via the service role, so
    // the UPDATE assertion has a real target. Without a row, "nothing was updated" is true
    // whether or not the migration worked — the vacuous pass this repo's own audit flagged on
    // six empty tables. Seeding failures are logged and then hard-fail the tests below rather
    // than skipping them: a skipped test is not evidence.
    const idea = await supabaseAdmin
      .from('clarity_feed_ideas')
      .insert({
        content: 'p1207 privilege-floor fixture',
        originator_name: 'p1207 fixture',
        provenance_type: 'direct',
        visibility: 'public',
      })
      .select('id')
      .single();
    if (idea.error) throw new Error(`p1207 fixture: could not seed idea: ${idea.error.message}`);
    seededIdeaId = idea.data.id;

    const vote = await supabaseAdmin
      .from('clarity_idea_votes')
      .insert({
        idea_id: seededIdeaId,
        voter_session_id: crypto.randomUUID(),
        voter_name: 'p1207 fixture',
        vote: 'agree',
      })
      .select('id')
      .single();
    if (vote.error) throw new Error(`p1207 fixture: could not seed vote: ${vote.error.message}`);
    seededId = vote.data.id;
  });

  test.afterAll(async () => {
    if (seededId) await supabaseAdmin.from('clarity_idea_votes').delete().eq('id', seededId);
    if (seededIdeaId) await supabaseAdmin.from('clarity_feed_ideas').delete().eq('id', seededIdeaId);
  });

  test('anon cannot rewrite an existing vote, and the denial is not a connection failure', async () => {
    expect(seededId, 'fixture row must exist for this assertion to mean anything').not.toBeNull();

    // CONTROL 1 — the SELECT policy ("Votes are viewable by everyone") is deliberately untouched
    // by this migration. A successful read proves the anon client is connected, keyed correctly,
    // and can reach this table, which is what makes the denial below meaningful rather than
    // indistinguishable from a bad URL.
    const read = await anonClient.from('clarity_idea_votes').select('id, vote').eq('id', seededId!);
    expect(read.error, `control: anon must still SELECT this table: ${read.error?.message}`).toBeNull();
    expect(read.data, 'control: the seeded row must be visible to anon').toHaveLength(1);
    expect(read.data![0].vote, 'control: fixture starts at "agree"').toBe('agree');

    // THE ASSERTION — with no UPDATE policy, RLS admits no row for the write.
    const write = await anonClient
      .from('clarity_idea_votes')
      .update({ vote: 'disagree' })
      .eq('id', seededId!)
      .select();

    // The error being NULL is load-bearing, not incidental, and an adversarial review of the
    // first version of this file is why it is asserted. `expect(data).toEqual([])` alone passes
    // for two different reasons: RLS admitting no row (what this migration does), or the UPDATE
    // *grant* having been revoked (which would be a different change entirely). Those two are
    // distinguishable — a missing grant returns 42501 "permission denied", while RLS
    // row-invisibility returns no error and an empty set. Pinning error===null therefore pins
    // the mechanism, so this test cannot pass on a database where the migration never ran but
    // something else happens to block the write.
    expect(write.error, `denial must be RLS row-invisibility, not a revoked grant; got ${JSON.stringify(write.error)}`).toBeNull();
    expect(write.data ?? [], 'anon must not be able to update any vote row').toEqual([]);

    // CONTROL 2 — and the row is genuinely unchanged. PostgREST can return an empty array for
    // reasons other than a refusal, so the stored value is re-read rather than inferred from it.
    const after = await supabaseAdmin
      .from('clarity_idea_votes').select('vote').eq('id', seededId!).single();
    expect(after.data?.vote, 'the stored vote must be untouched').toBe('agree');
  });

  test('the service role is still able to update the same row — the revoke is role-scoped', async () => {
    expect(seededId, 'fixture row must exist for this assertion to mean anything').not.toBeNull();

    // The strongest control in the file: the identical UPDATE, same row, same column, different
    // role. If this also failed, the test above would be proving the table is broken rather than
    // that anon specifically lost the capability.
    const { error } = await supabaseAdmin
      .from('clarity_idea_votes').update({ vote: 'dont_know' }).eq('id', seededId!);
    expect(error, `service role must still update: ${error?.message}`).toBeNull();

    const after = await supabaseAdmin
      .from('clarity_idea_votes').select('vote').eq('id', seededId!).single();
    expect(after.data?.vote).toBe('dont_know');

    await supabaseAdmin.from('clarity_idea_votes').update({ vote: 'agree' }).eq('id', seededId!);
  });
});
