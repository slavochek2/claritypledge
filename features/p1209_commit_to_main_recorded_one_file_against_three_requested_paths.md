---
status: week
type: bug
rank: 1000058
workstream: infrastructure
created_date: '2026-09-01'
tags: [git-ops, concurrency, data-loss, shared-checkout]
delivery_stage: create-bug
pipeline_ran: [create-bug]
drafted_by: opus
exec_model: opus
exec_effort: high
driver: anomaly
---

# P1209: `commit-to-main` recorded one file against three requested paths, past its own exact-match guard

## Problem

**Situation:** On 2026-09-01, closing P1206 called
`git-ops.sh commit-to-main --files <spec-in-done/> <spec-old-path> docs/decisions.md`.
The call exited 0 and printed its success guidance. The resulting commit `ea690914`
contains **one file changed, 220 deletions** — the spec's deletion from `features/`.
The moved copy in `features/done/` and the `docs/decisions.md` entry were both absent.
For one commit, P1206's spec was deleted from the repo with nothing put back.

Recovered in `d7eb148d`, which is the only commit that ever introduced the decision entry
(`git log -S` confirms). No content was lost.

**Complication:** this should be impossible. `commit_staged_exact` compares the staged set
against the requested paths and **refuses on any mismatch**:

```
staged=$(git diff --cached --name-only --no-renames | sort)
expected=$(printf '%s\n' "${paths[@]}" | sort)
if [[ "$staged" != "$expected" ]]; then ... return 1; fi
```

So either the staged set genuinely equalled all three paths and the commit recorded only
one, or the comparison passed while the index held something other than what it read.

**Question:** what allows a commit to record fewer files than a guard just verified were
staged — and does it recur?

## What has been ruled out

Each by command, not by reasoning:

| Hypothesis | Disproof | Verdict |
|---|---|---|
| A co-tenant commit swept the files | `git show --stat` on `2fce4416` and `92d011e0` — neither contains `docs/decisions.md` or the p1206 path | **Ruled out** |
| The entry landed elsewhere and was double-counted | `git log -S 'The observer must be invoked...' -- docs/decisions.md` returns only `d7eb148d` | **Ruled out** |
| The tool is broken for this call shape | Full sequence replayed in a scratch clone: failed call 1, `git add` the old path, call 2 → **all three files committed correctly**, rc=0 | **Did not reproduce** |
| Rename detection hid files in the stat output | `--no-renames` used throughout | **Ruled out** |
| The partial-staging defect caused it | That defect is real and is fixed in `ed91d7b6`, but it explains only why call 1 failed and left leftovers — not why call 2's commit under-recorded | **Insufficient** |

## Leading hypothesis — NOT established

**`main.lock` serializes `git-ops` callers only.** A co-tenant running raw `git` on the
shared main checkout is not held off by it at any point. This session observed a co-tenant
`git-ops.sh push-docs` holding the lock for ~20 minutes, and raw-git activity is routine per
`.claude/rules/git.md`, which documents two prior incidents (2026-08-17 P1057, 2026-06-06)
where a plain commit corrupted a co-tenant's work on the shared checkout despite the
verify-before-commit rule being followed.

**Cheapest disproof:** instrument `commit_staged_exact` to record the index state and the
resulting tree immediately either side of `git commit`, then run concurrent raw-git
mutations against a scratch checkout while `commit-to-main` runs. **Read-only on the real
repo** — do not re-run the failing sequence on the live checkout to "see what it does"
(epistemic gate 2b: P1187 destroyed its own evidence exactly that way).

## Appetite

**Blast radius:** high — `commit-to-main` is the mandated path for every direct commit to
`main`, used by `/ship`, `/kdd`, and every spec close.
**Reversibility:** n/a (diagnostic first).
**Decision density:** one — whether to instrument and wait for a recurrence, or to make the
whole stage-verify-commit sequence atomic regardless of cause.

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| Chasing an unreproducible bug indefinitely | MITIGATE | Time-box the investigation; the instrumentation below is the fallback that makes a recurrence self-reporting |
| A "fix" that masks the symptom without finding the cause | MITIGATE | Any change must be shown to fail against a reproduction, not merely to make the symptom less likely |
| Re-running the failing sequence on the live repo destroys evidence | ACCEPT+GUARD | Read-only probes only; scratch clones for anything that writes |

**Non-Goals**
- Do NOT revisit the partial-staging fix (`ed91d7b6`) — it is tested and orthogonal.
- Do NOT weaken `commit_staged_exact`'s exact-match guard. It is the only reason this was
  caught at all, and the counter line added in `ed91d7b6` is unreachable while it holds.

## Done-When

- [ ] The mechanism is identified and demonstrated in a scratch clone, **or** the
      investigation is time-boxed out and that is recorded with what was excluded
- [ ] If a co-tenant race is the cause: the stage → verify → commit sequence is atomic
      against raw-git mutation, not only against other `git-ops` callers
- [ ] A commit whose recorded file set differs from the requested set is **refused or
      loudly reported** — the 2026-09-01 call exited 0 with success guidance
- [ ] The failure path has been watched failing (epistemic gate 7), exit code pasted
- [ ] Existing workflows still pass: `test-git-ops-extensions.sh` A-L, plus a real spec
      close and a `/kdd` doc commit (gate 7c)
- [ ] `docs/decisions.md` records the cause, or records plainly that it was not found and
      what the mitigation is instead

## Second reproduction — 2026-09-01, 0 files against 4 paths, and an over-record on the retry

A `/push`-fix session hit this twice in ten minutes on the shared main checkout, in **both
directions**, which narrows the cause.

**Under-record.** `commit-to-main --files scripts/git-ops.sh .claude/commands/slava/build/push.md
docs/decisions.md` printed `requested 3 path(s); the commit records 0 file(s)` plus the WARNING,
exited 0, and produced `faf79d78` — an **entirely empty commit** carrying a detailed, confident
message about work it does not contain. The index at call time had been built with
`git apply --cached` (a partial-hunk stage, used to keep a co-tenant's in-flight hunks in the same
file out of the commit) plus two plain `git add`s. So the empty result is not "nothing was staged":
`git diff --cached --name-only` listed all three paths immediately before the call.

**Over-record.** The retry, `ba4d6f00`, recorded `4 of 4` — but swept in **two hunks belonging to a
concurrent session** that were uncommitted in `scripts/git-ops.sh`, despite the index having been
built to exclude exactly those hunks. Their work is preserved (committed, not lost), but under
another session's message — the failure `.claude/rules/git.md` describes at "a bystander-checked
plain commit is still not safe on the shared checkout".

**What this adds to Open Question 2:** the two observations together suggest `commit-to-main` is
not committing the *index it was handed* — it appears to re-derive content from the paths and the
working tree. That is consistent with an empty commit when the index holds partial hunks the
working tree has moved past, AND with a full-file commit that ignores partial staging. A verify-
after-write check would have caught both, loudly, in a session that instead reported success twice.

**Evidence:** `faf79d78` (empty, `git diff --stat faf79d78^ faf79d78` → no output), `ba4d6f00`
(4 files, includes the foreign `cmd_commit_to_main` advisory + `cmd_ship` die-message hunks),
`docs/decisions.md` 2026-09-01 "The second `push-on` was never one bug".

## Third reproduction — 2026-09-01, 2 files against 1 path, with the concurrent writer IDENTIFIED

The P1217 test-retirement session hit the over-record direction twice in three minutes. Unlike the
first two reproductions, this one names the process that wrote into the shared index.

**The over-record.** `commit-to-main --files scripts/git-ops.sh` printed
`requested 1 path(s); the commit records 2 file(s)` plus the WARNING, exited 0, and produced
`b56ebc61` (2026-09-01 22:27:20 +0700) carrying `scripts/git-ops.sh` **and**
`supabase/deploy-manifest.json` — a file the caller never named and did not modify. Verified from
the object database after recovery: `git show --stat --no-renames b56ebc61` reports
`2 files changed, 9 insertions(+), 3 deletions(-)`. The commit is now unreachable; recovery was a
reset to the **absolute** parent SHA `daa1577e263667fef4476b633ef8c46f863aaa0c` (never `HEAD~1` on
the shared checkout), re-stage, recommit as `cc145ced` at 22:29:14.

**The writer.** `supabase/deploy-manifest.json` is stamped **and staged** by a co-tenant
`migrate.sh` run — the same stage-then-commit-later behaviour that produced the P1173 false
positive already recorded in `.claude/rules/epistemic.md` gate 7c. At the time, the manifest's
`migrations_deployed_at` read `2026-09-01T15:28:05Z`, i.e. **45 seconds after this commit began**,
placing the co-tenant's `git add` inside the verify→commit window. That specific stamp is no longer
re-derivable — a later co-tenant run has since moved it to `2026-09-01T16:51:30Z` — so it is
recorded here as observed at the time, not as a claim a reader can re-verify from the working tree.

**The same contamination on the next batch was REFUSED.** Minutes later the identical manifest
staging recurred, and `commit_staged_exact` rejected the call; `git reset -q HEAD -- supabase/deploy-manifest.json`
and a retry succeeded. So the guard does fire — when the foreign `git add` lands **before** the
staged-set comparison. It is defeated only when the write lands **between** the comparison and the
commit.

**Why this discriminates between the two open hypotheses.** The second reproduction proposed that
`commit-to-main` "re-derives content from the paths and the working tree" rather than committing the
index it was handed. That mechanism would be **deterministic** — it would over-record on every call
with a dirty working tree. Observed here instead: two calls, same contaminating file, same session,
minutes apart, **one refused and one admitted**. Intermittency of that shape is what a timing window
predicts and what a re-derive bug does not. It raises the "leading hypothesis — NOT established"
(a co-tenant racing a lock that binds only `git-ops` callers) from plausible to positively
evidenced, with a named writer, while leaving the empty-commit case from reproduction 2 unexplained
by it.

**What it does NOT establish:** nothing here explains `faf79d78`, the commit that recorded **zero**
files against three paths. An external `git add` cannot subtract from an index. The empty-commit
direction still needs its own mechanism, and should not be assumed to share this one.

**Consequence for Open Question 2:** a post-write verification — compare the recorded tree against
the requested paths, fail loudly on mismatch — would have caught all three reproductions in all
three directions (0-of-3, 4-of-4-with-strangers, 2-of-1), without needing the cause. In this session
the WARNING line already printed the correct numbers and the call still exited 0; the information
was present and simply not made fatal.

**Evidence:** `b56ebc61` (unreachable; recoverable via `git show`), `cc145ced` (the clean
replacement), `daa1577e` (the reset target), `.claude/rules/epistemic.md` gate 7c (P1173 —
`migrate.sh` stages the manifest and expects a later commit).

## Open Questions

1. Is `main.lock` intended to bind raw-git users at all? If it cannot, is a git hook the
   only enforcement point that reaches every writer on the shared checkout?
2. Should `commit-to-main` verify its own commit **after** writing it — comparing the
   recorded tree against the requested paths — and fail loudly on mismatch? That closes the
   symptom without the cause, and is cheap.
3. Does the same exposure apply to `cmd_ship`, which follows the same lock discipline?

## References

- `ea690914` (the under-recording commit), `d7eb148d` (the restore), `ed91d7b6` (the
  orthogonal partial-staging fix, with the unreachable-tripwire note)
- `scripts/git-ops.sh` — `cmd_commit_to_main`, `commit_staged_exact`, `acquire_main_lock`
- `.claude/rules/git.md` — "a bystander-checked plain commit is still not safe on the shared
  checkout"; incidents 2026-08-17 (P1057), 2026-06-06
- `.claude/rules/epistemic.md` gate 2b (do not destroy the evidence), gate 7
- `features/done/p1206_*.md` — the close that hit this
