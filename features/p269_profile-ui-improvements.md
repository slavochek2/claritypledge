---
status: in-progress
type: story
rank: 1
workstream: C1
tags:
  - profile
  - ux
  - calibration
  - ear-count
prepped_date: '2026-02-17'
delivery_stage: prd-review
reviews:
  ux: null
  architect: null
created_date: 2026-02-17T00:00:00.000Z
---

# P269: Profile Page UI Improvements — Promote LinkedIn Prototype Patterns

## Problem Statement

**Current state:** The production profile page (`profile-page-v2.tsx`) has the structural code for calibration display, ear count badges, and "X understood" counts — but these UI elements either don't render in practice or render inconsistently. The LinkedIn prototype at `/prototype/linkedin-like/profile` shows a more complete, polished version of the profile with all these elements working correctly on mock data.

**Pain points:**
- "Understanding Calibration" bar conditionally renders but often won't show (data gates that may never be met for most users)
- "X understood" count on story cards relies on `understoodCount` flowing through correctly — hardcoded to `0` in some adapted story paths
- Ear count badge (`credibilityStats.ear`) may show 0 for users even when they have confirmed understanding events
- Profile card layout and story card design in prototype looks notably cleaner/nicer than production — user annotations explicitly noted "nice card layout, I think looks nicer than currently in main app"
- `profile-page-v2.tsx` is 1,207 lines with multiple inline component definitions — maintenance is hard and changes are risky

**Who's affected:** All users who visit a profile page (primary user action in the app). Profile is a key social proof surface — coaches and pledgers sharing their profiles with contacts.

---

## Intention (Why This Matters)

**Strategic importance:** The profile page is the primary shareable artifact — coaches send it to clients, pledgers send it after live sessions. If the calibration score and understanding stats are invisible, the core value proposition (demonstrating calibration improvement) is lost.

**Why now:** The LinkedIn prototype proved the exact design that works. The production code has most of the structure but the data isn't flowing through, so the UI elements are silent. This is quick-win territory — the design decisions are already made, the components exist.

**Impact if not solved:** Coaches sharing their profiles see an empty profile with no calibration indicator — the feature that differentiates Clarity Pledge from other tools is invisible on the one page people actually share.

---

## Business Requirements

**Must-haves:**
- "X understood" count appears on story cards when a user has confirmed understanding events (data from `understood_count` in DB, not hardcoded)
- Ear count badge appears next to the user's name on profile header when their ear count > 0
- "Understanding Calibration" bar renders on profile header when calibration data is available
- Story card layout on profile page matches or improves on the LinkedIn prototype design
- Profile page is maintainable: inline component definitions extracted or simplified

**Success conditions:**
- A user who has completed live sessions sees their calibration score on their profile
- A user who has been confirmed to understand stories sees their ear count
- A story with `understoodCount > 0` shows the count to all visitors (not just the owner)
- The profile page can be modified in one place without navigating 1,200+ lines

**Constraints:**
- Must not change data models or database schema (display-only improvement)
- Must not break existing E2E tests for profile page
- RLS: users should only see their own ear count (no displaying other users' private calibration data beyond what's already shown)

---

## User Stories

**As a coach sharing my profile with a new client:**
- I want my calibration score visible on my profile, so that clients can see evidence of my calibration practice before hiring me
- I want my ear count badge to show when I have confirmed understanding events, so my profile reflects my active listening track record

**As a user visiting someone else's profile:**
- I want to see how many people confirmed understanding of each story, so I understand the social proof behind the content
- I want to see the profile owner's ear count in the header, so I can quickly assess their listening credibility

**As a user who just completed live sessions:**
- I want my calibration bar to appear on my profile as soon as data is available, so my effort is reflected publicly without manual action

**As a developer maintaining the profile page:**
- I want the profile page to have clearly separated components, so I can change story card layout without touching profile header logic (and vice versa)

---

## Jobs to Be Done

**When I share my profile with a potential coaching client:**
- I want confidence that my calibration score is visible, so they see evidence of my practice without me having to explain it verbally (motivation: credibility)

**When I visit someone's profile to decide if I trust their stories:**
- I want to quickly see their understanding stats, so I can assess their calibration track record without reading all their stories (motivation: efficient trust-building)

**When a story I wrote gets confirmed as "understood" by its listener:**
- I want that count to appear on my story card, so my communication quality becomes visible proof (motivation: social validation of clarity)

---

## Outcomes (Success Metrics)

**Visibility improvements:**
- Calibration bar: appears on profiles of users who have completed sessions (currently: never shows for most users due to data gates)
- Ear count: shows on profile when `ear > 0` (currently: likely 0 for most users due to data not loading correctly)
- "X understood": shows on story cards with real `understoodCount` from DB (currently: may default to 0 in adapter paths)

**Maintainability:**
- Profile page refactored from 1,207 lines to clearly separated sections — measurable by file length reduction or component count

**User experience:**
- Profile card layout matches LinkedIn prototype design (validated by side-by-side comparison)

---

## Acceptance Criteria

- [ ] Story cards on profile show "X understood" count when `understoodCount > 0` (pulled from real DB data, not hardcoded to 0)
- [ ] Ear count badge appears next to profile name when user has ≥1 confirmed understanding events
- [ ] Calibration bar renders on profile for users with sufficient calibration data
- [ ] "See my Clarity Pledge" / "See their Clarity Pledge" link appears correctly for pledgers (current prototype design)
- [ ] Story card layout on production profile matches LinkedIn prototype visual design (verified by screenshot comparison)
- [ ] Profile page continues to load within 2 seconds (no performance regression)
- [ ] All existing E2E tests for profile pass
- [ ] No visual regression for users with 0 calibration data, 0 ear count, 0 understood stories (graceful empty states)

---

## Reference

**LinkedIn prototype:** `src/app/prototypes/linkedin-like/`
- `components/Profile.tsx` — profile header with calibration + ear count
- `components/StoryCard.tsx` — story card with understood count + ear badge
- `components/shared/CalibrationDisplay.tsx` — calibration display component

**Production file:** `src/app/pages/profile-page-v2.tsx` (1,207 lines)

**Known data gap:** `verificationCount: 0` hardcoded in story adapter (line 288) — needs to be populated from real data or removed if not needed

**p136 context:** Old profile consolidation spec (merge profile-page.tsx + profile-page-v2.tsx). That consolidation is done — old file deleted, App.tsx uses v2. p136 archived. This spec covers what's next.

---

## Next Steps

1. Run `/ux features/p269_profile-ui-improvements.md` — design UX layer (side-by-side comparison of prototype vs production, identify exact gaps, specify interactions)
2. Run `/architect features/p269_profile-ui-improvements.md` — technical analysis (trace data flows, identify data gaps, design component extraction)
3. Run `/generate-tests features/p269_profile-ui-improvements.md` — E2E test stubs
4. Run `/dev features/p269_profile-ui-improvements.md` — implement
