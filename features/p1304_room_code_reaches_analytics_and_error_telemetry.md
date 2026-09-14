---
status: in-progress
type: bug
rank: 96
severity: medium
workstream: platform
date_reported: 2026-09-11
created_date: 2026-09-11
drafted_by: opus
exec_model: sonnet
exec_effort: medium
tags: [security, telemetry, privacy]
disclosure: public
delivery_stage: reproduce
pipeline_ran: [create-bug, reproduce]
reproduce_artifact:
  test_file: src/tests/p1304-reproduce.test.ts
  root_cause: "the room code is logged as a display id — 59 telemetry calls send it as a property, and the /live and /transcribe URLs carry it into Mixpanel events, Mixpanel replays and Sentry events"
  confidence: high
  surfaces_in_scope: [live-payloads, api-sentry-extras, chunk-upload-queue, letter-start-button, sentry-urls, mixpanel-event-urls, mixpanel-replays, transcribe-room-urls]
  surfaces_deferred: []
  surface_audit_anchor: "analytics.track( | trackLiveEvent( | Sentry.setContext/addBreadcrumb/captureException/captureMessage("
  surface_audit_hits: 59
  reproduced_at: 2026-09-14
---

# P1304: The /live room code reaches third-party analytics and error telemetry

## Summary

The /live room code is a bearer capability — it is what `claim_joiner_seat` and the code-keyed
session reads accept — yet it is sent to Mixpanel and Sentry on 38 explicit payloads, and in the
page URL of every /live pageview and session recording.

## Root Cause

The code started life as a display identifier and was logged like one. P1053 made it the join
capability and fixed exactly one sink — the join error path in `api.ts`, which now reports
`codeLength` instead ("once the code is the authorization capability, that is credential
logging"). P1057 named eight Mixpanel sites as a non-goal and routed them to the P1059 hardening
backlog; P1059 carries no telemetry item, so nothing picked them up, and the count has since grown.

Three channels, counted 2026-09-11 by grepping `src/` for code-named payload keys and classifying
each by its enclosing call:

1. **Event payloads — 35 `analytics.track` sites:** 31 in `clarity-live-page.tsx`, 3 in
   `chunk-upload-queue.ts`, 1 in `start-clarity-session-button.tsx`.
2. **Error payloads — 3 Sentry sites** in `clarity-live-page.tsx`: a `setContext`, a breadcrumb, and
   an `extra`.
3. **The URL itself.** The code is a path segment (`/live/:code`). Mixpanel is initialised with
   `autocapture: { pageview: true }` and `record_sessions_percent: 100` (`index.html:94-95`), so
   every /live pageview and session recording carries it. Sentry attaches the page URL to events
   and navigation breadcrumbs by default — UNVERIFIED against this project's events this session.

### Reproduction findings (2026-09-14)

The canary (`src/tests/p1304-reproduce.test.ts`) scans every telemetry call's arguments and
finds **59** sites, not 38: the count above missed 16 `trackLiveEvent` calls in the live page, 4
more `analytics.track` calls there, and four `Sentry.captureException` extras in `api.ts`
(`:3200`, `:3333`, `:3401`, `:3506`). The canary's known-bad/known-good controls score as
expected.

The URL channel is wider than stated:

- **`/transcribe/:code` is the same class.** `getRoomByCode(urlCode)` joins the room, and the
  auth gate puts the code into `/login?redirect=%2Ftranscribe%2F<CODE>`, which is itself a
  captured pageview.
- **Mixpanel replays cannot be fixed by an event hook.** The SDK's recorder sends
  `'$current_url': this.batchStartUrl` (`_.info.currentUrl()`) with every replay batch, outside
  `hooks.before_send_events`. Only not recording code-bearing routes closes it.
- **Mixpanel events** carry `$current_url` and `$referrer` (`document.referrer`), both
  rewritable in `hooks.before_send_events` (verified in `mixpanel-core.js`: `_run_hook('before_send_' + type)`).
- **Sentry 10.27.0** exposes `beforeBreadcrumb` and `beforeSendTransaction`. Page-load
  transactions do not pass through `beforeSend`. Sentry replay URLs are UNVERIFIED.
- `/s/:code` is a static short-link table, not a room code, so it is out of scope.

`src/tests/p1304-sentry-url-redaction.test.ts` fails today: `sentryBeforeSend` passes
`/live/<CODE>` and `/transcribe/<CODE>` through unchanged.

## Invariants

- A credential is never a telemetry property. Anything that needs to correlate events to a session
  uses a non-reversible discriminator — the session id, or a length/hash-prefix like the join path.

## Reproduction Steps

1. Open `/live/<CODE>` as any participant, signed in or guest.
2. In Mixpanel's live view, observe `live_poll_heartbeat` (fires on the first poll tick) with
   `sessionCode = <CODE>`, and the pageview event with `<CODE>` in its URL.
3. Trigger any live-page error; the Sentry event's `live_session` context carries `session_code`.

**Reproduction rate:** 100% (steps 2–3 read from code; not yet observed in the Mixpanel or Sentry UI).

## Expected Behavior

No room code appears in any Mixpanel or Sentry payload, URL, breadcrumb or recording.

## Actual Behavior

The code appears in all three, for every participant, at full sampling.

## Affected Files

- `src/app/pages/clarity-live-page.tsx` — Sentry at `:700` (`setContext`), `:719` (breadcrumb),
  `:1599` (`extra`); 31 `analytics.track` payloads, e.g. `:1323` `live_poll_heartbeat`,
  `:1495` `live_state_drift_detected`, `:1543` `live_poll_tick_error`
- `src/lib/chunk-upload-queue.ts` — 3 `analytics.track` payloads (`:137` onward)
- `src/app/components/letters/start-clarity-session-button.tsx:76` — `letter_live_session_started`
- `index.html:94-95` — Mixpanel pageview autocapture and 100% session recording
- `src/main.tsx:47-48` — Sentry replays on every error (masked text; URLs not addressed)
- Precedent: `src/app/data/api.ts` join error path — `codeLength` instead of the code

## Severity

**Medium** — reaching the code requires access to the analytics or error-tracking project, so it
is not anonymously exploitable; but both are third parties, the code grants room access, and a
leaked code cannot be revoked (P1098).

## Fix Approach

1. **Payloads:** replace every code-valued property with the session id, which is stable, so
   funnels and joins keep working. Before changing the property, check whether any saved Mixpanel
   report groups by `sessionCode` / `session_code` —
   `[FOUNDER DECISION: acceptable to break a report keyed on the code value?]`.
2. **URL:** strip the code segment from captured URLs — for Mixpanel, a pageview that reports the
   route pattern (`/live/:code`) instead of the path, or pageview autocapture off for `/live/*`; for
   Sentry, redact the segment in the composed `beforeSend` (`src/lib/sentry-filters.ts`) and in
   navigation breadcrumbs. decisions.md records P883 and P990 rejecting a `beforeSend` *message
   filter* for dropping events; this is redacting a known token shape, not dropping, so that
   ruling does not apply, but it belongs in the same unit-tested module.
3. **Guard:** a unit test that fails when a telemetry call gains a code-named property, so the
   count cannot creep back — it grew from 8 to 35 after P1057 named it.

## Resolved Decisions

Delegated to the agent by the founder on 2026-09-14 ("you check and decide").

1. **Payloads send `session_id` instead of the code. Breaking reports keyed on the code is
   accepted.** Checked: none of the 21 saved Mixpanel reports or dashboards has been edited since
   2026-02-25, none is named after the code, and the Session Value dashboard has 0 views. The MCP
   exposes no report definitions, so "no report groups by the code" is unverified. The cost is
   bounded: a breakdown by code is one-to-one with a breakdown by `session_id`, so any such
   report is rebuilt by swapping the property, and history before the fix keeps the old
   property.
2. **Mixpanel session recording stops on `/live/*` and `/transcribe/*`.** The recorder attaches
   the raw URL to every batch, and no hook reaches it. The alternative, taking the code out of
   the join URL, changes every shared invite link and is out of proportion to a medium
   finding. Cost: no Mixpanel replays of live or transcribe sessions. Sentry's masked
   error-only replays are unaffected.

## Acceptance Criteria

- [ ] No `analytics.track` or Sentry payload in `src/` carries the room code (the grep above
      returns zero telemetry hits)
- [ ] A /live pageview and a session recording in Mixpanel show no room code in the URL
- [ ] A Sentry event raised on /live shows no room code in its URL, context or breadcrumbs
- [ ] Session-level funnels still join, keyed on the session id
- [ ] A test fails when a new telemetry call adds a code-named property

## Related

- **P1053** — fixed the join-path Sentry capture; named the rest as credential logging.
- **P1057** — listed eight Mixpanel sites as a non-goal and routed them to P1059.
- **P1059** — the hardening backlog they were routed to; it has no telemetry item.
- **P1098** — a leaked room code is unrevocable.
