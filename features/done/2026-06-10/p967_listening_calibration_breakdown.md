---
status: all-done
type: story
rank: 1000937.0
created_date: '2026-06-27'
tags: [calibration, profile, listening, coaching]
pipeline_ran: [create-spec, architect, generate-tests, spec-review, dev, ship]
uat_file: features/uat/p967.md
test_files:
  - src/tests/p967-calibration-breakdown-faithfulness.test.ts
  - e2e/integration/p967-listener-diffs-rpc.spec.ts
  - e2e/p967-calibration-breakdown.spec.ts
  - e2e/a11y/p967-accessibility.spec.ts
completed_at: 2026-06-28
---

# P967: Listening Calibration Breakdown Page

## Problem

**Situation:** A user's listening calibration is shown as a single verdict — a dot on a bar plus a one-line label ("Somewhat overconfident") — on their profile (`profile-page-v2.tsx:946`, `InlineCalibration`). Tapping the bar pops a 3-second tooltip with the label and a session count ("Based on 7 sessions").

**Complication:** That's the entire interaction. The sessions that produced the number are *named* ("7 sessions") but completely *unreachable*. There is no per-session breakdown, no explanation of how the number is computed, no interpretation of what the verdict means, and no next step. A user who wants to understand their score hits a dead end at the tooltip.

**Question:** How do we let a user see the estimate-pairs that produced their listening calibration — reconstructing the exact number — and turn the verdict into understanding plus a next action?

## Appetite

Low-to-medium blast radius: one new self-only focus page + turning an existing tooltip into a link + one small change to the bar's existing average computation (adding the eligibility filter so bar and breakdown agree — founder-accepted, see Eligibility rule). No schema change; the public bar's *display* is unchanged (only its underlying filter is corrected). Fully reversible (remove the route + revert the link + revert the filter). Low decision density — the design tree was resolved in the grilling session that produced this spec; remaining decisions are `/ux` layout details (mobile column squeeze) and copy.

## Solution

A **self-only** focus page at `/me/calibration`, reached by turning the existing profile calibration bar from a dead-end tooltip into a real link (`See your N diffs →`). Three stacked sections:

**1. Top — verdict (unchanged from today's bar).** The same calibration bar + the one verdict label ("Somewhat overconfident") + a one-line plain-language meaning.

**2. Middle — the diffs table (the mechanism).** One row per listener gap record. **Faithful by construction:** every contributing gap is shown, and the rows reconstruct the displayed average. Each row shows: partner name · date · an arrow (`→`) toward that session. Three columns:

| Column | Meaning | Source field |
|--------|---------|--------------|
| col1 | "you believed you understood their intended meaning" (0–10) | `story_verifications.listener_rating` |
| col2 | "they believe you understood them after you explained back" (0–10) | `story_verifications.speaker_rating` |
| col3 | gap = col2 − col1, signed (**computed per row** — there is no stored `calibration_gap` column on `story_verifications`) | `speaker_rating − listener_rating` |

No per-row word labels — the signed number in col3 carries the meaning.

**Sign invariant (faithfulness):** col3 = `speaker_rating − listener_rating` = `actual − self`. This must equal the value shown on the bar. Note the trap: the calibration service computes `calibrationGap = self − actual` (`calibration-service-real.ts:174`) and `profile-page-v2.tsx:143` *negates* it (`listenerGap = -calibrationGap`) to display `actual − self`. The breakdown must use the **displayed** sign (`actual − self` = col2 − col1), never the raw service `calibrationGap`, or the footer shows the opposite sign of the bar.

**Unit invariant (faithfulness):** the score is averaged over **verification records** (one `story_verifications` row per story/round), NOT over distinct meetings. One `/live` session produces multiple rows. The footer divides by the **row count** the bar uses (`calibration-service-real.ts:160`). Label these "diffs", never "sessions" — a user counting meetings and dividing would get a different number. The **column foot** shows `sum {S} ÷ {N} diffs = {avg}` (e.g. `sum −10 ÷ 7 diffs = −1.4`), both sum and average visible so the eye can verify by adding the column. The same partner+date can appear on multiple rows (multiple rounds) — disambiguate rows (e.g. story title / round index), since partner · date is not unique.

The two header sentences carry the semantics. On narrow screens (≤320px) they abbreviate to "you believed" / "they believe" with an `(i)` info icon whose tooltip holds the full sentence. **Reuse the existing `CalibrationTooltip`** (`calibration-display.tsx:34`, handles desktop-hover + mobile-tap with 3s auto-close) — do not build a new tooltip.

**3. Bottom — meaning + next step.** A "what this means" paragraph (overconfidence is normal and useful to know; the fix is trusting the feeling less and verifying more before relying on it) + two CTAs:
- **"Practice in a session"** — blue, primary → links to **`/live`**.
- **"Learn more about the Co-Founder Program →"** — secondary text link (the upsell) → links to **`/program`** (the co-founder program offer page; `App.tsx:291`).

### Visibility

**Self-only — enforced at the database, not the client.** The breakdown names partners and exposes their verdicts on you (two-party confessional data). A third party must never see who you sat with or how they rated you.

**Critical: a client-side `isOwnProfile` conditional is NOT sufficient.** The current RLS on `story_verifications` (`20260403224331_p581_clarity_letters.sql:321`) returns a `source='live'` row to *anyone* when the attached story is `public` — it is not scoped to `listener_id = auth.uid()`. So a third party calling `getListenerVerificationHistory(victimId)` (`calibration-service-real.ts:297`, filtered only by `listener_id`) — or hitting the REST endpoint directly — already receives the victim's partner names, dates, and `speaker_rating`. The data leaks before any React code runs.

The breakdown must read its rows through an **auth-scoped path that hard-filters `listener_id = auth.uid()`** — a `SECURITY DEFINER` RPC (e.g. `get_my_listener_calibration_diffs()`), which becomes the breakdown's only data source. The public bar stays unchanged (it retains the social-pressure role from `definitions.md`). No anonymization layer.

### States

- **Empty (0 sessions):** no bar, no rows. "Finish your first listening session to start seeing your calibration diffs." + `[Start a session]`.
- **Pre-unlock (<5 listener sessions):** verdict label hidden / bar locked (matches existing P539 unlock gate), **but diff rows shown as they accrue** (format: "{N} of 5 — your score unlocks after {5−N} more", e.g. 3 rows → "3 of 5 — your score unlocks after 2 more"). The mechanism teaches before the verdict exists.
- **Unlocked (≥5):** full page as described.

### Data

One table backs everything: **`story_verifications`** (`20260204_stories_points_calibration.sql:116`), with `listener_rating` (self), `speaker_rating` (actual), `speaker_id`, `listener_id`, `created_at`. There is **no stored gap column** — the gap is computed. `avgGap` is computed on-read (`definitions.md:516`, `calibration-service-real.ts:169-174`).

Rows are distinguished by a **`source` column** (`'live'` | `'letter'`) and a `verified` boolean (`20260403224331_p581_clarity_letters.sql:102-105`), not by separate tables. Today's bar aggregate includes **all** rows regardless of `source`/`verified` (no filter at `calibration-service-real.ts:145-154`). The breakdown must use the **same row set** the bar uses so it reconstructs the displayed average — see the letter-row founder decision below.

**Two data paths (don't wire only one):** below the 5-row threshold, `getCalibration` returns `status:'insufficient'` with **no** `calibration` object (`calibration-service-real.ts:161-166`). The pre-unlock accruing rows must therefore come from the auth-scoped listener-history read, not from `getCalibration`.

**Eligibility rule (resolves both the letter question and the NaN guard):** a row contributes to the score and the breakdown **only when both `speaker_rating` and `listener_rating` are non-null.** Consequences, all desirable:
- Today's `source='letter'` rows carry only `listener_rating` (the P581 RPC at `20260403224331…sql:573-586` inserts no `speaker_rating`) → they have no gap → naturally excluded. No header lie.
- Null ratings cannot poison the average (NaN guard).
- **Future-proof:** when async letter rating ships, it will be based on the receiver's actual paraphrase attempt (letters have explain-back; only the *rating* of it is deferred). Such rows will gain a real `speaker_rating`, the explain-back will have genuinely happened, the col2 header stays true, and they flow into the score automatically — no spec change.

Apply this identical filter to BOTH the bar average and the breakdown so they stay faithful.

**Granularity:** one row = one **story verification** (`story_id` is `NOT NULL` — every gap is tied to a specific story/version; there is no story-less verification). A `/live` session can verify multiple stories, so one session yields multiple rows — this is why the denominator is rows ("diffs"), not sessions. Use the **story title** (+ round/sort order if needed) to disambiguate rows that share partner + date.

## Risks / Non-Goals

### Risks
- **Two-party privacy leak (CRITICAL).** Current RLS makes a client-side gate cosmetic — live verification rows on public stories are world-readable. Mitigation: auth-scoped `SECURITY DEFINER` RPC hard-filtering `listener_id = auth.uid()` as the breakdown's only data source (see Visibility). Test: a non-owner querying another user's listener diffs gets zero rows.
- **Faithfulness drift — denominator.** The bar divides by verification-row count, not meetings. Mitigation: footer divides by the same row count; label "diffs" not "sessions". Test: row sum ÷ row count equals the displayed bar value.
- **Faithfulness drift — sign.** Service `calibrationGap` is `self − actual`; the bar negates it. Mitigation: breakdown computes col3 = `speaker_rating − listener_rating` per row and asserts it matches the displayed bar sign. Test: a known fixture where bar = −1.4 produces a footer of −1.4, not +1.4.
- **Faithfulness drift — row set.** If the breakdown filters rows (e.g. drops letter/unverified/null) differently from the bar, sums diverge. Mitigation: bar and breakdown share one eligibility filter (resolved by the letter founder decision + the null guard below).
- **Null ratings → NaN.** `reduce(sum + speaker_rating)` (`calibration-service-real.ts:171`) NaNs on a null rating (pending/multi-round). Mitigation: define eligible rows as both ratings non-null, applied identically to bar and breakdown.
- **Mobile column squeeze.** Two full-sentence headers + three number columns overflow at 320px. Mitigation: abbreviated headers + `(i)` tooltip; stacked-card row form below the table breakpoint — resolved in `/ux`.
- **Pre-unlock leakage of a de-facto score.** Showing accruing rows before unlock could let a user mentally compute the hidden verdict. Accepted: the rows *are* the teaching goal; only the labelled verdict is gated, and that's a presentation choice, not secret data.

### Non-Goals
- Do NOT add a post-session end-screen entry point. The `/live` end screen is already crowded (transcript upload, history link, retry); the breakdown's value doesn't expire and is sought deliberately. Profile-only entry for v1.
- Do NOT make the breakdown visible to anyone but the owner. No anonymized public variant.
- Do NOT change the bar's display, axis, verdict labels, or unlock threshold. **Exception (in scope):** add the eligibility filter (`speaker_rating IS NOT NULL AND listener_rating IS NOT NULL`) to `getCalibration` so the bar and breakdown reconcile — this is a TS filter change, not a migration, and it also fixes a latent NaN when null-rating (letter) rows exist. What is DEFERRED (not this ticket) is migrating `getCalibration` to an auth-scoped RPC for defense-in-depth — that's the privacy follow-up, distinct from the eligibility filter.
- Do NOT add a database table, column, or migration.
- Do NOT use amber/orange/red for the verdict or green as a "win" — calibration is neutral self-knowledge; copy carries meaning, color stays neutral (design-system).
- Do NOT build a new tooltip component — reuse `CalibrationTooltip`.

## Done-When

- [ ] Tapping the calibration bar on your own profile navigates to `/me/calibration` (no longer a dead-end tooltip)
- [ ] The page lists one row per contributing listener gap, each with partner name, date, col1, col2, and signed col3
- [ ] The col3 foot shows `sum ÷ diff count = average`, divides by the same row count the bar uses, and that average equals the value (and sign) on the bar (verified by test)
- [ ] The breakdown reads listener diffs through an auth-scoped DB path; a non-owner cannot retrieve another user's diffs (verified by test, not by client gating)
- [ ] No per-row word labels appear in the rows; col3 is numeric/signed only
- [ ] On a non-owner's profile, the breakdown is unreachable and no diff data is delivered (verified by test)
- [ ] Empty state (0 sessions) and pre-unlock state (<5) render their specified copy and CTAs
- [ ] Pre-unlock shows accruing rows while the verdict label stays hidden
- [ ] Column header full sentences show inline on wide screens and via `(i)` tooltip (reusing `CalibrationTooltip`) when abbreviated on narrow screens
- [ ] Page renders without overflow at 320px, 375px, and desktop
- [ ] Verdict and states use no banned colors (no amber/orange/red state, no green "win")

## UX Notes

- **Page type:** Focus page (per navigation rules) — use `<FocusHeader onBack={...} />`, no BottomNav. Add `/me/calibration` prefix to `focusRoutes` in `bottom-nav.tsx`.
- **Routing (resolves BLOCK-1):** `/me/calibration` is a **sibling** route in `App.tsx`, registered **before** the flat `/me` route (so React Router does not mis-match). It is NOT nested under `/me` — `/me` is a flat route that redirects slug-users to `/p/:slug` (`App.tsx:338`), so a nested child would be unreachable.
- **Entry + back-nav (resolves BLOCK-1):** the bar link lives on `profile-page-v2.tsx` (rendered at `/p/:slug`), shown only when `isOwner` (`profile-page-v2.tsx:663`). `FocusHeader onBack` must return to the **profile the user came from** — use `navigate(-1)` (browser history) rather than a hardcoded `/me`, because `/me` immediately redirects slug-users away. If no history entry exists (deep link), fall back to `/p/{own-slug}`.
- **States:** happy (unlocked) · pre-unlock (accruing rows, gated label) · empty (0 sessions) · loading.
- **Row arrow (`→`):** v1 shows the three numbers inline; the arrow deep-links to the session/round when addressable. Degrades gracefully (non-clickable or omitted) if rounds aren't URL-addressable yet — see Follow-up.

## Acceptance Criteria

- [ ] A user can see, from their own profile, the per-session estimate-pairs that produced their listening calibration
- [ ] The breakdown provably reconstructs the displayed score
- [ ] The page explains what the verdict means and offers a practice and a coaching next step
- [ ] No third party can see a user's partners or their verdicts
- [ ] Works on mobile and desktop

## UI Contract

| Element | Value | Context |
|---------|-------|---------|
| Route | `/me/calibration` | Self-only focus page |
| Bar link label | `See your {N} diffs →` | On own profile, replaces dead-end tooltip; {N} = verification-row count |
| col3 source | computed `speaker_rating − listener_rating` | No stored gap column; must match displayed bar sign |
| Column foot | `sum {S} ÷ {N} diffs = {avg}` | "diffs" not "sessions"; {N} = bar's row count |
| col1 header (full) | "you believed you understood their intended meaning" | Wide screens |
| col2 header (full) | "they believe you understood them after you explained back" | Wide screens |
| col1 header (narrow) | "you believed" + `(i)` | ≤320px, tooltip holds full sentence |
| col2 header (narrow) | "they believe" + `(i)` | ≤320px, tooltip holds full sentence |
| col3 header | "gap" | All widths |
| col1 tooltip | "Your own rating, before feedback: how well you thought you understood what your partner actually meant." | `(i)` / hover |
| col2 tooltip | "Your partner's rating, after you explained their point back to them: how well they felt you actually understood." | `(i)` / hover |
| Primary CTA | "Practice in a session" | Blue, design-system action → `/live` |
| Secondary CTA | "Learn more about the Co-Founder Program →" | Text link, upsell → `/program` |
| Empty state | "Finish your first listening session to start seeing your calibration diffs." + `[Start a session]` | 0 sessions |
| Pre-unlock note | "{filled} of 5 — your score unlocks after {remaining} more" | <5 sessions |

## Follow-up (not a blocker)

Make session rounds URL-addressable (e.g. `/sessions?session={id}&round={n}` hydrating the existing in-component `setView` in `my-sessions-page.tsx`) so the row arrow deep-links to the transcript. Currently the `/sessions` drill-down is in-component view state, not a route. v1 ships without it.

## Technical Architecture

### Technical Analysis

**Reuse Inventory**

| Asset | File | Usage in p967 |
|-------|------|---------------|
| `InlineCalibration`, `CalibrationTooltip` | `src/app/components/profile/calibration-display.tsx` | Reuse on profile — link wrapping changes only |
| `getCalibration` | `src/app/data/calibration-service-real.ts` | NOT called by breakdown page; still drives profile bar |
| `getListenerVerificationHistory` | `src/app/data/calibration-service-real.ts` | NOT used — has RLS privacy leak; new RPC replaces for breakdown |
| `FocusHeader` | `src/app/components/layout/focus-header.tsx` | Page chrome for `/me/calibration` |
| `focusRoutes` | `src/app/components/layout/bottom-nav.tsx` | Add `/me/calibration` to suppress bottom nav |

**RLS Privacy Leak (confirmed)**
Migration `20260403224331_p581_clarity_letters.sql` grants `SELECT` on `story_verifications` to authenticated users when the attached story is public, without scoping to `listener_id = auth.uid()`. This means `getListenerVerificationHistory` (which uses client-side Supabase) leaks other users' self-ratings and speaker ratings. The breakdown page MUST NOT use this function. The new RPC hard-filters by `auth.uid()` server-side.

**Sign Invariant**
- `calibration-service-real.ts` line 174: `calibrationGap = listenerSelfRatingAvg - listenerCalibrationAvg` (self − actual)
- `profile-page-v2.tsx` line 143: `listenerGap = -calibrationGap` (actual − self) — this is the displayed bar value
- New RPC: `diff = speaker_rating - listener_rating` (actual − self) — matches bar sign
- **Invariant:** `AVG(diff) over eligible rows = displayed bar value` — asserted in hook comment

**Eligibility Rule**
A row is eligible when `speaker_rating IS NOT NULL AND listener_rating IS NOT NULL`. Today's letter rows have `speaker_rating = NULL` → naturally excluded. This rule must be identical in the existing `getCalibration` aggregate query and the new RPC WHERE clause.

**`getCalibration` threshold behavior (verified)**
`calibration-service-real.ts` lines 161–166: when `listenerCount < SESSIONS_THRESHOLD` it returns `{ status: 'insufficient', sessionsCompleted: listenerCount, sessionsRequired: SESSIONS_THRESHOLD }` with no `calibration` object. The breakdown page must NOT call this function to get pre-unlock rows — it would receive no rows. The breakdown page calls the new RPC directly.

---

### Architecture Decisions

**Decision 1: New SECURITY DEFINER RPC for breakdown reads**

*Chosen:* Create `get_my_listener_calibration_diffs()` — a SECURITY DEFINER Postgres function that hard-filters `listener_id = auth.uid()` and returns only eligible rows with speaker/story metadata.

*Rationale:* The current RLS policy on `story_verifications` is table-wide and does not scope to the calling user's listener rows. A SECURITY DEFINER function executes as the function owner (postgres), bypasses RLS, and applies its own `WHERE listener_id = auth.uid()` — which cannot be spoofed by a client-side param. This is the standard Supabase pattern for row-scoped reads that RLS cannot cleanly express without risking cross-user leakage.

*Trade-off:* SECURITY DEFINER functions require careful auditing (they bypass RLS entirely). Mitigated by: (a) no input params that could enumerate other users, (b) `auth.uid()` is a Supabase session intrinsic not passable from client, (c) function is read-only (SELECT only).

*Alternative rejected:* Fixing the RLS policy to add `listener_id = auth.uid()`. Rejected because the existing policy also needs to serve the story-verification public display (speaker can see verifications on their own story). A single policy cannot satisfy both scopes without a complex `USING` expression that would be easy to break in future migrations. A dedicated RPC is cleaner and auditable.

**Decision 2: Eligibility filter — single source in RPC + matching WHERE in service**

*Chosen:* The RPC `WHERE` clause is the canonical eligibility definition: `speaker_rating IS NOT NULL AND listener_rating IS NOT NULL`. The TypeScript file `calibration-service-real.ts` adds a comment `-- eligibility: matches get_my_listener_calibration_diffs WHERE clause` adjacent to its own filter, making drift detectable by grep.

*Rationale:* SQL is the right place for the filter (runs server-side, not post-hoc in JS). Two SQL locations (RPC + service query) is acceptable because both are in the same repo and the comment creates a grep-detectable coupling. A shared SQL view was considered but adds DDL complexity for minimal gain.

*Trade-off:* Two SQL locations for the same rule. Mitigated by the grep anchor comment. If the filter ever changes, `grep "eligibility: matches"` finds both.

*Alternative rejected:* Postgres VIEW for eligible rows, shared between RPC and service. Rejected because the service query is a complex aggregate that doesn't cleanly share a view with the per-row RPC return shape.

**Decision 3: Breakdown page does NOT call `getCalibration`**

*Chosen:* The breakdown page calls only `get_my_listener_calibration_diffs()` via a new hook `useListenerCalibrationDiffs`. It derives the threshold state (empty / pre-unlock / unlocked) from row count. It does NOT call `getCalibration`.

*Rationale:* `getCalibration` returns `null` below the 5-row threshold by design (calibration is statistically unreliable). The breakdown page needs rows even in pre-unlock state (to show the blurred progress view). Calling `getCalibration` would force two separate fetches with different semantics. One RPC returning all eligible rows is sufficient — the component derives display mode from `rows.length`.

*Trade-off:* The footer average computed client-side from RPC rows must exactly match the profile bar (which comes from `getCalibration`). This is guaranteed by the sign invariant (both compute `actual − self` arithmetic mean over the same eligible set) and is asserted in the hook comment. A future regression test should verify numeric equality.

*Alternative rejected:* Calling `getCalibration` for the footer and the RPC for rows. Rejected because it requires two round-trips, and the footer value is derivable from the rows already fetched.

**Decision 4: Page route `/me/calibration` as focus page**

*Chosen:* Route `/me/calibration`, component `src/app/pages/calibration-breakdown-page.tsx`, uses `FocusHeader` with `onBack` routing to `/me` (own profile). Added to `focusRoutes` in `bottom-nav.tsx` so the bottom nav is suppressed.

*Rationale:* Matches the existing focus-page pattern used for other single-task pages in the product. The `/me` prefix signals "my own data" — consistent with `/me/sessions` if that route exists or will exist.

*Trade-off:* Route is not deep-linkable to a specific row (the session-history deep-link is a documented follow-up). Acceptable for v1.

*Alternative rejected:* Modal overlay from profile page. Rejected because modals are not URL-addressable, break browser back, and the table may be long enough to warrant full-page scroll.

**Decision 5: Profile bar becomes a `<Link>` on own profile**

*Chosen:* In `profile-page-v2.tsx`, when `isOwnProfile === true`, wrap the calibration bar render in `<Link to="/me/calibration">`. The `CalibrationTooltip` remains for other users' profiles (unchanged).

*Rationale:* The spec requires the bar to be a navigation entry point on own profile. Wrapping in `<Link>` is the minimal change — no new component, no tooltip removal for other-profile views.

*Trade-off:* The tooltip currently fires on hover for own profile too. After this change, own-profile hover shows no tooltip (link navigation takes over). This is intentional — the breakdown page replaces the tooltip's information role for the owner.

*Alternative rejected:* Replacing `CalibrationTooltip` with a new component. Over-engineering — a conditional `<Link>` wrapper achieves the same result with fewer moving parts.

---

### Security Review

**RLS Policies:**
- ⚠️ **Live-row public-story leak (CRITICAL — confirmed).** `20260403224331_p581_clarity_letters.sql:320-334` grants SELECT on `source='live'` rows to *any* caller (anon or authenticated) when `stories.visibility = 'public'` — no `listener_id = auth.uid()` filter, no explicit `TO` role list (so `anon` is included). A third party calling `getListenerVerificationHistory(victimId)` (`calibration-service-real.ts:297`) receives the victim's partner names, slugs, dates, `listener_rating`, and `speaker_rating` for any verification on a public story, before any React runs. The pre-P581 policy (`20260325120000_p586_...sql:377-384`) had the identical hole.
- ✅ **Letter rows already protected** — the P581 `CASE` branch for `source='letter'` gates on `speaker_id = auth.uid() OR listener_id = auth.uid()`.
- ⚠️ **The mitigation does not exist yet** — `grep` finds zero matches for `get_my_listener_calibration_diffs` in migrations. The leak is unmitigated until the RPC ships. **This RPC migration MUST reach prod before the `/me/calibration` route is reachable in prod** (build-sequence step 1 before step 4; ship order enforces it).
- ✅ **RPC design is correct as specified.** `SECURITY DEFINER` bypasses the permissive RLS while the body filters on `auth.uid()`. Four hard requirements (verify in the migration): (1) `SET search_path = public` (matches `get_letter_by_token`, line 345); (2) **zero client-supplied parameters** — identity from `auth.uid()` only, never a `userId` arg; (3) `WHERE listener_id = auth.uid()` as the hard filter; (4) `GRANT EXECUTE ... TO authenticated` only, never `anon`.

**Authentication:**
- ⚠️ Anonymous callers can read live-row data today (policy defaults to `anon`). The RPC must grant to `authenticated` only; `auth.uid()` is `NULL` for anon → returns zero rows, which is the correct fail-closed behavior.

**Authorization:**
- ✅ Exposing the speaker's rating *to the listener* is acceptable — the listener was present when it was given live; not new disclosure.
- ⚠️ Exposing it (plus the partner's name + slug) *to third parties* is the violation. The RPC closes it; client `isOwnProfile` gating does not.

**Input Validation:**
- ⚠️ `getListenerVerificationHistory(userId)` trusts a client-supplied UUID with no server identity check (`calibration-service-real.ts:297`) — it must NOT be the breakdown's data path. The new RPC must accept no id param. The `/me/calibration` route must not pass a client id to the data layer.

**Data Protection:**
- ⚠️ PII in scope: partner `name`, `slug`, `speaker_rating`, `listener_rating`, `created_at`. Pre-unlock accruing rows carry the same exposure — the lock is presentational, so they too must come only through the RPC.
- ✅ Public bar unchanged — exposes only the aggregate verdict, no per-session pairs. Not a new exposure.
- 📋 **Noted, out of scope (DEFER) — privacy only:** migrating `getCalibration` (the bar's own data path, `calibration-service-real.ts:145-154`) to an auth-scoped RPC for defense-in-depth against the same leaky RLS is a separate follow-up, not this ticket. **Distinct from the eligibility filter:** adding the null-rating filter to `getCalibration` IS in scope (it's required for bar/breakdown faithfulness — see Eligibility rule and Non-Goals exception). Only the RPC-migration of this path is deferred.

---

### Implementation Approach

#### Build Sequence

1. **Migration** — write `get_my_listener_calibration_diffs()` RPC, JOINing `profiles` (speaker name + slug) and `stories` (title). **Security contract (all four mandatory, per Security Review):** (a) `SECURITY DEFINER` + `SET search_path = public`; (b) **no parameters** — identity from `auth.uid()` only, never a client-supplied id; (c) `WHERE listener_id = auth.uid() AND speaker_rating IS NOT NULL AND listener_rating IS NOT NULL` (auth filter + eligibility filter together); (d) `GRANT EXECUTE ... TO authenticated` only, never `anon`. Return per-row `listener_rating`, `speaker_rating`, speaker name/slug, story title, `created_at`, and `sort_order` + `story_id` (NOTE-2 — disambiguates multiple rounds of the same story sharing partner+date; the page keys rows on `id` and labels with story title + round when two rows share `story_id`). Apply locally, test with `supabase db reset`. **This migration must reach prod before the route is enabled (step 6).**
2. **Eligibility filter on the bar (resolves BLOCK-2)** — in `calibration-service-real.ts` `getCalibration`, add `.not('speaker_rating', 'is', null).not('listener_rating', 'is', null)` to the listener aggregate query (lines 145-154), so `listenerCount`, the average, and the unlock threshold all use the same eligible row set as the RPC. Fixes the latent NaN on null-rating rows and keeps bar = breakdown. Mirror the identical predicate in the RPC WHERE clause.
4. **Hook** — `src/app/data/use-listener-calibration-diffs.ts`: calls the RPC, types the response, asserts sign invariant in comment, returns `{ rows, isLoading, error }`.
5. **Page component** — `src/app/pages/calibration-breakdown-page.tsx`: three-state render (empty / pre-unlock / unlocked), table with diff column, footer average row.
6. **Route** — add `/me/calibration` as a **sibling** route in `src/App.tsx`, registered **before** the flat `/me` route (BLOCK-1).
7. **Nav suppression** — add `/me/calibration` to `focusRoutes` in `src/app/components/layout/bottom-nav.tsx`.
8. **Profile link (resolves BLOCK-3)** — in `profile-page-v2.tsx`, at the `InlineCalibration` call site (~line 951), when `isOwner` (already in scope at line 663) render a **separate labeled `<Link to="/me/calibration">See your {N} diffs →</Link>` directly below the bar** — do NOT wrap or replace the visual bar itself (it is a pure visual element with a tooltip, no text node), and do NOT add an `isOwner`/`href` prop to `InlineCalibration` (keep the component unchanged; the link is a sibling element in the page). `{N}` = the eligible-diff count from the same auth-scoped source the page uses. On other-profile views (`!isOwner`) the bar renders exactly as today with no link.

#### Files to Create

| File | Purpose |
|------|---------|
| `supabase/migrations/20260627_p967_listener_calibration_rpc.sql` | SECURITY DEFINER RPC + eligibility filter |
| `src/app/data/use-listener-calibration-diffs.ts` | React hook wrapping RPC |
| `src/app/pages/calibration-breakdown-page.tsx` | Full breakdown page (3 states) |

#### Files to Modify

| File | Change |
|------|--------|
| `src/app/data/calibration-service-real.ts` | Add null-rating eligibility filter to `getCalibration` listener aggregate (BLOCK-2) so bar = breakdown |
| `src/App.tsx` | Add `/me/calibration` as sibling route **before** `/me` (BLOCK-1) |
| `src/app/components/layout/bottom-nav.tsx` | Add `/me/calibration` to `focusRoutes` |
| `src/app/pages/profile-page-v2.tsx` | Add labeled `<Link>` below bar at `InlineCalibration` call site when `isOwner` (line 663); component unchanged (BLOCK-3) |

#### Deferred (documented follow-up, not v1)

- **Session deep-link from breakdown table**: clicking a row navigates to that session in `my-sessions-page.tsx`. Deferred because `my-sessions-page.tsx` uses in-component view state, not URL routing. Requires making sessions URL-addressable first. Captured in spec's Follow-up section — do not implement in this ticket.
- **Letter rows in breakdown**: currently excluded by eligibility filter (no `speaker_rating`). When async letter rating ships, it will be based on the receiver's actual paraphrase attempt (letters have explain-back; only the *rating* of it is deferred). Such rows will gain a real `speaker_rating`, the explain-back will have genuinely happened, the col2 header stays true, and they flow into the score automatically — no spec change.

## Test Coverage Strategy

**What's tested (and why):**
- ✅ **Faithfulness math (unit, 12)** — sign (col3 = `speaker_rating − listener_rating` = actual − self, NOT the negated service `calibrationGap`), denominator (÷ row count, not distinct sessions), eligibility/NaN (null `speaker_rating`/`listener_rating` excluded from both count and average). These are the trust-breakers; they get the densest coverage.
- ✅ **Privacy boundary (integration, 7)** — the critical adversarial test: user B (separate JWT) calls `get_my_listener_calibration_diffs()` and gets ZERO of user A's rows; the RPC takes no `userId` param; anon is denied. Designed to FAIL if the breakdown is wired to the leaky `getListenerVerificationHistory` instead of the auth-scoped RPC. Plus P270 migration-existence (two-client pattern).
- ✅ **States + flows (E2E, 14)** — smoke (page loads, no console errors) + empty / pre-unlock / unlocked, faithfulness display (rows reconstruct the bar), CTAs, profile-bar link. Exact UI Contract strings.
- ✅ **Accessibility (a11y, 9)** — keyboard-reachable `(i)` info tooltips, heading structure, FocusHeader back button.
- ✅ **Manual UAT (8)** — three states, eye-check faithfulness, self-only guarantee, mobile 320px column abbreviation + tooltip.

**What's NOT tested (and why):**
- ❌ Component internals / styling — covered by E2E behavior + manual visual QA.
- ❌ The `getCalibration` bar path's own RLS leak — explicitly out of scope (deferred defense-in-depth item in Security Review).
- ❌ Real session deep-link from a row — deferred follow-up (sessions not URL-addressable yet).

**Pyramid:** 12 unit · 7 integration · 14 E2E · 9 a11y = **42 automated** + 8 UAT scenarios.
