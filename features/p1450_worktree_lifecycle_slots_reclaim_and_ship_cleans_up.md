---
status: qa
type: task
rank: 26
workstream: infrastructure
created_date: '2026-10-09'
tags: [worktrees, git-ops, ship, day]
disclosure: public
delivery_stage: ship
pipeline_ran: [create-spec, dev, ship]
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

Blast radius: medium. These are shared tools (`git-ops.sh`, the activity hook, `worktree-changes.sh`, `/day`) that every concurrent session goes through, and a wrong removal destroys uncommitted work. Reversibility: git revert for the code, but a wrongly removed worktree's uncommitted files are not recoverable. Decision density: none — park threshold set at 7 days (reversible).

## Invariants

- **Nothing destructive trusts the liveness verdict alone** (decisions.md 2026-09-17, P1326). Removal still requires *both* no user changes *and* not LIVE.
- **A session writing in a slot keeps it LIVE even when its lock PID is dead.** w4 on 2026-10-09 is the regression case.
- **A valid `.hold` (P1519) blocks every automatic removal and park.**
- **Nothing is deleted without a recovery record written first** (name and tip SHA; detached HEADs pinned as a ref).
- Prod migrations apply only from a commit on main (decisions.md 2026-10-09, P1448). Embargoed fixes follow the branch-born-spec route there, not a feature-branch apply.

## Solution

1. **Reads stop counting as activity.** Only Write, Edit, NotebookEdit, a Bash command that WRITES (a cwd in the slot counts only for such a command, and so does an earlier `cd <slot>`), or a git write against the slot (commit, add, index change) stamps `.activity`. A Bash command that only names the slot path in a read (`cat`, `grep`, `ls`, `git log`, `git status`), or runs from inside the slot without writing, does not. In a compound command only the slots named in the WRITE segments are stamped (`cat wN/x > /tmp/o` stamps nothing for wN), and `-o` / `--output` / `--output=` on `sort`, `uniq`, `tree`, `diff` and `git diff` are writes into their target.
2. **Untracked is never disposable; only ignored entries can be regenerable.** An untracked (`??`) entry is always a user change, at any depth and whatever its name or extension, except a `node_modules` that is a *symlink* (the hydration symlink; `node_modules/` in `.gitignore` does not match a symlink). Only git-ignored (`!!`) entries may be exempt as regenerable output: `test-results/`, `playwright-report/`, `dist/`, `coverage/`, `node_modules/`, `__pycache__/` and the python tool caches, matched on whole literal path components (no globbing). Any `find` or `git` error counts as a change. This matches the existing `__pycache__` rule (P1381).
3. **Ship's journal resolves the spec by P-number.** It stops trusting the stored path, so a renamed spec does not strand a resume. `--resume` with all commits landed and the spec in `done/` converges to cleanup. Related: P1198, the other resume defect.
4. **Ship records what it shipped.** On a successful ship, `git-ops.sh ship` appends one line per shipped branch to a durable shipped-tips record (never deleted with the journal): P-number, branch, the branch tip it shipped, main's SHA after landing. This is the only exact "landed" signal for a squashed or reconciled ship. Every after-the-fact oracle was measured wrong on 2026-10-27: patch-id kept all 11 shipped branches, a subject match is fooled by `c431d2ec0`/`eb56d6e3b` (same subject, 382-line difference; `git-ops.sh:1355-1369`), and a whole-branch reverse-apply against main failed on all 11 because main had kept editing those files.
5. **Agents clean up; the founder answers only yes/no questions (revised 2026-10-27).** One command, run by agents, never by the founder. It gives each stranded slot, unmanaged worktree (including `scratchpad/` worktrees in `/private/tmp`) and slot-less branch exactly one verdict:
   - *remove*, which runs automatically. It is allowed only when ALL hold:
     - (a) the branch tip equals, or is an ancestor of, a tip in the shipped-tips record, OR `classify_ref` (`git-ops.sh:1484`) says MERGED;
     - (b) the worktree is idle by the git-dir test in `sweep_merged_agent_worktrees` (`git-ops.sh:726`): no write to its `index`, `HEAD` or `logs/HEAD` within the idle window. This works for slots and unmanaged worktrees alike, and an unreadable git dir counts as LIVE;
     - (c) there are no uncommitted or untracked files beyond the regenerable set (item 2);
     - (d) the slot has no valid `.hold` (P1519).

     Before anything is deleted, the name and tip SHA go to the private recovery log, and a detached HEAD is pinned under `refs/recovery/<name>`. Removal reuses `teardown_worktree_if_clean` (`git-ops.sh:755`).
   - *park* (remove the worktree, keep the branch) runs automatically for a slot with no write activity for 7 days, under the same rules (b)-(d). The branch survives, so parking is fully reversible.
   - *ask* covers everything else: untracked files that exist nowhere else, commits with no shipped-tip record that `classify_ref` keeps, `backup/*` refs, and detached worktrees with commits not on main. Each item reaches the founder as one plain-language yes/no line saying what it is and what would be lost, with the evidence. **Never a shell command.** On "yes" the agent runs the removal through the same logged path.
   - A branch fully contained in another live branch gets *remove worktree, keep branch*.
6. **The strandings report names the agent's action, not a command.** `pipeline-strandings.sh` stops printing `inspect, then: git worktree remove …` and `remove with: … git branch -D …`. It prints the verdict. The session that sees it runs item 5's command, or relays the *ask* lines. Its open-spec test is also fixed: `! ls features/pN_*.md features/*/pN_*.md` (lines 197 and 318) exits non-zero whenever either glob misses, so an open spec reads as closed and the old report advised `git branch -D` on a live branch (reproduced 2026-10-27).
7. **Park threshold: 7 days** (decided by the agent, 2026-10-27). The founder asked to be kept out of reversible calls, and parking keeps the branch.

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| A session that only reads looks idle and its worktree gets removed | MITIGATE | Idle is measured on the worktree's own git dir (index/HEAD/reflog), `.lock`/`.activity`, any process whose cwd is inside it (`lsof`; unreadable counts as live) and any non-regenerable file modified in the window, so a session that changes git state, runs a dev server there or edits without staging stays live. A session that never changes git state has nothing in the worktree to lose. Untracked files block removal. |
| Classifying a Bash command as read-vs-write is heuristic | MITIGATE | Any `git` command naming the slot counts as a write unless it is on an explicit read allowlist (`log`, `status`, `diff`, `show`, `rev-parse`). Ambiguous commands count as writes. |
| Branches shipped before the shipped-tips record existed have no record | ACCEPT | They go to *ask* once, batched. It is a one-time backlog. |
| Parking removes a worktree whose owner returns | ACCEPT | The branch is kept, and `git-ops claim` re-creates the slot. |

**Non-Goals**
- Do NOT auto-remove anything that fails the *remove* conditions in item 5 — those go to the founder as a yes/no line. (Replaces the 2026-10-09 non-goal "no auto-removal without founder approval", reversed by the founder on 2026-10-27.)
- Do NOT change the lock/nonce ownership model.
- `git-ops.sh` sources its libs from `REPO_ROOT` (the main checkout), so a dry run of `tidy` from this branch's worktree judges with main's OLD `worktree-changes.sh`. The scratch-repo suites copy the branch's libs and are the pre-landing evidence; real verification of `tidy` output on the live repo happens only after landing.
- Do NOT touch embargo flow or `publish-spec` (INBOX-155 tracks the stub gap).

## Done-When

- [x] A read-only `grep` / `cat` / `git log` of a dead slot leaves its `.activity` unchanged, and a Write in it advances the stamp (canary, both halves pasted) — `test-p1450-activity-hook.sh` 39/0 ("a later read leaves .activity unchanged", "a later Write advances .activity")
- [x] A slot with a dead lock PID and a fresh write still reads LIVE (the w4 case, canary) — `test-p1450-activity-hook.sh` dead-PID fresh-write case; `test-p1326-worktree-liveness.sh` exit 0
- [x] A slot whose only extras are nested `tools/kanban/test-results/` is removed by ship (canary) — `test-p1450-regenerable.sh` 23/0: an ignored nested `tools/kanban/test-results/` is exempt (ship's teardown uses the same lib); an untracked one now counts as work (founder option A, 2026-10-27)
- [x] `ship pN --resume` converges when the spec was renamed after the journal was written (canary reproducing p1448) — `test-p1450-ship-record.sh` R-cases exit 0, including the control where the spec is absent everywhere and the run still refuses
- [x] Scratch-repo canary, both halves pasted, covering these fixtures — `test-p1450-tidy.sh` 88/0 covers every fixture; the before/after for each one is in the build commits 4edb833e0, 8a47b3a82 and 792fdb69c:
  - a squash-shipped branch with a shipped-tips record → *remove*;
  - the same branch with one commit added after the ship → *ask*;
  - a subject collision like `c431d2ec0` with no record → *ask*;
  - a reverted-then-not-relanded commit → *ask*;
  - an untracked-only worktree, the base-p1562 and w17 shapes → *ask*;
  - a detached worktree holding a unique commit → *ask*, or pinned under `refs/recovery/` before removal;
  - a slot with a valid `.hold` → never removed;
  - a worktree whose git dir was written inside the idle window → never removed.
- [x] A ship writes its shipped-tips line, and the line survives the journal's deletion (canary) — `test-p1450-ship-record.sh` and `test-p1450-tidy.sh` ("survives" cases); H4: the record stops at the first commit that never landed
- [x] A *remove* writes name and tip SHA to the private recovery log before deleting, and the branch is restorable from it (canary) — `test-p1450-tidy.sh` recovery cases: a log line is written and read back before any delete, every deleted tip is pinned under `refs/recovery/` and survives `reflog expire` + `gc` (M1), and refs pass `check-ref-format` (S5)
- [x] `pipeline-strandings.sh` output contains no `git worktree remove` / `git branch -D` text, and an open spec in a `features/` subfolder plus a done copy no longer reads as closed (canary for the lines 197 and 318 glob bug) — `test-p1450-strandings.sh` 11/0
- [x] Every new refusal and gate is run against the documented ship, claim and abandon workflows, and they still pass (epistemic gate 7c) — `test-git-ops-ship`, `test-git-ops-gc`, `test-git-ops-extensions`, `test-git-ops-adopt`, `test-p1326`, `test-p1381`, `test-p1519` all exit 0. `test-p1326` cases 1c-1f, 5b and 6b were changed deliberately, because the behaviour they pinned is the one this spec reverses.


## Known limitations (from the final review, 2026-10-27)

The final Codex and Gemini Argon review found no path where `tidy --apply` (without `--confirm`) destroys content or removes a live worktree. These findings sit in code this spec did not change, or they fail safe:

- `cmd_park` commits a branch's spec to main without checking `disclosure: embargo`. This is pre-existing; filed separately.
- Ship's own teardown (`teardown_worktree_if_clean`) ignores `.hold` and writes no recovery record before removing a shipped slot. This is pre-existing ship behaviour; filed separately.
- The heartbeat path still refreshes LIVE for reads by a session whose identity matches the lock. This fails safe (keeps a slot LIVE). A relative `cd` from inside a slot drops the activity stamp, which the fresh-file liveness check covers.
- `tidy --apply --confirm` uses `git worktree remove --force` after a re-check. A file created between the re-check and the removal is lost. This path only runs after a founder "yes".

## Related

- P1326 (liveness from activity), P1381 (`__pycache__` exemption, agent-worktree sweep), P1198 (resume re-diff), P1448 (prod from main), P1246 (pipeline strandings report), P1169 (/day stranding scan)
