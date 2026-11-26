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
   (Added in review round 2: a tip moved by `/ship-prod`, which deploys no functions, is deployed by
   the next `/push`; a run with nothing to push deploys a newer tip that descends from its SHA.)
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
   never print "in sync" for it. (Added in review round 2: the same holds for any upload no committed
   record names. The last upload's fingerprint is kept as the deploy proof, and a proof that is
   neither the tip nor the committed record makes the function stale: a rollback or a manual deploy
   of uncommitted or branch code is never read as in sync.) (Added in the verification round: a
   manual `deploy-functions.sh --env prod` never clears the pending marker and writes no proof, even
   when its smoke passes. It uploads from a working tree that can change during the run, so only a
   `/push` deploy from a clean checkout of the tip makes the function in sync again.)
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
| Two sessions run `/push` at once, or one is delayed | MITIGATE | The lock plus the live-tip check: an older run reports `superseded`, and a newer one deploys the newest code. A tip moved by `/ship-prod` (which deploys no functions) is deployed by the next `/push`; `/day` reports its stale functions until then |
| Adding the JWT policy to the fingerprint makes every function look stale once | ACCEPT | A one-time full redeploy on the first `/push`. It is announced and smoked |
| One more keychain dialog per push whose batch is not empty | ACCEPT | The dialog is the physical confirmation, as for migrations. An empty batch prompts nothing |
| A shared-file change redeploys many functions | ACCEPT | Correct, because they run that code (P1620). Only functions that import the file are included |
| A rollback is overwritten by the next push | ACCEPT | Rollback warns about it. The durable fix is reverting on main |
| A rollback whose stamp cannot be committed would leave prod on old code under a record naming the tip (a false "in sync") | MITIGATE | Rollback refuses before uploading when local main is behind or diverged. If the stamp still fails, the deploy proof (neither the tip nor the record) makes the function stale for `/day` and the next `/push` |
| A manual `deploy-functions.sh --env prod` of uncommitted or branch code, whose smoke passes, would read as in sync (it stamps only the working manifest) | MITIGATE | The manual path never clears the pending marker it writes before the upload, so the function stays stale for `/day` until the next `/push` redeploys the tip from a clean checkout. Costs one redundant upload after a manual deploy of the tip's code. (Round 2 recorded the uploaded fingerprint as a proof instead; the verification round found two tree races in that proof, so it was removed) |
| The stamp's working-file write-back can be skipped (lock timeout, unreadable file) with exit 0, so a later `migrate.sh` commit can put the old prod values back in HEAD | ACCEPT | Safe direction: the next run sees the record differ and redeploys, and the deploy proof keeps a rollback stale. Costs one redundant upload |
| A migration that reuses an applied version number reads as applied, so functions deploy ahead of it | ACCEPT | Three old duplicates are grandfathered; pre-commit's duplicate-version check (P1042) refuses new ones; it is a local hook, so a bypassed commit could slip one in |
| A co-tenant's staged `deploy-manifest.json` makes every stamp commit refuse | ACCEPT | Fail-safe: the proof keeps the next run from uploading again; each run ends `deployed, stamp not recorded` until that index entry is committed or unstaged. Our own refused stamp no longer leaves its blob staged |
| A `/push` step 7 whose batch outlasts the agent's command timeout is killed mid-batch | MITIGATE | `push.md` runs it with a 10-minute timeout, and a batch of more than 10 in the background. A killed run leaves every unsmoked function pending, so the next run redeploys it |
| A pending migration at the tip that no function needs still holds every function deploy | ACCEPT | Fail closed: after a normal `/push` nothing is pending, so a pending one means step 2.5 or 6 did not finish. `/day` notes it |
| The smoke-failure record and the deploy proof live in one checkout's git dir (`<git-common-dir>`, shared by its worktrees) | ACCEPT | `/push` runs from the one main checkout. Any other clone, even on the same machine, has its own records and sees only committed stamps: after a manual deploy from this checkout it can report `ok` while prod runs the manual bytes. Corrected in the verification round, which showed it; this row earlier claimed "never a false in sync" |
| (Verification round) A clearing of the pending record whose read fails rewrote it empty, dropping every other function's entry | MITIGATE | The record is read once with `cat` (macOS `awk` reads a read error as end of file and exits 0, found in the second delta review), then filtered and replaced atomically; a failed read leaves it unchanged and the run warns that the functions stay pending (test `w-clr`, mutation-controlled) |
| (Verification round) A manual deploy of a function the tip does not have leaves a pending entry nothing looks at | MITIGATE | An entry whose name has no `index.ts` at the tip (no directory, or a directory without one) is reported by `/day` as a problem and by `/push` as a per-function failure (exit 1, never "in sync"), to resolve by hand: merge it, or check prod, delete it there if it exists, and drop its line. The entry may come from a deploy that never uploaded, so the message does not claim prod has it. Test `w-stray`, mutation-controlled |
| (Verification round) The manual wrapper is SIGKILLed alone during an upload: the CLI child survives, a later clean `/push` breaks the dead wrapper's lock, deploys and clears the marker, then the orphan upload finishes last and prod runs its bytes with `/day` ok | [FOUNDER DECISION: accept or fix] | Recommended ACCEPT. It needs a kill aimed at the wrapper's PID alone: Ctrl-C and closing the terminal signal the whole process group, which kills the CLI too. Fixing it means the lock tracks the upload child as well, a new lock state |
| A kill between upload and the proof write leaves the pending marker | ACCEPT | The next run redeploys and smokes it once; it never reads as in sync |
| An absent `no-verify-jwt-functions.txt` reads as "no function opts out" | ACCEPT | The file is tracked; its absence changes every fingerprint, so every function redeploys with JWT verification on: the secure direction, though a function meant to be open then rejects its callers until the file is restored |
| In the nothing-to-push case the step-7 SHA comes from `origin/main` after step 1's fetch, a ref other sessions also update | MITIGATE | A `none` run deploys a newer tip that descends from that SHA (nothing was pushed, so no step-5 verdict is tied to it); the migration check gates it. A push run stays bound to its SHA |
| The secret preflight sees only `Deno.env.get(...)` reads | ACCEPT | It is the secret helper's own parser, so the skip for env-free batches covers exactly what the helper would check. No function reads the environment any other way today (`grep -rE 'Deno\.env\.toObject|process\.env|Deno\.env\[' supabase/functions` is empty) |
| Network calls (git, upload, secret inventory, smoke) are bounded by `timeout`, and git stall limits apply to https remotes only | ACCEPT | `/usr/bin/timeout` ships with this macOS and origin is https. On a machine without `timeout` and with an ssh remote, a half-open connection could hang a run holding the lock until someone kills it |
| The manual `deploy-functions.sh` upload and smoke have no `timeout` | ACCEPT | Predates P1732 and is run by hand, with a person watching; step 7, the unattended path, is bounded |
| Timeout expiry itself is not exercised by a test | ACCEPT | The bound is a wrapper around calls whose failure paths are tested; a killed call reads as an upload, secret-check or smoke failure |
| The stale-lock breaker's start-time re-check has no concurrent test | ACCEPT | It needs a recycled PID inside the breaker window; covered by reading, not by a test |
| (Verification round) A manual deploy's tree changes during the run, so a fingerprint taken from that tree names bytes that were never uploaded | MITIGATE | Removed by structure: the manual path writes no proof at all (see the manual-deploy row above), so no tree read can vouch for an upload |
| (Verification round) A timed-out child that ignores TERM keeps running and holds the prod lock | MITIGATE | Every bound is `timeout -k 10`: a child still alive 10s after TERM is killed |
| (Verification round) The secret helper's own child (`supabase secrets list`) can outlive a timed-out helper when it ignores TERM | ACCEPT | The deploy has already stopped with `not deployed` and released the lock; what is left is one read-only listing process, never a wrong verdict |
| (Verification round) The content-mode index restore reads the entry and rewrites it in two git calls; a co-tenant `git add` of the manifest between them is overwritten with HEAD's entry | ACCEPT | The window is two consecutive git commands, and the main lock never covered raw co-tenant `git add` (P1279). Before this fix the blob stayed staged and refused every later stamp, which was worse |
| (Verification round) origin/main moves between `ls-remote` and the fetch during a rollback, so the rollback stamp lands on a local main that has diverged from origin | ACCEPT | Predates P1732. The end state is a diverged main, which every later run and `/day` reports as unproven (exit 2), never as in sync |
| The older locks in `stamp-deploy-manifest.sh` and `git-ops.sh` read `ps` output in the user's locale | DEFER | Predates P1732; the new prod lock uses `LC_ALL=C`. Unblocked by a lock-helper consolidation |

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

## Cost Budget

The metered unit is prod **edge function invocations** (Supabase Free plan row in
`docs/technical/metered-services.md`: 500,000 a month). The deploys themselves and the one secrets
list go to the Management API, which the registry does not meter. `/day`'s `--check` calls GitHub
only (`ls-remote` and a fetch), never Supabase.

| Measure | Per user | Per hour | Per test run |
|---|---|---|---|
| Requests (invocations) | 0: no user path changes | 0: nothing scheduled | `U deployed x 2 smoke requests (OPTIONS + POST, scripts/edge-function-smoke.mjs) = 2U`; in sync: `0 x 2 = 0`; first run after ship: `24 functions x 2 = 48` |
| Egress (bytes) | 0 | 0 | `2U x one small JSON body`, under 1 KB each: `2U x 1 KB = 2U KB` |
| Log lines | 0 | 0 | `2U` invocation log lines, plus `2 x F` for F smoke failures (which repeat on every run until fixed: `2F x runs`) |
| Service unit x price | n/a | n/a | n/a: invocations are within the plan, no per-unit price |

The hermetic suites (`scripts/test-p1732-*.sh`) contact no service: a fake CLI and a fake smoke stand in.

1. **Fits the plan limit today?** Fits. Monthly = `2 x (functions changed per month) + 48 once`.
   Even if every `/push` redeployed every function, `2 x 24 x pushes per month` reaches 500,000
   only at about 10,400 pushes a month.
2. **Fits at 10x?** Fits: invocations scale with pushes and changed functions, not with users.
3. **Guard:** only stale functions are deployed, so an in-sync run costs 0 invocations. A function
   that keeps failing its smoke is re-smoked on every run: `2 invocations x runs`, which is bounded
   by how often `/push` runs.

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

- [x] **Source binding:** with a function file edited and left uncommitted in the working tree, the
      uploaded bytes hash to the target SHA's version. The test is first shown failing against
      today's scripts
- [x] **Selection:** the batch is exactly the functions whose fingerprint differs from the healthy
      prod record. A JWT-policy-only change selects that function, in both directions. Healthy
      unpushed stamps and orphans are excluded. An empty batch uploads nothing and prompts nothing
- [x] **Supersession:** if the tip moves between selection and upload, nothing uploads and the run
      reports `superseded`. An older run that starts after a newer one has deployed changes nothing
- [x] **Concurrency:** two runs started together never overlap uploads, and the manifest ends with
      both runs' entries intact
- [x] **Partial failure:** one of three uploads fails. The other two are smoked, stamped and
      committed, the third is `not deployed`, and the exit is non-zero
- [x] **Smoke failure:** upload ok and smoke fails. The function is `deployed, smoke failed`, the
      exit is non-zero, and the **next** run selects it again rather than printing "in sync"
- [x] **Stamp failure:** upload and smoke ok, stamp commit fails. The function is reported
      `deployed, stamp not recorded`, and the next run recovers it without a second upload, or
      redeploys it idempotently. Which one is documented
- [x] **Manifest isolation:** an uncommitted `test` edit in the working manifest is not in the stamp
      commit
- [x] **Preflight fails closed:** an inherited `SKIP_EDGE_SECRET_CHECK=1`, a missing helper, an
      erroring secret API, and a target mismatch each cause zero uploads. A batch function missing
      a secret is excluded while the others still deploy
- [x] **Gating:** exit 4 → nothing deployed, `unproven`. Step 6 not applied → `waiting on
      migrations`. Nothing to push → the step still runs and retries a stale function
- [x] **Rollback mode:** deploys only the named functions from the given SHA and prints the warning
- [x] **`/day` `cp.prodfns`:** `problem` on a stale fixture and on a smoke-failed fixture, `ok` on a
      matching fixture and on a healthy unpushed-stamp fixture, `unproven` when the fetch fails
- [x] `push.md` and `ship-prod` no longer claim that `/ship-prod` deploys functions
- [x] The P1155 reversal and the new function-deploy authorization are recorded in
      `docs/decisions.md` (via `/kdd`)
- [ ] The first real `/push` after ship prints a batch and a result for each function. The deployed
      batch matches the functions stale at that SHA (clarify-draft, if still stale). `[post-deploy]`
      Once the stamp has landed, `/day`'s `cp.prodfns` reports `ok`
