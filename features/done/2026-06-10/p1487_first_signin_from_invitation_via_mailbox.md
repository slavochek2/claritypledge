---
status: all-done
type: bug
rank: 39
severity: high
date_reported: 2026-10-14
created_date: 2026-10-14
drafted_by: opus
exec_model: opus
exec_effort: high
tags: [security, letters, agreements, auth]
disclosure: public
pipeline_ran: [create-bug, fix, ship]
flow: fix
completed_at: 2026-10-14
---

# P1487: First sign-in from an invitation must be proven through the mailbox

## Summary

Opening an emailed invitation (a one-to-one letter, or a partner agreement) as a new recipient
created a confirmed account at the recipient's address and signed the browser into it. The
invitation token was the only proof asked for, and the token is not proof of owning the mailbox:
the person who sent the invitation can read it, and anyone the link is forwarded to holds it. So a
sender, or anyone holding a forwarded link, could end up signed in to an account at someone else's
address before that person had ever used it.

Follows P1446, which closed the same shape for accounts that already exist and left the
new-account branch as an open product decision.

## Founder decision (2026-10-14)

"Mailbox-delivered first sign-in." The recipient can still read the letter, or view the agreement,
with the invitation token alone. Creating an account or signing in to it requires a link delivered
to the recipient's own mailbox. The token alone never yields a session or a confirmed account.

## Root Cause

Both invitation edge functions treated "holds the invitation token" as "is the invited person":
for an address with no account they created the account with its email marked confirmed, and
returned a one-time sign-in credential in the response for the page to redeem. The token is
readable by more people than the invitee (the letter's sender can read delivery rows), so the
credential reached whoever presented the token.

Exact mechanics and the catalog evidence are in the private security log, entry
`2026-10-14 — P1487`.

## Invariants

- An invitation token is a capability to READ (and, for agreements, to decline). It is never
  proof of owning the invited mailbox, and no code path may turn it into a session, a
  credential in a response, or a confirmed account.
- A first sign-in for an invited address happens only through a link sent to that address.
- The letter stays readable by token without an account (token reading RPCs unchanged).

## Reproduction Steps (pre-fix, role-level)

1. A sender seals a one-to-one letter to an address that has no account.
2. Someone other than the recipient presents that delivery's invitation token to the letter-open
   function.
3. Observe: the response carries a sign-in credential, and the recipient's address now has a
   confirmed account the presenter is signed in to.

The agreement flow had the same shape through its one-click "sign" function.

**Reproduction rate:** 100% (proven on the test project by the fail-first runs below).

## Expected Behavior

The presenter gets no credential and no confirmed account. The recipient's mailbox gets a one-time
sign-in link; opening it confirms the account, writes the profile through the normal sign-in path,
and returns to the letter, signed in. Recipients who already have an account are unaffected (they
sign in the normal way, P1446).

## Fix

- **Letters** (`create-and-open-letter`, logic moved to `handler.ts` so it is testable): the
  new-account branch creates the account UNCONFIRMED (no profile, delivery not claimed), mints a
  one-time sign-in link and emails it to the delivery's address; the response is
  `{ ok, checkEmail }`. An account that never confirmed its email is treated the same way (link
  re-sent). Existing-account and confirmed-orphan branches unchanged.
- **Agreements** (`create-and-sign`, logic in `handler.ts`): after the invitation checks it makes
  sure only the invited mailbox can activate an account (creates one UNCONFIRMED, or resets an
  existing unconfirmed one; a confirmed one is left alone) and emails a one-time sign-in link to
  the invited address. It writes nothing the caller typed to the account; the profile name is set
  by the partner's own signed-in session on the accept page (with a matching slug, while the
  profile still has the sign-in placeholder). Same `{ ok, checkEmail }` answer in every case;
  never a session, never a signature. The agreement is signed after the partner returns signed
  in. Rate-limited like the letter path. Only the current terms version is accepted
  (`_shared/terms-version.ts`, shared with the letter function).
- **Reader UI**: the letter page shows a "Check your email" state (with resend) instead of signing
  in; it never redeems a credential from a response. On the accept page, "Seal & Sign", "Sign In to
  Co-Sign" and the confirm-email resend all ask `create-and-sign` for the link
  (`src/lib/agreement-signin.ts`); no invitation page calls the auth server's own email sign-in.
- **Unconfirmed accounts are reset before any sign-in link is minted for them**
  (`_shared/unconfirmed-account.ts`, called by every link-minting function): an account that
  never confirmed its email keeps no password or profile metadata from whoever created it once
  the link confirms it. Confirmed accounts are untouched.
- **Claiming a delivery requires being its addressee**: `claim_letter_delivery` only binds a
  delivery to the signed-in account whose confirmed email equals the delivery's address, and the
  claim write is conditional (migration `20261014150000`).
- **Terms audit, anchored on the server and bound to the link**: only for an account the emailed
  link will activate (created, or reset from unconfirmed — never an already-confirmed one), the
  function stores the current terms version in app_metadata (service-role-only) with a nonce that
  travels only in that emailed link (`terms_nonce`). After sign-in, `/auth/callback` passes the
  nonce to `consume_pending_terms_acceptance(p_nonce)` (migration `20261014183307`, which replaces
  the zero-argument version from `20261014171731`); it records the current version once, for the
  caller only, within the link's hour, and only for the matching nonce. A sign-in by any other
  route records nothing. No URL parameter or client argument chooses what is recorded.
- **Defense in depth**: the delivery invitation token is no longer readable by client roles
  (table grant replaced by a column list without it; the sender's progress RPC no longer returns
  it). No client screen read it. Client reads now name their columns.

## Acceptance Criteria

- [x] A token holder who does not own the mailbox gets no credential and no confirmed account
      (new recipient, and repeat clicks) — `p1487-mailbox-first-signin.test.ts` tests 1 and 3
- [x] The sign-in link goes only to the delivery's address; opening it confirms the account,
      and the signed-in recipient can write their profile and claim the delivery — test 2
- [x] The letter stays readable with the token alone, before and after "Open" — test 2 controls,
      and the migration integration test
- [x] Recipients with an existing account (and confirmed orphans) are unaffected — tests 4 and 5
- [x] Reader UI: "Check your email" state shown, no credential redeemed; on the agreement page
      "Seal & Sign", "Sign In to Co-Sign" and a refused request go through `create-and-sign`, never
      the auth server's own email sign-in — `src/tests/p1487-first-signin-via-mailbox.test.tsx`
      (red 3/3 on the previous page); no invitation-flow file calls `signInWithOtp` —
      `src/tests/p1487-invitation-no-client-otp.test.ts` (structural, derived scope; red: 2 files)
- [x] Agreement server path: an existing unconfirmed account at the invited address (with a
      password) keeps none of its earlier credentials once the partner signs in; a new invitee gets
      an unconfirmed account and nothing is signed; a confirmed account is untouched and gets the
      same answer; a wrong token or non-pending agreement creates/sends nothing; 4th mail per
      address per hour → 429 — `supabase/functions/create-and-sign/p1487-agreement-mailbox-signin.test.ts`
      (5/5 live on TEST); end to end through the page — `e2e/p527-direct-sign.spec.ts` (red 3/3 on
      the previous client, green 10/10)
- [x] No invitation function creates a confirmed account or returns a credential (structural,
      derived scope) — `p1487-invitation-no-confirmed-account.test.ts`, `p1446-…shape.test.ts`
- [x] Client roles cannot read a delivery's invitation token (table or progress RPC); app reads,
      receiver status update, token reading and claim still work —
      `e2e/integration/20261014140000_p1487_delivery_token_server_only.spec.ts` (green on test)
- [x] Sign-in mail is rate-limited with the P1225 limiter, re-sends included: caller IP bucket
      before the invitation is read, recipient-address bucket before any account, link or mail;
      429 with Retry-After on the (N+1)th, generic 500 when the limiter cannot decide, nothing
      created or sent on a refusal — `p1487-mailbox-first-signin.test.ts` limiter tests (red 3/3
      without the limiter, green 8/8 with it); the page shows the limiter's message on a refused
      re-send — `p1487-first-signin-via-mailbox.test.tsx`
- [x] An unconfirmed account that already exists at the address keeps no earlier password or
      metadata once the recipient signs in; confirmed accounts are untouched; every link-minting
      function resets first — `p1487-mailbox-first-signin.test.ts` (red: earlier password still
      signed in), `_shared/p1487-unconfirmed-account.test.ts` (red with a no-op reset),
      `src/tests/p1487-unconfirmed-account-reset.test.ts` (structural, derived scope; red on 4 of 5)
- [x] Only the addressed recipient can claim a delivery; the recipient's own claim, re-claim,
      address case and the sender refusal behave as before —
      `e2e/integration/20261014150000_p1487_claim_requires_intended_recipient.spec.ts` (red before
      the migration, green after; prod measured first: 0 of 35 claimed deliveries cross addresses)
- [x] The terms acceptance made before sign-in is recorded once, from server-held intent bound to
      the emailed link — `e2e/integration/20261014183307_p1487_pending_terms_bound_to_link.spec.ts`
      (red: function missing; green 6/6: issued nonce records once; no/other nonce records nothing
      and keeps the intent; older than an hour discarded; superseded version never recorded;
      self-written metadata ignored; anon refused); letter and agreement live suites (the handler
      writes the intent with the nonce that is in the emailed link; a confirmed account gets no
      intent, and signing in by another route records nothing — red on the round-3 code);
      `e2e/p527-direct-sign.spec.ts` TC-03 end to end (exactly one row; red on the round-3 client);
      a `terms` URL parameter records nothing — page unit test
- [x] Only the current terms version is accepted by the invitation functions and recorded by the
      RPC — `src/tests/p1487-terms-version-single-source.test.ts` (reads all sources; red 4/6 on the
      round-3 code), agreement live test (v1.3 → 400, nothing created)
- [x] Nothing typed before sign-in becomes the account's name; the signed-in partner's own name
      replaces the placeholder (with a matching slug) — agreement live suite (no `name` written),
      page unit tests (red on the round-3 page), p527 TC-03 (profile name and slug from the signed
      name; red on the round-3 client)

## Done-When

- [x] Fail-first evidence recorded for each test file (red on pre-fix code, green after)

## Pre-deploy Checklist

### Secrets to provision
- [x] None new. `create-and-open-letter` now sends mail and rate-limits it: `MAILGUN_API_KEY`,
      `MAILGUN_DOMAIN`, `MAILGUN_REGION`, `APP_URL` and `IP_HASH_SECRET` are set for the prod project
      — verified 2026-10-14 with `./scripts/check-edge-function-secrets.sh --env prod --scan-dir`
      over this branch's functions: "OK: all required edge function secrets present".

## Prod deploy order (executed at deploy time, not a merge prerequisite)

1. P1225's limiter (`_shared/mail-rate-limit.ts`, migration `20261014130000`) on prod first — this
   function fails closed (500) if the limiter RPC is missing.
2. Deploy `create-and-open-letter` and `create-and-sign` (an older client degrades safely: letters
   read on by token, signed out; agreements fall back to the email path).
3. Frontend (names its delivery columns; never redeems a credential from a response).
4. Apply `20261014140000_p1487_delivery_token_server_only.sql` only after step 3 is live (its
   `requires-frontend` marker enforces this): an older client's `select('*')` on deliveries is
   refused once it lands.
4b. Apply `20261014150000_p1487_claim_requires_intended_recipient.sql` (client-safe; any time
   after step 2), then `20261014171731_p1487_pending_terms_acceptance.sql` and
   `20261014183307_p1487_pending_terms_bound_to_link.sql` (client-safe; the second replaces the
   first's function; both before step 3, so the callback's call finds it — without it the call
   only logs an error). `request-letter-response-signin` now accepts only the current terms
   version.
   `create-and-sign` now sends mail: it needs the same secrets as `create-and-open-letter`
   (`MAILGUN_*`, `APP_URL`, `IP_HASH_SECRET`), and it must be deployed before the frontend — the
   new accept page relies on its `{ ok, checkEmail }` answer. Also deploy `send-letter-emails`, `send-agreement-emails`, `event-email-link`
   and `request-letter-response-signin` (they now reset unconfirmed accounts before minting).
5. Check Sentry for new errors in the first 10 minutes.

## Known limitations

- **A new agreement partner who opens the emailed link on another device** lands on the accept
  page signed in but without the name they typed (it stays in the first browser). Their profile
  keeps the sign-in placeholder name until they type it on the accept page (the name field is shown
  for a placeholder name) or in their profile. Letters still name a new reader from the
  sender-entered recipient name, as before P1487.

- **Sign-in paths outside the invitation flow** have a related hardening item that needs an auth
  configuration decision. It is tracked privately (`.private/docs/security-log.md`, 2026-10-14,
  P1487) until it is closed.

## Out of scope / follow-ups

- Agreement invitation tokens stay readable by the agreement's creator (P1222 kept that
  deliberately). With this fix the token no longer signs anyone in or signs the agreement; it
  still lets a holder decline. Separate decision.
- Existing e2e specs that assert the retired one-click behaviour need rewriting, not deleting
  (see the P1487 report).

## Post-deploy verification

Run after the prod apply/deploy (not a completion gate — prod cannot be verified pre-merge):

- `[post-deploy]` On prod: opening a new-recipient invitation returns no credential and the
      recipient receives the email; agreement "Seal & Sign" sends the email
- `[post-deploy]` Prod catalog: client roles lack SELECT on the delivery token column; the
      progress RPC no longer emits it
- `[post-deploy]` Functions `create-and-open-letter`, `create-and-sign` and the frontend
      deployed; migration `20261014140000` applied to prod; read-only re-probe recorded in the
      private log
- The two `[post-deploy]` ACs above
