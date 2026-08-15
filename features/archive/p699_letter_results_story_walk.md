---
status: rejected
type: story
rank: 1000699.0
tags: [letters, results, ux, reading-flow]
created_date: '2026-04-12'
flow: dev
delivery_stage: decompose
pipeline_plan: [create-spec, challenge-prd, ux, architect, ui, generate-tests, decompose, dev, verify]
pipeline_ran: [create-spec, challenge-prd, ux, architect, ui, generate-tests, spec-review, decompose]
pipeline_skipped: []
uat_file: features/uat/p699.md
test_files:
  - e2e/integration/p699-letter-results-migration.spec.ts
  - e2e/integration/p699-inbox-progress-migration.spec.ts
  - e2e/p699-letter-results-sender.spec.ts
  - e2e/p699-letter-results-receiver.spec.ts
  - e2e/p699-inbox-progress.spec.ts
  - e2e/a11y/p699-accessibility.spec.ts
---

# P699: Letter Results Story Walk

> **Builds on:** [P581](archive/p581_letters_mvp.md) (letter results page), [P696](../done/2026-04-17/p696_letter_reading_flow_polish_and_refactor.md) (shared LetterFlowContent), [P673](p673_letter_reading_reuses_live_components.md) (component reuse pattern)
> **Followed by:** P700 (aggregate overview for one-to-many — backlog)

## Problem

**Situation:** After a letter exchange, both sender and receiver land on completion screens that show bare data — "Story 1: Your prediction: 8" with no story content, no points, no gap visualization. The sender results page (`/letter/:id/results`) lists story numbers with predictions. The receiver completion summary shows gap numbers but no story text or point breakdowns.

**Complication:** The existing components for rich story display already exist and are battle-tested — JourneyToUnderstanding, GapBanner, LiveStoryCardExpanded with uncollapsed points, position badges. The letter reading flow itself uses all of these. But the results pages don't reuse any of them. The result: the most important moment (seeing what you learned) looks like a debug screen.

**Question:** How do we replace both completion views with a paginated story-by-story walk that reuses existing components and shows the full picture — story content, points with both parties' positions, prediction vs rating gap — for both sender and receiver?

## Appetite

Medium blast radius (replaces sender results page + receiver completion summary — two existing UIs). Reversible (branch work, old components stay until merge). Medium decision density — layout decisions resolved in conversation, RPC design needed for data access.

## Solution

Replace both the sender results page and receiver completion summary with a shared **story walk** — a paginated view showing one story at a time with full context.

### Per-story layout (top to bottom)

1. **Story counter** — "Story 1 of 3"
2. **JourneyToUnderstanding** — sender prediction vs receiver rating (existing component, compact mode)
3. **GapBanner** — gap insight with badge (existing component)
4. **LiveStoryCardExpanded** — full story card with `readOnly` + `defaultExpanded` — all points visible with position badges above each point showing the other party's position (existing pattern from PointRow)
5. **Fixed bottom bar** — Previous / Next Story navigation

### Two perspectives, one component

| Aspect | Sender sees | Receiver sees |
|--------|------------|---------------|
| Journey labels | "You predicted: 8" / "They rated: 6" | "You rated: 6" / "They predicted: 8" |
| Position badges above points | Receiver's positions | Author's positions |
| Incomplete stories | "Not yet rated" placeholder | N/A (receiver completes before seeing results) |

### Progressive results for sender

Sender can open results at any time, even before receiver completes:
- **Sent:** Predictions only, "Waiting for response" in Journey
- **In progress:** Completed stories show full comparison; pending stories show prediction + "Not yet rated"
- **Completed:** Full comparison on all stories

### Data access

New RPC `get_letter_results(letter_id)` returns sender predictions + receiver ratings + receiver point responses in one call. Future-proof for /live preloading (letter results become "round 0" of session history).

### Entry points

- **Sender:** Sent tab → Results button → `/letter/:id/results` → story walk
- **Receiver (first completion):** Confetti celebration → "See Summary" → navigates to `/letter/:letterId/results?delivery=:deliveryId` (new page with ClarityLandingLayout)
- **Receiver (revisit from inbox):** Inbox → Open → navigates directly to `/letter/:letterId/results?delivery=:deliveryId` (no celebration)

### Navigation

- Standard `ClarityLandingLayout` with top menu (not chromeFree) — this is a review page, not immersive
- Fixed bottom bar with "Previous Story" / "Next Story" text buttons
- Last story: primary /live CTA if any gap > 0, secondary "Back to Letters" link
- Standard "Open Story" buttons on each story card (existing pattern from profiles/drafts)

### Inbox progress indicator

Receiver's inbox items show per-story progress: "Step 1 of 3 completed" with progress text below the existing item layout.

## Risks / Non-Goals

### Risks

1. **RLS blocks sender from reading receiver data.** Sender needs `story_verifications` (ratings) and `letter_point_responses` (positions) for their letter's receiver. Mitigation: SECURITY DEFINER RPC that validates sender ownership before returning data.
2. **Regressions in receiver reading flow.** The completion summary is embedded in the reading flow state machine. Replacing it could break the phase transitions. Mitigation: generate tests locking current behavior before modifying.
3. **Component prop mismatches.** JourneyToUnderstanding and LiveStoryCardExpanded have many props — using them in a new context may surface edge cases. Mitigation: reuse exact prop patterns from LetterFlowContent (which already composes these).

### Non-Goals

- Do NOT build the aggregate/overview view for one-to-many letters — that's P700
- Do NOT modify the letter reading flow itself (LetterFlowContent, useLetterReadingState) — only the completion/results endpoints
- Do NOT add real-time updates (polling for receiver progress) — sender refreshes manually
- Do NOT change the sent tab UI beyond the existing "Results" button entry point
- Do NOT add new database tables or columns — use existing data with a new RPC

## Done-When

- [ ] Sender results page (`/letter/:id/results`) shows story walk with JourneyToUnderstanding, GapBanner, and full story card per story
- [ ] Receiver completion shows the same story walk after celebration screen
- [ ] Receiver revisit from inbox goes straight to story walk (no celebration)
- [ ] Both perspectives show the other party's position badges above each point
- [ ] Sender sees progressive results (incomplete stories show "not yet rated")
- [ ] Inbox items show story progress ("Step 1 of 3 completed")
- [ ] Previous/Next navigation works at bottom of each story
- [ ] Last story shows /live CTA when any story in the walk has gap > 0
- [ ] Top menu visible (not chromeFree layout)
- [ ] Standard "Open Story" buttons present on story cards

## Acceptance Criteria

- [ ] Sender can view results for a completed 1-to-1 letter and see all story content, points, and gap visualization
- [ ] Sender can view partial results for an in-progress letter (completed stories show comparison, pending show prediction only)
- [ ] Receiver sees results after completing a letter (celebration → walk)
- [ ] Receiver can revisit results from inbox without seeing celebration again
- [ ] Navigation between stories works (previous/next) with correct boundary handling (no previous on story 1, CTA on last story)
- [ ] Position badges above points correctly show the other party's position for both sender and receiver perspectives

## UX Notes

**States per story card:**
- **Complete:** Journey (both numbers) → GapBanner → Story card with both positions
- **Incomplete (sender only):** Journey (prediction only, "not yet rated" for receiver) → no GapBanner → Story card with author positions only
- **Zero points:** Journey → GapBanner → Story card with no point section (story text only)

**Empty state:** If letter has no completed stories and sender opens results, show the walk with all stories in "waiting" state. No special empty screen.

**Error state:** If RPC fails, show existing error pattern with retry link.

## UX Design

### User Flows

#### Flow 1: Sender Views Results (from Sent Tab)

1. Sender opens Letters page → Sent tab
2. Sender sees a letter card with "X of Y completed" and a "Results" button (visible when completedCount > 0)
3. Sender taps "Results" → navigates to `/letter/:id/results`
4. Page loads → RPC `get_letter_results(letter_id)` fetches sender predictions + receiver ratings + receiver point responses
5. Story walk displays Story 1 of N:
   - **JourneyToUnderstanding** (compact) — "You predicted: 8" / "They rated: 6" (or "Not yet rated" if incomplete)
   - **GapBanner** — gap insight with badge (hidden if story incomplete)
   - **LiveStoryCardExpanded** (readOnly, defaultExpanded) — full story text, all points uncollapsed, receiver's position shown above each point, sender's position on the position buttons
   - **"Open Story" button** on the story card (existing pattern)
6. Fixed bottom bar: "Previous Story" / "Next Story" text buttons
7. On last story: primary /live CTA (if any gap > 0), secondary "Back to Letters" link
8. Exit: top menu navigation or "Back to Letters" link

#### Flow 2: Receiver Completes Letter (First Time)

1. Receiver finishes rating the last story and responding to all its points
2. Celebration screen (chromeFree): confetti animation + "See Your Letter Summary" button (existing pattern)
3. Receiver taps "See Your Letter Summary" → navigates to `/letter/:letterId/results?delivery=:deliveryId` (new page with ClarityLandingLayout + top menu)
4. Results page detects receiver perspective, displays story walk:
   - **JourneyToUnderstanding** — "You rated: 6" / "They predicted: 8"
   - Author's position shown above each point, receiver's own position on position buttons
5. Navigation and exit same as sender flow (top menu + Previous/Next bottom bar)

#### Flow 3: Receiver Revisits from Inbox

1. Receiver opens Letters page → Inbox tab
2. Sees completed letter item with progress text: "Step 3 of 3 completed"
3. Taps "Open" → navigates directly to `/letter/:letterId/results?delivery=:deliveryId` (NO celebration, NO reading flow)
4. Results page identical to Flow 2 step 4

#### Flow 4: Sender Views Partial Results (In-Progress Letter)

1. Sender opens Results before receiver has completed all stories
2. Story walk loads with mixed states:
   - **Completed stories:** full comparison (Journey with both numbers → GapBanner → story card with both positions)
   - **Incomplete stories:** Journey shows prediction only + "Not yet rated" for receiver → no GapBanner → story card with author positions only (no receiver positions)
3. Sender refreshes page to check for updates (no real-time polling)

### Screen Designs

#### Story Walk Screen (shared by sender and receiver)

```
┌──────────────────────────────────┐
│  ☰  ClarityPledge      [Menu]   │  ← Standard ClarityLandingLayout
├──────────────────────────────────┤
│                                  │
│        Story 1 of 3              │  ← Centered counter, muted text
│                                  │
│  ┌────────────────────────────┐  │
│  │  JourneyToUnderstanding    │  │  ← compact mode, max-w-sm mx-auto
│  │  You predicted: 8          │  │
│  │  They rated: 6             │  │
│  └────────────────────────────┘  │
│                                  │
│  ┌────────────────────────────┐  │  ← -mt-3 (overlaps slightly)
│  │ 🔵 2 points gap            │  │  ← GapBanner
│  │ "You overestimated..."     │  │
│  └────────────────────────────┘  │
│                                  │
│  ┌────────────────────────────┐  │
│  │ Story Title                │  │  ← LiveStoryCardExpanded
│  │ Story text paragraph...    │  │    readOnly, defaultExpanded
│  │                            │  │
│  │ ┌──────────────────────┐   │  │
│  │ │ [Receiver: Agree]    │   │  │  ← Other person's position
│  │ │ Point 1 text         │   │  │    above the point
│  │ │ [Your position: ●●●] │   │  │  ← User's position buttons
│  │ └──────────────────────┘   │  │
│  │                            │  │
│  │ ┌──────────────────────┐   │  │
│  │ │ [Receiver: Disagree] │   │  │
│  │ │ Point 2 text         │   │  │
│  │ │ [Your position: ●●●] │   │  │
│  │ └──────────────────────┘   │  │
│  │                            │  │
│  │  [Open Story]              │  │  ← Existing button pattern
│  └────────────────────────────┘  │
│                                  │
│  (scroll space for bottom bar)   │
│                                  │
├──────────────────────────────────┤
│  ┌────────────────────────────┐  │  ← Fixed bottom bar
│  │ ← Previous    Next Story → │  │    z-50, rounded-t-[10px]
│  └────────────────────────────┘  │    border, bg-background, p-4
└──────────────────────────────────┘
```

#### Story Counter

- Text: "Story {n} of {total}" — centered, `text-sm text-muted-foreground`
- Appears above JourneyToUnderstanding with standard spacing

#### Fixed Bottom Bar

- Position: `fixed inset-x-0 bottom-0 z-50`
- Style: `rounded-t-[10px] border bg-background p-4` (matches existing letter flow pattern)
- Two text buttons side by side: "Previous Story" (left) / "Next Story" (right)
- Button style: `min-h-[44px]` touch target, standard text button styling
- Story 1: "Previous Story" hidden or disabled
- Last story: "Next Story" replaced by primary /live CTA (`bg-[#0044CC]`, `min-h-[44px]`, `max-w-[200px]`) when any gap > 0, plus secondary "Back to Letters" text link below

#### Celebration Screen (receiver first completion only)

- Existing pattern: confetti animation + centered message + "See Your Letter Summary" button
- No changes to existing celebration UI — only what comes AFTER changes (summary → story walk)

#### Inbox Progress Indicator

```
┌──────────────────────────────────┐
│ 📩  Alice sent you "Team Dynam…" │
│     Step 2 of 3 completed        │  ← New: progress text below title
│                          [Open]  │
└──────────────────────────────────┘
```

- Text: "Step {completed} of {total} completed" — `text-xs text-muted-foreground`
- A step = 1 story + all its attached points rated/responded
- Appears below the existing item text, above the action button row
- Only shown for in-progress letters (not yet fully completed)
- Fully completed: no progress text (the "Open" button implies done)

### Edge Cases & UI States

#### Per-Story States

**Complete story (both sender and receiver have data):**
- JourneyToUnderstanding: both numbers visible
- GapBanner: gap calculated and shown
- LiveStoryCardExpanded: all points with both parties' positions
- "Open Story" button active

**Incomplete story (sender only — receiver hasn't rated yet):**
- JourneyToUnderstanding: sender prediction shown, receiver side shows "Not yet rated" placeholder text
- GapBanner: hidden entirely (no gap to calculate)
- LiveStoryCardExpanded: story text and points visible, but only author positions shown (no receiver positions)
- "Open Story" button still active

**Zero points story (story exists but has no attached points):**
- JourneyToUnderstanding: numbers as normal
- GapBanner: as normal
- LiveStoryCardExpanded: story text only, no point section rendered

#### Error States

**RPC failure:** Standard error pattern — centered error message with "Try again" retry link. Occupies the full content area below the top menu. User taps "Try again" → page reloads and retries RPC.

**Letter not found / unauthorized:** Redirect to Letters page (same as existing unauthorized handling).

#### Loading State

**Initial load:** Skeleton placeholder matching the story walk layout — skeleton blocks for Journey, GapBanner shape, and story card outline. Single load for all stories (RPC returns everything in one call).

**Navigation between stories:** Instant (data already loaded) — no loading state needed for prev/next.

#### Empty State

**All stories incomplete (sender opened results before any completion):** Story walk with all stories in "Not yet rated" state. No special empty screen — the walk itself communicates the waiting state through each story's incomplete display.

### Accessibility

- **Keyboard navigation:** Tab cycles through Previous/Next buttons and "Open Story" links. Enter activates focused button.
- **Screen reader:** Story counter announced as "Story 1 of 3". JourneyToUnderstanding values read as "Your prediction: 8, Their rating: 6". GapBanner text fully readable. Point positions announced as "[Name]'s position: [position]".
- **ARIA:** Bottom navigation bar: `role="navigation"`, `aria-label="Story navigation"`. Previous/Next buttons: `aria-label="Previous story"` / `aria-label="Next story"`. Disabled Previous on story 1: `aria-disabled="true"`.
- **Color contrast:** All existing components already meet WCAG AA. Gap badge colors (green for 0, blue for >0) maintain 4.5:1 ratio.
- **Focus management:** When navigating to next/previous story, focus moves to story counter at top of content area (scroll-to-top behavior).

### Responsive Design

**Mobile (320px–767px):**
- Story walk content: full-width with standard page padding (px-4)
- JourneyToUnderstanding and story card: `max-w-sm mx-auto` (constrained width, centered)
- Fixed bottom bar: full-width, buttons side by side
- Touch targets: all buttons ≥ 44px height
- Content scrolls above fixed bottom bar with adequate bottom padding to prevent overlap

**Tablet (768px–1023px):**
- Same layout as mobile — single column, centered content
- Slightly more breathing room from page margins

**Desktop (1024px+):**
- Content centered in standard `ClarityLandingLayout` max-width container
- Same single-column layout — no multi-column (this is a focused reading experience)
- Fixed bottom bar constrained to content max-width

### Visual Context

**Density intent:** Spacious — the user just completed an emotional exchange and is reviewing what they learned about calibration gaps. This is a reflective moment, not a data-scanning task. Each story gets a full screen of breathing room.

**Visual reference:** Should feel like the story-revealed phase in the letter reading flow (`LetterFlowContent`) — centered content, generous vertical spacing between Journey/GapBanner/story card, single focal point per screen. The paginated one-at-a-time pattern mirrors how the reading flow itself presents stories.

## Technical Architecture

### Technical Analysis

**Current sender results page** (`letter-results-page.tsx`): 218 lines. Uses `getLetterForSender()` which returns `{letter, snapshots, deliveries, predictions}` via three parallel Supabase client queries. Renders bare text cards with "Story N" + prediction number + delivery status. Uses `FocusHeader` (chromeFree layout). Has no access to receiver ratings or point responses — RLS blocks sender from reading `story_verifications` and `letter_point_responses` for another user.

**Current receiver completion summary** (`letter-completion-summary.tsx`): 243 lines. Two-phase component (celebration -> summary). Uses `getCompletionSummary(deliveryId, storyIds)` which queries `story_verifications` (receiver's own ratings), `letter_predictions` (sealed-bid — visible after receiver rates), and `letter_point_responses` (receiver's own positions). Renders gap-sorted text cards. No story content, no point text, no JourneyToUnderstanding.

**LetterFlowContent** (`letter-flow-content.tsx`): The template. Lines 261-298 (story-revealed phase) compose exactly the pattern we need: `JourneyToUnderstanding` -> `GapBanner` -> `LiveStoryCardExpanded(hidePoints, readOnly)`. Fixed bottom bar pattern: `className="fixed inset-x-0 bottom-0 z-50 flex flex-col items-center rounded-t-[10px] border bg-background p-4"`.

**JourneyToUnderstanding** (exported from `live-mode-view.tsx`): Props include `checkerRating`, `responderRating`, `explainBackRatings`, `isChecker`, `displayPartnerName`, `checkerName`, `compact`. For story walk: follow `LetterFlowContent` pattern exactly — `isChecker={false}`, `checkerRating` = sender prediction, `responderRating` = receiver rating, `displayPartnerName` = sender name, `checkerName` = sender name, `explainBackRatings` = `[]`, `compact` = true. The `isChecker=false` path renders "You predicted" / "They rated" labels correctly for the letter context.

**LiveStoryCardExpanded**: `readOnly` auto-expands all points + hides PositionButtons. `defaultExpanded` = true for uncollapsed view. `hidePoints` = true hides points entirely (used in reading flow where points are separate cards). For story walk we want `readOnly` + `defaultExpanded` + `hidePoints` = false (points visible with positions). The `profileSubjectPosition` on each `PointSummary` is rendered as a badge above the point by `PointRow`. For story walk, we inject the other party's position into this field.

**snapshotToStoryWithPoints()** (`letter-snapshot-mapper.ts`): Maps `LetterStorySnapshot` -> `StoryWithPoints`. Already maps `authorPosition` from `point_config` into `profileSubjectPosition`. For sender perspective: we need to replace `profileSubjectPosition` with the receiver's position after calling this function.

**Data gap — sender perspective**: The sender cannot read `story_verifications` (receiver ratings) or `letter_point_responses` (receiver positions) via client-side queries due to RLS. Needs a SECURITY DEFINER RPC that validates sender ownership and returns this data.

**Data gap — receiver perspective**: Resolved by extending `get_letter_results` RPC to serve both perspectives (see Build Sequence step 1). Receiver calls the same RPC with `p_delivery_id` — the RPC validates `auth.uid() = letter_deliveries.receiver_profile_id`. `getCompletionSummary()` is no longer used for the results page.

**Inbox** (`inbox-tab.tsx`): Uses `get_inbox_items` RPC. Current `InboxItem` type has `completed_at` but no `stories_rated` or `total_stories` fields. The `letter_deliveries` table has `stories_rated` column. The RPC needs to return additional fields for progress display.

**Layout**: Current results page uses `FocusHeader` (chromeFree). Spec requires `ClarityLandingLayout` with top menu. Layout exists at `src/app/layouts/clarity-landing-layout.tsx`.

### Architecture Decisions

**AD1: New `get_letter_results` RPC vs. extending `getLetterForSender`**

- **Chosen:** New SECURITY DEFINER RPC `get_letter_results(p_letter_id UUID)`.
- **Rationale:** Sender needs receiver data (`story_verifications`, `letter_point_responses`) that RLS blocks on client-side. A single server-side function validates ownership and returns all data in one round-trip. Matches existing pattern (`get_inbox_items`, `get_letter_for_public_reading` are both SECURITY DEFINER RPCs).
- **Trade-off:** New migration + new service function. Acceptable — the alternative (relaxing RLS) would break sealed-bid guarantees.
- **Alternative rejected:** Adding RLS policies to let sender read receiver data. This would expose receiver positions to sender before the receiver completes (violating sealed-bid per-story reveal).

**AD2: Shared `StoryWalk` component vs. two separate implementations**

- **Chosen:** Single `StoryWalk` component with `perspective: 'sender' | 'receiver'` prop.
- **Rationale:** Both views have identical layout (counter -> Journey -> GapBanner -> story card -> bottom bar). Only differences: (1) which data maps to "your" vs "their" labels, (2) which position shows as badge. A single component with perspective prop eliminates duplication.
- **Trade-off:** Component takes a unified data shape — both callers must normalize their data into it. Small mapping overhead, but prevents divergence.
- **Alternative rejected:** Two components sharing sub-components. More code, more places to update.

**AD3: Position injection strategy**

- **Chosen:** Post-process the `StoryWithPoints` output from `snapshotToStoryWithPoints()` to swap `profileSubjectPosition` based on perspective.
- **Rationale:** `snapshotToStoryWithPoints()` maps `authorPosition` -> `profileSubjectPosition`. For sender view, we need receiver positions there instead. Swapping after the mapping is a 3-line transform per point — simpler than modifying the mapper's signature.
- **Trade-off:** Mutation after pure function output. Mitigated by creating a new array (no in-place mutation).
- **Alternative rejected:** Adding a parameter to `snapshotToStoryWithPoints()` to control position mapping. Would complicate the shared mapper for a single use case.

**AD4: Receiver completion — celebration navigates to results page**

- **Chosen:** Keep `LetterCompletionSummary` celebration phase intact. "See Your Letter Summary" button navigates to `/letter/:letterId/results?delivery=:deliveryId` — the same results page the sender uses, but with receiver perspective detected via the `delivery` query param. The summary phase is removed entirely from `LetterCompletionSummary`.
- **Rationale:** Both sender and receiver land on the same results page with `ClarityLandingLayout` (top menu, standard navigation). Clean separation: reading flow stays chromeFree/immersive, review has standard nav. Receiver revisit from inbox goes to the same URL. On mobile, bottom nav is hidden (`/letter/` is in `focusRoutes`), so the fixed Previous/Next bar has exclusive bottom space.
- **Trade-off:** Layout jump from chromeFree (celebration) to ClarityLandingLayout (results). Acceptable — celebration is a natural transition point.
- **Alternative rejected:** Embedding StoryWalk inside LetterCompletionSummary (keeps chromeFree layout). User has no top menu to navigate away, inconsistent with sender results view.

**AD5: Inbox progress — extend RPC vs. client-side count**

- **Chosen:** Extend `get_inbox_items` RPC to return `stories_rated` and `total_stories` for received letters.
- **Rationale:** `letter_deliveries.stories_rated` already tracks progress server-side. Adding two fields to the existing RPC (which already JOINs `letter_deliveries`) is cheaper than a separate query. Total stories comes from counting `letter_story_snapshots` for that letter.
- **Trade-off:** Migration to update the RPC. Low risk — additive change to existing function.

**AD6: Receiver revisit — direct navigation to results page**

- **Chosen:** Inbox "Open" button for completed letters navigates directly to `/letter/:letterId/results?delivery=:deliveryId` instead of loading the reading flow with `isRevisit`. The results page detects receiver perspective from the `delivery` query param.
- **Rationale:** With AD4 (celebration navigates to results page), the reading flow no longer renders results. Revisit goes straight to the results page — same URL, same layout, no celebration. Simpler than routing through the reading flow state machine just to skip all phases.
- **Trade-off:** `inbox-tab.tsx` navigation logic changes for completed received items. Minor — one conditional URL change.

### Security Review

**RLS Policies:**
- ✅ Existing `letter_predictions` sealed-bid RLS well-designed: sender always reads, receiver reads only after matching `story_verifications` row exists. The new RPC runs as SECURITY DEFINER and reads directly — must replicate this constraint internally.
- ✅ `letter_point_responses` SELECT already permits sender access via `_is_letter_sender` helper. No new policy needed.
- ✅ `story_verifications` source-aware SELECT policy (P581 migration) correctly scopes `source='letter'` rows. Sender is `speaker_id` in letter verifications.
- ⚠️ **SECURITY DEFINER bypasses all RLS.** The RPC must validate `auth.uid() = clarity_letters.sender_id` before returning anything. Without this check, any authenticated user who guesses a `letter_id` UUID can read another sender's data.

**Authentication:**
- ✅ RPC granted to `authenticated` only (not `anon`). Matches existing `seal_and_send_letter` pattern.
- ⚠️ Do NOT grant to `anon` — unlike token-based RPCs, this has no token-based access path.

**Authorization:**
- ⚠️ **Critical: sender-only gate.** RPC must start with: `SELECT sender_id INTO v_sender FROM clarity_letters WHERE id = p_letter_id AND status = 'sealed'; IF v_sender IS NULL OR v_sender != auth.uid() THEN RETURN NULL; END IF;` Return NULL on failure — don't leak existence.
- ⚠️ For 1-to-many scope: RPC accepts `letter_id` only and returns data for deliveries. P699 handles individual; P700 handles aggregate. Sender owns all delivery data by design.

**Input Validation:**
- ✅ UUID input type provides implicit format validation at PostgreSQL layer.
- ⚠️ Validate letter exists and `status = 'sealed'`. Return NULL (not exception) on invalid input to avoid leaking existence.

**Data Protection:**
- ✅ No PII newly exposed. RPC returns predictions (numbers), ratings (numbers), point positions (enum strings), story snapshots (already visible to sender).
- ⚠️ Do NOT return `receiver_email` or `invitation_token` in RPC response — only predictions, ratings, point positions, and snapshot metadata.
- ✅ Sealed-bid preserved post-completion: sender already knows own predictions; receiver data only appears after they rate. Document this in migration comments.

### Implementation Approach

#### Build Sequence

1. **Migration: `get_letter_results` RPC** — SECURITY DEFINER function that serves both perspectives. Accepts `p_letter_id UUID` and optional `p_delivery_id UUID`. Validates caller is either the sender (`auth.uid() = sender_id`) or the receiver of the specified delivery (`auth.uid() = receiver_profile_id` on `letter_deliveries`). Returns predictions, ratings (`story_verifications` where `source='letter'`), point responses (`letter_point_responses`), snapshots, a `perspective` field ('sender' | 'receiver'), `sender_name` (from profiles), and `receiver_name` (from profiles via delivery). Both names are needed for position badge labels (`badgePersonName`). Returns NULL on invalid/unauthorized input. Granted to `authenticated` only. Single function, single migration file.

2. **Migration: extend `get_inbox_items`** — Add `stories_rated` and `total_stories` to the Branch 1 (received letters) JSONB output. `stories_rated` from `letter_deliveries.stories_rated`, `total_stories` from `(SELECT COUNT(*) FROM letter_story_snapshots WHERE letter_id = ld.letter_id)`.

3. **Service function: `getLetterResults(letterId, deliveryId?)`** — Client-side wrapper in `letters-service.ts` that calls the new RPC. Passes `p_letter_id` and optional `p_delivery_id`. Returns typed result with snapshots, predictions, ratings, point responses, perspective field, and receiver/sender name.

4. **Component: `StoryWalk`** — Shared paginated view. Props: stories array (pre-mapped `StoryWalkItem[]`), perspective, senderName, navigation callbacks. Manages `currentIndex` state. Renders: counter, JourneyToUnderstanding, GapBanner, LiveStoryCardExpanded (readOnly, defaultExpanded, points visible), fixed bottom bar with Previous/Next.

5. **Replace results page (both perspectives)** — Rewrite `letter-results-page.tsx` to use `ClarityLandingLayout` + `StoryWalk`. Both perspectives use the same `get_letter_results` RPC. Page detects perspective from URL: if `delivery` query param present → call RPC with `(letterId, deliveryId)` → receiver perspective; otherwise → call RPC with `(letterId)` → sender perspective. The RPC returns a `perspective` field confirming which view to render. Route: `/letter/:id/results` (sender) and `/letter/:id/results?delivery=:deliveryId` (receiver). Map data into `StoryWalkItem[]`.

6. **Update receiver completion flow** — In `letter-completion-summary.tsx`, remove the summary phase entirely. "See Your Letter Summary" button in celebration phase navigates to `/letter/:letterId/results?delivery=:deliveryId` (requires `letterId` prop from `letter-reading-page.tsx`). Update `inbox-tab.tsx` to navigate completed received letters directly to `/letter/:letterId/results?delivery=:deliveryId` (skip reading flow).

7. **Inbox progress indicator** — Update `InboxItem` type to include optional `stories_rated` and `total_stories`. Update `inbox-tab.tsx` to display "Step {stories_rated} of {total_stories} completed" for in-progress received letters.

#### Files to Create

| File | Purpose |
|------|---------|
| `src/app/components/letters/story-walk.tsx` | Shared paginated story walk component |
| `supabase/migrations/YYYYMMDDHHMMSS_p699_get_letter_results.sql` | SECURITY DEFINER RPC for sender to read receiver data |
| `supabase/migrations/YYYYMMDDHHMMSS_p699_inbox_progress_fields.sql` | Extend `get_inbox_items` with stories_rated/total_stories |

#### Files to Modify

| File | Change |
|------|--------|
| `src/app/pages/letter-results-page.tsx` | Rewrite: replace bare-text cards with `StoryWalk`. Detect perspective from URL params (sender=letter_id only, receiver=delivery query param). Both perspectives fetch via `getLetterResults()` RPC. Remove `FocusHeader` (layout handled by `App.tsx` route wrapper). |
| `src/app/components/letters/letter-completion-summary.tsx` | Remove summary phase entirely. Celebration "See Your Letter Summary" button navigates to `/letter/:letterId/results?delivery=:deliveryId`. Requires new `letterId` prop. Component shrinks to celebration-only. |
| `src/app/data/letters-service.ts` | Add `getLetterResults(letterId, deliveryId?)` service function wrapping the new RPC. |
| `src/app/types/index.ts` | Add `StoryWalkItem` type. Extend `InboxItem` with optional `stories_rated?: number` and `total_stories?: number`. |
| `src/app/components/letters/inbox-tab.tsx` | Add progress text ("Step N of M completed") below item message for in-progress received letters. |
| `src/app/utils/letter-snapshot-mapper.ts` | Add `injectReceiverPositions(story: StoryWithPoints, positionMap: Map<string, PositionType>): StoryWithPoints` helper that clones points with receiver positions in `profileSubjectPosition`. |
| `src/App.tsx` | Remove `chromeFree` from the `/letter/:id/results` route wrapper so `ClarityLandingLayout` renders with top menu. |
| `src/app/pages/letter-reading-page.tsx` | Pass `letterId` to `LetterCompletionSummary` so it can build the navigation URL `/letter/:letterId/results?delivery=:deliveryId`. |

## Component Strategy

### Component Inventory

#### Existing shadcn/ui primitives (`src/components/ui/`)

| Component | Relevant to P699 |
|-----------|-----------------|
| `button.tsx` | Yes — Previous/Next/CTA buttons |
| `clarity-loader.tsx` | Yes — skeleton loading state |
| `sonner.tsx` | No (toast only) |
| `dialog.tsx`, `drawer.tsx`, `accordion.tsx` | No |

#### Existing app components (`src/app/components/`)

| Component | File | Role in P699 |
|-----------|------|-------------|
| `JourneyToUnderstanding` | `partners/live-mode-view.tsx` (exported) | Prediction vs rating display |
| `GapBanner` | `shared/gap-banner.tsx` | Gap insight badge |
| `LiveStoryCardExpanded` | `partners/live-story-card-expanded.tsx` | Story card with points and position badges |
| `PointRow` | `partners/live-story-card-expanded.tsx` (exported) | Individual point with `profileSubjectPosition` badge |
| `PositionBadge` | `shared/PositionBadge.tsx` | Position label above each point |
| `ClarityLandingLayout` | `layouts/clarity-landing-layout.tsx` | Page shell with top nav |
| `FocusHeader` | `layout/focus-header.tsx` | Being removed from results page |
| `ClarityPageLoader` | `ui/clarity-loader.tsx` | Full-page loading skeleton |
| `Button` | `ui/button.tsx` | Navigation and CTA buttons |

### Component Map

| UI Element | Classification | Justification |
|-----------|---------------|---------------|
| Page shell (top nav, no chromeFree) | **Reuse** `ClarityLandingLayout` | Already supports `chromeFree={false}` (default). Spec explicitly names it. |
| Story counter ("Story 1 of 3") | **New** inline JSX in `StoryWalk` | 2 lines of markup (`text-sm text-muted-foreground`, centered). Not worth extracting — no reuse outside this component. |
| JourneyToUnderstanding (compact) | **Reuse** as-is | Props match exactly: `checkerRating`, `responderRating`, `explainBackRatings=[]`, `compact=true`. Already used identically in `LetterFlowContent` lines 264-272. |
| GapBanner | **Reuse** as-is | Props: `gap`, `senderName`, `isOverconfident`, `isChecker`. Same usage as `LetterFlowContent` line 275-280. Hidden when story incomplete. |
| LiveStoryCardExpanded | **Reuse** with different prop combination | `readOnly=true`, `defaultExpanded=true`, `hidePoints=false`. The reading flow uses `hidePoints=true` (points shown separately); story walk uses `hidePoints=false` (points inline with story). All these props already exist. |
| Position badge above points | **Reuse** `PositionBadge` via `profileSubjectPosition` on `PointSummary` | `PointRow` already renders `PositionBadge` when `profileSubjectPosition` is set. For story walk, `profileSubjectPosition` is injected with the other party's position via the post-processing mapper (AD3). No component changes needed. |
| Fixed bottom bar (Previous/Next) | **Extract** pattern from `LetterFlowContent` | The `fixed inset-x-0 bottom-0 z-50 ... rounded-t-[10px] border bg-background p-4` container is used 3x in `LetterFlowContent` (story-revealed, remaining-point-engage, remaining-point-revealed). Extract as a thin wrapper. |
| Previous/Next text buttons | **New** inline JSX in `StoryWalk` | Two `Button variant="ghost"` with `min-h-[44px]`. Unique to paginated walk — no reuse target. |
| Last-story /live CTA | **New** inline JSX in `StoryWalk` | Primary CTA (`bg-[#0044CC]`, `min-h-[44px]`, `max-w-[200px]`) + secondary "Back to Letters" link. Matches existing CTA pattern from `LetterFlowContent` and `LetterCompletionSummary`. |
| "Not yet rated" placeholder | **New** inline JSX in `StoryWalk` | `text-sm text-muted-foreground` placeholder in Journey component when `responderRating` is undefined. JourneyToUnderstanding already handles `undefined` rating gracefully — renders "Pending...". |
| Inbox progress text | **New** inline JSX in `InboxTab` | Single `<p>` tag: `text-xs text-muted-foreground`. Not worth a component. |
| Loading skeleton | **Reuse** `ClarityPageLoader` | Full-page loader during RPC fetch. Matches existing pattern in `LetterResultsPage`. |
| Error state | **Reuse** existing error pattern | Centered error + "Try again" link. Already in `LetterResultsPage` lines 121-133 and `InboxTab` lines 91-99. |
| StoryWalk container | **New** component | Core new component — paginated view orchestrating all reused sub-components. Justified: manages `currentIndex` state, composes 4 sub-components, handles perspective switching. |

### Composition Tree

```
LetterResultsPage (sender entry — rewrite)
└── ClarityLandingLayout (chromeFree=false)
    └── StoryWalk
        ├── story counter (inline <p>)
        ├── JourneyToUnderstanding (compact, reuse)
        ├── GapBanner (reuse, hidden if incomplete)
        ├── LiveStoryCardExpanded (readOnly, defaultExpanded, hidePoints=false)
        │   └── PointRow[] (reuse)
        │       └── PositionBadge (reuse — other party's position)
        └── FixedBottomBar (extracted)
            ├── Button "Previous Story" (ghost)
            ├── Button "Next Story" (ghost) — OR —
            ├── Button /live CTA (primary, last story + gap > 0)
            └── Link "Back to Letters" (text, last story)

LetterCompletionSummary (celebration only — summary phase removed)
├── celebration phase (unchanged — confetti + stats)
└── "See Your Letter Summary" button → navigate('/letter/:letterId/results?delivery=:deliveryId')

InboxTab (progress indicator — modify)
└── inbox item row
    └── progress text (inline <p>, "Step N of M completed")
```

### Extraction Plan

**Extract: `FixedBottomBar`**

- **Source:** `LetterFlowContent` lines 289-296 (story-revealed), 315-323 (remaining-point-engage), and 2 more occurrences
- **Target:** `src/app/components/shared/fixed-bottom-bar.tsx`
- **Interface:** `children: ReactNode`, `className?: string`
- **Markup:** `<div className="fixed inset-x-0 bottom-0 z-50 flex flex-col items-center rounded-t-[10px] border bg-background p-4 {className}">{children}</div>`
- **Justification:** Used 4x in `LetterFlowContent` and 1x in `StoryWalk` (5 total). Eliminates copy of the exact same 6-class string. Extraction is mechanical — no logic, pure layout wrapper.
- **Migration:** Replace all `LetterFlowContent` instances in the same PR. Non-breaking — identical output.

No other duplications identified. All other "New" items are inline JSX (under 5 lines each) with no reuse candidates.

### Visual Specification

**Hierarchy:** Story counter (muted, small) orients the user without competing for attention. JourneyToUnderstanding is the primary focal point — prediction vs rating numbers draw the eye first. GapBanner provides the emotional "aha" (gap magnitude + insight). LiveStoryCardExpanded is the detail layer — full story text + points for deep review. Fixed bottom bar is utility navigation, visually recessed. On the last story, the /live CTA becomes primary focal point (blue `bg-[#0044CC]`, elevated by being the sole colored element in the bottom bar).

**Register:** Reflective and spacious. This mirrors the `story-revealed` phase in `LetterFlowContent` — one story per screen, generous vertical gaps, centered single-column layout. Semantic tokens: `text-foreground` for story content, `text-muted-foreground` for counter/metadata, `bg-background` for page and bottom bar, `border` for card and bar edges. Accent colors only on GapBanner (`bg-blue-50 border-blue-200` for gap > 0, `bg-muted/50 border-input` for calibrated) and /live CTA (`bg-[#0044CC]`).

**Negative constraints:**
- No multi-column layouts at any breakpoint — single focal point per screen
- No animation between story transitions — instant swap (data already loaded)
- No auto-advance or timers — user controls pace
- No inline editing or position changes — `readOnly=true` on all story cards
- No green for anything except gap=0 badge (`bg-green-500` in GapBanner "Perfectly calibrated") — per design system rule
- No `chromeFree` layout — top nav always visible (this is review, not immersion)
- No collapse/expand controls on points — always expanded (`readOnly` forces this)
- No gap-sorted ordering — stories display in original letter order (position-based)

**Spacing:** Vertical rhythm follows `LetterFlowContent` story-revealed phase. All content constrained to `max-w-sm mx-auto` (JourneyToUnderstanding, story card). Page padding: `px-4`. Gap between counter and Journey: `space-y-6` (24px). GapBanner: `-mt-3` overlap with Journey (existing pattern from line 279). Gap between GapBanner and story card: standard flow (no override). Bottom padding: `pb-24` minimum to clear fixed bottom bar. Bottom bar: `p-4` internal padding, `rounded-t-[10px]`. Touch targets: `min-h-[44px]` on all buttons.

**Animation:** None between story transitions — instant content swap when Previous/Next is tapped. Focus management: `scrollTo(0, 0)` + focus moves to story counter element on navigation. Confetti animation on celebration phase only (existing, unchanged). `animate-fade-in` (existing keyframe: `fade-in 0.5s ease-out`) on initial StoryWalk mount only — not on story navigation.

### Challenge Notes

**CN1: JourneyToUnderstanding "Not yet rated" display — RESOLVED**

Decision: Accept "Pending..." as adequate. `JourneyToUnderstanding` renders "Pending..." when `responderRating` is `undefined`. No component change needed. References to "Not yet rated" elsewhere in this spec describe the conceptual state — the rendered text is "Pending...".

**CN2: Receiver perspective data availability — RESOLVED**

Decision: `get_letter_results` RPC serves both perspectives. Receiver calls with `(letterId, deliveryId)` — RPC validates `auth.uid() = letter_deliveries.receiver_profile_id` for that delivery. Returns the same data shape as sender, with `perspective: 'receiver'`. `getCompletionSummary()` is NOT used for the results page — both paths use the single RPC. This eliminates the data availability gap and ensures consistent data fetching for both perspectives.

**CN3: `badgePersonName` prop on LiveStoryCardExpanded**

For story walk, we need the other party's name shown on the position badge (e.g., "Alice: Agrees"). `LiveStoryCardExpanded` already has `badgePersonName` prop that overrides the author name in position badges. For sender perspective: set `badgePersonName` to receiver's name. For receiver perspective: the author positions are already in `profileSubjectPosition` with the author's name from `story.authorName`. This is consistent — no component changes needed, just correct prop passing.

## Test Coverage Strategy

**Feature:** P699 Letter Results Story Walk

### What's Tested (and Why)

**Integration Tests (15 tests):**
- `get_letter_results` RPC existence, sender auth, receiver auth, unauthorized access, sealed-gate, data shape — **Why:** RPC is the security boundary; wrong auth = data leak. Two-client pattern ensures JWT-based access, not service_role bypass.
- `get_inbox_items` returns `stories_rated` + `total_stories` — **Why:** migration must be verified before E2E tests can assert on progress text.

**E2E Tests (32 tests):**
- Sender: smoke, story walk structure, Previous/Next nav, last story CTA, progressive results — **Why:** covers all sender acceptance criteria end-to-end.
- Receiver: celebration → results navigation, swapped perspective labels, inbox revisit (no celebration), position badges — **Why:** receiver flow is the highest-risk area (layout jump from chromeFree to ClarityLandingLayout).
- Inbox: progress text display, completed letter navigation, edge cases — **Why:** inbox progress is the primary observable change for in-progress letters.

**Accessibility Tests (7 tests):**
- Keyboard navigation, ARIA roles on nav bar, focus management on story switch, touch targets — **Why:** fixed bottom bar is the primary interaction surface on mobile.

**UAT Scenarios (24 manual):**
- All acceptance criteria + visual-only checks (position badge placement, gap banner styling, celebration animation) — **Why:** pixel-level visual quality requires human eyes.

### What's NOT Tested (Rationale)

- **Full reading flow → celebration → results** — multi-step timing across page navigations. UAT manual scenario.
- **Position badge pixel placement** — requires screenshot diffing. UAT visual check.
- **Gap=0 /live CTA hiding** — doubles setup complexity. Integration test covers data shape guarantee.
- **`injectReceiverPositions()` unit test** — pure function, best covered by Vitest unit test during `/dev`.
- **`FixedBottomBar` extraction** — mechanical refactor, no behavioral test needed.
- **1-to-many mode** — out of scope (P700).

### Test Pyramid

```
        /\
       /  \   32 E2E tests (sender + receiver + inbox flows)
      /____\
     /      \
    / 15 INT \ 15 integration tests (RPC auth + inbox migration)
   /__________\
  /            \
 /   7 A11y    \ 7 accessibility tests
/________________\
```

**Total:** 54 automated tests + 24 UAT scenarios

### Files Generated

1. `e2e/integration/p699-letter-results-migration.spec.ts` — RPC migration verification (11 tests)
2. `e2e/integration/p699-inbox-progress-migration.spec.ts` — Inbox fields migration (4 tests)
3. `e2e/p699-letter-results-sender.spec.ts` — Sender results flow (14 tests)
4. `e2e/p699-letter-results-receiver.spec.ts` — Receiver results flow (11 tests)
5. `e2e/p699-inbox-progress.spec.ts` — Inbox progress display (7 tests)
6. `e2e/a11y/p699-accessibility.spec.ts` — Accessibility (7 tests)
7. `features/uat/p699.md` — UAT scenarios (24 manual)

### Complexity Classification

**Complex** — 4 implementation layers (2 DB migrations, new component, 3 page rewrites), 7-step build sequence, DB migration is prerequisite for UI work. **Recommend `/decompose` before `/dev`.**

## Implementation Tasks

### Pre-flight Summary

**Checks passed:** AC coverage ✅ · UX–Architecture drift ✅ · Security blockers ✅

**AC coverage:** All 6 unchecked criteria map to build steps (AC1+2→T5, AC3→T6, AC4→T6+T7, AC5→T4, AC6→T3+T5).

**UX–Architecture drift:** No conflicts. `chromeFree` removal confirmed in T8. Receiver URL pattern (`?delivery=:deliveryId`) consistent across UX flows and architecture.

**Security blockers:** All 5 ⚠️ risks from Security Review are addressed in T1 (SECURITY DEFINER guard, sender-only gate, `authenticated`-only grant, `status='sealed'` validation, no PII columns in return).

---

### T1 — Migration: `get_letter_results` RPC

**Concern:** Database — new SECURITY DEFINER function

**Files to create:**
- `supabase/migrations/YYYYMMDDHHMMSS_p699_get_letter_results.sql`

**Spec ref:** `### Implementation Approach` → Build Sequence step 1 (line ~429); `### Security Review` (lines 400–423)

**Security invariants to enforce:**
- Validate `auth.uid() = clarity_letters.sender_id` OR `auth.uid() = letter_deliveries.receiver_profile_id` (for delivery) before returning any data
- Validate `status = 'sealed'`; return NULL (not exception) on invalid/unauthorized
- Grant to `authenticated` only — NOT `anon`
- Replicate sealed-bid constraint internally (receiver data only when matching `story_verifications` row exists)
- Return columns: predictions, ratings, point responses, snapshots, `perspective` ('sender'|'receiver'), `sender_name`, `receiver_name` — NO `receiver_email`, NO `invitation_token`

**Test files:**
- `e2e/integration/p699-letter-results-migration.spec.ts` (11 tests: RPC existence, sender auth, receiver auth, unauthorized access, sealed-gate, data shape)

**Verification:** Integration tests pass; `psql -c "SELECT routine_name FROM information_schema.routines WHERE routine_name = 'get_letter_results';"` returns the function.

**Dependencies:** None (first task)

---

### T2 — Migration: extend `get_inbox_items`

**Concern:** Database — extend existing RPC return shape

**Files to create:**
- `supabase/migrations/YYYYMMDDHHMMSS_p699_inbox_progress_fields.sql`

**Spec ref:** `### Implementation Approach` → Build Sequence step 2 (line ~431)

**Change:** Add `stories_rated` (from `letter_deliveries.stories_rated`) and `total_stories` (from `COUNT(*)` on `letter_story_snapshots WHERE letter_id = ld.letter_id`) to Branch 1 (received letters) JSONB output of `get_inbox_items`.

**Test files:**
- `e2e/integration/p699-inbox-progress-migration.spec.ts` (4 tests: fields present, correct counts, null for non-letter items)

**Verification:** Integration tests pass; `stories_rated` and `total_stories` appear in `get_inbox_items` result for received letters.

**Dependencies:** None (independent of T1; can run in parallel)

---

### T3 — Types + service function

**Concern:** Service layer — typed client wrapper + shared types

**Files to modify:**
- `src/app/types/index.ts` — add `StoryWalkItem` type; extend `InboxItem` with `stories_rated?: number` and `total_stories?: number`
- `src/app/data/letters-service.ts` — add `getLetterResults(letterId: string, deliveryId?: string)` wrapping new RPC; returns typed result with snapshots, predictions, ratings, point responses, `perspective`, `senderName`, `receiverName`
- `src/app/utils/letter-snapshot-mapper.ts` — add `injectReceiverPositions(story: StoryWithPoints, positionMap: Map<string, PositionType>): StoryWithPoints` helper

**Spec ref:** `### Implementation Approach` → Build Sequence steps 3 (line ~433); `#### Files to Modify` (lines ~457–462)

**Verification:** TypeScript compiles clean (`tsc --noEmit`); `getLetterResults` returns correct type; `StoryWalkItem` and extended `InboxItem` resolve without errors.

**Dependencies:** T1 (RPC must exist before service function can be typed against its return shape)

---

### T4 — Component: `StoryWalk` + `FixedBottomBar`

**Concern:** UI component — new paginated story walk view

**Files to create:**
- `src/app/components/letters/story-walk.tsx`

**Files to modify:**
- `src/app/components/shared/fixed-bottom-bar.tsx` (extract from `LetterFlowContent`)

**Spec ref:** `### Implementation Approach` → Build Sequence step 4 (line ~435); `## Component Strategy` → Extraction Plan (lines ~537–548); Visual Specification (lines ~552–568)

**StoryWalk props:** `stories: StoryWalkItem[]`, `perspective: 'sender' | 'receiver'`, `senderName: string`, `receiverName: string`, navigation callbacks

**StoryWalk internals:** `currentIndex` state; counter; `JourneyToUnderstanding` (compact); `GapBanner` (hidden when incomplete); `LiveStoryCardExpanded` (readOnly, defaultExpanded, hidePoints=false); `FixedBottomBar` with Previous/Next or last-story CTA; `scrollTo(0,0)` on navigation

**Visual constraints (from spec):** `max-w-sm mx-auto` all content; `space-y-6` between counter and Journey; `pb-24` page padding; `min-h-[44px]` all buttons; no animation on story switch; `animate-fade-in` on initial mount only

**Test files:**
- `e2e/p699-letter-results-sender.spec.ts` (structure, Previous/Next nav, last story CTA tests)
- `e2e/a11y/p699-accessibility.spec.ts` (keyboard nav, ARIA roles, focus management, touch targets)

**Verification:** Component renders without errors; Previous disabled on story 1; Next disabled on last story; CTA appears on last story when gap > 0; `FixedBottomBar` replaces all 4 occurrences in `LetterFlowContent`.

**Dependencies:** T3 (`StoryWalkItem` type must exist)

---

### T5 — Rewrite `letter-results-page.tsx`

**Concern:** Page layer — replace bare-text results with `StoryWalk`; handle both perspectives

**Files to modify:**
- `src/app/pages/letter-results-page.tsx`

**Spec ref:** `### Implementation Approach` → Build Sequence step 5 (line ~437); `#### Files to Modify` (line ~455)

**Logic:**
- Detect perspective from URL: `delivery` query param present → receiver perspective (call `getLetterResults(letterId, deliveryId)`); absent → sender perspective (call `getLetterResults(letterId)`)
- RPC returns `perspective` field — use to swap label directions in `StoryWalkItem` mapping
- Wrap in `ClarityLandingLayout` (chromeFree removed — see T8)
- Map RPC result into `StoryWalkItem[]` using `injectReceiverPositions` for receiver perspective
- Loading: `ClarityPageLoader`; error: existing error pattern with retry link

**Test files:**
- `e2e/p699-letter-results-sender.spec.ts` (sender smoke, progressive results)
- `e2e/p699-letter-results-receiver.spec.ts` (receiver perspective labels, position badges)

**Verification:** `/letter/:id/results` shows `StoryWalk` with correct sender data; `/letter/:id/results?delivery=:id` shows correct receiver perspective with swapped labels.

**Dependencies:** T3 (service function), T4 (`StoryWalk` component)

---

### T6 — Update receiver completion flow

**Concern:** Navigation — remove summary phase; wire celebration to results page

**Files to modify:**
- `src/app/components/letters/letter-completion-summary.tsx` — remove summary phase entirely; add `letterId` prop; "See Your Letter Summary" button navigates to `/letter/:letterId/results?delivery=:deliveryId`
- `src/app/pages/letter-reading-page.tsx` — pass `letterId` prop to `LetterCompletionSummary`
- `src/app/components/letters/inbox-tab.tsx` — navigate completed received letters directly to `/letter/:letterId/results?delivery=:deliveryId` (skip reading flow)

**Spec ref:** `### Implementation Approach` → Build Sequence step 6 (line ~439)

**Test files:**
- `e2e/p699-letter-results-receiver.spec.ts` (celebration → results navigation, inbox revisit without celebration)

**Verification:** Tapping "See Your Letter Summary" lands on results page (not summary); revisiting from inbox skips celebration; `letter-completion-summary.tsx` no longer renders summary phase JSX.

**Dependencies:** T5 (results page must exist before navigation can be wired)

---

### T7 — Inbox progress indicator

**Concern:** UI enhancement — show progress text on in-progress received letters

**Files to modify:**
- `src/app/components/letters/inbox-tab.tsx` — display `"Step {stories_rated} of {total_stories} completed"` below item message for in-progress received letters (when `stories_rated < total_stories`)

**Spec ref:** `### Implementation Approach` → Build Sequence step 7 (line ~441); `#### Files to Modify` (line ~459)

**Visual:** Single `<p className="text-xs text-muted-foreground">` — no new component

**Test files:**
- `e2e/p699-inbox-progress.spec.ts` (progress text display, completed letter navigation, edge cases)

**Verification:** In-progress letter shows "Step N of M completed"; completed letter (stories_rated === total_stories) does not show progress text; letters with no `stories_rated` data show no progress text.

**Dependencies:** T2 (inbox migration must add fields), T3 (`InboxItem` type must include new fields)

---

### T8 — Route wrapper: remove `chromeFree` from results route

**Concern:** Layout — expose top nav on results page

**Files to modify:**
- `src/App.tsx` — remove `chromeFree` from the `/letter/:id/results` route wrapper

**Spec ref:** `### Implementation Approach` → `#### Files to Modify` (line ~461); UX Design → Flow 2 (line ~159: "new page with ClarityLandingLayout + top menu")

**Verification:** Navigating to `/letter/:id/results` shows ClarityPledge top nav; no `chromeFree` prop on results route in App.tsx.

**Dependencies:** None (safe to do alongside any other task; deploy together with T5)

---

### Dependency Graph

```
T1 (get_letter_results migration)
  └── T3 (types + service)
        ├── T4 (StoryWalk component)
        │     └── T5 (results page rewrite)
        │           └── T6 (completion flow navigation)
        └── T7 (inbox progress) ← also depends on T2

T2 (inbox migration) → T7 (inbox progress)

T8 (chromeFree removal) — parallel, deploy with T5
```

**Parallelizable:** T1 and T2 can run simultaneously. T8 can be done at any time.

**Critical path:** T1 → T3 → T4 → T5 → T6
