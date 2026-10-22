---
status: qa
type: task
rank: 46
workstream: infrastructure
created_date: '2026-10-20'
tags: [worktrees, stop-hook, session-end, pipeline]
disclosure: public
delivery_stage: ship
pipeline_ran: [create-spec, dev, ship]
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

- [x] A slot claimed from main (no session id on the lock) is detected as owned
- [x] A session ending with its slot in the P1511 state (code on `origin/main`, spec open) is blocked and shown the close step; a hold is refused for it
- [x] A valid hold lets the session end and the next startup report shows it; a hold with owner `me` or `wip` is rejected; a hold older than the session's last write is ignored
- [x] A session with no slot or a clean one ends with no output and no measurable added latency
- [x] The literal reply "No, nothing else." triggers the check for a session that owns a slot
- [x] When the session cannot close the slot itself, the blocked turn shows why it is open, the cost, the options and a recommendation, in that order, before any hold is written (canary on the P1494 state)
- [x] Claim, KDD and review gates each still block in their own canary while a slot is open
- [x] `git-ops.sh park` frees the worktree, keeps the branch and commits the spec via `commit-to-main`; the session then passes

**Evidence (2026-10-22):** `bash scripts/test-p1519-slot-closure.sh` — 100 passed, 0 failed. Failure path, each exit 1: against main's hook 67 / 19 (at 86 cases); against the round-1 hook 79 / 7; against the round-2 code (hook + scripts) 85 / 11; against the round-3 code 98 / 2 — each time exactly the shapes that round's reviewers reported. Latency: a no-slot Stop adds 13ms; on a real 3 MB / 1,110-line transcript the ownership scan takes 26ms and classifying one owned slot 212ms (only on an ending turn of a slot-owning session). Neighbouring suites green: p1505 review gate 61/0, browser-evidence 11/0, p1326 33/0, p1381 6/0, git-ops adopt 42/0, gc 4/0, extensions and ship invariants hold. Live: the classifier reports w1/P1510 and w10/P1516 as `SHIPPED_UNCLOSED` (code put on main directly), which the startup report had listed as READY TO SHIP.

**Review round 2026-10-22** (Gemini review model, Codex, Opus adversary, Sonnet criteria — 4 of 4 reported). Fixed, each with a canary: ownership from a mentioned, refused or printed claim, or from an edit made before the slot was re-claimed (lock `CLAIMED_AT` now bounds ownership); relative `cd` before a git write; `NOTHING_ELSE_RE` firing mid-turn; direct-to-main detection matching message bodies and docs commits (now subject + code + closure gate 2.5); merged branches read as EMPTY; `park` reverting a newer committed spec on main, overwriting an untracked file, re-creating a closed spec, or leaving main dirty when `commit-to-main` fails; `hold`/`park` without ownership proof (both now need `--nonce`); `hold` failing open on an unclassifiable slot; stale `.parked` markers (now matched to the branch head); GNU `date` parsing; the hook executing a classifier in a repo named by a transcript path (now only its own repo).

**Re-review 2026-10-22** (Gemini, Codex, Opus — 3 of 3; Opus re-ran its round-1 reproductions and confirmed them fixed). Fixed, each with a canary: merged branches whose tip is spec-only, and fast-forward refreshes read as shipped (now: a post-claim code commit on the branch that is not on main's first-parent line); a heredoc line, and a `( cd … )` subshell, granting ownership; only the first of chained git writes counted; env-prefixed claims missed; a hold from a previous claim of the directory, or written in the same second as a later edit, accepted; the brief's nonce path relative; `park` on a renamed spec leaving two open specs; `park`'s restore clobbering a commit that landed despite a non-zero exit.

**Final pass 2026-10-22** (Gemini, on the round-3 diff). Fixed with canaries: a co-tenant's `--no-ff` merge fast-forwarded into a fresh slot read as shipped (merged-branch proof now reads the branch's own reflog: only commits *made on* the branch count); `git -C` treated as moving the shell for later commands.

**Known limitations.** Ownership needs transcript timestamps and a lock `CLAIMED_AT`; without them the re-claim bound is skipped. A refused claim counts as ours if another session claimed the same P-number within 5 seconds of it. Gate 2.5 corroboration reads the spec on main, so a P1510-shape slot whose ticked spec exists only on the branch reads `SPEC_ONLY` (the safe direction: hold stays available). A `cd` path containing parentheses is mangled by the subshell filter. A hold written in the same second as the session's last write reads stale; the session is shown the brief at most once more and can re-hold. The merged-branch proof walks the reflog with `--since`, which can stop early if the branch was reset to an older commit after committing, and it counts only `commit:`/`commit (amend):` entries (a cherry-pick or merge commit made on the branch is not counted); attached `git -C<path>` is not parsed. Last verification pass (Gemini, 1 of 1): fixes confirmed, these three recorded rather than fixed (decisions.md 2026-10-14 stopping rule). `park` writes the spec on the main checkout just before `commit-to-main` takes `main.lock`; a co-tenant writing that exact path in that window is detected by the post-commit blob check, not prevented. A `founder`-owned hold never expires (founder decision: the founder un-blocks it). Subagent stops and sessions that end without a Stop event stay out of scope (Risks table).

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
