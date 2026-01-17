---
name: kdd
description: Record decisions to docs/DECISIONS.md. Run manually after finishing features with interesting trade-offs, when making architectural choices worth remembering, or when confusion about past decisions signals one should have been recorded.
---

# Knowledge-Driven Development (KDD)

Capture decisions that matter. Git tracks *what* changed; this captures *why*.

## Workflow

1. Show recent commits on current branch:
   ```bash
   git log --oneline -10
   ```

2. Ask: "Any decisions worth recording? [Enter to skip]"

3. If user provides context, append to `docs/DECISIONS.md` using this format:

```markdown
## YYYY-MM-DD: Decision Title

**Context:** Why this came up
**Decision:** What we chose
**Alternatives rejected:** What we didn't choose
**Consequences:** What this means going forward
```

4. Confirm: "Appended to docs/DECISIONS.md"

## Rules

- Append at TOP of file (after the header section, before existing entries)
- Never edit old entries - append-only
- If user skips, just acknowledge and exit
- Keep entries concise but complete
