---
status: week
type: story
rank: 77
workstream: clarity-chat
created_date: '2026-10-26'
tags: [chat, voice, transcription, mirror]
disclosure: public
delivery_stage: create-spec
pipeline_ran: [create-spec]
drafted_by: opus
exec_model: opus
exec_effort: high
driver: heuristic
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
| Mirror agent chat (`kind === 'mirror'`, renders through `ConversationPane` → `Composer`; verified in review) | yes | **no** |
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
- The Mirror chat never shows the round button. The agent reads text only, so it must see
  transcript the user has checked.

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
- **Voice notes in Mirror too.** Rejected: the agent would answer unchecked transcript.
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

- The Mirror agent only ever receives text the user saw in the input before sending.
- Exactly one primary action in the send slot at any time (P955).
- Dictation audio is never stored: transcribed, then discarded.

## Acceptance Criteria

- [ ] In every surface marked "yes" for dictation, tapping the mic, speaking and pressing ✓ puts the
      spoken words into the input, editable, without sending.
- [ ] ✕ during recording discards the clip and leaves the existing draft untouched.
- [ ] A 60 s mixed Russian/English clip comes back as text; wait measured and recorded (target < 3 s).
- [ ] Works on desktop Chrome, iOS Safari and Android Chrome.
- [ ] Mic denied → a clear message; typing still works.
- [ ] Human chat, empty input: the round button records and sends a voice note; the other person
      sees an audio bubble, can play it, and can open its transcript.
- [ ] Mirror chat never shows the voice-note button.
- [ ] With text, a staged attachment or a sendable quote, the send slot shows Send, never the
      voice-note button; with a private @mirror ask open, no voice-note button.
- [ ] Transcription failure keeps the clip with Retry / Discard; a double ✓ sends one request.
- [ ] Switching chat mid-recording discards it; a late transcript lands in the originating chat's
      draft, not the visible one.
- [ ] Server rejects an over-length clip and an over-rate request (Deno tests, shown failing first).
- [ ] Voice notes play on prod's CSP (test parses `vercel.json`); a non-member can't fetch the audio.
- [ ] Deleting a voice note, and account erasure, remove the audio object; the transcript shows
      "Transcribing…" → text, or "Transcript unavailable".
- [ ] Real-device check (iOS Safari, Android Chrome) is done by the founder at UAT; the agent
      provides desktop and emulated evidence.
- [ ] Privacy page and ToS state voice handling as decided below.

## Cost Budget

Gemini 3.5 Transcribe is not in the metered-services registry yet. `/dev` adds its row from the
pricing page before ship. Audio tokens per second are also UNVERIFIED, so the numbers below are
formulas.

| Measure | Per user | Per hour | Per test run |
|---|---|---|---|
| Requests | `clips/day x 1 edge call` (+ 1 per voice note for transcript) | `active users x clips/hour` | `≈10 clips in e2e (stubbed Gemini) + ≈5 real in one manual check` |
| Egress (bytes) | voice-note playback: `seconds x ~16 KB/s (opus) x plays` | — | negligible |
| Log lines | 1 per clip + 1 per failure | as requests | as requests |
| Service unit | `clip seconds x audio tokens/s x registry price` | `x clips/hour` | `≈5 real clips x 60 s x tokens/s x price` |

1. **Fits the plan limit today?** Verdict by the reviewer from the registry once the row exists:
   `active users x clips/user/month x avg seconds x tokens/s x price` vs accepted spend. Edge
   invocations add `active users x clips/month` against the 500,000 limit.
2. **Fits at 10x?** Same formula x10; the per-user cap bounds the worst case.
3. **If not:** a capped key per `/slava:util:ai-keys`, and Supabase Pro for storage (see registry).

## Pre-deploy Checklist

- [ ] New edge function (clip transcription) deployed to test, then prod
- [ ] Its Gemini key secret set in test and prod under a distinct name, registered in
      `.private/docs/edge-function-secrets.md`, passing `scripts/check-edge-function-secrets.sh`
- [ ] Voice-note migration (message type, audio reference, transcript) applied to test, then prod
- [ ] Audio storage location created, with access rules and retention
- [ ] Prod CSP `media-src` allows the audio host

## Open Questions

Gemini 3.5 Transcribe still needs its registry row in `docs/technical/metered-services.md` before
the Cost Budget can get a verdict (first `/dev` task, alongside the latency measurement).

0. [FOUNDER DECISION: UX] In an empty human chat the in-field dictation mic and the round
   voice-note button sit side by side, with two mic icons that do different things (reviewer
   concern: mis-taps on mobile). Options: different icons (e.g. a text-cursor mic for dictate), only
   the voice-note button in human chats until text is typed, or accept as WhatsApp+keyboard users
   already do.
1. [FOUNDER DECISION: privacy] Exact wording in privacy and ToS ("voice messages are stored for 30
   days and transcribed by Google Gemini; transcripts are kept").
2. Logged-out visitors: mic hidden (current spec behaviour, for cost) unless the founder says
   otherwise.

## Resolved Decisions

Founder, 2026-10-26 ("yes to all" on the recommended options):

- **Storage:** private GCS bucket + short-lived signed URLs minted after a chat-membership check.
  No CSP change.
- **Retention:** voice-note audio is deleted after **30 days**; the transcript is kept. Enforced by a
  bucket lifecycle rule plus the row's audio reference being cleared (bubble shows "Audio expired"
  with the transcript).
- **Limits:** voice note max **2 min**, dictation clip max **3 min**, enforced server-side.
- **Key:** its own budget-capped Gemini key for this feature, under a distinct secret name.
- **Mirror:** dictation only, no voice notes (incl. private @mirror asks).

## Related

- P1503 (prototype: composer mic = dictation, D10) · P1509 (mock voice-message mic in the send slot)
- P1512 (chat v1; deferred voice notes explicitly) · P1295 (browser speech unfit) · P1236
  (`transcribe-slice`) · P955 (one primary action)
