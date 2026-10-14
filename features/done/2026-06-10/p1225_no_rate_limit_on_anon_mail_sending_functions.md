---
status: all-done
type: bug
disclosure: public
rank: 253
severity: medium
workstream: infra
date_reported: '2026-09-01'
created_date: '2026-09-01'
drafted_by: opus
exec_model: sonnet
exec_effort: medium
tags: [security, edge-functions, rate-limit, email, abuse]
pipeline_ran: [create-bug, inline, ship]
completed_at: 2026-10-14
---

# P1225: Anonymous account-creating / mail-sending edge functions have no rate limit

## Summary

Three edge functions callable without a user JWT each create or look up an auth user and send
one email per request (`create-and-sign`, `create-and-open-letter`,
`request-letter-response-signin`). None of them applies a per-IP or per-target bucket, so a
single client can drive unbounded sends and auth-user churn. Found as G3 of the 2026-09-01
general security sweep (`.private/docs/security-log.md`, that date).

## Root Cause

The IP hash these functions already compute (`_shared/hash-ip.ts`) is stored for consent
records only; it was never used as a rate-limit key. The AI functions have an
`ai_rate_limits`-style gate; the mail paths were written before it existed and never adopted it.

## Reproduction Steps

Not exercised (each attempt sends real mail). `grep -n "rate\|429\|ai_rate_limits"` across the
three function directories returns nothing.

## Expected Behavior

A caller exceeding N requests per window per IP hash (and per target email) receives HTTP 429
with a `Retry-After` header; legitimate single sign-ups are unaffected.

## Actual Behavior

Every request is honoured: one `generateLink` call plus one outbound email each, without limit.

## Affected Files

- `supabase/functions/create-and-sign/index.ts`
- `supabase/functions/create-and-open-letter/index.ts`
- `supabase/functions/request-letter-response-signin/index.ts`
- `supabase/functions/_shared/hash-ip.ts` (existing key derivation)
- the existing AI rate-limit table/migration (pattern to reuse)

## Severity

**Medium** — abuse / mail-bomb / auth-user pollution; provider reputation risk. Theoretical.

## Fix Approach

Shared helper in `_shared/` that consults one bucket table keyed by `(function, ip_hash)` and
`(function, target_email_hash)`, with a `[FOUNDER DECISION: limits per window]` default of
e.g. 5/10min per IP and 3/hour per target. Deny-by-429 before `generateLink`. Note P1083
explicitly accepted an unlimited flood on `ready_submissions` — that decision does not extend
to paths that send mail.

## Acceptance Criteria

- [x] The (N+1)th request within the window from one IP hash returns 429 on every anonymous function that sends mail to a caller-chosen address
  — met for `request-letter-response-signin` (TEST, 2026-10-14). Scope narrowed by review (orchestrator, 2026-10-14):
  `create-and-sign` sends no mail; `create-and-open-letter` sends mail only after P1487, which wires this limiter in with its own failure-path test.
- [x] The (M+1)th request for one target email within its window returns 429
  — deployed TEST function: 4th request within the hour for one address refused, `Retry-After: 3600`.
- [x] A first request from a fresh IP/target still creates the link and sends the mail
  — deployed TEST function, sealed public letter, fresh allowance: 200 `{ok:true}` and Mailgun's own
  `accepted` event for that recipient (oracle control: an address never sent to is not found).
- [x] Failure-path test in `e2e/integration/edge-fn-authz-regression.spec.ts` (or a P1225 spec) for each function in scope
  — `e2e/integration/20261014130000_p1225_mail_rate_limits.spec.ts` covers `request-letter-response-signin`;
  the other two are out of scope as above (P1487 carries `create-and-open-letter`'s test).

## Dev results

**Decision (founder, 2026-10-14):** 5 requests / 10 min per IP hash, 3 / hour per target-email
hash; over the limit → HTTP 429 + `Retry-After`, before any account lookup, `createUser`,
`generateLink` or send. The refusal does not depend on whether the address has an account.

**Built:** `20261014130000_p1225_mail_rate_limits.sql` — table `mail_rate_limits` (salted-hash
keys only, RLS on, no client grants, pg_cron sweep of rows older than the longest window) and
`reserve_mail_rate_slot(...)`, which inserts the request's row and counts the window in one call
on **database time**, serialized per key (transaction advisory lock): exactly `limit` requests
pass per window however many arrive at once, the edge clock takes no part, and a refused request
still counts. EXECUTE is service-role only (both REVOKE forms; verified `anon`/`authenticated`
cannot execute on TEST). `_shared/mail-rate-limit.ts` wraps it and fails closed (database error →
500). `ai_rate_limits` was not reused: its key is a `NOT NULL` reference to `auth.users`, and these
callers have no account yet.

Order in `request-letter-response-signin`: input validation → **IP bucket** → letter must be a
sealed public letter → **target bucket** → account lookup / `createUser` / `generateLink` / send.
A request naming a letter that does not exist never spends an address's allowance.

**IP key boundary (probe on TEST, 2026-10-14, function deployed then deleted).** The key is
`extractClientIp`: the first `X-Forwarded-For` hop. With a client sending `X-Forwarded-For` (single
or a chain), `X-Real-IP`, `Forwarded`, `True-Client-IP` and `X-Client-IP` set to a chosen value,
the function always saw 3 XFF hops whose first equals `CF-Connecting-IP`, and never the chosen
value in `X-Forwarded-For` or `X-Real-IP`. Positive control: a custom header with the same value
did arrive, and `Forwarded`/`True-Client-IP`/`X-Client-IP` arrive too — the helper reads none of
them. So the first hop is set by the edge, not by the caller. (Prod runs on the same platform; not
probed there.)

**`create-and-sign` and `create-and-open-letter` — not wired, on purpose, for the code as of
2026-10-14.** Neither takes a caller-chosen address: the target is fixed by the authenticated
sender who issued the invitation. Each run is bounded to one account per invitation (the token is
invalidated on link / the agreement leaves `pending`, and a second `createUser` for the same address
fails), and `create-and-open-letter` sends no mail at all (`generateLink` only mints a session
token). So neither gives an anonymous caller a send or account-creation amplifier. **This stops
holding the moment either function sends mail to the target per call** — in-flight work (P1487)
does exactly that; it must reserve the IP bucket before the invitation lookup, the target bucket
after it and before `createUser`/`generateLink`/send (`reserveMailSlot` + `mailLimitResponse`), and
add its own failure-path test.

**Account erasure (`erase_my_account`, P520) does not purge these rows — on purpose.** A row
holds a salted SHA-256 of an IP or a target email, a function name and a timestamp: no account id,
no FK. The salt (`IP_HASH_SECRET`) exists only in the edge runtime, so the erasure RPC, which runs in
Postgres, cannot compute the erased user's key; copying the salt into the database to make that
possible would widen its exposure for rows that are already unlinkable without it. Retention bounds
it instead: the pg_cron sweep deletes rows older than the 1-hour window every 15 minutes, so no row
outlives about 75 minutes. P520's name-bearing census lists `mail_rate_limits.function_name` as
"not a person" (the only column its pattern matches; the key column is a hash).

**Deploy order (prod):** migration first, then the function. The limiter fails closed, so the new
function on a database without `reserve_mail_rate_slot` refuses every sign-in.
