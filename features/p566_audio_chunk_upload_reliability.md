---
status: in-progress
type: bug
rank: 5
flow: dev
delivery_stage: 4-tests-ready
tags:
  - recording
  - infrastructure
  - live
uat_file: features/uat/p566.md
test_files:
  - src/tests/chunkStore.test.ts
  - src/tests/chunkUploadQueue.test.ts
  - e2e/p566-upload-reliability.spec.ts
  - e2e/a11y/p566-accessibility.spec.ts
  - e2e/p566-smoke.spec.ts
---

# P566: Audio Chunk Upload Reliability

## Problem Statement

**Current state:** /live session audio is recorded via MediaRecorder API in 30-second chunks, uploaded to GCS via signed URLs in real-time. Chunks are held in memory only — if an upload fails or the tab closes, data is permanently lost.

**Pain points:**
- 35% chunk loss observed in session E7QDTX (57 of 87 expected chunks missing from Slava's recording)
- Some "uploaded" chunks are near-empty (905 bytes, 4KB) — partial uploads accepted by GCS
- Upload errors are silently swallowed (`api.ts:2850-2858`: catch block logs to Sentry but never re-throws)
- Fire-and-forget upload pattern: `onChunkReady().catch(console.error)` — no retry, no queue, no backpressure
- No fetch timeout on upload requests — hangs indefinitely on slow mobile networks
- No `visibilitychange` handling — mobile OS throttles/suspends JS when tab is backgrounded
- Unmount cleanup silently ignores upload errors (`.catch(() => {})`)
- No upload health surfaced to users — they have no idea audio is being lost
- DB `chunk_count` records the last chunk number, not actual successful uploads — false confidence

**Who's affected:** All /live session participants on any device, especially mobile users on unstable WiFi. Downstream: transcription pipeline receives incomplete audio with gaps that no algorithm can recover from.

**Related work:**
- P44 (ML data verification, draft) — pilot validation plan for the same GCS pipeline
- P511 (session resilience, shipped) — addressed `pagehide` session destruction, same mobile suspension patterns apply to recording
- P546 (transcription quality improvements) — blocked by this; quality can't improve on missing audio

## Root Cause (Confirmed — 5-Why Analysis)

**Level 1 (Observed):** 35% of audio chunks missing from GCS after a session.

**Level 2 (Why chunks disappear):** Uploads fail silently due to network timeouts (no fetch timeout set), background tab throttling (no visibility API handling), and silent catch blocks that swallow errors.

**Level 3 (Why failures are silent):** `uploadAudioChunk()` in `api.ts:2850-2858` catches all errors and never re-throws. Comment: *"Don't throw - recording failure shouldn't break the session."* The caller has no error signal.

**Level 4 (Why no retry for failed uploads):** `withRetry` (3 attempts) exists inside `uploadToGCS()`, but when all 3 attempts fail, `uploadAudioChunk()` catches the thrown error and swallows it. No second-level retry or queue exists.

**Level 5 (Why this design):** Original intent was to prevent upload failures from crashing the recording session. Safety was achieved at the cost of losing all visibility, retry capability, and data durability.

**Architectural root cause:** The recording and upload systems are decoupled with no feedback loop. Chunks are flushed on a timer and uploaded fire-and-forget, with no way to detect failure, re-queue, apply backpressure, or warn the user.

**6 specific failure modes identified:**
1. Silent error swallow — `api.ts:2850-2858`
2. Fire-and-forget upload — `use-audio-recorder.ts:105-108` (not awaited)
3. No fetch timeout — `api.ts:2759-2765` (no AbortController)
4. No visibility API — no `visibilitychange` listener anywhere in recording code
5. Unmount fire-and-forget — `use-audio-recorder.ts:281-286`
6. No upload state exposed — hook's `error` field only tracks recording errors

---

## Intention (Why This Matters)

**Strategic importance:** Audio recording is the foundation of the entire AI Insights pipeline. Transcription, speaker attribution (P556), and future session analysis all depend on complete audio. Fixing attribution algorithms or transcription quality is pointless when 35% of the source audio doesn't exist.

**Why now:** Discovered during E7QDTX analysis. Every session since the recording feature launched has likely experienced some chunk loss — we just didn't detect it until investigating transcription gaps. Every session that runs before this fix loses data permanently.

**Impact if not solved:** Transcription quality ceiling is permanently capped by chunk loss. AI Insights can never be reliable. Users who consent to recording ("Session recorded for AI Insights") receive degraded value from a feature that appears to work but silently loses their data.

---

## Business Requirements

**Must-haves:**
- Audio chunks must survive network failures, tab backgrounding, and page close — no silent data loss
- Failed uploads must be retried automatically until successful
- Users must be informed when recording quality degrades
- The system must recover gracefully from any interruption (network drop, app switch, page refresh)
- All chunks produced by MediaRecorder must eventually reach GCS, even if upload is delayed

**Success conditions:**
- Zero chunk loss across 5 consecutive real sessions (different devices, network conditions)
- Upload success rate visible to users during session
- Post-session upload completion gate ensures all chunks are uploaded before data is considered complete

**Constraints:**
- Recording must not break the live session experience (original intent preserved)
- Must work on mobile Safari, Chrome Android, and desktop browsers
- Audio-only (not video) — storage requirements are modest (~17MB for a 45-min session)
- Must work within IndexedDB storage limits (~50MB+ available on all modern browsers)
- Cannot require app installation or Service Worker (browser tab only)

---

## User Stories

**As a session participant recording audio:**
- I want my audio to be saved locally as it's recorded, so that a momentary network drop doesn't permanently lose my audio
- I want failed uploads to retry automatically, so I don't have to do anything when the network is flaky
- I want to see that my recording is healthy during the session, so I know my audio is being captured

**As a session participant on mobile:**
- I want recording to continue working when I briefly switch apps (check a text, glance at calendar), so that backgrounding doesn't create gaps
- I want the system to flush and upload my current audio chunk when I leave the tab, so the maximum possible data is preserved

**As a session participant ending a session:**
- I want to see upload progress after the session ends, so I know when it's safe to close the tab
- I want a warning if I try to close the tab before uploads complete, so I don't accidentally lose the final chunks

**As a session host reviewing transcriptions:**
- I want complete audio without gaps, so that transcription and AI Insights are based on the full conversation

---

## Jobs to Be Done

**When I'm in a /live session and my phone switches WiFi networks:**
- I want confidence my audio isn't lost, so I can focus on the conversation instead of worrying about recording (motivation: trust in the tool)

**When I briefly switch apps during a session:**
- I want recording to handle the interruption transparently, so I don't need to understand browser throttling behavior (motivation: zero cognitive overhead)

**When the session ends:**
- I want to know my audio is fully uploaded before I close the tab, so the transcription pipeline has complete data (motivation: data completeness)

**When reviewing my session's AI Insights later:**
- I want the analysis to be based on my complete conversation, so gaps don't create misleading or incomplete insights (motivation: accuracy of the product's core value)

---

## Outcomes (Success Metrics)

**Chunk loss rate:**
- From: ~35% chunk loss (E7QDTX baseline)
- To: <1% chunk loss across all sessions (target: 0%)
- Measurement: Compare chunks in GCS vs `chunk_count` in DB + client-side upload success logs

**Upload reliability:**
- 99%+ of chunks uploaded during session (real-time)
- 100% of chunks uploaded by post-session gate completion
- Measurement: Client-side upload health metric sent to Sentry/Mixpanel

**User awareness:**
- Users see recording quality during session
- Users see upload completion progress after session ends
- Measurement: No more "where's my transcription?" support requests caused by missing audio

**Recovery capability:**
- Audio survives: network drops, tab backgrounding, app switching, accidental refresh
- Audio at risk only from: browser cache clear, device power off, incognito mode (known limitation)

---

## Acceptance Criteria

### Upload persistence & retry
- [ ] Audio chunks are persisted locally (IndexedDB) before any upload attempt
- [ ] Failed uploads retry automatically with exponential backoff (up to 10 attempts per chunk, backoff capped at 30s between attempts)
- [ ] Each retry requests a fresh GCS signed URL (previous URL may have expired during backoff/outage)
- [ ] Upload queue processes chunks sequentially — no concurrent upload races
- [ ] Near-empty chunks (partial uploads <10KB) are detected and re-uploaded from IndexedDB source

### Orphaned chunk lifecycle
- [ ] On session start, system checks IndexedDB for chunks from previous sessions
- [ ] Chunks <24h old are uploaded before new recording begins
- [ ] Chunks >24h old are discarded (TTL expiration)
- [ ] Successfully uploaded chunks are cleaned from IndexedDB

### Browser lifecycle handling
- [ ] Tab visibility changes trigger immediate chunk flush and upload attempt
- [ ] `beforeunload` warns user if uploads are pending
- [ ] Chunk interval reduced from 30s to 5-10s (less data at risk per failure; exact value determined by /architect)
- [ ] Safari Private Browsing detected: fall back to in-memory queue with aggressive real-time upload (IndexedDB unavailable)

### Post-session upload gate
- [ ] After session ends, a completion screen shows upload progress and asks user to keep tab open
- [ ] If no upload progress for 5 minutes, show failure message ("Some audio could not be uploaded") and release user
- [ ] Terminal failure state logs details to Sentry for diagnostics

### User-facing indicators
- [ ] Upload health indicator visible during recording (integrated with existing "Session recorded for AI Insights" banner)
- [ ] Degraded connection warning surfaces when upload success rate drops below threshold

### Data accuracy
- [ ] DB `chunk_count` reflects actual successful uploads, not assumed count
- [ ] System works on: Chrome (desktop + Android), Safari (desktop + iOS), Firefox desktop

---

## UX Requirements

### Lean Check

No lean violations. The UI changes are minimal — extending an existing banner with state transitions and adding a completion gate to an existing post-session screen. No new pages, no setup friction, no onboarding gates.

### User Flows

#### Flow 1: During-Session Recording Health (happy path)

1. User joins /live session → RecordingIndicator banner shows `✨ Session recorded for AI Insights` (existing, unchanged)
2. Recording starts → chunks produced every 5-10s, persisted to IndexedDB, uploaded to GCS
3. All uploads succeed → banner stays blue, no change visible to user
4. Session ends → transitions to post-session upload gate (Flow 3)

#### Flow 2: During-Session Degraded Upload

1. User is in session → upload fails for a chunk
2. System retries with exponential backoff (invisible to user for first 2 retries)
3. If 3+ consecutive failures: banner transitions from blue to amber
   - Text changes: `⚠️ Weak connection — retrying audio upload`
   - Styling: `bg-yellow-50 border-yellow-200 text-yellow-800` (matches existing offline-banner pattern)
4. When uploads resume successfully: banner transitions back to blue after 3 consecutive successes
   - Hysteresis prevents banner flickering on unstable connections
5. If ALL retries exhausted for 30+ seconds: banner transitions to red
   - Text: `❌ Audio upload failing — check your connection`
   - Styling: `bg-red-50 border-red-200 text-red-700`
6. When connection recovers: banner returns to amber (retrying), then blue (healthy)

#### Flow 3: Post-Session Upload Gate

1. Session ends (either user clicks "End Session" or partner leaves)
2. System checks for pending chunks in IndexedDB/upload queue
3. **If all chunks uploaded:** Skip gate, show existing PartnerLeftScreen with added `✓ Audio upload complete` below the transcription spinner
4. **If chunks pending:**
   a. PartnerLeftScreen shows with additional upload progress section below the session-ended content:
      - Heading: `Uploading session audio...`
      - Progress: `{N} of {total} chunks uploaded` with a simple progress bar
      - Warning: `Don't close this tab until upload completes` in muted text
   b. Progress bar fills as chunks upload
   c. On completion: replace progress section with `✓ Audio upload complete`
   d. `beforeunload` dialog fires if user tries to close tab while uploads pending
5. **If upload stalls (no progress for 5 minutes):**
   - Replace progress with failure message: `Some audio could not be uploaded`
   - Subtext: `Your session was partially recorded. The transcription will use available audio.`
   - Remove `beforeunload` listener — release the user
   - Log failure details to Sentry

#### Flow 4: Tab Backgrounding (mobile)

1. User switches apps → `visibilitychange` fires with `hidden`
2. System immediately flushes current audio buffer and attempts upload
3. User returns → `visibilitychange` fires with `visible`
4. System resumes normal chunk production and upload
5. If chunks failed while backgrounded: upload queue processes them on return
6. Banner reflects current state (blue/amber/red based on queue health)
7. No user-visible indication of the background recovery — it should be transparent

#### Flow 5: Page Refresh with Orphaned Chunks

1. User accidentally refreshes during session (or opens new session next day)
2. On /live page load: system checks IndexedDB for orphaned chunks
3. **Chunks <24h old:** uploaded silently in background before new recording starts
4. **Chunks >24h old:** discarded silently (TTL expired)
5. No user-visible indication — orphan recovery is fully automatic

### Screen Designs

#### Recording Banner States (extends existing RecordingIndicator)

The existing `RecordingIndicator` component gains two additional states. All three states occupy the same position (between LiveSessionBanner header and main content area), same height (`py-1.5`), same layout (`flex items-center justify-center gap-2`).

**State: Healthy (default — no change from current)**
```
┌──────────────────────────────────────┐
│  ✨ Session recorded for AI Insights │  bg-blue-50, border-blue-200
└──────────────────────────────────────┘
```

**State: Degraded (3+ consecutive upload failures)**
```
┌──────────────────────────────────────────────┐
│  ⚠️ Weak connection — retrying audio upload  │  bg-yellow-50, border-yellow-200
└──────────────────────────────────────────────┘
```

**State: Critical (retries exhausted for 30+ seconds)**
```
┌──────────────────────────────────────────────────┐
│  ❌ Audio upload failing — check your connection  │  bg-red-50, border-red-200
└──────────────────────────────────────────────────┘
```

Transitions: healthy → degraded (3 consecutive failures) → critical (30s all retries exhausted). Recovery: critical → degraded (any retry succeeds) → healthy (3 consecutive successes).

#### Post-Session Upload Progress (extends PartnerLeftScreen)

Added below the existing session-ended content (DoorOpen icon, title, subtitle), above the transcription spinner:

```
┌─────────────────────────────────────┐
│         🚪  Session ended           │  existing PartnerLeftScreen
│    Your partner has left            │
│                                     │
│   ┌─────────────────────────────┐   │
│   │  Uploading session audio... │   │  NEW: upload progress section
│   │  ████████░░  8 of 12        │   │
│   │                             │   │
│   │  Don't close this tab       │   │  muted text
│   │  until upload completes     │   │
│   └─────────────────────────────┘   │
│                                     │
│   ⏳ Transcribing your session...   │  existing spinner
│   It will be available shortly      │
│                                     │
│       [Start New Session]           │  existing button
└─────────────────────────────────────┘
```

**On upload complete:**
```
│   │  ✓ Audio upload complete    │   │  green text, replaces progress
```

**On upload failure (5min timeout):**
```
│   │  Some audio could not be    │   │  muted text, no destructive styling
│   │  uploaded. Your session was  │   │
│   │  partially recorded.        │   │
```

### Edge Cases

**E1: Session is private (isPrivate=true)**
- No recording happens → no upload indicator needed
- RecordingIndicator already shows "Private session" in muted style → no change

**E2: Browser doesn't support IndexedDB (Safari Private Browsing)**
- Detected on recording start
- Fall back to in-memory queue with aggressive upload
- RecordingIndicator unchanged (user doesn't need to know about storage layer)
- If uploads fail in this mode, data loss is possible — same as current behavior, but with retry

**E3: User has microphone permission denied**
- No recording starts → no upload indicator needed
- Existing mic permission error flow handles this

**E4: Very short session (<30 seconds)**
- May produce only 1-3 chunks
- Post-session gate still applies but completes almost instantly
- User sees "✓ Audio upload complete" directly (no visible progress bar animation)

**E5: Very long session (>90 minutes)**
- IndexedDB accumulates ~35MB of audio chunks
- Well within storage limits
- Upload queue processes continuously, so IndexedDB mostly contains only pending chunks
- No special handling needed

**E6: Multiple tabs with same session**
- Each tab records independently (MediaRecorder is per-tab)
- IndexedDB keyed by session code + user + chunk number → no collision
- Upload deduplication handled by GCS (same object path → overwrite)

**E7: Network drops completely for 10+ minutes**
- Chunks continue to accumulate in IndexedDB
- Banner transitions: healthy → degraded → critical
- When network returns: upload queue drains, banner transitions back
- Post-session gate waits for drain to complete

**E8: User force-closes tab during upload**
- `beforeunload` fires but user can dismiss it
- Chunks remain in IndexedDB
- On next /live page load: orphaned chunks uploaded automatically (Flow 5)

### Accessibility

- Banner state changes use `aria-live="polite"` — must be ADDED to the recording branch of RecordingIndicator (currently only on the private branch). Screen readers announce text changes without interrupting
- Progress bar uses `role="progressbar"` with `aria-valuenow`, `aria-valuemin="0"`, `aria-valuemax="{total}"`
- Upload complete/failure announcements use `aria-live="assertive"` (important state change)
- All text meets WCAG AA contrast: yellow-800 on yellow-50 (7.5:1), red-700 on red-50 (6.8:1), blue-700 on blue-50 (7.2:1)
- No information conveyed by color alone — text content changes with each state (not just color)
- Keyboard: no interactive elements in the banner or progress section (purely informational)

### Responsive Design

**All breakpoints (320px+):**
- Banner and progress section are full-width, centered text — already responsive
- No layout changes needed between mobile/tablet/desktop
- Progress bar scales with container width
- Text wraps naturally at narrow widths

**Mobile-specific:**
- Touch targets not applicable (no interactive elements in new UI)
- `beforeunload` dialog is browser-native — works on all platforms
- On iOS Safari: `beforeunload` is unreliable → IndexedDB persistence is the safety net

### Component Analysis

| Element | Classification | File / Notes | Decision needed? |
|---------|---------------|--------------|-----------------|
| RecordingIndicator (healthy state) | **Reuse** | `live-mode-view.tsx:63-78` — existing, unchanged | No |
| RecordingIndicator (degraded/critical states) | **Extend** | `live-mode-view.tsx:63-78` — add `uploadHealth` prop, new conditional renders for amber/red states | No |
| PartnerLeftScreen (session ended) | **Extend** | `live-mode-view.tsx:106-174` — add upload progress section between existing content and transcription spinner | No |
| Upload progress bar | **New** | Simple div-based progress bar. No existing progress bar component in the design system. `bg-blue-500` fill in `bg-muted` track, `rounded-full`, `h-2`. | No — too simple for design system, keep inline |
| Upload status text | **Reuse** | Pattern: `text-sm text-muted-foreground` — same as existing transcription spinner text | No |
| beforeunload listener | **New** | Browser API, no component needed | No |
| Sonner toasts | **Reuse** | Already installed, `bottom-center` position — NOT used for upload status (banner is better for persistent state) | No |

---

## UI Contract

| Element | Value | Context |
|---------|-------|---------|
| Healthy recording banner | `✨ Session recorded for AI Insights` | Existing banner, no change when healthy |
| Degraded recording banner | `⚠️ Weak connection — retrying audio upload` | Same position, `bg-yellow-50 border-yellow-200 text-yellow-800` |
| Critical recording banner | `❌ Audio upload failing — check your connection` | Same position, `bg-red-50 border-red-200 text-red-700` |
| Post-session upload heading | `Uploading session audio...` | Added to PartnerLeftScreen when chunks pending |
| Post-session progress | `{N} of {total} chunks uploaded` | Next to progress bar |
| Post-session complete | `✓ Audio upload complete` | Green text, replaces progress section |
| Post-session failure | `Some audio could not be uploaded` | After 5min timeout, muted text |
| Post-session failure subtext | `Your session was partially recorded. The transcription will use available audio.` | Below failure message |
| Post-session warning | `Don't close this tab until upload completes` | Muted text below progress |
| beforeunload dialog | Browser default (not customizable) | When user attempts to close with pending uploads |
| Banner transition: healthy→degraded | After 3 consecutive upload failures | Prevents flicker on single transient failure |
| Banner transition: degraded→critical | After 30s of all retries exhausted | Escalation to user action needed |
| Banner transition: critical→degraded | When any retry succeeds | De-escalation |
| Banner transition: degraded→healthy | After 3 consecutive upload successes | Hysteresis prevents flicker |

---

## Next Steps

1. `/architect` — design IndexedDB schema, upload queue, retry state machine, visibility handling
2. `/generate-tests` — test automation for upload reliability scenarios
3. `/spec-review` — validate spec completeness before implementation
4. `/dev` — implement in worktree
5. `/verify` — live browser UAT on multiple devices

---

## Technical

### Technical Analysis

**Current recording pipeline:**

1. **`useAudioRecorder` hook** (`src/hooks/use-audio-recorder.ts`) — wraps MediaRecorder API. `start(1000)` produces 1-second data blobs internally, accumulated in `audioChunksRef`. Every 30s (`chunkIntervalMs`), `flushAndUploadChunk()` combines accumulated blobs into a single chunk blob and fires `onChunkReady()`. The call is **fire-and-forget**: `.catch(console.error)` — no retry, no queue, no state feedback.

2. **`handleChunkReady` callback** (`src/app/pages/clarity-live-page.tsx:341-372`) — receives chunk blob, calls `uploadAudioChunk()` and `uploadEventsSnapshot()`. Sequentially awaits both, but the caller (`flushAndUploadChunk`) doesn't await the result.

3. **`uploadAudioChunk` function** (`src/app/data/api.ts:2800-2858`) — requests a signed URL via `getSignedUploadUrl()`, then uploads to GCS via `uploadToGCS()`. Both calls use `withRetry` (3 attempts, exponential backoff 1s/2s/4s). **Critical bug**: the outer `catch` block (line 2850-2858) swallows all errors — logs to Sentry but never re-throws. This is the root cause: all retry exhaustion is silently swallowed.

4. **`uploadToGCS` function** (`src/app/data/api.ts:2759-2781`) — raw `fetch` PUT to signed URL. **No `AbortController`** — no timeout, hangs indefinitely on slow/dead networks.

5. **DB tracking** (`ml_training_sessions` table) — `chunk_count` is set from the last chunk's number (`chunkNumber + 1`), not from actual successful uploads. Writes only on `isLastChunk`.

6. **Unmount cleanup** (`use-audio-recorder.ts:273-293`) — best-effort final chunk upload with `.catch(() => {})`. No persistence.

**No existing infrastructure for:** IndexedDB storage, upload queues, visibility API handling, `beforeunload` on live page, upload health state exposed to UI.

**Existing patterns to leverage:**
- `withRetry` in `api.ts` — exponential backoff with jitter, Retry-After support. Reusable for the upload queue's retry logic.
- `useOnlineStatus` hook (`src/hooks/useOnlineStatus.ts`) — tracks `navigator.onLine`. Can gate upload queue processing.
- `RecordingIndicator` component (`live-mode-view.tsx:63-78`) — currently stateless, takes only `isPrivate` prop. Needs `uploadHealth` prop for degraded/critical states.
- `PartnerLeftScreen` component (`live-mode-view.tsx:106-174`) — self-contained, takes `partnerName`, `sessionEnded`, `onStartNew`, `isGuest`. Needs upload progress props.
- Sentry integration — already used for chunk upload failures, can enrich with queue state.

**Dependencies:**
- No new npm packages required. IndexedDB is a browser API. `idb` (lightweight IndexedDB wrapper) would simplify the API but adds a dependency — raw IndexedDB is sufficient for this use case (simple key-value store for blobs).
- No backend changes — GCS signed URL Cloud Function and `ml_training_sessions` table schema remain unchanged (DB record logic moves from last-chunk-only to per-successful-upload counting).

---

### Architecture Decisions

**Decision 1: IndexedDB as write-ahead log (WAL)**

- **Chosen:** Persist every chunk to IndexedDB immediately after MediaRecorder produces it, before any upload attempt. Upload reads from IndexedDB. Delete from IndexedDB only after confirmed GCS upload.
- **Rationale:** Decouples chunk production (real-time, cannot fail) from chunk upload (network-dependent, can fail). Chunks survive tab close, network drops, and app switches. IndexedDB has >50MB storage on all modern browsers — a 90-minute session at 128kbps produces ~86MB total, but the WAL only holds *pending* chunks (uploaded chunks are deleted), so typical storage is 1-5 chunks (~1-5MB).
- **Trade-off:** Adds I/O latency (~1-5ms per write on modern devices) to the recording hot path. Acceptable — MediaRecorder's `ondataavailable` fires on a timer, not in a real-time audio processing thread.
- **Alternative rejected:** Service Worker with Background Sync — spec explicitly prohibits Service Worker requirement. Also, Background Sync is not supported on Safari.

**Decision 2: Chunk interval of 5 seconds**

- **Chosen:** Reduce `chunkIntervalMs` from 30,000ms to 5,000ms.
- **Rationale:** At 128kbps, a 5-second chunk is ~80KB — trivial to upload, fast to retry. Maximum data at risk per failure is 5 seconds of audio. At 30s, losing one chunk means a 30-second gap in transcription.
- **Trade-off:** More chunks per session (540 for a 45-min session vs. 90). More GCS objects, more signed URL requests. GCS has no per-object cost concern (standard storage); signed URL requests add ~5ms each. Upload queue processes sequentially, so throughput is not an issue.
- **Alternative rejected:** 10 seconds — still acceptable but 5s halves the risk window with negligible overhead. The MediaRecorder already produces 1-second internal blobs, so the flush interval is just "how many 1s blobs to combine."

**Decision 3: Sequential upload queue with state machine**

- **Chosen:** A dedicated `ChunkUploadQueue` class (new file: `src/lib/chunk-upload-queue.ts`) that manages the upload pipeline as a state machine: `idle → uploading → retrying → failed`. Processes one chunk at a time. Emits health state changes for UI consumption.
- **Rationale:** Sequential processing avoids concurrent upload races (the spec requires this). State machine makes health transitions deterministic: healthy (0 consecutive failures), degraded (3+), critical (30s of all-retries-exhausted). The queue owns retry logic, signed URL refresh, and IndexedDB cleanup.
- **Trade-off:** Sequential upload means a slow chunk blocks subsequent ones. Acceptable: at 5s intervals and ~80KB per chunk, even a 3G connection (300KB/s) uploads a chunk in <1s. The queue drains faster than it fills.
- **Alternative rejected:** Parallel uploads with concurrency limit — adds complexity (ordering, race conditions) without meaningful benefit for 80KB chunks.

**Decision 4: Fresh signed URL per retry attempt**

- **Chosen:** Request a new signed URL from `getSignedUploadUrl()` on every retry, not just on initial attempt.
- **Rationale:** GCS signed URLs expire (typically 15 minutes). During extended outages or backoff periods, the original URL may expire. Requesting fresh URLs ensures every attempt has a valid upload target.
- **Trade-off:** Extra Cloud Function invocation per retry (~5ms latency + minor cost). Negligible vs. the alternative of uploading to an expired URL and wasting the entire attempt.
- **Alternative rejected:** Cache signed URLs with TTL checks — adds complexity. Fresh URL per attempt is simpler and always correct.

**Decision 5: Safari Private Browsing fallback to in-memory queue**

- **Chosen:** Detect IndexedDB unavailability on recording start. If unavailable, fall back to an in-memory array (same `ChunkUploadQueue` interface, different storage backend). No user-visible indication — the queue still retries, just without persistence across tab close.
- **Rationale:** Safari Private Browsing throws on `indexedDB.open()`. The fallback preserves all retry and health indicator behavior — the only loss is persistence across tab close (which is expected in private browsing).
- **Trade-off:** In-memory queue means tab close = data loss for pending chunks. This matches current behavior but with retry (an improvement).
- **Alternative rejected:** Warn user about reduced durability — spec says "RecordingIndicator unchanged (user doesn't need to know about storage layer)."

**Decision 6: Orphaned chunk handling on session start**

- **Chosen:** On `/live` page load, before starting a new recording, check IndexedDB for chunks from previous sessions. Upload chunks <24h old, delete chunks >24h old. Process silently in background.
- **Rationale:** Handles the case where a user force-closed the tab during upload or refreshed accidentally. 24h TTL prevents stale data accumulation while giving enough window for next-day recovery.
- **Trade-off:** Adds a brief startup delay (~50-200ms for IndexedDB scan). Negligible. Orphan uploads may fail (session GCS bucket may be archived) — failures are silently discarded.
- **Alternative rejected:** No orphan handling (let IndexedDB accumulate forever) — would leak storage and never recover data that could still be useful.

**Decision 7: Upload health state as a separate concern from recording state**

- **Chosen:** `useAudioRecorder` hook continues to own recording lifecycle (start/stop/error). A new `useUploadHealth` hook (or inline state in `clarity-live-page.tsx`) consumes events from `ChunkUploadQueue` and provides `uploadHealth: 'healthy' | 'degraded' | 'critical'` plus `pendingChunks` / `totalChunks` counts. This state is passed down to `RecordingIndicator` and `PartnerLeftScreen` as props.
- **Rationale:** Separation of concerns — recording errors (mic denied, MediaRecorder failure) are distinct from upload errors (network, GCS). The UI needs both but displays them differently.
- **Trade-off:** Two sources of error state to manage in the page component. Acceptable — they're orthogonal and never conflict.
- **Alternative rejected:** Merge upload health into `useAudioRecorder` return — violates single responsibility. The recorder shouldn't know about upload infrastructure.

**Decision 8: `beforeunload` and `visibilitychange` ownership**

- **Chosen:** `ChunkUploadQueue` registers `beforeunload` (warns user if pending uploads) and `visibilitychange` (triggers immediate flush) internally. The queue owns these lifecycle events because it's the component that knows whether uploads are pending.
- **Rationale:** Centralizes browser lifecycle handling in the queue rather than scattering it across hooks. `beforeunload` is registered/deregistered based on queue state (only active when chunks are pending). `visibilitychange` → `hidden` triggers `mediaRecorder.requestData()` (forces immediate `ondataavailable`) via a callback from the recorder hook.
- **Trade-off:** The queue needs a "flush now" callback from the recorder — a mild coupling. Acceptable: it's a single callback, not a deep dependency.
- **Alternative rejected:** Handle `visibilitychange` in `useAudioRecorder` — the recorder doesn't know about upload state, so it can't make informed decisions about flush urgency.

**Decision 9: Post-session gate timeout**

- **Chosen:** 5-minute timeout with no-progress detection. "No progress" = no chunk successfully uploaded in the last 5 minutes. On timeout: show failure message, remove `beforeunload`, log to Sentry, release user.
- **Rationale:** 5 minutes is generous enough for network recovery but doesn't trap users. The timeout is on *progress*, not wall-clock — if uploads are slowly succeeding, the gate stays open.
- **Trade-off:** Users on extremely slow connections may hit the timeout even though chunks are slowly uploading. Acceptable: the failure message says "partially recorded" (honest) and the gate releases them (respectful).
- **Alternative rejected:** Infinite wait — traps users, hostile UX. 2-minute timeout — too aggressive for mobile networks recovering from outage.

**Decision 10: No raw `idb` library — use native IndexedDB API**

- **Chosen:** Use the native `IndexedDB` API directly with a thin wrapper (~50 lines) in `src/lib/chunk-store.ts`.
- **Rationale:** The operations are simple: `put(key, blob)`, `get(key)`, `delete(key)`, `getAllKeys()`. The `idb` npm package adds a dependency for minimal syntactic sugar. The wrapper isolates IndexedDB specifics and provides the fallback detection for Safari Private Browsing.
- **Trade-off:** Slightly more verbose code than `idb`. Worth it to avoid a new dependency.
- **Alternative rejected:** `idb` package — well-maintained but unnecessary for this scope. `localforage` — too heavy, includes driver fallbacks we don't need.

---

### Security Review

**RLS Policies:**
- ⚠️ **`ml_training_sessions` table RLS status unverified.** No RLS migration found in `supabase/migrations/`. If RLS is disabled, client-side inserts via anon key are unprotected. **Action:** Verify RLS status during implementation; add policies if missing.
- ✅ No new database tables proposed. IndexedDB is client-only. No new Supabase migrations needed beyond what exists.

**Authentication:**
- ⚠️ **GCS signed URL Cloud Function has NO authentication** (pre-existing). The `gcs-signed-url` function accepts any POST request — no auth token, no API key, CORS `*`. P566 amplifies exposure via retry and orphaned chunk recovery (more calls to this endpoint). **Action:** Document as known risk. Auth hardening is a separate spec — out of scope for P566 but should be tracked.
- ✅ Recording gated behind session participation and consent flow (P37). `isPrivate` check prevents recording for private sessions.

**Authorization:**
- ⚠️ **Cross-session chunk upload possible** (pre-existing). `uploadAudioChunk()` takes `sessionCode` and `userName` from client — no server-side verification of session membership. A malicious client could overwrite another user's chunks. P566's IndexedDB replay amplifies this slightly. **Action:** Document as pre-existing risk, not P566 scope.
- ✅ Orphaned chunk mechanism (IndexedDB keyed by session code + user + chunk number) correctly scopes data per-user per-session on client side.

**Input Validation:**
- ✅ Path traversal protection exists in Cloud Function (strips non-alphanumeric from sessionCode/fileName).
- ✅ Username sanitization exists in `uploadAudioChunk()` (lowercase, non-alpha → hyphens).
- ⚠️ **No content-type allowlist on Cloud Function** (pre-existing). `contentType` parameter passed directly to GCS. **Action:** Out of scope for P566; track separately.
- ✅ P566 adds `AbortController` timeout to upload fetch calls (addresses failure mode 3).

**Data Protection:**
- ⚠️ **Audio data in IndexedDB is unencrypted PII.** Raw audio blobs accessible to any JS on same origin, visible in DevTools. Mitigated by: 24h TTL, cleanup-after-upload, chunks keyed to specific session. **Action:** Document as known limitation. Encryption would add significant complexity for modest threat reduction (shared devices). TTL cleanup must be robust against partial failures.
- ✅ 24h TTL on orphaned chunks is reasonable data minimization.
- ✅ GCS signed URLs expire after 15 minutes. Fresh URL per retry (AC line 158) prevents expired URL use.
- ✅ Chrome incognito supports IndexedDB but data auto-purges on tab close — not a persistence risk.

**Pre-existing risks documented (not P566 scope, track separately):**
1. GCS Cloud Function lacks authentication — any internet user can request write URLs
2. No server-side session membership verification for chunk uploads
3. No content-type allowlist on signed URL generation

---

### Implementation Approach

**Worktree recommended:** This feature touches 7+ files across hooks, lib, components, and the main page — concurrent work on main should not be blocked.

#### Files to Create

1. **`src/lib/chunk-store.ts`** — IndexedDB wrapper for audio chunk persistence
   - `openChunkStore()` — opens/creates the `audio-chunks` database
   - `saveChunk(key: string, blob: Blob, metadata: ChunkMetadata)` — persist chunk
   - `getChunk(key: string)` — retrieve chunk blob
   - `deleteChunk(key: string)` — remove after successful upload
   - `getAllChunkKeys()` — list all stored chunks (for orphan scan)
   - `isIndexedDBAvailable()` — detect Safari Private Browsing
   - `InMemoryChunkStore` — fallback implementation with same interface
   - Key format: `{sessionCode}_{userName}_{chunkNumber}` (matches GCS path)
   - Metadata: `{ sessionCode, userName, chunkNumber, createdAt, blobSize, mimeType }`

2. **`src/lib/chunk-upload-queue.ts`** — Upload queue with retry state machine
   - `ChunkUploadQueue` class
   - State machine: `idle | uploading | retrying | stalled`
   - `enqueue(chunkKey: string)` — add chunk to upload queue
   - `processQueue()` — sequential processing loop
   - Retry: exponential backoff (1s, 2s, 4s, 8s, 16s, 30s cap), fresh signed URL per attempt, max 10 attempts per chunk before moving to next
   - Health state: emits `'healthy' | 'degraded' | 'critical'` based on consecutive failure count
   - Health transitions: healthy→degraded (3 consecutive failures), degraded→critical (30s all retries exhausted), critical→degraded (any success), degraded→healthy (3 consecutive successes)
   - `onHealthChange` callback for UI updates
   - `onProgress` callback: `{ uploaded: number, total: number }`
   - `getPendingCount()` / `getTotalCount()` — for post-session gate
   - `drain()` — returns Promise that resolves when queue is empty (for post-session gate)
   - Registers `beforeunload` when queue non-empty, removes when empty
   - `uploadOrphanedChunks(maxAgeMs: number)` — scan IndexedDB, upload old chunks, delete expired
   - `destroy()` — cleanup listeners

3. **`src/hooks/use-upload-health.ts`** — React hook bridging queue state to UI
   - Wraps `ChunkUploadQueue` events into React state
   - Returns `{ uploadHealth, pendingChunks, totalChunks, isUploadComplete, isUploadStalled }`
   - Manages 5-minute stall timeout for post-session gate
   - Provides `flushNow` callback (for `visibilitychange` → `mediaRecorder.requestData()`)

#### Files to Modify

4. **`src/hooks/use-audio-recorder.ts`** — Integrate with chunk store + queue
   - Replace fire-and-forget `onChunkReady().catch()` with: persist to IndexedDB → enqueue in upload queue
   - Change `chunkIntervalMs` default from 30000 to 5000
   - Add `onVisibilityHidden` callback prop — caller provides `mediaRecorder.requestData()` trigger
   - Expose `requestImmediateFlush()` for visibility change handling
   - Remove unmount best-effort upload (queue handles persistence)

5. **`src/app/data/api.ts`** — Fix upload function
   - `uploadAudioChunk()`: **remove the outer try/catch that swallows errors** — let failures propagate to the queue's retry logic
   - `uploadToGCS()`: add `AbortController` with 30-second timeout
   - `getSignedUploadUrl()`: add `AbortController` with 10-second timeout
   - Extract `uploadSingleChunk(sessionCode, userName, chunkBlob, chunkNumber)` — used by queue (no `isLastChunk` logic, no DB write). Queue calls this.
   - Keep `isLastChunk` DB tracking in a separate function called by queue on drain complete
   - Fix `duration_ms` calculation: current code hardcodes `totalChunks * 30000`. Replace with actual elapsed recording time (`Date.now() - recordingStartTime`) passed from the recorder hook

6. **`src/app/pages/clarity-live-page.tsx`** — Wire up new infrastructure
   - Replace `handleChunkReady` with chunk-store + queue integration
   - Keep `uploadEventsSnapshot()` as a separate fire-and-forget call alongside each chunk enqueue (events are small JSON, not audio — they don't need the WAL/queue infrastructure. Existing retry in `withRetry` is sufficient for events.)
   - Instantiate `ChunkUploadQueue` on recording start, destroy on unmount
   - Use `useUploadHealth` hook for state
   - Pass `uploadHealth` to `LiveModeView` → `LiveHeader` → `RecordingIndicator`
   - Pass upload progress props DIRECTLY to `PartnerLeftScreen` (it's rendered by `clarity-live-page.tsx` in an early return, NOT inside `LiveModeView`)
   - Add `visibilitychange` listener that calls `requestImmediateFlush()` on `hidden`
   - Call `uploadOrphanedChunks(24 * 60 * 60 * 1000)` on mount (before recording starts)
   - Update `stopAndUploadRecording` to await queue drain (with 5-min timeout)
   - Update DB `chunk_count` tracking: count actual successful uploads from queue, not assumed from chunk number

7. **`src/app/components/partners/live-mode-view.tsx`** — UI state extensions
   - `RecordingIndicator`: add `uploadHealth` prop (`'healthy' | 'degraded' | 'critical'`)
   - Render degraded state: `bg-yellow-50 border-yellow-200`, text `⚠️ Weak connection — retrying audio upload`
   - Render critical state: `bg-red-50 border-red-200`, text `❌ Audio upload failing — check your connection`
   - `PartnerLeftScreen`: add `uploadProgress` prop `{ pending: number, total: number, status: 'uploading' | 'complete' | 'failed' } | null`
   - When `uploadProgress` is present and `status === 'uploading'`: show progress bar + `{N} of {total} chunks uploaded` + warning text
   - When `status === 'complete'`: show `✓ Audio upload complete` in green
   - When `status === 'failed'`: show failure message + subtext per UI Contract
   - Progress bar: `<div>` with `bg-blue-500` fill, `bg-muted` track, `rounded-full h-2`
   - Add `aria-live`, `role="progressbar"`, `aria-valuenow`/`aria-valuemax` per accessibility spec

#### Build Sequence

1. **`chunk-store.ts`** — IndexedDB wrapper (no dependencies on existing code). Testable in isolation.
2. **`chunk-upload-queue.ts`** — Upload queue (depends on chunk-store). Testable with mock store + mock upload function.
3. **`api.ts` modifications** — Fix error swallowing, add timeouts, extract `uploadSingleChunk`. Can be tested by existing code paths (backward compatible).
4. **`use-audio-recorder.ts` modifications** — Integrate chunk store writes. Reduce interval. Add flush callback.
5. **`use-upload-health.ts`** — React hook bridging queue to UI state.
6. **`live-mode-view.tsx` modifications** — UI changes to `RecordingIndicator` and `PartnerLeftScreen`. Pure presentational — can be developed with static props.
7. **`clarity-live-page.tsx` modifications** — Final wiring. This is the integration step — connects all pieces. Test with full flow.

---

## Test Coverage Strategy

**Test pyramid:**
```
       /\
      /  \    5 E2E tests (banner states, post-session gate)
     /____\
    / 8 A11Y \   8 accessibility tests
   /__________\
  / 3 SMOKE    \
 /______________\
/ 33 UNIT       \  (13 ChunkStore + 20 ChunkUploadQueue)
```

**What's tested (and WHY):**
- ✅ ChunkStore CRUD + TTL (unit) — Core persistence logic, must be bulletproof
- ✅ ChunkStore in-memory fallback (unit) — Safari Private Browsing path
- ✅ ChunkUploadQueue state machine (unit) — Health transitions are the core business logic
- ✅ ChunkUploadQueue retry with fresh URLs (unit) — Critical fix for the root cause
- ✅ ChunkUploadQueue sequential processing (unit) — AC requirement, prevents races
- ✅ ChunkUploadQueue orphaned chunks (unit) — <24h upload, >24h discard
- ✅ ChunkUploadQueue 5-min stall timeout (unit) — Post-session gate terminal state
- ✅ Banner state transitions (E2E) — User-visible degraded/critical indicators
- ✅ Post-session gate (E2E) — Upload progress, completion, failure UI
- ✅ aria-live, role="progressbar" (a11y) — Screen reader support
- ✅ Smoke: page loads without errors

**What's NOT tested (and WHY):**
- ❌ Real IndexedDB operations — Unit tests mock IndexedDB; real browser testing via E2E/UAT
- ❌ Real GCS uploads — No test GCS bucket; verified via UAT on real sessions
- ❌ Mobile tab backgrounding — Cannot simulate OS-level tab suspension in Playwright; UAT-only
- ❌ beforeunload dialog — Browser-native, not testable in Playwright; UAT-only
- ❌ Cross-browser differences (Safari/Firefox) — Playwright runs Chromium; UAT covers others

**Files generated:**
- `src/tests/chunkStore.test.ts` — 13 unit tests
- `src/tests/chunkUploadQueue.test.ts` — 20 unit tests
- `e2e/p566-upload-reliability.spec.ts` — 5 E2E tests
- `e2e/a11y/p566-accessibility.spec.ts` — 8 accessibility tests
- `e2e/p566-smoke.spec.ts` — 3 smoke tests
- `features/uat/p566.md` — 12 UAT scenarios

**Total:** 49 automated tests + 12 UAT scenarios
