---
status: all-done
completed_at: 2026-04-17
type: story
rank: 1000703.0
tags: [letters, live, verification, practice-room, inbox, notifications]
created_date: '2026-04-14'
flow: dev
pipeline_plan: [create-spec, challenge-prd, architect, generate-tests, spec-review, decompose, dev, verify]
pipeline_ran: [create-spec, challenge-prd, architect, generate-tests, spec-review, decompose, dev, verify, fix, fix.2]
uat_file: features/uat/p703.md
test_files:
  - e2e/integration/p703-letter-sourced-live-migration.spec.ts
  - e2e/p703-letter-sourced-live.spec.ts
  - e2e/a11y/p703-accessibility.spec.ts
  - src/tests/p703-baseline-ratings.test.ts
  - src/tests/p703-use-open-live-invite.test.ts
pipeline_skipped: [ux -- placement locked inline (below card, centered); single-button action, no novel flow, ui -- action is a single button no novel visual component, spec-compact -- fresh spec no pipeline residue]
---

# P703: Start a Clarity Session from Letter Results — Pre-loaded + Inbox Invite

> **Depends on:** [P699](../../archive/p699_letter_results_story_walk.md) (story walk — hosts the "Start a clarity session" action on each story card)
> **Supersedes:** [P702](../../archive/p702_verify_live_from_dispatch.md) (scope absorbed — we don't need the dispatch board to verify live; the story walk is enough)
> **Related:** [P663](../../archive/p663_letter_live_interleave.md) (rejected — earlier take on letter→live hand-off), [P700](../2026-04-22/p700_letter_results_aggregate_overview.md) (backlog — aggregate dispatch board deferred)

## Problem

**Situation:** A facilitator (letter author) reads a listener's results in P699's story walk — sees where the gap is on a specific story — and wants to verify that gap live, right now. The listener may be in the same room or remote (first workshop has both). P699 ships as read-only: there's no way to jump from "I see the gap" to "let's verify it together."

**Complication:** Today, to verify live with someone, both sides navigate independently into /live, pick a story, enter their predictions (author guesses listener's understanding; listener self-assesses), and only then reach the paraphrase moment. That's four steps of ceremony between "I see the gap" and "explain it back to me." The letter already captured both predictions. Re-entering them is redundant and slow, and it kills the workshop rhythm.

**Question:** How do we let the facilitator open a pre-loaded /live session on a specific story from P699's story walk, notify the listener to join, and skip straight to the paraphrase step — so the room watches verification happen, not prediction entry?

## Appetite

Medium blast radius (new button on P699's story cards, new inbox item type, new /live entry mode that skips prediction steps). Reversible (feature-flag the button; remove inbox item type; /live prediction-skip is a session-scoped branch). Medium decision density — practice-room reuse is clear, but /live's "skip predictions, start at paraphrase" needs a precise contract with the existing /live state machine.

## Solution

### The action

P699's story walk surfaces, per story, a **"Start a clarity session"** action. Visible to the **letter author only** (no receiver equivalent). Scoped to the currently-viewed story + receiver.

**Placement:** Below the story card, centered. Sits underneath P699's existing action area (JourneyToUnderstanding, GapBanner, LiveStoryCardExpanded, "Open Story"), above the fixed bottom prev/next nav. Single full-width (or centered fixed-width) button. Replaces P699's last-story /live CTA — this per-story action is strictly more useful.

Copy: **"Start a clarity session"** — exact label, no subtitle, no "with {name}". Matches `clarity_sessions` / `createClaritySession()` product terminology. Context (receiver name + story title) is already on the page header; repeating it on the button is noise.

On tap:

1. Create a /live session using the existing `createClaritySession()` helper, tagged with `source_letter_id`, `source_story_id`, and `target_listener_id`. Facilitator lands on `/live/<code>` as speaker.
2. Insert a row into new `clarity_live_invites` table for the target listener. This IS the discovery mechanism — letter-sourced sessions do NOT use `event_practice_rooms` and do not reuse `openPracticeRoom()`.
3. Listener's inbox surfaces the invite (Supabase realtime channel on `clarity_live_invites` filtered by `target_user_id = auth.uid()`).
4. Listener taps Join → lands in the same `/live/<code>` as listener.

### Pre-loaded /live — what "pre-loaded" means

**The first two steps of /live are skipped entirely:**

- ❌ **Skipped:** Author's prediction of listener's understanding (0–10).
- ❌ **Skipped:** Listener's self-assessment of their own understanding (0–10).
- ✅ **Start here:** Listener clicking **"Explain back"** (the paraphrase step).

Why it's safe to skip: both predictions already exist in the letter, but in **two separate tables** (P581/D26):
- **Author's prediction** → `letter_predictions.prediction` (sealed-bid table; one row per story per letter, keyed by story/letter/speaker).
- **Listener's self-rating** → `story_verifications.listener_rating` where `source='letter'` (speaker_rating is NULL on letter-sourced rows).

`getLetterBaselineRatings(sourceLetterId, sourceStoryId, senderId, receiverId)` joins these two reads and returns `{ speakerRating, listenerRating }`. /live's paraphrase round writes a sibling `story_verifications` row (`source='live'`) with post-paraphrase ratings — unchanged from today.

After the paraphrase round completes:

- ✅ **Free mode with sliders** — both parties can adjust their ratings freely, discuss, and end the session when done. No forced step sequence after paraphrase.

### Access control — letter-sourced /live is NOT a practice room

**Today's event practice rooms are open by design:**
- Row in `event_practice_rooms` is publicly readable (`USING (true)`)
- Any user on the public event page can tap "Join →" → `navigate('/live/<code>')`
- The /live waiting screen has a native-share / copy-link button — anyone with the link can join
- There is no QR code in the codebase; sharing is share-sheet / clipboard

That looseness is correct for events (open practice is the point) and **wrong for letter verification** (Alice's letter predictions are private, and a stranger joining would corrupt the verification record).

**Rules for letter-sourced sessions:**

1. **Target-listener binding at creation.** `clarity_sessions` gets a new nullable column `target_listener_id UUID REFERENCES profiles(id)`. Set when the session is created from a letter. NULL for all existing / event-sourced sessions (preserves current behavior).
2. **Server-enforced join gate — RLS predicate.** Tighten the `clarity_sessions` UPDATE policy so joins where `target_listener_id IS NOT NULL` require `auth.uid() = target_listener_id`. For `target_listener_id IS NULL` rows (existing event and anonymous-guest sessions) the current permissive policy is preserved — the predicate gates only letter-sourced rows. No new RPC needed — RLS already protects the join path (`joinClaritySession()` is a straight UPDATE today). One extra predicate, enforced at DB layer regardless of client.
3. **No public listing.** Letter-sourced sessions are NOT inserted into `event_practice_rooms` (that table stays events-only — its `event_id` is NOT NULL and its RLS is publicly readable, both wrong for this use case). The `clarity_live_invites` table is the only discovery path.
4. **No share button on the waiting screen.** When `target_listener_id IS NOT NULL`, hide the Share/copy-link button. The link is useless to anyone else; showing it invites confusion.
5. **Waiting-screen shell stays familiar.** Same layout as today's /live waiting screen, but the "Share this link" panel is replaced with "Invite sent to {listener name} · [Resend]". Visually consistent with events; join-method panel diverges.

### Inbox invite (the only discovery surface)

The invite reuses existing notification infrastructure:

- **New inbox item type:** `live_invite` — transient signal, not a persisted activity record.
- **Backing record:** `clarity_live_invites(session_id, target_user_id, created_at, closed_at)` — small table. RLS: recipient reads own rows only (`auth.uid() = target_user_id`).
- **Badge counts:** unread invites (`closed_at IS NULL`) contribute to the existing inbox unread badge. Integration point: whatever hook P660/P689 established for letter inbox counts — /ux + /architect to verify and wire.
- **Discovery mechanism — Supabase realtime.** Listener's client subscribes to `clarity_live_invites` changes filtered by `target_user_id = auth.uid()`. Same infrastructure /live already uses for state sync. New invite → row appears → badge updates → tap → `/live/<code>`. No polling; no manual refresh.
- **Lifecycle:** row created when facilitator opens the session. `closed_at` set by: (a) facilitator-side "Cancel room" / "End session" explicit UPDATE from the client, (b) **new** `completeClaritySession(sessionId)` API path that atomically sets `clarity_sessions.status='completed'` AND `clarity_live_invites.closed_at` for linked invite (net-new — today, session completion is client-analytics only; /architect to wire), (c) nightly cleanup cron for orphaned rows older than 24h (safety net for tab-close). Listener's invite disappears from inbox when `closed_at` is set. No manual dismiss.
- **Display:** "{author name} invited you to verify **{story title}** — Join". Tapping navigates to `/live/<code>`. Only the target listener sees it (RLS).
- **Singleton per listener — DB-enforced.** `CREATE UNIQUE INDEX ON clarity_live_invites (target_user_id) WHERE closed_at IS NULL`. Button is disabled client-side (tooltip: "Invite already pending for {listener}") as UX hint; the unique index is the actual guarantee and handles concurrent-click races between multiple facilitators.

### Data model touches

- `clarity_sessions`: already has `source_letter_id` (D26). Add `source_story_id UUID` (nullable) and `target_listener_id UUID REFERENCES profiles(id)` (nullable) — both NULL for existing / event-sourced sessions. RLS UPDATE policy tightened with `target_listener_id` gate predicate.
- `clarity_live_invites(session_id, target_user_id, created_at, closed_at)`: new small table backing the inbox item. RLS: recipient-only read. Realtime-enabled.
- No new columns on `story_verifications` or `letter_predictions`. Per P581/D26: letter-send writes `letter_predictions.prediction` (author's guess) and `story_verifications.listener_rating` (receiver's self-rating, `source='letter'`, speaker_rating NULL). /live's paraphrase round writes a sibling `story_verifications` row (`source='live'`) with both post-paraphrase ratings — unchanged from today.
- `event_practice_rooms` unchanged — letter-sourced sessions do NOT use it. `openPracticeRoom()` is NOT called for letter-sourced sessions (its `event_id NOT NULL` signature is incompatible).

## Risks / Non-Goals

### Risks

1. **Skipping predictions loses data integrity.** The current /live protocol assumes both predictions exist before paraphrase. Mitigation: the session record copies the letter's predictions into the same fields the /live prediction steps would have written. Downstream analytics treat the session identically to a non-letter-sourced session — the predictions happen to come from the letter, not from in-session entry.
2. **Listener isn't online / doesn't see the invite in time.** The invite is ephemeral. Mitigation: the room stays open until the facilitator closes it; if the listener joins later, they still land in the pre-loaded paraphrase step. If they never join, the facilitator cancels the room — no verification data created.
3. **Wrong role mapping.** Letter author = speaker, letter receiver = listener. Must be enforced at session creation, not inferred mid-session. Mitigation: `createClaritySession()` call sets roles explicitly from letter context.
4. **"Verify Live" visible to wrong viewer.** Button must only appear when the current user is the letter author viewing a specific receiver's results. Mitigation: RLS + UI gate on `letter.author_id === currentUser.id`.
5. **Wrong person joins the session.** If the /live link leaks (screen-share in a workshop, accidental forward), a stranger could join and see Alice's letter predictions on paraphrase reveal. Mitigation: `target_listener_id` server-enforced on join; Share button hidden; no public listing in `event_practice_rooms`. See Access Control section.
6. **Listener isn't logged in when invite fires.** Inbox invites require an authenticated session. Mitigation: listener is already a letter recipient (account exists). If logged out, Join link routes through login and returns. If never logs in within room's open window, facilitator cancels.

### Non-Goals

- Do NOT build the aggregate dispatch board (that's P700, deferred).
- Do NOT build group /live (multiple listeners at once) — /live stays 1:1.
- Do NOT persist `live_invite` as an activity — it's a transient signal, not a letter/verification record.
- Do NOT add FCM / browser push notifications — Supabase realtime subscription on `clarity_live_invites` is the V1 mechanism (same infrastructure /live already uses).
- Do NOT change /live's paraphrase protocol itself — only the entry point and the two skipped prediction steps change.
- Do NOT add a "verify from letter inbox" entry point — the entry point is P699's story walk only.

## Done-When

- [ ] "Start a clarity session" action visible on each story card in P699's story walk, author-only
- [ ] Tapping creates a /live session with `source_letter_id` and `source_story_id` populated from letter context
- [ ] Session opens a practice room; facilitator lands on `/live/<code>` as speaker
- [ ] Listener receives an inbox item "{author} invited you to verify {story} — Join"
- [ ] Inbox item contributes to existing unread badge counts (mobile, desktop, inbox tab)
- [ ] Listener tapping Join lands in the same `/live/<code>` as listener
- [ ] /live session starts at the paraphrase step — author's prediction step and listener's self-assessment step are both skipped
- [ ] Letter-sourced session pre-loads the paraphrase screen with: author's prediction from `letter_predictions.prediction` AND receiver's self-rating from the letter-sourced `story_verifications.listener_rating` (one row fetched from each table, joined client-side); /live writes a sibling `story_verifications` row (`source='live'`) post-paraphrase with the verified ratings
- [ ] After paraphrase round, both parties enter free mode with sliders to adjust and end the session
- [ ] Inbox invite disappears for the listener when the facilitator closes the practice room or the session ends
- [ ] Roles correctly assigned: letter author = speaker, letter receiver = listener

## Acceptance Criteria

- [x] Facilitator can start a pre-loaded /live from any story card in P699 results walk
- [x] Remote listener receives and can act on the inbox invite from the same device they use for letters
- [x] /live never prompts for author prediction or listener self-assessment in a letter-sourced session
- [x] Verification outcome (understanding score, position) persists on `story_verifications` as normal
- [x] Cancelling the room before listener joins leaves no orphaned verification data
- [x] Works when listener is co-present (same room) and when listener is remote (different device)

## UX Notes

**Placement:** Below the story card, centered, above the fixed bottom prev/next nav. Scrolls with the card on mobile (not pinned). Replaces P699's last-story /live CTA — drop it from P699 when P703 ships.

**Happy path (co-present workshop):**
1. Facilitator is in P699 viewing Alice's results. Sees story 2 has a big gap.
2. Taps "Start a clarity session" on story 2.
3. Phone opens `/live/<code>`. Facilitator says "Alice, check your inbox."
4. Alice taps the invite. Both see paraphrase UI. Alice explains back.
5. Ratings revealed, free mode, discussion, end.

**Happy path (remote listener):**
Same as above, but Alice is at her desk. She sees the invite badge on her phone or desktop menu. Taps through, lands in /live. Same paraphrase start.

**Cancel path:** Facilitator taps "Verify Live", no one joins. Facilitator closes the room. Alice's invite disappears. No verification record.

**Pre-loaded /live visual cue:** When a listener joins a letter-sourced session, the first screen they see is the paraphrase prompt — NOT the self-assessment slider. Consider a small "Verifying: {story title} (from letter)" header so the listener knows what's happening without ceremony.

## Resolved Decisions

| # | Source | Finding | Resolution | Rationale |
|---|--------|---------|-----------|-----------|
| 1 | /challenge-prd BLOCK-1 | Spec claimed `openPracticeRoom()` reuse, but helper requires `event_id NOT NULL` and writes to `event_practice_rooms` which spec excludes | Drop practice-room framing entirely. Letter-sourced sessions = `clarity_sessions` row + `clarity_live_invites` row. Waiting screen reads both directly | Invite table already provides discovery; no need for a second surface |
| 2 | /challenge-prd BLOCK-2 | Spec claimed "RPC that transitions waiting→active" exists; it does not (joins are client UPDATE) | Server gate = RLS predicate on `clarity_sessions` UPDATE policy. No new RPC | RLS already protects joins; one extra predicate is cheaper and harder to bypass than a new RPC |
| 3 | /challenge-prd BLOCK-3 + /spec-review BLOCK-1 | Spec first claimed a "pre slot" on `story_verifications`; then claimed both ratings live on the same letter-sourced row. Both wrong. | P581 actually splits them: `letter_predictions.prediction` (author guess, sealed-bid) + `story_verifications.listener_rating` where `source='letter'` (speaker_rating NULL). `getLetterBaselineRatings` JOINs both. /live writes a sibling `source='live'` row post-paraphrase (unchanged). | Verified against P581 migration SQL (INSERT column list omits speaker_rating) |
| 4 | /challenge-prd BLOCK-4 | "Inbox polling is enough" contradicted the workshop-rhythm motivation; no polling exists today | Use Supabase realtime subscription on `clarity_live_invites` filtered by `auth.uid()`. Same infra /live already uses | Polling defeats the spec's purpose; realtime channel is cheap and already in stack |
| 5 | /challenge-prd WARN-5 + Q5 | `closed_at` lifecycle had no trigger; overlap invites weren't handled | Lifecycle: facilitator-cancel (explicit), session-complete hook (reuse verification-write path), nightly cron for orphans >24h. Singleton invite per listener (button disabled if one open) | Covers tab-close, workshop overlap, and normal flow |
| 6 | /challenge-prd Q3 | "Both predictions in letter" needed verification | Verified against P581 spec line 962 — `listener_rating` column captures receiver self-assessment | Both prediction steps can legitimately be skipped in letter-sourced /live |
| 7 | /challenge-prd pass 2 BLOCK | "Session-complete hook that writes story_verifications post-round" reference was misleading — writes happen per-round, not per-session | Introduce new `completeClaritySession(sessionId)` API path that atomically marks session completed AND sets linked invite `closed_at`. Cron covers tab-close orphans | Explicit new API surface rather than implicit reuse claim |
| 8 | /challenge-prd pass 2 WARN | Singleton invite was client-side only — vulnerable to concurrent-click race between facilitators | Add DB unique partial index: `UNIQUE (target_user_id) WHERE closed_at IS NULL` | DB-level guarantee; client tooltip is UX hint only |
| 9 | /challenge-prd pass 2 WARN | RLS predicate change needed to preserve anonymous/event join path | Predicate gates letter-sourced rows only (`target_listener_id IS NOT NULL`); permissive policy preserved for `target_listener_id IS NULL` rows | Keeps events + anonymous guest pattern intact |
| 10 | /challenge-prd pass 2 NOTE | P699 last-story /live CTA removal is cross-feature | P699 must ship first OR P703 removes the CTA inline as part of its implementation. /architect to sequence | Single ordering dependency, explicit |

## Technical Architecture

**Worktree recommended.** Touches a new migration + new RLS policy on a core table, new API surface, new hook + realtime channel, /live state-machine branch, and a component in P699's StoryWalk. Multi-file, mixed layers — use a dedicated worktree.

### Technical Analysis

**Current schema (verified against migrations + docs/technical/database.md):**

- `clarity_sessions` columns already present: `id`, `code`, `creator_name`, `creator_profile_id`, `joiner_name`, `joiner_profile_id`, `state` (jsonb live_state), `status`, `demo_status`, `partnership_status`, `is_private`, `creator_note`, `last_activity_at`, `source_letter_id` (added per D26/P581). **Missing for this feature:** `source_story_id`, `target_listener_id`.
- Current `clarity_sessions` RLS (`supabase/migrations/20260223_p396_host_rls_and_session_constraints.sql`):
  - SELECT: `USING (true)` — public read (preserved)
  - INSERT: `WITH CHECK (auth.uid() IS NOT NULL AND profiles.is_verified = true)`
  - UPDATE: `USING (true) WITH CHECK (creator_profile_id IS NOT NULL)` — any caller may update any session that has a verified creator. This is the join path (`joinClaritySession()` does a plain UPDATE to set `joiner_name`/`joiner_profile_id`). **This is the policy P703 tightens.**
- Letter-send data flow per P581 (D26), verified in migration SQL:
  - `letter_predictions(story_id, letter_id, speaker_id, prediction SMALLINT)` — author's guess; sealed-bid, one row per story per letter. (Per P581 migration INSERT on `submit_letter_ratings` RPC.)
  - `story_verifications(story_id, speaker_id, listener_id, listener_rating SMALLINT, speaker_rating NULL, source='letter', verified=false, session_id=NULL, sort_order)` — receiver's self-rating at letter-read time.
- `/live` paraphrase round writes a **sibling** `story_verifications` row with `source='live'`, both ratings populated post-paraphrase (existing path in `writeVerification` at `clarity-live-page.tsx:1847`). No schema changes to either table.
- Realtime pattern (`src/app/data/api.ts:1192-1212`): `supabase.channel('clarity_session:<id>').on('postgres_changes', { event:'UPDATE', schema:'public', table:'...', filter:'id=eq.<id>' }, cb).subscribe()` — this is the exact idiom we reuse for `clarity_live_invites` (filter `target_user_id=eq.<uid>`).

**Current /live state machine (`src/app/pages/clarity-live-page.tsx`, 4100 lines):**

- `ViewState = 'start' | 'waiting' | 'live'` — page-level screen.
- Inside `view='live'`, the fine-grained state is `liveState.ratingPhase: 'idle' | 'rating' | 'waiting' | 'revealed' | 'explain-back' | 'results'` (types at `src/app/types/index.ts:474`).
  - `idle` = slider screen where speaker enters prediction **or** listener enters self-assessment. This IS the step letter-sourced sessions must skip.
  - Transition to `explain-back` happens today inside `handleStartCheck`/rating-submit flow at `line 2317` (`ratingPhase: 'explain-back'`).
- `PHASE_ORDER` (line 162) monotonic guard: `{ idle:0, waiting:1, rating:2, revealed:3, 'explain-back':4, results:5 }` — skipping `idle` and starting at `'explain-back'` (phase 4) is consistent with the monotonic invariant.
- Waiting screen Share button at `clarity-live-page.tsx:3904-3914` (imports `Share2` from lucide, line 8). Handler `handleShare` at line 3825 (native `navigator.share` + clipboard fallback).
- Return-to-auth path: `navigate('/login?redirect=/live')` at line 3576; `returnTo` query param consumed at line 3190 — listener route `/live/<code>` tolerates login redirect today.

**Reuse inventory (what exists, what we compose, what is new):**

| Concern | Artifact | File | Action |
|---|---|---|---|
| Create session row | `createClaritySession(creatorName, creatorProfileId?, isPrivate?, creatorNote?)` | `src/app/data/api.ts:809` | **Extend** — add optional `{ sourceLetterId, sourceStoryId, targetListenerId }` opts. Insert writes the three FKs when present. |
| Join (UPDATE sets joiner) | `joinClaritySession(code, joinerName, joinerProfileId?)` | `src/app/data/api.ts:863` | **No signature change.** RLS policy gates letter-sourced rows server-side. Client gets a silent NULL back on a blocked update — surface as "not authorized" UX. |
| Session-update realtime | `subscribeToClaritySession` pattern | `src/app/data/api.ts:1188` | **Reuse pattern**, not the function itself, for `clarity_live_invites` subscription. |
| Complete session | — (does not exist today) | — | **New:** `completeClaritySession(sessionId)` — SQL RPC. See AD5. |
| Close event practice room | `closePracticeRoom()`, `closePracticeRoomBySessionId()` | `src/app/data/events-service-real.ts:886` | **Do not reuse** — event-scoped. Pattern (setting a terminal column on related row) informs invite-closure path. |
| Unread badge hook (letters) | `useUnreadLetterCount()` | `src/app/hooks/useUnreadLetterCount.ts` *(lives on `feature/letters-ship`)* | **Parallel sibling:** add `useOpenLiveInvite()` hook. Does NOT merge into letters count — it is its own signal on the inbox. Integration with the mobile/desktop nav badge is a display-layer additive. |
| Inbox UI | Letters inbox tab on `feature/letters-ship` | `letters-page.tsx` | **Add row type `live_invite`** in Inbox tab rendering. Reuse existing row shell; open invites render above unread letters (signal priority). |
| Story walk CTA | StoryWalk "Start a clarity session" button | P699's `story-walk.tsx` (new, pending P699 ship) | **Add** per-story button; **remove** P699's last-story /live CTA (D10). |
| /live state machine | `clarity-live-page.tsx` state + phase branches | `src/app/pages/clarity-live-page.tsx` | **Minimal branch at bootstrap** — when session has `target_listener_id` set AND pre-loaded baseline verification exists, initialize `ratingPhase: 'explain-back'` on first mount for both roles (see AD3). |
| Share button | `handleShare` + Share2 button JSX | `clarity-live-page.tsx:3825, 3904` | **Conditional hide** when `session.targetListenerId != null`; replace panel with "Invite sent to {listener} · [Resend]". |

**Predecessor dependency (D10 resolution — architect sequences):** P703 removes P699's last-story /live CTA **as part of its own diff**. Rationale: P699 is `features/p699_*.md` (active branch `feature/letters-ship` worktree). P703 will land after P699 ships to main. The removal is a 3-line edit inside `StoryWalk`; doing it inside P703 avoids cross-feature coupling and is safe because by the time P703 merges, P699's CTA is in main and P703's `StoryWalk` edits reference a file that exists there.

### Architecture Decisions

**AD1 — Discovery surface: `clarity_live_invites` table, NOT `event_practice_rooms`.**

- **Chosen:** A new small table `clarity_live_invites(session_id UUID PK-or-unique REFERENCES clarity_sessions(id) ON DELETE CASCADE, target_user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE, created_at TIMESTAMPTZ DEFAULT now(), closed_at TIMESTAMPTZ)`. RLS: `FOR SELECT USING (auth.uid() = target_user_id)`; `FOR INSERT WITH CHECK (auth.uid() IN (SELECT creator_profile_id FROM clarity_sessions WHERE id = session_id))`; `FOR UPDATE USING (auth.uid() = target_user_id OR auth.uid() IN (SELECT creator_profile_id FROM clarity_sessions WHERE id = session_id)) WITH CHECK (true)`. Unique partial index: `CREATE UNIQUE INDEX idx_live_invites_one_open_per_user ON clarity_live_invites(target_user_id) WHERE closed_at IS NULL`.
- **Rationale:** `event_practice_rooms.event_id` is `NOT NULL`; public SELECT policy (`USING(true)`) is the wrong security posture for letters. `openPracticeRoom()` is incompatible at signature and semantics. The invite table is a two-user directed signal, not a public listing.
- **Trade-off:** Second discovery concept alongside practice rooms. Mitigated by keeping the schema minimal (4 columns, FK CASCADE).
- **Alternative rejected:** "Add `target_user_id` to `event_practice_rooms` + change policy" — couples letters into the events data model, breaks the "public room" semantics for the events use case, and requires policy-branching on a NULL column where predicate is subtle. Worse blast radius.

**AD2 — Join gate: RLS predicate on `clarity_sessions` UPDATE, NOT a new RPC.**

- **Chosen:** Tighten the existing `clarity_sessions_creator_update` policy (`migrations/20260223_p396_host_rls_and_session_constraints.sql`) so its WITH CHECK becomes:
  ```sql
  creator_profile_id IS NOT NULL
  AND (
    target_listener_id IS NULL
    OR auth.uid() = target_listener_id
    OR auth.uid() = creator_profile_id
  )
  ```
  (Creator branch preserves host's ability to update live_state; listener branch is the letter-sourced join gate; NULL branch preserves events + anonymous guest joiners.)
- **Rationale:** `joinClaritySession()` is already a raw UPDATE (`api.ts:893-896`). Adding an RPC duplicates a path the DB already protects. One extra predicate is the narrowest possible change and is enforced regardless of client.
- **Trade-off:** Failure mode for a blocked join is a silent empty UPDATE result (`data: null`, no error). `joinClaritySession` already handles the "session not joinable" case with a null return — surfacing "invite required" UX is a one-line string change in the caller.
- **Alternative rejected:** `rpc('join_letter_sourced_session', {session_id, user_id})` SECURITY DEFINER — more code, same protection, and bypasses the existing join path rather than reinforcing it.

**AD3 — Phase skip at /live bootstrap via a session-scoped derived flag, NOT a new ratingPhase value or branch inside `handleRatingSubmit`.**

- **Chosen:** At the point where `liveState` is initialized from server (session fetch + first `setView('live')`), compute `isLetterSourced = session.targetListenerId != null && session.sourceStoryId != null`. When true:
  1. Initial `ratingPhase` bootstraps to `'explain-back'` instead of `'idle'`.
  2. Pre-populate `liveState` with baseline ratings via `getLetterBaselineRatings(sourceLetterId, sourceStoryId, senderId, receiverId) → { speakerRating, listenerRating }`. Implementation: two parallel reads — `letter_predictions` where `(letter_id, story_id, speaker_id)` match (returns `prediction` → `speakerRating`) AND `story_verifications` where `(story_id, speaker_id, listener_id, source='letter')` (returns `listener_rating` → `listenerRating`). Both reads are gated by existing RLS; if either returns no row, bootstrap falls back to `ratingPhase: 'idle'` (safety net — should not happen if the Start button was gated correctly).
  3. Existing rating-submit path (which transitions to `'explain-back'`) is bypassed because both clients already start in that phase. Monotonic guard `PHASE_ORDER` (line 162) accepts this — 'idle'→'explain-back' is a valid forward transition.
- **Rationale:** Keeps the state machine pure. No new phase value, no branch in `handleStartCheck`. The skip is a boot-time initial-state difference, not a runtime conditional scattered across handlers. The ratings that would have been written during `idle` are loaded from the letter's existing verification row, preserving the analytics contract in Risk #1.
- **Trade-off:** Requires a blocking read (letter verification row) before first render of /live. Mitigated: the row is guaranteed to exist (P699 only shows the CTA after results are viewable) and the fetch is one row by composite PK-equivalent.
- **Alternative rejected:** Add a `letterSourced` branch inside the rating-submit handler — contaminates existing code with conditional logic, risks regressing event sessions. Net more change, not less.

**AD4 — Realtime channel: per-user filtered subscription on `clarity_live_invites`.**

- **Chosen:** Add `subscribeToLiveInvites(userId, onInvite, onInviteClosed)` in `src/app/data/api.ts`. Channel name `live_invites:${userId}`. Filter `target_user_id=eq.${userId}`, events `INSERT` + `UPDATE` (close detection). `ALTER PUBLICATION supabase_realtime ADD TABLE clarity_live_invites;` in the same migration that creates the table.
- **Rationale:** Same idiom `src/app/data/api.ts:1188` already uses. Recipient-only RLS guarantees the filter + leaked keys remain safe.
- **Trade-off:** One extra always-on subscription for any authenticated user on any page that mounts the hook. Acceptable — the hook is mounted in nav shell (`simple-navigation.tsx` / `bottom-nav.tsx`), same surface that already mounts `useUnreadLetterCount`.
- **Alternative rejected:** Polling on visibilitychange (same shape as `useUnreadLetterCount`). Explicitly rejected by spec (motivation: workshop rhythm requires sub-second delivery).

**AD5 — `completeClaritySession(sessionId)` = SECURITY DEFINER RPC, atomic.**

- **Chosen:** New migration adds:
  ```sql
  CREATE OR REPLACE FUNCTION public.complete_clarity_session(p_session_id UUID)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public
  AS $$
  BEGIN
    -- Authorization: only creator, joiner, or target_listener may complete
    IF NOT EXISTS (
      SELECT 1 FROM clarity_sessions
      WHERE id = p_session_id
        AND (creator_profile_id = auth.uid()
          OR joiner_profile_id = auth.uid()
          OR target_listener_id = auth.uid())
    ) THEN
      RAISE EXCEPTION 'not authorized';
    END IF;

    UPDATE clarity_sessions SET status = 'completed' WHERE id = p_session_id;
    UPDATE clarity_live_invites SET closed_at = now()
      WHERE session_id = p_session_id AND closed_at IS NULL;
  END;
  $$;
  REVOKE ALL ON FUNCTION public.complete_clarity_session(UUID) FROM PUBLIC;
  GRANT EXECUTE ON FUNCTION public.complete_clarity_session(UUID) TO authenticated;
  ```
  Client wrapper: `completeClaritySession(sessionId)` calls `supabase.rpc('complete_clarity_session', { p_session_id })`.
- **Rationale:** Atomicity across two tables is the contract (Risk: invite lingers after session ends). RPC wins over two client UPDATEs: (a) single round-trip; (b) guaranteed ordering; (c) single authorization check.
- **Trade-off:** Net-new SQL function — deploy dependency. Mitigated: single migration file, idempotent `CREATE OR REPLACE`.
- **Alternative rejected:** Two-statement client transaction (`session update` then `invite update`). Not atomic from the DB's perspective; client crash between them leaves orphans until the cron catches them.

**AD6 — Invite lifecycle + orphan cleanup.**

- **Chosen:** Three closure paths, matching Resolved Decision #5:
  1. **Session complete** — `completeClaritySession()` RPC (AD5) sets `closed_at` in the same transaction as `status='completed'`.
  2. **Facilitator cancel from /live waiting screen** — new client method `cancelLiveInvite(sessionId)` issues a plain UPDATE `SET closed_at = now()` on `clarity_live_invites` with RLS-scoped WHERE. Does NOT complete the session (session stays `waiting` / reusable if the facilitator decides to reopen) — facilitator explicitly cancelling the ROOM (existing "Leave"/"End" action) routes through `completeClaritySession`.
  3. **Cron orphan cleanup** — new Supabase scheduled function `cleanup_stale_live_invites` running every hour: `UPDATE clarity_live_invites SET closed_at = now() WHERE closed_at IS NULL AND created_at < now() - interval '24 hours'`. Safety net for tab-close before either (1) or (2) fires.
- **Rationale:** Matches spec's three-path model. Unique partial index (AD1) prevents new-invite insert while an orphan lingers; the cron keeps the singleton invariant from permanently blocking a facilitator whose counterpart never joined.
- **Trade-off:** 24h orphan window. Acceptable — the index blocks duplicate invites to the same listener, so worst case is "facilitator waits up to 24h before retrying"; cron runs hourly so practical wait is ≤1h. Short-window variants (5m / 1h) over-close legitimately-open rooms.
- **Alternative rejected:** DB trigger on `clarity_sessions.status` change to cascade `closed_at` onto invites. More magic, less observable. The RPC is the explicit contract.

**AD7 — StoryWalk placement (P699 last-story /live CTA no longer exists on w2).**

- **Chosen:** Add `StartClaritySessionButton` as a new component rendered inside `StoryWalk`'s per-story region, BELOW `LiveStoryCardExpanded` and ABOVE the `FixedBottomBar`. Insert inside the `<div className="px-4 pb-28 space-y-6">` block after `LiveStoryCardExpanded`. Per-story button is author-only — gate using StoryWalk's existing `perspective === 'sender'` prop (no extra prop needed for the gate itself).
- **Rationale:** Integration check post-P705 (2026-04-14) confirmed the current `story-walk.tsx` on `feature/letters-ship` never rendered a last-story /live CTA — the last-story branch only shows "Previous Story + Back to Letters." The removal step from D10 is therefore moot. Per-story placement remains correct: pairs the button with the story it would start a session about.
- **Prop surface dependency:** `ResultsProfileData` (in `letters-service.ts`) currently exposes `name/avatar/hasPledged/earsCount` but **no `id`**. P703 needs `senderId` + `receiverId` for `createClaritySession({ target_listener_id })` and `getLetterBaselineRatings(…, senderId, receiverId)`. Task 8 extends `ResultsProfileData` with `id: string`, threads through `letter-results-page.tsx`, and passes IDs down to StoryWalk as new props (`senderId`, `receiverId: string | null`).
- **Trade-off:** P703's diff extends a shared type (`ResultsProfileData`) and the letters-page → StoryWalk prop surface. Low risk — additive field + additive props.
- **Alternative rejected:** Look up IDs inside `StartClaritySessionButton` via a separate fetch. Adds a redundant round-trip when the page already has the data in `LetterResultsData`.

### Security Review

**RLS Policies:**

- ⚠️ **UPDATE WITH CHECK must carry the target_listener predicate, not just USING.** Stranger-join is a write (joiner_profile_id UPDATE). New policy: `USING (target_listener_id IS NULL OR auth.uid() IN (target_listener_id, creator_profile_id))` AND `WITH CHECK (creator_profile_id IS NOT NULL AND (target_listener_id IS NULL OR auth.uid() IN (target_listener_id, creator_profile_id)))`. Preserves anonymous-guest event path (both branches NULL → `auth.uid()` is NULL → predicate short-circuits to the `IS NULL` branch).
- ⚠️ **INSERT policy on `clarity_sessions` must validate letter authorship + listener membership.** Today's `clarity_sessions_verified_host_insert` only checks `auth.uid() IS NOT NULL AND is_verified`. For letter-sourced rows: require `source_letter_id`'s letter has `author_id = auth.uid()` AND `target_listener_id` is a receiver of that letter. Prevents a verified user from fabricating invite rows against arbitrary recipients.
- ⚠️ **`clarity_live_invites` INSERT/UPDATE policies required (spec had only SELECT).** INSERT WITH CHECK must verify the invite row matches an existing clarity_sessions row whose letter is authored by `auth.uid()` and whose `target_listener_id = clarity_live_invites.target_user_id`. UPDATE (for `closed_at` writes) restricted to session participants.
- ⚠️ **`clarity_sessions` SELECT policy must gate letter-sourced rows** — otherwise a leaked `/live/<code>` reveals session metadata (creator name, story title, predictions) to anon before the UPDATE gate triggers. Add: `target_listener_id IS NULL OR auth.uid() IN (target_listener_id, creator_profile_id)`.
- ⚠️ **Audit `letter_predictions` SELECT RLS** — this is the sealed-bid table holding the author's prediction. Confirm SELECT is restricted to the speaker (always) and to the listener only after their letter-sourced `story_verifications` row exists (reveal condition). If the policy is broader, the author's prediction leaks to the listener before they've self-rated. `story_verifications` SELECT RLS is already source-aware per P581 (not a P703 concern). /architect added as a Build Sequence prerequisite.

**Authentication:**

- ⚠️ **Logged-out listener deep-link preservation.** Spec says "Join routes through login and returns." Verify `/live/<code>` is preserved through auth redirect; without SELECT RLS gate (above), even logged-out users can read session metadata via the waiting-screen data fetch.
- ✅ Anonymous-guest regression blocked by the NULL-branch predicate above (`auth.uid()` NULL vs UUID yields NULL → fails predicate cleanly).

**Authorization:**

- ⚠️ **"Start a clarity session" button author gate must be server-side, not UI-only.** Enforced by the revised INSERT policy on `clarity_sessions` (above). UI gate (`letter.senderId === currentUser.id`) remains as UX hint only.
- ⚠️ **`complete_clarity_session(UUID)` RPC caller check.** SECURITY DEFINER function must assert `auth.uid() IN (creator_profile_id, joiner_profile_id, target_listener_id)` of the session before writing. Otherwise any user can prematurely close invites.
- ⚠️ **Resend action — rate-limit + idempotency.** Resend must NOT insert a new invite row (unique partial index blocks this anyway); it should UPDATE `updated_at` on the existing row to re-ping realtime. Add server-side rate limit: one Resend per 30s per session. Prevents author spamming recipient's realtime channel.

**Input Validation:**

- ⚠️ **Room code entropy.** Current `generateRoomCode()` uses `Math.random()` over 32-char alphabet × 6 chars (~30 bits). During an open invite window an attacker could enumerate. With the SELECT RLS gate added above, enumeration leaks no metadata — defense-in-depth holds. No code change required if SELECT gate lands; if SELECT gate is deferred, raise to `crypto.getRandomValues()` + 10 chars.
- ⚠️ **`target_listener_id` validated DB-side, not client-side** (enforced by INSERT policy above).

**Data Protection:**

- ⚠️ **Invite display JOINs must respect RLS.** The "{author} invited you to verify {story}" display fetches `clarity_sessions.creator_name` + `stories.title`. Verify neither exposes a wider READ surface than the recipient needs. Likely fine (stories are scoped to visibility; profiles.name is public) but must be audited.
- ⚠️ **Paraphrase-reveal defense-in-depth.** /live reveal component should additionally guard prediction rendering with `auth.uid() IN (creator_profile_id, target_listener_id)` client-side — belt-and-braces against RLS regression.
- ℹ️ **Singleton unique index has DoS surface.** `UNIQUE (target_user_id) WHERE closed_at IS NULL` means a zombie invite from author A blocks author B from inviting the same listener for up to 24h (cron window). Accepted — the cron runs hourly so practical wait is ≤1h; the `cancelLiveInvite` action lets the blocking facilitator release the slot. Alternative (`UNIQUE (target_user_id, session_id)`) breaks the "no overlap" workshop guarantee. Keep as-is.

### Implementation Approach

#### Build Sequence

0. **Pre-flight: audit `letter_predictions` SELECT RLS.** Author's predictions live here (sealed-bid). Confirm SELECT is restricted to: (a) speaker always, (b) listener only when their matching letter-sourced `story_verifications` row exists (reveal gate). If policy is broader, tighten in this migration. Blocker for build — predictions leak pre-reveal otherwise. (Security §RLS-5). `story_verifications` SELECT RLS is already source-aware per P581 and is NOT re-audited here.
1. **Migration: schema + RLS + realtime + RPC.** One file `supabase/migrations/YYYYMMDDHHMMSS_p703_letter_sourced_live.sql`:
   - `ALTER TABLE clarity_sessions ADD COLUMN source_story_id UUID`, `ADD COLUMN target_listener_id UUID REFERENCES profiles(id)` (both NULL).
   - `CREATE TABLE clarity_live_invites (...)` with SELECT/INSERT/UPDATE RLS policies (recipient-only SELECT; author-scoped INSERT validating letter authorship + listener membership; participant-scoped UPDATE for `closed_at`), unique partial index, `ALTER PUBLICATION supabase_realtime ADD TABLE clarity_live_invites`.
   - `DROP POLICY clarity_sessions_creator_update; CREATE POLICY ...` with tightened USING + WITH CHECK from AD2 + Security §RLS-1 (predicate on both clauses).
   - **New SELECT policy on `clarity_sessions`** (Security §RLS-4): `target_listener_id IS NULL OR auth.uid() IN (target_listener_id, creator_profile_id)` — preserves event/anon read path, gates letter-sourced metadata.
   - **Replace `clarity_sessions_verified_host_insert`** (Security §RLS-2): extend WITH CHECK so letter-sourced rows (`source_letter_id IS NOT NULL`) require `EXISTS (SELECT 1 FROM letters WHERE id = source_letter_id AND author_id = auth.uid())` AND `target_listener_id` ∈ letter receivers AND `creator_profile_id = auth.uid()`.
   - `CREATE OR REPLACE FUNCTION complete_clarity_session(UUID) SECURITY DEFINER` per AD5 — body MUST assert `auth.uid() IN (creator_profile_id, joiner_profile_id, target_listener_id)` of the target session before mutating (Security §Authz-2).
   - **Resend rate-limit:** add a function or trigger enforcing one `updated_at` bump per 30s per `session_id` on `clarity_live_invites` (Security §Authz-3). Resend NEVER inserts a new row — the unique partial index would block it anyway; semantics are "UPDATE updated_at to re-ping realtime."
   - `./scripts/migrate.sh` against test DB, verify via `mcp__supabase__list_tables` and a REST curl on the new table.
2. **Cron (separate migration).** `cleanup_stale_live_invites` via `pg_cron` schedule (hourly), per AD6.
3. **Data layer — api.ts.**
   - Extend `createClaritySession(...)` signature with optional `{ sourceLetterId, sourceStoryId, targetListenerId }`.
   - Add `getOpenLiveInviteForUser(userId)`, `getLetterBaselineRatings(sourceLetterId, sourceStoryId, senderId, receiverId)` (two-read JOIN: `letter_predictions` + `story_verifications`), `subscribeToLiveInvites(userId, onInsert, onUpdate)`, `cancelLiveInvite(sessionId)`, `completeClaritySession(sessionId)`.
4. **Hook.** `src/app/hooks/useOpenLiveInvite.ts` — parallel to `useUnreadLetterCount`. Mounts realtime subscription. Returns `{ invite: {sessionId, code, authorName, storyTitle} | null, loading }`.
5. **Nav integration.** Mobile + desktop nav shells consume `useOpenLiveInvite()`; show an "invite pending" dot/badge plus inbox row. Reuse `feature/letters-ship` Inbox tab — add `live_invite` row type that renders above unread letters with `"{author} invited you to verify {story} — Join"` → `navigate('/live/<code>')`.
6. **/live state-machine branch.** In `clarity-live-page.tsx` session-load effect:
   - If `session.targetListenerId != null && session.sourceStoryId != null`: fetch baseline ratings (AD3 step 2), initialize `liveState` with pre-loaded ratings + `ratingPhase: 'explain-back'`.
   - Conditionally hide the Share button + swap the waiting panel copy to "Invite sent to {listener} · [Resend]" when `targetListenerId != null`.
7. **StoryWalk button.** Extend `ResultsProfileData` with `id: string` (populate in `getLetterResults()`), thread `senderId`/`receiverId` from `letter-results-page.tsx` into `StoryWalk` as new props, add `StartClaritySessionButton` rendered per-story under `LiveStoryCardExpanded` (author-only via `perspective === 'sender'`), wire handler: creates session → inserts invite → navigates to `/live/<code>`. (Post-P705 check confirmed no last-story /live CTA exists on w2 — nothing to remove.)
8. **Tests.** RLS canaries (each must fail with 42501/403): (a) non-recipient UPDATE letter-sourced session, (b) unauthenticated SELECT letter-sourced session, (c) non-author INSERT session with someone else's `source_letter_id`, (d) author INSERTing invite for non-recipient listener, (e) `complete_clarity_session` called by non-participant. Integration test for atomicity of `complete_clarity_session`. Resend rate-limit test (two calls within 30s → second rejected). Playwright flow: facilitator starts from StoryWalk → listener sees inbox invite → both land in `/live/<code>` with `explain-back` as the first phase. Client-side defense-in-depth: paraphrase-reveal component guarded by `auth.uid() IN (creator_profile_id, target_listener_id)`.

#### Files to Create

- `supabase/migrations/YYYYMMDDHHMMSS_p703_letter_sourced_live.sql` — schema + RLS + realtime publication + `complete_clarity_session` RPC.
- `supabase/migrations/YYYYMMDDHHMMSS_p703_live_invites_cron.sql` — `pg_cron` hourly orphan cleanup.
- `src/app/hooks/useOpenLiveInvite.ts` — realtime-backed hook for the current user's open invite.
- `src/app/components/letters/start-clarity-session-button.tsx` — the per-story CTA component.
- `e2e/integration/p703-letter-sourced-live.spec.ts` — end-to-end happy path.
- Tests for `completeClaritySession` atomicity + RLS gate (location per repo test conventions).

#### Files to Modify

- `src/app/data/api.ts` — extend `createClaritySession` signature; add `getOpenLiveInviteForUser`, `getLetterBaselineRatings`, `subscribeToLiveInvites`, `cancelLiveInvite`, `completeClaritySession`.
- `src/app/pages/clarity-live-page.tsx` — session-load effect branches on `targetListenerId`; waiting-screen Share/copy panel conditional; end-session wiring routes through `completeClaritySession` when the row is letter-sourced.
- `src/app/types/index.ts` — extend `ClaritySession` type with optional `sourceStoryId`, `targetListenerId` (and `sourceLetterId` if not already there).
- StoryWalk component (expected path per P699: `src/app/components/letters/story-walk.tsx` on `feature/letters-ship`) — render `StartClaritySessionButton` per story (author only); **remove** last-story /live CTA branch.
- Inbox tab component on `feature/letters-ship` — add `live_invite` row type rendering.
- Nav shells (`bottom-nav.tsx`, `simple-navigation.tsx`) — hook `useOpenLiveInvite()` signal into the badge display.
- `docs/technical/database.md` — add `clarity_live_invites` table and the new `clarity_sessions` columns to the schema reference.

## Test Coverage Strategy

**Generated by `/generate-tests` — 7 files, 43 tests + 6 UAT scenarios.**

### Files

| File | Type | Count |
|---|---|---|
| `e2e/integration/p703-letter-sourced-live-migration.spec.ts` | Integration (P270: MANDATORY migration test) | 14 |
| `e2e/p703-letter-sourced-live.spec.ts` | E2E (two-party) | 10 |
| `e2e/a11y/p703-accessibility.spec.ts` | Accessibility | 5 |
| `src/tests/p703-baseline-ratings.test.ts` | Unit (Vitest) | 8 |
| `src/tests/p703-use-open-live-invite.test.ts` | Unit (Vitest) | 6 |
| `e2e/helpers/test-letter-session.ts` | Helper (new) | — |
| `features/uat/p703.md` | UAT scenarios | 6 |

### Security → canary mapping

Each finding in `### Security Review` has a paired canary test in the migration spec:

| Security finding | Canary |
|---|---|
| RLS-1: UPDATE WITH CHECK carries target_listener predicate | **a** — non-recipient UPDATE → 42501 |
| RLS-4: SELECT gates letter-sourced rows | **b** — unauth SELECT → 0 rows |
| RLS-2: INSERT validates letter authorship | **c** — non-author INSERT foreign `source_letter_id` → error |
| RLS-3: author can only invite delivery recipient | **d** — author invites non-recipient → error |
| Authz-2: `complete_clarity_session` caller check | **e** — non-participant RPC → error |

Atomicity (session.status + invite.closed_at in one RPC) and unique partial index (`UNIQUE (target_user_id) WHERE closed_at IS NULL`) are also locked by integration tests.

### What is NOT tested (and why)

- **Resend rate-limit in browser** — server-enforced via DB CHECK/trigger; integration exercises the DB directly, which is sufficient.
- **Cron orphan cleanup** — infra, not app code. Tested by seeding stale row and asserting cron would match (not invoking cron).
- **`letter_predictions` SELECT RLS audit** — pre-flight Step 0 of Build Sequence on an existing P581 table; covered by P581's own suite plus a P703 canary if the audit tightens the policy.
- **Logged-out deep-link preservation through auth redirect** — covered in UAT-5 (requires real login flow).

### Pyramid

```
       /\
      /  \   10 E2E
     /____\
    /  14  \   integration
   /________\
  /  14 unit \
 /____________\
```

Total automated: **43 tests**. Run time estimate: ~45s unit + ~90s integration + ~3min E2E.

## Implementation Tasks

### Consistency Check Summary

- **AC coverage:** All 6 ACs map to tasks. No gaps.
- **UX–Arch drift:** UX Notes specify a "Verifying: {story title} (from letter)" header on the listener's first /live screen. Not listed in `### Files to Modify` — captured in Task 6 scope to avoid omission.
- **Security blockers in Build Sequence:** All §§ (RLS-1 through Authz-3) are addressed in Step 1 migration. Step 0 (pre-flight `letter_predictions` RLS audit) is correctly first. No out-of-order blockers.

---

### Task 1 — Pre-flight: Audit `letter_predictions` SELECT RLS

- **Files:** `supabase/migrations/` (read-only audit; may produce a new migration if tightening required)
- **Spec refs:** `### Implementation Approach > #### Build Sequence > Step 0` (line ~363); `### Security Review > RLS` bullet 5 (line ~335)
- **Tests:** `e2e/integration/p703-letter-sourced-live-migration.spec.ts` — canary for `letter_predictions` SELECT gate if policy is tightened
- **Depends on:** nothing
- **Verify:** Query `letter_predictions` RLS in Supabase; confirm speaker-always / listener-after-reveal gate is active or write it. Document result (tightened or confirmed-ok) in a comment at the top of the Step 1 migration.
- [x] Complete

---

### Task 2 — Migration: Schema, RLS, Realtime, Complete-Session RPC

- **Files:**
  - `supabase/migrations/YYYYMMDDHHMMSS_p703_letter_sourced_live.sql` (new)
- **Spec refs:** `#### Build Sequence > Step 1` (lines ~364–372); `### Architecture Decisions > AD1, AD2, AD5` (lines ~236–307); `### Security Review` (lines ~329–357)
- **Tests:** `e2e/integration/p703-letter-sourced-live-migration.spec.ts` — all 14 tests including 5 RLS canaries (a–e) + atomicity + unique-index tests
- **Depends on:** Task 1 (pre-flight result informs whether a `letter_predictions` policy change is included here)
- **Verify:**
  - `./scripts/migrate.sh` against test DB succeeds (zero errors)
  - `mcp__supabase__list_tables` shows `clarity_live_invites`
  - `curl` GET on `clarity_live_invites` with no auth returns 0 rows (RLS gate active)
  - `mcp__supabase__list_tables` confirms `clarity_sessions` has `source_story_id`, `target_listener_id` columns
- [x] Complete

---

### Task 3 — Migration: Cron Orphan Cleanup

- **Files:**
  - `supabase/migrations/YYYYMMDDHHMMSS_p703_live_invites_cron.sql` (new)
- **Spec refs:** `#### Build Sequence > Step 2` (line ~373); `### Architecture Decisions > AD6` (lines ~310–318)
- **Tests:** `e2e/integration/p703-letter-sourced-live-migration.spec.ts` — cron coverage note: seed stale row, assert cron SQL would match it (does not invoke cron directly)
- **Depends on:** Task 2 (table must exist before scheduling cron)
- **Verify:** Migration runs clean on test DB; `pg_cron` job appears in `cron.job` table
- [x] Complete

---

### Task 4 — Data Layer: Extend `api.ts`

- **Files:**
  - `src/app/data/api.ts` (modify)
  - `src/app/types/index.ts` (modify)
- **Spec refs:** `#### Build Sequence > Step 3` (lines ~374–376); `### Technical Analysis > Reuse inventory` (lines ~218–229); `### Architecture Decisions > AD3, AD4, AD5`
- **Tests:**
  - `src/tests/p703-baseline-ratings.test.ts` — 8 unit tests for `getLetterBaselineRatings`
  - `src/tests/p703-use-open-live-invite.test.ts` — 6 unit tests (hook tests depend on this layer)
- **Depends on:** Task 2 (new DB columns and table must exist)
- **Verify:**
  - `getLetterBaselineRatings` returns `{ speakerRating, listenerRating }` from test fixture data seeded in migration spec
  - `createClaritySession` with letter opts inserts correct FK columns
  - TypeScript compiles with no errors on modified types
- [x] Complete

---

### Task 5 — Hook: `useOpenLiveInvite`

- **Files:**
  - `src/app/hooks/useOpenLiveInvite.ts` (new)
- **Spec refs:** `#### Build Sequence > Step 4` (line ~377); `### Architecture Decisions > AD4` (lines ~268–273); `### Technical Analysis > Reuse inventory` row "Unread badge hook"
- **Tests:**
  - `src/tests/p703-use-open-live-invite.test.ts` — all 6 unit tests
- **Depends on:** Task 4 (`subscribeToLiveInvites` must exist in api.ts)
- **Verify:** Hook returns `{ invite: null, loading: false }` when no open invite; returns correct shape when invite row seeded in test DB
- [x] Complete

---

### Task 6 — /live State Machine: Phase Skip + Waiting Screen Changes

- **Files:**
  - `src/app/pages/clarity-live-page.tsx` (modify)
- **Spec refs:** `#### Build Sequence > Steps 6` (lines ~379–381); `### Architecture Decisions > AD3` (lines ~258–266); `### Security Review > Data Protection` bullet 4; `## UX Notes > Pre-loaded /live visual cue` (line ~170)
- **Tests:**
  - `e2e/p703-letter-sourced-live.spec.ts` — tests 1–5 covering phase skip, pre-loaded ratings, waiting screen invite panel
  - `e2e/a11y/p703-accessibility.spec.ts` — 5 accessibility tests on /live screens
- **Depends on:** Task 4 (needs `getLetterBaselineRatings`, `completeClaritySession`, updated `ClaritySession` type)
- **Verify:**
  - When `targetListenerId != null`: session-load effect initializes `ratingPhase: 'explain-back'` not `'idle'`
  - Share button hidden; waiting panel shows "Invite sent to {listener} · [Resend]"
  - "Verifying: {story title} (from letter)" header visible to listener on first screen (UX note coverage)
  - End-session path routes through `completeClaritySession` for letter-sourced sessions
  - Paraphrase reveal guarded by `auth.uid() IN (creator_profile_id, target_listener_id)` client-side (defense-in-depth, Security §Data-2)
- [x] Complete

---

### Task 7 — Nav Integration: Badge + Inbox Row

- **Files:**
  - `src/app/components/navigation/bottom-nav.tsx` (modify)
  - `src/app/components/navigation/simple-navigation.tsx` (modify)
  - Inbox tab component on `feature/letters-ship` (letters-page.tsx or equivalent) (modify)
- **Spec refs:** `#### Build Sequence > Step 5` (line ~378); `## Solution > Inbox invite` (lines ~92–102)
- **Tests:**
  - `e2e/p703-letter-sourced-live.spec.ts` — tests 6–8 covering inbox badge, invite row render, tap-to-join
  - `e2e/a11y/p703-accessibility.spec.ts` — badge and inbox row a11y
- **Depends on:** Task 5 (hook), Task 4 (data shape for invite display)
- **Verify:**
  - Unread badge increments by 1 when a live invite row exists with `closed_at IS NULL`
  - Inbox row renders "{author name} invited you to verify **{story title}** — Join" above unread letters
  - Tapping Join navigates to `/live/<code>`
  - Badge decrements when `closed_at` is set (realtime update)
- [x] Complete

---

### Task 8 — StoryWalk Button + Prop-Surface Extension

- **Files:**
  - `src/app/components/letters/start-clarity-session-button.tsx` (new)
  - `src/app/components/letters/story-walk.tsx` on `feature/letters-ship` (modify — add per-story button)
  - `src/app/data/letters-service.ts` on `feature/letters-ship` (modify — extend `ResultsProfileData` with `id: string`)
  - `src/app/pages/letter-results-page.tsx` on `feature/letters-ship` (modify — thread `senderId`/`receiverId` into StoryWalk)
- **Spec refs:** `#### Build Sequence > Step 7` (line ~382); `### Architecture Decisions > AD7`; `## Solution > The action` (lines ~43–54)
- **Tests:**
  - `e2e/p703-letter-sourced-live.spec.ts` — tests 9–10 (start button visible, author-only gate)
  - `e2e/integration/p703-letter-sourced-live-migration.spec.ts` — RLS-2 canary (non-author INSERT blocked)
- **Depends on:** Task 4 (`createClaritySession` extended signature; `cancelLiveInvite`), Task 2 (migration deployed — INSERT policy active)
- **Integration notes (post-P705 check, 2026-04-14):**
  - **No last-story CTA exists to remove.** Current `story-walk.tsx` last-story branch only renders "Previous Story + Back to Letters." D10's removal step is moot — skip it.
  - **P705's `onPositionSelect?` prop is orthogonal** to the new button. No conflict.
  - **`ResultsProfileData` lacks `id`.** Extend the interface with `id: string` and populate in `getLetterResults()` (one extra field in the existing query). Then add two new props to `StoryWalk`: `senderId: string` and `receiverId: string | null`, and pass them from `letter-results-page.tsx` (use `senderProfile.id` / `receiverProfile?.id ?? null`).
  - **Author gate uses `perspective === 'sender'`** (StoryWalk already has this prop) — don't re-derive from ID comparison.
  - **Insertion point:** inside `<div className="px-4 pb-28 space-y-6">`, after `LiveStoryCardExpanded`, gated on `perspective === 'sender'`.
- **Verify:**
  - Button "Start a clarity session" appears below story card for letter author only (not visible to receiver viewing own results)
  - Tapping: creates session with `source_letter_id`, `source_story_id`, `target_listener_id` populated; inserts `clarity_live_invites` row; navigates facilitator to `/live/<code>`
  - Button is disabled (tooltip "Invite already pending") when an open invite exists for this listener (unique partial index enforcement via client-side check on existing invite)
- [x] Complete

---

### Task 9 — DB Schema Docs Update

- **Files:**
  - `docs/technical/database.md` (modify)
- **Spec refs:** `#### Files to Modify` last bullet (line ~402)
- **Tests:** none (doc task)
- **Depends on:** Task 2 (confirmed column names from migration)
- **Verify:** `clarity_live_invites` table documented; `clarity_sessions` entries for `source_story_id` and `target_listener_id` added; `complete_clarity_session` RPC noted
- [x] Complete

---

**Total tasks: 9. Sequential chain: 1 → 2 → 3 (infra); 2 → 4 → 5, 6 (data+hooks+/live, parallelizable after Task 4); 5+4 → 7; 4+2 → 8; 2 → 9. Tasks 5, 6, 7, 8, 9 can proceed in parallel once Task 4 is done. Critical path: 1 → 2 → 4 → 6.**
