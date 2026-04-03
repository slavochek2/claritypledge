---
archived_reason: "replaced by /dev auto-close — /dev moves feature to done/ on success automatically"
disable-model-invocation: true
---

# /done

Mark a feature as complete: update spec, move to done/, capture knowledge, commit.

> **Principle:** One command to close a feature. No loose ends.

## Usage

```bash
/done p118              # Auto-finds features/p118*.md or features/*p118*.md
/done                   # Auto-detects from branch name
```

## Steps

### Step 1: Find the Spec

1. If argument given (e.g., `p118`), find matching file:
   ```bash
   ls features/*p118* features/[*]*p118* 2>/dev/null
   ```
2. If no argument, infer from branch name:
   ```bash
   git branch --show-current  # e.g., p117-stories-points-backend → find p117
   ```
3. If multiple matches, ask user to pick.
4. If no match found, report and exit.

### Step 2: Update Frontmatter

Read the spec file. Update frontmatter:

```yaml
---
status: done
completed_at: '{today YYYY-MM-DD}'
# Keep all existing fields (priority, reviews, decisions, etc.)
---
```

If `status` is already `done`, ask: "This spec is already marked done. Continue anyway?"

### Step 3: Check Off Acceptance Criteria

Look for unchecked items in the spec:
- `- [ ]` in "Visual Verification", "Acceptance Criteria", "Success Criteria", or "Testing" sections

For each unchecked item:
- If it was verified during `/review-all` or visual testing this session → check it off
- If unclear → ask user: "Was this completed? [item text]"

If no checklist found, skip this step.

### Step 3.5: UAT Scorecard Gate (P270)

Check if a UAT file exists for this feature:
```
features/uat/p{N}.md
```

If the file exists:
1. Count `⬜` (untested) entries
2. Count `✅` (tested) entries

If **✅ count is 0 AND ⬜ count > 0** (all scenarios untested):
- Warn: "UAT scorecard for P{N} has {count} untested scenarios and none completed. This means no manual acceptance testing was done."
- Ask: "Proceed to close without UAT? (yes/no)"
- If user says no → stop. Do not move to done.
- If user says yes → proceed, but add to the commit message: "Note: UAT not executed"

If file doesn't exist, or ✅ count > 0 → proceed silently.

**Why this gate exists:** P160 was closed with 22 UAT scenarios all marked ⬜. The runtime error would have been caught by UAT scenario UAT-1.1 ("is_private column exists"). See P270 for full root cause analysis.

### Step 4: Move to `features/done/`

Determine destination folder:

1. Find highest numbered folder in `features/done/`:
   ```bash
   ls -d features/done/*/ 2>/dev/null | sort -V | tail -1
   ```
2. Check if current month already has a folder. If yes, use it. If no, create next:
   - Format: `{N}_{mon}_{yy}` (e.g., `5_feb_26`)
   - N = previous highest + 1

3. Move with git:
   ```bash
   mkdir -p features/done/{folder}
   git mv features/{spec_file} features/done/{folder}/
   ```

4. Also move related files (UAT, etc.):
   ```bash
   # If p118_person_avatar.md exists, also check for p118_uat.md
   git mv features/{related_files} features/done/{folder}/ 2>/dev/null
   ```

### Step 5: Prompt for /kdd

```
Feature P118 closed.

Capture learnings with /kdd? Useful if:
- Interesting trade-offs were made
- A pattern emerged worth documenting
- Hypothesis was validated/invalidated

(y/n)
```

If yes → remind user to run `/kdd` after commit (don't auto-run, different skill).

### Step 6: Commit

```bash
git add {moved files}
git commit -m "chore: close P{N} — {spec title}"
```

### Step 7: Report

```
## Done ✓

P118: Person Avatar Consolidation → features/done/5_feb_26/

Changes:
- Frontmatter: status → done, completed_at → 2026-02-05
- Acceptance criteria: 5/5 checked
- Moved to features/done/5_feb_26/

Next:
- /kdd to capture learnings (if applicable)
- Merge branch when ready
```

## Edge Cases

- **Spec already in `features/done/`**: Skip move, only update frontmatter
- **No spec exists**: "No spec found for P{N}. Nothing to close."
- **Multiple specs for same P number**: List them, ask which to close
- **Branch has uncommitted changes**: Warn before proceeding

## What This Skill Does NOT Do

- Run tests or pre-commit checks (that's `/review-all` or `/dev`)
- Merge branches or create PRs
- Auto-run /kdd (prompts, user decides)
