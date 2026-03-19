# Done Features Index

Quick reference for past completed work. Consult when starting work on a related topic.
Last updated: 2026-03-19 (P539 calibration zero-state)

---

## Live Session / Real-time

- **P126** (Mar 03) /live Departure Detection — pagehide uses `fetch({keepalive:true})` + user JWT so joiner PATCH clears RLS; creator path via SECURITY DEFINER RPC unaffected
- **P398** (Feb 26) Session Round History — session state captured at round completion; history persists via sessionHistory table
- **P399** (Feb 26) Live state story race condition — full-overwrite merges carry stale data; use atomic partial `patch_live_state` RPC
- **P525** (Mar 16) Live state deadlock prevention — two-party coordination fields must use per-role boolean keys (never shared arrays); JSONB `||` merge handles different keys atomically but overwrites same keys; UI reading coordination state must be role-aware (`isCreator` prop); reactive `useEffect` safety net catches simultaneous actions; zero Sentry coverage → full context+breadcrumbs+sanitized capture added
- **P405** (Feb 26) My Sessions History — replace /live history block with global nav Sessions section
- **P406** (Feb 26) Event Native Session Start — polling-based status updates; one-room-per-creator constraint
- **P410** (Feb 26) Live Nav Guard — context prevents silent nav away; intercept bottom/top nav clicks with exit-confirm dialog
- **P412** (Feb 26) Reviewer Position Removal Hides Owner Point — filter at live-mode-view scope only when `currentUserName=owner`
- **P272** (Feb 26) Live Story-Point Verification — position-required validation on real session points, not mock data
- **P275** (Feb 26) Live Positions Unverified RLS — RLS must require `verification_status IS NOT NULL`
- **P276** (Feb 26) Two-Party E2E DB Polling — explicit waits reduce flakiness in multi-agent E2E coordination
- **P469** (Mar 02) /live Layout Revert P455 + KISS Fixes — collapse threshold `> 1` fires with 2 rounds (hides 1 row); raise to `> 2`; `olderRounds` must always compute (don't gate on `hasOlderRounds` or it drops intermediate rounds)
- **P492** (Mar 11) Guest Post-Session UI — hide "Start New Session" for guests (`isGuest` conditional); guests can't create sessions, only join via invite code
- **P490** (Mar 12) Guest Position Sync + Unsaved Hint — `livePositions` missing from polling drift check silently broke guest→host sync; `isGuest` prop threading follows `isStoryOwner` pattern (P487); mic permission has two gates (`completeJoin` + `gateMicAndGoLive`) — bypass must cover both
- **P495** (Mar 16) Live Session Transcription — Cloud Run GPU (L4) with Whisper large-v3-turbo + pyannote; type field names must match DB exactly (`start_ms`/`end_ms` not `start`/`end`); `import.meta.env.PROD` gate means dev never records audio
- **P511** (Mar 16) Session Resilience — banner must render inside `<main>` (not between nav/main) to avoid z-index fights; `ended_at` column doesn't exist — use `live_state.sessionEnded`; creator-only heartbeats; `createTwoPartySession()` test fixture built as P497 MVP

## Points & Stories

- **P542** (Mar 17) Collapse Stories Behind Chevron on Point Page — "double duty" name rows need ThreadLine + collapse; `length === 1` ThreadLine bypass is an anti-pattern; pick-flow must enforce /challenge-prd for redesigns
- **P543** (Mar 17) Zero-Position Point Graveyard — filter at query level not schema; `onPositionChange={fetchData}` was silently disabled (commit 840250d4) breaking live updates; optimistic surgical callbacks beat full refetch
- **P506** (Mar 13) Auto-Extract Hashtags — `extractHashtags()` at save time; backfill migration for existing content; 3-key position init = NaN bug (use all 7 keys)
- **P503** (Mar 13) Profile Tag Pills — grep ALL consumers of `point.statement`/`story.content` before adding display features; QuotedPoint sub-components are always missed
- **P505** (Mar 13) Feed Sort Toggle — `?sort=oldest` URL param + UI toggle; sort at DB level not client-side (pagination); blog embeds don't carry auth (localStorage isolation)
- **Fix** (Mar 13) Feed Card Position Guard — cascade trigger silently delinks stories on unguarded `removePosition`; every caller must use `useRemovePositionGuard`; feed uses optimistic counts, not refetch
- **P501** (Mar 13) Unify Understood Pill — legacy `verificationCount` diverged from `understoodCount`; always show pill (even 0) so new surfaces don't need `> 0` guards
- **P494** (Mar 12) Tell Your Story Visibility Gate — zombie CTA from P458 (anonymous nudge) survived 6 feature iterations with inverted `!user` logic; use `shouldShowStoryCTA` utility for all CTA gates, never inline conditions
- **P401** (Feb 26) Position-Story Integrity — DB trigger cascades story-point unlinking on position delete; warning shows affected count
- **P407** (Feb 26) Unify Story Detail Points — position state must sync on dialog resolve; remove duplicate point list
- **P411** (Feb 26) Position Breakdown — batch fetch via `getStoriesForPoints` to avoid N+1
- **P413** (Feb 26) Calibration from Any Exchange — `story_id`/`version_id` nullable on `story_verifications`; trigger guards for NULL story_id; InlineCalibration hidden until 5 sessions (was always rendered); test helper double-counting bug: trigger already increments count, don't add manually
- **P423** (Feb 26) Calibration on Every Paraphrase — record calibration data on every exchange; no story/score requirement
- **P424** (Feb 26) Visibility Model — three-tier (Private/Shared/Public); RLS uses EXISTS subquery on event_rsvps for shared
- **P446** (Mar 03) Chat State Persistence — sessionStorage keyed by pointId; PERSISTABLE_PHASES whitelist blocks streaming/saving restore; clears on save complete or reset
- **P425** (Feb 25) AI-Guided Story Creation Core Loop — `/chat` page with AI streaming chat; phase state machine guides user from staking a position to filing a first-person story; Supabase edge function, rate limiting, NVC scaffolding
- **P425** (Feb 26) AI Story Guide Chat — ship via non-feature branch leaves spec at qa; code-on-main ≠ spec-closed
- **P426** (Feb 26) Story Show/More Toggle — character limit prevents excessive card height; expandable text pattern
- **P427** (Feb 26) Story Edit and Delete — `useBlocker` requires data router; guard via handleBack override + popstate; `story_versions` RLS was USING(true); Radix Dialog modal always needs `hideCloseButton` for confirm dialogs
- **P434** (Feb 26) Point Statement Truncation — line-clamp prevents card overflow
- **P465** (Mar 02) Point Card Footer Redesign — `filteredStories` is pre-filtered to profile owner upstream; viewer story count tracked separately via `viewerStoryCount`; attribution "by [name]" must always show when `profileOwner` known (see P470)
- **P470** (Mar 03) Point Card Attribution Consistency — story count shows only RLS-visible stories to viewer (private=0 for visitors, by design); use `tempSignInClient` never `supabaseAdmin.signInWithPassword` in test helpers; `generateTestSlug` needs random suffix for parallel workers
- **P451** (Feb 28) Story CTA on All Surfaces — CTA appears on all 6 position-taking surfaces; `showStoryCTA = !!userPosition` derived check, no state; P451 was reverted then re-merged (16 files invisible in conflict list — restore with `git show branch:file`)
- **P465** (Mar 02) Point Card Footer Redesign — story CTA + viewer count in point card footer; `getStoryCountForUser` avoids N+1; rebase then --no-ff merge to main; `positionsSectionRef` ghost variable from conflict resolution — always grep for unused refs after rebase
- **P117** (Feb 5) Stories & Points Backend — DB schema: points, point_positions, point_history, story_points junction
- **P131** (Feb 5) Manual Points Creation — user-created points with story linking; validate before AI extraction
- **P132** (Feb 5) Rich Story View — story detail context; linked points appear with context
- **P134** (Feb 5) Profile Story-Point Links — separate story vs position views; RLS boundary correctness
- **P136** (Feb 5) Consolidate Profile Pages — story/point joining correctness at RLS boundary
- **P464** (Mar 09) Meta-Epistemology Framework — ITT/RITT concepts as content stories; philosophy concepts need onboarding entry points

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
- **P486** (Mar 07) Replace /chat with /create Form — 7-value positions map to 3-value for display; `hasPosition` boolean gates linkPointToStory (not position value); leave unreachable components for tree-shaking
- **P487** (Mar 07) Unify Story CTA Copy — `getPositionCTACopy()` unified to return "Add your story →" for all positions (was position-specific "Why do you agree?" etc.); symbols/labels remain distinct per position group
- **P499** (Mar 13) Feed→Home + Share Story CTA — harmonize CTA text ("Share a Story" + PenLine icon) across feed, profile, /create; filter internal tags (`/^st\d+$/i`) from tag cloud only, keep on cards; share button copies permalink
- **P491** (Mar 12) Hashtag Feed — tag pills between text and actions (not below); auth default redirect → /feed; tag ownership = entity's own tags only, no inheritance from linked content

## UI / Design System

- **P539** (Mar 19) Calibration Zero-State Redesign — dots look gamified, use segmented bar; show on all profiles for social pressure; separate `calibrationLoaded` flag prevents waiting for unrelated content; "Listening calibration" is the coach-facing term
- **P540** (Mar 19) Hyperlink Consistency — two-phase linkifyText (markdown first, auto-URL second) prevents double-processing; /innovate said drop hints, /falsify killed it — auto-URL suppresses markdown discovery; concrete examples beat abstract syntax for non-technical users; pre-commit must `--diff-filter=d` to exclude deleted files from ESLint
- **P548** (Mar 18) Embed Collapse Control — `window.location.search` is non-reactive in hooks; swap for `useLocation`; ShareDialog tabs were invisible (gray-on-gray) → stacked layout with always-visible sections; /falsify killed "just remove auto-expand" for foreclosing future flexibility
- **P531** (Mar 16) Standardize page widths to max-w-2xl — cards are width-agnostic (fill parent); fix page containers not cards; `/review-all` caught missed `profile-connections-page`
- **P532** (Mar 16) Point card action row overflow — `flex-wrap` on footer rows; always check 320px viewport for flex layouts with variable-width text
- **ClarityLoader** (Mar 16) Branded loading animation — CSS-only anti-flash (300ms delay) prevents flash on fast loads; JS timers in loading components break auth flow tests via extra re-renders
- **P538** (Mar 17) Agreement Download Image & Share — copy pattern don't abstract; no QR on auth-gated exports; match toolbar banner style across pages
- **P504** (Mar 14) Auto-Generated Banners — shared `BannerDisplay`/`BannerControls`/`useBanner` components; `banner_generation_attempted` guard prevents re-triggering on mount; `overflow-hidden` on wrapper divs clips dropdown menus
- **P510** (Mar 14) Profile Banner UX Polish — LinkedIn-style avatar overlap (96px, `-mt-12`); pencil icon toggle for controls; gradient fallback visible when no banner; name beside avatar not below
- **P521** (Mar 16) Position Buttons Auto-Dropdown — portal dropdown escapes overflow:hidden; ResizeObserver for 2-mode responsive (full text / icon-only at 270px); Agree+/Agree− intensity labels; visual QA subagent process established after 5 rounds of author-as-reviewer failure
- **P519** (Mar 14) Remove Story/Point On-Page Banners — banners only display where compositionally integrated (profiles); stories keep `bannerUrl` for OG only; points stop generating banners entirely; 3px `authorAvatarColor` accent replaces story banner
- **P462** (Mar 13) Partner Count Header Prominence — bold numbers ugly; LinkedIn-style `text-sm font-semibold text-blue-500` + icon wins
- **P493** (Mar 12) PWA Install Prompts — desktop `isDesktop` guard needed on both child component AND parent wrapper; child returning `null` leaves orphaned section headings
- **P455** (Mar 02) Live Mobile Layout Story Compact Reorder — CSS line-clamp + character-slice on same element conflict silently; use one truncation system only
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

- **P524** (Mar 16) Withdraw Pledge Toggle — `has_pledged: false` already handled by all queries; no new API needed; re-pledge via existing `/sign-pledge` upgrade flow
- **P537** (Mar 16) Memoize useAuth() — useCallback on refreshProfile/signOut + useMemo on context value; data-status wrapper in AuthCallbackPage still needed (React render-skip is separate from unstable refs)
- **P527** (Mar 16) Direct Sign for New Users — `verifyOtp` with server-generated `hashed_token` for instant auth; email pinning (client sends no email, edge function derives from DB)
- **P502** (Mar 13) Anon Position Optimistic UI — batch-restore must run BEFORE P458 single-position handler (it does `navigate()+return`); separate `anonPosition` state prevents ghost data in aggregate counts
- **P458** (Mar 09) Anonymous User Auth Gate — `extraParams` on both `signInWithEmail` and `signInWithGoogle` to forward context through OAuth round-trip; validate `intent.redirect` against allowlist on every path
- **P396** (Feb 26) Eliminate Unverified State — instant email verification via one-time link in welcome email; no UNVERIFIED users
- **P273** (Feb 26) Create Story Unverified Error — grant role/RLS access on instant verification; check verification before RLS errors surface
- **P274** (Feb 26) Post-Session Verification Email — one-time verification reminder after first live session

## Agreements & Relationships

- **P488** (Mar 07) Invite Auto-Auth via Token — `auth.admin.generateLink` server-side for existing users; `history.replaceState` cleans `#error=` hash from expired magic links; referrer meta tag prevents token leakage
- **P483** (Mar 07) Existing User Invite Streamline — read-only partner name from profile lookup; skip OTP for existing users; superseded by P488 (magic link auto-auth)
- **P472** (Mar 04) Agreements Post-UAT Polish — signature row hidden in creation mode via single `isCreation` ternary; "Tell your story" CTA hidden in active mode via `!user` guard; `signInWithEmail` extended for context param forwarding; `AddToCalendarButton` extracted from prototypes; `B4+` localStorage cooldown pattern for rate-limited buttons
- **P466** (Mar 04) Agreement Creation HelloSign Redesign — certificate-as-form layout; inline partner name input in "We, X and Y, agree to:" sentence; `partner_display_name` DB column; fallback chain: `partner.name` → `partnerDisplayName` → 'Invited party' (pending) / 'Partner' (other states)
- **P445** (Mar 03) PII Email Masking — agreement row `getPartnerName()` falls back to `partnerDisplayName` → 'Invited party'; raw `partnerEmail` no longer rendered
- **P463** (Mar 02) Agreement & Partner UI Polish — remove exposed internal IDs and double-rotation resend bug by deleting amber pending block entirely; CTA always at top-right
- **P422** (Feb 26) Clarity Partner Agreement — two-party agreement flow; separate pages per state (create/pending/accepted/declined); edge function sends emails
- **P422** (Feb 26) Clarity Partner Agreement — UAT branch rescue pattern; revert-from-main wrong mechanism; use feature branch + /ship instead
- **P482** (Mar 06) CertificatePageShell Refactor — extract shared `max-w-3xl mx-auto px-4` wrapper with optional parchment bg; applied to agreement/create/accept pages
- **P481** (Mar 06) Revoke Invitation Confirm Dialog — ConfirmDialog rendered outside Link to prevent click-through; drawer pattern for destructive actions
- **P480** (Mar 06) Certificate Avatar/Initials — GravatarAvatar in SignatureSlot with initials fallback; thread `avatarUrl` props from both accept and detail pages
- **P479** (Mar 06) Stale State After Signing — resolved by P478; removing celebration modal eliminates the stale state path entirely
- **P478** (Mar 06) Celebration Dialog → Navigate — replace redundant modal with toast + navigate to detail page; simpler flow, no duplicate certificate
- **P477** (Mar 06) Declined Page Copy Rewrite — warmer tone; partner-notified messaging; keep CelebrationDialog component for potential reuse
- **P476** (Mar 06) Accept Page Email Confirmation Redesign — full-screen confirmation page for unauthenticated partner sign; embed token inside `redirect` param to survive auth callback roundtrip
- **P459** (Feb 27) Move Agreements to Connections Page — profile sub-page at `/p/:slug/connections`; service-layer filter for current user only (not creator); react-refresh requires named exports

## Events & Content

- **P494** (Mar 12) Event Grace Period — `EVENT_GRACE_HOURS=5` shifts upcoming/past cutoff to `now-5h`; practice room expiry stays real-time (different concern)
- **P489** (Mar 09) AI-Generated Event Banners — Gemini PNGs average ~2MB; size storage buckets for actual model output not assumptions; fire-and-forget in createEvent() prevents blocking navigation
- **P437** (Feb 26) Uncancel Event — host-only button; mirrors cancelEvent pattern; re-announcement email via edge function
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

- **P546** (Mar 18) Transcription Quality Improvements — bake Whisper model into Docker image (eliminates cold start SHA256 failures); P546 code (word-level merger, VAD, language hint) written+tested but deployment blocked by observability gap; add DB progress tracking before re-attempting
- **P507** (Mar 13) Remove Dead Prototypes — extract production code from prototype folders before deleting; `prototype-types.ts` bridges divergent `Story.text` vs `Story.content` shapes; 19K lines deleted
- **P496** (Mar 13) E2E Programmatic Auth Bypass — `getTestAuthContext()` injects real user JWT into Playwright BrowserContext via `addInitScript`; RLS exercised with user token not service_role; addresses 67% of agent "can't verify" failures
- **P474** (Mar 06) ToS Markdown Migration — `?raw` + ReactMarkdown with custom Tailwind components; separates legal text from JSX for clean /tos-review diffs
- **P441** (Mar 06) CLAUDE.md Audit — exchange gate (ADD requires matching REMOVE when over 350 lines) + drift scan prevents silent instruction dilution
- **P440** (Feb 26) QA Status + Delivery Stage Cleanup — `status: qa` column is the dev-complete signal; `/ship` closes it; `qa` is NOT a terminal status (don't add to PATCH exception list)
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
- **P79** (Jan 20) Consulting & Revenue Model — superseded spec; personal brand settled as ladischenski.com (not "Slava Coaching"); two-brand strategy: ClarityPledge (product) + ladischenski.com (facilitation)
