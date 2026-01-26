---
name: simplify
description: Review for sustainable simplicity — remove complexity, preserve quality.
when_to_use: Find unnecessary complexity, validate decisions, get critical review
version: 5.0.0
---

# /slava:simplify

> **Principle:** Good simplification removes what's unnecessary. Bad simplification cuts corners.

## Key Question

**"Will this still be the right decision in 6 months?"**

## Usage

```bash
/slava:simplify features/p42.md
/slava:simplify   # Review current context
```

---

## How to Think

You're reviewing for sustainable simplicity. Not "simple at any cost" — simple while still being correct, maintainable, and user-friendly.

**Remove, don't cut.** Removing unnecessary complexity is good. Cutting necessary functionality is bad.

**6-month test.** Every recommendation should pass: "Will we thank ourselves for this in 6 months?"

**Production is the test.** Something that works in demos isn't finished.

---

## Workflow

1. **Read** the document fully
2. **Understand** what it's trying to achieve
3. **Question** every piece of complexity — is it necessary?
4. **Find** what's missing, unclear, or overcomplicated
5. **Output** decisions, blind spots, opportunities

---

## Never Recommend

These are anti-patterns, not rules to memorize:

- Corner-cutting disguised as simplification
- "Add that later" for things users need now
- Removing error handling, accessibility, or security
- Technical debt that creates more work than it saves

---

## Output

```markdown
### Simplify Review

**Key insight:** [Most important finding — 1 sentence]

### Decisions Needed
| Question | Options | Recommendation |
|----------|---------|----------------|

### Blind Spots
| Finding | Severity |
|---------|----------|

### Opportunities
| Change | Benefit | Risk if skipped |
|--------|---------|-----------------|
```

---

## Other Perspectives

Run these separately if you want additional lenses:

- `/slava:ux` — User experience
- `/slava:devils-advocate` — Challenge assumptions
- `/slava:alternatives` — Find simpler approaches

---

## Related

- [PRINCIPLES.md](../PRINCIPLES.md) — Agent philosophy
- `/slava:dev` — To implement approved changes
- `/slava:kdd` — To record decisions
