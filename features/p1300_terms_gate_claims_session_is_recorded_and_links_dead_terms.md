---
status: in-progress
type: bug
rank: 95
severity: high
date_reported: 2026-09-11
created_date: 2026-09-11
drafted_by: opus
exec_model: sonnet
exec_effort: medium
tags: [legal, consent, copy, terms]
disclosure: public
delivery_stage: fix
pipeline_ran: [create-bug, reproduce, fix]
reproduce_artifact:
  test_file: src/tests/p1300-reproduce.test.tsx
  root_cause: "TermsUpdateDialog carries a /live-scoped sentence ('This session is recorded for AI Insights') and href=/terms; P832 reused it unchanged as the global TermsAcceptanceGate, and /terms falls through to NotFoundPage"
  confidence: high
  surfaces_in_scope: [global-terms-gate, live-join-terms-dialog]
  surfaces_deferred: []
  reproduced_at: 2026-09-11
---

# P1300: Terms re-acceptance popup says "This session is recorded" on every page, and its "View Terms" link is dead

## Summary

The site-wide "Updated Terms" popup tells every returning user "This session is recorded for AI
Insights" wherever they happen to land (a groups page, their profile, the home feed), where there is
no session at all. Its "View Terms" link points at `/terms`, a route that has never resolved, so the
user is asked to accept a document the popup cannot show them. A user reported the first half from
a groups page on prod after the v1.4 terms bump; the founder: *"On this dialogue, it has nothing to
do with AI recording."*

Prior work on the same component: **P832** (reused the `/live` dialog as the global gate) and
**P1219** (bumped terms to v1.4, which put the popup in front of every returning user).

## Root Cause

`TermsUpdateDialog` was written in P37.2a as a **`/live` join-time** consent notice, so its body
sentence is session-scoped by design (`terms-update-dialog.tsx:58`). P832 reused the component
unchanged as the **global** re-acceptance gate (`TermsAcceptanceGate`, wrapping the whole router).
P832's own spec (Done-When: *"Re-acceptance modal renders existing copy"*) treated the copy as a
given, not as something to re-read in its new context.

The reuse leaked `/live` assumptions twice. The first leak was behaviour: outside-click signed users
out. That one was caught and fixed with a `dismissible` prop (decisions.md, P832 entry). The second
leak was content: the session sentence. Nobody caught it, because the only test of the sentence
(`consent-dialogs.test.tsx:72-79`) **asserts it is present**, which turns the defect into a spec.

The defect has been **latent since P832 shipped on 2026-05-15**. It surfaced now because P1219 bumped
`CURRENT_TERMS_VERSION` v1.3 → v1.4, so the gate fires for every returning user on the first page
they open. P1219's verify step checked that the dialog *appears once*, not what it says.

The dead link is independent. `/terms` was never a deployed route: P1016 committed it but never
deployed it, and P1024 renamed the meeting page to `/meet` (`App.tsx:719-723`). The legal page lives
at `/terms-of-service`. The dialog was written against a `/terms` path that no longer exists, and
`consent-dialogs.test.tsx:90` asserts that dead href too. The sibling modal
`letter-stale-terms-modal.tsx` links `/terms-of-service` correctly.

**Also wrong on `/live` itself.** The same dialog renders on the `/live` join path
(`clarity-live-page.tsx:4026, 4276`) regardless of whether the host started a private session, so a
joiner of a private session with stale terms is told the session is recorded. The published ToS
(`tos.md:43-48`) and Privacy Policy (`privacy.md:73-84`) both say there is **no separate
recording-consent dialog**. Recording is disclosed by the host's switch, the in-session banner and
the "Private session" badge. So the sentence contradicts the documents the popup asks the user to
accept.

## Invariants

- The terms re-acceptance popup makes claims about **the documents only**, never about the page,
  session or activity behind it. It renders over arbitrary routes, so any context-specific sentence
  is false somewhere.
- Every link in a consent surface resolves to the document it names. A consent the user cannot open
  is not informed consent.
- The dialog title "Updated Terms" and the Continue / Cancel button labels stay unchanged: ~20 e2e
  specs and `e2e/helpers/test-session.ts` dismiss the dialog by them.

## Reproduction Steps

1. Sign in as a user whose `profiles.accepted_terms_version` is older than `CURRENT_TERMS_VERSION`
   (every user who has not signed in since the v1.4 bump).
2. Open any non-session route, e.g. `/groups/<slug>`.
3. Observe the "Updated Terms" popup: body reads *"This session is recorded for AI Insights."*
4. Tap "View Terms" → `/terms` → no route matches.

**Reproduction rate:** 100% for every stale-terms user.

**Evidence.** Prod: a user's phone screenshot of the popup over a groups page. Canary
`src/tests/p1300-reproduce.test.tsx` renders the global gate on `/groups/example-group` and fails
both assertions before the fix: *"expected 'Updated TermsWe've updated our Terms…' not to match
/session/i"*, and "View Terms" `href` is `/terms`, not `/terms-of-service`. Surface audit: the
sentence and the dead href exist only in `terms-update-dialog.tsx` (no other `/terms` link or
session-scoped sentence in any consent surface). `/terms` falls through to the `path="*"`
`NotFoundPage` route (`App.tsx:1019`).

## Expected Behavior

The popup says the Terms and Privacy Policy changed and that continuing means agreeing to them.
Nothing more. "View Terms" opens `/terms-of-service`.

## Actual Behavior

The popup asserts a recording that is not happening. "View Terms" opens a non-existent page.

## Affected Files

- `src/app/components/live-meeting/terms-update-dialog.tsx:58` — session-scoped sentence
- `src/app/components/live-meeting/terms-update-dialog.tsx:62` — `href="/terms"` (dead)
- `src/app/components/auth/terms-acceptance-gate.tsx:92` — global consumer (every authed route)
- `src/app/pages/clarity-live-page.tsx:4026, 4276` — `/live` consumers (private sessions included)
- `src/tests/consent-dialogs.test.tsx:72-79, 90` — tests that lock in both defects
- `.claude/commands/slava/maintain/tos-review/SKILL.md` — Stage 8 reviews only the terms page, never
  the popup that the Stage 7b version bump puts in front of every user

## Severity

**High** — every returning user reaches a consent surface that states a falsehood and cannot show
them the terms they are accepting.

## Fix Approach

1. Replace the sentence with a document-scoped one, mirroring the wording already shipped in
   `letter-stale-terms-modal.tsx`: *"Please review them. By continuing, you agree to the updated
   Terms of Service and Privacy Policy."* No new copy is being invented: the sibling modal already
   carries this wording.
2. Point "View Terms" at `/terms-of-service`. Add `rel="noopener noreferrer"` while touching both
   `target="_blank"` anchors.
3. Keep title and button labels (Invariants).
4. Replace the test that asserts the session sentence with one asserting its **absence**, and
   correct the href assertion. That test was the only guard, and it guarded the defect.
   `tests.md` treats tests as specs: this spec supersedes those two assertions, with the reason
   stated here.
5. Prevention: add a step to `/tos-review` so that any version bump also reviews the re-acceptance
   popup as a returning user sees it on an ordinary, non-session page, reading every sentence
   against the new documents and opening both links.

No rejected alternative in `decisions.md` bears on this (grepped `TermsUpdateDialog`,
`terms-update-dialog`, `re-acceptance`, `TermsAcceptanceGate`). The P832 entry there records the
sibling behaviour leak only.

## Acceptance Criteria

- [ ] A stale-terms user on a non-session page (e.g. `/groups/<slug>`) sees a popup that mentions
      only the Terms and Privacy Policy — no "session", no "recorded"
- [ ] "View Terms" opens the Terms of Service page; "View Privacy Policy" opens the Privacy Policy
- [ ] Title "Updated Terms" and Continue / Cancel are unchanged; Continue still records acceptance,
      Cancel still signs out (global gate)
- [ ] Regression test fails on the pre-fix commit and passes after: the popup contains no session or
      recording claim, and its terms link is `/terms-of-service`
- [ ] `/tos-review` instructs a review of the re-acceptance popup's copy and links whenever the
      terms version is bumped
- [ ] No console errors when the popup renders
