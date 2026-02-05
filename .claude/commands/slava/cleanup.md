# /cleanup

Organize feature docs by moving `status: done` and `status: archived` files to dated subfolders.

## What It Does

1. **Find** features with `status: done` → move to `features/done/{N}_{mon}_{yy}/`
2. **Find** features with `status: archived` → move to `features/archive/{N}_{mon}_{yy}/`
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
    <action>Scan features/*.md for frontmatter with status: done or status: archived</action>
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
