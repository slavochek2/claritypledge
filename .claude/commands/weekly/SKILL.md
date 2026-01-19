---
name: weekly
description: Weekly review - validate Claude context, flag stale docs, run retro. Run when terminal reminds you.
---

# Weekly Review

Hygiene check for Claude context and quick retrospective.

## Workflow

### 1. Context Health Check

**Check CLAUDE.md file references exist:**
```bash
# Extract paths from CLAUDE.md and verify they exist
grep -oE '\[.*?\]\((src/[^)]+|docs/[^)]+|features/[^)]+|e2e/[^)]+)\)' CLAUDE.md | \
  sed 's/.*(\(.*\))/\1/' | while read path; do
    [[ ! -e "$path" ]] && echo "Missing: $path"
  done
```

Report any missing files.

**Check for stale technical docs (>30 days):**
```bash
find docs/technical -name "*.md" -mtime +30 -exec ls -la {} \;
```

Report any stale files with recommendation: archive or update.

### 2. Worktree Sync Check

```bash
cd /Users/slavochek/Documents && \
for d in claritypledge-{1,2,3,4,5,6,7}; do
  echo -n "$d: "; md5 -q "$d/CLAUDE.md" 2>/dev/null || echo "missing"
done
```

If hashes differ, offer to sync from current worktree.

### 3. Retrospective

Ask the user (one at a time, wait for answers):

1. **What went well this week?**
2. **What was frustrating?**
3. **Any process improvements to make?**

If user identifies improvements, implement them now (update CLAUDE.md, skills, or workflows).

### 4. Update State File

After completing the review:
```bash
date +%Y-%m-%d > ~/.claude_weekly_last_run
```

Confirm: "Weekly review complete. Next reminder in 7 days."

## Output Format

```markdown
## Weekly Review — YYYY-MM-DD

### Context Health
✅ CLAUDE.md references valid (or list missing)
⚠️ Stale docs: X files (or ✅ all current)
✅ Worktrees in sync (or ⚠️ X worktrees differ)

### Retro
**Went well:** [user's answer]
**Frustrating:** [user's answer]
**Improvements:** [user's answer + what was implemented]
```

## Rules

- Run checks first, then retro — don't skip the conversation
- If user identifies improvements, do them now, don't defer
- Keep it under 10 minutes — this is hygiene, not planning
