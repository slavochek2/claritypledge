---
status: all-done
completed_at: 2026-04-17
type: task
rank: 1000679.0
created_date: '2026-04-10'
tags: [letters, drafts, deletion, database]
pipeline_ran: [create-spec, challenge-prd, dev]
---

# P680: Fix Draft Deletion — FK Blocker + Sealed Letter Guard

## Problem

**Situation:** Users can create drafts (clarity_docs), add stories, and send letters from them. The Drafts tab shows a Delete option in each card's `⋮` menu.

**Complication:** Clicking Delete always fails with "Couldn't delete draft." for any draft that has had a letter created from it — even a draft-status letter that was never sealed. Root cause: `clarity_letters.source_doc_id` has a NOT NULL FK to `clarity_docs(id)` with **no ON DELETE CASCADE**. The DB rejects the delete.

Additionally, there is no UX distinction between deletable drafts (no letters) and non-deletable drafts (sealed letters sent to receivers). Deleting a draft with sealed letters would destroy receiver data — ratings, predictions, point responses — without their consent.

**Question:** How do we make draft deletion work for safe cases and prevent it for unsafe cases, with clear UX feedback?

## Appetite

Medium blast radius (touches service layer and UI — no DB migration). Fully reversible (revert 3 files, no schema rollback). Low decision density — UX approach decided in pre-spec analysis (Option 2: disabled menu item with inline explanation).

## Solution

Three-layer fix:

### Layer 1: Service Method
- Update `docsService.deleteDoc()` to:
  1. Check if doc has any non-draft letters (`clarity_letters WHERE source_doc_id = docId AND status != 'draft'` — covers `sealed` AND `expired`)
  2. If yes → throw a specific error (not generic)
  3. If no → delete draft letters first (`clarity_letters WHERE source_doc_id = docId AND status = 'draft'`), then delete doc

### Layer 2: UI — Disabled Delete in Menu
- `DraftsTab`: before rendering the delete menu item, check if doc has non-draft letters
- If non-draft letters exist → render Delete as disabled with inline explanation text below it
- If no sealed letters → Delete works as before (confirmation dialog → delete)

### Data Flow

```
User clicks ⋮ on draft card
        │
        ▼
  Menu renders. Has non-draft letters? ──YES──→ Delete item DISABLED
        │                                     Gray text + subtext:
       NO                                     "Can't delete — letters
        │                                      were sent from this draft."
        ▼
  Delete item ENABLED (red)
        │
        ▼
  User clicks Delete → Confirmation dialog
        │
        ▼
  User confirms → docsService.deleteDoc(id)
        │
        ▼
  Service: query clarity_letters for this doc
        │
        ├── Has non-draft letters? → throw HasSealedLettersError
        │                         (should not happen — UI guards this)
        │
        └── No sealed letters → DELETE draft letters (status='draft')
                                 → DELETE doc (cascades doc_stories)
                                 → toast "Draft deleted"
```

## Implementation Guide

### Step 1: Add `has_sent_letters` to doc query

**File:** `src/app/data/docs-service.ts`

In `getDocsByUser()` (the method that feeds the Drafts tab), add a follow-up query to determine if each doc has non-draft letters (sealed or expired — any status that means "sent to receivers").

Supabase PostgREST doesn't support `EXISTS` subqueries in `.select()`. Fetch non-draft letter doc IDs in a separate query:

```typescript
// After fetching docs:
const docIds = docs.map(d => d.id);
if (docIds.length === 0) return docs; // guard: .in() with empty array is invalid SQL

const { data: sentLetters } = await supabase
  .from('clarity_letters')
  .select('source_doc_id')
  .in('source_doc_id', docIds)
  .neq('status', 'draft');  // catches sealed + expired + any future non-draft status

const sentDocIds = new Set(sentLetters?.map(l => l.source_doc_id) ?? []);
// Attach to each doc:
return docs.map(d => ({ ...d, has_sent_letters: sentDocIds.has(d.id) }));
```

**Type change:** Add `has_sent_letters: boolean` to `ClarityDoc` type in `src/app/types/index.ts`. This is a computed field, not a DB column.

### Step 2: Update `deleteDoc()` service method

**File:** `src/app/data/docs-service.ts` — `deleteDoc()` method (line ~559)

Replace the current simple delete with:

```typescript
async deleteDoc(docId: string): Promise<void> {
  await requireAuth();
  log('deleteDoc:', docId);

  // 1. Check for sealed letters — block if any exist
  const { data: sealedLetters, error: checkError } = await supabase
    .from('clarity_letters')
    .select('id')
    .eq('source_doc_id', docId)
    .neq('status', 'draft')
    .limit(1);

  if (checkError) {
    logDbError('deleteDoc:checkSealed', checkError);
    throw new Error('Failed to check letter status');
  }

  if (sealedLetters && sealedLetters.length > 0) {
    throw new Error('SEALED_LETTERS_EXIST');
  }

  // 2. Delete draft letters first (FK would block doc delete)
  const { error: draftDeleteError } = await supabase
    .from('clarity_letters')
    .delete()
    .eq('source_doc_id', docId)
    .eq('status', 'draft');

  if (draftDeleteError) {
    logDbError('deleteDoc:deleteDraftLetters', draftDeleteError);
    throw new Error('Failed to clean up draft letters');
  }

  // 3. Now delete the doc (doc_stories cascade automatically)
  const { error } = await supabase
    .from('clarity_docs')
    .delete()
    .eq('id', docId);

  if (error) {
    logDbError('deleteDoc', error);
    throw new Error(`Failed to delete doc: ${error?.message}`);
  }
},
```

**Note on RLS:** The `clarity_letters` DELETE policy only allows deleting draft letters owned by the authenticated user. The `.eq('status', 'draft')` filter plus the RLS policy `"Sender can delete draft letters" USING (sender_id = auth.uid() AND status = 'draft')` ensures only the user's own draft letters are deleted. This is safe.

### Step 3: Update DraftsTab UI

**File:** `src/app/components/letters/drafts-tab.tsx`

**3a.** The `docs` state already holds the doc list. After Step 1, each doc will have `has_sent_letters: boolean`.

**3b.** In the `DropdownMenu` for each doc card (around line 162-189), modify the Delete `DropdownMenuItem`:

**Current (line 174-179):**
```tsx
<DropdownMenuItem
  className="text-destructive focus:text-destructive"
  onClick={() => setDeleteTarget(doc)}
>
  <Trash2 className="w-4 h-4" />
  Delete
</DropdownMenuItem>
```

**New:**
```tsx
<DropdownMenuItem
  disabled={doc.has_sent_letters}
  className={doc.has_sent_letters
    ? 'text-muted-foreground flex-col items-start gap-0.5'
    : 'text-destructive focus:text-destructive'}
  onClick={() => { if (!doc.has_sent_letters) setDeleteTarget(doc); }}
>
  <span className="flex items-center gap-2">
    <Trash2 className="w-4 h-4" />
    Delete
  </span>
  {doc.has_sent_letters && (
    <span className="text-xs text-muted-foreground pl-6">
      Can't delete — letters were sent from this draft.
    </span>
  )}
</DropdownMenuItem>
```

**Key UX details:**
- Disabled items should NOT be clickable (both `disabled` prop and guard in `onClick`)
- The subtext uses `text-xs text-muted-foreground` — smaller and lighter than the menu item text
- `pl-6` aligns the subtext with the "Delete" text (past the icon)
- No tooltip needed — the explanation is always visible when the menu is open (works on mobile too)

**3c.** Update the `handleDelete` error handler to catch the specific sealed-letters error:

```tsx
const handleDelete = async () => {
  if (!deleteTarget) return;
  setDeleting(true);
  try {
    await docsService.deleteDoc(deleteTarget.id);
    toast.success('Draft deleted');
    setDeleteTarget(null);
    fetchDocs();
  } catch (err) {
    if (err instanceof Error && err.message === 'SEALED_LETTERS_EXIST') {
      toast.error("Can't delete — letters were sent from this draft.");
    } else {
      toast.error("Couldn't delete draft.");
    }
  } finally {
    setDeleting(false);
  }
};
```

This is a safety net — the UI should prevent reaching this point, but defense-in-depth.

### Step 4: No DB migration needed

The fix is entirely in application code. No schema changes required:
- We do NOT change the FK constraint (leaving it as-is provides a safety net — if app code has a bug, the DB still blocks unsafe deletes)
- We do NOT add columns to `clarity_letters`
- We do NOT need `ON DELETE CASCADE` — the service handles draft letter cleanup

**Why no migration:** The FK constraint without cascade is actually a feature, not a bug. It prevents accidental deletion of docs that have sealed letters. The application code adds the intelligence to clean up draft letters and block when sealed letters exist.

## Risks / Non-Goals

### Risks

1. **Race condition:** User has compose page open (draft letter exists), another tab deletes the doc → compose page errors on seal. Mitigation: low risk in single-user product; seal RPC will fail cleanly with "letter not found."

2. **RLS blocks draft letter deletion:** The `clarity_letters` DELETE policy requires `sender_id = auth.uid() AND status = 'draft'`. If the authenticated user is the doc owner but somehow not the letter sender — deletion fails silently. Mitigation: in practice, doc owner and letter sender are always the same user. The `.eq('status', 'draft')` filter ensures we only touch draft letters.

3. **Extra query per Drafts tab load:** The sealed-letter check adds one query. Mitigation: query is lightweight (`SELECT source_doc_id FROM clarity_letters WHERE source_doc_id IN (...) AND status = 'sealed'`), indexed on `source_doc_id`.

### Non-Goals

- Do NOT add soft-delete or archive functionality (no `deleted_at` column, no "Archive" button — premature until Drafts clutter is a real user problem)
- Do NOT add `ON DELETE CASCADE` to the `clarity_letters.source_doc_id` FK — the hard FK constraint is a safety net
- Do NOT denormalize title into `clarity_letters` — not needed for this fix (revisit if we later implement Option B detach)
- Do NOT change the Sent tab — sealed letters are unaffected by this change
- Do NOT change any RPC functions — `seal_and_send_letter` is untouched
- Do NOT touch `story_verifications` — they are not involved in the delete path
- Do NOT add a migration file — this is purely application code

## Done-When

- [x] Deleting a draft with zero letters succeeds (toast: "Draft deleted", card disappears)
- [x] Deleting a draft with only draft letters (compose started, never sealed) succeeds — draft letters cleaned up, doc deleted
- [x] Deleting a draft with sealed or expired letters is blocked — Delete menu item is disabled with visible explanation text
- [x] The disabled state is visible without hovering (inline subtext, not tooltip-only) — works on mobile
- [x] Defense-in-depth: if the UI guard is bypassed, the service throws `SEALED_LETTERS_EXIST` and a toast explains why
- [x] Sent tab is unaffected — sealed letters still appear for sender
- [x] Inbox tab is unaffected — receivers still see their letters
- [x] No new migration file created

## Resolved Decisions

| # | Source | Finding | Resolution | Rationale |
|---|--------|---------|-----------|-----------|
| 1 | /challenge-prd | [BLOCK] Spec checks `sealed` but ignores `expired` status | Renamed to `has_sent_letters`, query uses `neq('status', 'draft')` | Forward-compatible — covers sealed, expired, and any future non-draft status |
| 2 | /challenge-prd | [BLOCK] File `drafts-tab.tsx` doesn't exist | False positive — file exists in w2 worktree, challenger searched wrong path | No change needed |
| 3 | /challenge-prd | [NOTE] Layer 1 (DB migration) contradicts Step 4 (no migration) | Removed Layer 1 entirely — leftover from Option B analysis | Solution is app-code only; FK constraint stays as safety net |
| 4 | /challenge-prd | [WARN] Appetite claims "migration adds column" | Fixed — Appetite now says "no DB migration" | Spec was written iteratively; Appetite was stale |
| 5 | /challenge-prd | [HQ-1] Empty `docIds` array crashes `.in()` | Added empty-array guard before the query | PostgREST `IN ()` generates invalid SQL |

## Rollback Strategy

Revert the 3 changed files (`docs-service.ts`, `drafts-tab.tsx`, `types/index.ts`). The original behavior (always-failing delete for docs with letters, working delete for docs without) is restored. No DB rollback needed.
