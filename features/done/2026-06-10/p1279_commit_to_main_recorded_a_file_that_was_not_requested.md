---
status: all-done
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
flow: fix
pipeline_ran: [create-bug, fix]
completed_at: 2026-09-09
---

# P1279: `commit-to-main` recorded a file that was not requested, and returned success

## Summary

A `commit-to-main` invocation that requested five paths committed exactly one file —
a **different** file, belonging to a concurrent session — under the requesting session's
commit message, and exited 0.

## Root Cause

**Unexplained at filing time. This was the point of the ticket, not a gap in it.**
**RESOLVED — see Resolution below.** The reconstruction this section refuses to accept on faith
was right in shape and wrong in cause: the window is not a co-tenant beating a held lock, it is
`git commit` running the pre-commit hook for minutes *before* it reads the index. The text below
is left as filed.

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

- [x] A `commit-to-main` whose commit records anything other than the requested paths exits
      non-zero, and the failing exit code is pasted from a staged reproduction — not asserted
- [x] The comment at `scripts/git-ops.sh:115-116` no longer claims a count mismatch cannot
      reach that point
- [x] The check-to-commit window is either shown to be safe (with the command that shows it) or
      closed; if the ESLint re-stage inside `pre-commit-checks.sh` is the cause, say so and cite
      the run that proves it
- [x] The existing `commit_staged_exact` refusal still fires on an extra staged path — a
      known-good and a known-bad case both run through the changed code, not just the bad one
- [x] A verdict is recorded on whether callers should reset co-tenant files out of the shared
      index or wait for a clean one, and `.claude/rules/git.md` reflects it either way

## Resolution

**Reproduced deterministically**, and the reconstruction the spec refused to accept on faith
turned out to be right in shape but wrong in cause. It is not a co-tenant beating a held lock:

`commit_staged_exact` checks the index, then calls `git commit` — and **`git commit` runs the
pre-commit hook (this repo's `pre-commit-checks.sh`, minutes long) BEFORE it reads the index**.
The guard and the read it protects are minutes apart, and `main.lock` cannot help: it serializes
git-ops *callers*, not a co-tenant session's raw `git add` / `git reset` on the shared checkout.
`scripts/test-p1279-commit-to-main-index-race.sh` scenario 1 stages that mutation from inside the
hook and reproduces the incident's exact signature on the pre-fix code:

```
git-ops commit-to-main: requested 2 path(s); the commit records 1 file(s)
git-ops commit-to-main: WARNING -- requested and recorded counts differ. ...
exit code: 0            # recorded: foreign.txt
```

**The ESLint re-stage was NOT the cause** (`pre-commit-checks.sh:127-128`). It re-`git add`s files
already staged, so it can change staged *content* but never the staged *file set*; canary scenario
3 runs exactly that shape and must — and does — still commit and exit 0. It is the hook's
*duration*, not its `git add`, that matters.

**Fix.** `commit_staged_exact` now re-reads the commit it just made and compares the **recorded
file name set** (not counts — a swap keeps the count and was invisible to the old check) against
the requested paths. On a difference it returns **3**, a code distinct from the pre-commit
refusal's 1. The count check in `cmd_commit_to_main` became fatal, and the comment calling it
unreachable is corrected — it was wrong, and it was the only thing that caught this.

**No rollback, deliberately.** `git reset --soft HEAD~1` here would be a history move on the
shared main checkout, ordered by a caller that has just proven the index is not under its
control — the exact condition `.claude/rules/git.md` bans `HEAD~1` for. It fails loudly and
hands the operator `git show --stat HEAD`.

**Adversarial review (codex, 2026-09-09) found a real regression in the first fix** and it is
why return 3 exists: `cmd_ship`'s no-branch closure unstages its staged rename and prints a
`git mv`-back recipe whenever `commit_staged_exact` fails. Correct when nothing was committed;
actively harmful once a commit has landed — it writes to the moving shared index and the recovery
text is a lie. Canary scenario 7 binds that contract. Codex also correctly noted the
path-encoding limit (`core.quotePath`) shared by both comparisons; pre-existing, documented in
the code rather than fixed, and unreachable for a wrong commit because the pre-check refuses first.

**Verdict on clearing co-tenant files from the shared index (AC 5): keep the prescription.** The
reset is what lets the pre-commit guard pass and it only touches the index. But it is *not* what
makes the commit safe — nothing the caller does before `git commit` is — and a caller doing it
repeatedly against an index a co-tenant is actively writing should move to a worktree instead.
`.claude/rules/git.md` now says so, and the claim there that the lock "closes that gap" is
corrected to "narrows".

## Evidence

- `scripts/test-p1279-commit-to-main-index-race.sh` — 7 scenarios, `7 passed, 0 failed`
- Pre-fix control observed FAILING on scenario 1 (exit 0, recorded `foreign.txt`) before the
  patch; scenarios 2, 3, 4 passed pre-fix, so the canary is not vacuous
- False-positive controls run through the changed code: clean commit, hook content re-stage,
  `git mv` rename, pure deletion — all commit and exit 0 (epistemic.md 7c)
- `scripts/test-git-ops-ship.sh` and `scripts/test-git-ops-extensions.sh` both pass unchanged
