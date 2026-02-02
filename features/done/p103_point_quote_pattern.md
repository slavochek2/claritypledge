---
prep_status: ready
prep_date: 2026-01-26
prep_by: /prep-spec
reviews:
  ux: warnings
  architect: warnings
  tea: skipped
open_questions: 0
blindspots: 0
execution: /loop
decisions:
  self_view_copy: first-name (third-person consistent)
  colon_after_verb: yes
  pin_icon_column: remove
  position_only_row: no-change (no Point box to quote)
---

# P103: Point Quote Pattern

## Problem

Current display conflates authorship with relationship:

```
┌──────────────────────────────┐
│ 📌 Jordan Taylor · Agrees    │  ← Looks like Jordan WROTE the Point
│    Remote work is productive │
└──────────────────────────────┘
```

**Confusion:** Points are platform-owned claims. People take positions on them, they don't author them.

---

## Solution

Separate relationship from entity using visual hierarchy:

```
Jordan agrees:                      ← Relationship (OUTSIDE)
┌──────────────────────────────┐
│ 📌 Remote work is productive │    ← Point entity (INSIDE box)
│ [Disagree] [Unsure] [Agree]  │
│ ▸ 2 stories         [🔗][↗️]│
└──────────────────────────────┘
```

**Reads as:** "Jordan agrees with → this Point"

---

## Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Position placement | Outside Point box | Separates relationship from entity |
| Point content | Inside quoted box | Visually distinct entity |
| Position buttons | Inside box | Interact with Point |
| "Supported by X stories" | Inside box | Property of Point |
| Share/Open icons | Inside box | Actions on Point |
| Credibility (👂) | With name, outside | Property of the person |

---

## Visual Spec

### Points Tab (Profile Page)

```
┌─────────────────────────────────────────────┐
│ Jordan agrees · 👂3                         │
│                                             │
│ ┌─────────────────────────────────────────┐ │
│ │ 📌 Remote work is more productive than  │ │
│ │    office work for knowledge workers    │ │
│ │                                         │ │
│ │ ┌──────────┬──────────┬───────────────┐ │ │
│ │ │Disagree ▾│  Unsure  │ Agree (2) ▾ ✓ │ │ │
│ │ └──────────┴──────────┴───────────────┘ │ │
│ │                                         │ │
│ │ ▸ Supported by 2 stories       [🔗][↗️]│ │
│ └─────────────────────────────────────────┘ │
└─────────────────────────────────────────────┘

┌─────────────────────────────────────────────┐
│ Jordan is unsure · 👂3                      │
│                                             │
│ ┌─────────────────────────────────────────┐ │
│ │ 📌 Fewer meetings leads to better       │ │
│ │    outcomes                             │ │
│ │                                         │ │
│ │ ┌──────────┬──────────┬───────────────┐ │ │
│ │ │Disagree ▾│ Unsure ✓ │ Agree (0) ▾   │ │ │
│ │ └──────────┴──────────┴───────────────┘ │ │
│ │                                         │ │
│ │ ▸ Supported by 1 story         [🔗][↗️]│ │
│ └─────────────────────────────────────────┘ │
└─────────────────────────────────────────────┘
```

### Stories Tab (QuotedPoints in Expanded StoryCard)

```
┌─────────────────────────────────────────────┐
│ 🔵 Jordan Taylor · 👂3                      │
│    Product Manager · Jan 7 · 🌐             │
│                                             │
│    "I started working remotely 2 years ago  │
│    and my work-life balance has completely  │
│    transformed..."                          │
│                                             │
│    ┌───────────────────┐                    │
│    │  2 understood     │                    │
│    └───────────────────┘                    │
│                                             │
│ ┌─────────────────────────────────────────┐ │
│ │  📻 Start a Clarity Session             │ │
│ └─────────────────────────────────────────┘ │
│                                             │
│ ▾ Supports 2 points                [🔗][↗️]│
│                                             │
│   Jordan agrees:                            │
│   ┌─────────────────────────────────────┐   │
│   │ 📌 Remote work is more productive   │   │
│   │    than office work for knowledge   │   │
│   │    workers                          │   │
│   │                                     │   │
│   │ ┌────────┬────────┬───────────────┐ │   │
│   │ │Disagree│ Unsure │ Agree (2) ▾ ✓ │ │   │
│   │                                     │   │
│   │ ▸ 2 stories                [🔗][↗️]│ │   │
│   └─────────────────────────────────────┘   │
│                                             │
│   Jordan is unsure:                         │
│   ┌─────────────────────────────────────┐   │
│   │ 📌 Fewer meetings leads to better   │   │
│   │    outcomes                         │   │
│   │                                     │   │
│   │ ┌────────┬──────────┬─────────────┐ │   │
│   │ │Disagree│ Unsure ✓ │ Agree (0)   │ │   │
│   │                                     │   │
│   │ ▸ 1 story                  [🔗][↗️]│ │   │
│   └─────────────────────────────────────┘   │
└─────────────────────────────────────────────┘
```

### Mobile (360px) - Points Tab

```
┌───────────────────────────────┐
│ Jordan agrees · 👂3           │
│                               │
│ ┌───────────────────────────┐ │
│ │ 📌 Remote work is more    │ │
│ │    productive than office │ │
│ │    work for knowledge...  │ │
│ │                           │ │
│ │ ┌───────┬──────┬────────┐ │ │
│ │ │Disagre│Unsure│Agree ✓ │ │ │
│ │ └───────┴──────┴────────┘ │ │
│ │                           │ │
│ │ ▸ 2 stories      [🔗][↗️]│ │
│ └───────────────────────────┘ │
└───────────────────────────────┘
```

---

## Position Verbs

Derived from existing `POSITION_FULL_LABELS` via `.toLowerCase()`:

| Position Type | Display |
|---------------|---------|
| strongly_agree | "strongly agrees" |
| agree | "agrees" |
| somewhat_agree | "somewhat agrees" |
| unsure | "unsure" |
| somewhat_disagree | "somewhat disagrees" |
| disagree | "disagrees" |
| strongly_disagree | "strongly disagrees" |

Note: "unsure" (not "is unsure") — matches existing label and reads naturally as "Jordan unsure:"

---

## Scope

### In Scope

| Location | Change |
|----------|--------|
| Profile → Points tab | PointCard with quote pattern |
| Profile → Stories tab → QuotedPoint | Quote pattern |
| **PointDetail page → Stories** | StoryCard with quote pattern when `authorPosition` provided |
| **Profile → Points tab → QuotedStory** | Added share/open actions |

### Out of Scope (but verify consistency)

| Location | Reason | Verify |
|----------|--------|--------|
| Feed/Ideas page (standalone Points) | No profile context, Point is subject | No position label shown |
| StoryDetail page | Story is subject, Points not currently shown | If Points added later, would need quote pattern |
| PositionOnlyRow (PointDetail) | Shows `Name · Badge` for people without stories | No change needed — no Point box to quote |

---

## Tasks

### T1. Add position verb helper

**File:** `src/app/prototypes/linkedin-like/components/shared/PositionBadge.tsx`

Export helper that derives from existing `POSITION_FULL_LABELS`:

```ts
export function getPositionVerb(position: PositionType): string {
  return POSITION_FULL_LABELS[position].toLowerCase();
}
```

### T2. Update PointCard for profile context

**File:** `src/app/prototypes/linkedin-like/components/PointCard.tsx`

When `profileOwnerId` is set:
- Render `{name} {verb}:` label OUTSIDE quoted box (no colon in ear count line)
- Remove pin icon column (cleaner hierarchy)
- Wrap Point content in quoted box (`bg-gray-50 border rounded-lg p-3`)
- Footer (stories + icons) stays inside quoted box

### T3. Update QuotedPoint in StoryCard

**File:** `src/app/prototypes/linkedin-like/components/StoryCard.tsx`

- Add `{name} {verb}:` label outside QuotedPoint
- Keep existing quoted box styling
- Footer stays inside box

### T4. Visual verification

Check in browser (no code changes):
- Feed/Ideas page: standalone Points have no position label
- PointDetail/StoryDetail/IdeaDetail: no regressions
- Mobile (360px) and desktop
- My profile vs other profiles

### T5. Add quote pattern to StoryCard in point-detail context ✓

**File:** `src/app/prototypes/linkedin-like/components/StoryCard.tsx`

When `context='point-detail'` and `authorPosition` is set:
- Render `{name} {verb}:` label OUTSIDE quoted box with blue tag
- Wrap Story content in quoted box (`bg-gray-50 border rounded-lg p-3`)
- Include share/open actions inside quoted box
- Keep "Start a Clarity Session" button inside

### T6. Add actions to QuotedStory in PointCard ✓

**File:** `src/app/prototypes/linkedin-like/components/PointCard.tsx`

- Add share button and external link icon to QuotedStory
- Add footer with border-t separator
- Consistent with QuotedPoint action pattern

---

## Acceptance Criteria

- [x] Points tab: `{name} {verb}:` outside quoted Point box
- [x] Stories tab QuotedPoints: same pattern
- [x] Position buttons, footer, icons inside Point box
- [x] **PointDetail page: Stories show quote pattern with position label**
- [x] **QuotedStory has share/open actions**
- [x] Mobile (360px) works
- [x] No regressions on feed/detail pages

---

## Out of Scope (Future)

- Notification views
- Search results
- Point mentions in other contexts
