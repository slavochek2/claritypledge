---
status: all-done
type: bug
rank: 342
severity: high
workstream: infrastructure
date_reported: '2026-11-16'
created_date: '2026-11-16'
tags: [git-ops, ship, journal, data-loss]
disclosure: public
pipeline_ran: [create-spec, fix, ship]
drafted_by: fable
exec_model: opus
exec_effort: high
driver: anomaly
completed_at: 2026-11-17
---

# P1694: Ship records a commit as landed without applying it

## Problem

**Situation:** `git-ops.sh ship` lands a branch one commit at a time and writes each landing to a
journal. When a pick fails, the tool decides whether the commit was "already applied" by searching
the text git printed for the words `empty`, `nothing to commit` or `already been applied`. On a
match it skips the pick and records main's current tip as that commit's landing.

**Complication:** The text it searches also holds the commit's subject, the paths git names, and
whatever the pre-commit hook printed. On 2026-11-16 the 38-commit P1631 ship lost two commits this
way. Both subjects contain the word "empty" ("honest empty and capped states", "works in an empty
thread"), both picks hit a real conflict, and both were recorded as landed at the previous commit's
sha (the first in the same second the previous commit landed). One carried a migration. They are the only two
commits of the 38 whose subject contains a trigger word. The operator noticed only because the
next commit conflicted against the gap ([decisions.md](../../../docs/decisions.md) 2026-11-16 [process],
"A per-commit ship can drop commits silently").

When the following commits do not depend on the dropped one, nothing conflicts: the ship closes the
spec, deletes the branch and prints "Ready to push" with the change missing from main.

**Question:** How does the tool decide that a pick needs no commit, so that a commit is never
recorded as landed unless it was applied or git itself holds the pick empty?

## Appetite

- **Blast radius:** every ship. A wrong record deletes the branch that holds the only copy and
  tells the operator to push.
- **Reversibility:** the fix is a script change, undone by reverting one commit. A dropped commit
  is recoverable only while its branch or its objects still exist.
- **Decision density:** zero founder decisions.

## Root Cause

**CONFIRMED** by reproduction, and matched against the incident's own journal.

The pick loop in `cmd_ship` treats a failed pick as already applied when a case-insensitive search
of git's combined output matches `empty|nothing to commit|previous cherry-pick is now empty|already
been applied`. Git prints the commit subject in `error: could not apply <sha>... <subject>` and the
path in `CONFLICT (content): Merge conflict in <path>`, and on `--continue` the same variable also
holds the hook's output. Replaying the incident in a throwaway clone (main at the previous landing,
pick of the first dropped commit) prints a conflict on `supabase/deploy-manifest.json`, and the only
line the search matches is the `could not apply` line carrying the subject.

Nine paths record a landing with the change, or part of it, absent from main. Each was reproduced
in a hermetic repository and is a scenario in `scripts/test-git-ops-ship.sh` (AF-a to AF-e, AF-i to
AF-k, AF-o, AF-p):

| # | Path | What is lost |
|---|------|--------------|
| a | A fresh pick conflicts; the subject contains a trigger word (the incident) | the commit |
| b | A fresh pick conflicts; a conflicted path contains one (`EmptyState.*`) | the commit |
| c | `--resume` continues a paused pick; the hook rejects the commit and prints a trigger word | the commit and the operator's staged resolution |
| d | Git refuses the pick over an untracked file whose name contains a trigger word | the commit |
| e | The spec add/add auto-resolve runs `--continue`, and on any failure `--skip`; the commit also carries other files and the hook rejects it | the commit's other files |
| i | A pick is paused; another session unstages its files from the shared index as "bystanders"; `--resume` finds the index equal to HEAD | the commit; its files stay in the working tree, uncommitted |
| j, k | The same with only some of the files unstaged; `--continue` commits what is still staged | the unstaged file's change (an added file, or the operator's resolution) |
| o | As j, with the added file force-added on the branch and matched by `.gitignore`: a plain `git status` does not show it once unstaged | the added file |
| p | As j, on a resume while the branch's spec is still an add/add conflict: the working-tree check was skipped whenever any path was unmerged, and the spec auto-resolve then committed what was staged | the unstaged file's change |

Path (e) needs no trigger word: the skip is unconditional after a failed continue. Paths (i) to (k)
are not the word search either: git reports the pick empty, or commits it, from an index that no
longer holds what the operator staged. Path (i) was found while testing the fix, (j) and (k) in
code review, (o) and (p) in the third review round, against the round-2 fix.

Three candidate paths were disproved: the operator running `git cherry-pick --continue` by hand
before `--resume` (refused with the verify-then-record recipe, P972); a kill between the commit and
the journal write (same refusal; `scripts/test-p972-resume-cherry-pick-head.sh` Z2); and
`--mark-landed`, which records only what the operator names and matches nothing by itself.

## Invariants

- **A pick is recorded as landed only when main gained a commit for it, or when git holds the pick
  empty.** Empty is read from the repository (the paused pick is this commit, nothing is unmerged,
  the index equals HEAD), never from words in any output.
- **A paused pick is continued only when the working tree agrees with the index for the files the
  commit changes.** What is staged is taken as the whole resolution.
- **No stop tells anyone to discard an edit.** A difference the operator did not make may be
  another session's work.
- **A stop names the source commit, leaves it pending in the journal, and never prints "Ready to
  push".**
- `--skip` runs only on a pick git holds empty. `--abort` and `--quit` stay unused (P972).
- Author identity, subject and patch-id never drive a journal write (decisions.md 2026-06-28).
- The journal's fields keep their shape. No field is added.

## Solution

1. **Read "empty" from git's state.** After a failed pick or continue, the pick is empty when
   `CHERRY_PICK_HEAD` names this commit, no path is unmerged, and the index equals HEAD. This is the
   condition git itself applies before it refuses an empty commit. The word search is removed.
2. **On `--resume`, check the working tree before continuing.** If a file the commit changes
   differs between the index and the working tree (untracked and git-ignored files count), the ship
   stops before `--continue`, with nothing committed. It prints the status lines and two ways
   forward: stage the differences if they are the resolution; if they are another session's edit,
   save it as a patch outside the repository (or move the file out when it has no staged copy), put
   the staged version back, resume, and apply the patch (or move the file back). Never copy the old
   file back: a later commit of the same ship may have changed it. The check runs on every resume of
   a paused pick; unmerged paths are only left out of it, for `--continue`'s conflict diagnostic and
   the spec add/add auto-resolve. A failed read counts as a difference.
3. **The spec add/add auto-resolve commits what it staged.** It skips only when git holds the pick
   empty. If the commit fails, the pick stays paused with the resolution staged, and the normal
   conflict stop is printed.
4. **A net under every record in the pick loop.** One recording step compares main's tip with the
   tip from before the attempt. Main unchanged and no empty pick proven: stop, name the commit,
   record nothing.
5. **Name every record made without a new commit.** One output line per such commit, so a landing
   sha shared by two journal entries is always a stated event.
6. **A failed `--skip` is not swallowed.** If an empty pick is still paused after `--skip`, the
   ship stops before recording it.

### States in which main legitimately does not advance for a pick

| State | Example | Git's state |
|-------|---------|-------------|
| The change is already on main | the same fix landed by another route; a branch-born spec's creation commit after the seed | paused pick, nothing unmerged, index equals HEAD |
| The add/add auto-resolve keeps main's spec and the commit holds nothing else | the suite's HH fixture | same, after the resolve |
| The operator's staged resolution leaves main as it is | P972's net-empty resolution | same at `--resume`, and the working tree matches for the commit's files |
| `--mark-landed` | the operator records a landing by hand, possibly many sources at one commit | not a pick; untouched |

The first three are one git state, which is what item 1 tests. Every failure in the Root Cause
table has unmerged paths, a staged difference, no paused pick, or (paths i to k) a working tree
that differs from the index, so none of them passes.

### Alternatives considered

- **Refuse on `--resume` when an entry's landed sha equals the previous entry's** (the 2026-11-16
  proposal). Rejected as the test: a correct ship produces equal shas in every state above, and the
  2026-11-16 recovery itself recorded many sources at one commit with `--mark-landed`. In the
  reproduction of path (e) the dropped entry and a legitimately empty one are identical in the
  journal. The decision has to be made when the pick ends, while git's state is still there.
- **Compare branch-only files on main with the branch tip before "Ready to push".** Rejected as a
  refusal: operator resolutions, other sessions' commits during a long ship and withheld paths make
  a correct ship differ. decisions.md 2026-10-27 (P1450) measured every after-the-fact "has this
  landed" check wrong.
- **Keep the word search, anchored to git's exact sentences.** Rejected: a hook can print the same
  sentence, and the wording depends on git's version and locale.
- **Compare the landed tree or patch-id with the source commit.** Rejected in P972: a
  conflict-resolved landing legitimately differs from its source.

## Landing

This branch edits `scripts/git-ops.sh`, and a branch that does cannot ship itself (decisions.md
2026-10-27, P1450). The main session lands the code with `git-ops.sh commit-to-main`: the changes
to `scripts/git-ops.sh` and `scripts/test-git-ops-ship.sh`. The branch is then rebuilt to carry
only this spec and ships normally.

No journal field changes shape, so a journal written before the fix resumes under the fixed tool
unchanged. P1689 (held, not on main) also edits `scripts/git-ops.sh`, in the embargo classifier,
`cmd_park` and just before "Ready to push". This fix touches only the journal helpers and the pick
loop.

## Risks / Non-Goals

| Risk | Label | Note |
|------|-------|------|
| A correct `--resume` is stopped: a file the paused commit changes carries an unrelated unstaged edit (another session's, or kanban edits to the spec) | ACCEPT | The one way this fix can stop a correct ship, on any resume of a paused pick. Git's state is the same as in paths (j) and (k), so the two cannot be told apart. The stop commits nothing, lists the files and gives a way forward that keeps the edit (AF-m follows it). The alternative is a silent drop. |
| `--skip` on an empty pick discards whatever another session staged between the emptiness check and the skip (measured: a staged new file is deleted, a staged edit reverted; `--quit` keeps both) | DEFER | The window is milliseconds and predates this fix. `--quit` closes it, and is banned by the P972 invariant; unblocked by the founder allowing `--quit` for a pick already held empty. |
| A git version that reports an empty pick without leaving `CHERRY_PICK_HEAD` would make a correct ship stop | ACCEPT | The stop is loud and recoverable; AF-f and HH go red on such a git. Verified on git 2.54. |
| Another session's commit landing on main inside one pick's window hides a non-advance from the net | ACCEPT | The paths that produced a non-advance are closed by items 1 to 3; raw commits to main during a ship are already banned. |
| A keep-main resolution on `--resume` still records without proof the change is on main | ACCEPT | It is the operator's decision (P972). It is now named in the output. |
| Earlier ships may have dropped a commit the same way | DEFER | Checked for the subject route over the 84 ships in the shipped-tips record (since 2026-10-27): 15 commits with a trigger word, 13 have their commit on main, the 2 missing are P1631's. Paths, hook output and older ships are unchecked; unblocked by a decision to audit them. |

**Non-Goals:**

- Do NOT add or rename a journal field.
- Do NOT add a content comparison that can refuse a ship.
- Do NOT change `--mark-landed`, the crash-window refusal, the embargo classifier or the closing
  phases.
- Do NOT touch the "Ready to push" block.

## Known limitations

The accepted and deferred risks above are limitations too; these are the rest.

- Entries a pre-fix tool already recorded are not re-examined on `--resume`.
- The working-tree check runs on `--resume` only. A fresh pick is computed by git from HEAD and
  the commit, and git refuses to start one over a staged difference.
- An intent-to-add entry (`git add -N`) reads as equal to HEAD in the emptiness test. On a file
  the paused commit changes, the working-tree check stops on it; elsewhere it changes nothing.
- The working-tree check reads the commit's paths in batches of 200, so a commit touching
  thousands of paths costs several `git status` runs.
- Submodules, sparse checkouts and git versions other than 2.54 are untested.
- The spec add/add auto-resolve (`--ours`) overwrites an unstaged edit to the spec in the working
  tree. This predates the fix and is unchanged.
- Leftover status lines print paths as git gives them, inside the diagnostic markers, as the existing
  conflict diagnostic already does; a path containing a shell redirect character reaches the output.
- The net under every record compares main's tip before and after one pick. A pick that claims
  success without committing while another session commits to main in the same window passes it;
  only a stand-in git produced that, and raw commits to main during a ship are already banned.

## Done-When

- [x] AF-a to AF-e and AF-h to AF-l fail on behaviour against the unfixed tool and pass against the
      fixed one: each stops with the commit named and pending, and lands it on `--resume`.
- [x] AF-f, AF-g and AF-m (states the unfixed tool already handles correctly) pass on both tools:
      the two legitimate no-new-commit states ship, and another session's unstaged edit is never
      committed or destroyed.
- [x] AF-n: a commit recorded without a new commit is named by its sha in the output.
- [x] AF-o and AF-p (paths o and p) fail on behaviour against the round-2 tool and pass against the
      fixed one. AF-q: a failed working-tree read stops the resume (a mutant that reads it as clean
      goes red). AF-r and AF-s follow the stop's second route where a later commit changes the same
      file and where the file has no staged copy, and land with the other session's edit kept.
- [x] `scripts/test-git-ops-ship.sh` passes in full (exit 0, 102 PASS lines).
- [x] `scripts/test-p1464-ship-embargo.sh` and `scripts/test-p972-resume-cherry-pick-head.sh` pass.
- [x] A control run of the suite against the unfixed `git-ops.sh` goes red in AF (exit 1, 83 PASS
      lines, then 16 AF scenarios failed: 15 on behaviour, AF-n on the new output line).
- [x] The journal written by the fixed tool has the same fields as before.

## Related

- [P972](p972_git_ops_ship_resume_repicks_landed_commit.md): `--resume` continues a
  paused pick; crash-window refusal; net-empty resolutions.
- [P1082](p1082_ship_discard_kanban_edits_clobbers_conflict_resolution.md): a
  staged resolution wiped before `--continue`. Its "verify the empty branch before recording" idea
  was left unimplemented (decisions.md 2026-08-17).
- [P1198](p1198_ship_resume_ignores_commits_added_after_journal_init.md): a ship
  lands only what its journal planned.
- decisions.md 2026-11-16 [process], 2026-06-28 [process] (P972), 2026-08-14 [technical] (P1082),
  2026-10-27 [process] (P1450).
