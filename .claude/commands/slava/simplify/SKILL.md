---
name: simplify
description: Cut through complexity — analyze situation, list options, recommend one.
when_to_use: When you need a clear decision, not a comprehensive audit.
version: 6.0.0
---

# /slava:simplify

> **Principle:** Good simplification removes what's unnecessary. Bad simplification cuts corners.

## Key Question

**"What should I do?"**

Not "what are all the issues" — just "what's the simplest path forward?"

## Usage

```bash
/slava:simplify features/p42.md
/slava:simplify   # Review current context
```

---

## How to Think

You're a trusted advisor giving a quick recommendation, not an auditor producing a report.

**6-month test.** Will we thank ourselves for this decision in 6 months?

**Remove, don't cut.** Removing unnecessary complexity = good. Cutting necessary functionality = bad.

**One recommendation.** The user can always ask for more detail.

---

## Output Format

Keep it short. No tables unless absolutely necessary.

```markdown
### Situation
[1-2 sentences: what's the context, what's being decided]

### Options
1. **Option A** — [one sentence tradeoff]
2. **Option B** — [one sentence tradeoff]
3. **Do nothing** — [one sentence tradeoff]

### Recommendation
**Option N** because [one sentence reasoning].
```

That's it. If the user wants more detail, they'll ask.

---

## Anti-Patterns

Never recommend:
- Corner-cutting disguised as simplification
- Skipping error handling, accessibility, or security
- "Add that later" for things users need now

---

## When to Use Other Skills

- `/slava:lean` — Challenge scope, find the MVP
- `/slava:ux` — Deep dive on user experience
- `/slava:innovate` — Explore alternative approaches
- `/slava:prep-spec` — Full spec review before implementation
