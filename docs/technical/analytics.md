# Analytics Events (Mixpanel)

This document catalogs all Mixpanel events tracked in the Clarity Pledge app.

**Note:** Analytics are production-only. Events are not sent in development mode.

## Analytics Strategy

**Purpose:** Answer three weekly questions:
1. Are people creating stories? (story funnel)
2. Are stories triggering /live sessions? (activation)
3. Are users coming back? (retention)

**Sources:**
- Mixpanel: behavioral events (sessions, stories, gaps)
- Supabase prod: account health (total users, verified, unverified, signups this week)

**Dashboards:**
- Session Value: https://eu.mixpanel.com/project/3968494/view/4464294/app/boards#id=10989894
- Activation: https://eu.mixpanel.com/project/3968494/view/4464294/app/boards#id=10989933
- Retention: https://eu.mixpanel.com/project/3968494/view/4464294/app/boards#id=10989955

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
| `source` | string | Where the prompt was triggered from |

### `pwa_ios_instructions_shown`
iOS PWA install instructions were shown to the user.

| Property | Type | Description |
|----------|------|-------------|
| `source` | string | Where the instructions were shown from |

---

## Feed

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
User clicked the share button on a feed card.

| Property | Type | Description |
|----------|------|-------------|
| `type` | string | Card type: `story` or `point` |
| `id` | string | ID of the shared item |

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
| `trigger` | string | `sticky_bar` (mobile bottom bar) or `card` (desktop / mobile inline card) |

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

**Discrepancy from the originating audit:** the audit's assumed `source` values were `bottom_nav/desktop_dropdown/mobile_menu/footer`. A fifth real call site exists — the logged-in desktop icon nav row in `simple-navigation.tsx` (`StaticNavLinks`) — which doesn't match any of those four; it's tracked as `desktop_top_nav`.

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
