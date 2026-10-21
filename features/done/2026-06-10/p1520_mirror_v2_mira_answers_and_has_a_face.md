---
status: all-done
type: story
rank: 47
workstream: clarity-chat
created_date: '2026-10-20'
tags: [mirror-agent, chat, portraits, clarity-chat]
disclosure: public
pipeline_ran: [create-spec, dev, ship]
drafted_by: opus
exec_model: opus
exec_effort: high
driver: heuristic
completed_at: 2026-10-21
---

# P1520: Mirror v2 — the mirror answers, and has a face

## Problem

**Situation:** Clarity Chat v1 (P1512) gives every user a private mirror chat. Clarify sends a message
there with the user's note on why it is unclear. The mirror never replies, and it is drawn as a neutral
glyph (`MirrorMark`). A user can rename it from the chat's ⋯ menu.
**Complication:** A mirror that cannot answer is a notes folder. A mirror with no face reads as a
system feature, not as a companion with a name. The founder named their own mirror "Mira".
**Question:** How does the mirror answer, where may it be summoned, and how does it get a face the
user owns?

> Founder framing, verbatim: "We have generation of portraits... we have the 500 artists or so. Maybe
> we reuse Nano Banana to generate their own portrait and their own style... And the user can regenerate."
> — "Mira - can we make sure it gets a picture?" — "I can regenerate in settings or where I can rename her"

## Appetite

Blast radius: medium. A new AI call path and a new generated image per user; chat v1 itself is unchanged.
Reversibility: medium. Portraits are stored assets, and replies are messages that persist.
Decision density: a few. The model, the reply voice, and @Mira privacy are confirmed below; the rest are open.

## Solution

1. **The mirror replies** in its own chat, to clarify messages and to plain messages the user writes
   there. Its job is to help the user understand the other person, not to argue their case. That is
   the role P1467's decision gives it: it delivers and answers questions, and never argues the
   owner's case. [FOUNDER DECISION: model. The founder mentioned Gemini; confirm the model and the
   reply tone.]
2. **@Mira in a channel** summons the user's own mirror. **Its answer is visible only to the asker**,
   never to the channel (founder-approved 2026-10-20). Other members see nothing, not even that it
   was asked.
3. **Portrait.**
   - Generated with the existing artist-style pipeline (P1453 `generate-banner` /
     `_shared/artist-banner.ts`), in the painting style of an artist picked at random from the
     existing artist list.
   - **Never a real person's likeness.** Painting style only.
   - **Gender is chosen by the user** (female / male / neutral). The default is random, and it is
     never guessed from the name (founder-approved 2026-10-20).
   - **New face** regenerates the portrait.
4. **Where it is managed.** Tap the mirror's name in the chat header to open an info panel with the
   portrait, the name, "Your mirror", Rename, New face and the gender choice. The ⋯ menu keeps
   Rename as a shortcut. Settings may link to "Your mirror". This was founder-approved 2026-10-20,
   and it supersedes P1431's "own photo with a robot badge".
5. Until this ships, the mirror keeps the neutral `MirrorMark`, never the user's own photo (P1512 decision).

## Invariants

- **An agent is always distinguishable from a person** (decisions.md 2026-10-13, P1483: agents are
  navy, people are in color). The mirror portrait must carry the agent treatment, and the role is
  always shown (decisions.md, the "Mirror agents may carry a user-chosen name; the role is always
  shown" ruling).
- **A mirror reply addressed to one user is never readable by anyone else.** This holds for @Mira in
  a channel too. It must be enforced server-side (RLS), not by hiding it in the UI.

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| Generated portrait resembles a real person | MITIGATE | Prompt forbids likeness; style-only reference |
| AI reply cost per user | MITIGATE | Per-user daily cap, reuse the P1453 `reserveGeneration` budget pattern |
| Free-plan quota already exceeded (2026-10-20 dashboard) | DEFER | Resolve the Supabase quota first (test project transfer, polling cut) |
| Mirror reply misrepresents the other person | ACCEPT | Labelled as the mirror's reading; the user decides |

**Non-Goals**
- Do NOT add @person mentions. They come later, together with notifications.
- Do NOT add notifications or email.
- Do NOT let the mirror post in channels on its own.

## Acceptance Criteria

- [x] A user writes in the mirror chat and receives a reply from the mirror in the same chat. *(e2e/p1520-mirror.spec.ts "AI: a message written in the mirror gets a reply", real model on test, passed 2026-10-21)*
- [x] @Mira in a channel: the asker sees the answer; a second member of the same channel does not, verified with two accounts. *("AI, two browsers" test, passed; server-side by RLS, DB canary 12/12)*
- [x] A new user's mirror shows a generated portrait in an artist style, with the agent treatment. *("AI: a new user's mirror gets a portrait on first open" test: portrait and artist credit stored, agent tint rendered, passed)*
- [x] New face produces a different portrait. A gender change is respected on the next generation. *("AI: New face" test passed on the real model; a later re-run was refused by the $6/day global portrait cap, the cap working)*
- [x] Tapping the mirror name opens the info panel with Rename and New face. *(smoke test, with the mirror on: both buttons present)*

## Open Questions

1. Which model, and what voice? [FOUNDER DECISION]
2. Should a mirror the user never renamed get a default name, or show "Your mirror" once? Recommended: "Your mirror" once, and the user names it.
3. Is the portrait generated on first chat open, or at sign-up?

## Related

- P1512: Clarity Chat v1 (on its feature branch, not yet on main).
- [P1453](p1453_artist_style_profile_banners.md): the artist-style generation pipeline.
- [P1431](../../p1431_mirror_agent_letter_chat.md): the earlier avatar plan (own photo with a robot badge), superseded here.
- [P1467](../../p1467_clarity_chat_letter_loop_v5.md): the mirror agent's role.

## Founder decisions, 2026-10-20 (second round)

- **Replies use Gemini 3.8 Flash.**
- **The in-app mirror runs on its own Gemini key with its own hard spend cap**, separate from the keys the
  server functions use today (normal and batch). A runaway mirror must never stop banners or transcription,
  as a shared cap did on 2026-10-13. The founder creates the key; its value never goes into files or commands.
- **Reuse the learnings of the existing Mira assistant** (ClarityPledge's WhatsApp/Telegram assistant; its build
  and operation are documented privately). Copy the patterns, not the code or the server:
  - the personality rules: mirror, not fixer; name a pattern once, then wait; separate fact, inference and
    speculation; the user's agency is absolute; no sycophancy; no sides on contested politics;
  - spend control: a per-person daily allowance reserved before each model call, plus a global ceiling,
    plus the provider's hard cap on the key;
  - a red-team suite run with the real model before opening, and tests built from real message shapes;
  - chats sealed from each other: a mirror run sees only what its owner may read in that one chat.
- **The in-app mirror is not the Mira assistant and is not connected to it.** Mira is a public assistant that
  speaks for the founder; an in-app mirror is each user's private agent. The default name stays "Your
  mirror"; users may name theirs (the founder names his "Mira").
- **No mirror learns from other users.** A mirror's context comes only from its owner's own reachable chats.
  Sharing across users would need an explicit opt-in and its own spec.

## Review findings — resolve before /dev (Gemini Argon 4 + Codex, 2026-10-20)

Adversarial review of P1520 and P1521 together; both verdicts: revise before implementation. Not yet verified against code by command.
- **high** @Mira's prompt must never travel the normal channel message path (and channel triggers such as last-message time must skip it): a private ask needs its own row visibility, enforced server-side and in Realtime.
- **high** Bound the mirror's context: at most the last N messages of that one channel, channel text treated as untrusted (prompt injection), never the user's private mirror history in a channel ask.
- **high** Account erasure must also remove AI replies derived from the erased person's messages, and cancel pending work.
- **high** Sending other people's messages to an AI provider needs a stated data contract (what is sent, retention, no training use) and a privacy-policy update. [FOUNDER DECISION]
- **high** A per-user daily cap is not a spend bound: add token limits, portrait limits, atomic reservation and a global ceiling; separate buckets for replies and portraits.
- **med** Durable generation states (queued, running, done, failed, capped) with one request id, so retries never double-charge or double-reply; no reply-to-own-reply loops.
- **med** The existing artist-banner prompt forbids portraits and outputs 21:9 banners; a portrait mode needs its own prompt, square output and storage visibility.
- **med** Define "agent treatment" for a full-color artist portrait (navy duotone vs. a navy frame plus badge); the P1483 invariant and "artist style" collide as written. [FOUNDER DECISION]
- **med** A renamed mirror can share a name with a person; the picker must show the mirror as "Your mirror (private)" and the composer must switch to a visible private mode.
- **low** Loading, cap-reached and failed states for replies and portraits; fall back to MirrorMark.

### Resolution, checked against the code (/dev, 2026-10-20)

Each finding was checked against the P1512 branch this spec is built on (`20261019203000_p1512_clarity_chat.sql`
and the chat client). CONFIRMED means the code has the gap as described.

1. **@Mira private path: CONFIRMED.** `send_chat_message` writes into the channel itself, `chat_messages_select`
   lets every member read it, and the send moves the channel's `last_message_at`. **Resolution:** an ask and its
   answer are rows in the asker's **own mirror conversation**, tagged with the channel they were asked in
   (`context_conversation_id`). The mirror's existing owner-only RLS and Realtime's RLS on INSERT/UPDATE cover
   them. The channel row, its last-message time and everyone else's unread counts are never touched. The asker
   sees the exchange inline in the channel; nobody else's client ever receives it.
2. **Bounded context: resolved by design.** A channel ask sees at most the last 30 messages of that one channel
   that the asker may read (from their access time on), deleted ones excluded, each cut to 1,000 characters.
   Everything quoted is sent as data (JSON, angle brackets escaped), and the fixed rules say quoted text never
   instructs. A channel ask never includes the mirror's own history, and a mirror-chat reply never includes
   channel asks.
3. **Erasure: CONFIRMED gap.** `erase_chat_data_for` scrubs copies by `forward_author_id` and thread `author_ref`,
   but an AI reply is new text that carries neither. **Resolution:** every reply and every job records
   `derived_refs`, the `_chat_author_ref` of each author whose words were in its context. Erasure scrubs replies
   that carry the erased ref and cancels jobs that carry it. A job locks its context rows `FOR SHARE` when it
   starts (the clarify pattern), so an erase waits for a starting job and then sees its refs. Completion refuses
   a cancelled job.
4. **Data contract and privacy policy: CONFIRMED, open.** `privacy.md` § AI features covers the old `/chat` guide,
   banners and transcription, not chat messages. [FOUNDER DECISION: the contract below and the policy text.]
   Until then **no AI call can run on prod**: the functions refuse unless `MIRROR_AI_ENABLED=true` is set, and it
   and the mirror key are set on the test project only. Draft contract: what is sent is the asker's message, the
   bounded context in 2, and the mirror's name; it goes to Google's Gemini API under the paid-tier terms (no
   training on the data); replies are stored in the asker's mirror and erased with the account or with the
   person they quote.
5. **Spend: CONFIRMED.** `reserveGeneration` (generate-banner) counts calls per user in `ai_rate_limits`; there is
   no global ceiling and no token bound. **Resolution:** one reservation function, run in a single transaction
   under an advisory lock, reserves each call's worst-case cost before the call, using the Mira assistant's
   formula `(max_in × price_in + max_out × price_out) × 1.25`. It checks a per-person daily allowance and a
   global daily ceiling, separately for replies and portraits, plus count caps. The reservation is settled to the
   reported usage afterwards and released only if the call never started. `maxOutputTokens` is set on every call
   and input is bounded by 2. The key's own hard cap stays the last line.
6. **Durable states: resolved by design.** `mirror_jobs` holds queued, running, done, failed, capped and
   cancelled, with one job per triggering message (unique), so a retry returns the same job and never pays or
   replies twice. The mirror answers only rows its owner wrote, never its own.
7. **Portrait prompt: CONFIRMED.** `buildArtistProfilePrompt` says "No portraits and no close-up faces", and
   `runArtistBanner` forces 21:9. **Resolution:** a separate portrait prompt (a fictional person painted in the
   artist's style, the chosen gender, never a real person's or the artist's likeness), 1:1, stored in the existing
   `banners` bucket under `mirror/<random id>` with no owner id in the path.
8. **Agent treatment: decided (founder, 2026-10-20): navy tint.** The portrait gets the P1483 agent layer
   (`#1e3a8a`, `mix-blend-mode: color`, 0.75) at display time, and keeps the mirror's dashed agent ring and its
   role label. Rejected: full color inside a navy frame plus a badge, because P1483 already rejected a badge and a
   navy ring reads like a person's blue pledger ring at small sizes.
9. **Name collision: resolved by design.** The `@` picker lists the mirror as "<name> · Your mirror (private)" with
   its portrait. Private mode starts only when that entry is picked, never by matching typed text, and the
   composer then shows "Private: only you see this". P1521 adds people to the same picker.
10. **States: resolved in the UI.** Thinking, cap reached, failed with Try again, and the portrait falling back to
   MirrorMark.

**Open questions 2 and 3, answered.** Q2: the second-round decision (the default name stays "Your mirror").
Q3: the portrait is generated the first time the owner opens the mirror chat, so nobody who never opens it costs
anything.

## Build status (/dev, 2026-10-21)

Built on `feature/p1520-mirror-v2`, which starts at P1512's tip: **P1512 must ship first.** Migration and both
functions are on the test project only. Every AI path is off until the mirror's own key exists (see the checklist).

Verified without the model: DB canary `e2e/integration/p1520-mirror-canary.spec.ts` 12/12 (owner-only reads over
REST and Realtime with a second account, no channel side effects, no client writes, one job per message, atomic and
capped spend, restart accounting, erasure of derived replies, asks never copied); unit tests 47; browser smoke 1/1.
With the real model on test (2026-10-21): all five acceptance criteria pass in `e2e/p1520-mirror.spec.ts`, and the
red-team suite passes 7/7. It covers channel-message injection, a forged instruction header, an injection in a
display name, a direct request for the rules, no leak from the private mirror chat, and no leak from another channel.
Two controls prove the model reads its context. INBOX-205 (edge-function CORS for w9/w10) is fixed on this branch.
The model is non-deterministic: one passing red-team run is evidence, not a guarantee.

**Found with the real model:** every portrait settles at the $0.70 fallback price, because the image call reports no
cost, so the $6/day global portrait cap allows about 8 portraits a day across all users. Test runs used it up on
2026-10-21. [FOUNDER DECISION: raise the portrait cap, or price portraits from the real per-image cost.]

**Known limitations (accepted by the review rounds):** a channel shows the newest 200 private asks (older ones stay in
the mirror chat); image and vision calls carry no explicit output-token cap (fixed-size output, reserved at the
fallback price for every call); the erase/start lock protocol is proven by reasoning and the serial canary, not by a
concurrency test; a profile deleted outside erase_my_account() keeps derived replies (as P1512 keeps bodies); an
erased owner's portrait file stays in the bucket, unlinked.

**Spend numbers to confirm** [FOUNDER DECISION]: per person per day $0.60 and 30 replies, $2.10 and 3 portraits;
global per day $5 replies, $6 portraits, $10 total (`_mirror_limits()` in the migration). Prices assume Gemini's
2027 rates.

**Copy to confirm** [FOUNDER DECISION]: "<name>'s reading. You decide what fits.", "<name> is thinking…",
"<name> could not answer.", "<name> has answered as much as it can today. Try again tomorrow.",
"Private: only you see this", "Asked privately in <channel>", "Ask <name> privately", the panel's
"Only you can see and talk to it.", "Painted in the style of <artist>", "Random / Female / Male / Neutral".

## Pre-deploy Checklist

### Secrets to provision (test first; prod only after the privacy policy covers the data contract)
- [x] The mirror's own Gemini key, `cp-mirror`, in its own project, restricted to the Gemini API, hard spend cap 75 EUR/month (confirmed from Google's budget list), registered with ai-keys monitoring and the /day Monitor tab.
- [x] `MIRROR_GEMINI_API_KEY` set on the test project (piped from the key tool; value never in files or commands).
- [x] `MIRROR_AI_ENABLED=true` on the test project.
- [x] Prod: neither is set (true at ship: the secrets were only ever set on test, and mirror-reply is not deployed on prod, so the mirror cannot answer there). until the privacy policy covers sending other people's messages to the model.
  P1512's policy (commit 511a1332a, in this branch) now says the mirror is read by no AI and that no chat content goes to an AI provider. Both lines must change before the mirror is switched on in prod: say what goes to Google Gemini (the owner's mirror messages; for a private ask, that channel's recent messages and member names; portraits), and add mirror replies to the Gemini row of the recipients table. [FOUNDER DECISION: wording]

### Deploy commands
- [x] Migration `20261020213000_p1520_mirror_v2.sql` to prod, after P1512's: applied by `/push` step 2.5 (P1211 schema gate), not by /ship.
- [x] `mirror-reply` and `mirror-portrait` deploy to prod: after push, with the founder's OK (prod deploy is ALWAYS-ASK) (they stay off there without the two secrets above).

### Post-deploy verification
- [x] On test with the key: `e2e/p1520-mirror.spec.ts` (now 5 tests) and the red-team suite `e2e/integration/p1520-mirror-redteam.spec.ts` (7/7) with the real model.
- [x] Edge smoke, run right after that prod function deploy: `node scripts/edge-function-smoke.mjs --only mirror-reply,mirror-portrait`.
