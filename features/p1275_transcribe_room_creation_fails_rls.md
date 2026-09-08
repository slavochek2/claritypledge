---
status: week
type: bug
rank: 1000082
severity: high
workstream: transcription
date_reported: '2026-09-08'
created_date: '2026-09-08'
drafted_by: opus
exec_model: opus
exec_effort: high
tags: [transcribe, rls, regression, migration]
disclosure: public
delivery_stage: create-bug
pipeline_ran: [create-bug]
---

# P1275: Creating an ad-hoc `/transcribe` room fails with a raw RLS violation

## Summary

`createRoom()` inserts into `transcribe_rooms` with `.select().single()`, and since
[P1207](done/2026-06-10/p1207_adversarial_permission_audit_before_agent_api.md) narrowed that table's SELECT policy to members-only the read-back is
refused inside its own INSERT — so starting a new `/transcribe` room throws
`new row violates row-level security policy` instead of creating one. Joining an existing room is
unaffected.

## Root Cause

`INSERT … RETURNING` is evaluated under the **SELECT** policy for the row it just wrote. P1207
replaced `transcribe_rooms`' `USING (true)` SELECT policy with:

```sql
USING (EXISTS (SELECT 1 FROM transcribe_room_members m
               WHERE m.room_id = transcribe_rooms.id AND m.profile_id = auth.uid()))
```

At the instant a room is created its creator is **not yet a member** — `joinRoom()` runs on the
next line. So the INSERT's own `WITH CHECK (true)` passes, the row is written, and then `RETURNING`
fails the SELECT policy and the whole statement aborts.

The INSERT policy is not the problem and does not need touching. The narrowing itself is correct
and must stay — it closed a room-code enumeration hole, and `code` is a join credential.

**This exact trap is already documented on the sibling call.** `transcribe-service.ts:170` carries a
long comment explaining why `joinRoom()` deliberately does *not* use `.insert().select().single()`.
It was found there, worked around there, and nobody checked the create path in the same file.

### What is verified, and how

- **Mechanism** — reproduced directly in SQL on the **test** database (2026-09-08, P1236 session):
  same user, same table, same row, `SET LOCAL ROLE authenticated` — the insert **without**
  `RETURNING` succeeds, the insert **with** it fails.
- **Prod carries the identical policy** — read off prod's own `pg_policy` catalog on 2026-09-08.
  `transcribe_rooms` has exactly three policies: INSERT `WITH CHECK (true)`, UPDATE member-scoped,
  and SELECT `room members can read their rooms` (member-scoped). There is no `USING (true)` read
  policy left. Prod is therefore affected by construction — stated as an inference from an identical
  policy shape, **not** as an independent prod reproduction. Nothing was written to prod.
- **Weak corroboration, labelled as weak:** prod's last `transcribe_rooms` row was created
  `2026-09-01 13:40:45Z` and none since. That is consistent with the breakage and equally consistent
  with nobody using prod `/transcribe` for a week. It is not evidence on its own.

### Surface spread — checked mechanically, one instance

The dangerous shape is not "a cross-table SELECT policy". It is the **inverted** one: a policy on a
*parent* table that reads a *child* row which does not exist until after the insert. A policy that
reads an already-existing parent (`story_points` → `stories`) is safe.

All 16 cross-table SELECT policies in prod's `public` schema were enumerated from `pg_policy` and
classified. **`transcribe_rooms` → `transcribe_room_members` is the only inverted one**, and it is
the only one of the 16 whose table is also written by an `.insert(…).select(…)` chain in the data
layer. The other seven `.insert().select()` call sites in `src/` target `clarity_chat_messages`,
`witnesses`, `clarity_docs`, `clarity_letters`, `stories`, `clarity_live_invites` and `membership`.
The first five have no cross-table SELECT policy at all — they read their own row. The last two do
(`clarity_live_invites` → `clarity_sessions`, `membership` → `organization`) but both read an
already-existing **parent**, so the referenced row is there before the insert. None is inverted.

So this bug has exactly one surface today. Query and classification belong in the fix commit so the
check is repeatable — see Fix Approach.

## Invariants

- **The member-scoped SELECT policy on `transcribe_rooms` stays.** Widening it back — even
  conditionally, even "just for the creator" via a permissive `OR` — reintroduces the enumeration
  hole P1207 closed. The fix must not touch that policy.
- **A room and its creator's membership are created together or not at all.** A room row with no
  members is unreachable by its own creator (they cannot read it) and cannot be ended (the UPDATE
  policy is member-scoped). That state must not be representable.
- **`profile_id` is never an argument to a `SECURITY DEFINER` function.** It comes from
  `auth.uid()`. A definer function that accepts the identity it is about to write is an
  impersonation primitive. (Established by `join_transcribe_room` in P1236.)
- **Room code stays server-unguessable and client-generated-then-retried, or moves server-side
  deliberately — not by accident.** Whatever the fix does, a unique-violation on `code` must still
  result in a retry with a fresh code rather than a surfaced error. (P1097 made the generator a
  CSPRNG; do not regress that.)

## Reproduction Steps

1. Sign in as any verified user.
2. Navigate to `/transcribe`.
3. Enter a display name and start a new room (the create path, **not** "join with a code").
4. Observe: the room is not created.

**Reproduction rate:** 100% on any database where migration `20260901160000` is applied — which is
both prod and test.

## Expected Behavior

A signed-in user starting a new `/transcribe` room gets a room with a fresh code, is joined to it as
its first member, and lands in the room view.

## Actual Behavior

The insert aborts and the raw Postgres message reaches the user:

```
new row violates row-level security policy for table "transcribe_rooms"
```

The founder saw this verbatim during the P1236 live phone run. Two failures compound: the feature
does not work, and the error surfaced is untranslated database text rather than anything a
participant can act on.

## Affected Files

- `src/app/data/transcribe-service.ts:113-145` — `createRoom()`; the `.insert(…).select(…).single()`
  chain at 120-124 is the failing statement. The retry loop around it treats every non-`23505`
  error as fatal, so the RLS failure exits through `throw new Error(error.message)` — that is where
  the raw text comes from.
- `supabase/migrations/20260901160000_p1207_transcribe_rooms_code_enumeration.sql` — the SELECT
  policy narrowing. Correct; named here as the origin, not as something to revert.
- `supabase/migrations/20260823190000_p1149_transcribe_room_tables.sql:53-56` — the
  `WITH CHECK (true)` INSERT policy that lets the write half succeed.
- `src/app/pages/transcribe-room-page.tsx` — the caller that surfaces the raw error.

## Severity

**High** — the primary entry point to `/transcribe` is broken for every user on prod, and has been
since 2026-09-01. Not critical: no data loss, no security exposure (the failure is a refusal), and
joining an existing room by code still works, so a room created before the regression is still
usable.

## Fix Approach

A `SECURITY DEFINER` function that creates the room and its first member in one statement, mirroring
`join_transcribe_room` (P1236) — same reasoning, same shape, opposite direction.

```
create_transcribe_room(p_code text, p_display_name text, p_session_id uuid, p_event_id uuid)
  → returns the room row and the member row
```

- Derives `profile_id` from `auth.uid()`; raises on NULL.
- Verifies the `clarity_sessions` row belongs to the caller — `join_transcribe_room` learned this
  the hard way; the old direct-INSERT policy never checked `session_id`, so a caller could attach
  another user's recording session to their own seat.
- Lets a `23505` on `code` propagate unchanged so the existing client-side retry loop still works.
- `REVOKE ALL … FROM PUBLIC`, then `GRANT EXECUTE … TO authenticated`. **Not** `anon` — and verify
  the grant afterwards off `pg_proc`, because `REVOKE … FROM PUBLIC` does not remove a role-direct
  grant (P1065; hit again in P1236).

**Rejected — insert-then-read split.** This is the fix used on the join path in P1149 and recorded
in [decisions.md](../docs/decisions.md) 2026-09-08 as not applicable here. Re-checked rather than
inherited: it *would* now work mechanically, because `get_transcribe_room_by_code()` is
`SECURITY DEFINER` and can read the room back for a non-member. It is still rejected, on the
Invariants above: it leaves a window in which a room exists with no members, which is a state the
UPDATE policy makes unrecoverable. The definer function removes the window rather than narrowing it.

**Rejected — loosening the SELECT policy.** Reintroduces the enumeration hole. See Invariants.

**Also in scope: the raw error.** `createRoom` should not forward Postgres text to the UI. Whatever
the failure, the user gets a sentence; the detail goes to the console.

**Ship the repeatable check with the fix.** The classification query above (cross-table SELECT
policies, inverted ones flagged) is what makes "one surface today" a fact rather than a hope, and
without it the next policy narrowing repeats this. Land it as a script under `scripts/`, run against
the local schema. It does not need to gate a commit to be worth having.

### Interaction with P1236 — read before starting

P1236 (`feature/p1236-server-side-live-transcription`, in `w5`, unshipped) rewrites `createRoom`'s
signature to `createRoom(profileId, displayName, consentGiven, eventId?)` and adds
`transcribe_room_members.consent_given_at`, which the join RPC writes server-side.

**Fix this on a branch off `main`, without a consent parameter** — the column does not exist on
`main`, and prod breakage should not wait on a spec that still needs a prod deploy and three founder
decisions. P1236 then extends `create_transcribe_room` with `p_consent` the same way it extended
joining. The reconciliation cost is one `CREATE OR REPLACE` and one call-site argument; the
alternative is holding a live prod bug behind an unfinished feature.

## Acceptance Criteria

- [ ] A signed-in user can start a new `/transcribe` room and lands in it, with their own name in
      the roster
- [ ] The creator is a member of the room immediately — the roster is non-empty and the room can be
      ended by them
- [ ] No room row can exist without at least its creator's membership row
- [ ] A room-code collision still retries with a fresh code rather than surfacing an error
- [ ] A caller passing a `session_id` belonging to another user is refused
- [ ] `create_transcribe_room` is executable by `authenticated` and **not** by `anon`, verified
      against `pg_proc.proacl` rather than against the `GRANT` statement in the migration
- [ ] `transcribe_rooms`' SELECT policy is unchanged by this fix — enumeration stays closed
- [ ] No raw Postgres error text reaches the UI on any create failure
- [ ] Regression test fails before the fix and passes after: `e2e/p1275-*.spec.ts` (or an
      integration test that exercises the RLS path — the failure is server-side, so a jsdom unit
      test cannot reproduce it)
- [ ] No console errors during the create flow
