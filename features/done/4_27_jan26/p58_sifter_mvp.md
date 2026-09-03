---
status: all-done
type: story
tags: []
rank: 125445.0
created_date: 2026-01-14
completed_at: '2026-02-09'
---

# P58: AI Sifter MVP

**Status:** Planning
**Created:** 2026-01-14
**Build Phase:** Days 4-5 (after Events, /live connection, Stories/Points mockup)

> **Note (2026-01-17):** Originally "Phase 0" but reprioritized — Events-first approach means Sifter comes after basic Stories/Points UI exists. First iteration is mockup + AI agent, not full implementation. See [decisions.md](../docs/decisions.md) entry 2026-01-17.

---

## One-Sentence Description

A chat-based brain dump interface where AI separates your messy thoughts into **Stories** (protected for empathy) and **Points** (sharpened for truth-seeking).

---

## Why This First

1. **Users arrive at events with clear ideas** — Stories and Points already separated
2. **Answers "why must I verify?"** — Your Story deserves to be understood, not strawmanned
3. **Personal value standalone** — Useful even without events or other users
4. **Quality in = Quality out** — Better inputs to position staking and verification

---

## Core Philosophy

### Stories vs Points

| Type | What it is | Scale | Purpose |
|------|------------|-------|---------|
| **Story** | Your lived experience | 0-10: "Do you feel understood?" | To be seen, not debated |
| **Point** | A claim about reality | 0-10: "How much do you agree?" | To invite stress-testing with other Stories |

### Why Points Exist

> "The reason to attach a Point is to invite people to stress test it with other Stories"

- If you just want to be heard → Story only (private or shared)
- If you want to spread/discover truth → Story + Point → invite debate

### Key Insight

> "Suffering shared is half the suffering. Happiness shared is double the happiness."
> But we can't share what we don't see. And we've stopped seeing each other.

---

## Algorithm (v2 — Refined)

### Design Principles

1. **Stories first, Points optional** — Feel understood before extracting claims
2. **One at a time** — Easier to rate, easier to correct
3. **Options as default** — People often can't articulate from blank space; options unlock them
4. **10/10 required for Stories** — Must feel fully understood before publishing
5. **7+ required for Points** — Below 7 triggers "You seem unsure. Keep, refine, or discard?"

### Flow

```
1. BRAIN DUMP
   └── User types/speaks freely

2. STORY EXTRACTION (one at a time)
   ├── AI: "Here's what I heard:" [synthesized story]
   ├── User: Rate 0-10 "Do you feel understood?"
   │
   ├── If <10:
   │   ├── AI shares what it's uncertain about
   │   ├── Offers options: A/B/C/D/Other
   │   └── Loop until 10
   │
   └── If 10:
       ├── Story saved
       └── AI: "I noticed another story. Capture it?" (only if AI sees one)
           ├── Yes → repeat step 2
           └── No → move to Points

3. POINTS EXTRACTION (optional)
   ├── AI: "Your story contains this belief: [hardened Point]"
   ├── AI: "Want others to stress test it with their Stories?"
   │
   ├── [Yes] → "How strongly do you believe it? 0-10"
   │   ├── 7+ → saved with agreement score
   │   └── <7 → "You seem unsure. Refine, keep anyway, or discard?"
   │
   └── [No] → Skip this Point (belief stays embedded in Story)

   Repeat for each Point found

4. PUBLISH
   ├── Stories: saved (10/10 understood, private by default)
   └── Points: saved with agreement scores (public, invites stress-testing)
```

### AI Behavior by Rating

| Rating | AI Response |
|--------|-------------|
| **8-10** | "Got it!" — Accept or minor tweak |
| **5-7** | "Almost there. What's missing?" + Options A/B/C/D/Other |
| **<5** | "I think I'm missing something important. Here's what I'm uncertain about: [X, Y]. Which is off?" + Options |

**Same mechanic** (options), different **framing** (confidence level). KISS.

---

## User Journey (Wireframes)

See: [sifter-mvp-wireframe-v4.excalidraw](../../../docs/archive/bmad/diagrams/_archive/sifter-mvp-wireframe-v4.excalidraw)

### Screen Flow

1. **Entry** — "Dump your thoughts. I'll help untangle them."
2. **Processing** — AI sifts, shows progress
3. **Review Dashboard** — Shows all extracted Stories/Points, user picks which to review
4. **Story Review (Chat)** — Rate 0-10, AI asks clarifying questions until 10
5. **Point Review (Chat)** — Rate 0-10 agreement, AI refines until satisfied
6. **Publish** — Summary of what's ready, publish button

---

## AI Prompts

### Sifter Prompt

```
You are a thought sifter. Your job is to help users separate their messy thoughts into two categories:

**STORIES** (Subjective — World 2):
- Personal experiences, feelings, memories
- Things that happened TO the user
- Emotional content, lived reality
- Cannot be "disagreed with" — only understood
- Markers: "I felt", "I experienced", "I remember", "It was hard", etc.

**POINTS** (Objective — World 3):
- Claims about reality
- Assertions that could be true or false
- Things that CAN be agreed/disagreed with
- Markers: "I think", "We should", "It's better", "Companies are", etc.

Given user input:
1. Synthesize Stories into ONE cohesive narrative (don't fragment into quotes)
2. Extract Points (already hardened — specific and falsifiable)
3. Keep the user's voice and intent

When rating is below 10:
- Share what you're uncertain about
- Offer options (A/B/C/D/Other) — don't ask open-ended questions
- Options help users correct you even when they can't articulate what's wrong
```

### Story Refinement Prompt

```
The user rated their Story {rating}/10 for how well you captured their experience.

If rating < 10, something is missing or wrong.

Your job:
1. State what you're uncertain about from the Story
2. Offer 3-4 specific options for what might be off
3. Always include "Other — tell me" as the last option

Example:
"You rated 7/10. Here's what I'm uncertain about:
- Was it more about the health impact or the guilt?
- Did I miss the time pressure aspect?

What's closer?
A) It was mainly about guilt for not being present
B) The exhaustion was physical, not emotional
C) There's a work culture element I missed
D) Other — tell me"

Keep iterating until they reach 10/10.
```

### Point Hardening Prompt

```
You are a claim hardener. Transform vague Points into falsifiable statements.

Rules:
- Make every word matter (no filler)
- Replace vague terms with specific ones
- Add scope if missing (who, when, where)
- Preserve the user's original intent
- Keep it one sentence if possible

Examples:
- "Cars are bad" → "Removing cars from city centers reduces respiratory illness rates"
- "Remote work is better" → "Remote work improves wellbeing for knowledge workers, though productivity varies by role"
- "We don't pay attention" → "Most people operate on autopilot, missing what's happening around them because sustained attention is neither taught nor culturally valued"

Present the hardened version directly. User rates 0-10 agreement.
If <7, ask what's holding them back (with options).
```

---

## Data Model

### Stories Table

```sql
stories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) not null,
  text text not null,
  accuracy_rating int not null check (accuracy_rating = 10), -- must be 10 to save
  sift_session_id uuid,
  is_public boolean default false,
  created_at timestamp default now()
)

-- RLS: Users can only see their own Stories (unless is_public)
```

### Points Table

```sql
points (
  id uuid primary key default gen_random_uuid(),
  text text not null,                 -- hardened version only (global, not user-owned)
  created_at timestamp default now()
)

-- RLS: Points are readable by all
-- Points are global claims — no single creator. AI deduplicates when extracting.
```

### Story-Points Junction Table (N:N)

```sql
story_points (
  id uuid primary key default gen_random_uuid(),
  story_id uuid references stories(id) not null,
  point_id uuid references points(id) not null,
  created_at timestamp default now(),
  unique(story_id, point_id)
)

-- Links Stories to Points. A Story can have multiple Points; a Point can appear in multiple Stories.
-- AI creates these links during sifting — users approve but don't manually link.
```

### Positions Table (User stance on Points)

```sql
positions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) not null,
  point_id uuid references points(id) not null,
  agreement_rating int not null check (agreement_rating >= 0 and agreement_rating <= 10),
  created_at timestamp default now(),
  unique(user_id, point_id)
)

-- User's position on a Point. Shown as "Maria agrees (8/10)"
-- Separate from story_points — you can have a position without a Story.
```

### Sift Sessions Table

```sql
sift_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) not null,
  raw_input text not null,
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
  stories: ExtractedStory[];
  points: ExtractedPoint[];
}>

// Update story after refinement
updateStory(storyId: string, text: string, rating: number): Promise<void>

// Accept/reject story
finalizeStory(storyId: string, accepted: boolean): Promise<void>

// Update point after refinement
updatePoint(pointId: string, text: string, rating: number): Promise<void>

// Accept/reject point
finalizePoint(pointId: string, accepted: boolean): Promise<void>

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
| `SifterEntry` | `src/app/components/sifter/` | Brain dump input |
| `SifterProcessing` | `src/app/components/sifter/` | Processing animation |
| `ReviewDashboard` | `src/app/components/sifter/` | Overview of extracted items |
| `StoryReviewChat` | `src/app/components/sifter/` | Chat-based story refinement |
| `PointReviewChat` | `src/app/components/sifter/` | Chat-based point refinement |
| `RatingScale` | `src/app/components/sifter/` | 0-10 rating component |
| `OptionPicker` | `src/app/components/sifter/` | A/B/C/D/Other selector |
| `PublishSummary` | `src/app/components/sifter/` | Final review before publish |
| `SifterPage` | `src/app/pages/` | Route: `/sift` |

---

## Success Metrics

| Metric | Target | Why |
|--------|--------|-----|
| Sift completion rate | >50% | Do users finish? |
| Stories reaching 10/10 | >70% | Can AI understand users? |
| Average iterations to 10 | <3 | Is refinement efficient? |
| Points accepted | >40% | Do users want to stake claims? |
| Point agreement scores | avg >7 | Are users confident in Points? |
| Time to complete | <5 min | Is it too slow? |

---

## Edge Cases

### No Points detected

User shares only Story (pure experience):

```
AI: "I found your Story but no claims you're making.
     That's okay — sometimes we just need to be heard.

     [Save Story only]  [Help me find a Point]"
```

### No Story detected

User shares only Point (pure assertion):

```
AI: "I found a claim but no experience behind it.
     A Story helps others understand WHY you believe this.

     [Add my Story]  [Just save the Point]"
```

### Story stuck below 10

After 5+ iterations without reaching 10:

```
AI: "We've been at this a while. Would you like to:

     A) Save at current rating (8/10) — close enough
     B) Start fresh with different words
     C) Skip this Story entirely"
```

**Note:** Option A should be rare. The goal is 10/10. But don't trap users.

### Point below 7 agreement

```
AI: "You rated 5/10 agreement. You seem unsure about this.

     [Refine it] — let's adjust the wording
     [Keep anyway] — save with 5/10 shown
     [Discard] — don't publish this Point"
```

---

## Future Enhancements (V1.1+)

### Point Matching

Before creating new Points, search existing database:

```
AI: "5 people already believe something similar:
     'Remote work improves wellbeing for most workers'

     [Join this Point]  [Create my own version]"
```

**Why not MVP:** No Points database yet. Design for it (normalized text, tags), build later.

### Voice Input

```
□ Whisper API for transcription
□ "Tap to speak" button
□ Real-time transcription display
□ Same sift flow after transcription
```

---

## Decisions Made

| Question | Decision | Rationale |
|----------|----------|-----------|
| Can Story publish below 10? | **No** | The whole point is feeling understood |
| Can Point publish below 7? | **Yes, with "keep anyway"** | User choice, but score is shown |
| Show raw + hardened Point? | **No — hardened only** | Simpler. One version to rate. |
| When move to Points? | **After all Stories settled OR user says "enough"** | User controls pace |
| Zero Points valid? | **Yes** | Some dumps are pure processing |
| Point matching in MVP? | **No** | Build database first, match later |
| Points without Stories? | **No — every Point must have at least one Story** | Points need context; a Story explains WHY someone believes the Point |
| Story-Point relationship? | **N:N (many-to-many)** | AI handles linking, enables deduplication. Users don't manually create Points — AI extracts and links. See [decisions.md](../docs/decisions.md#2026-01-22-story-point-relationship-is-nn-many-to-many) |

---

## Integration Points

### → Position Staking (Phase 1)

After sift complete:
- Points become available for position staking
- Agreement score shown: "Maria agrees (8/10)"
- Others can stake their own position on same Point

### → Verification /live (Phase 3)

When verifying someone's position:
- Show their linked Story (if they have one)
- Context: "Maria agrees because: [her Story]"

### → Context Portal (Phase 4)

AI summarizes Stories behind positions:
- "People who agree share experiences of..."
- "People who disagree share experiences of..."

---

## Related Documents

- [ROADMAP.md](./ROADMAP.md) — Where this fits in the build order
- [sifter-mvp-wireframe-v4.excalidraw](../../../docs/archive/bmad/diagrams/_archive/sifter-mvp-wireframe-v4.excalidraw) — UI wireframes
- [v5_1_sensemaking_platform_synthesis.md](../docs/visions/v5_1_sensemaking_platform_synthesis.md) — Philosophy of Story/Point

---

## Changelog

| Date | Change |
|------|--------|
| 2026-01-14 | Created from v5/v6 synthesis |
| 2026-01-14 | **v2 algorithm**: Stories-first, one-at-a-time, options-based refinement, chat-based review |
