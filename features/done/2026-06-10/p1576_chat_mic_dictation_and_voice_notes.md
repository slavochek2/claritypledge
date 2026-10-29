---
status: all-done
type: story
rank: 77
workstream: clarity-chat
created_date: '2026-10-26'
tags: [chat, voice, transcription, mirror]
disclosure: public
pipeline_ran: [create-spec, dev, ship]
drafted_by: opus
exec_model: opus
exec_effort: high
driver: heuristic
completed_at: 2026-10-29
---

# P1576: Mic in every chat composer — dictation everywhere, voice notes between people

## Problem

**Situation:** The chat composer (`src/app/pages/chat/Composer.tsx`, used by `ConversationPane` and
`ThreadPanel`) has text and 📎 only. Gemini 3.5 Transcribe is already wired, but only inside
`transcribe-slice`, which is bound to a transcribe room: it resolves room membership and consent,
takes 5 s WAV slices, and inserts a room row. It cannot return text for a one-off clip.
**Complication:** Typing long, nuanced messages is the main friction in a product about being
understood. The founder talks to Claude and Gemini by voice every day and expects the same here.
**Question:** How do people speak a message in any chat, and when does the voice itself get sent?

> Founder framing, verbatim: "I like to add a mic button everywhere in every chat, including Mirror
> Agent. And it's supposed to talk, talk, talk, talk, talk."

Prior ruling: the clarity-chat loop already set "voice is just the composer mic in chat"
(decisions.md, clarity-chat loop entry, alternatives rejected). This spec builds that mic.

## Appetite

Blast radius: medium. Dictation affects one component on every chat surface. Voice notes add a
message type and stored audio. Reversibility: dictation is a git revert; voice notes need a
migration and a storage bucket (rollback = drop the type, keep the rows readable). Decision density:
a few founder calls, listed under Open Questions.

## Scope — "everywhere, in every chat"

The founder's "everywhere" covers these surfaces:

| Surface | Dictation | Voice note |
|---|---|---|
| Human 1:1 and group chats (`ConversationPane` → `Composer`) | yes | yes |
| Thread replies (`ThreadPanel` → `Composer`) | yes | yes |
| Mirror agent chat (`kind === 'mirror'`, renders through `ConversationPane` → `Composer`; verified in review) | yes | **yes** (founder, 2026-10-27): the agent answers the transcript, only once it is done |
| Private @mirror ask inside a human chat (`Composer` `privateTo` set, P1520) | yes | **no** — treated as Mirror |
| Mirror landing-lab screen (`tree/landing-lab/first/MirrorScreen.tsx`, route is DEV-only today) | [FOUNDER DECISION: scope — include now, or when that landing goes live?] | no |
| Editing a sent message (`MessageRow` textarea) | [FOUNDER DECISION: scope] | no |

## Solution

### A. Dictation (every surface above)

- A small mic icon **inside** the input field.
- Tapping it starts recording. The field shows "Listening…", a live waveform from the mic level
  replaces the icon, and ✕ (cancel) and ✓ (done) appear. This is the Claude.ai pattern from the
  founder's screenshot.
- On ✓: a spinner on ✓, the clip goes to a **new** edge function that returns text only (no room,
  no row), and the text is inserted at the cursor. The user edits it, then sends as normal.
- **Batch only, one engine.** No live browser preview that Gemini later replaces (rejected below).
  Gemini detects the language itself, so mixed Russian and English works.
- **Reuse existing capture code.** Don't build a third recorder: `src/hooks/use-audio-recorder.ts`
  (MediaRecorder format pick) and `encodeWav` in `src/lib/audio/slice-recorder.ts` (16 kHz mono,
  unit-tested; also fixes the iOS mp4 question by sending WAV).
- **Failure keeps the clip.** If transcription fails (network, 429, 5xx, timeout), the recording
  stays in memory with "Couldn't transcribe — Retry / Discard". ✓ is disabled while in flight, so a
  double tap does nothing. The clip is never lost silently.
- **Recording is bound to the chat it started in.** Switching chat (`draftKey` changes), hiding the
  tab or an incoming phone call stops and discards the recording. A transcript that resolves after
  a chat switch goes into the **originating** chat's draft, never the visible one.
- **Abuse limits are mechanisms with tests:** the new function rejects clips over the max length
  (server-side, by decoded duration) and limits requests per user per minute. Logged-in users only.
- **First task in `/dev`:** measure the clip-to-text wait. Target: under 3 s for a 60 s clip. If it
  misses, the fallback is streaming Gemini, not a browser engine.

### B. Voice notes (human chats and threads only)

- When nothing is sendable, the send slot shows a round mic button. The condition is
  `!sendable` from `Composer.tsx:91` (no text, **no staged attachment, no sendable quote**), never
  "input text is empty". It is also hidden whenever `privateTo` is set. Mic and Send never show
  together (P955).
- **Storage and playback — architectural decision, blocks `/dev`.** Prod CSP is
  `media-src 'self' https://storage.googleapis.com` (`vercel.json`). That blocks Supabase Storage
  URLs and `blob:` playback, and decisions.md 2026-09 (P1336) rejected widening it to
  `*.supabase.co`. The public-media GCS bucket is wrong for private DMs.
  **Decided (founder, 2026-10-26):** a private GCS bucket, with short-lived signed URLs minted by
  an edge function that checks chat membership. It fits the existing CSP host with no policy change. A unit test asserts the chosen audio URL shape passes the CSP, as P1336 did.
- **Schema.** `chat_messages` (`20261019203000_p1512_clarity_chat.sql`) can't hold audio today:
  `attachment_kind IN ('point','story')`, and `has_content` requires body/attachment/forward. The
  migration adds an audio reference, duration and a separate `transcript` column (not `body`, which
  dictation uses and which is capped at 4000 chars). It extends `chat_messages_deleted_is_empty`, and
  makes delete and `erase_chat_data_for()` remove the stored audio object too.
- **Transcript owner.** After the row is committed, the server transcribes it (one call, retry
  bounded per metered rule 4). The client never does, so closing the tab can't strand it. The bubble
  shows "Transcribing…", then the transcript, or "Transcript unavailable" after the retries fail. The
  audio stays playable either way.
- Tapping it turns the composer bar into a recorder: red dot, timer, 🗑 cancel, ➤ send. ➤ sends the
  audio immediately.
- The message shows as an audio bubble with play/pause and duration. The transcript is produced
  after sending and sits under the bubble behind "Show transcript".
- **Mirror chat (founder, 2026-10-27): voice notes allowed.** The agent reads the server transcript, never
  audio. It must not answer before the transcript is done: `mirror_request_reply` creates no job while the
  transcript is `pending` (state `transcribing`) and refuses with `transcript_failed` when it failed (the
  client tells the user it could not hear the message). `_mirror_begin_job` re-checks as a backstop.
  **The server starts the reply (founder, option A, 2026-10-28):** a trigger on `chat_messages` fires when a
  voice note's transcript turns `done` (non-blank, owner's own mirror), inserts the one `reply` job and calls
  `mirror-reply` through pg_net with an internal secret. The browser never asks automatically for a voice
  note; Try again (user path) remains. Private @mirror asks still take text only.
- **Bubble (founder, 2026-10-27): WhatsApp/Telegram style.** About 50 waveform bars, computed once at
  commit from the WAV and stored in `chat_messages.audio_waveform` (numbers only, never the path), drawn as
  the progress indicator: filled as it plays, tap or drag to seek; duration under it; compact. "Show
  transcript" stays.

```
Empty input, human chat
┌──────────────────────────────────────┐
│ 📎  Message…                     🎙   │  (●🎤)  ← send slot = voice note
└──────────────────────────────────────┘
                              ↑ in-field mic = dictate
Text present → send slot becomes (➤). Mirror chat → send slot is only ever Send.
```

[FOUNDER DECISION: icons, labels ("Listening…", "Show transcript"), colours.]

## Alternatives Considered

- **Browser speech preview, then Gemini replaces it on ✓.** Rejected: already-read text changing
  feels like a bug. No mainstream product mixes the two engines. Browser speech also needs one fixed
  language (P1295 already found it unfit for room transcription).
- **Browser speech only.** Rejected: weaker quality, no mixed-language support, absent in Firefox.
- **Voice notes in Mirror too.** First rejected (the agent would answer unchecked transcript); reversed by
  the founder on 2026-10-27: the agent answers the transcript, gated on it being done.
- **Two specs (dictation now, voice notes later).** Rejected by the founder: it doubles spec review,
  `/finish` and UAT overhead.
- **Reuse `transcribe-slice`.** Rejected: room membership and consent, 5 s slices and a row insert
  are wrong for a one-off clip. A sibling function shares the Gemini call.
- **Gemini Live-style spoken conversation with the agent** (the second button in the Gemini app):
  a separate feature, out of scope.

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| Wait after ✓ feels slow | MITIGATE | Measured first, 3 s target, streaming fallback |
| iOS Safari records mp4/aac, Chrome webm/opus | MITIGATE | `/dev` verifies Gemini accepts both, or converts to WAV client-side as `transcribe-slice` does |
| Abuse of the transcription endpoint runs up cost | MITIGATE | Authenticated users only, per-clip length cap, per-user rate limit, on a budget-capped key |
| Which Gemini key: the batch key `transcribe-slice` uses is meant for background work; dictation is interactive | MITIGATE | Decided: its own budget-capped key under a distinct secret name (issued via `/slava:util:ai-keys`); never `GEMINI_API_KEY` (see `transcribe-slice/index.ts` header) |
| Stored voice is personal data | MITIGATE | Privacy and ToS line plus retention, per the founder decisions below |
| Audio blocked by prod CSP `media-src` (7 prior prod-only CSP blocks) | MITIGATE | Storage architecture decision in Solution B, plus a unit test that parses `vercel.json` |
| Mic permission denied | MITIGATE | Inline message, input stays usable |
| Transcript wrong under a voice note | ACCEPT | The audio is right there to replay |

**Non-Goals**
- Do NOT add browser `SpeechRecognition` to this flow.
- Do NOT change `transcribe-slice` or room transcription.
- Do NOT add voice output, text-to-speech, or a spoken conversation mode.
- Do NOT redesign the composer beyond the mic, the recorder state and the send-slot swap.

## Invariants

- The server, not the browser, starts the Mirror's reply to a voice note, once and only when its transcript
  is `done` (migration `20261027120700`; the trigger never fails the transcript write). The client never
  asks automatically for a voice note's reply.
- The Mirror agent only ever receives text: what the user typed, or the server transcript of their own
  voice note once `transcript_status = 'done'`. It never answers a voice note whose transcript is pending
  or failed, and never receives audio.
- Exactly one primary action in the send slot at any time (P955).
- Dictation audio is never stored: transcribed, then discarded.

## Acceptance Criteria

- [x] In every surface marked "yes" for dictation, tapping the mic, speaking and pressing ✓ puts the
      spoken words into the input, editable, without sending.
- [x] ✕ during recording discards the clip and leaves the existing draft untouched.
- [x] A 60 s mixed Russian/English clip comes back as text; wait measured and recorded (target < 3 s).
- [x] Works on desktop Chrome, iOS Safari and Android Chrome. *(Desktop proven; phones moved to post-ship UAT by the founder, 2026-10-28: "i will do phone after we ship to prod" — see Post-ship UAT.)*
- [x] Mic denied → a clear message; typing still works.
- [x] Human chat, empty input: the round button records and sends a voice note; the other person
      sees an audio bubble, can play it, and can open its transcript.
- [x] Mirror chat shows the voice-note button; the agent answers only after the transcript is done
      (pending: no job, then one answer), and a failed transcript tells the user instead of answering.
- [x] The voice bubble shows ~50 server-computed waveform bars that fill as it plays; tap/drag seeks;
      duration under the bars; "Show transcript" still works.
- [x] With text, a staged attachment or a sendable quote, the send slot shows Send, never the
      voice-note button; with a private @mirror ask open, no voice-note button (also in the Mirror chat).
- [x] Transcription failure keeps the clip with Retry / Discard; a double ✓ sends one request.
- [x] Switching chat mid-recording discards it; a late transcript lands in the originating chat's
      draft, not the visible one.
- [x] Server rejects an over-length clip and an over-rate request (Deno tests, shown failing first).
- [x] Voice notes play on prod's CSP (test parses `vercel.json`); a non-member can't fetch the audio.
- [x] Deleting a voice note, and account erasure, remove the audio object; the transcript shows
      "Transcribing…" → text, or "Transcript unavailable".
- [x] Real-device check (iOS Safari, Android Chrome) is done by the founder at UAT; the agent
      provides desktop and emulated evidence. *(Moved to post-ship UAT by the founder, 2026-10-28.)*
- [x] Privacy page and ToS state voice handling as decided below (founder approved, 2026-10-28).

### AC evidence (/dev, 2026-10-27)

Ticked items carry test evidence on branch `feature/p1576-chat-mic`: vitest (7,733 passing, full suite),
Deno (267: `transcribe-clip`, `chat-voice`, `_shared`), DB canary on TEST
(`e2e/integration/p1576-chat-voice-notes.spec.ts`, 18/18: membership, constraints, ledger + lock under
15 parallel commits, delete/erase purge, retention, backoff, Realtime carries no path), authenticated
E2E with Chrome's fake microphone (`e2e/p1576-chat-voice.spec.ts`, 14/14, `--retries=0`; both edge
functions route-mocked, commits go through the real RPC), the CSP test parsing `vercel.json`, and the
direct Gemini latency measurement in Cost Budget.

**Still unticked, and why:** the dictation and voice-note end-to-end ACs, object deletion, and
real devices need the deployed pieces this run did not create (private bucket, the feature's Gemini
key, the two edge functions on TEST; see Pre-deploy Checklist). Privacy/ToS text is drafted and waits
on Open Question 1.

### AC evidence (/dev, 2026-10-28)

On TEST, with the migrations through `20261027120700` applied and `chat-voice` / `mirror-reply` deployed:
integration spec 22/22 (`e2e/integration/p1576-chat-voice-notes.spec.ts`, incl. the server trigger: one
job per done mirror note, none for blank or non-mirror notes), authenticated E2E 16/16
(`e2e/p1576-chat-voice.spec.ts`: the Mirror chat offers the voice button, the browser asks nothing,
"thinking" appears when the transcript lands and clears on the agent reply; 50 waveform bars fill as it
plays and a tap seeks), vitest 999 (p1576/p1520/p1512/p1544), Deno 111. Live: the trigger's internal
calls to `mirror-reply` returned 200 `done` with real agent messages; the sweep cron returns 200 and
purged a queued object; the founder verified dictation on TEST. The bucket `--check` passes with the
signer's IAM binding. **Not ticked:** phones and the real-device check (founder at UAT) and the
privacy/ToS wording (Open Question 1).

### Known limitations (accepted, from review)

- A re-PUT with a still-valid upload URL (5 min) after a note was deleted and purged recreates an object
  no row points to; the bucket's 31-day lifecycle rule removes it.
- Retention expires at most 100,000 notes per daily run; above that the next day continues.
- If the backoff write itself fails during a sweep, that path is skipped for the rest of the run only.
- Edge-function outbound bytes (audio sent to Gemini) may count as Supabase egress: UNVERIFIED, check
  the usage page after the first week.
- The level meter was only seen with Chrome's fake microphone; that it responds to a real voice is
  checked at UAT.

## Post-ship UAT (founder, on prod)

The founder moved the phone checks after the ship (2026-10-28). Not a completion criterion of this build.

- iPhone Safari and Android Chrome: dictation, a voice note in a 1:1 (record, play, tap the bars to seek,
  Show transcript), and a voice note to the Mirror (no answer while Transcribing…, then one answer).

## Cost Budget

**Measured (/dev, 2026-10-27):** a synthetic 60 s mixed EN/RU clip (16 kHz mono WAV, 1.9 MB) sent
straight to `gemini-3.5-transcribe` came back correct in both languages in 4.65 s cold, then 2.82 /
2.45 / 2.57 s warm (target < 3 s met warm; edge-function overhead not yet included). It used 1500 prompt
tokens = **25 audio tokens/s**, matching the pricing page. Price (registry row added): $2.00/1M audio in,
$12.00/1M out ≈ **$0.005 per audio minute**. Verdict: a heavy user at 10 min of audio/day ≈ $1.50/month;
100 such users ≈ $150/month, bounded by the feature's own budget-capped key. Fits at 10x only with the
cap set to match; the per-user rate limit (6 clips/min, 3 min max) bounds a single abuser to ≈ $0.09/min.

**Call counts per action** (from the built code): a dictation = 1 edge call (`transcribe-clip`) + 1
Gemini call. A voice note = 2 edge calls (`chat-voice` upload + commit) + 1 GCS PUT + 1 ranged GET (header check) + 1
full GET at commit (waveform bars, only after the header passes) + 1 download + 1 Gemini call, then 1 edge call + 1 GCS GET per playback (URL valid 2 min, fetched again on each play). Audio is WAV
16 kHz mono = 32 KB/s: a 30 s note is 0.96 MB, the 2 min cap is 3.84 MB. The cron runs 288 SQL checks a
day and calls the edge function only when there is work (0 calls idle).

**Scenario used for the arithmetic** (assumption, not a measurement — real user counts stay private):
100 active users a day, each sending 5 voice notes (30 s avg, played 1.5 times) and 10 dictations
(20 s avg).

| Measure | Per user (per day) | Per hour (peak = 20% of a day) | Per test run |
|---|---|---|---|
| Edge invocations | 5 x (2 + 1.5) + 10 = 27.5 | 100 x 27.5 x 0.2 = 550 | 0 (integration spec calls RPCs directly; Deno and vitest stub everything) |
| Gemini audio minutes | 5 x 0.5 + 10 x 0.33 = 5.8 min ≈ $0.03 | 100 x 5.8 x 0.2 = 116 min ≈ $0.58 | 0 in CI; one manual check ≈ 5 x 1 min = $0.025 |
| GCS egress (playback) | 5 x 1.5 x 0.96 MB = 7.2 MB | 100 x 7.2 MB x 0.2 = 144 MB | 0 (no bucket touched by tests) |
| GCS storage (30-day steady state) | 5 x 30 x 0.96 MB = 144 MB | — | 0 |
| GCS operations | Class A 1 (PUT; DELETE is free) + Class B 2 + 1.5 per note (ranged GET + job download + plays) | as per user x 20 | 0 |
| Log lines | ≈ 1 per edge call + 1 per failure = 27.5 | 550 | ≈ 0 |
| Realtime messages | 2 per note per recipient (insert + transcript update) = 10 | 200 | ≈ 20 |

1. **Fits today?** Per month at 100 users: edge 100 x 27.5 x 30 = **82,500** of the 500,000 Free limit
   (16.5%). Gemini 100 x 5.8 x 30 = 17,400 min x $0.005 = **≈ $87/month**, which the feature's own key
   cap must cover: [FOUNDER DECISION: monthly cap for the chat-voice Gemini key]. GCS: storage 100 x
   144 MB = 14.4 GB x ~$0.02 = ≈ $0.30; egress 100 x 7.2 MB x 30 = 21.6 GB x ~$0.12 = ≈ $2.60; Class A
   100 x 5 x 30 = 15,000 PUTs x $0.05/1,000 = $0.75. Audio does pass through the edge function once per
   note (GCS download, then upload to Gemini): 100 x 5 x 30 x 0.96 MB = 14.4 GB/month of GCS egress
   (≈ $1.70) plus the same bytes outbound from the edge function; whether Supabase meters edge outbound
   as egress is UNVERIFIED (check the usage page after the first week). Sweep calls: at most 288/day =
   8,640/month, 0 when idle; included in the 10x line below as a ceiling.
   Realtime 100 x 10 x 30 = 30,000 of 2 million. Yes, it fits.
2. **Fits at 10x (1,000 users)?** Edge 825,000 + at most 8,640 sweep calls ≈ 833,640/month **exceeds** the Free 500,000 → the named upgrade
   is Supabase Pro (from $25/month, registry). Gemini ≈ $870/month, GCS ≈ $45/month: within reach only
   if the founder raises the key cap; otherwise the per-user limits (6 dictations/min, 10 voice
   notes/min, upload grants capped) and the key's cap bound it — users then see 429s, not a bill.
3. **Worst case, one abuser:** dictation 6 x 3 min/min = 18 audio-min/min ≈ $0.09/min; voice notes
   10 x 2 min/min = 20 audio-min/min ≈ $0.10/min, both stopped at the key's budget cap.

## Pre-deploy Checklist

- [x] Edge functions `transcribe-clip` and `chat-voice` deployed to test, then prod
- [x] Its Gemini key secret set in test and prod under a distinct name, registered in
      `.private/docs/edge-function-secrets.md`, passing `scripts/check-edge-function-secrets.sh`
- [x] Voice-note migration (message type, audio reference, transcript) applied to test, then prod
- [x] Audio bucket created and configured as code: `GCS_LOCATION=<location> ./scripts/gcs-chat-voice-bucket.sh`
      (private, uniform access, public-access prevention enforced, 31-day delete rule, no versioning or
      soft delete, CORS naming `x-goog-content-length-range` and `x-goog-if-generation-match`), then
      `./scripts/gcs-chat-voice-bucket.sh --check` must exit 0 (non-zero = the live bucket drifted)
- [x] `CHAT_VOICE_CRON_SECRET` set on the `chat-voice` function and the same value stored as vault secret
      `chat_voice_cron_secret` (plus `chat_voice_url`, `chat_voice_anon_key`), so the sweep cron can call it
- [x] Prod CSP `media-src` allows the audio host
- [x] Signing identity for the bucket: [FOUNDER DECISION: a dedicated service account with
      `roles/storage.objectUser` on this bucket only, under its own secret name (review finding: the shared
      `GCS_SERVICE_ACCOUNT_KEY` also signs for two other functions), or reuse the shared key]. Either way it
      needs object create/get/delete on the bucket; the script grants `roles/storage.objectUser` to
      `GCS_CHAT_VOICE_SIGNER` and `--check` fails without that binding.
- [x] Sweep is alive after deploy: insert nothing, then delete one test voice note on test and confirm its
      object is gone within two `*/5` ticks (`chat_voice_purge` empty). A secret mismatch or missing IAM
      fails silently (the cron only raises a warning).
- [x] Both new edge functions (`transcribe-clip`, `chat-voice`) deployed; the client ships only after the
      migrations (it selects the new columns).
- [x] **Order: migration `20261027120600` BEFORE the new `chat-voice`.** That migration drops the 7-argument
      `chat_commit_voice_note`; a `chat-voice` that passes `p_waveform` against the old database fails every
      commit (the reverse order is safe, the new parameter has a default). Then `mirror-reply`, then the client.
- [x] Server-started Mirror reply: set `MIRROR_INTERNAL_SECRET` on `mirror-reply` (off default
      `not-configured`; internal mode is refused while off) and store vault secrets `mirror_reply_url` (the
      function URL) and `mirror_internal_secret` (the SAME value) on each project; the trigger reuses vault
      `chat_voice_anon_key`. Order: migration `20261027120700` after `20261027120600`, and deploy
      `mirror-reply` before relying on it. Missing vault config only leaves the job `queued` (a warning;
      Try again still works). Prod keeps `MIRROR_AI_ENABLED=false`, so the job stays queued there.

**Done 2026-10-28 (prod `besjtuodziykmjidubzw`, test `ayibkeoyukulbsjpxgaw`):** migrations `20261027120000`..`120700`
applied to prod (`migrate.sh --env prod --only`, prod smoke 12/0 after); `transcribe-clip`, `chat-voice`, `mirror-reply`
deployed to prod after the migrations (all three answer 401 to an anonymous call, i.e. configured); prod secrets
`GCS_CHAT_VOICE_SERVICE_ACCOUNT_KEY` (dedicated signer `cp-chat-voice-signer`, objectUser on the two voice buckets
only; the shared account's binding removed from the test bucket), `CHAT_VOICE_CRON_SECRET`, `MIRROR_INTERNAL_SECRET`
(both equal to their vault values), `GEMINI_CHAT_VOICE_API_KEY` (new key `cp-chat-voice-prod`, budget-capped
enforcing cap, `--confirm-cap` CONFIGURED, restriction PASS); vault `chat_voice_url`, `chat_voice_cron_secret`,
`chat_voice_anon_key`, `mirror_reply_url`, `mirror_internal_secret` on prod; bucket `claritypledge-chat-voice`
created in US-CENTRAL1 (same region as the public media and test voice buckets), `--check` OK on both buckets;
CSP `media-src` already allows `storage.googleapis.com` (test parses `vercel.json`). Prod `MIRROR_AI_ENABLED` stays
false. Sweep proven on test and prod: a queued delete was purged on the next `*/5` tick (prod 08:50 UTC, `purged:1`,
`purgeFailed:0`), so the cron secret matches and the dedicated signer can delete. Secrets were set with a new prod-only token scoped to Edge Function Secrets (keychain `PROD_SUPABASE_SECRETS_TOKEN`).

## Open Questions

0. [FOUNDER DECISION: UX] In an empty human chat the in-field dictation mic and the round
   voice-note button sit side by side, with two mic icons that do different things (reviewer
   concern: mis-taps on mobile). Options: different icons (e.g. a text-cursor mic for dictate), only
   the voice-note button in human chats until text is typed, or accept as WhatsApp+keyboard users
   already do.
1. [FOUNDER DECISION: privacy] Exact wording in privacy and ToS ("voice messages are stored for 30
   days and transcribed by Google Gemini; transcripts are kept").
2. Logged-out visitors: mic hidden (current spec behaviour, for cost) unless the founder says
   otherwise.

3. [FOUNDER DECISION: copy] Strings added during `/dev` beyond the spec's own: "Voice message" (chat
   list preview), "2-min limit reached", "Dictated text is waiting." with Insert / Discard dictated text,
   "Couldn't play. Tap play to try again.", "Too many voice messages, wait a minute".
4. [FOUNDER DECISION: infra] Bucket signing identity: dedicated service account vs the shared
   `GCS_SERVICE_ACCOUNT_KEY` (see Pre-deploy Checklist), and the monthly cap on the feature's Gemini key
   (see Cost Budget).
5. Scope rows still open in the Scope table: the Mirror landing-lab screen and editing a sent message
   (not built in this run).

## Resolved Decisions

Founder, 2026-10-29 ("yes to all", post-ship):

- **Two mics (Q0):** give the dictation mic a distinct icon so it cannot be mistaken for the voice-note
  button. Not built yet; follow-up work.
- **Logged-out visitors (Q2):** mic stays hidden.
- **Copy (Q3):** the `/dev`-added strings are approved as shipped.
- **Scope (Q5):** the Mirror landing-demo screen gets no voice notes, since it is for logged-out visitors, who have no mic.
  Editing a sent message is not planned.

Founder, 2026-10-26 ("yes to all" on the recommended options):

- **Storage:** private GCS bucket + short-lived signed URLs minted after a chat-membership check.
  No CSP change.
- **Retention:** voice-note audio is deleted after **30 days**; the transcript is kept. Enforced by a
  bucket lifecycle rule plus the row's audio reference being cleared (bubble shows "Audio expired"
  with the transcript).
- **Limits:** voice note max **2 min**, dictation clip max **3 min**, enforced server-side.
- **Key:** its own budget-capped Gemini key for this feature, under a distinct secret name.
- **Mirror:** ~~dictation only, no voice notes~~ superseded 2026-10-27: voice notes allowed in the Mirror
  chat, answered from the transcript once done, the reply started by the server when the transcript is done; private @mirror asks stay text-only.
- **Bubble (2026-10-27):** WhatsApp/Telegram style, ~50 server-computed bars as the seek bar.
- **Founder, 2026-10-28 ("approved all"):** privacy and ToS wording as drafted (voice audio kept 30 days,
  transcribed by Google Gemini, transcripts kept; Mirror answers from the transcript); a **dedicated signing
  service account** with `roles/storage.objectUser` on the voice bucket only, under its own secret name; a
  **new prod Gemini key** for chat voice with a **monthly budget cap** (raised on evidence; amount in `.private/`), separate from the TEST
  key so test runs never spend users' budget. No terms-version bump: bumps are batched quarterly; the
  Mirror's Gemini use is already consented in v1.5.
- **Bucket IAM (2026-10-27):** `gcs-chat-voice-bucket.sh` grants the signer `roles/storage.objectUser` and
  `--check` verifies the binding (a missing grant broke a real send on TEST).

## Related

- P1503 (prototype: composer mic = dictation, D10) · P1509 (mock voice-message mic in the send slot)
- P1512 (chat v1; deferred voice notes explicitly) · P1295 (browser speech unfit) · P1236
  (`transcribe-slice`) · P955 (one primary action)
