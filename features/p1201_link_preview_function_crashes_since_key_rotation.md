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

`api/og.ts` — the serverless function that builds crawler-facing link previews for events,
stories, points, and profiles (P1108) — returned `HTTP 500 FUNCTION_INVOCATION_FAILED` for
every path, site-wide.

**The title's "since key rotation" is wrong, and is kept only so the P-number stays findable.**
The cause is an extensionless relative import added by P1141 that Node's ESM resolver cannot
resolve in the released function; the key rotation is unrelated. See Root Cause.

## Root Cause

**CONFIRMED from production logs — and it is NOT the key rotation.** The filed hypothesis
(a stale `VITE_SUPABASE_ANON_KEY` in Vercel) is **falsified**. Two independent disproofs:

1. `handler()` already wraps every route fetch in a try/catch (P1108 Decision 2) that
   degrades to a 200 "Preview temporarily unavailable" card. A rejected credential could not
   produce a 500 through that path.
2. `curl "https://claritypledge.com/api/og?path=/nope"` — a route-miss that issues **no
   Supabase call at all** — also returned 500. The crash is upstream of any request handling.

The real cause, read from the live production deployment's runtime logs:

```
Error [ERR_MODULE_NOT_FOUND]: Cannot find module '/var/task/src/lib/video'
  imported from /var/task/api/og.js
Node.js process exited with exit status: 1.
```

P1141 (`f0ce13af`, 2026-08-24) added `import { getThumbnailUrl } from '../src/lib/video'` —
the first relative **value**-import in `api/` reaching outside that directory (the other two
functions carry only erased `import type`). Vercel **transpiles** each `api/*.ts` file to ESM
and emits its import specifiers *verbatim*; the repo's `package.json` declares
`"type": "module"`. Node's ESM resolver requires an explicit file extension on a relative
specifier. `src/lib/video.js` **is** shipped inside the function bundle — the file is present,
the specifier just cannot name it. The module throws at load, so every request to `api/og`
dies before `handler()` is entered. That is exactly why the failure is uniform across all
four route types and route-misses alike.

Why no test caught it: every existing test imports `api/og` through **vitest**, which (like
Vite, tsx and `tsc`) resolves extensionless specifiers happily. The defect lives entirely in
the gap between the two resolvers, so it is invisible to any test that merely imports the
module. Worse, `src/tests/p1141-og-video-thumbnail.test.ts:31` asserted the *literal*
extensionless specifier string, pinning the bug in place as if it were the spec.

The 2026-08-28 correlation in the original report is coincidence: P1141 merged 08-24 and
reached production on a later deploy.

## Invariants

- **Every relative value-import in `api/*.ts` carries an explicit `.js` extension.** The
  released function is transpiled, not bundled, and runs as Node ESM under the repo's
  `"type": "module"`; every other resolver in this project (Vite, vitest, tsx, `tsc`) accepts
  the extensionless form, so no test that merely imports the module can see the difference.
  Enforced by `src/tests/p1201-api-esm-imports.test.ts`.
- **A module-load failure in a serverless function is un-catchable by that function.**
  `handler()`'s try/catch cannot degrade a crash that happens before it is entered, so
  robustness inside the handler is not a substitute for the import gate above.
- (Original, still true, but not this bug's cause) `api/og.ts`'s Supabase credentials must be
  rotated in lockstep with `.env.prod` / `.env.local` — the three are independent copies with
  no shared source of truth.
- `api/og.ts` must not crash the whole function on a Supabase fetch failure — P1108's own text implies this path already had a `DEFAULT_IMAGE` / graceful-fallback intent for missing rows (see `image: DEFAULT_IMAGE` fallbacks throughout the file), but that fallback only covers "row not found," not "credential rejected." A credential failure should degrade to the default OG tags, not 500.

## Reproduction Steps

1. From any machine (no auth needed — this is a bot-facing path, not the SPA):
   ```bash
   curl -s -A "facebookexternalhit/1.1" "https://claritypledge.com/events/<any-upcoming-event-slug>" -w "\nHTTP:%{http_code}\n"
   ```
2. Observe: `HTTP:500`, body is Vercel's generic `"A server error has occurred / FUNCTION_INVOCATION_FAILED"` page — no `og:title`/`og:image` tags served at all.
3. Repeat with a different event slug, and with a story/point/profile path (`/story/:id`, `/point/:id`, `/p/:slug`) — same 500, confirming it is not slug-specific.

**Reproduction rate:** 100% — and now explained: the module never loads, so the response is
independent of path, slug and row. `/api/og?path=/nope`, which reaches no database at all,
500s identically. That observation is what falsified the credential hypothesis.

## Expected Behavior

A crawler (Facebook, WhatsApp, Twitter, Telegram, LinkedIn, Slack, Discord — the user-agent list `vercel.json` matches on) requesting any event/story/point/profile URL should receive `HTTP 200` with populated `og:title`, `og:description`, and `og:image` meta tags reflecting that row's real data (per P1108's truthfulness contract), or at minimum a safe default (`DEFAULT_IMAGE` + generic copy) if the row lookup itself fails — never a 500.

## Actual Behavior

Every tested request returns `HTTP 500 FUNCTION_INVOCATION_FAILED`. Practical effect: since 2026-08-28, sharing **any** claritypledge.com event/story/point/profile link on WhatsApp, Facebook, iMessage, Slack, Telegram, etc. shows a broken or platform-generic preview — no title, no description, no image — silently, with no user-facing error on the site itself (direct browser visits to the same URLs work fine; only the bot/crawler path is affected).

## Affected Files

- `api/og.ts:1` — the import specifier; the entire defect, and the entire fix
- `src/tests/p1201-api-esm-imports.test.ts` — **new**, the regression gate
- `src/tests/p1141-og-video-thumbnail.test.ts:31` — over-specified assertion relaxed to pin
  the module rather than the extension
- `src/tests/p1108-fail-loud.test.ts` — added the per-route 401 credential-rejection case
- No environment variable is involved, and none was changed.

## Severity

**Critical** — silently breaks every outbound share link across the entire site (events, stories, points, profiles) with no user-facing error, since 2026-08-28 (already ~3 days at time of filing). Direct visits and the SPA itself are unaffected, which is exactly why this went unnoticed.

## Fix Approach

1. ~~Check Vercel's `VITE_SUPABASE_ANON_KEY`~~ — falsified, see Root Cause. No environment
   variable change is needed and none was made.
2. `api/og.ts:1` — write the specifier as `'../src/lib/video.js'`. TypeScript maps a `.js`
   specifier onto the `.ts` source, so the single-source-of-truth property P1141 exists to
   protect is untouched and no code is duplicated into `api/`.
3. Regression gate `src/tests/p1201-api-esm-imports.test.ts`: asserts every relative
   value-import in **every** `api/*.ts` file carries an explicit `.js` extension. It checks
   the *specifier text*, not importability — the only thing that can see this defect, since
   importability is precisely what the two resolvers disagree about. It carries a
   known-good / known-bad control pair so a regex that stopped matching cannot pass silently.
4. `src/tests/p1141-og-video-thumbnail.test.ts:31` relaxed from a literal string match to a
   regex pinning the **module** (the actual P1141 claim) and not the extension; extension
   ownership moves to the P1201 gate. Flagged per the Transparency Principle: this is a test
   modification, and the test's original intent is preserved intact.
5. Independent of this bug, the credential-failure invariant is now covered: the 401
   "legacy API keys are disabled" shape is asserted per route in
   `src/tests/p1108-fail-loud.test.ts` — 200 + `DEFAULT_IMAGE`, never a 500.

## Evidence

- **Prod repro:** `/p/slava` and `/api/og?path=/nope` both HTTP 500, while `/api/csp-report`
  (405) and `/api/series-redirect` (307) are healthy — the two functions with no
  cross-directory value-import.
- **Real error:** runtime logs of the live production deployment, quoted above.
- **Local oracle reproducing the deployed shape** (a preview build, then loading the emitted
  function under plain Node ESM):
  - before: `FAIL: ERR_MODULE_NOT_FOUND Cannot find module '.../og.func/src/lib/video'`
  - after: `LOADED OK, handler: function`
  - the built function driven end-to-end with no Supabase env: all five paths
    (`/p/…`, `/events/…`, `/story/…`, `/point/…`, `/nope`) returned **200** with og tags.
- **Gate failure path exercised (epistemic gate 7):** with the fix reverted the P1201 gate
  fails on `og.ts` only, with the correct message, while `csp-report.ts` and
  `series-redirect.ts` still pass — no false positive.
- **Suite:** 297 files / 3368 tests passing; `./scripts/pre-commit-checks.sh` all green.

## Acceptance Criteria

- [x] The deployed-shape module loads instead of crashing — proven against the actual build
      output run under Node ESM, the same resolver that produced the production error
- [x] All four rewrite path types plus a route-miss return HTTP 200 with og tags from the
      built function (verified locally, end to end)
- [x] A rejected Supabase credential (401) degrades to `DEFAULT_IMAGE` + generic copy at
      HTTP 200, not a 500 — per route, in `p1108-fail-loud.test.ts`
- [x] No regression in P1108's truthfulness contract — the full P1104 / P1108 / P1141 suites
      pass unchanged apart from the one over-specified assertion documented above
- [ ] **Blocked on release:** `curl -A "facebookexternalhit/1.1"` against live production URLs
      returning 200 with each row's real `og:image`. Cannot be checked until this ships, and
      shipping is ALWAYS-ASK — not performed.
