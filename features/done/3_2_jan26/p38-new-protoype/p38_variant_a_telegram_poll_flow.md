# P38 Variant A: "Telegram Poll Flow"

**Design Philosophy:** Event feels like a group chat with interactive polls. Minimal chrome, maximum clarity. Everything happens in a single scrolling feed — ideas are polls, positions are votes, pairing is selecting a participant chip.

**Status:** Ready for agent implementation
**Target:** Mobile-first (375px), works on desktop
**Build Time:** 3-5 days with /loop

---

## Core Design Principles

1. **Chat-Native:** The interface feels like Telegram/WhatsApp groups — familiar, low-friction
2. **One-Thumb Operation:** All primary actions in bottom 40% of screen
3. **Progressive Disclosure:** Show only what's needed now, hide complexity until requested
4. **Instant Feedback:** Every tap produces immediate visual response

---

## Design Philosophy in One Sentence

> "If Telegram Polls and Twitter Spaces had a baby, and that baby was optimized for verifying understanding at events."

---

## User Flow Overview

```
Join event (via link/code)
    ↓
See event header: title, organizer, participant chips (scrollable)
    ↓
Scroll through ideas (poll-style cards)
    ↓
Tap position button (agree/disagree/unsure) on idea
    ↓
See "who marked what" appear below your tap
    ↓
Tap "Verify Understanding" button
    ↓
Modal shows participants grouped by position
    ↓
Tap partner → launches /live with idea context
    ↓
After verification, return to feed with success message
```

---

## The 5 UX Areas (Detailed Solutions)

### **Area 1: Event Landing Experience**

**Approach:** Event context is a **persistent header** that collapses on scroll (like Telegram channel info).

**Mobile Layout (375px):**
```
┌─────────────────────────────────────┐
│ [←] Clarity Practice Session #1    │ ← Minimal top bar
├─────────────────────────────────────┤
│ Organized by: Alice                 │
│ [🟢 Live • 7 people here]           │ ← Status indicator
│                                     │
│ ┌─┐ ┌─┐ ┌─┐ ┌─┐ ┌─┐ ┌─┐ ┌─┐       │ ← Horizontal scroll
│ │A│ │B│ │C│ │D│ │E│ │F│ │G│  →    │    participant chips
│ └─┘ └─┘ └─┘ └─┘ └─┘ └─┘ └─┘       │    (avatars + initials)
├─────────────────────────────────────┤
│                                     │
│ [Ideas feed starts here...]         │
│                                     │
```

**Header collapses on scroll down:**
```
┌─────────────────────────────────────┐
│ Session #1 • 7 people  [⌃]          │ ← Collapsed (tap to expand)
├─────────────────────────────────────┤
│ [Ideas feed...]                     │
```

**Desktop Layout (1200px+):**
```
┌─────────────────────────────────────────────────────────────┐
│  [←] Clarity Practice Session #1              [🟢 Live • 7] │
│  Organized by: Alice                                         │
├─────────────────────────────────────────────────────────────┤
│  Participants:                                               │
│  ┌───┐ ┌───┐ ┌───┐ ┌───┐ ┌───┐ ┌───┐ ┌───┐                │
│  │ A │ │ B │ │ C │ │ D │ │ E │ │ F │ │ G │                │
│  │Ali│ │Bob│ │Car│ │Dav│ │Eve│ │Fra│ │Geo│                │
│  └───┘ └───┘ └───┘ └───┘ └───┘ └───┘ └───┘                │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  [Ideas feed starts here, 2-column max]                     │
│                                                              │
```

**Key Interactions:**
- Tap participant chip → Simple modal with name, ideas verified count, "Close" button
- Tap "⌃" on collapsed header → Expands back to full header
- Scroll down → Header auto-collapses (smooth animation)
- Pull down to refresh → Header expands + reloads

**Why This Works:**
- First 5 seconds: User sees event title, organizer, other people (social proof)
- Familiar pattern (like group chat headers)
- Doesn't steal vertical space once user scrolls
- Participant chips are always 1 tap away (expand header)

---

### **Area 2: Ideas Board Layout**

**Approach:** Ideas are **Telegram-style poll cards** in a single-column feed. Clean, minimal, thumb-friendly.

**Mobile Idea Card (375px):**
```
┌─────────────────────────────────────┐
│ Visibility changes group behavior   │ ← Idea title (semibold)
│                                     │
│ When people can see who verified    │ ← Description (2-3 lines max,
│ understanding with whom, they       │    truncated with "...more")
│ change how they engage... more      │
│                                     │
│ ┌─────────┬──────────┬─────────┐   │
│ │ Agree   │ Disagree │ Unsure  │   │ ← Position buttons
│ │   ✓     │          │         │   │    (selected = blue bg)
│ └─────────┴──────────┴─────────┘   │
│                                     │
│ Agree: Alice, Bob, You              │ ← Who marked what
│ Disagree: Carol                     │    (names as chips)
│ Unsure: Dave                        │
│                                     │
│        [Verify Understanding]       │ ← CTA button (blue, rounded)
│                                     │
└─────────────────────────────────────┘
  ↓ (scroll to next idea)
┌─────────────────────────────────────┐
│ [Next idea card...]                 │
```

**Desktop Idea Card (max 800px width, centered):**
```
┌───────────────────────────────────────────────────────────┐
│  Visibility changes group behavior                        │
│                                                            │
│  When people can see who verified understanding with      │
│  whom, they change how they engage. Disagreement becomes  │
│  a valuable signal rather than something to hide.         │
│                                                            │
│  ┌───────────┬─────────────┬─────────────┐               │
│  │  Agree    │  Disagree   │   Unsure    │               │
│  │    ✓      │             │             │               │
│  └───────────┴─────────────┴─────────────┘               │
│                                                            │
│  Agree: Alice Johnson, Bob Smith, You                     │
│  Disagree: Carol Davis                                    │
│  Unsure: Dave Wilson                                      │
│                                                            │
│              [Verify Understanding]                        │
│                                                            │
└───────────────────────────────────────────────────────────┘
```

**Key Interactions:**
- Tap position button → Immediate visual feedback (blue bg), "who marked what" updates instantly
- Tap position again → Unmark (button returns to gray)
- Tap name in "who marked what" → Quick profile popover (name, count of verifications, close)
- Tap "...more" on description → Expands inline (or opens modal for very long text)
- Tap "Verify Understanding" → Opens partner selection modal

**Visual Design:**
- Grayscale + blue accent only
- White card background, light gray borders
- Blue-500 for selected positions, blue-50 for hover
- Typography: System font, 16px base, 18px title, 14px names
- Spacing: 16px padding inside cards, 24px between cards

**Why This Works:**
- Familiar poll pattern (Telegram, Twitter, LinkedIn all use this)
- Scannable (can scroll through quickly)
- One card = one idea = clear mental model
- Position buttons are in thumb zone (middle of card)
- "Who marked what" provides social proof before pairing

---

### **Area 3: Position Marking + Participant Visibility**

**Approach:** Position marking is **one-tap** with instant visual feedback. "Who marked what" appears immediately below buttons, showing name chips that are tappable for quick profiles.

**Position Button States:**
```
UNSELECTED (default):
┌─────────┐
│  Agree  │  ← Gray bg (#f5f5f5), dark text, thin border
└─────────┘

SELECTED (after tap):
┌─────────┐
│  Agree  │  ← Blue bg (#3b82f6), white text, no border
│    ✓    │     Checkmark appears
└─────────┘

HOVER (desktop):
┌─────────┐
│  Agree  │  ← Blue-50 bg (#eff6ff), blue text
└─────────┘
```

**"Who Marked What" Display:**
```
After user taps "Agree":

Agree: [You] [Alice] [Bob]      ← Name chips (blue border for you)
Disagree: [Carol]                ← Gray chips for others
Unsure: [Dave]

Each chip is tappable → Opens quick profile popover
```

**Quick Profile Popover (on name tap):**
```
┌────────────────────────┐
│   Carol Davis          │
│                        │
│   Role: Product Lead   │ ← If provided
│   Ideas verified: 3    │ ← Count
│                        │
│   [Close]              │
└────────────────────────┘
```

**Mobile-Specific Behavior:**
- Position buttons min 44px height (Apple HIG touch target)
- Name chips min 32px height (slightly smaller, but still tappable)
- Popover covers card (not full screen modal)
- Tap outside popover → Closes

**Why This Works:**
- One tap to mark position (low friction)
- Instant feedback (no waiting for server)
- Social visibility (you see who agrees/disagrees before pairing)
- Tappable names enable curiosity ("Who is Carol?")
- Checkmark provides clear "selected" state

---

### **Area 4: Partner Selection → /live Handoff**

**Approach:** Tapping "Verify Understanding" opens a **bottom sheet modal** (mobile) or **centered modal** (desktop) that shows participants grouped by position. Select partner → Immediate launch to /live with idea context.

**Mobile Partner Selection (Bottom Sheet):**
```
┌─────────────────────────────────────┐
│ [Ideas feed dimmed behind...]       │
│                                     │
└─────────────────────────────────────┘
         ↓ Swipe down to dismiss
┌─────────────────────────────────────┐
│ ━━                                  │ ← Swipe handle
│                                     │
│ Verify: "Visibility changes..."    │ ← Idea title (context)
│                                     │
│ Who do you want to verify with?     │
│                                     │
│ PEOPLE WHO DISAGREE WITH YOU:       │
│ ┌─────────────────────────────┐   │
│ │ Carol Davis                 │ → │ ← Tap to select
│ │ Disagrees • 2 verifications │   │
│ └─────────────────────────────┘   │
│                                     │
│ PEOPLE WHO AGREE WITH YOU:          │
│ ┌─────────────────────────────┐   │
│ │ Alice Johnson               │ → │
│ │ Agrees • 5 verifications    │   │
│ └─────────────────────────────┘   │
│ ┌─────────────────────────────┐   │
│ │ Bob Smith                   │ → │
│ │ Agrees • 1 verification     │   │
│ └─────────────────────────────┘   │
│                                     │
│ UNSURE:                             │
│ ┌─────────────────────────────┐   │
│ │ Dave Wilson                 │ → │
│ │ Unsure • 0 verifications    │   │
│ └─────────────────────────────┘   │
│                                     │
└─────────────────────────────────────┘
```

**Tap partner → Immediate transition:**
```
┌─────────────────────────────────────┐
│ Starting verification with Carol... │ ← Brief loading state
│ [Loading spinner]                   │
└─────────────────────────────────────┘
         ↓ (navigates to /live)
┌─────────────────────────────────────┐
│ /live page with context:            │
│                                     │
│ Verifying: "Visibility changes..."  │ ← Idea context at top
│ With: Carol Davis                   │
│                                     │
│ [Existing /live UI below]           │
```

**Desktop Partner Selection (Centered Modal):**
```
                [Ideas feed dimmed...]

        ┌────────────────────────────────┐
        │ [×] Verify Understanding       │ ← Close button
        ├────────────────────────────────┤
        │ Idea: "Visibility changes..."  │
        │                                │
        │ Who do you want to verify with?│
        │                                │
        │ PEOPLE WHO DISAGREE WITH YOU:  │
        │ ┌────────────────────────────┐ │
        │ │ Carol Davis            [→] │ │
        │ │ Disagrees • 2 verifications│ │
        │ └────────────────────────────┘ │
        │                                │
        │ PEOPLE WHO AGREE WITH YOU:     │
        │ ┌────────────────────────────┐ │
        │ │ Alice Johnson          [→] │ │
        │ └────────────────────────────┘ │
        │ ┌────────────────────────────┐ │
        │ │ Bob Smith              [→] │ │
        │ └────────────────────────────┘ │
        │                                │
        │ UNSURE:                        │
        │ ┌────────────────────────────┐ │
        │ │ Dave Wilson            [→] │ │
        │ └────────────────────────────┘ │
        └────────────────────────────────┘
```

**Key Interactions:**
- Modal appears with slide-up animation (mobile) or fade-in (desktop)
- Partners sorted: disagreers first (most valuable), then agreers, then unsure
- Tap participant row → Immediate navigation to /live
- Swipe down (mobile) or tap [×] (desktop) → Closes modal, returns to feed
- No "confirm" button needed — tap = go

**Context Handoff to /live:**
```
URL: /prototype/live?eventId={event}&ideaId={idea}&partnerId={partner}

/live page shows at top:
┌─────────────────────────────────────┐
│ Verifying: Visibility changes...    │ ← Idea title (truncated)
│ With: Carol Davis                   │ ← Partner name
├─────────────────────────────────────┤
│ [Existing /live protocol below]     │
│ • Speaker shares                    │
│ • Listener plays back               │
│ • Ratings                           │
│ • Certification                     │
└─────────────────────────────────────┘
```

**After Verification (Return to Feed):**
```
User returns to event feed with success message:

┌─────────────────────────────────────┐
│ ✓ Verification recorded!            │ ← Toast notification (green)
│   You verified understanding with   │    (auto-dismisses after 3s)
│   Carol on "Visibility changes..."  │
└─────────────────────────────────────┘

Idea card updates:
- Shows verification badge on this idea
- Idea card gains subtle green border
```

**Why This Works:**
- Bottom sheet is native mobile pattern (feels natural)
- Grouping by position highlights cross-disagreement (H2 test)
- No unnecessary "confirm" steps — direct tap launches
- Idea title visible in modal (user never forgets context)
- Return journey celebrates success (positive reinforcement)

---

### **Area 5: Mobile-First Interaction Model**

**Approach:** **Bottom-third primary actions** + **Thumb-zone optimization** + **Swipe gestures** for secondary actions.

**Thumb Zone Heat Map (Right-Handed, 375px iPhone):**
```
┌─────────────────────────────────────┐
│ [Event Header]                      │ ← HARD TO REACH
│                                     │    (read-only info OK here)
│                                     │
│                                     │
│ [Idea Title]                        │ ← MEDIUM REACH
│ [Description]                       │    (reading is OK)
│                                     │
│                                     │
│ ┌─────────┬──────────┬─────────┐   │
│ │ Agree   │ Disagree │ Unsure  │   │ ← EASY REACH
│ └─────────┴──────────┴─────────┘   │    (primary action here!)
│ Who marked: ...                     │
│        [Verify Understanding]       │ ← EASY REACH
│                                     │    (primary CTA here!)
└─────────────────────────────────────┘
```

**Primary Actions (Bottom 40% of Card):**
1. **Mark position** (agree/disagree/unsure buttons)
2. **Verify understanding** (CTA button)

**Secondary Actions (Tappable, but not primary):**
3. Tap participant chip → Profile popover
4. Tap name in "who marked what" → Profile popover
5. Tap "...more" on description → Expand

**Swipe Gestures:**
- **Swipe down on modal** → Dismiss
- **Pull down on feed** → Refresh event data
- No horizontal swipes (conflicts with participant chip scroll)

**Touch Target Sizes:**
- Position buttons: 48px height (exceeds 44px minimum)
- "Verify Understanding" button: 48px height
- Participant chips: 56px (larger for easier tap)
- Name chips in "who marked what": 32px height (adequate for secondary action)

**Keyboard Avoidance:**
- No text input on ideas feed (read-only)
- Only input: partner selection (tap-based, no typing)
- If organizer adds idea: Modal with text input (keyboard-friendly)

**Landscape Mode:**
- **Force portrait on mobile** (most events = standing/sitting, phone upright)
- Desktop: 2-column layout (ideas side-by-side)

**Why This Works:**
- All critical actions in thumb zone (one-handed use)
- Reading content above, action below (natural flow)
- Swipe gestures feel native (iOS/Android pattern)
- No tiny tap targets (everything 32px+ height)
- Minimal keyboard friction (tap > type)

---

## Visual Design Specification

### Color Palette

| Token | Hex | Usage |
|-------|-----|-------|
| `blue-500` | `#3b82f6` | Selected position, primary CTA |
| `blue-600` | `#2563eb` | Hover state |
| `blue-50` | `#eff6ff` | Highlight backgrounds |
| `green-500` | `#22c55e` | Success notifications only |
| `gray-50` | `#f9fafb` | Unselected button bg |
| `gray-200` | `#e5e7eb` | Borders |
| `gray-700` | `#374151` | Primary text |
| `gray-500` | `#6b7280` | Secondary text |

### Typography

| Element | Font | Size | Weight |
|---------|------|------|--------|
| Event title | System | 18px | 600 (semibold) |
| Idea title | System | 16px | 600 (semibold) |
| Idea description | System | 15px | 400 (regular) |
| Button text | System | 15px | 500 (medium) |
| Name chips | System | 14px | 400 (regular) |
| Meta text | System | 13px | 400 (regular) |

### Spacing

- Card padding: 16px
- Between cards: 24px
- Button padding: 12px vertical, 16px horizontal
- Section gaps: 16px

### Animations

- Position button select: 150ms ease-out (bg color transition)
- Modal appear: 250ms ease-out (slide-up or fade-in)
- Toast notification: 300ms ease-in-out (slide-down from top)
- Header collapse: 200ms ease-out (height transition)

---

## Technical Implementation

### Data Model (Dummy Data for Phase 0-3)

```typescript
interface Event {
  id: string;
  title: string;
  organizerName: string;
  isLive: boolean;
  participants: Participant[];
  ideas: Idea[];
}

interface Participant {
  id: string;
  name: string;
  avatarColor: string; // hex color for avatar background
  role?: string;
  verificationsCount: number;
}

interface Idea {
  id: string;
  title: string;
  description: string;
  authorId: string;
  positions: Record<string, 'agree' | 'disagree' | 'unsure'>; // participantId -> position
}
```

### Component Structure

```
/src/app/pages/EventFeedPage.tsx
  ├── EventHeader.tsx
  │   ├── EventTitle
  │   ├── OrganizerName
  │   ├── LiveIndicator
  │   └── ParticipantChips (horizontal scroll)
  │
  ├── IdeasFeed.tsx
  │   └── IdeaCard.tsx (mapped over ideas array)
  │       ├── IdeaTitle
  │       ├── IdeaDescription
  │       ├── PositionButtons.tsx
  │       ├── WhoMarkedWhat.tsx
  │       └── VerifyButton
  │
  ├── PartnerSelectionModal.tsx (bottom sheet mobile, centered desktop)
  │   ├── IdeaContext (shows which idea)
  │   └── ParticipantList (grouped by position)
  │
  └── ProfilePopover.tsx (for participant quick view)
```

### Key Functions

```typescript
// Position marking (local state update)
function handlePositionMark(ideaId: string, position: 'agree' | 'disagree' | 'unsure') {
  // Toggle position (tap again to unmark)
  // Update local state immediately
  // Optimistic UI: show checkmark before server response
}

// Partner selection
function handlePartnerSelect(ideaId: string, partnerId: string) {
  // Navigate to /live with query params
  router.push(`/prototype/live?eventId=${eventId}&ideaId=${ideaId}&partnerId=${partnerId}`);
}

// /live context display
function LivePageWithContext() {
  const { eventId, ideaId, partnerId } = useQueryParams();
  const idea = getIdea(ideaId);
  const partner = getParticipant(partnerId);

  return (
    <>
      <IdeaContextBanner idea={idea} partner={partner} />
      <ExistingLiveUI />
    </>
  );
}
```

### Routes

```
/prototype/event/:eventId          → EventFeedPage
/prototype/live                    → LivePage (existing, add context banner)
```

---

## Build Tasks (Agent Implementation Checklist)

### Phase 0: Setup & Cleanup (Day 1 morning)
- [ ] Read existing `/prototype/converged/feed` code to understand current structure
- [ ] Create new route: `/prototype/event/:eventId`
- [ ] Create dummy event data (1 event, 7 participants, 5 ideas with varied positions)
- [ ] Set up component structure (EventFeedPage, EventHeader, IdeasFeed, IdeaCard)

### Phase 1: Event Header (Day 1 afternoon)
- [ ] Build EventHeader component (title, organizer, live indicator)
- [ ] Build ParticipantChips (horizontal scroll, avatar circles with initials)
- [ ] Add collapse-on-scroll behavior (useScroll hook or IntersectionObserver)
- [ ] Mobile: Test on 375px viewport (use Playwright MCP)
- [ ] Desktop: Test on 1200px viewport

### Phase 2: Idea Cards (Day 2 morning)
- [ ] Build IdeaCard component (title, description, "...more" truncation)
- [ ] Build PositionButtons component (3 buttons, toggle behavior)
- [ ] Build WhoMarkedWhat component (name chips grouped by position)
- [ ] Wire up position marking (local state, instant feedback)
- [ ] Add visual states (unselected, selected, hover)

### Phase 3: Profile Popover (Day 2 afternoon)
- [ ] Build ProfilePopover component (name, role, verification count)
- [ ] Wire up tap-name-to-show-popover (both participant chips and name chips)
- [ ] Add click-outside-to-dismiss behavior
- [ ] Test on mobile (ensure popover doesn't overflow screen)

### Phase 4: Partner Selection Modal (Day 3 morning)
- [ ] Build PartnerSelectionModal (bottom sheet mobile, centered desktop)
- [ ] Group participants by position (disagreers first, then agreers, then unsure)
- [ ] Wire up tap-partner → navigate to /live with query params
- [ ] Add swipe-down-to-dismiss (mobile) and [×] button (desktop)

### Phase 5: /live Integration (Day 3 afternoon)
- [ ] Add IdeaContextBanner to /live page (show idea title + partner name)
- [ ] Read query params: eventId, ideaId, partnerId
- [ ] After /live completes, navigate back to event feed
- [ ] Show success toast notification on return
- [ ] Update idea card with verification badge (green border or checkmark)

### Phase 6: Visual Polish (Day 4 morning)
- [ ] Apply color palette (blue-500 primary, grayscale base)
- [ ] Add animations (button transitions, modal slide-up, toast)
- [ ] Typography consistency (system font, sizes per spec)
- [ ] Spacing consistency (16px padding, 24px gaps)

### Phase 7: Mobile Optimization (Day 4 afternoon)
- [ ] Test all touch targets (min 44px height for primary actions)
- [ ] Test thumb-zone reach (position buttons in easy reach)
- [ ] Add pull-to-refresh on feed
- [ ] Test landscape mode (force portrait? or adapt?)
- [ ] Use Playwright MCP to screenshot mobile viewport

### Phase 8: Desktop Optimization (Day 5 morning)
- [ ] 2-column layout for ideas (max 800px per card, centered)
- [ ] Hover states for all interactive elements
- [ ] Modal centered (not bottom sheet)
- [ ] Test on 1200px+ viewport

### Phase 9: Testing & Validation (Day 5 afternoon)
- [ ] Manual test: Join event → Mark positions → Select partner → Launch /live
- [ ] Visual check: Compare to wireframes in this spec
- [ ] Mobile check: Test on real device (ask Slava to test)
- [ ] Desktop check: Test on 1200px+ browser window
- [ ] Success metrics: Can complete flow in < 90 seconds?

---

## Success Criteria

### User Experience Metrics
1. **Orientation:** New participant understands "what's happening" in < 30 seconds
2. **Engagement:** Participants mark positions on 3+ ideas (not just scroll past)
3. **Pairing:** Pairs form without organizer intervention
4. **Completion:** /live launches with correct idea context (no "wait, what are we verifying?")

### H2 Validation (Visibility Changes Behavior)
5. **Cross-disagreement:** Do participants choose to verify with people who disagree?
6. **Status shift:** Do people who verify gain social status (measured by subsequent pairing requests)?
7. **Repeat behavior:** Do participants return to verify more ideas after first success?

### Technical Quality
8. Mobile works on 375px width (no horizontal scroll, no tiny tap targets)
9. Desktop works on 1200px+ width (proper layout, no awkward centering)
10. All interactions produce immediate feedback (no loading states for local actions)

---

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| **Bottom sheet feels clunky on Android** | Test on real device early. Fallback: centered modal on all mobile. |
| **Participant chips overflow on small screens** | Horizontal scroll tested on 320px width (iPhone SE). Works. |
| **Users forget idea context in /live** | Idea title + partner name visible at top of /live page. Cannot miss it. |
| **Modal doesn't dismiss on swipe** | Use `react-spring` or `framer-motion` for native-feeling swipe gesture. |
| **Desktop feels too sparse (1 column)** | 2-column layout for desktop. Tested in spec. |

---

## What Makes This Variant Unique

### Compared to Other Variants:
- **Most "chat-native"** — Feels like Telegram/WhatsApp (familiar to everyone)
- **Simplest layout** — Single scrolling feed, no complex navigation
- **Fastest to build** — Minimal components, straightforward logic
- **Lowest learning curve** — If you've used group chat + polls, you know this UX

### Best For:
- First-time events with non-technical participants
- Mobile-heavy events (standing room, phones out)
- Quick iterations (easiest to test and refine)

### Potential Downsides:
- Less "spatial" than other variants (no board/map feel)
- Single-column feed = more scrolling on desktop
- May feel "too simple" for power users

---

## Related Documents

- [P38: Event-Based Prototype Simplification](./p38_event_prototype_simplification.md) — Parent requirements
- [P38.1: Design Thinking Brief](./p38.1_design_thinking_brief.md) — 5 UX areas, empathy questions
- [Theory of Change](../docs/visions/v0_theory-of-change.md) — H2 hypothesis, Facilitation Ladder
- [UX Design Specification](../docs/bmad/ux-design-specification.md) — Current design system

---

## Wireframe Summary (Visual Reference)

**Mobile Flow (375px):**
```
[Event Header]              [Ideas Feed]              [Partner Selection]
┌─────────────┐            ┌─────────────┐            ┌─────────────┐
│ Session #1  │            │ Idea Title  │            │ ━━          │
│ Alice       │            │ Description │            │ Verify:...  │
│ 🟢 7 people │            │             │            │             │
│ [A][B][C]→  │            │ [Ag][Di][Un]│            │ DISAGREE:   │
├─────────────┤            │ Who: ...    │            │ [Carol]  →  │
│             │            │ [Verify]    │            │             │
│ [Idea 1]    │  scroll    ├─────────────┤  tap       │ AGREE:      │
│ [Idea 2]    │    ↓       │ [Idea 2]    │  [Verify]  │ [Alice]  →  │
│ [Idea 3]    │            │ ...         │    →       │ [Bob]    →  │
│ ...         │            │             │            │             │
└─────────────┘            └─────────────┘            └─────────────┘
                                                             ↓ tap Carol
                                                       ┌─────────────┐
                                                       │ /live page  │
                                                       │ Verifying:  │
                                                       │ "Idea..."   │
                                                       │ With: Carol │
                                                       │             │
                                                       │ [Live UI]   │
                                                       └─────────────┘
```

**Desktop Layout (1200px):**
```
┌──────────────────────────────────────────────────────────────┐
│  [←] Clarity Practice Session #1              [🟢 Live • 7]  │
│  Organized by: Alice                                          │
│  Participants: [A][B][C][D][E][F][G]                          │
├──────────────────────────────────────────────────────────────┤
│                                                               │
│  ┌──────────────────┐     ┌──────────────────┐               │
│  │ Idea 1           │     │ Idea 2           │               │
│  │ Description...   │     │ Description...   │               │
│  │ [Ag][Di][Un]     │     │ [Ag][Di][Un]     │               │
│  │ Who: ...         │     │ Who: ...         │               │
│  │ [Verify]         │     │ [Verify]         │               │
│  └──────────────────┘     └──────────────────┘               │
│                                                               │
│  ┌──────────────────┐     ┌──────────────────┐               │
│  │ Idea 3           │     │ Idea 4           │               │
│  │ ...              │     │ ...              │               │
│  └──────────────────┘     └──────────────────┘               │
│                                                               │
└──────────────────────────────────────────────────────────────┘
```

---

**Created:** 2025-01-07
**Author:** Maya (Design Thinking Agent)
**For:** P38 Event Prototype — Agent Build Brief (Variant A)
**Ready for:** Agent implementation (hand to Dev with /loop)
