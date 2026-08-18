---
status: week
type: bug
rank: 38
severity: medium
workstream: infrastructure
date_reported: '2026-08-18'
created_date: '2026-08-18'
tags: [migrations, ship, deploy, security, tooling]
delivery_stage: create-bug
pipeline_ran: [create-bug]
driver: anomaly
feature_type: backend
---

# P1106: `/ship` invalidates the `requires-frontend` marker it depends on, stalling the whole migration queue

## Summary

A migration that must not reach prod before its frontend does carries
`-- requires-frontend: <sha>`. The sha is written at **authoring** time, on the feature branch.
`/ship` **cherry-picks**, which mints a new commit with a different sha — so by the time the
migration is eligible to apply, its marker names a commit that exists on no branch. `migrate.sh`
then hard-blocks it, correctly and fail-safe, and because it exits on **any** blocked pending
migration, every unrelated migration queued behind it never applies either.

**Measured failure rate: 3 of the 6 migrations carrying the marker have needed a manual repoint**
(P1053 `7926a636`, P1057 `02c83e54`, P1071 `93df60a4`). Two of those repoints happened today, in
two concurrent sessions, independently.

## Root Cause

The marker is authored at the one moment its value is guaranteed to become wrong. `/ship` knows
both shas — the branch commit it picks and the main commit it produces — and is the only actor
that can map one to the other, but it does not rewrite the marker. Nothing else can: after the
ship, the original sha is unrecoverable from the migration file alone.

Two aggravating factors, both observed:

1. **Fan-out.** `migrate.sh` exit-1s on the first blocked migration, so one stale marker strands
   the entire queue. Today that queue was 8 deep and contained four security fixes.
2. **Silence.** Nothing reports the stall. `/ship` prints "Ready to push" and the spec closes;
   the migration's non-application is invisible until someone runs a prod migrate and reads the
   refusal. P1053's migrations sat unapplied from 2026-08-12 to 2026-08-17 this way — five days,
   during which the spec read as shipped.

`.private/docs/security-log.md` § 2026-08-18 records the P1057 instance; the P1057 Migration B
header notes a contributing cause (a ship that aborted and left its worktree live, so the manual
repoint step was never reached) fixed separately in `a70f9e18`.

## Reproduction Steps

1. On a feature branch, author a migration with a client-breaking shape and add
   `-- requires-frontend: <sha of the frontend commit on this branch>`.
2. Run `/ship pN`. The cherry-pick rewrites the frontend commit's sha.
3. Push to `origin/main`.
4. Run `./scripts/migrate.sh --env prod`.
5. Observe: the migration is refused because the marker sha is not an ancestor of `origin/main`,
   and every other pending migration is refused with it.

**Reproduction rate:** 100% whenever the marker is written pre-ship and not manually repaired.

## Expected Behavior

After a ship, the marker names the post-merge commit, and a prod migrate applies the migration
without human intervention. If it cannot, the stall is reported at ship time — not discovered days
later at migrate time.

## Actual Behavior

The marker names a commit that exists on no branch. The migration and everything behind it are
silently held back until a human notices and hand-edits the sha.

## Affected Files

- `scripts/git-ops.sh` — the `ship` subcommand; cherry-picks without rewriting the marker
- `scripts/migrate.sh` — enforces the marker; exits on the first blocked migration
- `supabase/migrations/*.sql` — 6 files carry the marker; 3 have needed repair
- `scripts/pre-commit-checks.sh` / `check-migration-client-safety.sh` — where the marker is required

## Severity

**Medium.** It never breaks production — the refusal is fail-safe and correct. What it does is
silently delay security fixes and let a spec read as shipped while its schema change is not live.
That gap is the actual cost, and it is invisible by construction.

## Fix Approach

**Not verified against current code — leads, not facts.**

1. **Rewrite the marker during `/ship`.** After the cherry-pick, for each picked migration carrying
   `requires-frontend`, map the old sha to the new one and rewrite it in place, then amend. `/ship`
   is the only actor holding both values.
2. **Consider replacing the sha with something ship-stable.** A sha is the one identifier a
   cherry-pick is guaranteed to invalidate. A branch-independent handle — the spec's P-number, or a
   marker file the frontend commit touches — may remove the failure mode instead of automating
   around it. **Argue for this before automating (1):** a fix that keeps a fragile identifier and
   adds machinery to repair it is worse than one that picks an identifier that does not break.
3. **Report the stall, don't just refuse it.** Whether or not 1 and 2 land, `migrate.sh` should
   distinguish "blocked because the frontend genuinely is not deployed" from "blocked because the
   marker names a commit that exists nowhere" — the second is always a defect, never a legitimate
   gate, and can say so.
4. **Reconsider the fan-out.** Whether one blocked migration should strand unrelated ones is a
   separate call. Skipping past a blocked migration risks applying migrations out of order, so
   this may be correct as-is — state the reasoning either way rather than changing it by reflex.

## Acceptance Criteria

- [ ] A migration authored with a `requires-frontend` marker and shipped via `/ship` applies to
      prod with no manual edit to the sha
- [ ] Replay control: re-running the P1071 or P1057 scenario end-to-end produces a marker that is
      an ancestor of `origin/main` without human intervention
- [ ] `migrate.sh` distinguishes "frontend not yet deployed" from "marker names a nonexistent
      commit" and says which in its refusal — proved by staging both and pasting both messages
- [ ] Gate seen to fail: the failure path is exercised and its non-zero exit pasted, per
      `.claude/rules/epistemic.md` gate 7
- [ ] The decision on fan-out (item 4) is recorded in `docs/decisions.md`, whichever way it goes
- [ ] The 6 existing markers are audited; any still-stale one is repointed

## Related

- **P1053, P1057, P1071** — the three occurrences
- **P1102** — the drift check that reverts in-flight security fixes; same family (a control that
  cannot see feature branches)
- **P886** — the outage that motivated the marker; the marker itself is not in question here
