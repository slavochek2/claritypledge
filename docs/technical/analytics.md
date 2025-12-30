# Analytics Events (Mixpanel)

This document catalogs all Mixpanel events tracked in the Clarity Pledge app.

**Note:** Analytics are production-only. Events are not sent in development mode.

## Overview

Events are categorized by feature area:
- [Core Funnel](#core-funnel) - Landing → Sign → Profile creation
- [Profile & Sharing](#profile--sharing) - Profile views, sharing, certificates
- [Social Features](#social-features) - Champions page, endorsements
- [Live Meetings](#live-meetings) - Real-time understanding verification

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

### `profile_created`
New user profile created after email verification.

| Property | Type | Description |
|----------|------|-------------|
| `slug` | string | User's profile slug |

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

## Social Features

### `champions_page_viewed`
User views the Understanding Champions page.

| Property | Type | Description |
|----------|------|-------------|
| `verified_count` | number | Number of verified champions displayed |

### `champion_card_clicked`
User clicked on a champion's card.

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

1. **AuthCallbackPage** - When user clicks magic link and completes authentication. Also sets user properties (email, name, slug, etc.)

2. **AuthContext** - When returning user loads the app with an existing session (cookie). This ensures returning users are identified without requiring re-authentication.

The `analytics.reset()` call on sign out clears the user identity so subsequent events aren't attributed to the wrong user.
