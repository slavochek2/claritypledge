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

## Subagent Restriction

Subagents (spawned via Agent/Task tool) must **NEVER** edit `CLAUDE.md` or `.claude/rules/*.md`. These files may only be edited by the main conversation agent after running `/claude-md`. Subagents may propose changes as terminal output — the main agent applies them through the gate.

---

## Engineering Tradeoffs Are the Engineer's Call

When two implementation paths produce the same observable behavior (e.g., "patch ComponentA vs add a hook setter"), decide it yourself. Don't surface as a user question. The user arbitrates product ambiguity (semantic meaning, surface scope) — not engineering tradeoffs.

Product-owner question pattern: "should Clear in revealed phase delete the live position only, or also nullify the receiver's letter response?" → ask.

Engineering tradeoff pattern: "useMemo vs no memo", "lift state up vs context", "one commit vs two" → pick the more sustainable path, mention if surprising.
