---
status: in-progress
type: task
rank: 0.063
workstream: infrastructure
created_date: '2026-04-22'
delivery_stage: fix
pipeline_ran: [fix]
tags:
  - p781
  - skills
  - ship
  - park
  - dev
  - fix
  - git-ops
parent: p781
blocks:
  - p790
locked_at: '2026-04-22T14:42:58.137Z'
---

# P789: Skill rewrites — /ship, /park, /dev, /fix delegate to git-ops.sh

## Problem

The P781 infrastructure (git-ops.sh with full subcommand surface, pre-flight.sh, main.lock, journal-based ship) is useless until the skills actually call it. Today's skills use ad-hoc shell:

- **`/ship`** — hand-rolled cherry-pick sequence, no journal, no main.lock, hard-coded `git push origin main` in step 8 (violates "push always needs your OK").
- **`/park`** — stamps KDD after cherry-pick (can lose stamp if cherry-pick fails), doesn't use commit-to-main, no journal.
- **`/dev`** — uses `git worktree add` + `./scripts/setup-worktree.sh` directly; ignores lockfile protocol. Any crash leaves a slot with no lock.
- **`/fix`** — same as `/dev`.

Until these are rewritten to delegate to `git-ops.sh`, cross-session races, push leaks, and orphan slots remain possible.

## Appetite

**High blast radius.** These are the four most-used skills. A bug in any of them halts active development.

**Reversible.** Skills are markdown files — revert the commit. But careless edits to `/ship` can break the ship flow for every subsequent feature until fixed.

**Medium decision density.** Mostly mechanical delegation (replace N lines with `git-ops.sh <subcommand>`), but a few real decisions: how does `/ship`'s QA gate interact with `pre-flight.sh`? What happens when user invokes `/dev` on a branch that already has a lockfile from a prior session?

## Solution

### T14: `/dev` + `/fix` delegate to `git-ops.sh claim`

Replace in each skill:

```markdown
# Before
git worktree add .claude/worktrees/w1 -b feature/pN-short-description
./scripts/setup-worktree.sh .claude/worktrees/w1
cd .claude/worktrees/w1

# After
eval "$(./scripts/git-ops.sh claim pN short-description 2>/tmp/claim-stderr.log | \
        sed -n '/^#CP_CLAIM_BEGIN$/,/^#CP_CLAIM_END$/p' | grep -v '^#')"
cat /tmp/claim-stderr.log  # human summary
cd $(./scripts/git-ops.sh status --path wN)  # or parse from nonce var
```

Document the safe caller pattern inline (per `.claude/rules/shell-safety.md`).

Add to Phase 0.0.5 of each: invoke `scripts/pre-flight.sh dev --spec pN` before proceeding.

### T13: `/park` rewrite

Change ordering: stamp frontmatter → KDD capture → commit-to-main (in that order). Today's order can lose the stamp if cherry-pick fails.

```
# Before (brittle)
1. Cherry-pick KDD commits to main
2. Stamp spec status
→ If step 1 fails, spec is unstamped, manual recovery needed

# After (P789)
1. Stamp spec status in worktree
2. commit-to-main via git-ops.sh (acquires main.lock, commits stamp)
3. KDD capture via separate commit-to-main
4. Delete branch, release lock
→ Each step is journaled; crash mid-sequence is resumable
```

Write `.park-state` journal parallel to ship journal.

### T12: `/ship` rewrite

Replace hand-rolled cherry-pick sequence with:

```
git-ops.sh ship pN
```

Keep the QA gates (status, .finish-reviewed, pre-deploy checklist, deploy manifest). Remove step 8 push — replaced by prompt "Ready to push. Run `git push origin main` when ready."

Update `.claude/commands/slava/build/ship.md` to reference `git-ops.sh ship` instead of the inline sequence. Preserve existing QA gate logic above the ship invocation.

## Risks / Non-Goals

### Risks
- **Skill rewrite introduces regression in common flow.** Mitigated by end-to-end smoke test (P790 T17) on a throwaway P-number before closing.
- **Mismatch between skill's spec-expectation and git-ops.sh's actual behavior** (e.g., skill expects error code 2 for stale lock, git-ops.sh returns 1). Mitigated by shared documentation in git-ops.sh header.
- **User has a worktree from pre-rewrite era in weird state** — skills should handle via `pre-flight.sh` detecting the anomaly and reporting.

### Non-Goals
- Do NOT add new skill features. Pure delegation refactor.
- Do NOT change the QA gate logic in `/ship` (gates remain: status qa, .finish-reviewed, pre-deploy, deploy manifest). Only the merge phase uses `git-ops.sh ship`.
- Do NOT rewrite `/verify`, `/create-spec`, `/create-bug` — those don't touch worktree/branch plumbing.

## Done-When

- [ ] `/ship` skill body invokes `./scripts/git-ops.sh ship pN` for the merge phase
- [ ] `/ship` no longer contains `git push origin main` — only "Ready to push." message
- [ ] `/park` stamps frontmatter BEFORE KDD cherry-pick, uses `git-ops.sh commit-to-main`
- [ ] `/park` writes `.claude/worktrees/.park-journal/pN.json` for crash recovery
- [ ] `/dev` + `/fix` call `git-ops.sh claim` for worktree creation
- [ ] `/dev` + `/fix` invoke `scripts/pre-flight.sh` as Phase 0.0.5
- [ ] Worktree cleanup on ship/park happens via `git-ops.sh abandon`

## Acceptance Criteria

- [ ] End-to-end: `/dev p999-smoketest` from clean main creates slot via `git-ops.sh claim`, lockfile present
- [ ] End-to-end: `/fix p999-smoketest` same
- [ ] End-to-end: `/ship p999-smoketest` uses `git-ops.sh ship`, journals in `.ship-journal/`, stops at "Ready to push."
- [ ] `/park p999-smoketest` journals in `.park-journal/`, completes even after simulated SIGTERM mid-sequence
- [ ] No skill still contains raw `git worktree add`, `git push origin main`, or `git checkout -b feature/p*`

## Dependencies

- **Blocks:** P790 (rules/git.md references actual skill behavior)
- **Blocked by:** P786 (pre-flight.sh), P787 (commit-to-main, abandon), P788 (ship subcommand)
- **Can parallelize with:** Nothing — linear on the stack

## Branch

`feature/p789-skill-rewrites` — from main HEAD after P788 lands.
