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

## Done-When

- [ ] An anonymous caller with no account receives **no room code** from `get_practice_room_codes`
      for an event they are not registered for — measured the same way as the reproduction above,
      with the `get_room_code_for_invite` control alongside it to prove the probe still discriminates.
- [ ] A registered, signed-in attendee still receives the code — the false-positive half, run
      against the workflow `EventRoomGate` itself performs (epistemic gate 7c).
- [ ] The full reproduction above, re-run end to end, fails at step 1 or step 3b-ii.
- [ ] `release_joiner_seat` refuses a release that presents the room code but not the seat secret,
      when the seat carries a secret — and still accepts a legacy seat with no secret.
- [ ] A guest can still leave their own seat normally, anonymously, through the product.
- [ ] Regression tests pin both halves, and each has been **seen to fail** against the unfixed
      code (epistemic gate 7) with the non-zero exit pasted into this spec.

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
