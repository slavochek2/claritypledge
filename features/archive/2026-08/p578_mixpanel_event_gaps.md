---
title: "Mixpanel event gaps — P566 upload + 404 + transcript nudge"
status: rejected
type: task
priority: low
created: 2026-03-23
tags: []
rank: 42
created_date: 2026-03-23
closed_at: '2026-08-14'
---

# P578: Mixpanel Event Gaps

> **Closed 2026-08-14 — backlog triage.** The three HIGH-priority events shipped. The three lower-priority ones (`story_collapse_toggled`, P539 calibration views, P548 embed dialog) are recorded as an open gap in `docs/technical/analytics.md` — `/weekly` §2.9.1 is forward-only and cannot recover them. Continuous detection now lives in that weekly audit.
>
> Full reasoning and the adversarial review that produced this call: session plan v2, 2026-08-14.

Add missing analytics events for observability gaps identified in weekly review (2026-03-23).

## Events to Add

### 1. Audio chunk upload reliability (P566) — HIGH PRIORITY
- `audio_chunk_upload_failed` with {session_code, chunk_number, error_type, retry_count}
- `audio_chunk_recovered` with {session_code, chunk_number, recovery_source: 'indexeddb'|'retry'}
- Why: zero backend observability on reliability-critical path. UI shows health indicator but aggregate failure rates invisible.

### 2. 404 page tracking
- `not_found_page_viewed` with {attempted_path, referrer}
- Why: can't detect broken links or measure their frequency

### 3. Transcript nudge (my-sessions-page)
- `transcript_nudge_shown` with {session_code, has_transcript: bool}
- `transcript_nudge_clicked` with {session_code}
- Why: unmeasured activation prompt

### 4. Lower priority
- `story_collapse_toggled` with {point_id, expanded: bool, story_count} on point-detail-page
- P539 calibration display views
- P548 embed share dialog

## Acceptance Criteria
- [ ] Events fire in production
- [ ] analytics.md updated with new events
- [ ] Verified in Mixpanel live view
