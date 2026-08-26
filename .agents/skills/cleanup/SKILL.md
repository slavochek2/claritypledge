---
name: cleanup
description: Organize feature docs by moving done/archived specs into dated subfolders with git mv
when_to_use: "When features/done/ has unorganized specs that need dated subfolder archiving."
version: 1.0.0
---

## Dispatch

**Phase A — Discovery (spawn → present → wait for approval):**
Spawn Agent tool: `model: "sonnet"`, `subagent_type: "general-purpose"`.
Prompt: Steps 1 + 2 (discovery only) from the workflow below. Working dir: `<cp-root>`.
Collect the output. Present the "Files to organize" report to the user. Ask: "Proceed with moving these files? (y/n)"

**Phase B — Execute (only after user approves):**
Spawn a second Agent tool: `model: "sonnet"`, `subagent_type: "general-purpose"`.
Prompt: Steps 3–4 from the workflow below, with the exact file list from Phase A included inline.
Report subagent output verbatim.

# /cleanup

Organize feature docs by moving `status: all-done` and `status: rejected` files to dated subfolders.

## What It Does

1. **Find** features with `status: all-done` → move to `features/done/{N}_{mon}_{yy}/`
2. **Find** features with `status: rejected` → move to `features/archive/{N}_{mon}_{yy}/`
3. **Use `git mv`** so history is preserved
4. **Report** what was moved

## Folder Naming

Format: `{N}_{mon}_{yy}` (e.g., `5_feb_26`, `6_mar_26`)
- Number prefix ensures chronological sort in IDE
- Continues existing pattern

## Instructions

```xml
<workflow>
  <step n="1" goal="Discover files to organize">
    <action>Find the highest numbered folder in features/done/ and features/archive/ to determine next number</action>
    <action>Scan features/*.md for frontmatter with status: all-done or status: rejected</action>
    <action>Build list of files to move with their destinations</action>
  </step>

  <step n="2" goal="Report plan">
    <output>
      ## Files to organize

      **Moving to features/done/{folder}:**
      - [list files with status: done]

      **Moving to features/archive/{folder}:**
      - [list files with status: archived]

      **No action needed:**
      - [count] files without done/archived status stay in place
    </output>
    <check if="no files to move">
      <action>Report "Nothing to organize - all files are already in place"</action>
      <action>Exit workflow</action>
    </check>
    <ask>Proceed with moving these files? (y/n)</ask>
  </step>

  <step n="3" goal="Execute moves">
    <action>Create destination folders if they don't exist: mkdir -p features/done/{folder} features/archive/{folder}</action>
    <action>For each file: git mv {source} {destination}</action>
    <action>Report each move as it happens</action>
  </step>

  <step n="4" goal="Verify and report">
    <action>Run git status to show the staged renames</action>
    <output>
      ## Done!

      Moved {N} files. Git sees them as renames (history preserved).

      Next: commit with `git commit -m "chore: organize feature docs into {folder}"`
    </output>
  </step>
</workflow>
```

## What It Does NOT Do

- Delete anything (you want to keep files)
- Touch files without explicit `status: done` or `status: archived`
- Auto-commit (you decide when to commit)

## Branch Deletion Safeguard

This skill moves feature docs — it does not delete branches. If you are about to delete branches as part of a cleanup sweep, always run the unreleased-commit check first:

See `docs/technical/git-workflow.md → Before Deleting Branches` for the exact command.

Branches with unmerged commits must be inspected before deletion — UAT and feature branches often contain docs, KDD entries, or architecture notes that were never merged to main.

## Example

```bash
/cleanup
```

Output:
```
## Files to organize

**Moving to features/done/6_mar_26:**
- p115_new_feature.md (status: done)
- p116_bug_fix.md (status: done)

**Moving to features/archive/6_mar_26:**
- p90_old_idea.md (status: archived)

**No action needed:**
- 5 files without done/archived status stay in place

Proceed with moving these files? (y/n)
```

## Tips

- Add `status: done` to frontmatter when feature ships to production
- Add `status: archived` when abandoning a feature
- Run `/cleanup` periodically to keep features/ folder tidy
