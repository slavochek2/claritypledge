---
name: simplify
description: Review a document (feature spec, plan, architecture) for sustainable simplicity. Identifies decisions needed, blind spots, and opportunities to remove unnecessary complexity WITHOUT sacrificing quality, maintainability, or user experience.
when_to_use: when you want to find unnecessary complexity, validate architecture decisions, or get a critical review that prioritizes long-term sustainability
version: 2.0.0
---

# /simplify

Review a document for **sustainable simplicity** — reducing complexity while preserving quality.

## Philosophy

Good simplification removes what's unnecessary. Bad simplification cuts corners.

Before recommending any change, ask: **"Will this still be the right decision in 6 months?"**

## Decision Criteria

Evaluate every recommendation against:
1. **User impact** — Does this improve or harm the user experience?
2. **Maintainability** — Will future developers thank us or curse us?
3. **Production readiness** — Is this robust enough for real users?
4. **Technical debt** — Are we creating problems we'll pay for later?

## Output Format

### Decisions Needed (if any)
| # | Question | Options | Recommended | Why (long-term) |
|---|----------|---------|-------------|-----------------|
| 1 | ... | A) ... B) ... | A | Sustainable because... |

### Blind Spots
- Edge cases, missing scenarios, contradictions, user experience gaps

### Opportunities
| Change | Benefit | Risk if skipped | Sustainability check |
|--------|---------|-----------------|---------------------|
| Remove X | Less code to maintain | Low | ✓ No rework needed |
| Simplify Y | Clearer logic | Medium | ✓ Handles growth |

### Do NOT Recommend (Anti-patterns)
- Quick fixes that create technical debt
- Simplifications that sacrifice user experience
- "We can add that later" for things users need now
- Cutting error handling, accessibility, or security

## Categories of Simplification

✓ **Remove** — Delete unnecessary complexity (dead code, unused features)
✓ **Consolidate** — Merge duplicated logic (DRY)
✓ **Clarify** — Make complex code more understandable
⚠️ **Defer** — Only if explicitly acceptable AND trade-offs documented
✗ **Cut corners** — Never recommend this

## Quality Gate

For each recommendation, verify:
- [ ] Doesn't create technical debt
- [ ] Doesn't harm user experience
- [ ] Won't require rework within 6 months
- [ ] Production-ready (error handling, edge cases)
