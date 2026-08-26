---
name: fix-kanban
description: Scan all features/p*.md files, auto-fix frontmatter issues, report anything needing manual attention
when_to_use: "When feature frontmatter looks broken. Run standalone or via /weekly."
version: 1.0.0
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

2. **Move misplaced files** — scan `features/*.md` (root-level only) and relocate any that belong elsewhere:

   - `status: done` or `status: all-done` → move to the current sprint folder + move UAT:

     **Detect current sprint:** Run `ls -d features/done/*/` and output the list. Read `cat features/done/CURRENT_SPRINT 2>/dev/null` — if the file exists, use that path as DEST. If not, ask the user which sprint folder to use before proceeding. Never auto-guess sprint from sort order (folder naming is inconsistent).

     ```bash
     DEST=$(cat features/done/CURRENT_SPRINT 2>/dev/null)
     if [ -z "$DEST" ]; then
       echo "Available sprint folders:"; ls -d features/done/*/
       echo "→ Set DEST manually or create features/done/CURRENT_SPRINT with the path"
       exit 1
     fi
     mkdir -p "$DEST/uat"
     for f in features/p*.md; do
       status=$(grep "^status:" "$f" | head -1 | awk '{print $2}')
       if [[ "$status" == "done" || "$status" == "all-done" ]]; then
         pnum=$(basename "$f" | grep -oE '^p[0-9]+')
         git mv "$f" "$DEST"
         [[ -f "features/uat/${pnum}.md" ]] && git mv "features/uat/${pnum}.md" "$DEST/uat/"
       fi
     done
     ```
   - `status: rejected` → move to `features/archive/`:
     ```bash
     for f in features/p*.md; do
       status=$(grep "^status:" "$f" | head -1 | awk '{print $2}')
       [[ "$status" == "rejected" ]] && git mv "$f" features/archive/
     done
     ```

   **Archive commit guard:** `git mv` stages BOTH sides of a rename (destination add + source delete). When committing, you MUST include the original source paths in the commit command — listing only `features/archive/pN_*.md` leaves the source deletions staged-but-uncommitted, causing a downstream `git merge` to refuse with "local changes would be overwritten." Always verify with `git diff --cached --name-only` and include every staged path.

3. Bust the kanban cache so cards appear immediately:
   ```bash
   curl -s "http://localhost:9050/api/features?refresh=true" > /dev/null 2>&1 && echo "✓ Kanban cache refreshed" || echo "(Kanban not running — open it and use the ↻ button to refresh)"
   ```

4. Show the output to the user.

5. If there are manual fix items (`⚠`), list them clearly and ask the user to resolve them.

6. If files were auto-fixed, suggest a commit:
   ```
   Good checkpoint — want to commit the frontmatter fixes?
   ```
