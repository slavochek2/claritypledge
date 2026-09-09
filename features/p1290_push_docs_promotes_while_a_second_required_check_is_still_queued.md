---
status: qa
type: task
disclosure: public
rank: 1000094
severity: high
workstream: infra
date_reported: '2026-09-09'
created_date: '2026-09-09'
flow: fix
pipeline_plan: [create-spec, reproduce, fix]
pipeline_ran: [create-spec, reproduce, fix]
pipeline_skipped: ["architect -- single function, no new structure", "ux -- no visual surface", "verify -- no UI", "generate-tests -- /reproduce owns the canary"]
tags: [git-ops, push-docs, ci, required-status-checks, ruleset, p919, p1255]
---

# P1290: push-docs promotes to main while a second required check is still queued

## Problem

A `/push` run on 2026-09-09 was rejected by GitHub's branch ruleset three times in a row
while both required CI checks showed green on the exact SHA. The push eventually landed
only after enough wall-clock had passed. The founder, seeing the failure log, asked
whether the cause was worth chasing:

> Founder framing, verbatim: *"I'm not sure what we want to do about that, but you see
> this thing I just post and if you want to investigate, then please investigate.
> Otherwise, tell me and we just drop it. Do we need to investigate and prove something?
> If so, tell me. If not, we just drop it."*

It was worth chasing: the cause is a deterministic defect in `push-docs`, not GitHub
flakiness, and it will recur on every future `/push`. On being shown the evidence the
founder scoped the work:

> Founder framing, verbatim: *"ok go ahead - bug? or spec? up to you can ayouanalze to
> comeltin, adversial review after fix /kdd,, comit"*

## Summary

`scripts/git-ops.sh push-docs` waits for exactly **one** CI check —
`CHECK_NAME="audit-privacy"`, hardcoded — then declares "CI verified" and promotes the
snapshot to `refs/heads/main`. The `main` ruleset has required **two** checks since
P1255 landed on 2026-09-08: `audit-privacy` **and** `disclosure`. Whenever the
`disclosure` job has not yet concluded at promote time, GitHub rejects the push with
`GH013`, and the run dies after having already pushed a staging branch and burned a CI
cycle.

This is the P919 staging hop (decisions.md 2026-06-16) drifting out of sync with the
ruleset it exists to satisfy. The same hardcoded pattern is in `cmd_ship_to_prod`
(`git-ops.sh:4336`), so it is latent there too.

## Root Cause

Confirmed against the live GitHub API, not inferred.

**The ruleset requires two contexts:**

```
$ gh api repos/<owner>/<repo>/rules/branches/main \
    --jq '.[] | select(.type=="required_status_checks") | .parameters.required_status_checks'
[{"context":"audit-privacy","integration_id":15368},
 {"context":"disclosure","integration_id":15368}]
```

**`push-docs` polls one of them.** `git-ops.sh:4926` — `local CHECK_NAME="audit-privacy"`.
Step `[4/6]` waits only on that context; step `[5/6]` prints "CI verified. Ready to push
to main." and the promote follows immediately.

**The two jobs do not finish in a fixed order.** Job-level timings for the five staging
cycles pushed on 2026-09-09 against snapshot `422313c69`:

| Staging push | `audit-privacy` ends | `disclosure` ends | Order |
|---|---|---|---|
| 09:49:36 | 09:49:57 | 09:49:51 | disclosure first |
| 09:52:05 | 09:52:27 | 09:52:21 | disclosure first |
| 09:53:11 | **09:53:30** | 09:53:33 | audit first, **+3s** |
| 09:53:49 | 09:54:11 | 09:54:06 | disclosure first |
| 09:54:58 | **09:55:17** | *starts* 09:55:40 | audit first, **+23s** |

Both workflows are created in the same second (`privacy-scan` and `disclosure-gate` both
trigger on bare `push:`); the variance is entirely in **runner queue latency before the
job starts** — up to 42s from run creation in the 09:54:58 cycle. So `push-docs` wins or
loses a race on every run, which is why the same command produced three different
outcomes today.

**The error text differed between attempts** — two messages were observed:

- `2 of 2 required status checks are in progress.`
- `2 of 2 required status checks have not succeeded: .` (note the empty context name)

**What this does and does not establish.** An earlier draft of this spec read the empty
context name as proof that no `disclosure` check-run existed yet. That inference does not
survive its own evidence: the message says **2 of 2**, and at that moment `audit-privacy`
had concluded `success` (09:55:17, confirmed via the API). If GitHub were reporting
per-context state, a green `audit-privacy` would have made it "1 of 2". So the exact
semantics of GitHub's message are **not** established here, and no part of the fix rests
on them. Recorded as *consistent with* a queued/absent second check, not as the mechanism.

What IS established, independently and from timing alone: at promote time in the 09:54:58
cycle the `disclosure` job had not started (09:55:40 vs `audit-privacy`'s 09:55:17), so a
required context can be **absent from the SHA**, not merely pending — and an absent
context must count as unsatisfied. That is the load-bearing design consequence, and it
follows from the job timestamps, not from parsing an error string.

**Why now.** P919 (2026-06-16) made `audit-privacy` the single required check, and
`push-docs` was written correctly against that. P1255 (2026-09-08) added `disclosure` as
a second required check. `push-docs` was not updated. Today was the first `/push` after
that change.

This is dated evidence, not inference from the workflow file's commit date. The ruleset
object itself carries both timestamps:

```
$ gh api repos/<owner>/<repo>/rulesets/17729463 --jq '.created_at, .updated_at'
2026-06-16T13:57:34+07:00   # P919 created main-privacy-gate
2026-09-08T16:42:31+07:00   # disclosure added as the second required check
```

The `16:42` update follows P1255's two workflow commits the same day (`14:56`, `15:12`),
which is the expected order: the workflow has to exist and publish a check-run before
the context can be marked required. The stale comment at `git-ops.sh:4830` still asserts the ruleset "requires
only the `audit-privacy` context (verified against the live ruleset)" — true when
written, false the next day.

## Reproduction

1. Have ≥1 commit on `main` ahead of `origin/main` touching a watched path, with a valid
   `.privacy-reviewed` stamp and `~/.push-enabled` active.
2. `./scripts/git-ops.sh push-docs`
3. Observe step `[4/6]` waits only for `audit-privacy`, prints "CI verified", and
   promotes.
4. When `disclosure`'s runner queue latency exceeds `audit-privacy`'s completion, the
   promote is rejected `GH013`.

Non-deterministic by nature (it is a race). The canary must therefore drive the ordering
rather than wait for it — see Fix Approach.

## Expected vs Actual

**Expected:** `push-docs` promotes only once **every** context the `main` ruleset marks
required has concluded `success` on the snapshot SHA.

**Actual:** It promotes once one hardcoded context is green, and races the rest.

## Affected Files

- `scripts/git-ops.sh:4926` — `cmd_push_docs`, `CHECK_NAME="audit-privacy"` (primary)
- `scripts/git-ops.sh:4336` — `cmd_ship_to_prod`, same hardcoded single check (latent)
- `scripts/git-ops.sh:4830` — stale comment asserting a single-context ruleset
- `scripts/git-ops.sh:1711-1715` — help text describing the single-check staging hop
- `.claude/commands/slava/build/push.md` — documents the single-check wait

## Severity

**high** — blocks every `/push` non-deterministically, and each failed attempt costs a
staging-branch round trip plus CI minutes. It also burns the user's `~/.push-enabled`
grant, which is time-boxed, so a run that loses the race twice can exhaust the
authorization window and force a second human approval.

Not `critical`: it fails closed. The ruleset is doing its job; nothing unscanned reaches
`main`.

## Fix Approach

**Derive the wait-list from the ruleset instead of hardcoding it.** The defect is not the
missing `disclosure` name — adding it would rot identically the next time the ruleset
changes, which is precisely how this bug was born. Query the live required contexts and
wait for all of them:

```
gh api repos/<owner>/<repo>/rules/branches/main \
  --jq '.[] | select(.type=="required_status_checks")
        | .parameters.required_status_checks[].context'
```

Three constraints the implementation must respect:

1. **Absent ≠ satisfied.** A required context with no check-run on the SHA is unsatisfied
   and must keep the poll waiting. This is the 09:54:58 case, and the naive
   "all check-runs green" formulation passes it vacuously — the exact false-pass shape
   epistemic gate 7b names.
2. **Fail closed when the ruleset cannot be read.** If the API call fails or returns no
   `required_status_checks` rule, do **not** fall through to an empty wait-list (that
   would promote immediately and reintroduce the bug in a worse form). Fall back to the
   known set and warn, or abort.
3. **Preserve the existing freshness guard.** The `started_at` baseline logic
   (`git-ops.sh:4820-4835`, from commit `7d66f2ed4`) must apply per-context, not just to
   `audit-privacy` — a stale green `disclosure` from a prior cycle must not satisfy the
   wait either.

`MAX_WAIT` may need review: it currently budgets for one job, and the wait is now bounded
by the slowest of N.

**Rejected — hardcode `disclosure` alongside `audit-privacy`.** Cheaper, and wrong for
the same reason the current code is wrong. `git-ops.sh:4830` is a comment that documented
a verified fact which then expired; a second hardcoded list would be a third copy of that
same expiring fact. The ruleset is the source of truth and is queryable.

## Acceptance Criteria

- [x] `push-docs` waits for every context in the live `main` ruleset's
      `required_status_checks`, not a hardcoded name. (`derive_required_contexts`; no
      `CHECK_NAME` remains anywhere in `git-ops.sh`.)
- [x] A required context with **no check-run** on the SHA keeps the poll waiting
      (does not count as satisfied). Canary: *"one green + one ABSENT → does NOT
      promote"*.
- [x] A required context whose only check-run **pre-dates** the current staging push does
      not satisfy the wait (freshness guard applies per-context). Canary: *"green but
      pre-dates push → stale"*. An unresolvable timestamp now returns `pending` rather
      than epoch 0, which previously disabled the guard silently.
- [x] Ruleset query failure or an empty required list **fails closed** — never promotes
      against an empty wait-list. Three independent guards (see Review below).
- [x] `cmd_ship_to_prod` uses the same derivation (no second hardcoded list) — both
      callers now invoke the same `wait_for_required_checks`.
- [x] Canary asserts the failure path with a non-zero exit (epistemic gate 7). Mutation-
      tested: `absent`→`success` (exit 1), fail-open empty list (exit 1), zsh-reserved
      name (exit 1) — all killed.
- [x] Canary asserts the pass path: all required contexts green and fresh → promote
      proceeds (epistemic gate 7c).
- [x] Stale comment at `git-ops.sh:4830` and the staging-hop help text corrected.
- [x] `.claude/commands/slava/build/push.md` updated to describe the derived wait-list.
- [x] Canary wired into `pre-commit-checks.sh` so it actually runs when `git-ops.sh`,
      the library, or the canary is staged (missing-file branch blocks the commit).

## Review

Findings from a hostile review of the first draft, all verified by command before being
acted on (epistemic gate 9). Four were blocking; the review is the reason this spec's
claims are narrower than they started.

- **CRITICAL — the fail-closed property was defeated at the call site.** With
  `lib-required-checks.sh` merely *absent*, `derive_required_contexts` was
  command-not-found, `|| ruleset_ok=1` swallowed the 127 under `set -e`, the wait-list
  came back empty, and `push-docs` promoted to a public `main` with **zero** CI
  verification while printing `✅ all required checks passed ... : []`. The library's
  header had claimed the property as "unreachable by construction" — true of the
  function, false of the system, which is the exact over-claim shape `push.md`'s
  four-version header warns about. Now: unconditional `source` + `exit 1` if missing,
  a non-empty assertion at both call sites, and a refusal inside
  `wait_for_required_checks`. Verified: `git-ops.sh status` exits 1 with the library
  hidden, 0 with it restored.
- **HIGH — a red check could hide behind a queued one.** The loop `break`-ed on the
  first non-success verdict, so with `[audit-privacy, disclosure]` where `disclosure`
  fails at t+30s while `audit-privacy` is still queued, the red was never seen: the poll
  slept up to 40 minutes **holding `main.lock`** and then reported a timeout. The old
  single-check poll died immediately on red, so this was a regression against the
  previously-working path (gate 7c). Now `continue`, evaluating every context each cycle.
- **HIGH — the canary tested the library but re-implemented the loop.** It asserted a
  copy of the logic rather than the logic, so it could not have caught either finding
  above. The loop moved into the library specifically so the canary could call the real
  thing; it now drives `wait_for_required_checks` directly.
- **HIGH — the canary was wired into nothing.** No reference in `pre-commit-checks.sh` or
  any workflow. Fixed.
- **MEDIUM — the check-runs response is truncated.** The unfiltered endpoint pages at 30
  and this repo already returns `{"returned":30,"total":33}` on the very SHA this bug was
  diagnosed from; seven workflows fire per push and each `--resume` stacks more. A
  required context outside page 1 reads `absent` and burns the full budget. Now filtered
  server-side by `check_name`, which returns `{"returned":6,"total":6}`.
- **MEDIUM — a missing `lib-datetime.sh` silently voided the freshness guard**
  (`parse_utc_epoch` not found → epoch 0 → the staleness comparison can never fire).
  Now returns `pending`.

Three further defects were found by *running* the fix rather than reading it, and are
recorded because each is invisible to inspection:

1. `status` is read-only in **zsh**, so the assignment aborted and the verdict came back
   empty. The canary runs under bash and structurally could not emit that input; found by
   sourcing the library from an interactive shell. Now asserted statically.
2. **TAB is IFS whitespace**, so `read` collapsed the empty `conclusion` field of an
   in-progress check and reported a *pending* context as `mismatch`. Separator is now `|`.
3. A hand-spliced `?check_name=Secret Scan` is not a valid URL and matches nothing —
   which reads as `absent` and waits out the full budget. `gh -X GET -f` encodes it.
   Relevant because this repo already has check-runs named `Secret Scan` and
   `Vercel Preview Comments`; the array handling added for context names with spaces
   would have been undone by the query string.

**Not fixed, recorded instead:**

- `evaluate_check_context`'s `mismatch` verdict is close to unreachable, since
  `/commits/{sha}/check-runs` only returns runs for that SHA. Kept as a defensive branch;
  its canary case documents a state the real API is not expected to produce.

- **`integration_id` is discarded** (`lib-required-checks.sh`, the `--jq` at the ruleset
  query). The live ruleset binds each required context to an app:
  `[{"context":"audit-privacy","integration_id":15368},{"context":"disclosure",
  "integration_id":15368}]`. The derivation keeps only `.context`, so a check-run with a
  matching *name* from a different GitHub App would satisfy the local poll. Raised by a
  `codex review` pass, rated P2.

  **Deliberately deferred, with the consequence stated:** GitHub still evaluates the
  binding server-side, so the failure mode is a promote that gets rejected `GH013` — a
  wasted staging cycle, the same symptom this spec fixes, but **not** an unsafe promote.
  Nothing unscanned reaches `main` through this gap; the server remains the boundary
  (P919, `.claude/rules/git.md`). Deferring is therefore a robustness call, not a
  security one.

  It is also not free to do properly: the natural fix is a per-context expected app id,
  and macOS ships **bash 3.2**, which has no associative arrays — so it needs either a
  parallel-array scheme or a delimiter-encoded list, in a hot path where a context name
  may itself contain spaces. Doing that late, in the same change that already grew twice
  under review, is how the fourth false claim gets shipped. Filed as follow-up work
  rather than bolted on.

## References

- decisions.md 2026-06-16 [process] — staging hop mandatory, ruleset active with
  `audit-privacy`
- `features/done/2026-06-10/p919_server_side_push_deploy_authorization.md` — the ruleset
- `features/done/2026-06-10/p1255_security_specs_publish_before_the_defect_is_fixed.md` —
  added `disclosure` as the second required check
- Commits `7d66f2ed4` (freshness guard racing the scan), `1547d6c10` (poll timeout),
  `ec63d4746` (check-name correction) — the three prior fixes to this same poll
- `.claude/rules/epistemic.md` gates 7, 7b, 7c
