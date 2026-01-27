# Product Roadmap

Build sequence and priorities. What we're building and in what order.

**Status:** Active Planning
**Last Updated:** 2026-01-23
**North Star:** First 30-person Clarity Event (H2 validation)

> **Current Focus:** P85 Event Verification Flow → Connect /live to content → H2 test event
>
> **What's done:** Events backend, /live verification, 7-point position scale UI
> **What's next:** Card selection inside /live, verification logging, event outcomes display
> **Then:** Manually seed Stories/Points → Run 30-person event → Validate H2
> **After H2:** Sifter (P58) automates seeding

---

## The Vision (One Sentence)

A platform where people **sift** messy thoughts into protected **Stories** (for empathy) and sharpened **Points** (for truth), then **verify understanding** across disagreement.

**Core concepts (Stories, Points, Position Scale, Calibration):** See [definitions.md](definitions.md)

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

### Phase 0: Event Verification Flow (P85) ✅ CURRENT

**Goal:** Connect /live to Stories/Points, log verifications, display event outcomes.

See [p85_event_verification_flow.md](../features/p85_event_verification_flow.md) for full spec.

```
□ Card selection inside /live (browse your cards + partner's cards)
□ Simplified card component (collapsed linked content)
□ Stance prompt after verification (position on linked Points)
□ VerificationEvent logging (positions before/after)
□ Event outcomes section (verification count, leaderboard)
□ Ears (👂) count on participant list
```

**Why first:**
- /live exists but isn't connected to content
- Need verification logging before H2 test
- Event outcomes create visibility (H2) and FOMO (H0b)

**Key insight:** No "feed" needed. At physical events, people match in person. Card selection happens inside /live, not on event page.

### Phase 1: Points + Positions Backend ✅ DONE

**Goal:** Points can be shared, positions can be staked on -3 to +3 scale. 7-point UI completed.

```
□ Points table (from sifted content or manual entry)
□ Positions table (-3 to +3 per user per point)
□ Position history table (track changes for conversion analysis)
□ Link Position to Story (why user holds this position)
□ API: createPoint(), stakePosition(), getPositions()
□ Port IdeaCard + PositionButtons from prototype (update to 7-point scale)
□ Basic points feed page
```

**Schema:** See [database.md](technical/database.md) for implemented schemas, feature specs for planned schemas.

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

### Phase 3: Sifter (P58)

**Goal:** Automate Story/Point creation (manual seeding works but is friction).

See [p58_sifter_mvp.md](../features/p58_sifter_mvp.md) for full spec.

```
□ Chat interface for brain dump
□ AI Sifter: detect Story vs Point
□ Hardener: make Points falsifiable
□ Mirror Test: AI plays back, user confirms
```

**Why after verification flow:** Don't automate seeding until verification loop is connected. Manual seeding sufficient for H2 test.

### Phase 4: First Event (H2 Validation)

**Goal:** Run 30-person event to validate H2 (visibility changes behavior) and H0b (social FOMO).

```
□ Manually seed 3-5 Stories/Points for test event
□ End-to-end test with verification flow
□ Run event, observe verification behavior
□ Post-event survey: >50% verify, >60% "worth it"
□ Track: Did seeing others' ears (👂) drive participation?
```

**Success criteria:** See [hypotheses.md](hypotheses.md) H2 and H0b definitions.

### Phase 5: AI Synthesis + Context Portal

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
- [P85: Event Verification Flow](../features/p85_event_verification_flow.md) — Card selection in /live, verification logging, event outcomes (CURRENT)
- [P78: User Personas](../features/p78_user_personas.md) — Event organizer + other personas
- [P79: Consulting Revenue](../features/p79_consulting_revenue_model.md) — Bootstrap revenue model

**Core Specs:**
- [P55: Understanding Verification Loop](../features/done/p55_understanding_verification_loop.md) — /live mechanism
- [P56: Event as Clarity Container](../features/p56_event_as_clarity_container.md) — Event mechanics
- [P58: Sifter MVP](../features/p58_sifter_mvp.md) — AI Sifter (after H2)
- [P59: Context Portal](../features/p59_context_portal_design.md) — Catch-up feature

**Foundation:**
- [hypotheses.md](hypotheses.md) — What we're testing (H-Core, H0-H5)
- [theory-of-change.md](theory-of-change.md) — Cascade mechanism, √N
- [philosophy.md](philosophy.md) — Epistemology

---

## Changelog

| Date | Change |
|------|--------|
| 2026-01-23 | **Major restructure:** P85 Event Verification Flow is now Phase 0. Sifter moved to Phase 3. Added H0b to H2 test criteria. Key insight: no "feed" needed — card selection happens inside /live, event page shows outcomes only. |
| 2026-01-20 | Restructured phases: P60 (exploration) now Phase 0, Sifter moved to Phase 5 (after H2). Marked Events backend done. Deleted duplicate hypotheses, linked to hypotheses.md. Added P78/P79 references. |
| 2026-01-18 | v7 alignment: -3 to +3 position scale, ≥8/10 verification threshold, calibration badge (≥10 sessions + ±0.5 gap), Story↔Point bidirectional linking, position_history table for conversion tracking, new open questions Q4/Q5 |
| 2026-01-14 | Refactored from p57, integrated v6 Story/Point model, added Sifter as Phase 0 |
| 2026-01-13 | Original p57 created |
