---
status: week
type: task
rank: 1000704.0
workstream: C2
created_date: '2026-04-14'
tags: [letters, positions, refactor, supersedes-d50]
feature_type: backend
delivery_stage: dev
status: in-progress
pipeline_ran: [create-spec, challenge-prd, architect, dev]
---

# P705: Letter positions live everywhere — supersede D50

## Problem

**Situation:** Position buttons on `/letter/:id/results` (both sender and receiver perspectives) render disabled and empty. The viewer's own previously-submitted position is not displayed. Users see a grey, uninteractive button row on their own point cards.

**Complication:** This is not a simple rendering bug. The root cause is architectural: `letter_point_responses` (INSERT-only, per D50) stores letter answers separately from `point_positions` (live, editable on `/story/[id]`). The two tables never sync. Commits `9b8821eb` and `4bdaef19` thrashed between "hidden / disabled+filled / disabled+empty" without resolving the underlying duplication. P699's UX mockup expected a filled button; the implementation dropped the data path.

**Question:** Do we keep two tables (frozen letter answers vs. live stance) or collapse to one (positions are live everywhere)? Founder decision (2026-04-14): collapse. Letters freeze *content*; positions are *state* and should be live.

This spec implements the collapse and supersedes D50.

## Appetite

**High blast radius** (touches letter reading flow, letter results page, gap computation, preview flag handling — both authenticated and anon token paths). **Medium reversibility** — dual-write transition keeps `letter_point_responses` populated so we can flip reads back if product intent changes. **Low decision density** — product decisions made in the conversation leading to this spec (H2 model, single live stance).

## Solution

Collapse letter-answer storage into `point_positions` as the single source of truth for displayed positions.

**Writes:**
- `letter_point_responses` is the **staging buffer** — always written on submit. It is the only place writes land for users who cannot yet write to `point_positions` (anon 1:1 readers before registration; fresh accounts before verification).
- `point_positions` is the **live display store** — written when the user has write access (authenticated + verified), and populated via replay in `persist_anonymous_completion` at registration/verification for deferred cases.
- Preview: no writes (unchanged — `previewMode` flag already blocks writes in `useLetterReadingState`).

**Reads:**
- Letter results page: read `point_positions` for both sender and receiver. Display viewer's own position as a filled, interactive button (same visual as `/story/[id]`). Other party's position stays rendered as the badge above the point.
- Letter reading flow (receiver): read sender's current `point_positions` to show the sender's stance. The letter's frozen `point_config.authorPosition` is no longer used for display.
- Gap computation: reads both parties' `point_positions` live; recomputes on change.

**Component changes:**
- `StoryWalk` stops passing `readOnly=true` unconditionally. The `readOnly` prop gets decomposed: auto-expand behavior stays, but button-disabling is dropped.
- `letter-snapshot-mapper.ts` stops hardcoding `userPosition: null`; the mapper receives the viewer's own `point_positions` and injects them.
- Results page (`letter-results-page.tsx`) fetches the viewer's `point_positions` for the points shown.

## Risks / Non-Goals

### Risks

- **Gap displayed on results becomes live and can change after viewing.** Mitigation: this is the intended H2 behavior — gap reflects current reality, not a moment. If confusing in practice, add a subtle timestamp or "last changed" hint later. Do not add freeze-on-view semantics.
- **Receiver's live stance may differ from what they clicked during reading** (if they change it on `/story/[id]` between reading and revisiting results). Mitigation: intended. Buttons show current stance. The historical `letter_point_responses` row still exists during transition.
- **Sender's live stance may differ from `authorPosition` baked into the letter.** Mitigation: intended. Sender's current position is what they think now. We're not showing the frozen value anywhere.
- **Anon token path diverges from authenticated path.** Mitigation: must update both `submit_point_response_by_token` RPC and the direct-insert path in `letters-service.ts`. Spec calls both out explicitly in Done-When.
- **Existing letter-reading sessions mid-flight during deploy.** Mitigation: dual-write transition means both tables stay populated; no breakage.

### Non-Goals

- **Do NOT drop `letter_point_responses` table.** It retains an ongoing role as the staging buffer for users without direct write access to `point_positions`. Not a transitional artifact.
- **Do NOT change `/story/[id]` behavior.** It already works correctly.
- **Do NOT change preview-mode semantics.** Preview stays silent (no writes). Do not persist anything from a sender's preview session.
- **Do NOT rebuild `LiveStoryCardExpanded`'s auto-expand behavior.** Only change how `readOnly` maps to button-disable — not how it maps to card expansion.
- **Do NOT touch P624 live/comparison grid.** That surface has its own position logic; out of scope.
- **Do NOT modify the receiver reading flow's interaction model** (`remaining-point-engage` phase). It already captures live interactive clicks; just redirect the write target.
- **Do NOT add "snapshot at send time" display hints, "updated since send" badges, or similar H1-residue UI.** We are committing to H2.

### Alternatives Considered

- **Keep D50, hide buttons on results (badge-only):** simpler code change but loses the per-point "your vs their" symmetry P699 designed for, and doesn't address the underlying dual-table mental model.
- **Keep D50, show viewer's own frozen letter answer as a read-only badge:** preserves audit but adds a third UI pattern (badge for frozen-self, badge for other party, button for live — too many concepts).
- **Direct cutover (drop `letter_point_responses` writes immediately):** faster but removes the safety net; if the H2 bet is wrong we'd need a new data path to recover audit.

**Chosen:** dual-write transition → single-table read → deferred table deprecation. Reversible if product intent shifts.

### Rollback Strategy

- Dual-write means `letter_point_responses` stays populated throughout the bet window.
- To revert: switch reads on results page back to `letter_point_responses`, restore `userPosition: null` mapper lines, restore `readOnly=true` in `StoryWalk`. Code-only rollback, no data migration.
- D50 reversal is recorded in `docs/decisions.md` as a revisitable decision, with the trigger ("users expect historical accuracy" / "receiver's answer visibly mutating causes trust issues") documented.

### Migration Plan

Schema changes: **none required**. Both tables already exist. This is a read/write redirection.

1. Update `useLetterReadingState.submitPointPosition` and its token counterpart to upsert into `point_positions` in addition to the existing `letter_point_responses` write.
2. Update `letter-results-page.tsx` data fetch to pull `point_positions` for the viewer (for both sender and receiver perspectives).
3. Update `letter-snapshot-mapper.ts` to accept and inject viewer `point_positions` into `userPosition`.
4. Update `StoryWalk` / `LiveStoryCardExpanded` to stop disabling position buttons under `readOnly` (split the two concerns).
5. Update gap computation on results page to read `point_positions` for both parties.
6. Update `docs/decisions.md`: add new decision superseding D50; mark D50 as superseded with link forward.

No data backfill required — pre-launch localhost test data is disposable. Any existing `letter_point_responses` rows without matching `point_positions` rows simply render as empty buttons on revisit; developer re-clicks to re-seed. Not an issue in production because we haven't shipped yet.

**Position history already captured.** `point_position_history` (defined `supabase/migrations/20260204_stories_points_calibration.sql:97`) logs every INSERT/UPDATE/DELETE on `point_positions` via trigger `trg_position_history`. If the H2 "positions mutate silently" concern materializes post-ship, surfacing history to users is a separate spec — data is already there.

## Done-When

- [ ] On `/letter/:id/results`, the viewer's own position renders as a filled interactive button (not grey/disabled) for every point where they have a `point_positions` entry.
- [ ] Tapping a position button on the results page updates `point_positions` and the gap number recomputes without page reload.
- [ ] Other party's position still renders as the badge above each point (visual unchanged).
- [ ] Receiver submitting a position during letter reading (authenticated path) writes to both `point_positions` and `letter_point_responses`.
- [ ] Receiver submitting via anon token path (`submit_point_response_by_token` RPC) writes to both tables.
- [ ] RLS smoke test: anon receiver completes letter via token path → `point_positions` row exists under their materialized user_id.
- [ ] Preview mode writes to neither table (verified: click position in preview, check both tables are unchanged).
- [ ] Results page gap computation reads `point_positions`, not `letter_point_responses`.
- [ ] `docs/decisions.md` contains new decision superseding D50, with date and rationale.
- [ ] Regression: `/story/[id]` behavior unchanged (positions interactive, live, bound to `point_positions`).
- [ ] Regression: letter reading flow `remaining-point-engage` phase still captures receiver's position interactively.
- [ ] Regression: revealed-gap step during letter reading still shows sender's position and receiver's position side-by-side correctly.

## Resolved Decisions

| # | Source | Finding | Resolution | Rationale |
|---|--------|---------|-----------|-----------|
| 1 | /challenge-prd | [BLOCK] Sender position source unclear — authorPosition vs point_positions | Dismissed. `authorPosition` is not a stored field on `point_config`; it's a frontend prop hydrated at read time from the story author's `point_positions` row (`story-detail-page.tsx:726` via `getMyPositionsForPoints`). Same table we're unifying on. | Verified against code; no split exists, no migration needed. |
| 2 | /challenge-prd | [BLOCK] Existing receiver answers become invisible post-change | Dismissed. Pre-launch, localhost-only test data. If buttons go blank, developer re-clicks. No prod impact. | User confirmed: not shipped to prod. Disposable test data. |
| 3 | /challenge-prd | [WARN] No named revert trigger for H2 bet (mutating positions could erode trust) | Reframed. Concern is about silent mutation, not H2 per se. `point_position_history` trigger already captures every change — if trust concerns surface post-ship, surfacing history is a separate spec. Data is already there. | Verified `trg_position_history` writes to `point_position_history` on every INSERT/UPDATE/DELETE. Transparency mechanism exists, just not surfaced to users. Out of P705 scope. |
| 4 | /challenge-prd | [WARN] Anon-path point_positions upsert requires RLS verification | Kept as Done-When item ("RLS smoke test: anon receiver completes letter → point_positions row exists under new user_id"). | Real feasibility risk; defer mechanics to /architect, verify in UAT. |
| 5 | /challenge-prd | [NOTE] IKEA-effect bias risk on H2 decision | Acknowledged. Proceeding with named post-ship observation: if a pair reports confusion about a changed position, revisit by surfacing `point_position_history` (new spec), not by reverting to D50. | H2 reversal is code-only (flip reads); bet is cheap to unwind. |

## Technical Architecture

### Technical Analysis

**Reuse inventory (verified in worktree `w2`):**

| Symbol | Location | Role today |
|---|---|---|
| `StoryWalk` | `src/app/components/letters/story-walk.tsx:41` | Paginated per-story view used on `/letter/:id/results`. Passes `readOnly` to `LiveStoryCardExpanded` unconditionally (line 131). |
| `LiveStoryCardExpanded` / `PointRow` | `src/app/components/partners/live-story-card-expanded.tsx:51,204` | Renders point card. `readOnly` prop (line 42) currently does double duty: (a) overrides `storyExpanded` default via `useState(readOnly)` (line 68), (b) disables `PositionButtons` (line 307 — `disabled={readOnly \|\| disablePositionButtons}`), (c) suppresses `shouldShowStoryCTA` and guest hint. Also exposes `onPositionSelect` (line 27) and `disablePositionButtons` (line 242) — already the decomposition hook we need. |
| `snapshotToStoryWithPoints` | `src/app/utils/letter-snapshot-mapper.ts:90` | Maps snapshot → `StoryWithPoints`. Line 108: `userPosition: null` (hardcoded). Line 109: copies frozen `authorPosition` → `profileSubjectPosition`. |
| `injectReceiverPositions` | `src/app/utils/letter-snapshot-mapper.ts:70` | Post-process utility that sets `profileSubjectPosition` from a `Map<pointId, PositionType>` and forces `userPosition: null` (line 79). |
| `LetterResultsPage` | `src/app/pages/letter-results-page.tsx:80` | Fetches via `getLetterResults`; `mapToStoryWalkItems` groups `letter_point_responses` by story (line 40-46) and injects them as `receiverPositions`. Sender's position, for the receiver perspective, is whatever the snapshot's `point_config.authorPosition` contains (frozen). |
| `useLetterReadingState.submitPointPosition` | `src/app/hooks/useLetterReadingState.ts:354` | Writes via `submitPointResponse` (auth) or `submitPointResponseByToken` (anon). `previewMode` gate at line 358 blocks DB write. |
| `submitPointResponse` | `src/app/data/letters-service.ts:357` | Direct `letter_point_responses` INSERT. |
| `submitPointResponseByToken` | `src/app/data/letters-service.ts:387` | Calls RPC `submit_point_response_by_token`. |
| `submit_point_response_by_token` RPC | `supabase/migrations/20260404110807_p642_anon_letter_engagement_rpcs.sql:6` | `SECURITY DEFINER` function. Validates token → `INSERT INTO letter_point_responses`. Granted to anon + authenticated. Does **not** touch `point_positions`. |
| Batched anon seal path | `supabase/migrations/20260403224331_p581_clarity_letters.sql:590` | Some anon flows write positions in bulk via `confirm_letter_response` (or similar) — same `letter_point_responses` target. No `point_positions` write. |
| `getLetterResults` RPC | `supabase/migrations/20260413100000_p699_get_letter_results.sql` | Returns snapshots, ratings, predictions, and `pointResponses` (letter_point_responses rows). Does not return `point_positions`. |
| `pointsService.setPosition` | `src/app/data/points-service-real.ts:848` | `upsert` into `point_positions` keyed on `(point_id, user_id)`. Reusable write path. |
| `pointsService.getMyPositionsForPoints(pointIds, userId)` | `src/app/data/points-service-real.ts:602` | Batch read of a user's positions on N points — returns `Map<pointId, PointPosition>`. Exactly the shape the mapper needs. |
| `pointsService.removePosition` | `src/app/data/points-service-real.ts:870` | DELETE path for toggle-off. |
| `point_positions` RLS | `supabase/migrations/20260204_stories_points_calibration.sql:374-389` | SELECT public; INSERT `WITH CHECK (auth.uid() = user_id)`; UPDATE/DELETE `USING (auth.uid() = user_id)`. **Anon role (no JWT) cannot INSERT directly — RLS requires `auth.uid()`.** Trigger `trg_position_history` (line 223) captures audit. Published to realtime. |
| `story-detail-page.tsx` | `src/app/pages/story-detail-page.tsx:726-738` | Reference implementation — fetches viewer's positions + story-author's positions via two parallel `getMyPositionsForPoints` calls. Already correct. |
| `letter-flow-content.tsx` | `src/app/components/letters/letter-flow-content.tsx:220,334` | Receiver reading flow. Reads `currentPoint.profileSubjectPosition` which today comes from frozen `point_config.authorPosition`. |
| `letter-preview-page.tsx` | `src/app/pages/letter-preview-page.tsx:28-82` | Preview wraps `useLetterReadingState` with `previewMode: true` and synthesises snapshots locally; existing guard already blocks writes. |

**Absent (must build):** no existing read path wires the viewer's `point_positions` into the letter-results mapper; no existing anon path touches `point_positions` (anon RLS blocks it); no existing code extends `submitPointPosition` to dual-write.

**Regression origin:** Commits `9b8821eb` and `4bdaef19` on `feature/letters-ship` toggled `StoryWalk`'s `readOnly` prop and the results-page position handling without decomposing the overloaded prop. Today the results-page position buttons are rendered (not hidden) but disabled AND empty because `readOnly={true}` disables them (line 307 of `live-story-card-expanded.tsx`) while `userPosition: null` (line 108 of the mapper) means they render empty.

**Data flow (current, to change):**
- Receiver submits position during reading → `submitPointPosition` → `letter_point_responses` INSERT only.
- Results page read → `getLetterResults` RPC returns `pointResponses` (letter_point_responses rows) → `mapToStoryWalkItems` groups by story → `injectReceiverPositions` sets `profileSubjectPosition` for sender viewer; receiver viewer gets sender's frozen `authorPosition` via `snapshotToStoryWithPoints`. Viewer's own position is never in the pipeline.

### Architecture Decisions

**Decision 1 — Staging + live write pattern (supersedes original D1 framing)**

- **Chosen:** `letter_point_responses` is the permanent **staging buffer** — always written on submit. `point_positions` is the **live display store** — written when the user has write access (authenticated + verified). Users without write access (anon 1:1, unverified fresh accounts) only land in staging; `persist_anonymous_completion` replays them into `point_positions` at registration/verification.
- **Rationale:** Security review revealed staging is not optional: RLS (`auth.uid() = user_id AND is_verified = true`) blocks direct `point_positions` writes for anon and unverified paths. Staging + replay gives a single pattern that covers all populations without SECURITY DEFINER bypasses on the auth path.
- **Trade-off:** Two tables, always. `letter_point_responses` is not deprecatable — it has an ongoing role.
- **Alternative rejected:** SECURITY DEFINER RPC on the auth path — adds a second write pattern for no gain; staging + replay already handles the unverified edge case.

**Decision 2 — Read path for viewer's own position on results page**

- **Chosen:** Reuse `pointsService.getMyPositionsForPoints(pointIds, user.id)` in the client-side fetch in `letter-results-page.tsx` (mirrors `story-detail-page.tsx:728`). Pass the resulting `Map<pointId, PositionType>` into `mapToStoryWalkItems`, which threads it into each story's `StoryWalkItem`. Extend the mapper (or add a companion injector) to set `userPosition` from that map.
- **Rationale:** Zero new RPC surface. One extra round-trip (small, batched, already used everywhere else). Keeps the `getLetterResults` RPC focused on sealed-letter data; `point_positions` is live and doesn't belong inside the sealed-bid RPC.
- **Trade-off:** Two sequential fetches on page load instead of one. Acceptable — `getMyPositionsForPoints` is a single indexed query.
- **Alternatives rejected:** (a) extend `getLetterResults` RPC to also return viewer positions — couples a live table into an RPC whose purpose is frozen-snapshot delivery; (b) join inside the mapper via a direct `supabase.from('point_positions').select` call — bypasses the service layer that already has the correct query pattern and error handling.

**Decision 3 — readOnly prop decomposition**

- **Chosen:** Keep `readOnly` on `LiveStoryCardExpanded` but stop using it as the "disable buttons" gate. The existing `disablePositionButtons` prop (line 242) is already separate — `StoryWalk` simply omits both `readOnly` and `disablePositionButtons`, and wires `onPositionSelect` to a new results-page handler. `defaultExpanded` (already exists) controls auto-expand.
- **Rationale:** The decomposition already exists in the component API; the only code change in `StoryWalk` is deleting `readOnly` from the JSX (line 131) and passing `defaultExpanded={true}` + `onPositionSelect`. Minimum churn, maximum signal.
- **Trade-off:** `letter-flow-content.tsx` still uses `readOnly` in its own `PointRow` calls for the reveal phase — leave that untouched; `readOnly` semantics there remain correct (post-reveal no-interaction state).
- **Alternative rejected:** introduce a new `interactive: boolean` prop — redundant with inverse of `disablePositionButtons` and splits the API further.

**Decision 4 — Token RPC write policy (revised)**

- **Chosen:** Extend `submit_point_response_by_token` (SECURITY DEFINER) to conditionally upsert into `point_positions`. Condition: `ld.receiver_profile_id IS NOT NULL` AND that profile has `is_verified = true`. Otherwise skip the live write silently — the response stays in staging and will be replayed by `persist_anonymous_completion` at registration or verification. The staging insert into `letter_point_responses` always happens regardless.
- **Rationale:** Anon 1:1 readers never claim the delivery (`claim_letter_delivery` is `GRANT TO authenticated` only) so `receiver_profile_id` is NULL for them at submit time. A RAISE on NULL would break every anon 1:1 submit. Silent skip + replay keeps the staging write working and defers the live landing to the moment write access exists.
- **Trade-off:** Anon-only viewers see empty buttons on results page until they register. Optional UX nudge in Build Sequence step 5.
- **Required hardening (per security review):** explicit enum validation, authorization guard (`p_point_id` belongs to `v_letter_id`), NULL guard on `p_point_id`. See Build Sequence step 3.
- **Alternative rejected:** RAISE on NULL `receiver_profile_id` — breaks the entire anon 1:1 reading path.

**Decision 5 — Sender position is live everywhere (founder-resolved)**

- **Chosen:** Read sender's live `point_positions` for display in both the receiver reading flow's point-revealed phase AND the results page. `point_config.authorPosition` (frozen snapshot) is no longer used for display.
- **Rationale:** Founder decision during /architect review: P581 AD3 sealed-bid concerns `letter_predictions` (the sender's predicted-understanding value), not `point_positions`. Positions are state, not content; they are live everywhere per H2. Freezing the author's position for the reading flow would contradict the spec's explicit Solution statement and reintroduce the two-mental-models problem P705 exists to eliminate.
- **Trade-off:** If sender changes their position on `/story/[id]` between sending and receiver reading, the receiver sees the new position. Intended — that's the point of H2.
- **Alternative rejected:** frozen `authorPosition` for reading flow — was the architect's initial recommendation; overruled by founder.

**Decision 6 — Preview-mode guard extension**

- **Chosen:** The new `point_positions` upsert lives inside `submitPointPosition` in `useLetterReadingState.ts`, alongside the existing `letter_point_responses` write, behind the same `if (mode !== 'local' && !previewMode)` guard (line 358). The results-page interactive button handler is a separate write path that only runs on `/letter/:id/results` — a page the preview flow never visits. No additional guard needed.
- **Rationale:** Single guard site for reading-flow writes matches current code. Results-page writes are gated by route, not mode.
- **Trade-off:** If a future surface adds another caller of `submitPointPosition` outside the preview-gated hook, that surface must respect the same guard pattern. Document in the hook.
- **Alternative rejected:** move the preview guard into `pointsService.setPosition` — over-generalises; `setPosition` is used by `/story/[id]` where preview never applies.

### Security Review

**RLS Policies:**
- ⚠️ `point_positions` INSERT requires `auth.uid() = user_id` AND `profiles.is_verified = true` (`20260204_stories_points_calibration.sql:379-383`). D1's direct client upsert will **silently fail** for unverified authenticated users (notably P684 fresh-account-on-read users). Fix: route the `point_positions` write through a SECURITY DEFINER RPC, or require `is_verified=true` as precondition in the P684 account-creation flow.
- ⚠️ `point_positions` SELECT is `USING (true)` — **globally readable** (`20260204_stories_points_calibration.sql:377`). Once receiver upserts, sender of a one-to-many letter can poll and read receiver's stance before reveal. D50 currently hides this under `letter_deliveries`-scoped RLS on `letter_point_responses`. P705 introduces a **new information disclosure**. Requires either explicit founder-accepted risk or a scoped RLS SELECT policy on `point_positions` for active deliveries.
- ✅ `point_positions` UPDATE/DELETE only require `auth.uid() = user_id` — toggle-off via `removePosition` works for viewer on results page.

**Authentication:**
- ⚠️ D4 assumption "`receiver_profile_id` materialised before per-point submit" holds for **one-to-many** (P684 requires `auth.uid()`) but is **false for anon one-to-one**: `claim_letter_delivery` is `GRANT TO authenticated` only (`20260404102539_p642_claim_letter_delivery.sql:52`). Anon 1:1 recipients never claim before engaging. D4's "RAISE on NULL" would fire on every anon 1:1 per-point submit. Fix: for anon 1:1, skip the `point_positions` write (silent no-op) and defer to `persist_anonymous_completion` at registration replay; accept that anon 1:1 readers see empty buttons until they register.
- ✅ `submit_point_response_by_token` is SECURITY DEFINER; using `ld.receiver_profile_id` (not `auth.uid()`) for user_id in the upsert is correct where applicable.

**Authorization:**
- ⚠️ Existing `submit_point_response_by_token` does not verify `p_point_id` belongs to the letter identified by `p_token`. Today this only corrupts audit rows; after P705 it lets a malicious token-holder write `point_positions` rows for arbitrary points under their receiver_profile_id in a globally-readable table. Spec must add `EXISTS (letter_story_snapshots JOIN story_points ON story_id WHERE letter_id=v_letter_id AND point_id=p_point_id)` guard before upsert.
- ✅ Token → delivery → letter → stories → points scoping is the correct capability envelope once enforced.

**Input Validation:**
- ⚠️ RPC signature is `p_position TEXT`; `point_positions.position` is the 7-value Likert `position_type` enum. An unexpected value → cast raise → entire transaction aborts including the existing `letter_point_responses` INSERT — silent regression of current write. Fix: validate `p_position IN ('strongly_disagree', ..., 'strongly_agree')` and return false cleanly on mismatch, before the cast.
- ⚠️ Add explicit NULL guard on `p_point_id` before `point_positions` upsert (current `letter_point_responses` insert no-ops on ON CONFLICT; `point_positions` would raise on NULL PK).

**Data Protection (Sealed-Bid):**
- ✅ D5 (frozen `authorPosition` during in-flight reading, live only on results page) preserves P581 AD3 for the sender→receiver direction. The receiver's reveal moment uses the snapshot value.
- ⚠️ Reverse direction (receiver→sender) is newly leaked by global `point_positions.SELECT` — see RLS Policies ⚠️ above. This is the new sealed-bid concern introduced by P705.

**Forward-Only Guarantee:**
- ✅ `letter_point_responses` INSERT-only + `ON CONFLICT DO NOTHING` preserved. D1 dual-write keeps audit trail intact; `point_positions` is UPDATE-allowed by design.
- ⚠️ If anon 1:1 skips `point_positions` writes (per Authentication fix above), Done-When "filled buttons on results" cannot hold for that path until account registration replay. Spec must state explicit UX for pre-registration anon 1:1 (e.g., "positions shown on results after registration replay; anon-only viewers see empty buttons with a hint").

**Preview Mode:**
- ⚠️ D6 relies on routing invariant ("preview never visits results"), not enforced by code. Defense-in-depth: the new `handleResultsPositionChange` handler should also check `previewMode` if any future preview variant embeds results-page UI. Minor.

**One-to-Many Path:**
- ⚠️ `persist_anonymous_completion` (`20260403224331_p581_clarity_letters.sql:536-611`) is the registration-replay path for deferred anon engagement. Build Sequence step 4 must explicitly extend this RPC with the `point_positions` upsert loop using `v_caller_id` — not only the per-point RPC. This is where anon 1:1 readers' positions land post-registration.
- ⚠️ Use `user_id = COALESCE(ld.receiver_profile_id, auth.uid())` with RAISE only if both NULL, to handle stale-JWT edge case during one-to-many claim-to-submit window.

### Implementation Approach

**Worktree:** feature/letters-ship (w2) — implementation continues on existing branch, not a new worktree.

#### Resolved post-security-review (2026-04-14)

- **Sealed-bid leak dismissed** — `point_positions.SELECT USING (true)` is pre-existing (used by `/story/[id]`). P705 doesn't widen exposure; a snooping sender would need DB access, not UI. The letter reading UI enforces "receiver can't see author's position until they submit their own." No RLS change needed.
- **Single pattern for all deferred-write cases** — anon 1:1 readers AND fresh unverified accounts both write only to `letter_point_responses` at submit time; `persist_anonymous_completion` replays into `point_positions` at registration/verification. No SECURITY DEFINER bypass on the auth path.

#### Build Sequence

**Path selection:** authenticated receivers call `submitPointResponse` in `letters-service.ts` (step 2). Anon (token-only) receivers call `submit_point_response_by_token` RPC (step 3). Existing dispatch in `useLetterReadingState.submitPointPosition` (`src/app/hooks/useLetterReadingState.ts:354-415`) stays — it already branches on token vs delivery_id.

1. Write a failing canary test at `src/tests/letter-results-page.test.ts` (extend the existing file; add a new e2e spec under `e2e/` only if unit-level coverage is insufficient for the `point_positions` write assertion). Assert: after an authenticated+verified receiver calls `submitPointResponse`, (a) a `point_positions` row exists for (point_id, user_id), and (b) the rendered `LiveStoryCardExpanded` position button for that point is not disabled and shows the selected value as filled.
2. **Auth+verified path:** `submitPointResponse` in `letters-service.ts` writes `letter_point_responses` (existing) AND upserts `point_positions` (new). Direct client upsert — RLS passes for verified users.
3. **Unverified / anon path in `submit_point_response_by_token` RPC** (new migration): always insert into `letter_point_responses` (existing). Additionally upsert into `point_positions` **only when `ld.receiver_profile_id IS NOT NULL` AND that profile is `is_verified=true`**. Otherwise skip the live write silently — the response stays in staging. Additions:
   - Explicit enum validation: `IF p_position NOT IN ('strongly_disagree','disagree','slightly_disagree','neutral','slightly_agree','agree','strongly_agree') THEN RETURN false` before cast.
   - Authorization guard: `EXISTS (letter_story_snapshots lss JOIN story_points sp ON sp.story_id = lss.story_id WHERE lss.letter_id = v_letter_id AND sp.point_id = p_point_id)`.
   - NULL guard on `p_point_id`.
4. **Registration/verification replay:** extend `persist_anonymous_completion` (`20260403224331_p581_clarity_letters.sql:536-611`) via new migration with a `point_positions` upsert loop using `v_caller_id` — copies all staged `letter_point_responses` rows for that delivery into the live table. This is where anon 1:1 and previously-unverified positions become live.
5. **Results page UX for deferred case:** if viewer has staged rows in `letter_point_responses` that haven't replayed (user not yet verified), render empty buttons with an inline nudge ("Verify your email to save your positions"). Not blocking for initial ship if the deferred case is rare — track as polish.
5. In `letter-results-page.tsx`, add a second fetch: `pointsService.getMyPositionsForPoints(allPointIds, user.id)`. Thread the result into `mapToStoryWalkItems` as a new parameter.
6. Extend `letter-snapshot-mapper.ts` — add an injector (e.g. `injectUserPositions(story, map)`) symmetric with `injectReceiverPositions`, and call it unconditionally in `mapToStoryWalkItems`. Remove the hardcoded `userPosition: null` at `snapshotToStoryWithPoints:108` only if safe for all call sites (or leave it and rely on the injector — simpler).
7. In `story-walk.tsx`, remove the `readOnly` prop from `<LiveStoryCardExpanded>` (line 131). Add `defaultExpanded={true}` (points shown by default on results). Add `onPositionSelect={handleResultsPositionChange}` — a new handler that upserts via `pointsService.setPosition` (or removes via `removePosition` when position === null) and refreshes the local `storyItems` state so gap recomputes.
8. Verify gap recomputation: today gap uses `rating - prediction` (line 54) — that's story-level and doesn't depend on positions. No change needed for gap logic. If the spec means "per-point agreement gap" re-verify scope; current results page doesn't show per-point gaps.
9. Update `docs/decisions.md`: new decision superseding D50; mark D50 as superseded with forward link.
10. Run canary test + full test suite + UAT.

#### Files to Create

- `supabase/migrations/<timestamp>_p705_dual_write_point_positions.sql` — `CREATE OR REPLACE` for `submit_point_response_by_token` with added `point_positions` upsert; same for the bulk anon RPC from migration `20260403224331`.

#### Files to Modify

- `src/app/data/letters-service.ts` — `submitPointResponse` gains a `point_positions` upsert alongside the `letter_point_responses` INSERT.
- `src/app/pages/letter-results-page.tsx` — add `getMyPositionsForPoints` fetch; pass map to `mapToStoryWalkItems`; add `handleResultsPositionChange` that calls `pointsService.setPosition` / `removePosition` and updates local state.
- `src/app/utils/letter-snapshot-mapper.ts` — add `injectUserPositions(story, map)`; continue to hardcode `userPosition: null` in `snapshotToStoryWithPoints` (base case) and let the injector fill it.
- `src/app/components/letters/story-walk.tsx` — drop `readOnly`, add `defaultExpanded={true}`, add `onPositionSelect`, pass viewer-position map through to injector.
- `docs/decisions.md` — new "P705 — letter positions live everywhere" entry with date and rationale; add `[SUPERSEDED by P705]` marker to D50.
- `src/tests/letter-snapshot-mapper.test.ts` — extend coverage for new injector.
- New test(s) in `src/tests/` (or e2e) — dual-write verification + anon RLS smoke.
