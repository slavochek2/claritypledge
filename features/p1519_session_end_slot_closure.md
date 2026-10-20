---
status: week
type: task
rank: 46
workstream: infrastructure
created_date: '2026-10-20'
tags: [worktrees, stop-hook, session-end, pipeline]
disclosure: public
delivery_stage: create-spec
pipeline_ran: [create-spec]
drafted_by: opus
exec_model: opus
exec_effort: high
driver: anomaly
---

# P1519: A session cannot end "nothing else" while its own slot is still open

## Problem

> Founder framing, verbatim (2026-10-20): "When I ask, I typically ask session anything else and then the session says, no nothing else. But of course now we have like lots of work to clean up. Clean up should happen once the session ends, so with a decision so I know at least."

**Situation:** Stranded slots are detected, but only by the *next* session: `scripts/pipeline-strandings.sh` runs from the SessionStart hook (P1246) and prints a report a new, unrelated session has no context to act on. The session that owned the slot — the only one that knows whether the work is finished — ends without being asked.

**Complication:** One cleanup pass on 2026-10-20 found, from a single startup report:

- **P1510 and P1511** — code live on `origin/main` (pushed), specs still `status: qa` in w1 / w2. The ship's closing step never ran, so finished work reads as open.
- **P1494 and P1513** — a slot each holding only a spec (2 and 1 commits). P1494 stopped on purpose for a founder decision that was never surfaced to the founder.
- **w4 (P1489)** — spec already closed in `features/done/`, worktree still checked out, lock held by a PID that had been dead since 2026-10-14.
- **`day-cp-cancelled`** — an unmanaged worktree whose only commit was already on main.

Untangling them took the founder about an hour, and a cleanup agent proposed shipping P1437 because a report said "passes the closure gate" while the founder knew it was still being explored. Each owning session had answered "anything else?" with "no".

**Question:** What makes the owning session close its slot, or state in one line why it stays open, before it ends?

## Appetite

Blast radius: medium — every session that holds a slot, through the Stop hook every session already runs. Reversibility: high (hook change, git revert). Decision density: low — one founder call below.

## Invariants

- **The existing Stop-hook gates keep firing.** Adding a check to `verify-before-stop.py` once silently disabled an existing safety gate by returning early above it (decisions.md 2026-08-19, "Adding a second check to an existing Stop hook"). The new check runs after, and independent of, every existing gate; a canary proves each existing gate still blocks.
- **A blocked session can always end honestly.** Under a blocking Stop hook the honest exit is to stop and surface the decision (decisions.md, unattended-loop entry, 2026-08). A stated reason with an owner is a valid way through; the check never demands an action the session cannot take (push, deploy, ship without founder go).
- **Only the session's own slot.** The check never acts on, or blocks over, a slot another session holds.

## Solution

1. **Scope the existing detector to one slot.** `pipeline-strandings.sh` gains a mode that reports only the slot the current session claimed or wrote in, reusing today's classification (shipped-but-unclosed, closed-but-checked-out, spec-only, idle). No second detector.
2. **Check at session end.** When a turn announces it is finished, the Stop hook runs that scoped check. A clean slot passes silently.
3. **One of three outcomes per open slot, shown to the founder:**
   - **Close** — run the step that is missing (`/ship` closure for shipped work, `git-ops.sh release` + worktree remove for closed work), or
   - **Park** — commit the spec to main, free the slot, keep the branch, or
   - **Stays open: <reason> — owner: <who/what>** — one line, e.g. "waiting on founder: mechanism A/B/C" or "deploy due 2026-10-21 09:00 UTC".
4. **The reason line is recorded** where the next session's startup report shows it next to the slot, so a stated "stays open" stops reading as abandoned.

[FOUNDER DECISION: block or warn? Blocking makes the rule hold; warning keeps sessions from being stuck in a loop. Proposed: block once, then accept any stated reason.]

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| A read-only probe refreshes a slot's activity, so the check misjudges ownership | DEFER | P1450 item 1 fixes what counts as activity; observed again 2026-10-20 (a `git status` of w4 moved its stamp). Until then, ownership = slots this session claimed or committed in. |
| Session end is not one event — sessions are cleared, closed or just abandoned | ACCEPT | The Stop hook covers sessions that announce completion; P1450's /day proposals catch the rest. |
| The check nags on every turn of a long session | MITIGATE | Fire only on a completion announcement, the existing gate-3 trigger. |

**Non-Goals**
- Do NOT duplicate P1450 (ship's own cleanup, /day proposals, activity semantics). This spec is only the owning session's end-of-work check.
- Do NOT auto-ship, push or deploy anything.
- Do NOT touch slots held by other sessions.

## Done-When

- [ ] A session that ends with its slot shipped-but-unclosed is stopped and shown the close step (canary reproducing P1511's state)
- [ ] A stated "stays open: <reason> — owner: <x>" lets the session end, and the next startup report shows that reason beside the slot (canary)
- [ ] A session with no slot, or a clean one, ends with no extra output (canary)
- [ ] Every existing Stop-hook gate still blocks in its own canary after the change (epistemic gate 7c)
- [ ] The documented claim, ship, abandon and park workflows each run through the check and still end cleanly

## Alternatives Considered

- **Rely on the startup report (today).** Rejected: it reaches a session without the context to decide — the 2026-10-20 incident.
- **Fold into P1450.** Rejected for now: P1450 cleans up after the fact; this is a prevention at the moment the owner knows the answer. Merge if review finds the work overlaps.
- **A rule in CLAUDE.md only.** Rejected: the founder's ask has been "anything else?" for weeks and the prose path already failed.

## Rollback Strategy

Revert the hook change; the startup report keeps working as today.

## Related

- P1450 (worktree lifecycle: ship cleans up, /day proposes actions, activity semantics) — RELATED
- P1246 (pipeline strandings report), P1326 (liveness), P1206 (Stop hook)
