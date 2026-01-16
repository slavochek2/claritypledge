# P38 Variant C: "Live Presence Minimal"

**Design Philosophy:** Ultra-minimal, voice-room inspired interface. Event feels like Twitter Spaces or Clubhouse — participants are **always visible** at top (pulsing when active), ideas are **text-only cards** with real-time reaction counts. No complexity, maximum presence.

**Status:** Ready for agent implementation
**Target:** Mobile-first, minimal UI, live updates
**Build Time:** 3-4 days with /loop (simplest variant)

---

## Core Design Principles

1. **Radical Minimalism:** No decoration, only essential information
2. **Live Presence:** Always see who's active NOW (pulsing avatars)
3. **Voice-Room Feel:** Inspired by Twitter Spaces, Clubhouse (audio-social UI patterns)
4. **Real-Time Everything:** Every action updates immediately for everyone

---

## Design Philosophy in One Sentence

> "If Twitter Spaces lost video and became a text-based understanding verification room."

---

## User Flow Overview

```
Join event
    ↓
See ONLY two things: participant row (top), current idea (fullscreen)
    ↓
Read idea, tap emoji reaction (👍 agree, 👎 disagree, 🤷 unsure)
    ↓
See reaction counts update in real-time
    ↓
Swipe up/down to next/prev idea
    ↓
Long-press participant avatar to request pairing
    ↓
Pairing request sent, partner accepts
    ↓
Launch /live
```

---

## The 5 UX Areas (Detailed Solutions)

### **Area 1: Event Landing Experience**

**Approach:** Event landing IS the event. No separate "landing page" — you're immediately in the room seeing who's here + first idea.

**Mobile Layout (375px) - This IS the entire app:**
```
┌─────────────────────────────────────┐
│ [×] Session #1          🟢 Live • 7 │ ← Minimal header (always visible)
├─────────────────────────────────────┤
│ ●Alice  ●Bob  ●Carol  ●Dave →       │ ← Participant row (horizontal scroll)
│                                     │    Pulsing dots = active now
├─────────────────────────────────────┤
│                                     │
│                                     │
│      Visibility changes             │ ← Idea (fullscreen, centered)
│      group behavior                 │    ONLY the idea, nothing else
│                                     │
│      When people can see who        │
│      verified understanding with    │
│      whom, they change how they     │
│      engage. Disagreement becomes   │
│      a signal, not something to     │
│      hide.                          │
│                                     │
│                                     │
│                                     │
│                                     │
│            👍 3  👎 1  🤷 2         │ ← Reaction counts (simple)
│                                     │
│         [Tap to mark position]      │ ← Hint (fades after 2s)
│                                     │
│                                     │
│         ↑ Swipe for next idea ↑     │ ← Navigation hint (fades after 2s)
│                                     │
└─────────────────────────────────────┘
```

**Key Interactions:**
- Screen loads → You're in the room immediately
- Participant dots pulse when someone takes an action (marks position, requests pairing)
- Tap participant dot → Quick profile modal (name, verification count)
- Long-press participant dot → Request pairing (see Area 4)
- Swipe up → Next idea
- Swipe down → Previous idea

**Desktop Layout (1200px+):**
```
┌──────────────────────────────────────────────────────────────┐
│  [×] Clarity Practice Session #1               🟢 Live • 7   │
├──────────────────────────────────────────────────────────────┤
│  ●Alice  ●Bob  ●Carol  ●Dave  ●Eve  ●Frank  ●George          │ ← Participant row
├──────────────────────────────────────────────────────────────┤
│                                                               │
│                                                               │
│                  Visibility changes group behavior            │
│                                                               │
│            When people can see who verified understanding     │
│            with whom, they change how they engage.            │
│            Disagreement becomes a signal, not something       │
│            to hide.                                           │
│                                                               │
│                                                               │
│                                                               │
│                       👍 3  👎 1  🤷 2                         │
│                                                               │
│                     [Mark Your Position]                      │ ← Button (keyboard: A/D/S)
│                                                               │
│                                                               │
│                    ← Prev  Idea 1 of 5  Next →               │ ← Navigation
│                                                               │
└──────────────────────────────────────────────────────────────┘
```

**Why This Works:**
- **Zero friction** — You're in the room immediately
- **Live presence** — Pulsing dots = "people are here NOW"
- **No chrome** — Nothing distracts from the idea
- **Familiar pattern** — Twitter Spaces, Clubhouse users recognize this instantly

---

### **Area 2: Ideas Board Layout**

**Approach:** There is NO "board" — only ONE idea visible at a time (fullscreen). Navigate with swipe (mobile) or arrow keys (desktop).

**Mobile: One Idea, Fullscreen (375px):**
```
┌─────────────────────────────────────┐
│ ●Alice  ●Bob  ●Carol  ●Dave →       │ ← Always visible
├─────────────────────────────────────┤
│                                     │
│                                     │
│      [Idea Title]                   │ ← Centered, large text
│                                     │
│      [Idea Description]             │ ← Readable, spacious
│      (2-3 paragraphs max)           │
│                                     │
│                                     │
│            👍 3  👎 1  🤷 2         │ ← Reactions
│                                     │
│         [Tap to react]              │ ← CTA
│                                     │
│                                     │
│         ↑ Swipe for next ↑          │
│                                     │
└─────────────────────────────────────┘
```

**After Tapping (Reaction Picker Appears):**
```
┌─────────────────────────────────────┐
│ ●Alice  ●Bob  ●Carol  ●Dave →       │
├─────────────────────────────────────┤
│                                     │
│      [Idea Title]                   │
│      [Idea Description]             │
│                                     │
│                                     │
│  ┌───────────────────────────┐     │ ← Reaction picker (bottom sheet)
│  │ ━━                        │     │    (slides up)
│  │                           │     │
│  │ Mark your position:       │     │
│  │                           │     │
│  │   👍 Agree                │     │ ← Tap to select
│  │   👎 Disagree             │     │
│  │   🤷 Unsure               │     │
│  │                           │     │
│  └───────────────────────────┘     │
└─────────────────────────────────────┘
```

**After Reaction (Updates in Real-Time):**
```
┌─────────────────────────────────────┐
│ ●Alice  ●Bob  ●Carol  ●Dave →       │
├─────────────────────────────────────┤
│                                     │
│      [Idea Title]                   │
│      [Idea Description]             │
│                                     │
│                                     │
│            👍 4  👎 1  🤷 2         │ ← Count updated (yours added)
│              ↑                      │    Your reaction highlighted
│            (You)                    │
│                                     │
│         [Change reaction]           │ ← Tap to change
│                                     │
│         ↑ Swipe for next ↑          │
│                                     │
└─────────────────────────────────────┘
```

**Desktop: Keyboard Navigation:**
```
Arrow Up/Down: Navigate between ideas
A: Mark Agree
D: Mark Disagree
S: Mark Unsure
V: Request pairing (opens modal)
```

**Why This Works:**
- **One idea at a time** = Focus, no overwhelm
- **Emoji reactions** = Fastest input (no typing, no buttons to hunt)
- **Swipe navigation** = Natural mobile pattern (Instagram Stories, TikTok)
- **Real-time counts** = Social proof, creates energy

---

### **Area 3: Position Marking + Participant Visibility**

**Approach:** Position marking is **emoji reactions** (fastest possible). Participant visibility is **real-time count updates** + **expandable "who reacted" list**.

**Reaction Display (Default):**
```
👍 4  👎 1  🤷 2
↑
(You)
```

**Tap Reaction Count to Expand (See Who Reacted):**
```
┌───────────────────────────────┐
│ ━━                            │ ← Swipeable bottom sheet
│                               │
│ 👍 Agree (4 people)           │
│                               │
│ ●You                          │ ← Your avatar prominent
│ ●Alice                        │
│ ●Bob                          │
│ ●Dave                         │
│                               │
│ [Request pairing with...]     │ ← Jump to pairing from here
│                               │
└───────────────────────────────┘
```

**Real-Time Updates (Live Presence):**
```
When Carol marks position:
- Carol's avatar pulses in participant row
- Reaction count updates: 👍 4 → 👍 5
- Brief toast: "Carol reacted 👍"
```

**Why This Works:**
- **Emoji = universal, fast** (no language barrier, no typing)
- **Real-time = creates energy** ("other people are doing this NOW")
- **Expandable counts = curiosity** ("who else agrees?")
- **Jump to pairing from "who reacted"** = smooth flow

---

### **Area 4: Partner Selection → /live Handoff**

**Approach:** Pairing is **long-press on participant avatar** (mobile) or **keyboard V** (desktop). Requesting pairing sends a real-time notification to partner.

**Mobile: Long-Press Participant Avatar:**
```
Long-press Carol's avatar in participant row:

┌─────────────────────────────────────┐
│ Request Pairing?                    │
│                                     │
│ You want to verify understanding    │
│ with Carol Davis on:                │
│                                     │
│ "Visibility changes group behavior" │
│                                     │
│ [Cancel]        [Send Request]      │
└─────────────────────────────────────┘
```

**After Sending Request (Your View):**
```
┌─────────────────────────────────────┐
│ Request sent to Carol...            │ ← Toast notification
└─────────────────────────────────────┘

Carol's avatar in participant row gains badge:
●Carol ⏳  ← Waiting for response
```

**Carol's View (Receives Request):**
```
┌─────────────────────────────────────┐
│ 🔔 Pairing Request                  │ ← Modal appears immediately
│                                     │
│ [You] wants to verify understanding │
│ with you on:                        │
│                                     │
│ "Visibility changes group behavior" │
│                                     │
│ [Decline]         [Accept]          │
└─────────────────────────────────────┘
```

**After Carol Accepts (Both Navigate to /live):**
```
Your view:
┌─────────────────────────────────────┐
│ Carol accepted! Starting...         │
└─────────────────────────────────────┘

Both users navigate to /live with context:
URL: /prototype/live?eventId={event}&ideaId={idea}&partnerId={partner}
```

**Desktop: Keyboard V Opens Pairing Modal:**
```
Press V:

┌────────────────────────────────────┐
│ Request Pairing                    │
│                                    │
│ Who do you want to verify with?    │
│                                    │
│ ●Alice (agrees)                    │ ← Click to select
│ ●Bob (agrees)                      │
│ ●Carol (disagrees)                 │
│ ●Dave (agrees)                     │
│ ●Eve (unsure)                      │
│ ●Frank (unsure)                    │
│ ●George (no reaction yet)          │
│                                    │
│ [Cancel]                           │
└────────────────────────────────────┘

Click Carol:
┌────────────────────────────────────┐
│ Send pairing request to Carol?     │
│                                    │
│ Idea: "Visibility changes..."      │
│                                    │
│ [Cancel]    [Send Request]         │
└────────────────────────────────────┘
```

**Why This Works:**
- **Long-press = intentional** (prevents accidental taps)
- **Request/accept flow = consent-based** (no forced pairing)
- **Real-time notifications = immediate** (no waiting, no polling)
- **Both navigate simultaneously** (seamless handoff to /live)

---

### **Area 5: Mobile-First Interaction Model**

**Approach:** **Minimal taps, maximum gestures**. Primary interactions: swipe (navigate), tap (react), long-press (pair).

**Gesture Map (Mobile):**
```
┌─────────────────────────────────────┐
│ ●Alice  ●Bob  ●Carol  ●Dave →       │ ← Horizontal scroll participant row
│   ↑ tap = profile                   │    ↑ long-press = request pairing
├─────────────────────────────────────┤
│              ↑ swipe down           │ ← Swipe = navigate ideas
│                                     │
│      [Idea Content]                 │ ← Tap anywhere = open reaction picker
│                                     │
│              ↓ swipe up             │
│                                     │
│            👍 4  👎 1  🤷 2         │ ← Tap count = expand "who reacted"
│              ↑ tap                  │
└─────────────────────────────────────┘
```

**Touch Targets (Mobile):**
- Participant avatars: 48px diameter (easy tap + long-press)
- Reaction emojis: 64px tap area (large, easy target)
- Idea content area: Entire remaining screen (tap anywhere to react)

**Desktop: Keyboard-First:**
```
↑/↓ arrows: Navigate ideas
A/D/S: Mark Agree/Disagree/Unsure
V: Request pairing
Tab: Cycle through participants
Enter: Select participant for pairing
Esc: Close modal
```

**Why This Works:**
- **Minimal UI = maximum screen space for content**
- **Gestures = fast, natural**
- **Keyboard shortcuts = power users can fly**
- **No mode switching** (no bottom nav, no tabs)

---

## Visual Design Specification

### Color Palette (Ultra Minimal)

| Token | Hex | Usage |
|-------|-----|-------|
| `white` | `#ffffff` | Background |
| `gray-900` | `#111827` | Text |
| `blue-500` | `#3b82f6` | Active participant pulse |
| `green-500` | `#22c55e` | Live indicator only |
| `gray-200` | `#e5e7eb` | Dividers |

**No other colors.** Emojis provide all visual distinction.

### Typography

| Element | Font | Size | Weight |
|---------|------|------|--------|
| Idea title | System | 28px | 700 (bold) |
| Idea description | System | 18px | 400 (regular) |
| Reaction counts | System | 32px | 400 (emoji native) |
| Participant names | System | 12px | 500 (medium) |

### Animations

- Participant pulse: 1s ease-in-out infinite (scale 1.0 → 1.1 → 1.0)
- Reaction picker slide-up: 200ms ease-out
- Idea swipe transition: 250ms ease-in-out
- Pairing request modal: 150ms fade-in

### Spacing

- Participant row height: 56px
- Content padding: 32px horizontal, 48px vertical
- Reaction emoji spacing: 24px between emojis

---

## Technical Implementation

### Data Model (Same as Variants A/B, Plus Real-Time)

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
  avatarColor: string;
  isActive: boolean; // TRUE if action in last 30 seconds
  pairingStatus?: 'requesting' | 'waiting' | 'paired';
}

interface Idea {
  id: string;
  title: string;
  description: string;
  reactions: {
    agree: string[]; // participant IDs
    disagree: string[];
    unsure: string[];
  };
}

interface PairingRequest {
  id: string;
  fromParticipantId: string;
  toParticipantId: string;
  ideaId: string;
  status: 'pending' | 'accepted' | 'declined';
  createdAt: Date;
}
```

### Component Structure

```
/src/app/pages/EventLivePresencePage.tsx
  ├── ParticipantRow.tsx
  │   └── ParticipantAvatar (with pulse animation if active)
  │
  ├── IdeaFullscreen.tsx
  │   ├── IdeaTitle
  │   ├── IdeaDescription
  │   └── ReactionBar
  │       ├── ReactionCounts (👍 4  👎 1  🤷 2)
  │       └── ReactionPicker (bottom sheet modal)
  │
  ├── WhoReactedModal.tsx (shows participant list by reaction)
  │
  ├── PairingRequestModal.tsx
  │   ├── SendPairingRequest (your view)
  │   └── ReceivePairingRequest (partner's view)
  │
  └── SwipeHandler (for idea navigation)
```

### Real-Time Updates (Supabase Realtime or Simple Polling)

```typescript
// Subscribe to event updates
supabase
  .channel(`event:${eventId}`)
  .on('postgres_changes', {
    event: '*',
    schema: 'public',
    table: 'event_reactions'
  }, handleReactionUpdate)
  .on('postgres_changes', {
    event: '*',
    schema: 'public',
    table: 'pairing_requests'
  }, handlePairingRequestUpdate)
  .subscribe();

function handleReactionUpdate(payload) {
  // Update reaction counts
  // Pulse participant avatar
  // Show toast: "Carol reacted 👍"
}

function handlePairingRequestUpdate(payload) {
  if (payload.toParticipantId === currentUserId) {
    // Show pairing request modal
  }
}
```

### Key Functions

```typescript
// Reaction marking
function handleReaction(ideaId: string, reaction: 'agree' | 'disagree' | 'unsure') {
  markReaction(ideaId, currentUserId, reaction);
  // Optimistic UI update
  // Broadcast to other participants
}

// Pairing request
function sendPairingRequest(partnerId: string, ideaId: string) {
  createPairingRequest({ fromParticipantId: currentUserId, toParticipantId: partnerId, ideaId });
  // Show "request sent" toast
  // Update participant avatar badge
}

// Pairing acceptance
function acceptPairingRequest(requestId: string) {
  updatePairingRequest(requestId, { status: 'accepted' });
  // Navigate both users to /live
}
```

---

## Build Tasks (Agent Implementation Checklist)

### Phase 0: Setup (Day 1 morning)
- [ ] Create route: `/prototype/event/presence/:eventId`
- [ ] Set up dummy event data (1 event, 7 participants, 5 ideas)
- [ ] Install swipe library if needed (react-use-gesture)
- [ ] Design participant row component structure

### Phase 1: Participant Row + Presence (Day 1)
- [ ] Build ParticipantRow with horizontal scroll
- [ ] Build ParticipantAvatar with pulse animation (CSS keyframes)
- [ ] Wire up tap → profile modal
- [ ] Wire up long-press → pairing request modal (mobile)
- [ ] Test on 375px viewport

### Phase 2: Idea Fullscreen + Swipe Navigation (Day 1-2)
- [ ] Build IdeaFullscreen component (title, description, centered)
- [ ] Add swipe handlers (up = next idea, down = prev idea)
- [ ] Wire up swipe with smooth transitions
- [ ] Add "Idea X of Y" counter (subtle, top-right)

### Phase 3: Reaction System (Day 2)
- [ ] Build ReactionBar component (emoji counts)
- [ ] Build ReactionPicker (bottom sheet with 3 options)
- [ ] Wire up tap idea area → open reaction picker
- [ ] Wire up tap reaction → mark position (local state)
- [ ] Update reaction counts optimistically

### Phase 4: "Who Reacted" Modal (Day 2)
- [ ] Build WhoReactedModal (shows participant list by reaction)
- [ ] Wire up tap reaction count → open modal
- [ ] Add "Request pairing with..." button in modal

### Phase 5: Pairing Request System (Day 3)
- [ ] Build SendPairingRequest modal (long-press avatar)
- [ ] Build ReceivePairingRequest modal (incoming request)
- [ ] Wire up send request → create pairing request (dummy data)
- [ ] Wire up accept request → navigate both to /live
- [ ] Add participant avatar badge (⏳ waiting for response)

### Phase 6: Real-Time Updates (Day 3, Optional)
- [ ] Set up Supabase Realtime subscriptions (or simple polling)
- [ ] Broadcast reaction updates to all participants
- [ ] Broadcast pairing requests to partner
- [ ] Update participant "isActive" status (last action < 30s)
- [ ] Pulse avatar when participant takes action

### Phase 7: Desktop Keyboard Shortcuts (Day 4)
- [ ] Add keyboard listeners (↑/↓, A/D/S, V, Enter, Esc)
- [ ] Wire up ↑/↓ → navigate ideas
- [ ] Wire up A/D/S → mark reactions
- [ ] Wire up V → open pairing modal
- [ ] Add keyboard hint tooltip (first visit)

### Phase 8: Visual Polish (Day 4)
- [ ] Apply ultra-minimal color palette (white bg, gray-900 text)
- [ ] Typography consistency (28px title, 18px description)
- [ ] Animations (pulse, slide-up, swipe transition)
- [ ] Test on 375px mobile + 1200px desktop

### Phase 9: Testing (Day 4)
- [ ] Test swipe navigation on real device (smooth? no lag?)
- [ ] Test long-press pairing (triggers correctly? no false positives?)
- [ ] Test real-time updates (if implemented)
- [ ] Verify /live launches with correct context

---

## Success Criteria

### User Experience
1. **Instant clarity** (new participant understands in < 10 seconds: "This is a voice room for ideas")
2. **Fast reactions** (marking position takes < 2 seconds: tap, select, done)
3. **Live presence felt** (pulsing avatars + real-time counts create energy)
4. **Pairing feels natural** (long-press → request → accept → /live flow smooth)

### H2 Validation
5. **Real-time creates urgency** (do live updates increase participation?)
6. **Minimal UI increases focus** (do people read ideas more carefully?)

### Technical
7. Swipe gestures work smoothly on mobile (no conflicts with browser scroll)
8. Long-press triggers reliably (500ms hold, no accidental taps)
9. Real-time updates < 1s latency (if implemented)

---

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| **Long-press not discoverable** | Add hint on first visit: "Long-press avatar to pair" |
| **Swipe conflicts with browser scroll** | Use preventDefault on swipe gesture, require > 100px distance |
| **Real-time updates laggy** | Start with polling (5s interval), optimize later. Feature works without real-time. |
| **Emoji reactions feel childish** | Test with real users. If feedback negative, add text labels ("Agree", "Disagree"). |
| **One idea at a time feels limiting** | Add keyboard/swipe to jump between ideas quickly. Users can scan by swiping fast. |

---

## What Makes This Variant Unique

### Compared to Variants A/B:
- **Most minimal** (least UI chrome, most screen space for content)
- **Voice-room inspired** (Twitter Spaces, Clubhouse feel)
- **Fastest input** (emoji reactions > buttons > swipe cards)
- **Live presence emphasized** (pulsing avatars, real-time updates)

### Best For:
- Small, intimate events (5-10 people max, not 30+)
- Events where "voice room" metaphor fits (community calls, workshops)
- Mobile-first environments (standing room, phones out)
- Groups that value speed and minimalism

### Potential Downsides:
- May feel "too minimal" (power users might want more controls)
- One idea at a time = slower for scanning many ideas
- Emoji reactions may not translate across cultures
- Long-press gesture not universally known

---

## Related Documents

- [P38: Event-Based Prototype Simplification](./p38_event_prototype_simplification.md)
- [P38.1: Design Thinking Brief](./p38.1_design_thinking_brief.md)
- [P38 Variant A: Telegram Poll Flow](./p38_variant_a_telegram_poll_flow.md)
- [P38 Variant B: Spatial Swipe Board](./p38_variant_b_spatial_swipe_board.md)

---

**Created:** 2025-01-07
**Author:** Maya (Design Thinking Agent)
**For:** P38 Event Prototype — Agent Build Brief (Variant C)
**Ready for:** Agent implementation (hand to Dev with /loop)
