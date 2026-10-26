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
| Mirror agent chat (UNVERIFIED that it renders through `ConversationPane`; `/dev` confirms) | yes | **no** |
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
- **First task in `/dev`:** measure the clip-to-text wait. Target: under 3 s for a 60 s clip. If it
  misses, the fallback is streaming Gemini, not a browser engine.

### B. Voice notes (human chats and threads only)

- When the input is empty, the send slot (Send already only appears once there is text) shows a
  round mic button. The WhatsApp/Telegram pattern, so the two never compete (P955).
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
| Which Gemini key: the batch key `transcribe-slice` uses is meant for background work; dictation is interactive | MITIGATE | [FOUNDER DECISION: own capped key vs prod-interactive key]; never `GEMINI_API_KEY` by accident (see `transcribe-slice/index.ts` header) |
| Stored voice is personal data | MITIGATE | Privacy and ToS line plus retention, per the founder decisions below |
| Media served from a new Supabase bucket blocked by prod CSP (7 prior incidents) | MITIGATE | Store audio on GCS per the Public Media Host rule, or prove the CSP `media-src` covers it before ship |
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
- [ ] Works on desktop Chrome, iOS Safari and Android Chrome (real devices).
- [ ] Mic denied → a clear message; typing still works.
- [ ] Human chat, empty input: the round button records and sends a voice note; the other person
      sees an audio bubble, can play it, and can open its transcript.
- [ ] Mirror chat never shows the voice-note button.
- [ ] With text in the input, the send slot shows Send, never the voice-note button.
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

1. [FOUNDER DECISION: retention] Keep voice recordings forever, or delete after N days and keep the
   transcript?
2. [FOUNDER DECISION: privacy] Wording for "voice messages are stored and transcribed by Google
   Gemini" in privacy and ToS.
3. [FOUNDER DECISION: limits] Max voice-note length (2 min? 5 min?) and max dictation clip length.
4. [FOUNDER DECISION: confirm] Mirror gets dictation only, no voice notes (recommended).
5. Logged-out visitors: the mic is hidden for them (recommended, for cost), or shown?

## Related

- P1503 (prototype: composer mic = dictation, D10) · P1509 (mock voice-message mic in the send slot)
- P1512 (chat v1; deferred voice notes explicitly) · P1295 (browser speech unfit) · P1236
  (`transcribe-slice`) · P955 (one primary action)
