---
status: in-progress
type: task
rank: 354
workstream: infrastructure
created_date: '2026-11-24'
tags: [day, worktrees, holds, tidy]
disclosure: public
delivery_stage: dev
pipeline_ran: [create-spec, dev]
drafted_by: opus
exec_model: opus
exec_effort: high
driver: anomaly
spec_review_hash: 66d7f182cf2980cc389268543d76dfbafde96f1b6bb38bde78e08f8b7e2d40d0
spec_review_vendors: [codex, gemini, openrouter]
---

# P1723: /day resolves parked workspaces: releases holds whose work is finished, asks about the rest

## Problem

> Founder framing, verbatim (2026-11-24): "i can see that at minimum those that are not running in separate neighbouring sessions will never be dealt with? if so why not? should it not be part of /day?" and "I really don't want to be in the loop and I trust you to do it well."

**Situation:** A session that cannot close its worktree slot writes a hold (`git-ops.sh hold`, P1519) saying why it stays open and who unblocks it. `tidy` (P1450) never removes or parks a held slot, and P1705 made every teardown caller keep one. A hold owned by `founder` never expires (P1519 Known limitations: "the founder un-blocks it"). Holds appear in the SessionStart report, in teardown messages and in `tidy --all`, and none of these asks the founder anything.

**Complication:** On 2026-11-24 the repo had 23 worktrees, and 17 of them had no live session. `/day` asked the founder about none of them:

- `/day`'s stranded-work scan (`day-cp.md`, `=== STRANDED SPECS ===`) keys on spec state: in-progress, qa, parked, done-but-unmoved specs and ship journals. It has no view of holds. Of the 17 held slots, 9 had no spec on main at all (embargoed fixes and design explorations) and none of the rest had a `qa` spec, the only state that becomes a founder question.
- `/day` runs `archive-spec --finish-pending` through `tail -1`. It printed `0 of 6 pending archive(s) finished`. All six were blocked by a hold. The reasons were in the lines the tail dropped, and `archive-spec`'s own error blamed "uncommitted changes".

Each hold note was re-checked by command on 2026-11-24. **11 of the 17 notes were stale:**

| Shape | Slots | What the note said | What was true |
|---|---|---|---|
| Branch fully on main, spec closed | 4 (P1608, P1611, P1647, P1665) | "founder decides whether to ship", "owed: review" | Every commit on main by patch-id, every spec in `features/done/`. `tidy` removed them once the hold was gone; 2 needed a `--confirm` for untracked screenshots and test output, copied to `.private/` first |
| Embargoed spec already archived | 6 (P1661, P1662, P1664, P1689, P1691, P1692) | "retained until archive-spec runs after the push" | Specs archived and proven off-machine. Only the hold stopped `archive-spec --finish-pending` |
| Fix live, spec waiting | 1 (P1494) | "built, awaiting founder /verify and /ship", written 2026-11-02 | Code on `origin/main` since 2026-11-02, both migrations in the prod manifest. Nobody asked for 22 days |

Of the remaining six, four needed a founder call and two were live sessions' own holds. One of the 11 stale notes (P1665) still carried an open product question ("adopt or discard the /tree/landing-fable mockup") although its work and spec were closed. A rule that releases on proof alone would have dropped it.

**Question:** How does `/day` keep holds true without the founder? It should release the ones a command proves finished, carry forward any product question they still name, and turn the rest into one question each, at a set age.

## Appetite

Blast radius: medium. It adds two commands that end or rewrite another session's hold, and a wrong release lets a later `tidy` or `archive-spec` remove a worktree. Reversibility: git revert for the code. A released hold is copied byte for byte before release. A worktree removed after release is recoverable only for committed content, which is why untracked files keep their founder yes/no (P1450 founder option A). Decision density: zero open. The founder approved the direction on 2026-11-24 ("yes to all", "should it not be part of /day"). The thresholds are set by the agent (below).

## Invariants

- **Only `/day` ends another session's hold.** Generic `git-ops.sh tidy` keeps treating a valid hold as KEEP, unchanged. The new release and re-ask commands are run by the `/day` step, never by `tidy`, `ship`, `park` or `archive-spec`.
- **A release needs proof AND a reading of the reason.** The command refuses unless a proof below holds. The `/day` agent reads the hold's reason first. If the reason names a product question that is still open, the question is filed before the hold is released. When the agent cannot tell, the hold is treated as open and asked about.
- **Compare-and-swap on the hold.** Release and re-ask take the hold's content hash as `--expect`. If the file changed since it was read, they refuse. A slot that is LIVE, or that anything wrote to within the idle window `tidy` uses, is refused at execution time, not only when the list was built.
- **The hold text survives its release, losslessly.** The `.hold` file is copied into the git common dir's hold archive and verified (byte compare) before the original is removed. A recovery-log line names the copy. If either write fails, the hold stays.
- **Release is not removal.** After a release the existing `tidy` and `archive-spec --finish` rules decide the slot, unchanged: files that exist nowhere else still go to the founder as one yes/no line (P1450 item 5).

## Solution

1. **`git-ops.sh holds`: read-only list.** One line per held slot (tab-separated, no shell metacharacters; see `shell-safety.md`) with: slot, P-number, branch, owner, hold age in days, re-ask time if set, hold hash, liveness (`live` / `active` / `idle`), the slot's spec state on main (`open`, `qa`, `closed`, `archived`, `none`), and one proof field:
   - `landed`: `tidy`'s landed evidence holds for the branch **and** the slot's spec is closed on main (`features/done/`). Requiring the closed spec rules out an empty or never-started branch (an ancestor of main reads as merged) and a ship that was later reverted, because `/ship` closes the spec.
   - `archived`: the slot's archive manifest exists in `.private/features/done/`, the branch tip equals its `branch_tip`, and `archive_offsite_check` passes. The manifest is written only after `archive-spec`'s first half has checked the branch.
   - `none`: anything else.

   It also computes `due`. Holds owned by `founder` or `pNNNN` are due once their re-ask time has passed, or 7 days after `WRITTEN_AT` when none is set. Date-owned holds keep P1519's meaning: they expire on their date and are never listed as due.

2. **`git-ops.sh hold-release <slot> --expect <hash> --proof landed|archived`** recomputes the proof, the liveness and the hash, copies and verifies the hold, logs it, then removes it. **`git-ops.sh hold-reask <slot> --expect <hash> --until <YYYY-MM-DDTHH:MMZ> --note "<text>"`** keeps the owner and reason, appends the note, and sets `REASK_AT`. Neither takes a nonce. They act only on a slot that is not LIVE and idle, the same authority `tidy` has to remove that slot. Both are refused on a LIVE or active slot, a changed hash, or a failed proof. This narrows P1705's "no command ends a hold except `hold --clear`" for these two commands only.

   *Build note (/dev, 2026-11-24):* `hold-release` also takes `--proof answered`, used only for the founder's "put it away" answer (Solution 3). A due hold has no proof by definition, so the founder's answer is the authority. Every other check (hash, LIVE, idle, readable) still applies.

3. **A new `/day` step before the tidy pass** (`day-cp.md` § 4, registered in `day-cp-steps.tsv` so `check-sync` covers it):
   - For each idle hold with a proof: the agent reads the reason. If it names an open product question, it files that question with `/note` (due in 14 days) **before** releasing. Then it runs `hold-release`.
   - For each due hold without a proof, it records one finding under the existing finding contract. The fault key is `hold:<pN or branch slug>`, the body states the hold hash, and the options are:
     - `keep="Keep it open two more weeks"`, which runs `hold-reask --until <today+14d>`.
     - `putaway="Put it away; the branch is kept"`, which runs `hold-release`. The next tidy then parks a clean slot, or asks a separate yes/no about files that exist nowhere else.

     The agent recommends one with fit, risk and evidence. `putaway` is not the board's Park, and the "never recommend park" rule is unaffected. A due hold whose spec is `qa` on main gets no card, because the existing `spec:qa` card already asks. Answers are applied with `--expect` set to the hash in the card, so an answer to a hold that has since changed is refused instead of applied.
   - What it released and why goes in the step's attest evidence, not as a founder line (P1399).

4. **Archive reasons surface, and archives finish in the same run.**
   - `archive_finish` says "on hold" when the teardown kept the worktree for a hold, instead of "holds uncommitted changes".
   - `archive_finish_pending` prints one plain line per unfinished archive with its reason.
   - `/day` drops the `tail -1` and runs `archive-spec --finish-pending` again after the new step, so an archive whose hold was just released finishes the same day.
   - An unfinished archive whose reason is anything other than "waiting for the nightly backup" becomes a finding.

5. **Bring today's dated holds onto the new scheme.** On the day of the build, the w1 and w9 holds (owner `2026-12-08T00:00Z`, the founder's chosen re-ask date) are rewritten to owner `founder` with `REASK_AT=2026-12-08T00:00Z`, if they still exist. Without this, the date expires and `tidy` parks them without asking.

**Thresholds, decided by the agent, UNTESTED:** due after 7 days, the same as P1450's park threshold. Within a week the owning session or the founder usually comes back to the slot. Past that, 11 of 17 notes were stale on 2026-11-24. "Keep" re-asks in 14 days. Both are one variable each. Falsifier: if over a month more than half of the due questions are answered "keep", 7 days is too early and moves to 14.

## Rulings carried

- **P1519 (Known limitations): "A founder-owned hold never expires (founder decision: the founder un-blocks it)."** Narrowed with founder approval 2026-11-24. A founder hold still never expires on its own. It ends only by proof plus a reading of its reason (Solution 3), or by the founder's answer to a due question. P1519's invariant "only the session's own slot" governs its Stop-hook check, which this spec does not touch.
- **P1705 (`teardown_worktree_if_clean`): "no command ends a hold except `hold --clear`."** Narrowed: `hold-release`, run by `/day` under the Invariants above, also ends one.
- **`hold`'s nonce ("another session must not be able to write or clear one").** Kept for `hold`. The two new commands replace the nonce with liveness, idleness and hash checks done at execution time. That is the authority `tidy` already uses to remove an idle slot, and it guards against the same live-session risk.
- **P1450 item 5:** agents clean up; the founder answers in plain options, never a shell command. Kept: file-loss questions stay yes/no, and the hold question is a two-option card.
- **P1450 item 7: park threshold 7 days, decided by the agent.** Reused.
- **decisions.md (Day board, founder notes):** "Who am I to decide if this is a real problem? … you should be deciding." Hence proven releases are automatic and every question carries a recommendation.
- **private ruling 2026-11-02 (P1494):** the prod check must pass before `archive-spec p1494`. Met on 2026-11-24: prod smoke 12 passed, 0 failed.

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| A session writes a new hold between the list and the release | MITIGATE | `--expect` hash compared at execution, plus liveness and idle re-check. A session writing a hold stamps activity, so the slot reads active |
| The landed evidence is wrong (P1450: both oracles are individually wrong on this repo) | MITIGATE | Also requires the closed spec. Canary with an empty branch whose tip is an ancestor of main and an open spec: proof `none` |
| A reason carries an open product question (P1665) | MITIGATE | The agent reads it, files a `/note` before release, and asks when unsure |
| `archive_finish` deletes the branch by name and does not re-check liveness | DEFER | Exists today, independent of holds. Filed to the task inbox |
| `archive-spec` refuses a branch whose early commit holds a test version later superseded on main (P1494 needed a rebase) | DEFER | Separate defect in the per-commit check. Filed to the task inbox |
| A dated hold expires and `tidy` parks the slot unasked | ACCEPT | P1519's defined meaning of a date owner. Re-ask dates now use `REASK_AT` on a founder hold (Solution 5) |
| A slot something still points at (a terminal tab or dev server with its cwd inside, a live lock PID) never reads idle, so its hold is never released or asked about | ACCEPT | The founder's framing excludes live sessions. `holds` prints such slots as `live`/`active`, so they stay visible |
| A hold the classifier cannot read (no OWNER, malformed WRITTEN_AT) | MITIGATE | `holds` prints it as `unreadable` with proof `none`. Never released, and always due, so the founder sees it |
| The recovery-log append check reads the last line, so a concurrent append can fail it falsely | ACCEPT | Fails closed: the hold stays and the run reports it |

**Non-Goals**
- Do NOT change `tidy`'s verdicts, the P1519 Stop hook, the slot liveness classifier, or `hold`'s owner set and nonce.
- Do NOT auto-remove a worktree with files that exist nowhere else.
- Do NOT answer product questions. Adopt, iterate or discard stays with the founder.
- Do NOT rewrite the SessionStart report.
- Do NOT add a new board, page or table.

## Done-When

Each fixture asserts the hold file's bytes, the branch ref, the worktree directory, the log and the archive copy. Clocks are set through an injectable "now".

- [ ] `holds`: a founder hold on a branch whose commits are on main by patch-id, spec closed, reads proof `landed`. **Control:** the same with the spec open reads `none`. An empty branch (tip is an ancestor of main) with an open spec reads `none`
- [ ] `holds`: an archived-embargo slot with matching manifest, tip and proof reads `archived`. **Controls:** a moved tip, a missing proof and a stale proof each read `none`
- [ ] `holds`: due at 7 days 0 minutes and not due at 6 days 23 hours. With `REASK_AT` passed, due. With `REASK_AT` in the future, not due. A date-owned hold is never listed as due
- [ ] `hold-release`: proven, idle and hash matching, so it releases. The archive copy is byte-identical and the log names it. **Controls**, each refused with the hold unchanged: LIVE slot, active slot (written within the idle window), wrong `--expect`, proof `none`, archive dir unwritable
- [ ] `hold-reask`: sets `REASK_AT` and appends the note while keeping owner and reason. Refused on the same controls
- [ ] `archive-spec --finish-pending` on a held archived slot: the final error line for that archive says "on hold" (today's `die` text says "uncommitted changes", and the control run against main's copy shows it). After `hold-release`, the next run finishes it
- [ ] `holds` on an unreadable hold (no OWNER) prints `unreadable`, proof `none`, due. `hold-release` refuses it
- [ ] Gate 7: with the hash compare removed, the wrong-`--expect` control fails (exit code pasted). With the closed-spec condition removed, the empty-branch control fails. With the due computation forced to `no`, the 7-day case fails (exit codes pasted)
- [ ] Gate 7c: the existing suites pass unchanged: `test-p1450-tidy.sh`, `test-p1450-strandings.sh`, `test-p1519-slot-closure.sh`, `test-p1705-worktree-holds.sh`, `test-p1507-archive-spec.sh`, and `"$DAY_STEP" check-sync` (the runner lives at `~/.claude/scripts/day-step.sh`), whose control deletes the new step from the real `day-cp.md` and must fail (gate 7d)
- [ ] The new `/day` step text, run by hand against fixtures, produces one `hold:<key>` finding per due hold with the two options and a recommendation, none for a hold whose spec is `qa`, and a `/note` filed before releasing a proven hold whose reason names an open question
- [ ] Live run on the day of the build, pasted: `holds` output for every held slot, and w1/w9 rewritten per Solution 5 if they still exist. Live slots are untouched, and every release made is named with its proof. If no slot is due or releasable that day, it says so, and the fixture runs above are the evidence

## Alternatives Considered

- **Release moot holds inside `tidy --apply`.** First draft, rejected in review. Every caller of `tidy` (not only `/day`) would end other sessions' holds. Bash cannot tell whether a free-text reason still carries a product question. And `tidy` runs after `/day`'s archive step.
- **Expire every founder hold after 7 days.** Rejected: age is not proof. A real open question (the P1701 video placements) would silently become a removable slot.
- **Re-ask with a date owner** (what was done by hand on 2026-11-24). Rejected: a date owner expires, and `tidy` then parks the slot without asking. `REASK_AT` on a founder hold keeps it held until asked.
- **Leave it to the owning session (P1519's Stop hook).** Rejected: the 17 slots are exactly the sessions that ended without resolving it. P1519's own Risks table hands them to `/day`.
- **Ask about every held slot every day.** Rejected: a repeated question already answered is noise. Hence the 7-day threshold and the re-ask date.

## Rollback Strategy

Revert the commit. `REASK_AT` lines left in `.hold` files are ignored by the old code (it reads only REASON, OWNER and WRITTEN_AT). Released holds are in the hold archive and can be restored with `cp` into the slot if it still exists. Removed worktrees follow P1450's recovery path.

## Related

P1519 (holds, Stop hook) · P1705 (teardown keeps held slots) · P1450 (`tidy`, recovery log) · P1246 (strandings report) · P1507 (`archive-spec`) · P1169 (`/day` stranding scan) · P1399 (day report)
