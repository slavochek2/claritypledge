---
status: week
type: task
rank: 125500
workstream: foundation
created_date: 2026-02-26T00:00:00.000Z
tags:
  - process
  - claude-md
  - agents
locked_at: '2026-02-28T09:34:18.312Z'
delivery_stage: uat
---

# TASK: P441 — CLAUDE.md Audit (Reduce Size, Fix Instruction Dilution)

## Goal

CLAUDE.md has grown to ~575 lines (as of Mar 2026). Rules are diluting each other — the more that's added, the less each rule is weighted by the model. Audit the document, move path-specific directives to `.claude/rules/`, remove redundancy, and tighten what remains.

**Root cause identified:** Every gap found → rule added to CLAUDE.md → document grows → each rule gets less attention → more gaps → repeat. Can't fix instruction compliance by adding more instructions to the same document.

## Steps

1. **Research pass** — spawn agent to analyze what makes AI instruction docs effective at this scale; what patterns cause compliance to degrade; best practices for CLAUDE.md-style docs
2. **Audit pass** — for each rule in CLAUDE.md, classify:
   - Belongs here (universal, applies to all tasks)
   - Should move to `.claude/rules/X.md` (only fires for specific file paths)
   - Redundant (duplicates existing content — remove or link)
   - Too vague to apply consistently (rewrite or drop)
   - Not needed in 6 months (archive)
3. **Existing rules files to check for additions:**
   - `.claude/rules/src.md` — src/**
   - `.claude/rules/features.md` — features/**
   - `.claude/rules/database.md` — supabase/**
   - `.claude/rules/tests.md` — e2e/**, src/**/*.test.*
   - `.claude/rules/skills.md` already exists — check for misrouted skill rules still in CLAUDE.md
4. **Apply approved changes** — in a worktree (CLAUDE.md edits are high-blast-radius)
5. **Verify** — confirm agent behavior unchanged after reduction
6. **Improve /claude-md gate** — based on audit findings, add line-count awareness and tighter redirect defaults so the gate catches cumulative growth, not just per-change additions

## Done When

- [x] CLAUDE.md is under 300 lines of actual content (163 actual content lines, 352 total)
- [x] All path-specific directives live in `.claude/rules/` not CLAUDE.md
- [x] No duplicate rules (same constraint stated twice)
- [x] All remaining rules pass the universal test (>80% of task types need it)
- [x] /claude-md gate updated with line-count awareness and tighter redirect defaults

## Context

- Triggered by: P440 session where Decisive Action rule was violated because the `/claude-md` skill "suggest only" instruction overrode it. Structural instructions beat ambient ones.
- Related fix already done: `.claude/rules/src.md` inline-vs-skill threshold (P440 session)
- Related fix already done: `/claude-md` skill changed from "suggest only" to "apply when clear"
- See `docs/decisions.md` for prior CLAUDE.md architecture decisions
