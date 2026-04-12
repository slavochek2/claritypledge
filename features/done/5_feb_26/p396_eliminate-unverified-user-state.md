---
status: done
completed_at: "2026-02-19"
type: task
rank: 0.5
tags:
  - auth
  - simplification
  - guest
  - unverified
  - live
created_date: 2026-02-19T00:00:00.000Z
delivery_stage: decompose-review
reviews:
  ux: null
  architect: null
workstream: C1
uat_file: features/uat/p396.md
test_files:
  - e2e/integration/p396-host-rls-migration.spec.ts
  - src/tests/useVerificationGate.test.ts
completed_at: '2026-02-19'
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

---

## Technical

### Technical Analysis

#### Current Code State

**Auth state model — three tiers today**

The `profiles` table (`supabase/migrations/20250101_initial_schema.sql`) has an `is_verified boolean default false` column. Profile creation happens in `src/auth/AuthCallbackPage.tsx` after email verification, which upserts with `is_verified: true`. The unverified state arises only through the `/live` guest join path.

`src/app/types/index.ts` — The `Profile` interface exposes `isVerified: boolean`. `AuthContext.tsx` maps this from `DbProfile.is_verified` through `getProfile()`. Every consumer of `useAuth()` that reads `user?.isVerified` participates in three-state logic.

**`getOrCreateGuestUser` — the root of the problem**

`src/app/data/api.ts` — This function is the sole creator of unverified profiles. It:
1. Calls `supabase.auth.signInAnonymously()` to create a Supabase auth session.
2. Inserts a `profiles` row with `is_verified: false`, `has_pledged: false`, `slug: null`.
3. Fires `supabase.auth.signInWithOtp({ email })` to send a verification email (fire-and-forget).

It is called from `handleGuestJoin` in `clarity-live-page.tsx`, triggered when a guest submits the name + email inline form.

**`useVerificationGate` — P273 workaround hook**

`src/app/hooks/useVerificationGate.ts` — Returns `checkVerified(actionLabel)` which checks `user?.isVerified`. If false or null, shows a toast. Used in:
- `src/app/pages/create-story-page.tsx` — guards story creation.
- `src/app/pages/story-detail-page.tsx` — guards position-taking on points.

**Guest join flow — `clarity-live-page.tsx`**

The join-via-link view (`isJoinViaLink === true`) currently:
1. Checks `isVerifiedUser = !!user?.isVerified`.
2. For verified users: shows name input only, skips email.
3. For unverified/anonymous users: shows name + email + consent checkbox.
4. Both paths call `handleJoin` → routes to `completeJoin` (verified) or `handleGuestJoin` (unverified/guest).

**Host enforcement — `handleCreate`**

`clarity-live-page.tsx` — The create handler has `if (!user?.isVerified) { navigate('/signup'); return; }`. This is **client-side only** with no server-side/DB enforcement.

**P275 RLS workaround — `clarity_live_turns.point_positions`**

`supabase/migrations/20260222_p275_live_positions_in_turns.sql` — Adds a `point_positions JSONB` column to `clarity_live_turns`. This workaround exists because unverified guests cannot write to the `point_positions` table. The RLS policy on `point_positions` requires `is_verified = true`. With truly ephemeral guests (no profile, no auth session), guests could never write to `point_positions` regardless — so the JSONB column in `clarity_live_turns` remains the correct mechanism for ephemeral guest positions.

**`PartnerLeftScreen` — post-session CTA (partially implemented)**

`src/app/components/partners/live-mode-view.tsx` — Already accepts `isGuest?: boolean` prop and renders a soft signup CTA. Currently called with `isGuest={!user?.isVerified}`. After P396, this becomes `isGuest={!user}`.

**Existing unverified profiles in the database**

No migration needed to clean these up. `AuthCallbackPage.tsx` already handles: when a guest clicks their verification link, it detects the anonymous-ID mismatch, deletes the old profile, and creates a new verified one. This path continues to work post-P396 for any historical guests.

**`session_consents` and `terms_acceptances`**

Both tables require `auth.uid() IS NOT NULL` for INSERT. Under the new model, anonymous guests have no Supabase auth session, so they cannot write to these tables. Consent is captured as a UI-only checkbox. No DB record is written for guests — acceptable for anonymous, non-profiled participants.

#### Key File Dependencies

| File | Role | Change needed |
|---|---|---|
| `src/app/pages/clarity-live-page.tsx` | Join/create flow, email field, guest branching | Major — remove email field, remove `handleGuestJoin`, simplify join branching |
| `src/app/data/api.ts` | `getOrCreateGuestUser` function | Delete — no longer creates profiles for guests |
| `src/app/hooks/useVerificationGate.ts` | Unverified-state gate | Simplify: check `!!user` not `user?.isVerified` |
| `src/tests/useVerificationGate.test.ts` | Unit tests for the hook | Update test cases to match new contract |
| `src/app/components/partners/live-mode-view.tsx` | `PartnerLeftScreen` isGuest prop | Minor — update call site from `!user?.isVerified` to `!user` |
| `src/auth/AuthCallbackPage.tsx` | Email migration path for /live users | Keep migration path; no new unverified profiles created |
| `supabase/migrations/` | `point_positions` RLS | No change — stays correct for two-state model |
| `e2e/join-form-ux.spec.ts` | UX test for join form | Update: email field assertions must be removed |
| `e2e/live-page-auth-gate.spec.ts` | Auth gate E2E | Update: guest join now name-only |
| `e2e/p273-verification-gate.spec.ts` | Verification gate E2E | Update: no unverified-profile state to test |

---

### Architecture Decisions

**Decision 1: Guests are purely ephemeral — no Supabase auth session, no profile row**

- **Chosen:** When a guest joins a session, create no Supabase auth session and no `profiles` row. The guest's display name is stored only in `clarity_sessions.joiner_name`. Session participation is fully ephemeral.
- **Rationale:** `clarity_sessions` already stores `joiner_name TEXT` (not a FK). Session sync (Realtime + polling) operates on session state, not user identity. Removing the profile row removes the FK constraint that blocked `point_positions` writes — the P275 workaround addressed the symptom; this removes the cause.
- **Trade-off:** Consent cannot be recorded in `terms_acceptances`/`session_consents` (requires `auth.uid()`). Consent is UI-only for guests. Acceptable: the spec explicitly states "nothing is stored for guests."
- **Alternative rejected:** Keep anonymous Supabase auth session but skip profile creation. This preserves consent recording but keeps a Supabase auth session for a user with no profile — a half-state that creates edge cases in `AuthContext` (which tries to fetch a profile for every session user).

**Decision 2: All `user?.isVerified` guards become `!!user`**

- **Chosen:** All branching in `handleJoin`, `handleCreate`, and `PartnerLeftScreen` changes from `user?.isVerified` to `!!user`. In the two-state model, if `AuthContext` has a `user` object, that user is by definition verified.
- **Rationale:** After this change, `is_verified: false` is unreachable for new users. Any authenticated user who reaches the live page has `is_verified: true`. Checking `!!user` is simpler and self-documenting.
- **Trade-off:** Existing unverified profiles (pre-P396) with an active anonymous session could transiently see the verified-user path. This is a transient edge case affecting zero users post-migration.
- **Alternative rejected:** Leave `user?.isVerified` in place and just remove the email form. Creates a three-state codebase with only two reachable states — a maintenance trap.

**Decision 3: `useVerificationGate` stays, contract simplified to `!!user`**

- **Chosen:** Keep the hook. Change `user?.isVerified` → `!!user`. Update toast message: "Verify your email to..." → "Sign in to..."
- **Rationale:** The hook has two callers and a full unit test suite. It's a valid abstraction for guarding authenticated-only actions. Deleting it would require inline guards in two pages — equivalent complexity, no gain.
- **Trade-off:** The hook name `useVerificationGate` is slightly misleading (now gates on "is authenticated"). A future rename to `useAuthGate` is trivial; doing it in this PR adds noise.
- **Alternative rejected:** Delete the hook and inline auth checks. Adds two files to change with no architectural benefit.

**Decision 4: `handleGuestJoin` and `getOrCreateGuestUser` are deleted**

- **Chosen:** Delete `getOrCreateGuestUser` from `api.ts`. Delete `handleGuestJoin` from `clarity-live-page.tsx`. Guest join path calls `completeJoin(code, name)` directly after name validation only.
- **Rationale:** With no auth session or profile creation, the join flow for a guest is: validate name → check mic → write `joiner_name` to `clarity_sessions`. Three lines, not a separate function.
- **Trade-off:** `getOrCreateGuestUser` also handled the "verified user tried to join as guest with their email" edge case (returning `requiresLogin: true`). That case disappears — the guest form no longer collects email.
- **Alternative rejected:** Keep the function with gutted internals. Dead code. Delete it.

**Decision 5: Add DB-level host enforcement via `clarity_sessions` INSERT RLS**

- **Chosen:** Add a migration that tightens the `clarity_sessions` INSERT policy to require `auth.uid() IS NOT NULL AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_verified = true)`. The current policy is `WITH CHECK (true)` — anyone can insert a session.
- **Rationale:** US-6 and AC require "enforcement cannot be bypassed by navigating directly to the host URL." A determined attacker can call `createClaritySession` from the browser console, bypassing the client-side guard in `handleCreate`. DB-level enforcement is the only reliable mechanism. This is the most important architectural addition in P396.
- **Trade-off:** Verified users' session creation becomes one query slower (profile lookup in RLS). Negligible.
- **Alternative rejected:** Client-side guard only. Already present, already bypassable.

**Decision 6: `clarity_sessions` UPDATE policy — remove `OR creator_profile_id IS NULL` branch**

- **Chosen:** Add a migration that removes the `OR creator_profile_id IS NULL` clause from the `clarity_sessions` UPDATE policy. Under P396, guests cannot create sessions (only verified users can), so `creator_profile_id` will always be set on all new sessions.
- **Rationale:** The `OR creator_profile_id IS NULL` branch was added to allow guest-created sessions to be updated by anyone. With P396, no guest can create a session. The branch now means "any unauthenticated caller can update any session where `creator_profile_id` was not set" — an unintended open door for historical sessions.
- **Trade-off:** Historical sessions with `creator_profile_id IS NULL` (guest-created, pre-P396) can no longer be updated. These are completed sessions with no active participants. No functional impact.
- **Alternative rejected:** Leave the policy as-is. Leaves an open RLS hole for historical rows.

---

### Security Review

**RLS Policies:**
- ✅ `point_positions` INSERT policy (`is_verified = true` check) correctly blocks all guest writes. No change needed.
- ✅ `point_positions` JSONB column in `clarity_live_turns` (P275) remains the correct ephemeral storage for guest positions during a session.
- ⚠️ `clarity_sessions` INSERT policy is `WITH CHECK (true)` — any unauthenticated caller can create a session, bypassing the client-side host guard. **Fix: add RLS requiring verified user on INSERT** (see Decision 5).
- ⚠️ `clarity_sessions` UPDATE policy has `OR creator_profile_id IS NULL` branch — allows unauthenticated callers to update any session where `creator_profile_id` was not set. **Fix: remove this branch in the same migration** (see Decision 6).
- ✅ `clarity_live_turns` INSERT/UPDATE policies are fully open (`WITH CHECK (true)`) by design for real-time session sync. Unchanged and accepted.
- ✅ `stories` and `points` INSERT policies check `is_verified = true`. Guests (no auth) are correctly blocked.
- ✅ `story_verifications` INSERT policy (`auth.uid() IS NOT NULL AND (auth.uid() = speaker_id OR auth.uid() = listener_id)`) correctly blocks guests.

**Authentication:**
- ✅ Removing `getOrCreateGuestUser` eliminates the `signInAnonymously()` call — guests will have zero Supabase auth session. `AuthContext` will set `user = null`, rendering the guest path correctly.
- ✅ `AuthCallbackPage.tsx` migration logic (handle existing unverified profiles who click verification links) is unaffected and continues to work.
- ⚠️ `session_consents` and `terms_acceptances` require `auth.uid() IS NOT NULL` — guests can no longer record consent. Consent becomes UI-only for anonymous participants. This is accepted per spec constraints.

**Authorization:**
- ⚠️ Current host enforcement is client-side only (`handleCreate` guard). Must be backed by DB-level RLS (see Decision 5). Without this, the AC requirement "cannot be bypassed by direct URL navigation" (or direct API call) is not met.
- ✅ After Decision 5 lands, verified-user-only hosting is enforced at the DB layer.
- ✅ The `/live` auth gate (`if (!user && !isJoinViaLink) navigate('/signup')`) correctly redirects unauthenticated non-invite visitors. Minor transient window on mount — not a security hole.

**Input Validation:**
- ✅ Guest display name: client-side `validateName` enforces max 100 chars and trims whitespace.
- ⚠️ `clarity_sessions.joiner_name` column has no DB-level length constraint. A caller bypassing the frontend can insert an arbitrarily long name. **Recommend:** add `CHECK (length(joiner_name) <= 100)` constraint in the migration.
- ✅ No XSS risk: names are rendered as React text nodes, not `innerHTML`.
- ✅ GCS storage path sanitization (`replace(/[^a-z0-9]/g, '-')`) is present and correct for audio file naming.

**Data Protection:**
- ✅ Guest positions are ephemeral: stored in `clarity_live_turns.point_positions` JSONB (not in `point_positions` table). No durable guest position record.
- ⚠️ Guest display name (`clarity_sessions.joiner_name`) persists indefinitely — no TTL or deletion schedule on `clarity_sessions`. The spec's "nothing stored" guarantee does not apply to this field. This is an explicit data retention trade-off to document.
- ✅ Removing anonymous Supabase auth sessions means no orphaned `auth.users` rows accumulate for unverified guests.
- ✅ `session_consents` and `terms_acceptances` stop accumulating unverified-user rows. Net data protection improvement.

**Invite Link Security:**
- ✅ 6-character alphanumeric code from a 32-char alphabet (~1B combinations). Adequate against random guessing for a short-lived session.
- ⚠️ Room codes generated with `Math.random()` (not CSPRNG). For a low-stakes invite code (not a secret token), acceptable at current scale.
- ⚠️ No expiry on invite links: `clarity_sessions.expires_at` is nullable. Old links from completed sessions remain valid and return a readable session row (public policy). Not introduced by P396; pre-existing design decision.
- ✅ No replay risk for guests: `joinClaritySession` fails if `joiner_name` is already set.
- ✅ Under P396, the invite link mechanism is unchanged. Guests provide only their name; the room code is the access credential.

---

### Implementation Approach

#### Files to Create

- `supabase/migrations/YYYYMMDDHHMMSS_p396_host_rls_and_session_constraints.sql` — Tighten `clarity_sessions` INSERT policy (verified-only host), remove `OR creator_profile_id IS NULL` from UPDATE policy, add `CHECK (length(joiner_name) <= 100)` constraint.

#### Files to Modify

**Phase 1 — Core join flow (`clarity-live-page.tsx`)**
- Remove `getOrCreateGuestUser` from imports.
- Remove `email`, `verifiedEmailError`, `consentChecked` state.
- Remove `validateEmail` helper function.
- Remove `handleGuestJoin` function.
- Remove `handleSendLoginLink`, `handleUseDifferentEmail` functions.
- Simplify `handleJoin`: remove else branch that validates email and calls `handleGuestJoin`. Guest path calls `completeJoin(normalizedCode, name)` directly after name validation.
- Simplify `handleCreate`: change `!user?.isVerified` → `!user`.
- Join-via-link JSX: remove three-branch conditional; replace with `user ? <verified-form> : <guest-form>`. Remove email `<Input>` and consent checkbox from guest form.
- Main start view JSX: remove email input and consent checkbox from guest block. Update `guestCanProceed` to drop email requirement.
- Change `isGuest={!user?.isVerified}` → `isGuest={!user}` at `PartnerLeftScreen` call site.

**Phase 1 — Delete `getOrCreateGuestUser` (`api.ts`)**
- Delete the `getOrCreateGuestUser` function.

**Phase 2 — `useVerificationGate` simplification**
- `src/app/hooks/useVerificationGate.ts`: Change `user?.isVerified` → `!!user`. Update toast message to "Sign in to {actionLabel}."

**Phase 2 — Update tests**
- `src/tests/useVerificationGate.test.ts`: Remove "unverified user" test block. Add/update "unauthenticated user (null)" test. Update expected toast message strings.
- `e2e/join-form-ux.spec.ts`: Remove assertions checking for email field. Add assertion that email field is absent.
- `e2e/live-page-auth-gate.spec.ts`: Update guest join test for name-only flow.
- `e2e/p273-verification-gate.spec.ts`: Update for two-state model (no unverified-profile state).

#### Files to Delete

None. `getOrCreateGuestUser` is deleted in-place within `api.ts`.

#### Files to Keep Unchanged

- `supabase/migrations/20260222_p275_live_positions_in_turns.sql` — JSONB column remains correct for ephemeral guest positions.
- `supabase/migrations/20260204_stories_points_calibration.sql` — `point_positions` RLS stays correct for two-state model.
- `src/auth/AuthCallbackPage.tsx` — Historical migration path for existing unverified profiles; harmless post-P396.
- `src/app/components/partners/live-mode-view.tsx` — `PartnerLeftScreen` component is correct; only the call site changes.

#### Build Sequence

- [ ] **Phase 1 — Remove guest email collection**
  - [ ] Delete `getOrCreateGuestUser` from `api.ts`
  - [ ] Remove email state, `validateEmail`, `handleGuestJoin`, `handleSendLoginLink`, `handleUseDifferentEmail` from `clarity-live-page.tsx`
  - [ ] Remove email `<Input>` and consent checkbox from join-via-link guest form JSX
  - [ ] Remove email `<Input>` and consent checkbox from main start view guest JSX
  - [ ] Update `guestCanProceed` to drop email requirement
  - [ ] Update `handleJoin` else branch: name-only validation, call `completeJoin` directly
  - [ ] Change `isGuest={!user?.isVerified}` → `isGuest={!user}`
  - [ ] Update `e2e/join-form-ux.spec.ts`: email field must be absent

- [ ] **Phase 2 — Host enforcement and verified-user branch cleanup**
  - [ ] Write migration: tighten `clarity_sessions` INSERT policy (verified-only), remove `OR creator_profile_id IS NULL` from UPDATE policy, add `joiner_name` length constraint
  - [ ] Run `./scripts/migrate.sh`
  - [ ] Change `!user?.isVerified` → `!user` in `handleCreate`
  - [ ] Change `user?.isVerified` → `user` in join-via-link branch selector
  - [ ] Run `e2e/live-page-auth-gate.spec.ts` — verify host gate still works

- [ ] **Phase 3 — `useVerificationGate` simplification**
  - [ ] Update `useVerificationGate.ts`: `user?.isVerified` → `!!user`, update toast message
  - [ ] Update `useVerificationGate.test.ts`: remove unverified-user test block, update message assertions
  - [ ] Run unit tests: `npm test -- useVerificationGate`
  - [ ] Update `e2e/p273-verification-gate.spec.ts` — verify gate fires for unauthenticated users

- [ ] **Phase 4 — DB cleanup (optional, non-blocking)**
  - [ ] Count existing unverified profiles: `SELECT count(*) FROM profiles WHERE is_verified = false;`
  - [ ] If count is small and user approves: write migration `DELETE FROM profiles WHERE is_verified = false AND has_pledged = false;`

- [ ] **Phase 5 — Full regression**
  - [ ] Run full E2E suite: `npm run test:e2e`
  - [ ] UAT: coach clicks own invite link → admitted directly, no name/email form
  - [ ] UAT: anonymous guest opens invite link → name-only form, joins, sees post-session signup CTA
  - [ ] Confirm `SELECT count(*) FROM profiles WHERE is_verified = false` returns 0 after join flow exercise

---

## Test Coverage Strategy

**Files generated:**
- ✅ Unit tests: `src/tests/useVerificationGate.test.ts` (updated — 6 tests)
- ✅ Integration tests: `e2e/integration/p396-host-rls-migration.spec.ts` (5 tests — MANDATORY per P270 rule)
- ✅ E2E tests: `e2e/p396-smoke.spec.ts` (4 tests)
- ✅ E2E updated: `e2e/join-form-ux.spec.ts` (added name-only assertion)
- ✅ E2E updated: `e2e/live-page-auth-gate.spec.ts` (added no-email assertion)
- ✅ E2E updated: `e2e/p273-verification-gate.spec.ts` (two-state model, unauthenticated user)
- ✅ UAT scenarios: `features/uat/p396.md` (14 scenarios)

**Test pyramid:**
```
        /\
       /  \   4 smoke + 2 E2E updated
      /    \
     /------\
    / 5 INT  \  RLS + constraint verification
   /----------\
  /  6 UNIT   \  useVerificationGate two-state contract
 /______________\
```

**Total:** 15 automated tests + 14 UAT scenarios

**What's tested:**
- ✅ INSERT RLS blocks anonymous and unverified callers (integration)
- ✅ INSERT RLS allows verified users (integration)
- ✅ UPDATE RLS blocks anonymous callers on legacy sessions (integration)
- ✅ `joiner_name` CHECK constraint (integration)
- ✅ `useVerificationGate` two-state contract: `!!user` not `user?.isVerified` (unit)
- ✅ Guest join form shows name only, no email (smoke + join-form-ux)
- ✅ Verified user not shown join form on invite link (smoke)
- ✅ Unauthenticated visitor redirected from /live (smoke)

**What's NOT tested (rationale):**
- ❌ Post-session signup CTA rendering — covered by UAT-4.1/4.2, E2E two-party required
- ❌ `getOrCreateGuestUser` deletion — no test needed; deleting dead code is verified by absence of import errors at build time
- ❌ `PartnerLeftScreen` prop change (`!user?.isVerified` → `!user`) — trivial prop, covered by UAT smoke and existing live-mode tests
- ❌ A11y tests — no new UI components added; existing a11y coverage unchanged

---

## Implementation Tasks

> Generated by /decompose. Each task is scoped to 1–3 files and independently verifiable.
> Run /dev to execute — it will dispatch one subagent per task in dependency order.

### Task 1: DB migration — RLS hardening + joiner_name constraint
- **Files:** `supabase/migrations/20260219HHMMSS_p396_host_rls_and_session_constraints.sql` (create)
- **Spec refs:** "Architecture Decisions > Decision 5 & 6 (lines ~271-284)", "Security Review > RLS Policies (lines ~294-299)", "Implementation Approach > Files to Create (lines ~336-338)", "Build Sequence > Phase 2 (lines ~389-394)"
- **Tests:** `e2e/integration/p396-host-rls-migration.spec.ts`
- **Depends on:** None
- **Steps:**
  1. Create migration file with a 14-digit timestamp (e.g. `20260219120000_p396_...sql`)
  2. Drop old `clarity_sessions` INSERT policy (`"Anyone can create sessions"` — `WITH CHECK (true)`)
  3. Create new INSERT policy: `WITH CHECK (auth.uid() IS NOT NULL AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_verified = true))`
  4. Drop old UPDATE policy (`"clarity_sessions_creator_update"`)
  5. Recreate UPDATE policy: `USING (true) WITH CHECK (creator_profile_id = auth.uid())` — removes `OR creator_profile_id IS NULL`
  6. Add constraint: `ALTER TABLE clarity_sessions ADD CONSTRAINT joiner_name_length CHECK (length(joiner_name) <= 100)`
  7. Run `./scripts/migrate.sh`
- **Verify:** `e2e/integration/p396-host-rls-migration.spec.ts` passes (all 5 tests)
- [x] Complete

### Task 2: Simplify guest join flow in clarity-live-page.tsx + delete getOrCreateGuestUser
- **Files:** `src/app/pages/clarity-live-page.tsx` (modify), `src/app/data/api.ts` (modify)
- **Spec refs:** "Implementation Approach > Phase 1 (lines ~342-352)", "Phase 2 > verified-user branch cleanup (lines ~389-394)", "Build Sequence > Phase 1 & 2 (lines ~379-394)"
- **Tests:** `e2e/p396-smoke.spec.ts`, `e2e/join-form-ux.spec.ts`, `e2e/live-page-auth-gate.spec.ts`
- **Depends on:** Task 1 (migration must be applied before removing client-side enforcement)
- **Steps:**
  1. `api.ts`: Delete `getOrCreateGuestUser` function entirely
  2. `clarity-live-page.tsx`: Remove import of `getOrCreateGuestUser`
  3. Remove state: `email`, `verifiedEmailError`, `consentChecked`
  4. Remove functions: `validateEmail`, `handleGuestJoin`, `handleSendLoginLink`, `handleUseDifferentEmail`
  5. Simplify `handleJoin` else branch: name-only validation → call `completeJoin(normalizedCode, name)` directly
  6. Simplify `handleCreate`: `!user?.isVerified` → `!user`
  7. Join-via-link JSX: change branch selector `user?.isVerified` → `user`; remove email `<Input>` and consent checkbox from guest form
  8. Main start view JSX: remove email `<Input>` and consent checkbox from guest block; update `guestCanProceed` to drop email requirement
  9. Change `isGuest={!user?.isVerified}` → `isGuest={!user}` at `PartnerLeftScreen` call site
- **Verify:** `npm run build` succeeds (no TS errors), `e2e/p396-smoke.spec.ts` passes, `e2e/join-form-ux.spec.ts` passes, `e2e/live-page-auth-gate.spec.ts` passes
- [x] Complete

### Task 3: Simplify useVerificationGate hook
- **Files:** `src/app/hooks/useVerificationGate.ts` (modify)
- **Spec refs:** "Architecture Decisions > Decision 3 (lines ~257-263)", "Build Sequence > Phase 3 (lines ~396-400)"
- **Tests:** `src/tests/useVerificationGate.test.ts`, `e2e/p273-verification-gate.spec.ts`
- **Depends on:** None (independent of Tasks 1 and 2)
- **Steps:**
  1. Change `if (user?.isVerified) return true;` → `if (!!user) return true;`
  2. Change toast message: `"Verify your email to ${actionLabel} — check your inbox or resend below."` → `"Sign in to ${actionLabel}."`
- **Verify:** `npm test -- useVerificationGate` passes (6 tests, no unverified-user cases), `e2e/p273-verification-gate.spec.ts` passes
- [x] Complete

### Task 4: Full regression
- **Files:** None (test-run only)
- **Spec refs:** "Build Sequence > Phase 5 (lines ~406-410)"
- **Tests:** All P396 test files
- **Depends on:** Task 1, Task 2, Task 3
- **Steps:**
  1. Run `npm run build` — verify no TypeScript errors
  2. Run `npm test` — unit tests pass
  3. Run `npm run test:e2e` — full E2E suite passes
  4. DB check: `SELECT count(*) FROM profiles WHERE is_verified = false` (should not increase after exercising join flow)
  5. Run `./scripts/pre-commit-checks.sh`
- **Verify:** All tests green, pre-commit passes
- [x] Complete

**Total tasks:** 4 | **Can parallelize:** Task 1 + Task 3 (no shared dependencies) | **Must be sequential:** Task 1 → Task 2 → Task 4; Task 3 → Task 4
