---
status: week
type: bug
rank: 1000066
severity: high
workstream: infrastructure
date_reported: '2026-09-01'
created_date: '2026-09-01'
drafted_by: fable
exec_model: fable
exec_effort: high
tags: [security, rls, agreements, pii, anonymous-reads]
delivery_stage: create-bug
pipeline_ran: [create-bug]
driver: anomaly
---

# P1222: public agreements expose the invitee's email and the invitation token

## Summary

Any caller holding the public anon key can read party-only columns of every agreement whose
visibility is `public` — including the invitee's email address and the invitation token that the
accept/decline flows key on. Found by the 2026-09-01 general security sweep and verified on prod
by the founder: three public rows, three emails, three tokens.

## Root Cause

Two things combine:

1. **The read policy on the agreements table admits public rows to everyone.** The SELECT policy
   is "public rows, or a party" — correct for the *row*, but row-level security says nothing about
   *columns*, and the table grant covers every column. So a public read returns the same shape a
   party read does.
2. **The client reads the table for public pages.** `src/app/data/agreements-service-real.ts`
   `getAgreement()` and `getAgreementsForProfile()` both `select('*')` from the table for every
   viewer, including anonymous visitors of `/agreements/:id` and a profile's partners list.
   Two column-scoped SECURITY DEFINER readers (`get_public_agreement`,
   `get_public_agreements_for_profile`) exist on the **test** project — applied out-of-band, in no
   migration — and are called by nothing (`grep -rln get_public_agreement src/app` → empty). They
   do not exist on prod at all.

The same class as P877 (profiles PII: table policy correct at row level, columns leaked) and the
P1194 rule (decisions.md 2026-09-01): hiding a value behind an authorization boundary is a
table/RPC decision, not a render branch. Exact policy text, column grants, and the prod row count
are in `.private/docs/security-log.md` § 2026-09-01 (P1222), per the disclosure rule in CLAUDE.md.

**Related drift, recorded here so it stops being invisible:** the test project carries a
narrower parties-only SELECT policy on this table that exists in no migration. Prod never got it.
Migration B below makes that policy canonical.

## Reproduction Steps

1. With the public anon key, `GET /rest/v1/clarity_agreements?visibility=eq.public&select=id,partner_email,invitation_token`
   against prod.
2. Observe rows with both columns populated.

**Reproduction rate:** 100% (prod, 2026-09-01 — three rows).

## Expected Behavior

A public agreement publishes the two parties (by profile), the terms, status and dates. The
invitee's email and the invitation token are readable only by the parties.

## Actual Behavior

Both columns are returned to any anon-key caller for every public row. Today's three prod rows
are all `active`, so their tokens can no longer be replayed through `accept_agreement` /
`decline_agreement` (both require `pending`); a future public-and-pending agreement would be
hijackable/declinable by a stranger until it is accepted.

## Affected Files

- `src/app/data/agreements-service-real.ts` — `getAgreement()`, `getAgreementsForProfile()`
- `supabase/migrations/20260901233000_p1222_public_agreement_rpcs.sql` (new, client-safe)
- `supabase/migrations/20260901234000_p1222_agreements_parties_only_policy.sql` (new, requires-frontend)
- `e2e/integration/p1222-public-agreement-pii.spec.ts` (new)

## Severity

**High** — PII (email addresses of real people) readable without authentication on prod; the token
half is medium today (no live pending public row) but is the accept/decline credential.

## Invariants

- The party-only columns of an agreement (`partner_email`, `invitation_token`) never leave the
  database except to a party or to the holder of that token (via `get_agreement_by_token`).
- Public reads of agreements go through column-scoped SECURITY DEFINER readers, never a table
  `select('*')`. Any new public surface for agreements reuses those readers.
- A policy that exists live in one environment and in no migration is drift; it becomes canonical
  through a migration or it is dropped — never left as the thing a test suite silently depends on.

## Fix Approach

Same shape as P877/P886, sequenced so no deployed client breaks:

1. **Client first** (`feat(p1222)`): public reads move to the RPCs. `getAgreement()` reads the table
   (a party gets the full row under RLS) and falls through to `get_public_agreement` for everyone
   else; `getAgreementsForProfile()` keeps the owner on the table and gives visitors the union of
   `get_public_agreements_for_profile` and whatever rows RLS lets them see as a party. The row
   mapper tolerates the two absent columns.
2. **Migration A** (client-safe, additive): defines both RPCs canonically with EXECUTE for
   `anon, authenticated`. No-op on test (already live out-of-band), creates them on prod.
   Must be applied to prod **before** the client from step 1 is deployed — otherwise public pages
   404 on the RPC.
3. **Migration B** (`requires-frontend: <step-1 sha>`): replaces the table SELECT policy with
   parties-only (creator, partner, or pending invitee by email) — the exact policy already live on
   test. No column REVOKE: parties legitimately read both columns and the client still
   `select('*')`s for them (a column REVOKE would 403 every party read — the P886 incident shape).
4. Tests on TEST: anon and signed-in-non-party table reads of a public row return nothing; public
   page renders through the RPC without the two columns; a party still reads its rows in full;
   `get_agreement_by_token` still resolves a pending agreement.

**Rejected:** a column-level `REVOKE SELECT (partner_email, invitation_token) FROM anon` on its own
— it 403s the parties' `select('*')` reads (decisions.md 2026-09-01, P1194 alternatives; the P886
incident). Also rejected: keeping the visibility branch in the policy and trusting the client
to not select the columns — the anon key is the client.

## Acceptance Criteria

- [ ] `e2e/integration/p1222-public-agreement-pii.spec.ts` — the two defect tests fail against the
      prod-shaped policy and pass after Migration B; the four control tests pass before and after
- [ ] Anonymous `/agreements/:id` for a public agreement still renders (RPC path), and a profile's
      partners list still shows public active agreements to visitors
- [ ] A party's agreement page still shows the invitation link / partner email where it did before
- [ ] `grep -rn "get_public_agreement" src/app` shows the two RPCs called from the service
- [ ] Full vitest + build + `pre-commit-checks.sh` green on the branch
- [ ] `.private/docs/security-log.md` carries the exact predicate and the prod row count
- [ ] **Founder step:** Migration A applied to prod, client deployed, Migration B applied to prod —
      then the reproduction `GET` in step 1 returns `[]`
