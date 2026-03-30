---
status: today
type: story
rank: 0.031
workstream: foundation
created_date: 2026-03-30T00:00:00.000Z
tags:
  - visibility
  - p607-follow-up
  - ux
flow: dev
---

# P610: Visibility Line — Consistent Indicators Across Creation Flows

## Problem Statement

P607 added visibility inheritance (points inherit story visibility, stories inherit point visibility) but the UI doesn't reflect it consistently. Some flows show banners + correct button labels (doc context, add-point-from-story), others show nothing (create-story-from-point) or show contradictory labels (Globe icon + "Publish Public Story" when the content will actually be private).

## Solution

Create a shared `<VisibilityLine />` component and apply it across all 5 creation flows. Pattern: banner above textarea (matching existing doc/point banner placement).

**Visibility Line format:**
```
[icon] [STATE] · [source/reason]
```

Examples:
- `🌐 Public · Visible on your profile`
- `🔒 Private · Matches point visibility`
- `🔒 Private · Matches story visibility`
- `🔒 Private · Stories here inherit this visibility`

**Placement rule:**
- When a context card exists (flows 2, 4, 5): visibility line goes INSIDE the context card as last row
- When no context card (flows 1, 3): standalone banner above textarea
- Submit button ALWAYS reflects visibility with icon + label

## UX Design

### Flow 1: Create Story standalone (`/create`)
```
┌──────────────────────────────────────────┐
│ ← Back                                   │
│ Share a Story                            │
│ ┌──────────────────────────────────────┐ │
│ │ 🌐 Public · Visible on your profile │ │
│ └──────────────────────────────────────┘ │
│ [textarea: Share a moment...]            │
│ [🌐 Publish Public Story]                │
└──────────────────────────────────────────┘
```

### Flow 2: Create Story from point (`/create?pointId=X`)
```
┌──────────────────────────────────────────┐
│ ← Back                                   │
│ ┌─ ChatContextHeader ─────────────────┐  │
│ │ "AI will replace most jobs"         │  │
│ │ 📌 You: Disagree                    │  │
│ │─────────────────────────────────────│  │
│ │ 🔒 Private · Matches point          │  │
│ └─────────────────────────────────────┘  │
│ [textarea]                               │
│ [🔒 Save Private Story]                  │
└──────────────────────────────────────────┘
```

### Flow 3: Create Story from doc (doc context)
```
┌──────────────────────────────────────────┐
│ ← "Q4 Strategy"                          │
│ ┌─ DocPrivacyBanner ──────────────────┐  │
│ │ 🔒 PRIVATE · Only you can see this  │  │
│ │ Stories added here inherit this      │  │
│ └─────────────────────────────────────┘  │
│ [textarea]                               │
│ [🔒 Save Private Story]                  │
└──────────────────────────────────────────┘
```

### Flow 4: Add Point from story (`/story/:id`)
```
┌─ AddPointForm ───────────────────────────┐
│ ┌──────────────────────────────────────┐ │
│ │ 🔒 Private · Matches story           │ │
│ └──────────────────────────────────────┘ │
│ [textarea: State your point...]          │
│ [Disagree] [Unsure] [Agree]              │
│ [Cancel]  [🔒 Add Private Point]         │
└──────────────────────────────────────────┘
```

### Flow 5: AI Chat (`/chat?pointId=X`)
```
┌──────────────────────────────────────────┐
│ ← Back                                   │
│ ┌─ ChatContextHeader ─────────────────┐  │
│ │ "AI will replace most jobs"         │  │
│ │ 📌 You: Disagree                    │  │
│ │─────────────────────────────────────│  │
│ │ 🔒 Private · Matches point          │  │
│ └─────────────────────────────────────┘  │
│ [chat messages...]                       │
│ ... visibility picker at end (existing)  │
└──────────────────────────────────────────┘
```

## Technical Architecture

### New Component
`src/app/components/shared/visibility-line.tsx` — ~30 lines
- Props: `visibility: 'public' | 'private'`, `source?: string`
- Private: amber-50 bg, amber border, Lock icon
- Public: blue-50 bg, blue border, Globe icon (inherited) or muted bg (standalone default)

### Files to Modify
1. `src/app/pages/create-story-page.tsx` — add VisibilityLine for standalone + point context, fix button label for point-inherited visibility
2. `src/app/components/story-guide/ChatContextHeader.tsx` — add optional visibility line at bottom
3. `src/app/pages/story-detail-page.tsx` — replace separate private/public banners in AddPointForm with VisibilityLine
4. `src/app/components/docs/doc-privacy-banner.tsx` — add optional inheritance subtitle line
5. `src/app/pages/create-story-page.tsx` — fix button label for point-inherited private visibility

### No changes needed
- `StoryGuideChat.tsx` — VisibilityAndSave panel at end already works, just needs ChatContextHeader to show visibility from the start
- No DB/schema/migration changes

## Acceptance Criteria

- [ ] New `<VisibilityLine />` component created
- [ ] Flow 1 (standalone): shows `🌐 Public · Visible on your profile` banner above textarea
- [ ] Flow 2 (from point): visibility line inside ChatContextHeader, button label matches inherited visibility
- [ ] Flow 3 (from doc): DocPrivacyBanner shows inheritance subtitle
- [ ] Flow 4 (add point): existing banners replaced with VisibilityLine, same behavior
- [ ] Flow 5 (AI chat): visibility line visible from start inside ChatContextHeader
- [ ] All submit buttons show correct icon + label matching actual visibility
- [ ] Private indicators use amber styling (matches existing pattern)
- [ ] Public indicators use blue/muted styling (matches existing pattern)
- [ ] Mobile: indicators readable at 390px width

## Test Coverage Strategy

- E2E: verify banner text + button label on create-story page with and without point context
- E2E: verify banner text on add-point form for private and public stories
- Visual QA: screenshot all 5 flows at desktop + mobile widths
