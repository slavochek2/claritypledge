---
status: in-progress
type: task
rank: 28
workstream: infrastructure
created_date: '2026-10-13'
tags: [pre-commit, agent-skills, fail-closed, gates]
disclosure: public
intent: cold-start
delivery_stage: dev
pipeline_ran: [create-spec, dev]
drafted_by: opus
exec_model: sonnet
exec_effort: medium
driver: anomaly
---

# P1472: The agent-skills sync gate fails open: a missing script skips it, a failed step reports OK, and its hint stages a bare directory

## Problem

Filed cold from agent-written task-inbox notes. There was no founder conversation to quote.

**Situation:** `scripts/pre-commit-checks.sh` check 22 (P1151) verifies that the generated
`.agents/skills/` mirror matches `.claude/commands/slava/**`. It does this by calling
`scripts/sync-agent-skills.sh --check [--staged-only]`.

**Complication:** There are three defects in the same gate, and each one lets a commit through that
nobody verified, or pushes the operator toward a banned command:

1. **A missing callee skips the gate.** `pre-commit-checks.sh:2211` wraps the gate in
   `if [ -f "./scripts/sync-agent-skills.sh" ]`. If the file is absent, or is a dangling symlink, the
   `else` branch at `:2233` prints `⚠ scripts/sync-agent-skills.sh not found — skipping agent-skills
   sync gate` and **the commit proceeds**, with `ERRORS` left unchanged. "Cannot run" and "ran and
   passed" produce the same result. Worktrees hydrate `scripts/` as a native checkout, so a slot whose
   checkout is incomplete or mid-`git checkout` takes exactly this path.
2. **The checker reports OK after its own steps fail.** `sync-agent-skills.sh` runs under `set -u`
   only (`:50`). If `mktemp -d` fails at `:79`, `WORK` is empty, every intermediate write goes to
   `/candidates.tsv`, `/drift.txt` and similar paths and fails, and the script still reaches `:365`
   and exits 0. Reproduced on main on 2026-10-13:
   `TMPDIR=/nonexistent-dir-xyz ./scripts/sync-agent-skills.sh --check` printed
   `sync-agent-skills --check: OK —  skills in sync, 0 collisions, 0 drift` (note the empty count)
   and returned **exit 0**. Control: the same command with a normal `TMPDIR` printed `OK — 128 skills
   in sync` and also exited 0. So the failed run is indistinguishable from the good one by exit code.
3. **The failure hint tells the operator to stage a bare directory.** `pre-commit-checks.sh:2229`
   prints `→ Run ./scripts/sync-agent-skills.sh (no flag) to regenerate, then re-stage .agents/skills/`.
   Staging a bare directory is banned by `.claude/rules/git.md`, because it can sweep in another
   session's mirror edits. The hint also never says that the regenerated mirror file must be added to
   `git-ops.sh commit-to-main --files`. Without it, commit-to-main's exact-set check refuses the commit,
   which happened in the P1300 session.

**Question:** How do we make the gate fail closed when it cannot run, make the checker fail closed
on an internal failure, and make the hint name exact files?

## Appetite

- **Blast radius:** every commit in every checkout runs this gate. A wrong fail-closed condition
  blocks all commits; a wrong fail-open condition is the current state.
- **Reversibility:** `git revert` of two shell files.
- **Decision density:** zero founder decisions. Every choice below is an engineering call.

## Invariants

- **The gate verifies only, and never regenerates before checking.** This is the rule in the
  existing header comment at `pre-commit-checks.sh:2195-2210`: regenerate-then-check is vacuous by
  construction. The fix must not add a regenerate step on either path.
- **Scoping stays per-commit (`--staged-only`, P1284).** A co-tenant's unstaged skill edit must not
  fail an unrelated commit. The fix must not widen the check back to the whole working tree.
- **The `--staged-only` support probe stays** (`:2224`, anchored on the case arm). Worktrees whose
  branch predates P1284 still need the repo-wide fallback.

## Solution

1. **Gate (`pre-commit-checks.sh` check 22):** if `./scripts/sync-agent-skills.sh` is missing, is
   not a regular readable file, or is a dangling symlink, **fail** the hook (`ERRORS+1`). Print a
   message that names the path it looked for, says the gate could not run, and says how to restore
   the file. Do not keep any path where an absent callee lets the commit through. If a real skip is
   ever needed (a branch that predates the script), it must be keyed on something explicit, never on
   the file being absent. Today no such branch is known, so do not add one.
2. **Checker (`sync-agent-skills.sh`):** fail closed on any internal failure. At minimum: exit
   non-zero with a message when `mktemp -d` fails, and make any failed intermediate write or read in
   check mode exit non-zero before the OK line can print. Use `set -euo pipefail` or explicit
   checks, whichever the implementer can prove does not change the outcome of any existing test case
   (gate 7c). The OK line must never print with an empty or zero skill count when skills exist.
3. **Hint:** on failure, list each drifted `.agents/skills/<name>/SKILL.md` from the `--check`
   output (the `DRIFT_*:<name>` lines). Tell the operator to regenerate, `git add` those exact paths,
   and add them to `git-ops.sh commit-to-main --files`. Remove the bare-directory instruction.

## Alternatives Considered

- **Keep the skip but print it in red.** Rejected. A warning on a passing hook is still a pass, and
  that is the defect.
- **Have `commit-to-main` handle the mirror path automatically.** Out of scope here. If it ever does,
  the `--files` sentence in the hint can be dropped.

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| `set -e` changes behaviour on an existing intentional non-zero (e.g. a `grep` that finds nothing) | MITIGATE | Run `scripts/sync-agent-skills.test.sh` before and after; every existing case must keep its result. Prefer explicit checks where `set -e` would misfire |
| A worktree with an incomplete `scripts/` checkout now blocks commits | ACCEPT | That is the intended behaviour. The message names the recovery (`git checkout -- scripts` inside the worktree, per `.claude/rules/git.md`) |
| The hint parses `DRIFT_*` lines and a new drift kind has no name field | MITIGATE | Fall back to printing the raw drift lines rather than nothing |

**Non-Goals**
- Do NOT change what counts as drift, or the `--staged-only` scoping.
- Do NOT add a regenerate step to the hook.
- Do NOT change `git-ops.sh commit-to-main`.
- Do NOT touch the other pre-commit checks, even ones with a similar `[ -f … ] || skip` shape. List
  any you notice in the ship notes for a follow-up instead.
- Do NOT edit `.claude/rules/**` or `CLAUDE.md`.

## Rollback Strategy

Revert the commit. Both files are self-contained and nothing else reads their output format except
the hook itself and `scripts/sync-agent-skills.test.sh`.

## Done-When

- [x] Script moved aside (`mv scripts/sync-agent-skills.sh /tmp/` in a worktree), then
      `bash scripts/pre-commit-checks.sh` with a skill file staged exits **non-zero**, and the output
      names `scripts/sync-agent-skills.sh` as unable to run. Script restored and the same run passes.
      Paste both exit codes (gate 7).
      *Evidence (dev, 2026-10-14):* moved aside with `dev.md` + its mirror staged → `EXIT=1`,
      `✗ Agent skills sync (P1151) could not run: ./scripts/sync-agent-skills.sh is missing, unreadable,
      or a dangling symlink`; restored → `EXIT=0`. Method below.
- [x] Same as above, but with the script replaced by a dangling symlink: the hook exits non-zero.
      *Evidence:* dangling symlink → `EXIT=1`, same message. Suite case H2: `ERRORS=1`.
- [x] `TMPDIR=/nonexistent-dir-xyz ./scripts/sync-agent-skills.sh --check` exits **non-zero** and
      does not print `OK`. This is added as a must-fail case to `scripts/sync-agent-skills.test.sh`.
      *Evidence:* `EXIT=3`, `INTERNAL ERROR — cannot create a scratch directory under
      /nonexistent-dir-xyz`, `OK-lines=0` (before: exit 0, `OK —  skills in sync`). Suite cases
      G1 (nonexistent), G2 (unwritable, chmod 555), G3 (`git diff --cached` failing under
      `--staged-only`) all assert exit 3 and no OK line; all three failed against the unfixed script.
- [x] `bash scripts/sync-agent-skills.test.sh` passes, with every pre-existing case giving the same
      verdict as before the change (record the before/after case list).
      *Evidence:* before `63 passed, 0 failed`; after `90 passed, 0 failed`. `comm -23` of the
      before/after PASS-line lists is empty: all 63 pre-existing cases kept their verdict; 27 new.
      `scripts/test-precommit-sas-flags.sh` (P1293, extracts the flag probe): 16/0 before and after.
- [x] With a skill source edited and its mirror stale, the hook's hint prints the exact
      `.agents/skills/<name>/SKILL.md` path and the `--files` instruction, and does not contain the
      string `re-stage .agents/skills/`.
      *Evidence:* `EXIT=1`, hint `git add .agents/skills/dev/SKILL.md` and `add the same paths to
      git-ops.sh commit-to-main --files`; `grep -c "re-stage .agents/skills/"` = `0`. Suite H3
      (synthetic) and H4 (gate 7d: a COPY of the real shipped mirror `abandoned-points/SKILL.md`,
      hand-edited and staged) both assert the exact path.
- [x] A normal commit with an in-sync mirror still passes check 22 (no false positive).
      *Evidence:* real skill `dev.md` edited, regenerated, source + mirror staged → `EXIT=0`. Check 22
      against this worktree's real index → `EXIT=0` (suite H6). Real tree `--check` and
      `--check --staged-only` → `OK — 128 skills in sync`, exit 0 (suite G4 matches the count against
      the SKILL.md files on disk). Regenerate mode on a fresh copy of the real tree: exit 0, 0 files
      changed.

**Method (the hook cannot be run by name from an agent session).** Check 22 is extracted verbatim
from `pre-commit-checks.sh`, from its `# 22. Agent-skills sync gate` header to the
`# Codex lifecycle-hook gate` header, sourced after the real `scripts/lib/run-quiet.sh`, followed by
the hook's own exit rule (`ERRORS > 0` exits 1, `pre-commit-checks.sh:2413`). The gate-7 runs above
used a scratch git repo holding copies of the real `.claude/commands/slava/` and `.agents/skills/`
(128 skills). The suite's case H runs the same extraction against a fixture.

**Follow-up (Non-Goal here):** two sibling gates still skip when their script is absent:
`test-codex-native-hooks.sh` (Codex hook gate) and `test-multi-harness-routing.sh` (multi-harness
Tier A gate), both just below check 22.

## Related

- P1151: introduced the mirror and this gate.
- P1284: `--staged-only` scoping.
- P1293: the flag-probe canary. Its Non-Goals recorded this fail-open as pre-existing.
- P1175: shell canaries have no automated runner (open). `sync-agent-skills.test.sh` is one of them.

Promoted from the task inbox, 2026-10-13 (three notes on the same gate merged into this spec).
