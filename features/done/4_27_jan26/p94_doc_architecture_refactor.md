---
status: backlog
type: task
prep_status: done
prep_date: 2026-01-25
prep_by: /prep-spec
reviews:
  ux: skipped
  architect: passed
  tea: skipped
open_questions: 0
blindspots: 0
execution: /loop
tags: []
rank: 125338.0
created_date: 2026-01-25
---

# P94: Documentation Architecture Refactor

**Status:** Done
**Created:** 2026-01-25
**Completed:** 2026-01-25

---

## Why Now

Triggered by v8 integration question: "How does v8 relate to existing docs?"

Answering that revealed a deeper problem:
- Product descriptions duplicated across README, CLAUDE.md, lean-canvas, definitions
- When new docs (v8) arrive, unclear where concepts belong
- `/kdd` doesn't have clear rules for maintaining separation
- Updates require changing multiple files that drift out of sync

---

## Problem

| Concept | Duplicated in |
|---------|---------------|
| "The Problem" (calibration gap) | README.md, CLAUDE.md, lean-canvas.md |
| "How it works" (Stories, Points, /live) | README.md, CLAUDE.md, definitions.md |
| Build sequence hints | roadmap.md, v0 (Facilitation Ladder) |

**v0 confusion:** Contains "Facilitation Ladder" which reads like build sequence but is actually end-state vision. Currently unclear which is which.

---

## Solution: Two-Layer Doc Architecture

### Source of Truth Layer (concepts live here, one place only)

| Doc | Owns | Never Contains |
|-----|------|----------------|
| **definitions.md** | Stories, Points, Positions, Verification, Calibration, User flow | Business model, build phases, philosophy |
| **lean-canvas.md** | Problem, Solution, UVP, Customers, Revenue | Concepts, build phases |
| **hypotheses.md** | What we're testing, success criteria, validation status | How to build, concepts |
| **roadmap.md** | Build phases, current focus, what's next | Concepts, philosophy |
| **DECISIONS.md** | Why we chose X over Y, trade-offs | Current state |
| **visions/v0** | Cascade theory, √N math, end state | Build sequence |
| **visions/v7** | Epistemology, asymmetric conversion | Product concepts |
| **visions/v8+** | Explorations (migrate to definitions when validated) | Settled concepts |

### Consumer Layer (links only, never duplicates)

| Doc | Contains | Links To |
|-----|----------|----------|
| **README.md** | Setup instructions, tech stack, brief intro | lean-canvas, definitions, roadmap |
| **CLAUDE.md** | Agent conventions, architecture patterns, 6-line product summary | definitions, hypotheses, roadmap, lean-canvas |

---

## What Each Doc Answers

| Question | Answer lives in |
|----------|-----------------|
| What problem are we solving? | lean-canvas.md |
| What are Stories, Points, Verification? | definitions.md |
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

### Phase 1: Rename domain-model.md → definitions.md

- [x] **1.1** Rename `docs/domain-model.md` → `docs/definitions.md`
- [x] **1.2** Update all references in CLAUDE.md (Deep Dive References table, any other mentions)
- [x] **1.3** Update all references in README.md
- [x] **1.4** Update reference in roadmap.md (if any)

> **Note:** Used lowercase `definitions.md` to match existing docs pattern (roadmap.md, lean-canvas.md, hypotheses.md). Only DECISIONS.md uses uppercase.

### Phase 2: CLAUDE.md Updates

- [x] **2.1** Replace verbose Product Overview with minimal version
- [x] **2.2** Add Documentation Architecture section
- [x] **2.3** Add missing architecture patterns (shadcn/ui check, data layer, design tokens)

### Phase 3: README.md Updates

- [x] **3.1** Remove "The Problem" section
- [x] **3.2** Remove "How It Works" section
- [x] **3.3** Add "What Is This?" with links
- [x] **3.4** Keep: Go Deeper links, Tech Stack, Setup, Development Commands

### Phase 4: v0 Clarification

- [x] **4.1** Add clarifying note to Facilitation Ladder section in v0

### Phase 5: Source Doc Cleanup

- [x] **5.1** Review lean-canvas.md — Problem and Solution sections complete
- [x] **5.2** Review definitions.md — all core concepts present
- [x] **5.3** Review roadmap.md — links to definitions instead of explaining concepts

### Phase 6: /kdd Update

- [x] **6.1** Update knowledge-type mapping table
- [x] **6.2** Add behavior: /kdd identifies which docs need updates
- [x] **6.3** Add guardrails (no concept duplication, warn on drift)

---

## Verification

After implementation:

1. ✅ **No duplication:** "overestimate how clearly" only in lean-canvas.md
2. ✅ **Links work:** All new links in README/CLAUDE.md resolve correctly
3. ✅ **Rename complete:** No references to `domain-model.md` remain
4. ✅ **/kdd knows rules:** Updated with doc architecture and guardrails

---

## Success Criteria

- [x] No concept duplication across docs
- [x] README.md and CLAUDE.md only contain links to concepts, not explanations
- [x] domain-model.md renamed to definitions.md, all references updated
- [x] /kdd identifies which docs need updates and proposes changes
- [x] New vision docs (v9, v10...) have clear integration path

---

## Future Work (Not In Scope)

**v8 Integration** — After this consolidation is complete, evaluate whether/how to integrate v8 concepts into definitions.md. Separate task to allow reflection on best approach.

**Vision Docs Consolidation** — Review v0, v7, v8+ for overlap and decide on structure (single VISION.md vs. separate docs with clear roles). **This is a collaborative task** — requires reflection and decisions together with user, then user consolidates. Not for autonomous execution.

---

## Related

- [definitions.md](../docs/definitions.md)
- [lean-canvas.md](../docs/lean-canvas.md)
- [visions/v8_clarity_working_document_v0.1.md](../../../docs/visions/v8_clarity_working_document_v0.1.md)
