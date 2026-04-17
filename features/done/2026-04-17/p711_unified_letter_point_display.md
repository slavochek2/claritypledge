---
status: all-done
completed_at: 2026-04-17
type: change-request
rank: 1000711.0
changes: p708
tags:
  - redesign
  - letters
  - p708
  - p705
created_date: '2026-04-15'
pipeline_ran: [change-request, architect, dev]
---

# P711: Unified letter point display — one card, one reveal prop

> **Redesign of:** [P708: Letter flow visual polish](./p708_letter_flow_visual_polish.md)
> **What was wrong:** The letter reading flow renders the "point with positions" concept through three parallel components (`PointRow`, `PositionComparisonCard`, results-page `StoryWalk`→`PointRow`). They drift visually and semantically: author position leaks in the engage phase (because `PointRow` unconditionally renders `profileSubjectPosition`), the revealed phase uses text-only rows (asymmetric with other surfaces), and the results page splits "their stance" and "my stance" into two visual languages. P708 patched specific symptoms (card fork, divider, alignment) without addressing the missing abstraction underneath.

## Operating Mode

> This spec is an **incremental correction** to P708 (and by extension the letter-reading surface shaped by P696/P705), not a greenfield design.
> The predecessor specs are **read-only shipped history** — do not recommend edits to them.
> Your job at every pipeline stage is to **implement the delta** described below.
> Settled decisions from P705 (positions are live everywhere; H2) and P696 (phase-based rendering) are not up for re-examination.

## Problem Statement

**Recipient sees author's position before committing their own** (point-engage phase) — defeats the calibration mechanic. Separately, the post-reveal and results surfaces present the same underlying concept (two participants' stances on a point) through three different visual treatments, causing per-screenshot patching that never converges.

**Founder framing (from conversation):** the drift is a symptom of a missing abstraction. One pattern should serve all surfaces — *other person's stance as a header above the point card; viewer's own stance on the position buttons within the card*. Same molecule everywhere.

## Jobs To Be Done

**Preserved from P705/P708:**
- Recipient reads each point, commits a position, sees author's position, rates comprehension, receives gap feedback.
- Sender previews the recipient's experience faithfully.
- Both parties revisit results with live, editable positions (P705 H2).

**Corrected:**
- Recipient forms their position without seeing the author's first (reveal parity).
- Viewer's own stance and author's stance are visually recognisable as "positions" without needing to learn two UI languages per phase.
- Post-reveal, recipient can change their position freely — the position history trigger captures the flip, and a future surface can display "you moved from X to Y after seeing their Unsure."

**New:**
- Single visual contract spans engage / revealed / remaining-point-revealed / results / letter-as-read / preview.

## Current State

Letter reading has 6 phases (P696). The point surfaces across them use inconsistent components:

| Phase | Component | Author position | Viewer position |
|---|---|---|---|
| `point-engage` | `PointRow` (letterMode) | ❌ rendered via `profileSubjectPosition` → **leaks before submit** | buttons (correct) |
| `point-revealed` | `PositionComparisonCard` | text-only row, no avatar, no earn count | text-only row, no avatar |
| `remaining-point-engage` | `PointRow` (letterMode) | same leak as `point-engage` | buttons |
| `remaining-point-revealed` | `PositionComparisonCard` | same text-only asymmetry | text-only |
| Results page | `StoryWalk` → `LiveStoryCardExpanded` → `PointRow` | full molecule (avatar + ears + badge) above card | disembodied buttons below (different visual language from "theirs") |
| Preview | reuses above | inherits the leak from engage phases | inherits |

**Before (point-engage, current — leaks):**
```
  [A] Vyacheslav  [Unsure]           ← author position shown before I submit
  ┌────────────────────────────────┐
  │ 📌 a sdfasdf asdf              │
  │ ○ ○ ○ ○ ○ ○ ○                  │
  └────────────────────────────────┘
              [ Submit ]
```

**Before (point-revealed, current — asymmetric, different component):**
```
  You          [Agree]              ← text-only, no avatar, no ears
  Vyacheslav   [Unsure]             ← text-only, no avatar, no ears
  ┌────────────────────────────────┐
  │ 📌 a sdfasdf asdf              │
  └────────────────────────────────┘
              [ Next ]
```

**Before (results page, current — author molecule vs disembodied buttons):**
```
  [A] Vyacheslav  👂12  [Unsure]    ← full molecule
  ┌────────────────────────────────┐
  │ 📌 a sdfasdf asdf              │
  │ ○ ○ ○ ○ ● ○ ○                  │ ← my stance, no label, different shape
  └────────────────────────────────┘
```

## Root Cause

**`PointRow` renders `profileSubjectPosition` unconditionally** — `src/app/components/partners/live-story-card-expanded.tsx:280` guards on presence of the value, not on any reveal-phase prop. The data layer (P705) correctly ships the author's live position into every render; the component has no gate to withhold it.

**`PositionComparisonCard` is a parallel render of the same concept** (`src/app/components/letters/position-comparison-card.tsx`) — used only in `point-revealed` / `remaining-point-revealed`. It invents a text-only two-row layout that does not share visual molecules with `PointRow`. This is the drift vector.

**Results page separates "their stance" (above, molecule) from "my stance" (below, buttons)** — inherited from `/story/[id]` where it made sense (one owner, one viewer). Letters introduce a second "owner-ish" participant (the author), but the component was never generalised. Visual asymmetry encodes a role asymmetry that doesn't match the recipient's experience of "we're two humans comparing stances."

## Redesign

**One pattern, five surfaces:**

```
  [A] OtherPerson  👂N  [Position | (hidden)]    ← header above the card
  ┌────────────────────────────────────────┐
  │ 📌 point statement                      │
  │ ● ○ ○ ○ ○ ○ ○   ← MY position buttons   │
  └────────────────────────────────────────┘
```

### Reveal states

Single `revealed: boolean` prop on the shared point-display component:

- `revealed = false` → render header with avatar + name + earn count, **no PositionBadge**. Buttons interactive.
- `revealed = true`  → render header including `PositionBadge`. Buttons stay interactive (P705 H2 — positions are live state).

### After (point-engage — author identity shown, position hidden)
```
  [A] Vyacheslav  👂12
  ┌────────────────────────────────┐
  │ 📌 a sdfasdf asdf              │
  │ ○ ○ ○ ○ ○ ○ ○                  │
  └────────────────────────────────┘
              [ Submit ]
```

### After (point-revealed — same card, badge appears, buttons stay live)
```
  [A] Vyacheslav  👂12  [Unsure]
  ┌────────────────────────────────┐
  │ 📌 a sdfasdf asdf              │
  │ ○ ○ ○ ● ○ ○ ○   ← tappable      │
  └────────────────────────────────┘
              [ Next ]
```

### After (results / letter-as-read / preview — identical)

Same card as point-revealed. No separate component, no different visual.

### Decision: allow editing my position after reveal

The letter flow stops locking the viewer's position after reveal. Rationale:
- Consistent with `/story/[id]` and the results page already shipped under P705.
- Gap math is story-level (`|rating - prediction|`), not affected by point position changes.
- `trg_position_history` (migration `20260204_stories_points_calibration.sql:223`) already captures every INSERT/UPDATE/DELETE — the "I changed my mind after reveal" signal is preserved in the DB.
- "Social proof" / mimicry concern is acceptable: the user learning "I want to move after hearing them" **is** calibration working. Suppressing it treats users as brittle.
- Future surface can render flip history ("you moved from Agree to Slightly Agree after reveal") without new data work.

## Predecessor Sections Superseded

| Section | P708 said | Status | Replaced by |
|---|---|---|---|
| Solution: "Swap `PointCardWithLinks` → `PointRow` with `letterMode` in both engage phases" | Treated `PointRow` as a drop-in for both engage phases | **Extended** | P711 keeps `PointRow` but adds `revealed` prop; engage phases pass `revealed={false}` to hide author position |
| Done-When: "point-engage phases show clean `PointRow`: no CTA, no tags, no visibility icon; position buttons still work" | No mention of author-position gating | **Extended** | Adds AC: "author PositionBadge is not rendered in engage phase" |
| Risks / Non-Goals: "Do NOT touch ... `LiveStoryCardExpanded`" | Framed as hands-off | **Superseded** | P711 modifies `LiveStoryCardExpanded` / `PointRow` to add the `revealed` prop; this is the minimum-churn site for the fix |

P705 sections preserved: dual-write staging + live, H2 live-positions-everywhere, anon 1:1 deferred-write pattern, `trg_position_history` as audit path.

## Requirements

1. **Single display component** for "point with positions" across all letter surfaces. Drop `PositionComparisonCard` (or reduce it to a thin wrapper that renders `PointRow` with `revealed={true}`).
2. **`revealed` prop** gates the author `PositionBadge` render in the header. No other prop behavior changes.
3. **Buttons stay interactive** in all revealed states — wired through the existing P705 `onPositionSelect` → `point_positions` upsert path.
4. **Preview** inherits automatically by rendering the same components in the same phases; sender's own position never leaks.
5. **Ordering invariant**: in the letter-reading surfaces, the header represents the *other* participant (author for recipient view, recipient for sender-preview context), and the buttons represent the *viewer*. No "You row" anywhere.

## What Stays the Same

- Data layer (P705): `point_positions` live reads/writes, `letter_point_responses` staging, `trg_position_history` audit.
- Phase state machine (P696): 6 phases, transition logic, 400 ms reveal delay.
- `LetterProgressBar` — unchanged.
- `JourneyToUnderstanding`, `GapBanner`, `ComprehensionRatingCard` — unchanged.
- `/story/[id]` and `/live` surfaces — untouched.
- RLS, RPCs, migrations — no schema changes.
- Letter preview amber banner and sender-side flows — unchanged behavior.

## Surfaces in Scope

**In scope:**
- `src/app/components/partners/live-story-card-expanded.tsx` (add `revealed` prop, gate `PositionBadge` render at line ~297)
- `src/app/components/letters/letter-flow-content.tsx` (engage phases pass `revealed={false}`; revealed phases render `PointRow` with `revealed={true}` instead of `PositionComparisonCard`)
- `src/app/components/letters/position-comparison-card.tsx` (delete, or reduce to wrapper — architect decides)
- `src/app/components/letters/story-walk.tsx` (results page — ensure viewer's buttons stay interactive + author badge renders via same path)
- `src/app/pages/letter-results-page.tsx` (no logic change expected; may need prop plumbing)
- `src/app/components/letters/letter-prediction-walk.tsx` (Surface 4 — compose/prediction-walk: author views own story+points while predicting reader scores). Currently passes `readOnly` to `LiveStoryCardExpanded`, which disables the author's own position buttons on their own points. Under P705 H2, the author's live position is editable everywhere; compose is no exception. Remove `readOnly` (or drop to `revealed={true}` without it) and wire `onLivePositionChange` to `pointsService.setPosition` so the author can update their own `point_positions` while composing. No author-badge header concept applies (it's the author's own point — there is no "other person's stance").

**Out of scope:**
- Any change to `point_positions` schema, RLS, or RPC surface.
- Any change to gap computation, story rating flow, or JourneyToUnderstanding.
- Displaying position flip history (future spec — data is already captured).
- Any change to `/story/[id]` or `/live`.

## Acceptance Criteria

- [ ] In `point-engage` and `remaining-point-engage`, the author's `PositionBadge` is **not rendered** in the point header. Author avatar + name + earn count still render.
- [ ] In `point-revealed` and `remaining-point-revealed`, the card is the same `PointRow` as engage, now with author `PositionBadge` visible and viewer's own position shown as a filled, **tappable** button.
- [ ] Tapping the viewer's position in any revealed phase updates `point_positions` (authenticated path) or `letter_point_responses` staging (anon path) — matches P705 write semantics.
- [ ] `PositionComparisonCard` is either deleted or reduced to a wrapper; no standalone visual remains that duplicates the PointRow header.
- [ ] Results page renders the same card shape as revealed phases (author header + interactive buttons below). No separate visual language.
- [ ] Preview mode (sender) shows the engage phases with author position hidden — no sender-position leaks.
- [ ] **Compose/prediction-walk (Surface 4):** author's own position buttons on their own `PointRow` are interactive (not disabled/`readOnly`). Tapping writes to `point_positions` for `auth.uid() = point.user_id`. Same visual molecule as revealed phases — no separate styling.
- [ ] Surfaces NOT in scope (`/story/[id]`, `/live`, feed, profile) are visually unchanged.
- [ ] All existing tests for P705 and P708 still pass.
- [ ] Regression: `tsc --noEmit` clean; Visual QA on engage + revealed + results + preview — all four surfaces share visual molecules.

## Technical Architecture

### Technical Analysis

#### Prop Inventory — `PointRow` (`live-story-card-expanded.tsx:214-258`)

| Prop | Type | Default | Semantics |
|---|---|---|---|
| `point` | `PointSummary` | required | `point.profileSubjectPosition` drives the entire header block |
| `authorName` | `string` | required | Name shown in header |
| `authorAvatarUrl / Color / HasPledged` | various | — | Header avatar props |
| `authorEarsCount` | `number?` | — | Ear count — currently suppressed by `letterMode` at line 291 (to be removed) |
| `badgePersonName / EarsCount / AvatarUrl / AvatarColor / HasPledged` | various | — | Override header identity for host view |
| `readOnly` | `boolean` | `false` | Disables `PositionButtons` entirely (no hover/click) |
| `letterMode` | `boolean` | `false` | Hides story CTA, guest hint, tag pills, visibility icon, ear count |
| `hideStoryCTA` | `boolean` | `false` | Suppresses "Add your story" CTA |
| `disablePositionButtons` | `boolean` | `false` | Renders buttons visually disabled |
| `onPositionSelect` | `fn?` | — | Fired on button click; toggles position |
| `children` | `ReactNode?` | — | Slot after point content |

**Critical current behavior (`live-story-card-expanded.tsx:280-299`):** The entire header block (avatar + name + ear count + `PositionBadge`) renders only when `point.profileSubjectPosition` is truthy. There is no prop that shows the header without the badge. `letterMode` suppresses ear count at line 291 but does not suppress `PositionBadge`.

**Spec AC #1 requires ear count to show in letter context** ("Author avatar + name + earn count still render"). The `!letterMode` guard on the ear count block at line 291 must be removed as part of this change.

#### `LiveStoryCardExpanded` prop shape (`live-story-card-expanded.tsx:21-52`)

Passes `readOnly`, `hideStoryCTA`, `onPositionSelect`, and all `badgePersonName/...` variants down to each `PointRow`. The new `revealed` prop threads in the same pattern. No existing non-letter caller passes `letterMode` — they are unaffected by adding `revealed` with default `true`.

#### Results page — confirmed interactive, no changes needed

`story-walk.tsx:145-151`: passes `onPositionSelect={onPositionSelect}` to `LiveStoryCardExpanded`; `readOnly` deliberately omitted (P705 comment at `story-walk.tsx:142-144`). `letter-results-page.tsx:231-241`: passes `handleResultsPositionChange` as `onPositionSelect`. `LiveStoryCardExpanded` will default `revealed={true}` — correct for results (always post-reveal). `StoryWalk` and `LetterResultsPage` require zero changes.

#### Preview gate — confirmed, no new architecture needed

`useLetterReadingState.ts:379`: `if (mode !== 'local' && !previewMode)` — all writes already gated. Passing `revealed={false}` to engage phases suppresses the badge in preview automatically.

#### Revealed-phase position writes — requires new prop on `LetterFlowContentProps`

`useLetterReadingState` exposes `submitPointPosition` which writes to `letter_point_responses` AND transitions phase (`point-engage → point-revealed`). Calling it again from a revealed phase would corrupt the phase state machine.

The results page handles post-reveal edits via `handleResultsPositionChange` in `letter-results-page.tsx:173` — calls `pointsService.setPosition` directly. The same pattern is needed for the letter reading flow.

**Resolution:** Add `onLivePositionChange?: (pointId: string, position: PositionType | null) => void` to `LetterFlowContentProps`. Revealed-phase `PointRow` uses this as `onPositionSelect`. `letter-reading-page.tsx` provides the implementation (calls `pointsService.setPosition`). `letter-preview-page.tsx` omits it — no writes in preview.

#### `PositionComparisonCard` audit

`position-comparison-card.tsx` (47 lines): two text-only badge rows above a plain point card. No avatar, no interactive buttons. Callers: `letter-flow-content.tsx:216-221` (`point-revealed`) and `letter-flow-content.tsx:330-335` (`remaining-point-revealed`). Zero other callers across the codebase.

#### Relevant `decisions.md` entries

- **2026-04-12 [technical]** (letter-flow layout): phases must use `max-w-sm mx-auto` card wrapper and `max-w-[200px]` action button. Revealed-phase `PointRow` wrapper must keep this structure.
- `PositionComparisonCard` does not appear in `decisions.md` — no prior decision constrains its deletion.
- No decision constrains `readOnly` semantics in the letter flow.

### Architecture Decisions

#### Decision 1: Add `revealed` as a new boolean prop on `PointRow`; decouple header from badge

**Chosen:** Add `revealed?: boolean` (default `false`) to `PointRow`. Change the header block to always render when `letterMode` is active (regardless of `profileSubjectPosition`). Render `PositionBadge` only when `point.profileSubjectPosition && (!letterMode || revealed)`.

Three resulting behaviors:
- Non-letter mode (`letterMode=false`): unchanged — header + badge appear when `profileSubjectPosition` exists.
- Letter engage (`letterMode=true`, `revealed=false`): header always shows (author identity visible), badge hidden.
- Letter revealed (`letterMode=true`, `revealed=true`): header shows with badge.

Also remove the `!letterMode` guard on the ear count block at line 291 — AC #1 requires ear count to render in letter context.

**Rationale:** The current `profileSubjectPosition && (...)` gate conflates "does this person have a position?" with "should we reveal it?" Passing `null` to suppress the badge would require callers to conditionally mutate the `point` object before rendering — data-shaping belongs in the component, not at call sites.

**Alternative rejected:** Refine `profileSubjectPosition` (pass null to suppress). Requires caller-side data mutation at every engage-phase render site. Breaks semantic clarity of the field.

#### Decision 2: Delete `PositionComparisonCard` outright

**Chosen:** Delete `src/app/components/letters/position-comparison-card.tsx`. Replace both usages in `letter-flow-content.tsx` with `PointRow` + `revealed={true}`.

**Rationale:** Two callers in one file, zero external callers. The new design has no "You row" — viewer position is shown via filled `PositionButtons`. The component exists only because P708 treated revealed phases as needing a separate visual. P711 eliminates that distinction. A thin wrapper would add a file, an import, and a divergence surface for zero benefit.

**Alternative rejected:** Reduce to thin wrapper `<PointRow revealed={true} ... />`. Requires non-trivial prop translation (`readerPosition`/`authorPosition` → `point.userPosition`/`point.profileSubjectPosition`). Adds indirection that obscures the fix.

#### Decision 3: Thread `revealed` through `LiveStoryCardExpanded` with default `true`

**Chosen:** Add `revealed?: boolean` (default `true`) to `LiveStoryCardExpanded`. Thread to each `PointRow`. Default `true` so all existing non-letter callers (results page, `/story/[id]`, `/live`) continue showing badges without change.

**Rationale:** Results page enters through `LiveStoryCardExpanded`. Defaulting `true` means `StoryWalk` and `LetterResultsPage` need zero prop changes. Letter engage phases pass `revealed={false}` directly to `PointRow` (they bypass `LiveStoryCardExpanded`).

**Alternative rejected:** Default `false`. Would require every existing caller to opt in — mechanical change to every call site with no semantic benefit.

#### Decision 4: Revealed-phase position writes via `onLivePositionChange` prop on `LetterFlowContentProps`

**Chosen:** Add `onLivePositionChange?: (pointId: string, position: PositionType | null) => void` to `LetterFlowContentProps`. Revealed-phase `PointRow` uses this as `onPositionSelect`. `letter-reading-page.tsx` provides the handler (calls `pointsService.setPosition` / `removePosition`, non-fatal on error — mirrors `handleResultsPositionChange` in `letter-results-page.tsx:173`).

**Rationale:** `useLetterReadingState.submitPointPosition` both writes AND transitions phase. It cannot be reused for post-reveal taps. Threading via a component prop keeps the hook clean. `letter-preview-page.tsx` stays unchanged (omits the prop → no writes).

**Alternative rejected:** Add `updateLivePosition` to `useLetterReadingState` hook. Requires adding `userId` param to the hook and updating all 3 call sites. More invasive than a prop.

### Security Review

**RLS Policies:** ✅ No change. `supabase/migrations/20260204_stories_points_calibration.sql:374-389` defines `point_positions` policies: `SELECT USING (true)` (global read — accepted under P705), `INSERT WITH CHECK (auth.uid() = user_id)`, `UPDATE/DELETE USING (auth.uid() = user_id)`. P711 adds no migrations, no policy changes. Widening interactivity post-reveal does not touch RLS surface.

**Authentication:** ✅ Auth gate preserved. `useLetterReadingState.submitPointPosition` at `src/app/hooks/useLetterReadingState.ts:379` guards `if (mode !== 'local' && !previewMode)` then dispatches to `submitPointResponseByToken` (anon, RPC-gated) or `submitPointResponse` (authenticated). P711 reuses the same handler across all phases — gate fires on every path. No new write surface.

**Authorization:** ✅ `pointsService.setPosition` at `src/app/data/points-service-real.ts:842-867` upserts with `user_id` set by caller. RLS (`auth.uid() = user_id`) enforces viewers can only write their own positions — making buttons live in revealed phases inherits this constraint. A viewer cannot mutate another user's position regardless of UI state.

**Input Validation:** ✅ Position enum validation lives in the RPC (`submit_point_response_by_token`) for anon and `PositionType` schema for authenticated. P711 introduces no new inputs — `revealed` is a presentation-only boolean consumed entirely in-component; never sent to the server.

**Data Protection (sealed-bid):** ✅ **Strengthened, not weakened.** Current `PointRow` leaks author's position in engage phases (root cause). P711 adds the gate: `revealed=false` in engage phases suppresses `PositionBadge`. Recipient sees author position no earlier than today — only later (after their own submit triggers phase transition). Sender-preview inherits `revealed={false}` in engage phases. `point_positions.SELECT USING (true)` accepted under P705, not touched.

**Preview Mode:** ✅ Guard at `useLetterReadingState.ts:379` blocks ALL writes when `previewMode=true`, regardless of phase/surface invoking the handler. Making results-style buttons appear in more phases does not create a new write path — all funnel through `submitPointPosition`, short-circuits before any network call in preview. Secondary guards also exist at lines 305, 332, 352, 466, 553, 567.

**Verdict:** No security-material findings. This is strictly visual. P711 removes a pre-existing information leak (author-position before recipient submit) and introduces zero new data paths, RLS surfaces, or write semantics.

### Implementation Approach

#### Build Sequence

- [ ] **Step 1 — Add `revealed` prop to `PointRow`** (`live-story-card-expanded.tsx`):
  - Add `revealed?: boolean` (default `false`) to the prop interface.
  - Header container: change gate from `point.profileSubjectPosition &&` to `((letterMode && authorName) || point.profileSubjectPosition) &&`.
  - Ear count block: remove `!letterMode &&` guard (line 291) so ear count always renders when position exists.
  - `PositionBadge` line: change to `{point.profileSubjectPosition && (!letterMode || revealed) && <PositionBadge position={point.profileSubjectPosition} />}`.

- [ ] **Step 2 — Thread `revealed` through `LiveStoryCardExpanded`** (`live-story-card-expanded.tsx`):
  - Add `revealed?: boolean` (default `true`) to `LiveStoryCardExpandedProps`.
  - Pass `revealed={revealed}` to every `PointRow` rendered inside the component.

- [ ] **Step 3 — Add `onLivePositionChange` to `LetterFlowContentProps`** (`letter-flow-content.tsx`):
  - Add `onLivePositionChange?: (pointId: string, position: PositionType | null) => void` to the props interface and destructuring.

- [ ] **Step 4 — Update engage-phase `PointRow`s** (`letter-flow-content.tsx`):
  - `point-engage` block (line ~190): add `revealed={false}`.
  - `remaining-point-engage` block (line ~304): add `revealed={false}`.

- [ ] **Step 5 — Replace `PositionComparisonCard` with `PointRow` in revealed phases** (`letter-flow-content.tsx`):
  - `point-revealed` block (lines ~216-221): replace with `<PointRow point={{ ...currentPoint, userPosition: (currentStory.positions[currentPoint.id] as PositionType) ?? null }} authorName={senderName} authorAvatarUrl={senderProfileOwner.avatarUrl} authorAvatarColor={senderProfileOwner.avatarColor} authorHasPledged={senderProfileOwner.hasPledged} letterMode revealed={true} onPositionSelect={onLivePositionChange} />`. Keep the `max-w-sm mx-auto` wrapper div.
  - `remaining-point-revealed` block (lines ~330-335): same replacement.
  - Remove `PositionComparisonCard` import from line 16.

- [ ] **Step 6 — Provide `onLivePositionChange` handler in `letter-reading-page.tsx`**:
  - Import `pointsService` if not already imported.
  - Add `handleLivePositionChange` callback: calls `pointsService.setPosition(pointId, user.id, position)` or `pointsService.removePosition(pointId, user.id)` when `position === null`. Non-fatal on error (pattern from `letter-results-page.tsx:173-198`).
  - Pass as `onLivePositionChange={handleLivePositionChange}` to `<LetterFlowContent>`.

- [ ] **Step 7 — Delete `position-comparison-card.tsx`**:
  - Delete `src/app/components/letters/position-comparison-card.tsx`.
  - Confirm zero remaining callers: `grep -r "PositionComparisonCard" src/`.

- [ ] **Step 8 — Regression**:
  - `tsc --noEmit` clean.
  - `npm test` — all P705 and P708 tests pass.
  - Visual QA: engage (header visible, no badge), revealed (badge appears, buttons tappable), results (same card shape), preview (no badge in engage, no writes on button tap).

#### Files to Create

None.

#### Files to Modify

| File | Change |
|---|---|
| `src/app/components/partners/live-story-card-expanded.tsx` | Add `revealed` to `PointRow` (decouple header from badge; remove ear-count `!letterMode` guard); add `revealed` (default `true`) to `LiveStoryCardExpanded`; thread to `PointRow` |
| `src/app/components/letters/letter-flow-content.tsx` | Add `onLivePositionChange` prop; add `revealed={false}` to engage `PointRow`s; replace both `PositionComparisonCard` usages with `PointRow revealed={true}`; remove import |
| `src/app/pages/letter-reading-page.tsx` | Add `handleLivePositionChange` callback; pass as `onLivePositionChange` to `LetterFlowContent` |
| `src/app/components/letters/letter-prediction-walk.tsx` | Drop `readOnly` on `LiveStoryCardExpanded` (line ~80); pass `revealed={false}` (no "other party" on compose → reuse engage contract: no badge, buttons interactive); wire `onLivePositionChange` → `pointsService.setPosition` so author's own position buttons write to `point_positions` while composing (Surface 4 parity) |

#### Files to Delete

| File | Reason |
|---|---|
| `src/app/components/letters/position-comparison-card.tsx` | Replaced by `PointRow revealed={true}`; zero callers after step 5 |
