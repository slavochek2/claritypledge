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
