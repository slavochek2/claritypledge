---
status: backlog
type: story
rank: 10.0
workstream: C1
tags: [stories, edit, delete, ux]
prepped_date: '2026-02-24'
delivery_stage: prd-review
reviews:
  ux: null
  architect: null
  alignment: null
---

# P427: Story Edit and Delete

## Problem

Once a story is filed — via the AI loop (P425/P419) or the legacy blank form — the content is immutable. There is no way to:
- Edit the story title or body text after creation
- Delete a story the author no longer wants published

The only post-creation change currently available is visibility (P424). This creates a trust problem: authors who file a story and notice a mistake, or who change their mind, have no recourse.

Note: visibility editing is handled by P424 and is explicitly out of scope here.

## Scope

- **Edit story content**: author can change title and body text of their own story
- **Delete story**: author can delete their own story, with a confirmation step
- Author-only access (RLS already enforces UPDATE and DELETE on `stories` table using `auth.uid() = author_id`)

## Out of Scope

- Editing visibility (P424)
- Editing extracted points linked to the story (separate concern)
- Story versioning or edit history

## Constraints

- No new tables needed — `updateStory()` already handles content fields; `deleteStory()` existence TBD at architect stage
- Deleting a story removes `story_points` links but **points are NOT deleted** — points are shared objects; other users may have positions on them
- Must not affect positions staked on linked points (position is a separate record)
- Editing story content does NOT retroactively update extracted points — points are independent objects once extracted. If a user wants to "correct" a point, the flow is: remove position → file a new story → extract a corrected point → stake fresh position. P427 does not need to smooth this path.

## Acceptance Criteria

- [ ] Author can edit title and body of their own story
- [ ] Author can delete their own story with a confirmation prompt (reuses the existing confirmation dialog pattern — currently used when removing a position warns about point link removal; same dialog, different content)
- [ ] Non-author cannot edit or delete another user's story (enforced by RLS)
- [ ] Deleting a story removes or handles story↔point links (no orphaned links)
- [ ] Positions on linked points are unaffected by story deletion

## Dependencies

- No blockers from the filing chain (P424, P425, P419) — can be built in parallel
- If shipping after P425: edit UI likely lives on the same `story-detail-page.tsx` that P424 modifies; coordinate to avoid conflicts

## Next Steps

1. Run `/architect features/p427_story_edit_delete.md` — check if `deleteStory()` exists, cascade behavior, edit UI placement
2. Run `/dev features/p427_story_edit_delete.md`
