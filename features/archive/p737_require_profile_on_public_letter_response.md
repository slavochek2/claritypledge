---
status: rejected
type: story
rank: 1000737.0
created_date: '2026-04-17'
tags: [letters, public-link, profile, signup, product, duplicate]
delivery_stage: create-spec
pipeline_ran: [create-spec]
---

# P737: Require profile creation on save for public letter responses

> **Rejected 2026-04-17** — duplicate of [P684](p684_one_to_many_letter_post_reading_account_creation.md). P684 already gates one-to-many letter response persistence on account creation (end-of-letter signup form, no skip option). The `link_respondent` anonymous-completed state this spec aimed to eliminate disappears automatically when P684 ships. P725's follow-up list incorrectly carved this out without checking P684; P725 has been updated to retarget the bullet as a post-P684 cleanup task.

## Problem

**Situation:** Today, a public-link letter (shared via URL, no specific recipient) can be responded to and saved by a visitor with **no account**. The DB records the response against a `letter_delivery` with `receiver_profile_id IS NULL` and the sender sees them forever as "Someone" in inbox and results.

**Complication:** The sender has no way to attribute, follow up with, or recognize who engaged with their letter. Every downstream UI must carry an anonymous-respondent branch (P725 documents this). The sender's understanding of "who responded" is permanently degraded. A well-intentioned responder who built a full response has no account to return to.

**Question:** Should saving a response to a public letter require creating a profile — and if so, what does the UX look like for a visitor partway through?

## Appetite

Medium blast radius. Touches the public-letter reading/response flow, the save action, and the signup UX. Reversible: flip the gate back off. Medium decision density — founder must decide the gate's timing and what happens to in-progress state during signup.

## Solution

Sketch (founder decisions needed on specifics):
1. On click of "Save" from a public-letter response, the user is routed through a minimal signup (email + pledge agreement + slug auto-gen) before the response is persisted.
2. In-progress response state is held client-side (localStorage) until the profile is created, then flushed to DB and attributed.
3. After migration: remove the `link_respondent` code path in `get_inbox_items` (all completions now have a `receiver_profile_id`). P725's "Someone" branch for completed link_respondent becomes dead code.
4. Keep `link_respondent_in_progress` (anonymous browsing + partial response) as a transient state — that's where the gate fires.

[FOUNDER DECISION] — how aggressive is the gate? Options:
- A) Hard gate on every save (simple, high friction).
- B) Allow 1 save without account; prompt on 2nd or on leaving the page (softer).
- C) Social-login-lite (Google / Apple) to reduce friction before hard-gating email.

## Risks / Non-Goals

### Risks
- **Completion-rate drop on public letters** — a friction point mid-flow may reduce responses. Measure before/after.
- **In-progress state loss** — if signup breaks or the user bounces, their draft must survive. localStorage is a must; SaaS drop-off rates apply here.
- **Existing anonymous completions** — keep them as-is, don't force backfill.

### Non-Goals
- No retroactive conversion of existing anonymous completions.
- No change to `/p/:slug` profile page for these new users.
- No social-login unless founder chooses option C.

## Done-When

- [ ] Saving a response on a public letter requires an authenticated profile
- [ ] In-progress response state survives signup round-trip (no data loss)
- [ ] All new `letter_delivery` rows from public-letter completions have non-null `receiver_profile_id`
- [ ] P725's `link_respondent` branch in `get_inbox_items` can be simplified (follow-up commit)
- [ ] Analytics: signup conversion rate from "save pressed" to "profile created" is measured
