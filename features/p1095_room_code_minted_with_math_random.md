---
status: week
type: bug
rank: 2
severity: high
date_reported: '2026-08-17'
created_date: '2026-08-17'
tags: [security, live, crypto, codes]
driver: anomaly
feature_type: backend
---

# P1095: the room code is a bearer token minted with `Math.random()`

## Summary

Filed out of P1057's `DEFER` list, which had no P-number behind it (caught by `ship-gates.sh`
gate 3.65 at P1057's ship). P1053 made the 6-character room `code` the capability that
authorizes claiming a joiner seat; P1057 stopped *publishing* it. Neither addressed how it is
**generated**.

The code is minted client-side from `Math.random()` — a non-CSPRNG. A bearer token from a
predictable generator is guessable independently of whether it is published, so P1057's
confidentiality gain is bounded by this.

## Problem

`Math.random()` in V8 is xorshift128+: fast, statistically decent, and **not**
cryptographically secure. Its internal state is recoverable from a modest number of outputs,
and it is seeded per-context. Two consequences, in increasing order of severity:

1. **Guessability.** A 6-char code over the alphabet actually in use bounds the keyspace; a
   non-CSPRNG can bias which parts of that space are reachable in practice.
2. **Predictability.** Given enough observed codes from one origin, subsequent codes may be
   derivable rather than merely brute-forced — a qualitatively different attack from guessing.

P1057 explicitly named this as its own bound, and deliberately accepted it:

> "A 6-char code from a non-CSPRNG is guessable independently of whether it is published.
> Hiding it raises the bar only as far as the generator allows — and only as far as probe cost
> allows."

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
2. **Widen the alphabet or the length** if the keyspace analysis in Done-When shows 6 chars is
   insufficient against the *unauthenticated, unthrottled* probe P1057 documented as accepted
   (`get_session_by_code` is anon-reachable, side-effect-free, and has no rate limit).
3. **Existing rooms are not rotatable** — see P1096. This spec covers minting only.

## Risks / Non-Goals

- **MITIGATE — collision handling.** A server-minted code needs a retry-on-unique-violation
  path. `clarity_sessions.code` uniqueness must be confirmed to exist as a constraint before
  relying on it.
- **ACCEPT — existing codes stay weak.** This changes new rooms only. Rotation is P1096.
- **Non-goal — rate limiting the enumeration probe.** P1057 accepted the unthrottled probe on
  measured prod concurrency of 0 active rooms over 7 days, with an explicit revisit trigger at
  ~50 concurrent live rooms. That trigger belongs to P1057's ACCEPT, not here — but note the
  two interact: a stronger code reduces how much the missing rate limit costs.
- **Non-goal — room *contents* confidentiality.** Unchanged from P1057.

## Done-When

- [ ] Codes are generated server-side from a CSPRNG; the client can no longer supply one
- [ ] Keyspace stated explicitly (alphabet × length) with the resulting guess probability per
      probe, against the anon-reachable unthrottled `get_session_by_code`
- [ ] Collision retry proven by test, not by assumption
- [ ] `createClaritySession` no longer sends a client-minted `code`
- [ ] Existing rooms keep working (the change is mint-side, not read-side)

## Related

- **P1053** — made the code the authorization capability
- **P1057** — stopped publishing the code; named this as its own bound and deferred it here
- **P1096** — rotation/revocability of an already-leaked code
