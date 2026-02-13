# Workstreams Overview

**What's a Workstream?** A thematically coherent collection of work testing related hypotheses, containing features, experiments, and key results.

**Key distinction:** Workstreams are **work streams** (ongoing), not **milestones** (dated achievements). See `/docs/milestones/` for observable achievements.

## Naming Convention

**Workstreams use track-based codes:**
- **C1, C2, C3** = Coaching track (workstreams 1, 2, 3)
- **R1, R2** = Recognition track (workstreams 1, 2)
- **E1, E2** = Enhancement track
- **X1, X2, X3** = eXploratory track

**These are NOT milestone numbers.** Milestones live in `/docs/milestones/` with date-based names like `2026-02-10-first-essay-published.md` or `planned-recognition-checkpoint.md`.

---

## Quick Reference

| Workstream | Focus | Status | Priority | Time Horizon |
|-------|-------|--------|----------|--------------|
| **C1** | Stories + Live + Events | Active | P1 | 0-3 months |
| **C2** | First Workshops | Next | P1 | 3-6 months |
| **C3** | Paid Workshops | Future | P2 | 6-9 months |
| **R1** | Essay Writing | Active | P0 | 0-3 months |
| **R2** | Spec Publishing | Future | P1 | 3-6 months |
| **E1** | Points + AI Stories | Future | P2 | 6-12 months |
| **E2** | Scale + Partners + Async | Future | P2 | 9-15 months |
| **X1** | Asymmetric Conversion | Future | P3 | 18-24 months |
| **X2** | Social Dynamics | Future | P3 | 18-24 months |
| **X3** | Network Effects | Future | P3 | 18-24 months |

---

## Workstream Categories

Five workstream categories (C/R/E/X/V) organize work by purpose and timeline:

| Category | Name | Purpose | Time Horizon | Examples |
|----------|------|---------|--------------|----------|
| **C** | Coaching | Workshop revenue, validation | 0-6 months | C1, C2, C3 |
| **R** | Recognition | Thought leadership, positioning | 3-12 months | R1, R2 |
| **E** | Enhancement | Product improvements | 3-9 months | E1, E2 |
| **X** | Exploratory | Ideas requiring scale | 12-24 months | X1, X2, X3 |
| **V** | Vision | Far-future capabilities | 24+ months | (none yet) |

**For classification guidance:** See category definition files (coaching-track.md, recognition-track.md, etc.)

---

## Dual-Workstream Strategy

**PRIMARY: Recognition Workstream (R)**
- Essays → positioned as "calibration expert"
- Target: AI safety/rationalist communities
- Goal: Recognition → inbound from aligned funders

**SAFETY: Coaching Workstream (C)**
- Workshops → €5K/month revenue
- Target: Coaches, facilitators
- Goal: Validate value + generate baseline revenue

**Why both:** Recognition takes 6-12 months. Coaching provides safety net if recognition fails.

---

## Workstream Structure

Each workstream file is a **lightweight index** linking to:

**What we're testing:** `/docs/hypotheses/h-{name}.md`
- Testable belief (e.g., "Stories solve cold start problem")
- Rationale, assumptions, evidence
- Success/failure criteria

**How we test:** `/docs/experiments/e-{name}.md`
- Protocol (step-by-step how we test)
- Sample size, measurements, timeline
- Success/kill thresholds

**What we measure:** `/docs/key-results/kr-{name}.md`
- SMART goal definition
- Target value, kill threshold
- Measurement method

**What we build:** `/features/p{N}_{name}.md`
- PRDs for features
- Referenced in workstream's `builds:` field

---

## Critical Path (Current Focus)

**Feb-Mar 2026:**
- **C1 (Stories + Live):** 20-user pilot → validate Stories solve cold start
- **R1 (Essay Writing):** 3+ essays → 50+ readers → recognition signals

**Apr-Jun 2026:**
- **C2 (First Workshops):** 5 workshops → retention >30% → WTP signal
- **R2 (Spec Publishing):** 3+ specs → technical credibility

**Decision Point (Month 6):**
- If C2 + R1 both show traction → continue dual-workstream
- If only C2 → focus on coaching (safety)
- If only R1 → focus on recognition (primary)
- If neither → pivot or stop

---

## Classification Decision Tree

**Where does new work belong?**

### Step 1: Time Horizon

- **0-6 months, near-term value:** → C-workstream or R-workstream
- **6-12 months, conditional on traction:** → E-workstream
- **12-24 months, requires scale:** → X-workstream
- **24+ months, requires new capabilities:** → V-workstream

### Step 2: Purpose

**If 0-6 months:**
- Tests workshop business model? → C-workstream
- Builds recognition/positioning? → R-workstream
- Neither? → foundation (infrastructure)

**If 6-12 months:**
- Improves existing validated features? → E-workstream
- Tests new capabilities? → Back to Step 1 (might be X or V)

**If 12+ months:**
- Needs scale to test (10K+ users)? → X-workstream
- Needs new capabilities (AI, ML, transcription)? → V-workstream

### Step 3: Validate

Read category definition file (e.g., `coaching-track.md`) to confirm classification.

---

## Related Documents

**Strategic:**
- [lean-canvas.md](../lean-canvas.md) — Business model
- [theory-of-change.md](../theory-of-change.md) — Causal pathway
- [decisions.md](../decisions.md) — Why we structured workstreams this way
- [HOW-TO-NAVIGATE.md](../HOW-TO-NAVIGATE.md) — Human navigation guide

**Classification:**
- [coaching-track.md](coaching-track.md) — C-workstream definition
- [recognition-track.md](recognition-track.md) — R-workstream definition
- [enhancement-track.md](enhancement-track.md) — E-workstream definition
- [exploratory-track.md](exploratory-track.md) — X-workstream definition
- [vision-track.md](vision-track.md) — V-workstream definition

**Structure:**
- [/docs/hypotheses/](../hypotheses/) — Testable beliefs
- [/docs/experiments/](../experiments/) — Testing protocols
- [/docs/key-results/](../key-results/) — Measurable goals
- [/docs/milestones/](../milestones/) — Observable achievements (dated with status)

---

## Changelog

- **2026-02-13:** Terminology updates — Track → Workstream, Outcome → Key Result, Milestone now includes status field
- **2026-02-13:** P142 restructure — separated tracks/hypotheses/experiments/outcomes/milestones, added category definition files, created HOW-TO-NAVIGATE.md
- **2026-02-12:** Renamed M1-M12 → R/C/E/X track system (see decisions.md)
- **2026-02-02:** Created milestone files (original structure)
