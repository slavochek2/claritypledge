---
status: backlog
type: story
rank: 10.0
workstream: C1
tags: [stories, edit, delete, ux]
prepped_date: '2026-02-24'
delivery_stage: ux-review
reviews:
  ux: null
  architect: null
  alignment: null
created_date: 2026-02-24
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

## UX

### Lean Scope Correction

The spec says "edit title and body text" in two places. This is incorrect: stories have no title field. The `Story` type has `title?: string` (optional), and the service interface documents stories as content-only — "no title, stories are just text." The `Scope` section and `Acceptance Criteria` both reference "title" but there is nothing to edit. **Corrected scope: edit `content` only (the story body text).** The acceptance criteria item "Author can edit title and body of their own story" should be read as "Author can edit the story content (body text)."

---

### Flows

#### Flow 1 — Edit Story Content

**Entry point:** "Edit" button in the author-only section below the `StoryCardDetail`, on the same row as the `VisibilitySelector`. Placed to the right of the Visibility row so the two author controls are co-located and the pattern is consistent (inline below the card, never inside the card itself).

**Interactions:**

1. Author lands on `/story/:id` and sees the story card.
2. Below the card (author-only section): Visibility selector on left, Edit + Delete buttons on right.
3. Author clicks "Edit". The story body text inside `StoryCardDetail` is replaced by a `Textarea` pre-filled with `story.content`. The card border changes to `border-blue-400` to signal edit mode. Save and Cancel buttons appear below the textarea.
4. Author edits text. Character count shown (soft limit nudge at 2000 chars, hard max at 10000 — same pattern as `AddPointForm`; actual limits TBD at architect stage, but UX shows the counter).
5. Author clicks Save:
   - Button shows "Saving…" with `Loader2` spinner.
   - On success: textarea replaced with updated text, toast "Story updated", edit mode exits.
   - On failure: toast "Failed to save. Try again.", textarea stays open with current edits intact.
6. Author clicks Cancel: discard changes, exit edit mode immediately (no confirmation needed — low stakes).
7. Keyboard: `Cmd+Enter` / `Ctrl+Enter` submits if content is non-empty. `Escape` cancels.

**Unsaved-changes guard:** If the author navigates away (back button, router navigation) while edit mode is active with unsaved changes, show the browser's native `beforeunload` prompt. React Router navigation within the SPA uses `useBlocker` to show an inline confirmation: "You have unsaved changes. Leave anyway?" — two buttons: "Stay" (focused by default) and "Leave".

**Empty content validation:** Save is disabled if `content.trim().length === 0`. Tooltip on disabled Save: "Story can't be empty."

---

#### Flow 2 — Delete Story

**Entry point:** "Delete" button in the author-only section below the `StoryCardDetail`, on the same row as the Visibility selector and Edit button.

**Interactions:**

1. Author clicks Delete.
2. Confirmation dialog opens (reuses `Dialog` from `@/components/ui/dialog`, same pattern as `RemovePositionDialog`).
   - Title: "Delete this story?"
   - Body: "This will permanently remove your story. Points linked to this story will not be deleted — others may still hold positions on them."
   - If story has linked points (N > 0), add: "This story has N linked point(s)."
   - Footer: Cancel (outline, focused by default) | Delete story (destructive/red).
3. Author clicks "Delete story":
   - Button shows "Deleting…" with spinner, both buttons disabled.
   - On success: dialog closes, user is navigated to their profile (`/p/:authorSlug`) with a success toast: "Story deleted."
   - On failure: dialog stays open, toast "Failed to delete. Try again.", both buttons re-enabled.
4. Author clicks Cancel or presses Escape: dialog closes, story unchanged.

---

### Screen Layout — Author View (ASCII)

```
┌─────────────────────────────────────────────────┐
│ ← Back                                          │
│                                                 │
│ ┌─────────────────────────────────────────────┐ │  ← StoryCardDetail (unchanged)
│ ║ [Avatar]  Name · Ear badge                  ║ │
│ ║           2d ago                            ║ │
│ ║                                             ║ │
│ ║  Story content text here...                 ║ │
│ ║                                             ║ │
│ ║  0 understood      [Share ↗]               ║ │
│ ╠═════════════════════════════════════════════╣ │
│ ║  ▶ 2 points by Name            [Share ↗]  ║ │
│ └─────────────────────────────────────────────┘ │
│                                                 │
│  ← author-only section ──────────────────────→ │
│                                                 │
│  Visibility: [Private] [Shared] [Public]        │  ← VisibilitySelector (existing)
│                                    [Edit] [Delete] │  ← NEW: inline, right-aligned
│                                                 │
│  ┌── Key Points ───────────────────────────┐   │
│  │  [+ Add a Point]                        │   │
│  └─────────────────────────────────────────┘   │
└─────────────────────────────────────────────────┘
```

**Edit mode — story content replaced with textarea:**

```
┌─────────────────────────────────────────────────┐
│ ┌─────────────────────────────────────────────┐ │
│ ║ [Avatar]  Name · Ear badge                  ║ │  ← border-blue-400 (edit mode indicator)
│ ║           2d ago                            ║ │
│ ║                                             ║ │
│ ║  ┌───────────────────────────────────────┐  ║ │
│ ║  │ Story content text here...            │  ║ │  ← Textarea (pre-filled, focused)
│ ║  │                                       │  ║ │
│ ║  │                         123 / 10000   │  ║ │  ← char count
│ ║  └───────────────────────────────────────┘  ║ │
│ ║                  [Cancel]  [Save  ▶]        ║ │  ← Save primary (blue), Cancel ghost
│ └─────────────────────────────────────────────┘ │
│                                                 │
│  Visibility: [Private] [Shared] [Public]        │
│                                    [Edit] [Delete] │
└─────────────────────────────────────────────────┘
```

**Delete confirmation dialog:**

```
┌─────────────────────────────────────┐
│  Delete this story?                 │
│                                     │
│  This will permanently remove your  │
│  story. Points linked to this story │
│  will not be deleted — others may   │
│  still hold positions on them.      │
│                                     │
│  This story has 2 linked point(s).  │  ← conditional
│                                     │
│  [Cancel]        [Delete story]     │
│   (outline,        (destructive,    │
│    focused)         red)            │
└─────────────────────────────────────┘
```

---

### Edit and Delete Triggers — Placement Rationale

The author-only section already has the `VisibilitySelector` rendered inline below the card. The `Edit` and `Delete` buttons are placed on the same row but right-aligned, keeping all author controls in one visual band. This avoids adding new sections/rows and is consistent with the existing pattern of non-intrusive author controls.

Alternative considered: overflow menu (three-dot) in the card header. Rejected — the card header is shared between author and non-author views; adding an overflow menu only for authors adds complexity and hides the action. Inline is more discoverable for a low-frequency action.

Alternative considered: buttons inside the card itself. Rejected — `StoryCardDetail` is a shared display component; adding author-only mutation controls inside it would complicate the component and its props interface.

---

### Component Design

**`EditStoryForm`** (inline, inside `story-detail-page.tsx` — not a separate file):
- Props: `storyId`, `initialContent`, `onSave(newContent)`, `onCancel`
- State: `content` (string), `isSaving` (bool)
- Renders inside the `StoryCardDetail` card area when edit mode is active (passed as a prop `editMode / onEditSave / onEditCancel` to the card, OR rendered as a replacement of the card's content area — see Implementation Note below)

**`DeleteStoryDialog`** (inline, inside `story-detail-page.tsx`):
- Props: `open`, `linkedPointCount`, `onConfirm`, `onCancel`, `isDeleting`
- Reuses `Dialog / DialogContent / DialogHeader / DialogFooter` from `@/components/ui/dialog`
- Same structure as `RemovePositionDialog`

**Implementation note on edit mode rendering:** The cleanest approach is to keep `StoryCardDetail` unchanged and render the `EditStoryForm` as a replacement card in the same position when edit mode is active — swapping the component in `story-detail-page.tsx` rather than threading edit props into `StoryCardDetail`. This preserves the card component's single responsibility.

---

### Edge Cases

| Case | Behavior |
|---|---|
| Save fails (network error) | Toast "Failed to save. Try again." Textarea stays open with user's edits intact. Save button re-enabled. |
| Delete fails (network error) | Toast "Failed to delete. Try again." Dialog stays open, buttons re-enabled. |
| Empty content on save | Save button disabled. Tooltip: "Story can't be empty." |
| Navigate away with unsaved edits | `useBlocker` intercepts SPA navigation. Browser `beforeunload` for hard refreshes. Prompt: "You have unsaved changes. Leave anyway?" with Stay (default focus) / Leave. |
| Delete story with no linked points | Dialog shows warning without the "N linked point(s)" line. |
| Concurrent edit (tab open twice) | Last save wins. No special handling needed — content is short, collision risk is minimal. |
| Story deleted while edit form is open | Not a real race condition (same user, same tab). Not handled. |

---

### Accessibility

- **Edit button**: `aria-label="Edit story"`. When edit mode activates, focus moves to the Textarea automatically (`autoFocus` or `useEffect` + `ref.focus()`).
- **Save button**: `aria-label="Save story"`. Disabled state uses `disabled` attribute (not just visual styling).
- **Cancel button**: `aria-label="Cancel editing"`. `Escape` key also cancels.
- **Delete button**: `aria-label="Delete story"`. Color alone does not convey danger — label is explicit.
- **Confirmation dialog**: focus trap inside dialog (handled by Radix `Dialog`). Focus lands on Cancel button by default (safer default for destructive action). After dialog closes on cancel, focus returns to Delete button. After successful delete, user is navigated away so focus management is moot.
- **After save**: focus returns to the story content area (or the Edit button). Toast is announced via `sonner` which uses `role="status"`.
- **Keyboard nav**: Tab order within edit mode — Textarea → Cancel → Save. `Cmd+Enter` submits. `Escape` cancels.
- **Screen reader**: `aria-busy="true"` on Save button during save. `aria-live="polite"` region for character count.
