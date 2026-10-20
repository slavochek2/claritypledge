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

1. **Ownership comes from the session's own transcript.** The Stop hook already reads `transcript_path`. A slot is *mine* when this transcript holds a `git-ops.sh claim` result naming it, or an Edit/Write, `git add` or `git commit` whose path or cwd is inside it. Reads never count. Not the lock's `SESSION_ID` (an agent-run claim records a PID-based fallback, `git-ops.sh:487`), not cwd, not `.activity`. This removes the dependency on P1450 item 1.
2. **A per-slot classifier.** `pipeline-strandings.sh` gains a mode for given slots. It skips the liveness test for the owner's own slot (otherwise this session's activity reads LIVE and hides it) and adds the missing state **code on `origin/main`, spec not in `done/`** (P1510/P1511), next to closed-but-checked-out, spec-only and idle.
3. **Check inside the existing hook flow.** Computed next to `unreviewed`, joined into the one final `if not problems and …` condition and the shared message assembly of `verify-before-stop.py`. Never on the `stop_hook_active` follow-up path. Same completion trigger as gate 3, with its own time budget inside the hook timeout.
4. **Three outcomes, each a command, never free text:**
   - **Close** — offered only when this session can run it: ship closure when the code is already on `origin/main` or a journal exists; release when the nonce is readable.
   - **Park** — a new shared `git-ops.sh park <slot>`: spec committed via `commit-to-main`, worktree removed, branch kept. Shared with P1450 item 4, defined once.
   - **Hold** — `git-ops.sh hold <slot> --reason "…" --owner <founder|YYYY-MM-DDTHH:MMZ|pNNNN>`, written to `<slot>/.hold`. Owner from a closed set; `me`, `wip`, `later` rejected. Accepted only if newer than this session's last write to the slot. A past date expires the hold.
   - **No hold for finished work.** Shipped-but-unclosed and closed-but-checked-out may only be closed or parked; there is no legitimate reason to keep them.
5. **The startup report prints the hold** beside the slot, and marks an expired one.

**Founder decision 2026-10-20: block**, once per slot state (per-session counter, limit 1; the check disables itself if the counter cannot be written). A warning prints after the session has already said "nothing else", so it would have prevented none of the 2026-10-20 strandings. The hold command is always available, so a session is never trapped.

6. **The blocked message is a decision brief, not a status line** (founder, 2026-10-20: *"block and build:simplify or suggest options and explain how and why"*). When the session cannot close or park the slot by itself, it presents the open item in the `/slava:build:simplify` order: why it is still open, with the concrete example (what is live, what is unclosed); what leaving it costs the founder; the options that apply (close / park / hold, each with one line of consequence); a recommendation and why. The founder answers, and only then does the session act or write the hold.

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| Sessions that never reach a Stop check: `/clear`, closed terminal, crash, a last turn that is not a completion announcement | MITIGATE | Canary on the literal "no, nothing else" reply; widen the trigger only for sessions that own a slot. The rest fall to P1450's /day proposals. |
| Subagents fire `SubagentStop`, not `Stop`; none is registered | ACCEPT | Subagents do not claim slots in the build skills; out of scope, named here. |
| A new check falls behind an early exit and silently disables an existing gate (2026-08-19) | MITIGATE | Solution 3 placement + a canary per existing gate with a slot open at the same time. |
| The scan adds latency to every Stop | MITIGATE | Only owned slots are classified; budgeted inside the hook timeout. |

**Non-Goals**
- Do NOT duplicate P1450 (ship's own cleanup, /day proposals, activity semantics). Shared: `park` and the action set, defined once.
- Do NOT auto-ship, push or deploy anything.
- Do NOT touch slots held by other sessions.
- Unmanaged worktrees outside `w1..wN` (e.g. `day-cp-cancelled`) are out of scope; /day handles them.

## Done-When

Each is a named canary in `scripts/test-p1519-*.sh`, built from real transcript JSONL and a real `.lock` without `CP_SESSION_ID`, with the failure path shown failing (epistemic gate 7, exit code pasted).

- [ ] A slot claimed from main (no session id on the lock) is detected as owned
- [ ] A session ending with its slot in the P1511 state (code on `origin/main`, spec open) is blocked and shown the close step; a hold is refused for it
- [ ] A valid hold lets the session end and the next startup report shows it; a hold with owner `me` or `wip` is rejected; a hold older than the session's last write is ignored
- [ ] A session with no slot or a clean one ends with no output and no measurable added latency
- [ ] The literal reply "No, nothing else." triggers the check for a session that owns a slot
- [ ] When the session cannot close the slot itself, the blocked turn shows why it is open, the cost, the options and a recommendation, in that order, before any hold is written (canary on the P1494 state)
- [ ] Claim, KDD and review gates each still block in their own canary while a slot is open
- [ ] `git-ops.sh park` frees the worktree, keeps the branch and commits the spec via `commit-to-main`; the session then passes

## Alternatives Considered

- **Rely on the startup report (today).** Rejected: it reaches a session without the context to decide — the 2026-10-20 incident.
- **Fold into P1450.** Rejected by both reviewers (Gemini review model, Opus, 2026-10-20): P1450 cleans up after the fact, this acts while the owner still knows the answer. They share `park` and the action set only.
- **A rule in CLAUDE.md only.** Rejected: the founder's ask has been "anything else?" for weeks and the prose path already failed.

## Rollback Strategy

Revert the hook change; the startup report keeps working as today.

## Review

2026-10-20: Gemini review model (served `gemini-4-argon`, verified) and Opus. 2 of 2 reported. Folded: transcript ownership, hook placement, command-written hold with closed owner set, no hold for finished work, shared `park`, canary-based Done-When, the missing origin/main classifier. Claims checked by command before folding: no `CP_SESSION_ID` on agent claims (`git-ops.sh:487`), early exits in the hook, no `park` subcommand, no `SessionEnd`/`SubagentStop` hook registered.

## Related

- P1450 (worktree lifecycle: ship cleans up, /day proposes actions, activity semantics) — RELATED
- P1246 (pipeline strandings report), P1326 (liveness), P1206 (Stop hook)
