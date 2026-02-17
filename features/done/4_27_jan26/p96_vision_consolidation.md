---
status: backlog
type: task
prep_status: ready
prep_date: 2026-01-25
prep_by: /prep-spec
reviews:
  ux: skipped
  architect: warnings
  tea: skipped
open_questions: 0
blindspots: 0
execution: /loop
decisions:
  v0_fate: move (delete original after promotion)
  v8_evaluation: deferred (separate work)
  p6.1_task: removed (known reference material)
tags: []
rank: 125340.0
created_date: 2026-01-25
---

# P96: Philosophy & Theory of Change Docs

**Status:** Complete
**Created:** 2026-01-25

---

## Why Now

After P94 (doc architecture refactor), we have clear source docs:
- `definitions.md` — Core concepts (Stories, Points, Verification)
- `lean-canvas.md` — Problem, Solution, Business model
- `hypotheses.md` — What we're testing
- `roadmap.md` — Build sequence

**Missing:** Clear docs for philosophy and theory of change.

Currently in `visions/` folder:
- v0 = Theory of Change (cascade, √N) — should be promoted
- v7 = Philosophy (epistemology) — should become `philosophy.md`
- v8 = Latest exploration — relationship to v7 unclear
- v1, v2, v3, v5 = Historical explorations — keep in visions/

---

## The Insight

| Term | What it means | Doc |
|------|---------------|-----|
| **Philosophy** | WHY this works (epistemology, meta-epistemology) | `philosophy.md` (from v7) |
| **Theory of Change** | HOW change spreads (cascade, √N, network effects) | `theory-of-change.md` (from v0) |
| **Roadmap** | WHAT we're building (product phases) | `roadmap.md` (exists) |

**Key distinction:**
- `roadmap.md` = what **we** build
- `theory-of-change.md` = how **change spreads** once it exists

---

## Current State of Visions Folder

| File | Lines | Contains |
|------|-------|----------|
| `v0_theory-of-change.md` | 303 | Cascade, √N, 7-stage cascade, Facilitation Ladder |
| `v0.1 training model.md` | 458 | Training model details (needs rename) |
| `v1_vision-meme-platform.md` | 182 | Early meme platform idea |
| `v2. tournament _ theory.md` | 596 | Tournament/scaling (needs rename) |
| `v3_ai_orchestration.md` | 652 | AI orchestration vision |
| `v5_sensemaking_platform_synthesis.md` | 264 | Stories/Points origin story |
| `v7_communicative_critical_rationalism.md` | 307 | Epistemology, Asymmetric Conversion |
| `v8_clarity_working_document_v0.1.md` | 296 | Latest framework exploration |
| `p6.1_intuitive_trust_building.md` | 1023 | Published preprint (DOI: 10.5281/zenodo.14548583) — reference material |
| 2 PDFs | - | External reference material |

---

## Tasks

### Phase 1: Decide v7 ↔ v8 relationship (collaborative)

**Recommendation:** Option A — `philosophy.md` = v7, v8 stays as exploration

| Doc | Role | Rationale |
|-----|------|-----------|
| v7 → `philosophy.md` | Settled epistemological foundation | The "why" — Asymmetric Conversion, Understanding Imbalance |
| v8 → stays in visions/ | Ongoing exploration | Labeled "v0.1 Working Document" — still evolving |
| v8's process → maybe definitions.md later | Operational "how" | The 12-step framework is more operational than philosophical |

**Decision:** ✅ Accepted — v7 → philosophy.md, v8 stays as exploration, defer v8 evaluation

- [x] **1.1** Confirm v7 → philosophy.md ✓
- [x] **1.2** Confirm v8 stays as exploration ✓
- [ ] **1.3** Deferred: evaluate if v8's process belongs in definitions.md (separate work)

### Phase 2: Create philosophy.md

- [x] **2.1** Create `docs/philosophy.md` based on decisions ✓
- [x] **2.2** Keep v7 in visions/ as source/historical ✓

### Phase 3: Promote theory-of-change.md

- [x] **3.1** Move `visions/v0_theory-of-change.md` → `docs/theory-of-change.md` (delete original) ✓
- [x] **3.2** Update files with links to v0 (CLAUDE.md, lean-canvas.md, roadmap.md, hypotheses.md, etc.) ✓

### Phase 4: Cleanup visions folder

- [x] **4.1** Rename files with bad names: ✓
  - `v0.1 training model.md` → `v0.1_training_model.md`
  - `v2. tournament _ theory.md` → `v2_tournament_theory.md`
- [x] **4.2** `p6.1_intuitive_trust_building.md` identified as published preprint (DOI: 10.5281/zenodo.14548583) ✓
- [x] **4.3** Keep all historical docs in visions/ (don't archive) ✓

### Phase 5: Integration

- [x] **5.1** Update /kdd to manage new docs (also remove `docs/visions/` from exclusion list) ✓
- [x] **5.2** Update CLAUDE.md Deep Dive References ✓
- [x] **5.3** Update links in other docs (active docs updated, historical docs preserved) ✓

---

## Doc Architecture After This

**Source of truth docs:**
- `definitions.md` — Core concepts
- `lean-canvas.md` — Business model
- `hypotheses.md` — What we're testing
- `roadmap.md` — Build sequence
- `decisions.md` — Trade-offs
- `philosophy.md` — WHY this works (epistemology) ← NEW
- `theory-of-change.md` — HOW change spreads ← PROMOTED

**Explorations (stay in visions/):**
- Historical vision docs (v1, v2, v3, v5)
- Current explorations (v8+)
- Reference material (PDFs)

---

## Success Criteria

- [x] `philosophy.md` exists with clear epistemological foundation ✓
- [x] `theory-of-change.md` promoted to docs/ level ✓
- [x] v7/v8 relationship clarified ✓
- [x] visions/ folder cleaned up (renamed files, p6.1 noted as reference) ✓
- [x] /kdd and CLAUDE.md updated ✓
- [x] Clear separation: philosophy vs theory-of-change vs roadmap ✓
