---
status: done
type: bug
rank: 1000941
severity: high
workstream: C1
date_reported: '2026-06-30'
created_date: '2026-06-30'
tags: [security, p952-class, security-definer, privacy, letters, rls-bypass]
delivery_stage: ship
pipeline_ran: [create-bug]
completed_at: '2026-06-30'
---

# P977: get_letter_position_stories silently dropped its two-participant author whitelist (P952 class)

## Summary

`get_letter_position_stories(p_delivery_id)` — a `SECURITY DEFINER` RPC that bypasses RLS — lost its `AND sp.author_id IN (v_sender_id, v_receiver_id)` author whitelist when P964 recreated the function. The guard was the only thing confining returned position-stories to the delivery's two participants; without it, a story authored by an unrelated third party on a point that also appears in this letter's snapshot is returned to the caller. **Verified live in prod: 20 third-party-authored rows are currently returnable across 20 deliveries** (all public-visibility today; the guard that prevents *private* third-party stories from leaking is gone). Same mechanism as P952/P975: a recreate from a base that predated the guard, with a header that names only unrelated changes.

## Root Cause

P904 introduced `get_letter_position_stories` in two migrations, both carrying the whitelist and an explicit privacy comment:

`supabase/migrations/20260618100000_p904_letter_position_stories_rpc.sql` (and unchanged in `20260618110000_p904_position_stories_avatar_tags.sql`):

```sql
  WHERE sp.point_id IN ( SELECT DISTINCT (pt->>'id')::UUID
                         FROM letter_story_snapshots lss ... WHERE lss.letter_id = v_letter_id )
  -- Only return stories authored by the letter's two participants.
  -- Prevents leaking private stories from unrelated users who happen
  -- to have filed a story on the same point outside this letter.
  AND sp.author_id IN (v_sender_id, v_receiver_id);
```

P964 (`supabase/migrations/20260626120000_p964_position_stories_delivery_scope.sql`) did `DROP FUNCTION ... ; CREATE FUNCTION ...` and replaced the inclusion whitelist with an **exclusion** predicate:

```sql
  -- P964 D3 (#2): exclude sender's stories server-side.
  AND sp.author_id != v_sender_id
  -- P964 D3 (#1): delivery-scope receiver stories via letter_point_responses.
  AND ( sp.author_id != v_receiver_id
        OR EXISTS (SELECT 1 FROM letter_point_responses lpr
                   WHERE lpr.delivery_id = p_delivery_id AND lpr.point_id = sp.point_id) );
```

For an unrelated author X (X ≠ sender, X ≠ receiver) both conjuncts are satisfied (`X != sender` → true; `X != receiver` → true, short-circuiting the OR). X's row passes. The P964 header claims only two changes — "(1) Cross-letter phantom… (2) Sender story leaks client-side" — and never mentions removing the two-participant author bound; the protective comment was deleted along with the clause. The `_is_letter_participant(p_delivery_id)` gate only authorizes the **caller**, not which authors' rows are returned, so it does not compensate. `SECURITY DEFINER` + `SET search_path = ''` means RLS on `stories` (including `visibility='private'`) is bypassed.

**Prod verification (Management API SQL, read-only, `.env.prod`):**
- `pg_get_functiondef` of the live function: whitelist absent (`author_id IN (v_sender_id, v_receiver_id)` → not present), P964 exclusion present, returns `author_avatar_url`/`author_has_pledged`/`content`/`tags`.
- Replicating the live function's returnable set: **20 rows authored by a non-participant** across **20 deliveries**; **0** are `private` today (the single globally point-shared story happens to be public). Latent private exposure remains: the guard that blocks private third-party stories is gone.

## Reproduction Steps

1. Sender A authors a story containing point P and seals a one-to-many letter L; P lands in `letter_story_snapshots` for L.
2. Unrelated user X (not a participant of any delivery in L) files a position-story S on the same point P (`story_points` row with `author_id = X`), with `stories.visibility = 'private'`.
3. A legitimate participant of delivery D in L (so `_is_letter_participant(D)` passes) calls `get_letter_position_stories(D)`.
4. Observe: X's row passes both P964 conjuncts → X's private `content`, `author_name`, `author_avatar_url`, `author_avatar_color`, `author_has_pledged`, and `tags` are returned to the caller.

**Reproduction rate:** 100% whenever a snapshot point carries a third-party-authored story (point reuse across users — the premise P964's own bug #1 establishes). Live prod currently returns 20 such rows (public-only today).

## Expected Behavior

The RPC returns only position-stories authored by the delivery's two participants (sender + receiver), as P904 guaranteed. A third party's story on a shared point is never disclosed, regardless of `stories.visibility`.

## Actual Behavior

Any `story_points` row whose point is in the letter snapshot and whose author is neither the sender nor the receiver is returned to the caller, exposing that third party's story content, author identity, avatar, and pledge status — and, once a private story lands on a shared point, private content. RLS does not save us (SECURITY DEFINER bypass).

## Affected Files

- `supabase/migrations/20260626120000_p964_position_stories_delivery_scope.sql` — the recreate that dropped the whitelist (current/latest definition; live in prod)
- `supabase/migrations/20260618100000_p904_letter_position_stories_rpc.sql` — original definition with the whitelist + privacy comment
- `supabase/migrations/20260618110000_p904_position_stories_avatar_tags.sql` — whitelist still present here
- Live prod function `public.get_letter_position_stories(uuid)` — confirmed missing the whitelist

## Severity

**High** — a documented privacy guard on a SECURITY DEFINER (RLS-bypassing) RPC was silently removed; cross-user story data is disclosed to letter participants today (20 rows live, public), and the protection against leaking *private* third-party stories is entirely gone (latent confidentiality breach the moment a private story lands on a shared point). No auth boundary remains between "shares a point" and "shares a letter."

## Fix Approach

Re-apply the P904 author whitelist on top of P964's current body, preserving both P964 fixes:

```sql
  AND sp.author_id IN (v_sender_id, v_receiver_id)   -- restored P904 two-participant bound
  AND sp.author_id != v_sender_id                    -- P964 #2 (sender exclusion) → net: author = receiver only
  AND ( sp.author_id != v_receiver_id
        OR EXISTS (SELECT 1 FROM letter_point_responses lpr
                   WHERE lpr.delivery_id = p_delivery_id AND lpr.point_id = sp.point_id) );
```

Note the whitelist + sender-exclusion together reduce the visible set to receiver-authored, delivery-scoped stories — confirm against the P904/P964 product intent (the pair-visible "View story" dialog) before finalizing the exact predicate. Add a regression guard mirroring `src/tests/p975-letter-scope-gate.test.ts`: assert the latest migration redefining `get_letter_position_stories` contains the author-participant bound, so a future recreate cannot silently drop it again. Per the epistemic gate "Exercise a gate's failure path before trusting it," confirm the regression test FAILS against the current P964 definition before it's wired in.

## Acceptance Criteria

- [ ] `get_letter_position_stories(D)` returns only stories authored by the delivery's two participants — a third-party author's row on a shared snapshot point is never returned (unit/integration test with a 3-author point)
- [ ] A `private`-visibility story authored by a non-participant is never returned, even when its point is in the letter snapshot
- [ ] Both P964 behaviors preserved: sender's own stories excluded server-side; receiver stories delivery-scoped via `letter_point_responses` (no cross-letter phantom)
- [ ] Regression test asserts the latest migration defining the function contains the author-participant bound; the test fails on the pre-fix (P964) definition and passes post-fix
- [ ] Prod re-verification after deploy: the replicated returnable set yields 0 non-participant-authored rows
