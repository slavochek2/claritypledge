---
status: done
type: story
tags: []
rank: 125430.0
created_date: 2026-01-06
completed_at: '2026-02-09'
---

# P32.2: Premium Prototype Variants

**Goal:** Create 7 completely independent frontend prototypes exploring different UI/UX directions for the Clarity Pledge app. Each variant is a full redesign — all screens, all flows, all interactions.

---

## Pick Your Direction

| Variant | Direction | Vibe | Key Inspiration |
|---------|-----------|------|-----------------|
| **p32_2_0** | **Dark Mode** | Sophisticated dark aesthetic, glowing accents, premium night feel | `docs/inspiration/mockup-screens/image copy 6.png`, `image copy 7.png` |
| **p32_2_1** | **Light Apple** | Clean white, SF Pro typography, spacious, premium minimalism | `docs/inspiration/mockup-screens/image copy 2.png`, `image.png` |
| **p32_2_2** | **Twitter-like** | Dense feed, engagement metrics visible, fast scanning, timeline | `docs/inspiration/mockup-screens/image_2.png` |
| **p32_2_3** | **LinkedIn-like** | Professional cards, author info prominent, networking feel, business context | Professional social network patterns |
| **p32_2_4** | **Telegram-like** | Chat-first, conversations central, ideas emerge from messages | Messaging app patterns |
| **p32_2_5** | **Instagram Stories** | Avatar row at top, swipeable full-screen cards, visual-first, mobile-native | `docs/inspiration/mockup-screens/image copy_1.png`, Stories UX |
| **p32_2_6** | **Wild Card** | Surprise us — game-like, brutalist, radical, experimental, something unexpected | Your creative vision |

**You are building variant: `p32_2_X`** (specified in your task)

---

## Core Concept

This app helps people **verify understanding** of ideas. Key concepts:

### Ideas
- Independent entities (statements/propositions people can agree or disagree with)
- **No owner** — the "creator" is just the first person to say "I agree with this"
- Created via **"Post & Agree"** (you can't post something you disagree with)
- Example: "Remote work is more productive than office work for knowledge workers"

### Positions
- Each person marks their position on each idea: **Agree / Disagree / Don't Know**
- Positions can change over time (tracked as intellectual humility)
- Position history shows growth, not flip-flopping

### Verification
- Two people verify they understand each other's position on an idea
- Process: Speaker explains → Listener plays back → Both rate → Certification
- **"Did you get me?"** = I want to verify you understood my position
- **"Did I get you?"** = I want to verify I understood your position
- Verification creates an edge in the network graph

### Cross-Disagreement
- The gold: when two people **disagree** but **verify they understand each other**
- This is informed disagreement — they know WHY they disagree
- Highlighted throughout the app as valuable signal

### Meme Fitness (Topology)
- Ideas understood and agreed with by high-reputation listeners have higher fitness
- Network shows who understands whom (and optionally: idea clusters)
- PageRank-style scoring for people and ideas

---

## Required User Journeys

Every prototype must support these flows:

### 1. Browse & Discover Ideas
- See a feed/list of ideas
- See position breakdown (how many agree/disagree/unsure)
- Mark my position on each idea
- Navigate to idea detail

### 2. Idea Detail
- See full idea text
- See who engaged and their positions (filterable by: All / Agree / Disagree / Unsure)
- See verification stats (how many verified, cross-disagreement count)
- **On each person: "Did you get me?" / "Did I get you?" buttons**
- These buttons initiate verification with that specific person on this idea
- Entry point to /live or /chat verification

### 3. Create Idea
- **"Post & Agree"** flow — you're the first to agree with this statement
- Simple text input
- After posting, idea appears in feed with your "Agree" position

### 4. Profile
- User info (name, avatar, bio)
- **Verified Listener Score** (how many times certified as understanding others)
- **Engagement history with filters:** All Activity / Agreed / Disagreed / Verified
- Position change log (shows intellectual humility over time)
- Tap any activity → navigate to that idea

### 5. Chat
- Conversation with another person
- Messages with timestamps
- **Verification triggers on messages:**
  - On MY messages: "Did you understand me?" button/slider
  - On THEIR messages: "Did I get you?" button/slider
- Tapping triggers verification flow on that message/idea
- "Go Live" button to enter real-time verification

### 6. Live Verification
- Real-time verification session
- Shows which idea is being verified (if any)
- Role selection: Speaker or Listener
- Speaking phase → Playback phase → Rating phase → Result
- Rating: Listener confidence (0-10) + Speaker accuracy rating (0-10)
- Understanding Gap = difference between ratings
- Success → Certification recorded

### 7. Topology / Network
- Visual graph showing verification network
- **Nodes = people** (or optionally: ideas for meme fitness view)
- **Edges = verifications** (directed: "A verified B")
- **Node color** by position: Green (agree) / Red (disagree) / Gray (unsure)
- **Node size** by verifications received
- **Edge weight/color** indicates cross-disagreement (blue = across disagreement)
- Tap node → see details, navigate to profile

---

## UI Exploration Areas

You have creative freedom on ALL of these:

| Aspect | Options to Explore |
|--------|-------------------|
| **Navigation** | Bottom tabs, side drawer, tab bar, floating buttons, gestures |
| **Color palette** | Dark, light, custom brand colors, gradients |
| **Typography** | SF Pro, Inter, custom, bold headlines, subtle metadata |
| **Card style** | Compact list, medium cards, full-screen swipe, tiles |
| **Information density** | Sparse (Apple), Medium (Twitter), Dense (LinkedIn) |
| **Animation** | Minimal, smooth transitions, playful, dramatic |
| **Layout** | Single column, multi-column, masonry, horizontal scroll |
| **Entry point** | Feed first, chat first, profile first, stories first |

### Stories-Style Avatar Row (Optional)
If your direction fits, consider:
- Horizontal scrollable avatar row at top of feed
- Tap avatar → see their recent engagements as big swipeable cards
- Personal, intimate way to discover what others are engaging with

### Big Card / Swipe Experience (Optional)
- Full-screen cards like onboarding or Tinder
- One idea at a time
- Swipe or tap to navigate
- Great for mobile-first experiences

---

## Mock Data

Use and extend the existing mock data structure. Key files to reference:

```
src/app/prototypes/premium/data/mock-data.ts
```

### Data Types Available

```typescript
type Position = 'agree' | 'disagree' | 'dont_know' | null;

interface User {
  id: string;
  name: string;
  avatar: string;  // emoji
  verifiedListenerScore: number;
  bio?: string;
}

interface Idea {
  id: string;
  text: string;
  createdBy: string;  // first validator, not "owner"
  createdAt: string;
  positions: Record<string, Position>;
  verificationCount: number;
  crossDisagreementCount: number;
  commentCount: number;
}

interface Certification {
  id: string;
  ideaId: string;
  speakerId: string;
  listenerId: string;
  speakerPosition: Position;
  listenerPosition: Position;
  createdAt: string;
}

interface Message {
  id: string;
  senderId: string;
  text: string;
  createdAt: string;
  ideaId?: string;  // if message references an idea
}
```

### Add What You Need

Feel free to extend mock data for:
- Position change history (for intellectual humility log)
- More users, ideas, certifications
- Conversation threads
- Meme fitness scores
- Group/event data (if exploring that direction)

---

## Technical Requirements

### Location
Create your prototype at:
```
src/app/prototypes/[variant-name]/
```

Example: `src/app/prototypes/dark/` for p32_2_0

### Structure
```
src/app/prototypes/[variant-name]/
├── index.tsx           # Routes
├── config.ts           # Route config, nav tabs
├── data/
│   └── mock-data.ts    # Your mock data (can copy + extend)
├── components/
│   ├── Feed.tsx
│   ├── IdeaDetail.tsx
│   ├── IdeaCard.tsx
│   ├── Profile.tsx
│   ├── Chat.tsx
│   ├── Live.tsx
│   ├── Topology.tsx
│   ├── CreateIdea.tsx  # or modal
│   └── [Navigation].tsx
└── [design-docs]/      # Optional: your design notes
```

### Routes
Register your prototype in `src/App.tsx`:
```tsx
<Route path="/prototype/[variant-name]/*" element={<YourPrototype />} />
```

### Tech Stack
- React + TypeScript
- Tailwind CSS
- Lucide icons (or choose your own)
- React Router for navigation
- No backend — all mock data

### Mobile-First
- Design for 375px width first
- Touch targets ≥ 44px
- Respect safe areas

---

## Inspiration Images

Located in `docs/inspiration/mockup-screens/`:

| File | Shows |
|------|-------|
| `image.png` | Light profile with activity feed |
| `image copy.png` | Comment modal |
| `image copy 2.png` | Profile with filters (All/Agree/False/Comments) |
| `image copy 3.png` | Reactions list (True/False with users) |
| `image copy 4.png` | Comments section |
| `image copy 5.png` | "New idea" modal with Post & True |
| `image copy 6.png` | Dark profile with reviews/statements |
| `image copy 7.png` | Dark verification modal "Oliver says he knows you" |
| `image copy 8.png` | Dark compliment flow |
| `image_2.png` | Dark feed with validators |
| `image copy_1.png` | Full-screen card with question + agree buttons |

---

## Success Criteria

Your prototype is complete when:

- [ ] All 7 user journeys are navigable
- [ ] Feed shows ideas with positions
- [ ] Can mark position on ideas (Agree/Disagree/Don't Know)
- [ ] Idea detail shows engagers with "Did you get me?" / "Did I get you?" buttons
- [ ] Can create new idea via "Post & Agree"
- [ ] Profile shows engagement history with filters
- [ ] Chat has verification triggers on messages
- [ ] Live verification flow works (can be simplified)
- [ ] Topology shows network graph
- [ ] Design is cohesive and follows your creative direction
- [ ] Mobile-responsive (works at 375px)

---

## What NOT to Build

- No backend/API integration
- No authentication
- No persistence (state resets on refresh is fine)
- No complex animations that slow development
- No pixel-perfect polish — focus on UX flow over visual perfection

---

## Run Command

For your worktree, run:

```bash
/loop "Build p32_2_X ([Direction]) per @features/p32_2_variants.md — create complete new prototype with all screens"
```

Example:
```bash
/loop "Build p32_2_0 (Dark Mode) per @features/p32_2_variants.md — create complete new prototype with all screens"
```

---

## /loop Workflow (CRITICAL)

**DO NOT skip UX review.** The value of `/loop` is the iterative cycle:

```
┌─────────────────────────────────────────────────────┐
│  1. DEV builds component(s)                         │
│              ↓                                      │
│  2. PLAYWRIGHT MCP takes screenshots                │
│     - Mobile (375px)                                │
│     - Desktop (1024px)                              │
│     - All key screens                               │
│              ↓                                      │
│  3. UX REVIEW critiques the screenshots             │
│     - Layout issues                                 │
│     - Spacing/alignment                             │
│     - Visual hierarchy                              │
│     - Mobile responsiveness                         │
│     - Consistency with direction                    │
│              ↓                                      │
│  4. DEV improves based on UX feedback               │
│              ↓                                      │
│  5. REPEAT until UX approves                        │
└─────────────────────────────────────────────────────┘
```

### Visual Check Checkpoints

Take Playwright screenshots after:
- [ ] Feed/Home screen complete
- [ ] Idea Detail screen complete
- [ ] Profile screen complete
- [ ] Chat screen complete
- [ ] Live verification flow complete
- [ ] Topology/Network screen complete
- [ ] Create Idea modal/screen complete
- [ ] Full navigation flow (all screens connected)

### UX Critique Focus Areas

When reviewing screenshots, check:
1. **Does it match the creative direction?** (Dark/Light/Twitter/etc.)
2. **Information hierarchy** — is the most important content prominent?
3. **Touch targets** — are buttons ≥44px?
4. **Spacing** — consistent padding, breathing room?
5. **Typography** — readable, hierarchical?
6. **Mobile-first** — does 375px look good?
7. **Consistency** — do all screens feel like the same app?

**Iterate until the prototype is visually polished, not just functional.**

---

## Reference

- Theory of Change: `docs/visions/v0_theory-of-change.md`
- Existing prototype: `src/app/prototypes/premium/`
- Trust-Building Framework (PageRank): `docs/visions/p6.1_ Intuitive Trust-Building Framework and Platform.md`

---

**Go build something beautiful.**
