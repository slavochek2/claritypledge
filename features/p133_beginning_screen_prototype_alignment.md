---
status: today
type: story
priority: p2
milestone: C1
prototype: /prototype/linkedin-like/live
prepped_date: '2026-02-09'
reviews:
  ux: passed
  architect: passed-with-notes
  alignment: passed
decisions:
  - >-
    Inline rating expansion pattern (expand story card in picker, not separate
    screen)
  - >-
    Rich story card with avatar + linked points count (matches prototype
    StoryCardPreview)
  - 'CTA button text: "Does {partner} understand your story?" for clarity'
  - Story persists at top throughout flow using enriched card format
  - >-
    Entire card clickable (button is visual emphasis, larger tap target for
    mobile)
  - 'Radio pattern: expanding one card auto-collapses others (single selection)'
  - 'Cancel clears rating (clean state, no partial selections)'
  - >-
    Inline error display on submit failure (keep card expanded, show Retry
    button)
  - >-
    Fixed max-height (200px) for expanded story text with sticky rating UI
    (mobile-friendly)
  - 'No empty state: ContentPicker not rendered if stories.length === 0'
sort_order: 750000
---
# P133: /live Beginning Screen — Match Prototype Polish

## User Story

As a /live session participant selecting a story, I want an inline rating interface that expands on the card itself (not a separate screen), and I want to see rich story context (avatar, linked points) throughout the verification flow — matching the polished UX in `/prototype/linkedin-like/live`.

---

## Problem

P128 shipped the /live beginning screen with content picker, but the implementation differs from the prototype in key UX details:

**Current /live issues:**
1. **Separate screen flow**: Selecting story → navigates to rating screen with basic `SelectedContentDisplay`
2. **Plain story cards**: No avatar, no linked points metadata, just text
3. **Generic CTA**: Cards are clickable but don't clearly communicate "Does {partner} understand YOUR story?"
4. **Loss of context**: Selected content shown as plain muted card, not rich preview

**Prototype pattern (works well):**
1. **Inline expansion**: Tap story → card expands inline showing "How much do you believe {partner} understands your story?" with 0-10 rating picker
2. **Rich cards**: `StoryCardPreview` shows avatar, story text, "{N} points linked" throughout flow
3. **Clear intent**: Each story has "Does Alice understand your story?" button before expanding
4. **Context retention**: Story card at top persists with full context (not just text)

---

## Core Concept

**Align /live beginning screen with prototype's inline expansion pattern + rich card format.**

```
CURRENT:       Pick story → Navigate to rating screen → Plain card at top
PROTOTYPE:     Pick story → Expand inline with rating → Rich card persists
```

The prototype demonstrates better information architecture:
- **Decision point clarity**: User sees "Does {partner} understand your story?" before committing
- **Context preservation**: Rich story card (with avatar, metadata) stays visible throughout
- **Spatial consistency**: Rating happens in-place, not via navigation

---

## User Flow

### Before (Current /live)

1. User sees story cards in ContentPicker (plain cards with just text + "N understood")
2. Tap story → `handleSelectStory` called → updates LiveState
3. Screen transitions to rating view with `SelectedContentDisplay` (muted bg, text only)
4. Rating drawer appears below

**Issues:**
- Navigation breaks spatial relationship
- Plain card loses context (no avatar, no linked points)
- No clear "Does {partner} understand you?" framing on cards

### After (Prototype-aligned /live)

1. User sees story cards with:
   - Avatar
   - Story text (truncated to 2 lines)
   - "{N} points linked" metadata
   - **CTA button**: "Does {partner} understand your story?"
2. Tap button → **card expands inline** showing:
   - Full story text
   - Rating question: "How much do you believe {partner} understands your story?"
   - 0-10 confidence picker (current RatingButtons component)
   - Submit button
3. Submit → story persists at top as **rich `StoryCardPreview`** throughout flow:
   - Explain-back phase
   - Results phase
   - Celebration phase

**Benefits:**
- Spatial consistency (no navigation)
- Context preserved (avatar, metadata visible)
- Clear intent (button text frames the question)

---

## Design Spec

### Story Card (Collapsed State)

Enhance `LiveStoryCard` component:

```tsx
┌────────────────────────────────────────┐
│  [Avatar]  Story text here truncated   │  ← Blue left border (4px)
│            to two lines max with...    │
│                                        │
│            3 points linked · 5 understood │  ← Metadata row
│                                        │
│  ┌──────────────────────────────────┐  │
│  │ Does Alice understand your story? │  │  ← CTA button (blue primary)
│  └──────────────────────────────────┘  │
└────────────────────────────────────────┘
```

**Implementation notes:**
- Avatar via `GravatarAvatar` (size: sm, shows pledger badge)
- Linked points count: `getPointsForStory(story.id).length`
- Understood count: `story.understoodCount` (existing field)
- Button text: "Does {getFirstName(partnerName)} understand your story?"

### Story Card (Expanded State - Inline Rating)

```tsx
┌────────────────────────────────────────┐
│  [Avatar]  Full story text shown here  │  ← Blue left border (4px)
│            no truncation when expanded │
│                                        │
│            3 points linked            │  ← Show points, hide understood count
│                                        │
│  ────────────────────────────────────  │  ← Divider
│                                        │
│  How much do you believe Alice         │  ← Rating question
│  understands your story?               │
│                                        │
│  [0] [1] [2] [3] [4] [5] [6] [7] [8] [9] [10] │  ← RatingButtons
│                                        │
│  ┌──────────────────────────────────┐  │
│  │          Submit Rating            │  │  ← Primary button (disabled until rating selected)
│  └──────────────────────────────────┘  │
│  [Cancel]                              │  ← Ghost button
└────────────────────────────────────────┘
```

**Interaction:**
1. Tap "Does Alice..." button → `setExpandedStoryId(story.id)`
2. Card expands inline (no navigation)
3. Select rating → `setSelectedRating(rating)`
4. Submit → `handleSelectStory(story.id, preview)` → `setIsLocallyRating(true)` → LiveState updates
5. Cancel → `setExpandedStoryId(null)` → collapses back

### Story Card (Persistent During Flow)

After submission, show rich preview at top using new `StoryCardPreview` component:

```tsx
┌────────────────────────────────────────┐
│  [Avatar]  Story text (2 line clamp)   │  ← Blue left border, white bg
│            with truncation...          │
│                                        │
│            3 points linked            │
└────────────────────────────────────────┘
```

**Used in:**
- Explain-back phase
- Results phase
- Celebration phase

Replaces current `SelectedContentDisplay` (which only shows plain text on muted bg).

---

## Interaction Model

### Collapsed Card Tap Target

**Decision:** Entire card is clickable (not just button).

```tsx
┌─ CARD (entire area clickable) ────┐
│ 👤 Story text...                   │ ← Tap anywhere = expand
│                                    │
│ 3 points linked                    │
│                                    │
│ [Does Alice understand this?]      │ ← Button is visual emphasis
└────────────────────────────────────┘
```

**Rationale:**
- Larger tap target (better mobile UX, easier thumb reach)
- Button provides clear intent ("what will happen if I tap?")
- Common pattern (cards in feed UIs are fully tappable)

**Implementation:**
```tsx
<div
  onClick={() => onExpand(story.id)}
  className="cursor-pointer hover:bg-muted/50 transition-colors"
>
  {/* Card content + button (button just visual, no separate onClick) */}
</div>
```

### Multi-Card Expansion (Radio Pattern)

**Decision:** Only one card expanded at a time. Expanding Card B auto-collapses Card A.

**Behavior:**
```
Card A expanded, user taps Card B:
1. Card A collapses (no animation, instant)
2. Card B expands (smooth 200ms animation)
3. expandedStoryId state = B.id
```

**Rationale:**
- Matches prototype behavior
- Simpler state management
- Reduces screen clutter (one decision at a time)
- User can't accidentally have multiple partial ratings

**Implementation:**
```tsx
const handleExpand = (storyId: string) => {
  // Auto-collapses previous (state overwrites)
  setExpandedStoryId(storyId);
  setSelectedRating(null); // Clear any prior selection
};
```

### Cancel Button Behavior

**Decision:** Cancel clears rating and collapses card.

**Behavior:**
```
User picks rating "7" → hits Cancel:
1. setSelectedRating(null) — clear rating
2. setExpandedStoryId(null) — collapse card
3. No confirmation prompt (instant action)
```

**Rationale:**
- Clean state (no partial selections lingering)
- Clear user intent: "Cancel" = "I changed my mind"
- If user re-expands, starts fresh

**Implementation:**
```tsx
const handleCancel = () => {
  setSelectedRating(null);
  setExpandedStoryId(null);
};
```

### Empty State (No Stories)

**Decision:** Don't render ContentPicker if `stories.length === 0`.

**Behavior:**
```tsx
// In LiveModeView beginning screen
{stories.length > 0 && (
  <ContentPicker stories={stories} onSelect={handleSelectStory} />
)}

// If no stories → component not rendered, no empty state message
```

**Rationale:**
- No confusing "no stories" message
- /live session shouldn't start without content (guard at session creation)
- Cleaner UI (don't show empty picker)

---

## Error Handling

### Submit Failure (Network/Server Error)

**Decision:** Keep card expanded, show inline error, provide Retry button.

```tsx
┌─ EXPANDED (error state) ──────────┐
│ 👤 Story text...                   │
│                                    │
│ [7] selected                       │
│                                    │
│ ⚠️ Failed to submit. Check network│ ← Error inline
│                                    │
│ ┌────────────────────────────────┐│
│ │      Retry                     ││ ← Retry with same rating
│ └────────────────────────────────┘│
│ [Cancel]                           │ ← Dismiss error, collapse
└────────────────────────────────────┘
```

**State additions:**
```tsx
const [submissionState, setSubmissionState] = useState<{
  status: 'idle' | 'submitting' | 'error';
  error?: string;
}>({ status: 'idle' });
```

**Behavior:**
- On error: `setSubmissionState({ status: 'error', error: errorMessage })`
- Retry button re-attempts submission with same rating
- Cancel clears error and collapses card
- Card stays expanded until user explicitly cancels or retry succeeds

**Rationale:**
- Preserves user context (they already made rating decision)
- Easy recovery (one-tap retry)
- No need to re-expand and re-rate

---

## State Lifecycle

### Submission State Machine

**Prevent race conditions during async submission:**

```tsx
const [submissionState, setSubmissionState] = useState<{
  status: 'idle' | 'submitting' | 'error';
  storyId: string | null;
  error?: string;
}>({ status: 'idle', storyId: null });

const handleSubmit = async (storyId: string, rating: number) => {
  // Guard: Don't allow submission while another is in progress
  if (submissionState.status === 'submitting') return;

  setSubmissionState({ status: 'submitting', storyId });

  try {
    await handleSelectStory(storyId, rating);
    // Success: card will be replaced by StoryCardPreview in next phase
  } catch (error) {
    setSubmissionState({
      status: 'error',
      storyId,
      error: error.message
    });
  }
};
```

**Disabled states during submission:**
- All other cards: not expandable (grey out or show loading skeleton)
- Submit button: shows spinner, disabled
- Cancel button: disabled (can't cancel mid-flight)

**Rationale:**
- Prevents user from expanding Card B while Card A submits
- Avoids state corruption (two submissions racing)
- Clear feedback (user knows submission is processing)

### Rating State (Per Card)

**Storage:** Local state only (not persisted).

```tsx
const [selectedRating, setSelectedRating] = useState<number | null>(null);
```

**Lifecycle:**
- Expand card → `selectedRating = null` (fresh start)
- Select rating button → `setSelectedRating(7)`
- Cancel → `setSelectedRating(null)` + collapse
- Submit success → cleared implicitly (card unmounts, replaced by preview)
- Submit error → kept (for retry)

**Key rule:** Cancel always clears rating (no partial state persisted).

---

## Mobile Viewport Handling

### Expanded Card Max-Height

**Decision:** Fixed 200px max-height for story text, scrollable if overflow. Rating UI sticky at bottom.

```tsx
┌─ EXPANDED (mobile) ───────────────┐
│ 👤 Story text that might be very  │ ← Scrollable area
│    long and needs scrolling to    │   (max 200px)
│    read fully. User can scroll... │   overflow-y-auto
│    ↕️                              │
├────────────────────────────────────┤
│ How much does Alice understand?    │ ← Sticky section
│ [0][1][2][3][4][5][6][7][8][9][10]│   (always visible)
│                                    │
│ [Submit] [Cancel]                  │
└────────────────────────────────────┘
```

**Implementation:**
```tsx
<div className="flex flex-col max-h-[calc(100vh-300px)]">
  {/* Story text: scrollable */}
  <div className="overflow-y-auto max-h-[200px]">
    {story.content}
  </div>

  {/* Rating UI: sticky */}
  <div className="sticky bottom-0 bg-background pt-4 border-t">
    <RatingButtons />
    <Button>Submit</Button>
    <Button variant="ghost">Cancel</Button>
  </div>
</div>
```

**Rationale:**
- Rating UI must always be visible (user can't submit if it's scrolled off-screen)
- 200px story text gives ~10 lines of context (enough for most stories)
- If story is longer, user can scroll before rating
- Prevents keyboard from pushing rating buttons off-screen

**Mobile keyboard handling:**
- Rating buttons already visible (sticky at bottom)
- When soft keyboard appears, user can still see rating buttons above keyboard
- No need for special keyboard detection

---

## Technical Approach

### Phase 0: Pre-Implementation Verification

**REQUIRED before starting work:**

1. **Verify data dependencies:**
   ```bash
   # Check StoryWithAuthor type includes required fields
   grep -A 10 "type StoryWithAuthor" src/

   # Check getPointsForStory exists
   grep -r "getPointsForStory" src/

   # Check understoodCount field exists
   grep -r "understoodCount" src/
   ```

2. **Verify SelectedContentDisplay usage:**
   ```bash
   # Find all usages
   grep -rn "SelectedContentDisplay" src/

   # Document line numbers and context in work log
   # Confirm: Only used in LiveModeView, safe to replace
   ```

3. **Profile linked points calculation:**
   ```tsx
   // In ContentPicker, measure performance
   console.time('linkedPoints');
   const counts = stories.map(s => getPointsForStory(s.id).length);
   console.timeEnd('linkedPoints');
   // If >100ms for 20 stories → optimize or lazy-load
   ```

**If any verification fails:** Document as prerequisite work, add subtasks to P133.

---

### Phase 1: Enhance LiveStoryCard (Inline Expansion)

**File:** `src/app/components/partners/live-content-cards.tsx`

1. Add state to ContentPicker:
   ```tsx
   const [expandedStoryId, setExpandedStoryId] = useState<string | null>(null);
   const [selectedRating, setSelectedRating] = useState<number | null>(null);
   const [submissionState, setSubmissionState] = useState<{
     status: 'idle' | 'submitting' | 'error';
     storyId: string | null;
     error?: string;
   }>({ status: 'idle', storyId: null });
   ```

2. Calculate linked points counts upfront (performance):
   ```tsx
   const linkedPointsCounts = useMemo(
     () => stories.reduce((acc, story) => {
       acc[story.id] = getPointsForStory(story.id).length;
       return acc;
     }, {} as Record<string, number>),
     [stories, getPointsForStory]
   );
   ```

3. Update `LiveStoryCard` to accept:
   - `isExpanded: boolean`
   - `isSubmitting: boolean` (disable card during submission)
   - `error?: string` (show inline error if present)
   - `selectedRating: number | null`
   - `onExpand: () => void` (entire card clickable)
   - `onRatingSelect: (rating: number) => void`
   - `onSubmit: () => void`
   - `onCancel: () => void`
   - `onRetry: () => void` (if error state)
   - `linkedPointsCount: number` (from parent calculation)
   - `partnerName: string`

4. Render logic:
   - If `!isExpanded`: Show collapsed state → entire div has onClick={onExpand}
   - If `isExpanded && !error`: Show rating UI
   - If `isExpanded && error`: Show error + Retry button
   - If `isSubmitting`: Show loading spinner on Submit button, disable all interactions

5. Add avatar support:
   - Import `GravatarAvatar` from `@/app/components/partners/shared`
   - Show avatar next to story text (both collapsed and expanded)
   - Use `story.author?.name` and `story.author?.has_pledged`

6. Add mobile viewport handling:
   - Story text: `max-h-[200px] overflow-y-auto` when expanded
   - Rating UI: `sticky bottom-0` to stay visible
   - Card max-height: `max-h-[calc(100vh-300px)]`

### Phase 2: Create StoryCardPreview Component

**File:** `src/app/components/partners/live-content-cards.tsx`

New component matching prototype's `StoryCardPreview`:

```tsx
interface StoryCardPreviewProps {
  story: StoryWithAuthor;
  showLinkedPoints?: boolean;
}

export function StoryCardPreview({
  story,
  showLinkedPoints = true
}: StoryCardPreviewProps) {
  // Show avatar, story text (2 line clamp), linked points count
  // Blue left border, white bg, rounded corners
  // Non-interactive (no onClick)
}
```

### Phase 3: Replace SelectedContentDisplay with StoryCardPreview

**File:** `src/app/components/partners/live-mode-view.tsx`

Replace two instances (lines 969, 1086):
```tsx
// OLD
<SelectedContentDisplay story={selectedStory} point={selectedPoint} />

// NEW
{selectedStory && <StoryCardPreview story={selectedStory} showLinkedPoints />}
{selectedPoint && <PointCardPreview point={selectedPoint} />}
```

### Phase 4: Update Point Cards (Same Pattern)

Apply same inline expansion pattern to `LivePointCard`:
- "Take a position on this point" button → expands inline
- Show point context + linked stories metadata
- Persist as `PointCardPreview` during flow

---

## Implementation Checklist

### Pre-Implementation (Phase 0)
- [ ] Verify `StoryWithAuthor` type includes `author.name`, `author.has_pledged`, `understoodCount`
- [ ] Verify `getPointsForStory()` function exists in LiveState
- [ ] Grep `SelectedContentDisplay` usage, confirm line numbers in `LiveModeView`
- [ ] Profile linked points calculation performance (target: <50ms for 20 stories)

### Story Cards (Phase 1)
- [ ] Add submission state machine to ContentPicker (`idle | submitting | error`)
- [ ] Calculate linked points counts with `useMemo` (upfront, not per-card)
- [ ] Make entire card clickable (not just button)
- [ ] Implement radio pattern (expanding one card auto-collapses others)
- [ ] Add `GravatarAvatar` to collapsed and expanded states
- [ ] Show linked points count: `{N} points linked`
- [ ] Add CTA button: "Does {partner} understand your story?"
- [ ] Implement inline expansion with 200ms animation
- [ ] Add rating picker to expanded state (use existing `RatingButtons`)
- [ ] Add Submit button with loading spinner during submission
- [ ] Add Cancel button (clears rating, collapses card)
- [ ] Add inline error display (show error message + Retry button)
- [ ] Add mobile viewport handling (200px max-height, sticky rating UI)
- [ ] Disable all cards during submission (prevent race conditions)

### Story Preview Component (Phase 2)
- [ ] Create `StoryCardPreview` component (persistent card format)
- [ ] Show avatar, story text (2 line clamp), linked points count
- [ ] Blue left border, white bg, rounded corners
- [ ] Non-interactive (no onClick)

### Integration (Phase 3)
- [ ] Replace `SelectedContentDisplay` with `StoryCardPreview` in `LiveModeView`
- [ ] Verify line numbers (969, 1086) are current before editing
- [ ] Update all rating screens to show rich card at top
- [ ] Add guard: Don't render ContentPicker if `stories.length === 0`

### Point Cards (Phase 4)
- [ ] Apply same pattern to `LivePointCard` (entire card clickable, inline expansion)
- [ ] CTA: "Take a position on this point"
- [ ] Show linked stories metadata
- [ ] Create `PointCardPreview` component

### Testing
- [ ] Test keyboard navigation (Tab to rating buttons, Escape to collapse, Enter to submit)
- [ ] Test mobile tap targets (entire card = 48px+ height)
- [ ] Test error recovery (network fail → retry → success)
- [ ] Test race condition prevention (submit A → immediately tap B → A submission completes)
- [ ] Test cancel behavior (select rating → cancel → re-expand → rating cleared)
- [ ] Test radio pattern (expand A → expand B → A auto-collapses)
- [ ] Test mobile viewport (expanded card + soft keyboard = rating UI still visible)
- [ ] Test very long stories (>500 chars = scrolling works)
- [ ] Test empty state (no stories = ContentPicker not rendered)

### Prototype Alignment Verification
- [ ] Side-by-side comparison with `/prototype/linkedin-like/live`
- [ ] Inline expansion works identically
- [ ] Card visual design matches (avatar, metadata, spacing)
- [ ] Persistent card format matches throughout flow
- [ ] Error handling matches prototype (if applicable)

---

## Resolved Questions

All questions resolved during prep-spec review:

1. **Points linked count** → ✅ Calculate in parent with useMemo, pass as prop
2. **Expanded card max-height** → ✅ 200px with overflow-y-auto, sticky rating UI
3. **Multiple expansions** → ✅ Radio pattern (auto-collapse others)
4. **Search interaction** → ✅ Leave search intact (don't clear on expand)
5. **Collapsed card tap target** → ✅ Entire card clickable (button is visual emphasis)
6. **Error handling** → ✅ Inline error display, keep expanded, show Retry
7. **Cancel behavior** → ✅ Clear rating, collapse card (clean state)
8. **Empty state** → ✅ Don't render ContentPicker if no stories

---

## Success Metrics

**UX Quality:**
- Beginning screen feels polished (matches prototype)
- Context never lost (rich cards persist)
- Clear intent (CTA buttons frame the question)

**No Performance Regression:**
- ContentPicker renders in <100ms with 20 stories
- Inline expansion feels instant (<50ms state update)

**Prototype Parity:**
- Side-by-side screenshots show identical UX
- Key interactions (expand, rate, submit) work identically

---

## Related Work

- **P128**: Shipped basic content picker (foundation for this work)
- **P117**: Stories backend (provides `understoodCount` data)
- **P132**: Rich story view (shares `StoryCardPreview` design language)
- **Prototype**: `/prototype/linkedin-like/live` (design reference)

---

## Prep Notes

**Prepped:** 2026-02-09
**Reviewers:** UX ✓, Architect ✓, Alignment ✓

### Key Findings

**UX Review:**
- ✅ Core pattern is solid (inline expansion + rich cards)
- ⚠️ Addressed 5 critical interaction ambiguities (tap target, error handling, cancel behavior, multi-card, mobile keyboard)
- ✅ All blockers resolved with clear decisions

**Architect Review:**
- ⚠️ Added submission state machine to prevent race conditions (critical)
- ⚠️ Added Phase 0 verification (data dependencies, line numbers, performance)
- ✅ Error handling and loading states specified
- 📊 Estimated effort: 8-12 hours (not "polish" — state management is non-trivial)

**Alignment Review:**
- ✅ Perfect terminology alignment (definitions.md)
- ✅ Philosophy alignment (show don't tell, start simple, design for coaches)
- ✅ No decision conflicts or strategic drift
- 📝 Post-implementation: Run `/kdd` to capture inline expansion pattern in decisions.md

### Implementation Notes

**Complexity:** Medium-High (inline expansion + submission state machine)

**Critical path:**
1. Phase 0 verification (prevents mid-implementation blockers)
2. Submission state machine (prevents race conditions)
3. Mobile viewport handling (rating UI must stay visible)

**Testing focus:**
- Race conditions (rapid card switching during submission)
- Error recovery (network fail → retry flow)
- Mobile keyboard (expanded card + keyboard = UI still accessible)

**Similar work:** P132 (rich story view) — shares `StoryCardPreview` design language

**Post-ship:**
- Run `/kdd` to capture:
  - Inline expansion pattern decision (may apply to other pickers)
  - StoryCardPreview component (add to design-system.md)
  - Rich card pattern (avatar + metadata = context preservation)

---

## Notes

### Why This Matters

P128 proved the content picker pattern works (users engage with stories). But rough edges create friction:
- Navigation feels jarring (separate screen)
- Plain cards lose context (no visual identity)
- Intent unclear (why am I tapping this card?)

The prototype demonstrates the polished version. Aligning production with the prototype:
1. **Reduces cognitive load** (spatial consistency, no navigation)
2. **Preserves context** (avatar + metadata visible)
3. **Clarifies intent** (CTA buttons frame the question)

This is polish work, not new functionality — but polish matters for first impressions.

### Design Philosophy Alignment

From CLAUDE.md: "Prefer simple, direct solutions over complex patterns."

This spec simplifies the flow:
- **Before**: Pick card → navigate → see plain card → rate (4 steps, 1 navigation)
- **After**: Expand card → rate → see rich card (3 steps, 0 navigation)

Inline expansion is simpler than separate screens.
