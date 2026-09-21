---
status: week
type: bug
disclosure: public
rank: 2
workstream: infrastructure
created_date: '2026-09-03'
tags:
  - privacy
  - pii
  - analytics
  - gdpr
severity: high
delivery_stage: create-bug
pipeline_ran:
  - create-bug
  - fix
drafted_by: opus
exec_model: opus
exec_effort: high
driver: anomaly
---

# P1233: Mixpanel session replay records console output, which carries user IDs and backend error detail

## Problem

**Situation:** `index.html:93-105` initialises Mixpanel with `record_sessions_percent: 100` and does
not set `record_console`.

**Complication:** Mixpanel's `record_console` defaults to **`true`** — verified against the vendor's
own documentation, not inferred. So console output is captured as replay data for 100% of sessions.
The DOM masking defaults that are on (`record_mask_all_text: true`, `record_mask_all_inputs: true`)
do **not** apply to console arguments: masking operates on the DOM, and a console call passes
arbitrary values straight through.

`src/` contains **458** `console.*` calls, of which **106** reference `user`, `email`, `id`, `token`
or `session`. Confirmed live examples:

- `src/auth/AuthContext.tsx:118` — `console.error(\`Profile fetch failed ... for user ${id}\`)`
- `src/auth/AuthCallbackPage.tsx:311` — `console.error("❌ Auth user has no email:", authUser.id)`
- `src/auth/AuthCallbackPage.tsx:490-496` — logs Supabase `message`, `code`, `details`, `hint`

So a failed sign-in sends a user ID and backend error detail to a third-party processor, on a code
path that runs for every visitor.

**Question:** turn console recording off, or audit and redact 458 call sites and disclose the capture?

## Appetite

Blast radius: high — every authenticated session, a third-party processor, and a GDPR disclosure
obligation. Reversibility: high (one init option). Decision density: one founder call (below).

## Invariants

- Any change here must keep session replay itself working — P1216 removed LogRocket on the strength
  of Mixpanel replay being the surviving full-session recorder. Disabling console capture must not
  disable recording.
- The privacy policy's description of what replay collects must match what is actually collected.
  P1216 already corrected one drift of this kind ("Production only" was false).

## Solution

Set `record_console: false` in the `mixpanel.init` call at `index.html:93-105`.

That is the whole fix for the exposure. The alternative — auditing 458 call sites, keeping them
redacted forever, and disclosing console capture in the privacy policy — is strictly more work and
leaves a standing obligation on every future `console.error` anyone writes.

**Founder decision (2026-09-21): turn it off** — the recommendation, delegated to the agent with
"simplify for me". Sentry is the debugging surface.

**Verified in the shipped SDK (2026-09-21)**, `cdn.mxpnl.com/libs/mixpanel-2-latest.min.js`: default
config carries `record_console:!0`; `mixpanel-recorder.min.js` pushes the rrweb console plugin only
`if (this.getConfig("record_console"))`. Sibling `record_network` defaults `!1`, so console is the
only non-DOM payload channel. A Gemini review claimed the option does not exist — refuted by the
bundle grep.

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| Turning off console capture loses debugging context in replays | ACCEPT | Sentry captures errors with stack traces and is the intended surface for this |
| The 106 identifier-bearing console calls remain a leak via any OTHER capture path | DEFER | Out of scope here; if another recorder is ever added, this returns. Worth its own cleanup pass |
| Replay data already collected under the current default still contains console output | MITIGATE | Ask Mixpanel to purge, or accept the retention window — needs the retention figure that P1216 also flagged as unknown |

**Non-Goals**
- Do NOT change `record_sessions_percent` or any other replay setting — one option, one fix.
- Do NOT begin the 458-call-site console audit under this spec.
- Do NOT remove Mixpanel replay; P1216 depends on it.

## Acceptance Criteria

- [x] `record_console: false` is set in `index.html`, and a canary asserts it stays set — `src/tests/p1233-mixpanel-no-console-capture.test.ts` 3/3; its mutation control removes the line from the real file and sees `undefined`
- [x] A replay recorded after the change contains no console entries — by construction: the recorder's only console path is gated on this config key (bundle grep above). Live replay check is post-deploy, prod-only (Mixpanel is off on localhost)
- [x] Session replay still records and still attaches to events (P1216's dependency holds) — `record_sessions_percent` untouched, canary asserts 100; live confirmation post-deploy
- [x] Privacy policy's replay description matches what is collected after the change — `privacy.md` §Analytics describes clicks, scrolling and navigation only; never claimed console capture, so it becomes accurate with no edit

## Related

- P1216 — removed LogRocket, making Mixpanel the sole full-session recorder; surfaced this during
  its adversarial review
- P1219 (in flight) — privacy/terms rewrite; its `privacy.md` already carries founder decisions
  about session replay and legitimate interest, and should absorb whatever is decided here
