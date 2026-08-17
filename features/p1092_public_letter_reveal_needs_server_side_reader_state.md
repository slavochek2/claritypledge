---
status: week
type: bug
rank: 3
created_date: '2026-08-17'
tags: [security, letters, sealed-bid, integrity]
delivery_stage: create-bug
pipeline_ran: [create-bug]
driver: anomaly
changes: p1067
---

# P1092: the public-letter reveal is gated in the browser, and the server has no way to gate it

## Problem

**Situation:** Split out of P1067 (founder, 2026-08-17) so the two items P1067 fixed and verified
could ship without waiting for this one. P1067 holds the history; this spec holds the remaining work:
its **N1** and its **design flag**.

**Complication:** On the one-to-many public reading path, the sender's predictions are sent to the
browser before the reader rates anything, and the "rate first" rule is enforced in the page rather
than on the server. Reproduced: no credentials, HTTP 200, every prediction returned. The client code
says outright that it is deliberate, so local reveal can work.

**And the fix P1067 assumed is not available here.** Every other path that enforces rate-first
identifies the caller from a delivery or an invitation token. This path has neither, and the write
path refuses anonymous callers outright — so an anonymous reader's ratings never reach the server at
all. They live in the browser until sign-in. There is nothing for a server-side guard to check,
which is why this could not be a one-line guard like its siblings.

**Question:** none outstanding — the shape is decided (below). What remains is building it.

## Founder Decisions (both already taken, recorded in P1067)

1. **The sealed-bid guarantee is load-bearing (2026-08-13).** A reader who sees the prediction first
   is anchored by it, so the rating stops being an independent measurement. The loss is a
   **measurement** loss before it is a privacy loss: calibration figures drawn from public letters
   cannot otherwise be cited as corroboration by the research programme.
2. **Mint server-side reader state (2026-08-17).** The server issues letter-scoped reader state when
   the page loads, each rating is recorded against it, and the reveal is gated on that record.
   Chosen over moving the reveal behind sign-in because it keeps the read-and-reveal loop open to
   readers without an account **and** starts capturing calibration data that is discarded today
   whenever a reader rates and never signs in — a programme gain, not only a fix.

**Accepted cost, to be designed against rather than discovered:** this adds an anonymous **write**
surface and a bearer capability, the same class P1053 and P1057 have been narrowing. Carried
requirements: the reader state is minted server-side and never chosen by the client, scoped to a
single letter, rate-limited, and the reveal must derive the letter from that state rather than
trusting a parameter. No existing table fits — the sign-up-pending table refuses all client inserts,
so this is new state.

Mechanism, the reproduction, and the reasoning: `.private/docs/security-log.md`
§ "Completeness review — 2026-08-13" (N1) and § "2026-08-17 — P1067 design pass".

## Appetite

Larger than anything in P1067: new server state, a new anonymous write path, and three call sites on
the reading page. Reversible, but not in one statement — the state outlives a single deploy.
Decision density: low now, since both founder calls are already made.

## Approach

1. Design the reader state and its lifetime: what mints it, what it is scoped to, when it expires,
   and what stops it being farmed. Write the design to the private log, not to this public file,
   while production is unpatched.
2. Stop sending predictions to an ungated reader.
3. Record each rating against the reader state as it is made — this is also the point where
   currently-discarded calibration data starts being captured.
4. Gate the reveal on that record, per story.
5. **The design flag, decided in the same pass:** an unauthenticated branch elsewhere accepts an
   unrestricted structured merge, letting any caller who knows a session identifier drive that
   session straight to its revealed state — the live-session analogue of this same defect. Scope a
   key allowlist, or accept and document it. It is here rather than in P1067 because the ruling above
   covers it.

## Risks / Non-Goals

### Risks

- **This adds the very surface the surrounding work has been closing.** MITIGATE: the carried
  requirements above are acceptance criteria, not aspirations — especially server-minted state and
  letter scoping.
- **The reading page has three entry points into this path.** MITIGATE: enumerate all three before
  editing; a fix on one is not a fix.
- **Sending less to the browser can break offline/local reveal.** MITIGATE: confirm what local mode
  actually needs before removing anything from the payload.

### Non-Goals

- Do **NOT** re-open either founder decision above. They are settled.
- Do **NOT** fold this into P1067's migration. That shipped separately and deliberately.
- Do **NOT** put mechanism or function names in any public file, migration header, or commit message
  while production is unpatched.

## Done-When

- [ ] Predictions are no longer sent to a reader who has not rated
- [ ] A rating on this path is recorded server-side as it is made, including for a reader who never
      signs in
- [ ] The reveal is gated server-side, per story, on that record
- [ ] The minted state is server-issued, letter-scoped, expiring and rate-limited — each stated with
      how it was verified, not asserted
- [ ] All three reading-page entry points covered, enumerated explicitly
- [ ] Design flag triaged: allowlist scoped, or acceptance documented with its reason
- [ ] Verified against live behaviour after deploy, not a green migration run
- [ ] `.private/docs/security-log.md` updated with the design, the fix and its verification
