---
status: backlog
type: story
priority: p1
prepped_date: '2026-02-05'
reviews:
  ux: inherited-from-prototype
  architect: passed
  alignment: passed
prototype: /prototype/linkedin-like/live
decisions:
  - Content picker after partner joins, not before
  - Direction-first design: two free-speaking buttons (you speak / partner speaks) + story/point cards below
  - Picking a card is a shortcut for "does partner understand you?" + specific topic
  - returnTo query param for back navigation (used by P124)
  - No ClarityLivePage refactoring — add beginning screen as new view state
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
3. **Free live** → Speak freely (current behavior, default)

---

## User Flow

### After partner joins (new beginning screen)

Both users see the beginning screen. Either person can select content or a direction.

**Design principle:** Direction-first. The user's mental state is "who's talking?" — not "what content?" The two free-speaking buttons answer that question directly. Story/point cards below are a shortcut for "does partner understand you?" + a specific topic.

```
┌─────────────────────────────────────────┐
│ ← End session               🔴 Live    │
├─────────────────────────────────────────┤
│                                         │
│  You're live with Alice                 │
│                                         │
│  ┌─────────────────────────────────┐    │
│  │  🗣️  Does Alice understand you? │    │
│  │  You speak, Alice verifies      │    │
│  └─────────────────────────────────┘    │
│                                         │
│  ┌─────────────────────────────────┐    │
│  │  👂 Do you understand Alice?    │    │
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
└─────────────────────────────────────────┘
```

**Three paths:**
1. **"Does Alice understand you?"** → free speaking, you're the teller, Alice verifies (freeform)
2. **"Do you understand Alice?"** → free speaking, Alice is the teller, you verify (freeform)
3. **Pick a story/point card** → structured verification (direction implied: does partner understand YOUR content)

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

### Free live (either direction)

Tap "Does Alice understand you?" → freeform verification where you speak and Alice rates understanding.
Tap "Do you understand Alice?" → freeform verification where Alice speaks and you rate understanding.

Both go to current production flow (freeform verification, no content attached) — the only difference is which prompt each person sees first.

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
- Beginning screen view state (after partner joins, before first verification)
- Story list from current user's stories (Supabase query)
- Point list from current user's points (Supabase query)
- Search/filter for stories and points
- Two directional free-speaking buttons ("Does Alice understand you?" / "Do you understand Alice?")
- Story/point context visible during verification (partner sees the card)
- Session history panel (verified cards with checkmark, inline on beginning screen)
- `returnTo` query param support for back navigation

### Do NOT build (yet)
- AI-assisted story creation from free live (P127)
- Partner's stories/points visible (only your own content to verify)
- Audio recording integration
- Calibration stats on profile page

---

## Technical Approach

### New view state in ClarityLivePage

Add a `beginning` phase to the existing meeting flow:

```
meetingPhase: 'start' → 'waiting' → 'beginning' → 'live'
                                      ↑ NEW
```

When both users are connected and `beginning` phase is active:
- Fetch current user's stories and points via existing services
- Display content picker
- On selection: transition to `live` phase with selected content
- On "speak freely": transition to `live` phase without content (current behavior)

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
- Points: `getPointsByUser(userId)` — needs service method (or reuse existing)
- Search: client-side filter on loaded stories/points (small dataset per user)

### Prototype components to promote

The prototype has production-quality components in `src/app/prototypes/linkedin-like/components/`:
- `StoryCard.tsx` — story display with linked points
- `PointCard.tsx` — point display with position buttons
- `RatingDots.tsx` — 1-10 rating visualization
- `PositionButton.tsx` — agree/unsure/disagree with intensity dropdown

These can be promoted from prototype to production components, or production equivalents can reference the prototype as design spec.

---

## Edge Cases

| Case | Handling |
|------|----------|
| User has no stories or points | Show "Speak freely" as primary. Hint: "Create stories to verify next time." |
| Partner disconnects during beginning screen | Same as current: departure detection, "Partner left" message |
| Both users select content simultaneously | First selection wins (DB timestamp). Second user sees "Partner selected a story" and switches to responder view. |
| returnTo URL is invalid/external | Ignore returnTo, fall back to default end-session behavior. Only allow same-origin returnTo URLs. |

---

## Success Metrics

| Metric | Target | What it tests |
|--------|--------|---------------|
| Content selection rate | >60% pick a story/point (vs free live) | Is the picker useful? |
| Session completion with content | >70% complete verification | Does content improve completion? |
| Explain-back quality with content | Higher ratings than freeform | Does a topic help? |

---

## Dependencies

- **P117** (done): Stories backend — provides story/point data
- **P126** (bug): /live departure detection — affects all /live flows

## Related

- **P124:** Event Rooms — consumes the returnTo param and beginning screen
- **P127:** Draft Stories from Free Live — future enhancement
- **P85:** /live Verification with Cards — original /live flow
- **Prototype:** `/prototype/linkedin-like/live` — design reference (1894-line interactive mock)
