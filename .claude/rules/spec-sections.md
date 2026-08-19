---
paths:
  - "features/**/*.md"
---

# Canonical Spec Section Names

All build skills must use these exact headers when generating or searching for spec sections. No synonyms, no variants.

Existing specs may use older header variants (e.g., `## UX Requirements`, `## Technical Analysis` as level-2, `## Testing`). Old specs are updated opportunistically (when next edited), not batch-migrated.

**For skills that WRITE:** Always use canonical names below. No exceptions.

**For skills that READ (especially /spec-review):** Search for canonical names first. If not found and the spec's `created_date` predates 2026-03-24, check common legacy aliases before issuing a BLOCK:
- UX layer: also check `## UX Requirements`, `## UX Flow`, `## Screen Designs`
- Technical layer: also check `## Technical Analysis` (as level-2), `## Technical Requirements`, `## Technical Specification`
- Test layer: also check `## Testing`, `## Test Automation Strategy`, `## Testing Strategy`

## Skeleton Layer (from /create-spec — all spec types)

| Header | Level | Notes |
|--------|-------|-------|
| `## Problem` | 2 | SCQ format recommended for complex problems; flat statement OK for simple ones |
| `## Appetite` | 2 | Blast radius + reversibility + decision density (not time estimates) |
| `## Solution` | 2 | For implementation work. Use `## Approach` for research/investigation |
| `## Approach` | 2 | Alternative to Solution — for research specs where solution is the deliverable |
| `## Risks / Non-Goals` | 2 | Combined section. Non-Goals are highest-leverage for AI agent constraints |
| `## Done-When` | 2 | Observable completion signals, checkbox format |

## Expansion Modules (type-specific, added to skeleton)

| Header | Level | Work types | Notes |
|--------|-------|-----------|-------|
| `## Acceptance Criteria` | 2 | Feature | **Always level-2, never nested** |
| `## UX Notes` | 2 | Feature | Interaction patterns, states |
| `## UI Contract` | 2 | Feature (UI) | Exact strings, colors, measurements |
| `## Alternatives Considered` | 2 | Infrastructure, Refactor | Trade-off analysis |
| `## Rollback Strategy` | 2 | Infrastructure, Migration | How to undo |
| `## Research Questions` | 2 | Research | Numbered, specific |
| `## Time Box` | 2 | Research | Maximum investment |
| `## Deliverable` | 2 | Research | Output format |
| `## Migration Plan` | 2 | Migration | Step-by-step execution |
| `## Data Integrity Check` | 2 | Migration | Verification after migration |

## Business Layer (from the legacy create-prd skill — now product-owner enrichment, not yet built)

| Header | Level | Notes |
|--------|-------|-------|
| `## Problem Statement` | 2 | Legacy alias for `## Problem`. Skills that READ should check both |
| `## Business Requirements` | 2 | |
| `## User Stories` | 2 | Product-owner enrichment (skill not yet built) — not at spec creation |
| `## Jobs to Be Done` | 2 | Product-owner enrichment (skill not yet built) — not at spec creation |
| `## Out of Scope` | 2 | Legacy alias for Non-Goals section in `## Risks / Non-Goals` |

## UX Layer (from /ux)

| Header | Level | Notes |
|--------|-------|-------|
| `## UX Design` | 2 | Not "UX Requirements", not "Screen Designs" |

## Technical Layer (from /architect)

| Header | Level | Notes |
|--------|-------|-------|
| `## Technical Architecture` | 2 | **Parent heading** for entire technical layer |
| `### Technical Analysis` | 3 | Subsection — current code state, dependencies |
| `### Architecture Decisions` | 3 | Subsection — patterns, trade-offs |
| `### Security Review` | 3 | Subsection — RLS, auth, validation |
| `### Implementation Approach` | 3 | Subsection — how to build |
| `#### Build Sequence` | 4 | Under Implementation Approach |
| `#### Files to Create` | 4 | Under Implementation Approach |
| `#### Files to Modify` | 4 | Under Implementation Approach |

## UI Layer (from /ui)

| Header | Level | Notes |
|--------|-------|-------|
| `## Component Strategy` | 2 | |

## Test Layer (from /generate-tests)

| Header | Level | Notes |
|--------|-------|-------|
| `## Test Coverage Strategy` | 2 | Not "Test Automation Strategy", not "Testing" |

## Task Layer (from /decompose)

| Header | Level | Notes |
|--------|-------|-------|
| `## Implementation Tasks` | 2 | |

## Deploy (from /architect or manual)

| Header | Level | Notes |
|--------|-------|-------|
| `## Pre-deploy Checklist` | 2 | Not "Deployment Checklist" |

## Ephemeral Sections (cross-cutting, lifecycle-managed)

These sections are generated during the pipeline but have a finite lifespan. Each has an **owner skill** responsible for removing it.

| Header | Level | Created by | Removed by | Rule |
|--------|-------|-----------|-----------|------|
| `## Next Steps` | 2 | /create-spec | Next skill that runs | Remove when the listed steps are no longer actionable (check `delivery_stage`) |
| `## Open Questions for /X` | 2 | /create-spec or founder | Skill /X when it runs | Skill /X reads the questions, incorporates answers into its section, then deletes the Open Questions block |
| `## Challenge Notes` | 3 (subsection) | /ux, /architect, /ui | /spec-review | /spec-review consolidates all Challenge Notes into its findings. Non-blocking notes that were addressed by later sections should be removed by the skill that addressed them |
| `## Resolved Decisions` | 2 | /challenge-prd | Never (permanent) | Persists resolved BLOCK/WARN decisions for downstream reference |

**Rule for all write-skills:** After appending your section, check for ephemeral sections you own (per table above) and remove them. This is part of your write contract — not a separate cleanup step.
