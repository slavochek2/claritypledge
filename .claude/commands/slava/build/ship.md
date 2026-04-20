---
name: ship
description: Ship an approved feature to production. Merges feature/pN → main → closes spec (status: all-done, moves to features/done/). Push is a separate step.
when_to_use: When a feature is approved for production and lives on a feature branch.
version: 1.0.0
---

# /ship

Ship an approved feature to production.

```
/ship p422
/ship p425
```

---

## Pipeline Stamp (P659)

Before any other work in this skill:
1. Read spec frontmatter
2. Set `delivery_stage: ship`
3. Append `ship` to `pipeline_ran` inline list. Edit pattern: match `pipeline_ran: [existing, items]`, replace with `pipeline_ran: [existing, items, ship]`. If `pipeline_ran` doesn't exist, add `pipeline_ran: [ship]`. Always inline format.
4. **Predecessor check:** If `pipeline_plan` exists, find the skill before `ship` in the plan. If that skill is NOT in `pipeline_ran` (exact match) → stop: "Run `/{predecessor}` first." Skip check if: (a) `pipeline_plan` absent, (b) this skill is first in plan, (c) `pipeline_ran` absent/empty and this is first planned skill.
5. If this skill is NOT in `pipeline_plan` → warn: "This skill wasn't in the planned flow. Proceed anyway?"

---

## What it does

### Gate Phase — silent unless something's wrong

Run all gates, collect results. Only prompt the user on failures. The happy path is zero prompts.

1. **Find the branch** — looks for `feature/pN*` or `feature/pN-*`

**1a. Divergence check** — run `git rev-list --count main..feature/pN-*` (ahead) and `git rev-list --count feature/pN-*..main` (behind).
- If behind-count ≤ 20: record `✓ {behind} commits behind main (cherry-pick handles it)` — proceed silently.
- If behind-count > 20: **STOP** — warn "Branch is N commits behind main — rebase or manual merge needed." Propose:
  **(A) Rebase:** `git rebase main` on feature branch, resolve conflicts, then proceed normally.
  **(B) Already merged manually:** Verify by running `git log --oneline main | grep <tip-sha>` (where `<tip-sha>` is the feature branch tip from `git rev-parse feature/pN-*`). Only declare "already merged" if the SHA appears in main's log — never infer from the feature branch log. If confirmed, reply 'spec-only' to run spec closure + branch cleanup only (steps 5-7), skipping the merge.
- **Step 5 (spec closure) is mandatory regardless of which path is chosen.**
- If user replies 'spec-only': skip steps 2-4, jump directly to step 5.

2. **Verify clean state** — run `git status --short` on the feature branch.
- Clean: record `✓ Clean worktree` — proceed silently.
- Dirty: **STOP** — list uncommitted files, ask: "Commit them before merging, or discard? (commit / discard / abort)". Do not proceed to merge with a dirty worktree — uncommitted review fixes will be silently lost.

2.5. **Check spec status** — read the spec's `status` frontmatter field:
   - `qa` or `done` → record `✓ Status: {status}` — proceed silently.
   - anything else → **STOP** — ask: "pN spec is in `{status}` — this doesn't look ready to ship. Proceed anyway? (y/n)"

2.7. **Check code review ran** — look for `.finish-reviewed` file.
   - Exists and newer than latest commit on branch → record `✓ Code reviewed (.finish-reviewed fresh)` — proceed silently.
   - Missing or stale → **STOP** — "No code review artifact found. This is normal if you coded without `/dev`. Proceed? (y/n)". If user says "run it", invoke `/finish` and wait for completion before proceeding.

3. **Run pre-commit checks** — `./scripts/pre-commit-checks.sh`
   - Pass → record `✓ Pre-commit checks passed` — proceed silently.
   - Fail → **STOP** — show output, fix issues.

3.5. **Check Pre-deploy Checklist** — read the spec and look for a `## Pre-deploy Checklist` section.
   - No section → record `✓ No pre-deploy checklist` — proceed silently.
   - Section exists → **STOP** — show each item, ask: "These infra steps must be done before pushing. Have they all been applied to prod? (y = proceed / n = stop and apply them first)". If user says "n": stop. Do NOT merge.

3.6. **Deploy manifest check** — run `./scripts/check-deploy-manifest.sh --env prod`.
   - No drift → record `✓ No deploy drift` — proceed silently.
   - Drift detected → **STOP** — show output and fix commands. Ask: "Deploy these before merging? (y = run the fix commands now / n = stop, I'll handle it manually)". If user says "y", run the suggested commands, re-run check to confirm. Do NOT merge with drift.
   - **Manifest stamp ordering:** If deploying migrations produces an updated `supabase/deploy-manifest.json`, commit that stamp on the **feature branch** (from inside the worktree), NOT directly on main. Stamping to main before merge creates a manifest conflict when the feature branch is later rebased onto main — a predictable failure every time. The stamp travels to main naturally via the merge in step 4.

**Gate report** — if all gates passed, print the summary and proceed immediately (no prompt):
```
/ship pN — all gates passed.
  ✓ Clean worktree
  ✓ Status: qa
  ✓ Code reviewed (.finish-reviewed fresh)
  ✓ Pre-commit checks passed
  ✓ No pre-deploy checklist
  ✓ No deploy drift
  ✓ 3 commits behind main (cherry-pick handles it)
Cherry-picking...
```

### Merge Phase

3.7. **Collect feature commits** — get the list of commits to cherry-pick onto main:
   ```bash
   # From inside the worktree / feature branch:
   git log --oneline main..HEAD
   ```
   Note the SHAs in order (oldest first). These are the commits that will land on main.

3.8. **Pre-cherry-pick collision sweep** — untracked files in main's working tree that overlap with the incoming commits cause cherry-pick to abort. Check before switching branches:
   ```bash
   # From feature branch: files the cherry-pick will write
   INCOMING=$(git diff --name-only main..HEAD)
   # From main repo root: untracked files
   UNTRACKED=$(git -C ~/Projects/public/claritypledge ls-files --others --exclude-standard)
   # Intersection
   COLLISIONS=$(comm -12 <(sort <<<"$INCOMING") <(sort <<<"$UNTRACKED"))
   ```
   For each collision:
   - Check if gitignored: `git check-ignore -q <path>` → if yes, skip (cherry-pick won't touch it).
   - Compare content: `diff <(cat ~/Projects/public/claritypledge/<path>) <(git show HEAD:<path>)`
     - **Identical** → `rm ~/Projects/public/claritypledge/<path>` and log: `Removed stale untracked <path> (matches incoming)` — this is the common case when a spec was created in main's WD during /fix and committed on the feature branch.
     - **Different** → **STOP** — show the diff, ask: "Untracked main/<path> differs from incoming commit. (keep-main / replace-with-incoming / abort)". Never silently overwrite.
   - If `COLLISIONS` is empty: record `✓ No untracked collisions` and proceed silently.

   **Note:** `scripts/` and `supabase/migrations/` are symlinked in worktrees — they cannot collide. This check is primarily for `features/`, `src/`, `e2e/`, and `docs/`.

4. **Cherry-pick onto main** — switch to main, cherry-pick each feature commit in order:
   ```bash
   git checkout main   # (from main repo root if in a worktree: cd ~/Projects/public/claritypledge)
   HEAD_BEFORE=$(git rev-parse HEAD)   # capture main's tip — used for concurrent-session drift detection
   git cherry-pick <sha1> <sha2> ...   # oldest → newest
   ```
   Cherry-pick will not touch staged files or other worktrees' uncommitted changes, but CAN fail on untracked files — step 3.8 handles that. If a conflict arises, resolve it, `git add`, and `git cherry-pick --continue`.

   **If `--abort` was run** (by you on user instruction, or by a concurrent session — `--abort` is banned per git.md without explicit user instruction):
   ```bash
   HEAD_AFTER=$(git rev-parse HEAD)
   if [ "$HEAD_BEFORE" != "$HEAD_AFTER" ]; then
     echo "HEAD moved — concurrent session landed commits. Re-verify pre-cherry-pick stamps."
     git log --oneline "$HEAD_BEFORE"..HEAD  # show what the concurrent session added
   fi
   ```
   If HEAD moved: re-check that every commit you made to main before the cherry-pick (spec stamps, manifest updates) is still present. Re-commit any that are missing — these stamps are idempotent, so re-committing is always safe.

   After cherry-pick: `git branch -D feature/pN` (force-delete is expected — the branch tip was never merged, only its commits were replayed).
5. **Close the spec** — move spec to `features/done/`, update frontmatter:
   - `status: all-done`
   - `completed_at: YYYY-MM-DD`
   - Remove `delivery_stage` line (any value — not just `uat`)
   - Keep `pipeline_plan`, `pipeline_ran`, `pipeline_skipped` in frontmatter (do not remove them)
   **Ordering is mandatory — do steps in this exact sequence to land in one commit:**
   ```bash
   ls -d features/done/*/ 2>/dev/null | sort -V | tail -1  # find current sprint folder
   mkdir -p features/done/{folder}/uat
   git mv features/pN_name.md features/done/{folder}/    # 1. stage the rename FIRST
   # UAT file may be untracked (git mv fails on untracked) — cp+add+rm is equivalent
   git mv features/uat/pN.md features/done/{folder}/uat/ 2>/dev/null || \
     (cp features/uat/pN.md features/done/{folder}/uat/pN.md && git add features/done/{folder}/uat/pN.md && rm features/uat/pN.md) || true
   # 2. Edit frontmatter on the file AT ITS NEW LOCATION (features/done/{folder}/pN_name.md)
   # 3. git add + commit both together — rename + frontmatter in one commit
   ```
   **Guard — verify the move landed correctly (substitute actual P-number, e.g. p422):**
   ```bash
   git status --short | grep "^[RAMD].*features/p422"
   ```
   Expected: one `R` line showing `features/p422_name.md → features/done/{folder}/p422_name.md`.
   If the original still shows as `D` with no corresponding `A` in `done/`, the `git mv` failed — stop and investigate before committing.
   Commit: `chore: close pN — {title}`
6. **Run fix-kanban** — Invoke `/slava:maintain:fix-kanban`
7. **Clean up** — delete the local feature branch
7a. **Worktree cleanup** — run `git worktree list | grep "feature/p{N}"` (substitute actual P-number, e.g. `feature/p470`). If a worktree for this feature branch exists (e.g., `.claude/worktrees/w2`), run `git worktree remove --force .claude/worktrees/wN` from the **main repo root** (never from inside the worktree). If it fails, report and skip — do not block the ship. For orphaned directories not in the list: `git worktree prune && rm -rf .claude/worktrees/wN`.
7b. **Main worktree branch guard** — verify the main worktree is on `main`:
   ```bash
   git branch --show-current  # must be "main"
   ```
   If not on `main`, run `git checkout main`. This prevents the main worktree from drifting to a feature branch after branch-only fixes that don't use worktrees.
8. **Push and branch cleanup** — pre-approved by ship invocation, run without asking:
   ```bash
   git push origin main
   git branch -d feature/pN-*
   ```

9. **Ask — two questions in one message:**
    "Run post-deploy smoke test? (y = `/verify pN` against prod — recommended for UI changes / n = skip)
    Capture learnings with /kdd? (y/n)"

    If user picks y for smoke test → invoke `/verify p{N}` (will auto-detect PRODUCTION mode on main).

---

## Usage

```bash
/ship p422                    # ship feature/p422-* branch
/ship p422 p425               # ship multiple features at once (sequential)
```

---

## Safety checks

- Refuses if you're not on `main` after merge (something went wrong)
- Refuses if pre-commit checks fail — fix first, then retry

---

## If you're on main (no feature branch)

For small work committed directly to main, just say "push" — no need for /ship.
/ship is specifically for merging a feature branch.

---

## After shipping

- The spec is closed by /ship step 5 — /dev leaves it at `delivery_stage: dev`, NOT done. If the spec is still in `features/` after /ship completes, step 5 failed — investigate before continuing.
- Step 8 offers a post-deploy smoke test (`/verify` in production mode). Recommended for UI changes, skippable for backend-only.
- **Push and branch cleanup are pre-approved by `/ship` invocation** — run `git push origin main` and `git branch -d feature/pN-*` without asking. The user approved ship; these are its completion steps. Vercel auto-deploys after push.
- **Prod migrate is NOT pre-approved** — `./scripts/migrate.sh --env prod` has its own blast radius (schema changes, RLS). Always gate it separately.

---

## Related

- `/dev` — implements the feature and creates the branch
- `/verify` — visual QA after shipping
- `/status` — see what branches are in flight
