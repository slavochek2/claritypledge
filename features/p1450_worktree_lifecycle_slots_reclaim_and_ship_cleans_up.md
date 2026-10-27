---
status: week
type: task
rank: 26
workstream: infrastructure
created_date: '2026-10-09'
tags: [worktrees, git-ops, ship, day]
disclosure: public
delivery_stage: create-spec
pipeline_ran: [create-spec]
drafted_by: opus
exec_model: opus
exec_effort: high
driver: anomaly
---

# P1450: Worktree lifecycle: finished slots get removed, and /day can act on stranded ones

## Problem

> Founder framing, verbatim (2026-10-09): "how to sustainably make sure that we don't create abandoned [worktrees] or we have a way to deal with abandoned work trees or maybe in Slash Day. also sustainably try to avoid abandoning them and cleaning them up at the right time."

**Situation:** An audit on 2026-10-09 found 7 slots (w2–w8). Every lock's PID was dead, yet `git-ops status` reported 6 of them LIVE. `/day` and the SessionStart hook reported strandings, but each one said "NOT removable yet", so nothing the founder could act on.

**Complication:** Four different causes, all measured that day:

1. **Read-only probes refresh liveness.** The PostToolUse activity hook stamps a slot whenever a tool payload *mentions* the slot path. w6 and w7 carried the identical stamp `09:51:27Z`, and w8's stamp moved during a read-only audit. Any audit, `/day` scan or status check therefore keeps dead slots LIVE for another 12h.
   **Counter-evidence that must survive the fix:** the same day, w4's lock PID was dead while a live session (`claritypledge-2d`) was committing there. Activity was the *correct* signal for w4, so the PID cannot replace it.
2. **A completed ship left its slot behind (w8, p1449).** `worktree_has_user_changes` exempts `test-results/` at the top level only. w8 held `tools/kanban/test-results/`, so ship RETAINED the slot. **Reproduced live the same day on w2 (p1442 ship):** ship RETAINED it for `!! tools/kanban/test-results/` and `?? tools/kanban/node_modules`. The nested `node_modules` is not even gitignored at that depth, so it shows as untracked user work. Branch had 0 unique patches. Cleaned by hand.
3. **A ship journal outlived a renamed spec (w3, p1448).** The journal stores `spec_file` by path. The spec was renamed after the journal was written, and `ship p1448 --resume` hard-failed with `spec file missing`, although both commits had landed and the spec was already in `done/`. Cleanup needed a manual `abandon`, branch delete and journal delete.
4. **A stacked prototype stranded its parent slot (w6, p1390).** Every w6 commit was contained in w7's branch, but nothing noticed. w6 sat 3 days with a dead lock.

**Addendum 2026-10-27.** 18 worktrees and 30 branches; about a third were already shipped. The session-start report told sessions to "inspect, then: `git worktree remove …`", and sessions relayed that to the founder:

> "Why did we do it that I need to run it? I want it to be out of the loop … clearly I should not be executing some commands. That's uncool process. … Is that why they are accumulating?"

Measured the same day: `git cherry` flagged 10 of 12 shipped or backup branches as holding unshipped work (P1515, P1389 and others were squashed or edited on their way into main). A subject-plus-content check cleared all 10. Two leftover worktrees held the only copy of real work: base-p1562 had 5 untracked tests, and w17 had the P1572 spec. A naive "untracked = disposable" rule would have destroyed both.

**Question:** What makes slots leave on their own when work finishes, and makes the rest actionable from `/day`?

## Appetite

Blast radius: medium. These are shared tools (`git-ops.sh`, the activity hook, `worktree-changes.sh`, `/day`) that every concurrent session goes through, and a wrong removal destroys uncommitted work. Reversibility: git revert for the code, but a wrongly removed worktree's uncommitted files are not recoverable. Decision density: one founder call (the park threshold, below).

## Invariants

- **Nothing destructive trusts the liveness verdict alone** (decisions.md 2026-09-17, P1326). Removal still requires *both* no user changes *and* not LIVE.
- **A session writing in a slot keeps it LIVE even when its lock PID is dead.** w4 on 2026-10-09 is the regression case.
- Prod migrations apply only from a commit on main (decisions.md 2026-10-09, P1448). Embargoed fixes follow the branch-born-spec route there, not a feature-branch apply.

## Solution

1. **Reads stop counting as activity.** Only Write, Edit, NotebookEdit, a Bash command whose cwd is the slot, or a git write against the slot (commit, add, index change) stamps `.activity`. A Bash command that only names the slot path in a read (`cat`, `grep`, `ls`, `git log`, `git status`) does not.
2. **Regenerable output is exempt at any depth, ignored or not.** This covers `test-results/`, `playwright-report/`, `dist/`, `coverage/` and `node_modules/`, matching the existing `__pycache__` rule (P1381). Also gitignore `node_modules/` at any depth.
3. **Ship's journal resolves the spec by P-number.** It stops trusting the stored path, so a renamed spec does not strand a resume. `--resume` with all commits landed and the spec in `done/` converges to cleanup. Related: P1198, the other resume defect.
4. **Agents clean up; the founder answers only yes/no questions (revised 2026-10-27).** Each stranded slot, unmanaged worktree (including `scratchpad/` worktrees other sessions left in `/private/tmp`) and slot-less branch gets exactly one verdict, and the agent executes the safe ones itself:
   - *remove* — automatic when ALL hold: not LIVE; no uncommitted or untracked files beyond the regenerable set (item 2); and every branch commit is on main. "On main" is a content check, never `git cherry` alone: a commit counts as landed if its patch-id matches, OR its exact subject is on main, OR every file it touches is identical on main. Before deleting, the branch name and tip SHA are appended to a private recovery log.
   - *park* (worktree removed, branch kept) — automatic past the park threshold, same no-changes rule.
   - *ask* — anything holding files that exist nowhere else, or commits not on main by the content check. The founder gets one plain-language yes/no line per item (what it is, what would be lost). **Never a shell command.**
   - A branch fully contained in another live branch → *remove worktree, keep branch*.
5. **The strandings report names the agent's action, not a command.** `pipeline-strandings.sh` stops printing `inspect, then: git worktree remove …` / `remove with: … git branch -D …` as advice. It prints the verdict, and the session that sees it runs the cleanup command (item 4) — or, for *ask*, relays the yes/no line.
6. **Park threshold** for a slot with no write activity: [FOUNDER DECISION: 7 days proposed. A shorter window clears clutter sooner, while a longer one protects slow prototypes.]

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| A real session working only through reads goes ORPHAN and gets proposed for removal | MITIGATE | Removal still needs the no-changes check, and /day only *proposes* an action. A pure-read session has nothing to lose in the worktree. |
| Classifying a Bash command as read-vs-write is heuristic | ACCEPT | Ambiguous commands count as writes (fail toward LIVE). Only clear reads are excluded. |
| Parking removes a worktree whose owner returns | ACCEPT | The branch is kept, and `git-ops claim` re-creates the slot. |

**Non-Goals**
- Do NOT auto-remove anything that fails the *remove* conditions in item 4 — those go to the founder as a yes/no line. (Replaces the 2026-10-09 non-goal "no auto-removal without founder approval", reversed by the founder on 2026-10-27.)
- Do NOT change the lock/nonce ownership model.
- Do NOT touch embargo flow or `publish-spec` (INBOX-155 tracks the stub gap).

## Done-When

- [ ] A read-only `grep` / `cat` / `git log` of a dead slot leaves its `.activity` unchanged, and a Write in it advances the stamp (canary, both halves pasted)
- [ ] A slot with a dead lock PID and a fresh write still reads LIVE (the w4 case, canary)
- [ ] A slot whose only extras are nested `tools/kanban/test-results/` is removed by ship (canary)
- [ ] `ship pN --resume` converges when the spec was renamed after the journal was written (canary reproducing p1448)
- [ ] /day shows one proposed action per stranded slot and executes it on approval. A contained-branch slot is proposed for remove-keep-branch.
- [ ] Shipped-but-squashed branches (P1515 and P1389 shapes: patch-ids differ, subjects or file contents on main) classify as *remove*; a worktree whose only unique content is an untracked file (base-p1562 tests, the w17 P1572 spec) classifies as *ask* (canary, both halves pasted)
- [ ] A *remove* writes the branch name and tip SHA to the private recovery log before deleting, and the branch is restorable from it (canary)
- [ ] The strandings report contains no `git worktree remove` / `git branch -D` advice; a session start with a removable stranding leaves it removed without founder input
- [ ] Every new refusal and gate is run against the documented ship, claim and abandon workflows, and they still pass (epistemic gate 7c)

## Related

- P1326 (liveness from activity), P1381 (`__pycache__` exemption, agent-worktree sweep), P1198 (resume re-diff), P1448 (prod from main), P1246 (pipeline strandings report), P1169 (/day stranding scan)
