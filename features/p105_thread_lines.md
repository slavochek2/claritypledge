# P105: Thread Lines — Visual Hierarchy for Nested Content

## Problem

P103 added quote pattern (`{Name} {verb}:` outside quoted box) to clarify relationships. But users still can't see the **visual connection** between parent and children:

```
Current (P103):                      Problem:

Point (at top)                       "Which stories belong
                                      to which section?"
Agree (2)    Disagree (2)
                                     "Is this story under
Alice agrees:                         the Point above or
┌─────────────────┐                   floating independently?"
│ Story card      │
└─────────────────┘

Carol agrees:
┌─────────────────┐
│ Story card      │
└─────────────────┘
```

**The position label helps, but there's no visual "thread" connecting parent → children.**

---

## Solution

Twitter-style thread lines showing parent-child relationships:

```
Point (at top)
│
├─ Agree (2)
│  │
│  ├─ Alice agrees:
│  │  ┌─────────────────┐
│  │  │ Story card      │
│  │  └─────────────────┘
│  │
│  └─ Carol agrees:
│     ┌─────────────────┐
│     │ Story card      │
│     └─────────────────┘
│
└─ Disagree (2)
   │
   └─ Bob disagrees:
      ┌─────────────────┐
      │ Story card      │
      └─────────────────┘
```

---

## Design Principle

**Thread lines appear wherever a parent-child relationship is visually displayed.**

Not "some pages" — consistent visual language everywhere hierarchy exists.

---

## The Data Relationships

```
Point (claim about reality)
  └── Position (someone's stance: agree/disagree/unsure)
        └── Story (their evidence for that stance)
```

Can be viewed from different angles:

| View Angle | Hierarchy |
|------------|-----------|
| PointDetail | Point → Positions → Stories |
| Profile Points | Person's Position → Quoted Point → Supporting Stories |
| Profile Stories | Story → Points it supports |
| StoryDetail | Story → Points (future) |

---

## Scope

### In Scope

| Location | Component | Parent | Children | Thread Lines |
|----------|-----------|--------|----------|--------------|
| PointDetail | `PositionSection` | Point header | Stories grouped by position | Section → Stories |
| Profile Points (expanded) | `PointCard` | PointCard | QuotedStories | Card → Stories |
| Profile Stories (expanded) | `StoryCard` | StoryCard | QuotedPoints | Card → Points |

### Out of Scope

| Location | Reason |
|----------|--------|
| Feed / Ideas page | Flat list, no hierarchy |
| Collapsed cards | Children not visible |
| StoryDetail → Points | Points not currently shown (future P105b) |
| Single-child expansions | Thread line adds noise when only 1 item |

---

## Visual Spec

### Thread Line Anatomy

```
│     ← Vertical line (border-l-2 border-gray-200)
├─    ← Connector: vertical continues + horizontal branch
│
└─    ← Last item: horizontal branch only, no continuation
```

### Spacing

```
Parent content
│
├─ [16px indent] Child content
│  │
│  ├─ [16px indent] Grandchild
│  │
│  └─ [16px indent] Grandchild (last)
│
└─ [16px indent] Child content (last)
```

### Colors

| Element | Class | Hex |
|---------|-------|-----|
| Vertical line | `border-gray-200` | #e5e7eb |
| Horizontal connector | `bg-gray-200` | #e5e7eb |

Matches existing card borders for visual consistency.

---

## Component Design

### Shared Components

Create `src/app/prototypes/linkedin-like/components/shared/ThreadLine.tsx`:

```tsx
interface ThreadLineItemProps {
  children: React.ReactNode;
  isLast?: boolean;
}

/**
 * Single item in a thread. Shows connector and optionally continues line.
 */
export function ThreadLineItem({ children, isLast = false }: ThreadLineItemProps) {
  return (
    <div className="relative pl-4">
      {/* Vertical line (unless last item) */}
      {!isLast && (
        <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-gray-200" />
      )}
      {/* Horizontal connector */}
      <div className="absolute left-0 top-5 w-3 h-0.5 bg-gray-200" />
      {/* Content */}
      <div className="pl-1">{children}</div>
    </div>
  );
}

interface ThreadLineGroupProps {
  children: React.ReactNode;
}

/**
 * Container that starts a thread from parent content.
 */
export function ThreadLineGroup({ children }: ThreadLineGroupProps) {
  return (
    <div className="relative ml-2 mt-2">
      {/* Starting vertical line from parent */}
      <div className="absolute left-0 top-0 w-0.5 h-4 bg-gray-200" />
      <div className="pt-2">{children}</div>
    </div>
  );
}
```

### Usage Pattern

```tsx
// In PositionSection (PointDetail.tsx)
<ThreadLineGroup>
  {holders.map((holder, index) => (
    <ThreadLineItem key={holder.user.id} isLast={index === holders.length - 1}>
      <StoryCard story={holder.story} ... />
    </ThreadLineItem>
  ))}
</ThreadLineGroup>

// In PointCard expanded stories
{storiesExpanded && storiesToShow.length > 1 && (
  <ThreadLineGroup>
    {storiesToShow.map((story, index) => (
      <ThreadLineItem key={story.id} isLast={index === storiesToShow.length - 1}>
        <QuotedStory story={story} ... />
      </ThreadLineItem>
    ))}
  </ThreadLineGroup>
)}

// Single item - no thread lines needed
{storiesExpanded && storiesToShow.length === 1 && (
  <QuotedStory story={storiesToShow[0]} ... />
)}
```

---

## Mobile Considerations

Thread lines add ~20px left padding.

| Screen | Available width | With thread | Status |
|--------|-----------------|-------------|--------|
| 360px | 328px (after page padding) | 308px | Tight but OK |
| 390px | 358px | 338px | Comfortable |

**Mitigation:** Thread indent is 16px (`pl-4`), not 20px. Connector is 12px (`w-3`).

Test at 360px viewport to confirm cards don't overflow.

---

## Tasks

### T1. Create ThreadLine shared components

**File:** `src/app/prototypes/linkedin-like/components/shared/ThreadLine.tsx`

- `ThreadLineItem` — single item with connector
- `ThreadLineGroup` — container starting thread from parent
- Export from `shared/index.ts`

### T2. Apply to PointDetail position sections

**File:** `src/app/prototypes/linkedin-like/components/PointDetail.tsx`

- Wrap Stories in `PositionSection` with `ThreadLineGroup`
- Each Story gets `ThreadLineItem` with `isLast` prop
- Skip thread lines if section has only 1 story

### T3. Apply to PointCard expanded stories

**File:** `src/app/prototypes/linkedin-like/components/PointCard.tsx`

- Wrap expanded `QuotedStory` list with `ThreadLineGroup`
- Each story gets `ThreadLineItem`
- Skip if only 1 story expanded

### T4. Apply to StoryCard expanded points

**File:** `src/app/prototypes/linkedin-like/components/StoryCard.tsx`

- Wrap expanded `QuotedPoint` list with `ThreadLineGroup`
- Each point gets `ThreadLineItem`
- Skip if only 1 point expanded

### T5. Visual verification

- PointDetail: 2+ stories in a section show thread
- Profile Points tab: Expand card with 2+ stories
- Profile Stories tab: Expand card with 2+ points
- Mobile 360px: No overflow, readable
- Single-item expansions: No thread lines

---

## Acceptance Criteria

- [ ] Shared `ThreadLine` components created and exported
- [ ] PointDetail sections show thread lines for 2+ stories
- [ ] Profile PointCard expanded shows thread for 2+ stories
- [ ] Profile StoryCard expanded shows thread for 2+ points
- [ ] Single-item expansions have NO thread lines
- [ ] Mobile 360px displays correctly
- [ ] Thread line color matches design system (`gray-200`)

---

## Decisions Made

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Thread line color | `gray-200` | Matches card borders, subtle |
| Indent size | 16px (`pl-4`) | Balances hierarchy visibility with mobile space |
| Single-item skip | Yes | Thread to nowhere adds visual noise |
| Shared component | Yes | DRY, consistent across all locations |

---

## References

- [P103: Point Quote Pattern](./p103_point_quote_pattern.md) — prerequisite
- [Design System: Thread Lines](../docs/design-system.md#thread-lines-visual-hierarchy)
- [decisions.md: Thread lines decision](../docs/decisions.md)
