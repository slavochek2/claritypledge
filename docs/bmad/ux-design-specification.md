# Feature: Prioritized Champions Display (Reason-First)

**Date:** 2025-12-02
**Scope:** Landing page SignatureWall component - show profiles with reasons first

---

## Problem Statement

The landing page "Meet the Clarity Champions" section displays 6 profiles, but currently orders them purely by `created_at` date. This means profiles **without reasons** may appear prominently, creating cards that show only:

```
[Avatar] John Doe
         Product Manager
```

Without the **why** — the reason someone took the pledge — these cards fail to create emotional resonance or social proof. The whole point of showing champions is to let visitors **feel** why others committed.

## User Story

> As a **landing page visitor**, I want to see **why** people took the Clarity Pledge, so that I can **understand the value** and feel motivated to sign myself.

## Design Solution: Smart Ordering

**Change the query logic** in `getFeaturedProfiles()` to prioritize profiles that have a non-empty `reason` field.

### Ordering Rules (Priority)

1. **Has reason + verified** → First (most recent first within this group)
2. **No reason + verified** → Second (fill remaining slots if needed)
3. **Limit:** 6 profiles total

### Visual Behavior

| Scenario | Display |
|----------|---------|
| 6+ profiles with reasons | Show 6 most recent with reasons |
| 4 profiles with reasons | Show 4 with reasons + 2 without (most recent) |
| 0 profiles with reasons | Show 6 most recent verified (current behavior) |

## Technical Specification

**File:** [src/app/data/api.ts](src/app/data/api.ts) - `getFeaturedProfiles()`

**Current Query:**
```typescript
.order('created_at', { ascending: false })
.limit(6)
```

**New Query Logic:**
```typescript
// Option A: Two queries, merge results
const withReasons = await supabase
  .from('profiles')
  .select('*')
  .eq('is_verified', true)
  .not('reason', 'is', null)
  .neq('reason', '')
  .order('created_at', { ascending: false })
  .limit(6);

// If we have fewer than 6, backfill with profiles without reasons
if (withReasons.data.length < 6) {
  const remaining = 6 - withReasons.data.length;
  const withoutReasons = await supabase
    .from('profiles')
    .select('*')
    .eq('is_verified', true)
    .or('reason.is.null,reason.eq.')
    .order('created_at', { ascending: false })
    .limit(remaining);
  // Merge results
}
```

**Alternative (Single Query):**
```typescript
// Use raw SQL ordering with CASE
.order('reason', { ascending: false, nullsFirst: false })
.order('created_at', { ascending: false })
```

## UI Changes

**None required.** The SignatureWall component already handles profiles with/without reasons gracefully:
- With reason: Shows quoted text under name
- Without reason: Shows name/role only (no empty quote block)

## Acceptance Criteria

- [ ] Landing page shows profiles with reasons before profiles without reasons
- [ ] Within each group (with/without reasons), profiles are ordered by most recent first
- [ ] Maximum 6 profiles displayed
- [ ] If all 6 profiles have reasons, only those with reasons appear
- [ ] If fewer than 6 profiles have reasons, backfill with profiles without reasons
- [ ] No visual changes to the card design

## Edge Cases

| Case | Expected Behavior |
|------|-------------------|
| No verified profiles | Section hidden (existing behavior) |
| All profiles have empty reasons | Show 6 most recent (graceful degradation) |
| Profile has whitespace-only reason | Treat as "no reason" |

## Future Consideration (Not In Scope)

- **Profile owner nudge:** "Add your reason to be featured on the homepage" — could be a follow-up feature
- **Reason quality filter:** Could eventually filter out very short reasons (e.g., < 10 chars)
