---
status: all-done
type: bug
rank: 2
severity: high
date_reported: '2026-08-17'
created_date: '2026-08-17'
tags: [security, live, crypto, codes]
driver: anomaly
feature_type: backend
pipeline_ran: [inline, ship]
completed_at: 2026-09-03
---

# P1097: the room code is a bearer token minted with `Math.random()`

## Summary

Filed out of P1057's `DEFER` list, which had no P-number behind it (caught by `ship-gates.sh`
gate 3.65 at P1057's ship). P1053 made the 6-character room `code` the capability that
authorizes claiming a joiner seat; P1057 stopped *publishing* it. Neither addressed how it is
**generated**.

The code is minted client-side from `Math.random()` — a non-CSPRNG. A bearer token from a
predictable generator is guessable independently of whether it is published, so P1057's
confidentiality gain is bounded by this.

## Problem

The code is minted from a general-purpose pseudorandom source rather than a cryptographic one.
For a value that acts as an authorization capability, that is the wrong class of generator: such
sources are designed for statistical quality, not for resisting an adversary who observes outputs.
The consequences run from plain guessability up to a stronger class of attack. Specifics of the
generator, keyspace arithmetic, and the observed-output attack are withheld from this public spec
while the issue is open — see `.private/docs/security-log.md`, per the disclosure rule in CLAUDE.md.

P1057 explicitly named this as its own bound and deliberately accepted it, deferring it here.

## Appetite

Small blast radius, high reversibility — the change is confined to code generation plus a
collision-retry path. Decision density is low: the approach is not in genuine dispute
(server-minted from a CSPRNG), only its sequencing against existing rooms.

## Solution

Sketch, **not verified against current code — treat as leads, not facts.**

1. **Mint server-side from a CSPRNG.** A definer function using `gen_random_bytes()`
   (pgcrypto) rather than a client `Math.random()`. This also removes the client's ability to
   choose its own code, which is a separate latent issue: today `createClaritySession` inserts
   a client-supplied `code`, so a client can pick one.
2. **Widen the alphabet or the length** if the keyspace analysis in Done-When shows the current
   length is insufficient against the read-path posture P1057 documented as accepted (that
   posture is characterised in `.private/docs/security-log.md`, not here).
3. **Existing rooms are not rotatable** — see P1098. This spec covers minting only.

## Risks / Non-Goals

- **MITIGATE — collision handling.** A server-minted code needs a retry-on-unique-violation
  path. `clarity_sessions.code` uniqueness must be confirmed to exist as a constraint before
  relying on it.
- **ACCEPT — existing codes stay weak.** This changes new rooms only. Rotation is P1098.
- **Non-goal — rate limiting on the read path.** P1057 assessed and accepted the current posture
  against measured production usage, with an explicit revisit trigger recorded there. That trigger
  belongs to P1057's ACCEPT, not here — but note the two interact: a stronger code reduces how much
  the accepted posture costs.
- **Non-goal — room *contents* confidentiality.** Unchanged from P1057.

## Done-When

- [x] Codes are generated server-side from a CSPRNG; the client can no longer supply one
- [x] Keyspace stated explicitly (alphabet × length) with the resulting guess probability per
      probe — the analysis itself recorded in `.private/docs/security-log.md`, not here
- [x] Collision retry proven by test, not by assumption
- [x] `createClaritySession` no longer sends a client-minted `code`
- [x] Existing rooms keep working (the change is mint-side, not read-side)

## Evidence

Branch `feature/p1097-csprng-room-code`, commits `a265fbe1` (Migration A + frontend) and
`51fc9b84` (Migration B). Both migrations applied to the **test** project on 2026-09-01; prod is
held by `requires-frontend: a265fbe1` until the frontend commit is on `origin/main`.

- **Server-side CSPRNG mint.** `supabase/migrations/20260901200000_p1097_a_server_minted_room_code.sql`:
  `mint_clarity_room_code()` draws `gen_random_bytes()` (pgcrypto) over an explicit 32-symbol
  alphabet — the same set the client used — inside a BEFORE INSERT trigger on `clarity_sessions`.
  Uniform by construction (256 mod 32 = 0, asserted in the function). EXECUTE revoked from
  PUBLIC/anon/authenticated. The migration's own DO block asserts pgcrypto, the trigger, the
  grants, and a well-formed smoke draw.
- **Client cannot supply a code.** `20260901200100_p1097_b_revoke_client_code_insert.sql` revokes
  table-level INSERT from client roles and re-grants an explicit column list without `code`
  (the P1057/P1047 mechanism). `has_column_privilege` checks: `code` not insertable by
  anon/authenticated, every other column still insertable, service_role unchanged. Integration
  test: a verified user inserting `code: 'CHOSEN'` gets 42501; the same user without a code
  succeeds; the full production payload succeeds.
- **`createClaritySession` sends no code.** `src/app/data/api.ts` — `generateRoomCode()` is
  gone; the INSERT payload has no `code`; the minted code is read back via the creator-bound
  `get_room_code_for_invite` RPC and a NULL reveal is a hard error. `src/tests/p1097-server-minted-room-code.test.ts`
  (8 tests) asserts the payload shape, the reveal, the NULL/error branches, the 23505 re-run, and
  that the file carries no client-side generator. Full vitest: 3493 passed, 19 skipped.
- **Collision retry proven.** `e2e/integration/p1097-csprng-room-code-migration.spec.ts`
  occupies 31 of 32 one-symbol codes, calls the mint with `p_length = 1` five times and gets the
  one free symbol each time, then occupies the last and gets the exhaustion error. 9/9 tests
  pass against test.
- **Existing rooms keep working.** The change is INSERT-side only; `get_session_by_code`,
  `claim_joiner_seat` and every read path are untouched. `e2e/p272-live-verification.spec.ts`
  (chromium) creates a room through the real `/live` UI, reads a 6-char code from the share
  link, and the joiner enters by that code (its DB-presence wait passes); its later assertions
  fail on a pre-existing copy drift ("Does … understand you?" vs the rendered "Did …",
  `live-mode-view.tsx:1379`) unrelated to this spec.
- **Existing canaries updated, not weakened.** `p1038`, `p396`, `p703` integration specs
  inserted `code` as a user client; they now omit it so they keep failing for the RLS reason
  they test rather than at the column grant. p396's "verified user can INSERT" was already red
  (it selected `code` back, which P1057 revoked) and is green again.
- **Also changed:** `/demo` (`clarity-demo-page.tsx`) now passes the signed-in user's id to
  `createClaritySession` — required to learn the code, and it fixes the arg-order slip the P1038
  audit recorded. `transcribe_rooms.code` (P1149) still mints client-side — sibling, out of scope.

## Related

- **P1053** — made the code the authorization capability
- **P1057** — stopped publishing the code; named this as its own bound and deferred it here
- **P1098** — rotation/revocability of an already-leaked code
