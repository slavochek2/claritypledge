---
status: week
type: bug
rank: 4
created_date: '2026-08-17'
tags: [security, privacy, letters, rpc]
delivery_stage: create-bug
pipeline_ran: [create-bug]
driver: anomaly
---

# P1090: a forwarded invitation link discloses the intended recipient's email address

## Problem

**Situation:** Opening a sealed letter through its invitation link returns the letter, its story
snapshots, and a delivery object. The delivery object includes the recipient's **email address** and
name.

**Complication:** A prior spec (P651) decided that field must not be returned, and its test still
asserts it — `e2e/integration/p651-letter-onboarding-migration.spec.ts:282`. **The assertion has been
failing.** So the decision was reverted at some point and the test was never retired, which means
nobody was told. Confirmed against the **live prod** definition, not migration text: the field is
present, and the read carries no identity check of its own.

**Question:** Should the reading payload carry the recipient's email at all, and if not, what does
the client actually need in its place?

**Severity is bounded — state it honestly.** The caller must hold the invitation link, which is the
reading capability by design. This is not an open read. The exposure is a **forwarded, screenshotted
or leaked link**: whoever opens it learns who the letter was addressed to, by email, rather than only
being able to read it. Adjacent detail worth deciding on at the same time: the payload echoes the
invitation token back inside the response it authenticates, which puts a bearer capability into a
body that may end up in logs.

Mechanism, the live body, and the exposure analysis: `.private/docs/security-log.md`
§ "2026-08-17 — P1067 N2+N3 FIXED on TEST", subsection "NEW FINDING".

## Appetite

Small, but not a one-liner: the field has to be removed from the payload **and** every client read of
it has to be checked first, because something may be rendering "sent to you at …" from it. Reversible.
Decision density: one — whether the client keeps a substitute (e.g. a masked address) or loses it.

## Approach

1. Grep every client read of the delivery object's email field and establish what, if anything,
   renders it. That decides whether removal is a substitution or a deletion.
2. Remove it from the reading payload. Keep the internal paths that legitimately need it
   (invitation sending, claim matching) — those do not go through this read.
3. Decide on the echoed token separately: dropping it is likely free, but confirm no client reads it
   back out of the payload.
4. Re-point P651's assertion at the fixed behaviour so the suite stops carrying a silent failure.

## Risks / Non-Goals

### Risks

- **A client may be rendering the address.** MITIGATE: step 1 before any edit — this is the whole
  reason this is not filed as a one-line fix.
- **The failing assertion may not be the only silent one.** The same suite carries four other
  pre-existing failures (see P1091). MITIGATE: treat a green run on this file as evidence only for
  this file.

### Non-Goals

- Do **NOT** change who may call the read, or add an identity requirement to it. Anonymous reading
  through an invitation link is the intended product behaviour.
- Do **NOT** bundle this with P1067's migration. Different function, different concern.

## Done-When

- [ ] Every client read of the field enumerated, with the finding stated even if the answer is "none"
- [ ] The recipient's email is no longer in the reading payload
- [ ] A decision recorded on the echoed invitation token — removed, or kept with the reason
- [ ] P651's assertion passes against the fixed behaviour rather than failing silently
- [ ] Verified against the live catalog on both environments after deploy, not the migration ledger
- [ ] `.private/docs/security-log.md` updated with the fix and its verification
