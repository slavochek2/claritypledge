# Product Roadmap

Build sequence and priorities. What we're building and in what order.

**Status:** Active Planning
**Last Updated:** 2026-02-03
**North Star:** Spread calibrated communication + sustainable revenue

> **Current Focus:** Be your own coach. Run events. Validate tool creates value.
>
> **Key pivot (2026-02-03):** Stopped trying to sell to coaches. BE the coach yourself — run events, build case studies, prove tool value, then find path to subscription revenue.
>
> **What's done:** /live verification (production), Events backend, research foundation (P104, P110)
> **What's next:** Finish minimum /live (Stories), run first events, start newsletter
> **Key hypothesis:** Events using /live create measurable value (calibration improves, people return, WTP signal emerges)

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

## Current Phase: Validate Tool Value

**Goal:** Run events, prove /live creates measurable value

**What's done:**
- /live verification (production)
- Events backend
- Research foundation (P104, P110)

**What's next:**
- Finish minimum /live (Stories)
- Run first events
- Start newsletter

**Success:** Calibration improves, people return, WTP signal emerges

**Future phases:** TBD after open questions answered — see [hypotheses.md](hypotheses.md) "Open Questions" section

---

## Product Features by Tier

| Feature | Free (individuals) | Business ($100-500/mo) |
|---------|-------------------|------------------------|
| /live sessions | ✅ | ✅ |
| Personal calibration | ✅ | ✅ |
| Basic history | ✅ | ✅ |
| **Team dashboard** | ❌ | ✅ |
| **Team calibration** | ❌ | ✅ |
| **History & trends** | ❌ | ✅ |
| **Admin controls** | ❌ | ✅ |
| **Export/reporting** | ❌ | ✅ |

Build business features only when you have a paying customer asking for them.

---

## Deprioritized (was planned, now deferred)

### P97: Profile/Nav Migration — ON HOLD

**Original goal:** Migrate prototype UI (Stories + Points tabs) to production.

**Why deprioritized:** Profile redesign doesn't solve the trigger problem. Users need a reason to CREATE Stories before they need a place to VIEW them.

**Revisit when:** First Event validates H2.

### P98: Sifter — ON HOLD

**Original goal:** ChatGPT-style Story creation with AI polish.

**Why deprioritized:** Sifter creates content, but the problem isn't content — it's the trigger. Users can create Stories in /live directly (speak → transcript). AI polish is nice-to-have.

**Revisit when:** Users are actively creating Stories and want better authoring tools.

### P85: Verification with Cards — ON HOLD

**Original goal:** Select Story cards inside /live for structured verification.

**Why deprioritized:** /live already works without cards. Cards add structure but don't solve "on what?" — that comes from organizer-provided topics.

**Revisit when:** Event validates and users want more structured verification.

---

## Historical Context

**2026-01-27 pivot:** Realized through simplification that the core problem is cold start (no trigger), not features. 10 days spent on prototype was valuable learning — now we know what's NOT needed. See [decisions.md](decisions.md) "Cold Start Problem" entry.

---

## Previous Build Phases (archived for reference)

<details>
<summary>Click to expand previous plan</summary>

### Phase 0: Profile/Nav Migration (P97) — was CURRENT

**Goal:** Migrate prototype UI to production with TDD approach. Frontend-only with mock data.

See [p97_tdd_prototype_migration.md](../features/p97_tdd_prototype_migration.md) for full spec.

### Phase 0.5: Profile Backend

**Goal:** Connect Profile UI to real database.

### Phase 1: Sifter (P98)

**Goal:** ChatGPT-style Story creation.

### Phase 2: Verification Flow (P85)

**Goal:** Connect /live to Stories/Points, log verifications, display event outcomes.

**Goal:** Run 30-person event to validate H4 (visibility) and H3 (social FOMO).

</details>

### Phase 4: AI Synthesis + Context Portal (future)

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

**Current focus:** H2-H4 (calibration, FOMO, visibility) — see [hypotheses.md](hypotheses.md)

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

**On Hold (deprioritized 2026-01-27):**
- [P97: Profile Integration](../features/p97_tdd_prototype_migration.md) — Wire prototype into production (ON HOLD)
- [P98: Sifter Prototype](../features/p98_sifter_prototype.md) — ChatGPT-style Story creation (ON HOLD)
- [P85: Verification Flow](../features/p85_live_verification_with_cards.md) — Card selection in /live (ON HOLD)

**Supporting:**
- [P78: User Personas](../features/p78_user_personas.md) — Event organizer + other personas
- [P79: Consulting Revenue](../features/p79_consulting_revenue_model.md) — Bootstrap revenue model

**Core Specs:**
- [P55: Understanding Verification Loop](../features/done/p55_understanding_verification_loop.md) — /live mechanism
- [P56: Event as Clarity Container](../features/p56_event_as_clarity_container.md) — Event mechanics
- [P59: Context Portal](../features/p59_context_portal_design.md) — Catch-up feature

**Foundation:**
- [hypotheses.md](hypotheses.md) — What we're testing (H1-H7, H-Core)
- [theory-of-change.md](theory-of-change.md) — Cascade mechanism, √N
- [philosophy.md](philosophy.md) — Epistemology

---

## Changelog

| Date | Change |
|------|--------|
| 2026-01-27 | **Sequence change:** P97 (Profile/Nav TDD migration) is now Phase 0. Sequence: P97 → Profile Backend → Sifter (P98) → Verification (P85) → First Event. Profiles are foundation that Sifter and Verification depend on. |
| 2026-01-23 | **Major restructure:** P85 Event Verification Flow is now Phase 0. Sifter moved to Phase 3. Added H0b to H2 test criteria (note: old numbering, now H3/H4). Key insight: no "feed" needed — card selection happens inside /live, event page shows outcomes only. |
| 2026-01-20 | Restructured phases: P60 (exploration) now Phase 0, Sifter moved to Phase 5 (after H2). Marked Events backend done. Deleted duplicate hypotheses, linked to hypotheses.md. Added P78/P79 references. |
| 2026-01-18 | v7 alignment: -3 to +3 position scale, ≥8/10 verification threshold, calibration badge (≥10 sessions + ±0.5 gap), Story↔Point bidirectional linking, position_history table for conversion tracking, new open questions Q4/Q5 |
| 2026-01-14 | Refactored from p57, integrated v6 Story/Point model, added Sifter as Phase 0 |
| 2026-01-13 | Original p57 created |
