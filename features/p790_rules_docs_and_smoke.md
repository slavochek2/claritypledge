---
status: qa
type: task
rank: 1000756.0
workstream: infrastructure
created_date: '2026-04-22'
tags: [p781, rules, docs, smoke-test, claude-md]
parent: p781
delivery_stage: ship
pipeline_ran: [fix, ship]
---

# P790: P781 closure — rules/git.md, worktree-setup.md, end-to-end smoke test

## Problem

Three remaining pieces to fully close the P781 umbrella:

1. **`.claude/rules/git.md`** — no merge-strategy matrix, no "one-worktree = one-branch" invariant, no "pushes never pre-approved" statement. Rules must match actual skill behavior (established in P789), not the pre-rewrite state.
2. **`docs/technical/worktree-setup.md`** — references the old symlink-based flow, no mention of lockfile protocol, `status` output format, or 1:1 invariant.
3. **No end-to-end smoke test** — the full stack (pre-flight → claim → commit-to-main → ship with journal → pre-flight → branch delete → lock release) has never been exercised on a real (throwaway) P-number.

Without these, P781's infrastructure is complete but undocumented and unvalidated as a whole.

## Appetite

**Low blast radius.** Rules + docs are pure text. Smoke test is throwaway — doesn't touch prod. Rule edits require `/claude-md` gate per convention — that gate is the only non-trivial step.

**Fully reversible** for all three.

**Low decision density.** Matrix entries and invariants are dictated by P786+P787+P788+P789 behavior; the rules documentation reflects what IS, not what should be.

## Solution

### T15: `.claude/rules/git.md` via `/claude-md`

Must run `/claude-md` gate first per convention. Additions:

**Merge strategy matrix:**
```
| Branch type          | Method                  | Who runs it    | Notes                                    |
|----------------------|-------------------------|----------------|------------------------------------------|
| feature/pN-*, fix/pN-* | git-ops.sh ship        | /ship skill    | Cherry-picks + journal. Never auto-push. |
| Large batch (100+ commits) | git merge --no-ff | Human manual   | letters-ship pattern. Not via /ship.     |
| Direct commit to main (docs, tiny) | commit-to-main | Human or agent | Via git-ops.sh commit-to-main + lock.   |
```

**One-worktree = one-branch invariant:**
- Every `.claude/worktrees/wN/` holds exactly one branch (feature/pN-* or fix/pN-*).
- Never reuse a slot for a different P-number before the previous one is shipped or abandoned.
- `git-ops.sh claim` enforces by creating branch+slot atomically; `status` detects violations.

**Pushes never pre-approved:**
- Add to banned-commands table: `git push origin main` without user-in-session saying "push" or "deploy".
- Remove stale "push cleanup pre-approved" text from `/ship` skill docs.

### T16: `docs/technical/worktree-setup.md`

Drop: "trivial fixes can go directly on main" exception (conflicts with P781's one-worktree = one-branch). If it's trivial, commit-to-main is the path; if it needs a branch, use /dev or /fix.

Add: lockfile protocol section (PID + PID_START_TIME + nonce + SESSION_ID, the four states LIVE/STALE/ORPHAN/NO_LOCK). Reference `scripts/git-ops.sh --help` as source of truth.

Add: `status` output format example (columns, states).

### T17: End-to-end smoke test

On a throwaway P-number (pN where N is large, reserved for smoke). Sequence:

```bash
./scripts/next-p-number.sh                     # record N
/create-bug "smoke test for P781 end-to-end"   # files features/pN_*.md
/fix pN                                        # claim worktree → pre-flight → commit
# Edit a trivial test file, commit on branch
/ship pN                                       # QA gate → ship subcommand → journal → close
# Verify: journal file absent, branch deleted, worktree gone, spec in features/done/
```

Run this end-to-end once. If ANY step fails, file a regression bug and fix before declaring P781 closed.

**Smoke test is NOT a permanent fixture.** It runs once during P790 execution, artifacts are manually cleaned up. A permanent regression test for the stack would be a separate task (not filed here).

## Risks / Non-Goals

### Risks
- **`/claude-md` gate rejects the rule additions** — legitimate concern. Mitigated by working through the gate's routing check; may result in some entries moving to other rule files (e.g., merge-matrix might belong in a new `.claude/rules/worktrees.md`).
- **Smoke test exposes a P781 bug** — this is the point of the smoke. File a bug, fix, re-run.

### Non-Goals
- Do NOT add a permanent CI smoke test — out of scope; one-shot manual run is sufficient for P781 closure.
- Do NOT rewrite the entire `docs/technical/worktree-setup.md` — additive updates only.
- Do NOT expand `.claude/rules/git.md` with unrelated git rules — stay focused on P781 invariants.

## Done-When

- [x] `/claude-md` validation gate passed for `.claude/rules/git.md` changes
- [x] `.claude/rules/git.md` contains: merge-strategy matrix, one-worktree = one-branch invariant, "pushes never pre-approved" statement
- [x] `docs/technical/worktree-setup.md` no longer contains the "trivial fixes directly on main" exception
- [x] `docs/technical/worktree-setup.md` documents lockfile protocol and `status` output format
- [x] End-to-end smoke test (P792) completed; exposed sprint routing bug (resolved with P790 fix + test U); spec in done/, journal absent, branch deleted, worktree cleaned
- [x] P781 umbrella spec moved to `features/done/2026-04-22/` with `status: all-done`

## Acceptance Criteria

- [x] Running `/claude-md "add merge strategy matrix"` returns routing confirmation
- [x] Grep `.claude/rules/git.md` for "merge strategy" returns a hit (line 151: `## Merge Strategy Matrix (P781)`)
- [x] Grep `docs/technical/worktree-setup.md` for "trivial fixes" returns no hit
- [x] Smoke test: `./scripts/git-ops.sh status` after the smoke shows NO_LOCK for the throwaway slot (w2 not listed = NO_LOCK)

## Dependencies

- **Blocks:** Closes P781.
- **Blocked by:** P789 (rules must reflect actual skill behavior).
- **Can parallelize with:** Nothing — final step.

## Branch

`feature/p790-p781-closure` — from main HEAD after P789 lands.
