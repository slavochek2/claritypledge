---
status: all-done
type: bug
disclosure: public
rank: 208
severity: high
created_date: '2026-08-11'
tags: [security, rls, anonymous-writes]
driver: anomaly
feature_type: backend
pipeline_ran: [inline]
completed_at: 2026-10-14
---

# P1045: Tables writable by unauthenticated callers — decide intent, then close or document

## Problem

P1038's audit only asked whether INSERT binds an *owner column*. Two surfaces fell outside
that question entirely and are open to unauthenticated writers on production:

1. **A table with no owner column at all**, carrying two INSERT policies both checking
   nothing, one reaching the anon role. It has no ownership concept, so P1038's classifier
   correctly declined to flag it — and nothing else looks at it. Reads are locked down, so
   this is a write/pollution surface rather than a disclosure one. It may well be intentional
   for anonymous capture; nobody has decided.

2. **A table whose "tightened" UPDATE policy is itself unrestricted.** The migration that
   tightened it says so in its own comment: RLS cannot see session ownership for anonymous
   users, so the policy stays permissive and enforcement is app-layer only. That is a
   documented accepted risk — but it is accepted in a migration comment, not in any spec,
   decision log, or risk register, so it is invisible to every audit that does not happen to
   read that file.

Table names and policy text in `.private/docs/security-log.md` (2026-08-10).

The pattern connecting them: **an audit scoped to one bug class certifies nothing about the
classes beside it.** P1038 will end with a per-table BOUND/NOT-APPLICABLE table that a future
reader could easily mistake for "these tables are safe."

## Confirmed instance — 2026-08-12, from the P1048 drift check

The enumeration this spec's §Solution step 1 describes has now been run once, by
`scripts/rls-drift-check.py` (P1048), and it returned **a third unauthenticated write
surface** beyond the two above: a table carrying an INSERT policy granted to `{public}`
— which includes `anon` — with `WITH CHECK (true)`, live on **both** prod and test, and
present in **no migration in this repo** (applied out-of-band). A second policy on the same
table, more restrictive but equally undocumented, shares that origin.

Two things this changes for the work below:

1. **Step 1 no longer starts cold.** Run `scripts/rls-drift-check.py` first; its
   `not-in-files` direction is the enumeration, already implemented and self-tested.
2. **Origin is now part of the classification.** The original three buckets (intended /
   unintended / accepted-in-a-comment) assume the surface was *created deliberately by a
   migration*. A policy that exists live and in no file has no author to ask and no comment
   to read, so "intended" cannot be inferred — it has to be decided fresh.

**NOT verified:** whether an anon INSERT actually succeeds end-to-end against that table.
The policy permits it; no attempt was made against production, deliberately. Confirm with a
canary before concluding either way — a grant could still block what the policy allows.

Table and policy names in `.private/docs/security-log.md` (2026-08-12), per this spec's
existing convention of keeping unpatched specifics out of the public repo.

## Appetite

Mostly a decision, not a build. The founder call is whether anonymous writes to these
surfaces are wanted. If yes, the work is documenting the acceptance where an auditor will
find it. If no, it is rate limiting or an authenticated path — a real feature, and this spec
should split.

## Solution

1. Enumerate every table where an unauthenticated caller can write: cross `pg_policies` for
   permissive INSERT/UPDATE policies reaching `public`/`anon` against `role_table_grants`.
   Live query, both environments — files are not evidence (P1046).
2. For each, classify: intended anonymous surface / unintended / already-accepted-in-a-comment.
3. For intended ones, record the acceptance somewhere durable — `docs/decisions.md` with a
   falsifier, not a migration comment.
4. For unintended ones, close them, canary first (gate 7).
5. Add the "no owner column" case to P1038's findings table as an explicit status, so the
   audit cannot be read as certifying tables it never examined.

## Risks / Non-Goals

### Risks
- **Breaking anonymous product flows.** MITIGATE — enumerate callers before closing anything.
  Anonymous capture is a deliberate part of this product.
- **Treating a migration comment as sufficient documentation.** ACCEPT-then-fix — that is
  precisely how surface 2 stayed invisible.

### Non-Goals
- Do NOT fold in the ownership-binding forgery (P1047) — different class.
- Do NOT build rate limiting here; if that is the answer, split it out.

## Done-When

- [x] Every unauthenticated write surface enumerated from live state, both environments
      — 2026-10-14, read-only catalog queries via `scripts/supabase-readonly-sql.py`, prod and
      test identical: 51 anon/public write policies × anon table and column privileges; tables
      with RLS off and views (0 rows); write policies outside `public` (none reachable); and
      anon-EXECUTE functions that write (9). Probe controls: a known writer the first regex
      missed forced a broader matcher, and known non-anon writers were confirmed absent. SQL and
      results are in `.private/docs/security-log.md` 2026-10-14.
- [x] Each classified intended / unintended, with the founder's call recorded
      — Founder confirmed 2026-10-14: keep `ml_training_sessions` signed-in INSERT (recorder writes it).
      — Classified: all remaining surfaces are intended, and each links to the spec or decision
      where it was approved. **Open:** `ml_training_sessions` (signed-in INSERT, no predicate) is
      kept under the orchestrator's keep-if-used rule because the recorder writes it on every
      recorded session. The decision entry is `Status: proposed` until the founder confirms.
- [x] Intended ones documented in `docs/decisions.md` with a falsifier
      — `docs/decisions.md` 2026-10-14 [technical] P1045 entry, with links to the existing P1083
      and P1447 entries rather than copies of them.
- [x] Unintended ones closed, each with a canary observed failing first
      — Founder accepted 2026-10-14 that P1048's closure has no recorded fail-first canary; present-state canaries stand.
      — All three original surfaces are closed on both environments (live catalog 2026-10-14).
      Present-state canaries are green on test: `p1138-reproduce` 6/6,
      `security-backlog-rls` (ml_training) 2/2, `p1048-db-schema` 5/5,
      `p1207-privilege-floor` 2/2. Failing-first was recorded for P1138 (5/5 red before the fix)
      and P1207 (red→green). **Gap:** P1048's chat UPDATE closure has no recorded failing-first
      write canary (its write side was inferred from the policy), and that cannot be re-observed
      now without restoring the dropped policy.
- [x] P1038's findings table carries an explicit "no owner column — not examined" status
      — the table lives in `docs/technical/database.md` § INSERT ownership-binding audit, the
      home P1038 chose; its own spec points there. NOT APPLICABLE is split into **NO OWNER
      COLUMN — NOT EXAMINED** (8 tables) and **NOT APPLICABLE — no client-reachable INSERT**
      (15 tables), each classified from the live catalogs on both environments.
