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
pipeline_ran: [create-bug, inline]
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

## Release order (prod) — the only sequence that never blanks a public page

1. Apply `20260901233000` and `20260901235000` (both `client-safe`, additive: the readers +
   `get_my_pending_invitations`). Neither carries `requires-frontend`; neither depends on B/C.
2. Deploy the client (`ce02c269` + the codex follow-up commit). During the window between 1 and
   2 the old client keeps reading the table (still public) — nothing changes for it. If step 2
   somehow lands before step 1, the new client falls back to the table read on `PGRST202`
   (reader absent) for `getAgreementsForProfile` / `getIncomingInvitations`, and
   `getAgreement` reads the table first anyway.
3. Apply `20260901234000` then `20260901236000` (both `requires-frontend`; `migrate.sh` refuses
   them until the client commit is an ancestor of `origin/main`). After this the table returns
   rows to parties only and the email-claim branch is gone.

Verify: anon `GET /rest/v1/clarity_agreements?visibility=eq.public&select=partner_email,invitation_token`
→ `[]`; anon `GET /rest/v1/rpc/get_public_agreement?p_id=<public id>` → the row without the
party-only columns.

## Codex review follow-up (applied)

- **Email claim ≠ possession.** The parties-only policy kept a `status='pending' AND
  lower(partner_email) = lower(auth.email())` branch. Dropped in `20260901236000`; pending
  invitations now come from `get_my_pending_invitations()`, which requires
  `auth.users.email_confirmed_at IS NOT NULL` for the caller and returns the invitation token to
  that confirmed caller only (the in-app "Review & Sign" link is built from it; the token was
  mailed to that address). Test: an `email_confirm:false` user reads nothing via table or RPC; a
  confirmed invitee reads via the RPC and not via the table.
- **Release sequencing.** See above; `PGRST202` fallbacks added to the client.
- **`terminated_by`** removed from both public readers (`20260901235000`).
- **Manifest.** `supabase/deploy-manifest.json` on the branch now lists every P1222 migration
  applied to test; the stamp script refuses to run inside a worktree, so the list was edited by
  hand to match the test ledger.
- **Red state.** The test suite's last describe recreates the P422 policy inside one Management
  API transaction, reads the public row as `anon`, asserts email + token are returned, and rolls
  back — the only way to observe the prod-shaped defect on a test project that never carried it.

## Acceptance Criteria

- [x] `e2e/integration/p1222-public-agreement-pii.spec.ts` — 10/10 on TEST after migrations A/B/C/D (see Evidence); 6/6 before the codex follow-up
      (`ce02c269`, `6844d9bc`). Caveat: the two defect tests are green pre-B on test only because
      test already carried the parties-only policy out-of-band; the red state is the prod `GET` in
      Reproduction step 1 (three rows, 2026-09-01, private log)
- [x] Anonymous `/agreements/:id` for a public agreement still renders (RPC path), and a profile's
      partners list still shows public active agreements to visitors — browser-verified in
      `e2e/p1222-public-agreement-render.spec.ts` (11/11, exit 0), each with a control; see
      § Browser render evidence
- [x] A party's agreement page still shows the invitation link where it did before, and the
      token-keyed accept flow still works — browser-verified in the same file, with a non-party
      control. `partner_email` is **not rendered on the agreement page at all** (`grep -rn
      partnerEmail src/` → no render site in `agreement-page.tsx`); a party's read of that column
      is covered by the integration suite's party table read. See § Browser render evidence for
      what this AC could and could not be tested as
- [x] `grep -rn "get_public_agreement" src/app` → `agreements-service-real.ts` calls both RPCs
- [x] Full vitest + build + `pre-commit-checks.sh` green on the branch (pre-commit on `ce02c269`:
      TypeScript ✓ ESLint ✓ Build ✓ Tests ✓; `6844d9bc`: all checks passed)
- [x] `.private/docs/security-log.md` carries the exact predicate and the prod row count
      (§ 2026-09-01 "P1222 built in w17")
- [ ] **Founder step — prod apply. Not doable from here; nothing on prod has changed yet.**
      Run from the MAIN repo root (`~/Projects/public/claritypledge`), in this order:

      1. `/ship p1222`, then push `main` to `origin` and let the client deploy finish.
         The client must be live BEFORE step 2: migration B removes public rows from the
         table, and a still-deployed old client reads the table for public pages.
      2. `./scripts/migrate.sh --env prod` — review the pending list, answer `y`.
         All four P1222 migrations apply in one run, in version order
         (`20260901233000`, `20260901234000`, `20260901235000`, `20260901236000`).
         Note the gate is **all-or-nothing**: B and D carry
         `-- requires-frontend: ce02c269` / `f157a855`, and while either sha is not an
         ancestor of `origin/main` the run exits 1 *before applying anything*, A and C
         included. So step 1 is what unblocks step 2 — there is no partial-apply path,
         and the marker must not be deleted to force one (P886).
      3. Verify — the reproduction `GET` from § Reproduction Steps must return `[]`:
         `curl -s "$PROD_URL/rest/v1/clarity_agreements?visibility=eq.public&select=id,partner_email,invitation_token" -H "apikey: $PROD_ANON_KEY"`
         → `[]`, and
         `curl -s "$PROD_URL/rest/v1/rpc/get_public_agreement?p_id=<a public agreement id>" -H "apikey: $PROD_ANON_KEY"`
         → the row, without `partner_email` or `invitation_token`.

      Tick this only after step 3's output is pasted below.

## Browser render evidence (2026-09-03)

The integration suite proves the DATA contract. It cannot prove that the pages which used to
read the table still render once the table stops answering them — that is what the two
previously-unticked ACs asked for, and it is now `e2e/p1222-public-agreement-render.spec.ts`,
run in a real browser against the test project with all four migrations applied:

```
npx playwright test --project=chromium e2e/p1222-public-agreement-render.spec.ts
  11 passed (28.8s)        exit 0
```

Every property is paired with a control that fails differently, so a green run cannot come
from the page being permissive:

| Property (AC) | Control |
|---|---|
| anon `/agreements/:id` for a **public** agreement renders terms + both names, and the delivered HTML contains neither party's email | the same page for a **private** agreement shows "This agreement is private" and never the terms |
| anon `/p/:slug` shows "1 Clarity Partner"; `/p/:slug/partners` names the partner and carries no email | a profile with no public agreement shows "0 Clarity Partners" |
| the invitee (signed in) still sees **Review & Sign** whose `href` carries the invitation token | a non-party visitor on the same agreement gets no such link |
| the creator (signed in) still sees the party-only "Your Agreement" toolbar + Share | — (the anon test above is its own negative) |
| the token-keyed accept flow reaches co-sign for a signed-in invitee, and renders the certificate for a signed-out one | a bad token gives "This invitation has expired or is invalid" |

**The gate was watched fail** (epistemic gate 7). With the public fixture created as
`visibility: 'private'` instead — the one change that should break it — the public-render test
reports:

```
Locator: getByText('P1222 public terms mtl7qzli5pw')   Expected: visible   element(s) not found
  1 failed
```

**What this AC could not be tested as, stated rather than quietly dropped.** The second AC's
wording ("shows the invitation link / partner email") does not match the page:
`agreement-page.tsx` never renders `partner_email` — `grep -rn "partnerEmail" src/` returns the
mapper, the create-page duplicate guard, and the accept page, and no render site on the
agreement page. So the invitation link is asserted directly; the party's *read* of
`partner_email` is the integration suite's party table read.

**Pre-existing, found while testing this, NOT caused by P1222 and not fixed here.** A
signed-out invitee who already has an account is never recognised on the accept page — the
"Sign In to Co-Sign" branch needs `lookup_party_by_email`, and P877 revoked `anon` EXECUTE from
it on 2026-06-02 (`20260602160000_p877_profiles_pii_column_grants.sql:351`; confirmed against
`pg_proc.proacl` on test, which grants only `authenticated` and `service_role`). Every
signed-out invitee therefore gets the new-user "Seal & Sign" path, including returning users.
That is a deliberate anti-enumeration grant with an unintended UX consequence; it wants its own
bug spec, not a change on this branch.

## Evidence

**Applied to TEST (Management API, from inside w17):** `20260901233000`, `20260901234000`,
`20260901235000`, `20260901236000` — all four present in `supabase_migrations.schema_migrations`
on the test project. Post-apply catalogue read of `pg_policies` for `clarity_agreements`:

```
SELECT  | Agreements readable by parties only | {anon,authenticated}
        | ((creator_profile_id = auth.uid()) OR (partner_profile_id = auth.uid()))
UPDATE  | Parties can update their agreements | {authenticated}
INSERT  | Authenticated users can create agreements
```

No `visibility`, no `email`, no `pending` branch — the email-claim disjunct is gone.

**Integration suite** (`npx playwright test --project=integration
e2e/integration/p1222-public-agreement-pii.spec.ts`, 2026-09-03): **10 passed, 0 failed, 0 skipped**
(2 of the 10 flaked on the first attempt with `Client network socket disconnected before secure TLS
connection was established` reaching the Management API under concurrent load, and passed on retry
— network, not assertion). None of the `test.skip` guards fired, so the confirmed-email fixtures
were genuinely exercised rather than skipped. Covering, in particular:

- an `email_confirm:false` user holding a valid JWT reads **nothing** for its own pending
  invitation — neither `from('clarity_agreements')` nor `get_my_pending_invitations()`;
- a confirmed invitee **does** read that row through `get_my_pending_invitations()` **with** the
  invitation token, and reads nothing for it from the table;
- `anon` calling `get_my_pending_invitations()` is refused with `42501`;
- the readers never return `terminated_by`;
- the transactional red state: with the P422 policy recreated inside one rolled-back transaction,
  `anon` does see `partner_email` + `invitation_token` — then the rollback is asserted.

**Review items re-verified by command on the branch:**
- `supabase/deploy-manifest.json` lists `20260901233000`, `20260901234000`, `20260901235000`,
  `20260901236000`.
- `grep -n terminated_by supabase/migrations/20260901235000_*.sql` → comments only; neither
  reader's `RETURNS TABLE` carries the column.
- `isRpcMissing` (`error.code === 'PGRST202'`) is called at two sites in
  `src/app/data/agreements-service-real.ts` — the `getAgreementsForProfile` and
  `getIncomingInvitations` reader calls — so a client deployed ahead of the readers falls back to
  the table read instead of hard-failing.

**Production order (unchanged, restated as the operational contract):**
1. `20260901233000` + `20260901235000` — client-safe, additive, no `requires-frontend`.
2. Deploy the client (`ce02c269` + `f157a855`).
3. `20260901234000` + `20260901236000` — both `requires-frontend`; `migrate.sh` refuses them until
   the client commit is an ancestor of `origin/main`.

Then re-run the reproduction `GET`; expect `[]`.
