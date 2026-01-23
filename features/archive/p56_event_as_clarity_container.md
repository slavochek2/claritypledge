# P56: Event as Clarity Container — Wireframes & MVP Spec

**Status:** Planning
**Priority:** High (solves cold-start, enables validation)
**Est. Effort:** TBD (phased approach)
**Created:** 2026-01-12
**Origin:** Innovation strategy session with Victor (Innovation Strategist agent)

---

## Executive Summary

This feature defines how **events become the container** for Clarity verification loops. The activity (hiking, coworking, meetup) is the excuse to gather. Clarity is what happens when people are gathered.

**The Core Insight:** The platform creates VISIBILITY. Humans self-organize based on what they see. The organizer's role is to create the protocol, onboard participants, observe friction, and celebrate wins — not to facilitate every interaction.

**The Map Metaphor:** Everyone sees the same dashboard on their phone — ideas, positions, verifications, gaps. This shared visibility drives self-organization without requiring the organizer to direct traffic.

---

## Context & Dependencies

- **P55:** Understanding Verification Loop — the core mechanism this feature containerizes
- **Theory of Change:** √N bridges, topology visibility, common knowledge
- **Worktree 5 Prototype:** Existing mocks for Feed, Topology, IdeaCard, positions, verifications

---

## Jobs to be Done

### Organizer JTBD

> "When I gather people for any purpose, help me prove that real understanding happened — not just attendance."

**Functional sub-jobs:**
- Create an event container with clear purpose
- Seed initial ideas worth verifying
- See who's engaged and where gaps exist
- Celebrate/amplify valuable verifications
- Export proof of value created

### Participant JTBD

> "When I attend an event, help me find the people worth talking to and verify we actually understood each other."

**Functional sub-jobs:**
- See what ideas others care about
- Discover who disagrees with me (interesting conversations)
- Run verification sessions easily
- See my progress relative to the group
- Continue relationships after the event

---

## The Self-Organizing Model

```
ORGANIZER ROLE:
├── Create protocol ("here's how this works")
├── Onboard ("open the app, here's what you'll see")
├── Observe (watch for friction, learn, improve)
├── Celebrate ("Sarah and Tom just bridged a gap!")
└── Export (proof of understanding created)

PLATFORM ROLE:
├── Show the map (ideas, positions, verifications, gaps)
├── Highlight where action is needed (⚡ gap signals)
├── Make pairing easy (tap to start verification)
└── Build topology automatically

PARTICIPANT ROLE:
├── Stake positions on ideas
├── Browse others' ideas and positions
├── Self-select who to verify with
├── Run verification loop
└── See their contribution to the map
```

---

## MVP Feature Stack

### MUST HAVE (Event doesn't work without it)

| Feature | What It Does | Existing Component |
|---------|--------------|-------------------|
| **Event page with participant list** | See who's attending + their ideas | New (uses Profile cards) |
| **Ideas with position counts** | "4 agree, 2 disagree, 1 unsure" | IdeaCard.tsx (extend) |
| **Position staking** | Tap agree/disagree/unsure | PositionButton.tsx (exists) |
| **Gap signal** | ⚡ "High disagreement, no bridges yet" | New |
| **Verification session launcher** | "Start verification with X on idea Y" | Live.tsx (exists) |
| **Verification recorded per idea** | Link verification to specific idea | Data model change |

### SHOULD HAVE (Event is better with it)

| Feature | What It Does | Existing Component |
|---------|--------------|-------------------|
| **Add idea during event** | Participants seed, not just organizer | SurfaceIdeaDrawer.tsx (exists) |
| **Filter: "Who disagrees with me"** | Find interesting pairings quickly | FilterTabs.tsx (extend) |
| **Activity feed** | "Sarah verified with Tom on X" | New |
| **Basic topology view** | See verification graph | Topology.tsx (exists, scope to event) |
| **Personal status** | "Your positions: 3/7, Your verifications: 2" | New |

### NICE TO HAVE (Can live without for first test)

| Feature | What It Does |
|---------|--------------|
| AI match suggestions | "Talk to X about Y" |
| Real-time topology updates | Live animation as verifications happen |
| Gap highlighting on topology | Visual emphasis on unbridged disagreements |

### NOT MVP (Build later)

| Feature | Why Defer |
|---------|-----------|
| Audio capture | Requires permission UX, storage, processing |
| AI idea extraction | Needs audio first |
| Passive listening mode | V2+ dream |
| Post-event async completion | Nice but not critical for first test |

---

## User Flows to Wireframe

### Flow 1: Event Creation (Organizer)

```
Screen 1.1: CREATE EVENT
┌─────────────────────────────────────────┐
│  ← Back                                 │
│                                         │
│  Create Clarity Event                   │
│                                         │
│  Event Name                             │
│  ┌─────────────────────────────────────┐│
│  │ Coworking Trip to Lisbon            ││
│  └─────────────────────────────────────┘│
│                                         │
│  Date & Time                            │
│  ┌─────────────────────────────────────┐│
│  │ Jan 20, 2026 · 2:00 PM              ││
│  └─────────────────────────────────────┘│
│                                         │
│  Description (optional)                 │
│  ┌─────────────────────────────────────┐│
│  │ A Clarity event — we verify         ││
│  │ understanding, not just exchange    ││
│  │ words.                              ││
│  └─────────────────────────────────────┘│
│                                         │
│  [Continue to Add Ideas]                │
│                                         │
└─────────────────────────────────────────┘

Screen 1.2: SEED IDEAS
┌─────────────────────────────────────────┐
│  ← Back                     Skip →      │
│                                         │
│  Seed Ideas for Discussion              │
│                                         │
│  What ideas should participants         │
│  stake positions on?                    │
│                                         │
│  ┌─────────────────────────────────────┐│
│  │ Remote work is more productive      ││
│  │ for knowledge workers               ││
│  └─────────────────────────────────────┘│
│  [+ Add]                                │
│                                         │
│  Ideas added:                           │
│  ┌─────────────────────────────────────┐│
│  │ "We should ship the MVP by Friday"  ││
│  │                              [✕]    ││
│  ├─────────────────────────────────────┤│
│  │ "AI will replace most coding jobs   ││
│  │  within 5 years"             [✕]    ││
│  └─────────────────────────────────────┘│
│                                         │
│  💡 Tip: Controversial ideas surface    │
│  the most interesting conversations     │
│                                         │
│  [Create Event]                         │
│                                         │
└─────────────────────────────────────────┘

Screen 1.3: SHARE EVENT
┌─────────────────────────────────────────┐
│                                         │
│  ✓ Event Created!                       │
│                                         │
│  ┌─────────────────────────────────────┐│
│  │         [QR CODE]                   ││
│  │                                     ││
│  └─────────────────────────────────────┘│
│                                         │
│  Event Code                             │
│  ┌─────────────────────────────────────┐│
│  │     LISBON26          [Copy]        ││
│  └─────────────────────────────────────┘│
│                                         │
│  Share link:                            │
│  claritypledge.com/e/LISBON26           │
│                                   [Copy]│
│                                         │
│  [Share via...]  [Go to Event]          │
│                                         │
└─────────────────────────────────────────┘
```

### Flow 2: Event Registration (Participant)

```
Screen 2.1: EVENT PAGE (Public)
┌─────────────────────────────────────────┐
│  [C] Clarity                            │
│                                         │
│  Coworking Trip to Lisbon               │
│  Jan 20, 2026 · 2:00 PM                 │
│  Hosted by Slava                        │
│                                         │
│  ─────────────────────────────────────  │
│                                         │
│  This is a Clarity event.               │
│  We verify understanding, not just      │
│  exchange words.                        │
│                                         │
│  ─────────────────────────────────────  │
│                                         │
│  3 ideas to discuss · 0 participants    │
│                                         │
│  [Register for Event]                   │
│                                         │
│  Already registered? [Sign in]          │
│                                         │
└─────────────────────────────────────────┘

Screen 2.2: REGISTRATION (Creates Clarity account)
┌─────────────────────────────────────────┐
│  ← Back                                 │
│                                         │
│  Join: Coworking Trip to Lisbon         │
│                                         │
│  Your Name                              │
│  ┌─────────────────────────────────────┐│
│  │ Maria Santos                        ││
│  └─────────────────────────────────────┘│
│                                         │
│  Email                                  │
│  ┌─────────────────────────────────────┐│
│  │ maria@example.com                   ││
│  └─────────────────────────────────────┘│
│                                         │
│  ☑ I understand this is a Clarity      │
│    event where we verify understanding  │
│                                         │
│  [Register]                             │
│                                         │
│  By registering, you're also creating   │
│  a Clarity account to track your        │
│  verifications.                         │
│                                         │
└─────────────────────────────────────────┘
```

### Flow 3: Pre-Event (Optional Position Staking)

```
Screen 3.1: EVENT LOBBY (Before event starts)
┌─────────────────────────────────────────┐
│  [C]  Coworking Trip to Lisbon    [...]│
│  Jan 20 · 2:00 PM · 8 registered        │
│                                         │
│  ─────────────────────────────────────  │
│  Event starts in 2 days                 │
│  ─────────────────────────────────────  │
│                                         │
│  IDEAS TO DISCUSS                       │
│  Stake your positions before arriving   │
│                                         │
│  ┌─────────────────────────────────────┐│
│  │ "We should ship the MVP by Friday"  ││
│  │  ✓4  ✗2  ?2                         ││
│  │                                     ││
│  │  Your position: [Agree] [Disagree]  ││
│  │                 [Unsure] [Skip]     ││
│  └─────────────────────────────────────┘│
│                                         │
│  ┌─────────────────────────────────────┐│
│  │ "AI will replace most coding jobs   ││
│  │  within 5 years"                    ││
│  │  ✓1  ✗5  ?2                         ││
│  │                                     ││
│  │  Your position: [✓ Agreed]          ││
│  └─────────────────────────────────────┘│
│                                         │
│  [+ Add an idea]                        │
│                                         │
│  ─────────────────────────────────────  │
│  PARTICIPANTS (8)                       │
│  [avatars: 👤👤👤👤👤👤👤👤]            │
│  [See all →]                            │
│                                         │
└─────────────────────────────────────────┘
```

### Flow 4: Event Dashboard (During Event) — THE MAP

```
Screen 4.1: EVENT DASHBOARD
┌─────────────────────────────────────────┐
│  [C]  Coworking Lisbon        [Live 🔴]│
│  12 here · 7 ideas · 4 verified         │
├─────────────────────────────────────────┤
│  [Ideas]  [People]  [Map]               │
├─────────────────────────────────────────┤
│                                         │
│  IDEAS                                  │
│                                         │
│  ┌─────────────────────────────────────┐│
│  │ "We should ship the MVP by Friday"  ││
│  │  ✓5  ✗4  ?3  · 0 verifications      ││
│  │  ⚡ HIGH DISAGREEMENT — NO BRIDGES  ││
│  │                         [Verify →]  ││
│  └─────────────────────────────────────┘│
│                                         │
│  ┌─────────────────────────────────────┐│
│  │ "Remote work is more productive"    ││
│  │  ✓8  ✗2  ?2  · 2 verifications      ││
│  │  C Sarah ↔ Tom (8/10)               ││
│  │                         [Verify →]  ││
│  └─────────────────────────────────────┘│
│                                         │
│  ┌─────────────────────────────────────┐│
│  │ "AI will replace coding jobs"       ││
│  │  ✓3  ✗7  ?2  · 2 verifications      ││
│  │  ⚡ 1 gap bridged across disagreement││
│  │                         [Verify →]  ││
│  └─────────────────────────────────────┘│
│                                         │
│  [+ Add idea]                           │
│                                         │
├─────────────────────────────────────────┤
│  RECENT ACTIVITY                        │
│  · Maria ↔ James verified on "AI..."    │
│  · Tom staked position on "Remote..."   │
│  · New idea added by Sarah              │
│                                         │
├─────────────────────────────────────────┤
│  YOUR STATUS                            │
│  Positions: 5/7 · Verifications: 1      │
│  💡 You disagree with James on "MVP"    │
│                                         │
└─────────────────────────────────────────┘

Screen 4.2: PEOPLE TAB
┌─────────────────────────────────────────┐
│  [C]  Coworking Lisbon        [Live 🔴]│
│  12 here · 7 ideas · 4 verified         │
├─────────────────────────────────────────┤
│  [Ideas]  [People]  [Map]               │
├─────────────────────────────────────────┤
│                                         │
│  [All] [Disagree with me] [Not verified]│
│                                         │
│  ┌─────────────────────────────────────┐│
│  │ 👤 James Chen                       ││
│  │    Product Lead · 3 ideas           ││
│  │    ⚡ Disagrees with you on 2 ideas ││
│  │                      [View Profile] ││
│  └─────────────────────────────────────┘│
│                                         │
│  ┌─────────────────────────────────────┐│
│  │ 👤 Sarah Kim                        ││
│  │    Designer · 2 ideas               ││
│  │    ✓ Verified with you (1)          ││
│  │                      [View Profile] ││
│  └─────────────────────────────────────┘│
│                                         │
│  ┌─────────────────────────────────────┐│
│  │ 👤 Tom Wilson                       ││
│  │    Engineer · 1 idea                ││
│  │    No verifications yet             ││
│  │                      [View Profile] ││
│  └─────────────────────────────────────┘│
│                                         │
└─────────────────────────────────────────┘

Screen 4.3: MAP TAB (Topology)
┌─────────────────────────────────────────┐
│  [C]  Coworking Lisbon        [Live 🔴]│
│  12 here · 7 ideas · 4 verified         │
├─────────────────────────────────────────┤
│  [Ideas]  [People]  [Map]               │
├─────────────────────────────────────────┤
│                                         │
│  Filter: [All ideas ▾]                  │
│                                         │
│  ┌─────────────────────────────────────┐│
│  │                                     ││
│  │      👤────👤                       ││
│  │     /  \  /  \                      ││
│  │   👤    👤    👤                    ││
│  │    \   / \   /                      ││
│  │     👤───👤                         ││
│  │          \                          ││
│  │           👤  👤  👤 (unconnected)  ││
│  │                                     ││
│  └─────────────────────────────────────┘│
│                                         │
│  ━━ Verification (same position)        │
│  ━━ Cross-disagreement verification     │
│                                         │
│  Stats:                                 │
│  · 12 people · 4 verifications          │
│  · 2 cross-disagreement (⚡ valuable)   │
│  · 3 people not yet connected           │
│                                         │
└─────────────────────────────────────────┘
```

### Flow 5: Start Verification (From Dashboard)

```
Screen 5.1: IDEA DETAIL (Tap from dashboard)
┌─────────────────────────────────────────┐
│  ← Back                                 │
│                                         │
│  "We should ship the MVP by Friday"     │
│  Added by Slava                         │
│                                         │
│  ─────────────────────────────────────  │
│  POSITIONS                              │
│  ✓ Agree (5)  ✗ Disagree (4)  ? (3)    │
│                                         │
│  Your position: [✓ Agreed]              │
│  ─────────────────────────────────────  │
│                                         │
│  WHO DISAGREES WITH YOU?                │
│  ┌─────────────────────────────────────┐│
│  │ 👤 James · ✗ Disagreed              ││
│  │    No verification yet              ││
│  │              [Verify Understanding] ││
│  ├─────────────────────────────────────┤│
│  │ 👤 Maria · ✗ Disagreed              ││
│  │    No verification yet              ││
│  │              [Verify Understanding] ││
│  └─────────────────────────────────────┘│
│                                         │
│  ─────────────────────────────────────  │
│  CLARITY SESSIONS (0)                   │
│  No verifications yet on this idea.     │
│  Be the first to bridge a gap!          │
│                                         │
└─────────────────────────────────────────┘

Screen 5.2: START VERIFICATION
┌─────────────────────────────────────────┐
│  ← Back                                 │
│                                         │
│  Verify Understanding                   │
│                                         │
│  IDEA                                   │
│  "We should ship the MVP by Friday"     │
│                                         │
│  WITH                                   │
│  ┌─────────────────────────────────────┐│
│  │ 👤 James Chen                       ││
│  │    ✗ Disagreed (you ✓ Agreed)       ││
│  └─────────────────────────────────────┘│
│                                         │
│  ─────────────────────────────────────  │
│                                         │
│  You'll run a Clarity session to        │
│  verify you understand each other's     │
│  position — even though you disagree.   │
│                                         │
│  [Start Verification Session]           │
│                                         │
│  This will notify James to join.        │
│                                         │
└─────────────────────────────────────────┘
```

### Flow 6: Event Summary (Post-Event)

```
Screen 6.1: EVENT SUMMARY
┌─────────────────────────────────────────┐
│  [C]  Coworking Lisbon         [Ended] │
├─────────────────────────────────────────┤
│                                         │
│  Event Complete                         │
│                                         │
│  ┌─────────────────────────────────────┐│
│  │        UNDERSTANDING CREATED        ││
│  │                                     ││
│  │   12        7         8             ││
│  │ people   ideas   verifications      ││
│  │                                     ││
│  │           ⚡ 3                       ││
│  │   across disagreement               ││
│  │   (the valuable ones)               ││
│  └─────────────────────────────────────┘│
│                                         │
│  TOP BRIDGES                            │
│  ┌─────────────────────────────────────┐│
│  │ ⚡ Maria ↔ James                    ││
│  │    "AI will replace coding jobs"    ││
│  │    Rating: 9/10                     ││
│  ├─────────────────────────────────────┤│
│  │ ⚡ You ↔ Sarah                      ││
│  │    "Ship MVP by Friday"             ││
│  │    Rating: 8/10                     ││
│  └─────────────────────────────────────┘│
│                                         │
│  [View Full Topology]                   │
│                                         │
│  [Share Summary]  [Export PDF]          │
│                                         │
│  ─────────────────────────────────────  │
│  Continue these conversations on        │
│  Clarity → [Go to Feed]                 │
│                                         │
└─────────────────────────────────────────┘
```

---

## Data Model

### New Tables

```sql
-- Events container
events (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,        -- "LISBON26" - short shareable code
  name text not null,
  description text,
  organizer_id uuid references profiles(id),
  starts_at timestamp with time zone,
  ends_at timestamp with time zone,
  status text default 'upcoming',   -- 'upcoming' | 'live' | 'ended'
  created_at timestamp with time zone default now()
)

-- Event participants (many-to-many)
event_participants (
  id uuid primary key default gen_random_uuid(),
  event_id uuid references events(id) on delete cascade,
  user_id uuid references profiles(id) on delete cascade,
  joined_at timestamp with time zone default now(),
  unique(event_id, user_id)
)

-- Ideas (can exist globally or scoped to event)
ideas (
  id uuid primary key default gen_random_uuid(),
  event_id uuid references events(id) on delete cascade,  -- null = global idea
  text text not null,
  created_by uuid references profiles(id),
  created_at timestamp with time zone default now()
)

-- Positions on ideas
positions (
  id uuid primary key default gen_random_uuid(),
  idea_id uuid references ideas(id) on delete cascade,
  user_id uuid references profiles(id) on delete cascade,
  position text not null,           -- 'agree' | 'disagree' | 'unsure'
  created_at timestamp with time zone default now(),
  unique(idea_id, user_id)
)

-- Link verifications to ideas (extend existing clarity_sessions)
-- Add to clarity_sessions table:
--   idea_id uuid references ideas(id)
--   event_id uuid references events(id)
```

### Queries

```sql
-- Get event dashboard data
SELECT
  e.*,
  (SELECT count(*) FROM event_participants WHERE event_id = e.id) as participant_count,
  (SELECT count(*) FROM ideas WHERE event_id = e.id) as idea_count,
  (SELECT count(*) FROM clarity_sessions WHERE event_id = e.id AND status = 'completed') as verification_count
FROM events e
WHERE e.code = 'LISBON26';

-- Get ideas with position counts for event
SELECT
  i.*,
  count(*) filter (where p.position = 'agree') as agree_count,
  count(*) filter (where p.position = 'disagree') as disagree_count,
  count(*) filter (where p.position = 'unsure') as unsure_count,
  (SELECT count(*) FROM clarity_sessions WHERE idea_id = i.id) as verification_count
FROM ideas i
LEFT JOIN positions p ON p.idea_id = i.id
WHERE i.event_id = $event_id
GROUP BY i.id;

-- Get gap signal (high disagreement, low verification)
SELECT i.*,
  agree_count, disagree_count,
  LEAST(agree_count, disagree_count) as disagreement_score,
  verification_count
FROM ideas_with_counts i
WHERE i.event_id = $event_id
  AND LEAST(agree_count, disagree_count) >= 2  -- At least 2 on each side
  AND verification_count = 0                    -- No bridges yet
ORDER BY disagreement_score DESC;
```

---

## Reusable Components from Worktree 5

| Component | Location | Reuse Strategy |
|-----------|----------|----------------|
| `IdeaCard.tsx` | `/prototype/linkedin-like/components/` | Add event scope prop, use for dashboard |
| `PositionButton.tsx` | `/prototype/linkedin-like/components/shared/` | Reuse as-is |
| `FilterTabs.tsx` | `/prototype/linkedin-like/components/shared/` | Extend with "disagree with me" filter |
| `Topology.tsx` | `/prototype/linkedin-like/components/` | Add event scope prop |
| `IdeaDetail.tsx` | `/prototype/linkedin-like/components/` | Add "start verification" CTA |
| `RatingDots.tsx` | `/prototype/linkedin-like/components/shared/` | Reuse as-is |
| `VerifyButton.tsx` | `/prototype/linkedin-like/components/shared/` | Reuse as-is |
| `Feed.tsx` | `/prototype/linkedin-like/components/` | Scope to event for dashboard |

### New Components Needed

| Component | Purpose |
|-----------|---------|
| `EventCreation.tsx` | Create event flow (3 screens) |
| `EventPage.tsx` | Public event page + registration |
| `EventDashboard.tsx` | The "map" — tabs for Ideas/People/Map |
| `EventSummary.tsx` | Post-event proof export |
| `ActivityFeed.tsx` | Real-time "who did what" stream |
| `GapSignalBadge.tsx` | ⚡ "High disagreement, no bridges" indicator |
| `PersonalStatus.tsx` | "Your positions: 3/7, Verifications: 1" |

---

## MVP Event Flow (Manual Test Version)

Before building all UI, validate with manual facilitation:

**Setup (you do this):**
1. Create event in database manually
2. Share registration link
3. Pre-seed 3 ideas

**At Event (2 hours):**
1. **Hour 1:** Normal conversation
2. **Break (15 min):**
   - "Open the app, stake positions on the 3 ideas"
   - "Browse who disagrees with you"
   - "Find someone, tap 'Verify Understanding'"
3. **Hour 2:**
   - Run 2-3 verification sessions (pairs self-select)
   - You observe, note friction points
4. **End:**
   - Show topology on screen (you query database)
   - Celebrate cross-disagreement bridges
   - Ask: "Was this valuable?"

**Success Metrics:**
- >80% stake at least one position
- >50% run at least one verification
- >50% say "worth doing" in feedback

---

## Open Design Questions

1. **Event duration:** Time-bounded or open-ended?
   - Option A: Events have start/end, topology frozen at end
   - Option B: Events stay "live" until organizer closes

2. **Idea ownership:** Can anyone add ideas, or organizer-controlled?
   - Option A: Anyone can add (democratic, more ideas)
   - Option B: Organizer approves (quality control, focus)
   - **Recommendation:** Anyone can add during event, organizer seeds initial

3. **Verification pairing:** Self-select only, or also suggested?
   - MVP: Self-select (browse dashboard, pick someone)
   - Later: AI suggests "Talk to X about Y"

4. **Cross-event ideas:** Can ideas span multiple events?
   - MVP: Ideas scoped to event
   - Later: Global ideas that appear in multiple events

---

## Implementation Phases

### Phase 1: Data Model + Basic Event Flow
- [ ] Create database tables (events, event_participants, ideas, positions)
- [ ] Event creation API
- [ ] Event registration API
- [ ] Link ideas to events
- [ ] Link verifications to ideas

### Phase 2: Event Dashboard
- [ ] Event dashboard page (Ideas tab)
- [ ] Position staking UI (connected to backend)
- [ ] Gap signal display
- [ ] "Start verification" from idea

### Phase 3: Visibility Features
- [ ] People tab with filters
- [ ] Topology view (event-scoped)
- [ ] Activity feed
- [ ] Personal status widget

### Phase 4: Polish
- [ ] Event summary/export
- [ ] Real-time updates (Supabase realtime)
- [ ] Mobile optimization

---

## Success Criteria

| Metric | Target | What It Tests |
|--------|--------|---------------|
| Event creation completion | >90% | Is flow clear? |
| Position stake rate | >80% of attendees | Will they engage? |
| Verification start rate | >50% when positions differ | Will they verify? |
| "Worth it" positive rate | >50% | Does visibility matter? |
| Post-event platform return | >20% within 7 days | Does the container create sticky users? |

---

## Related Documents

- [P55: Understanding Verification Loop](./p55_Understanding%20Verification%20Loop.md) — The core mechanism
- [P56.1: Collective Sensemaking](./p56_1_collective_sensemaking_event.md) — **Evolved framing** — reframes event purpose
- [Theory of Change](../docs/visions/v0_theory-of-change.md)
- [Worktree 5 Prototype](../src/app/prototypes/linkedin-like/)

---

## Relationship to P56.1

**P56 describes the MECHANICS. P56.1 describes the PURPOSE.**

P56 is still valid as an implementation reference — the event flows, data model, and UI wireframes all apply. But P56 optimizes for verification counts ("12 verifications, 4 across disagreement"), while P56.1 optimizes for enriched ideas ("3 ideas now have multi-perspective understanding").

### What P56 Contributes (Still Valid)

| From P56 | Status |
|----------|--------|
| Event creation flow (3 screens) | ✓ Valid |
| Registration flow | ✓ Valid |
| Position staking UI | ✓ Valid |
| Gap signal (⚡ unbridged disagreements) | ✓ Valid |
| Verification session launcher | ✓ Valid |
| Data model (events, ideas, positions) | ✓ Valid |
| People tab with filters | ✓ Valid |

### What P56.1 Revises

| P56 Said | P56.1 Says | Why |
|----------|------------|-----|
| Success = verification count | Success = enriched ideas | Outcome > activity |
| Map shows who verified whom | Map shows what idea means across perspectives | Ideas are the artifact |
| Post-event: topology screenshot | Post-event: "What this group now knows" per idea | Collective artifact |
| Dashboard: activity feed | Dashboard: enriched idea cards | Idea-centric view |

### What P56.1 Adds to MVP

| New Feature | Purpose |
|-------------|---------|
| **AI post-verification synthesis** | Extract reasoning from transcripts |
| **Rating snapshots** | Capture delta between paraphrases |
| **"What you learned" display** | Show gap: "Before X, now Y" |
| **Enriched Idea Card** | Aggregate perspectives + bridges per idea |
| **"What this group now knows"** | AI-synthesized summary per idea |

### Implementation Strategy

Build P56 mechanics first, then layer P56.1 AI features:

1. **Phase 1:** Event + Ideas + Positions + Verification launcher (P56)
2. **Phase 2:** Transcript capture + rating snapshots (P55 + P56.1)
3. **Phase 3:** AI synthesis + enriched idea cards (P56.1)

---

## Changelog

| Date | Change |
|------|--------|
| 2026-01-12 | Initial spec created from Innovation Strategist session |
