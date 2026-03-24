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

## Business Layer (from /create-prd)

| Header | Level | Notes |
|--------|-------|-------|
| `## Problem Statement` | 2 | Not "Problem", not "Issues" |
| `## Business Requirements` | 2 | |
| `## User Stories` | 2 | |
| `## Jobs to Be Done` | 2 | |
| `## Acceptance Criteria` | 2 | **Always level-2, never nested** under Business Requirements |
| `## Out of Scope` | 2 | |

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
