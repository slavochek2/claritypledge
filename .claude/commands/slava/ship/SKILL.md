# /ship

Full feature shipping pipeline: review → fix → test → commit → close.

> **Principle:** One command to ship a feature. Orchestrates `/review-all` and `/done` with automated fixes and quality gates.

## Usage

```bash
/ship p131              # Ship feature P131
/ship                   # Auto-detect from branch name
```

## What This Skill Does

1. **Review** → Calls `/review-all` skill internally (parallel reviews)
2. **Auto-fix HIGH** → Fixes all HIGH severity issues automatically
3. **Ask about MEDIUM** → Presents MEDIUM issues, you decide (checkpoint)
4. **Quality gate** → Runs `npm run lint && npm test && npm build`
5. **Commit** → Creates commit if all checks pass
6. **Close** → Calls `/done` skill to move spec and update frontmatter
7. **Report** → Summary of what shipped

## What This Skill Does NOT Do

- Run individual reviews in isolation (use `/review-all` for that)
- Close features without review (use `/done` for that)
- Ship with failing tests (hard requirement)

---

## Execution Steps

### Step 1: Identify Feature

If argument provided (e.g., `p131`):
```bash
ls features/*p131*.md features/[*]*p131*.md 2>/dev/null
```

If no argument, infer from branch:
```bash
git branch --show-current  # e.g., p131-manual-points → extract p131
```

If not found or multiple matches, ask user to clarify.

### Step 2: Pre-flight Checks

Before starting the pipeline:

```bash
# Check for uncommitted changes
git status --porcelain

# Verify we're not on main
git branch --show-current

# Verify dev server is running (needed for visual verification)
curl -s http://localhost:5001 > /dev/null && echo "✓" || echo "Start dev server with: npm run dev"
```

If dev server not running, ask: "Visual verification needs dev server. Start it in background? (y/n)"

If yes:
```bash
npm run dev &
sleep 5  # Give it time to start
```

### Step 3: Run Review

Invoke `/review-all` skill by calling the Skill tool:

```
Skill(skill="slava:review-all")
```

This returns findings grouped by severity (HIGH / MEDIUM / LOW).

**If `/review-all` fails or times out:**
- Report the error
- Ask: "Continue without full review? (y/n)"
- If no, exit

### Step 4: Auto-Fix HIGH Issues

For each HIGH severity issue from the review:

1. Read the file
2. Apply the fix
3. Verify with lint on that specific file:
   ```bash
   npm run lint -- --fix [file_path]
   npx tsc --noEmit [file_path]
   ```

**If any HIGH fix fails:**
- Stop the pipeline
- Report what succeeded and what failed
- Exit (don't proceed to MEDIUM)

After all HIGH fixes:
```bash
# Quick sanity check
npm run build
```

**If build fails:**
- Report the error
- Ask: "Build failed after HIGH fixes. Debug now or abort ship? (debug/abort)"

### Step 5: Ask About MEDIUM Issues (Checkpoint)

Present MEDIUM issues to user:

```
Fixed 3 HIGH issues:
- [✓] profile-page.tsx:195 — Added error handling
- [✓] bottom-nav.tsx:42 — Added active state
- [✓] pledge-page.tsx:361 — Fixed history fallback

Found 4 MEDIUM issues:

1. [Code] pledge-page.tsx:58 — navigate() in render could cause strict mode issues
2. [UX] Profile page — No loading skeleton (brief flash of empty content)
3. [Design] Pledge page back button — Inconsistent styling vs profile page
4. [Code] Consider extracting back button to shared component

Fix any MEDIUM issues? Options:
1. Fix all (4 issues)
2. Fix specific (enter numbers, e.g., "1,3")
3. Skip — ship as-is

Which option?
```

User chooses → apply fixes using same process as HIGH (read, fix, lint, build).

**If user skips MEDIUM:**
- Note in commit message: "Known tech debt: [list of skipped MEDIUM issues]"

### Step 6: Quality Gate

Run full pre-commit checks:

```bash
./scripts/pre-commit-checks.sh
```

**If checks fail:**

Common failures and fixes:
- **Unrelated test failures:** Stash unrelated changes, run again
- **Type errors:** Report them, ask user to review
- **Lint errors:** Should be impossible (we linted after each fix), but if happens, report and ask

```bash
# If unrelated files causing issues
git stash push -m "temp: unrelated changes during p{N} ship" -- [unrelated_files]
./scripts/pre-commit-checks.sh  # Try again
```

**If still fails after stash:**
- Report the error
- Exit ship pipeline
- Unstash: `git stash pop`

### Step 7: Commit

```bash
git add [all_fixed_files]

git commit -m "$(cat <<'EOF'
feat(p{N}): {spec_title}

Review findings:
- Fixed {count} HIGH issues
- Fixed {count} MEDIUM issues
- {count} LOW issues deferred

{If any MEDIUM skipped, list them here as tech debt notes}

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>
EOF
)"
```

**If commit fails (pre-commit hooks):**
- If hooks fail due to unrelated files: use stash strategy (Step 6)
- If hooks fail due to actual issues in committed files: abort, report error

**After successful commit:**
```bash
git log -1 --stat  # Show what was committed
```

### Step 8: Close Feature

Invoke `/done` skill:

```
Skill(skill="slava:done", args="p{N}")
```

This will:
- Update spec frontmatter (status: done, completed_at)
- Move spec to features/done/{folder}/
- Commit the move
- Prompt for /kdd

**If `/done` fails:**
- Report the error
- Note: "Feature was committed but not closed. Run `/done p{N}` manually."

### Step 9: Report Summary

```
## ✓ Shipped P{N}: {Spec Title}

**Review Results:**
- Design: 2 issues fixed
- Code: 3 issues fixed
- UX: 1 issue fixed
- Visual: All acceptance criteria verified

**Quality:**
- Lint: ✓ Pass
- Tests: ✓ 45/45 passed
- Build: ✓ Pass

**Commits:**
- feat(p{N}): {title} ({commit_hash})
- chore: close P{N} ({commit_hash})

**Spec Status:**
- Moved to features/done/5_feb_26/
- Acceptance criteria: 5/5 verified

**Deferred (LOW priority):**
- Consider extracting back button to shared component
- Add tooltip to "Start Session" button

Next steps:
- Run /kdd if this had interesting learnings
- Merge branch to main when ready
```

---

## Edge Cases

- **Spec not found:** Exit with error
- **No uncommitted changes:** Ask "Nothing to review. Close feature without changes? (y/n)"
- **Already on main:** Warn and ask for confirmation before proceeding
- **Dev server not running:** Offer to start it (visual verification needs it)
- **Review finds 0 issues:** Skip fix steps, proceed to quality gate
- **User aborts at MEDIUM checkpoint:** Exit cleanly, don't commit

## Quality Guarantees

Before shipping, ALL of these must pass:
- ✓ All HIGH issues fixed
- ✓ ESLint clean
- ✓ TypeScript compiles
- ✓ All tests pass
- ✓ Build succeeds
- ✓ Pre-commit hooks pass

If any fail, ship aborts. No partial ships.

## Related Skills

- `/review-all` — Run review without shipping
- `/done` — Close feature without review
- `/kdd` — Capture knowledge (recommended after ship)
