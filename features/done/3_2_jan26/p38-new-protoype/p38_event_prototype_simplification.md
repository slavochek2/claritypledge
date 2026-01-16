# P38: Event-Based Prototype Simplification

**Status:** Draft
**Priority:** High
**Risk Level:** High (validates H2: visibility changes group behavior)
**Target:** Clarity Practice Community events (real-world facilitation)

---

## Problem Statement

Current `/prototype/converged/feed` prototype:
- Not scoped to event context (no participants, no organizer role)
- Cluttered UX (stories, search, visual noise distracts from core function)
- Desktop layout "super ugly", mobile not optimized
- No clear path from "see idea" → "verify understanding with partner"
- Missing organizer tools to prep event ahead of time

**Core Issue:** Can't run real Clarity Practice Community events with current prototype.

---

## Success Criteria (4 weeks)

**Outcome:** Multiple events run successfully, participants become organizers themselves

**Validation:**
1. Organizer can prep event (seed ideas, manage participants) in < 5 minutes
2. Participant understands "what's happening" on mobile in < 30 seconds
3. Pairs can form and launch /live without facilitator intervention
4. Post-event topology shows verified understanding across disagreement

**Aligns with Theory of Change:** Tests H2 (visibility changes group behavior) via real-world events

---

## User Stories

### As an Event Organizer

**Before Event:**
- I need to create an event and seed initial ideas so participants have something to discuss
- I need to invite participants so only registered people can join
- I need to preview the event view so I know what participants will see

**During Event:**
- I need to see who's currently active so I can facilitate effectively
- I need to see which pairs are verifying which ideas so I can track progress
- I need to add new ideas on-the-fly as discussions emerge

**After Event:**
- I need to see verification topology (who verified whom on what) so I can show evidence of common knowledge creation
- I need a shareable event summary so participants can share their participation

### As an Event Participant

**Joining:**
- I need to join event with simple code/link so I don't need account setup friction
- I need to see other participants immediately so I know who's here

**Exploring Ideas:**
- I need to see all ideas in this event so I know what's being discussed
- I need to mark my position (agree/disagree/unsure) so others can see where I stand
- I need to see who agrees/disagrees with me so I can find verification partners

**Pairing for Verification:**
- I need to select an idea + partner so we can verify understanding
- I need to launch /live with context (this idea, these two people) so we know what we're verifying
- I need mobile-friendly UI so I can participate from my phone

**After Verification:**
- I need to see my verification record so I have proof of understanding
- I need to return to ideas board so I can verify more ideas

---

## Solution: Event-Scoped Prototype

### Core Concept

**Event = Container for:**
- Participants (registered, named people)
- Ideas (seeded by organizer + added by participants)
- Verifications (who verified whom on which ideas)

**Flow:**
```
Organizer creates event + seeds ideas
    ↓
Participants join, mark positions on ideas
    ↓
Pairs self-select (idea + partner)
    ↓
Launch /live with idea context
    ↓
Verification recorded in event topology
    ↓
Repeat until common knowledge emerges
```

---

## Design Principles

### Visual: "Wireframe Simple"
- Grayscale + blue accent only
- No gradients, shadows, or decoration
- Function > polish (we're testing behavior, not selling design)
- Mobile-first (most events = phones out)

### Layout
- **Mobile:** Single column, thumb-zone controls, portrait-optimized
- **Desktop:** 2-column max, proper containers (not narrow centered ugliness)

### Inspiration Sources
- **Luma:** Event registration, participant management
- **Telegram:** Poll UI, participant chips, clean bubbles
- **Twitter Spaces:** Live participant list with roles
- **LinkedIn Events:** Simple attendee grid, RSVP states

---

## Implementation Phases

### Phase 0: Simplify Existing (< 1 day)

**Goal:** Strip `/prototype/converged/feed` to bare bones

**DELETE:**
- Stories section (entire component)
- Search functionality
- Any non-essential visual decoration
- Complex filtering/sorting UI

**SIMPLIFY:**
- Ideas = simple cards (title, description, position buttons only)
- Layout = responsive (mobile single-col, desktop 2-col max)
- Colors = grayscale + blue accent only
- Typography = reduce font size/weight variations

**FIX:**
- Desktop: proper max-width container + padding
- Mobile: thumb-zone controls, proper touch targets (min 44px)

**Acceptance Criteria:**
- Screenshot shows clean, minimal UI
- Mobile view fits content without horizontal scroll
- Desktop view not "super ugly" (proper spacing, readable width)
- All existing functionality still works (ideas render, can click)

---

### Phase 1: Event Context (1 day)

**Goal:** Add event container with dummy data

**BUILD:**
- Event model (dummy data in code, no DB yet):
  ```typescript
  interface Event {
    id: string;
    title: string;
    organizerName: string;
    participants: Participant[];
    ideas: Idea[];
    startTime: Date;
  }

  interface Participant {
    id: string;
    name: string;
    avatarColor: string;
  }

  interface Idea {
    id: string;
    title: string;
    description: string;
    authorId: string;
    positions: Record<string, 'agree' | 'disagree' | 'unsure'>;
  }
  ```

- Event header component:
  - Event title
  - Organizer name
  - Participant chips (avatars + names, scrollable horizontal)
  - "X people here" count

- Hardcoded dummy data:
  - 1 event: "Clarity Practice Session #1"
  - 5-7 fake participants (diverse names)
  - 3-5 sample ideas (from Theory of Change concepts)

**Acceptance Criteria:**
- Event header visible at top of feed
- Participant chips clickable (even if just console.log for now)
- Ideas show in context of "this event"
- Mobile: participant chips scroll horizontally without breaking layout

---

### Phase 2: Ideas Board Redesign (2 days)

**Goal:** Event-scoped ideas with position marking + partner selection

**BUILD:**

**Ideas Card Redesign:**
- Simple card layout:
  ```
  ┌─────────────────────────────────┐
  │ [Idea Title]                    │
  │ Brief description...            │
  │                                 │
  │ [Agree] [Disagree] [Unsure]     │
  │                                 │
  │ Who marked what:                │
  │ Agree: Alice, Bob               │
  │ Disagree: Carol                 │
  │ Unsure: Dave                    │
  │                                 │
  │ [Verify Understanding] button   │
  └─────────────────────────────────┘
  ```

- Position buttons:
  - Mark current user's position
  - Show visual state (selected/unselected)
  - Update "who marked what" list immediately

- "Verify Understanding" button:
  - Opens partner selection modal
  - Shows participants grouped by position
  - Select partner → launches /live

**Partner Selection Modal:**
- "Who do you want to verify understanding with?"
- Participant list (filterable by position?)
- Shows their position on this idea
- "Start verification" button

**Profile Modal (KISS version):**
- Click participant chip → simple modal:
  - Name, role (if any)
  - Events attended (just count for now)
  - Ideas verified (count)
  - "Close" button

**Acceptance Criteria:**
- Can mark position on idea (visual feedback immediate)
- "Who marked what" list updates correctly
- Click "Verify Understanding" → see partner selection
- Select partner → console.log (will wire to /live in Phase 3)
- Click participant → see simple profile modal
- All interactions work on mobile (no tiny tap targets)

---

### Phase 3: Connect to /live (1 day)

**Goal:** Wire pair formation → /live with idea context

**BUILD:**

**Update /live route:**
- Accept query params: `?eventId=xxx&ideaId=yyy&partnerId=zzz`
- Show idea context at top:
  ```
  ┌─────────────────────────────────┐
  │ Verifying: [Idea Title]         │
  │ With: [Partner Name]            │
  └─────────────────────────────────┘
  │ [Existing /live UI below]       │
  ```

**Wire partner selection:**
- "Start verification" button → navigate to:
  `/prototype/live?eventId={event}&ideaId={idea}&partnerId={partner}`

**Post-verification return:**
- After /live completes → return to event feed
- Show success message: "Verification recorded!"
- Update idea card (show verification happened)

**Acceptance Criteria:**
- Partner selection → /live launches with correct context
- Idea title visible at top of /live page
- After verification, returns to event feed
- Verification recorded (even if just in-memory state for now)

---

### Phase 4: Post-Event Topology (2 days, DEFERRED)

**Goal:** Visualize "who verified whom on what"

**Note:** This can be done manually with whiteboard initially. Only build UI after validating H2 manually at real events.

**Future BUILD:**
- Event summary page
- Network graph (nodes = people, edges = verifications)
- Highlight cross-disagreement (verified understanding across opposing positions)
- Shareable link

---

## Data Model (Dummy → Real Migration Path)

### Phase 1-3: Dummy Data (hardcoded objects)
- No database changes
- All state in React component state
- Fast iteration, no migration friction

### Phase 4+: Real Database (when validated)
```sql
-- events table
CREATE TABLE events (
  id uuid PRIMARY KEY,
  title text NOT NULL,
  organizer_id uuid REFERENCES profiles(id),
  start_time timestamptz,
  created_at timestamptz DEFAULT now()
);

-- event_participants table
CREATE TABLE event_participants (
  event_id uuid REFERENCES events(id),
  participant_id uuid REFERENCES profiles(id),
  joined_at timestamptz DEFAULT now(),
  PRIMARY KEY (event_id, participant_id)
);

-- ideas table (add event_id)
ALTER TABLE ideas
  ADD COLUMN event_id uuid REFERENCES events(id);

-- idea_positions table
CREATE TABLE idea_positions (
  idea_id uuid REFERENCES ideas(id),
  participant_id uuid REFERENCES profiles(id),
  position text CHECK (position IN ('agree', 'disagree', 'unsure')),
  marked_at timestamptz DEFAULT now(),
  PRIMARY KEY (idea_id, participant_id)
);

-- verifications table
CREATE TABLE verifications (
  id uuid PRIMARY KEY,
  event_id uuid REFERENCES events(id),
  idea_id uuid REFERENCES ideas(id),
  speaker_id uuid REFERENCES profiles(id),
  listener_id uuid REFERENCES profiles(id),
  speaker_rating int,
  listener_rating int,
  certified boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);
```

---

## Technical Decisions

### Why Refactor in Place?
- **Faster:** No route duplication
- **Real URLs:** Participants need stable links for events
- **/loop friendly:** Atomic commits easier on single route
- **Low risk:** Git + feature flags protect us

### Why Dummy Data First?
- **Speed:** No database migrations slow us down
- **Flexibility:** Change structure easily based on learnings
- **Focus:** UX validation, not backend engineering

### Why Phase 4 Deferred?
- **Manual first:** Whiteboard topology validates H2 faster than building UI
- **Learn first:** Real events will tell us what visualization is actually needed
- **Build last:** Only invest in UI after proving behavior change happens

---

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Breaking existing prototype | Commit before changes, feature flag pattern if needed |
| Mobile layout breaks on real devices | Use Playwright MCP to test on mobile viewport, ask Slava to test on phone |
| Dummy data doesn't match real needs | Keep data structure simple, easy to refactor |
| Pairs can't form without facilitator | Build explicit "waiting for partner" state, fallback to manual pairing |
| /live context gets lost | Pass all IDs via URL params, show context at top of page |

---

## Success Metrics

**Leading Indicators (per event):**
- % of participants who mark positions on ideas
- Number of pairs formed without organizer intervention
- % of /live sessions that complete certification

**Lagging Indicators (4 weeks):**
- Number of events run
- Number of unique participants across events
- Number of participants who become organizers (viral loop)

**H2 Validation:**
- Do participants change behavior when topology is visible?
- Do "verified understanders" who disagree gain status?
- Do participants request more events?

---

## Out of Scope (Explicitly Deferred)

- Observer mode (nice-to-have, not critical for H2)
- Custom AI model training (existing models work)
- Public feed / network topology beyond single event
- Real-time sync (can be manual "refresh" initially)
- Advanced facilitation tools (breakout rooms, timers, etc.)

---

## Related Documents

- [Theory of Change](../docs/visions/v0_theory-of-change.md) — Why this matters, H2 validation
- [Facilitation Ladder](../docs/visions/v0_theory-of-change.md#61-the-facilitation-ladder) — Stage-by-stage scaling model
- [CLAUDE.md](../CLAUDE.md) — Project context, tech stack

---

## Open Questions

1. **Event joining:** Magic link per event? Or login + event code?
2. **Participant identity:** Real profiles or just "name + color" for events?
3. **Idea authorship:** Does it matter who created idea, or just who holds what position?
4. **Verification persistence:** Store in DB immediately, or batch after event?

**Decision:** Start with simplest (name + color, no auth friction) and add complexity only if events fail without it.

---

## Next Steps

1. **Slava approves this spec** ✅ (you're reading it now)
2. **PM hands off to Architect** → Create tech-spec for Phase 0-3
3. **Architect hands off to Dev** → Implement with /loop
4. **TEA validates** → Visual checks via Playwright MCP
5. **Slava tests at real event** → Gather feedback, iterate

---

**Created:** 2025-01-06
**Author:** PM Agent (John)
**For:** Clarity Practice Community event facilitation
