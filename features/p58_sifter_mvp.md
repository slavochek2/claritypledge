# P58: AI Sifter MVP

**Status:** Planning
**Created:** 2026-01-14
**Parent:** [ROADMAP.md](./ROADMAP.md) — Phase 0

---

## One-Sentence Description

A chat-based brain dump interface where AI separates your messy thoughts into **Stories** (protected for empathy) and **Points** (sharpened for truth).

---

## Why This First

1. **Users arrive at events with clear ideas** — Stories and Points already separated
2. **Answers "why must I verify?"** — Your Story deserves to be understood, not strawmanned
3. **Personal value standalone** — Useful even without events or other users
4. **Quality in = Quality out** — Better inputs to position staking and verification

---

## User Journey

### Entry Point

User opens Sifter (from home, profile, or event prep):

```
┌─────────────────────────────────────────────────────────┐
│                    CLARITY SIFTER                       │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  What's on your mind?                                   │
│                                                         │
│  Just talk or type freely. I'll help you separate      │
│  your lived experience from your logical claims.        │
│                                                         │
│  ┌───────────────────────────────────────────────────┐ │
│  │                                                   │ │
│  │ [Type or tap 🎤 to speak...]                      │ │
│  │                                                   │ │
│  └───────────────────────────────────────────────────┘ │
│                                                         │
│            [🎤 Voice]     [⌨️ Type]                     │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

### Brain Dump Phase

User types or speaks freely:

```
┌─────────────────────────────────────────────────────────┐
│                    CLARITY SIFTER                       │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  YOU:                                                   │
│  "I've been thinking about remote work. I used to      │
│  commute 2 hours every day and it destroyed me.        │
│  I was exhausted, couldn't see my kids, and my         │
│  health suffered. I really think remote work is        │
│  better for most knowledge workers. Companies          │
│  that force return-to-office are making a mistake."    │
│                                                         │
│  ─────────────────────────────────────────────────────  │
│                                                         │
│  AI is analyzing...                                     │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

### Sift Result

AI highlights and separates:

```
┌─────────────────────────────────────────────────────────┐
│                    CLARITY SIFTER                       │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  I found 1 STORY and 2 POINTS in what you shared.      │
│                                                         │
│  ┌─────────────────────────────────────────────────┐   │
│  │ 🔵 YOUR STORY                                   │   │
│  │                                                 │   │
│  │ "I commuted 2 hours daily. I was exhausted,    │   │
│  │ couldn't see my kids, and my health suffered." │   │
│  │                                                 │   │
│  │ This is YOUR experience. It can't be debated   │   │
│  │ — only understood.                             │   │
│  └─────────────────────────────────────────────────┘   │
│                                                         │
│  ┌─────────────────────────────────────────────────┐   │
│  │ 🟡 POINT #1 (raw)                              │   │
│  │ "Remote work is better for knowledge workers"  │   │
│  │                                                 │   │
│  │ → Hardened version:                            │   │
│  │ "Remote work improves productivity and         │   │
│  │ wellbeing for most knowledge workers"          │   │
│  │                                                 │   │
│  │ [Accept hardened] [Keep original] [Edit]       │   │
│  └─────────────────────────────────────────────────┘   │
│                                                         │
│  ┌─────────────────────────────────────────────────┐   │
│  │ 🟡 POINT #2 (raw)                              │   │
│  │ "Companies forcing RTO are making a mistake"   │   │
│  │                                                 │   │
│  │ → Hardened version:                            │   │
│  │ "Mandatory return-to-office policies reduce    │   │
│  │ employee retention and productivity"           │   │
│  │                                                 │   │
│  │ [Accept hardened] [Keep original] [Edit]       │   │
│  └─────────────────────────────────────────────────┘   │
│                                                         │
│  [Continue dumping]  [Done — Review all]               │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

### Mirror Test

Before saving, AI plays back understanding:

```
┌─────────────────────────────────────────────────────────┐
│                    MIRROR TEST                          │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  Let me make sure I captured the soul of what          │
│  you're saying...                                       │
│                                                         │
│  ─────────────────────────────────────────────────────  │
│                                                         │
│  YOUR STORY is about burnout from commuting —          │
│  the exhaustion, missing family time, and health       │
│  impact of long daily travel to an office.             │
│                                                         │
│  This experience led you to two POINTS:                │
│                                                         │
│  1. Remote work is generally better for knowledge      │
│     workers (productivity + wellbeing)                 │
│                                                         │
│  2. Companies forcing return-to-office are harming     │
│     themselves (retention + productivity)              │
│                                                         │
│  ─────────────────────────────────────────────────────  │
│                                                         │
│  Did I capture your intent?                            │
│                                                         │
│        [0] [1] [2] [3] [4] [5] [6] [7] [8] [9] [10]   │
│        Not at all                        Perfectly     │
│                                                         │
│  [Edit something]  [Start over]                        │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

### Save & Next Steps

After Mirror Test passes (7+):

```
┌─────────────────────────────────────────────────────────┐
│                    SIFT COMPLETE ✓                      │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  Your thoughts have been sifted and saved.             │
│                                                         │
│  🔵 1 Story (private — only shared when you verify)   │
│  🟡 2 Points (ready to stake positions)               │
│                                                         │
│  ─────────────────────────────────────────────────────  │
│                                                         │
│  What's next?                                          │
│                                                         │
│  [Stake positions on my Points]                        │
│  → Agree/disagree, find people with opposite views     │
│                                                         │
│  [Add to an Event]                                     │
│  → Share Points with event participants                │
│                                                         │
│  [Keep sifting]                                        │
│  → I have more thoughts to work through                │
│                                                         │
│  [Just save for now]                                   │
│  → Review later in My Sifted Thoughts                  │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

---

## AI Prompts

### Sifter Prompt

```
You are a thought sifter. Your job is to help users separate their messy thoughts into two categories:

**STORIES** (World 2 — Subjective):
- Personal experiences, feelings, memories
- Things that happened TO the user
- Emotional content, lived reality
- Cannot be "disagreed with" — only understood
- Markers: "I felt", "I experienced", "I remember", "It was hard", etc.

**POINTS** (World 3 — Objective):
- Claims about reality
- Assertions that could be true or false
- Things that CAN be agreed/disagreed with
- Markers: "I think", "We should", "It's better", "Companies are", etc.

Given user input, output:
1. Identified STORIES (preserve original language)
2. Identified POINTS (preserve original language)
3. For each POINT, suggest a "hardened" version that is:
   - More specific and falsifiable
   - Removes vague words ("better", "should", etc.)
   - Makes the claim testable

Keep the user's voice. Don't sanitize emotion from Stories or add emotion to Points.
```

### Hardener Prompt

```
You are a claim hardener. Given a vague Point, transform it into a falsifiable statement.

Rules:
- Make every word matter (no filler)
- Replace vague terms with specific ones
- Add scope if missing (who, when, where)
- Preserve the user's original intent
- Keep it one sentence if possible

Examples:
- "Cars are bad" → "Removing cars from city centers reduces respiratory illness rates"
- "Remote work is better" → "Remote work improves productivity and wellbeing for most knowledge workers"
- "AI will change everything" → "AI will automate >50% of knowledge work tasks within 10 years"

If the Point is already specific and falsifiable, say so.
```

### Mirror Test Prompt

```
You are verifying understanding. Given a user's sifted Stories and Points, play back what you understood in 2-3 sentences.

Structure:
1. Summarize the STORY (the lived experience, the "why")
2. Summarize the POINT(S) (the claim(s) they're making)
3. Show the connection (how the Story leads to the Point)

Tone: Warm but concise. You're checking, not lecturing.

Ask: "Did I capture your intent?" and invite a 0-10 rating.
```

---

## Data Model

### Stories Table

```sql
stories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) not null,
  text text not null,
  sift_session_id uuid,           -- which sift created this
  created_at timestamp default now()
)

-- RLS: Users can only see their own Stories
-- Stories are private unless shared in verification
```

### Points Table

```sql
points (
  id uuid primary key default gen_random_uuid(),
  created_by uuid references profiles(id) not null,
  original_text text not null,    -- user's original wording
  hardened_text text,             -- AI-refined version
  used_hardened boolean default false,  -- which version is "active"
  event_id uuid references events(id),  -- null = personal/global
  sift_session_id uuid,           -- which sift created this
  created_at timestamp default now()
)

-- RLS: Points are readable by all, writable by creator
```

### Sift Sessions Table

```sql
sift_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) not null,
  raw_input text not null,        -- original brain dump
  mirror_test_rating int,         -- 0-10
  completed_at timestamp,
  created_at timestamp default now()
)
```

---

## API

```typescript
// Start a sift session
createSiftSession(rawInput: string): Promise<{
  sessionId: string;
  stories: SiftedStory[];
  points: SiftedPoint[];
}>

// Accept/reject hardened version
updatePointVersion(pointId: string, useHardened: boolean): Promise<void>

// Complete Mirror Test
completeMirrorTest(sessionId: string, rating: number): Promise<void>

// Save sifted content
saveSiftedContent(sessionId: string): Promise<{
  storyIds: string[];
  pointIds: string[];
}>

// Get user's sifted content
getMySiftedContent(): Promise<{
  stories: Story[];
  points: Point[];
}>
```

---

## Components to Build

| Component | Location | Description |
|-----------|----------|-------------|
| `SifterChat` | `src/app/components/sifter/` | Main chat interface |
| `SiftResult` | `src/app/components/sifter/` | Display sifted Stories/Points |
| `StoryCard` | `src/app/components/sifter/` | Blue card for Story display |
| `PointCard` | `src/app/components/sifter/` | Yellow card for Point display |
| `HardenerToggle` | `src/app/components/sifter/` | Accept/reject hardened version |
| `MirrorTest` | `src/app/components/sifter/` | AI playback + rating |
| `SifterPage` | `src/app/pages/` | Route: `/sift` |

---

## Success Metrics

| Metric | Target | Why |
|--------|--------|-----|
| Sift completion rate | >50% | Do users finish? |
| Mirror Test rating | avg >7 | Is AI capturing intent? |
| Hardened version acceptance | >60% | Is hardening useful? |
| Points created per session | 1-3 | Are we over-extracting? |
| Time to complete | <5 min | Is it too slow? |

---

## Edge Cases

### No Points detected

User shares only Story (pure experience):

```
"I had a really hard day. My boss yelled at me
and I felt terrible."
```

Response:
```
I found 1 STORY but no POINTS (claims you're making).

That's okay! Sometimes we just need to process
an experience before forming opinions about it.

[Save Story]  [Help me find a Point]
```

### No Story detected

User shares only Point (pure assertion):

```
"Companies should have unlimited PTO policies."
```

Response:
```
I found 1 POINT but no STORY (experience behind it).

A Story helps others understand WHY you believe this.
Want to add context?

[Add my Story]  [Just save the Point]
```

### User rejects Mirror Test

Rating < 5:

```
What did I miss?

[The Story is wrong]
[The Point is wrong]
[The connection is wrong]
[Start over completely]
```

---

## Voice Input (V1.1)

For MVP, text-only. Voice can be added later:

```
□ Whisper API for transcription
□ "Tap to speak" button
□ Real-time transcription display
□ Same sift flow after transcription
```

---

## Integration Points

### → Position Staking (Phase 1)

After sift complete:
- Points become available for position staking
- User can immediately Agree with their own Point
- Point appears in feeds (if event-scoped)

### → Verification /live (Phase 3)

When verifying someone's position:
- Show their linked Story (if they have one)
- Context: "Maria agrees because: [her Story]"

### → Context Portal (Phase 4)

AI summarizes Stories behind positions:
- "People who agree share experiences of..."
- "People who disagree share experiences of..."

---

## Open Questions

### Q1: Can users sift without creating Points?

**Current:** Yes — Story-only sifts are valid.
**Rationale:** Sometimes processing experience is enough.

### Q2: Are Points always linked to Stories?

**Current:** No — Points can exist without Stories.
**Rationale:** Some claims don't need personal context.
**Future:** Encourage Story linking for richer verification.

### Q3: Can users edit after Mirror Test?

**Current:** Yes — edit anything before final save.
**After save:** Story is immutable, Point can be re-hardened.

---

## Related Documents

- [ROADMAP.md](./ROADMAP.md) — Where this fits in the build order
- [v5_1_sensemaking_platform_synthesis.md](../docs/visions/v5_1_sensemaking_platform_synthesis.md) — Philosophy of Story/Point

---

## Changelog

| Date | Change |
|------|--------|
| 2026-01-14 | Created from v5/v6 synthesis |
