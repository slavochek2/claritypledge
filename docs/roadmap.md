# Product Roadmap

Build sequence and priorities. What we're building and in what order.

**Status:** Active Planning
**Last Updated:** 2026-01-17
**North Star:** First open-space Clarity Event

> **Current Build Sequence (5 days):**
> 1. Events backend (worktree-4) — Days 1-2
> 2. /live connection from event — Days 2-3
> 3. Stories + Points in profile (mockup) — Days 3-4
> 4. Sifter (mockup + AI agent) — Days 4-5
> 5. Calibration banner — Day 5
>
> See [DECISIONS.md](../docs/DECISIONS.md) entry 2026-01-17 for rationale.

---

## The Vision (One Sentence)

A platform where people **sift** messy thoughts into protected **Stories** (for empathy) and sharpened **Points** (for truth), then **verify understanding** across disagreement.

---

## Core Concepts

### Stories vs Points

| Type | Nature | User Action | Verification |
|------|--------|-------------|--------------|
| **Story** | Lived experience, the "why" behind a position | Can only be understood | /live explain-back |
| **Point** | Logical claim, something debatable | Agree / Disagree / Unsure | Position staking |

**The relationship:**
```
POINT: "Remote work is more productive"
   ↑
   │ linked to (explains position)
   ↓
STORY: "I burned out commuting 2 hours daily"
   ↑
   │ leads to
   ↓
POSITION: "I AGREE with this Point"
```

**Key insight:** You don't verify Points (they're just claims). You verify understanding of the **Story behind someone's Position** on a Point.

### The User Flow (Integrated)

```
1. BRAIN DUMP
   User talks/types messy thoughts
        ↓
2. AI SIFTS
   Story (blue) vs Point (yellow)
        ↓
3. HARDENER
   AI sharpens Point into falsifiable claim
        ↓
4. MIRROR TEST
   AI plays back understanding, user confirms
        ↓
5. STAKE POSITION
   User agrees/disagrees on Points
        ↓
6. FIND DISAGREER
   See who has opposite position
        ↓
7. VERIFY STORY
   /live explain-back on their Story
        ↓
8. INFORMED DISAGREEMENT
   Still disagree, but understand WHY
```

---

## Current State

### What Exists (Production)

| Component | Location | State |
|-----------|----------|-------|
| `/live` verification | `clarity-live-page.tsx` | Production |
| Explain-back flow | `live-mode-view.tsx` | Production |
| Audio recording | `use-audio-recorder.ts` | Production |
| Transcript storage | Supabase | Production |

### What Exists (Prototype)

| Component | Location | State |
|-----------|----------|-------|
| Ideas feed | `converged/Feed.tsx` | Mock data |
| Position staking | `converged/IdeaCard.tsx` | Mock data |
| Engager list | `converged/EngagerList.tsx` | Mock data |

### What's Missing

| Component | Gap |
|-----------|-----|
| AI Sifter | No Story/Point separation |
| Hardener | No Point refinement |
| Points + Stories backend | No data model |
| Position staking backend | Prototype only |
| Quick-pair /live | Code/QR flow, not instant |
| Event container | No scoping mechanism |

---

## Build Phases

### Phase 0: AI Sifter MVP (P58)

**Goal:** Users can brain dump and get Stories/Points separated.

See [p58_sifter_mvp.md](./p58_sifter_mvp.md) for full spec.

```
□ Chat interface for brain dump
□ AI Sifter: detect Story vs Point
□ Hardener: make Points falsifiable
□ Mirror Test: AI plays back, user confirms
□ Store sifted content (stories + points tables)
```

**Why first:**
- Users arrive at events with pre-sifted, clear ideas
- Answers "why must I verify?" — your Story deserves understanding
- Personal value even without events

### Phase 1: Points + Positions Backend

**Goal:** Points can be shared, positions can be staked.

```
□ Points table (from sifted content or manual entry)
□ Positions table (agree/disagree/unsure per user per point)
□ Link Position to Story (why user holds this position)
□ API: createPoint(), stakePosition(), getPositions()
□ Port IdeaCard + PositionButtons from prototype
□ Basic points feed page
```

**Schema:**
```sql
-- Points table
points (
  id uuid primary key,
  event_id uuid,                    -- null = global
  text text not null,
  hardened_text text,               -- AI-refined version
  created_by uuid references profiles(id),
  created_at timestamp
)

-- Stories table
stories (
  id uuid primary key,
  user_id uuid references profiles(id),
  text text not null,
  created_at timestamp
)

-- Positions table
positions (
  id uuid primary key,
  point_id uuid references points(id),
  user_id uuid references profiles(id),
  position text,                    -- 'agree' | 'disagree' | 'unsure'
  story_id uuid references stories(id),  -- why they hold this position
  created_at timestamp,
  unique(point_id, user_id)
)

-- Link sessions to points
ALTER TABLE clarity_sessions ADD COLUMN point_id uuid references points(id);
```

### Phase 2: Event Container

**Goal:** Self-service event creation, scoped points.

```
□ Events table + API
□ Simple event creation (name + description)
□ Event registration (magic link → add to event)
□ Event feed (points scoped to event)
□ Attendee list with positions
□ "See my events" on profile
```

**Schema:**
```sql
events (
  id uuid primary key,
  name text not null,
  description text,
  created_by uuid references profiles(id),
  created_at timestamp
)

event_participants (
  event_id uuid references events(id),
  user_id uuid references profiles(id),
  joined_at timestamp,
  primary key (event_id, user_id)
)
```

### Phase 3: Quick-Pair /live

**Goal:** Instant verification from event context.

```
□ Modify /live: accept ?with=userId&point=pointId params
□ Skip code/QR flow when params present
□ Show Point context + both parties' Stories
□ Link session to point_id in DB
□ "Verify with [person]" button on attendee list
```

**Current vs Event flow:**
| Current /live | Event /live |
|---------------|-------------|
| Create session, get code | No code — partner known |
| Share QR, wait for join | Both in same room |
| Unknown partner | Picked from attendee list |

### Phase 4: AI Synthesis

**Goal:** Post-verification learning extraction.

```
□ Transcription (Whisper on recorded audio)
□ AI synthesis: "What you learned about their Story"
□ Show synthesis + thumbs up/down
□ Context Portal: "Catch Up" summary for newcomers
```

See [v7_context_portal_design.md](../docs/visions/v7_context_portal_design.md) for Context Portal spec.

### Phase 5: Polish + First Event

**Goal:** Run a real event.

```
□ "Who disagrees with me" filter
□ Gap signal (⚡ unbridged disagreements)
□ Seed 3-5 points for test event
□ End-to-end test
□ Run event, collect feedback
```

---

## V2+ Roadmap (Post-Event)

| Feature | Trigger | Description |
|---------|---------|-------------|
| **Definition branching** | Users disagree on word meaning | Create branches: "If X means A... If X means B..." |
| **Enriched Point cards** | Verification data accumulates | Show linked Stories, verification count |
| **Real-time updates** | Event friction | Supabase Realtime for live position changes |
| **Point ownership model** | Points spread beyond creator | "Points belong to nobody" (World 3) |
| **Story privacy controls** | Platform goes public | Granular sharing (event-only, public, private) |

---

## Hypotheses to Test

### H1: Will People Use the Sifter?

**Test:** Offer brain dump chat. Count completions.
**Success:** >50% complete at least one sift.
**Measures:** Sifter starts vs completions.

### H2: Will People Stake Positions?

**Test:** Show points at event. Count stakes.
**Success:** >80% stake on at least 1 point.
**Measures:** Query positions table.

### H3: Will People Self-Select for Verification?

**Test:** Show who disagrees. Let them pair.
**Success:** >50% do at least 1 verification.
**Measures:** Query clarity_sessions with point_id.

### H4: Does Verification Feel Valuable?

**Test:** Post-verification survey.
**Success:** >60% say "worth it."
**Measures:** In-app thumbs up/down.

### H5: Does AI Synthesis Add Value?

**Test:** Show "What you learned" after session.
**Success:** >50% say accurate/useful.
**Measures:** Thumbs up/down on synthesis.

---

## Success Criteria: First Event

| Metric | Target | Why |
|--------|--------|-----|
| Sifter completion | >50% | Will they use it? |
| Position stake rate | >80% | Engagement baseline |
| Verification rate | >50% | Core loop works? |
| "Worth it" rating | >60% | Feels valuable? |
| Friction notes | <5 blockers | What needs fixing? |

---

## Open Questions

### Q1: Should positions require Story acknowledgment?

v5.1 suggests: "Can't disagree until you acknowledge their Story."

**Current decision:** No — stake first, verify later. Lower friction.

**Revisit if:** Positions feel uninformed, verifications are shallow.

### Q2: How do Stories link to multiple Points?

One Story might explain positions on multiple Points.

**For MVP:** One Story → One Position → One Point.
**For V2:** Many-to-many relationships.

### Q3: When do Stories need privacy controls?

| Context | Privacy Level |
|---------|---------------|
| In-person event | Implicit (same room) |
| Async platform | Needs controls |
| Public feed | Stories opt-in |

**For MVP:** Stories shared only in verification sessions.

---

## Related Documents

- [p58_sifter_mvp.md](./p58_sifter_mvp.md) — AI Sifter + Hardener spec
- [v0_theory-of-change.md](../docs/visions/v0_theory-of-change.md) — Philosophy
- [v5_sensemaking_vision.md](../docs/visions/v5_1_sensemaking_platform_synthesis.md) — Story/Point framework
- [v7_context_portal_design.md](../docs/visions/v7_context_portal_design.md) — Catch-up feature
- [P55: Understanding Verification Loop](./p55_Understanding%20Verification%20Loop.md) — Core mechanism
- [P56: Event as Clarity Container](./p56_event_as_clarity_container.md) — Event mechanics

---

## Changelog

| Date | Change |
|------|--------|
| 2026-01-14 | Refactored from p57, integrated v6 Story/Point model, added Sifter as Phase 0 |
| 2026-01-13 | Original p57 created |
