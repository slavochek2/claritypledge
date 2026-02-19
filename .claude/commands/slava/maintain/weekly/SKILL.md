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

**Check CLAUDE.md line count:**
```bash
wc -l CLAUDE.md
```
Flag if over 300 lines. If over 300, note which sections look like candidates for `.claude/rules/` (path-specific) or trimming.

**Check `.claude/rules/` files exist and have valid frontmatter:**
```bash
ls .claude/rules/*.md 2>/dev/null || echo "No rules files found"
```

**Check for stale technical docs (>30 days):**
```bash
find docs/technical -name "*.md" -mtime +30 -exec ls -la {} \;
```

Report any stale files with recommendation: archive or update.

### 2. Sentry Health Check

Check for unresolved production errors using the Sentry MCP:

```
Search for: "unresolved errors from last 7 days"
Organization: 22minds-llc
Region URL: https://de.sentry.io
Project: javascript-react
```

**Triage criteria:**
- **>10 events**: Investigate immediately
- **5-10 events**: Flag for review
- **<5 events**: Note but don't block

Report issues found with brief assessment (code bug vs environment issue).

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
✅ CLAUDE.md line count: X lines (flag if >200)
✅ .claude/rules/ files present (or list missing)
⚠️ Stale docs: X files (or ✅ all current)

### Sentry
✅ No issues >10 events (or ⚠️ X issues need attention)
[List any issues found with brief triage]

### Retro
**Went well:** [user's answer]
**Frustrating:** [user's answer]
**Improvements:** [user's answer + what was implemented]
```

## Rules

- Run checks first, then retro — don't skip the conversation
- If user identifies improvements, do them now, don't defer
- Keep it under 10 minutes — this is hygiene, not planning
