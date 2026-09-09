---
status: week
type: bug
rank: 1000082
severity: medium
workstream: infrastructure
date_reported: '2026-09-09'
created_date: '2026-09-09'
drafted_by: opus
exec_model: opus
exec_effort: high
tags: [git-ops, concurrency, shared-index, commit-to-main]
disclosure: public
delivery_stage: create-bug
pipeline_ran: [create-bug]
---

# P1279: `commit-to-main` recorded a file that was not requested, and returned success

## Summary

A `commit-to-main` invocation that requested five paths committed exactly one file —
a **different** file, belonging to a concurrent session — under the requesting session's
commit message, and exited 0.

## Root Cause

**Unexplained. This is the point of the ticket, not a gap in it.**

`commit_staged_exact()` (`scripts/git-ops.sh:699-716`) compares the staged set against the
requested paths and returns 1 on any difference. It is a strict `sort`ed string equality,
and it demonstrably worked twice in the same minute — it refused two earlier attempts of
this same invocation, naming the co-tenant spec that was staged:

```
commit_staged_exact: staged set does not match the requested paths -- refusing to commit
  requested: .claude/commands/slava/build/reproduce/SKILL.md ... scripts/pre-commit-checks.sh
  staged:    ... features/p1275_transcribe_room_creation_fails_rls.md ...
```

On the third attempt it did not refuse. The commit that resulted
(`5f80bfc36`) records **one** file — `features/p1274_the_three_p1053_review_lenses_that_never_ran.md`,
28 insertions / 76 deletions — and none of the five requested paths, which were still
uncommitted in the working tree afterwards (verified by `git diff HEAD` naming all five).

For that to happen, the staged set must have equalled the five requested paths at the moment
of the check and been something else at the moment of `git commit -q` five lines later — both
inside `acquire_main_lock`. **Do not accept that reconstruction without testing it.** It is the
only shape the author could derive from the artifacts, and the lock exists precisely to make it
impossible.

`cmd_commit_to_main` **did** detect the outcome and warn (`scripts/git-ops.sh:122-124`):

```
git-ops commit-to-main: requested 5 path(s); the commit records 1 file(s)
git-ops commit-to-main: WARNING -- requested and recorded counts differ. Inspect
'git show --stat --no-renames HEAD' before continuing; a concurrent session may have
altered the shared index.
```

Two things then failed to stop it: the function **exits 0** after warning, and the calling
agent had piped the output through a keyword filter that did not include `WARNING`, so the
line was never read. The warning's own preceding comment (`:115-116`) states that
`commit_staged_exact` makes a count mismatch impossible — "by the time control reaches here
the counts always [match]" — and describes the check as decorative. It is not decorative; it
is the only thing that caught this.

## Invariants

- **A tool that detects a wrong write must not return success.** The warning text already
  tells the caller to stop and inspect. A caller that reads the exit code — the normal
  contract — proceeds anyway.
- **Whatever the fix, `commit_staged_exact` keeps its current refusal behaviour.** It is the
  only control that worked here. This bug is that it was bypassed once, not that it is wrong.
- **No history rewrite.** `5f80bfc36` stands. See Non-goals.

## Reproduction Steps

Not reproduced on demand; observed once. The conditions were present and are ordinary:

1. Two or more sessions active against the shared main checkout (53 peer sessions were listed
   that evening; three unrelated files entered this session's index within ~10 minutes).
2. Session A stages files it did not author (co-tenant activity), repeatedly.
3. Session B runs `git reset HEAD -- <bystander>` to clear them, then immediately
   `git-ops.sh commit-to-main --files <its own 5 paths>`.
4. `commit-to-main` runs `pre-commit-checks.sh` (~2 min) between staging and commit — a wide
   window for the shared index to move.
5. Observed: the commit records a co-tenant's file and exits 0.

**Reproduction rate:** 1 observation. Two immediately preceding attempts under the same
conditions were correctly refused, so this is not deterministic.

## Expected Behavior

`commit-to-main` either commits exactly the requested paths, or commits nothing and exits
non-zero.

## Actual Behavior

Committed exactly one file that was not requested, committed none of the five that were,
printed a correct warning, and exited 0.

## Affected Files

- `scripts/git-ops.sh:699-716` — `commit_staged_exact`, the guard that did not fire
- `scripts/git-ops.sh:102` — the staging loop (`if [[ -e "$f" ]]; then git add -- "$f"; fi`)
- `scripts/git-ops.sh:115-124` — the post-commit count check, its warning, and the comment
  asserting the mismatch cannot occur

## Severity

**Medium.** No production or user impact — this touches the commit record, not the running
product. It corrupts attribution: in the observed case a co-tenant's own spec edit was
recorded under an unrelated message. Content survived (the working tree already held that
version, and the prior version remains in `ff786e3dd`), but a different file in the way could
have committed a stale version over a newer one with no signal.

## Fix Approach

**Diagnose before patching.** The visible defect (exit 0 after a detected mismatch) is a
two-line change and should be made, but it is the symptom. The unexplained half is why a
strict equality check passed while the index held something else.

1. Make the count mismatch fatal: non-zero exit, and correct the `:115-116` comment that calls
   the check redundant.
2. Investigate the check-to-commit window. Confirm whether `acquire_main_lock` was actually
   held (it should have been), and whether `pre-commit-checks.sh` — which runs inside that
   window and itself calls `git add` on staged `.ts`/`.tsx` files (`:127-128`, the ESLint
   `--fix` re-stage) — can alter the staged set between the guard and the commit. That path is
   a candidate worth eliminating first; it is *inside* the tool, not a co-tenant, and would
   explain a mismatch under a correctly held lock.
3. Consider re-checking the staged set immediately before `git commit`, or committing a
   recorded tree rather than the live index.

Also in scope, same seam: whether a caller should clear co-tenant files from the shared index
at all (`git reset HEAD -- <bystander>` in a loop, as here), or wait for a clean index. The
existing rule prescribes the reset; it was followed, three times, and the third attempt is
this bug.

## Non-goals

- Rewriting or reverting `5f80bfc36`. The content it recorded is the co-tenant's current and
  intended version; reverting would destroy their work to correct a label, and history rewrite
  on the shared checkout is banned.

## Acceptance Criteria

- [ ] A `commit-to-main` whose commit records anything other than the requested paths exits
      non-zero, and the failing exit code is pasted from a staged reproduction — not asserted
- [ ] The comment at `scripts/git-ops.sh:115-116` no longer claims a count mismatch cannot
      reach that point
- [ ] The check-to-commit window is either shown to be safe (with the command that shows it) or
      closed; if the ESLint re-stage inside `pre-commit-checks.sh` is the cause, say so and cite
      the run that proves it
- [ ] The existing `commit_staged_exact` refusal still fires on an extra staged path — a
      known-good and a known-bad case both run through the changed code, not just the bad one
- [ ] A verdict is recorded on whether callers should reset co-tenant files out of the shared
      index or wait for a clean one, and `.claude/rules/git.md` reflects it either way
