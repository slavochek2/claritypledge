# Milestones by Track

This directory contains all Clarity Pledge milestones organized by **track** (not sequential numbering).

---

## Dual-Track Strategy

Clarity Pledge pursues two parallel tracks with different goals:

### PRIMARY: Recognition Track (R-series)

**Goal:** Be recognized as "the calibration person" in AI/rationalist communities.

**Why primary:** Recognition can lead to €100-200k raise from aligned funders, enabling full-time work on calibration infrastructure. This is the preferred path.

**Success looks like:**
- Essays reach 200+ readers in target communities (LessWrong, AI researchers)
- Inbound "you're the expert" mentions begin appearing
- Technical specs discussed on HackerNews/LessWrong
- Aligned funders express interest in funding infrastructure work

### SAFETY: Coaching Track (C-series)

**Goal:** €5k/month revenue to fund recognition work if fundraising doesn't materialize.

**Why safety:** Provides financial runway to pursue recognition track without external funding pressure.

**Success looks like:**
- 10+ workshop participants by Month 3
- €3k/month revenue by Month 6 (30 customers × €100/month)
- Workshop retention >30% (people come back)
- Tool proves valuable independent of facilitator

### CONDITIONAL: Enhancements (E-series)

**When to build:** Only if C-track validated and scaling needed.

**Why conditional:** Don't build scaling features before proving basic value exists.

**Success looks like:**
- Points reduce verification vagueness (if holistic verification proves too broad)
- AI Sifter reduces story creation friction (if manual creation proves too hard)
- Partners can facilitate at 80% quality (proves value is in tool, not just you)
- Async verification enables retention (proves /live doesn't require synchronous pairing)

### FUTURE: Exploratory (X-series)

**When to build:** Only after Month 12+ and scale achieved (>100 active users).

**Why future:** These test network effects, group dynamics, and philosophical claims that require scale to measure. Cannot validate until foundation is proven.

**Success looks like:**
- Asymmetric conversion visible in data (north star hypothesis)
- Group visibility changes behavior (social proof works)
- Network effects materialize (verified pairs create more pairs)

---

## Track File Structure

```
docs/milestones/
├── r1-essay-writing.md              [Recognition, Months 0-3]
├── r2-spec-publishing.md             [Recognition, Month 6]
├── r3-recognition-checkpoint.md      [Recognition, Month 12 decision gate]
├── c1-stories-live-events.md         [Coaching, Months 0-2]
├── c2-first-workshops.md             [Coaching, Months 1-3]
├── c3-paid-workshops.md              [Coaching, Months 4-6]
├── e1-points-ai-stories.md           [Enhancement, conditional on C1/C2]
├── e2-scale-partners-async.md        [Enhancement, conditional on C3]
├── x1-asymmetric-conversion.md       [Exploratory, Month 12+, north star]
├── x2-social-dynamics.md             [Exploratory, Month 12+, group effects]
├── x3-network-effects.md             [Exploratory, Month 12+, network scale]
└── README.md                         [This file]
```

---

## Critical Path

### MONTHS 0-3: Validate Both Tracks

**Parallel work:**
- **R1** (Essay Writing) + **C1** (Stories + /live + Events) + **C2** (First Workshops)

**Checkpoint (Month 3):**
- If R1 <50 readers/essay AND C2 <10 participants → **STOP, reassess strategy**
- If R1 OR C2 shows traction → **CONTINUE to Month 6**

**Why both:** Recognition is primary, but takes 6-12 months to materialize. Coaching provides signal/revenue in months 1-3. Both must show traction to unlock Month 4-6 psychology recovery phase.

### MONTHS 4-6: Validate Monetization OR Recognition

**Parallel work:**
- **R2** (Spec Publishing) + **C3** (Paid Workshops)

**Checkpoint (Month 6):**
- If R2 zero engagement AND C3 <€3k/month → **HARD PIVOT or WIND DOWN**
- If R2 OR C3 shows traction → **CONTINUE to Month 12**

**What unlocks:** €3k/month revenue OR recognition signals required to unlock Month 7-12 self-worth restoration work.

### MONTHS 7-12: Scale OR Evaluate Trajectory

**Conditional work:**
- **E1** (Points/AI) if C1/C2 showed content creation friction
- **E2** (Partners/Async) if C3 validated and scaling

**Decision Gate (Month 12 — R3):**
- Strong recognition + aligned funders → **RAISE €100-200k, scale essays/specs**
- Strong coaching + weak recognition → **PIVOT to coaching-only business**
- Weak both → **HARD PIVOT or WIND DOWN**

### MONTHS 12+: Exploratory (if scale achieved)

**Only if:** Both R-track and C-track validated + >100 active users

**Build:**
- **X1** (Asymmetric Conversion) — test north star philosophical claim
- **X2** (Social Dynamics) — test group visibility effects
- **X3** (Network Effects) — test organic growth mechanisms

**Why deferred:** These require statistical power (100s of verified sessions) and time for network effects to materialize. Cannot test meaningfully until foundation validated.

---

## Priority Tiers

### P0: Critical Path (Must Validate to Survive)

| Milestone | Track | Months | Kill Signal |
|-----------|-------|--------|-------------|
| **R1: Essays** | Recognition | 0-3 | <50 readers, zero engagement |
| **C1: Stories + /live** | Coaching | 0-2 | Nobody creates stories, /live unused |
| **C2: First Workshops** | Coaching | 1-3 | <10 participants, no demand signal |

**If any P0 fails:** Cannot proceed to Month 4-6. Must reassess strategy.

### P1: Validation (Prove Model Works)

| Milestone | Track | Months | Kill Signal |
|-----------|-------|--------|-------------|
| **R2: Specs** | Recognition | 6 | Zero engagement, no contributors |
| **C3: Paid Workshops** | Coaching | 4-6 | <10 customers, <5% conversion |
| **R3: Decision Gate** | Both | 12 | No recognition OR <€3k/month revenue |

**If any P1 fails:** Model doesn't work. Hard pivot or wind down.

### P2: Enhancements (Improve Model)

| Milestone | Track | Conditional On | Kill Signal |
|-----------|-------|----------------|-------------|
| **E1: Points + AI** | Enhancement | C1/C2 validated | Points confuse, holistic works fine |
| **E2: Partners + Async** | Enhancement | C3 validated | Partner quality <80%, async retention <30% |

**Don't build until:** C-track validated. If C1/C2 fail, E1/E2 are irrelevant.

### P3: Exploratory (North Star, Requires Scale)

| Milestone | Track | Requires | Why P3 |
|-----------|-------|----------|--------|
| **X1: Asymmetric Conversion** | Exploratory | 100+ users, verified data | Tests philosophical claim, not business viability |
| **X2: Social Dynamics** | Exploratory | 30+ active users, group events | Can't test group effects without groups |
| **X3: Network Effects** | Exploratory | 100+ users, organic adoption | Can't test cascade without network |

**Don't build until:** Month 12+ and scale achieved. If R/C tracks fail by Month 12, X-track never happens.

---

## Decision Framework

### At Month 3 (Checkpoint: Dual-Track Traction)

```
IF (R1 readers <50/essay) AND (C2 participants <10):
  → STOP and reassess strategy (both tracks failing)

ELSE IF (R1 readers ≥50/essay) OR (C2 participants ≥10):
  → CONTINUE to Month 6 (at least one track showing traction)
```

### At Month 6 (Checkpoint: Monetization OR Recognition)

```
IF (R2 engagement = 0) AND (C3 revenue <€3k/month):
  → HARD PIVOT or WIND DOWN (no path to sustainability)

ELSE IF (R2 engagement >0) OR (C3 revenue ≥€3k/month):
  → CONTINUE to Month 12 (path to sustainability exists)
```

### At Month 12 (Decision Gate: Raise/Pivot/Continue)

```
IF (R-track strong) AND (aligned funders exist):
  → RAISE €100-200k, scale recognition work (essays, specs, research)

ELSE IF (C-track strong) AND (R-track weak):
  → PIVOT to coaching-only business (abandon fundraising path)

ELSE IF (both weak):
  → HARD PIVOT (new business model) or WIND DOWN
```

---

## Why This Structure?

### Problem with M1-M12 Numbering

The old milestone structure (M1, M2, M3... M12, MA, MB, MC) had issues:

1. **Numbering implied sequence** when actually multiple parallel tracks
2. **Priority invisible** — couldn't tell critical path from exploratory work
3. **Track confusion** — MA/MB/MC buried recognition track (the PRIMARY goal)
4. **False dependencies** — M6-M12 numbered sequentially but actually require 12+ months scale

### Benefits of R/C/E/X Tracks

1. **Track visibility:** R/C prefixes make dual-track strategy explicit
2. **Priority signaling:** R (primary) before C (safety) before E (enhancement) before X (exploratory)
3. **No false sequencing:** X2 doesn't come "after" X1 — they're parallel explorations at scale
4. **Clearer kill signals:** If R-track fails, pivot to C-only. If C-track fails, stop (no revenue). If both fail by Month 12, hard pivot or wind down.

---

## Naming Conventions

**R-track (Recognition):** r1, r2, r3...
**C-track (Coaching):** c1, c2, c3...
**E-track (Enhancement):** e1, e2...
**X-track (Exploratory):** x1, x2, x3...

**File naming:** `{track}{number}-{slug}.md`

**Examples:**
- `r1-essay-writing.md` — Recognition track, first milestone, essay writing
- `c2-first-workshops.md` — Coaching track, second milestone, workshops
- `e1-points-ai-stories.md` — Enhancement track, first milestone, Points + AI
- `x1-asymmetric-conversion.md` — Exploratory track, first milestone, north star test

---

## Historical Note

This structure was created in Feb 2026 to address milestone analysis findings:

- **Merged:** M7+M8+M9 → X2 (Social Dynamics)
- **Merged:** M10+M11+M12 → X3 (Network Effects)
- **Deleted:** M12 (Safety History) — fully redundant with M7/M8/M10
- **Renamed:** M1-M6 → C1-C3, E1-E2, X1 to clarify tracks
- **Renamed:** MA-MC → R1-R3 to make recognition primary track explicit

**Rationale:** Old structure optimized for a network-effects future that may never arrive. New structure optimizes for 0-6 month validation work that determines survival.

**See also:** [decisions.md](../decisions.md) for dual-track strategy decision, [lean-canvas.md](../lean-canvas.md) for business model context.
