# Analytics Events (Mixpanel)

This document catalogs all Mixpanel events tracked in the Clarity Pledge app.

**Note:** Analytics are production-only. Events are not sent in development mode.

## Analytics Strategy

**Purpose:** Show the founder each week how real people behave, without inventing patterns from small numbers (P1640). `/weekly` step 2.9.0 runs a fixed list of queries through the Mixpanel MCP. The result is stored in `~/.claude-analytics/`, outside the repo, and shown in the Analytics tab on the Day page. `/day` only reads it, through the `cp.analytics` check, which reports `problem` when the latest read is not collected or is 8 or more days old.

The read answers seven questions: who is here, what they do, how much time, who returns, do they explore, do they get stuck, is the practice working. Clean data starts 2026-11-06. No percentage shows on a base under 30. An insight appears only for a new failure class, a real-user first or stuck session, or a shift beyond `1.96 * sqrt(current + previous)` on a base of at least 30. There are at most 3, and a dismissed one does not return. Since P1673 each undecided insight is an ordinary finding card on the Day page's Report tab, first in the list and tagged "Weekly insight", with the choices Real problem, Not a problem and your own answer; the first two write the insight ledger once, and an insight is never sent to the fixing agent. The Analytics tab embeds the five Mixpanel boards below instead of the seven sections; the read itself is unchanged.

**Sources:**
- Mixpanel: behavioral events (sessions, stories, gaps)
- Supabase prod: account health (total users, verified, unverified, signups this week)

**Dashboards (P1669):** built on bot-proof signals (clicks, accounts, RSVPs, practice sessions). Links below need a Mixpanel login. The old Session Value, Activation and Retention boards are deleted.
- 1 · Pulse: https://eu.mixpanel.com/project/3968494/app/boards#id=11645736
- 2 · Path to value: https://eu.mixpanel.com/project/3968494/app/boards#id=11645737
- 3 · Do they come back?: https://eu.mixpanel.com/project/3968494/app/boards#id=11645738
- 4 · Friction: https://eu.mixpanel.com/project/3968494/app/boards#id=11645741
- 5 · What do people use?: https://eu.mixpanel.com/project/3968494/app/boards#id=11646127

The Day page's Analytics tab embeds each board's **public** share link (no passcode, readable by anyone holding it). Those links live only in `.env.local` as `MIXPANEL_BOARD_PULSE`, `_PATH`, `_RETURN`, `_FRICTION`, `_USE`, never in a committed file. Public Boards must be enabled in Project Settings (owner only). The boards hold aggregate reports only: never add a person list, a per-user breakdown, or a `utm_*` breakdown below channel level to them.

**Real people (P1669):** count with `is_bot` not set. `index.html` tags known non-human traffic on every event with `is_bot: true` and `bot_reason` (`webdriver`, `headless_ua`, `crawler_ua`, `headless_window`), and does not record it. `headless_window` is a desktop browser with no touch, not in fullscreen or app mode, on a headless default screen size, with no window frame and no taskbar or menu bar, which is what headless Chromium reports. Traffic is tagged, never dropped, so a wrong tag is reversible. `has_interacted: true` is on every event after the first tap, key press, touch move or wheel in that page load (not scroll: the app and scrapers scroll in code). The same hook replaces Clarity Chat conversation, thread and message ids (including the old `/home/c/` links) with `[id]` in every string of an event that points at a chat page, including `$current_url` and the SDK's bare query property. Unit fixtures: `src/tests/p1669-bot-tag.test.ts`; wire proof: `e2e/p1669-bot-tag.spec.ts`. A stealth bot with a normal window still gets through; `has_interacted` is the backstop for counting.

**Event audit:** Run /weekly — it includes a subagent that checks for missing events after new features ship.

**MCP access:** Mixpanel MCP (EU endpoint) is configured in `.mcp.json`. Tools are auto-allowed in `settings.json` (`mcp__mixpanel__*`). Use MCP for querying events, funnels, retention, and managing dashboards. Alerts must be created via Mixpanel UI (no API). The `/analytics` and `/weekly` skills can use MCP instead of Chrome-based login when available.

---

## Overview

Events are categorized by feature area:
- [Core Funnel](#core-funnel) - Landing → Sign → Profile creation
- [Signup](#signup) - Standalone account creation (P64)
- [Google OAuth](#google-oauth) - Google sign-in (P63)
- [Profile & Sharing](#profile--sharing) - Profile views, sharing, certificates
- [About & Contact](#about--contact) - About page, contact form, external links
- [Settings](#settings) - Profile editing
- [Login](#login) - Returning user authentication
- [Navigation](#navigation) - CTA clicks
- [Article/Content](#articlecontent) - Manifesto engagement
- [Social Features](#social-features) - Pledgers page, endorsements
- [Live Meetings](#live-meetings) - Real-time understanding verification
- [Audio Upload Reliability](#audio-upload-reliability) - Chunk upload failures and recovery (P578)
- [404 Page](#404-page) - Not-found page tracking (P578)
- [Session Transcripts](#session-transcripts) - Transcript nudge engagement (P578)
- [Clarity Meeting Terms](#clarity-meeting-terms) - /meet level changes and acceptance (P1016, P1024)
- [Clarity Organizations](#clarity-organizations) - Org join/leave and Events nav (P1010)
- [Offline strip episodes](#offline-strip-episodes-p1677) - How often "Saved copy · updating…" shows, how long, whether it clears (P1677)

---

## Core Funnel

### `landing_page_viewed`
User views the landing page.

| Property | Type | Description |
|----------|------|-------------|
| `referrer` | string | Document referrer URL |

### `sign_pledge_page_viewed`
User views the sign pledge page.

| Property | Type | Description |
|----------|------|-------------|
| `referrer` | string | Document referrer URL |

### `pledge_form_submitted`
User submits the pledge form (sends magic link).

| Property | Type | Description |
|----------|------|-------------|
| `has_role` | boolean | Whether user provided a role |
| `has_linkedin` | boolean | Whether user provided LinkedIn URL |
| `has_reason` | boolean | Whether user provided a reason |

### `pledge_form_error`
Error during pledge form submission.

| Property | Type | Description |
|----------|------|-------------|
| `error_type` | string | Type of error encountered |

### `auth_callback_failed`
Authentication callback failed.

| Property | Type | Description |
|----------|------|-------------|
| `reason` | string | Reason for failure (`no_session`, `profile_upsert_failed`) |

### `login_complete`
Returning user logged in successfully.

| Property | Type | Description |
|----------|------|-------------|
| `slug` | string | User's profile slug |
| `has_role` | boolean | Whether user has a role |
| `has_linkedin` | boolean | Whether user has LinkedIn URL |
| `has_reason` | boolean | Whether user has a reason |
| `registration_source` | string | Source: `returning`, `pledge`, `signup`, or `live` |
| `has_pledged` | boolean | Whether user has signed the pledge |

### `profile_created`
New user profile created after email verification.

| Property | Type | Description |
|----------|------|-------------|
| `slug` | string | User's profile slug |
| `has_role` | boolean | Whether user provided a role |
| `has_linkedin` | boolean | Whether user provided LinkedIn URL |
| `has_reason` | boolean | Whether user provided a reason |
| `registration_source` | string | Source: `pledge`, `signup`, or `live` |
| `has_pledged` | boolean | Whether user signed the pledge |

### `login_no_account`
User attempted to log in but no account exists with that email. (P64)

| Property | Type | Description |
|----------|------|-------------|
| `email` | string | Email that was attempted (from auth callback) |
| `attempted_email` | string | Email that was attempted (from login form) |

### `pledge_upgrade_completed`
Non-pledger user signs the pledge (converts from account-only to pledger). (P51)

| Property | Type | Description |
|----------|------|-------------|
| `has_role` | boolean | Whether user provided a role |
| `has_linkedin` | boolean | Whether user provided LinkedIn URL |
| `has_reason` | boolean | Whether user provided a reason |
| `pledge_version` | number | Version of pledge signed |

### `pledge_page_viewed`
User views the pledge certificate page (`/p/:slug/pledge`).

| Property | Type | Description |
|----------|------|-------------|
| `profile_slug` | string | Profile slug |
| `is_own_profile` | boolean | Whether viewer owns the profile |

---

## Signup

Events for the standalone signup flow (P64) - users creating accounts without pledging.

### `signup_page_viewed`
User views the signup page (`/signup`).

| Property | Type | Description |
|----------|------|-------------|
| `referrer` | string | Document referrer URL |
| `has_message` | boolean | Whether URL has a message param |
| `message_type` | string | Message type (e.g., `no-account`) |

### `signup_magic_link_sent`
Magic link successfully sent for signup.

*No properties*

### `signup_magic_link_error`
Magic link send failed for signup.

| Property | Type | Description |
|----------|------|-------------|
| `error_type` | string | Error type: `rate_limited`, `unknown`, or `network_error` |

---

## Google OAuth

Events for Google OAuth authentication (P63).

### `google_auth_initiated`
User clicked "Continue with Google" button.

| Property | Type | Description |
|----------|------|-------------|
| `context` | string | Where button was clicked: `login`, `signup`, `live` |
| `source` | string | Auth flow source: `login`, `signup`, or `pledge` |

### `google_auth_error`
Google OAuth flow failed.

| Property | Type | Description |
|----------|------|-------------|
| `context` | string | Where button was clicked |
| `error` | string | Error message |

---

## Profile & Sharing

### `profile_page_viewed`
User views a profile page.

| Property | Type | Description |
|----------|------|-------------|
| `profile_slug` | string | Slug of viewed profile |
| `is_own_profile` | boolean | Whether viewer owns the profile |

### `welcome_dialog_shown`
Welcome dialog shown to new user on their profile.

| Property | Type | Description |
|----------|------|-------------|
| `profile_slug` | string | User's profile slug |

### `share_link_copied`
User copied their profile link.

| Property | Type | Description |
|----------|------|-------------|
| `profile_slug` | string | Profile slug |

### `share_linkedin_clicked`
User clicked "Share on LinkedIn" button.

| Property | Type | Description |
|----------|------|-------------|
| `profile_slug` | string | Profile slug |
| `is_owner` | boolean | Whether sharer is the profile owner |

### `share_email_clicked`
User clicked "Share via Email" button.

| Property | Type | Description |
|----------|------|-------------|
| `profile_slug` | string | Profile slug |

### `linkedin_text_copied`
User copied the LinkedIn post text.

| Property | Type | Description |
|----------|------|-------------|
| `profile_slug` | string | Profile slug |

### `linkedin_guide_opened`
User opened the LinkedIn posting guide.

| Property | Type | Description |
|----------|------|-------------|
| `profile_slug` | string | Profile slug |

### `certificate_downloaded`
User downloaded their certificate.

| Property | Type | Description |
|----------|------|-------------|
| `profile_slug` | string | Profile slug |

### `certificate_download_failed`
Certificate download failed.

| Property | Type | Description |
|----------|------|-------------|
| `profile_slug` | string | Profile slug |

---

## About & Contact

### `about_page_viewed`
User views the About page.

| Property | Type | Description |
|----------|------|-------------|
| `referrer` | string | Document referrer URL |

### `contact_form_submitted`
User submits the contact form.

| Property | Type | Description |
|----------|------|-------------|
| `has_message` | boolean | Whether message field was filled |
| `message_length` | number | Length of message in characters |

### `contact_form_success`
Contact form submission succeeded.

*No properties*

### `contact_form_error`
Contact form submission failed.

| Property | Type | Description |
|----------|------|-------------|
| `reason` | string | Error type: `api_rejected` or `network_error` |

### `founder_linkedin_clicked`
User clicked founder's LinkedIn link.

| Property | Type | Description |
|----------|------|-------------|
| `source` | string | Where link was clicked (e.g., `about_page`) |

### `github_link_clicked`
User clicked GitHub repository link.

| Property | Type | Description |
|----------|------|-------------|
| `source` | string | Where link was clicked (e.g., `about_page`) |

---

## Settings

### `settings_page_viewed`
User views the settings page.

| Property | Type | Description |
|----------|------|-------------|
| `profile_slug` | string | User's profile slug |

### `profile_updated`
User successfully updated their profile.

| Property | Type | Description |
|----------|------|-------------|
| `profile_slug` | string | User's profile slug |
| `fields_updated` | array | List of fields that changed (e.g., `['name', 'role']`) |

### `profile_update_error`
Profile update failed.

| Property | Type | Description |
|----------|------|-------------|
| `profile_slug` | string | User's profile slug |

---

## Login

### `login_page_viewed`
User views the login page (returning users).

| Property | Type | Description |
|----------|------|-------------|
| `referrer` | string | Document referrer URL |

### `login_magic_link_sent`
Magic link successfully sent for login.

*No properties*

### `login_magic_link_error`
Magic link send failed for login.

| Property | Type | Description |
|----------|------|-------------|
| `error_type` | string | Error type: `rate_limited`, `unknown`, or `network_error` |

---

## Navigation

### `nav_cta_clicked`
User clicked a CTA button in the navigation.

| Property | Type | Description |
|----------|------|-------------|
| `cta` | string | CTA type: `take_pledge`, `try_meeting` (logged-in session CTA), or `try_letter` (logged-out letter CTA, P856) |
| `device` | string | Device type: `desktop` or `mobile` |

### `nav_menu_opened`
User opened the navigation menu (hamburger or avatar trigger). (P67)

| Property | Type | Description |
|----------|------|-------------|
| `trigger` | string | Trigger type: `hamburger` (signed out) or `avatar` (verified user) |
| `device` | string | Device type: `desktop` or `mobile` |

---

## Article/Content

### `article_page_viewed`
User views the manifesto article.

| Property | Type | Description |
|----------|------|-------------|
| `referrer` | string | Document referrer URL |

### `article_read_depth`
User scrolled to a milestone in the article.

| Property | Type | Description |
|----------|------|-------------|
| `depth_percent` | number | Read depth milestone: 25, 50, 75, or 100 |

---

## Social Features

### `pledgers_page_viewed`
User views the Clarity Pledgers page (formerly Understanding Champions).

| Property | Type | Description |
|----------|------|-------------|
| `pledger_count` | number | Total number of pledgers loaded |

### `pledger_card_clicked`
User clicked on a pledger's card to view their profile.

| Property | Type | Description |
|----------|------|-------------|
| `pledger_slug` | string | Slug of clicked pledger |

### `champions_page_viewed` (DEPRECATED)
**Deprecated:** Replaced by `pledgers_page_viewed`. Route now redirects `/clarity-champions` → `/pledgers`.

| Property | Type | Description |
|----------|------|-------------|
| `verified_count` | number | Number of verified champions displayed |

### `champion_card_clicked` (DEPRECATED)
**Deprecated:** Replaced by `pledger_card_clicked`.

| Property | Type | Description |
|----------|------|-------------|
| `champion_slug` | string | Slug of clicked champion |

### `witness_cta_clicked`
User clicked "Become a Champion" from a witness prompt.

| Property | Type | Description |
|----------|------|-------------|
| `referrer_profile_id` | string | Profile ID of the person being endorsed |

### `witness_submitted`
User submitted a witness/endorsement.

| Property | Type | Description |
|----------|------|-------------|
| `profile_id` | string | Profile being endorsed |
| `has_name` | boolean | Whether witness provided name |
| `has_linkedin` | boolean | Whether witness provided LinkedIn |

### `witness_success`
Witness submission succeeded.

| Property | Type | Description |
|----------|------|-------------|
| `profile_id` | string | Profile endorsed |

### `witness_error`
Witness submission failed.

| Property | Type | Description |
|----------|------|-------------|
| `profile_id` | string | Profile being endorsed |

---

## Live Meetings

Events for the `/live` real-time understanding verification feature.

### Page Entry

#### `live_meeting_page_view`
User views the `/live` page (landing state before joining/creating).

| Property | Type | Description |
|----------|------|-------------|
| `referrer` | string | Document referrer URL |
| `has_session_code` | boolean | Whether URL contains a session code |
| `is_authenticated` | boolean | Whether user is logged in |

#### `live_meeting_start_clicked`
User clicked "Start Meeting" button.

*No properties*

#### `live_meeting_join_clicked`
User clicked "Join" to enter a session code.

| Property | Type | Description |
|----------|------|-------------|
| `code_length` | number | Length of entered code |

#### `live_meeting_login_clicked`
User clicked login prompt in live meeting.

*No properties*

### Session Lifecycle

#### `live_session_created`
Host creates a new live meeting.

| Property | Type | Description |
|----------|------|-------------|
| `session_code` | string | 6-character room code |

#### `live_session_joined`
Partner joins an existing meeting.

| Property | Type | Description |
|----------|------|-------------|
| `session_code` | string | 6-character room code |
| `join_method` | string | How they joined: `link` or `code` |

#### `live_session_exited`
User leaves the meeting.

| Property | Type | Description |
|----------|------|-------------|
| `session_code` | string | 6-character room code |
| `checks_completed` | number | Number of understanding checks completed |
| `is_creator` | boolean | Whether user was the host |
| `had_meaningful_engagement` | boolean | Whether at least one check was completed |

#### `live_session_completed`
User exits after meaningful engagement (at least one understanding check). This is a key conversion metric.

| Property | Type | Description |
|----------|------|-------------|
| `session_code` | string | 6-character room code |
| `checks_completed` | number | Number of understanding checks completed |
| `is_creator` | boolean | Whether user was the host |

#### `live_session_partner_left`
Partner disconnected from the meeting (detected via presence).

| Property | Type | Description |
|----------|------|-------------|
| `session_code` | string | 6-character room code |
| `checks_completed` | number | Number of understanding checks completed |
| `was_in_flow` | boolean | Whether a check was in progress |
| `trigger` | string | What triggered detection: `presence_change`, `polling`, etc. |

#### `live_session_join_blocked`
User attempted to join a session but was blocked.

| Property | Type | Description |
|----------|------|-------------|
| `session_code` | string | Attempted room code |
| `reason` | string | Why blocked: `session_full`, `session_not_found`, etc. |

#### `live_invite_shared`
Host shared/copied the invite link (P106 - tracks join funnel).

| Property | Type | Description |
|----------|------|-------------|
| `session_code` | string | Room code |
| `method` | string | How shared: `native_share` (mobile) or `clipboard_copy` (desktop) |

#### `live_session_abandoned`
Host left waiting room before partner joined (P106 - tracks join funnel).

| Property | Type | Description |
|----------|------|-------------|
| `session_code` | string | Room code |
| `waited_seconds` | number | How long host waited before abandoning |

### Understanding Flow

#### `live_check_started`
User tapped "Did you get me?" (speaker-initiated flow).

| Property | Type | Description |
|----------|------|-------------|
| `session_code` | string | Room code |
| `flow_type` | string | Always `check` |

#### `live_prove_started`
User tapped "Did I get you?" (listener-initiated flow).

| Property | Type | Description |
|----------|------|-------------|
| `session_code` | string | Room code |
| `flow_type` | string | Always `prove` |

#### `live_rating_submitted`
User submitted their understanding rating.

| Property | Type | Description |
|----------|------|-------------|
| `session_code` | string | Room code |
| `rating` | number | Rating value (0-10) |
| `role` | string | `checker` (speaker) or `responder` (listener) |
| `flow_type` | string | `check` or `prove` |
| `round` | number | Explain-back round (0 = initial) |

#### `live_understanding_revealed`
Both users submitted - ratings revealed.

| Property | Type | Description |
|----------|------|-------------|
| `session_code` | string | Room code |
| `checker_rating` | number | Speaker's "how understood" rating |
| `responder_rating` | number | Listener's confidence rating |
| `gap` | number | Responder - Checker (positive = overconfidence) |
| `gap_type` | string | `overconfidence`, `underconfidence`, or `none` |
| `is_perfect` | boolean | Both rated 10/10 |
| `round` | number | Explain-back round (0 = initial) |

#### `live_explain_back_started`
Listener started explain-back to close understanding gap.

| Property | Type | Description |
|----------|------|-------------|
| `session_code` | string | Room code |
| `round` | number | Which explain-back round (1, 2, 3...) |
| `checker_rating` | number | Speaker's initial "understood" rating |
| `responder_rating` | number | Listener's initial confidence rating |

#### `live_explain_back_rated`
Speaker rated listener's explain-back.

| Property | Type | Description |
|----------|------|-------------|
| `session_code` | string | Room code |
| `rating` | number | New rating (0-10) |
| `round` | number | Explain-back round |
| `is_perfect` | boolean | Rating was 10 |
| `previous_checker_rating` | number | Rating before explain-back |

#### `live_perfect_understanding`
Perfect understanding (10/10) achieved.

| Property | Type | Description |
|----------|------|-------------|
| `session_code` | string | Room code |
| `rounds_to_achieve` | number | How many explain-back rounds (0 = immediate) |
| `initial_checker_rating` | number | Speaker's first rating |
| `initial_responder_rating` | number | Listener's first rating |

#### `live_round_skipped`
User clicked skip/good-enough to end current round.

| Property | Type | Description |
|----------|------|-------------|
| `session_code` | string | Room code |
| `phase` | string | What phase was skipped (`revealed`, `explain-back`, etc.) |
| `round` | number | Current explain-back round |

### Technical/Debug

#### `live_state_drift_detected`
Realtime sync detected state mismatch (fallback polling corrected it).

| Property | Type | Description |
|----------|------|-------------|
| `sessionCode` | string | Room code |
| `ratingPhase` | string | Current phase |
| `phaseDrift` | boolean | Phase mismatch detected |
| `checkerNameDrift` | boolean | Checker name mismatch |
| `checkerDrift` | boolean | Checker submission mismatch |
| `responderDrift` | boolean | Responder submission mismatch |
| `explainBackDoneDrift` | boolean | Explain-back done mismatch |

---

## Stories

Events for story creation, viewing, and activation into /live sessions.

### `story_created`
User saves a new story.

| Property | Type | Description |
|----------|------|-------------|
| `story_id` | string | ID of the created story |
| `has_points` | boolean | Whether any points were added at creation time (always `false` at creation — points are added after) |
| `points_count` | number | Number of points at creation time (always `0` at creation) |
| `word_count` | number | Approximate word count of story text |
| `visibility` | string | Story visibility: `public`, `shared`, or `private` |

### `story_viewed`
Someone views a story detail page (`/story/:id`).

| Property | Type | Description |
|----------|------|-------------|
| `story_id` | string | ID of the viewed story |
| `is_own_story` | boolean | Whether the viewer is the story author |
| `has_points` | boolean | Whether the story has any linked points |
| `viewer_authenticated` | boolean | Whether the viewer is logged in |

### `story_session_started`
A /live session has a story selected as the subject for understanding verification. Fired when a user selects a story inside an active session (i.e. the session is being driven by a story).

| Property | Type | Description |
|----------|------|-------------|
| `story_id` | string | ID of the story selected for the session |
| `session_code` | string | 6-character room code of the active session |

---

## PWA

### `pwa_install_prompted`
PWA install prompt was triggered.

| Property | Type | Description |
|----------|------|-------------|
| `source` | string | Where the prompt was triggered from: `avatar_menu` or `return_nudge` (P1593) |

### `pwa_install_instructions_shown`
Generic (non-iOS) install instructions were shown because no native prompt was captured (P1593).

| Property | Type | Description |
|----------|------|-------------|
| `source` | string | `avatar_menu` or `return_nudge` |

### `pwa_ios_instructions_shown`
iOS PWA install instructions were shown to the user.

| Property | Type | Description |
|----------|------|-------------|
| `source` | string | Where the instructions were shown from: `avatar_menu` or `return_nudge` |

---

## Feed

### `feed_viewed`
P1669: the feed page (`/feed`) was opened. No properties.

### `feed_tag_filtered`
User clicked a tag in the tag cloud to filter the feed.

| Property | Type | Description |
|----------|------|-------------|
| `tag` | string | Tag that was selected |
| `source` | string | Where the tag was clicked: `tag_cloud` |

### `feed_tag_cleared`
User dismissed the active tag filter.

| Property | Type | Description |
|----------|------|-------------|
| `tag` | string | Tag that was cleared |

### `feed_sort_changed`
User toggled the feed sort order.

| Property | Type | Description |
|----------|------|-------------|
| `sort_order` | string | New sort order: `newest` or `oldest` |

### `feed_card_shared`
User opened the share sheet (link + embed code) from a story or point card. Since P1296 every
list card opens the same sheet, so this fires from all three list surfaces; the share buttons on
the story page, point page and profile header do not fire it.

| Property | Type | Description |
|----------|------|-------------|
| `type` | string | Card type: `story` or `point` |
| `id` | string | ID of the shared item |
| `surface` | string | Where the card sits: `feed`, `stake` (`/stake/:tag`), `profile` or `canvas` (the open point on `/canvas/:handle/:projectTag`, P1508). Added in P1296; earlier events carry no `surface` and all came from `/feed` |

---

## Partner Template

### `partner_template_viewed`
User views the partner agreement template page (`/partner-template`).

| Property | Type | Description |
|----------|------|-------------|
| `referrer` | string | Document referrer URL or `direct` |

---

## Anonymous Position CTA

### `anon_position_cta_shown`
Anonymous position CTA was shown to a user.

| Property | Type | Description |
|----------|------|-------------|
| `point_id` | string | ID of the point |

### `anon_position_cta_clicked`
User clicked a link in the anonymous position CTA.

| Property | Type | Description |
|----------|------|-------------|
| `point_id` | string | ID of the point |
| `action` | string | Which link was clicked: `signup` or `login` |

---

## Auth Gate

### `auth_gate_triggered`
Auth gate redirected an anonymous user to signup/login.

| Property | Type | Description |
|----------|------|-------------|
| `context` | string | Gate action: `set-position`, `start-story`, `open-chat`, `join-session`, `create-story` |
| `redirect_path` | string | Page path where the gate was triggered |

### `auth_gate_completed`
User completed auth and context was restored.

| Property | Type | Description |
|----------|------|-------------|
| `context` | string | Restored action: `set-position`, `start-story`, `open-chat` |
| `redirect_path` | string | Path the user was redirected to after restoration |

---

## Audio Upload Reliability

Events for monitoring audio chunk upload reliability during /live recording (P566/P578).

### `audio_chunk_upload_failed`
A chunk upload attempt failed (fired per retry attempt).

| Property | Type | Description |
|----------|------|-------------|
| `session_code` | string | 6-character room code |
| `chunk_number` | number | Chunk sequence number |
| `error_type` | string | Error message from the failed upload |
| `retry_count` | number | Number of retries before this attempt (0 = first try) |

### `audio_chunk_recovered`
A chunk was successfully uploaded after failure (retry or IndexedDB recovery).

| Property | Type | Description |
|----------|------|-------------|
| `session_code` | string | 6-character room code |
| `chunk_number` | number | Chunk sequence number |
| `recovery_source` | string | How recovered: `retry` (succeeded after failed attempts) or `indexeddb` (orphaned chunk from previous session) |

---

## 404 Page

### `not_found_page_viewed`
User landed on a non-existent route.

| Property | Type | Description |
|----------|------|-------------|
| `attempted_path` | string | The path + query string that was attempted |
| `referrer` | string | Document referrer URL or `direct` |

---

## Session Transcripts

Events for transcript engagement on the sessions page (P578).

### `transcript_nudge_shown`
Transcript row was rendered in session detail view (any status: processing, failed, or ready).

| Property | Type | Description |
|----------|------|-------------|
| `session_id` | string | Session UUID |
| `has_transcript` | boolean | Whether transcript is completed/ready |

### `transcript_nudge_clicked`
User clicked "Open" on a completed transcript row.

| Property | Type | Description |
|----------|------|-------------|
| `session_id` | string | Session UUID |

---

## Letters

Events for the Clarity Letter author overview (P700/P836/P843).

### `letter_overview_viewed`
Author opened the cohort overview for a sent letter and data finished loading. Fires once per `letter_id` per page mount.

| Property | Type | Description |
|----------|------|-------------|
| `letter_id` | string | Letter UUID |
| `story_count` | number | Number of story snapshots in the letter |
| `recipient_count` | number | Number of deliveries (recipients) |

### `letter_overview_entity_link_clicked`
Author clicked a navigation link inside the cohort table — either a recipient profile link or a "open results" story link.

| Property | Type | Description |
|----------|------|-------------|
| `link_type` | string | `recipient` (profile link) or `story_results` (per-delivery results page) |

---

## Events (Practice Events)

### `event_rsvp_initiated`
User clicked the "Reserve a seat" RSVP button on an event detail page (P844). Fires before the auth/redirect branch so unauthenticated initiations are captured. Does not fire on disabled (`Event Full`, `Event Ended`) buttons.

| Property | Type | Description |
|----------|------|-------------|
| `event_id` | string | Event UUID |
| `event_type` | string | The event's series slug, or `standalone` (P1640) |
| `trigger` | string | `sticky_bar` (mobile bottom bar) or `card` (desktop / mobile inline card) |

---

### `event_rsvp_completed`
An RSVP was saved, on any of the three paths (P1640). Never fires on a failed RSVP.

| Property | Type | Description |
|----------|------|-------------|
| `event_id` | string | Event UUID |
| `event_type` | string | The event's series slug, or `standalone` |
| `path` | string | `signed_in`, `post_signup` or `close_page` |

---

## Terms of Service

Events for the global Terms acceptance gate (P832).

### `tos_gate_shown`
Re-acceptance dialog became visible because the authenticated user's accepted terms version is older than `CURRENT_TERMS_VERSION`.

| Property | Type | Description |
|----------|------|-------------|
| `terms_version` | string | Current required version (e.g., `v1.3`) |

### `tos_accepted`
User clicked Accept and the server persisted the acceptance.

| Property | Type | Description |
|----------|------|-------------|
| `terms_version` | string | Version the user just accepted |

---

## Clarity Meeting Terms

Events for the /meet flow (P1016 + P1024) — a per-conversation commitment with no backend. Level tracking and acceptance were previously untracked (zero events).

### `meeting_terms_level_changed`
Participant moved the level track to a different rung before answering opt-in/opt-out. Only fires when the new rung differs from the current one (the track is locked once an answer is given, so this cannot fire twice for the same answer).

| Property | Type | Description |
|----------|------|-------------|
| `from_level` | number | Rung before the change (1-3) |
| `to_level` | number | Rung after the change (1-3) |

### `meeting_terms_accepted`
Participant opted in, gave an understanding rating, and tapped "Start meeting" — the page's `accepted` state (P1016's in-meeting state) becomes true.

| Property | Type | Description |
|----------|------|-------------|
| `level` | number | Rung the meeting is running under (1-3) |

---

## Clarity Organizations

Events for /org/:slug (P1010) — joining, leaving, and the shared Events nav link. Previously untracked (zero events).

### `org_joined`
Visitor accepted the Clarity Organization Terms and the membership row was created (`/org/:slug/join`).

| Property | Type | Description |
|----------|------|-------------|
| `org_slug` | string | Organization slug |
| `terms_version` | number | COA version accepted (`CURRENT_COA_VERSION`) |

### `org_left`
Member confirmed leaving the organization and the membership row was removed.

| Property | Type | Description |
|----------|------|-------------|
| `org_slug` | string | Organization slug |

### `org_events_nav_clicked`
Visitor clicked the "Events" nav link, which routes to `/org/cm` (`EVENTS_NAV_TO` — P1010 points Events at the Clarity Organization page, not a bare events list). One constant renders this link from five call sites; each fires with its own `source`.

| Property | Type | Description |
|----------|------|-------------|
| `source` | string | `bottom_nav` (mobile bottom nav), `desktop_top_nav` (logged-in desktop icon nav row, `simple-navigation.tsx`), `desktop_dropdown` (avatar dropdown menu), `mobile_menu` (hamburger menu), or `footer` |

### `group_viewed`
P1669: a group page (`/groups/:slug`) showed a group. A completed join is `org_joined` above.

| Property | Type | Description |
|----------|------|-------------|
| `org_slug` | string | Organization slug |

**Discrepancy from the originating audit:** the audit's assumed `source` values were `bottom_nav/desktop_dropdown/mobile_menu/footer`. A fifth real call site exists — the logged-in desktop icon nav row in `simple-navigation.tsx` (`StaticNavLinks`) — which doesn't match any of those four; it's tracked as `desktop_top_nav`.

---

## Offline strip episodes (P1677)

One event per **episode**: the span from the offline strip appearing until it leaves the screen
(`src/app/components/offline/offline-strip-episodes.ts`, called from `OfflineStrip`). The episode
follows the strip's **state**, not its text (the saved-copy age changes every minute), so a change
between states is not a new episode. It continues across route changes. If the strip goes away and
comes back, that is two episodes. Embed mode renders no strip and records nothing.

### `offline_strip_episode`
Sent when the strip goes away, or when `OfflineStrip` unmounts while it shows. A tab closed while
the strip shows sends nothing (no `pagehide` listener, by design), which removes the longest
episodes and biases criteria 2 and 3 toward "no change".

| Property | Type | Description |
|----------|------|-------------|
| `first_state` | string | `slow` ("Saved copy · updating…"), `offline_cached` ("Offline · saved copy…") or `offline` ("Offline") |
| `last_state` | string | Same values: what the strip said last |
| `duration_ms` | number | How long the strip was on screen |
| `ended_by` | string | `cleared` (it went away) or `unmount` (the strip component left while showing) |
| `start_route` / `end_route` | string | Known top-level route (`/story`, `/feed`, ...), `/` for the root, `other` for anything else. The event's own properties never carry a raw path, id or query. Mixpanel's automatic `$current_url` on every event still carries the page URL (with the P1669 chat-id scrubbing), as it does for every other event |
| `navigator_online` | boolean | `navigator.onLine` when the episode ended |

**Cap:** at most 5 episodes per document load (a module-level counter, so navigation does not reset
it). A flapping connection therefore undercounts frequency, and a capped load still shows 5.
An episode that ends while the tab is hidden is sent when the tab is next visible (metered-services
rule 3), with its properties fixed at the moment it ended, and is lost if the tab is closed first.

**Known-route set:** `KNOWN_TOP_LEVEL_SEGMENTS` is checked against the `path="..."` values in
`src/App.tsx` and `src/app/routes/*.tsx`, plus `USE_CASE_LANDINGS`, by `src/tests/p1677-offline-strip-routes.test.ts`. Adding a top-level route fails
that test until the list is updated, so it cannot silently become `other`.

### Queries for the Decision Criteria (P1677 spec)

Base filter for every query: `is_bot` not set **and** `is_internal` != true (see the `is_internal`
caveat under User Properties: anonymous events carry none). Each criterion needs at least 30 episodes in its own
subset; below 30, report counts and decide nothing. Thresholds are proposals
`[FOUNDER DECISION: thresholds, proposed]`.

1. **Real outages:** Insights, event `offline_strip_episode`, filter `first_state = slow`, count
   segmented by `last_state`. Share with `last_state` in (`offline_cached`, `offline`) of the total. 20% or more: the strip is telling the truth.
2. **Stalls that are not outages:** same filter, plus `duration_ms >= 15000`, count segmented by `last_state`.
   Share with `last_state = slow` of all `first_state = slow` episodes. 20% or more: investigate the auth lock, then the sequential
   round trips in the most frequent `start_route` (segment the same query by `start_route`).
3. **Slow but short:** filter `first_state = slow` and `ended_by = cleared`,
   aggregation: median of `duration_ms`. Above 8000: look at the sequential round trips.
   **UNVERIFIED:** whether Mixpanel computes a median over this filtered set (the Mixpanel MCP did not connect when the spec was written). Fallback: export the events and compute the median outside Mixpanel.
4. **None of the above:** report episodes per week, `start_route` breakdown and duration, and no change.

---

## Page views and visit length (P1669)

Named view events fire once per view through `useTrackView` (`src/hooks/use-track-view.ts`), which survives StrictMode double mounts and fires again when the slug changes.

| Event | Surface | Properties |
|---|---|---|
| `feed_viewed` | `/feed` | none |
| `group_viewed` | `/groups/:slug` | `org_slug` |
| `group_join_viewed` | `/groups/:slug/join` (a completed join is `org_joined`) | `org_slug` |
| `chats_viewed` | `/chats` list | none |
| `chat_opened` | a conversation in Clarity Chat | none: never a conversation, message or contact id |
| `event_prepare_viewed` | `/events/:slug/prepare` | `event_slug` |
| `event_rsvp_confirm_viewed` | `/events/:slug/confirm` | `event_slug` |

**Visit length.** A session is measured from its first to its last event, so a reader who never clicks used to produce a 0-second session. `src/lib/engagement.ts` measures visible time from timestamps and sends `page_engaged` each time the visible time on a page passes another 30 seconds (`seconds_visible`), stopping after 10 minutes per page, and `page_left` (`seconds_visible` plus `page_path`, the page that was left) on an in-app navigation, a hidden tab or closing (by beacon), only when the visible time has grown. Both events carry `view_id`, random per page view, and `seconds_visible` is the running total of that view: a visit's length is the largest `seconds_visible` per `view_id` across both events, never a sum. Up to 3 leaves per view come from hiding the tab (app switching); leaving for another route or closing the page always reports, and a hidden tab sends nothing, even if the route changes behind it. iOS Safari does not always fire `pagehide` on close, so a visit's length may stop at its last heartbeat. The sign-out reset puts `has_interacted` back defensively. A local check every second notices route changes; it makes no request. Tagged bots send neither, except `webdriver` (our own smokes). Volume is budgeted in the P1669 spec's Cost Budget. `page_engaged` and `page_left` go straight to the SDK, so they never enter the live-session ML collector. Named view events go through `analytics.track` like any other event. They fire for the route, before the page loads its data: a slug that does not exist still counts, and chats count only when signed in. Keep the project's session definition timeout-based.

---

## Implementation

All analytics go through the wrapper at [src/lib/mixpanel.ts](../../src/lib/mixpanel.ts):

```typescript
import { analytics } from '@/lib/mixpanel';

// Track events
analytics.track('event_name', { property: 'value' });

// Identify users (after auth)
analytics.identify(userId);

// Set user properties
analytics.setUserProperties({ plan: 'free' });

// Reset on logout (clears user identity)
analytics.reset();
```

Events are production-only via `import.meta.env.PROD` check.

## User Identification

Users are identified with Mixpanel in two places:

1. **AuthCallbackPage** - When user clicks magic link or completes Google OAuth. Also sets user properties.

2. **AuthContext** - When returning user loads the app with an existing session (cookie). This ensures returning users are identified without requiring re-authentication.

The `analytics.reset()` call on sign out clears the user identity so subsequent events aren't attributed to the wrong user.

## Browser Automation Limitations (Mixpanel)

**Shadow DOM blocks all browser automation tools.** Mixpanel's UI is built with Shadow DOM — `document.querySelector`, accessibility tree traversal, and CDP element queries cannot find buttons, inputs, or clickable elements inside Shadow DOM components. This affects Claude in Chrome, Chrome DevTools MCP, and Playwright equally.

**Consequence:** Any Mixpanel UI action (creating boards, adding cards, configuring reports) must be done manually by the user. Agents can navigate to Mixpanel pages and take screenshots, but cannot interact with UI elements.

**What agents CAN do:** Navigate to board URLs, take screenshots to verify current state, read page text via JavaScript `document.body.innerText` (text is accessible even in Shadow DOM via `innerText`).
- **Adding reports**: click the gray empty card slot in the board — triggers existing-report picker. Shadow DOM blocks `querySelectorAll` but coordinate clicks work fine.

**Retention board is manual-only.** The Retention board (id: 10989955) requires manual card setup in Mixpanel UI. A "duplicate board card" fix in a previous session inadvertently lost the Monthly Retention card — it must be re-added manually. Do not attempt to recreate via automation.

---

## User Properties

Properties set on the user profile in Mixpanel (via `analytics.setUserProperties()`):

| Property | Type | Description | Set When |
|----------|------|-------------|----------|
| `email` | string | User's email address | Auth callback |
| `name` | string | User's display name | Auth callback |
| `profile_slug` | string | User's URL slug | Auth callback |
| `has_role` | boolean | Whether user has a professional role | Auth callback |
| `has_linkedin` | boolean | Whether user has LinkedIn URL | Auth callback |
| `created_at` | string | ISO timestamp of profile creation | Auth callback |
| `has_pledged` | boolean | Whether user signed the pledge (P50) | Auth callback |
| `registration_source` | string | How user registered: `pledge`, `signup`, `live`, or `returning` (P64) | Auth callback |
| `is_internal` | boolean | True for known non-customer accounts — `is_test_account`-flagged profiles, any `@claritypledge.com` email, or a hashed email in `VITE_INTERNAL_ACCOUNT_EMAIL_HASHES` (P1133) | Auth callback only |

These properties enable segmentation in Mixpanel:
- **Pledgers vs Non-pledgers**: Filter by `has_pledged`
- **Registration cohorts**: Group by `registration_source`
- **Profile completeness**: Filter by `has_role`, `has_linkedin`
- **Automation** (P1628): every event sent under `navigator.webdriver` carries the event property
  `is_automation: true`. The property is absent on other traffic, so filter `is_automation != true`.
  It is on events only, not on `/engage` or `/groups` profile updates, so a profile-level filter gets
  no signal from it. It is a strong filter, not a guarantee: a small number of automation events can
  arrive untagged (for example, one left queued when a page dies). Events sent before the tag shipped
  carry nothing and stay contaminated. Third-party bots that hide webdriver are not caught.
  Automation is not session-recorded. The opt-ins, which set `window.__p1628KeepRecorderForSmoke` and
  answer `/record` locally so no replay is stored, are the health and CSP smokes (which also fail
  unless the recorder really reached `/record`, so recorder-only CSP breaks stay detectable), the P881
  recording guard and P1628's own e2e spec. Cost: other Playwright or DevTools sessions against prod
  now run without the recorder, so bugs that only appear with the recorder on (decisions.md
  2026-10-04 and 2026-08-10) will not reproduce there. Reproduce those in a real browser, or set the
  flag.
- **Customer-only funnels**: Filter `is_internal != true` — without this, founder/test/service
  account activity can look like real signup-funnel activity (P1133). Three coverage gaps to know
  before trusting a query:
  1. **Anonymous/pre-login events carry no `is_internal` at all, in any time window.** It's a
     Mixpanel *People* property, which requires `identify()` first — every pre-login pageview
     (e.g. `/signup` views before the visitor authenticates) is structurally untaggable, not just
     historically untagged. This is usually the widest part of a funnel.
  2. **Events recorded before this property shipped are untagged**, and — because it's a People
     property, not an event property — it's also not retroactive the other way: an already-signed-in
     user's People profile only gets `is_internal` set the next time they complete a fresh
     magic-link/OAuth login, not on their next ordinary page load with a persisted session.
  3. **A real customer given a `@claritypledge.com` address (design partner, certifier, future
     employee) is classified internal by construction**, silently — there's no separate signal.
     `isInternalAccount()` logs a console warning in production whenever the domain branch (not
     `is_test_account`) is what matched, specifically so this is auditable rather than invisible. A
     separate warning (once per page load, not once per login) fires if
     `VITE_INTERNAL_ACCOUNT_EMAIL_HASHES` is unprovisioned — check the Vercel dashboard if you ever
     see it.
  4. **A profile that migrates from `/live` (anonymous session → magic-link auth) does not carry
     `is_test_account` through to the new database row**, even though its Mixpanel `is_internal`
     tag is correct for that one migration login — `upsert_my_profile`'s RLS pins the column
     against client writes (P571), so every *subsequent* login re-reads `is_test_account: false`
     from the DB. Fixing this for real needs a dedicated SECURITY DEFINER RPC; out of scope for
     P1133, tracked as P1137.
  When in doubt, cross-check a `is_internal != true` result against `auth.users`/`profiles`
  directly rather than trusting the filter alone for anything that matters.

---

## Channel Attribution (UTM)

P1134: most traffic showed no referrer at all ($direct) because no outbound link this project
controls carried a channel-identifying param. Every new outbound link gets tagged with standard
`utm_source`/`utm_medium`/`utm_campaign` query params via the `withUtm()` helper in
[src/lib/utm.ts](../../src/lib/utm.ts):

```typescript
import { withUtm } from '@/lib/utm';

const link = withUtm('https://claritypledge.com/events/my-event', {
  source: 'whatsapp',
  medium: 'dm',
  campaign: 'my-event',
});
```

**Verified (2026-08-21):** Mixpanel's web SDK auto-registers `utm_source`/`utm_medium`/
`utm_campaign` from the query string as super properties on page load — they're included on
every subsequent event (including the `$mp_web_page_view` autocapture event) with no custom
capture code. Confirmed live: a tagged pageview against production surfaced as a filterable
`utm_source` property on `$mp_web_page_view` within the same session.

**`utm_source` — the channel/platform:**

| Value | Channel |
|-------|---------|
| `whatsapp` | WhatsApp DM or group share |
| `telegram` | Telegram group share (P1669; before it, Telegram used `whatsapp`) |
| `messenger` | Facebook Messenger DM (P1669) |
| `facebook` | Facebook group event post or personal post |
| `luma` | Luma event listing |
| `eventbrite` | Eventbrite listing |
| `email` | Email/newsletter |
| `sola` | Sola app listing |
| `todo-today` | Todo.Today listing |
| `cm-page` | Outbound link on the `/cm` calendar page itself |

**`utm_medium` — the type of touchpoint:**

| Value | Touchpoint |
|-------|-----------|
| `dm` | 1:1 direct message |
| `community-group` | Post in a group/community (e.g. Facebook group event) |
| `event-listing` | Listing on a third-party events platform |
| `newsletter` | Email send |
| `calendar-subscribe` | The `/cm` page's "Add this calendar to yours" link |
| `personal-post` | A post on the founder's own Facebook profile (P1669) |

**Who applies it (P1669):** the event-promotion skills tag every claritypledge.com link they post, per platform (`promote-all.md` § "Channel tag (UTM)"). A series short link forwards the five `utm_*` keys through `api/series-redirect` to the event page; before P1669 that last hop dropped them.

**`utm_campaign`** — the event slug or promo identifier, e.g. `chiang-mai-run-2026-09`.

**First touch on the account (P1669).** The SDK's own UTM super properties are last-touch. `index.html` also keeps the first UTM set a browser ever arrives with (`localStorage` `cp_first_touch_utm`), and `profile_created` carries it as `utm_*` event properties and sets the same keys once on the user profile. Every `utm_*` value, on any event and inside any URL on an event, is cut to letters, digits, `-`, `_` and `.`, at most 64 characters. Limit: a sign-up finished in a different browser from the one that opened the link (a WhatsApp in-app browser, then the email link in Safari) carries no first touch.

**Not the same mechanism as `?referrer=<profile_id>`** (person-to-person sharing, e.g.
`witness-card.tsx`) — that answers "which person shared this," a separate question from "which
channel." Leave it as-is; do not conflate the two.

---

## Known event gaps (open)

Carried forward from P578 when it closed on 2026-08-14. These are **not** recoverable by the
`/weekly` §2.9.1 audit: that audit only inspects commits inside its own lookback window, so a gap
older than the window is invisible to it forever. Recorded here because this doc is the only place
that survives the spec.

| Missing event | Surface | Noted |
|---|---|---|
| `story_collapse_toggled` | story card expand/collapse | 2026-03-23 |
| calibration-display views (P539) | calibration display | 2026-03-23 |
| embed share-dialog events (P548) | embed share dialog | 2026-03-23 |

Verified still absent from both `src/` and this document on 2026-08-14. Add them when next touching
those surfaces, or delete this block with a note if the surfaces themselves are retired.
