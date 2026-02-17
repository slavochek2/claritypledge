---
name: fix-kanban
description: Scan all features/p*.md files, auto-fix frontmatter issues, report anything needing manual attention
---

# Fix Feature Frontmatter

Runs `scripts/fix-frontmatter.sh` against all `features/` files (including `done/`, `archive/`, subdirs).

## What It Does

**Auto-fixes (no judgment needed):**
- `status` casing → lowercase + normalize (`Week` → `week`, `in_progress` → `in-progress`)
- Missing `status` → `backlog`
- Missing `tags` → `tags: []`
- Missing `rank` → `max_rank + 1.0`
- Missing `created_date` → from `git log`

**Reports but does NOT auto-fix:**
- Missing `type` field (requires judgment: story | bug | task | comment)
- Duplicate P-numbers
- Malformed/missing frontmatter

## Steps

1. Run the fixer:
   ```bash
   ./scripts/fix-frontmatter.sh
   ```

2. Show the output to the user.

3. If there are manual fix items (`⚠`), list them clearly and ask the user to resolve them.

4. If files were auto-fixed, suggest a commit:
   ```
   Good checkpoint — want to commit the frontmatter fixes?
   ```
