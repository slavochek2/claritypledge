---
status: backlog
type: story
rank: 10.0
workstream: C1
tags: [stories, edit, delete, ux]
prepped_date: '2026-02-24'
delivery_stage: arch-review
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

---

## Technical

### Technical Analysis

#### Service Layer — What Already Exists

Both required service operations are fully implemented in `src/app/data/stories-service-real.ts`:

**`updateStory(storyId, { content?, tags?, visibility? })`** (line 418)
- Issues a Supabase `.update()` on the `stories` table filtered by `id`
- Already handles `content` as an optional update field — no changes needed
- RLS enforces `auth.uid() = author_id` — non-authors receive a silent Supabase error (0 rows updated, no error thrown, but `.single()` returns null)
- Returns the updated `Story | null`

**`deleteStory(storyId)`** (line 494)
- Issues a Supabase `.delete()` on the `stories` table filtered by `id`
- Returns `boolean` — true on success, false on error
- RLS enforces author-only delete
- Cascade behavior: `story_versions` (ON DELETE CASCADE) and `story_points` (ON DELETE CASCADE) are cleaned up automatically by the database — no application-level cascade logic needed

**Cascade chain confirmed from `20260204_stories_points_calibration.sql`:**
- `story_versions.story_id` → `REFERENCES stories(id) ON DELETE CASCADE`
- `story_points.story_id` → `REFERENCES stories(id) ON DELETE CASCADE`
- `points` rows are NOT deleted — `story_points` entries are deleted, but the underlying `points` records (and any `positions` on them) survive intact. This matches the spec requirement.

#### UI Layer — What Exists

**`story-detail-page.tsx`** (`src/app/pages/story-detail-page.tsx`):
- Already has the author-only section (`isAuthor &&`) at lines 771–786 containing `VisibilitySelector` and `KeyPointsSection`
- `VisibilitySelector` already calls `storiesService.updateStory(storyId, { visibility })` — the same service method that will be used for content edits
- `story` state is `StoryWithPoints | null` — updating it locally after a successful save is straightforward: `setStory(prev => prev ? { ...prev, content: newContent } : prev)`
- Imports already include `Textarea`, `Loader2`, `Button`, `toast`, `useNavigate` — no new imports needed beyond `useBlocker`

**`StoryCardDetail`** (`src/app/components/social/StoryCardDetail.tsx`):
- Pure display component, no mutation logic
- `cardClassName` uses `border-l-blue-500` as the fixed left border; edit mode will require a full border change to `border-blue-400` — this means the edit form will render as a replacement card, not mutate `StoryCardDetail`'s classes. This is the correct approach (UX spec agrees: "swap the component")
- No changes to `StoryCardDetail` needed

**`RemovePositionDialog`** (`src/app/components/shared/remove-position-dialog.tsx`):
- Uses `Dialog / DialogContent / DialogHeader / DialogTitle / DialogDescription / DialogFooter` from `@/components/ui/dialog`
- The `DeleteStoryDialog` will follow the exact same structure — same imports, same pattern, different copy

**Character limits:** `AddPointForm` uses `POINT_CHAR_SOFT = 140` and `POINT_CHAR_MAX = 500` for points. Stories are longer-form; UX specifies soft nudge at 2000, hard max at 10000. These are new constants, defined in the page file alongside the form.

**React Router version:** `react-router-dom@^7.13.0` — `useBlocker` is available in React Router v6.7+ and v7.x. No version constraint issue.

---

### Architecture Decisions

**Decision 1: Inline components in `story-detail-page.tsx` vs. separate files**

- **Chosen:** Both `EditStoryForm` and `DeleteStoryDialog` live as functions inside `story-detail-page.tsx`, consistent with how `AddPointForm`, `VisibilitySelector`, `KeyPointsSection`, and `BackButton` are all defined in the same file.
- **Rationale:** The page file already uses this pattern for all author-only controls. These components are tightly coupled to the page's state (`story`, `setStory`, `navigate`) and are not reused anywhere else. Keeping them co-located reduces indirection with no meaningful downside.
- **Trade-off:** The page file grows longer (~180 lines added). Acceptable — the existing 792-line file already demonstrates this is a deliberate pattern, not an oversight.
- **Alternative rejected:** Separate `edit-story-form.tsx` and `delete-story-dialog.tsx` files — adds file overhead and import chains for single-use components. UX spec explicitly says "inline, inside story-detail-page.tsx — not a separate file."

**Decision 2: Card swap pattern for edit mode (not prop-threading into `StoryCardDetail`)**

- **Chosen:** In edit mode, render a replacement card `<EditStoryCard>` in place of `<StoryCardDetail>`. The `story-detail-page.tsx` holds `isEditMode` boolean state and conditionally renders one or the other.
- **Rationale:** `StoryCardDetail` is a shared display component used in profile pages, point detail pages, and story detail. Threading edit-specific props (`editMode`, `onEditSave`, `onEditCancel`, `isSaving`) into it would pollute its interface with concerns that only apply in one of its three usage contexts. The replacement-card pattern keeps the separation clean.
- **Trade-off:** The edit card must reproduce the card's header section (avatar, author name, timestamp, border styling) to look like a seamless replacement. ~30 lines of markup duplication. Acceptable — the alternative (prop-threading) creates ongoing maintenance burden in a widely-used component.
- **Alternative rejected:** Threading `editMode` as a prop into `StoryCardDetail` — violates single-responsibility, complicates future consumers of the component.

**Decision 3: Optimistic vs. pessimistic update for edit save**

- **Chosen:** Pessimistic update — update local state only after a confirmed successful API call. Keep `isSaving` spinner visible during the save. On success, call `setStory(prev => ...)` to update the displayed content.
- **Rationale:** Content edits are not high-frequency (unlike position clicks where optimistic UX matters). The save takes under 500ms on a good connection. Pessimistic is simpler to reason about: no rollback logic needed. Consistent with how `VisibilitySelector` already works in the same file.
- **Trade-off:** ~300–500ms where the textarea shows the spinner before the card re-renders. Acceptable — the UX spec anticipates this with the "Saving…" button state.
- **Alternative rejected:** Optimistic update — swaps the card back to read-mode immediately and reverts on failure. Adds a revert path that increases complexity for minimal UX gain on a low-frequency action.

**Decision 4: Post-delete navigation target**

- **Chosen:** Navigate to `/p/:authorSlug` (author's profile) after successful delete. Use `story.authorSlug` which is already in the loaded `story` state.
- **Rationale:** The story detail page is now a dead URL after deletion. The profile is the most natural landing place — it shows the author's remaining stories. The UX spec mandates this exact target.
- **Trade-off:** If the user landed on the story via a direct link (no prior navigation in the SPA), Back would not return to the story anyway — navigating to profile is a safe fallback in all cases.
- **Alternative rejected:** `navigate(-1)` (go back in history) — unreliable if the user landed directly on the story URL, and would navigate to a broken URL.

**Decision 5: `useBlocker` for SPA navigation guard**

- **Chosen:** Use `useBlocker` from `react-router-dom` to intercept SPA navigation when edit mode is active and `content !== initialContent`. Display an inline confirmation (`"You have unsaved changes. Leave anyway?"`) with Stay (default focus) / Leave buttons. Also attach a `beforeunload` event listener for hard refresh / tab close.
- **Rationale:** React Router v7 provides `useBlocker` precisely for this use case. `beforeunload` alone only covers hard navigations. The blocker handles SPA navigation (clicking Back, navigating to another route). The UX spec explicitly calls for both.
- **Trade-off:** `useBlocker` must be cleaned up correctly — it should only be active when `isEditMode && isDirty` (content has changed from initial). The blocker registration is conditional on both flags.
- **Alternative rejected:** `window.confirm()` inside a `useEffect` cleanup — does not intercept React Router navigation, only works for full page unload.

---

### Security Review

**RLS Policies:**

- ✅ UPDATE policy exists and is author-scoped: `"Authors can update own stories" ON stories FOR UPDATE USING (auth.uid() = author_id)` — enforces author-only updates at DB level.
- ✅ DELETE policy exists and is author-scoped: `"Authors can delete own stories" ON stories FOR DELETE USING (auth.uid() = author_id)`.
- ✅ `story_points`, `story_versions`, `story_verifications`, and `story_point_history` all have `ON DELETE CASCADE` from `stories(id)`. No application-layer cascade needed.
- ✅ Points are NOT cascade-deleted — junction rows only. Points survive story deletion as required.
- ✅ `visibility` is backed by a `story_visibility` ENUM type — invalid values rejected at DB type level.
- ⚠️ UPDATE RLS policy has no `WITH CHECK` clause. Safe for P427 (service never sends `author_id` in payload), but worth documenting. Low priority.

**Authentication:**

- ✅ `isAuthor = story.authorId === user?.id` computed in the page; edit/delete controls render only within `{isAuthor && (...)}`. Correct UI-layer gate.
- ✅ Page waits for `authLoading` to settle before fetching — prevents visibility race condition.
- ⚠️ `updateStory()` and `deleteStory()` rely on RLS for enforcement without a pre-flight `getUser()` check. A session expiry mid-edit surfaces as "Failed to save" rather than "You've been logged out." Minor UX gap, not a security hole.

**Input Validation:**

- ⚠️ No DB-level content length constraint on `stories.content`. The 10,000-char hard limit is UX-only. **Action: add `CHECK (char_length(content) <= 10000)` migration.**
- ⚠️ No "content is plain text only" policy enforced in code. Currently safe (story content is rendered as text, never as raw markup), but implicit. **Action: document the policy.**
- ✅ `storyId` is a UUID via parameterized query — SQL injection not possible.

**Data Protection:**

- ✅ All cascade deletes verified at schema level — no orphaned records after story deletion.
- ⚠️ `story_versions` has `SELECT USING (true)` — fully public. After an edit, old content remains readable in `story_versions`. **Action: disclose in delete confirmation dialog ("Previous versions will also be removed").**
- ✅ Positions on linked points are unaffected — cascade stops at `story_points`, does not reach position tables.

**Summary of items requiring action:**

| Severity | Item |
|---|---|
| Medium | Add DB `CHECK (char_length(content) <= 10000)` migration |
| Medium | Disclose in delete dialog that previous story versions are also removed |
| Low | `updateStory()` / `deleteStory()` lack auth pre-check (rely on RLS silent no-op) |
| Low | UPDATE RLS missing `WITH CHECK` clause |
| Low | Document "content is plain text only" policy |

---

### Implementation Approach

#### Files to Create

None. All new components are inline functions in the existing page file, following the established pattern.

#### Files to Modify

| File | Change |
|------|--------|
| `src/app/pages/story-detail-page.tsx` | Add `EditStoryCard` and `DeleteStoryDialog` inline components; add `isEditMode`, `editContent`, `isDeleting`, `deleteDialogOpen` state to `StoryDetailPage`; update author-only section to render edit mode card swap and delete dialog; add `useBlocker` + `beforeunload` guard; add `handleSave` and `handleDelete` handlers; add analytics events for `story_edited` and `story_deleted` |

No other files require modification. The service layer (`stories-service-real.ts`, interface, mock) already supports both operations. `StoryCardDetail.tsx` is unchanged.

#### Build Sequence

1. Add state variables to `StoryDetailPage`: `isEditMode`, `editContent`, `isDeleting`, `deleteDialogOpen`
2. Implement `EditStoryCard` inline component — textarea, char count (STORY_CHAR_SOFT = 2000, STORY_CHAR_MAX = 10000), Save/Cancel buttons, keyboard shortcuts (`Cmd+Enter`, `Escape`)
3. Implement `handleSave` handler — calls `storiesService.updateStory(story.id, { content })`, updates local `story` state on success, exits edit mode
4. Add `useBlocker` guard — active when `isEditMode && editContent !== story.content`; add `beforeunload` listener in the same `useEffect`
5. Implement `DeleteStoryDialog` inline component — reuses `Dialog / DialogContent / DialogHeader / DialogFooter` from `@/components/ui/dialog`, shows linked point count from `story.points.length`
6. Implement `handleDelete` handler — calls `storiesService.deleteStory(story.id)`, navigates to `/p/${story.authorSlug}` on success
7. Update author-only section JSX: swap `StoryCardDetail` → `EditStoryCard` when `isEditMode`; add Edit + Delete buttons on same row as `VisibilitySelector`; mount `DeleteStoryDialog`
8. Add analytics tracking: `story_edited` (with `story_id`, `char_count`) and `story_deleted` (with `story_id`, `linked_point_count`)
