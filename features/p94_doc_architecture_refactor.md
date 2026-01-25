---
prep_status: ready
prep_date: 2026-01-25
prep_by: /prep-spec
reviews:
  ux: skipped
  architect: passed
  tea: skipped
open_questions: 0
blindspots: 0
execution: /loop
---

# P94: Documentation Architecture Refactor

**Status:** Ready
**Created:** 2026-01-25

---

## Why Now

Triggered by v8 integration question: "How does v8 relate to existing docs?"

Answering that revealed a deeper problem:
- Product descriptions duplicated across README, CLAUDE.md, lean-canvas, DEFINITIONS
- When new docs (v8) arrive, unclear where concepts belong
- `/kdd` doesn't have clear rules for maintaining separation
- Updates require changing multiple files that drift out of sync

---

## Problem

| Concept | Duplicated in |
|---------|---------------|
| "The Problem" (calibration gap) | README.md, CLAUDE.md, lean-canvas.md |
| "How it works" (Stories, Points, /live) | README.md, CLAUDE.md, DEFINITIONS.md |
| Build sequence hints | roadmap.md, v0 (Facilitation Ladder) |

**v0 confusion:** Contains "Facilitation Ladder" which reads like build sequence but is actually end-state vision. Currently unclear which is which.

---

## Solution: Two-Layer Doc Architecture

### Source of Truth Layer (concepts live here, one place only)

| Doc | Owns | Never Contains |
|-----|------|----------------|
| **DEFINITIONS.md** | Stories, Points, Positions, Verification, Calibration, User flow | Business model, build phases, philosophy |
| **lean-canvas.md** | Problem, Solution, UVP, Customers, Revenue | Concepts, build phases |
| **hypotheses.md** | What we're testing, success criteria, validation status | How to build, concepts |
| **roadmap.md** | Build phases, current focus, what's next | Concepts, philosophy |
| **DECISIONS.md** | Why we chose X over Y, trade-offs | Current state |
| **visions/v0** | Cascade theory, √N math, end state | Build sequence |
| **visions/v7** | Epistemology, asymmetric conversion | Product concepts |
| **visions/v8+** | Explorations (migrate to DEFINITIONS when validated) | Settled concepts |

### Consumer Layer (links only, never duplicates)

| Doc | Contains | Links To |
|-----|----------|----------|
| **README.md** | Setup instructions, tech stack, brief intro | lean-canvas, DEFINITIONS, roadmap |
| **CLAUDE.md** | Agent conventions, architecture patterns, 6-line product summary | DEFINITIONS, hypotheses, roadmap, lean-canvas |

---

## What Each Doc Answers

| Question | Answer lives in |
|----------|-----------------|
| What problem are we solving? | lean-canvas.md |
| What are Stories, Points, Verification? | DEFINITIONS.md |
| What are we testing? Is it working? | hypotheses.md |
| What are we building? In what order? | roadmap.md |
| Why did we choose X over Y? | DECISIONS.md |
| What's the philosophy behind this? | visions/v7 |
| What's the end-state vision? | visions/v0 |
| New exploration being refined? | visions/v8+ |
| How do I set up the project? | README.md |
| How should AI agents work here? | CLAUDE.md |

---

## Tasks

### Phase 1: Rename domain-model.md → DEFINITIONS.md

- [ ] **1.1** Rename `docs/domain-model.md` → `docs/DEFINITIONS.md`
- [ ] **1.2** Update all references in CLAUDE.md (Deep Dive References table, any other mentions)
- [ ] **1.3** Update all references in README.md
- [ ] **1.4** Update reference in roadmap.md (if any)

### Phase 2: CLAUDE.md Updates

- [ ] **2.1** Replace verbose Product Overview with minimal version:
  ```markdown
  ## Product Overview

  **Clarity Pledge** — A sensemaking platform that reveals calibration gaps
  in how well people understand each other.

  **Core concepts:** Stories (lived experiences, verified via /live) →
  Points (debatable claims, positions staked) → Calibration (accuracy tracked)

  **Core loop:** Share → Verify understanding → See gap → Close it

  For full concepts: [DEFINITIONS.md](docs/DEFINITIONS.md)
  For business model: [lean-canvas.md](docs/lean-canvas.md)
  ```

- [ ] **2.2** Add Documentation Architecture section:
  ```markdown
  ## Documentation Architecture

  **Source of truth docs** (concepts live here, one place only):
  - `DEFINITIONS.md` — Product concepts (Stories, Points, Verification)
  - `lean-canvas.md` — Business model (Problem, Solution, Customers)
  - `hypotheses.md` — What we're testing
  - `roadmap.md` — Build sequence
  - `DECISIONS.md` — Trade-offs (why X over Y)
  - `visions/*` — Philosophy & explorations

  **Consumer docs** (link only, never duplicate):
  - `README.md` — Setup for humans
  - `CLAUDE.md` — Instructions for AI

  **Rule:** If explaining a concept, add to source doc and link. Never duplicate.
  ```

- [ ] **2.3** Add missing architecture patterns:
  - Check shadcn/ui (`src/components/ui/`) before building custom components
  - All data fetching through `src/app/data/api.ts`
  - Design tokens in `docs/design-system.md`

### Phase 3: README.md Updates

**Before (lines 7-22):**
```markdown
## The Problem
People fail to have constructive dialogues because:
1. **Speakers** overestimate how clearly they communicated
2. **Listeners** overestimate how well they understood
...

## How It Works
1. **Events** — Organizers create events...
```

**After:**
```markdown
## What Is This?

A sensemaking platform that reveals calibration gaps in understanding and motivates people to close them.

**Learn more:**
- [Problem & Solution](docs/lean-canvas.md) — Why this matters
- [Core Concepts](docs/DEFINITIONS.md) — Stories, Points, Verification
- [What We're Building](docs/roadmap.md) — Current focus and phases
```

Tasks:
- [ ] **3.1** Remove "The Problem" section (lines 7-13)
- [ ] **3.2** Remove "How It Works" section (lines 15-22)
- [ ] **3.3** Add "What Is This?" with links (as shown above)
- [ ] **3.4** Keep: Go Deeper links, Tech Stack, Setup, Development Commands

### Phase 4: v0 Clarification

The "Facilitation Ladder" in v0 reads like build sequence but is actually end-state vision. Add clarifying note:

```markdown
## The Facilitation Ladder

> **Note:** This describes the END STATE vision for group scaling, not the current build sequence. See [roadmap.md](../roadmap.md) for what we're building now.
```

- [ ] **4.1** Add clarifying note to Facilitation Ladder section in v0

### Phase 5: Source Doc Cleanup

- [ ] **5.1** Review lean-canvas.md — ensure Problem and Solution sections are complete (this is the source)
- [ ] **5.2** Review DEFINITIONS.md — ensure all core concepts are there
- [ ] **5.3** Review roadmap.md — remove any concept explanations (link to DEFINITIONS instead)

### Phase 6: /kdd Update

Update /kdd skill to understand doc architecture and propose updates:

- [ ] **6.1** Update knowledge-type mapping table:
  ```markdown
  | Knowledge type | Goes in |
  |----------------|---------|
  | Concepts (Stories, Points, etc.) | DEFINITIONS.md |
  | Problem/solution/business | lean-canvas.md |
  | What we're testing | hypotheses.md |
  | Build sequence, priorities | roadmap.md |
  | Trade-offs, "why X over Y" | DECISIONS.md |
  | Philosophy, end-state vision | visions/*.md |
  ```

- [ ] **6.2** Add behavior: /kdd should identify which docs need updates based on the knowledge captured, and propose specific edits (not just record to DECISIONS.md)

- [ ] **6.3** Add guardrails:
  - Never add concept explanations to README or CLAUDE.md
  - Warn if knowledge would duplicate existing content
  - Suggest consolidation when detecting drift

---

## Verification

After implementation:

1. **No duplication:** Search for "overestimate how clearly" — should only appear in lean-canvas.md
2. **Links work:** All new links in README/CLAUDE.md resolve correctly
3. **Rename complete:** No references to `domain-model.md` remain
4. **/kdd knows rules:** Run `/kdd` on a test decision, verify it proposes correct doc updates

---

## Success Criteria

- [ ] No concept duplication across docs
- [ ] README.md and CLAUDE.md only contain links to concepts, not explanations
- [ ] domain-model.md renamed to DEFINITIONS.md, all references updated
- [ ] /kdd identifies which docs need updates and proposes changes
- [ ] New vision docs (v9, v10...) have clear integration path

---

## Future Work (Not In Scope)

**v8 Integration** — After this consolidation is complete, evaluate whether/how to integrate v8 concepts into DEFINITIONS.md. This will be a separate task (P95+) to allow reflection on the best approach.

---

## Related

- [DEFINITIONS.md](../docs/DEFINITIONS.md) (currently domain-model.md)
- [lean-canvas.md](../docs/lean-canvas.md)
- [visions/v8_clarity_working_document_v0.1.md](../docs/visions/v8_clarity_working_document_v0.1.md)
