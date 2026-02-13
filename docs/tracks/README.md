# Tracks: Work Streams Overview

**What's a Track?** A thematically coherent collection of work testing related hypotheses, containing features, experiments, and outcomes.

**Key distinction:** Tracks are **work streams** (ongoing), not **milestones** (dated achievements). See `/docs/milestones/` for observable achievements.

---

## Quick Reference

| Track | Focus | Status | Priority | Time Horizon |
|-------|-------|--------|----------|--------------|
| **C1** | Stories + Live + Events | Active | P1 | 0-3 months |
| **C2** | First Workshops | Next | P1 | 3-6 months |
| **C3** | Paid Workshops | Future | P2 | 6-9 months |
| **R1** | Essay Writing | Active | P0 | 0-3 months |
| **R2** | Spec Publishing | Future | P1 | 3-6 months |
| **R3** | Recognition Checkpoint | Future | P1 | 6-12 months |
| **E1** | Points + AI Stories | Future | P2 | 6-12 months |
| **E2** | Scale + Partners + Async | Future | P2 | 9-15 months |
| **X1** | Asymmetric Conversion | Future | P3 | 18-24 months |
| **X2** | Social Dynamics | Future | P3 | 18-24 months |
| **X3** | Network Effects | Future | P3 | 18-24 months |

---

## Track Categories

Five track categories (C/R/E/X/V) organize work by purpose and timeline:

| Category | Name | Purpose | Time Horizon | Examples |
|----------|------|---------|--------------|----------|
| **C** | Coaching | Workshop revenue, validation | 0-6 months | C1, C2, C3 |
| **R** | Recognition | Thought leadership, positioning | 3-12 months | R1, R2, R3 |
| **E** | Enhancement | Product improvements | 3-9 months | E1, E2 |
| **X** | Exploratory | Ideas requiring scale | 12-24 months | X1, X2, X3 |
| **V** | Vision | Far-future capabilities | 24+ months | (none yet) |

**For classification guidance:** See category definition files (coaching-track.md, recognition-track.md, etc.)

---

## Dual-Track Strategy

**PRIMARY: Recognition Track (R)**
- Essays → positioned as "calibration expert"
- Target: AI safety/rationalist communities
- Goal: Recognition → inbound from aligned funders

**SAFETY: Coaching Track (C)**
- Workshops → €5K/month revenue
- Target: Coaches, facilitators
- Goal: Validate value + generate baseline revenue

**Why both:** Recognition takes 6-12 months. Coaching provides safety net if recognition fails.

---

## Track Structure

Each track file is a **lightweight index** linking to:

**What we're testing:** `/docs/hypotheses/h-{name}.md`
- Testable belief (e.g., "Stories solve cold start problem")
- Rationale, assumptions, evidence
- Success/failure criteria

**How we test:** `/docs/experiments/e-{name}.md`
- Protocol (step-by-step how we test)
- Sample size, measurements, timeline
- Success/kill thresholds

**What we measure:** `/docs/outcomes/o-{name}.md`
- SMART goal definition
- Target value, kill threshold
- Measurement method

**What we build:** `/features/p{N}_{name}.md`
- PRDs for features
- Referenced in track's `builds:` field

---

## Critical Path (Current Focus)

**Feb-Mar 2026:**
- **C1 (Stories + Live):** 20-user pilot → validate Stories solve cold start
- **R1 (Essay Writing):** 3+ essays → 50+ readers → recognition signals

**Apr-Jun 2026:**
- **C2 (First Workshops):** 5 workshops → retention >30% → WTP signal
- **R2 (Spec Publishing):** 3+ specs → technical credibility

**Decision Point (Month 6):**
- If C2 + R1 both show traction → continue dual-track
- If only C2 → focus on coaching (safety)
- If only R1 → focus on recognition (primary)
- If neither → pivot or stop

---

## Classification Decision Tree

**Where does new work belong?**

### Step 1: Time Horizon

- **0-6 months, near-term value:** → C-track or R-track
- **6-12 months, conditional on traction:** → E-track
- **12-24 months, requires scale:** → X-track
- **24+ months, requires new capabilities:** → V-track

### Step 2: Purpose

**If 0-6 months:**
- Tests workshop business model? → C-track
- Builds recognition/positioning? → R-track
- Neither? → foundation (infrastructure)

**If 6-12 months:**
- Improves existing validated features? → E-track
- Tests new capabilities? → Back to Step 1 (might be X or V)

**If 12+ months:**
- Needs scale to test (10K+ users)? → X-track
- Needs new capabilities (AI, ML, transcription)? → V-track

### Step 3: Validate

Read category definition file (e.g., `coaching-track.md`) to confirm classification.

---

## Related Documents

**Strategic:**
- [lean-canvas.md](../lean-canvas.md) — Business model
- [theory-of-change.md](../theory-of-change.md) — Causal pathway
- [decisions.md](../decisions.md) — Why we structured tracks this way
- [HOW-TO-NAVIGATE.md](../HOW-TO-NAVIGATE.md) — Human navigation guide

**Classification:**
- [coaching-track.md](coaching-track.md) — C-track definition
- [recognition-track.md](recognition-track.md) — R-track definition
- [enhancement-track.md](enhancement-track.md) — E-track definition
- [exploratory-track.md](exploratory-track.md) — X-track definition
- [vision-track.md](vision-track.md) — V-track definition

**Structure:**
- [/docs/hypotheses/](../hypotheses/) — Testable beliefs
- [/docs/experiments/](../experiments/) — Testing protocols
- [/docs/outcomes/](../outcomes/) — Measurable goals
- [/docs/milestones/](../milestones/) — Observable achievements (dated)

---

## Changelog

- **2026-02-13:** P142 restructure — separated tracks/hypotheses/experiments/outcomes/milestones, added category definition files, created HOW-TO-NAVIGATE.md
- **2026-02-12:** Renamed M1-M12 → R/C/E/X track system (see decisions.md)
- **2026-02-02:** Created milestone files (original structure)
