---
status: backlog
type: task
rank: 89
created_date: '2026-08-12'
tags: [security, hardening, clarity-sessions, rls]
delivery_stage: create-spec
pipeline_ran: [create-spec]
driver: anomaly
---

# P1059: P1053 Security Review hardening backlog — search_path pins, CSPRNG codes, code revocability

## Problem

P1053's Security Review produced three findings that are **real defects but not reachable
exploits**, so none of them held up the transcript fix. They have been named in three places
(P1053's Done-When, P1057's Related section, `.private/docs/security-log.md`) and filed in none.
A defect recorded only in prose that three other documents point at is a defect nobody owns.

The three, none of which is urgent and all of which are cheap to get wrong later:

1. **Two SECURITY DEFINER functions have no `search_path` pin.** `create_transcription_job` and
   `retry_transcription` reference `clarity_sessions` unqualified with no `SET search_path`.
   Whether `anon`/`authenticated` hold CREATE on any schema is **unverified** — the defect is
   confirmed, the exploitability is not. Every other SECURITY DEFINER function in this area
   (`patch_live_state`, `complete_clarity_session`, and both P1053 seat RPCs) is pinned; these two
   are the outliers.

2. **Room codes are minted client-side with `Math.random()`.** `generateRoomCode()` uses a
   32-character alphabet at length 6 (2^30 keyspace), which is fine; the generator is not.
   `Math.random()` is not a CSPRNG — V8 uses xorshift128+, whose state is recoverable from a short
   output run. No cross-user prediction attack has been constructed; the defect stands without
   one. Worse, the code is sent in the client's INSERT payload and the INSERT policy does not
   constrain it, so a modified client can choose its own code and squat memorable ones
   (`code` is `TEXT UNIQUE`).

3. **A leaked code is unrevocable, permanently.** `code` UPDATE was revoked from clients by P1047,
   there is no rotation path anywhere in `src/`, and `expires_at` is NULL by design. Every
   historical leak stays live forever.

These compound with P1057. P1057 hides the code from clients; it does not make the code
unguessable (2), does not let anyone rotate one that leaked (3), and does not touch (1) at all.

## Appetite

Low blast radius for (1) — a `SET search_path = public` on two existing functions, matching the
established idiom. Medium for (2) — moving minting server-side changes the session-create path.
**High decision density for (3)** — rotation implies deciding what happens to a live session whose
code changes, and whether codes should expire at all, which is a product question and not an
implementation detail.

Reversible throughout: (1) and (2) are migrations plus a client change; (3) is additive.

## Solution

Three independent pieces. **They do not need to ship together, and (1) should not wait for the
others** — it is the one with no product decisions in it.

**(1) Pin the two functions.** Add `SET search_path = public` to `create_transcription_job` and
`retry_transcription` in a new migration, following `patch_live_state`'s idiom. Note the P1053
precedent: `public`, not `''` — legacy triggers in this schema resolve unqualified names, and an
empty `search_path` breaks them. Verify against the live function definitions first; do not assume
the migration files on disk match what is deployed.

**(2) Mint codes server-side from a CSPRNG.** A SECURITY DEFINER function generates the code using
`gen_random_bytes`, and the INSERT policy stops accepting a client-supplied `code`. This closes
both the weak-generator half and the squatting half in one change, because the client no longer
proposes a code at all.

**(3) Decide revocability.** `[FOUNDER DECISION]` — this needs a product call before any design:
should a room code be rotatable, expiring, or neither? "Neither" is a legitimate answer for a
practice tool and would close this item with a recorded rationale rather than code.

## Risks / Non-Goals

### Risks

- **Pinning `search_path` can break a function that was silently relying on a wider path.**
  Mitigation: exercise both functions on test after the change — they sit on the transcription
  path, which has e2e coverage.
- **Server-side minting changes an insert path that P1038 and P1047 both touched.** Mitigation:
  read those specs' decisions before designing; do not re-open their policy work.
- **Code rotation can strand a live session** whose participants hold the old code. Mitigation:
  this is exactly why (3) is a founder decision before it is a design.

### Non-Goals

- Do **NOT** bundle this with P1057. That spec hides the code from client reads; this one is about
  how codes are generated and whether they can be revoked. Different mechanisms, different blast
  radius, and P1057 is the higher-risk deploy.
- Do **NOT** treat (1) as urgent on the strength of the wording. The exploitability is
  **unverified** — confirm whether `anon`/`authenticated` actually hold CREATE on a schema before
  describing it as reachable anywhere.
- Do **NOT** change the room code's length or alphabet as part of (2). The keyspace is adequate;
  the generator and the minting location are the defects.
- Do **NOT** implement (3) before the founder decision. File the decision, then design.

## Done-When

- [ ] `create_transcription_job` and `retry_transcription` both carry `SET search_path = public`,
      verified by reading the live function definitions, not the migration files
- [ ] The transcription path still works on test after the pin
- [ ] Whether `anon`/`authenticated` hold CREATE on any schema is **answered**, and the answer is
      recorded — this converts (1) from "confirmed defect, unknown reachability" to a known state
- [ ] Room codes are minted server-side from a CSPRNG, and a client-supplied `code` in the INSERT
      payload is either ignored or rejected
- [ ] A canary proves a client cannot choose its own room code
- [ ] Revocability has an explicit founder decision recorded — rotate, expire, or neither. If
      "neither," this item closes with the rationale written down and no code
- [ ] `.private/docs/security-log.md` updated with the outcome of each of the three

## Related

- **P1053** — where all three were found (Security Review). Migrations `20260812150000`–`20260812200000`.
- **P1057** — room code confidentiality. Adjacent, deliberately separate.
- **P1058** — F4 reproduction and the three adversarial lenses that never ran on P1053.
- `.private/docs/security-log.md` — the `2026-08-12` P1053 architecture-review entry carries the
  measured detail for all three, including the generator's alphabet and the telemetry sinks.
