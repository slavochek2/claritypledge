# P38 Variant B: "Spatial Swipe Board"

**Design Philosophy:** Ideas are spatial cards on a virtual board. Swipe to mark positions (Tinder-style). Pairing happens by dragging your avatar to another participant's avatar. Desktop = 2D spatial canvas, mobile = stack of swipeable cards.

**Status:** Ready for agent implementation
**Target:** Mobile-first with gesture-based interactions
**Build Time:** 4-5 days with /loop (slightly more complex than Variant A)

---

## Core Design Principles

1. **Gestural:** Primary interactions are swipes and drags (not taps)
2. **Spatial:** Ideas have positions on a virtual board (not just a list)
3. **Playful:** Feels like a game (Tinder swipes, drag-to-pair)
4. **Visual:** Positions are shown spatially (agree left, disagree right, unsure center)

---

## Design Philosophy in One Sentence

> "If Tinder, Miro, and a card game had a baby — gestural, spatial, and weirdly fun."

---

## User Flow Overview

```
Join event
    ↓
See spatial board: participant avatars around perimeter, idea cards in center
    ↓
Mobile: Swipe card left (disagree) / right (agree) / up (unsure)
Desktop: Drag card to position zone
    ↓
Idea moves to position zone, your avatar appears on it
    ↓
To pair: Drag your avatar from idea card onto another participant's avatar
    ↓
Pairing request sent, modal confirms
    ↓
Launch /live with idea context
```

---

## The 5 UX Areas (Detailed Solutions)

### **Area 1: Event Landing Experience**

**Approach:** Event is a **spatial canvas** — participants around the edge, ideas in the center. Feels like entering a physical room.

**Mobile Layout (375px):**
```
┌─────────────────────────────────────┐
│ [←] Session #1      🟢 7 people     │ ← Minimal top bar
├─────────────────────────────────────┤
│                                     │
│     [A]         [B]         [C]     │ ← Participant avatars
│                                     │    around perimeter
│  [G]           IDEAS           [D]  │
│                                     │
│     [F]         [E]                 │
│                                     │
│  ┌───────────────────────────┐     │
│  │ Swipe cards to mark       │     │ ← Hint overlay (first time)
│  │ position:                 │     │    (dismisses after 3s)
│  │ → Agree  ← Disagree  ↑ ?  │     │
│  └───────────────────────────┘     │
│                                     │
│         [Tap to explore ideas]      │ ← CTA to start
│                                     │
└─────────────────────────────────────┘
```

**After tap "Explore ideas":**
```
┌─────────────────────────────────────┐
│ [←]                          [Info] │
├─────────────────────────────────────┤
│                                     │
│        [First Idea Card]            │ ← Card stack appears
│     ┌───────────────────┐           │    (center of screen)
│     │ Idea Title        │           │
│     │                   │           │
│     │ Description...    │           │
│     │                   │           │
│     │ ← Disagree  Agree →│          │ ← Swipe hints
│     └───────────────────┘           │
│                                     │
│         [Next card behind]          │ ← Stack visible
│                                     │
└─────────────────────────────────────┘
```

**Desktop Layout (1200px+):**
```
┌──────────────────────────────────────────────────────────────┐
│  [←] Clarity Practice Session #1         🟢 Live • 7 people  │
│  Organized by: Alice                                [Info]    │
├──────────────────────────────────────────────────────────────┤
│                                                               │
│    [Alice]            [Bob]            [Carol]               │ ← Participant avatars
│                                                               │    (around perimeter)
│                                                               │
│  [George]           ┌─────────┐           [Dave]             │
│                     │ Idea 1  │                              │ ← Ideas as draggable
│                     │ Title   │                              │    cards (center)
│                     └─────────┘                              │
│                 ┌─────────┐                                  │
│                 │ Idea 2  │                                  │
│  [Frank]        │ Title   │              [Eve]               │
│                 └─────────┘                                  │
│                                                               │
│    ┌─────────────────────────────────────────────────┐       │
│    │ AGREE            UNSURE            DISAGREE     │       │ ← Position zones
│    │ (drag cards here)                               │       │    (bottom bar)
│    └─────────────────────────────────────────────────┘       │
└──────────────────────────────────────────────────────────────┘
```

**Key Interactions:**
- **Mobile:** Tap "Explore ideas" → Card stack appears (center screen)
- **Desktop:** Ideas load as draggable cards in center of canvas
- Tap participant avatar → Quick profile (same as Variant A)
- Tap [Info] → Event details modal (organizer, event description)

**Why This Works:**
- Spatial metaphor = "entering a room" (familiar mental model)
- Participants visible immediately (social proof)
- Hint overlay teaches gestures (first-time UX)
- Desktop: spatial layout allows for creative idea placement

---

### **Area 2: Ideas Board Layout**

**Approach:** Mobile = **card stack** (like Tinder). Desktop = **2D canvas** with draggable cards.

**Mobile: Card Stack (375px):**
```
┌─────────────────────────────────────┐
│ [←]                   Card 1 of 5   │
├─────────────────────────────────────┤
│                                     │
│     ┌───────────────────────┐       │
│     │                       │       │ ← Top card (current)
│     │  Idea Title           │       │
│     │                       │       │
│     │  When people can see  │       │
│     │  who verified...      │       │
│     │                       │       │
│     │  [Read full]          │       │
│     │                       │       │
│     │  ← Disagree  Agree →  │       │ ← Swipe hints
│     │      ↑ Unsure         │       │
│     └───────────────────────┘       │
│                                     │
│         [Next card behind]          │ ← Stack preview
│                                     │
└─────────────────────────────────────┘
```

**Swipe Right (Agree):**
```
┌─────────────────────────────────────┐
│ [←]                   Card 2 of 5   │
├─────────────────────────────────────┤
│                                     │
│  [Card flies off right with         │ ← Animation
│   "AGREE" stamp overlay]            │    (150ms)
│                                     │
│     ┌───────────────────────┐       │
│     │  Next Idea            │       │ ← Next card slides up
│     │  ...                  │       │
│     └───────────────────────┘       │
│                                     │
└─────────────────────────────────────┘
```

**Swipe Left (Disagree):**
```
Similar to right, but card flies left with "DISAGREE" stamp
```

**Swipe Up (Unsure):**
```
Card flies up with "UNSURE" stamp
```

**After All Cards Swiped:**
```
┌─────────────────────────────────────┐
│ [←]                                 │
├─────────────────────────────────────┤
│                                     │
│     ✓ All ideas reviewed!           │
│                                     │
│     [See Your Positions]            │ ← CTA
│                                     │
│     [Find Verification Partners]    │ ← CTA
│                                     │
└─────────────────────────────────────┘
```

**Desktop: 2D Canvas (1200px+):**
```
┌──────────────────────────────────────────────────────────────┐
│  Event Title                                      [Filters]   │
├──────────────────────────────────────────────────────────────┤
│                                                               │
│  [Alice]            [Bob]             [Carol]                │
│                                                               │
│            ┌────────┐         ┌────────┐                     │
│  [George]  │ Idea 1 │         │ Idea 2 │        [Dave]      │ ← Draggable cards
│            │ Drag → │         │ Drag → │                     │    (can be moved
│            └────────┘         └────────┘                     │     anywhere)
│                   ┌────────┐                                 │
│         [Frank]   │ Idea 3 │              [Eve]              │
│                   └────────┘                                 │
│                                                               │
│  ┌────────────┬────────────┬────────────┐                    │
│  │   AGREE    │   UNSURE   │  DISAGREE  │                    │ ← Drop zones
│  │  [Idea 1]  │            │  [Idea 2]  │                    │    (shows ideas
│  │            │            │            │                    │     you marked)
│  └────────────┴────────────┴────────────┘                    │
└──────────────────────────────────────────────────────────────┘
```

**Desktop Drag Interaction:**
```
Drag idea card to AGREE zone:
┌────────────┐
│   AGREE    │ ← Zone highlights on hover
│  [Idea 1]  │    (blue glow)
│  [Drop]    │
└────────────┘

After drop:
┌────────────┐
│   AGREE    │
│  [Idea 1]  │ ← Card shrinks, shows in zone
│  [You]     │    Your avatar appears on card
│  [Alice]   │    Other agreers appear
└────────────┘
```

**Why This Works:**
- **Mobile:** Swipe = fastest gesture (muscle memory from Tinder, dating apps)
- **Desktop:** Spatial canvas = creative, engaging (not just scrolling)
- Card stack = focus on one idea at a time (no overwhelm)
- Drop zones = clear visual feedback (you see your position immediately)

---

### **Area 3: Position Marking + Participant Visibility**

**Approach:** Position marking is **gestural** (swipe or drag). "Who marked what" is shown **spatially** on the idea cards in the position zones.

**Mobile: After Swiping (Position Review):**
```
Tap "See Your Positions":

┌─────────────────────────────────────┐
│ [←] Your Positions                  │
├─────────────────────────────────────┤
│                                     │
│ YOU AGREE WITH:                     │
│ ┌───────────────────────────────┐   │
│ │ Idea: "Visibility changes..." │   │
│ │                               │   │
│ │ Also agree: [Alice] [Bob]     │   │ ← Participant chips
│ │ Disagree: [Carol]             │   │
│ │                               │   │
│ │ [Verify Understanding]        │   │ ← CTA
│ └───────────────────────────────┘   │
│                                     │
│ YOU DISAGREE WITH:                  │
│ ┌───────────────────────────────┐   │
│ │ Idea: "Theory of Change..."   │   │
│ │ Also disagree: [Frank]        │   │
│ │ Agree: [Alice] [Bob] [Dave]   │   │
│ │ [Verify Understanding]        │   │
│ └───────────────────────────────┘   │
│                                     │
│ YOU'RE UNSURE ABOUT:                │
│ ┌───────────────────────────────┐   │
│ │ Idea: "Facilitation Ladder"   │   │
│ │ ...                           │   │
│ └───────────────────────────────┘   │
└─────────────────────────────────────┘
```

**Desktop: Position Zones Show Participants:**
```
┌────────────┬────────────┬────────────┐
│   AGREE    │   UNSURE   │  DISAGREE  │
│            │            │            │
│  Idea 1    │            │  Idea 2    │
│  ┌──────┐  │            │  ┌──────┐  │
│  │[You] │  │            │  │[You] │  │ ← Your avatar prominent
│  │[Ali] │  │            │  │[Car] │  │ ← Others smaller
│  │[Bob] │  │            │  │[Fra] │  │
│  └──────┘  │            │  └──────┘  │
│            │            │            │
└────────────┴────────────┴────────────┘
```

**Key Interactions:**
- **Mobile:** Swipe = mark position (no undo in swipe flow, but can revisit in "Your Positions")
- **Desktop:** Drag to zone = mark position (can drag back out to change position)
- Tap participant chip on idea → Quick profile
- Tap idea card in position zone → Expands to show full description + "Verify Understanding" button

**Why This Works:**
- Gestural = fast, natural (no button hunting)
- Spatial zones = visual clarity (you see who's where)
- Participant chips on cards = social proof before pairing
- Mobile: "Your Positions" summary prevents losing track

---

### **Area 4: Partner Selection → /live Handoff**

**Approach:** Pairing is **gestural** — drag your avatar from an idea onto another participant's avatar. Feels like "connecting" in a spatial game.

**Mobile: Pairing Flow:**
```
From "Your Positions" screen, tap "Verify Understanding":

┌─────────────────────────────────────┐
│ [←] Find Partner                    │
│                                     │
│ Idea: "Visibility changes..."       │
│                                     │
│ WHO TO VERIFY WITH:                 │
│                                     │
│ ┌─────────────────────────────┐   │
│ │ [Carol]  Disagrees           │ → │ ← Tap to pair
│ │ "Let's verify understanding" │   │
│ └─────────────────────────────┘   │
│                                     │
│ ┌─────────────────────────────┐   │
│ │ [Alice]  Agrees              │ → │
│ │ "Let's verify understanding" │   │
│ └─────────────────────────────┘   │
│                                     │
│ ┌─────────────────────────────┐   │
│ │ [Bob]    Agrees              │ → │
│ │ "Let's verify understanding" │   │
│ └─────────────────────────────┘   │
└─────────────────────────────────────┘
```

**Tap Carol:**
```
┌─────────────────────────────────────┐
│ Request Verification?               │
│                                     │
│ You'll verify understanding with:   │
│ Carol Davis                         │
│                                     │
│ On idea: "Visibility changes..."    │
│                                     │
│ [Cancel]       [Start Verification] │
└─────────────────────────────────────┘
```

**Desktop: Drag-to-Pair (Unique Interaction):**
```
From position zones, drag your avatar onto another participant:

Step 1: Hover over your avatar on Idea 1
┌────────────┐
│   AGREE    │
│  Idea 1    │
│  ┌──────┐  │
│  │[You] │  │ ← Cursor over your avatar
│  │[Ali] │  │    (cursor becomes grab hand)
│  └──────┘  │
└────────────┘

Step 2: Drag your avatar toward Alice's avatar (top of canvas)
┌──────────────────────────────────────┐
│  [Alice]            [Bob]            │
│    ↑                                 │ ← Line connects you → Alice
│    │ [You]                           │    (while dragging)
│    │                                 │
│  ┌─┴──────┐                          │
│  │ Idea 1 │                          │
└──────────────────────────────────────┘

Step 3: Drop on Alice's avatar
┌────────────────────────────────────────┐
│ Request Verification?                  │
│                                        │
│ Verify understanding with Alice        │
│ on idea: "Visibility changes..."       │
│                                        │
│ [Cancel]         [Start Verification] │
└────────────────────────────────────────┘
```

**Why This Works:**
- **Desktop drag-to-pair = unique, playful** (no other variant has this)
- **Mobile tap-to-pair = simple fallback** (drag gestures hard on mobile for pairing)
- Pairing feels like "connecting" (spatial metaphor)
- Confirmation modal prevents accidental launches

---

### **Area 5: Mobile-First Interaction Model**

**Approach:** **Swipe-first** for marking positions. **Tap-first** for secondary actions. **Bottom navigation** for mode switching.

**Mobile Navigation (Bottom Bar):**
```
┌─────────────────────────────────────┐
│ [Content area]                      │
│                                     │
│                                     │
│                                     │
├─────────────────────────────────────┤
│ ┌─────┬─────┬─────┬─────┐          │ ← Bottom nav
│ │Ideas│ You │Pair │Info │          │    (thumb-zone)
│ └─────┴─────┴─────┴─────┘          │
└─────────────────────────────────────┘

Modes:
- Ideas: Swipeable card stack (mark positions)
- You: Your positions summary
- Pair: Find partners for verification
- Info: Event details, participants
```

**Swipe Gesture Thresholds:**
```
Horizontal swipe (left/right):
- Distance > 100px → Mark disagree/agree
- Velocity > 0.5px/ms → Mark even if < 100px

Vertical swipe (up):
- Distance > 150px → Mark unsure
- (up requires more distance to avoid accidental)

Swipe cancellation:
- Swipe < 50px → Returns to center (no action)
```

**Touch Target Sizes:**
- Card (entire card is draggable): 327px × 480px (large!)
- Bottom nav buttons: 64px × 48px (easy thumb reach)
- Participant chips: 48px diameter
- "Verify Understanding" buttons: 48px height

**Desktop: Keyboard Shortcuts (Power User Feature):**
```
A = Drag selected idea to Agree zone
D = Drag selected idea to Disagree zone
S = Drag selected idea to Unsure zone
Space = Select/deselect idea
V = Verify understanding (opens partner modal)
Esc = Cancel/close modal
```

**Why This Works:**
- Swipe = fastest mobile gesture (Tinder-proven)
- Bottom nav = thumb-zone control (easy reach)
- Desktop drag = satisfying, creative interaction
- Keyboard shortcuts = power users can fly through ideas

---

## Visual Design Specification

### Color Palette (Same as Variant A)

| Token | Hex | Usage |
|-------|-----|-------|
| `blue-500` | `#3b82f6` | Agree zone, primary actions |
| `red-400` | `#f87171` | Disagree zone (softer red, not alarming) |
| `gray-400` | `#9ca3af` | Unsure zone |
| `green-500` | `#22c55e` | Success (pairing confirmed) |
| `gray-50` | `#f9fafb` | Card backgrounds |
| `gray-900` | `#111827` | Text |

### Typography

| Element | Font | Size | Weight |
|---------|------|------|--------|
| Card title | System | 20px | 600 (semibold) |
| Card description | System | 16px | 400 (regular) |
| Position labels | System | 14px | 500 (medium) |
| Participant names | System | 13px | 400 (regular) |

### Animations

- Card swipe: 200ms ease-out (flies off screen)
- Card appear: 150ms ease-in (next card slides up)
- Drag feedback: Real-time follow cursor (no lag)
- Drop zone highlight: 100ms ease-in (glow effect)
- "AGREE/DISAGREE/UNSURE" stamp: 200ms scale-in (appears during swipe)

### Spacing

- Card padding: 24px
- Position zone padding: 16px
- Participant chip gap: 8px
- Bottom nav height: 64px

---

## Technical Implementation

### Data Model (Same as Variant A, Plus Spatial Coordinates)

```typescript
interface Event {
  id: string;
  title: string;
  organizerName: string;
  participants: Participant[];
  ideas: IdeaWithPosition[];
}

interface Participant {
  id: string;
  name: string;
  avatarColor: string;
  spatialPosition?: { x: number; y: number }; // Desktop only
}

interface IdeaWithPosition {
  id: string;
  title: string;
  description: string;
  positions: Record<string, 'agree' | 'disagree' | 'unsure'>;
  spatialPosition?: { x: number; y: number }; // Desktop only
}
```

### Component Structure

```
/src/app/pages/EventSpatialPage.tsx
  ├── MobileView
  │   ├── BottomNavigation (Ideas | You | Pair | Info)
  │   ├── SwipeableCardStack (for Ideas mode)
  │   │   └── IdeaCard (with swipe handlers)
  │   ├── YourPositionsView (for You mode)
  │   └── PartnerFinderView (for Pair mode)
  │
  └── DesktopView
      ├── SpatialCanvas (2D draggable area)
      │   ├── ParticipantAvatars (positioned around perimeter)
      │   ├── IdeaCards (draggable)
      │   └── DropZones (Agree | Unsure | Disagree)
      └── InfoPanel (sidebar with event details)
```

### Key Libraries

```json
{
  "react-spring": "^9.7.0",          // For swipe animations
  "react-use-gesture": "^9.1.3",    // For drag/swipe gestures
  "framer-motion": "^10.0.0"        // Alternative: smooth animations
}
```

### Key Functions

```typescript
// Swipe handling (mobile)
function handleSwipe(direction: 'left' | 'right' | 'up', ideaId: string) {
  const position = direction === 'left' ? 'disagree' : direction === 'right' ? 'agree' : 'unsure';
  markPosition(ideaId, position);
  animateCardExit(direction);
  loadNextCard();
}

// Drag-to-pair (desktop)
function handleAvatarDrop(targetParticipantId: string, ideaId: string) {
  showPairingModal({ ideaId, partnerId: targetParticipantId });
}

// Spatial positioning (desktop)
function initializeSpatialLayout(participants: Participant[], ideas: Idea[]) {
  // Position participants in circle around perimeter
  // Position ideas in center with slight randomness
}
```

---

## Build Tasks (Agent Implementation Checklist)

### Phase 0: Setup (Day 1 morning)
- [ ] Install gesture libraries: react-use-gesture, react-spring
- [ ] Create new route: `/prototype/event/spatial/:eventId`
- [ ] Set up responsive layout (mobile vs desktop detection)
- [ ] Create dummy event data with spatial coordinates

### Phase 1: Mobile Swipe Cards (Day 1-2)
- [ ] Build SwipeableCardStack component
- [ ] Build IdeaCard with swipe handlers (left/right/up)
- [ ] Add swipe animations (card flies off, stamp overlay)
- [ ] Wire up position marking on swipe
- [ ] Add "card X of Y" counter at top
- [ ] Test swipe thresholds (100px horizontal, 150px vertical)

### Phase 2: Mobile Navigation & Views (Day 2)
- [ ] Build BottomNavigation component (Ideas | You | Pair | Info)
- [ ] Build YourPositionsView (shows marked ideas grouped by position)
- [ ] Build PartnerFinderView (list of participants by position)
- [ ] Wire up mode switching (bottom nav taps)

### Phase 3: Desktop Spatial Canvas (Day 3)
- [ ] Build SpatialCanvas component (2D draggable area)
- [ ] Position participant avatars around perimeter (circular layout)
- [ ] Build draggable IdeaCards for desktop
- [ ] Build DropZones (Agree | Unsure | Disagree) at bottom
- [ ] Wire up drag-and-drop with react-use-gesture

### Phase 4: Desktop Drag-to-Pair (Day 3-4)
- [ ] Add drag handler for "your avatar" on idea cards
- [ ] Draw connection line while dragging avatar
- [ ] Handle drop on participant avatar → show pairing modal
- [ ] Add keyboard shortcuts (A/D/S for position, V for verify)

### Phase 5: Pairing Modal & /live Integration (Day 4)
- [ ] Build pairing confirmation modal (same for mobile & desktop)
- [ ] Wire up "Start Verification" → navigate to /live with context
- [ ] Add IdeaContextBanner to /live page (reuse from Variant A)
- [ ] Handle return from /live (success toast, position update)

### Phase 6: Visual Polish (Day 5)
- [ ] Apply color palette (blue agree, red disagree, gray unsure)
- [ ] Add animations (swipe, drag, drop, modal)
- [ ] Typography and spacing consistency
- [ ] Test on 375px mobile + 1200px desktop

### Phase 7: Testing (Day 5)
- [ ] Test swipe gestures on real mobile device
- [ ] Test desktop drag-to-pair (smooth? connection line visible?)
- [ ] Verify /live launches with correct context
- [ ] Check all 4 mobile modes (Ideas | You | Pair | Info)

---

## Success Criteria

### User Experience
1. **Swipe feels natural** (no lag, clear feedback)
2. **Spatial layout is engaging** (desktop feels creative, not chaotic)
3. **Drag-to-pair is discoverable** (users figure out they can drag avatars)
4. **All cards reviewed** (users don't skip ideas accidentally)

### H2 Validation
5. **Cross-disagreement pairing** (do users drag to disagreers?)
6. **Playful engagement** (does spatial/gestural feel increase participation?)

### Technical
7. Mobile swipe works on iOS + Android (test real devices)
8. Desktop drag-and-drop smooth on Chrome/Firefox/Safari
9. No performance issues (60fps animations)

---

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| **Swipe gestures feel clunky** | Use react-use-gesture library (battle-tested). Test on real devices early. |
| **Desktop drag-to-pair not discoverable** | Add tooltip hint on first hover: "Drag your avatar to pair!" |
| **Spatial layout feels chaotic** | Grid-snap for idea cards. Participants fixed around perimeter. |
| **Accidental swipes** | Require 100px distance + velocity threshold. Cancel if < 50px. |
| **Desktop spatial canvas overwhelming** | Start with ideas stacked in center (not scattered). Participants in predictable circle. |

---

## What Makes This Variant Unique

### Compared to Variant A:
- **Most playful/gestural** (swipe + drag vs tap)
- **Spatial metaphor** (board vs feed)
- **Desktop drag-to-pair** (unique interaction)
- **More "gamified"** (card stack, position zones)

### Best For:
- Events with younger/tech-savvy participants (comfortable with gestures)
- Small-to-medium groups (5-15 people, spatial canvas works)
- Environments where "playful" is appropriate (not corporate/formal)

### Potential Downsides:
- Steeper learning curve (gestures must be taught)
- More complex to build (gesture libraries, spatial positioning)
- May feel "too different" (unfamiliar patterns could confuse)

---

## Related Documents

- [P38: Event-Based Prototype Simplification](./p38_event_prototype_simplification.md)
- [P38.1: Design Thinking Brief](./p38.1_design_thinking_brief.md)
- [P38 Variant A: Telegram Poll Flow](./p38_variant_a_telegram_poll_flow.md)

---

**Created:** 2025-01-07
**Author:** Maya (Design Thinking Agent)
**For:** P38 Event Prototype — Agent Build Brief (Variant B)
**Ready for:** Agent implementation (hand to Dev with /loop)
