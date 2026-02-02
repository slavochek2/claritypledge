# Product Roadmap

Build sequence and priorities. What we're building and in what order.

**Status:** Active Planning
**Last Updated:** 2026-02-02
**North Star:** Scale your inner world — know who understood, how well, where they diverge

> **Current Focus:** Stories-first. Build the human verification loop before adding AI.
>
> **Key pivot (2026-02-02):** Value prop evolved from "see your gap" (diagnostic) to "scale your inner world" (productive). Stories are how authors verify understanding at scale.
>
> **Key hypothesis:** Human-to-human story verification works and creates value. If yes, AI accelerates it. If no, AI won't save it.

---

## The Vision (One Sentence)

A platform where people create **Stories** that scale their inner world — others verify understanding, and authors see WHO understood, HOW WELL, and WHERE they diverged, without being present for every conversation.

**Core concepts (Stories, Calibration):** See [definitions.md](definitions.md). Points are deferred until Phase 4b.

---

## Current Status

**For feature status:** Run `npm run kanban` or check `features/*.md` frontmatter

---

## Current Phase: Stories-First Build

> **Testing:** Can Stories solve the cold start problem? Does human verification of stories work?

### The 6-Phase Sequence (2026-02-02)

```
Phase 1: Stories on Profiles (Mock)
─────────────────────────────────────
□ Extract Stories from linkedin-prototype to profiles
□ Story = text only (no points yet)
□ Manual story creation
→ Tests: Does the UI work? Is the data model right?

Phase 2: Backend + Merge to Product
─────────────────────────────────────
□ Stories table in Supabase
□ Connect to real product (not just prototype)
□ Stories persist across sessions
→ Tests: Does persistence work?

Phase 3: /live with Story Context
─────────────────────────────────────
□ Events page shows stories
□ Select story → Start /live
□ /live shows the story being verified
□ Clear purpose: "Verify THIS story"
→ Tests: Does contextualized /live feel purposeful?

Phase 4a: Human Verification (Holistic)
─────────────────────────────────────
□ Listener explains back the story
□ Speaker rates 0-10 (holistic: "did they get it?")
□ Speaker certifies understanding
□ NO points — just "did they understand?"
→ Tests: Can humans verify understanding without structure?

Phase 4b: Add Points (IF holistic too vague)
─────────────────────────────────────
□ Only if Phase 4a shows we need structure
□ Author manually adds 1-3 points to story
□ Verification tests specific claims
→ Tests: Do points improve verification quality?

Phase 5: Sifter (AI Story Creation)
─────────────────────────────────────
□ AI as skilled listener
□ AI asks probing questions
□ AI extracts story + (optionally) points
□ Author approves
→ Tests: Does AI create better stories than manual?

Phase 6: AI Verification
─────────────────────────────────────
□ AI verifies understanding (not just speaker)
□ Author reviews edge cases
□ Scaling achieved
→ Tests: Does AI verify accurately? (H-AI hypothesis)
```

**Current:** Phase 1 — Stories on profiles (mock)

**Success criteria:**
- Phase 4a: Humans can verify story understanding holistically
- Phase 6: AI verification accuracy >80% vs human

**What exists (from linkedin-prototype):**
- Stories data model ✅
- Points data model ✅ (deferred)
- Profiles with Stories tab ✅ (mock)
- Sifter UI ⚠️ (exists but not tested/tweaked)

**Open questions:** See [hypotheses.md](hypotheses.md) "Open Questions" section (OQ-1 through OQ-7)

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

## Related Feature Docs (Being Reactivated)

### P97: Profile/Nav Migration — REACTIVATED (Phase 1)

**Original goal:** Migrate prototype UI (Stories + Points tabs) to production.

**Status (2026-02-02):** Reactivated. Stories on profiles is Phase 1 of new sequence.

**Scope change:** Stories only first (no Points). Points come in Phase 4b if needed.

### P98: Sifter — Phase 5

**Original goal:** ChatGPT-style Story creation with AI polish.

**Status (2026-02-02):** Moved to Phase 5. Manual story creation first, AI-assisted later.

**Why deferred:** Validate human verification loop before adding AI complexity.

### P85: Verification with Cards — Phase 3

**Original goal:** Select Story cards inside /live for structured verification.

**Status (2026-02-02):** Reactivated as Phase 3. /live with story context solves "on what?" problem.

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

**Current focus:** Stories-first build, testing human verification loop. See 6-phase sequence above.

**Key hypotheses:**
- Human verification of stories works (Phase 4a)
- H-AI: AI can verify accurately (Phase 6)

---

## Related Documents

**Being Built (2026-02-02):**
- [P97: Profile Integration](../features/p97_tdd_prototype_migration.md) — Stories on profiles (Phase 1)
- [P85: Verification Flow](../features/p85_live_verification_with_cards.md) — /live with story context (Phase 3)

**Deferred:**
- [P98: Sifter Prototype](../features/p98_sifter_prototype.md) — AI story creation (Phase 5)

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
