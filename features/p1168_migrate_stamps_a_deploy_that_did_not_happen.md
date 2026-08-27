---
status: week
type: bug
rank: 73
severity: medium
workstream: infrastructure
date_reported: 2026-08-27
created_date: '2026-08-27'
tags: [migrations, deploy-manifest, shared-checkout, tooling]
delivery_stage: create-spec
pipeline_ran: [create-spec]
drafted_by: opus
exec_model: sonnet
exec_effort: medium
driver: anomaly
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

Two independent fixes; the first needs a founder call.

1. **Do not stamp when nothing was applied.** `migrate.sh` stamps unconditionally on the prod path
   (`scripts/migrate.sh:482`), including down the no-pending branch (`:359-360`).
   [FOUNDER DECISION: what should `migrations_deployed_at` mean? (a) *when migrations were last
   applied* — then skip the stamp entirely on the no-pending path, and the field stays truthful;
   (b) *when the manifest was last verified against prod* — then keep stamping but rename the field,
   because the current name asserts (a). Not an implementation detail: the drift gate and future
   readers interpret this field.]

2. **Do not leave the edit in a shared index.** Whatever the stamp semantics, the manifest edit must
   end the run either committed or reverted — never staged-and-dangling.

**UNVERIFIED — investigate first:** neither `scripts/migrate.sh` nor `scripts/stamp-deploy-manifest.sh`
contains a `git add` (grepped 2026-08-27), yet the file was observed staged (`M ` in
`git status --short`) immediately after the run, from a tree that was clean beforehand. **The staging
mechanism is unidentified.** Find it before changing anything — a fix aimed at the wrong actor leaves
the behaviour in place. A hook is the obvious candidate and has not been checked.

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

- [ ] The staging actor is **identified and named in this spec** — the `git add` (or hook) that puts
      the manifest in the index is located, not inferred
- [ ] A prod run with nothing pending leaves `git status --short` **clean** — reproduce by running
      `./scripts/migrate.sh --env prod` on a clean tree with no pending migrations and pasting the
      before/after status
- [ ] The founder decision on `migrations_deployed_at` semantics is recorded in this spec, and the
      code matches it
- [ ] If the field is renamed: `grep -rn` output pasted showing every consumer updated
- [ ] `./scripts/check-deploy-manifest.sh --env prod` behaviour is unchanged by this work

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
- `decisions.md` 2026-08-23 — uncommitted leftovers on the shared main checkout are not inert
- `decisions.md` 2026-08-25 — a manifest leftover from a `migrate.sh` workaround was absorbed by a
  co-tenant's unrelated commit, producing a phantom manifest entry
- `decisions.md` 2026-08-24 — a drift report read from a local file is not a statement about prod
- `decisions.md` 2026-08-24 (line 3420) — `--env prod` reads the manifest from `origin/main` (P820), so
  an unpushed stamp commit reads as drift; pushing clears it with no other action

## Open Questions

1. What stages the file? **Unidentified** — see the UNVERIFIED note in Solution. This is the first task.
2. Does anything actually read `migrations_deployed_at`? Not checked. If nothing does, option (a) in the
   founder decision is nearly free and the field could arguably be dropped instead of renamed.
