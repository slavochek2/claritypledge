---
name: simplify
description: Mid-conversation clarifier — cuts through complexity to situation + options + recommendation in ≤15 lines. Triggered by "simplify", "explain as to stupid", "what are my options", "what do I decide".
when_to_use: After a long discussion when decisions pile up, context gets complex, or the user needs a clear summary before acting.
version: 9.0.0
---

# /slava:simplify

> **Principle:** If you can't explain it simply, you don't understand it well enough.

## What This Skill Does

Takes the current conversation context and outputs the clearest possible decision summary. No document needed — works on whatever is in discussion right now.

## Output Format (strict — max 15 lines)

```
**Situation:** [1 sentence — what's the actual problem/decision]

**Options:**
A) [option] — [tradeoff: sustainability / thinking cost / error risk]
B) [option] — [tradeoff: sustainability / thinking cost / error risk]
C) [option, if exists] — [tradeoff: sustainability / thinking cost / error risk]

**Recommendation:** [Option X] — [one sentence why]

Reply: "A", "B", or "C"
```

## Rules

- No preamble, no summary header, no "here's what I think" filler
- If there are multiple pending decisions, output them as separate blocks
- Maximum 15 lines total per decision block
- If only one option makes sense, say so directly — don't manufacture false choice
- When options are technically comparable, rank by: (1) which requires the least future discipline to maintain, (2) which eliminates a recurring decision, (3) which catches mistakes mechanically. Development speed is not a ranking criterion.

## Usage

```bash
/slava:simplify           # Clarify current conversation
/slava:simplify p42       # Clarify decisions around a specific feature (reads spec for context)
```

---

## When to Use Other Skills

- `/slava:think:lean:index` — Challenge scope, find the MVP
- `/slava:build:ux` — Design UX layer (user flows, screens, edge cases)
- `/slava:build:architect` — Design technical architecture and security
- `/slava:think:innovate:index` — Explore alternative approaches
