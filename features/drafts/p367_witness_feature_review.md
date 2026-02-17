---
status: draft
type: task
tags: []
rank: 125397.0
---
# P76: Witness Feature Review

**Status:** Planned (post-sprint cleanup)
**Decision:** Delete witness feature
**Timing:** After first event sprint (5-day build sequence)
**Effort:** ~2 hours
**Replacement:** P60 Verification Requests (already planned)

---

## Why Delete

| Problem | Impact |
|---------|--------|
| Anonymous (no account required) | Unverifiable, spam-prone |
| Confusing concept ("witness" = endorsement? verification? "I saw this"?) | Users don't understand it |
| Person-specific (witness *this person's* pledge) | Pledge text is identical for everyone |
| Doesn't fit product direction | No understanding demonstrated, just vague social proof |

**Core issue:** Witnessing doesn't demonstrate understanding. P60's Verification Requests already solve this properly.

---

## Current Implementation

### Database
```sql
create table public.witnesses (
  id uuid primary key,
  profile_id uuid references profiles(id),
  witness_name text not null,
  witness_linkedin_url text,
  witness_profile_id uuid references profiles(id),
  created_at timestamp
);
```

### Files to Delete
- `src/app/components/social/witness-card.tsx`
- `src/app/components/social/witness-list.tsx`
- References in `src/app/pages/pledge-page.tsx`
- References in `src/app/components/social/pledger-card.tsx`
- `addWitness()`, `getWitnesses()` in `src/app/data/api.ts`
- Table + RLS policies in `supabase/schema.sql`

---

## Execution Plan

### Pre-check
```sql
-- Check if anyone has used it
SELECT count(*) FROM witnesses;

-- If count > 0, archive first
\copy witnesses TO 'witnesses_backup.csv' CSV HEADER;
```

### Deletion Steps
1. Remove UI components (witness-card, witness-list)
2. Remove references from pledge-page and pledger-card
3. Remove API functions from api.ts
4. Migration: `DROP TABLE IF EXISTS witnesses CASCADE;`
5. Update/remove affected tests
6. Add entry to decisions.md

---

## Decision Log

| Date | Decision |
|------|----------|
| 2026-01-19 | Delete after sprint. P60 Verification Requests is the replacement. |
