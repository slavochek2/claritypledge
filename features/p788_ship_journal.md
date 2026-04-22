---
status: week
type: task
rank: 1000754.0
workstream: infrastructure
created_date: '2026-04-22'
tags: [p781, git-ops, ship, journal, idempotency]
parent: p781
blocks: [p789]
---

# P788: git-ops.sh ship subcommand — journal-based idempotent cherry-pick and merge

## Problem

The current `/ship` skill implements cherry-pick + branch-delete + spec-close via hand-rolled shell within the skill itself. This is brittle:

- If `/ship` is interrupted mid-cherry-pick (crash, network hiccup, Ctrl-C), manual recovery is required. There's no journal to resume from.
- SHA-set idempotency doesn't work — cherry-pick bumps committer date, so "the commit with SHA X is on main" becomes stale as soon as one commit is replayed.
- Two concurrent `/ship` invocations on different P-numbers race on main (no serialization).

The P781 architect plan specifies a journal-based `ship` subcommand in `git-ops.sh` that records `(source_sha → landed_sha)` tuples per cherry-pick, making the operation resumable.

## Appetite

**High blast radius.** `ship` writes to main. A bug could corrupt main's history (e.g., duplicate commits, wrong order, partial cherry-pick left unresolved).

**Reversible-but-painful.** `git reset --hard HEAD~N` on main reverts, but any push in between is on the user (blocked by our conventions already).

**High decision density.** Journal file format, resume-on-crash behavior, what to do if `source_sha` no longer resolves (branch rebased), concurrent-ship race, how `ship` interacts with `commit-to-main`'s main.lock, etc.

## Solution

### T06: `git-ops.sh ship <p-number>`

```
git-ops.sh ship <p-number> [--resume]
  1. Pre-flight (from P786): branch exists, worktree is clean, main is up-to-date
  2. Acquire main.lock (from P787 commit-to-main) — serializes across sessions
  3. Initialize or resume from journal: .claude/worktrees/.ship-journal/pN.json
  4. For each commit in `git log --oneline main..feature/pN-*` (oldest first):
     a. If journal says this source_sha is already landed → skip
     b. git cherry-pick <source_sha>
     c. Record landed_sha = git rev-parse HEAD in journal
     d. Fsync journal
  5. Move spec to features/done/{sprint}/, update frontmatter (status: all-done,
     completed_at, remove delivery_stage). Stage + commit via commit-to-main.
  6. Delete feature branch (git branch -D)
  7. Clean up worktree if exists (git worktree remove --force)
  8. Release main.lock
  9. Delete journal file
 10. Report: "Ready to push." Never auto-pushes.
```

### Journal file format

`.claude/worktrees/.ship-journal/pN.json`:
```json
{
  "p_number": "p788",
  "started_at": "2026-04-22T12:34:56Z",
  "session_id": "hostname-pid-epoch",
  "source_branch": "feature/p788-ship-journal",
  "commits": [
    { "source_sha": "abc1234", "landed_sha": "def5678", "landed_at": "2026-04-22T12:35:12Z" },
    { "source_sha": "ghi9012", "landed_sha": null }
  ],
  "spec_closed": false,
  "branch_deleted": false
}
```

On `--resume`: read journal, skip completed entries, continue from the first `landed_sha: null`.

### Crash recovery

If `ship` crashes (SIGKILL, Ctrl-C, network loss):
1. Journal is fsynced after each commit — state on disk is always consistent
2. User runs `git-ops.sh ship pN --resume` to continue
3. If `--resume` is omitted on a partially-shipped P-number, the command refuses with: "Existing journal at .claude/worktrees/.ship-journal/pN.json. Resume with --resume or delete journal to restart."

### Integration with skill

`/ship pN` skill (rewritten in P789) becomes a thin wrapper:
```
1. Run QA gates (status check, finish-reviewed check, pre-deploy checklist, etc.)
2. Invoke `git-ops.sh ship pN`
3. Offer post-ship actions (smoke test, KDD)
```

## Risks / Non-Goals

### Risks
- **Journal and main diverge** (e.g., user manually reverts a landed_sha on main). Mitigated by: `ship --resume` verifies each `landed_sha` still exists on main via `git cat-file`; if missing, FAIL with instructions, don't silently redo.
- **Cherry-pick conflict mid-sequence.** Mitigated by: ship halts at conflict, emits "resolve and run `git-ops.sh ship pN --resume`", never auto-continues.
- **Concurrent ship on same P-number.** Mitigated by: main.lock held for full duration.

### Non-Goals
- Do NOT merge (rebase or regular merge-commit). Only cherry-pick. Matches current /ship.
- Do NOT implement `ship --force` to override journal. User must delete journal manually if starting fresh.
- Do NOT push. Ship stops at "Ready to push."

### Alternatives Considered

- **SHA-set idempotency (record landed SHAs, check before replaying)** — rejected in P781 spec because cherry-pick bumps committer date, SHAs drift.
- **Single atomic cherry-pick of all commits** (via squash or --no-commit) — rejected. Loses commit granularity; /ship's design deliberately preserves individual commits for traceability.
- **Embed journal in git notes on main** — rejected. Journal is a transient artifact; git notes are persistent and shared — wrong lifetime.

## Done-When

- [ ] `git-ops.sh ship <p-number>` reads branch `feature/pN-*` or `fix/pN-*`, cherry-picks in order onto main
- [ ] Journal at `.claude/worktrees/.ship-journal/pN.json` written and fsynced after each commit
- [ ] `ship --resume` correctly skips already-landed commits (matched by `source_sha` presence in `git log main`)
- [ ] Interrupted ship (simulated via SIGTERM mid-sequence) can be resumed via `--resume`
- [ ] Two concurrent `ship` commands for different P-numbers serialize via main.lock (no interleaved writes on main)
- [ ] Spec close + branch delete + worktree cleanup happen after all commits land, never before
- [ ] Never auto-pushes. Output ends with "Ready to push." regardless of success
- [ ] Journal deleted on clean exit

## Acceptance Criteria

- [ ] Regression test: two-commit branch, ship, send SIGTERM between commits, run `--resume`, verify final state (both commits on main, journal absent)
- [ ] Regression test: two-branch concurrent ship via subshell fork, verify serialization via main.lock
- [ ] AC: spec moves to `features/done/{sprint}/` with correct `completed_at` after ship
- [ ] AC: branch `feature/pN-*` deleted; worktree `.claude/worktrees/wN/` removed if existed
- [ ] AC: `.claude/worktrees/.ship-journal/pN.json` does NOT exist after successful ship

## Dependencies

- **Blocks:** P789 (`/ship` skill rewrite uses this subcommand)
- **Blocked by:** P787 (needs `commit-to-main` + `main.lock` infra)
- **Can parallelize with:** Nothing (linear path)

## Branch

`feature/p788-ship-journal` — from main HEAD after P787 lands.
