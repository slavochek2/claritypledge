---
status: week
type: bug
rank: 4
severity: medium
date_reported: '2026-08-13'
created_date: '2026-08-13'
tags: [privacy, rpc, letters, anon]
delivery_stage: create-bug
pipeline_ran: [create-bug]
absorbed: p1090
---

# P1071: the letter-reading RPC still returns the recipient email address P651 required it to drop

## Summary

`get_letter_for_reading` includes `receiver_email` in its response to an unauthenticated caller,
which is the exact condition P651 added an acceptance test to prevent — that test has been failing
ever since and the redaction was never implemented.

**P1090 absorbed here (2026-08-17).** P1090 was filed independently against the same function, the
same field and the same failing assertion
(`e2e/integration/p651-letter-onboarding-migration.spec.ts:282` — inside
`test('get_letter_for_reading does NOT return receiver_email')`, called with `p_token:
deliveryToken`). P1090's "invitation link" is that delivery token, so the two are one defect. P1090
carried one finding this spec did not — the echoed token, below — which is now part of this spec's
scope. P1090 is archived as a duplicate.

## Root Cause

P651 shipped the test but not the change. The test carries its own unresolved marker:

```ts
// TODO: /dev must remove receiver_email from the RPC response.
if (data?.delivery) {
  expect(data.delivery).not.toHaveProperty('receiver_email');
}
```
(`e2e/integration/p651-letter-onboarding-migration.spec.ts:279-282`)

The sibling requirement for `get_letter_by_token` **was** implemented and its test passes, so this
is a single missed surface within P651's scope rather than a rejected decision. Confirmed against
the live prod catalog, not migration text: the current `get_letter_for_reading` body still selects
`receiver_email` into the returned delivery object.

The function is deliberately anon-executable — it is how a one-to-one recipient opens a letter from
an emailed link (`scripts/anon-execute-allowlist.txt`). So the grant is correct and the **response
shape** is the defect. Allowlisting a function's anon grant is not a clearance of its body; this is
an instance of that distinction.

### Second defect in the same response shape (from P1090)

The payload also **echoes the invitation token back inside the response that token authenticates**.
That puts a bearer capability into a response body — anywhere that body is logged, captured in an
error report, or retained by an intermediary, the reading capability travels with it. Dropping it is
likely free, but confirm no client reads the token back out of the payload rather than off the URL.

Decide this in the same pass, since it is the same function body and the same redefinition.

Mechanism, the live body, and the exposure analysis: `.private/docs/security-log.md`
§ "2026-08-17 — P1067 N2+N3 FIXED on TEST", subsection "NEW FINDING".

## Reproduction Steps

1. Create a sealed one-to-one letter with a delivery carrying a `receiver_email` and an
   `invitation_token`.
2. As an unauthenticated caller (anon key, no session), call the RPC with that token:
   ```ts
   await anonClient.rpc('get_letter_for_reading', { p_token: deliveryToken });
   ```
3. Inspect `data.delivery` in the response.

**Reproduction rate:** 100% — currently reproduced by
`e2e/integration/p651-letter-onboarding-migration.spec.ts:268` on every run.

## Expected Behavior

The returned delivery object contains no `receiver_email` key. The reading page renders from the
fields it actually uses (`receiver_name` and the profile join), as the token-lookup sibling already
does.

## Actual Behavior

`data.delivery.receiver_email` is present and populated, so anyone holding the invitation token —
without an account — reads the recipient's email address. Test failure output:

```
Expected path: not "receiver_email"
Received value: "<the delivery's receiver_email — a test-fixture address>"
```

## Affected Files

- `get_letter_for_reading` — live definition returns the column; the migration that last redefined
  it needs identifying as the first step of the fix
- `e2e/integration/p651-letter-onboarding-migration.spec.ts:268-283` — the failing acceptance test
  and its TODO marker
- `src/app/pages/letter-reading-page.tsx` — consumes `delivery`; must be checked for any read of
  `receiver_email` before the field is removed

## Severity

**Medium** — one address is exposed per token held, to a party who in the normal case is the person
that address belongs to. It is not lower than medium because the guarantee was explicitly specified
and tested a full release cycle ago, the caller is unauthenticated, and a forwarded or logged
invitation link hands the address to someone it was never meant to reach.

## Fix Approach

Grep every consumer of the delivery object for `receiver_email` **before** removing it from the RPC
— the reading page and the email-sending path both read delivery fields, and dropping a key that
one of them still uses substitutes a broken reading flow for a privacy defect. Then redefine the
function without that key and let the existing P651 test verify it.

Two constraints, both learned from P1066 in the same subsystem:

1. Read the current body from the live catalog (`pg_get_functiondef`) and preserve every other line.
   Rewriting from an older migration as the base is the P952 regression that
   `src/tests/sd-guard-completeness.test.ts` exists to catch.
2. Verify against live `pg_proc` on both environments after applying. A green migration run is not
   evidence in this codebase (P1066 F6).

**Do not add an identity requirement to this read** (carried from P1090's non-goals). Anonymous
reading through an invitation link is the intended product behaviour — the response shape is the
defect, not the grant.

**A green run on this suite file is evidence only for this file.** It carries other pre-existing
failures (P1091); do not read the file going green as the whole suite being healthy.

## Acceptance Criteria

- [ ] Every client read of `receiver_email` off the delivery object enumerated, with the finding
      stated even if the answer is "none" — this decides whether removal is a deletion or needs a
      substitute (e.g. a masked address)
- [ ] `e2e/integration/p651-letter-onboarding-migration.spec.ts:268` passes — the delivery object
      has no `receiver_email` key for an unauthenticated caller
- [ ] The TODO marker at that test is removed, since it is no longer outstanding
- [ ] A decision recorded on the echoed invitation token — removed, or kept with the reason
- [ ] A recipient can still open a one-to-one letter from an emailed link and sees the correct
      recipient name
- [ ] `src/tests/sd-guard-completeness.test.ts` still passes (no historical guard dropped)
- [ ] No console errors during the letter-reading flow
- [ ] Verified against the live catalog on both environments after deploy, not the migration ledger
- [ ] `.private/docs/security-log.md` updated with the fix and its verification
