---
status: week
type: story
rank: 500003.5
flow: medium
workstream: C2
tags:
  - auth
  - anonymous
  - position
  - embed
  - conversion
prepped_date: '2026-02-27'
delivery_stage: 4-tests-generated
reviews:
  ux: null
  architect: null
  alignment: null
uat_file: features/uat/p458.md
test_files:
  - src/tests/p458-auth-gate-utils.test.ts
  - e2e/p458-anon-position-auth-gate.spec.ts
  - e2e/p458-smoke.spec.ts
  - e2e/integration/p458-auth-callback-position.spec.ts
  - e2e/a11y/p458-accessibility.spec.ts
locked_at: '2026-03-06T03:36:14.491Z'
created_date: 2026-02-27T00:00:00.000Z
---

# P458 — Anonymous User Auth Gate with Context Preservation

## Problem Statement

### Current State

Position buttons (Agree / Disagree / Neutral) on ClarityPledge points are either hidden from
anonymous users or visible but silently broken — clicking does nothing. The behavior is
inconsistent across surfaces: point detail pages, point cards in lists, and embedded points on
external sites.

### Pain Points

**For anonymous visitors:**
- They cannot express a position without first knowing they need an account
- There is no invitation to sign up at the moment of highest intent (wanting to take a stance)
- When they do reach the signup page (if they find it), there is no memory of what they wanted
  to do — they arrive at a blank dashboard with no context

**For the product:**
- Social proof is undermined: position counts are low because the funnel is broken at the very
  first interaction
- Embedded points on external blogs and sites are completely dead for non-logged-in readers —
  zero interactivity, zero conversion path
- Every gated action (position, story, chat, live session) silently drops the user's intent
  rather than channeling it into a signup

### Who Is Affected

- **Anonymous visitors** arriving via shared point links, search, or embedded widgets
- **Blog readers and site visitors** where ClarityPledge points are embedded
- **Logged-out returning users** who land on a point before their session is re-established

---

## Intention — Why This Matters

### Strategic Importance

Position buttons are the primary engagement primitive on ClarityPledge. They are the "like
button" of this product. Making them visible and interactive for anonymous users unlocks two
critical outcomes simultaneously:

1. **Social proof:** Position counts become meaningful. Each count represents a real expressed
   view, not just a logged-in fraction of total interest. Higher counts signal active debate,
   which encourages more engagement.

2. **Conversion funnel:** The moment a visitor wants to take a stance is the highest-intent
   moment in the product. Capturing that intent — redirecting to signup with full context — turns
   engagement curiosity into account creation.

The embed surface amplifies this significantly. Points embedded in external articles reach
readers who are already engaged with the topic. A dead embed wastes that attention entirely.
A live embed with a visible signup redirect converts it into a growth channel.

### Why Now

The embed feature is live. Points are being shared externally. Every embedded point with broken
position buttons is a missed conversion and a damaged impression of the product's quality.

### Impact If Not Solved

- Embedded content remains permanently dead for non-logged-in readers
- The product's most important interaction (taking a stance) has zero top-of-funnel reach
- Signup conversion stays low because intent is never captured at the right moment
- Social proof metrics stay artificially suppressed

---

## Business Requirements

### Must-Haves (Scope A — Position Buttons)

1. Position buttons MUST be visible to all users on all surfaces — including anonymous users and
   embedded contexts
2. When an anonymous user clicks a position button, they MUST be redirected to the signup page
3. The signup redirect MUST preserve full context: which point, and which position the user
   intended to select
4. The signup page MUST display a human-readable reminder of the pending action:
   *"You were about to Agree with: [point title]"* (or Disagree / Neutral as applicable)
5. After completing signup or login, the system MUST automatically save the position the user
   originally selected — without requiring the user to click again
6. After position is saved, the user MUST be redirected to the point they came from
7. For embedded points: clicking a position button MUST open the full point page on
   claritypledge.com in a new tab, where the same redirect-to-signup flow applies

### Must-Haves (Scope B — Other Gated Actions, Secondary)

8. "Tell your story" CTA (appears after position is selected) MUST follow the same
   context-preserving redirect pattern when clicked by an anonymous user
9. "Chat with AI guide" link MUST carry forward the point context so the user lands in a
   relevant starting state after signup
10. "Join live session" CTA MUST redirect anonymous users with session context preserved through
    signup
11. "Create story" action MUST redirect anonymous users with context preserved through signup

### Constraints

- Story verification is OUT OF SCOPE — there is no natural return destination after verification
  that makes the context-preservation pattern worthwhile
- Inline auth (email entry expanding below the buttons) is OUT OF SCOPE — the redirect pattern
  is the chosen approach, consistent with the Twitter embed model
- The accept/decline agreement flow is already implemented correctly and serves as the
  established template for Scope B items

---

## User Stories

### Scope A — Position Buttons

**AS-1:** As an anonymous visitor on a point page, I want to see position buttons (Agree /
Disagree / Neutral), so that I know I can engage and am not confused by a blank or missing UI.

**AS-2:** As an anonymous visitor who clicks a position button, I want to be taken to a signup
page that remembers which position I chose, so that I don't have to re-do the action after
creating an account.

**AS-3:** As a user who just signed up via a position button click, I want my position to be
automatically saved and to land on the point I was reading, so that the flow feels seamless and
my intent is honored.

**AS-4:** As an anonymous reader of an external blog with an embedded ClarityPledge point, I
want to click a position button and be taken to claritypledge.com with my intent preserved, so
that I can sign up and complete the action without starting over.

### Scope B — Other Gated Actions

**AS-5:** As an anonymous visitor who clicks "Tell your story" after seeing position options, I
want to be taken to signup with context about which point I was reading, so that after signing
up I can immediately write my story.

**AS-6:** As an anonymous visitor who clicks the AI chat link on a point, I want the signup
redirect to carry forward the point context, so that the conversation starts in a relevant place
after I log in.

**AS-7:** As an anonymous visitor who clicks "Join live session," I want the signup flow to
remember which session I intended to join, so that I can return to it directly after creating
my account.

---

## Jobs to Be Done

**JTBD-1:** When I land on a debate point that interests me, I want to take a stance immediately,
so I can feel like a participant rather than a passive reader — and be nudged naturally toward
creating an account if I haven't yet.

**JTBD-2:** When I try to engage with a point embedded in an article I'm reading, I want the
embed to behave like a live interactive widget (not a screenshot), so I can express my view
without having to navigate away manually or lose my place in the original article.

**JTBD-3:** When I'm prompted to create an account mid-action, I want to know exactly what I was
doing and why I'm being asked to sign up, so I don't feel interrupted or confused — and I
actually complete the signup.

**JTBD-4:** When I complete signup after clicking a position button, I want my position to be
recorded automatically, so I don't have to retrace my steps or wonder if my action was lost.

---

## Outcomes — Success Metrics

| Metric | Baseline | Target | Timeframe |
|--------|----------|--------|-----------|
| Anonymous-to-signup conversion rate via position button click | ~0% (no flow exists) | ≥ 5% of position clicks by anonymous users | 30 days post-launch |
| Position buttons visible on all point surfaces | Inconsistent / hidden | 100% of surfaces | Day of launch |
| Embedded point interactions resulting in claritypledge.com visits | ~0 | Measurable (> 0) | 30 days post-launch |
| Position auto-save success rate after signup via position redirect | N/A | ≥ 95% | 30 days post-launch |
| Signup completion rate when entering via position-button redirect (vs. baseline signup rate) | Baseline: measure at launch | Higher than baseline direct signup rate | 30 days post-launch |

---

## Acceptance Criteria

### Scope A — Position Buttons (Primary)

- [ ] Position buttons are visible on point detail pages for users who are not logged in
- [ ] Position buttons are visible in point card lists for users who are not logged in
- [ ] Position buttons are visible inside embedded point widgets for users who are not logged in
- [ ] Clicking a position button as an anonymous user navigates to the signup page (not silently fails)
- [ ] The signup page shows a human-readable reminder of the pending action, including the point title and selected position
- [ ] After signing up (new account), the selected position is automatically saved — user does not need to click again
- [ ] After logging in (existing account) via this redirect, the selected position is automatically saved
- [ ] After position is auto-saved, the user is redirected to the point they came from
- [ ] Clicking a position button inside an embedded point opens claritypledge.com/point/{id} in a new tab
- [ ] The new-tab flow on claritypledge.com preserves the intended position and follows the same signup redirect path

### Scope B — Other Gated Actions (Secondary)

- [ ] "Tell your story" CTA is visible to anonymous users after the position section and redirects to signup with point context
- [ ] "Chat with AI guide" redirects anonymous users to signup with point context in the URL
- [ ] "Join live session" redirects anonymous users to signup with session context preserved
- [ ] After completing signup from any Scope B redirect, the user lands in the correct destination (story editor, chat, live session) rather than a generic dashboard
- [ ] Story verification is NOT part of this feature — no acceptance criteria apply

### Quality Bar

- [ ] The context reminder on the signup page is shown for every entry point in Scope A and Scope B — never a blank or generic signup screen when entering via a gated action
- [ ] The auto-save behavior works for both new signups and existing users logging in
- [ ] The behavior is consistent across all surfaces (point detail, point list, embed)

---

## Technical

### Technical Analysis

#### Current Code State

**Surface 1 — `PointCardWithLinks` (`src/app/components/social/point-card-with-links.tsx`)**

Position buttons are guarded by `currentUserId &&` at two render sites (lines 250 and 334):

```tsx
{!hideActions && currentUserId && (
  <div role="presentation" className="mt-3" ...>
    <PositionButtons ... />
  </div>
)}
```

When `currentUserId` is undefined (anonymous visitor), the entire button block is removed from the DOM. The "Tell your story →" CTA (line 482) gates on `showStoryCTA = !!userPosition`, which can only become truthy if a position was selected — also impossible for anonymous users. Net result: both buttons are invisible.

**Surface 2 — `PointCardDetail` (`src/app/components/social/PointCardDetail.tsx`)**

Position buttons are rendered unconditionally (lines 216–228 and 299–310). The `handlePositionClick` handler (line 150) sets local state without any auth guard — so clicking works visually but writes nothing to the database. There is no guard of the form `if (!user) return`. The "Tell your story →" CTA at line 423 fires `navigate('/chat?...')`, which then hits the auth gate in `StoryGuideChatPage`.

This component uses `point.positions['current']` (a prototype data convention), not a real `userId`, so the state-tracking logic is disconnected from real auth in any case.

**Surface 3 — `PointDetailPage` (`src/app/pages/point-detail-page.tsx`)**

Position buttons are rendered unconditionally (line 307). `handlePositionClick` (line 163) guards with `if (!user || !id) return` — so clicking silently does nothing for anonymous users. The "Tell your story →" CTA at line 326 fires navigate, which propagates to the auth gate in `StoryGuideChatPage`. Story CTA is only shown if `showStoryCTA = !!userPosition`, which stays null for anonymous users because the guard short-circuits before any update.

**Embed surface**

The embed widget is an iframe pointed at `https://claritypledge.com/point/:id?embed=true`. The `PointDetailPage` does not currently detect `?embed=true` — the same full-page layout renders. No special embed handling exists. Embed iframes are sandboxed by browser security policy: `window.open` / `target="_blank"` from an iframe is blocked unless `allow-popups` and `allow-top-navigation` are specified. The embed code in `ShareDialog.tsx` (line 49) uses a plain `<iframe>` with no sandbox attribute, meaning the iframe is NOT sandboxed — `target="_blank"` navigation is possible.

**Signup page (`src/app/pages/signup-page.tsx`)**

Already reads `?redirect=` and `?action=` params (lines 31–32) and passes them to `signInWithEmail` (lines 77–79). After auth, `AuthCallbackPage` reads these params and handles `action=rsvp` (lines 443–480). The redirect allowlist (line 484) currently permits: `/events`, `/settings`, `/me`, `/p/`, `/about`, `/pledgers`, `/manifesto`, `/live`. It does NOT include `/point/` or `/chat`.

The signup page currently shows no context banner — the `?message=` param only handles the `no-account` case (line 136). There is no mechanism to display *"You were about to Agree with: [point title]"*.

**`AuthCallbackPage` (`src/auth/AuthCallbackPage.tsx`)**

Handles `action=rsvp` with a full auto-RSVP flow (lines 446–480). The pattern is the established template: detect action param → perform side-effect → redirect to confirmation. This is exactly what position auto-save should replicate.

**`AcceptAgreementPage` template**

Demonstrates the full unauthenticated-to-authenticated context-preservation pattern. Unauthenticated state renders the content plus CTAs linking to `/signup?returnTo=...&token=...` and `/sign-in?returnTo=...&token=...`. After auth, the user lands back on the same page and the action executes. This is a complete working reference implementation.

#### Dependencies and Data Flows

- `pointsService.setPosition(pointId, userId, position)` — the write method, already exists.
- `pointsService.getPointWithCounts(pointId)` — used to fetch point statement for the context banner (no userId needed, anonymous-safe).
- `signInWithEmail` accepts `redirect` and `action` as extra params (already plumbed through to Supabase magic link metadata).
- `AuthCallbackPage` receives `action` and `redirect` from `urlParams` after the magic link is clicked.
- `analytics.track` — Mixpanel events should be added for `position_gate_triggered` and `position_auto_saved`.

---

### Architecture Decisions

**Decision 1 — Context encoding: URL params vs. sessionStorage**

- **Chosen:** URL params (`?action=set-position&pointId=X&position=agree&redirect=/point/X`)
- **Rationale:** The magic link in the user's email must carry the intent through the email client → browser → callback page. sessionStorage is per-tab and does not survive opening a new browser tab from an email client. URL params survive the full round-trip through Supabase magic link metadata (already proven by the RSVP flow). No new infrastructure needed.
- **Trade-off:** Position value is visible in the URL. This is acceptable — it is user-declared data about their own view, not a secret.
- **Alternative rejected:** sessionStorage — breaks when the user opens the magic link in a different tab or browser profile, which is the common email-client behavior.

**Decision 2 — Where position auto-save executes: AuthCallbackPage vs. redirect-back-to-page**

- **Chosen:** Execute position save inside `AuthCallbackPage`, mirroring the RSVP pattern (lines 446–480 of `AuthCallbackPage.tsx`).
- **Rationale:** The position save requires the authenticated `authUser.id`, which is only available after the profile upsert completes. Running it here avoids a second page load, prevents race conditions where the user arrives at the point page before the save completes, and reuses the established action-dispatch pattern. The RSVP flow is a proven, tested reference.
- **Trade-off:** `AuthCallbackPage` grows in responsibility. If the position save fails (network, DB error), the user is already logged in and lands on the point page with no position set — they see a consistent state and can click again. Failure is graceful, not catastrophic.
- **Alternative rejected:** Redirect back to the point page with `?pendingPosition=agree` and execute the save there. This adds complexity (page must detect and handle the pending param, race condition between page load and auth session propagation), and means two round-trips instead of one.

**Decision 3 — Embed surface: open new tab vs. inline flow**

- **Chosen:** When `?embed=true` is detected in `PointDetailPage`, position button clicks open `https://claritypledge.com/point/:id?action=set-position&position=X` in a new tab (`window.open(..., '_blank')`). The full redirect-to-signup flow then runs on that tab.
- **Rationale:** This matches the Twitter embed model cited in the spec as the accepted approach. The embed iframe cannot perform auth redirects itself — the outer page (the blog) controls navigation. Opening a new tab is the standard pattern for cross-origin embedded interactions. The embed's `<iframe>` uses no sandbox attribute, so `window.open` is available.
- **Trade-off:** The user experience has a tab-switch. This is acceptable and expected for embedded widgets.
- **Alternative rejected:** Attempting to redirect the parent frame via `window.top.location`. This is blocked by cross-origin policy when the iframe src is on a different domain than the embedding blog. Unreliable and not a safe pattern.

**Decision 4 — Signup page context banner: fetch point title or encode in URL**

- **Chosen:** Encode the point statement in the redirect URL as `?pointTitle=...` (URL-encoded, truncated to 100 chars to stay within URL length limits). The signup page reads this param and renders the context banner without an extra network fetch.
- **Rationale:** The alternative (fetching the point by ID in the signup page) requires an async load with a loading state on the signup page, adding complexity and a potential flash of unstyled content. Encoding 100 chars of title in the URL is within safe URL length limits. The point title is public data — no security concern with encoding it.
- **Trade-off:** Very long point statements are truncated. The full text is visible after the user completes signup and lands on the point page.
- **Alternative rejected:** Fetch point title asynchronously in `SignupPage`. More network calls, more loading states, more failure modes.

**Decision 5 — Which surfaces to make buttons always-visible (Scope A): all three vs. point detail only**

- **Chosen:** All three surfaces simultaneously: `PointDetailPage`, `PointCardWithLinks`, and `PointCardDetail`.
- **Rationale:** The spec's acceptance criteria explicitly require all surfaces. `PointCardDetail` is the simpler fix (buttons already render, handler just needs an auth branch). `PointCardWithLinks` requires removing the `currentUserId &&` guard and adding the redirect handler. Doing them together avoids a state where some surfaces are fixed and others are not, which would create inconsistency observable by real users.
- **Trade-off:** More files changed in one PR. Acceptable — the changes are parallel and independent.
- **Alternative rejected:** Point detail page only for Scope A, cards in a follow-up. Rejected because embedded points and profile-page point cards would remain broken, undermining the embed-conversion case that is the stated business urgency.

**Decision 6 — `ALLOWED_REDIRECT_PREFIXES` extension**

- **Chosen:** Add `/point/` and `/chat` to the allowed redirect prefix list in `AuthCallbackPage.tsx`.
- **Rationale:** Without this, the post-auth redirect to `/point/:id` falls through to `/events`. This is a one-line change with no security risk — `/point/` is a public read-only route, and the redirect URL is validated to start with `/` and not `//`.
- **Trade-off:** None meaningful. The allowlist already contains a wide set of prefixes.

---

### Security Review

**RLS Policies:**
- ✅ `point_positions` INSERT policy requires `auth.uid() = user_id` — anonymous users cannot write positions directly; impersonation is structurally prevented
- ✅ Auto-save handler uses `authUser.id` from verified session, never from URL params — `user_id` cannot be spoofed by crafting the redirect URL
- ✅ `is_verified = true` required for INSERT; `AuthCallbackPage` sets this in upsert before executing auto-save — order is correct
- ✅ UPDATE policy `USING (auth.uid() = user_id)` holds correctly since `user_id` is never changed on update

**Authentication:**
- ✅ `processAuth()` gated behind `if (!session) { return; }` — `action=set-position` handler only runs after confirmed session
- ✅ `sessionChecked` + `!isLoading` guard prevents firing on stale/loading state
- ✅ `authUser.id` taken from `session.user`, not URL params — authenticated identity cannot be spoofed

**Open Redirect:**
- ⚠️ **`/point/` is missing from `ALLOWED_REDIRECT_PREFIXES`** — without adding it, post-save redirect silently falls back to `/events`. Must add `/point/` (and `/chat`) before implementation.
- ✅ Existing whitelist logic is sound — requires `/` prefix, rejects `//` protocol-relative URLs, uses prefix matching with `/` or `?` suffix guards. No open redirect vulnerability.

**Input Validation:**
- ⚠️ `pointId` from URL params needs client-side UUID format check before DB call — Postgres FK will catch it but produces opaque errors
- ⚠️ `value` (position) from URL params needs client-side enum allowlist check (`agree`, `disagree`, `neutral`) — Postgres enum will reject invalid values but with confusing errors
- ✅ No SQL injection risk — Supabase JS client uses parameterized queries
- ✅ Non-UUID strings fail Postgres UUID type check structurally

**Data Protection:**
- ✅ URL params contain no PII — `pointId` is a UUID, `action`/`value` are literal strings
- ✅ Position values are intentionally public (RLS `USING (true)` on reads)
- ℹ️ Sentry captures `window.location.href` — intent params will appear in error extras. Low risk (no PII).
- ℹ️ Shared device edge case: intent URL stays in browser history. Low risk since positions are public after save.

**Summary:** PASS WITH NOTES — Two items required before implementation: (1) add `/point/` and `/chat` to `ALLOWED_REDIRECT_PREFIXES`; (2) add client-side UUID + enum validation in the `action=set-position` handler.

---

### Implementation Approach

#### Files to Create

None. All changes are additive modifications to existing files.

#### Files to Modify

**Scope A — Position buttons visible + redirect flow:**

1. `src/app/components/social/point-card-with-links.tsx`
   - Remove `currentUserId &&` guard from both `PositionButtons` render sites (lines 250 and 334).
   - Modify `handlePositionClick`: if `!currentUserId`, build redirect URL (`/signup?action=set-position&pointId=X&position=Y&redirect=/point/X&pointTitle=...`) and call `navigate()` to it.
   - Add `navigate` import is already present.
   - Modify "Tell your story" CTA: if `!currentUserId`, redirect to signup with `action=tell-story&pointId=X` instead of navigating to `/chat`.

2. `src/app/components/social/PointCardDetail.tsx`
   - Add `onAnonPositionClick?: (position: Position) => void` prop (or accept `navigate` / a callback).
   - Modify `handlePositionClick`: if no real user context is available (detect via prop), call the anon redirect path.
   - Simplest approach: accept `currentUserId?: string` prop (currently absent), add same redirect logic as `PointCardWithLinks`.

3. `src/app/pages/point-detail-page.tsx`
   - Modify `handlePositionClick`: replace `if (!user || !id) return` with auth-gate redirect: build URL and `navigate('/signup?action=set-position&...')`.
   - Show "Tell your story" CTA for anonymous users too — redirect to signup with story context rather than showing nothing.

4. `src/auth/AuthCallbackPage.tsx`
   - Add `action=set-position` handler after the `rsvp` handler block (after line 480): extract `pointId` and `position` from `urlParams`, call `pointsService.setPosition(pointId, authUser.id, position)`, then navigate to `/point/${pointId}`.
   - Add `/point/` and `/chat` to `ALLOWED_REDIRECT_PREFIXES` (line 484).
   - Add Mixpanel event: `position_auto_saved`.

5. `src/app/pages/signup-page.tsx`
   - Read `?action=`, `?pointTitle=`, `?position=` params.
   - If `action === 'set-position'`, render a context banner above the signup form: *"You were about to [position] with: [pointTitle]"*. Use a blue info banner consistent with the existing `message === 'no-account'` pattern (lines 136–143).

**Scope B — Secondary gated actions:**

6. `src/app/pages/story-guide-chat-page.tsx`
   - Replace `<Navigate to="/signup" replace />` (line 63) with a redirect that carries `pointId`, `from`, and `redirect=/chat?from=position&pointId=X` in the URL.
   - Add `action=open-chat` to `AuthCallbackPage` handler to navigate to `/chat?from=position&pointId=X` after auth.

7. `src/auth/AuthCallbackPage.tsx` (same file, additional handler)
   - Add `action=open-chat` handler: navigate to the `redirect` param (already validated by prefix allowlist after adding `/chat`).
   - Add `action=tell-story` handler: navigate to `/chat?from=position&pointId=X`.

**Embed surface (Scope A requirement 7):**

8. `src/app/pages/point-detail-page.tsx` (same file)
   - Detect `?embed=true` via `useSearchParams`.
   - When embed mode: wrap `handlePositionClick` to call `window.open('/point/${id}?action=set-position&position=X&embed=false', '_blank')` instead of the local redirect.
   - Optionally render a stripped-down layout (no FocusHeader, no positions list) for cleaner embed display. This is a UI-only concern and can be a follow-up if it adds scope.

#### Build Sequence

**Step 1 — AuthCallbackPage extension (no visible user impact)**
Add `/point/` and `/chat` to allowlist. Add `set-position` action handler (stub that just redirects if no pointId is found, so it degrades gracefully). Add `tell-story` and `open-chat` handlers. Commit.

**Step 2 — SignupPage context banner**
Read `action`, `pointTitle`, `position` params. Render context banner when present. Commit.

**Step 3 — PointDetailPage: make buttons always visible, add anon redirect**
Remove the `if (!user) return` guard from `handlePositionClick`. Add the redirect-to-signup branch. Extend "Tell your story" CTA to show for anonymous users with a redirect. Commit.

**Step 4 — PointCardWithLinks: remove guard, add anon redirect**
Remove `currentUserId &&` from both button render sites. Add anon redirect in `handlePositionClick`. Add anon redirect in "Tell your story" CTA. Commit.

**Step 5 — PointCardDetail: add currentUserId prop, add anon redirect**
Add prop. Wire redirect logic consistent with the above. Commit.

**Step 6 — Embed detection in PointDetailPage**
Add `?embed=true` detection. Override click handlers to use `window.open`. Commit.

**Step 7 — StoryGuideChatPage: replace bare Navigate with context redirect**
Replace `<Navigate to="/signup" replace />` with a context-carrying redirect. Commit.

**Step 8 — End-to-end test: anonymous → click → signup → auto-save → redirect to point**
Manual QA across all three surfaces (point detail, card list, embed). Verify the context banner appears on signup page. Verify position is auto-saved after completing signup or login. Verify redirect lands on the correct point.

---

## Test Coverage Strategy

### Overview

Tests are organized across five files covering different layers of the stack:

| File | Layer | Focus |
|------|-------|-------|
| `src/tests/p458-auth-gate-utils.test.ts` | Unit | Pure logic: URL building, validation, parsing |
| `e2e/p458-smoke.spec.ts` | E2E smoke | Anon page loads without errors; buttons visible |
| `e2e/p458-anon-position-auth-gate.spec.ts` | E2E full | Full auth-gate redirect flow, all surfaces, Scope B |
| `e2e/integration/p458-auth-callback-position.spec.ts` | Integration | AuthCallbackPage saves correctly; security regression tests |
| `e2e/a11y/p458-accessibility.spec.ts` | Accessibility | ARIA labels, keyboard nav, screen reader announcements |

### Unit Tests (`src/tests/p458-auth-gate-utils.test.ts`)

Tests four utility functions against spec contracts:

- **`buildAuthGateUrl`** — 18 cases covering all 5 action types, pointTitle truncation, URL encoding, and round-trip correctness
- **`isValidPosition`** — 9 cases including edge cases (null, space-padded, SQL injection, case sensitivity, 'unsure' vs 'neutral' distinction)
- **`isValidPointId`** — 10 cases covering valid UUID v4, non-UUID strings, missing hyphens, wrong version digit, injection attempts
- **`parseAuthGateIntent`** — 15 cases including missing fields, invalid enums, invalid UUIDs, injection attempts, round-trip with buildAuthGateUrl

**Key note:** Tests use stubs that mirror the spec contract. Replace import comments with real imports once `src/lib/auth-gate-utils.ts` is created in the P458 implementation.

### E2E Smoke Tests (`e2e/p458-smoke.spec.ts`)

Lightweight fast-fail gate. Uses `beforeAll`/`afterAll` for shared fixtures (one user, one point). Verifies:
- Point detail page loads without JS errors for anon user
- At least Agree and Disagree buttons are visible in DOM
- No crash in embed mode (`?embed=true`)
- Signup page with position-gate context loads without errors

### E2E Full Tests (`e2e/p458-anon-position-auth-gate.spec.ts`)

Each test has its own fixture to avoid state pollution. Key flows covered:
- **Button visibility** (3 tests): buttons present, no login prompt, no console errors
- **Redirect URL correctness** (7 tests): all 3 position values, all required params, redirect back to point
- **Signup context banner** (3 tests): correct verb per position, absent on direct signup
- **Logged-in flow unaffected** (2 tests): no redirect, UI updates correctly
- **Scope B** (3 tests): story CTA visible, redirects with action=start-story and pointId
- **Embed surface** (1 test): new tab opens with correct URL
- **Post-login redirect** (1 test): callback lands on point page
- **PointCardWithLinks** (2 tests): cards on profile page show buttons; anon click redirects

### Integration Tests (`e2e/integration/p458-auth-callback-position.spec.ts`)

Uses Supabase direct client with JWT tokens (no Playwright page needed for DB tests). Key assertions:
- **ALLOWED_REDIRECT_PREFIXES** (2 tests): reads AuthCallbackPage source directly — `/point/` and `/chat` must be present (regression test for security gap from §Security Review)
- **Position auto-save** (2 tests): verified user saves agree; duplicate upsert is idempotent
- **Input validation** (4 tests): non-UUID pointId rejected by DB; invalid enum rejected; anon client blocked by RLS; user cannot spoof another user's position
- **Auth callback page behavior** (3 tests): redirect to point after valid params; graceful fallback for invalid pointId; graceful fallback for invalid position

### Accessibility Tests (`e2e/a11y/p458-accessibility.spec.ts`)

Shared `beforeAll`/`afterAll` fixtures (one user, one point). Tests:
- **Position buttons** (4 tests): visible to anon; tabIndex not -1; accessible name non-empty; Tab key reaches position buttons
- **Keyboard activation** (1 test): Enter on focused Agree button redirects to /signup
- **Context banner** (3 tests): role="alert" or aria-live on banner; banner visible with point info; no broken ARIA references
- **DOM integrity** (3 tests): no broken aria-labelledby/describedby on point detail; no nested `<button>` elements; sensible h1 count

### What Is Not Covered by Automated Tests

- **New user magic link round-trip**: The full `new account → email magic link → click → callback → auto-save` flow requires email interception (not implemented). Covered by UAT-4 manual scenario.
- **Embed iframe in a real external blog**: Requires a deployed embed on a cross-origin page. Covered by UAT-7 manual scenario.
- **Scope B — Chat and live session gated actions**: The `open-chat` and `join-session` actions are structurally identical to `start-story` but need context verification inside those pages post-auth. Covered by UAT-8 partial automation + manual UAT-8.

### Edge Cases Covered

- `pointTitle` truncated to 100 chars (Decision 4)
- `position=unsure` (internal) vs `position=neutral` (URL param) distinction — `isValidPosition('unsure')` returns false intentionally
- SQL injection in both `pointId` and `position` fields
- Spoofed `user_id` in INSERT (RLS blocks it — auth.uid() = user_id)
- Duplicate position for same user+point (upsert is idempotent)
- `?embed=true` on point page does not crash
- `/point/` missing from allowlist silently redirects to `/events` — test catches the regression
