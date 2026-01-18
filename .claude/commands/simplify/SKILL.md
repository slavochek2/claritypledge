---
name: simplify
description: Review a document (feature spec, plan, architecture) and distill to essentials. Identifies decisions needed, blind spots, and simplification opportunities. Use when documents are verbose or you need a critical review.
when_to_use: when you want to distill complex documents to key points, find blind spots, or identify over-engineering
version: 1.0.0
---

# /simplify

Review a document (feature spec, plan, architecture) and distill to essentials.

## Output Format

### Decisions Needed (if any)
| # | Question | Options | My Pick |
|---|----------|---------|---------|
| 1 | ... | A) ... B) ... | A — reason |

### Blindspots
- Edge cases, missing scenarios, contradictions

### Simplifications
- DRY violations, existing code to reuse, over-engineering

Keep it short. Tables over prose. Recommend defaults.
