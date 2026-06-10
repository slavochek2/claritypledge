---
status: week
type: task
rank: 1000805.0
created_date: '2026-06-10'
tags: [infrastructure, tooling, ship, git-ops]
feature_type: backend
delivery_stage: spec-review
pipeline_ran: [create-spec, spec-review]
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
1. **Confirm the implementation is on `main`, not just the spec.** The spec file being on main is necessary but NOT sufficient — a `qa` spec can sit on main while its code lived only on a since-deleted branch. Require BOTH:
   - (a) **Code-presence check (binding):** at least one commit reachable from `main` references pN — e.g. `git log main --grep="\\bpN\\b" --oneline` is non-empty (the implementation commit, tagged pN by convention). If empty → STOP: "spec pN is on main but no pN commit is — its implementation may be on an unmerged or deleted branch; resolve manually." This is the guard against closing work that never landed.
   - (b) **Status check (secondary):** status is `qa` or `in-progress` (work was implemented) — NOT `backlog`/`week`/`today` (unstarted). The `qa`-only requirement is deliberately relaxed: infra-on-main work may close from `in-progress`, because the binding guard is (a), not the status.
2. Skip the cherry-pick entirely.
3. Run the existing closure **under the main lock**: assert `HEAD == main` and no cherry-pick/rebase/merge in progress, acquire the same lock `commit-to-main` uses, then `git mv` the spec into `resolve_ship_sprint_dir`, apply `ship_rewrite_frontmatter` (`status: all-done`, `completed_at`, drop `delivery_stage`), and commit on the locked path.
4. Log a clear line distinguishing this path, e.g. `ship: no branch — closing pN already on main (<sprint-dir>)`.

The detection must be unambiguous, three outcomes: missing branch **+** resolvable spec on main **+** pN commit on main = closure-only; missing branch **+** no resolvable spec = the existing `no … branch found` error; missing branch **+** spec on main but **no** pN commit on main = STOP with the manual-resolve message (never silently close).

**Cross-dependency — P919 (server-side push & deploy authorization):** This spec and P919 both edit the same `cmd_ship` function, and they couple at one layer. The "Do NOT auto-push" non-goal below holds — but P919 changes *how* this closure commit reaches `origin/main`: once P919's required-check boundary is live, **no** commit (including this closure commit) can be pushed directly to protected `main`; it must transit P919's staging-branch hop. So the implicit "the human then pushes `main` directly" model is superseded once P919 lands. **Recommended order: implement P920 first** (it is small, self-contained, and unblocked; P919 is gated on a Phase 0 spike + founder credential steps), then P919's D4 extends the staging hop to cover this closure path. Whichever lands in `cmd_ship` second must rebase onto the first. See features/p919.

## Risks / Non-Goals

### Risks
- **Closing a spec whose work was never actually merged to main** (false "it's on main" — the spec file is on main but the code lived on a deleted/unmerged branch). MITIGATE: the binding gate is a **code-presence check** — at least one commit referencing pN must be reachable from `main` (`git log main --grep`); the spec file on main + a `qa` status are necessary but NOT sufficient. If no pN commit is on main → STOP and route to manual resolution. Never infer "merged" from spec presence + status alone.
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

- [ ] `git-ops.sh ship pN` (and `/ship pN`) on a tracked spec at `status: qa`/`in-progress` that is on `main`, with a pN commit reachable from `main` and **no** `feature/pN-*`/`fix/pN-*` branch, closes the spec: moved to `features/done/<sprint>/`, `status: all-done`, `completed_at` set, `delivery_stage` dropped — and exits 0 (no "no branch found" error).
- [ ] **False-merge guard proven (paste exit code):** a `qa` spec on `main` whose P-number has **no** commit reachable from `main` (implementation never landed) does NOT close — it STOPs non-zero with the manual-resolve message. Verify against a constructed fixture (epistemic gate 7 — exercise the guard's failure path, don't infer it).
- [ ] The normal branch-cherry-pick ship path is unchanged (existing ship still works end-to-end).
- [ ] A genuinely missing branch with **no** resolvable spec still produces the original `ship: no … branch found` error (the closure path does not mask it).
- [ ] Closure runs under the main lock (asserts `HEAD == main` + no op-in-progress, takes the same lock `commit-to-main`/normal ship use) so it stays serialized against a co-tenant `/ship`.
- [ ] References decisions.md 2026-06-10 [process] "Infra work committed directly to main has no feature branch — `/ship` closes the spec manually".
