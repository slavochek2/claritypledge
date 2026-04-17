---
status: qa
type: bug
severity: high
date_reported: 2026-04-11
date_resolved: 2026-04-11
delivery_stage: fix
pipeline_ran: [fix]
root_cause: clarity_docs SELECT RLS blocks receivers (not owner/public) so PostgREST inner-join silently dropped every row; getUnreadLetterCount queried letter_deliveries directly and still saw rows
resolution: Replaced PostgREST join queries in getInboxItems with a SECURITY DEFINER RPC (get_inbox_items) that bypasses RLS for the narrow inbox fields; authorization gate ensures caller can only query own inbox
tags: []
rank: 1000684.0
created_date: 2026-04-11
---

# P690: Inbox Phantom Count — RLS Join Drops Letter Rows

## Bug Description

**Reported:** 2026-04-11
**Severity:** High (blocks P683 UAT — inbox unusable for letter receivers)

**Symptoms:**
- Letters inbox tab shows `(1)` but renders empty state
- Unread-count badge shows `1` (or `3` in earlier session)
- Console shows `getInboxItems` returning 0 rows despite `getUnreadLetterCount` returning `1`

**Reproduction steps:**
1. Send/seal a one-to-one letter to a receiver account
2. Receiver opens the letter (TOS consent flow completes)
3. Receiver navigates to `/letters?tab=inbox`
4. Expected: tab shows `(1)` and list shows the letter row
5. Actual: tab shows `(1)` from `getUnreadLetterCount` but list is empty — `getInboxItems` returns 0 rows

## Root Cause

`getInboxItems` uses PostgREST inner-join to fetch doc title:
```ts
.from('letter_deliveries')
.select('*, clarity_letters!inner(source_doc_id, sender_id, clarity_docs!inner(title), ...)')
```

`clarity_docs` SELECT RLS (`20260326100454_p551_clarity_docs.sql:49-52`) allows only `owner_id = auth.uid() OR visibility = 'public'`. Receivers are neither → inner join drops all rows for sealed private letters.

`getUnreadLetterCount` queries `letter_deliveries` directly with no doc join → still sees the row → phantom count.

The `letter_story_snapshots` table has no `title` column and `clarity_letters` also has no title — so "drop the join and read from snapshot" is not viable.

## Resolution

Replace the two PostgREST queries in `getInboxItems` with a single `SECURITY DEFINER` RPC `get_inbox_items(p_user_id UUID)` that bypasses RLS for the narrow fields needed. Authorization check inside the function: `IF p_user_id != auth.uid() THEN RAISE EXCEPTION`.

Mirrors the P642 pattern (`get_letter_for_reading_by_token`).

**Files changed:**
- `supabase/migrations/YYYYMMDDHHMMSS_p690_inbox_items_rpc.sql` (new)
- `src/app/data/letters-service.ts:678-743` (rewrite `getInboxItems`)

**Regression test:** `e2e/integration/p690-inbox-count-list-parity.spec.ts`

**Context:** See `~/.claude/plans/elegant-wondering-sifakis.md` for full architecture rationale.

## Acceptance Criteria

- [ ] Migration creates `get_inbox_items(UUID)` SECURITY DEFINER RPC
- [ ] RPC authorization gate: non-owner call raises exception
- [ ] `getInboxItems` rewrites to use RPC; returns `InboxItem[]`
- [ ] Inbox tab count and list row count match for receiver with 1 letter
- [ ] Empty inbox: user with no letters sees `(0)` and empty state
- [ ] Count parity: RPC result count matches `getUnreadLetterCount` on test DB
- [ ] No TypeScript errors (`tsc --noEmit`)
- [ ] Pre-commit checks pass
