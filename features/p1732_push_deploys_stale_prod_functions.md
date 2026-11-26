---
status: in-progress
type: task
rank: 358
workstream: infrastructure
created_date: '2026-11-26'
tags: [deploy, edge-functions, push, drift]
disclosure: public
delivery_stage: dev
pipeline_ran: [create-spec, dev]
drafted_by: opus
exec_model: opus
exec_effort: high
driver: anomaly
spec_review_hash: 3945ef194e59503149f260732ed303a1adcb8f5c056550d7bbc9936f3cb0d236
spec_review_vendors: [gemini, openrouter]
---

# P1732: `/push` deploys the prod edge functions the pushed code changed, and prod function drift reaches the day report

## Problem

**Situation:** Merged edge-function code reaches prod only when some session runs
`scripts/deploy-functions.sh --env prod` by hand (`/ship-prod`, or ad hoc). `/push` already applies
the prod **migrations** the pushed SHA carries (P1211 D1, founder decision 2026-09-21), but its only
function step is a TEST drift check (`push.md` line 56, P1612). It describes itself as
"NOT for deploying functions to prod (use /ship-prod)". The drift detector works:
`./scripts/check-deploy-manifest.sh --env prod` and the daily `check-deploy-drift.yml` workflow both
see it. **No skill deploys prod functions at all:** `/ship-prod` runs `git-ops.sh ship-to-prod`, a git
push only (`ship-prod/SKILL.md:3,41`). Every prod function deploy so far was run by hand.

**Complication:** Measured 2026-11-26:

- `check-deploy-manifest.sh --env prod` exits 1: `FUNCTION_STALE: clarify-draft`. Its inputs changed
  in `3eac4593e` (2026-11-18) and `e1b694d0a` (2026-11-24), after its last prod stamp `62deb1c5c`
  (2026-11-16). Prod has been running older code for about 8 days.
- Same run: `FUNCTION_UNPUSHED_STAMP: canvas-draft`. P1658 deployed it, but the stamp commit is local
  only. That session told the founder *after* the push that "not everything was deployed".
- GitHub issue #39 "Deploy drift detected on prod" has been open since 2026-11-19: 6 appends,
  labelled `p1155-escalated-2d`. P1155 escalated it to the agent inbox (ops@). Nobody acted on it.
  This is the P1155 failure again, a correct alarm in a room nobody is in.
- `/day-cp` checks **TEST** function drift (`cp.testfns`). It does not check prod.
- Chat history (`hist "not deployed"`) shows "edge function not deployed to prod" in sessions from
  2026-02-24, 03-07, 03-09 and many later ones.

> Founder framing, verbatim: "when i push shouldnt it always deploy new fucnitons autiaomtically? or
> how come i discover that another sesiosn afte rpush tells me its half deployed?" and "how we know
> they are not stale on prod? not sure if anything warns us anywhere?"

**Question:** How do we make the founder's push word bring prod functions up to date with what was
pushed, the same way it already does for migrations, and make any remainder show up where the
founder actually looks?

## Appetite

- **Blast radius: high.** This is a new prod-write path for every edge function, inside `/push`.
- **Reversibility: medium.** The skill text is reverted with git. A bad function deploy is undone by
  redeploying the previous SHA's source, which takes minutes, but users see the bad version until
  then.
- **Decision density: low.** The founder asked for automatic deploy on push. That reverses P1155's
  rulings (below) on new founder context. No copy, pricing or naming decisions.

## Rulings this reverses or must respect

`RULINGS: 4 found`

1. **P1155 Non-Goals (2026-09-08): "Do NOT add a second detector anywhere, including `/push`",
   "Do NOT auto-fix anything", "Do NOT notify the founder directly … not a `/push` block".**
   **Reversed in part, on new founder context (this session).**
   - P1155 rejected *blocking* `/push` because a pre-push block "structurally cannot see
     `FUNCTION_STALE`". That still holds, and this spec does not block the push. It acts **after** the
     push, on the pushed SHA, where the stale set is computable (today's run found clarify-draft).
   - P1155 rejected auto-fix by "a workflow holding prod credentials that deploys unattended". That
     still holds. This spec adds no unattended deploy. The deploy runs inside a founder-typed `/push`,
     announces the exact batch and SHA, and needs the prod-token keychain dialog.
   - *"Do not notify the founder"*: superseded by the founder's request ("nothing warns us
     anywhere?"). Issue #39 stayed open 7 days with 6 appends while the drift persisted.
   - **Kept:** the seven P1155 workflows, their issue mechanism, the ops@ escalation, and the bans on
     unattended repair and on blocking the git push.
2. **P1211 D1 (2026-09-21)** authorizes `/push` to apply the **migration** set for the pushed SHA
   only. **This spec adds a separate, parallel authorization** on the founder's request quoted above:
   typing `/push` authorizes deploying the announced **function batch** to prod, for the exact
   promoted SHA. The batch is every function whose deployed prod hash differs from that SHA. That
   includes leftovers merged by other sessions. This deliberately goes wider than "what this push
   changed": the founder asked for exactly that ("any other undeployed functions from other
   sessions?"). Code on `main` is already merged and its frontend is already live.
3. **P1620 Invariant:** a `_shared` change must not leave a dependent function behind without a
   report, and a clean report must reflect the code actually deployed.
4. **decisions.md 2026-04-18:** `deploy-functions.sh` deploys the git root of its CWD
   (`deploy-functions.sh:16`), falling back to the script's repo when CWD is not a git repo. A
   `git archive` export is therefore **not** a safe source on its own.

`DUPLICATE: none. RELATED: P1155, P1620, P1622, P1211, P1690. Searched: "FUNCTION_STALE",
"functions to prod", "deploy-functions", "check-deploy-manifest", "ship-prod", "P1563/P1612/P1155".
PRIVATE LOG: searched`

## Facts verified while reviewing (2026-11-26)

- `check-deploy-manifest.sh` hashes the **working tree** of the checkout that holds the script
  (`:36-38`). It cannot check a given SHA, so other sessions' uncommitted edits change its answer.
- `deploy-functions.sh --env prod` takes **no lock**; the only lock is TEST's (`:100`). The manifest
  stamp has its own lock (`stamp-deploy-manifest.sh:30,121`).
- `stamp-deploy-manifest.sh` refuses to run under `.claude/worktrees` (`:36`).
- The secret preflight checks every function, not just the batch. It is skipped without a word when
  its helper is not executable, or when `SKIP_EDGE_SECRET_CHECK=1` is inherited.
- Zero function names means "deploy all".
- Prod deploys run the post-deploy smoke by default (`:361-399`). The stamp is written **before** the
  smoke, so a failed smoke leaves a manifest that says "deployed".
- The function hash traces real imports (`lib/function-input-hash.py`), so a `_shared` change
  reaches only the functions that import it. `supabase/no-verify-jwt-functions.txt` drives deploy
  flags but is **not** in the hash.
- `/ship-prod` does not deploy functions (`ship-prod/SKILL.md:3,41`).

## Invariants

1. **Deploy only the live tip.** The target SHA is the tip of `origin/main`, read live with
   `git ls-remote` under the lock, never from a cached ref. If the read fails, nothing uploads and the
   run is `unproven`. Before uploading, the run re-checks that the SHA it computed the batch for is
   still the tip. If the tip has moved, the run uploads nothing and reports `superseded by <sha9>`:
   the newer run deploys the newer code. A normal run never deploys an older SHA over a newer one.
   Function source comes from a clean checkout of the target SHA, never from the shared working tree.
2. **The batch is computed from the target SHA.** It is a non-empty named list, never the "deploy
   all" default. It is exactly the functions whose fingerprint at the SHA differs from the healthy
   prod record. The **fingerprint** is the function's traced input hash **plus its JWT policy** (its
   membership in `no-verify-jwt-functions.txt`), so a policy-only change triggers a redeploy. Orphans
   are reported, never deleted.
3. **One prod function deploy at a time.** Selection, upload, smoke and stamp run under one lock that
   every prod function deploy path shares (`/push`, a manual `deploy-functions.sh --env prod`,
   rollback). If the lock is held, the run waits a bounded time, then reports `unproven`.
4. **Only healthy deploys count as deployed.** A function whose upload succeeded but whose smoke
   failed is recorded so that both `/push` and `/day` treat it as **not in sync** until a later smoke
   passes. The implementer picks the mechanism (no stamp, or a recorded failure), but a later run must
   never print "in sync" for it.
5. **The stamp records what was uploaded, and nothing else.** Hashes come from the target SHA's
   checkout. Only the `prod` entries of functions that deployed are changed. The stamp commit goes
   through `git-ops.sh commit-to-main` and contains no other change to `deploy-manifest.json`. A
   co-tenant's uncommitted `test` edits in the working file are never swept into it.
6. **Truthful, complete outcome.** Each function in the batch ends in exactly one state: `deployed`,
   `deployed, smoke failed`, `deployed, stamp not recorded` (upload and smoke ok, stamp or commit
   failed), `not deployed (<reason>)`, or `unproven`. The whole run can also end `superseded` or
   `waiting on migrations`. Functions that uploaded in a partly failed batch are still smoked. The
   step exits non-zero unless every function is `deployed`. A failure never rolls back the git push.
7. **Fail closed on preflight.** Nothing uploads for the affected functions on any of these: a missing
   or mismatched prod target, a missing secret-check helper, an inherited `SKIP_EDGE_SECRET_CHECK`,
   or an error or unreadable result from the secret-inventory API. The secret check reads the same
   project the upload targets. A function missing a secret is excluded and the rest of the batch
   still deploys. This holds for manual `deploy-functions.sh --env prod` too, so the two paths agree.
8. **Order: no keychain prompt for an empty batch.** Compute the batch offline (git and manifest
   only). If it is empty, stop. Otherwise print the batch, then unlock the prod token once, then run
   the preflight, then upload.

## Solution

### A. A prod function-deploy step at the end of every `/push`

`/push` ends with one script call. The behaviour lives in the script, so it can be tested outside
the skill text. The step runs on **every** `/push` that reaches the end, including a run where step 5
says "nothing to push". That run is how a previously failed deploy gets retried without new commits.

When it runs, relative to the migration steps:

| Push outcome | Function step |
|---|---|
| Step 5 PUSHED (exit 0), or nothing to push | Runs |
| Step 5 exit 3, and step 6 applied the coupled migrations | Runs after step 6 |
| Step 5 exit 3, and step 6 did not apply them (rc 1 or 2) | Does not deploy; reports `waiting on migrations`. The next `/push` re-checks |
| Step 5 exit 4 (schema not confirmed) | Does not deploy; reports `unproven: schema unconfirmed` |
| Step 5 exit 1 (refused or failed) | Does not run |

The script then does this:

1. Takes the lock and reads the live tip (Invariants 1 and 3).
2. Computes the batch (Invariant 2). If the batch is empty, it prints
   `prod functions: in sync at <sha9>` and exits 0 without a prompt.
3. Prints `prod functions: deploying <names> at <sha9>`. That line plus the keychain dialog is the
   confirmation.
4. Runs the preflight (Invariant 7) and deploys from a clean checkout of the SHA, with the prod smoke
   on.
5. Stamps and commits the stamp (Invariant 5). The stamp commit rides the next push; the report says
   so.
6. Prints one line for each function that did not end `deployed`, then a summary:
   `prod functions: N deployed, M not — <name: state>`.

There is **no Vercel wait** for functions, except when the table above makes the step wait for
step 6.

**Rollback is a separate mode of the same script.** It takes an explicit older SHA and explicit
function names, so unrelated functions are never downgraded. It runs under the lock and skips the
tip check. It always warns: "the next /push redeploys `<names>` from main unless main is reverted".

The implementing agent decides how to extend or wrap `deploy-functions.sh`, `stamp-deploy-manifest.sh`
and `check-deploy-manifest.sh` (for example `--source`, `--sha`, a batch-scoped secret check). The
invariants are what bind.

### B. `/day` shows prod function drift

`/day-cp` adds a read-only check, `cp.prodfns`. It runs the same comparison as Invariant 2 against
the live tip, including smoke-failed records (Invariant 4). It reports `ok`, `problem <names>` or
`unproven`. It fails closed: a failed fetch is `unproven`, never a fall back to the local manifest.
A function that is deployed and healthy but whose stamp is not pushed yet counts as deployed. It
never deploys.

### C. Make the docs tell the truth

`push.md` line 4 says "NOT for deploying functions to prod (use /ship-prod)", but `/ship-prod` has
never deployed functions. Replace that line with the new behaviour. Manual one-off deploys use
`deploy-functions.sh`, which now takes the lock and follows Invariant 7.

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| A function changes its API in step with its frontend, and for seconds to minutes (while Vercel builds) the new function serves the old bundle | ACCEPT | No such coupled change is known. If one appears, a `requires-frontend` marker for functions, like the one migrations have, gets its own spec |
| Two sessions run `/push` at once, or one is delayed | MITIGATE | The lock plus the live-tip check: an older run reports `superseded`, and a newer one deploys the newest code |
| Adding the JWT policy to the fingerprint makes every function look stale once | ACCEPT | A one-time full redeploy on the first `/push`. It is announced and smoked |
| One more keychain dialog per push whose batch is not empty | ACCEPT | The dialog is the physical confirmation, as for migrations. An empty batch prompts nothing |
| A shared-file change redeploys many functions | ACCEPT | Correct, because they run that code (P1620). Only functions that import the file are included |
| A rollback is overwritten by the next push | ACCEPT | Rollback warns about it. The durable fix is reverting on main |

**Non-Goals**
- Do NOT add any scheduled or unattended prod deploy.
- Do NOT block or delay the git push on function state.
- Do NOT change the P1155 workflows, the issue mechanism or the ops@ escalation.
- Do NOT add, rotate or change secrets.
- Do NOT change TEST deploys (P1612 owns them).

## Alternatives Considered

- **Deploy before the push** (like step 2.5). Rejected: the old bundle gets new function code, and
  the code deploys even if the push then fails.
- **Always wait for Vercel.** Rejected for functions: the wait exists only for migration markers, it
  can block for 15 minutes, and its `--since` filter skips catch-up runs.
- **Block `/push` on drift.** Rejected; P1155's reasoning still holds.
- **Daily auto-deploy workflow.** Rejected: it would hold prod credentials with nobody attending.
- **Only add `cp.prodfns` to `/day`.** Rejected on its own, because it still finds drift after the
  fact. Kept as the backstop.

## Rollback Strategy

Revert the skill and script commits. Nothing changes in the database. For a bad function, use the
script's rollback mode (explicit SHA and function names, under the lock), then revert on main so
the next push does not redeploy it.

## Pre-deploy Checklist

None. This spec adds no new secret or function. The first real run is the founder's first `/push`
after this ships.

## Done-When

Hermetic tests use a fake `supabase` CLI that records a content hash of each uploaded directory and
the flags it got, a fake secret-inventory API, a fake smoke, and pinned fixture repos and manifests.
No test depends on today's live drift.

- [ ] **Source binding:** with a function file edited and left uncommitted in the working tree, the
      uploaded bytes hash to the target SHA's version. The test is first shown failing against
      today's scripts
- [ ] **Selection:** the batch is exactly the functions whose fingerprint differs from the healthy
      prod record. A JWT-policy-only change selects that function, in both directions. Healthy
      unpushed stamps and orphans are excluded. An empty batch uploads nothing and prompts nothing
- [ ] **Supersession:** if the tip moves between selection and upload, nothing uploads and the run
      reports `superseded`. An older run that starts after a newer one has deployed changes nothing
- [ ] **Concurrency:** two runs started together never overlap uploads, and the manifest ends with
      both runs' entries intact
- [ ] **Partial failure:** one of three uploads fails. The other two are smoked, stamped and
      committed, the third is `not deployed`, and the exit is non-zero
- [ ] **Smoke failure:** upload ok and smoke fails. The function is `deployed, smoke failed`, the
      exit is non-zero, and the **next** run selects it again rather than printing "in sync"
- [ ] **Stamp failure:** upload and smoke ok, stamp commit fails. The function is reported
      `deployed, stamp not recorded`, and the next run recovers it without a second upload, or
      redeploys it idempotently. Which one is documented
- [ ] **Manifest isolation:** an uncommitted `test` edit in the working manifest is not in the stamp
      commit
- [ ] **Preflight fails closed:** an inherited `SKIP_EDGE_SECRET_CHECK=1`, a missing helper, an
      erroring secret API, and a target mismatch each cause zero uploads. A batch function missing
      a secret is excluded while the others still deploy
- [ ] **Gating:** exit 4 → nothing deployed, `unproven`. Step 6 not applied → `waiting on
      migrations`. Nothing to push → the step still runs and retries a stale function
- [ ] **Rollback mode:** deploys only the named functions from the given SHA and prints the warning
- [ ] **`/day` `cp.prodfns`:** `problem` on a stale fixture and on a smoke-failed fixture, `ok` on a
      matching fixture and on a healthy unpushed-stamp fixture, `unproven` when the fetch fails
- [ ] `push.md` and `ship-prod` no longer claim that `/ship-prod` deploys functions
- [ ] The P1155 reversal and the new function-deploy authorization are recorded in
      `docs/decisions.md` (via `/kdd`)
- [ ] The first real `/push` after ship prints a batch and a result for each function. The deployed
      batch matches the functions stale at that SHA (clarify-draft, if still stale). `[post-deploy]`
      Once the stamp has landed, `/day`'s `cp.prodfns` reports `ok`
