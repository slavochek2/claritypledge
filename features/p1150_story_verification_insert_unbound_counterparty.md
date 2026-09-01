---
status: week
type: bug
rank: 4
severity: high
workstream: infrastructure
date_reported: '2026-08-21'
created_date: '2026-08-21'
tags: [rls, security, prod, data-integrity]
delivery_stage: create-bug
pipeline_ran: [create-bug]
driver: anomaly
---

# P1150: The story-verification write path binds the caller but not the counterparty — same class as P1138/P1139, first one with real callers

> **Live and unpatched.** Per `.claude/commands/slava/maintain/privacy/SKILL.md`, the exact policy
> predicate, the unbound columns, the call sites and the reproduction path are deliberately **not**
> in this public spec. They are in `.private/docs/security-log.md`, entry **2026-08-21 "P1150 filed
> — `story_verifications` INSERT binds the caller but not the *counterparty*"**. Read that first;
> this spec is not actionable without it.

## Summary

An INSERT policy on the story-verification table checks that the caller is one of the two people
named on the row, but leaves the *other* person — and the rating attributed to them — unconstrained.

## Root Cause

Written permissive at creation and never revisited, the same origin as P1138 and P1139. A later
migration did tighten it once, from "any authenticated caller" to "caller must be one of the two
actors" — which closed the obvious hole and left the subtler one: binding the caller to *one* of two
actor columns says nothing about the other.

The consequence is not just a spurious row. Verification rows feed generated columns and a trigger
that recomputes public profile counters for **both** named parties, so a crafted write moves numbers
on a profile that is not the caller's.

Surfaced by the security agent during `/architect` on
[P1141](p1141_story_carries_a_video_with_jumpable_quotes.md), whose design leaned on the assumption
that these rows can only originate from a story's own author. That assumption is true of the
live-session UI and false of the database. P1141 records the correction; its own UI decision did not
depend on it.

## Reproduction Steps

Not yet reproduced. **Do not mark this confirmed until it is** — the evidence so far is a policy read
plus a call-site read, which is precisely the weaker form P1139's spec warns against ("confirmed
empirically on test via the real unauthenticated REST path — not a policy-catalogue read").

1. On **test**, authenticate as an ordinary verified user.
2. Through the real REST path — not the app UI, which never offers this — write a verification row
   naming a *different* user as the counterparty, against a story that user did not author.
3. Observe whether the row is accepted, and whether the counterparty's public profile counters move.

**Reproduction rate:** 5/5 on **test**, 2026-09-01, through the real REST path as an ordinary
verified test user (integration spec below, run before the fix): the forged row landed and the
named counterparty's `verification_session_count` moved 0 → 1. Confirmed.

## Expected Behavior

A verification row can only be written in the shapes the product actually produces, and cannot
attribute a rating to someone who did not give it.

## Actual Behavior

Confirmed 2026-09-01 on test: the row is accepted and the named counterparty's public counter moves
(`verification_session_count` 0 → 1 for a user who never took part). Details in the private log.

## Affected Files

- The migration that last recreated the policy — named in `.private/docs/security-log.md`
- Two client call sites that legitimately write these rows — named in the same entry
- The trigger that recomputes profile counters on insert — same entry

## Severity

**High** — a write-authorization gap that lets one account move another account's public numbers.
Not critical: no data loss, no auth bypass, no blocked flow, and no evidence it has been exercised.

## Fix Approach

**Do NOT copy P1139's revoke-and-close.** That worked because P1139's tables had *zero* legitimate
client callers. This table has two real ones, and they are asymmetric — in one of them the caller is
legitimately **not** the counterparty. A predicate that simply pins both actors to the caller breaks
a shipped, working flow.

The task is scoping, not closing:

1. `/reproduce` first, via the real REST path, to confirm the gap and its blast radius.
2. Enumerate what each real caller actually needs to write — both call sites, not one.
3. Write the narrowest predicate admitting exactly those shapes. Constrain the counterparty *and*
   the attributed rating; the policy currently leaves both free.
4. Check whether the two shapes can share one predicate or need separating by the row's own source
   marker.

Check `.private/docs/security-log.md` before designing — it records which caller sets which column,
and the one asymmetry that makes the obvious fix wrong.

## Acceptance Criteria

- [x] A user cannot write a verification row naming a third party as counterparty on a story that
      third party did not author
- [x] A user cannot cause another user's public profile counters to change through this path
- [x] Letter-screening ratings still submit and still record correctly — the asymmetric caller is
      the regression risk, verify it explicitly
- [x] Live-session ratings still submit and still record correctly — **vacuous, and recorded as
      such:** there is no live-session client write path into this table (see Evidence); the
      only client writers are the two letter-screening paths, both covered
- [x] The gap is demonstrated failing before the fix and passing after, through the real REST path —
      not a policy-catalogue read
- [x] Regression test passes: `e2e/integration/p1150-*.spec.ts`

## Evidence

Branch `feature/p1150-story-verification-counterparty`, commit `533e2596`. Migration
`supabase/migrations/20260901210000_p1150_bind_story_verification_counterparty.sql` applied to the
**test** project 2026-09-01. Not shipped; not on prod.

- **Callers enumerated** (grep `story_verifications` across `src/` — three files, one inserter):
  `src/app/data/letters-service.ts` `submitRating` (:320) and `submitLetterResponseAuthenticated`
  (:1138-1150). Both: caller = listener, speaker = the letter's sender, `speaker_rating: 0`,
  `source: 'letter'`, `verified: false`, `session_id: null`; `version_id` from the snapshot or
  omitted; `delivery_id` omitted. Every other writer (`submit_rating_by_token`,
  `persist_anonymous_completion`, e2e fixtures) is SECURITY DEFINER / service_role and is not
  governed by RLS. **No client live-session write path exists** — `api.ts` writes
  `clarity_verifications` (the chat table), not this one. Letter stories are always the sender's
  own (`doc_stories` INSERT policy requires `stories.author_id = auth.uid()`, P551), so binding
  the speaker to the letter also binds it to the story author.
- **Fix shape:** the INSERT policy now admits exactly that shape — caller is the listener and not
  the speaker, letter-sourced/unverified/no session, placeholder speaker rating, and the
  (speaker, story, caller) triple must be a real letter relation (sender → snapshot story →
  delivery to the caller), resolved by a SECURITY DEFINER helper in the P581 pattern. A policy
  predicate, not a definer writer: the client keeps writing directly, RLS stays the single
  authorization point, the lookups are PK/index hits on the small letter tables.
- **Before / after, real REST path** (`e2e/integration/p1150-story-verification-counterparty.spec.ts`,
  `--retries=0`): before the migration **5 gap tests failed, 3 controls passed** (forged row id
  recorded in the run log, counters moved 0 → 1); after: **8/8 pass**. Gap tests: third-party
  speaker on their own story with a 10; letter-shaped forgery with no letter; stranger rating a
  letter they hold no delivery of; receiver attributing a non-placeholder speaker rating;
  receiver marking a letter rating verified. Controls: the exact `submitRating` payload as the
  receiver (row lands, `listener_rating` recorded, `accuracy_achieved` false, reader ears +1 /
  sessions +1, sender sessions +1); the exact batch payload of `submitLetterResponseAuthenticated`;
  a service_role write (definer/fixture path) unaffected.
- **Suite health:** `npx tsc --noEmit` clean; `eslint src` clean; vitest 3485 passed / 19 skipped;
  `pre-commit-checks.sh` all green. Browser letter-reading suites (`p581-letter-reading`,
  `p642-letter-reading-flow`, `p581-letter-completion`): 15 passed / 9 failed, every failure a
  pre-insert UI locator miss (e.g. the rating CTA now reads "Continue", the suite expects
  "Submit"; cover-page copy) — zero RLS / 42501 / `story_verifications` errors in the log, so the
  UI click-through of a rating insert is **not** independently proven by those suites; the
  REST-exact control above is the evidence for the client path.

## Non-Goals

- **Do NOT change the ear metric or calibration semantics.** P940 redefined the ear metric
  deliberately; this spec constrains *who may write a row*, never what a row means.
- **Do NOT reopen P1138 or P1139.** Both are `all-done` and shipped. Closed specs are records.
- **Do NOT widen scope to other tables** in a general RLS sweep. One table, one predicate.
- **Do NOT hide the symptom in the UI.** P1141 already hides the count on agent stories for an
  unrelated product reason; that is not a fix for this and must not be cited as one.
