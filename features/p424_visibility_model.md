---
id: p424
title: Visibility Model Rethink
type: story
status: backlog
workstream: C1
tags: [visibility, privacy, stories, rls]
created_at: 2026-02-24
---

## Problem

The current visibility model conflates "private" with "author-only," which is confusing and limits sharing intent.

Additionally:
- "Shared" is not enforced — it currently behaves like "private" (deferred implementation).
- The UI order is not intuitive (defaults to Public on the left).
- The default visibility is Public, which is a privacy risk for new users.

## Proposed Model

| Level   | Meaning                                                              |
|---------|----------------------------------------------------------------------|
| Private | Author manually controls who sees it (person-by-person sharing). Not author-only — others can be granted access explicitly. |
| Shared  | All attendees of the associated event can see it automatically.      |
| Public  | Anyone (logged in or not) can see it.                                |

## Scope

### 1. RLS Policy Update

- `private`: author + explicitly granted users (grant table or similar mechanism TBD at architect stage).
- `shared`: author + all users who attended the same event (join via `event_attendees` or equivalent).
- `public`: no restriction (current behavior).

### 2. "Shared" Enforcement Fix

Currently `shared` behaves like `private` — the RLS policy for `shared` is not implemented. This spec fixes that: attendees of the associated event must be able to read shared stories.

### 3. UI Order Change

Left → right order must be: **Private → Shared → Public** (currently defaults to Public first).

### 4. Default Visibility Change

Change default from `public` to `private` — safer default for new stories.

### 5. UI Copy Update

- Labels and tooltips must reflect the new mental model.
- "Private" tooltip: "Only people you explicitly share with can view this."
- "Shared" tooltip: "All attendees of this event can view this."
- "Public" tooltip: "Anyone can view this."

## Out of Scope

- Per-user explicit grant UI (P-by-P sharing UI for Private) — this spec only fixes the model and RLS. The grant UI can be a follow-on spec.
- Notification to attendees when a story is shared.

## Acceptance Criteria

- [ ] RLS policies updated for all three visibility levels.
- [ ] `shared` stories are readable by event attendees (not just the author).
- [ ] UI toggle order is Private → Shared → Public.
- [ ] Default visibility for new stories is `private`.
- [ ] Tooltip copy matches the new mental model.
- [ ] Existing `public` and `private` stories are unaffected in intent (data migration not required unless schema changes demand it).
