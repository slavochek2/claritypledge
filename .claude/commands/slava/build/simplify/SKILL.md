---
name: simplify
description: Analyze each decision point — categorize, show options, recommend.
when_to_use: When reviewing a spec/plan and need structured decision-by-decision analysis.
version: 7.0.0
---

# /slava:simplify

> **Principle:** Good simplification removes what's unnecessary. Bad simplification cuts corners.

## What This Skill Does

Reads the document, identifies EACH important decision, and for each one:
1. Categorizes it as **Keep** (no change needed) or **Fix** (needs change)
2. For Fix items: lists options with tradeoffs
3. Recommends one option with reasoning

## Usage

```bash
/slava:simplify features/p42.md
/slava:simplify   # Review current context
```

---

## How to Think

**Extract decisions, not complaints.** Look for places where the spec makes a choice (explicit or implicit).

**Be specific.** "The auth flow" is not a decision. "Using magic link vs password" is a decision.

**6-month test.** Will we thank ourselves for this in 6 months?

**Remove, don't cut.** Removing unnecessary complexity = good. Cutting necessary functionality = bad.

---

## Output Format

```markdown
## Decisions Analysis

### 1. [Decision Name]
**Status:** Keep ✓
**Why:** [One sentence — why this is already right]

### Decisions Needed
| # | Question | Options | Recommendation |
|---|----------|---------|----------------|
| 1 | [Question] | A) ... B) ... C) ... | [Rec] |
| 2 | [Question] | A) ... B) ... C) ... | [Rec] |

Reply: "1a, 2b" etc.

### 2. [Decision Name]
**Status:** Fix ✗

**Options:**
1. **[Option A]** — [tradeoff in one sentence]
2. **[Option B]** — [tradeoff in one sentence]
3. **Keep as-is** — [tradeoff in one sentence]

**Recommendation:** Option N because [one sentence reasoning].

---

### 3. [Decision Name]
**Status:** Keep ✓
**Why:** [One sentence]

---

[Continue for each decision...]

## Summary
- **Keep:** N decisions (already good)
- **Fix:** M decisions (need changes)
```

---

## What Counts as a Decision

Look for these patterns in specs/plans:
- Technology choices (library, framework, service)
- Scope choices (include/exclude features)
- UX choices (flow, layout, interaction pattern)
- Data model choices (what to store, how to structure)
- Validation approaches (when to ship, what to test)

**Skip:** Implementation details that don't affect outcomes.

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
