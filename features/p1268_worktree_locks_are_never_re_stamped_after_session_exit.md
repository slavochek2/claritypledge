---
status: week
type: task
rank: 1000077
workstream: infrastructure
created_date: '2026-09-08'
tags: [worktree, git-ops, pre-flight, session-lifecycle]
disclosure: public
delivery_stage: create-spec
pipeline_ran: [create-spec]
drafted_by: opus
exec_model: opus
exec_effort: high
driver: anomaly
---

# P1268: A worktree lock is never re-stamped, so every resumed session's slot reads ORPHAN forever

## Problem

**Situation:** `git-ops.sh claim` writes `<slot>/.lock` stamping a `PID` and `PID_START_TIME`.
`classify_lock_state` calls a lock LIVE only if that exact PID is alive with a matching start time;
otherwise ORPHAN. `pre-flight.sh` exits 2 on ORPHAN.

**Complication:** `cmd_claim` stamps `$$` — **the PID of the `git-ops.sh` process itself**, which
exits the moment the command returns. In an agent harness every shell command is a new short-lived
process, so the lock is ORPHAN within milliseconds of being written. This is not decay over a
session restart; it is dead on arrival, deterministically, for every agent-driven claim.

Demonstrated this session, unmodified tooling:

```
$ ./scripts/git-ops.sh claim p1268 worktree-lock-adoption   # → w1, session PID 61205
$ ./scripts/git-ops.sh status                               # ~5 seconds later
w1  feature/p1268-worktree-lock-adoption  61205  ORPHAN
$ ps -p 61205                                               # (no output — never outlived the command)
```

**Why nobody noticed:** the only consumer that acts on the verdict is `pre-flight.sh`'s lockfile
check, and it runs *only* when passed `--slot`. Grep across `.claude/commands/` finds two callers
and **neither passes it** — `/dev` and `/fix` both call `pre-flight.sh <ctx> --spec pN`, so the
check prints `lockfile: skipped (no --slot)` on every run. The exit-2 path is unreachable in
practice, which is why a permanently-wrong verdict has survived since P786.

**Consequence:** `git-ops.sh status`'s STATE column has been decorative for agent workflows, and
conclusions have been drawn from it as fact — decisions.md 2026-08-31 reads *"all four slots ORPHAN
— every session dead"* and builds a remedy on that premise. All three slots on this machine report
ORPHAN today, and at least one (w5) was committing during the check.

**Question:** What makes a lock's liveness truthful when no process in the system outlives a single
command?

> Founder framing, verbatim: "There is a 1058 worktree, worktree 2. Anybody owns it? […] It's
> probably a problem. And then we need to fix it and also investigate how to sustainably fix and
> prevent it."

## Appetite

Blast radius: **high** — `pre-flight.sh` gates `/dev` and `/fix`, and the lock is the only
mechanism telling concurrent sessions which slot belongs to whom. Reversibility: high (new
subcommand plus a hook entry; both removable in one revert). Decision density: low — the
containment rules below are derivable from the existing lock contract, not founder calls.

## Invariants

- A lock may only ever be re-owned **into the slot the caller is actually working in**. Adopting a
  slot from outside it is the seizure this file exists to prevent.
- Adoption must fail **closed**: if liveness cannot be determined, refuse rather than adopt.
- A genuinely LIVE lock held by a different living PID is never adoptable without its `NONCE`.
- `SLOT`, `BRANCH`, `P_NUMBER` and `CLAIMED_AT` are the identity of the claim and survive adoption
  unchanged. Adoption re-owns a claim; it never redefines one.
- `scripts/test-preflight.sh`'s five-state matrix (P786) stays green — LIVE/STALE/ORPHAN/NO_LOCK
  classification is a published contract other callers depend on.

## Solution

**PID existence cannot express liveness here** — no process in an agent harness outlives one
command. Liveness moves to **heartbeat freshness**, with PID kept as a fast-path corroboration.

1. **`classify_lock_state` gains an additive heartbeat rule.** LIVE if the PID is alive with a
   matching start time (today's rule, unchanged) **OR** `HEARTBEAT` is within a TTL. Only the
   *inputs* widen; the four state names and their exit codes are untouched. This is safe against
   P786's matrix by inspection: `scripts/test-preflight.sh` sets `HEARTBEAT=1990-01-01T00:00:00Z`
   on both the STALE and ORPHAN fixtures and a fresh stamp on the LIVE one, so every existing
   assertion keeps its current verdict.

2. **`git-ops.sh adopt <slot> [--nonce <v>]`** — re-stamp `HEARTBEAT`, `SESSION_ID`, `PID` and
   `PID_START_TIME` on an existing lock, preserving `SLOT`/`BRANCH`/`P_NUMBER`/`CLAIMED_AT`/`NONCE`.
   Refusals: slot or lock absent; caller's `git rev-parse --show-toplevel` is not the slot path
   (unless `--nonce` matches); worktree branch differs from the lock's `BRANCH`; lock is LIVE under
   a *different* living PID with no matching nonce.

3. **A `SessionStart` hook** that adopts when cwd is inside `.claude/worktrees/wN`, reading
   `session_id` from the hook's stdin JSON (the pattern `.claude/hooks/verify-before-stop.py:231`
   already uses). This is what keeps the heartbeat fresh without anyone remembering to.

TTL is a real trade-off and is named rather than buried: too short and a session idle over lunch
reads dead; too long and a genuinely dead slot stays locked. Start at **12 hours** — long enough
that no working session is misread, short enough that yesterday's corpse is visible today — and
record it as tunable.

## Alternatives Considered

1. **Classify by "is any live process cwd'd under the slot" instead of the recorded PID.** Rejected
   as the primary fix: `lsof -d cwd` over every process is slow, and cwd is not ownership — a
   session editing a worktree by absolute path from the main checkout has no cwd there, which is
   precisely the ambiguity that left w2 unresolvable in this session's investigation. Worth adding
   later as a *secondary* signal that downgrades confidence, never as the verdict.
2. **A background heartbeat *timer*.** Rejected, and the distinction from the chosen design is the
   whole point: a daemon that keeps stamping on a schedule outlives the session it represents and
   manufactures false LIVE, which blocks cleanup forever. A hook that stamps only when a real
   session starts cannot outlive that session — the heartbeat then decays honestly on its own.
   False LIVE is strictly worse than today's false ORPHAN, which is at least conservative.
3. **Widen `pre-flight.sh` to warn instead of exit 2 on ORPHAN.** Rejected: that deletes the signal
   rather than repairing it, and re-opens the slot-seizure risk P786 closed.
4. **Wire `--slot` into `/dev` and `/fix` first, so the check actually runs.** Rejected *as a first
   step*, and deliberately so: turning on an unreachable gate whose verdict is currently wrong for
   every agent-claimed slot would block every `/dev` and `/fix` run on the machine. The verdict has
   to become true before the gate that reads it is switched on. Sequencing, not scope — worth its
   own spec once this lands.

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| `adopt` becomes a seizure tool — one session adopts a slot another is using | MITIGATE | cwd containment + branch match + LIVE-PID refusal; adopting from outside the slot is impossible without the nonce |
| The hook fires on every session start and adds latency or noise to unrelated sessions | MITIGATE | Hook exits 0 immediately when cwd is not under `.claude/worktrees/`; timeout capped |
| A hook that fails loudly blocks session start | MITIGATE | Hook never exits non-zero on adoption failure — it reports and returns 0; refusing to adopt must not refuse to start a session |
| `adopt` writes a lock into a slot whose worktree was removed mid-flight | MITIGATE | Re-check slot dir and `.git` marker after the liveness read, before the write |
| False ORPHAN has existed for months and other conclusions were drawn on it | ACCEPT | decisions.md 2026-08-31 read "all four slots ORPHAN — every session dead" as fact; re-litigating that entry is out of scope, but this spec's Findings should note it is now suspect |
| w2/w5's current locks are stale right now and adopting them is the first real use | ACCEPT | That is the intended first exercise, and it is reversible — the lock file is regenerable from `claim`'s fields |

**Non-Goals**
- Do NOT rename, add or remove `classify_lock_state` states, or change any exit code. Widening what counts as LIVE is in scope; changing the vocabulary is not.
- Do NOT change `pre-flight.sh`'s exit codes.
- Do NOT touch `cmd_claim`, `cmd_release`, `cmd_abandon` or `cmd_ship`.
- Do NOT address the staged-index residue from decisions.md 2026-08-31 — related, separately filed.
- Do NOT auto-adopt from a non-interactive or subagent context.

## Done-When

- [ ] A lock written by `git-ops.sh claim` reports LIVE immediately after the claim returns —
      the exact sequence that produces ORPHAN today, pasted before and after
- [ ] `git-ops.sh adopt wN` re-stamps a lock whose heartbeat has expired, and `status wN` then
      reports LIVE — demonstrated against a real slot
- [ ] A lock whose `HEARTBEAT` is older than the TTL and whose PID is dead still reports ORPHAN —
      the fix must not make every lock immortal
- [ ] Every refusal path is **watched failing** with its non-zero exit pasted (epistemic gate 7):
      adopting from outside the slot; branch mismatch; LIVE lock under another PID without nonce;
      absent lock; absent slot
- [ ] The existing documented flows still pass with the change in place (epistemic gate 7c) —
      `claim` → `pre-flight` → commit, and `park`/`abandon` — each run and its outcome recorded,
      not reasoned about
- [ ] `scripts/test-preflight.sh` passes unchanged, and its five-state matrix is re-read to confirm
      the heartbeat rule did not silently flip a case rather than assumed from the fixtures
- [ ] A session started with cwd inside a worktree refreshes that slot's `HEARTBEAT`, verified by
      reading the lock before and after
- [ ] A session started outside a worktree stamps nothing and the hook exits 0
- [ ] Hook failure does not block session start, verified by forcing the adopt to fail
- [ ] The three slots live on this machine (w1, w2, w5) each report a verdict matching their
      observed reality

## Rollback Strategy

Two independent reverts. Removing the `SessionStart` entry from `.claude/settings.json` disables
the automatic path and restores today's behaviour exactly. Removing `cmd_adopt` from `git-ops.sh`
removes the manual path. Neither touches any existing lock: adoption only ever rewrites fields
`claim` already writes, so a lock adopted under this feature stays valid after the revert.

## Research Questions

1. Does `classify_lock_state`'s STALE branch (PID exists, start time differs) ever fire in practice,
   or is ORPHAN the only reachable failure state on macOS given PID recycling intervals?
2. How many of the historical ORPHAN observations in `docs/decisions.md` were false — specifically,
   was the 2026-08-31 "every session dead" reading correct?
3. Is `SessionStart` the right hook event, or does it miss the `--continue` path?

## Related

- decisions.md 2026-04-22 (P786) — `pre-flight.sh` lock classification contract and test matrix
- decisions.md 2026-08-31 — ORPHAN slots leave staged index residue no cleanup command owns
- decisions.md 2026-08-19 — volatile worktree state decays; re-check before advising on it
