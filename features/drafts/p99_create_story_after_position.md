# P99: Story After Position Flow

**Status:** Planning (design question)
**Created:** 2026-01-25
**Depends on:** P58 (Sifter MVP)

---

## Problem

When a user takes a position on a Point (Agree/Disagree/Unsure), they have no prompt to share WHY they believe this. Their position exists without context.

Currently:
- **Sifter (P58):** Story → AI extracts Points → user takes positions
- **Missing:** Position → prompt for Story

## Design Questions

| Question | Options | Notes |
|----------|---------|-------|
| When to prompt? | A) First position ever B) Every position C) Never (separate flows) | C is current state |
| Is story required? | A) Required for position B) Optional but encouraged C) Fully separate | P58 says "every Point must have at least one Story" but that's for extraction, not staking |
| Prompt timing | A) Inline after position click B) Modal C) Later via notification | |
| Story destination | A) Linked to this position B) General story pool C) Both | |

## Current Architecture (from P58)

```
stories (user's lived experiences)
    ↓
story_points (N:N junction - AI creates links)
    ↓
points (global claims, not user-owned)
    ↓
positions (user's stance on a point, 0-10)
```

A position without a story is valid. But a Point without ANY story (from anyone) is orphaned.

## Options to Explore

### Option A: Prompt on first position
```
User clicks "Agree" on a Point
→ "Why do you agree? Share a quick story (optional)"
→ [Skip] [Share story]
```
**Pro:** Captures context when engagement is high
**Con:** Friction on a simple action

### Option B: Prompt when Point has no stories
```
User clicks "Agree" on a Point with 0 linked stories
→ "You're first! Add a story to help others understand this point?"
```
**Pro:** Only prompts when genuinely needed
**Con:** Complex conditional logic

### Option C: Keep separate (current)
```
Positions and Stories are independent actions
User can link later via Sifter
```
**Pro:** Simple, no friction
**Con:** Positions accumulate without context

## Recommendation

**Start with Option C (current state)** — keep flows separate until Sifter exists.

After Sifter ships, revisit with data:
- How many positions have linked stories?
- Do users want to explain their positions?
- Is friction acceptable for richer data?

## Out of Scope

- Sifter implementation (P58)
- Point creation flow (handled by Sifter)
- Story editing after creation

---

## Next Steps

1. Ship P58 (Sifter MVP)
2. Observe: do users naturally link stories to positions?
3. If not, design prompt flow based on usage patterns
