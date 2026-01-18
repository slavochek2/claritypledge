# P57: Roadmap to First Clarity Event

**Status:** Active Planning
**Created:** 2026-01-13
**Milestone:** First open-space event using the app

---

## Current State Assessment

### What Exists

| Component | Location | State | Backend? |
|-----------|----------|-------|----------|
| `/live` page | `clarity-live-page.tsx` | Production | Yes (Supabase sessions) |
| Explain-back flow | `live-mode-view.tsx` | Production | Yes |
| Audio recording | `use-audio-recorder.ts` | Production | Yes (uploads to Supabase) |
| Prototype UI: Ideas feed | `converged/Feed.tsx` | Mock | No (mock data) |
| Prototype UI: Position staking | `converged/IdeaCard.tsx` | Mock | No (mock data) |
| Prototype UI: Verification session | `converged/LiveSession.tsx` | Mock | No (mock data) |
| Prototype UI: Clarity Sessions panel | `converged/IdeaDetail.tsx` | Mock | No (mock data) |
| Event container | - | Not built | - |
| AI synthesis | - | Concept only | - |

### The Gap

```
PRODUCTION (/live)           PROTOTYPE (/prototype)         CONCEPTS
───────────────────         ─────────────────────          ──────────
✓ Join session by code      ✓ Ideas feed                   ? AI extraction
✓ Explain-back flow         ✓ Position staking             ? Enriched ideas
✓ Rating 0-10               ✓ Verification UI              ? "What you learned"
✓ Audio recording           ✓ Clarity Sessions panel       ? Event container
✓ Transcript storage        ✓ Gap signal (⚡)              ? AI summaries
                            ✗ NOT connected to backend
```

**The production `/live` has no concept of "ideas" or "positions."**
**The prototype has ideas/positions but no real backend.**

---

## First Event Requirements

### The Scenario: Open-Space Clarity Event

- **Format:** Open-space style, 10-20 people
- **Duration:** 2-3 hours
- **Activities:** Position staking, self-organized verification pairs
- **Outcome:** Enriched ideas, proof of understanding created

### Must-Have for Event

| Requirement | What It Needs | Priority |
|-------------|---------------|----------|
| **Ideas visible to all** | Shared idea list, not private | P0 |
| **Position staking** | Agree/Disagree/Unsure per idea | P0 |
| **Who disagrees with me** | See people with opposite positions | P0 |
| **Start verification** | Launch /live with specific person | P0 |
| **Link verification to idea** | Session knows which idea it's about | P0 |
| **Recording + transcript** | Already exists in /live | ✓ Done |

### Nice-to-Have for Event

| Requirement | Value | Priority |
|-------------|-------|----------|
| Event container | Scope ideas to event, registration flow | P1 |
| Gap signal (⚡) | Show unbridged disagreements | P1 |
| Verification count per idea | See who's verified on this idea | P1 |
| Real-time updates | See new positions/verifications live | P2 |
| AI synthesis | Post-verification "what you learned" | P2+ |

### Can Skip for First Event

| Feature | Why Skip |
|---------|----------|
| Post-event summary page | Query DB manually, show on projector |
| Real-time updates | Refresh works, add Supabase Realtime later |
| Accumulated idea insights | V2 — single-session synthesis is enough for test |
| Pre-event lobby | Go straight to feed after registration |

### Revised: Build Simple Event UI

**Original plan:** Skip event creation UI, manually INSERT into DB.

**Revised:** Build minimal event UI. Rationale:
- AI synthesis is already Week 3 effort — not saving much by skipping
- Registration needs to add user to event anyway
- "See my events" is needed for return visits
- Reusable for future events
- Professional, not hacky

**Minimal Event UI (not full P56):**

| Screen | What It Does | Complexity |
|--------|--------------|------------|
| Create Event | Name + description + create button | Simple form |
| Event Link | Share URL (no QR needed) | Just copy link |
| Event Feed | Ideas for this event + attendees | Port from prototype |

**Skip for V1:**
- Multi-screen creation wizard
- QR code generation
- Pre-event lobby
- Event dashboard tabs (just feed)

---

## Prototype Components to Port

Analysis of `src/app/prototypes/converged/` reveals a complete UI layer ready for backend connection:

### Direct Port (Use As-Is)

| Component | What It Does | Port To |
|-----------|--------------|---------|
| `PositionButtons.tsx` | Agree/Disagree/Unsure voting | `src/components/ui/` |
| `IdeaCard.tsx` | Display idea with position counts | `src/app/components/ideas/` |
| `IdeaDetail.tsx` | Full idea view, engagers, "Verify" button | `src/app/pages/idea-detail.tsx` |
| `EngagerList.tsx` | List people with positions + verify action | `src/app/components/ideas/` |
| `Feed.tsx` | Ideas list with filters | `src/app/pages/event-feed.tsx` |
| `Profile.tsx` | User profile with engagements | Adapt for attendee view |
| Mock data types | User, Idea, Engagement, Position | `src/app/types/` |

### Adapt for Event

| Component | Adaptation Needed |
|-----------|-------------------|
| `StoriesRow.tsx` | Show event attendees with activity badges |
| `LiveSession.tsx` | Connect to production /live audio, add ideaId |
| Config routes | Point to event-scoped pages |

### Key Data Structures from Prototype

```typescript
// From mock-data.ts — match to Supabase tables
interface Engagement {
  ideaId: string;
  userId: string;
  position: 'agree' | 'disagree' | 'unsure' | null;
  isVerified: boolean;
  verifiedWith?: string;  // partner userId
  isCrossDisagreement: boolean;
}

interface VerificationSession {
  id: string;
  participants: [string, string];
  ideaId: string;
  verifiedBy: string[];  // who confirmed understanding
  ratings: { [userId: string]: number };  // 0-10
}
```

### The Quick-Pair Flow (KISS — Different from Current /live)

**Current /live is wrong for events.** It's designed for remote/async pairing:
```
Create session → Get code → Share QR → Partner joins → Wait → Start
```

**Event needs instant in-person pairing:**
```
Tap "Verify with Maria" → Both logged in → Start immediately
```

**Key differences:**

| Current /live | Event /live |
|---------------|-------------|
| Create session, get code | No code — partner already known |
| Share QR, wait for join | Both in same room, logged in |
| Unknown partner | Picked from attendee list |
| Session creation ceremony | Instant start |

**Implementation options:**

| Option | Effort | Description |
|--------|--------|-------------|
| **A: Modify /live** | Medium | Add `?with=userId&idea=ideaId` params, skip code flow |
| **B: New /live-event route** | Medium | Separate flow for event pairing |
| **C: Port prototype LiveSession** | Low | Use prototype's simpler flow, connect to real audio |

**Recommendation:** Option A — modify existing `/live` to accept params:
- `?with=userId` → Skip partner selection, auto-invite
- `?idea=ideaId` → Show idea context, link session to idea
- `?event=eventId` → Scope to event (for later)

When both params present, show: "Start verification with Maria on [idea text]" → [Start]

Prototype's `LiveSession` phases for reference:
1. select-partner → **Skip if `with` param**
2. select-role → Speaker vs Listener
3. speaking → Recording with timer
4. playback → Transition
5. rating → Confidence + Accuracy (0-10)
6. result → Success or "Try Again" + AI synthesis

---

## Implementation Path

### Phase 1: Minimal Viable Event (Target: Week of Event)

**Goal:** Enough to run a facilitated event. Organizer does manual work.

#### 1.1 Ideas + Positions Backend

Create database tables and API:

```sql
-- Ideas table
ideas (
  id uuid primary key,
  event_id uuid,          -- null for now (global), add events later
  text text not null,
  created_by uuid references profiles(id),
  created_at timestamp
)

-- Positions table
positions (
  id uuid primary key,
  idea_id uuid references ideas(id),
  user_id uuid references profiles(id),
  position text,          -- 'agree' | 'disagree' | 'unsure'
  created_at timestamp,
  unique(idea_id, user_id)
)

-- Link sessions to ideas (add to clarity_sessions)
ALTER TABLE clarity_sessions ADD COLUMN idea_id uuid references ideas(id);
```

#### 1.2 Ideas Feed (Production)

Port `converged/Feed.tsx` to production with real backend:

- [ ] `src/app/pages/ideas-page.tsx` — List ideas with position counts
- [ ] `src/app/data/api.ts` — Add `getIdeas()`, `stakePosition()`, `getPositions()`
- [ ] Position buttons wired to backend
- [ ] "Who disagrees" filter

#### 1.3 Connect /live to Ideas

When starting verification from idea:
- [ ] Pass `ideaId` to /live session
- [ ] Store in `clarity_sessions.idea_id`
- [ ] Show idea text in session UI

#### 1.4 Verification per Idea

On IdeaDetail page:
- [ ] Show list of people with positions
- [ ] "Verify with [person]" button launches /live
- [ ] After verification, show in "Clarity Sessions" panel

### Phase 2: Event Container (V1)

**Goal:** Self-service event creation, registration, dashboard.

- [ ] Events table + API
- [ ] Event creation UI (P56 Flow 1)
- [ ] Event page + registration (P56 Flow 2)
- [ ] Event dashboard (P56 Flow 4)
- [ ] Ideas scoped to event
- [ ] Participant list

### Phase 3: AI Synthesis (V2)

**Goal:** Ideas learn from verifications.

- [ ] Rating snapshots (store intermediate ratings)
- [ ] Transcript storage per session
- [ ] Post-verification AI synthesis: "What you learned"
- [ ] Enriched Idea Card (P56.1 wireframe)
- [ ] "What this group now knows" summary

---

## Hypotheses to Test at First Event

### H1: Will People Stake Positions?

**Test:** Present 3-5 ideas at event start. Count how many people stake.
**Success:** >80% stake on at least 1 idea.
**How to measure:** Query `positions` table after event.

### H2: Will People Self-Select for Verification?

**Test:** Show who disagrees, let them pair up.
**Success:** >50% of attendees do at least 1 verification.
**How to measure:** Query `clarity_sessions` with `idea_id` set.

### H3: Does Seeing Disagreement Create Curiosity?

**Observe:** Do people seek out disagreers, or avoid them?
**Signal:** Quality of conversations, post-event feedback.
**How to measure:** Qualitative observation + exit survey.

### H4: Does Verification Feel Valuable?

**Test:** Post-verification quick survey: "Was this worth doing?"
**Success:** >60% say yes.
**How to measure:** In-app survey after session ends.

### H5: Does AI Synthesis Add Value? (NEW — P56.1 test)

**Test:** Show "Here's what you learned about their view" after session.
**Success:** >50% say synthesis was accurate/useful.
**How to measure:** Thumbs up/down on synthesis + qualitative feedback.

**Why this matters:** If synthesis feels useful, build toward enriched ideas. If not, reconsider AI approach.

### H6: Does Multi-Perspective Visibility Change Dynamics?

**Observe:** After verifications complete, do positions shift? Does group feel different?
**Measurement:** Before/after survey on "felt understanding."
**How to measure:** Pre-event baseline + post-event survey.

---

## Prioritized Build Order

```
WEEK 1: Ideas + Positions Backend
───────────────────────────────────────────────────────
□ Create ideas + positions tables (SQL in P56)
□ Add ideas API (create, list, position staking)
□ Port IdeaCard + PositionButtons from prototype
□ Basic ideas page (can stake, see counts)

WEEK 2: Event Container + Registration
───────────────────────────────────────────────────────
□ Events + event_participants tables
□ Simple event creation page (name + description + create)
□ Event registration page (magic link → add to event)
□ Event feed page (ideas scoped to event)
□ Attendee list (port EngagerList)
□ "See my events" on profile/home

WEEK 3: Quick-Pair /live + AI Synthesis
───────────────────────────────────────────────────────
□ Modify /live: accept ?with=userId&idea=ideaId params
□ Skip code/QR flow when params present
□ Show idea context in session
□ Link session to idea_id in DB
□ Transcription (Whisper API on recorded audio)
□ AI synthesis: "What you learned about their view"
□ Show synthesis + thumbs up/down after session

WEEK 4: Polish + Testing
───────────────────────────────────────────────────────
□ "Who disagrees with me" filter on attendee list
□ Gap signal (⚡ unbridged disagreements)
□ Seed 3-5 ideas for test event
□ End-to-end test with real users
□ Fix friction points

EVENT: Run First Event
───────────────────────────────────────────────────────
□ Observe: position staking, self-pairing, verification
□ Observe: AI synthesis reactions
□ Collect feedback (exit survey)
□ Note blockers and friction

POST-EVENT: Decide V2 Priorities
───────────────────────────────────────────────────────
□ Enriched idea cards (accumulated learnings)?
□ Real-time updates (Supabase Realtime)?
□ Multi-screen event creation wizard?
□ Post-event summary page?
```

---

## Success Criteria for First Event

| Metric | Target | Why It Matters |
|--------|--------|----------------|
| Position stake rate | >80% | Engagement baseline |
| Verification rate | >50% | Will they do the core loop? |
| "Worth it" rating | >60% | Does it feel valuable? |
| Friction notes | <5 blockers | What needs fixing? |
| Return to platform | Any within 7 days | Sticky beyond event? |

---

## Open Decisions for First Event

### D1: Auth for Event Participants ✓ DECIDED

**Decision:** Magic link registration (existing auth).

**Why:**
- Registration for event = registration for platform
- Everyone gets a persistent profile
- Reusable for future events
- Already built — zero new code

**Flow:**
1. Share event link → Registration page
2. Enter name + email → Magic link sent
3. Click link → Logged in, added to event
4. See event feed, stake positions

### D2: Ideas Pre-Seeded vs. Participant-Added ✓ DECIDED

**Decision:** Organizer seeds 3-5, participants can add during event.

| Seeded Ideas | Purpose |
|--------------|---------|
| 2-3 "safe" ideas | Get everyone staking, low friction |
| 1-2 "spicy" ideas | Generate disagreement, drive verification |

Participants can add more via CreateIdea (port from prototype).

### D3: Real-Time Updates ✓ DECIDED

**Decision:** No real-time for V1. Refresh works.

Supabase Realtime is nice-to-have but adds complexity. For in-person event, verbal "refresh to see updates" works fine.

### D4: AI Synthesis — Include or Defer? ✓ DECIDED

**Decision:** Include basic AI synthesis for V1.

**Why:**
- Audio already recorded → Transcription is one API call (Whisper)
- Simple prompt → Claude extracts "what they learned"
- Tests key P56.1 hypothesis: Does seeing learning feel different?

**MVP AI Flow:**
```
SESSION ENDS
    ↓
Audio → Whisper → Transcript
    ↓
Transcript + Idea → Claude → "What A learned about B's view"
    ↓
Show to both: "Here's what you discovered"
```

**What we defer:**
- Accumulated insights per idea (V2)
- "What this group now knows" summary (V2)
- Rating snapshots / delta visualization (V2)

---

## Related Documents

- [P55: Understanding Verification Loop](./p55_Understanding%20Verification%20Loop.md) — The core mechanism
- [P56: Event as Clarity Container](./p56_event_as_clarity_container.md) — Event mechanics and wireframes
- [P56.1: Collective Sensemaking](./p56_1_collective_sensemaking_event.md) — The "why" and AI synthesis

---

## Changelog

| Date | Change |
|------|--------|
| 2026-01-14 | Renamed to ROADMAP_v0.md — preserved as original event-focused roadmap |
| 2026-01-13 | Created roadmap from strategy session |
