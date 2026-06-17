---
status: all-done
type: task
rank: 1000805.0
created_date: '2026-06-10'
tags: [infrastructure, tooling, ship, git-ops]
feature_type: backend
pipeline_ran: [create-spec, spec-review, architect, spec-review.2, dev]
completed_at: 2026-06-17
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

- [x] `git-ops.sh ship pN` (and `/ship pN`) on a tracked spec at `status: qa`/`in-progress` that is on `main`, with a pN commit reachable from `main` and **no** `feature/pN-*`/`fix/pN-*` branch, closes the spec: moved to `features/done/<sprint>/`, `status: all-done`, `completed_at` set, `delivery_stage` dropped — and exits 0 (no "no branch found" error). *(test AA, PASS)*
- [x] **False-merge guard proven (paste exit code):** a `qa` spec on `main` whose P-number has **no** commit reachable from `main` (implementation never landed) does NOT close — it STOPs non-zero with the manual-resolve message. Verify against a constructed fixture (epistemic gate 7 — exercise the guard's failure path, don't infer it). *(test BB, exit code 1, spec NOT moved)*
- [x] The normal branch-cherry-pick ship path is unchanged (existing ship still works end-to-end). *(tests K + Z2 still PASS — title-extraction refactor is behavior-preserving)*
- [x] A genuinely missing branch with **no** resolvable spec still produces the original `ship: no … branch found` error (the closure path does not mask it). *(test CC, PASS)*
- [x] Closure runs under the main lock (asserts `HEAD == main` + no op-in-progress, takes the same lock `commit-to-main`/normal ship use) so it stays serialized against a co-tenant `/ship`. *(acquire-once in the no-branch arm; op-in-progress assertion inlined; AA asserts main.lock released after)*
- [x] References decisions.md 2026-06-10 [process] "Infra work committed directly to main has no feature branch — `/ship` closes the spec manually". *(referenced; new implementation entry added at top of decisions.md)*

## Technical Architecture

### Technical Analysis

#### Current `cmd_ship` control flow (fresh run, no journal)

Line references are to `scripts/git-ops.sh` as of commit `47ee1854`.

```
~1469  branch="$(resolve_ship_branch "$pn")"        # dies if no branch found
~1471  spec_file="$(resolve_ship_spec "$pn")"        # never reached if no branch
~1472  ship_init_journal "$pn" "$branch" "$spec_file" # requires non-empty branch
~1485  git-ops self-touch guard                       # uses $branch ref
~1500  untracked-spec guard                           # working-tree only, safe
~1543  migration guard (git diff main...$branch)      # uses $branch ref
~1560  detect_cospecs "$pn" "$branch"                 # uses $branch ref
~1566  acquire_main_lock                              # lock acquired here
~1576  post-acquire race guard (branch still exists?) # uses $branch ref
~1585  checkout main if needed                        # HEAD ensured main
~1607  Phase 1: cherry-pick loop                      # uses $branch for pending SHAs
~1656  Phase 2: spec close (git mv + frontmatter + commit)
~1712  Phase 2b: co-located spec auto-close
~1742  Phase 3: worktree + branch delete              # uses $branch ref
~1764  release_main_lock, rm journal, print "Ready to push."
```

**The blocker (BLOCK A):** `resolve_ship_branch` at line 1112 calls `die` when no branch is found. This fires at line 1470, before `resolve_ship_spec` at line 1471 ever runs. There is no post-spec-check branch-absent path in the current code.

**Branch-dependent sections:** The following sections use `$branch` and must be conditioned on `branch != ""`or skipped entirely in the no-branch path:
- `ship_init_journal` (~1472)
- git-ops self-touch guard (~1485)
- migration guard (~1543)
- `detect_cospecs` (~1560)
- post-acquire race guard (~1576)
- cherry-pick loop (Phase 1, ~1607)
- Phase 2b co-spec auto-close (~1712, uses `$cospecs` derived from `detect_cospecs`)
- Phase 3 branch+worktree delete (~1742)

**Sections that are safe with `branch=""` (no change needed):**
- untracked-spec guard (~1500) — reads working tree only
- lock acquisition (~1566) — no branch reference
- `checkout main` (~1585) — no branch reference
- Phase 2 spec close (~1656) — uses `$spec_file` only; this is exactly what the closure path reuses

#### Reuse Inventory

| Function / block | Lines | Reuse in closure path |
|---|---|---|
| `resolve_ship_spec` | 1123–1156 | **Reused as-is** — call first; its output is the spec on main |
| `resolve_ship_branch` | 1104–1118 | **Must be made non-fatal** on zero matches (see Decision A) |
| `resolve_ship_sprint_dir` | 1177–1197 | **Reused as-is** — determines destination sprint dir |
| `ship_rewrite_frontmatter` | 1382–1424 | **Reused as-is** — rewrites status/completed_at/drops delivery_stage |
| `acquire_main_lock` / `release_main_lock` | 601–670 | **Reused as-is** — closure runs inside the same lock cmd_ship holds |
| `cmd_commit_to_main` assertion block | 961–966 | **Factor out as inline check** in closure path (cannot call `cmd_commit_to_main` — it re-acquires the lock → self-deadlock; assertions must be inlined) |
| `ship_init_journal` family | 1202–1302 | **Skipped entirely** — no cherry-pick sequence; the two-step closure is atomic enough; idempotency via spec-in-done |
| Phase 2 spec close block | 1656–1709 | **Reused structurally** — closure path mirrors this block directly (git mv, ship_rewrite_frontmatter, git add, commit) |

---

### Architecture Decisions

#### Decision A — Control-flow restructure to unblock spec-first resolution (BLOCK A)

**Chosen:** Option (b) — make `resolve_ship_branch` return-empty (not die) on zero matches; the call site checks emptiness and either enters the no-branch closure path or falls through to a new `die` that carries the original message.

**Concrete change:** Rename the zero-match `die` inside `resolve_ship_branch` to `return 0` (echo nothing). Add a non-fatal wrapper name or reuse the same function with a flag: the simplest change is to replace the `die` at line 1112 with `echo ""` + `return 0`. At the call site (line 1470), restructure:

```bash
# BEFORE (lines 1469–1472)
branch="$(resolve_ship_branch "$pn")"        # dies here if no branch
spec_file="$(resolve_ship_spec "$pn")"

# AFTER
spec_file_attempt="$(resolve_ship_spec "$pn" 2>/dev/null || true)"
branch="$(_try_resolve_ship_branch "$pn")"   # returns "" on zero matches; dies on >1

if [[ -z "$branch" ]]; then
  # No-branch path: spec must exist on main to proceed
  if [[ -z "$spec_file_attempt" ]]; then
    die "ship: no feature/${pn}-* or fix/${pn}-* branch found"   # original message
  fi
  spec_file="$spec_file_attempt"
  _cmd_ship_closure_only "$pn" "$spec_file"  # see Implementation Approach
  return
fi

spec_file="$(resolve_ship_spec "$pn")"       # normal path: die if no spec
ship_init_journal "$pn" "$branch" "$spec_file"
# ... (unchanged normal path) ...
```

The multi-match `die` at line 1115 is retained as-is (multiple branches with a pN is always an error).

**Rationale:** Option (b) keeps `resolve_ship_branch` as a single function with a clear return contract, avoids duplicating the `git for-each-ref` call (option c would require two calls), and leaves zero coupling from the closure path into journal/cherry-pick machinery. Calling `resolve_ship_spec` first (before the branch check) is safe because `resolve_ship_spec` has no branch dependency.

**Trade-off:** The function's previous "always returns non-empty or dies" contract changes to "returns empty string on zero matches." All callers must be updated to check for empty — currently there is exactly one call site (line 1470), now restructured above.

**Alternative rejected — Option (a) spec-first then branch:** Calling `resolve_ship_spec` first unconditionally and only *then* calling `resolve_ship_branch` would require that `resolve_ship_spec` die on spec-not-found, then fall through to the branch error. This is cleaner in terms of function contracts but adds a misleading "no spec found" error for the common case of a genuinely missing branch with no spec — users would see "no spec found" instead of "no branch found," which is the actionable diagnostic. Option (b)'s inline branch check at the call site produces the right message per outcome.

**Alternative rejected — Option (c) pre-check `git for-each-ref`:** Correct but duplicates the branch-resolution logic; option (b) reuses it.

---

#### Decision B — Code-presence detection mechanism (BLOCK B) [FOUNDER DECISION]

**Background (verified against real history):** Three false-positive categories exist for any `git log main --grep="\bpN\b" --oneline` guard:
1. **Seed commit** — `chore: file p920 (…)` matches `\bp920\b`; status is `week`, not `qa` — the status gate eliminates this category.
2. **Cross-reference commit** — `docs(p919): cross-reference P920 — cmd_ship collision` matches `\bP920\b` (case-insensitive) / `\bp920\b` does NOT match because `P920` is uppercase in the subject. However, adding `-i` (case-insensitive) re-introduces it. The case-sensitive `\bp920\b` grep does not match `P920` in docs — but the status gate would also eliminate it (spec at `week` at seed time).
3. **Restore/revert commit** — `docs: restore 6 decisions.md entries … p917 gate` matches `\bp917\b` in the commit body. This is a false positive that the status gate does NOT eliminate (spec might be at `qa`). Verified: `bd5da248` matches because the body mentions `p917 gate` as a description of the restored entry.

**Three options:**

**(i) Trust the operator.** No code-presence grep guard. Accept that: no branch found + spec on main at `qa`/`in-progress` + operator ran `/ship pN` = assume work is on main. Closes the spec.
- Risk: silently closes a spec whose code was on a since-deleted branch (the canonical false-merge failure mode this spec was created to prevent).
- Benefit: zero convention dependency; works even for unusual commit message formats.
- Verdict: too weak — removes the only verifiable signal against the primary risk.

**(ii) Enforce a commit convention.** Require all direct-to-main implementation work to include `pN` (lowercase) in at least one implementation commit message. The `git log main --grep="\bpN\b"` guard then works, and the operator is on notice that commits must carry the token.
- Risk: operator discipline required; one non-conforming commit makes the guard miss the work, forcing manual override or guard bypass.
- Benefit: explicit, auditable; grep is a simple one-liner.
- Existing evidence: the "ready for QA" stamp commit (`chore: p917 ready for QA — …`) always contains `pN` in lowercase and is reliably written by the `/dev` or `/fix` skill. This pattern already satisfies option (ii) for the skill-driven workflow.

**(iii) Key off the agent-written stamp commit.** Grep specifically for the "ready for QA" stamp pattern, not arbitrary pN mentions. The guard becomes: `git log main -i --grep="\bpN\b" --grep="ready for QA" --all-match --oneline` is non-empty (final form; the DECIDED refinement below supersedes the earlier phrase-only proposal).
- Verified pattern: every `chore: pN ready for QA — …` commit in history (p528, p810, p891, p906, p913, p917) reliably contains `pN` in this exact format. One outlier found: `chore: P757 ready for QA` (uppercase P) — handled by `-i` flag.
- Eliminates false positives: seed commit, cross-reference commit, and restore/revert commits do not match `pN ready for QA`.
- Risk: a non-skill manual workflow that skips the "ready for QA" stamp would produce no match, requiring the operator to add the stamp commit explicitly.
- Also covers: `chore: stamp pN pipeline ship` and similar pipeline-stamp patterns do NOT match this specific grep — so the guard requires the implementation-complete stamp specifically, not any stamp.

**Recommendation:** Option (iii) — grep for the "ready for QA" stamp.

The stamp is the most specific and least false-positive-prone signal in the commit history. The status gate (`qa`/`in-progress`) provides a second independent layer. Together they require: spec at `qa`/`in-progress` AND a `pN ready for QA` stamp commit on main — both are necessary, neither alone is sufficient.

**Exact grep command (to be used in the guard):**
```bash
git -C "$REPO_ROOT" log main -i --grep="\\bpN\\b" --grep="ready for QA" --all-match --oneline
```
where `pN` is the literal p-number variable, e.g., `p917`. **`--all-match` requires BOTH `pN` and `ready for QA` in the same commit message** (not strict adjacency), so the `fix(pN): … ready for QA` subject shape is caught alongside the canonical `chore: pN ready for QA`. Case-insensitive (`-i`) handles the occasional uppercase-P outlier. `--grep` searches subject + body, but a body-only false match would still have to clear the `qa`/`in-progress` status gate — the two gates together make a spurious close implausible.

**If the stamp is absent (guard returns empty):** emit: `"ship: spec pN is on main but no 'pN ready for QA' stamp commit found on main — implementation may not be complete or may be on an unmerged/deleted branch; add the stamp commit or resolve manually."` Exit non-zero.

**DECIDED (2026-06-10): Option (iii) — stamp-grep.** Founder deferred the technical call to the agent; chosen on evidence (the `pN ready for QA` stamp is verified present on main for P917 and every recent spec), fail-safe behavior (STOP rather than wrong-close when the stamp is absent), and preservation of the "no new flag" non-goal. Option (iv) `--on-main` flag rejected: more operator burden + revisits the non-goal, for robustness that (iii)'s verified-on-main signal already provides. **Refinement for /dev:** match `pN` and `ready for QA` within the same commit subject (e.g. `git log main -i --grep="pN" --grep="ready for QA" --all-match`) rather than requiring strict adjacency, so the `fix(pN): … ready for QA` subject shape (e.g. `1bad6cb3`) is also caught.

---

#### Decision C — Journal, branch-guard gating, and idempotency in the no-branch path (BLOCK C)

**Chosen:** The closure path (no-branch case) skips `ship_init_journal` entirely and bypasses all branch-dependent guards. It runs as a single atomic sequence: acquire lock → assert HEAD==main + no op-in-progress → checkout main → git mv spec → `ship_rewrite_frontmatter` → git add → git commit → release lock. No journal file is created.

**Gating table:** Each branch-dependent section in `cmd_ship` and its treatment in the no-branch path:

| Section | Line(s) | Treatment in no-branch path |
|---|---|---|
| `ship_init_journal` | ~1472 | **Skipped** — extracted before the branch split (only called in normal path) |
| git-ops self-touch guard | ~1485 | **Skipped** — guard is "branch touches git-ops.sh"; with no branch, this case cannot occur |
| Untracked-spec guard | ~1500 | **Retained** — working-tree check, no branch dependency |
| Migration guard | ~1543 | **Skipped** — no branch to diff against |
| `detect_cospecs` | ~1560 | **Skipped** — co-spec detection requires a branch range |
| Post-acquire race guard | ~1576 | **Skipped** — guard checks "branch disappeared between pre-check and lock"; with no branch, not applicable |
| Cherry-pick loop (Phase 1) | ~1607 | **Skipped** — no commits to pick |
| Phase 2 spec close | ~1656 | **Reused** — this is the entire closure path body |
| Phase 2b co-spec auto-close | ~1712 | **Skipped** — requires detect_cospecs result |
| Phase 3 branch+worktree delete | ~1742 | **Skipped** — no branch to delete |
| Journal cleanup | ~1766 | **Skipped** — no journal was created |

**Idempotency story:** After a successful closure run, the spec is in `features/done/<sprint>/`. On a second `/ship pN` run: `resolve_ship_spec` at line 1126–1128 excludes `features/done/*` — it returns empty. The no-branch path then falls through to `die "ship: no feature/pN-* or fix/pN-* branch found"` (the original message). This is the correct observable behavior: "no spec in active features + no branch = nothing to ship." A `"ship: spec already closed"` message would be cleaner but requires an additional check in `done/`; the current behavior is correct and not misleading. No second journal is created; no second commit is attempted. **This is the idempotency guarantee.**

**Rationale:** The journal exists to track cherry-pick progress across a multi-commit sequence that can be interrupted and resumed. The no-branch closure is a two-git-operation sequence (`git mv` + `git commit`) that either succeeds atomically or fails, leaving the spec in its original location (recoverable by re-running). Journal overhead for this case adds complexity with no benefit.

**Trade-off:** If `git commit` fails partway through (e.g., pre-commit hook rejection), the `git mv` will have already run. The spec is in `done/` but not committed. Re-running `ship pN` would find no spec in `features/` and emit "no branch found." Recovery requires: `git mv features/done/<sprint>/pN_*.md features/` then re-run. This is a known risk — document it in the error path of the closure path's commit step.

---

#### Decision D — Main-lock hold and op-in-progress assertions (WARN D)

**Chosen:** The no-branch closure path runs entirely under the main lock already acquired by `cmd_ship` at line 1566. It does NOT call `cmd_commit_to_main` (which would re-acquire the same lock → `ln` fails → timeout → exit 1: self-deadlock). Instead, it inlines the `cmd_commit_to_main` assertion block and performs git operations directly.

**Assertion to add** in the no-branch closure path, immediately after the lock is acquired and `checkout main` has run (after line ~1587):

```bash
# Mirror cmd_commit_to_main assertions (P787, lines ~961–966)
_gitdir="$(cd "$REPO_ROOT" && git rev-parse --absolute-git-dir)"
if [[ -e "$_gitdir/CHERRY_PICK_HEAD" || \
      -e "$_gitdir/rebase-merge"     || \
      -e "$_gitdir/rebase-apply"     || \
      -e "$_gitdir/MERGE_HEAD" ]]; then
  die "ship: operation in progress — refusing closure commit inside a cherry-pick, rebase, or merge started by another session"
fi
```

The `HEAD==main` check is already covered by the `git checkout -q main` block at lines 1583–1587. That block runs unconditionally in `cmd_ship` after lock acquisition and before Phase 2 — the no-branch closure path runs in the same post-lock section, so HEAD is guaranteed to be `main` at that point.

**Lock self-deadlock prevention:** `acquire_main_lock` uses `ln "$tmp" "$target"` (atomic POSIX hard link). The lock target is `.claude/worktrees/main.lock`. If `cmd_ship` holds the lock (`MAIN_LOCK_ACQUIRED=1`) and the closure path calls `cmd_commit_to_main`, which calls `acquire_main_lock`, the `ln` call returns non-zero immediately (file exists), the retry loop runs for `$timeout` seconds (default 120s), and then exits 1. The entire ship run aborts. This is a soft deadlock, not a kernel deadlock, but it burns 120 seconds and leaves the working tree in a partial state. **Do not call `cmd_commit_to_main` from within `cmd_ship`'s closure path.**

---

### Security Review

**Applicability:** This is a local shell-script path that reads git objects and writes the local filesystem. Database/RLS, HTTP routes, auth surfaces, LLM prompts, PII, and new secrets are entirely absent — the standard web-security checklist is N/A. The real surface is: argument injection, the false-close safety guard, concurrency on the shared `main` checkout, and scope constraints.

**Shell / Command Injection:**
- ✅ `pn` is constrained to `^p[0-9]+$` before any interpolation (`cmd_ship` ~lines 1443–1444, rejects non-matching with `die`). This is the decisive control: it makes `pn` safe to interpolate into git refspecs, `--grep` patterns, `find` pathspecs, and revision args — no shell metacharacters, no leading-`-` option injection, no `$(...)` can survive.
- ✅ `resolve_ship_branch`'s `for-each-ref "refs/heads/feature/${pn}-*"` (~1107) and `find … -name "${pn}_*.md"` (~1126) are safe — quoted args, digit-only interpolation.
- ✅ No `eval`, `bash -c`, or unsanitized `$(...)` in the closure call chain. The Decision-B `--grep="…pN…"` is a positional `git log` arg; worst case under a relaxed gate is a bad regex, not OS execution.
- **Hold the `^p[0-9]+$` gate inviolable** — any relaxation (allowing `-`, `/`) requires re-auditing every interpolation site.

**Data-Integrity / Destructive-Op Safety (the false-close guard):**
- ⚠️ The spec's *original* `--grep="\bpN\b"` premise is unsound (real impl commits carry no pN token). **Resolved by Decision B option (iii)** — the `pN ready for QA` stamp-grep, verified present on main for the canonical P917 case and every recent spec. Security concurs (iii) is materially stronger than the original and is testable (satisfies Done-When #2).
- ⚠️ **Blast radius of a wrong close is bounded but not a clean undo.** A false close = spec moved to `features/done/<sprint>/` + frontmatter rewritten (`status: all-done`, `completed_at`) + committed to main. `git revert` restores the spec to `features/` but bakes the wrong frontmatter into the reverted content — the operator must then hand-restore `status`/`completed_at`. Recoverable, not trivially reversible. **Control:** the stamp-grep + status gate (both required) is the minimum acceptable guard; never close on spec-presence + status alone.

**Concurrency / Lock Integrity:**
- ✅ Closure must run under `main.lock` and assert `HEAD==main` + no cherry-pick/rebase/merge in progress before `git mv`/commit (Decision D inlines the `cmd_commit_to_main` assertion block ~961–966). Correct.
- ⚠️ **Self-deadlock if `acquire_main_lock` is called twice.** Must NOT call `cmd_commit_to_main` from inside the closure (it re-acquires via `ln`, fails, spins to a 120s timeout, exits 1 holding the lock). See Reconciliation below for the exact acquire-once resolution.
- ✅ Bypassing the post-acquire branch-deleted race guard (~1576) in the no-branch path is correct (no branch to race on), not a gap.

**Privilege / Scope (no arbitrary-ship, no auto-push):**
- ⚠️ **Status gate is NOT inherited from `resolve_ship_spec`** (~1123–1156 locates any `pN_*.md` outside done/archive/uat; it does not filter by status). The closable-status check (`qa`/`in-progress`) must be implemented explicitly in the new arm — covered by Build Sequence step 3. If omitted, `ship pN` on a `backlog` spec with no branch would close it silently.
- ✅ Cannot ship arbitrary main commits; cannot be coerced via journal replay; never auto-pushes (the non-goal holds; `cmd_ship` ends at "Ready to push." with no `git push`).

**Residual risk: MEDIUM → LOW** once Decision B (iii) + the explicit status gate are implemented as specified. Single most important control to get right: the stamp-grep + status gate must BOTH pass before the closure commits — neither alone is sufficient.

---

#### Architecture ↔ Security Reconciliation (parent merge)

Three items the two agents left contradictory or open — resolved here so `/dev` does not have to:

1. **Lock ordering (Decision A vs Decision D — must fix before /dev).** Decision A's restructure enters the no-branch closure at the call site (~1470) and `return`s **before** the normal lock acquire at ~1566. But Decision D (and the Security review) describe the closure as running *under a lock already held*, warning against re-acquisition. These are inconsistent. **Resolution:** the no-branch closure path **acquires `main.lock` exactly once itself** (it never reaches line 1566, so there is no outer lock and no self-deadlock), inlines the op-in-progress assertion immediately after acquire + `checkout main`, and `release_main_lock` + `trap - EXIT` on its own exit. Build Sequence step 4's "already held by outer cmd_ship" wording is wrong for the early-return placement and must be implemented as acquire-once. (Decision D's self-deadlock warning still applies as a guardrail: never *also* call `cmd_commit_to_main`.)

2. **Detection mechanism (Decision B) — verification result + a 4th option for the founder.** History check confirms the (iii) stamp-grep is viable (P917 stamp on main; reliable across p528/p810/p891/p906/p913). Two refinements: (a) match `pN` and `ready for QA` within the same commit subject rather than requiring strict adjacency, so the `fix(pN): … ready for QA` format (e.g. `1bad6cb3`) is not missed; (b) the Security agent proposes a distinct **option (iv): an explicit `--on-main` confirmation flag** — the operator authorizes "code is merged," the script asserts spec-on-main + closable status. More robust and trivially testable, but revisits the "no new flag" non-goal. **Resolved: (iii) chosen** (see Decision B "DECIDED" line); (iv) recorded as the rejected alternative.

3. **Status gate (Security ⚠️) — reconciled, no contradiction.** Build Sequence step 3 already reads frontmatter status explicitly and rejects `backlog`/`week`/`today`. No fix needed; flagged only to confirm the gate is implemented in the new arm, not assumed from `resolve_ship_spec`.

---

### Implementation Approach

**Worktree note:** Worktrees are the standard isolation mechanism for `cmd_ship` changes. However, this spec exists precisely because git-hook tooling (`scripts/git-ops.sh` itself) cannot be safely tested from a worktree — a worktree shares `$GIT_COMMON_DIR/hooks` with the main repo, so a changed script is invisible to the running process (Bash parses function bodies at load time). The self-touch guard at line ~1485 enforces this: any branch modifying `git-ops.sh` is rejected by ship. **Recommended implementation path:** commit the change directly to main via `git-ops.sh commit-to-main` (the same pattern P917 used), test locally before committing. No worktree.

#### Build Sequence

1. **Change `resolve_ship_branch` to return-empty on zero matches** (Decision A). Rename the internal `count==0` `die` at line 1112 to `echo ""; return 0`. Update the docstring. The multi-match `die` at line 1115 is unchanged.

2. **Restructure the fresh-run branch in `cmd_ship`** (lines 1469–1490, Decision A). Call `resolve_ship_spec` first (with `2>/dev/null || true` wrapper for the empty-branch diagnostic path). Then call the modified `resolve_ship_branch`. If branch is empty, enter no-branch detection (step 3). If non-empty, proceed with existing journal+cherry-pick path unchanged.

3. **Implement the 4-outcome detection block** (Decisions A + B + WARN E) in the no-branch arm:
   - Read spec status from frontmatter (python3 one-liner, same pattern as `ship_rewrite_frontmatter`).
   - If status is `backlog`/`week`/`today`: die with "ship: spec pN is at status [X] — work not yet implemented; no feature/fix branch found and spec is not closable as direct-to-main." (WARN E outcome 4)
   - If status is `qa`/`in-progress`: run code-presence check (Decision B): `git log main -i --grep="pN" --grep="ready for QA" --all-match --oneline`. If empty → die with false-merge-guard message. If non-empty → continue to step 4.
   - If branch is empty AND spec is not found (shouldn't reach here given structure, but guard anyway): die with original "no branch found" message.

4. **Implement the no-branch closure arm inline** (Decisions C + D) — the `_cmd_ship_closure_only` name in Decision A's pseudocode is illustrative only; implement as an inline block in `cmd_ship`'s no-branch arm, not a separate helper (avoids passing lock state across a function boundary):
   - **Lock: acquire once, inside the closure arm.** The no-branch arm returns at the call site (~1470), BEFORE the normal path's `acquire_main_lock` (~1566) — so there is no outer lock and no self-deadlock. The closure arm calls `acquire_main_lock` exactly once, sets its own `trap 'release_main_lock' EXIT`, then `git checkout -q main` (reuse the ~1583–1587 block). Implement inline in `cmd_ship`'s no-branch arm (not a lock-state-passing helper). Never call `cmd_commit_to_main` (it re-acquires the same lock → self-deadlock).
   - Inline closure path, after lock is acquired and checkout-to-main is complete:
     - Add op-in-progress assertion (Decision D inlined snippet)
     - `sprint_dir="$(resolve_ship_sprint_dir)"`; `mkdir -p "$REPO_ROOT/$sprint_dir"`
     - `spec_base="$(basename "$spec_file")"`; `spec_dest="${sprint_dir}/${spec_base}"` (define before use; mirrors Phase 2 ~line 1661)
     - `git mv "$spec_file" "$REPO_ROOT/$spec_dest"`
     - `ship_rewrite_frontmatter "$REPO_ROOT/$spec_dest"`
     - `git add -- "$spec_dest"` + `git commit -m "chore: close $pN (direct-to-main) — $title" -- "$spec_dest" "$spec_file"`
     - Log: `"ship: no branch — closing $pN directly on main (${sprint_dir})"`
     - `release_main_lock`; `trap - EXIT`; exit 0

5. **Add kanban-edit discard block for the no-branch path** — the existing discard at lines 1594–1602 is inside the normal path (after Phase 2 starts). The no-branch closure path also needs to discard uncommitted kanban edits to the spec file before `git mv`, otherwise `git mv` on a kanban-modified file fails. Mirror the block — place it inside the locked section, after `git checkout -q main` and immediately before `git mv` (matching the normal path's discard at ~1589–1602).

6. **Remove the `journal.source_branch` assertion** at line 1477 from the resume path — with no-branch support, a resume with `source_branch=""` in a journal is a new valid state. (No journal is written for the no-branch path, so this assertion is not triggered; this is a defensive note only.)

7. **Add `decisions.md` entry** referencing this closure path decision.

8. **Add test cases to `scripts/test-git-ops-ship.sh`** for the no-branch path: (a) happy path — a `qa` spec with a `pN ready for QA` stamp on main closes and exits 0; (b) false-merge guard failure path (Done-When #2 / epistemic gate 7) — a `qa` fixture spec with NO stamp on main STOPs non-zero with the expected message; (c) regression — the normal branch-cherry-pick path still passes.

#### Files to Create

None.

#### Files to Modify

- `scripts/git-ops.sh` — the primary code target. All changes are within or near `cmd_ship` (~line 1426) and `resolve_ship_branch` (~line 1104).
- `scripts/test-git-ops-ship.sh` — add the three no-branch test cases from Build Sequence step 8 (happy close, false-merge guard STOP, normal-path regression).
- `features/p920_git_ops_ship_close_spec_on_main_no_branch.md` (this spec) — pipeline stamp updates only.
- `docs/decisions.md` — one new `[process]` entry per Done-When item 6.

**Cross-dependency — P919:** P919 also edits `cmd_ship` (adds a staging-branch hop for push authorization). P920 is recommended first (smaller, unblocked). Whichever lands second must rebase onto the first. When P919's D4 extends the staging hop, it must cover the no-branch closure commit produced by P920. P919's architect does not need to design P920's closure commit format — only acknowledge it exists when designing the staging hop boundary.
