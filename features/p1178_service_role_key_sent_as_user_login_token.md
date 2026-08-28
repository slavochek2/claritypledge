---
status: qa
type: bug
rank: 238
workstream: infrastructure
created_date: '2026-08-28'
tags: [edge-functions, auth, silent-failure, email]
driver: anomaly
delivery_stage: ship
pipeline_ran: [reproduce, fix, ship]
reproduce_artifact:
  test_file: e2e/integration/p1178-reproduce.spec.ts
  root_cause: "create-and-sign:265 sends the service_role JWT as Bearer; send-agreement-emails:405 resolves it with auth.getUser(), which yields no user (no sub claim) and returns 401. Blast radius is the P527 new-user direct-sign path only."
  confidence: high
  scenarios_in_scope: [direct-sign-new-user]
  scenarios_cleared: [existing-user-accept, invitation, declined, terminated, resend]
  sibling_grep: "Authorization: `Bearer — 2 hits in supabase/functions/; only create-and-sign:265 is the pattern (enqueue-transcription:72 is a Google OAuth token to Cloud Tasks)"
  reproduced_at: 2026-08-28
  fix_shape: open
  fix_shape_why: "shared-secret header on send-agreement-emails vs inlining the send into create-and-sign"
date_resolved: '2026-08-28'
root_cause: "create-and-sign sent the service_role JWT in the Authorization: Bearer position; send-agreement-emails resolved it with auth.getUser(), got no user (service_role carries no sub claim), and returned 401. The caller was fire-and-forget with a bare .catch(), which never inspects status, so the 401 was invisible."
resolution: "send-agreement-emails gained an internal-caller branch keyed on an INTERNAL_FN_SECRET header (the WEBHOOK_SECRET / CRON_SECRET / GCS_UPLOAD_SECRET pattern), confined to action 'accepted'. create-and-sign now sends the anon key for the gateway plus that secret — no database key leaves the function — and logs every non-2xx with a P1178-DIAG marker instead of swallowing it."
---

# P1178: `create-and-sign` sends the service-role key where a user login token is expected — silently

## Problem

**Situation:** On the "agreement accepted" path, `create-and-sign` fires a notification call to
`send-agreement-emails`:

```ts
// supabase/functions/create-and-sign/index.ts:265
fetch(`${supabaseUrl}/functions/v1/send-agreement-emails`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json',
             Authorization: `Bearer ${serviceRoleKey}` },
  body: JSON.stringify({ action: 'accepted', agreementId }),
}).catch(err => console.error('[create-and-sign] email notification failed:', err));
```

**Complication:** the receiving function does not treat that header as a service credential. It
treats it as an end-user login:

```ts
// supabase/functions/send-agreement-emails/index.ts:397-405
const token = authHeader.replace('Bearer ', '');
const anonClient = createClient(supabaseUrl, SUPABASE_ANON_KEY);
const { data: { user }, error: authError } = await anonClient.auth.getUser(token);
if (authError || !user) return 401;
```

A `service_role` JWT carries no user subject, so `getUser()` is expected to yield no user and the
function returns **401**. The caller is fire-and-forget with a bare `.catch()`, so a 401 is
swallowed and never surfaces — no Sentry event, no user-visible error, nothing in the happy path.

**Consequence if confirmed:** the "agreement accepted" notification email — described in the code
comment as *"the ONLY email trigger for this flow"* — never sends, and has possibly never sent.

**Not caused by the API-key migration (P46/pp), but surfaced by it.** Found while enumerating
consumers of the leaked prod `service_role` key. Under the new secret keys this call fails for a
second, independent reason: secret keys are not JWTs and are rejected in the
`Authorization: Bearer` position unless the value exactly equals the `apikey` header. The
migration does not make the outcome worse — it fails either way — which is why it was
deliberately left untouched rather than patched blind.

## Root Cause (confirmed 2026-08-28)

**Confirmed.** The 401 is real, it comes from the function (not the gateway), and its blast radius
is narrower than this spec first assumed.

**The 401 is the function's own, not the gateway's.** Replaying the exact call shape against
**test** (`gfjctyxqlwexxwsmkakq`) with a control:

| Bearer | HTTP | Body | Who answered |
|---|---|---|---|
| garbage string | 401 | `{"code":"UNAUTHORIZED_INVALID_JWT_FORMAT","message":"Invalid JWT"}` | gateway |
| legacy `service_role` JWT | 401 | `{"error":"Unauthorized"}` | **the function**, `index.ts:405` |

The service-role JWT is signature-valid, so it clears the gateway and dies at `getUser()`. Its
decoded payload carries no `sub`: `{"iss":"supabase","ref":"…","role":"service_role","iat":…,"exp":…}`.
Only lines 399 and 405 can emit that exact body, and the header does start with `Bearer `, so it is
405.

**Scope correction — two `accepted` triggers exist, only one is broken.** The code comment calling
this "the ONLY email trigger for this flow" is true of the create-and-sign flow, not of accepted
agreements generally:

| Trigger | Credential | Outcome |
|---|---|---|
| `accept-agreement-page.tsx:203` — existing-user accept | user JWT | works ✓ |
| `create-and-sign/index.ts:261` — **P527 new-user direct-sign** | `service_role` JWT | 401, no email ✗ |

`accept-agreement-page.tsx:427` deliberately skips the frontend send on the direct-sign path
(`// Do NOT fire invokeAgreementEmails — the edge function already did`), so nothing covers it.

**Silent since 2026-04-03 — 147 days.** `git log -L` on both hunks: the fire-and-forget call was
written 2026-03-16 (`c642d74e`, P527); the `getUser` gate was added 2026-04-03 (`448c4c66`, security
hardening). Before that commit the function had **no caller auth at all** (`git show 448c4c66^`
shows the only `Authorization` in the file is Mailgun's own Basic header) — so the email did send
for those first ~18 days. Prod `send-agreement-emails` is v33, deployed 2026-06-02 with
`verify_jwt=true`, so prod carries the gate.

**Mailgun logs cannot corroborate the duration — and did not.** Retention on this plan is ~1 day:
a 90-day query returned 15 `accepted` events spanning 2026-08-27 → 2026-08-28, all of them signup
emails, with **zero agreement emails of any kind** — including invitations, which are known to
work. The window is uninformative in both directions, not evidence of absence. The duration above
comes from git history plus the live 401, not from delivery logs.

**Sibling grep recorded.** `Authorization: \`Bearer` across `supabase/functions/` returns 2 hits:
`create-and-sign:265` (this bug) and `enqueue-transcription:72`, which passes a Google OAuth token
to Cloud Tasks — a different pattern, cleared. No other edge-function-to-edge-function call exists
(`functions/v1/` appears exactly once in `supabase/functions/`).

## Canary

`e2e/integration/p1178-reproduce.spec.ts` — two tests against the deployed **test** functions,
asserting the user-visible outcome (the creator's email is sent) via Mailgun's `accepted` event log,
an oracle independent of the functions under test. Fix-shape agnostic: it asserts the email, not the
header.

- **control** — existing-user accept path with a user JWT: **passes** (10.0s). Proves the oracle can
  see an accepted-agreement email at all.
- **canary** — real `create-and-sign` direct sign (returns 200 `ok:true`), then wait 90s for the
  creator's email: **fails**, deterministically, on two consecutive runs.

A first version of this canary went **2/2 green against unfixed code**: both tests shared one
creator, so the canary matched the control's email — same recipient, same subject. Each test now
creates its own creator. The control is what makes a canary failure meaningful rather than blind.

## Investigation (done 2026-08-28 — see Root Cause)

- [x] Mailgun ground truth — **inconclusive by retention, not by result.** ~1 day of logs; the
      window holds no agreement emails at all, including working ones. Duration established from
      git history instead.
- [x] Confirm the 401 directly against test — done, with a garbage-bearer control that attributes
      it to the function rather than the gateway.
- [x] `send-agreement-emails` deploy flags — `verify_jwt=true` on both test (v25) and prod (v33);
      `deploy-functions.sh:114` grants `--no-verify-jwt` to `create-and-sign` alone. The
      service-role JWT clears the gateway anyway, so the gate that fires is the in-function one.
- [x] Sibling grep — one instance only; `enqueue-transcription:72` inspected and cleared.

## Fix sketch (only after the above)

The caller is a trusted internal service, not a user. Options, in preference order:

1. **Give the receiver a service-to-service path** — accept a shared secret header (the codebase
   already has this pattern: `WEBHOOK_SECRET`, `CRON_SECRET`, `GCS_UPLOAD_SECRET`) and skip
   `getUser()` when it is present and valid. The caller then sends that, not a database key.
2. **Inline the send** — drop the cross-function hop entirely if the caller already holds
   everything the email needs.

Do **not** simply add an `apikey` header equal to the bearer. That silences the transport-level
rejection while leaving the receiver still trying, and failing, to resolve a user from a
non-user credential.

## Done-When

- [x] It is established from Mailgun evidence whether this email sends today — **it did not.**
      The canary's Mailgun oracle answered what the 1-day event log could not: canary red (no
      accepted-email in 90s) against a green control on the same oracle, twice.
- [x] A signed agreement on test produces the accepted-email, proven by a Mailgun event — canary
      green in 16.4s, then 10.0s on a re-run against the final deployed versions.
- [x] The failure is no longer silent — see Resolution: `notifyCreator` inspects `res.ok` and logs
      status + body under a `P1178-DIAG` marker; a missing secret is logged rather than dropped.
- [x] The grep for sibling instances of the pattern is recorded, with each hit either fixed or
      explicitly cleared — re-run at fix time, output in Resolution.

## Resolution (2026-08-28)

**Fix shape chosen: 1 (service-to-service path on the receiver), not 2 (inline the send).**
`send-agreement-emails` holds its own private `escapeHtml` / `htmlEmail` / `button` / `sendEmail`
and the `agreements@` sender; `_shared/email-helpers.ts` is the *events* variant (`events@`).
Inlining therefore means either a second copy of the accepted-email template — two copies of one
user-visible email, free to diverge — or extracting five helpers used by all five handlers, a
refactor across the whole email surface inside a bug fix. Option 1 adds one auth branch to an
existing hop and reuses a pattern the codebase already carries three times.

**Receiver (`send-agreement-emails`).** An internal-caller branch keyed on `x-internal-secret`
matching the `INTERNAL_FN_SECRET` env var skips the JWT resolution and the party check — the two
things a caller with no user identity can never satisfy. Three limits keep the bypass narrow:
internal callers may only fire `action: 'accepted'`; the agreement must exist (404 unchanged); and
it must be `status = 'active'`, which `accept_agreement` is what sets. The status check came from
code review — without it, the action allowlist bounded *which action* a leaked secret could fire
but not *which agreement*, so it could have told the creator of a pending, declined or terminated
agreement that it had just been co-signed. An unset secret makes `isInternal` structurally false,
so the branch fails closed.

**Caller (`create-and-sign`).** `notifyCreator()` sends the anon key in `apikey` + `Authorization`
purely to clear the gateway's `verify_jwt` check (`send-agreement-emails` is deployed
`verify_jwt=true`, confirmed v27/v28 on test), and proves who it is with the secret header. No
database key leaves the function. The call stays fire-and-forget — the agreement is already sealed
and the signer must not wait on Mailgun — but a non-2xx response and a transport error are both
logged with a greppable `P1178-DIAG` marker. Edge functions have no Sentry wired up in this repo
(grep: zero hits under `supabase/functions/`), so the Supabase dashboard log is the read path,
per the `[BUG_ID-DIAG]` convention in `docs/decisions.md` 2026-04-17.

**Sibling grep, re-run at fix time:**

```
$ grep -rn 'Authorization: `Bearer' supabase/functions/
enqueue-transcription/index.ts:72  Google OAuth token to Cloud Tasks — different pattern, cleared
create-and-sign/index.ts:74        this fix (now the anon key, not the service-role key)

$ grep -rn 'functions/v1/' supabase/functions/
create-and-sign/index.ts:69        the only edge-function-to-edge-function call in the repo
```

Adjacent, **not** the same class and left alone: `generate-banner/index.ts:450` accepts the
service-role key as an `x-service-key` shared secret. That receiver expects the key deliberately,
so it does not fail silently — but it does use the database master key as a service credential, and
no caller in this repo sends that header.

**Evidence.**

| Check | Result |
|---|---|
| Canary before fix (`p1178-reproduce.spec.ts`) | control ✓ 11.4s, canary ✘ 1.6m |
| Canary after fix, final deployed versions | 2 passed (14.2s) — canary 10.0s |
| `edge-fn-authz-regression.spec.ts` (6 new P1178 cases) | no secret → 401, wrong secret → 401, valid secret + `invitation` → 403, valid secret + unknown agreement → 404, valid secret + non-active agreement → 403, valid secret + `accepted` → 200 |
| Pre-existing party guard (non-party JWT → 403) | still passes — the bypass did not widen it |
| Unit suite | 3266 passed, 19 skipped, 0 failed |
| `pre-commit-checks.sh` | all checks passed |

## Pre-deploy Checklist

This fix introduces a new server-side secret, so prod needs it provisioned *before* either
function deploys. Verified 2026-08-28: `INTERNAL_FN_SECRET` is present on the test project and
**absent on prod** (19 secrets listed, not among them).

### Secrets to provision
- [x] `INTERNAL_FN_SECRET` — set on prod 2026-08-28 with a fresh `openssl rand -hex 32` value,
      distinct from the test project's. Verified present (20 secrets listed).

### Deploy commands
- [x] `send-agreement-emails` deployed to prod (v33 → **v35**, `verify_jwt=true`) — receiver first.
      Deployed from the worktree with the CLI directly: `deploy-functions.sh --env prod` resolves
      `.env.prod` relative to a native worktree `scripts/` and fails there, and deploying from the
      main checkout would have shipped the pre-fix source (this branch is not merged yet).
      `check-edge-function-secrets.sh --env prod` was run separately and passed.
- [x] `create-and-sign` deployed to prod (**v29**, `--no-verify-jwt` per `deploy-functions.sh:114`,
      confirmed `verify_jwt=false` after deploy).
- [x] No Vercel redeploy needed — nothing here is a `VITE_*` build-time var. N/A.

### Post-deploy verification
- [x] Direct-sign a test agreement on prod as a new user; confirm the creator receives the
      "co-signed your Clarity Partner Agreement" email — **done 2026-08-28 against prod.** Signed in
      as the prod test agent (`PROD_TEST_AGENT_*`, no service-role key needed — the agreement insert
      is an ordinary RLS-permitted creator write), created a pending agreement, and called the real
      `create-and-sign` with its DB-generated invitation token: `200 {"ok":true,...}`. Mailgun logged
      the `accepted` event to the creator within the 90s window:
      `P1178 Verify Partner co-signed your Clarity Partner Agreement`.
- [x] Grep the `create-and-sign` prod logs for `P1178-DIAG` — **zero hits** after the verification
      run (`function_logs` via the Management API, `error: null`). Confirmed as a real absence rather
      than a blind probe by a control query on the same table, which returned rows.

**Fail-closed until then.** `check-edge-function-secrets.sh` classifies `INTERNAL_FN_SECRET` as
REQUIRED-EMPTY, so a prod deploy is mechanically blocked while the secret is missing. If it were
somehow bypassed, `create-and-sign` skips the notification and logs `P1178-DIAG notify skipped`
rather than failing silently.

## Notes

- Related: `pp/tasks/p46` (the API-key migration that surfaced this) and
  `docs/decisions.md` 2026-08-28 (leaked `service_role`, migration off legacy API keys).
- The silent-failure shape here — fire-and-forget plus bare `.catch()` on a call that is the sole
  trigger for a user-visible outcome — is exactly what `silent-failure-hunter` exists to catch.
