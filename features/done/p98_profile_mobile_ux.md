---
prep_status: ready
prep_date: 2026-01-25
prep_by: /prep-spec
reviews:
  ux: warnings
  architect: warnings
  tea: skipped
open_questions: 0
blindspots: 4
execution: /loop
---

# P98: Mobile UX Fixes

## Overview

Fix mobile UX issues discovered during UX audit. Two parts:
- **Part A:** Card action buttons (component-level, affects all pages)
- **Part B:** Profile page specific fixes

**Execution order:** Part A first (components), then Part B (page uses those components).

---

## Part A: Card Action Buttons

### Problem

**Current state (mobile):**
- StoryCard header: `[Name] [Ear] [Start Session] [Share] [Open]` → ~190px of buttons
- On 375px screen, buttons crowd the header and compete with author info
- PointCard incorrectly shows "Start Session" in some contexts

**Visual issue:** StoryCard header buttons (~190px) crowd mobile viewport, leaving insufficient space for author info on 375px screens.

### Design Decision

| Card | Actions | Desktop | Mobile |
|------|---------|---------|--------|
| **StoryCard** | Session + Share + Open | Hover: top-right | Overflow menu + bottom CTA |
| **PointCard** | Share + Open only | Hover: top-right | Keep inline (2 buttons fit) |

**Key rule:** PointCard never has "Start Session" — sessions are for Stories only.

### Mobile Layouts

**StoryCard:**
```
┌─────────────────────────────────────┐
│ ┌──┐                                │
│ │🔵│ Jordan Taylor 👂3       [•••] │  ← Overflow menu
│ └──┘ PM at Acme · 2h ago            │
│                                     │
│      "When I switched to remote     │
│      work, my deep focus time       │
│      increased by 40%..."           │
│                                     │
│      ┌─────────────────┐            │
│      │  3 understood   │            │
│      └─────────────────┘            │
│                                     │
│ ┌─────────────────────────────────┐ │
│ │  📻  Start Clarity Session      │ │  ← Primary CTA
│ └─────────────────────────────────┘ │
│                                     │
│ ▸ Supports positions on 2 points   │
└─────────────────────────────────────┘

Overflow menu:
┌─────────────────┐
│ 🔗 Share        │
│ ↗️ Open story    │
└─────────────────┘
```

**PointCard:**
```
┌─────────────────────────────────────┐
│ ┌──┐                                │
│ │📌│ Point              [🔗] [↗️]  │  ← Inline (2 buttons fit)
│ └──┘ Jordan · 👂3 · Agrees          │
│                                     │
│      "Remote work is more           │
│      productive than office work"   │
│                                     │
│      ┌────────┐┌────────┐┌────────┐ │
│      │Disagree││ Unsure ││Agree ✓ │ │
│      └────────┘└────────┘└────────┘ │
│                                     │
│ ▸ Supported by 2 stories            │
└─────────────────────────────────────┘
```

### Tasks

#### A1. Remove Start Session from PointCard

**Problem:** PointCard shows "Start Session" when `profileOwnerId && filteredStories.length > 0`. Sessions are for Stories, not Points.

**File:** `src/app/prototypes/linkedin-like/components/PointCard.tsx`
**Location:** Search for "Start Session" button in the action buttons section

**Fix:** Remove the Start Session button entirely from PointCard.

**Acceptance:**
- [ ] PointCard never shows "Start Session" button
- [ ] Only Share and Open buttons remain

#### A2. Create OverflowMenu Component

**File:** `src/app/prototypes/linkedin-like/components/shared/OverflowMenu.tsx`

**Spec:**
- Trigger: `[•••]` button (MoreHorizontal icon)
- 44x44px touch target
- Dropdown with action items
- Click outside to dismiss
- Uses Radix DropdownMenu for accessibility

```tsx
interface OverflowMenuItem {
  icon: ReactNode;
  label: string;
  onClick: () => void;
}

interface OverflowMenuProps {
  items: OverflowMenuItem[];
}
```

**Acceptance:**
- [ ] Menu opens on tap
- [ ] Menu closes on outside tap
- [ ] Items are keyboard accessible
- [ ] 44px touch targets on all items

#### A3. Update StoryCard Mobile Layout

**File:** `src/app/prototypes/linkedin-like/components/StoryCard.tsx`

**Changes:**
1. **Header actions (mobile):** Replace inline buttons with OverflowMenu
2. **Bottom CTA (mobile):** Add full-width "Start Clarity Session" button
3. **Desktop:** Keep current hover behavior unchanged

**Responsive logic:**
```tsx
{/* Desktop: inline actions on hover */}
<div className="hidden sm:flex sm:opacity-0 sm:group-hover:opacity-100 ...">
  <StartSessionButton />
  <ShareButton />
  <OpenButton />
</div>

{/* Mobile: overflow menu only */}
<div className="sm:hidden">
  <OverflowMenu items={[
    { icon: <Share />, label: 'Share', onClick: handleShare },
    { icon: <ExternalLink />, label: 'Open story', onClick: handleOpen },
  ]} />
</div>

{/* Mobile: Primary CTA at bottom */}
{!isDetailView && (
  <div className="sm:hidden border-t border-gray-100 p-4">
    <button className="w-full ...">
      <Radio size={16} />
      Start Clarity Session
    </button>
  </div>
)}
```

**Acceptance:**
- [ ] Mobile: overflow menu in header (Share + Open)
- [ ] Mobile: full-width Start Session button at card bottom
- [ ] Desktop: unchanged hover behavior
- [ ] Touch targets meet 44px minimum

---

## Part B: Profile Page Fixes

### Issues

| # | Issue | Impact | Effort |
|---|-------|--------|--------|
| 1 | Calibration section broken/empty on mobile | High — core feature not visible | Medium |
| 2 | Bottom nav occludes content | High — last card cut off | Low |
| 3 | Empty states have no CTA | Medium — poor first-time UX | Low |

### Tasks

#### B1. Fix Calibration Display Visibility

**Problem:** `InlineCalibration` component renders but is nearly invisible on mobile due to:
1. **Bar invisible** — `h-2 bg-gray-200` on white background (~1.1:1 contrast)
2. **Icons unrecognizable** — 12px Ear/Mic icons look like random dots
3. **No legend** — users don't know what left/right means
4. **Touch targets tiny** — 16px icons, need 44px minimum

**Files:** `src/app/prototypes/linkedin-like/components/shared/CalibrationDisplay.tsx`

**Recommended fix:**
1. Increase bar contrast: `bg-gray-300` or add border
2. Increase icon size: 16px minimum, consider 20px
3. Add end labels: "Over" and "Under" (or use color gradient)
4. Wrap icons in 44px touch targets
5. Consider showing text state below: "Slightly overconfident as listener"

**Acceptance:**
- [ ] Bar clearly visible on white background (4.5:1 contrast)
- [ ] Ear/Mic icons recognizable at mobile viewing distance
- [ ] Touch targets meet 44px minimum
- [ ] User understands what the visualization means without tooltip

#### B2. Add Bottom Nav Clearance

**Problem:** Fixed bottom nav covers last content items.

**Files:** `Profile.tsx`

**Fix:** Add `pb-20` to main content container

**Acceptance:**
- [ ] All content scrollable above bottom nav
- [ ] No content hidden when scrolled to bottom

#### B3. Empty Story State with CTA

**Problem:** "No stories shared yet" is a dead end.

**Files:** `Profile.tsx`

**Fix:** Add action button to empty stories state:
- "Share your first story" → scroll to composer and focus textarea
- The composer ("What's on your mind?") is already the Sifter placeholder

**Note:** Empty points state ("No positions taken yet") is out of scope — needs separate spec to design story-after-position flow.

**Acceptance:**
- [ ] Empty story state shows "Share your first story" button
- [ ] Button scrolls to composer and focuses textarea

---

## Out of Scope

- Events page issues (separate spec if needed)
- IdeaCard (different pattern)
- QuotedStory/QuotedPoint nested cards
- Desktop layout changes
- Touch target standardization across all components (future cleanup)
- Empty points state CTA — needs P99 spec for story-after-position flow

## Testing

Manual QA on iPhone viewport (375px):

**Part A:**
1. StoryCard shows overflow menu + bottom CTA
2. PointCard shows inline Share + Open only (no Start Session)
3. Overflow menu opens/closes correctly
4. All touch targets meet 44px minimum
5. Desktop hover behavior unchanged

**Part B:**
1. Fresh user with 0 stories → see "Share your first story" CTA
2. CTA scrolls to composer and focuses it
3. User with content → calibration visible
4. All cards scroll above bottom nav
