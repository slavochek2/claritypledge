---
status: backlog
type: bug
rank: 40
workstream: infrastructure
created_date: '2026-08-28'
tags: [edge-functions, auth, silent-failure, email]
driver: anomaly
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

## Question

Does the accepted-agreement email currently send in production, and if not, how long has it been
silent?

## Investigation (do this before designing a fix)

- [ ] Establish ground truth from Mailgun logs, not from reading the code: search
      `api.eu.mailgun.net` events for accepted-agreement sends over the last 90 days. Zero
      matches alongside non-zero accepted agreements in the DB confirms the failure.
- [ ] Confirm the 401 directly — invoke `send-agreement-emails` with a service-role bearer and a
      real `agreementId` against **test** (`gfjctyxqlwexxwsmkakq`), never prod.
- [ ] Check whether `send-agreement-emails` is deployed with `--no-verify-jwt`. If it is
      gateway-verified, the request fails earlier still.
- [ ] Grep for the same shape elsewhere — any internal edge-function-to-edge-function call passing
      a service credential into a handler that calls `getUser()`. This is a pattern bug, and one
      instance is unlikely to be the only one.

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

## Done when

- [ ] It is established from Mailgun evidence whether this email sends today
- [ ] A signed agreement on test produces the accepted-email, proven by a Mailgun event
- [ ] The failure is no longer silent — a failed internal notification raises something a human
      or Sentry can see, rather than being swallowed by `.catch()`
- [ ] The grep for sibling instances of the pattern is recorded, with each hit either fixed or
      explicitly cleared

## Notes

- Related: `pp/tasks/p46` (the API-key migration that surfaced this) and
  `docs/decisions.md` 2026-08-28 (leaked `service_role`, migration off legacy API keys).
- The silent-failure shape here — fire-and-forget plus bare `.catch()` on a call that is the sole
  trigger for a user-visible outcome — is exactly what `silent-failure-hunter` exists to catch.
