---
status: qa
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
date_resolved: 2026-09-11
root_cause: "TermsUpdateDialog was a /live join notice reused unchanged as the global gate (P832): its session sentence rendered on every page, its Terms link targeted a never-deployed /terms, and the gate also covered the legal documents the popup links"
resolution: "Deleted the session sentence (no new wording); Terms link now /terms-of-service; the gate exempts /terms-of-service and /privacy-policy by exact route; /tos-review now reviews the popup's copy, links and document readability on every terms bump"
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

**The documents were unreadable even at the right address** (found in code review, then proven).
The gate exempts only `/auth/` (`terms-acceptance-gate.tsx:18`) and wraps the whole router, including
`/terms-of-service` and `/privacy-policy`. A stale-terms user who opens either page, in a new tab from
the popup or directly, is the same signed-in stale user, so the non-dismissible modal re-opens over
the document with a dark overlay and scroll lock. Fixing the href alone would have sent the user to a
page they still could not read. Proven by command before the gate change: the e2e docs test failed
with `getByRole('dialog')` count 1 on `/terms-of-service`, and the two new gate unit tests failed with
`needsTermsAcceptance` called on both legal routes.

## Invariants

- The terms re-acceptance popup makes claims about **the documents only**, never about the page,
  session or activity behind it. It renders over arbitrary routes, so any context-specific sentence
  is false somewhere.
- Every link in a consent surface resolves to the document it names. A consent the user cannot open
  is not informed consent.
- The documents the popup asks the user to accept stay readable by that same stale-terms user: the
  gate never covers `/terms-of-service` or `/privacy-policy`.
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
Nothing more. "View Terms" opens `/terms-of-service`, and both documents can be read there without
the popup covering them.

## Actual Behavior

The popup asserts a recording that is not happening. "View Terms" opens a non-existent page.

## Affected Files

- `src/app/components/live-meeting/terms-update-dialog.tsx:58` — session-scoped sentence
- `src/app/components/live-meeting/terms-update-dialog.tsx:62` — `href="/terms"` (dead)
- `src/app/components/auth/terms-acceptance-gate.tsx:92` — global consumer (every authed route)
- `src/app/components/auth/terms-acceptance-gate.tsx:18` — exempts only `/auth/`, so the gate also
  covers the two legal documents it links
- `src/app/pages/clarity-live-page.tsx:4026, 4276` — `/live` consumers (private sessions included)
- `src/tests/consent-dialogs.test.tsx:72-79, 90` — tests that lock in both defects
- `.claude/commands/slava/maintain/tos-review/SKILL.md` — Stage 8 reviews only the terms page, never
  the popup that the Stage 7b version bump puts in front of every user

## Severity

**High** — every returning user reaches a consent surface that states a falsehood and cannot show
them the terms they are accepting.

## Fix Approach

1. Delete the session sentence and keep the dialog's own existing second sentence, *"By continuing,
   you agree to the updated terms."* Strictly subtractive: no new consent wording, so no product
   call is needed. (An earlier draft proposed new wording and wrongly claimed the letter modal
   already carried it. Code review caught the false claim, and the fix was reduced to a deletion.)
2. Point "View Terms" at `/terms-of-service`. Add `rel="noopener noreferrer"` while touching both
   `target="_blank"` anchors.
3. Keep title and button labels (Invariants).
3b. Exempt `/terms-of-service` and `/privacy-policy` from the gate (`GATE_EXEMPT_PREFIXES`). The gate
   overlays the page rather than blocking its render or tracking, so the exemption changes what a
   stale user can read, not what is processed. Unit tests pin both routes as dormant, and the e2e
   docs test opens both as the stale user and asserts the heading is visible with no dialog.
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

- [x] A stale-terms user on a non-session page (e.g. `/groups/<slug>`) sees a popup that mentions
      only the Terms and Privacy Policy — no "session", no "recorded"
- [x] "View Terms" opens the Terms of Service page; "View Privacy Policy" opens the Privacy Policy;
      a stale-terms user can read both, with no popup covering them
- [x] Title "Updated Terms" and Continue / Cancel are unchanged; Continue still records acceptance,
      Cancel still signs out (global gate)
- [x] Regression test fails on the pre-fix commit and passes after: the popup contains no session or
      recording claim, and its terms link is `/terms-of-service`
- [x] `/tos-review` instructs a review of the re-acceptance popup's copy and links whenever the
      terms version is bumped
- [x] No console errors when the popup renders

## Resolution

**Evidence per criterion** (branch `feature/p1300-terms-popup-copy`):

1. Documents-only copy — `e2e/p1300-terms-popup.spec.ts` smoke test on `/groups` as a stale-terms
   user: dialog contains "By continuing, you agree to the updated terms." and neither "session" nor
   "record"; the groups heading is attached behind it, so the popup sits over the loaded page.
   Screenshots at desktop, 375 and 320 with `window.innerWidth` verified per viewport.
2. Readable documents — the e2e docs test opens both hrefs as the same stale user and asserts each
   H1 is visible with `getByRole('dialog')` count 0 after network idle. It failed before the gate
   change (dialog count 1 on `/terms-of-service`) and passes after.
3. Title and buttons unchanged — no edit to either; ~20 e2e specs still dismiss by them. Continue
   records acceptance: e2e poll reads `accepted_terms_version` back as the current version. Cancel
   signs out: `p832-global-tos-gate.test.tsx` "handleCancel: calls signOut".
4. Red then green — canary `src/tests/p1300-reproduce.test.tsx` failed 2/2 before the fix, passes
   after. New gate cases failed on both legal routes before the exemption, pass after. Final run:
   26/26 unit tests, `tsc --noEmit` exit 0, e2e 3/3.
5. `/tos-review` — committed on `main` (Stage 2 reads the in-app terms copy; Stage 8 screenshots the
   popup on a non-session page and requires both linked documents to be readable). The branch
   predates those commits and does not touch the skill, so the ship cherry-pick cannot conflict.
6. No console errors — the e2e smoke test collects `console` errors and `pageerror` and asserts none.

**Review record.** Opus code review: 1 HIGH (the gate covered the linked documents), 2 MEDIUM (the
e2e could not catch that; the spec claimed the new wording already existed). All three were fixed:
gate exemption, rewritten docs test, deletion-only copy with the claim corrected. Visual QA, which saw
screenshots only: the popup copy was clean. It flagged two full-width buttons, but Cancel is an
outline secondary, so that passes the one-primary rule. It flagged small link tap targets, which
predate this change and are raised with the founder. It flagged an unloaded desktop background,
which is now asserted. Codex review: its MEDIUM (skill prevention "not delivered") was verified
false by command, because it read the branch copy, which predates the skill commits on `main`. Its
LOW (prefix matching exempted look-alike paths) was fixed with exact-route matching and a unit case
proving a look-alike stays gated.
