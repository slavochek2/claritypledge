---
status: week
type: task
rank: 67
workstream: infrastructure
created_date: '2026-08-24'
tags: [migrations, prod, silent-skip, deploy]
delivery_stage: create-spec
pipeline_ran: [create-spec]
drafted_by: opus
driver: anomaly
---

# P1154: Two migrations sharing a version prefix — one silently never runs

## Problem

**Situation:** `migrate.sh` decides whether a migration still needs applying by comparing its
**14-digit version prefix** against the versions already recorded on the target database. Filenames
are not part of that comparison.

**Complication:** Five version prefixes in `supabase/migrations/` are each used by **two different
files**. When the first file of a pair is applied, its version is recorded — and the second file,
which contains entirely different SQL, is then reported as `(already applied, skipping)` on every
subsequent run, forever. It cannot ever execute. The skip is indistinguishable in the output from a
genuine no-op.

**Measured on prod, 2026-08-24:**

| Version | Files | Outcome |
|---|---|---|
| `20260819160000` | `p1104_reserve_agent_name_at_the_table` / `p1114_event_room_tables` | p1114 **never ran** |
| `20260819170000` | `p1104_agents_cannot_self_promote` / `p1114_event_room_rpcs` | p1114 **never ran** |
| `20260409120000` | `fix_position_history_trigger` / `patch_live_state_auto_reveal` | both ran — no damage |
| `20260413100000` | `p699_get_letter_results` / `p701_st_swap` | both ran — no damage |
| `20260413110000` | `p699_inbox_items_no_param` / `p701_drop_story_title` | both ran — no damage |

Verified against prod directly: `event_room_members` returns `count 0` from `pg_tables`, while
`get_letter_results` and `get_inbox_items%` both return `count 1` from `pg_proc`. So three of the
five collisions were survived by luck of ordering; one was not.

**Consequences already in production:**

1. `event_room_members` and the P1114 room RPCs **do not exist on prod**, although the ledger
   reports their migrations as applied.
2. Three follow-up migrations (`20260821120000`, `20260821170000`, `20260821180000`) **fail on
   every apply attempt** with `42P01: relation "public.event_room_members" does not exist`.
   Reproduced 2026-08-24 during a real `migrate.sh --env prod --yes` run.
3. `src/app/data/event-room-service.ts:162` calls `supabase.rpc('get_room_readiness_distribution')`.
   That file is already deployed. The route `/events/:slug/room` is ungated in `src/App.tsx:918`.
   **The page calls a function that does not exist on prod.** (Traced in code — a live request was
   not issued, so the user-visible symptom is inferred, not observed.)
4. The daily drift job has flagged this since 2026-08-21 in **issue #10**, appended once per day,
   unread for three days.

**Question:** How do we get prod correct, and what makes a version collision impossible to
introduce again rather than merely documented?

### Why this is the same failure as P1147/P1153

`(already applied, skipping)` is a success signal computed over the **wrong key**. The system
compares versions; the thing that must be unique is the migration. When those two disagree, "we
already did this" and "we can never do this" render identically — the exact shape recorded in
`decisions.md` 2026-08-21: *"the tool's success signal is computed over a set that was empty, and
emptiness renders identically to success."* Third instance in a week, after the coverage ratio
(P1153 D-1) and the tier comparison (P1153 D-3).

## Appetite

**Blast radius: high.** Touches prod schema and the migration ledger — the record that every future
deploy decision is read from.

**Reversibility: mixed.** Renaming an unapplied migration file is reversible. Applying the P1114
base schema to prod is a forward-only change (new tables, new functions), though it creates rather
than destroys. Nothing here drops data.

**Decision density: one.** Whether the two skipped P1114 files are renamed to fresh version
prefixes, or the ledger is corrected to admit they never ran. See Alternatives.

## Solution

Two halves. The spec is not done when prod is correct — that is the half that does not prevent
recurrence.

### Immediate — make prod match the migration files

1. Establish, per colliding pair, which file actually ran, by checking for its objects on prod
   rather than trusting the ledger.
2. Give the two skipped P1114 files unique version prefixes so the applied-check stops shadowing
   them. Check the **test** database before renaming — if either already ran there under the old
   version, renaming makes it pending again on test and it must be verified idempotent
   (`IF NOT EXISTS` / `CREATE OR REPLACE`) before it is re-run anywhere.
3. Apply, in order, then the three follow-ups that have been failing.
4. Confirm the event room works against prod — an actual request, not a code trace.

### Sustainable — make a collision impossible to commit

5. **A pre-commit check that rejects any two migrations sharing a version prefix.** There is
   currently **no such guard** — verified by grepping `pre-commit-checks.sh` and `scripts/lib/`.
   This is the control that would have stopped it at authoring time, which is the only moment the
   fix is free.
6. **`migrate.sh` must fail loudly on a collision rather than skipping.** Even with the guard,
   history already contains five, and a rebase or cherry-pick can reintroduce one. If two files
   map to one version, that is an error, never a skip.
7. Per epistemic gate 7, both controls must be **observed failing** before they are trusted: stage
   a deliberate duplicate, watch the hook reject it and the script abort, and paste the non-zero
   exit codes.

## Risks / Non-Goals

### Risks

- **Renaming rewrites migration history.** Anyone with the old version already applied on a local
  or test DB sees the renamed file as pending. Mitigation: confirm the SQL is idempotent before
  renaming, and check test DB state first.
- **A from-scratch replay may still not succeed.** `20260821140000`'s own header notes that
  `20260116` and `20260404120000` already ALTER a table created out-of-band, so a fresh-DB replay
  fails independently of this work. Do not treat replay-cleanliness as this spec's finish line —
  it is P1132's.
- **The three older collisions are survivable today but still latent.** They ran only because of
  apply ordering. Renaming them is optional; leaving them means the guard in step 5 must tolerate
  pre-existing duplicates or the hook blocks every commit.

### Non-Goals

- Do NOT drop, rewrite, or renumber any migration that has genuinely been applied to prod.
- Do NOT fix the unread-signal problem here — issue #10 was correct, timely, and ignored for three
  days. That is a real defect but a different one; file it separately rather than bundling it.
- Do NOT resolve the fresh-DB replay ordering problem (P1132's scope).
- Do NOT change what the four remaining `Anyone can insert …` policies do — the P1138 migration
  deliberately scoped to UPDATE, and the anonymous demo flow may depend on them.
- Do NOT rely on the deploy manifest as the source of truth for what is applied — it under-reported
  this by two on 2026-08-24 (said 3 pending, the authoritative list showed 5).

### Alternatives Considered

- **Correct the ledger instead of renaming** — mark the two P1114 versions unapplied so they re-run
  under their existing prefixes. Rejected: the collision remains, so the very next apply re-skips
  whichever file loses the race, and the ledger no longer describes reality.
- **Rename all ten colliding files for consistency.** Rejected as the default: three pairs already
  ran correctly on prod, and renaming an applied migration makes it pending again everywhere for no
  benefit. Revisit only if the pre-commit guard cannot tolerate historical duplicates.
- **Do nothing and hand-apply the P1114 SQL directly.** Rejected: prod would then hold objects no
  migration records, which is how `ml_training_sessions` came to have no `CREATE TABLE` anywhere.

### Rollback Strategy

The renames are a `git revert`. The applied SQL creates tables and functions and drops nothing, so
rollback is a `DROP` of exactly what was created, or leaving the unused objects in place — neither
loses data.

## Done-When

- [ ] Every colliding pair has a recorded verdict: which file ran, established by checking prod for
      its objects, not by reading the ledger
- [ ] `event_room_members` and the P1114 RPCs exist on prod
- [ ] The three follow-up migrations apply cleanly; `migrate.sh --env prod` reports zero pending
- [ ] `/events/:slug/room` loads against prod without a missing-function error — verified by an
      actual request
- [ ] Committing two migrations that share a version prefix is **rejected**, and the rejection was
      observed with a non-zero exit code pasted, not asserted
- [ ] `migrate.sh` **aborts** on a version collision instead of skipping, likewise observed failing
- [ ] Prod smoke passes after the applies
- [ ] Issue #10 closes on its own the next morning, confirming the drift is genuinely gone rather
      than merely believed gone

## Related

- **Cause of:** the three failed applies on 2026-08-24, and the broken event-room route.
- **Same failure class:** P1153 (the audit's false all-clear), P1147 — a success signal computed
  over the wrong set. See `decisions.md` 2026-08-21.
- **Adjacent, deliberately not bundled:** the daily drift signal is correct and unread (issue #10,
  3 days). Needs its own spec.
- **Not in scope:** P1132 (fresh-DB migration replay ordering).
