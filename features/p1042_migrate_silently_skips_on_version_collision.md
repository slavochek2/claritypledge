---
status: week
type: bug
rank: 15
severity: high
date_reported: '2026-08-10'
created_date: '2026-08-10'
tags: [tooling, migrations, supabase, concurrency]
delivery_stage: create-bug
pipeline_ran: [create-bug]
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

- [ ] Running `migrate.sh` on a migration whose version was recorded by a different file exits
      non-zero and names both filenames — verified by staging the collision and pasting the exit code
      (epistemic gate 7: the guard must be observed failing, not merely present)
- [ ] A normal re-run of `migrate.sh` with no new migrations still exits 0 and reports
      `Applied 0 new migration(s)` — no false positives on the ordinary no-op path
- [ ] A genuinely new migration still applies and is recorded with its filename in
      `schema_migrations.name`
- [ ] Pre-existing history rows with `name = NULL` do not trigger the hard failure
