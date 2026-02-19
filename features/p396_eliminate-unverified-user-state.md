---
status: blocked
type: task
rank: 1
workstream: C1
tags:
  - auth
  - simplification
  - guest
  - unverified
  - live
created_date: 2026-02-19T00:00:00.000Z
delivery_stage: prd-review
reviews:
  ux: null
  architect: null
---

# P396: Eliminate unverified user state — truly ephemeral guests

## Problem Statement

### Current state

The system has three auth states:

1. **Anonymous** — no Supabase auth session, no profile row
2. **Unverified profile** (`is_verified: false`) — has a Supabase auth session and a `profiles` row, but has not confirmed their email
3. **Verified** (`is_verified: true`) — full account, email confirmed

The middle state (unverified profile) was introduced as a transitional layer during `/live` guest onboarding. A guest joining a session is asked for their email, a profile row is created immediately, and they are expected to verify it later. This design assumption is now invalidating product quality.

### Pain points — known bugs

1. **Unverified users can host sessions.** The `/live` flow does not consistently enforce that only verified users can start or host a session. An unverified profile can reach the host screen, which violates the intended product rule.

2. **Verified user receiving an invite is still asked for their email.** A logged-in, fully verified user clicking a session invite link is presented with the guest email-entry form — the system fails to detect their existing verified session and skips them past the gate.

3. **Unverified logged-in user receiving a second invite must re-enter their email.** A user who has an unverified profile from a previous session and receives a new invite link must go through the email-entry step again — the system does not recognise the existing (unverified) session.

4. **Structural complexity tax.** The middle state forces every feature that touches auth to handle three cases instead of two. P273 (`useVerificationGate` hook) was built entirely to paper over this complexity, marked done, yet bugs remained. P275 required an architectural workaround (storing live positions in `clarity_live_turns` instead of `point_positions`) solely because unverified users cannot pass RLS on `point_positions`. Each new feature that touches sessions, stories, or positions inherits this debt.

### Who is affected

- **Coaches (hosts):** blocked from a clean hosting experience; the invite link they share sends their counterpart into a broken or degraded flow.
- **Guests (participants):** experience friction (unnecessary email form) or confusion (silent failures).
- **Product:** every new C1 feature has to account for the unverified state, slowing velocity and increasing defect rate.

---

## Intention — Why This Matters

### Strategic importance

The `/live` verification session is the core product loop. Any friction in joining that loop directly reduces the chance coaches experience the product's value. The unverified state is not a minor edge case — it is in the critical path of every session.

Clarity Pledge's current hypothesis is that coaches will adopt the tool if the `/live` flow is smooth enough to run with a real client. Bugs in guest join and host recognition undermine this hypothesis before it can be fairly tested.

### Why now

P272 (live story-point verification), P273 (verification gate), and P275 (live positions RLS workaround) have all shipped workarounds around the unverified state rather than removing it. The workarounds are accumulating. The next feature to touch `/live` will inherit all of them. Removing the root cause now is cheaper than the compound cost of maintaining the middle state indefinitely.

Additionally, the product is pre-scale — there is no large cohort of unverified users whose data or experience must be preserved. This is the lowest-cost window to make this structural change.

### Impact if not solved

- Bug #2 (verified user re-asked for email) will be encountered by every coach who tests the product with a real client, because the coach (verified) is the most likely person to click their own invite link to verify it works.
- The structural complexity will compound: every new feature touching auth must handle three states, increasing implementation time and defect probability proportionally.
- P273's `useVerificationGate` hook becomes a growing surface area for an auth state that no longer has a reason to exist.

---

## Business Requirements

### Must-haves

1. A user is either **verified** (email-confirmed account) or **anonymous guest** (no account, no profile row). No third state.
2. Anonymous guests join a session by providing a **display name only** — no email collection, no profile creation, nothing persisted after the session ends.
3. Verified users clicking an invite link are **never** asked for their email or name — the system detects their session and admits them directly.
4. Only verified users can **host** a session. The enforcement must be consistent — not bypassable by navigating directly to the host URL.
5. After the session ends, guests see a **soft, non-blocking prompt** to sign up, so their calibration history can be saved in future sessions.
6. Existing data integrity: the removal of the unverified state must not corrupt data for verified users or active sessions.

### Success conditions

- A coach can send an invite link to a client (anonymous), the client joins with only their name, and the session runs to completion with no errors.
- A coach who clicks their own invite link (as a verified user) is admitted immediately, without being asked for email or name.
- An anonymous guest who joins a second session in the same browser receives no special friction compared to their first join.
- Zero new workarounds are added in subsequent features to accommodate an unverified-profile state.

### Constraints

- Post-session signup CTA must be **soft** — it must never block session completion or results display.
- Guest participation data (positions taken during the session) need not persist — by design, nothing is stored for guests.
- The invite-join flow must remain accessible via direct URL (no login wall before the name-entry screen for guests).

---

## User Stories

### Guest joining a session

**US-1:** As an anonymous guest, I want to join a session by entering only my display name, so that I can participate without creating an account or sharing my email.

**US-2:** As an anonymous guest who just completed a session, I want to see an optional prompt explaining that signing up would save my calibration history, so that I can decide whether to create an account without being forced to do so.

**US-3:** As an anonymous guest joining a second session (same browser, different day), I want to enter my name and join immediately, so that I have the same friction-free experience as my first session.

### Verified user (coach) joining a session via invite link

**US-4:** As a verified user clicking an invite link, I want to be admitted to the session without being asked for my email or name, so that I can join as myself without redundant steps.

**US-5:** As a verified coach clicking my own invite link to test it, I want the system to recognise my existing session and admit me directly, so that I can verify the link works without going through a guest join flow.

### Host flow

**US-6:** As a verified coach, I want to be the only type of user who can host a session, so that sessions are always anchored to an accountable, identified participant.

**US-7:** As an unregistered visitor, I want to be directed to sign up if I attempt to create or host a session, so that I understand what is needed to run a session.

### Post-session CTA

**US-8:** As an anonymous guest who just completed a session, I want the option to sign up surfaced at a natural point after the session, so that I can act on it if I want to — without it interrupting the session itself.

---

## Jobs to Be Done

**JTBD-1:** When I receive an invite link from a coach and open it, I want to get into the session as fast as possible, so I can focus on the conversation rather than account setup.

**JTBD-2:** When I am a coach testing my own invite link, I want the system to recognise who I am, so I can trust the link works for my client without manually logging out to simulate a guest.

**JTBD-3:** When I finish a session as a guest, I want to understand what I would gain by creating an account, so I can make an informed decision about signing up without feeling pressured.

**JTBD-4:** When I am building a new feature that touches session join or auth state, I want a simple two-state model (verified / anonymous), so I can implement without writing defensive code for an edge case auth state.

---

## Outcomes — Success Metrics

1. **Zero occurrences** of a verified user being shown the guest email/name form during invite join, measured across manual UAT and E2E test coverage.
2. **Zero occurrences** of an unverified-profile user successfully starting or hosting a session, measured by automated tests covering the host route.
3. **No new P-numbers** opened to handle unverified-profile edge cases in subsequent C1 features — tracked informally as a post-ship observation over the next 3 features touching auth.
4. Guest join flow completes (name entry → session screen) in a single step with no intermediate "check your email" screens, confirmed by UAT.
5. The `profiles` table accumulates no new rows with `is_verified: false` after this change ships, measurable via a DB query on staging.

---

## Acceptance Criteria

- [ ] A guest can join a `/live` session by entering only a display name — no email field is shown, no profile row is created.
- [ ] A verified user clicking an invite link is admitted to the session without any name or email form.
- [ ] Hosting a session is blocked for any user who is not verified — this enforcement cannot be bypassed by direct URL navigation.
- [ ] After a session ends, a guest sees a soft signup prompt — the prompt does not block the results or session summary screen.
- [ ] A guest returning to a second session (same browser) enters their name and joins — no additional friction compared to a first-time guest.
- [ ] No data belonging to existing verified users is lost or corrupted by this change.
- [ ] The three-state auth model (anonymous / unverified-profile / verified) is replaced by a two-state model (anonymous guest / verified) — "unverified profile" is no longer a reachable product state for new users.
- [ ] The `useVerificationGate` hook is either removed or scoped exclusively to verified-user actions, with no references to an unverified-profile state.

---

## Next Steps

1. Run `/architect` — determine the migration path for existing unverified profiles, the fate of `useVerificationGate`, and any schema or RLS changes needed to support ephemeral guest sessions.
2. No UX design layer needed — this is a simplification. The guest name-entry form and post-session CTA wording are minor copy decisions, not new UI design.
