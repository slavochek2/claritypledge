---
name: revert-feature
description: Surgically remove a specific feature from the codebase without touching unrelated code. Prevents the "reverted too far" mistake.
when_to_use: When a feature needs to be pulled back from prod (not approved, reverted by mistake, etc.)
version: 1.0.0
---

# /revert-feature

Safely remove a specific feature from prod without harming other features.

```bash
/revert-feature p422
/revert-feature p425
```

---

## The Mistake This Prevents

Restoring files to an old baseline (`git checkout OLD_COMMIT -- file`) wipes ALL changes made to that file since that commit — including other features.

**Never do this.** This skill forces surgical removal instead.

---

## Strategy

```
Feature has branch?
  YES → git revert the branch commits (clean, surgical)
  NO  → manual surgical mode (analyze commits, remove only feature code)
```

---

## Step 1: Gather facts

```bash
# Find the feature branch
git branch --all | grep "pN\|pN-"

# Find commits that mention this P-number
git log --oneline --all | grep -i "pN\|feat(pN)\|fix(pN)"

# Find the feature spec
find features/ features/done/ -name "pN_*.md" 2>/dev/null | head -5
```

Report findings:
- Branch found / not found
- Which commits mention pN
- Whether commits are CLEAN (only pN changes) or MIXED (pN + other changes)

---

## Step 2: Choose removal path

### Path A — Clean branch exists (recommended post-branch-discipline)

Feature lives on `feature/pN-*` branch. Commits are isolated.

```bash
# Find the merge base (where the branch diverged from main)
BRANCH=$(git branch --all | grep "pN" | head -1 | xargs)
MERGE_BASE=$(git merge-base main $BRANCH)

# Revert all commits on the feature branch (in reverse order)
git log --oneline $MERGE_BASE...$BRANCH | awk '{print $1}' | while read sha; do
  git revert --no-commit $sha
done
git commit -m "revert(pN): remove feature from prod — not approved for release"
```

### Path B — No clean branch (index collision, direct-to-main commits)

Feature code is mixed with other features in commits. Must surgically edit.

For each file that contains pN code:

1. **New files** (created by pN, entire file is the feature) → `git rm -rf`
2. **Modified files** (pN added code to an existing file) → edit file to remove pN sections

**For modified files:**
- Read the file
- Identify sections added by pN (imports, state, JSX, functions)
- Remove ONLY those sections
- Verify the file still compiles (`npm run build`)
- Never restore to old baseline — only remove the identified code

```bash
# For new files:
git rm -rf src/app/components/feature-specific/
git rm -rf supabase/functions/feature-function/
git rm -f src/app/data/feature-service.ts

# For modified files: surgical edit using Edit tool
# Remove imports, state variables, and JSX added by pN
```

---

## Step 3: Verify removal is complete

```bash
# Check no feature code remains
grep -r "FeatureComponent\|featureService\|p422\|p425" src/ --include="*.ts" --include="*.tsx" | grep -v ".test." | grep -v "spec"

# Build must pass
npm run build

# Tests must pass
npm test
```

If build or tests fail: the removal broke something. Debug root cause before committing.

---

## Step 4: Commit and close the feature spec

```bash
./scripts/pre-commit-checks.sh

git commit -m "revert(pN): remove [feature name] — not approved for release"
```

If the feature spec was in `features/done/`, move it back to `features/` with `status: in-progress` or `status: blocked`:

```bash
git mv features/done/{sprint}/pN_name.md features/pN_name.md
# Edit frontmatter: status: blocked, remove completed_at, add delivery_stage: dev
```

---

## Rules

1. **Never** `git checkout OLD_COMMIT -- file` — this wipes unrelated features from that file
2. **Never** restore a file to a baseline unless you can confirm it contains ZERO changes from other features since that baseline
3. For mixed commits, always prefer surgical removal over revert-commit
4. After removal, always verify with `npm run build && npm test` before committing
5. If a file was restored incorrectly (wrong baseline), restore it immediately: `git checkout HEAD -- file`

---

## Red flags to stop and ask

- The file you're editing has significant changes from OTHER features since the baseline → stop, understand what those changes are before touching anything
- Mixed commits where >3 files are affected — ask user before proceeding
- A file imported by both the feature AND other active code → understand the dependency before removing

---

## Output

```
## Revert: pN complete

**Mode:** Branch revert / Surgical removal

**Files removed (new files deleted):**
- src/app/data/agreements-service.ts
- src/app/components/agreements/

**Files edited (surgical removal):**
- src/app/pages/profile-page-v2.tsx — removed P422 imports + state + ProfileAgreementsSection render
- src/App.tsx — removed 4 routes for Agreement pages

**Build:** ✅ passes
**Tests:** ✅ passes

**Commit:** abc1234 — revert(p422): remove Clarity Partner Agreement

Feature spec moved back to features/ with status: blocked.
```
