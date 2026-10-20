---
status: week
type: story
rank: 47
workstream: clarity-chat
created_date: '2026-10-20'
tags: [mirror-agent, chat, portraits, clarity-chat]
disclosure: public
delivery_stage: create-spec
pipeline_ran: [create-spec]
drafted_by: opus
exec_model: opus
exec_effort: high
driver: heuristic
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

- [ ] A user writes in the mirror chat and receives a reply from the mirror in the same chat.
- [ ] @Mira in a channel: the asker sees the answer; a second member of the same channel does not, verified with two accounts.
- [ ] A new user's mirror shows a generated portrait in an artist style, with the agent treatment.
- [ ] New face produces a different portrait. A gender change is respected on the next generation.
- [ ] Tapping the mirror name opens the info panel with Rename and New face.

## Open Questions

1. Which model, and what voice? [FOUNDER DECISION]
2. Should a mirror the user never renamed get a default name, or show "Your mirror" once? Recommended: "Your mirror" once, and the user names it.
3. Is the portrait generated on first chat open, or at sign-up?

## Related

- P1512: Clarity Chat v1 (on its feature branch, not yet on main).
- [P1453](done/2026-06-10/p1453_artist_style_profile_banners.md): the artist-style generation pipeline.
- [P1431](p1431_mirror_agent_letter_chat.md): the earlier avatar plan (own photo with a robot badge), superseded here.
- [P1467](p1467_clarity_chat_letter_loop_v5.md): the mirror agent's role.

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
