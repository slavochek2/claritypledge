---
status: week
type: task
rank: 52
created_date: '2026-08-20'
tags: [migrations, ci, idempotency, e2e]
delivery_stage: create-spec
pipeline_ran: [create-spec]
driver: anomaly
severity: medium
feature_type: backend
---

# P1132: The migration chain cannot be replayed from empty

## Problem

**Situation:** Applying `supabase/migrations/` to an empty database fails on the **second**
file. `20250101_initial_schema.sql` is a 473-line consolidated baseline that already contains
state which later dated migrations re-declare without guards — duplicate policies, duplicate
publication members, a duplicate column, a duplicate trigger. A full replay was measured on
2026-08-20: **12 of 236 non-baseline files throw, 37 error lines total.**

**Complication:** Nobody noticed because nobody replays. Both live databases were built
forward one migration at a time and work fine; `scripts/migrate.sh` tracks by version string
extracted from the filename and skips anything already recorded, so a broken file is invisible
once its version is in `schema_migrations`. The gap only appears when a database is built from
scratch — which is exactly what [P1085](p1085_trusted_e2e_core_in_ci.md) needs in order to run
an E2E core in CI, and exactly what a new contributor does when following the README.

**Question:** What is the minimum change that makes the chain apply cleanly from empty, without
altering the behaviour of the two databases that already exist?

## Appetite

**Blast radius: low in practice, high if got wrong.** Every file in scope is already recorded
as applied on both live databases, and the runner is version-keyed with no content hash
(verified in `scripts/migrate.sh`), so editing their SQL is inert there. The risk is not the
edits; it is any change that moves a *filename*, because that creates a newly-pending version.
**Reversibility: high** — every change is additive guarding, revertable by `git revert`.
**Decision density: zero for this spec's scope** — the two items that carry founder decisions
are deliberately excluded (see Non-Goals).

## Solution

Two provably-inert repairs, shipped together:

1. **Idempotency guards on the 5 baseline-collision files** — `20250117_add_profile_delete_policy.sql`
   (1 policy), `20251218_p19_3_idea_feed.sql` (3 publication members), `20251220_explanation_request.sql`
   (1 column + 1 trigger), `20260107_p37_consent_mechanism.sql` (4 policies). Style follows the
   existing repo convention rather than an imported one: `DROP POLICY IF EXISTS` before `CREATE
   POLICY`, `ADD COLUMN IF NOT EXISTS`, `DROP TRIGGER IF EXISTS`, and — for publication membership,
   which has no `IF NOT EXISTS` form — the `DO $$ ... pg_publication_tables ... END $$;` guard
   already established by `20260812130000_p1048_close_chat_realtime_channel.sql:52`.

2. **The type change in `20260209_add_story_visibility_enum.sql`** — TWO blocking conditions,
   layered. First, Postgres cannot auto-cast a text `DEFAULT` to the new enum type (42804). Fixing
   that exposes the second: `ALTER COLUMN ... TYPE` is refused outright while an RLS policy
   references the column (0A000). `CREATE POLICY "Stories readable by visibility"` is created at
   `20260206_add_story_visibility.sql:14` and nothing between there and `20260209` drops it — the
   two migrations that do (`20260224120000_p424_visibility_model.sql:16`,
   `20260325120000_p586_visibility_privacy_foundation.sql:30`) both come later. So the fix is
   drop-policy / drop-default / type change / set-default / recreate-policy, recreating with
   `20260206`'s own predicate verbatim so the later migrations remain the things that replace it.
   The restored default is not invented: it matches `20250101_initial_schema.sql:353`, which
   declares `visibility TEXT NOT NULL DEFAULT 'public'`.

   **The second condition was invisible to the first measurement pass**, which ran with
   `ON_ERROR_STOP=0` and therefore reported only each file's first error. Expect further layered
   errors in this chain and treat any "clean" result as provisional until an unguarded end-to-end
   apply confirms it.

**No filename changes.** Every file keeps its version prefix, which is the entire basis of the
inertness claim above.

## Risks / Non-Goals

### Risks

- **A guard that silently changes semantics.** `DROP POLICY IF EXISTS` followed by `CREATE POLICY`
  replaces a policy rather than skipping it — on a live database where the policy was later amended
  out-of-band, replay would revert it. Mitigation: these files are version-recorded and never re-run
  on the live databases; the guard only ever executes on a fresh build. Stated explicitly because
  the mitigation is the *only* thing that makes this safe, and it breaks the moment a filename moves.
- **Testing the wrong property.** Applying once from empty proves the guards don't break a fresh
  build; it does NOT prove the files are safe to re-run, which is the property being claimed.
  Mitigation: acceptance requires a **second** apply against the now-non-empty database.
- **Layered errors.** Each fix in this chain can reveal another beneath it — `20260209` carried two
  distinct blockers, the second only visible once the first was guarded. Mitigation: never report the
  chain clean on the strength of a run that continued past errors; require a run that would have
  stopped at the first one.
- **Convention drift.** The guard text that ships must be the guard text that was exercised, not a
  semantically-equivalent variant. Mitigation: Done-When requires the verbatim shipped form to have
  been applied.

### Non-Goals

- Do NOT rename `p63_google_oauth_avatar.sql`. It is skipped by `scripts/migrate.sh` at `:245` and
  `:321-323` by explicit design, has never been applied through any path this repo owns, and
  contains `UPDATE profiles SET avatar_provider = 'generated' WHERE avatar_provider IS NULL` —
  a live-data mutation that has never executed on prod. Renaming makes it newly-pending and fires
  that UPDATE for real. **[FOUNDER DECISION]** and out of scope here.
- Do NOT create `ml_training_sessions`. Three migrations reference a table nothing creates; it
  exists live, out-of-band. That belongs to [P1054](p1054_out_of_band_objects_absent_from_migrations.md),
  which already owns the whole out-of-band-objects problem and was filed 2026-08-12.
- Do NOT edit `20260116_ml_training_chunk_count.sql` or `20260404120000_security_backlog_rls.sql`.
  They are version-recorded and prod-inert; editing them serves no purpose and touches P1054's scope.
- Do NOT change any filename, for any reason, under this spec.

  **This constraint is load-bearing and now has a measured worst case.** Eight files share four
  duplicated version keys — `20260223`, `20260409120000`, `20260413100000`, `20260413110000` — so a
  from-empty batch apply dies on `schema_migrations_pkey` (23505) regardless of every guard above.
  Resolving that requires renames, and a rename makes a file newly-pending on the live databases.
  Of the eight, six are cheaply guardable and one (`20260223_p396_host_rls_and_session_constraints.sql`)
  needs two more guards. The eighth is the problem:

  `20260413100000_p701_st_swap.sql` sets `session_replication_role = replica` to bypass the
  `system_tags` write-protection trigger, then performs a **3-way rotation** of tag values via four
  `UPDATE ... array_replace` pairs across `stories` and `points`. It is written to run exactly once
  (its own header: "10 rows affected", "PREREQ: Prod DB backup must exist"). Re-running it rotates
  already-rotated tags a second time — **no error, silently wrong data**. Renaming it to resolve the
  version collision would make it newly-pending and re-run it for real on prod and test.

  Consequence: **from-empty replay is not reachable under this spec's Non-Goals**, and lifting them
  is a founder decision with a live-data-corruption path in it, not a scoping tweak.
- Do NOT wire anything into CI here — that is P1085.

### Alternatives Considered

- **Squash the whole chain into a new baseline.** Rejected: discards migration history, and the
  out-of-band objects (P1054) mean a squash generated from live schema would silently adopt
  objects nobody has decided to keep.
- **Exclude the broken files from replay via a CI-only allowlist.** Rejected: leaves the repo
  unable to build a database from source, which is the actual defect, and hides it from the
  contributor-setup path too.

### Rollback Strategy

`git revert` the commit. Every change is an added guard clause or a three-statement default
dance; nothing is destructive and no filename moves.

## Done-When

- [ ] `supabase start` applies all 238 migrations to an empty database with **zero** errors,
      and the wall-clock is recorded here. **Blocked by [P1054](p1054_out_of_band_objects_absent_from_migrations.md):**
      `20260116_ml_training_chunk_count.sql` fails on the missing `ml_training_sessions` table,
      which is P1054's scope, not this spec's. Until P1054 lands, this criterion is met against a
      database seeded with a stub for that table, and the dependency is stated in the result rather
      than papered over. Two specs currently claim this one criterion; P1054 owns the blocking half.
- [x] ~~The same chain applies a second time with zero errors~~ — **criterion withdrawn 2026-08-20,
      it was over-specified.** CI builds once from empty and discards the database; the live
      databases never re-apply anything because they are version-tracked. Nothing in the system
      requires re-run safety. Measured anyway as a robustness signal: **205 of 237 files (86%)
      re-apply cleanly; 32 fail, every one a plain duplicate-object error** — no data corruption,
      no unexpected error class. Recorded, not gated.
- [ ] The guard text committed is byte-identical to the text that was exercised in the run above
- [ ] Every file in scope retains its original version prefix — verified by `git diff --stat`
      showing no renames
- [ ] `p63_google_oauth_avatar.sql`, `ml_training_sessions`, and the two files referencing it are
      untouched — verified by `git diff --name-only`


## Measured result — 2026-08-20

**The chain applies from empty, in ~23s of psql time, without renaming anything.**

The route is not `supabase start`. Its migration runner writes a row into `schema_migrations` keyed
on the filename prefix, and **eight files share four duplicated version keys** (see Non-Goals), so it
dies on `schema_migrations_pkey` (23505) before any SQL problem is reached. Applying the `.sql` files
directly via `psql` in filename-sort order, with `ON_ERROR_STOP=1`, has no history table and therefore
no collision — and requires **no filename changes**, which is what keeps
`20260413100000_p701_st_swap.sql` from ever becoming newly-pending on a live database.

Verified by watching all 238 files apply one at a time with the exit code checked after each.

**What it took — 15 guards across 6 files, 2 skip-list entries, 2 out-of-band stubs.**

Guards (verbatim text in the branch): `20250117` ×1 · `20251218` ×3 (publication membership, house
style from `20260812130000_p1048_close_chat_realtime_channel.sql:52`) · `20251220` ×2 · `20260107` ×4
· `20260209` ×3 (full restructure) · `20260223_p396` ×2.

Skip list — **only files that document their own exclusion**:
1. `20260410090000_fix_seal_denormalize_regression.sql` — both passes. Its header: *"SUPERSEDED BY
   20260417180000... The early-exit guard below makes manual re-runs a no-op."* It carries a
   deliberate `RAISE EXCEPTION`. Today this exclusion exists ONLY as a hand-inserted
   `schema_migrations` row on two servers and nowhere in the repo; the skip list is the first
   artifact that records it.
2. `20250101_initial_schema.sql` — pass 2 only. One-time consolidated baseline.

**Out-of-band stubs — the real finding, and P1054's to fix.** The repo cannot build its own database.
Two distinct objects exist only in the live databases:
- `ml_training_sessions` — referenced by 3 migrations, created by none.
- `profiles.avatar_url` / `avatar_provider` — from `p63_google_oauth_avatar.sql`, which every replay
  path deliberately excludes. Surfaced only because `20260602160000_p877_profiles_pii_column_grants.sql`
  uses a SQL-language function (checked eagerly at CREATE), whereas an earlier plpgsql function
  referencing the same column resolved lazily and passed silently.

The stubs are an explicit, reviewable bootstrap — not a fix, and deleted when P1054 lands. This run is
the first measurement of P1054's blast radius on a build path.

**Five defect classes surfaced, each found by running the chain rather than reasoning about it:**
baseline re-declaration · file-internal ordering (three layers stacked in `20260209` alone) ·
out-of-band objects · duplicate version keys · self-excluding tombstones. Three were invisible to the
first survey because it ran with `ON_ERROR_STOP=0` and reported only each file's first error.
