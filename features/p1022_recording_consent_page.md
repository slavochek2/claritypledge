---
status: week
type: story
rank: 4
created_date: '2026-07-31'
tags: [consent, recording, legal, video]
delivery_stage: create-spec
pipeline_ran: [create-spec]
---

# P1022: `/consent` — recording & publishing release

## Problem

**Situation:** Sessions are run in person on the founder's phone. `/meet` (P1016, being
renamed in the companion change-request) opens the session with aspirational, explicitly
**non-legally-binding** terms. Separately, P37 already ships a consent audit trail —
`terms_acceptances` and `session_consents` (`supabase/migrations/20260107_p37_consent_mechanism.sql`),
written via `recordSessionConsent()` (`src/app/data/api.ts:3421`, called from
`src/app/pages/clarity-live-page.tsx:2984`) — capturing `consent_timestamp`, `terms_version`,
`ip_hash` and `user_agent` per session.

**Complication:** That existing trail records acceptance of the **Terms of Service and Privacy
Policy**. It does not grant any right to record a participant, nor to publish or edit that
recording. The founder wants to film sessions and publish them (YouTube), which needs a media
release that the current schema does not represent. Asking for it on `/meet` is not an option:
that page carries the words "Not legally binding", and a rights grant sitting under that
disclaimer is undermined by it.

**Question:** How do we obtain a recording-and-publishing release that is specific, identity-bound,
and evidenced — without contaminating `/meet`, and without rebuilding the audit trail P37 already
provides?

## Appetite

**Blast radius:** Medium-high, and mostly *legal* rather than technical. The page itself is small.
The release wording carries real exposure: Germany treats recording a private spoken conversation
without consent as a criminal matter (StGB §201), and publishing identifiable people engages GDPR.
A defective release means footage that cannot be used, or worse.

**Reversibility:** The code is a git revert. **Consent already collected under defective wording is
not reversible** — every session filmed under it would need re-consent or deletion. This asymmetry
is the reason for the legal-review gate below.

**Decision density:** High. The release wording is a founder decision requiring outside counsel;
several product questions below are unresolved.

## Solution

A dedicated `/consent` page, reached before the camera rolls, separate from `/meet`.

**Three stacked layers of evidence, weakest to strongest.** Each is cheap; they are used together
because the weakest one alone (a tap on a device the founder owns) binds to no identity:

1. **On-page release + checkbox.** Full release text visible on the page — not behind a link, not
   summarised. One unchecked-by-default checkbox. Scope stated plainly in the affirmative:
   perpetual, worldwide, any medium, right to edit.
2. **Email + confirmation click.** The participant enters their email; a confirmation message is
   sent; clicking it produces the **consent receipt**. This is what binds the consent to a person
   rather than to a device.
3. **On-camera verbal restatement.** In the first seconds of the recording, the participant says
   out loud that they read and agreed. The strongest artifact available — their own voice, inside
   the recording itself. Not built by this spec (it is a founder script, not code), but the page
   must produce a state the founder can point at on camera.

**Persistence extends P37 rather than duplicating it.** The existing `session_consents` shape
(timestamp, version, `ip_hash`, `user_agent`) is already the right audit trail; this adds a distinct
consent *kind* plus the email-confirmation fields. Whether that is a new column on
`session_consents` or a sibling `media_releases` table is an `/architect` decision — the constraint
is that a media release must never be indistinguishable from a Terms acceptance in the data.

**Sequencing** (why `/consent` precedes everything):

```
  1. /consent      release + email + confirm     BINDING       ← before camera
  2. camera rolls
  3. on camera     "say it out loud"             evidence
  4. /meet         rung → agree → understand     NON-BINDING   ← the footage
```

The terms conversation on `/meet` is the content worth filming, so consent has to come first or it
cannot be captured.

## Risks / Non-Goals

### Risks

- **Defective release wording makes every recording unusable.** Highest risk here by a wide margin.
  *Mitigation:* the release text is reviewed by a qualified German lawyer **before** the page ships.
  This is a hard gate, not a nice-to-have — see Pre-deploy Checklist. Neither the founder nor an
  agent drafts final wording.
- **Consent bundled with account creation is not "freely given" under GDPR.** If consenting requires
  an account and an account requires consenting, neither is free. *Mitigation:* the consent receipt
  is the artifact; account creation is at most a byproduct and must never be a precondition. See
  Non-Goals.
- **A participant who confirms by email but never appears on camera** leaves a release with no
  recording. Harmless, but the data must not imply a session happened. *Mitigation:* the release is
  not tied to a session id at creation; it is linked when filming actually occurs.
- **Consent for one session read as consent for all.** *Mitigation:* the release is per person per
  session, and the UI must say so. Consent is never inherited from a prior participant or a prior
  session.
- **Pre-publication review implied but not granted.** The founder intends to share the recording
  beforehand as a courtesy, not as a right. *Mitigation:* the release states this explicitly as a
  courtesy, or omits it entirely. Implying a right that is not granted is worse than granting none.

### Non-Goals

- Do **NOT** put any part of this release on `/meet`. That page states "Not legally binding" and
  must keep that property intact.
- Do **NOT** make account creation, login, or profile completion a precondition for giving consent.
- Do **NOT** reuse `ConsentCheckbox` (`src/app/components/legal/consent-checkbox.tsx`) as-is — its
  label is hardcoded to Terms of Service and Privacy Policy. Generalise its label or write a sibling;
  do not silently repurpose a component whose visible text says something else.
- Do **NOT** create a second, parallel consent audit trail. Extend the P37 shape.
- Do **NOT** ship any release wording that has not been through legal review.
- Do **NOT** implement the on-camera verbal step in code. It is a founder script.
- Do **NOT** add recording capability, video upload, or publishing tooling. This spec captures
  permission only.

## Done-When

- [ ] `/consent` renders the full release text on the page, not behind a link
- [ ] Checkbox is unchecked by default and submission is impossible without it
- [ ] A confirmation email arrives at the address entered, and clicking it records the receipt
- [ ] The stored record is distinguishable from a P37 Terms acceptance by inspection
- [ ] The stored record includes timestamp, release version, and the confirmed email
- [ ] Consent can be completed with no account and no login
- [ ] Reloading `/consent` after confirming does not silently re-consent or duplicate the record
- [ ] An unconfirmed email produces no valid receipt
- [ ] `/meet` contains no release text and still displays "Not legally binding"
- [ ] Release wording carries written confirmation of legal review (see Pre-deploy Checklist)

## Acceptance Criteria

- [ ] A participant can read, understand, and grant the release on the founder's phone in under a minute
- [ ] The founder can show, for any filmed session, which identity consented and when
- [ ] A participant who declines is not blocked from doing a non-filmed session

## UI Contract

| Element | Value | Context |
|---------|-------|---------|
| Route | `/consent` | New; no collision with `/terms-of-service` (`App.tsx:640`) |
| Checkbox default | unchecked | Never pre-checked |
| Email field | required | Identity binding |
| Submit label | [FOUNDER DECISION] | |
| Release body | [FOUNDER DECISION — legal review required] | Perpetual, worldwide, any medium, edit rights |
| Confirmation-sent state | [FOUNDER DECISION] | What the participant sees before handing the phone back |

## Pre-deploy Checklist

- [ ] Release wording reviewed by a qualified lawyer in the relevant jurisdiction (Germany: StGB §201, GDPR)
- [ ] Confirmed that consent is not conditional on account creation
- [ ] Release version string recorded with every stored consent

## Open Questions

1. Is one combined release (record + publish + edit) correct, or must recording and publication be
   separate grants? One grant is defensible when the purpose is stated upfront; the un-informed part
   is the *content*, not the purpose. Counsel decides.
2. Does the confirmation email need to happen before filming, or can it be sent after with the
   on-camera statement carrying the session? Affects how much friction sits in the room.
3. Does an anonymous auth user get created (P37's RLS requires `auth.uid() IS NOT NULL`), and if so,
   does that conflict with the no-account-required constraint? This is a real schema tension to
   resolve in `/architect`.

## References

- P1016 `/meet` — the non-binding companion page (`features/done/2026-06-10/p1016_clarity_meeting_terms.md`)
- P37 consent mechanism — `supabase/migrations/20260107_p37_consent_mechanism.sql`
- `recordSessionConsent()` — `src/app/data/api.ts:3421`
- `ConsentCheckbox` — `src/app/components/legal/consent-checkbox.tsx`
