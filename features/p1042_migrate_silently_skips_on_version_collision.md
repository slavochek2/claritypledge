---
status: in-progress
type: bug
rank: 15
severity: high
date_reported: '2026-08-10'
created_date: '2026-08-10'
tags: [tooling, migrations, supabase, concurrency]
delivery_stage: fix
pipeline_ran: [create-bug, reproduce, fix]
reproduce_artifact:
  test_file: scripts/test-p1042-version-collision.sh
  root_cause: "migrate.sh:328 treats the 14-digit version prefix as a globally unique key; nothing enforces uniqueness and apply_via_api (migrate.sh:122) records only version, never name — so a second file with a colliding prefix is reported '(already applied, skipping)', exits 0, and can never run"
  confidence: high
  scenarios_in_scope: [ledger-name-mismatch, historical-null-name-in-tree-duplicate, both-pending-arming-step, clean-noop, uncollided-new-migration]
  scenarios_deferred: []
  reproduced_at: 2026-08-24
---

# P1042: `migrate.sh` silently skips a migration when another file already claimed its version

## Summary

`migrate.sh` decides a migration is "already applied" by matching its filename's version prefix
against `supabase_migrations.schema_migrations` — so when two different migration files share a
timestamp, the second one is never applied while the script prints `already applied, skipping`,
`Applied 0 new migration(s)`, and exits 0.

## Root Cause

`scripts/migrate.sh:319` derives `VERSION` from the leading digits of the basename, and
`scripts/migrate.sh:327-331` skips the file if that version appears in `REMOTE_VERSIONS`:

```bash
VERSION=$(echo "$BASENAME" | sed -E 's/^([0-9]+)[_.]?.*/\1/')
...
if echo "$REMOTE_VERSIONS" | grep -qx "$VERSION"; then
  echo "  - $BASENAME (already applied, skipping)"
  continue
fi
```

The version is treated as a globally unique key, but nothing enforces uniqueness. Concurrent
worktree sessions each author migrations against their own `supabase/migrations/` directory and
cannot see each other's pending files, so two sessions picking the same timestamp is routine, not
exotic. `apply_via_api` (`scripts/migrate.sh:122`) records only the version — it never writes the
`name` column — so the history table retains no evidence of *which file* claimed a version, and
the collision is undetectable after the fact.

The failure is silent in the strongest sense: no warning, no non-zero exit, and the closing
`Applied 0 new migration(s)` line reads as "nothing to do" rather than "your migration did not run."

## Reproduction Steps

1. In worktree A, create `supabase/migrations/20260810140000_featureA.sql` and apply it with
   `./scripts/migrate.sh` (any env). It applies and records version `20260810140000`.
2. In worktree B — with no visibility into A's pending file — create a *different* migration that
   happens to use the same timestamp, e.g. `20260810140000_featureB.sql`.
3. Copy B's file into the main repo and run `./scripts/migrate.sh` from there.
4. Observe: `- 20260810140000_featureB.sql (already applied, skipping)`, then
   `Applied 0 new migration(s) via Management API.`, exit 0.
5. Query the live schema for the object B was supposed to change — it is unchanged.

**Reproduction rate:** 100% whenever two migration files share a version prefix. Observed live on
2026-08-10 during P1034 (see Evidence).

## Expected Behavior

A migration file that has never been applied must either be applied or hard-fail with a non-zero
exit. When a file's version is already present in remote history but was recorded by a *different*
file, the script should stop and name the collision, so the author can renumber.

## Actual Behavior

The unapplied migration is skipped and the run reports success. The author has no signal short of
independently querying the live schema.

## Evidence (observed 2026-08-10, test DB)

During P1034, `20260810160000_p1034_bind_story_points_author.sql` was first authored as
`20260810140000_...` — a timestamp already claimed by `20260810140000_p1038_bind_insert_clarity_sessions.sql`
in another worktree. `migrate.sh` output:

```
  - 20260810140000_p1034_bind_story_points_author.sql (already applied, skipping)

Applied 0 new migration(s) via Management API.
```

Exit 0, no warning. The live policy was then queried directly and was **unchanged** — still the
pre-fix definition. Renaming to `20260810160000` and re-running applied it correctly
(`✓ ... applied`, `Applied 1 new migration(s)`), confirmed again against `pg_policies`.

The only reason this was caught is that the P1034 canary was re-run and the policy independently
queried rather than trusting the script's exit code.

## Evidence (observed 2026-08-24, PROD — second occurrence)

It happened again, on prod, 14 days after this bug was filed. Recorded here rather than in a new
spec; P1154 was opened for it and rejected as a duplicate of this file.

**What was skipped.** `20260819160000_p1114_event_room_tables.sql` and
`20260819170000_p1114_event_room_rpcs.sql` both collide with P1104 files carrying the identical
prefixes. P1104's landed first, so both P1114 files have reported `(already applied, skipping)` on
every run since and have never executed on prod.

*(Filenames as they stood at the time of the incident. Both were renumbered during the /fix repair
to `20260819161000_` and `20260819171000_` respectively — see § Repair below.)*

**Confirmed against prod, not inferred from the ledger:**

```
SELECT count(*) FROM pg_tables WHERE tablename='event_room_members';   -- 0
SELECT count(*) FROM pg_proc  WHERE proname='get_letter_results';      -- 1
```

**Downstream damage:**

1. Three follow-up migrations (`20260821120000`, `20260821170000`, `20260821180000`) fail on every
   apply with `42P01: relation "public.event_room_members" does not exist`. Reproduced during a real
   `migrate.sh --env prod --yes` run on 2026-08-24.
2. `src/app/data/event-room-service.ts:162` calls `supabase.rpc('get_room_readiness_distribution')`.
   That file is deployed and `/events/:slug/room` is ungated (`src/App.tsx:918`), so live code calls
   a function prod does not have. (Traced in code; a live request was not issued.)

**Full collision census** — five prefixes, ten files, from `uniq -d` over the version prefixes:

| Version | Files | Outcome |
|---|---|---|
| `20260819160000` | `p1104_reserve_agent_name_at_the_table` / `p1114_event_room_tables` | p1114 **never ran** |
| `20260819170000` | `p1104_agents_cannot_self_promote` / `p1114_event_room_rpcs` | p1114 **never ran** |
| `20260409120000` | `fix_position_history_trigger` / `patch_live_state_auto_reveal` | both ran |
| `20260413100000` | `p699_get_letter_results` / `p701_st_swap` | both ran |
| `20260413110000` | `p699_inbox_items_no_param` / `p701_drop_story_title` | both ran |

Three of five were survived by apply ordering, not by anything structural.

**This occurrence changes one of the original decision's conclusions.** The 2026-08-11 entry rejected
an in-repo duplicate-prefix scan because *"the colliding files lived in different worktrees, so
neither tree could see the other."* That was true then. On 2026-08-24 both colliding files were
committed and present in the same `supabase/migrations/` directory, so a plain `uniq -d` over the
prefixes finds them at commit time. **Both controls are needed and neither subsumes the other:** the
cross-worktree case needs the apply-time hard-fail specified above; the same-tree case is catchable
earlier and more cheaply at authoring time. There is currently no such check — verified by grepping
`pre-commit-checks.sh` and `scripts/lib/`.

**Also needed, and not currently in the Acceptance Criteria:** prod repair. The two skipped P1114
files need unique prefixes so they stop being shadowed, then the three failing follow-ups apply.
Check test-DB state before renaming — a rename makes a migration pending again wherever it already
ran, so the SQL must be idempotent first.

## Scenario Audit (2026-08-24, during /reproduce)

Enumerating every way a run can reach the skip branch at `migrate.sh:328`, and which control
would fire:

| # | Scenario | Correct behavior | Covered by |
|---|---|---|---|
| 1 | Version in ledger, recorded by the **same** file (`name` non-NULL) | skip | already correct |
| 2 | Version in ledger, recorded by a **different** file (`name` non-NULL) | **abort** | Fix step 2 |
| 3 | Version in ledger with `name` **NULL**, two files in-tree share the prefix | **abort** | **nothing — see below** |
| 4 | Version in ledger with `name` NULL, only one file in-tree has the prefix | skip | already correct |
| 5 | Two files share a prefix, **neither** applied yet | **abort** | **nothing — see below** |
| 6 | Colliding files live in **different worktrees**, only one in this tree | **abort** | Fix step 1+2 |

**The specified fix does not catch the occurrence that motivated it.** Measured against the test DB
on 2026-08-24:

```
SELECT count(*) AS total, count(*) FILTER (WHERE name IS NULL) AS name_null
  FROM supabase_migrations.schema_migrations;   -- total 248, name_null 217

SELECT version, name FROM supabase_migrations.schema_migrations
 WHERE version IN ('20260819160000','20260819170000','20260409120000',
                   '20260413100000','20260413110000');
-- all five rows: name = NULL
```

- **Fix step 2** (abort when the recorded `name` differs from the current basename) cannot judge a
  row whose `name` is NULL. All five real collisions are such rows, so step 2 never fires for any
  of them. It protects only collisions whose first file is applied *after* this fix ships.
- **Fix step 3**'s fallback — warn when the skipped file is *untracked in git* — also never fires:
  all ten colliding files are tracked (`git ls-files --error-unmatch`, verified 2026-08-24).

So scenarios 3 and 5 — which include **every collision currently in the repo**, and the 2026-08-24
prod incident — are covered by neither specified step. The in-tree duplicate-prefix scan, listed in
Fix Approach as "also worth evaluating," is the **only** control that covers them, and is therefore
promoted from optional to required. Conversely it cannot see scenario 6 (files in sibling
worktrees), which only the ledger-`name` mechanism catches. **Both controls are required; neither
subsumes the other.**

## Reproduction (hermetic canary, 2026-08-24)

`scripts/test-p1042-version-collision.sh` drives the real `migrate.sh` inside a throwaway
`mktemp` project dir with `npx`, `curl`, and `security` stubbed on PATH — no network call, no
keychain read, no database touched. Current output:

```
  FAIL hard-fails-on-collision — expected NON-ZERO exit, got 0
       migrate.sh reported success while p1034_featureB.sql never ran:
           - 20260810140000_p1034_featureB.sql (already applied, skipping)
           - 20260810140000_p1038_featureA.sql (already applied, skipping)
         Applied 0 new migration(s) via Management API.
  FAIL names-both-files — an aborting run must name BOTH colliding files so the author can renumber
  OK   allows-clean-noop — no new migrations still exits 0
  OK   applies-new-migration — uncollided new file still applies
  FAIL aborts-when-both-pending — expected NON-ZERO exit; two files sharing a prefix must never both apply

Passed: 2  Failed: 3        (exit 1)
```

The two `OK` lines are the false-positive guards: the fix must not make an ordinary no-op run or a
genuinely new migration start failing.

**One canary defect found and fixed during this phase**, worth recording because it is the repo's
own recurring shape: the `names-both-files` assertion initially passed while the bug was fully
present, because both filenames already appear in the buggy output as two ordinary
`(already applied, skipping)` lines. A bare name match verified the wrong thing. It is now gated on
a non-zero exit — only an aborting run can be emitting a collision message. (Epistemic gate 7b:
green bounds what the fixture modelled.)

## Census Correction (2026-08-24, during /fix)

Re-running the collision census with migrate.sh's *own* version rule — all leading digits, not a
fixed 14 — and then verifying each half against **both** environments by querying for an object it
creates, changed three rows of the original table. The original census inferred "both ran" from the
ledger; the ledger structurally cannot answer that question, which is the bug itself.

| Version | Files | Original claim | Measured 2026-08-24 |
|---|---|---|---|
| `20260223` | `p396_host_rls_and_session_constraints` / `p414_profile_bio` | **absent from census** | both ran (test + prod) — a 4th collision the 14-digit `uniq -d` never saw |
| `20260409120000` | `fix_position_history_trigger` / `patch_live_state_auto_reveal` | both ran | confirmed, both envs |
| `20260413100000` | `p699_get_letter_results` / `p701_st_swap` | both ran | p699 confirmed both envs; **p701 unverifiable** — a data permutation with no post-hoc discriminator |
| `20260413110000` | `p699_inbox_items_no_param` / `p701_drop_story_title` | both ran | **FALSE on test.** `stories.title` is still present on test, absent on prod → `p701_drop_story_title` never ran on test |
| `20260819160000` / `20260819170000` | P1104 / P1114 | p1114 never ran (prod) | confirmed; on **test** the collision resolved the other way — all four objects exist there |

Two findings worth keeping:

1. **`20260223` was missed because the census assumed a 14-digit timestamp.** `migrate.sh` derives
   the version as `^[0-9]+`, so the 8-digit `20260223` is a version like any other and two files
   carry it. A census that does not use the same extraction rule as the code under test measures a
   different population than the one that can fail.
2. **`20260413110000` is a third live instance, in the opposite direction from the reported one.**
   The reported case skipped on prod; this one skipped on test. It went unnoticed for four months
   because nothing reads `stories.title` any more — verified by grep across `src/`, so the drop is
   safe to complete, but the migration is still a migration that never ran.

Verification queries and their per-environment results are recorded in
`supabase/migrations/.duplicate-version-allowlist`, next to the entries they justify.

## Affected Files

- `scripts/migrate.sh:319` — version derived from basename, assumed globally unique
- `scripts/migrate.sh:327-331` — skip branch that produces the false "already applied"
- `scripts/migrate.sh:120-122, 134-138` — `apply_via_api` records only `version`, never `name`,
  so collisions leave no forensic trail

## Severity

**High** — the same skip logic runs for `--env prod` (the loop is env-agnostic; `REMOTE_VERSIONS`
is simply fetched from the target project). A prod migration can therefore silently not apply while
the tool reports success. The instance that surfaced this was a security fix (P1034, an RLS policy
binding authorship) — had it not been independently verified against `pg_policies`, it would have
been marked shipped while the hole stayed open. Not **critical**: it requires a version collision
to trigger, and it fails closed (the schema is unchanged, not corrupted).

## Fix Approach

Make the version→file mapping verifiable instead of assumed:

1. **Record the filename.** `apply_via_api` already writes to `schema_migrations`; include the
   basename in the `name` column (currently always NULL) alongside `version`.
2. **Hard-fail on mismatch.** In the skip branch, when remote history has a `name` for that version
   and it differs from the current basename, exit non-zero with both filenames named — this is a
   collision, not a no-op.
3. **Fallback for historical rows.** Every pre-existing row has `name = NULL`, so rule 2 cannot
   judge them. For those, warn only when the skipped file is untracked in git (a file that has
   never been committed should not plausibly already be applied).

Also worth evaluating during `/reproduce`: a pre-flight scan for duplicate version prefixes across
sibling worktrees' `supabase/migrations/` directories, which would catch the collision at authoring
time rather than at apply time.

## Acceptance Criteria

**Guard — apply time** (`migrate.sh`)

- [x] Running `migrate.sh` on a migration whose version was recorded by a different file exits
      non-zero and names both filenames — canary `aborts-on-foreign-ledger-name` (exit 1), and the
      guard was proven to detect its own absence by neutralising `_migration_name_matches` and
      observing exactly that one assertion fail. Also fired **live** on 2026-08-24 against the real
      test ledger (`20260223`: ledger `p396_host_rls_and_session_constraints` vs on-disk
      `20260223_p414_profile_bio.sql`)
- [x] **Two files in-tree sharing a version prefix abort the run, regardless of ledger state** —
      canary `hard-fails-on-collision` (version present in ledger) and `aborts-when-both-pending`
      (ledger empty), both exit 1
- [x] A genuinely new migration still applies and is recorded with its filename in
      `schema_migrations.name` — live evidence from the 2026-08-24 test apply:
      `20260413110001 -> p701_drop_story_title`, `20260819161000 -> p1114_event_room_tables`,
      `20260819171000 -> p1114_event_room_rpcs`

**No false positives**

- [x] A normal re-run of `migrate.sh` with no new migrations still exits 0 and reports
      `Applied 0 new migration(s)` — canary `allows-clean-noop`
- [x] A pre-existing history row with `name = NULL` whose version is claimed by exactly **one**
      in-tree file does NOT trigger the hard failure — canary `allows-clean-noop` uses exactly that
      shape (ledger row with no `name` key, one in-tree file)
- [x] A grandfathered pair whose ledger row names only ONE of its two files does not abort —
      canary `allowlist-binds-both-guards`. Added after the live `20260223` abort showed the two
      guards were consulting different sources of truth
- [x] `scripts/test-p1042-version-collision.sh` passes **9/9** (was specified as 5/5; four
      assertions were added because the original five all passed through guard 1, leaving guard 2
      entirely unexercised — epistemic gate 7b)

**Guard — authoring time** (pre-commit)

- [x] Committing two migrations that share a version prefix is **rejected**, with the rejection
      observed and a non-zero exit code pasted — staged a deliberate colliding file, gate exited 1
      naming all three claimants; a uniquely-prefixed file staged the same way exited 0
- [x] The guard tolerates the historical pairs that already applied cleanly rather than blocking
      every commit. **Corrected during /fix:** the three are `20260223`, `20260409120000` and
      `20260413100000` — NOT `20260413110000`, which measurement showed was never applied on test
      and is therefore repaired, not grandfathered. `20260223` was absent from the original census

**Repair — test** (founder-approved 2026-08-24, test only)

- [x] The two skipped P1114 files carry unique version prefixes, and their SQL was confirmed
      idempotent before the rename (`CREATE TABLE/INDEX IF NOT EXISTS`, `CREATE OR REPLACE
      FUNCTION`, `DROP POLICY IF EXISTS`, and the `ALTER PUBLICATION` wrapped in
      `EXCEPTION WHEN duplicate_object`)
- [x] `20260413110000_p701_drop_story_title` renumbered to `20260413110001` and applied to test;
      `stories.title` is now absent on test, matching prod. No code reads it (grep over `src/`)
- [x] All three applied to test; the duplicate scan now exits 0 on the whole tree

**Repair — prod** (NOT DONE — founder scoped this step to test only; prod apply is a separate ASK)

- [ ] `event_room_members` and the P1114 RPCs exist on prod
- [ ] The three follow-up migrations (`20260821120000`, `20260821170000`, `20260821180000`) apply
      cleanly; `migrate.sh --env prod` reports zero pending
- [ ] `/events/:slug/room` loads against prod without a missing-function error — verified by an
      actual request, not a code trace
- [ ] Prod smoke passes after the applies

## Repair (2026-08-24)

Three files renumbered so that no two share a version prefix:

| Was | Now | Why |
|---|---|---|
| `20260819160000_p1114_event_room_tables.sql` | `20260819161000_` | shadowed by P1104 on prod; never ran there |
| `20260819170000_p1114_event_room_rpcs.sql` | `20260819171000_` | same |
| `20260413110000_p701_drop_story_title.sql` | `20260413110001_` | shadowed by P699 on test; never ran there |

Ordering is preserved: `…161000` (tables) precedes `…171000` (rpcs, which depends on the tables),
and both precede the `20260821*` follow-ups.

Applied to **test** only. Prod still lacks the P1114 schema — the live defect in the Evidence
section above is **not yet repaired**, and that is why this spec is not at `qa`.

In-repo references to the three old filenames were updated (specs, `docs/decisions.md`, the P1114
provenance comment, `src/`, `e2e/`), with two deliberate exceptions:

- The historical Evidence section above keeps the original names, with a pointer to this section.
- `20260410090000_fix_seal_denormalize_regression.sql` and `20260417180000_p701_scrub_title_references.sql`
  keep `20260413110000_p701_drop_story_title.sql` in their prose. Editing them re-triggers the
  function-redefinition gate (`--diff-filter=AM` fires on any modification), which would require
  adding a `-- diffed against:` provenance line to two 2026-04 migrations — a claim about a diff
  nobody performed. A stale name in a historical comment is the smaller error than a fabricated
  provenance annotation.
