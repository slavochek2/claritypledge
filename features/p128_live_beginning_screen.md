---
status: backlog
type: story
priority: p1
prepped_date: '2026-02-06'
reviews:
  ux: passed-with-notes
  architect: passed-with-notes
  alignment: passed
prototype: /prototype/linkedin-like/live
tests: H-Stories (Stories solve the cold start problem). Also informs OQ-6 (internal trigger).
decisions:
  - Content picker after partner joins, not before
  - Direction-first design: two free-speaking buttons (you speak / partner speaks) + story/point cards below
  - Picking a card is a shortcut for "does partner understand you?" + specific topic (teller-only — verifier picks content in future)
  - returnTo query param for back navigation (used by P124)
  - Enhance idle RatingPhase in LiveModeView — NOT a new ViewState in ClarityLivePage
  - Creator-only picks content (guests have no stories; no race condition to solve)
  - Progressive search: show all items by default, add search bar at 5+ items
  - Session history: checkmarks only, no scores (scores are private calibration data)
  - Build new lightweight LiveStoryCard/LivePointCard using production types (prototype is design reference only)
---
# P128: /live Beginning Screen — Pick Story, Point, or Free Live

## User Story

As a /live session participant, I want to pick a story or point to verify (or speak freely), so that the session has a clear topic from the start instead of unstructured conversation.

---

## Problem

Current production /live: after both people join, the only option is "Did you understand me?" / "Did I understand you?" — freeform, no content attached. The prototype at `/prototype/linkedin-like/live` already mocks the solution: a content picker that appears after partner joins.

With P117 (Stories backend) shipped, stories and points exist in the database but aren't accessible during /live sessions.

---

## Core Concept

**After both users are in /live, show a beginning screen before the verification flow.**

```
CURRENT:       Join → Freeform → Rate → Gap
WITH P128:     Join → Pick content → Verify → Rate → Gap
```

The beginning screen offers three paths:
1. **Pick a story** → Verify understanding of that specific story
2. **Pick a point** → Take positions and verify understanding of reasoning
3. **Cardless mode** → Speak freely (current behavior, default)

---

## User Flow

### After partner joins (new beginning screen)

**Design principle:** Direction-first. The user's mental state is "who's talking?" — not "what content?" The two cardless mode buttons answer that question directly. Story/point cards below are a shortcut for "does partner understand you?" + a specific topic.

**Content selection:** Creator-only. Only the authenticated host sees story/point cards. Guest joiners (no account) see direction buttons only.

### Guest view (most common — the joiner)

```
┌─────────────────────────────────────────┐
│ ← End session               🔴 Live    │
├─────────────────────────────────────────┤
│                                         │
│  You're live with Jordan                │
│                                         │
│  ┌─────────────────────────────────┐    │
│  │  Does Jordan understand you?    │    │
│  │  You speak, Jordan verifies     │    │
│  └─────────────────────────────────┘    │
│                                         │
│  ┌─────────────────────────────────┐    │
│  │  Do you understand Jordan?      │    │
│  │  Jordan speaks, you verify      │    │
│  └─────────────────────────────────┘    │
│                                         │
└─────────────────────────────────────────┘
```

### Host view (authenticated user with stories)

```
┌─────────────────────────────────────────┐
│ ← End session               🔴 Live    │
├─────────────────────────────────────────┤
│                                         │
│  You're live with Alice                 │
│                                         │
│  ┌─────────────────────────────────┐    │
│  │  Does Alice understand you?     │    │
│  │  You speak, Alice verifies      │    │
│  └─────────────────────────────────┘    │
│                                         │
│  ┌─────────────────────────────────┐    │
│  │  Do you understand Alice?       │    │
│  │  Alice speaks, you verify       │    │
│  └─────────────────────────────────┘    │
│                                         │
│  ── or pick something specific ──────   │
│                                         │
│  ┌─────────────────────────────────┐    │
│  │ "I started working remotely..." │    │
│  │  2 points · 3 understood        │    │
│  └─────────────────────────────────┘    │
│  ┌─────────────────────────────────┐    │
│  │ "Our team tried no-meetings..." │    │
│  │  0 points · 0 understood        │    │
│  └─────────────────────────────────┘    │
│  ┌─────────────────────────────────┐    │
│  │ "Remote work is more productive"│    │
│  │  point · 1 position taken       │    │
│  └─────────────────────────────────┘    │
│                                         │
│  ── this session ────────────────────   │
│  ✓  "The hiring process story"          │
│  ✓  "Async > sync communication"        │
│                                         │
└─────────────────────────────────────────┘
```

Search bar appears above story/point cards when 5+ items exist. Below 5, all items shown directly.

Session history (bottom): checkmarks only, no scores. Scores are private calibration data shown only during the verification moment.

**Three paths:**
1. **"Does Alice understand you?"** → cardless mode, you're the teller, Alice verifies
2. **"Do you understand Alice?"** → cardless mode, Alice is the teller, you verify
3. **Pick a story/point card** → content-attached verification (direction implied: does partner understand YOUR content; teller-only for MVP)

### Selecting a story

Tap "Does Alice understand?" → inline rating picker appears:

"How much do you believe Alice understands your story?"
[0] [1] [2] [3] [4] [5] [6] [7] [8] [9] [10]
[Submit]

→ Partner sees the story card with:
"How confident are you that you understand their story?"
[0-10 scale]
[Submit]  [Speak freely]

→ Both ratings revealed → calibration gap shown (prototype's "Journey to Understanding" card)

→ If gap exists: explain-back flow (existing production code)
→ Return to beginning screen to pick another card, or end session

### Selecting a point

Tap "Does Alice agree?" → partner sees point card with position buttons.

Both take positions → positions revealed → if disagreement, offer "Explore linked stories."

### Cardless mode (either direction)

Tap "Does Alice understand you?" → cardless verification where you speak and Alice rates understanding.
Tap "Do you understand Alice?" → cardless verification where Alice speaks and you rate understanding.

Both go to current production flow (cardless, no content attached) — the only difference is which prompt each person sees first.

### returnTo param

If `/live?code=XYZ&returnTo=/events/clarity-hike`, the back button shows "← Back to event" instead of "← End session" and navigates to the returnTo URL.

---

## What Changes vs. What Stays

### Keep as-is
- Session creation (code generation, QR, link sharing)
- Join flow (code entry, guest name/email/consent)
- Rating mechanics (0-10, sealed-bid, both rate simultaneously)
- Explain-back flow (multiple rounds)
- Departure detection, polling fallback

### Add
- Enhanced idle screen in LiveModeView (replaces current IdleScreen, NOT a new ViewState)
- Story list from current user's stories (creator-only; guests see direction buttons only)
- Point list from current user's points (Supabase query)
- Progressive search (appears at 5+ items; below 5, show all directly)
- Two directional cardless mode buttons ("Does Alice understand you?" / "Do you understand Alice?")
- Story/point context visible during verification (partner sees the card)
- Session history panel (checkmarks only, no scores — scores are private calibration data)
- `returnTo` query param support for back navigation

### Do NOT build (yet)
- AI-assisted story creation from free live (P127)
- Partner's stories/points visible (only your own content to verify)
- Audio recording integration
- Calibration stats on profile page

---

## Technical Approach

### Enhanced idle screen in LiveModeView (NOT a new ViewState)

The beginning screen replaces the current `IdleScreen` component inside `LiveModeView` when `ratingPhase` is `idle`. No changes to ClarityLivePage's ViewState machine (`start → waiting → live`). This avoids touching mic gating, session restoration, and polling transition code.

The prototype's `CardPhase` state machine (inside `Live.tsx`) is the reference pattern:
```
CardPhase: idle → story-selected → story-speaker-rating → point-selected → in-legacy-flow
```

When `ratingPhase` is `idle` and user is authenticated:
- Fetch current user's stories and points via existing services
- Display content picker (direction buttons + story/point cards)
- On card selection: set content in LiveSessionState, transition to rating
- On cardless mode button: transition to existing cardless flow

When user is guest (no auth):
- Show direction buttons only (no content section)

### LiveSessionState extensions

```typescript
// Add to existing LiveSessionState
selectedStoryId?: string
selectedStoryVersionId?: string  // immutable version reference
selectedPointId?: string
```

These get synced to the `clarity_sessions` row in Supabase so the partner can see what was selected.

### Data queries

- Stories: `getStoriesByAuthor(userId)` — already exists from P117
- Points: `getPointsByValidator(userId)` — already exists, returns points the user created
- Search: client-side filter on loaded stories/points. Progressive: search bar appears at 5+ items.

### New production components (prototype as design reference)

Build new lightweight components using production types (`StoryWithAuthor`, `PointWithCreator`):
- `LiveStoryCard` — story display for content picker (simplified from prototype's `StoryCard.tsx`)
- `LivePointCard` — point display for content picker (simplified from prototype's `PointCard.tsx`)

The prototype components in `src/app/prototypes/linkedin-like/components/` use mock data and a separate type system (`story.text` vs production `story.content`). Use them as visual/UX reference only, not as code to promote.

Existing `FlowType = 'check' | 'prove'` maps to the direction buttons: `check` = "Does Alice understand you?", `prove` = "Do you understand Alice?"

---

## Edge Cases

| Case | Handling |
|------|----------|
| Guest joiner (no account) | Sees direction buttons only, no content section. This is the primary/default case. |
| Authenticated user with no stories | Sees direction buttons + hint: "Create stories to verify next time." |
| Partner disconnects during beginning screen | Same as current: departure detection, "Partner left" message |
| returnTo URL is invalid/external | Ignore returnTo, fall back to default end-session behavior. Only allow same-origin URLs (starts with `/`, no `//` or protocol schemes). |

---

## Success Metrics

| Metric | Target | What it tests |
|--------|--------|---------------|
| Content selection rate | >60% pick a story/point (vs cardless) | Is the picker useful? Tests H-Stories. |
| Session completion with content | >70% complete verification | Does content improve completion? |
| Explain-back quality with content | Higher ratings than cardless | Does a topic help? Informs OQ-6 (internal trigger). |

---

## Dependencies

- **P117** (done): Stories backend — provides story/point data
- **P126** (bug): /live departure detection — affects all /live flows

## Related

- **P124:** Event Rooms — consumes the returnTo param and beginning screen
- **P127:** Draft Stories from Free Live — future enhancement
- **P85:** /live Verification with Cards — original /live flow
- **Prototype:** `/prototype/linkedin-like/live` — design reference (1894-line interactive mock)
