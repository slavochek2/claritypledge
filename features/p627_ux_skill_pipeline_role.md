---
status: today
type: task
rank: 1000033.0
workstream: foundation
created_date: 2026-04-02
tags: [process, pipeline, skills, ux]
---

# TASK: Resolve /ux skill's role in the development pipeline

## Goal

The /ux skill generates text descriptions of flows, edge cases, accessibility, and responsive design. But the founder reacts to visuals (ASCII wireframes), not text descriptions. /ascii-flows produces 30 visual variants that force comparison and real design choices. /ux produces correct but generic output that gets overwritten when visuals are explored.

Current pipeline: `/create-prd → /challenge-prd → /ux → /architect → /ui → ...`

The question: should /ux be merged into /ascii-flows, become a post-visual checklist, or be dropped entirely?

## Options to Evaluate

**A) Merge /ux into /ascii-flows** — one skill that produces visual flows + edge cases + accessibility. /ascii-flows absorbs the checklist parts of /ux.

**B) /ux becomes a checklist** that runs AFTER /ascii-flows. Only adds what's missing (edge cases, accessibility, responsive) without redesigning flows. Doesn't generate flow descriptions — references the ASCII winner.

**C) Drop /ux entirely** — edge cases and accessibility move to /architect (security/a11y) and /ui (responsive/components). Visual design done exclusively in /ascii-flows.

## Context

- P581 session exposed the issue: /ux wrote flows, then ASCII flows produced better visuals, then 28-change revision made the /ux output stale
- The founder's design process is visual-first: react to concrete layouts, not text descriptions
- Edge cases and accessibility ARE valuable — the question is which skill produces them

## Done When

- [ ] Pipeline in CLAUDE.md updated with the resolved role
- [ ] /ux skill either modified, merged, or archived
- [ ] /ascii-flows skill updated if it absorbs /ux responsibilities
- [ ] One test run of the new pipeline on a feature spec to validate
