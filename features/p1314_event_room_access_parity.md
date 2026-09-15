---
status: week
type: bug
rank: 100
tags: [security, events, rls, anon-grant]
disclosure: embargo
created_date: 2026-09-14
driver: anomaly
flow: inline
delivery_stage: create-bug
pipeline_ran: [create-bug]
drafted_by: opus
exec_model: opus
exec_effort: high
---

# P1314 — The event room's registration wall is in the browser only; the database grants the same capability to anyone

## Problem

**Situation.** `/events/:slug/room` renders `EventRoomGate`, which shows a register-or-sign-in wall
and deliberately reveals nothing about the room otherwise. A visitor who is not registered for the
event and not signed in cannot see a practice room code through the product.

**Complication.** `get_practice_room_codes(uuid)` performs **no authorization check of any kind**.
It is `SECURITY DEFINER`, `GRANT EXECUTE ... TO anon`, and returns every active practice room's code
for whatever `event_id` it is handed. The anon key it requires ships inside the public JavaScript
bundle, and event ids are public. So the wall constrains the product experience and constrains
nothing else.

**Question.** Should the database enforce the access rule the UI already enforces?

### The founder's framing, verbatim

> "but somebody cna join evnet room witout registering for event which is resitering for cp
> acocunt? they are prevented to open event room page? or not? i mean there is front page that
> says you need to be registered?"

> "what do you mena - anybody who can open eent page would evict a gust? why would we allow that?"

The answer to the second question is that nobody decided to allow it. Two decisions collided.

### This is a gap between two decisions, not a decision

- **2026-08-17** — P1057 D-A, a recorded founder decision: practice room codes stay published.
  `events-service-real.ts` still carries the comment: *"Publishing the capability to every visitor
  of a public event page IS the P406 feature — nobody is being excluded, which is the point of an
  event."* This is why the grant is open to `anon`.
- **2026-08-20** — P1114 rev2 ships. Its commit subject: *"gate + split pages, retire the anon room
  surface."* The registration wall. The product decision was reversed.
- **The grant was never brought along.** It is still exactly as P1057 left it.
- **2026-09-08** — P1058 accepts the seat-eviction residue *citing P1057's published-codes premise*,
  nineteen days after P1114 superseded it. The residue was accepted on a premise that had already
  stopped describing the product.

## Reproduction — measured on the TEST project, 2026-09-14

Everything below used only the **anonymous public key**. No account, no registration, no sign-in,
no privileged credential.

| Step | Action | Result |
|---|---|---|
| 1 | anon calls `get_practice_room_codes(event_id)` | returned the live room code |
| 2 | guest calls `claim_joiner_seat(code, "Real Guest")` | seat held, secret `2fcc…` issued |
| 3a | **control:** attacker calls `claim_joiner_seat(code, "Attacker")` | **REFUSED** — `cannot join this room`, HTTP 401 |
| 3b-i | anon reads `event_practice_rooms.session_id` | returned |
| 3b-ii | attacker calls `release_joiner_seat(session_id, code)` | **HTTP 204 — succeeded** |
| 3b-iii | attacker calls `claim_joiner_seat(code, "Attacker")` | **seat taken**, new secret `3c54…` |

Final row: `joiner_name: Attacker`. The guest's secret was dead. Claim to eviction: **29 seconds**.

**Step 3a is the control and is as important as the attack.** P1269's fix was applied on test and
it *worked* — it refused the direct claim exactly as designed. The defect is not that P1269 is
broken; it is that P1269 guards `claim_joiner_seat` while `release_joiner_seat` is authorized by the
room code alone, and in this room class the room code is reachable by anyone.

A second control fixes the probe itself: the same anonymous caller, same key, same request shape,
against `get_room_code_for_invite` (which *is* restricted to `authenticated`) returns **HTTP 401
`permission denied for function`**. One executes, one is refused — so the 200 is a real grant, not
an artefact of how the call was made.

Fixture rows created for this reproduction were deleted afterwards; no pre-existing row was touched.

## Appetite

**Blast radius: high, and narrow.** One grant and one function signature, but they sit on the
anonymous surface of a live product feature.
**Reversibility: high** — both halves are migrations; neither destroys data.
**Decision density: one, and it is already taken.** P1114 decided the access rule in August. This
spec implements it. It is not a new product decision.

## Solution

Two independent changes. Either alone is an improvement; together they close the path.

### D — make the database enforce the rule the UI enforces

`get_practice_room_codes` must require the caller to be a registered attendee of that event, the
same condition `EventRoomGate` applies. Preferred over revoking the grant outright, because the
`anon` path is what lets a signed-out attendee reach a room at all; the fix is a predicate, not a
revocation.

**This closes the disclosure of the code.** It does not by itself protect a room whose code leaked
some other way — P1098 records that a leaked code cannot be revoked.

### C — require the seat secret to LEAVE a seat, not only to take it

The eviction works because taking a seat is authorized by a private secret while leaving it is
authorized by a public code. `release_joiner_seat` must require the seat secret **when the seat
carries one**, falling back to the code only when `joiner_seat_secret IS NULL` (legacy seats, which
age out of the 15-minute presence window on their own).

**This closes the eviction regardless of who holds the code**, which is why it is worth doing even
after D. It needs a frontend half (the client must send the secret on release), so the database
half ships first and the app half second — `-- requires-frontend:` applies to the app-coupled
migration, not to the additive one.

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| A guest who cleared their browser cannot press "leave" | ACCEPT | They close the tab; the seat frees itself via the 15-minute presence window. The button is a convenience, not the only exit. |
| Legacy seats mid-session hold no secret, so C must fall back to the code for them | MITIGATE | Fall back only when `joiner_seat_secret IS NULL`. New seats always carry one, so the fallback shrinks to nothing within one session. |
| D changes who can reach a room, and could lock out a legitimate signed-out attendee | MITIGATE | Mirror `EventRoomGate`'s exact condition rather than inventing a stricter one. If the UI lets them in, the database must too. |
| Deploy window: between D's migration and the app half of C, behaviour is mixed | ACCEPT | Database-first ordering means the in-between state is harmless — a column or predicate nothing uses yet. App-first breaks joining outright. |

**Do NOT** revoke the `anon` grant wholesale — a signed-out attendee legitimately reaches rooms.
**Do NOT** change `claim_joiner_seat`'s authorization; P1269 already got that right, as the control proves.
**Do NOT** widen this into "make event rooms attendee-only" as a product change. That is a larger
question and this spec does not need it.

## Half C depends on P1269, which is not live — measured 2026-09-15

`joiner_seat_secret` is added by P1269's migration `20260911090000`, which is still on
`feature/p1269-guest-seat-reclaim-forgeable` and has not shipped. Queried through the Management
API, both projects, same statement:

```
TEST  ->  code, joiner_last_seen_at, joiner_name, joiner_seat_claimed_at, joiner_seat_secret
PROD  ->  code,                      joiner_name, joiner_seat_claimed_at
```

Three consequences, all binding:

1. **Half C cannot reach prod before P1269 does.** Its migration carries a precondition block that
   raises rather than installing a function that would 42703 on the first guest who leaves a room.
2. **Half C would be a no-op on prod even if it applied.** With no secret column every seat is a
   legacy seat, so every release would take the code fallback — exactly today's behaviour.
3. **Half D is therefore the only half that protects prod right now**, and on prod it is sufficient
   for this spec's reproduction: without published codes the anonymous attacker never reaches
   step 1, and the eviction chain has no entry point.

The app half of C has the same dependency. It must read the secret through
`src/app/data/seat-secret.ts`, which exists only on P1269's branch — so it is deliberately NOT
written here. Duplicating that module onto this branch would produce a write-never-read copy and
a certain add/add cherry-pick conflict (the P1147 shape, `.claude/rules/git.md`). See the
Pre-deploy Checklist.

## Done-When

- [x] An anonymous caller with no account receives **no room code** from `get_practice_room_codes`
      for an event they are not registered for — measured the same way as the reproduction above,
      with the `get_room_code_for_invite` control alongside it to prove the probe still discriminates.
      Verified on **test** 2026-09-14: anon 0 rows, `get_room_code_for_invite` 401 on the same key.
      `[post-deploy]` re-verify on prod once D applies.
- [x] A registered, signed-in attendee still receives the code — the false-positive half, run
      against the workflow `EventRoomGate` itself performs (epistemic gate 7c). Verified on test:
      registered attendee 1 row, host 1 row, signed-in-not-registered 0 rows.
- [x] The full reproduction above, re-run end to end, fails at step 1 or step 3b-ii. Verified on
      test 2026-09-15 — it now fails at **both**: D stops step 1, C stops step 3b-ii.
- [x] `release_joiner_seat` refuses a release that presents the room code but not the seat secret,
      when the seat carries a secret — and still accepts a legacy seat with no secret. Verified on
      test 2026-09-15, 16 checks, anonymous public key only:
      code-only 401 / wrong secret 401 / id-only 401, guest still seated after all three;
      legacy seat (secret nulled) releases on the code, HTTP 204.
- [x] A guest can still leave their own seat normally, anonymously, through the product —
      **database side verified**: secret-only release returns HTTP 204, the seat goes vacant and
      `live_state.joinerEnded` is still set for the creator. The CLIENT does not yet send the
      secret; that is the app half, blocked on P1269 (see above and the Pre-deploy Checklist).
- [x] Regression tests pin both halves, and each has been **seen to fail** against the unfixed
      code (epistemic gate 7) with the non-zero exit pasted into this spec. See Gate 7 evidence.

## Gate 7 evidence — each assertion seen to FAIL

Half C's verification block, run against three mutated bodies inside a rolled-back transaction on
test, then against the clean one. `EXIT` is the process status of the Management API call:

```
MUTATION 1  secret comparison removed (= P1058's body under the new signature)
            ERROR P0001: the secret comparison is gone from the anonymous arm —
                         release is code-authorized again                                 EXIT=1
MUTATION 2  fallback keyed on the ARGUMENT (p_seat_secret IS NULL) not the ROW
            ERROR P0001: the legacy fallback is no longer gated on the row —
                         an attacker could select the code branch                         EXIT=1
MUTATION 3  the (uuid, text) overload left in place
            ERROR P0001: release_joiner_seat(uuid, text) still exists —
                         the code-only release is still reachable                         EXIT=1
CLEAN       the migration as written                                                      EXIT=0
```

And the reproduction itself, run against the **pre-fix** function (P1058 re-installed on test,
then rolled forward again) — this is what makes the refusals above evidence rather than an
artefact of how the call is made:

```
installed signature: p_session_id uuid, p_code text        (pre-fix)
guest claims seat:   HTTP 200
POSITIVE CONTROL — seat occupied right now:
                     {'joiner_name': 'Real Guest', 'claimed': True, 'has_secret': True}
ATTACK (code-only release): HTTP 204
row after:           {'joiner_name': None, 'claimed': False}
>>> pre-fix behaviour: GUEST EVICTED — the attack works
```

Every fixture row created for these runs was deleted; `leftover: 0` confirmed after each.

## Pre-deploy Checklist

- [ ] **P1269's migration `20260911090000` is live on prod.** Half C's precondition block refuses
      to install without `clarity_sessions.joiner_seat_secret`. P1269's spec has four verified
      defects outstanding (see its own record) and must not ship as-is.
- [ ] **The app half of C is written and merged**, threading the seat secret into
      `clearSessionJoiner` from `src/app/data/seat-secret.ts` at its three call sites
      (`clarity-live-page.tsx`, `AuthContext.tsx`, `active-session-banner.tsx`), and half C's
      `-- requires-frontend:` annotation is filled in with that commit's sha. Until then
      `migrate.sh`'s prod gate is the only thing standing between the migration and a guest who
      cannot press "End Session".
- [ ] Half D applied to prod and the anon probe re-run there.

## Invariants

- **The database is the access boundary; the UI is not.** Any rule the product states about who may
  reach a room must be enforced by a grant or a predicate, never by a component that renders a wall.
- **A public code is not a credential.** Wherever a room code is deliberately published, no
  capability beyond joining may be authorized by possession of that code alone.
- **`claim_joiner_seat`'s occupancy guard is gated on `joiner_seat_claimed_at IS NOT NULL`.** Any
  function that can NULL that column is part of this authorization surface and must be reviewed
  alongside it.

## Related

- **P1057** — opened the `anon` grant (D-A, 2026-08-17). The premise this spec retires.
- **P1114** — retired the anon room surface in the UI (2026-08-20). The decision this spec implements.
- **P1058** — accepted the eviction residue citing P1057. Its acceptance rests on the stale premise.
- **P1269** — the seat-secret fix. Correct on its own path; this spec covers the path it leaves open.
- **P1098** — a leaked room code cannot be revoked. Why C is worth doing even after D.
