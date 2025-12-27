# P23: Live Clarity Meetings

**Status:** Ready for Implementation
**Priority:** High
**Date:** 2025-12-23
**Consolidates:** P22 (data model), P22_2 (live referee mode)

---

## Summary

A single deliverable that enables **live, in-person Clarity Meetings**. Two people join a session, talk naturally, and the app acts as a quiet referee - enforcing the understanding protocol with minimal taps. The phone captures roles, ratings, and the journey to mutual understanding.

This is the **MVP for spreading the Clarity Pledge** through real-world conversations.

---

## Core Promise

> **A pledger helps a non-pledger experience what it feels like to be truly understood.**

Everything in this spec serves this promise.

---

## User Value

| Who | What They Get |
|-----|---------------|
| **Pledger** | Tool to demonstrate clarity in live conversation |
| **Non-pledger** | Experience of being truly understood |
| **Both** | Documented common knowledge, calibration scores |

---

## The Protocol

### Slider + Button Model

Two controls enable continuous understanding calibration without explicit role selection:

| Control | Label | What it does |
|---------|-------|--------------|
| **Slider** | "Gosha understands me" | Drag to rate how well the other person understands you (1-10). Automatically prompts them to rate their understanding of you. |
| **Button** | "Listen Actively Now" | Self-initiate rating of your understanding of the other person. Use when you want to verify you got it right. |

### How Gap Detection Works

Gap detection compares **two perspectives on the SAME direction**:

```
Direction: "Does Gosha understand Slava?"

Slava's perspective:  "I feel Gosha understands me: 5/10"
Gosha's perspective:  "I understand Slava: 8/10"

Gap = |8 - 5| = 3  →  Worth checking!
```

This is NOT comparing "you understand ME" from both people (those are different directions).

### Interaction Flow

1. **Slava drags slider** → Rates 5/10 → Gosha sees prompt: "Rate your understanding of Slava"
2. **Gosha rates** → 8/10 → Gap detected (3+ difference)
3. **Gap surfaced** → Both see gap, either can initiate paraphrase
4. **Paraphrase cycle** → Gosha explains back → Slava rates accuracy → converge to 10/10

### Key Design Decisions

- **No "done speaking"** - Real conversations are continuous, not turn-based
- **Slider drag = rate + request** - No separate "tap to check" action needed
- **Listener self-initiation** - Button lets listener volunteer understanding check
- **Calibration is the goal** - Paraphrase is just a tool to verify rating accuracy

### Why This Works

Without structure:
- People assume understanding without checking
- Dodge hard paraphrases
- Move on when uncomfortable

With structure:
- Continuous visibility into perceived understanding
- Gap detection surfaces important misalignments
- Calibration is quantified, not assumed
- Either party can initiate verification

---

## The Dual Evolving Ideas Model

This is NOT just paraphrasing - it's **convergent evolution of mental models**:

```
SPEAKER'S IDEA                    LISTENER'S IDEA (copy)
     │                                   │
     ▼                                   ▼
┌─────────────┐                   ┌─────────────┐
│ Initial v1  │                   │  (empty)    │
└─────────────┘                   └─────────────┘
     │ speaks more...                    │ paraphrases...
     ▼                                   ▼
┌─────────────┐                   ┌─────────────┐
│ Evolved v2  │   ──compare──►    │  Copy v1    │
└─────────────┘                   └─────────────┘
     │ clarifies...                      │ refines...
     ▼                                   ▼
┌─────────────┐                   ┌─────────────┐
│ Evolved v3  │   ──compare──►    │  Copy v2    │
└─────────────┘                   └─────────────┘
     │                                   │
     └──────── 9/10 or 10/10 ───────────┘
              "Similar enough!"
```

When speaker confirms listener's copy is "similar enough" (9-10/10), understanding is achieved.

---

## User Flow

```
1. JOIN SESSION
   Both users join same 6-letter code (existing infrastructure)
   Session starts in LIVE mode

2. LIVE MODE - Default State
   ┌─────────────────────────────────────────────┐
   │  Slava 🔴      [====|==]      Gosha  Review │
   │                 65%  35%                    │
   ├─────────────────────────────────────────────┤
   │                                             │
   │            (conversation area)              │
   │                                             │
   │   Gosha understands me:                     │
   │   ●━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━●     │
   │   1                    7/10           10    │
   │                                             │
   │  ┌─────────────────────────────────────┐   │
   │  │       [ Listen Actively Now ]       │   │
   │  └─────────────────────────────────────┘   │
   └─────────────────────────────────────────────┘

   Header: Names + speaking dot (🔴) + balance bar + Review button
   Controls: Slider + Button

3. SLAVA DRAGS SLIDER (triggers prompt to Gosha)

   SLAVA'S PHONE:                    GOSHA'S PHONE:
   ┌──────────────────────┐          ┌──────────────────────┐
   │  Gosha understands   │          │  Rate your           │
   │  me: 5/10            │          │  understanding       │
   │  ●━━━━━●━━━━━━━━━━━━ │          │  of Slava:           │
   │                      │          │                      │
   │  Waiting for Gosha   │          │  ●━━━━━━━━━●━━━━━━━━ │
   │  to rate...          │          │  1        8/10    10 │
   └──────────────────────┘          └──────────────────────┘

4. GAP DETECTED (3+ difference)

   SLAVA'S PHONE:                    GOSHA'S PHONE:
   ┌──────────────────────┐          ┌──────────────────────┐
   │  Gap Detected!       │          │  Gap Detected!       │
   │                      │          │                      │
   │  You feel: 5/10      │          │  Slava feels: 5/10   │
   │  Gosha feels: 8/10   │          │  You feel: 8/10      │
   │                      │          │                      │
   │  [ Request Check ]   │          │  [ Let Me Explain ]  │
   └──────────────────────┘          └──────────────────────┘

5. PARAPHRASE MODE
   ┌─────────────────────────────────────────────┐
   │  Slava        [====|==]      Gosha   Review │
   │                 65%  35%                    │
   ├─────────────────────────────────────────────┤
   │                                             │
   │   Gosha is explaining back...               │
   │                                             │
   │   ┌───────────────────────────────────┐     │
   │   │  "What I heard: [paraphrase]"     │     │
   │   └───────────────────────────────────┘     │
   │                                             │
   │   Rate accuracy:                            │
   │   ●━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━●     │
   │   1                                   10    │
   │                                             │
   │   [ Good Enough ]  [ I'm Done Trying ]      │
   └─────────────────────────────────────────────┘

6. VERIFIED (10/10)
   ┌─────────────────────────────────────────────┐
   │  Slava        [====|==]      Gosha   Review │
   │                 65%  35%                    │
   ├─────────────────────────────────────────────┤
   │                                             │
   │   ✓ Understanding Verified!                 │
   │   10/10                                     │
   │                                             │
   │   (auto-fades after 2s, returns to default) │
   │                                             │
   └─────────────────────────────────────────────┘

7. REVIEW MODE (Processing)
   ┌─────────────────────────────────────────────┐
   │  Session Summary                            │
   │                                             │
   │  Ideas Discussed: 5                         │
   │  Mutual Understanding: 3/5 at 10/10         │
   │  Avg Calibration Gap: +1.2                  │
   │                                             │
   │  [Timeline visualization]                   │
   │                                             │
   │  ┌─────────────────────────────────────┐   │
   │  │ Idea 1: "We should prioritize..."   │   │
   │  │ Originator: Slava | 3 rounds | 10/10│   │
   │  │ [Expand transcript]                  │   │
   │  └─────────────────────────────────────┘   │
   │                                             │
   │  [Back to Live]  [End Session]              │
   └─────────────────────────────────────────────┘
```

### Wireframes

See [p23-live-clarity-wireframes-v4.excalidraw](../docs/bmad/diagrams/p23-live-clarity-wireframes-v4.excalidraw) for visual wireframes.

---

## Data Model

### New Table: `clarity_live_turns`

Tracks each speaking turn in a live session.

```sql
CREATE TABLE clarity_live_turns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES clarity_sessions(id) ON DELETE CASCADE,
  idea_id UUID REFERENCES clarity_ideas(id) ON DELETE SET NULL,

  -- Who did what
  speaker_name TEXT NOT NULL,
  listener_name TEXT NOT NULL,
  actor_name TEXT NOT NULL,  -- Who made this turn (speaker or listener)
  role TEXT NOT NULL CHECK (role IN ('speaker', 'listener')),

  -- Turn content
  transcript TEXT,  -- Transcribed speech (populated after)

  -- Ratings (0-10 scale)
  self_rating INTEGER CHECK (self_rating >= 0 AND self_rating <= 10),
  other_rating INTEGER CHECK (other_rating >= 0 AND other_rating <= 10),

  -- Flags
  flag TEXT CHECK (flag IN ('new_idea', 'judgment', 'not_what_i_meant', 'your_idea')),

  -- Tracking
  round_number INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for session queries
CREATE INDEX idx_live_turns_session ON clarity_live_turns(session_id);
CREATE INDEX idx_live_turns_idea ON clarity_live_turns(idea_id);
```

### Update: `clarity_sessions`

Add mode tracking for live sessions.

```sql
ALTER TABLE clarity_sessions
ADD COLUMN mode TEXT DEFAULT 'live' CHECK (mode IN ('live', 'review'));

ALTER TABLE clarity_sessions
ADD COLUMN live_state JSONB DEFAULT '{}';
-- Stores: current_idea_id, current_speaker, round_number, etc.
```

### Update: `clarity_ideas`

Add source tracking for live turns.

```sql
ALTER TABLE clarity_ideas
ADD COLUMN source_live_turn_id UUID REFERENCES clarity_live_turns(id) ON DELETE SET NULL;
```

### Simplified `clarity_ideas` (What We Actually Need)

For MVP, we use a minimal version:

```sql
CREATE TABLE clarity_ideas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Core content
  content TEXT,  -- AI-generated summary (populated in review mode)
  originator_name TEXT NOT NULL,

  -- Session context
  session_id UUID REFERENCES clarity_sessions(id) ON DELETE CASCADE,

  -- Status
  is_understood BOOLEAN DEFAULT FALSE,  -- Reached 10/10
  final_rating INTEGER,  -- Last speaker rating
  total_rounds INTEGER DEFAULT 0,

  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  understood_at TIMESTAMP WITH TIME ZONE
);
```

---

## Technical Requirements

### Reuse Existing

| Component | Source | Action |
|-----------|--------|--------|
| Session joining (6-letter code) | Chat flow | Reuse as-is |
| Voice recording | `TranscriptionInput` | Reuse, hide text display |
| Realtime sync | Supabase channels | Extend for live state |
| Rating UI patterns | Demo flow | Adapt to 0-10 buttons |

### Build New

| Component | Description |
|-----------|-------------|
| Live mode page | Main `/live` route |
| Live header | Names + speaking dot + balance bar + Review button |
| Rating panel | Progressive disclosure: collapsed → expanded 1-10 scale |
| Gap detector | Shows "Worth Checking?" when ratings differ significantly |
| Paraphrase mode | Quote box + accuracy rating + exit buttons |
| Voice activity indicator | Speaking dot that moves to active speaker's name |
| Balance bar | Speaking time ratio visualization (since session start) |
| Review mode view | Timeline, transcript, summaries, scores |
| Live state sync | Ratings, speaking state, paraphrase mode across phones |

---

## Design Decisions

### Rating Controls

Two controls for continuous understanding calibration:

```
Slider:    Gosha understands me:
           ●━━━━━━━━━━━━━━━━━●━━━━━━━━━━━●
           1                 7/10        10

Button:    [ Listen Actively Now ]
```

**Slider behavior:**
- Drag to update your rating of how well the other person understands you
- Releasing the slider automatically prompts the other person to rate their understanding of you
- No separate "tap to check" needed - the drag IS the check

**Button behavior:**
- Tap to self-initiate rating of your understanding of the other person
- Use when you want to verify you got it right without waiting

### Gap Detection

Gap appears ONLY when:
1. Both parties have submitted ratings for the SAME direction, AND
2. Ratings differ by 3+ points (configurable)

Gap indicator shows both ratings and offers action:
- Originator sees: "Request Check" button
- Active Listener sees: "Let Me Explain" button (paraphrase)

### Paraphrase Exit Conditions

Three ways to exit paraphrase mode:
1. **10/10** - Speaker rates paraphrase as perfect → "Understanding Verified!" (auto-fades)
2. **Good Enough** - Speaker accepts imperfect understanding → returns to default
3. **I'm Done Trying** - Listener gives up → returns to default

### Speaking Balance

- **Live Mode:** Balance bar shows speaking time ratio since session start
- **Review Mode:** Full timeline visualization of who spoke when

### Voice Activity

Speaking dot (🔴) appears next to currently speaking person's name in header.
Requires voice activity detection (can be manual tap for MVP).

### Idea Tracking

Ideas are captured organically through paraphrase checks:
- When 10/10 is achieved, the paraphrased content becomes a "verified idea"
- **In Live Mode:** No explicit idea display (conversation flows naturally)
- **In Review Mode:** List of verified ideas with ratings and rounds

---

## Files to Create

| File | Purpose |
|------|---------|
| `src/app/pages/clarity-live-page.tsx` | Main live session page |
| `src/app/components/partners/live-mode-view.tsx` | Live mode UI (continuous rating model) |
| `src/app/components/partners/review-mode-view.tsx` | Review/processing view with timeline |
| `src/app/components/partners/live-header.tsx` | Names + speaking dot + balance bar + Review |
| `src/app/components/partners/rating-panel.tsx` | Progressive disclosure 1-10 rating |
| `src/app/components/partners/gap-detector.tsx` | Gap display + action buttons |
| `src/app/components/partners/paraphrase-mode.tsx` | Quote box + accuracy rating + exits |
| `src/app/components/partners/balance-bar.tsx` | Speaking time ratio visualization |
| `supabase/migrations/xxx_live_clarity_meetings.sql` | Database changes |

## Files to Modify

| File | Changes |
|------|---------|
| `src/App.tsx` | Add `/live` route |
| `src/app/data/api.ts` | Live session state management |
| `src/app/types/index.ts` | LiveTurn, LiveSessionState types |

---

## Implementation Phases

### Phase 1: Data Model + Route

1. Create database migration
2. Add `/live` route
3. Basic page shell with session joining

### Phase 2: Live Mode UI (Continuous Rating)

1. Live header component (names + balance bar + speaking dot)
2. Rating panel with progressive disclosure
3. Gap detector component
4. Paraphrase mode UI
5. Verification success animation

### Phase 3: Realtime Sync

1. Live session state type (ratings, speaking, paraphrase mode)
2. Realtime channel subscription
3. Rating sync between phones
4. Speaking indicator sync
5. Paraphrase mode state sync

### Phase 4: Review Mode

1. Review mode view with timeline
2. Transcript display (raw initially)
3. Verified ideas list
4. Calibration scores display
5. Mode toggle (Review button in header)

### Phase 5: Voice Activity Detection

1. Basic audio level detection
2. Speaking dot indicator
3. Balance bar calculation
4. Optional: Manual tap fallback for MVP

---

## Success Criteria

Before calling MVP "done":

- [ ] Two people can join same session from different phones
- [ ] Both see Live Mode UI with header (names + balance bar)
- [ ] Rating panel expands/collapses on tap
- [ ] Both ratings sync in real-time
- [ ] Gap detector appears when ratings differ by 3+
- [ ] "Worth Checking?" / "I'll Paraphrase" buttons work
- [ ] Paraphrase mode shows quote box + accuracy rating
- [ ] Exit conditions work (10/10, Good Enough, I'm Done Trying)
- [ ] Speaking dot moves to active speaker
- [ ] Balance bar updates as conversation progresses
- [ ] Can toggle to Review mode via header button
- [ ] Review mode shows timeline and verified ideas
- [ ] Session persists (can refresh and rejoin)

---

## Out of Scope (After MVP)

- Auto voice detection (who's speaking)
- Voice training / speaker ID
- AI-generated summaries (show raw transcript first)
- Async continuation in Review mode
- Annotation/editing
- Gamification
- Shared screen / event mode
- Wearable support
- Chat message → idea elevation (separate feature)

---

## Testing Plan

1. **Unit tests** for new components
2. **Integration test** for realtime sync
3. **Manual test** with 2 real phones, real conversation
4. **Iterate** based on friction observed

---

## Related Documents

- [P22: Unified Ideas Architecture](./p22_unified-ideas.md) - Full data model (deferred parts)
- [P22_2: Live Referee Mode](./p22_2_live-referee-mode.md) - Design exploration
- [P22_1: Simplified Live Protocol](./p22_1_simplified-live.md) - Original concept (archived)
