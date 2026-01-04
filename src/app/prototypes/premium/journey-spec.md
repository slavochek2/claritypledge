# Journey Spec: Apple Premium

## Design Philosophy

**Apple Premium** — Elegant, spacious, smooth animations, premium feel, beautiful typography, make users feel sophisticated, every detail considered.

When in doubt, ask: "What would Apple do?"

Key principles:
- **Generous whitespace** — Let content breathe, never cramped
- **Refined typography** — SF Pro-inspired, careful hierarchy, beautiful line heights
- **Subtle animations** — Smooth transitions, gentle fades, purposeful motion
- **Restrained palette** — Mostly grayscale with selective blue accents
- **Premium tactility** — Satisfying micro-interactions, haptic-feeling UI
- **Information hierarchy** — Clear visual pecking order, progressive disclosure

---

## User Story

As a thoughtful professional, I want to explore ideas and verify my understanding with others in an environment that respects my intelligence and time, so that I can build genuine understanding across disagreement and earn reputation as a verified listener.

---

## Entry Point

**Start at `/prototype/premium/feed`**

Why: The feed is the discovery surface — the elegant gallery of ideas. Apple products always start with content, letting users browse before diving deep. The feed establishes the premium aesthetic immediately and invites exploration.

---

## Screen Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│   FEED ──────────► IDEA DETAIL ──────────► LIVE                │
│     │                    │                    │                 │
│     │                    │                    │                 │
│     ▼                    ▼                    ▼                 │
│  PROFILE ◄────────────────────────────► TOPOLOGY               │
│     │                                                           │
│     │                                                           │
│     ▼                                                           │
│   CHAT ──────────────────────────────────► LIVE                │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Primary Flow: Discovery → Understanding → Verification

1. **Feed** → User browses ideas, sees community positions, marks their own position
2. **Idea Detail** (tap idea) → User sees full context, comments, verification status
3. **Live** (tap "Verify Understanding") → User enters real-time verification flow

### Secondary Flow: Profile & Reputation

1. **Profile** (from nav or avatar tap) → User sees their ideas, positions, Verified Listener Score
2. **Topology** (from profile or nav) → User sees network visualization

### Tertiary Flow: Async Discussion

1. **Chat** (from nav) → User has async discussions, seeds ideas
2. **Live** (from chat "Go Live" button) → Transition to real-time verification

---

## Key Interactions Per Screen

### /feed

**Purpose:** Elegant gallery of ideas for discovery and position-marking

**Interactions:**
- Scroll through idea cards (smooth, momentum-based)
- Tap position button (Agree/Disagree/Don't Know) — instant haptic feedback, subtle animation
- Tap idea card → navigates to Idea Detail
- Tap user avatar → navigates to Profile
- Pull to refresh (elegant loading animation)
- Tap "+" FAB → Create new idea (modal)

**Premium touches:**
- Cards with subtle shadows and rounded corners (20px radius)
- Position buttons with smooth color transitions
- Staggered entrance animations
- Generous vertical spacing between cards (24px)
- Typography: Large idea text (18px), refined metadata

### /idea/:id

**Purpose:** Deep dive into a single idea with full context

**Interactions:**
- Read idea in full (if truncated in feed)
- View position breakdown (elegant bar visualization)
- See who holds each position (avatar row)
- Read/write comments (threaded, elegant)
- Tap "Verify Understanding" → navigates to Live
- Tap cross-disagreement badges → see verified understanding pairs
- Share idea (sheet modal)

**Premium touches:**
- Hero area with idea text
- Frosted glass header on scroll
- Smooth expanding/collapsing sections
- Comments with beautiful typography and spacing

### /profile

**Purpose:** User's identity, reputation, and activity

**Interactions:**
- View Verified Listener Score (prominent, animated on load)
- See cross-disagreement count (special badge)
- Browse user's positions (filterable: All/Agree/Disagree/Don't Know)
- See user's created ideas
- View verification history
- Tap idea → navigates to Idea Detail

**Premium touches:**
- Large, centered avatar with subtle shadow
- Score displayed with elegant typography (large number, small label)
- Activity feed with timeline feel
- Smooth tab switching with underline animation

### /chat

**Purpose:** Async discussion space, seed ideas before live sessions

**Interactions:**
- View conversation threads
- Send messages (elegant input, smooth send animation)
- Seed an idea from conversation ("Add as Idea" button)
- Tap "Go Live" → transition to Live session
- See who's online (subtle presence indicators)

**Premium touches:**
- Messages with beautiful bubbles (your messages right, theirs left)
- Typing indicator (three dots, subtle pulse)
- Smooth keyboard-avoiding view
- Time stamps that fade in contextually

### /live

**Purpose:** Real-time understanding verification flow

**Interactions:**
- See current idea being verified (prominent header)
- Speaker/Listener role assignment
- Rating input (elegant slider or segmented control)
- Playback recording/text
- Confirm understanding (satisfying completion animation)
- View gap between confidence and accuracy ratings

**Premium touches:**
- Full-screen focus mode
- Progress indicator (elegant steps)
- Smooth role transitions
- Celebration animation on successful verification
- Real-time sync indicators (subtle pulse)

### /topology

**Purpose:** Network visualization of verified understanding

**Interactions:**
- View network graph (nodes = people, edges = verifications)
- Filter by idea
- Tap node → see user's connections
- Zoom/pan (smooth, inertial)
- See cross-disagreement edges highlighted
- Tap edge → see verification details

**Premium touches:**
- Elegant force-directed graph
- Nodes with avatar images
- Edge colors indicating agreement/disagreement
- Smooth zoom transitions
- Legend with beautiful iconography

---

## Navigation Patterns

**Bottom Tab Bar** — 5 tabs, Apple-style:
1. Feed (house icon) — Primary discovery
2. Chat (message icon) — Async discussions
3. Live (circle/record icon) — Real-time verification
4. Profile (person icon) — Your identity
5. Topology (network icon) — Understanding map

**Premium touches:**
- Thin line tab indicator
- Icons transition from outline to filled on selection
- Subtle haptic on tab switch
- Labels appear below icons (always visible, not hidden)

---

## Personality Expression

### Navigation patterns
- **Smooth, purposeful** — No jarring transitions
- **Progressive disclosure** — Show more as user digs deeper
- **Predictable** — Standard iOS patterns, nothing weird

### Information density
- **Low to medium** — Generous whitespace, one idea at a time
- **Scannable** — Clear hierarchy, eyes know where to go
- **Layered** — Summary first, details on demand

### Animation/transitions
- **Page transitions:** Smooth push/pop (300ms, ease-out)
- **Micro-interactions:** Subtle scale on tap (0.97x), fade transitions
- **Loading:** Skeleton screens, not spinners
- **Celebration:** Confetti-free — subtle checkmark with gentle expansion

### Typography choices
- **Headlines:** 28px, semibold, -0.5px tracking
- **Body:** 17px, regular, 1.5 line height
- **Metadata:** 13px, regular, secondary color
- **Numbers:** 34px for scores, tabular figures

### Whitespace usage
- **Card padding:** 20px
- **Section spacing:** 32px
- **Element spacing:** 12-16px
- **Screen padding:** 20px horizontal
- **Safe area respect:** Always

---

## Color Palette (Apple-inspired)

```
Primary:         #007AFF (Apple Blue)
Background:      #FFFFFF
Surface:         #F2F2F7 (System Gray 6)
Text Primary:    #000000
Text Secondary:  #8E8E93 (System Gray)
Text Tertiary:   #C7C7CC (System Gray 3)
Separator:       #C6C6C8
Success:         #34C759 (Apple Green) — ONLY for verified states
Destructive:     #FF3B30 (Apple Red)
```

### Position Colors
- Agree: #34C759 (Green)
- Disagree: #FF3B30 (Red)
- Don't Know: #8E8E93 (Gray)
- Unselected: #F2F2F7 (Light gray background)

---

## Responsive Considerations

**Mobile-first (375px):**
- Single column layout
- Full-width cards
- Touch targets ≥ 44px
- Bottom navigation

**Tablet (768px+):**
- Two-column feed
- Side navigation option
- Larger typography scale

---

## Iteration Notes

### UX Critique (Self-review)

**Strengths:**
- Flow is intuitive — feed discovery is a proven pattern
- Premium personality comes through in whitespace and typography choices
- Clear navigation with standard iOS patterns

**Potential issues:**
- Topology might be complex — consider simplified view first
- Live flow needs careful state management
- Cross-disagreement highlighting needs to be clear but not overwhelming

**Decisions made:**
- Starting with feed (not profile) — discovery first
- Using bottom tabs (not hamburger) — premium feel requires visibility
- Minimal color palette — restraint is premium
