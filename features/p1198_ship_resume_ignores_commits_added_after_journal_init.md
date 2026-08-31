---
status: backlog
type: task
rank: 99
workstream: infra
created_date: '2026-08-31'
tags: [ship, git-ops, tooling]
drafted_by: sonnet
exec_model: sonnet
exec_effort: medium
driver: anomaly
---

# P1198: `git-ops.sh ship --resume` should re-diff the branch for commits added mid-ship

## Problem

`ship_init_journal` (`scripts/git-ops.sh:1399`) builds the cherry-pick journal once, from
`git log main..branch` at the moment `/ship` first runs, and writes it to
`.claude/worktrees/.ship-journal/<pn>.json`. `--resume` only replays that frozen list — it never
re-diffs the branch for `source_sha`s added after the journal was created.

This is a real gap, not hypothetical: P1179 hit it directly (2026-08-31). Ship had already
cherry-picked 8 commits and reached the spec-close step when `goal-gate.sh` CHECK 5 failed (a
blind-reviewer requirement, unrelated to ship itself). Fixing CHECK 5 meant capturing screenshots
and running review rounds, which produced a 9th commit on the feature branch. `--resume` did not
pick it up — spec-close kept failing with "review-round-*.md is empty" until the commit was
cherry-picked by hand and the journal's `commits` array hand-patched with a matching entry, bypassing
the journal's own atomic-write helpers (`ship_mark_landed`).

## Appetite

**Blast radius: low-medium.** Touches `ship_init_journal` and the `--resume` entry path in
`scripts/git-ops.sh`, a shared tool every `/ship` invocation runs.

**Reversibility: high.** Pure tooling change; a bad version can be reverted without touching any
shipped commit history.

**Decision density: low.** The fix shape is clear (re-diff, append, preserve order) — see Solution.

## Solution

Before the journal-replay loop in the `--resume` path, re-run `git log --reverse --format=%H
main..${branch}` and diff against the journal's existing `source_sha` list. Any `source_sha` present
in the fresh diff but absent from the journal gets appended (preserving branch order) via the same
atomic-write helper the init path uses, with `landed_sha: null` so Phase 1's existing pending-commit
loop picks it up naturally — no special-casing needed downstream.

## Risks / Non-Goals

- **MITIGATE** — a commit added to the branch out of the original order (e.g. a rebase) could produce
  a `source_sha` diff that isn't simply "new commits at the end." Scope the fix to the common case
  (new commits appended, no rebase) and detect/refuse the rebase case explicitly rather than silently
  reordering or duplicating journal entries.
- **Non-goal:** rewriting the journal format. This adds one re-diff step, not a new persistence model.

## Done-When

- [ ] A `test-git-ops-ship.sh` canary reproduces the P1179 shape: journal created with N commits,
      then a new commit lands on the branch before `--resume` runs, and `--resume` cherry-picks it
      without manual intervention.
- [ ] The canary is watched fail first (epistemic gate 7) against the current `--resume` before the
      fix lands.
- [ ] `docs/decisions.md` 2026-08-31 [process] entry ("journal is a snapshot at init") updated or
      superseded to point at the fix.

## References

- `scripts/git-ops.sh:1399` (`ship_init_journal`), `:1533` (`ship_pending_source_shas`)
- `docs/decisions.md` 2026-08-31 [process]
- `features/done/2026-06-10/p1179_event_room_links_menu_and_stake_surface.md`
