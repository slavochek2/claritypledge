---
status: backlog
type: task
rank: 125468.0
tags: [dx, pre-commit, testing]
created_date: '2026-02-24'
---

# P435: Pre-commit warning for untracked E2E test files

## Summary

Add a check to `scripts/pre-commit-checks.sh` that warns when untracked `e2e/p{N}-*.spec.ts` files exist but aren't staged, and the current branch is `feature/p{N}-*`. Prevents silently committing feature code without the E2E tests that were written for it.

## Problem

P426 had three E2E test files written and sitting untracked when the feature code was committed. They were caught manually (user noticed "did you verify?"). A pre-commit warning would have surfaced this at commit time with zero cognitive overhead.

## Proposed Implementation

In `scripts/pre-commit-checks.sh`, add a new check section:

```bash
>>> Checking for untracked E2E test files on feature branch...
```

Logic:
1. Get current branch: `git branch --show-current`
2. If branch matches `feature/p{N}-*`, extract `{N}`
3. Check for untracked files matching `e2e/p{N}-*.spec.ts` or `e2e/a11y/p{N}-*.spec.ts`
4. If found: print warning (not error — don't block commit):
   ```
   ⚠ Untracked E2E test files for P{N} found but not staged:
     e2e/p{N}-smoke.spec.ts
   Stage them with: git add e2e/p{N}-*.spec.ts
   ```

**Warning, not error:** Don't fail the commit — the test files may legitimately be in progress. Just surface the oversight.

## Test Cases to Validate

- [ ] Main branch commit with no untracked tests → no output (no false positive)
- [ ] Feature branch with all test files staged → no output
- [ ] Feature branch with untracked test file → warning printed, commit proceeds
- [ ] Feature branch with no test files at all → no output (feature may not have E2E tests)
- [ ] Non-feature branch with untracked test files → no output

## Acceptance Criteria

- [ ] Warning fires on `feature/p{N}-*` branches when `e2e/p{N}-*.spec.ts` files are untracked
- [ ] No false positives on main, hotfix, or other non-feature branches
- [ ] Commit is not blocked — warning only
- [ ] `scripts/pre-commit-checks.sh` passes its own existing checks after the addition
