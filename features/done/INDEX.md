# Done Features Index

Quick reference for past completed work. Consult when starting work on a related topic.
Last updated: 2026-02-25

---

## Live Session / Real-time

- **P398** (Feb 26) Session Round History — session state captured at round completion; history persists via sessionHistory table
- **P399** (Feb 26) Live state story race condition — full-overwrite merges carry stale data; use atomic partial `patch_live_state` RPC
- **P405** (Feb 26) My Sessions History — replace /live history block with global nav Sessions section
- **P406** (Feb 26) Event Native Session Start — polling-based status updates; one-room-per-creator constraint
- **P410** (Feb 26) Live Nav Guard — context prevents silent nav away; intercept bottom/top nav clicks with exit-confirm dialog
- **P412** (Feb 26) Reviewer Position Removal Hides Owner Point — filter at live-mode-view scope only when `currentUserName=owner`
- **P272** (Feb 26) Live Story-Point Verification — position-required validation on real session points, not mock data
- **P275** (Feb 26) Live Positions Unverified RLS — RLS must require `verification_status IS NOT NULL`
- **P276** (Feb 26) Two-Party E2E DB Polling — explicit waits reduce flakiness in multi-agent E2E coordination

## Points & Stories

- **P401** (Feb 26) Position-Story Integrity — DB trigger cascades story-point unlinking on position delete; warning shows affected count
- **P407** (Feb 26) Unify Story Detail Points — position state must sync on dialog resolve; remove duplicate point list
- **P411** (Feb 26) Position Breakdown — batch fetch via `getStoriesForPoints` to avoid N+1
- **P413** (Feb 26) Calibration from Any Exchange — `story_id`/`version_id` nullable on `story_verifications`; trigger guards for NULL story_id; InlineCalibration hidden until 5 sessions (was always rendered); test helper double-counting bug: trigger already increments count, don't add manually
- **P423** (Feb 26) Calibration on Every Paraphrase — record calibration data on every exchange; no story/score requirement
- **P424** (Feb 26) Visibility Model — three-tier (Private/Shared/Public); RLS uses EXISTS subquery on event_rsvps for shared
- **P426** (Feb 26) Story Show/More Toggle — character limit prevents excessive card height; expandable text pattern
- **P427** (Feb 26) Story Edit and Delete — `useBlocker` requires data router; guard via handleBack override + popstate; `story_versions` RLS was USING(true); Radix Dialog modal always needs `hideCloseButton` for confirm dialogs
- **P434** (Feb 26) Point Statement Truncation — line-clamp prevents card overflow
- **P117** (Feb 5) Stories & Points Backend — DB schema: points, point_positions, point_history, story_points junction
- **P131** (Feb 5) Manual Points Creation — user-created points with story linking; validate before AI extraction
- **P132** (Feb 5) Rich Story View — story detail context; linked points appear with context
- **P134** (Feb 5) Profile Story-Point Links — separate story vs position views; RLS boundary correctness
- **P136** (Feb 5) Consolidate Profile Pages — story/point joining correctness at RLS boundary

## Database / RLS / Migrations

- **P403** (Feb 26) Position Cascade DB Migrations — on position delete, trigger auto-unlinks stories and records in history table
- **P417** (Feb 26) migrate.sh Silent Schema Drift — HTTP 200 ≠ success; parse body (JSON array=success, object with message=failure)
- **P139** (Feb 5) E2E Cleanup FK Constraint — foreign key cascade needed for test isolation
- **P138** (Feb 5) E2E Test Infrastructure — Supabase client setup, transaction handling, data cleanup between tests
- **P271** (Feb 5) Missing Column After Migration — regenerate types via `supabase gen types` after schema changes

## Navigation & Routing

- **P409** (Feb 26) /live Page Router Crash — `useBrouter` must be within data router context; verify router provider wraps all page routes
- **P76** (Jan 27) Navigation Redirect Fixes — preserve intended destination URL after auth redirect
- **P115** (Feb 5) Navigation and Data Fixes — correct route params, link semantics, data consistency

## UI / Design System

- **P408** (Feb 26) Position Cancel Visual Glitch — only call `setUserPosition` for non-null positions on cancel
- **P402** (Feb 26) Profile Points Tab Wrong Query — query by positions held, not points created; batch load to avoid N+1
- **P404** (Feb 26) Rename pledge-certificate-view — component at /p/:slug/pledge is pledge cert, not profile visitor view
- **P101** (Jan 27) Cards UX Overhaul — bottom CTAs, 44px touch targets, segmented controls for positions
- **P85** (Jan 27) 7-Point Position Scale — 3-button UI with intensity dropdowns; keeps mobile-friendly footprint
- **P88** (Jan 27) Position Badge Clarity — remove redundant badges from story cards; they duplicate position state
- **P89** (Jan 27) Swipeable Card View — touch-friendly swipe for feed navigation
- **P61** (Jan 27) Design System Expansion — component tokens, spacing scale, consistent icon usage
- **P75** (Jan 27) Compact Profile Card — avatar_color + avatar_url fields; calibration badge + verification status
- **P93** (Jan 27) Story-Point Display Refactor — consistent position button styles across all card types
- **P103** (Jan 26) Point Quote Pattern — "Jordan agrees: [Point box]" — separate authorship from relationship in visual hierarchy
- **P118** (Jan 26) Person Avatar Consolidation — unified avatar component with avatar_color + avatar_url

## Auth & Verification

- **P396** (Feb 26) Eliminate Unverified State — instant email verification via one-time link in welcome email; no UNVERIFIED users
- **P273** (Feb 26) Create Story Unverified Error — grant role/RLS access on instant verification; check verification before RLS errors surface
- **P274** (Feb 26) Post-Session Verification Email — one-time verification reminder after first live session

## Events & Content

- **P416** (Feb 26) Event Auto Banner via Unsplash — extract keywords from event title; fallback to gradient
- **P418** (Feb 26) Banner Search Fallback — inline input for custom Unsplash keywords when search returns zero results
- **P415** (Feb 26) Event Email Notifications — RSVP confirmation + reminders; template system with personalization
- **P414** (Feb 26) Profile Bio — optional short-text bio; visible on pledge certificate

## Data Consistency & Debugging

- **P137** (Feb 5) Position Persistence Bug — positions lost on reload; ensure position sync on mount
- **P140** (Feb 5) Story Refresh Undefined State — handle stale queries gracefully on story detail refresh
- **P154** (Feb 5) Profile Position State — `currentUserName=validatorId` check required for correct sync
- **P155** (Feb 5) Position Counts Incorrect — batch load must include all position types
- **P268** (Feb 5) Position Detail Missing Stories — join query must include all story_point links
- **P160** (Feb 5) Private Session Mode — new session mode; DB columns + RLS policy isolation

## Infrastructure / Process

- **P141** (Feb 5) Unified Rank System — test-first gate; no test modifications allowed, all E2E required before completion
- **P277** (Feb 26) E2E Parallelization — parallel test runners; worker isolation reduces flakiness
- **P278** (Feb 26) E2E Quick Wins — mic permission template skip; production E2E reliability improvements
- **P65** (Jan 27) CLAUDE.md Restructuring — principles section for scalable agent guidance
- **P111** (Jan 26) Kanban View — drag/drop, status columns, P-number assignment
- **P114** (Jan 26) Task Tracking — task lifecycle from creation to completion; integration with feature specs
- **P130** (Jan 26) Merge Hypotheses Into Milestones — hypotheses become milestone descriptions; reduce planning overhead
- **P144** (Feb 5) Simplify Planning System — focus on metrics + context; remove competing frameworks

## Product & Docs

- **P142** (Feb 5) Information Architecture Restructure — separate Tracks/Hypotheses/Experiments; lean canvas redesign
- **P69** (Jan 27) Product Vision Consolidation — asymmetric conversion hypothesis as foundation
- **P87** (Jan 27) Metrics Model Simplification — focus on verification + calibration only
- **P94** (Jan 27) Doc Architecture Refactor — organize technical docs; navigation, cross-links, search
