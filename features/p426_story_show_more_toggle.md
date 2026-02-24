---
status: in-progress
type: feature
rank: 125470
workstream: E
created_date: 2026-02-24
tags: []
uat_file: features/uat/p426.md
test_files:
  - e2e/p426-story-show-more.spec.ts
  - e2e/p426-smoke.spec.ts
  - e2e/a11y/p426-accessibility.spec.ts
---

# P426: Story "Show more" toggle

## Problem

Long stories are truncated with no way to read the full text:
- `/live` (`LiveStoryCardExpanded`): hard-cuts at 120 chars, no expand option — user is stuck
- Profile (`StoryCardFull`): shows full text today, but no truncation means very long stories dominate the feed

## Solution

Twitter-style inline "Show more" / "Show less" toggle. Stays in current page — no navigation away. Single `useState` per card.

### Truncation threshold
- Stories ≤ 3 lines (~180 chars): show in full, no toggle
- Stories > 3 lines: truncate to 3 lines + "Show more"

### UX Design

**Profile story card — collapsed:**
```
┌── ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ──┐
│ [av] Vyacheslav Ladischenski  🦻 12  │
│      CEO · 2h                        │
│                                      │
│ She's someone I've known for years.  │
│ Someone who matters to me. We were   │
│ on a call trying to work something…  │
│ Show more                            │  ← blue, text-sm
│                                      │
│ ─────────────────────────────────── │
│ > 3 points by Vyacheslav  [↗] [shr] │
└──────────────────────────────────────┘
```

**Profile story card — expanded:**
```
┌── ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ──┐
│ [av] Vyacheslav Ladischenski  🦻 12  │
│      CEO · 2h                        │
│                                      │
│ She's someone I've known for years.  │
│ Someone who matters to me. We were   │
│ on a call trying to work something   │
│ out — and I panicked. I said things  │
│ I shouldn't have. Been carrying that.│
│ Show less                            │  ← same position
│                                      │
│ ─────────────────────────────────── │
│ > 3 points by Vyacheslav  [↗] [shr] │
└──────────────────────────────────────┘
```

**Live story card (`LiveStoryCardExpanded`) — collapsed:**
```
┌── ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ──┐
│ [av] Vyacheslav Ladischenski  🦻 12  │
│      CEO · 1h                        │
│                                      │
│ She's someone I've known for years.  │
│ Someone who matters to me. We were   │
│ on a call trying to work something…  │
│ Show more                            │  ← same pattern
│                                      │
│ ─────────────────────────────────── │
│ > 3 points by Vyacheslav             │
└──────────────────────────────────────┘
```

**Profile point card — no change.** Points are short by nature; `[↗]` already there.

## Technical Notes

Two files to change:

1. **`src/app/components/partners/live-story-card-expanded.tsx`** — `LiveStoryCardExpanded`
   - Add `const [storyExpanded, setStoryExpanded] = useState(false)`
   - Replace hard `preview` (120 char slice) with conditional render
   - Add "Show more" / "Show less" toggle button below text

2. **`src/app/pages/profile-page-v2.tsx`** — `StoryCardFull`
   - Same pattern: `useState`, conditional render, toggle button
   - Profile currently shows full text with no truncation — add 3-line clamp when collapsed

## Acceptance Criteria

- [ ] Stories > 3 lines show truncated with "Show more" in both `/live` and profile
- [ ] Clicking "Show more" expands to full text, button becomes "Show less"
- [ ] Clicking "Show less" collapses back
- [ ] Short stories (≤ 3 lines) show in full with no toggle
- [ ] No navigation away from current page
- [ ] "Open story" `[↗]` button on profile unchanged and still works
- [ ] Points footer / expand trigger in `/live` unaffected

## Testing

Manual: open a long story in `/live` and on profile, verify expand/collapse. Also verify short stories show no toggle.

---

## Test Coverage Strategy

**What's Tested:**
- ✅ Long story truncation + "Show more" visible (E2E)
- ✅ Expand → full text shown, button becomes "Show less" (E2E)
- ✅ Collapse → truncated again, button back to "Show more" (E2E)
- ✅ Short story — no toggle rendered (E2E)
- ✅ Keyboard access — Tab + Enter activates toggle (a11y)
- ✅ `aria-expanded` attribute correct on both states (a11y)
- ✅ `/live` and `/feed` pages load without JS errors (smoke)

**What's NOT Tested (rationale):**
- ❌ Live story card toggle (E2E) — requires full two-party session setup; covered by UAT-2
- ❌ Unit tests — pure React state (`useState(false)`), no business logic to isolate
- ❌ Integration tests — no DB/API changes

**Test Pyramid:**
```
      /\
     /  \   3 E2E (profile toggle)
    /----\
   / 2 A11Y \
  /----------\
 /  2 SMOKE   \
```

**Files generated:**
- `e2e/p426-story-show-more.spec.ts` (4 tests)
- `e2e/a11y/p426-accessibility.spec.ts` (2 tests)
- `e2e/p426-smoke.spec.ts` (2 tests)
- `features/uat/p426.md` (9 UAT scenarios)

**Total:** 8 automated tests + 9 UAT scenarios
