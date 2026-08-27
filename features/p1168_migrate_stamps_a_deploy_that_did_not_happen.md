---
status: week
type: bug
rank: 73
severity: medium
workstream: infrastructure
date_reported: 2026-08-27
created_date: '2026-08-27'
tags: [migrations, deploy-manifest, shared-checkout, tooling]
delivery_stage: fix
pipeline_ran: [create-spec, reproduce, fix]
drafted_by: opus
exec_model: sonnet
exec_effort: medium
driver: anomaly
status: in-progress
reproduce_artifact:
  test_file: scripts/test-p1168-noop-stamp.sh
  root_cause: "migrate.sh's Management API fallback path (used by --env prod always, and by any non-prod run where the CLI push fails) runs the apply loop unconditionally, then stamps + git-adds the manifest unconditionally after the loop — not gated on APPLIED_COUNT. A run where nothing is pending still stamps migrations_deployed_at and stages the edit."
  confidence: high
  surfaces_in_scope: [migrate.sh Management API fallback path — prod and non-prod]
  surfaces_deferred: [P1170 — primary CLI-success path, migrate.sh:265-273, unverifiable in this environment]
  reproduced_at: 2026-08-27
---

# P1168: `migrate.sh --env prod` stamps a deployment timestamp when it deployed nothing, and the edit is left staged on the shared main checkout

## Problem

**Situation:** Run during P1167's ship, `./scripts/migrate.sh --env prod` queried prod, printed
*"No pending migrations — prod schema matches local migration files."*, applied **zero** migrations,
ran the prod smoke (8/8 pass), and exited 0.

**Complication:** It nonetheless rewrote `supabase/deploy-manifest.json`'s
`migrations_deployed_at` from `2026-08-26T06:47:12Z` to `2026-08-27T10:17:33Z` — a record asserting a
prod deployment happened today when none did — and that edit was **staged in the index** on the shared
main checkout. Both halves are defects, and the second has already caused a real incident twice
(`decisions.md` 2026-08-23, 2026-08-25): an uncommitted-or-staged manifest edit sitting on the shared
checkout was absorbed by a concurrent session's unrelated commit, producing a phantom manifest entry.

**Question:** Should the timestamp record *when the manifest was refreshed* or *when a deployment last
happened* — and whichever it is, how does the edit stop being left in a shared index?

## Appetite

Blast radius: medium — the manifest is the record `/ship`'s drift gate reads, and a co-tenant sweep
corrupts it for everyone. Reversibility: `git revert`. Decision density: **one** — the semantics of
`migrations_deployed_at` (see Solution).

## Invariants

- **A record of a deployment is written only when a deployment occurred.** A field named
  `..._deployed_at` that also means "last checked" cannot answer the question it exists to answer.
- **No script leaves an edit staged or uncommitted on the shared main checkout.** Standing ruling,
  `decisions.md` 2026-08-23 and 2026-08-25 — a leftover there is not inert; it is an attractive
  nuisance a concurrent session can commit or mistake for live work. Cleanup belongs in the same step
  that created it.
- **Environment state comes from the environment, never from the checked-in record of it**
  (`decisions.md` 2026-08-24). This spec must not "fix" drift by editing the manifest to agree.

## Solution

**Founder decision (recorded 2026-08-27):** `migrations_deployed_at` means *when migrations were
last applied* — option (a). Skip the stamp entirely on the no-pending path; the field stays truthful
to its name. Confirmed no functional consumer reads this field (`grep -rn "migrations_deployed_at"`
— only `stamp-deploy-manifest.sh` writes it and one guidance string in `git-ops.sh:2768` mentions it
in a conflict-resolution message), so option (b)'s rename requirement is moot.

**Staging mechanism — identified, not a hook.** `scripts/migrate.sh:487` itself contains
`git -C "$PROJECT_DIR" add supabase/deploy-manifest.json 2>/dev/null || true`, added deliberately in
commit `86b455d31` (2026-08-10) to stop the stamp from blocking a later `/ship` cherry-pick. It runs
unconditionally after the unconditional stamp call at `:482` (originally), immediately following the
Management API apply loop (`:421-470`) — which itself runs unconditionally regardless of whether any
migration was actually pending, hitting `continue` on every file when nothing is pending
(`APPLIED_COUNT` stays 0). The 2026-08-27 spec draft's "neither script contains a `git add`" claim
was wrong — a plain `grep -n "git add" scripts/migrate.sh` finds it immediately; the prior grep must
have missed it or used too narrow a pattern.

**Fix:** gate the stamp + `git add` block behind `if [ $APPLIED_COUNT -gt 0 ]` in the Management API
fallback path (`scripts/migrate.sh:479-497`). This single change satisfies both original fix items —
no stamp and no staged edit when nothing was applied — because they shared one root cause (the block
wasn't gated on whether anything was actually applied). This path is taken by every `--env prod` run
and by any non-prod run where the CLI push fails (the common case in this repo's current environment
— see the primary-path note below).

**Scope note — primary CLI-success path deferred to P1170.** `migrate.sh:265-273` (a healthy
`supabase db push` exiting 0) has the identical defect in principle, but this environment's test
project has pre-existing migration-history drift that makes the CLI always fail and fall through to
the Management API fallback — the true no-op-success branch was never observed this session, so no
verified fix could be written for it (Falsify Before You Rely). Filed as
[P1170](p1170_migrate_primary_path_may_stamp_an_unverified_noop.md).

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| Skipping the stamp hides a genuine manifest refresh someone relied on | ACCEPT | The drift gate reads the migration *array*, not this timestamp; no consumer of the timestamp has been identified |
| Renaming the field breaks a reader | MITIGATE | Grep every consumer before renaming — the field is in a committed JSON file that other scripts and CI may parse |
| The staging mechanism is a hook shared by other scripts, so a fix there has wider blast radius | DEFER | Identify the actor first; scope the fix once it is known |
| This looks like the P1103 stamp bug | ACCEPT | Same script, different failure — P1103 is the migration *array* being rebuilt from the local checkout; this is the *timestamp* plus the staging. Filed separately on purpose |

**Non-Goals**

- Do **NOT** apply, roll back, or otherwise touch any prod migration. Nothing is pending; this spec is
  about the record, not the schema.
- Do **NOT** "resolve" the standing `check-deploy-manifest --env prod` drift report by editing the
  manifest. That report is a known artifact of unpushed stamp commits (`decisions.md` 2026-08-24
  second entry, and 3420) and clears on push.
- Do **NOT** change how `--env prod` resolves the manifest from `origin/main` (P820) — that design is
  deliberate and was re-confirmed this session.
- Do **NOT** fold P1103's fix into this one.

## Done-When

- [x] The staging actor is **identified and named in this spec** — `scripts/migrate.sh:487`
      (`git -C "$PROJECT_DIR" add supabase/deploy-manifest.json`), added in commit `86b455d31`
      (2026-08-10). Not a hook.
- [x] A prod run with nothing pending leaves `git status --short` **clean** — reproduced live
      2026-08-27: before = clean (only an unrelated bystander edit to `docs/process-learnings.md`
      present); after (pre-fix) = `M  supabase/deploy-manifest.json` staged,
      `migrations_deployed_at` bumped `2026-08-26T06:47:12Z` → `2026-08-27T12:37:49Z` with 0
      migrations applied, smoke 8/8 pass. Reverted the reproduction artifact
      (`git checkout HEAD -- supabase/deploy-manifest.json`) before implementing the fix. Post-fix,
      hermetic canary `scripts/test-p1168-noop-stamp.sh` (scenario `prod_noop`) asserts the same
      shape and passes: 9/9 checks green, including the identical assertion for the non-prod
      fallback path (scenario `test_noop`), no-regression checks that a genuinely pending
      migration still stamps + stages (scenario `prod_applies`), and a scenario documenting
      pre-existing mixed-outcome behavior (scenario `prod_mixed` — a run with one successful and
      one failing migration exits non-zero before reaching the stamp gate at all, so the migration
      that did apply is never stamped either; unchanged by this fix, flagged during code review and
      asserted here rather than left implicit).

      Independent code-review verification (subagent, 2026-08-27): ran the canary against the
      pre-fix code (git-diffed `main`'s copy of `migrate.sh` in) and confirmed it genuinely fails
      (4/8 at the time); ran it against the fix and confirmed 8/8 (now 9/9 after the added
      `prod_mixed` scenario); independently re-ran `test-p1042-version-collision.sh` (10/10, no
      regression) and `check-deploy-manifest.sh --env prod` (matches the pasted output above);
      grepped the repo for other `deploy-manifest.json` staging sites — only `migrate.sh:493`, plus
      `deploy-functions.sh` which structurally cannot hit the zero-applied case (always redeploys
      every function found, so out of scope).
- [x] The founder decision on `migrations_deployed_at` semantics is recorded in this spec, and the
      code matches it — option (a), *when migrations were last applied*; code now skips the stamp
      entirely when `APPLIED_COUNT` is 0 (`scripts/migrate.sh:479-497`)
- [x] If the field is renamed: N/A — option (a) chosen, no rename. Confirmed no functional consumer
      via `grep -rn "migrations_deployed_at"` (only the writer in `stamp-deploy-manifest.sh` and one
      guidance string in `git-ops.sh:2768`)
- [x] `./scripts/check-deploy-manifest.sh --env prod` behaviour is unchanged by this work — ran it
      post-fix, actual output pasted:
      ```
      DEPLOY DRIFT DETECTED (prod):
      MIGRATION_MISSING: 20260826063353_fix_transcribe_room_member_anon_grant.sql (version 20260826063353 not deployed to prod)

      Fix commands:
        ./scripts/migrate.sh --env prod
      ```
      Exit 0. This is the pre-existing, expected drift for the unpushed `20260826063353` migration
      (an artifact of unpushed stamp commits per this spec's own Non-Goals, unrelated to this fix —
      the drift gate reads the migration array, never `migrations_deployed_at`). Independently
      re-verified by the code-review subagent during the QA gate.

## Adversarial Review (2026-08-27)

3 hostile reviewers (sonnet), lenses: fail-open/operational, evasion, forgeable/racy assumptions.
Full transcript in this session. Every attempt to force a false stamp on a genuine zero-applied
run **failed** — the `APPLIED_COUNT`-gated core of this fix holds under env-var injection, `$ENV_NAME`
variation, malformed API responses, and the P1042 collision-guard interaction. No regression to the
claim this spec makes.

But the review surfaced real, independently-reproduced, code-verified defects in the **surrounding**
stamp+stage sequence — pre-existing (not introduced by this diff, which only wraps the existing
`git add` in a conditional), but directly relevant because they undercut this spec's own claim to
close the `decisions.md` 2026-08-23/2026-08-25 incident class. Filed rather than fixed here (out of
scope — needs real design, not a quick patch, and Non-Goals already rejects "have the stamp script
commit its own change" as worse than the status quo):

- **[P1173](p1173_migrate_manifest_stamp_stage_unsafe_under_concurrency.md)** — the `git add` at
  `migrate.sh:493` stages whatever's currently on disk with no freshness check vs `HEAD`; two
  reviewers independently reproduced a co-tenant's dangling edit riding along into this run's
  stamp. Also: swallowed `index.lock` failures (false "Staged..." message), and a lost-update race
  between two concurrent stamp writes (no lock anywhere in `stamp-deploy-manifest.sh`).
- **[P1174](p1174_migrate_pending_migrations_toctou_bypasses_ack_gate.md)** — unrelated to the
  stamp mechanism: `PENDING_FILES` (the ack list, P887) and the apply loop independently re-glob
  `supabase/migrations/*.sql`; a file landing between the ack prompt and the apply loop is applied
  to prod without ack or without the `requires-frontend` (P886) coupling check. Also a malformed-
  but-HTTP-200 ledger response is silently swallowed, misclassifying already-applied migrations as
  pending.

**Consequence for this spec's own claim:** the Problem section's framing ("that edit was staged...
and that edit was absorbed by a concurrent session's unrelated commit") is fixed **only for the
zero-applied case** this spec targets. The general absorption mechanism (P1173) survives on the
apply-something path — this fix narrows the incident's trigger conditions, it does not close the
incident class.

## Alternatives Considered

- **Leave it — the timestamp is cosmetic.** Rejected: the staged edit is not cosmetic, and it is the
  half with two recorded incidents behind it.
- **Have the stamp script `git add` and commit its own change.** Rejected: a script that commits to the
  shared main checkout on its own initiative is worse than one that leaves a file dirty — `git.md`
  routes all shared-checkout commits through the locked `git-ops.sh commit-to-main` path.
- **Fix it inline during P1167's ship.** Rejected in the moment: it is unrelated to that spec, the
  staging mechanism is unidentified, and it needs a founder call on the field's meaning.

## Related

- **P1103** — `stamp-deploy-manifest.sh --migrations-only` rebuilds the migration array from the local
  checkout, dropping entries applied from another worktree. Same script, different defect. Worth
  fixing together if someone is already in this file.
- **P1170** — the identical defect on `migrate.sh`'s primary CLI-success path (`:265-273`), deferred
  because this environment's test project has pre-existing migration-history drift that never lets
  the CLI succeed here, so the true no-op case couldn't be observed and verified this session.
- `decisions.md` 2026-08-23 — uncommitted leftovers on the shared main checkout are not inert
- `decisions.md` 2026-08-25 — a manifest leftover from a `migrate.sh` workaround was absorbed by a
  co-tenant's unrelated commit, producing a phantom manifest entry
- `decisions.md` 2026-08-24 — a drift report read from a local file is not a statement about prod
- `decisions.md` 2026-08-24 (line 3420) — `--env prod` reads the manifest from `origin/main` (P820), so
  an unpushed stamp commit reads as drift; pushing clears it with no other action

## Open Questions

Both resolved — see Solution.

1. ~~What stages the file?~~ **Answered:** `scripts/migrate.sh:487`, a deliberate `git add` added
   2026-08-10 (`86b455d31`), not a hook.
2. ~~Does anything actually read `migrations_deployed_at`?~~ **Answered:** no functional consumer;
   only a guidance string in `git-ops.sh:2768` mentions the field name.
