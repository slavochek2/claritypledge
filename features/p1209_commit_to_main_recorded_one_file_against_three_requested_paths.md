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
