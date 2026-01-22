# Product Roadmap

Build sequence and priorities. What we're building and in what order.

**Status:** Active Planning
**Last Updated:** 2026-01-20
**North Star:** First 30-person Clarity Event (H2 validation)

> **Current Focus:** P60 Exploration UX → Manual seed → H2 test event
>
> **What's done:** Events backend, /live verification
> **What's next:** P60 (Story/Point navigation UI) — mockup/frontend only
> **Then:** Manually seed Stories/Points → Run 30-person event → Validate H2
> **After H2:** Sifter (P58) automates seeding

---

## The Vision (One Sentence)

A platform where people **sift** messy thoughts into protected **Stories** (for empathy) and sharpened **Points** (for truth), then **verify understanding** across disagreement.

---

## Core Concepts

### Stories vs Points

| Type | Nature | User Action | Verification |
|------|--------|-------------|--------------|
| **Story** | Lived experience, the "why" behind a position | Can only be understood | /live explain-back (≥8/10 = verified) |
| **Point** | Logical claim, something debatable | Position on -3 to +3 scale | Position staking |

**Position Scale (7-point Likert):**
| Score | Meaning |
|-------|---------|
| -3 | Strongly disagree |
| -2 | Disagree |
| -1 | Slightly disagree |
| 0 | Unsure / No opinion |
| +1 | Slightly agree |
| +2 | Agree |
| +3 | Strongly agree |

**The relationship (bidirectional):**
```
POINT: "Remote work is more productive"
   ↕
   │ bidirectional linking
   ↕
STORY: "I burned out commuting 2 hours daily"
   ↑
   │ leads to
   ↓
POSITION: "+2 (Agree) on this Point"
```

- **Point → Story:** A Point can link to Stories that support or oppose it
- **Story → Point:** A Story can link to Points it explains your position on

**Key insight:** You don't verify Points (they're just claims). You verify understanding of the **Story behind someone's Position** on a Point.

### Verification Threshold

**≥8/10 = Verified Understanding**

When both parties rate understanding ≥8/10 in a /live session, the understanding is "verified."

| Score | Status | Display |
|-------|--------|---------|
| 10/10 | Perfect | Green badge |
| 8-9/10 | Verified | Green badge |
| <8/10 | In Progress | Amber/gray |

### Calibration Badge (Public Reputation)

Users earn a public "Calibrated" badge when:
- **≥10 clarity sessions completed** AND
- **avgGap within ±0.5** (self-assessment matches reality)

This badge appears next to their name across the platform, rewarding epistemic humility while preserving privacy (exact calibration numbers stay private on their dashboard).

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

### Phase 0: Exploration UX (P60) ✅ CURRENT

**Goal:** Users can navigate between Stories and Points, filter by position, initiate verification.

See [p60_navigating_stories_and_points.md](../features/p60_navigating_stories_and_points.md) for full spec.

```
□ StoryDetail screen (blue card + linked Points)
□ PointDetail screen (yellow card + linked Stories with position filter)
□ Pattern B cards (collapse/expand, position badges)
□ "Verify Understanding" button → /live
□ Feed with Story/Point cards
```

**Why first:**
- Can't test H2 without visible Stories/Points
- Manual seeding sufficient — Sifter comes later
- Frontend mockup, backend schema exists

### Phase 1: Points + Positions Backend ✅ DONE

**Goal:** Points can be shared, positions can be staked on -3 to +3 scale.

```
□ Points table (from sifted content or manual entry)
□ Positions table (-3 to +3 per user per point)
□ Position history table (track changes for conversion analysis)
□ Link Position to Story (why user holds this position)
□ API: createPoint(), stakePosition(), getPositions()
□ Port IdeaCard + PositionButtons from prototype (update to 7-point scale)
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

-- Story-Point links (bidirectional)
story_point_links (
  id uuid primary key,
  story_id uuid references stories(id),
  point_id uuid references points(id),
  link_type text,                   -- 'supports' | 'opposes' | 'explains'
  created_at timestamp
)

-- Positions table (current position)
positions (
  id uuid primary key,
  point_id uuid references points(id),
  user_id uuid references profiles(id),
  position integer,                 -- -3 to +3 scale
  story_id uuid references stories(id),  -- why they hold this position
  created_at timestamp,
  updated_at timestamp,
  unique(point_id, user_id)
)

-- Position history (for conversion tracking)
position_history (
  id uuid primary key,
  position_id uuid references positions(id),
  old_position integer,
  new_position integer,
  changed_at timestamp,
  -- Context: what triggered the change?
  after_session_id uuid references clarity_sessions(id),  -- if changed after verification
  after_session_score integer       -- the understanding score when changed
)

-- Link sessions to points
ALTER TABLE clarity_sessions ADD COLUMN point_id uuid references points(id);
```

### Phase 2: Event Container ✅ DONE

**Goal:** Self-service event creation, scoped points.

```
✓ Events table + API
✓ Simple event creation (name + description)
✓ Event registration (magic link → add to event)
□ Event feed (points scoped to event) — needs P60
□ Attendee list with positions — needs P60
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

### Phase 4: First Event (H2 Validation)

**Goal:** Run 30-person event to validate H2 (visibility changes behavior).

```
□ Manually seed 3-5 Stories/Points for test event
□ End-to-end test with P60 UI
□ Run event, observe verification behavior
□ Post-event survey: >50% verify, >60% "worth it"
```

**Success criteria:** See [hypotheses.md](hypotheses.md) H2 definition.

### Phase 5: Sifter (P58)

**Goal:** Automate Story/Point creation (only after H2 validated).

See [p58_sifter_mvp.md](../features/p58_sifter_mvp.md) for full spec.

```
□ Chat interface for brain dump
□ AI Sifter: detect Story vs Point
□ Hardener: make Points falsifiable
□ Mirror Test: AI plays back, user confirms
```

**Why after H2:** Don't automate seeding until manual seeding proves the loop works.

### Phase 6: AI Synthesis + Context Portal

**Goal:** Post-verification learning extraction.

```
□ Transcription (Whisper on recorded audio)
□ AI synthesis: "What you learned about their Story"
□ Context Portal: "Catch Up" summary for newcomers
```

See [p59_context_portal_design.md](../features/p59_context_portal_design.md) for spec.

---

## V2+ Roadmap (Post-Event)

| Feature | Trigger | Description |
|---------|---------|-------------|
| **Definition branching** | Users disagree on word meaning | Create branches: "If X means A... If X means B..." |
| **Enriched Point cards** | Verification data accumulates | Show linked Stories, verification count, verified badges |
| **Real-time updates** | Event friction | Supabase Realtime for live position changes |
| **Point ownership model** | Points spread beyond creator | "Points belong to nobody" (World 3) |
| **Story privacy controls** | Platform goes public | Granular sharing (event-only, public, private) |
| **Conversion analytics** | Position history accumulates | Show asymmetric conversion patterns (H-Core validation) |
| **Recursive teachability** | Stories spread through network | Track: does understanding Story X lead to position change on Point Y? |
| **Understanding imbalance** | Verification data accumulates | Show who understands whom better on specific Points |

---

## Hypotheses

**Source of truth:** [hypotheses.md](hypotheses.md)

**Current focus:** H2 (visibility changes behavior) and H0 (calibration revelation motivates action)

**First Event success criteria:** See H2 in hypotheses.md — >50% verify, >60% "worth it"

---

## Open Questions

### Q1: Should positions require Story acknowledgment?

v5.1 suggests: "Can't disagree until you acknowledge their Story."

**Current decision:** No — stake first, verify later. Lower friction.

**Revisit if:** Positions feel uninformed, verifications are shallow.

### Q2: How do Stories link to multiple Points?

One Story might explain positions on multiple Points.

**For MVP:** One Story → One Position → One Point.
**For V2:** Many-to-many relationships via `story_point_links` table.

### Q3: When do Stories need privacy controls?

| Context | Privacy Level |
|---------|---------------|
| In-person event | Implicit (same room) |
| Async platform | Needs controls |
| Public feed | Stories opt-in |

**For MVP:** Stories shared only in verification sessions.

### Q4: Conversion tracking — public or private?

When a user changes position after verified understanding, should this be visible?

| Option | Pros | Cons |
|--------|------|------|
| **Public** | Social proof, demonstrates intellectual humility | Privacy concern, might discourage position changes |
| **Private** | Encourages honest updates | Loses social signal value |
| **Aggregate only** | "X people changed position after verification" | Less personal, still useful signal |

**Decision needed:** Before building conversion display in profile.

### Q5: Stories in profile — MVP scope?

Stories + Points bidirectional linking is the full vision. For MVP mockup:

| Option | Scope |
|--------|-------|
| **A: Stories list only** | Show Stories as separate tab, no linking UI yet |
| **B: Stories + Point links** | Show which Points each Story explains (mockup the relationship) |
| **C: Defer Stories** | Focus on Points + conversion tracking first |

**Decision needed:** Before "Stories + Points in profile" build (Day 3-4).

---

## Related Documents

**Current Work:**
- [P60: Exploration UX](../features/p60_navigating_stories_and_points.md) — Story/Point navigation (CURRENT)
- [P78: User Personas](../features/p78_user_personas.md) — Event organizer + other personas
- [P79: Consulting Revenue](../features/p79_consulting_revenue_model.md) — Bootstrap revenue model

**Core Specs:**
- [P55: Understanding Verification Loop](../features/done/p55_understanding_verification_loop.md) — /live mechanism
- [P56: Event as Clarity Container](../features/p56_event_as_clarity_container.md) — Event mechanics
- [P58: Sifter MVP](../features/p58_sifter_mvp.md) — AI Sifter (after H2)
- [P59: Context Portal](../features/p59_context_portal_design.md) — Catch-up feature

**Foundation:**
- [hypotheses.md](hypotheses.md) — What we're testing (H-Core, H0-H5)
- [v0_theory-of-change.md](visions/v0_theory-of-change.md) — Cascade mechanism
- [v7_communicative_critical_rationalism.md](visions/v7_communicative_critical_rationalism.md) — Epistemology

---

## Changelog

| Date | Change |
|------|--------|
| 2026-01-20 | Restructured phases: P60 (exploration) now Phase 0, Sifter moved to Phase 5 (after H2). Marked Events backend done. Deleted duplicate hypotheses, linked to hypotheses.md. Added P78/P79 references. |
| 2026-01-18 | v7 alignment: -3 to +3 position scale, ≥8/10 verification threshold, calibration badge (≥10 sessions + ±0.5 gap), Story↔Point bidirectional linking, position_history table for conversion tracking, new open questions Q4/Q5 |
| 2026-01-14 | Refactored from p57, integrated v6 Story/Point model, added Sifter as Phase 0 |
| 2026-01-13 | Original p57 created |
