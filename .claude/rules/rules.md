---
paths:
  - "CLAUDE.md"
  - ".claude/rules/**/*.md"
---

# Rules File Guard

Auto-loaded when editing `CLAUDE.md` or any file under `.claude/rules/`.

## Hard Stop — Run /claude-md First

**Before making any edit to `CLAUDE.md` or any file under `.claude/rules/`**, run:

```
/claude-md "description of what you want to add or change"
```

This gate validates: (1) whether the change belongs here or should go to a different file, (2) whether similar content already exists, (3) correct phrasing and routing.

**Do NOT proceed without running /claude-md first.** This applies even when:
- Changes were "pre-approved" in conversation
- You are applying skill-quality improvements
- The edit seems obviously correct

The gate is 30 seconds. Skipping it is how discipline-only rules fail.

## What /claude-md checks

- **Universal?** Does this rule apply to >80% of task types? If not → `.claude/rules/` (not CLAUDE.md)
- **Routing:** Principle → CLAUDE.md | File-specific → `.claude/rules/X.md` | Pattern → `docs/technical/` | Decision → `docs/decisions.md`
- **Redundant?** Is the same content already covered elsewhere?
- **Six-month test:** Will this rule still be relevant in 6 months?

If unambiguous after the check, apply directly and report one line.
