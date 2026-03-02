---
name: ship
description: Ship an approved feature to production. Merges feature/pN → main → pushes → Vercel deploys → closes spec (status: all-done, moves to features/done/).
when_to_use: When a feature is approved for production and lives on a feature branch.
---

# /ship

Ship an approved feature to production.

```
/ship p422
/ship p425
```

---

## What it does

1. **Find the branch** — looks for `feature/pN*` or `feature/pN-*`

**1a. Divergence check** — run `git rev-list --count main..feature/pN-*` (ahead) and `git rev-list --count feature/pN-*..main` (behind).
- If behind-count > 20: warn "Branch is N commits behind main — rebase or manual merge needed." Propose:
  **(A) Rebase:** `git rebase main` on feature branch, resolve conflicts, then proceed normally.
  **(B) Already merged manually:** Ask "Was this already merged to main? If so, reply 'spec-only' to run spec closure + branch cleanup only (steps 7-9), skipping the merge."
- Wait for user choice. **Step 7 (spec closure) is mandatory regardless of which path is chosen.**
- If user replies 'spec-only': skip steps 2-6, jump directly to step 7.

2. **Verify clean state** — no uncommitted changes on the feature branch
2.5. **Check spec status** — read the spec's `status` frontmatter field:
   - `done` → proceed (spec was manually approved after UAT — happy path)
   - `qa` → ask: "pN spec is still in `qa` — you haven't marked it done after UAT. Ship anyway? (y/n)"
   - anything else (backlog, in-progress, etc.) → ask: "pN spec is in `{status}` — this doesn't look ready to ship. Proceed anyway? (y/n)"
3. **Run pre-commit checks** — `./scripts/pre-commit-checks.sh`
4. **Merge to main** — `git merge feature/pN --no-ff` (preserves branch history)
5. **Push** — `git push origin main` → Vercel auto-deploys
6. **Confirm** — report the deployment URL
7. **Close the spec** — move spec to `features/done/`, update frontmatter:
   - `status: all-done`
   - `completed_at: YYYY-MM-DD`
   - Remove `delivery_stage: uat` line
   ```bash
   ls -d features/done/*/ 2>/dev/null | sort -V | tail -1  # find current sprint folder
   mkdir -p features/done/{folder}/uat
   git mv features/pN_name.md features/done/{folder}/
   git mv features/uat/pN.md features/done/{folder}/uat/ 2>/dev/null || true
   ```
   **Guard — verify the move landed correctly (substitute actual P-number, e.g. p422):**
   ```bash
   git status --short | grep "^[RAMD].*features/p422"
   ```
   Expected: one `R` line showing `features/p422_name.md → features/done/{folder}/p422_name.md`.
   If the original still shows as `D` with no corresponding `A` in `done/`, the `git mv` failed — stop and investigate before committing.
   Commit: `chore: close pN — {title}`
8. **Run fix-kanban** — Invoke `/slava:maintain:fix-kanban`
9. **Clean up** — delete the local feature branch
10. **Ask — two questions in one message:**
    "Run /verify first? (y = visual QA of the live site against acceptance criteria, recommended for any UI change / n = skip)
    Capture learnings with /kdd? (y/n)"

    If user picks y for /verify → invoke `/verify p{N}` immediately before /kdd.

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
- The pre-push git hook will still prompt for final confirmation (human in the loop)

---

## If you're on main (no feature branch)

For small work committed directly to main, just say "push" — no need for /ship.
/ship is specifically for merging a feature branch.

---

## After shipping

- Vercel deployment takes ~60s — check claritypledge.com
- The spec is closed by /ship step 7 — /dev leaves it at `delivery_stage: uat`, NOT done. If the spec is still in `features/` after /ship completes, step 7 failed — investigate before continuing.
- `/verify` is prompted at step 10 — run it for any UI change. Skipping is valid for backend-only changes.

---

## Related

- `/dev` — implements the feature and creates the branch
- `/verify` — visual QA after shipping
- `/status` — see what branches are in flight
