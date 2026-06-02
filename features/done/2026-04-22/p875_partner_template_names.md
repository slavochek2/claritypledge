---
status: all-done
type: task
rank: 1000900
created_date: '2026-06-02'
tags:
  - content
  - partner-template
completed_at: 2026-06-02
flow: inline
pipeline_ran: [ship]
---

# P875 — Partner Template example names → Einstein / Mother Teresa

## Problem

The public `/partner-template` example used placeholder names (Alex Walker /
Jordan Rivera) that no longer matched the st8 story image, which uses
recognizable illustrative figures.

## Solution

Set the example partners to **Albert Einstein** and **Mother Teresa**. The
signature initials (AE / MT) derive automatically from the names — no avatar
code. This aligns the live template with the st8 agreement image.

## Scope / Non-Goals

- Names only. Avatars stay as initials — real photos were rejected
  (copyright + publicity-rights exposure on a public page; Einstein's
  likeness is actively licensed).
- Also refreshed 4 pre-existing `p508` e2e assertions that broke when the
  oath went to v4 + the hero copy changed ("My Promise", terms text, removed
  "customizable" hint, strict-mode title) — surfaced while verifying, not
  caused by this change.

## Done-When

- [x] `/partner-template` renders "We, Albert Einstein and Mother Teresa, agree to:"
- [x] `p508` e2e suite green (8/8)
- [x] pre-commit checks pass
