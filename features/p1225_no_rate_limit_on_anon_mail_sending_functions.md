---
status: backlog
type: bug
rank: 253
severity: medium
workstream: infra
date_reported: '2026-09-01'
created_date: '2026-09-01'
drafted_by: opus
exec_model: sonnet
exec_effort: medium
tags: [security, edge-functions, rate-limit, email, abuse]
delivery_stage: create-bug
pipeline_ran: [create-bug]
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

- [ ] The (N+1)th request within the window from one IP hash returns 429 on all three functions
- [ ] The (M+1)th request for one target email within its window returns 429
- [ ] A first request from a fresh IP/target still creates the link and sends the mail
- [ ] Failure-path test in `e2e/integration/edge-fn-authz-regression.spec.ts` (or a P1225 spec) for each function
