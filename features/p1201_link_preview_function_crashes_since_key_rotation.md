---
status: week
type: bug
rank: 90
severity: critical
workstream: infra
date_reported: '2026-08-31'
created_date: '2026-08-31'
drafted_by: sonnet
exec_model: opus
exec_effort: high
tags: [link-preview, og, supabase, api-keys, crawlers]
delivery_stage: create-bug
pipeline_ran: [create-bug]
---

# P1201: Link previews for every event/story/point/profile crash with HTTP 500

## Summary

`api/og.ts` — the serverless function that builds crawler-facing link previews for events, stories, points, and profiles (P1108) — returns `HTTP 500 FUNCTION_INVOCATION_FAILED` for every slug tested, site-wide, since the 2026-08-28 Supabase legacy API key rotation.

## Root Cause

**Confirmed rotation event, unconfirmed downstream link.** `docs/decisions.md` 2026-08-28 [infra], "The prod `service_role` key leaked; the fix is migrating off legacy API keys, not rotating the JWT signing key" records that a legacy Supabase API key for the prod project was invalidated. Independently, this session found the exact same symptom in a different consumer: `slava:events:promote-all`'s hardcoded fallback anon key was rejected by Supabase with `"Legacy API keys are disabled ... use the new publishable and secret API keys"`, while the current `VITE_SUPABASE_ANON_KEY` value in `.env.prod` still works fine against the same REST endpoint.

`api/og.ts` reads its Supabase credentials from `process.env.VITE_SUPABASE_URL` / `process.env.VITE_SUPABASE_ANON_KEY` (or non-`VITE_`-prefixed fallbacks) — comment at the top of the file states these are "set in Vercel env — available to both Vite build and serverless runtime." **Not verified this session:** whether Vercel's deployed production environment variable for `VITE_SUPABASE_ANON_KEY` was rotated to the current (post-2026-08-28) key, or still holds the disabled legacy key. If it still holds the disabled key, every `supabaseGet()` call in `api/og.ts` throws `OgFetchError` (or a raw fetch/JSON error), which is unhandled at the top level and crashes the function — consistent with a 500 on every single slug rather than a per-row failure.

**Cheapest disproof:** compare the `VITE_SUPABASE_ANON_KEY` value in Vercel's production environment variables (dashboard → Project Settings → Environment Variables) against the current value in `.env.prod`. This requires Vercel dashboard access this session did not have.

## Invariants

- `api/og.ts`'s Supabase credentials must be rotated in lockstep with `.env.prod` / `.env.local` whenever the underlying Supabase project's API keys are rotated — the three are independent copies (Vercel env vars, `.env.prod`, `.env.local`) with no shared source of truth, and this bug is the second known instance of a rotation reaching one copy but not the others (the first was the hardcoded fallback key in `slava:events:promote-all` et al., same session).
- `api/og.ts` must not crash the whole function on a Supabase fetch failure — P1108's own text implies this path already had a `DEFAULT_IMAGE` / graceful-fallback intent for missing rows (see `image: DEFAULT_IMAGE` fallbacks throughout the file), but that fallback only covers "row not found," not "credential rejected." A credential failure should degrade to the default OG tags, not 500.

## Reproduction Steps

1. From any machine (no auth needed — this is a bot-facing path, not the SPA):
   ```bash
   curl -s -A "facebookexternalhit/1.1" "https://claritypledge.com/events/<any-upcoming-event-slug>" -w "\nHTTP:%{http_code}\n"
   ```
2. Observe: `HTTP:500`, body is Vercel's generic `"A server error has occurred / FUNCTION_INVOCATION_FAILED"` page — no `og:title`/`og:image` tags served at all.
3. Repeat with a different event slug, and with a story/point/profile path (`/story/:id`, `/point/:id`, `/p/:slug`) — same 500, confirming it is not slug-specific.

**Reproduction rate:** 100%, across every event slug tested this session (3 distinct slugs) and presumably every other rewrite path in `vercel.json:165-198` (`/story/:id`, `/point/:id`, `/p/:slug`) since they share the same `api/og.ts` handler and credential source — not independently tested against story/point/profile paths this session.

## Expected Behavior

A crawler (Facebook, WhatsApp, Twitter, Telegram, LinkedIn, Slack, Discord — the user-agent list `vercel.json` matches on) requesting any event/story/point/profile URL should receive `HTTP 200` with populated `og:title`, `og:description`, and `og:image` meta tags reflecting that row's real data (per P1108's truthfulness contract), or at minimum a safe default (`DEFAULT_IMAGE` + generic copy) if the row lookup itself fails — never a 500.

## Actual Behavior

Every tested request returns `HTTP 500 FUNCTION_INVOCATION_FAILED`. Practical effect: since 2026-08-28, sharing **any** claritypledge.com event/story/point/profile link on WhatsApp, Facebook, iMessage, Slack, Telegram, etc. shows a broken or platform-generic preview — no title, no description, no image — silently, with no user-facing error on the site itself (direct browser visits to the same URLs work fine; only the bot/crawler path is affected).

## Affected Files

- `api/og.ts` — the handler; `SUPABASE_URL` / `SUPABASE_ANON_KEY` module-level constants (lines 10–11) and every `supabaseGet()` call site (event: line ~110, story: `STORY_COLUMNS` section, point: `POINT_COLUMNS` section, profile: `PROFILE_COLUMNS` section) are candidates for the unhandled-throw path
- `vercel.json:117-198` — the bot-user-agent rewrites that route to `api/og.ts`; not the bug itself, but confirms all four page types share one credential source and one failure point
- Vercel dashboard (not in this repo) — the actual environment variable value in question; cannot be read or changed from this session

## Severity

**Critical** — silently breaks every outbound share link across the entire site (events, stories, points, profiles) with no user-facing error, since 2026-08-28 (already ~3 days at time of filing). Direct visits and the SPA itself are unaffected, which is exactly why this went unnoticed.

## Fix Approach

1. Confirm the hypothesis: check Vercel's production `VITE_SUPABASE_ANON_KEY` (and `VITE_SUPABASE_URL`, in case the ref changed too) against `.env.prod`'s current values.
2. If they differ: update the Vercel environment variable to the current key and redeploy (or trigger a redeploy if Vercel picks up env changes without one).
3. Regardless of root cause: wrap `api/og.ts`'s per-row Supabase calls so a fetch/credential failure degrades to the `DEFAULT_IMAGE` + generic-copy fallback path instead of throwing past the handler — this is the invariant fix that prevents the *next* key rotation from producing the same site-wide 500.
4. Re-run the reproduction curl commands above (all four path types, at least 2 slugs each) and confirm `HTTP 200` with real `og:title`/`og:image` values before closing.

## Acceptance Criteria

- [ ] `curl -A "facebookexternalhit/1.1"` against an upcoming event URL returns `HTTP 200` with `og:image` pointing at that event's real banner
- [ ] Same check passes for a story URL, a point URL, and a profile URL (all four `vercel.json` rewrite targets)
- [ ] A deliberately-broken Supabase credential (simulated locally, not on prod) causes `api/og.ts` to fall back to `DEFAULT_IMAGE` + generic copy with `HTTP 200`, not a 500 — proves the invariant fix, not just the credential fix (epistemic gate 7: exercise the failure path before trusting it)
- [ ] No regression in P1108's truthfulness contract — previews still reflect real row data, not the fallback, for rows that fetch successfully
