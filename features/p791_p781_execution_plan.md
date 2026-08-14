---
status: backlog
type: comment
rank: 56
workstream: infrastructure
created_date: '2026-04-22'
tags:
  - p781
  - execution-plan
  - meta
---

# P791: P781 execution plan — dependencies, order, parallelism

**This is a meta / comment spec.** Not executable on its own — it exists to coordinate P786–P790 and make the execution order legible in the kanban.

## Current P781 state (as of 2026-04-22)

- **Shipped to main:**
  - T02: `git-ops.sh claim/status/release` (shipped via P783 commit `a8fac3f7`)
  - P783 L1–L6 (shell safety, env-file invariants, canary, sentinel, env-sentinel, chmod)
  - P785 (canary git-env isolation) — fixes P783's canary regression
- **On `feature/p781-worktree-branch-push-hygiene` branch (not on main):**
  - T01: `.gitignore` adds `.claude/worktrees/` (commit `b279110b`)
  - T11: `setup-worktree.sh` native hydration — no symlinks for `scripts/` or `supabase/migrations/` (commit `71f8845b`)
- **Dropped per earlier scope trim:**
  - T08: `migrate-existing-slot.sh` (opt-in tool, not built)
  - T09: in-place migration of w1/w3 (let existing worktrees tear down naturally)

## What remains — five sequential specs

| Spec   | Scope                           | Tasks in P781 | Estimated weight |
|--------|---------------------------------|---------------|------------------|
| P786   | pre-flight.sh + pre-commit scoping | T07, T10      | Small            |
| P787   | git-ops.sh subcommand extensions | T03, T04, T05 | Medium           |
| P788   | ship subcommand with journal     | T06           | Medium-large     |
| P789   | Skill rewrites (/ship, /park, /dev, /fix) | T12, T13, T14 | Medium |
| P790   | Rules, docs, end-to-end smoke    | T15, T16, T17 | Small            |

## Dependency graph

```
P786 (pre-flight + pre-commit)      ──┐
                                      ├──> P789 (skills) ──> P790 (rules/docs/smoke) ──> close P781
P787 (gc/abandon/reconcile/commit-   ─┤         ▲
       to-main/switch-safe/sync)      │         │
                                      └──> P788 (ship journal) ─┘
```

- **P786 and P787 have zero dependencies on each other.** Can start in parallel.
- **P788 depends on P787** (uses `commit-to-main` + `main.lock`).
- **P789 depends on all three** (P786 pre-flight + P787 extensions + P788 ship).
- **P790 depends on P789** (rules must describe actual skill behavior).
- **P791 (this spec) blocks nothing and is blocked by nothing** — pure coordination.

## Recommended execution order

**Wave 1 (parallel, two sessions):**
- Session A: P786 (T07 + T10)
- Session B: P787 (T03 + T04 + T05)

**Wave 2 (single session after Wave 1):**
- P788 (T06 ship journal)

**Wave 3 (single session after Wave 2):**
- P789 (skill rewrites)

**Wave 4 (single session after Wave 3, closes P781):**
- P790 (rules + docs + smoke + P781 closure)

Total: 5 focused sessions, each with clean context.

## Open question: T11 placement

T11 (`setup-worktree.sh` native hydration) is committed on `feature/p781-worktree-branch-push-hygiene` at `71f8845b` but **not yet on main**. It provides the main cross-session isolation benefit (no `scripts/` symlinks across worktrees). Two options:

- **Option A — cherry-pick T11 to main now.** Future P786–P790 work immediately benefits; each session's new worktree gets native hydration. Keeps P781 branch open; eventual `/ship p781` will no-op on the duplicate commit.
- **Option B — leave T11 on branch.** Future P786–P790 sessions use the pre-T11 setup-worktree.sh (symlinks). Only benefit when P781 eventually ships.

**Recommend A.** T11 is a self-contained fix whose value shouldn't wait for 4 more specs to land.

## Closure of P781

Once P790 ships, the P781 umbrella spec (`features/p781_worktree_branch_push_hygiene.md`) should be closed. Because its work spread across P786–P790 as child specs, closure can follow either pattern:

- **Pattern X:** `/ship p781` — cherry-picks T01 (+ T11 if not already on main via Option A). Moves spec to `features/done/`.
- **Pattern Y:** Manual close — update P781 frontmatter to `status: all-done`, `completed_at`, move to `features/done/{sprint}/`. Leaves the branch for history only.

Recommend Pattern X for consistency with the rest of the codebase.

## Frontmatter convention used in children

Each child spec (P786–P790) carries:
- `parent: p781` — links to this umbrella. Informal convention; not auto-enforced.
- `blocks:` / `blocked by:` in prose (not in frontmatter) — the dependency graph above is authoritative.

## Why this decomposition (vs. one marathon session)

- **Context budget.** P781's full remaining scope is ~700+ lines of shell, ~300 lines of rule/doc updates, plus skill rewrites. Single session risks compaction mid-work.
- **Test isolation.** Each spec's regression tests can run independently; a bug in P788 doesn't block P786's merge to main.
- **Parallel execution.** Waves 1 can run as two concurrent sessions (the user's original reason for needing P781 at all).
- **Review granularity.** `/ship` gates catch issues at spec boundaries; smaller diffs = better human review.

---

## Not a task. This spec stays in `status: week` (or user-promoted to `comment` / `all-done` once P790 closes).
