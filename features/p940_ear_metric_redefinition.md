---
status: qa
type: task
rank: 1000934.0
created_date: '2026-06-16'
tags: [ears, calibration, profile, events, migration]
delivery_stage: ship
pipeline_ran: [create-spec, dev, ship]
---

# P940: Redefine the "ear" profile metric and fix its cross-surface display bugs

## Problem

**Situation:** The "ear" badge (Ear icon + count) appears on profiles, story/point
cards, and event pages. It is currently a credibility metric: `profiles.ears_count`,
maintained by a DB trigger, counts distinct speakers who rated a listener's
explain-back at ≥8/10.

**Complication:** Three coupled defects surfaced on `/p/su-myat-noe`:

1. **Under-counts.** The trigger `update_profile_ears_count`
   (`supabase/migrations/20260204_stories_points_calibration.sql:246-292`, re-applied
   in `20260312120000_fix_ear_count_trigger_security.sql`) increments `ears_count`
   only once per **distinct `(speaker_id, listener_id)` pair**, gated on
   `accuracy_achieved` (`speaker_rating >= 8`). A founder who badges the same person
   5 times shows **1** ear, not 5. Su shows 1 despite 5 verifications.

2. **Surfaces disagree.** The same person shows a different count on the event page
   than on the profile. Confirmed root cause (not timing/cache): the prod event
   service `events-service-real.ts` `getEventBySlug` maps host fields (lines 78-88)
   but **never maps `hostEarCount`**, and the host `select` omits `ears_count`, so
   `event.hostEarCount` is `undefined` → renders `?? 0`. Su is the **host** of event
   `how-well-do-your-ai-clients-and-partners-understand-your-business-model-2026-06-08-bpl3`,
   so her event-page badge reads 0 while her profile reads 1. The same hardcoded
   host `earCount: 0` exists in `getPeopleFromEvent` (~line 714, practice rooms).
   The `api.ts:3529` legacy path maps it correctly but is not the path in use.

3. **Copy will become false.** The tooltip "verified cognitive understanding —
   confirmed by story authors" is duplicated verbatim in three places and assumes
   the ≥8 gate that the redefinition removes.

**Question:** Redefine the metric to match its intended meaning and make every surface
agree.

## Appetite

Medium blast radius — touches a public-profile metric shown across profiles, cards,
and events, plus a one-time prod data backfill. Reversible (trigger is recreatable;
backfill is recomputable from `story_verifications`, the source of truth — no data is
destroyed). Low decision density — the redefinition and exact copy are already decided
with the founder (below); no open product questions.

## Solution

Redefine **one ear = one distinct `story_id` where the speaker gave a rating after the
listener's paraphrase** — no ≥8 "verified" gate. An "attempt to verify" = a rating
exists after the paraphrase. Dedup key changes from `(speaker_id, listener_id)` to
`story_id`.

This is a deliberate **meaning shift** for a public metric: from *credibility*
("people confirmed you understood them") to *practice volume* ("you attempted N rated
explain-backs"). It is intentionally coherent with the listening-calibration
component — ear = how many explain-backs you've done; calibration = how accurate your
self-rating was across them. Same event stream, two readings.

1. **Trigger rewrite.** Recompute (not increment) on each `story_verifications` insert:
   `ears_count = COUNT(DISTINCT story_id) WHERE listener_id = NEW.listener_id`.
   Idempotent recompute — no drift, no dedup-state bookkeeping. Keep
   `verification_session_count` and `stories.understood_count` behavior unchanged.
2. **Backfill.** One-time recompute of `ears_count` for all profiles from
   `story_verifications` so existing rows self-correct (Su 1 → 5). **Writes to TEST
   automatically; applying to PROD is a separate explicit founder ask.**
3. **Event host fix.** In `events-service-real.ts`: add `ears_count` to the host
   `select` and map `hostEarCount` in `getEventBySlug`; same for the host branch of
   `getPeopleFromEvent` (drop the hardcoded `0`).
4. **Copy.** Update all three tooltip sites to the confirmed strings (UI Contract
   below): `ear-badge.tsx:18-21`, `profile-page-v2.tsx:863-868`,
   `EventDetail.tsx:540`.
5. **Consistency guardrail (revised after implementation discovery).** The ear count
   is identical across surfaces *by construction* — every people-returning query reads
   the same `profiles.ears_count` at join time; there are **no denormalized copies**.
   The recurring bug is hand-rolled per-query mapping that either omits `ears_count`
   from the `select` (→ `undefined` → `0`, the event-host bug) or hardcodes `0`.
   **Discovery:** the originally-proposed `toPersonRef()` mapper does not fit — `PersonRef`
   (`types/index.ts:14`) carries no ear count and **no ear surface consumes `PersonRef`**
   (`PersonRow` takes flat props; story/point cards use bespoke `authorEarsCount` /
   `holder.earCount`). And a single shared SELECT-fragment string can't cover the
   per-relationship differences (host uses `full_name:name, headline:role`; author/
   attendee use plain `name`, no role). Routing everything through a `PersonRef` mapper
   would force the consumer reshaping we put in Non-Goals. **Revised guardrail:**
   - `earCountOf(profileRow)` — one extractor (`row?.ears_count ?? 0`) replacing every
     inline `?? 0` ear-extraction site (~12 across `stories-service-real`,
     `points-service-real`, `events-service-real`, `letters-service`, `docs-service`,
     `calibration-service-real`, `api.ts`). No surface can typo the field or hardcode `0`.
   - **Guard test** — asserts every people-returning data-layer query includes
     `ears_count` in its `select`. This is the real "can't forget the column" mechanism
     (a green happy-path test would not catch omission — the event-host bug). Must be
     seen to FAIL when the column is removed (epistemic gate 7).
   - `earCount?: number` added to `PersonRef` (additive, mirrors existing `badgeCount`)
     so the canonical shape *can* carry it going forward — without forcing consumers to
     migrate now.
   Behavior-preserving — the value does not change, only where the field name / default
   is defined.

## Risks / Non-Goals

### Risks
- **Per-story dedup semantics.** If multiple speakers rate the same listener on the
  same story, that is **1** ear (per-story, by design). Verify the `COUNT(DISTINCT
  story_id)` recompute reflects this, and that test fixtures with multi-speaker single
  stories assert 1, not N.
- **Trigger fires per row; recompute is O(verifications-for-listener).** Acceptable at
  current volume; flag if `story_verifications` grows large (would move to incremental
  or a materialized count).
- **Copy duplication.** Three verbatim copies will drift again. Mitigation: update all
  three in the same commit; optionally centralize into `EarBadge` (not required).
- **Backfill ordering.** Run trigger replacement and backfill in the same migration so
  no insert lands between them under the old logic.
- **Guardrail refactor blast radius.** Routing ~6 data-service files through the shared
  fragment + `toPersonRef` mapper is mechanical but touches many queries. Mitigation:
  behavior-preserving (same value, same output shape); verify each migrated query still
  returns identical fields via existing service tests before/after; migrate one service
  file per commit so a regression is bisectable.
- **PersonRef shape mismatch.** `PersonRef` (`types/index.ts:14`) may not currently
  carry `earCount`/avatar fields. Verify its shape first; extend it (additively) rather
  than inventing a parallel type. Do not break existing `PersonRef` consumers.

### Non-Goals
- Do NOT change the listening-calibration component or its computation.
- Do NOT change `verification_session_count` semantics.
- Do NOT change the `accuracy_achieved` (≥8) gate where it is used elsewhere —
  `stories.understood_count` still depends on it; leave that trigger alone.
- Do NOT centralize the tooltip into `EarBadge` unless it is a clean lift; copy parity
  across the three sites is the requirement, not a refactor.
- Do NOT rename the existing per-surface component fields (`authorEarsCount`,
  `hostEarCount`, `ear`, `earsCount`) to a single `earCount`. The mapper outputs a
  consistent shape; components keep their current prop names. The renames are cosmetic,
  high-churn, and add no correctness — explicitly excluded (the rejected "Full
  unification" option). Not deferred work; a deliberate non-goal.
- Do NOT touch mock services' hardcoded ear values (`stories-service-mock`,
  `points-service-mock`) beyond what keeps types compiling — they do not run in prod.
- Do NOT apply the backfill to PROD without a separate explicit founder ask.
- Do NOT touch the legacy `api.ts` event path beyond what parity requires.

## Done-When

- [x] Trigger recomputes `ears_count = COUNT(DISTINCT story_id)` per listener, with no
      ≥8 gate; verified by a test where the same speaker rates one listener on 5
      distinct stories → ear count = 5. *(integration test, 4/4 vs test DB)*
- [x] Test: same speaker re-rates the **same** story → ear count stays 1 (story dedup).
- [x] Test: a sub-8 rating still counts toward ears (no verified gate).
- [x] Backfill migration recomputes `ears_count` for all profiles from
      `story_verifications`; applied to TEST DB (deploy-manifest updated).
- [x] Event host ear count is fetched + mapped in `events-service-real.ts`
      (`getEventBySlug` and `getPeopleFromEvent` host branch); host `select` includes
      `ears_count`.
- [x] Profile page and event page read the **same** `ears_count` source by
      construction (no denormalized copies). *Live visual confirmation pending /verify
      + PROD backfill (Su is prod data).*
- [x] `earCountOf()` extractor exists and is used at every ear-extraction site in
      `stories-service-real`, `points-service-real`, `events-service-real`,
      `letters-service`, `docs-service`, `calibration-service-real`, `api.ts` (no
      remaining inline `ears_count ?? 0`).
- [x] A guard test asserts every people-returning **embedded** query selects
      `ears_count`, and is proven to FAIL on omission (negative sub-test). *(scope:
      embedded joins; documented in test — direct/RPC paths verified separately)*
- [x] No people-returning real query hardcodes `earCount: 0` (event-host path fixed).
- [x] `PersonRef` carries optional `earCount`; 2435 unit tests pass unchanged.
- [x] All tooltip sites (6, not 3) route through one `earTooltip()` with the confirmed copy.
- [ ] After PROD backfill (separate ask), Su shows the same count on
      `/p/su-myat-noe` and on her hosted event page.

## UI Contract

| Element | Value |
|---------|-------|
| Tooltip, 0 ears | `No explain-backs rated yet` |
| Tooltip, N ears | `{name} has done {N} rated explain-back{s} — paraphrasing story authors back to them` |
| Pluralization | `explain-back` (1) / `explain-backs` (N≠1) |
| `{name}` | First name on cards/events; "You" when `isOwner` on own profile |

Sites carrying this copy: `src/components/ui/ear-badge.tsx:18-21`,
`src/app/pages/profile-page-v2.tsx:863-868`,
`src/app/prototypes/events/components/EventDetail.tsx:540`.

## Migration Plan

1. New migration `supabase/migrations/{timestamp}_ear_metric_per_story.sql`.
2. `CREATE OR REPLACE FUNCTION update_profile_ears_count()` — keep `SECURITY DEFINER`
   and `SET search_path = public`; replace the `(speaker_id, listener_id)` + ≥8 logic
   with the per-`story_id` recompute. Leave the `verification_session_count` and
   speaker-session-count branches intact.
3. In the same migration, backfill:
   `UPDATE profiles p SET ears_count = COALESCE(sub.cnt, 0) FROM (SELECT listener_id,
   COUNT(DISTINCT story_id) AS cnt FROM story_verifications GROUP BY listener_id) sub
   WHERE p.id = sub.listener_id;` and zero out profiles with no verifications.
4. Apply to TEST via the migration helper. **Stop and ask the founder before PROD.**

## Rollback Plan

- Code: `git revert` the migration + service/copy commit.
- Data: rerun the prior backfill (distinct-speaker, ≥8) from `story_verifications`, or
  recompute fresh — `story_verifications` is the source of truth, so `ears_count` is
  fully reconstructable. No destructive operation; nothing to restore from backup.

## Data Integrity Check

- After TEST backfill: for 2-3 sample listeners, compare `profiles.ears_count` against
  `SELECT COUNT(DISTINCT story_id) FROM story_verifications WHERE listener_id = :id`.
- Confirm a known multi-rating profile (Su's TEST equivalent, or a seeded fixture)
  reads the expected distinct-story count.
- Confirm no profile has `ears_count` exceeding its distinct rated-story count.
