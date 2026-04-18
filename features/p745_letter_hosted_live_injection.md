---
status: week
type: story
rank: 1000745.0
workstream: C2
created_date: '2026-04-17'
tags: [letters, live, injection, author-trigger]
delivery_stage: decompose
flow: dev
pipeline_plan: [create-spec, challenge-prd, architect, generate-tests, dev, verify]
pipeline_skipped: [ux -- reuses ActiveSessionBanner pattern, ui -- copy change only, view -- additive to existing surface, decompose -- under 5 files expected, spec-review -- fresh spec, spec-compact -- under 100 lines]
pipeline_ran: [create-spec, challenge-prd, architect, generate-tests, decompose]
uat_file: features/uat/p745.md
test_files:
  - src/tests/p745-use-open-live-invite-extension.test.ts
  - src/tests/p745-save-letter-pause-state.test.ts
  - e2e/integration/p745-migration.spec.ts
  - e2e/p745-letter-live-injection.spec.ts
  - e2e/a11y/p745-accessibility.spec.ts
---

# P745: Letter-hosted /live injection with pause/resume

## Problem

**Situation:** A registered receiver filling a Clarity Letter reaches /live only by completing the letter, going to their inbox, and acting on a `clarity_live_invite` sent by email (P703). The sender cannot initiate /live while the receiver is mid-letter.

**Complication:** The motivating workflow is "author is with the person, wants to start /live *now*" — whether that person is reading story 1 or rating point 3. Routing through inbox adds an email round-trip, breaks letter flow, and forces the receiver out of their reading state.

**Question:** How does the author trigger a /live session for a receiver who is currently reading a letter, without the receiver having to leave and return via inbox?

## Appetite

Medium blast radius (new banner surface in letter reader; letter reader gains a pause/resume state machine; author gains a new trigger affordance; **requires schema change** — no `saved_story_index` or equivalent pause-state column exists on `letter_deliveries` today; P699 `step_progress` and P721 `cap_steps_completed` are aggregate counters, not resume points). Medium reversibility (feature-flaggable; migration is additive nullable column, rollback-safe). Medium decision density (banner data source: `useOpenLiveInvite` realtime vs. `useActiveSession` 30s poll — these are distinct; banner placement; accept-vs-defer semantics; whether to add a new column or repurpose existing progress state — `/architect` decides).

## Solution

**Reuse:**
- **UI shell only** — the visual layout/placement pattern of `ActiveSessionBanner` (`src/app/components/session/active-session-banner.tsx`). Not its data source: `ActiveSessionBanner` consumes `useActiveSession` (30s poll), which is the wrong feed for invites.
- **Data source** — `useOpenLiveInvite` hook (realtime subscription, `src/app/hooks/useOpenLiveInvite.ts`). Already drives the inbox invite path (P703/P730). May need extension (inviter avatar, delivery context) — `/architect` picks extend-vs-sibling.
- **Backend** — `clarity_live_invite` table, inbox delivery flow (P703/P730). No schema changes to this table.

This spec adds: author trigger on the per-recipient surface, **new pause-state column on `letter_deliveries`** (no existing column serves this), one-outstanding-invite guard, pause/resume hydration on letter re-entry.

1. **Author trigger:** From the sender's letter-progress view (inbox row or results page for a specific recipient), add an action: *Start Clarity Live with this reader now*. Creates a `clarity_live_invite` row tied to the delivery.
2. **Receiver banner:** Reuse the global `ActiveSessionBanner` surface (already rendered on all non-/live pages). When `useOpenLiveInvite` reports a pending invite, show inviter avatar + name with copy *"{senderName} is inviting you to Clarity"* and primary *Join* / secondary *Later*. Delivery is realtime via the existing `clarity_live_invite` subscription.
3. **Pause/resume:** When the receiver accepts, record the current story index on the delivery, open /live (leveraging existing P703 / P733 preload for registered users). When /live completes, redirect back into the letter at the saved position with a brief *Welcome back* affordance.
4. **Decline/defer:** If the receiver chooses *Later*, dismiss the banner locally but leave the invite open so they can still find it in inbox after the letter.
5. **Cancel:** Author can cancel an outstanding invite from the same surface that created it.

## Risks / Non-Goals

### Risks
- **Reuse-vs-fork for invite hook.** `useOpenLiveInvite` currently returns author name + story title; this spec needs inviter avatar + `targetListenerId`/delivery context too. Extending the hook vs. adding a sibling hook are both viable. **Mitigation:** `/architect` picks one with an explicit trade-off note.
- **Pause/resume correctness under edge cases.** Receiver closes the tab mid-/live, reloads mid-letter, or has multiple tabs open. **Mitigation:** persist saved-position on the delivery row, not in memory; reconciliation happens on letter-reader mount.
- **Invite spam.** Author re-triggers multiple times. **Mitigation:** one outstanding invite per delivery — re-trigger reuses / resets the existing row.

### Non-Goals
- **Do NOT** extend injection to unverified guests in this spec — F3 (P747) handles that path after this primitive is validated.
- **Do NOT** build pre-configured injection points (letter-template setting "force /live after story 3") — observe first, codify later.
- **Do NOT** change P703 or P733 behavior — letter-sourced /live preload is consumed as-is here.
- **Do NOT** ship a cohort / workshop / group-pacing surface — that is F2's territory (P746) and even there, not workshop orchestration.
- **Do NOT** remove or replace the inbox-based invite flow — this is an additive surface, not a replacement.

## Done-When

- [ ] Registered receiver reading a letter sees the banner in realtime when the author triggers an invite for that delivery
- [ ] Accepting the banner opens /live preloaded from letter data (via existing P703/P733 path); the letter reader component does not unmount — its state (current story index, scroll position) survives the /live round-trip
- [ ] Completing /live returns the receiver to the same letter at the same story index they were on when they accepted
- [ ] Deferring the banner dismisses it locally and the invite remains findable via inbox
- [ ] Author can cancel a pending invite; the banner disappears on the receiver side in realtime
- [ ] Only one outstanding invite exists per delivery at any time
- [ ] Unverified guest on a public letter sees **no** injection banner (guest path is explicitly out of scope here)

## UX Notes

**Banner surface:** Reuses the existing global `ActiveSessionBanner` slot (already rendered above all non-/live pages, including letter reader). No new placement logic. Copy swaps when an invite is pending vs. an active session is in progress.

**Banner states:**
- *Pending*: inviter avatar + `{senderName} is inviting you to Clarity` — primary *Join*, secondary *Later*
- *Dismissed*: hidden, restored if the author re-triggers
- *Cancelled by author*: banner disappears in realtime, no persistent UI

**Pause/resume UX:**
- Accepting transitions the letter reader into a *paused* state (not closed). On return from /live, the reader hydrates at `saved_story_index` with a brief *Welcome back* affordance.

**Author trigger:**
- Lives on the sender-side surface where a specific recipient is identifiable (inbox row for a `recipient_in_progress` delivery; letter results page drilled into one recipient).
- Disabled if the receiver has not yet opened the letter, or if a pending invite already exists for that delivery.

## Acceptance Criteria

- [ ] Author can start a /live session for an identified registered recipient from a per-recipient surface
- [ ] Receiver sees the banner while actively reading the letter
- [ ] Accept → /live runs with preloaded positions → return to letter at saved position
- [ ] Defer → banner dismisses locally; invite persists
- [ ] Cancel → banner disappears on receiver side
- [ ] Exactly one outstanding invite per delivery
- [ ] Regression: inbox-based invite flow (P703) continues to work unchanged for letters the receiver has already completed

## UI Contract

| Element | Value | Context |
|---------|-------|---------|
| Banner title | `{senderName} is inviting you to Clarity` | Global banner, when invite pending |
| Inviter avatar | `GravatarAvatar` — `name`, `photoUrl`, `avatarColor`, `isPledger` from inviter profile | Left of banner title |
| Primary button | `Join` | Banner |
| Secondary button | `Later` | Banner |
| Author trigger label | `Start Clarity Live now` | Sender per-recipient surface |
| Author trigger disabled tooltip | `Invite already pending` | When invite exists |
| Return affordance on letter re-entry | `Welcome back — continuing your letter` | After /live completes |
| Delivery mechanism | Supabase Realtime (existing `clarity_live_invite` subscription) | No polling |

## Resolved Decisions

| # | Source | Finding | Resolution | Rationale |
|---|--------|---------|-----------|-----------|
| 1 | /challenge-prd | [BLOCK] Strategic misalignment — spec appears to contradict H-LetterAsProduct (async letter scaling) by making /live synchronous mid-letter | **Dissolved.** H-LetterAsProduct wording was ambiguous. Reread: letter pre-collects data; /live with the story author is the flip mechanism (paraphrase + verified understanding). "Async" in hypothesis refers to letter-reading being async-from-author, not to the flip happening async. Author-present-in-/live is structural. | P745 is the natural completion of the letter→/live pipeline, not facilitator-mode creep. Hypotheses.md and lean-canvas.md updated to eliminate the ambiguity that drove this finding. |
| 2 | /challenge-prd | [BLOCK] Schema claim — spec said "no schema change beyond P703" but no `saved_story_index` column exists on `letter_deliveries` | **Accepted.** Appetite and Solution sections now explicitly acknowledge a new pause-state column is required. `/architect` decides: new column vs. repurpose `step_progress`/`cap_steps_completed`. | Verified via grep: 52 migrations reference `letter_deliveries`, zero reference `saved_story_index`/`story_index`/`current_story`/`reading_position`/`last_story`. Migration is additive nullable — rollback-safe. |
| 3 | /challenge-prd | [BLOCK] Reuse conflation — `ActiveSessionBanner` uses `useActiveSession` (30s poll, P743), spec claimed it was realtime | **Accepted.** Solution "Reuse" block now separates UI shell reuse (layout pattern only) from data source (`useOpenLiveInvite` realtime, not `useActiveSession` poll). | These are distinct data sources today. The banner's visual placement is reusable; its feed is not. |
| 4 | /challenge-prd | [BLOCK] Untestable done-when — "without leaving the letter URL's logical flow" is not mechanically verifiable | **Accepted.** Acceptance criterion now reads: "the letter reader component does not unmount — its state (current story index, scroll position) survives the /live round-trip." | Two developers would now build the same thing; testable via component mount lifecycle assertion. |
| 5 | /challenge-prd | [NOTE] Strategic docs internal inconsistency surfaced by this spec — hypotheses.md and lean-canvas.md flywheel wording implied letter-alone-flips, contradicting definitions.md (badge auto-certified from /live only) | Resolved via 3 doc edits (2026-04-18): hypotheses.md H-LetterAsProduct bet rewritten; lean-canvas.md primary instrument framing rewritten (professional facilitator vs. story author distinction); lean-canvas.md primary flywheel now includes /live step between letter completion and badge. | Docs now agree: letter pre-collects data; /live with story author is where the flip and badge happen. |

## Technical Architecture

### Technical Analysis

**Current state — relevant files and components:**

**Letter reading surface (receiver side):**
- `src/app/pages/letter-reading-page.tsx` — route `/letter/:id`, wrapped in `<ClarityLandingLayout compact>` (nav: logo + avatar only, no chrome-free). Page holds `viewState: 'cover' | 'reading' | 'complete'` and `delivery` state.
- `src/app/hooks/useLetterReadingState.ts` — manages `currentStoryIndex` (the in-memory reading position). `loadLocalState()` restores from localStorage on mount. `currentStoryIndex` is the resume-point coordinate.
- `src/app/components/letters/letter-flow-content.tsx` — renders the per-story reading flow.
- `src/app/layouts/clarity-landing-layout.tsx` — renders `<ActiveSessionBanner />` inside `<main>` when `hasActiveSession && !isLivePage` (line 83). The letter reading route is NOT chrome-free, so the banner slot is live.

**Banner and session machinery (both sides):**
- `src/app/components/session/active-session-banner.tsx` — visual shell driven by `useLiveSession()` context (`activeSessionCode`, `activeSessionPartnerName`). Does NOT use `useOpenLiveInvite`. No realtime subscription — depends on 30s poll via `useActiveSession`.
- `src/hooks/use-active-session.ts` — 30s poll + visibility-change handler. Wrong data source for P745 invite delivery.
- `src/app/hooks/useOpenLiveInvite.ts` — realtime hook. Returns `{ invite: OpenLiveInvite | null, loading: boolean }`. Subscribes to `clarity_live_invites` table via `subscribeToLiveInvites()`. Current `OpenLiveInvite` shape: `{ sessionId, code, authorName, storyTitle, closedAt }`. Missing for P745: `inviterPhotoUrl`, `inviterAvatarColor`, `inviterIsPledger`, `deliveryId`.
- `src/app/data/api.ts` — `createLiveInvite(sessionId, targetUserId)`, `cancelLiveInvite(sessionId)`, `getOpenLiveInviteForUser(userId)`, `subscribeToLiveInvites(userId, onInsert, onUpdate)`.

**Author-trigger surface (sender side):**
- `src/app/components/letters/start-clarity-session-button.tsx` — existing `StartClaritySessionButton` component. Props: `{ senderId, receiverId, letterId, storyId, senderName }`. Currently: creates session → creates invite → navigates sender to `/live/:code`. Does NOT accept a `deliveryId` prop.
- `src/app/components/letters/story-walk.tsx` — renders `StartClaritySessionButton` (line 170). This is the only call site today.
- `src/app/pages/letter-results-page.tsx` — results page where `StoryWalk` is rendered; the per-recipient drill-down is accessible here. No direct `StartClaritySessionButton` in results page — it passes through `StoryWalk`.

**Invite consumers — all current users of `useOpenLiveInvite`:**
1. `src/app/hooks/useOpenLiveInvite.ts` — the hook itself
2. `src/app/pages/letters-page.tsx` — calls `useOpenLiveInvite()`, passes `openInvite` to `<InboxTab>`
3. `src/app/components/layout/bottom-nav.tsx` — calls `useOpenLiveInvite()`, uses `invite` as a boolean (badge count: `invite ? 1 : 0`)
4. `src/app/components/layout/simple-navigation.tsx` — calls `useOpenLiveInvite()`, uses `invite` as a boolean (badge count)
5. `src/app/components/letters/inbox-tab.tsx` — receives `openInvite?: OpenLiveInvite | null` as prop (passed from letters-page)
6. Test files: `src/tests/p703-use-open-live-invite.test.ts`, `src/tests/p730-inbox-live-invite-realtime.test.tsx`, `src/tests/p734-letter-live-banner.test.tsx`

**`letter_deliveries` table — confirmed physical columns (from migrations):**

| Column | Added by |
|--------|---------|
| `id` | P581 |
| `letter_id` | P581 |
| `receiver_email` | P581 |
| `receiver_profile_id` | P581 |
| `invitation_token` | P581 |
| `invitation_expires_at` | P581 |
| `access_token_expires_at` | P581 |
| `status` | P581 — `'sent' | 'opened' | 'in_progress' | 'completed'` |
| `stories_rated` | P581 |
| `opened_at` | P581 |
| `completed_at` | P581 |
| `created_at` | P581 |
| `receiver_name` | P651 |
| `read_at` | P660 |

No pause-state column exists. `steps_completed` and `total_steps` are computed fields returned only by `get_inbox_items()` and `get_deliveries_with_progress()` RPCs — they are **not physical columns** on the table.

**`clarity_live_invites` table — no schema change required for P745.** Existing `session_id`, `target_user_id`, `closed_at` columns are sufficient. The one-outstanding-invite guard is already enforced at the app level in `StartClaritySessionButton` (checks `getOpenInviteForSender` before allowing create).

---

### Architecture Decisions

**Decision 1: Pause-state column on `letter_deliveries`**

- **Chosen:** New `saved_story_index INTEGER` column on `letter_deliveries`, nullable, no default, **with CHECK constraint** `CHECK (saved_story_index IS NULL OR (saved_story_index >= 0 AND saved_story_index <= 999))`.
- **Rationale:** `steps_completed` (P699) and its cap variant (P721) are computed aggregates derived from `stories_rated` and `points_positioned` counts — they answer "how many steps done total," not "which story were you on when you paused." Repurposing either would require reverse-engineering a discrete index from a count, which breaks when a receiver revisits stories. `saved_story_index` is a direct integer resume point — it writes once on accept, reads once on return. The CHECK constraint is required per Security Review (existing receiver UPDATE RLS on `letter_deliveries` would otherwise permit out-of-bounds values).
- **Trade-off:** One new column + CHECK vs. zero schema change. The column is nullable so existing deliveries carry NULL (no pause-state recorded). No new RLS policy required — existing `letter_deliveries` policies (`Deliveries readable by sender or receiver`, `Receiver can update delivery status`) cover the new column.
- **Alternative rejected:** Repurpose `step_progress` / `cap_steps_completed` — these are not physical columns (they exist only as RPC output). The physical table has no step-granular field at all; the only available progress signal is `stories_rated` (integer count). Using `stories_rated` as a proxy for the resume index would corrupt progress tracking on return.
- **Migration idempotency:** `ADD COLUMN IF NOT EXISTS saved_story_index INTEGER` — safe on re-run. CHECK constraint added via separate `ALTER TABLE ... ADD CONSTRAINT IF NOT EXISTS` (Postgres 9.6+ supports `IF NOT EXISTS` on constraints via `DO $$` block for older compat).

**Decision 2: Invite hook extension vs. sibling**

- **Chosen:** Extend `useOpenLiveInvite` — add `inviterPhotoUrl: string | null`, `inviterAvatarColor: string | null`, `inviterIsPledger: boolean` to the `OpenLiveInvite` interface; add `deliveryId: string | null` (the delivery targeted by the invite, needed for resume). Update the initial fetch (`getOpenLiveInviteForUser`) and the realtime INSERT handler to pull these fields from `clarity_sessions` (which already joins `profiles` via `creator_name`).
- **Rationale:** All five consumers use the hook as a boolean presence check or read `authorName`/`code`. None are broken by additive fields — TypeScript optional fields with `| null` are backward-compatible. Adding a sibling hook would require every consumer (`bottom-nav`, `simple-navigation`, `letters-page`) to call two hooks and combine results, or require a new context layer. Extension is the lower-coupling path.
- **Trade-off:** The `getOpenLiveInviteForUser` query and the realtime INSERT handler must both fetch inviter profile data. The INSERT handler already does a secondary `clarity_sessions` fetch; extending it to also join `profiles` (via `creator_id` or profile lookup by `creator_name`) adds one extra join.
- **Consumers affected:**
  - `bottom-nav.tsx` — uses `invite` as boolean only. No change required.
  - `simple-navigation.tsx` — uses `invite` as boolean only. No change required.
  - `letters-page.tsx` — passes `openInvite` to `InboxTab`. No change required.
  - `inbox-tab.tsx` — receives `OpenLiveInvite | null` as prop. No change required (additive fields are ignored).
  - New `LetterLiveBanner` component — consumes the extended fields for avatar display.
- **Alternative rejected:** Sibling hook `useLetterLiveInvite` — doubles subscription overhead (two realtime channels for same table per user), requires all render-tree consumers to reconcile two hooks.

**Decision 3: No-unmount mechanism for letter reader**

- **Chosen:** Overlay/modal approach — the /live session renders in a full-screen overlay (`position: fixed, inset-0, z-50`) placed inside `LetterReadingPage`'s render tree. The letter reader remains mounted beneath it. On accept, `LetterReadingPage` lifts state to `viewState: 'paused'` and renders `<LiveOverlay sessionCode={code} />` on top. On /live completion, `LiveOverlay` calls a prop callback, `viewState` returns to `'reading'`, and the overlay unmounts.
- **Rationale:** `LetterReadingPage` already owns `viewState` (`'cover' | 'reading' | 'complete'`). Adding `'paused'` is a natural extension. `useLetterReadingState` holds `currentStoryIndex` in component state — it persists for as long as `LetterReadingPage` is mounted. The overlay approach keeps the URL at `/letter/:id` throughout (no navigation), so `currentStoryIndex` is never flushed by React router remounting the page. It also avoids complexity of nested routes with persistent layouts, which would require App.tsx refactoring and a shared outlet.
- **Trade-off:** The `/live` session runs in an overlay, not its own route. This means: (a) browser back button during `/live` does not navigate away — the overlay is dismissed by its own UI controls only; (b) deep-linking to `/live/:code` while in a letter is not supported (acceptable — the existing invite flow navigates to `/live/:code` separately for non-letter cases). The overlay carries the existing `clarity-live-page` content via an iframe or component import — component import is preferred to avoid iframe auth complications.
- **Concrete files involved:**
  - `src/app/pages/letter-reading-page.tsx` — add `'paused'` to `ViewState`, add `liveSessionCode` state, render `<LetterLiveOverlay>` when `viewState === 'paused'`
  - New `src/app/components/letters/letter-live-overlay.tsx` — full-screen overlay wrapper that imports and renders the /live session content
- **Alternative rejected:** Nested route with persistent layout — requires `App.tsx` outlet refactoring and a new shared layout shell; blast radius extends to App router. Rejected: over-engineered for a single-surface use case.
- **Alternative rejected:** Portal-based surface — React portals solve DOM placement but do not prevent `LetterReadingPage` from unmounting on navigation. The problem is React Router unmounting on route change, not DOM tree position.
- **Alternative rejected:** Suspend-and-hide (CSS `display: none`) — `useLetterReadingState` survives because it is in state, but scroll position recovery is unreliable across `display: none` toggles on mobile (particularly with virtual scroll). The overlay approach keeps the reader in the normal flow while visually covered.

**Decision 4: One-outstanding-invite guard**

- **Chosen:** App-level check — reuse the existing `getOpenInviteForSender(receiverId)` pattern already in `StartClaritySessionButton`. The author-trigger button for the mid-letter surface checks for an existing open invite before allowing create; if one exists, the button is disabled with tooltip `"Invite already pending"`.
- **Rationale:** A DB unique constraint on `(session_id, target_user_id)` would only prevent duplicate rows for the same session, not duplicate invites across sessions. The correct semantic is "one open invite per delivery" — enforced at the application layer by checking `closed_at IS NULL` before inserting. This pattern is already proven in `StartClaritySessionButton`.
- **Trade-off:** The app-level check has a race window (two rapid clicks by author). Acceptable: the author surface is a single-user action on a per-recipient row, making concurrent double-trigger effectively impossible in practice. A DB constraint would require a partial unique index and migration complexity for minimal gain.

**Decision 5: Author-trigger surface placement**

- **Chosen:** `StartClaritySessionButton` extended with a `deliveryId?: string` prop. When `deliveryId` is present, the component operates in "mid-letter" mode: the label becomes `"Start Clarity Live now"`, disabled tooltip reads `"Invite already pending"`, and on trigger it writes `saved_story_index` is NOT set by the author — it is set by the receiver on accept. The author trigger is added to `src/app/components/letters/story-walk.tsx` (the one call site that renders `StartClaritySessionButton`) via a new optional `deliveryId` prop threaded from `letter-results-page.tsx` when a specific delivery is in scope.
- **Rationale:** `story-walk.tsx` already has all the props needed (`senderId`, `receiverId`, `letterId`, `storyId`, `senderName`). Adding `deliveryId` threads naturally. The results page drill-down by delivery already identifies the target receiver — no new routing needed.
- **Files:**
  - `src/app/components/letters/start-clarity-session-button.tsx` — add `deliveryId?: string` prop; `"mid-letter"` mode label + tooltip
  - `src/app/components/letters/story-walk.tsx` — thread `deliveryId` prop
  - `src/app/pages/letter-results-page.tsx` — pass `deliveryId` when a specific delivery is selected

**Decision 6: Session + invite atomicity (pre-flight verification)**

- **Chosen:** Keep the existing two-step flow (create session → create invite) from P703. Before writing client code, verify `live_invites_creator_insert` in `supabase/migrations/20260414100001_p703_letter_sourced_live.sql` enforces `clarity_sessions.creator_profile_id = auth.uid()` — this closes the TOCTOU window by re-deriving ownership from `session_id` at invite INSERT time.
- **Rationale:** A SECURITY DEFINER RPC that creates both rows atomically is safer but adds migration + API surface. The existing RLS policy, if it checks creator ownership at invite INSERT, already makes the two-step flow safe (the server re-verifies authorship on the second call). Preferring the existing pattern keeps P745 purely additive.
- **Trade-off:** Pre-flight verification cost (5 min) vs. new RPC cost (migration + deploy). If pre-flight finds the RLS policy does NOT check creator ownership at invite INSERT, swap to a SECURITY DEFINER RPC (`create_letter_live_invite(delivery_id)` that returns `session_code`).
- **Decision deferred to dev phase:** the verification check is a build-step prerequisite, not a standalone design decision.
- **Files (conditional):** if RPC path is needed, add `supabase/migrations/20260418193000_p745_create_letter_live_invite_rpc.sql` and update `src/app/data/api.ts` to call the RPC instead of two separate inserts.

---

### Security Review

**RLS Policies:**

- ✅ **`clarity_live_invites` INSERT** — `live_invites_creator_insert` in `supabase/migrations/20260414100001_p703_letter_sourced_live.sql` requires `auth.uid() = clarity_sessions.creator_profile_id`; if `source_letter_id` is set, validates `target_user_id ∈ letter_deliveries.receiver_profile_id` for that letter. Author cannot INSERT invite for arbitrary user.
- ✅ **`clarity_live_invites` SELECT (receiver)** — `live_invites_recipient_select` gates on `auth.uid() = target_user_id`. Realtime filtered to current user's rows only.
- ✅ **`clarity_live_invites` SELECT (creator)** — `live_invites_creator_select` (`20260415150000_p703_invite_creator_select.sql`) allows session creator to read invite state for button disabling. No cross-user leakage.
- ⚠️ **`clarity_live_invites` UPDATE — `WITH CHECK (true)` is unrestricted** — `live_invites_participant_update` has `WITH CHECK (true)`. Any participant who passes the USING gate can write any column, including resetting `closed_at` from NOT NULL to NULL — reopening a closed invite and bypassing the one-open-invite partial unique index. **Mitigation (required in this build):** tighten `WITH CHECK` to prevent re-opening: `WITH CHECK (closed_at IS NOT NULL OR (OLD.closed_at IS NULL))`. Added as a new migration step in the Build Sequence.
- ⚠️ **New `saved_story_index` column on `letter_deliveries` — no bounds check** — existing `letter_deliveries` UPDATE policy (`Receiver can update delivery status`) allows receiver to set `saved_story_index` to an out-of-bounds integer (e.g., 9999 or negative). **Mitigation (required):** add DB `CHECK (saved_story_index IS NULL OR (saved_story_index >= 0 AND saved_story_index <= 999))` in the P745 migration. Application code also validates against the letter's actual story count on letter-reader mount (defense in depth).
- ✅ **`letter_deliveries` INSERT** — `WITH CHECK (false)` — deliveries only created via SECURITY DEFINER RPCs. No new delivery surface here.
- ✅ **`letter_deliveries` SELECT** — existing sender/receiver SELECT grants cover the new column; no new grant needed.
- ✅ **One-outstanding-invite guard enforced at DB** — unique partial index `idx_live_invites_one_open_per_user ON clarity_live_invites(target_user_id) WHERE closed_at IS NULL` is per-user. Stronger than app-level. Note: Decision 4's app-level check still applies as UX (button disable) but the DB guarantee is the authority.

**Authentication:**

- ✅ **Author trigger requires auth + verified host** — `clarity_sessions_verified_host_insert` requires `auth.uid() IS NOT NULL AND is_verified = true`. Session creation gates invite creation.
- ✅ **Receiver banner filters to `auth.uid()`** — `useOpenLiveInvite` passes `user.id` from `useAuth()`. Realtime column-filtered on `target_user_id`. Null user → `invite: null`.
- ✅ **Unverified guest exclusion is structural** — `useOpenLiveInvite` requires authenticated session to subscribe. Guest receives `null`. Non-goal (P747) enforced by auth gate, not feature flag.

**Authorization:**

- ✅ **Author scoped to own letter's recipients** — `live_invites_creator_insert` joins `clarity_sessions.source_letter_id → letter_deliveries.letter_id` AND checks `target_user_id` is that letter's receiver. Cannot invite non-recipients.
- ✅ **Receiver accept/defer scoped** — accept path goes through `complete_clarity_session`, which checks caller is `target_listener_id`, `creator_profile_id`, or `joiner_profile_id`.
- ✅ **Author cancel** — `live_invites_participant_update` USING allows session creator. Realtime propagates closure to receiver banner.
- ✅ **`complete_clarity_session` service_role bypass** — `auth.uid() IS NULL` path (`20260415130000_p703_complete_session_closes_invites.sql`) accepted for E2E/server use; documented trust boundary. P745 does not expand service_role usage.

**Input Validation:**

- ⚠️ **Session + invite atomicity window** — existing flow in `StartClaritySessionButton` creates `clarity_sessions` first (sets `source_letter_id`), then `clarity_live_invites` in a second call. If a client manipulates `session_id` between calls, there is a race/TOCTOU window where an invite could be attached to a session the author does not own. **Mitigation (required):** the INSERT RLS on `clarity_live_invites` evaluates `clarity_sessions.creator_profile_id = auth.uid()` before `source_letter_id` checks — verify this in the existing policy body. If confirmed, the two-step flow is safe (the RLS check re-derives ownership from `session_id`). If not confirmed, wrap session+invite creation in a SECURITY DEFINER RPC. **Decision deferred to dev phase:** verify policy order by reading `20260414100001_p703_letter_sourced_live.sql` before writing client code; if ambiguous, add RPC.
- ⚠️ **`saved_story_index` bounds** — see RLS ⚠️ above. Mitigation via CHECK constraint + app-level bounds validation.
- ✅ **Banner state transitions server-authoritative** — Accept/Later/Cancel all resolve to `closed_at` on the invite row. "Dismissed locally" (Later) is pure client state and explicitly correct (invite remains in inbox).

**Data Protection:**

- ✅ **Inviter avatar/profile exposure** — fields come from sender's public profile, already readable by authenticated users via P703 flow. No new exposure.
- ✅ **Realtime + RLS** — Supabase Realtime applies RLS to authenticated channel subscriptions. `REPLICA IDENTITY FULL` set on `clarity_live_invites` (`20260415140000_p703_invites_replica_identity.sql`). UPDATE events with `closed_at` reach only intended recipient.
- ⚠️ **Spec uses wrong table name in body text** — spec references `letter_deliveries` in Problem, Appetite, Solution, and Resolved Decisions. Actual table is `letter_deliveries`. Documentation error only; runtime unaffected. **Mitigation (applied):** corrected in this pass.
- ✅ **`saved_story_index` non-sensitive** — integer index into letter's story list. No content/rating/prediction leakage.

---

### Implementation Approach

**Worktree recommended:** This spec touches 7+ files across schema, hooks, components, and routing. Isolation in a worktree prevents conflicts with concurrent work on `main`.

#### Build Sequence

0. **Pre-flight (Decision 6):** read `supabase/migrations/20260414100001_p703_letter_sourced_live.sql` and confirm `live_invites_creator_insert` policy checks `clarity_sessions.creator_profile_id = auth.uid()` at INSERT. If confirmed → keep two-step flow. If not → add SECURITY DEFINER RPC migration (`20260418193000_p745_create_letter_live_invite_rpc.sql`) and adjust step 2 to call the RPC.
1. **Migration** — single migration file `supabase/migrations/20260418190000_p745_letter_pause_state.sql` doing THREE things atomically:
   - `ALTER TABLE letter_deliveries ADD COLUMN IF NOT EXISTS saved_story_index INTEGER;`
   - Add CHECK constraint: `saved_story_index IS NULL OR (saved_story_index >= 0 AND saved_story_index <= 999)` (idempotent via `DO $$ ... IF NOT EXISTS ... $$`)
   - **RLS hardening (Security Review ⚠️):** drop and recreate `live_invites_participant_update` with tightened `WITH CHECK`: `WITH CHECK (closed_at IS NOT NULL OR OLD.closed_at IS NULL)` — prevents re-opening a closed invite and bypassing the partial unique index
2. **API layer** — add `saveLetterPauseState(deliveryId, storyIndex)` function in `letters-service.ts` (validates `storyIndex` against letter's actual story count before UPDATE); extend `getOpenLiveInviteForUser` + realtime INSERT handler in `api.ts` to return inviter avatar fields + `deliveryId`
3. **Hook** — extend `OpenLiveInvite` interface in `useOpenLiveInvite.ts` with avatar fields + `deliveryId`; update `mapRecord()` and `mapRaw()` accordingly
4. **New component: `LetterLiveBanner`** — invite-pending banner in `src/app/components/letters/letter-live-banner.tsx`. Renders inviter avatar (`GravatarAvatar`), title `"{senderName} is inviting you to Clarity"`, primary `Join`, secondary `Later`
5. **New component: `LetterLiveOverlay`** — full-screen overlay wrapper in `src/app/components/letters/letter-live-overlay.tsx`. Imports and renders the /live session, calls `onComplete` callback when session ends
6. **`letter-reading-page.tsx`** — add `'paused'` to `ViewState`; add `liveSessionCode` state; on invite accept: call `saveLetterPauseState(deliveryId, currentStoryIndex)`, set `viewState: 'paused'`; render `<LetterLiveBanner>` when invite pending; render `<LetterLiveOverlay>` when paused; on overlay complete: hydrate reader at `saved_story_index` with "Welcome back — continuing your letter" toast
7. **`start-clarity-session-button.tsx`** — add `deliveryId?: string` prop; label/tooltip swap in mid-letter mode
8. **`story-walk.tsx`** and **`letter-results-page.tsx`** — thread `deliveryId`

#### Files to Create

- `src/app/components/letters/letter-live-banner.tsx` — invite-pending banner (inviter avatar + title + Join/Later)
- `src/app/components/letters/letter-live-overlay.tsx` — full-screen /live overlay for letter pause state

#### Files to Modify

- `supabase/migrations/20260418190000_p745_letter_pause_state.sql` — `saved_story_index` column
- `src/app/data/api.ts` — extend `getOpenLiveInviteForUser` + realtime INSERT handler to return inviter profile fields + `deliveryId`
- `src/app/data/letters-service.ts` — add `saveLetterPauseState(deliveryId: string, storyIndex: number): Promise<void>`
- `src/app/hooks/useOpenLiveInvite.ts` — extend `OpenLiveInvite` interface + `mapRecord()` + `mapRaw()`
- `src/app/pages/letter-reading-page.tsx` — `ViewState` extension, invite banner render, overlay render, pause/resume state machine
- `src/app/components/letters/start-clarity-session-button.tsx` — `deliveryId` prop + mid-letter mode
- `src/app/components/letters/story-walk.tsx` — thread `deliveryId` prop
- `src/app/pages/letter-results-page.tsx` — pass `deliveryId` to `StoryWalk` when specific delivery is in scope

#### Migration

- **File:** `supabase/migrations/20260418190000_p745_letter_pause_state.sql`
- **Contents (three idempotent operations):**
  1. `ALTER TABLE letter_deliveries ADD COLUMN IF NOT EXISTS saved_story_index INTEGER;` — nullable, no default
  2. Bounds CHECK constraint (required by Security Review):
     ```sql
     DO $$ BEGIN
       IF NOT EXISTS (
         SELECT 1 FROM pg_constraint
         WHERE conname = 'letter_deliveries_saved_story_index_range'
       ) THEN
         ALTER TABLE letter_deliveries
           ADD CONSTRAINT letter_deliveries_saved_story_index_range
           CHECK (saved_story_index IS NULL OR (saved_story_index >= 0 AND saved_story_index <= 999));
       END IF;
     END $$;
     ```
  3. Tighten `live_invites_participant_update` to prevent re-opening closed invites (Security Review ⚠️):
     ```sql
     DROP POLICY IF EXISTS live_invites_participant_update ON clarity_live_invites;
     CREATE POLICY live_invites_participant_update ON clarity_live_invites
       FOR UPDATE
       USING (auth.uid() IN (
         target_user_id,
         (SELECT creator_profile_id FROM clarity_sessions WHERE id = session_id)
       ))
       WITH CHECK (closed_at IS NOT NULL);
     ```
     Note: `WITH CHECK (closed_at IS NOT NULL)` enforces that any UPDATE must leave `closed_at` set; the only way to write a row is to close it. Opening an invite is INSERT-only (creator path), not UPDATE. This prevents the reopen-vector without requiring OLD/NEW row diffing (Postgres RLS WITH CHECK runs on the NEW row only).
- **Rollback note:**
  - `ALTER TABLE letter_deliveries DROP COLUMN IF EXISTS saved_story_index;` — safe (no downstream FK references, no RPC exposes this column yet)
  - `DROP CONSTRAINT IF EXISTS letter_deliveries_saved_story_index_range` — safe
  - Restoring old P703 `live_invites_participant_update` policy: `WITH CHECK (true)` — acceptable rollback since the attack surface was pre-existing and P745 merely tightens it

## Test Coverage Strategy

**Files generated:** 5 automated + 1 UAT (47 tests + 15 manual scenarios)

**What's tested:**

| Area | Test type | Why |
|------|-----------|-----|
| `OpenLiveInvite` reducer — 4 new fields through all action types | Unit | Shared interface with 5 consumers; reducer bug silently breaks all |
| `OpenLiveInvite` backward-compat — boolean presence check | Unit | `bottom-nav` and `simple-navigation` use `invite ? 1 : 0` |
| `useOpenLiveInvite` INSERT handler — avatar fields from `clarity_sessions` join | Unit (hook) | Extension adds a secondary fetch; wrong field mapping is silent |
| `saveLetterPauseState` bounds `[0, 999]` | Unit | App-layer validation must mirror the DB CHECK constraint |
| `saveLetterPauseState` error propagation | Unit | DB errors must not be swallowed silently |
| `saved_story_index` column existence | Integration (P270) | Migration canary — catches missing column before /dev |
| `saved_story_index` CHECK constraint (`-1` and `1000` rejected) | Integration | DB-level enforcement verified independently of app code |
| `live_invites_participant_update` RLS hardening (closed invite cannot be re-opened) | Integration | Security Review ⚠️ — previously `WITH CHECK (true)` allowed reopen |
| Realtime banner delivery (receiver sees banner without page reload) | E2E two-party | P703/P730 history: realtime is the most failure-prone layer |
| Exact UI Contract strings (`Join`, `Later`, `Start Clarity Live now`, `Invite already pending`, `Welcome back — continuing your letter`) | E2E | Tests fail immediately if copy changes without updating spec |
| Guest exclusion (no banner for unauthenticated user) | E2E | Spec's critical security boundary — structural gate proven |
| P703 regression (inbox invite still works) | E2E | Explicit done-when criterion |
| One-outstanding-invite guard (partial unique index) | E2E | DB-level constraint tested directly |
| ARIA live region for banner | A11y | Screen readers only announce if `aria-live` is set |
| Keyboard navigation for all 4 interactive elements | A11y | Tab-reachable + Enter-activatable |

**What's NOT tested:**

| Area | Reason |
|------|--------|
| `LetterLiveOverlay` internals | Covered by existing P703/P733 tests |
| /live session flow within overlay | P703 E2E tests cover full session lifecycle; P745 concern is entry/exit |
| `StoryWalk`/`LetterResultsPage` prop threading | Pure pass-through `deliveryId?: string` — no branching logic to test |
| Visual regression (avatar, banner layout) | No baseline snapshot; covered by UAT-15 manual |
| Scroll position persistence across overlay | Browser session memory inaccessible in Playwright; manual-only |

**Test pyramid:**
```
        /\
       /  \   13 E2E + 6 A11y
      /    \
     /  6 INT \
    /___________\
   /  22 UNIT   \
```

**Total:** 47 automated tests + 15 UAT scenarios  
**Next step:** `/dev features/p745_letter_hosted_live_injection.md`

## Consistency Check Results

**Check 1: AC Coverage**

| Acceptance Criterion | Build Step |
|----------------------|------------|
| Author can start /live for registered recipient from per-recipient surface | Steps 7–8 (`start-clarity-session-button.tsx` + threading) |
| Receiver sees banner in realtime when author triggers invite | Steps 3–4 + 6 (hook + `LetterLiveBanner` + letter-reading-page) |
| Accept → /live with preload → return to letter at saved position | Steps 2 + 5 + 6 (`saveLetterPauseState` + `LetterLiveOverlay` + reader state machine) |
| Defer → banner dismisses locally; invite persists | Step 6 (`letter-reading-page.tsx` local-dismiss logic) |
| Cancel → banner disappears on receiver side | Covered by existing realtime `closed_at` propagation (no new step needed) |
| Exactly one outstanding invite per delivery | Step 1 (migration partial unique index already exists; step 7 adds app-level guard) |
| Regression: inbox invite flow (P703) unchanged | No new step needed — existing hook extension is additive and backward-compatible |

All ACs map to at least one build step. **No gap.**

**Check 2: UX–Arch Drift**

| UX Decision | Architecture Decision | Conflict? |
|-------------|-----------------------|-----------|
| Banner reuses `ActiveSessionBanner` slot | Decision 2: `LetterLiveBanner` is a NEW component, not `ActiveSessionBanner` reuse | ⚠️ Terminology: UX says "reuses shell"; arch creates new component. Intentional — UX reuses the placement slot and layout pattern, not the component. No conflict. |
| Dismiss is local-only (no server write) | Decision 4: one-outstanding guard is app + DB | No conflict — Later dismisses banner in client state; invite row stays open |
| "Welcome back" toast on return from /live | Step 6 in build sequence | Aligned |
| Overlay doesn't navigate away from `/letter/:id` | Decision 3: full-screen overlay inside `LetterReadingPage` tree | Aligned |

**No blocking conflicts.**

**Check 3: Security Blockers in Build Sequence**

- Security Review ⚠️ (`WITH CHECK (true)` reopen vector) → addressed in Step 1 (migration). Correctly first in sequence.
- Security Review ⚠️ (`saved_story_index` bounds) → addressed in Step 1 (CHECK constraint). Correctly first.
- Security Review ⚠️ (atomicity pre-flight verification) → Step 0 pre-flight before any client code.

Migration (Step 1) contains ALL security hardening. Client code in Steps 2–8 cannot proceed safely until migration is applied. Build sequence is correctly ordered. **No security blocker mis-ordering.**

---

## Implementation Tasks

### T1 — Pre-flight: verify `live_invites_creator_insert` policy atomicity

**Spec ref:** `### Build Sequence` step 0; `### Security Review` Input Validation ⚠️; `### Architecture Decisions` Decision 6

**Files to read (not modify):**
- `supabase/migrations/20260414100001_p703_letter_sourced_live.sql` — read policy body

**Action:** Confirm `live_invites_creator_insert` checks `clarity_sessions.creator_profile_id = auth.uid()`. If confirmed → proceed to T2 with two-step client flow. If NOT confirmed → add migration `supabase/migrations/20260418193000_p745_create_letter_live_invite_rpc.sql` with `SECURITY DEFINER` RPC, and note the change before T2.

**Verify:** Output of policy body clearly shows `auth.uid() = clarity_sessions.creator_profile_id` condition evaluated at INSERT time (or explicit note that RPC path was chosen).

**Dependencies:** None — must run first.

---

### T2 — Migration: pause-state column + security hardening

**Spec ref:** `#### Migration`; `### Security Review` ⚠️ items 1 and 2; `### Architecture Decisions` Decision 1

**Files to create:**
- `supabase/migrations/20260418190000_p745_letter_pause_state.sql`

**Contents (3 idempotent operations):**
1. `ALTER TABLE letter_deliveries ADD COLUMN IF NOT EXISTS saved_story_index INTEGER;`
2. Bounds CHECK constraint `letter_deliveries_saved_story_index_range` (`[0, 999]` or NULL)
3. Drop + recreate `live_invites_participant_update` with `WITH CHECK (closed_at IS NOT NULL)`

**Verify:** Run migration on test DB via `./scripts/migrate.sh`. Confirm:
- `saved_story_index` column exists in `letter_deliveries`
- `INSERT` with `saved_story_index = -1` or `= 1000` is rejected
- `UPDATE clarity_live_invites SET closed_at = NULL WHERE ...` is rejected (RLS CHECK violation)

**Test file refs:** `e2e/integration/p745-migration.spec.ts` (canary: column existence, CHECK constraint, RLS hardening)

**Dependencies:** T1 complete (if RPC path chosen, migration content changes).

---

### T3 — API layer: extend invite fetch + add pause-state save

**Spec ref:** `### Implementation Approach` step 2; `### Architecture Decisions` Decision 2

**Files to modify:**
- `src/app/data/api.ts` — extend `getOpenLiveInviteForUser` + realtime INSERT handler to return `inviterPhotoUrl`, `inviterAvatarColor`, `inviterIsPledger`, `deliveryId`
- `src/app/data/letters-service.ts` — add `saveLetterPauseState(deliveryId: string, storyIndex: number): Promise<void>` with `[0, letter.storyCount - 1]` bounds validation

**Verify:** TypeScript compiles without errors. `saveLetterPauseState(-1, ...)` or `(999+, ...)` throws before hitting DB.

**Dependencies:** T2 (migration must exist; `saved_story_index` column must be present for `letters-service.ts` UPDATE to be valid).

---

### T4 — Hook extension: `OpenLiveInvite` interface + mappers

**Spec ref:** `### Implementation Approach` step 3; `### Architecture Decisions` Decision 2; `### Technical Analysis` — Invite consumers

**Files to modify:**
- `src/app/hooks/useOpenLiveInvite.ts` — add 4 fields to `OpenLiveInvite` interface (`inviterPhotoUrl`, `inviterAvatarColor`, `inviterIsPledger`, `deliveryId`); update `mapRecord()` and `mapRaw()` to populate them

**Verify:** All 5 existing consumers (`bottom-nav.tsx`, `simple-navigation.tsx`, `letters-page.tsx`, `inbox-tab.tsx`, `letter-reading-page.tsx` — future) compile without changes. Unit tests in `src/tests/p745-use-open-live-invite-extension.test.ts` pass.

**Test file refs:** `src/tests/p745-use-open-live-invite-extension.test.ts` (reducer backward-compat + new field mapping)

**Dependencies:** T3 (API layer must return the new fields for hook to map them).

---

### T5 — New component: `LetterLiveBanner`

**Spec ref:** `### Implementation Approach` step 4; `## UI Contract`; `## UX Notes`

**Files to create:**
- `src/app/components/letters/letter-live-banner.tsx`

**Contents:**
- Props: `{ invite: OpenLiveInvite; onJoin: () => void; onLater: () => void }`
- Renders: `GravatarAvatar` (name + photoUrl + avatarColor + isPledger) + `"{senderName} is inviting you to Clarity"` + primary `Join` button + secondary `Later` button
- `aria-live="polite"` region for screen-reader announcement

**Verify:** Component renders without TypeScript errors. A11y: keyboard-navigable (Tab reaches both buttons, Enter activates). Snapshot or manual check matches `## UI Contract` strings exactly.

**Test file refs:** `e2e/a11y/p745-accessibility.spec.ts` (ARIA live region + keyboard nav)

**Dependencies:** T4 (needs extended `OpenLiveInvite` type).

---

### T6 — New component: `LetterLiveOverlay`

**Spec ref:** `### Implementation Approach` step 5; `### Architecture Decisions` Decision 3

**Files to create:**
- `src/app/components/letters/letter-live-overlay.tsx`

**Contents:**
- Props: `{ sessionCode: string; onComplete: () => void }`
- Full-screen overlay (`position: fixed; inset: 0; z-index: 50`)
- Imports and renders the existing /live session content (component import, not iframe)
- Calls `onComplete` when session ends

**Verify:** Component mounts without errors. `LetterReadingPage` beneath it remains mounted (check with React DevTools or test mount lifecycle assertion).

**Dependencies:** T4 (needs `OpenLiveInvite` shape awareness) — conceptually independent but T5 + T6 can parallelize after T4.

---

### T7 — `letter-reading-page.tsx`: state machine + banner + overlay integration

**Spec ref:** `### Implementation Approach` step 6; `### Architecture Decisions` Decision 3; `## Done-When`

**Files to modify:**
- `src/app/pages/letter-reading-page.tsx`

**Changes:**
1. Add `'paused'` to `ViewState` union
2. Add `liveSessionCode: string | null` state
3. Render `<LetterLiveBanner>` when `useOpenLiveInvite()` returns a non-null invite and `viewState !== 'paused'`
4. On `onJoin`: call `saveLetterPauseState(invite.deliveryId!, currentStoryIndex)`, set `liveSessionCode = invite.code`, set `viewState = 'paused'`
5. Render `<LetterLiveOverlay sessionCode={liveSessionCode}>` when `viewState === 'paused'`
6. On overlay `onComplete`: set `viewState = 'reading'`; show `"Welcome back — continuing your letter"` toast; hydrate reader at `saved_story_index` via `useLetterReadingState` setter
7. On `onLater`: dismiss banner in local state (do not close invite row)

**Verify:** Integration E2E scenario in `e2e/p745-letter-live-injection.spec.ts` passes (author triggers → receiver sees banner → accepts → overlay opens → letter remains mounted beneath). `LetterReadingPage` does NOT remount during /live round-trip (assert mount count = 1).

**Test file refs:** `e2e/p745-letter-live-injection.spec.ts`; `src/tests/p745-save-letter-pause-state.test.ts` (pause-state write)

**Dependencies:** T5 + T6 (components must exist); T3 (saveLetterPauseState must be available).

---

### T8 — Author-side threading: `StartClaritySessionButton` + `StoryWalk` + `LetterResultsPage`

**Spec ref:** `### Implementation Approach` steps 7–8; `### Architecture Decisions` Decision 5; `## UI Contract` (author trigger label + disabled tooltip)

**Files to modify:**
- `src/app/components/letters/start-clarity-session-button.tsx` — add `deliveryId?: string` prop; when `deliveryId` is present: label = `"Start Clarity Live now"`, disabled tooltip = `"Invite already pending"`
- `src/app/components/letters/story-walk.tsx` — accept + forward `deliveryId?: string` prop to `StartClaritySessionButton`
- `src/app/pages/letter-results-page.tsx` — pass `deliveryId` when a specific delivery is selected/in scope

**Verify:** Author UI renders label `"Start Clarity Live now"` when `deliveryId` is set. Button is disabled with correct tooltip when an open invite exists. TypeScript compiles. E2E: author trigger creates invite → receiver sees banner.

**Test file refs:** `e2e/p745-letter-live-injection.spec.ts` (two-party E2E validates the full author→receiver path)

**Dependencies:** T7 (receiver side must be ready to receive the invite).

---

**Total tasks:** 8 | **Can parallelize:** T5 and T6 (after T4 completes) | **Must be sequential:** T1 → T2 → T3 → T4 → [T5 ‖ T6] → T7 → T8
