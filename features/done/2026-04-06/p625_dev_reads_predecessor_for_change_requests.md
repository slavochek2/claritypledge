---
status: all-done
type: task
rank: 1000033
workstream: foundation
created_date: 2026-04-02T00:00:00.000Z
tags:
  - process
  - skills
  - change-request
locked_at: '2026-04-05T07:49:10.912Z'
---

# P625: /dev Should Read Predecessor Spec for Change-Requests

## Problem Statement

When `/dev` implements a `type: change-request` spec, it reads only the provided spec. It does not automatically read the predecessor spec (linked via `changes: pN`). This means the implementing agent lacks context about what was originally built, why decisions were made, and what the redesign is correcting.

## Solution

Add to `/dev` skill (Step -1: Context Load): "If spec has `type: change-request` and `changes: pN`, also read the predecessor spec at `features/done/**/pN_*.md` (or `features/pN_*.md` if not yet shipped). This gives the agent both the original design intent and the redesign corrections."

~5 lines in `.claude/commands/slava/build/dev/SKILL.md`.

## Acceptance Criteria

- [x] `/dev` reads predecessor spec when `type: change-request` and `changes:` field exists
- [x] Agent reports: "Reading predecessor P{N} for context: {path}"
- [x] If predecessor not found, warn but don't block
