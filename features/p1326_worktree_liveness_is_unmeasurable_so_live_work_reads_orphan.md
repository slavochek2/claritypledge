---
status: week
type: task
rank: 106
workstream: infrastructure
created_date: '2026-09-16'
tags: [worktree, git-ops, concurrent-sessions, session-lifecycle]
disclosure: public
delivery_stage: create-spec
pipeline_ran: [create-spec, challenge-prd]
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

Blast radius: high — every concurrent session relies on these verdicts, and a false ORPHAN is not
cosmetic: `git-ops.sh abandon` on an ORPHAN slot runs `git worktree remove --force` (falling back to
`rm -rf`) with no nonce, destroying uncommitted work. Reversibility: high for the change (scripts and
hooks, git revert); **none** for the data a false verdict deletes. Decision density: zero founder calls.

## Review record (2026-09-16, before implementation)

Adversarial spec review: Gemini 3.8 Flash (7 findings) and an Opus reviewer (12 findings) —
**2 of 2 reports received**. Load-bearing claims re-run by command in the main session before being
promoted here:

- **Root cause incomplete (Opus 1):** 4 of the 19 w1 edits ran with the session cwd on main; the hook
  resolves its slot from its own cwd, so those could never beat even with a matching identity.
- **False ORPHAN is a data-loss path today (Opus 3):** `cmd_abandon` refuses only LIVE; on ORPHAN it
  force-removes the worktree. Only `/park` calls it (with a nonce), so exposure is a session acting
  by hand on a false verdict — but the verdict is false on every agent-claimed slot after 12h.
- **Adopt takes over any expired slot (Opus 4, Gemini F1):** adopt without nonce proceeds whenever the
  heartbeat is stale, re-binding `SESSION_ID`, after which the real owner's beats are refused.
- **Identity binding cannot be made safe (Opus 6):** trust-on-first-use lets whichever session touches
  the slot first own it; pattern-matching the fallback id fails because `hostname -s` now returns
  `Mac` while all three live locks carry `Vyacheslavs-MacBook-Pro-…`; nothing in agent Bash exposes
  the session id.
- **A naive dirty check is always true (Opus 9):** every slot shows `?? .lock` and `?? node_modules`.
- **Detached worktrees are skipped twice (Opus 11):** `pipeline-strandings.sh` L75 (outside the slot
  dir) *and* L77 (`br == HEAD`); the STRANDED line also prints a `remove --force` hint with no dirty check.
- **Live-process cwd is a blind oracle (Opus 8):** no claude process has cwd in any slot.

Consequence: the draft Solution ("bind the real session identity") is **withdrawn**. Liveness moves to
identity-free activity evidence, and destructive paths gain a guard that does not depend on liveness
being right.

## Invariants

- **Test from the entry point the caller really uses** (decisions.md 2026-09-09). Tests start from a
  `claim` with **no** `CP_SESSION_ID`, drive the real hook with hook-shaped stdin JSON, and include the
  shapes that failed in production: cwd on main with an in-slot `file_path`, and a Bash command that
  `cd`s into the slot from main.
- **A dead claim-time PID is never sufficient evidence to reclaim, adopt, ship-hint or remove a slot.**
- **Uncommitted work is never destroyed without the nonce**, whatever the lock state says. This guard
  must not depend on the liveness classifier being correct.
- **Liveness evidence may only err toward LIVE.** A forged or spurious activity signal may hold a slot
  open; it must never be able to make a slot look abandoned.
- **Refresh stays activity-driven, never a timer** (P1268): a scheduled stamper outlives its session.
- P1268's invariants hold unchanged: state names LIVE/STALE/ORPHAN/NO_LOCK and `test-preflight.sh`'s
  five-state matrix; identity fields survive adoption; LIVE is never adoptable without the nonce.

## Solution

1. **Activity signal, identity-free.** The PostToolUse hook (all tools, not only Edit|Write) records
   activity for slot `wN` when the payload's `tool_input.file_path`, the payload `cwd`, or the Bash
   `tool_input.command` references a path inside `.claude/worktrees/wN`. It writes a per-slot activity
   marker **separate from the lockfile**, so it never races `adopt`'s lock rewrite and never needs an
   identity check. Bounded and non-blocking as today.
2. **Classifier input widens, names do not.** `classify_lock_state` reads LIVE if (existing PID rule)
   OR heartbeat fresh OR activity fresh within the same TTL. Additive, like P1268's change.
3. **Dirty-tree guard on destructive paths.** `abandon` and nonce-less `adopt` refuse when the worktree
   has changes other than the slot's own bookkeeping (`.lock`, `.lock.*`, the activity marker, and the
   hydration symlinks), naming `--nonce` as the way through.
4. **The report never advises shipping or removing in-flight work.** `pipeline-strandings.sh` prints
   READY TO SHIP and STRANDED/remove hints only for a slot that is neither LIVE nor dirty (same
   bookkeeping exclusions); otherwise IN FLIGHT with the reason.
5. **The report sees every worktree.** Worktrees outside `.claude/worktrees/` and detached worktrees are
   listed (`UNMANAGED WORKTREE <path> — detached|<branch>, last modified <date>`), never skipped.
6. `status` shows last activity alongside last heartbeat, so a human can see why a verdict was reached.

## Alternatives Considered

- **Bind the real session id to the lock** (the draft) — withdrawn; see Review record.
- **Claim-time bind token** — the token must reach a hook, and anything a hook can read, any process can.
- **Timer heartbeat** — rejected by P1268 and kept rejected.
- **Reclaim when PID is dead** — rejected; the owning session's quote above.
- **Worktree file mtimes as activity** — touched by non-session tools and blind to read-only work;
  the explicit marker is written only by the tool-call hook.

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| A session that merely mentions a slot path in a Bash command keeps it LIVE | ACCEPT | Errs toward LIVE by design; the slot expires one TTL after the mentions stop |
| Hook on every tool call adds latency | MITIGATE | Path match first, marker write backgrounded and bounded as today; measured before ship |
| Dirty guard blocks a legitimate cleanup of a truly dead slot with scratch files | ACCEPT | `--nonce` or committing/removing the files is the way through; refusal names it |
| Slot LIVE only through a subagent or resumed session with a different id | ACCEPT | Correct outcome: work is happening there |
| Local processes can forge activity or read the nonce | ACCEPT | These guards prevent accidents between cooperating sessions, not a hostile local process (Opus 5) |

**Non-Goals**
- Do NOT change `claim` slot allocation, nonce generation, or the rule that a LIVE lock needs the nonce.
- Do NOT remove the heartbeat/`SESSION_ID` path; it stays as an additional LIVE input.
- Do NOT auto-remove or auto-reclaim any worktree — report only.
- Do NOT change `ship-gates.sh` spec lookup (Opus 11, L128 branch-selection note) — separate spec if wanted.
- Do NOT touch P-number/rank assignment (P1000).

## Done-When

- [ ] From an environment with no `CP_SESSION_ID`: `claim`, age heartbeat and activity past the TTL,
      then a hook-shaped Edit event makes `status` read LIVE — in three shapes, each watched failing
      against the unfixed code: (a) cwd in slot, (b) cwd on main with in-slot `file_path`, (c) Bash
      event with cwd on main and `command` containing `cd <slot> && …`.
- [ ] A hook event whose paths are all outside the slot does not mark it active (control).
- [ ] `abandon wN` without nonce on an aged ORPHAN slot holding an uncommitted file refuses, non-zero,
      and the file still exists; the same slot with only `.lock` and `node_modules` is removed (control).
- [ ] Nonce-less `adopt` on an aged slot with uncommitted changes refuses and leaves `SESSION_ID` unchanged.
- [ ] `pipeline-strandings.sh`: a gate-passing slot that is LIVE or dirty prints IN FLIGHT, not READY
      TO SHIP; a clean, aged, gate-passing slot still prints READY TO SHIP (control, P1246 not regressed).
- [ ] The STRANDED remove hint is not printed for a dirty slot.
- [ ] A detached worktree outside `.claude/worktrees/` is reported as UNMANAGED; a managed slot is not
      double-reported.
- [ ] `scripts/test-git-ops-adopt.sh` and `scripts/test-preflight.sh` pass unchanged.
- [ ] Live slots on this machine at ship time each get a verdict matching an oracle independent of the
      lock and the hook: per-session transcript mtime plus last recorded `cwd`/`file_path` — pasted.

## Related

- P1268 (done 2026-09-09) — predecessor; this is its mechanism failing in real use.
- decisions.md 2026-09-09 "Two gates that are each correct compose into a dead interlock" — the ruling
  harvested into Invariants.
- P1000 — unrelated concurrent-session race (P-number assignment); not in scope.
