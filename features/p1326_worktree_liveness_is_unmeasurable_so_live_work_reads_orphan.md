---
status: week
type: task
rank: 106
workstream: infrastructure
created_date: '2026-09-16'
tags: [worktree, git-ops, concurrent-sessions, session-lifecycle]
disclosure: public
delivery_stage: create-spec
pipeline_ran: [create-spec]
drafted_by: opus
exec_model: opus
exec_effort: high
driver: anomaly
---

# P1326: A worktree in active use reads ORPHAN, and the session-start report calls it ready to ship

## Problem

**Situation:** P1268 (shipped 2026-09-09) made worktree-slot liveness heartbeat-based: `claim` binds a
session identity, a PostToolUse hook refreshes `HEARTBEAT` on every Edit/Write, and `status` reports a
slot LIVE while the heartbeat is inside a 12h TTL. The session-start pipeline report
(`pipeline-strandings.sh`) tells every new session which worktrees are stranded or ready to ship.

**Complication:** On 2026-09-16 the mechanism was observed inert on a real slot, for the second time
(the first is decisions.md 2026-09-09):

- `w1` (P1181) was claimed 2026-09-15T15:35:57Z by a session that then worked in it for **16 hours**,
  including **19 Edit/Write tool calls inside w1** and an uncommitted migration written 20 minutes
  before it was observed. `HEARTBEAT` was still byte-equal to `CLAIMED_AT`. `git-ops.sh status`
  printed `w1 … ORPHAN`.
- The lock's `SESSION_ID` is `Vyacheslavs-MacBook-Pro-55547-1789486557` — the `hostname-pid-epoch`
  **fallback**, not the session's real id (`90163655-…`). `cmd_heartbeat` only writes when
  `CP_SESSION_ID == LOCK_SESSION_ID`, and otherwise **exits 0 silently**. `CP_SESSION_ID` is unset in
  an agent's Bash (verified: `echo ${CP_SESSION_ID:-UNSET}` → `UNSET`), so an agent-run `claim`
  always binds the fallback, and every one of the 19 heartbeat attempts was refused without a trace.
- P1268's regression test (`scripts/test-git-ops-adopt.sh` ~L361) sets `CP_SESSION_ID` **by hand
  before `claim`** — the convenient sequence, not the one an agent produces. Third instance of the
  failure named in decisions.md 2026-09-09.
- A new session's start-up report then printed **`READY TO SHIP w1 — p1181 passes the closure gate`**.
  `pipeline-strandings.sh` checks the committed closure gate only: it never looks at uncommitted
  changes or at lock liveness. Another session following that hint would have shipped P1181 out from
  under its owner. The owning session independently confirmed all of the above.
- Separately, a detached worktree created on 2026-09-14 inside a session **scratchpad**
  (`…/scratchpad/p1270-control`) outlived its session by two days, invisible to every guard:
  `pipeline-strandings.sh` L75 skips any worktree not under `.claude/worktrees/`, and `git-ops.sh
  status` only reads slot lockfiles. Removed by hand 2026-09-16 after its content was verified to
  exist in commit `6b7de89`.

> Owning session, verbatim: "The dead PID is not evidence of abandonment and never can be. Each agent
> Bash call is its own short-lived process, so the PID recorded at claim time is dead within seconds
> of a normal, healthy claim." … "do not let the fix treat 'PID dead' as sufficient to reclaim a slot.
> On this evidence that rule would have reclaimed w1 out from under live work three times today."

**Question:** How does a slot's liveness become measurable from the sequence agents actually run, so
that "actively owned" and "abandoned" are never byte-identical, and no report tells a session to ship
or reclaim work that is in flight?

## Appetite

Blast radius: high — every concurrent session relies on these verdicts, and a false one invites
shipping or reclaiming live work (the cross-session damage class `.claude/rules/git.md` documents).
Reversibility: high — scripts and hooks only, git revert. Decision density: low — no founder calls;
the design choices are technical and constrained by the invariants below.

## Invariants

- **Test from the entry point the caller really uses** (decisions.md 2026-09-09). Every liveness test
  must start from an agent-shaped `claim` with **no** `CP_SESSION_ID` in the environment, then drive
  the real hook with hook-shaped stdin JSON. A test that pre-binds identity does not count.
- **A dead claim-time PID is never sufficient evidence to reclaim, adopt, or ship a slot.** PID is at
  most a fast path to LIVE, never a path to ORPHAN.
- **Refresh stays activity-driven, never a timer** (P1268 rationale, git-ops.sh `cmd_heartbeat`
  header): a scheduled stamper outlives its session and manufactures false LIVE.
- **Heartbeat containment stays** (P1268 adversarial finding): a caller outside the slot, or a
  session that does not own the lock, cannot keep it alive by echoing an identity it read from the
  lockfile.
- **A refused heartbeat is observable.** Hooks must still never block a tool call, but a refusal
  must leave a trace a test and a human can read — silent exit 0 is what hid this twice.

## Solution

1. **Bind the real session identity to the lock in the sequence agents run.** Whatever mechanism is
   chosen (e.g. the first in-slot hook call from a session adopting an unbound fallback identity under
   containment, or making the session id reachable at claim time), an agent-run `claim` followed by
   ordinary work in the slot must advance `HEARTBEAT` — without re-opening the "echo the lockfile's
   id" seizure P1268 closed.
2. **Refresh on the activity agents actually produce.** The hook fires on Edit|Write only; bypass-mode
   sessions are instructed to edit through Bash. Liveness must not depend on which edit tool was used.
3. **Never report READY TO SHIP (or any reclaim/ship hint) for a slot that is LIVE or has uncommitted
   changes.** Report it as in-flight instead.
4. **Scan `git worktree list`, not the slot directory.** A registered worktree outside
   `.claude/worktrees/` is reported (e.g. `UNMANAGED WORKTREE <path> — last modified <date>`), never
   silently skipped.

## Alternatives Considered

- **Timer-based heartbeat daemon** — rejected by P1268 and kept rejected (Invariants).
- **Reclaim when PID is dead** — rejected; see owning session's quote above.
- **Liveness from recent file mtimes in the worktree** — plausible fallback signal for the report
  (#3), but mtimes are forgeable and are touched by non-session tools (node_modules installs). If used,
  only as a reason to *withhold* a ship/reclaim hint, never as a reason to report LIVE to `adopt`.
- **Forbid worktrees outside `.claude/worktrees/`** — a rule nothing enforces; reporting them (#4) is
  mechanical and catches the case whoever creates it.

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| Identity binding re-opens the heartbeat-seizure hole P1268 closed | MITIGATE | Containment invariant + an explicit adversarial test: a session outside the slot, and a second session inside it, both fail to refresh |
| Broader hook matcher adds latency to every Bash call | MITIGATE | Keep the existing bounded (≤3s, backgrounded) budget; measure |
| A slot abandoned with uncommitted changes is never shown READY TO SHIP | ACCEPT | Correct: uncommitted work is not shippable; it is reported as in-flight/stale instead |
| Existing locks carry fallback identities | MITIGATE | The fix must bring the currently live w1/w2/w4 locks to a correct verdict without manual editing |

**Non-Goals**
- Do NOT change the `claim` slot-allocation or nonce/`adopt --nonce` seizure rules.
- Do NOT auto-remove or auto-reclaim any worktree, managed or unmanaged — report only.
- Do NOT touch P-number/rank assignment (P1000).

## Done-When

- [ ] From an environment with no `CP_SESSION_ID`, `git-ops.sh claim` followed by a hook-shaped
      in-slot edit event advances `HEARTBEAT`, with the heartbeat pre-aged so an unchanged value
      fails the test.
- [ ] The same holds when the in-slot activity is a Bash tool call rather than Edit/Write.
- [ ] A session outside the slot, and a different session inside it, both fail to refresh — watched
      failing with non-zero test exit pasted.
- [ ] A refused heartbeat leaves a readable trace (log line or status field), verified by triggering one.
- [ ] `pipeline-strandings.sh` does not print READY TO SHIP for a LIVE slot or a slot with uncommitted
      changes — each watched failing against the unfixed script first.
- [ ] A worktree registered outside `.claude/worktrees/` is listed by the report, verified with a
      scratch `git worktree add --detach` outside the slot dir; a control inside the slot dir is not
      double-reported.
- [ ] P1268's existing suite (`scripts/test-git-ops-adopt.sh`, `scripts/test-preflight.sh`) still
      passes, and the pre-bound `CP_SESSION_ID` test is replaced or joined by the agent-shaped one.
- [ ] Live slots on this machine at ship time each report a verdict matching an independent check
      (live process cwd / recent session activity), pasted.

## Related

- P1268 (done 2026-09-09) — predecessor; this is its mechanism failing in real use.
- decisions.md 2026-09-09 "Two gates that are each correct compose into a dead interlock" — the ruling
  harvested into Invariants.
- P1000 — unrelated concurrent-session race (P-number assignment); not in scope.
