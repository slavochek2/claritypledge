---
status: backlog
type: task
rank: 98
created_date: '2026-08-19'
tags: [view, p748, dead-code, skills, spec-hygiene]
delivery_stage: create-spec
pipeline_ran: [create-spec]
driver: anomaly
---

# P1119: /view was closed as all-done unbuilt, leaving a retired path referenced 11 times

## Problem

**Situation:** P748 closed `all-done` on 2026-04-20. Verified this session:

| claim | measured |
|---|---|
| `src/app/components/_proto/` exists | **ABSENT** |
| `_proto` referenced in `view.md` | **10 times** |
| `_proto` referenced in `dev.md` | **1 time** (step 9.6) |
| specs carrying `view_locked:` | **0** (`grep -rl '^view_locked:' features/`) |

**Complication:** `/view`'s documented mechanism points at a directory that does not exist,
so any agent following it builds against a dead path. `view_locked` is described as a lock
but `dev.md` step 9.6 instructs `/dev` to **delete it** after integration — a lock the next
step in the pipeline removes by design is not a lock, and no spec has ever set it.

This matters now because the `/goalify` contract needs an approved **visual reference** for
visual specs, and `/view` is the obvious candidate mechanism. It cannot be one while its
path is retired. (`/goalify` deliberately names no tool for this reason.)

**Question:** rebuild `/view` against a real path, or retire it and name the replacement?

## Appetite

Low blast radius (skill docs + one dev step). Reversible. Medium decision density — whether
`/view` should exist at all is a founder call.

## Solution

Decide first, then act. If `/view` is rebuilt: point it at a path that exists and make
`view_locked` either enforced or deleted, not both. If retired: strip the 11 `_proto`
references, remove `dev.md` step 9.6, and record what produces a visual reference instead.

## Risks / Non-Goals

- **Do NOT** silently repurpose `view_locked` — either it blocks something mechanically or
  it goes.
- **Do NOT** make `/goalify` depend on `/view`. Goalify requires that a reference *exists
  and is approved*; it must not mandate the tool.
- **Risk:** P748's 17 unticked criteria may contain work still wanted. Read them before
  retiring.

## Done-When

- [ ] `grep -rn '_proto' .claude/commands/` returns only references to a path that exists,
      or returns nothing — output pasted
- [ ] `view_locked` is either enforced by a mechanism whose failure path has been watched,
      or absent from every skill file — grep output pasted
- [ ] P748's 17 criteria are each marked kept or dropped, with the dropped ones named
- [ ] The decision (rebuild vs retire) is recorded in `docs/decisions.md`

## Context

Filed while executing the `/goalify` plan (2026-08-19). Related: closing a spec `all-done`
with unchecked deliverables and no shipped-scope note is the pattern `docs/decisions.md`
2026-08-14 already rules against.
