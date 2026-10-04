---
status: week
type: story
rank: 20
workstream: legal
created_date: '2026-10-04'
tags: [terms, consent, ux]
disclosure: public
delivery_stage: ship
pipeline_ran: [create-spec, ship]
flow: inline
drafted_by: opus
exec_model: opus
exec_effort: high
driver: anomaly
---

# P1398: Terms update notice says what changed; blocks only when fresh consent is needed

## Problem

**Situation:** Returning users whose `accepted_terms_version` is behind `CURRENT_TERMS_VERSION`
get the site-wide terms gate: a popup they cannot close, saying only "We've updated our Terms and
Privacy Policy", with two links to the full documents.
**Complication:** The founder hit it right after registering for an event and read it as a bug.
Diagnosis: the account was not new. It was an older account on the test site still on v1.3, so the
targeting was correct. The real defects were: no summary of what changed, the same blocking
treatment for every update whatever its weight, and a terms-review process that never asked for a
summary.

> Founder, verbatim: "When we show it, I think we need always to show a summary of what has been
> updated, and then they can learn more by expanding. We kind of need to say what we change,
> because otherwise we are overwhelming users."

**Question:** How should a terms update be presented so that people learn what changed in seconds,
and are blocked only when a change genuinely needs their explicit consent?

## Appetite

Blast radius: medium. The gate renders over every authed page for every user on old terms.
Reversibility: high for the code; the new audit column is additive. Decision density: decided in
conversation (below). Built inline in conversation ahead of this spec (`flow: inline`), then
retrofitted onto `feature/p1398-terms-notice-says-what-changed` for `/ship`.

## Solution

- Each terms version carries a short summary: one headline sentence, at most three highlights, and
  a `requiresConsent` flag.
- `requiresConsent: false` → a dismissible bottom banner; "Accept" records acceptance (continued use).
  `true`, or a version with no entry → the existing blocking popup, now showing the same summary.
- Audit: each `terms_acceptances` row records `acceptance_mode` (`explicit` | `notice`).
- One compact block in both variants: "We've updated our Terms and Privacy Policy" with both documents
  linked in the title; "In short:" headline with an inline "Show more"; a single consent line; one
  primary button. No internal scrolling.
- v1.4 uses the blocking popup (founder): voice profiles are biometric data on a consent basis with no
  separate prompt (privacy.md).
- `/tos-review` Stage 7b: bump only at the quarterly review; always write the summary, checked line by
  line against the document diff; choose banner or block with a one-line reason.

**Decisions made in conversation (founder):** notice by default, blocking only for changes needing
fresh consent (option A); block for v1.4; copy "In short:", "Show more", "Agree and continue",
"Decline and log out", "Accept"; links grey and underlined (a deliberate exception to the
design-system "links are blue" rule, so only the action draws the eye).

## Invariants

- The notice describes the documents only, never a page, session or recording. It renders over
  every authed page (decisions.md 2026-09-11, P1300).
- `/terms-of-service` and `/privacy-policy` are never covered by the notice (P1300).
- A returning user's stored `accepted_terms_version` is never silently bumped outside an acceptance
  action (P832).
- Outside-click and Escape never log a user out (P832).
- A version with no summary entry blocks: the safe side when nobody decided.

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| Notice-mode acceptance is weaker proof than an explicit click | MITIGATE | Blocking stays available per version; audit records the mode |
| Code ships before the prod column exists, so audit inserts fail | MITIGATE | `/push` applies the SHA's migrations to prod automatically (P1211, step 2.5); an insert error is logged and swallowed, never shown to the user |
| Voice profiles still have no separate consent | DEFER | Quarterly terms review (~2026-12-01) |
| Banner covers the mobile bottom nav | MITIGATE | Banner sits above the nav when it is rendered |

**Non-Goals**
- Do NOT change who is targeted (the version comparison).
- Do NOT bump `CURRENT_TERMS_VERSION`.
- Do NOT change the `/live` page's own Cancel behaviour (its label stays "Cancel").

## Acceptance Criteria

- [x] A user on old terms sees what changed in one sentence, with the full list available on demand
      — verified in the browser at 320, 375 and 1280 widths.
- [x] For v1.4 the notice blocks; "Agree and continue" records acceptance as `explicit` — e2e
      `p1300-terms-popup` 3/3 on **test**, row read back as `explicit`.
- [x] In notice mode, "Accept" hides the banner and records `notice`; a failed save still hides it
      — unit tests (`terms-notice-banner.test.tsx`), and a `notice` row was read back on test.
- [x] Both legal pages open readable, with no notice over them — e2e on test.
- [x] No notice text mentions a session or a recording — test over the real summary entries,
      confirmed to fail when a bad line is planted.
- [x] With "Show more" opened, both variants fit at 320×568 without internal scrolling — measured.

## Done-When

- [x] `terms_acceptances.acceptance_mode` exists on **test**. `[post-deploy]` applied on prod with the deploy.
- [x] `/tos-review` Stage 7b asks for the summary, the quarterly timing and the banner/block choice.
- [x] Bumping the version without a summary entry fails a test (`terms-change-summary.test.ts`).

## Related

P1300 (popup wording and legal links) · P832 (global gate) · P1307 D15 (quarterly batching) · P1219 (v1.4)
