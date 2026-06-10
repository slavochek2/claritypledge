---
status: week
type: task
rank: 1000805.0
created_date: '2026-06-10'
tags: [infrastructure, tooling, ship, git-ops]
delivery_stage: create-spec
pipeline_ran: [create-spec]
---

# P920: `git-ops.sh ship` — close a spec already on main when there is no feature branch

## Problem

**Situation:** `git-ops.sh ship pN`'s entire job is to cherry-pick a `feature/pN-*` (or `fix/pN-*`) branch onto `main`, then close the spec. It resolves the branch first and **dies** `ship: no feature/pN-* or fix/pN-* branch found` (`git-ops.sh:1112`) if none exists.

**Complication:** Some work is committed **directly to `main`** with no feature branch — the `/fix` worktree exception for git-hook tooling is the canonical case (a worktree shares the same `git-common-dir/hooks`, so it cannot isolate the artifact being changed; P917 was done this way). When `/ship pN` runs on such a spec, `git-ops.sh ship` dies, and the operator must hand-roll the closure: `git mv` the spec to `features/done/<sprint>/`, rewrite frontmatter to `status: all-done` + `completed_at` and drop `delivery_stage`, then commit. That manual path is error-prone (easy to stamp the wrong copy, forget `completed_at`, or skip the sprint-dir resolution) and duplicates logic the script already has.

**Question:** How does `git-ops.sh ship` close a tracked spec whose work is already on `main`, with no branch to cherry-pick, reusing its existing closure machinery?

## Appetite

**Blast radius — low.** Adds one branch to `cmd_ship`; the normal branch-cherry-pick path is untouched. **Reversibility — high** (git revert the script change). **Decision density — low** — the closure functions (`resolve_ship_spec`, `resolve_ship_sprint_dir`, `ship_rewrite_frontmatter`) already exist and are reused; the only real call is how to detect the no-branch case unambiguously.

## Solution

In `cmd_ship`, after `resolve_ship_spec` succeeds (spec found on main) but the branch lookup finds **no** `feature/pN-*` or `fix/pN-*` branch, take a **closure-only** path instead of dying:
1. Verify the spec is in a closable state (e.g. `status: qa` — guard against closing a spec whose work was never finished; if not, report and stop).
2. Skip the cherry-pick entirely.
3. Run the existing closure: `git mv` the spec into `resolve_ship_sprint_dir`, apply `ship_rewrite_frontmatter` (`status: all-done`, `completed_at`, drop `delivery_stage`), commit via the same locked/journaled path the normal flow uses.
4. Log a clear line distinguishing this path, e.g. `ship: no branch — closing pN already on main (<sprint-dir>)`.

The detection must be unambiguous: a missing branch **with** a resolvable spec on main = closure-only; a missing branch **and** no spec = the existing error. Keep the journaled/locked commit behavior so a co-tenant `/ship` stays serialized.

## Risks / Non-Goals

### Risks
- **Closing a spec whose work was never actually merged to main** (false "it's on main"). MITIGATE: gate on `status: qa` (work reached QA) and on `resolve_ship_spec` finding the spec on main's tree; do not infer "merged" from spec presence alone if a stronger signal is cheap.
- **Masking a genuinely missing branch** (operator expected a branch, typo'd the P-number). MITIGATE: the closure path triggers only when the spec resolves on main AND is at a closable status; otherwise the original "no branch found" error stands.

### Non-Goals
- Do NOT change the normal `feature/pN-*` cherry-pick path or its journal/lock behavior.
- Do NOT auto-push (closure commits to main only; push stays a separate human-gated step).
- Do NOT add a new flag — detect the no-branch case automatically (skills auto-detect; `.claude/rules/skills.md`).
- Do NOT broaden scope to "ship arbitrary main commits" — this is spec closure for a tracked spec already on main, nothing more.

### Alternatives Considered
- **Keep the manual closure** (status quo) — error-prone and duplicates `ship_rewrite_frontmatter` + `resolve_ship_sprint_dir` logic the script already owns; the failure modes (wrong copy stamped, missing `completed_at`) are exactly what the script exists to prevent.
- **Force a throwaway `feature/pN` branch to feed the existing path** — ceremony with no isolation value; the commit is already on main, so the cherry-pick would be a no-op or conflict.

### Rollback Strategy
Revert the `cmd_ship` change. The manual closure path remains available as it is today. No data migration, no schema, no state to unwind.

## Done-When

- [ ] `git-ops.sh ship pN` (and `/ship pN`) on a tracked `status: qa` spec that is on `main` with **no** `feature/pN-*`/`fix/pN-*` branch closes the spec: moved to `features/done/<sprint>/`, `status: all-done`, `completed_at` set, `delivery_stage` dropped — and exits 0 (no "no branch found" error).
- [ ] The normal branch-cherry-pick ship path is unchanged (existing ship still works end-to-end).
- [ ] A genuinely missing branch with **no** resolvable spec still produces the original `ship: no … branch found` error (the closure path does not mask it).
- [ ] Closure commit stays serialized against a co-tenant `/ship` (same lock/journal path as the normal flow).
- [ ] References decisions.md 2026-06-10 [process] "Infra work committed directly to main has no feature branch — `/ship` closes the spec manually".
