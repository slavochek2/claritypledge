---
status: qa
type: bug
rank: 4
severity: medium
date_reported: '2026-08-13'
created_date: '2026-08-13'
tags: [privacy, rpc, letters, anon]
delivery_stage: fix
pipeline_ran: [create-bug, fix]
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

**Corrected 2026-08-17 — the original root cause below was falsified during /fix Phase -1.**

P651's redaction **was** implemented, and then **deliberately reversed** by P717 five weeks later.
`docs/decisions.md:11951-11959` records the reversal and its reasoning:

> The `get_letter_for_reading` RPC had `receiver_email` deliberately omitted (comment: "NO
> receiver_email (redacted)") as a privacy measure […] **Decision:** Restore `receiver_email` to the
> RPC delivery response. The privacy argument for omission assumed the token holder shouldn't know
> the email; the counter-argument: the token link was sent to that email — the holder already knows
> it.

The reversal shipped as `supabase/migrations/20260416170000_p717_add_receiver_email_to_reading_rpc.sql`
with its own integration test, `e2e/integration/p717-db-schema.spec.ts:44`, asserting
`expect(data.delivery.receiver_email).toBeTruthy()` — the **exact opposite** of the P651 assertion.
Two tests in the repo have been contradicting each other ever since; P651's is the one that loses.

So this is **not** "a single missed surface within P651's scope". It is a live design conflict
between a privacy requirement (P651) and a security guard (P717), and neither side is simply wrong:

- P717 is right that the token was emailed to that address, so the ordinary holder already knows it.
- P1071 is right that P717's reasoning **does not cover the forwarded or logged link**, where the
  holder is not the recipient. That case is exactly the residual exposure.

The field powers the wrong-user guard at `src/app/pages/letter-reading-page.tsx:330`, which stops a
wrong authenticated user from claiming someone else's delivery. Deleting the field outright silently
re-breaks that guard — the precise failure `docs/decisions.md:11937` records as having already
shipped green once.

**Resolution (founder decision, 2026-08-17): move the comparison server-side.** The RPC performs the
email match itself and returns a boolean verdict instead of the address. Both requirements hold at
once, and the forwarded-link exposure closes.

### Original (falsified) root cause, retained for the record

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

**Consumer enumeration (AC 1) — completed 2026-08-17, before any code:**

| Read site | Source of `delivery` | Affected? |
|---|---|---|
| `letter-reading-page.tsx:330` | `getLetterForReadingByToken` → **this RPC** | **Yes** — the only one |
| `letter-reading-page.tsx:211` | `getLetterForReading('', deliveryId)` → direct RLS table read | No |
| `letters-section.tsx:98`, `sent-tab.tsx:84-172` | sender-side table queries | No |

`invitation_token` has **no** RPC-sourced consumer at all: the single UI read
(`letters-section.tsx:171`) builds the sender's own share link from a direct table query. Dropping
the echoed token is therefore a free deletion.

**Move the guard server-side, then redact.** Redefine `get_letter_for_reading` so the delivery
object carries a verdict rather than the address:

- **remove** `receiver_email` and `invitation_token` from the returned delivery JSON
- **add** `is_intended_recipient` — the comparison the client used to make, evaluated in-DB against
  the caller's own identity:
  - `NULL` when `auth.uid()` is NULL (anonymous reader — guard does not apply; anonymous reading
    through an invitation link stays intended behaviour)
  - `NULL` when `ld.receiver_email` is NULL (nothing to compare — matches today's falsy skip)
  - otherwise `lower(auth.users.email) = lower(ld.receiver_email)`

Read the caller's address from `auth.users`, not `auth.jwt()` — the JWT copy goes stale after an
email change. The RPC is already `SECURITY DEFINER`, and reading `auth.users` from one is the
established pattern here (`seal_and_send_letter`, `get_auth_user_by_email`).

The client guard at line 330 then tests `is_intended_recipient === false`. Note the strict
comparison: `NULL` must **not** trip the guard, or every anonymous reader is locked out of the
product's intended flow.

`e2e/integration/p717-db-schema.spec.ts` asserts the old contract and must be updated in the same
commit to assert the new one — it is not a test being weakened to pass, it is a contract being
migrated, and P717's guard requirement survives it intact.

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

- [x] Every client read of `receiver_email` off the delivery object enumerated, with the finding
      stated even if the answer is "none" — this decides whether removal is a deletion or needs a
      substitute (e.g. a masked address)
      → **Done (table in Fix Approach). Answer was not "none":** one RPC-sourced read, the P717
      wrong-user guard. Removal therefore needs the `is_intended_recipient` substitute, not a
      bare deletion.
- [x] `get_letter_for_reading` returns `is_intended_recipient`, correct in all three cases:
      `false` for a signed-in non-recipient, `true` for the signed-in recipient, `NULL` for an
      anonymous caller
      → all three asserted with real signed-in users in
      `e2e/integration/20260818134500_p1071_redact_reading_rpc_response.spec.ts` (6/6 pass)
- [x] An anonymous caller with a valid token can still read the letter — `NULL` does not trip the
      guard (the regression that a naive `!is_intended_recipient` check would introduce)
      → browser-verified anon on the real page (letter cover renders, zero console errors), plus a
      unit test for the signed-in-null-verdict case. That operator was falsified deliberately:
      flipping `=== false` to `!` makes the test fail, restoring it makes it pass.
- [x] The wrong-user guard still fires: a signed-in user whose email differs from the delivery's
      `receiver_email` sees `wrong_user`, not the letter — P717's requirement survives the change
      → RPC returns `false` for a signed-in stranger (integration test); the page renders the
      wrong-account screen on that verdict (`p717-wrong-user-token-guard`, `p722-reproduce`)
- [x] `e2e/integration/p717-db-schema.spec.ts` updated to assert the new contract, and the reason
      recorded — a contract migration, not a test weakened to pass
      → rewritten to assert the guard's field is delivered (`toHaveProperty`, since `null` is
      meaningful) *and* that the address is absent. Rationale written into the file header.
- [x] `invitation_token` no longer echoed in the RPC response
      → absent from the live catalog body and from the raw anon wire response
- [x] `e2e/integration/p651-letter-onboarding-migration.spec.ts:268` passes — the delivery object
      has no `receiver_email` key for an unauthenticated caller
      → green for the first time since it was written (whole file: 22/22)
- [x] The TODO marker at that test is removed, since it is no longer outstanding
      → replaced with the implementing migration's name. The `if (data?.delivery)` wrapper went
      too: it would have passed silently had the envelope gone missing.
- [x] A decision recorded on the echoed invitation token — removed, or kept with the reason
      → **Removed.** The confirmation P1090 asked for came back clean: no client reads the token
      out of the payload. The only UI read (`letters-section.tsx:171`) is the sender's own share
      link, built from a direct table query, not from this RPC.
- [x] A recipient can still open a one-to-one letter from an emailed link and sees the correct
      recipient name
      → opening verified in a real browser against the dev server on a real sealed delivery.
      **Partial:** the fixture used carried `receiver_name: null` (chosen deliberately — the
      candidates with names held a real person's name, which must not enter a screenshot), so
      *name rendering* is covered by the integration assertion that `receiver_name` survives the
      redefinition, not by the browser check.
- [x] `src/tests/sd-guard-completeness.test.ts` still passes (no historical guard dropped) → 2/2
- [x] No console errors during the letter-reading flow → zero errors and zero warnings on the
      anon token path
- [ ] Verified against the live catalog on both environments after deploy, not the migration ledger
      → **[post-deploy]** test done via `pg_get_functiondef`. **Prod not applied and still
      exposed.** Deploy order is load-bearing: frontend first, then migration (the migration
      carries a `requires-frontend:` marker enforcing this).
- [x] `.private/docs/security-log.md` updated with the fix and its verification
      → including the correction that the original finding's "reverted without the test being
      retired" premise understated a deliberate, documented P717 decision
