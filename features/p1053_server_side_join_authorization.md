---
status: today
type: bug
rank: 1000964.0
severity: critical
date_reported: '2026-08-12'
created_date: '2026-08-12'
tags: [security, rls, ownership, privacy, transcripts]
driver: anomaly
feature_type: backend
---

# P1053: joining a session has no server-side authorization

## Summary

`clarity_sessions.joiner_profile_id` is the key to a session's stored transcript, and any
signed-in user can write their own id into it on a stranger's session. Nothing in the
database checks whether the seat is free, or whether the caller has any relationship to the
room — the only occupancy check in the product is client-side JavaScript.

Found by adversarial review of P1047. **Pre-existing**, not introduced by it. P1047 closed
forging ownership *onto someone else* and deliberately stopped short of this, because
closing it is the anonymous-session redesign P1047's Non-Goals forbid.

Exploit mechanics and live counts: `.private/docs/security-log.md` 2026-08-11.

## Problem

Three symptoms, one root cause.

1. **Seat seizure.** A signed-in user writes their own uid into `joiner_profile_id` on any
   reachable session. `session_transcripts` and `transcription_jobs` both gate SELECT on
   `creator_profile_id = auth.uid() OR joiner_profile_id = auth.uid()`, so this yields the
   full stored transcript of a private conversation between two other people. It also
   unlocks `complete_clarity_session`, `patch_live_state`, `create_transcription_job` and
   `retry_transcription`, which gate on the same column. Re-sending the original
   `joiner_name` in the same statement makes the takeover invisible in the UI.
2. **Seat erasure.** Any caller — including an unauthenticated one — can NULL the column.
   The session vanishes from the joiner's history, they lose SELECT on their own transcript
   and jobs, new transcription enqueues raise "Not a participant", and they cannot close
   their practice room. User-visible: mid-session, their recording silently stops being
   processed.
3. **Empty-seat claiming.** Anyone can take an unoccupied seat on a stranger's room. The
   room id is freely readable — the SELECT policy exposes every null-target row to anon —
   so no guessing is needed.

**The root cause is that the column means two different things.** It is simultaneously
*who currently occupies the seat* and *who participated* (for transcript access). Those
diverge the moment a joiner leaves: `clearSessionJoiner` (`src/app/data/api.ts:1235`) nulls
`joiner_name` but deliberately keeps `joiner_profile_id`, because the departed participant
still needs their transcript.

**Why no trigger can fix it — established by a failed attempt, not by argument.** P1047
part 4 added exactly the obvious guard (reject when `OLD.joiner_profile_id IS NOT NULL`)
and it broke a live flow: after a signed-in joiner leaves, the next signed-in joiner was
rejected with 42501, surfacing as "Session not found or already full" *after* the mic
prompt was granted. Reverted in P1047 part 5. Every other vacancy signal a trigger could
read (`joiner_name`, `live_state.joinerEnded`) is itself in the client UPDATE allowlist and
so is forgeable in two steps: clear the signal, then claim.

## Appetite

Higher decision density than P1047 and a real blast radius: this touches the join path,
which is the entry point to every `/live` session, including anonymous practice rooms. A
wrong tightening takes guest joins down — P1047 part 4 already demonstrated that failure at
small scale. Not a mechanical predicate change.

## Solution

Sketch, not a decided design — the separation of the two meanings is the actual open
question.

1. **Separate occupant from participant.** Either a distinct column (`joiner_left_at`, or a
   participants join-table) or an explicit vacancy flag the client cannot forge. Until
   these are separable, no authorization rule can be stated correctly.
2. **`claim_joiner_seat(p_code, p_joiner_name)` as SECURITY DEFINER.** Checks vacancy and
   writes `joiner_name` + `joiner_profile_id` atomically, so vacancy cannot be cleared and
   re-claimed across two statements. Sets `joiner_profile_id = auth.uid()`, or NULL for an
   anonymous guest.
3. **Revoke client UPDATE on `joiner_name` and `joiner_profile_id`.** Without this the RPC
   is decorative — the direct PATCH path remains. This is what makes the vacancy signal
   trustworthy.
4. **Authorization rule for an empty seat: the room code is the bearer token.**
   **[FOUNDER DECISION 2026-08-12 — resolved.]** `claim_joiner_seat` takes `p_code`, never a
   session id. Combined with step 3's revoke, the freely-readable room *id* stops being a
   join key, so enumeration of null-target rows no longer yields a claimable seat. Rejected:
   an invite row (anonymous practice rooms have no creator identity to issue one from, so it
   needs a carve-out that reintroduces the open path); splitting the rule by
   `creator_profile_id IS NULL` (two authorization paths and two canary sets for one seat).
   Shape-preserving at the call site — `joinClaritySession` already keys on `code`
   (`src/app/data/api.ts:960`, `.eq('code', normalizedCode)`), so no client rewrite.
5. **Narrowing the SELECT policy is deliberately NOT in this spec.**
   **[FOUNDER DECISION 2026-08-12 — resolved.]** `target_listener_id IS NULL` still exposes
   every practice-room row to anon. That stays, and gets its own spec with its own canaries:
   the null-target SELECT policy is what makes practice rooms reachable at all, so a wrong
   tightening takes anonymous rooms down entirely — a second independent way to break
   `/live` in one deploy. Rationale for deferring safely: once client UPDATE is revoked, a
   readable row is no longer a claimable row, which is the leverage the wide SELECT gave an
   attacker. File the follow-up before closing this spec.

## Risks / Non-Goals

### Risks
- **Breaking guest joins.** MITIGATE — the join path serves anonymous practice rooms. P1047
  part 4 is the worked example of getting this wrong; its canary
  ("a signed-in user can join a room a previous signed-in joiner left") must stay green.
- **Stripping a departed participant's transcript access.** MITIGATE — the naive fix
  (null `joiner_profile_id` on leave) does exactly this. Any design must keep the
  participant record intact while marking the seat free.
- **A decorative RPC.** MITIGATE — if the direct-PATCH path stays open, the RPC adds a
  mechanism and closes nothing. Verify the revoke landed, on prod, after deploy.

### Non-Goals
- Do NOT re-open P1047's column grants or its trigger. Both are live on prod and verified.
- Do NOT fix the `/demo` `creatorProfileId` argument-order bug here (separate, pre-existing).

## Done-When

- [ ] The two meanings of `joiner_profile_id` are separated, and the separation is written
      down before any policy is authored
- [ ] Seat seizure canary green — `p1047-reproduce-clarity_sessions-update.spec.ts`
      currently carries it as `test.fixme` ("authenticated attacker cannot displace a joiner
      who already holds the seat"); it moves here and must pass
- [ ] Seat erasure canary — an anonymous caller cannot strip a joiner's transcript access
- [ ] Empty-seat rule implemented per the founder decision in Solution step 4 (code as bearer
      token), with a canary: a caller holding only the session *id* cannot claim a free seat
- [ ] Follow-up spec filed for the anon SELECT narrowing deferred in Solution step 5
- [ ] P1047's rejoin-after-leave control still green, plus all six anonymous
      practice-room controls
- [ ] Verified live on test, then prod under explicit approval, with grants re-read on prod
      after deploy (a REVOKE that silently no-ops is the P877/P886 failure)
- [ ] Private security log updated
