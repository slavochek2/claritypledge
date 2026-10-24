---
status: all-done
type: story
rank: 66
workstream: clarity-chat
created_date: '2026-10-23'
tags: [mirror, chat, ux]
disclosure: public
pipeline_ran: [create-spec, dev, ship]
drafted_by: opus
exec_model: sonnet
exec_effort: medium
completed_at: 2026-10-24
---

# P1554: Mirror agent chat polish — quiet on shares, no repeated footer, square face, one naming step

## Problem

The mirror agent (P1520, live since P1544) behaves and looks slightly off in its own chat. The founder found these items while using it on prod on 2026-10-23:

> "It's weird to get a response first." (on sharing a point or story with Mira)

> "Why are we doing it even once? I think it has to be done never." (on the line under every answer)

> "agents in general are squared, right? Why do we use for mirror agents a circle?"

> "the buttons are not in the middle. They are right aligned."

Also: every answer quotes "Reply to …" for the message directly above it. Rename appears both in the three-dots menu and in the About window. "New face" is unclear. People talk to "Mira" before they have chosen a name.

## Appetite

Blast radius: one flow, the mirror chat UI plus one auto-reply rule. Reversibility: git revert. Decision density: zero. Every item was decided by the founder on 2026-10-23 in conversation.

## Solution

1. **Shares stay quiet.** A point or story sent to the mirror with no text gets no automatic reply and costs nothing.
2. **Remove the footer line** "<name>'s reading. You decide what fits." under every answer. It was copy approved in P1520, not a legal disclosure. The terms already disclose the AI (P1544).
3. **Reply quote only when it helps.** The mirror's answer shows the "Reply to …" quote only when the message it answers is not the one directly above it.
4. **Editing an old message never re-triggers a reply.** This keeps today's behaviour. Add a test.
5. **The mirror speaks first** (founder, 2026-10-24, replacing the welcome paragraph): its greeting is always the first message in its chat: "Hi, I'm your mirror agent. Want to give me a name? Or just tell me what's on your mind." While unnamed it carries one secondary **"Give me a name"** button that opens rename and stays until a name is set; once named it greets by name, with no button. The greeting is drawn by the app, not stored, so the mirror never reads it back and no migration or backfill is needed. No Clarify or sharing instructions.
5b. **The portrait visibly paints.** It is still painted the first time the mirror chat opens (one image per person who opens it). Until it arrives the avatar pulses and the greeting says "Painting my portrait…"; the face then fades in.
5c. **Jump down** (founder, 2026-10-24, Telegram-style): more than half a screen up from the bottom, or when something new arrived below, a round outlined-blue chevron button sits bottom right; it carries a count of what is new and replaces the old centred "New messages" pill. Every chat, not only the mirror.
6. **One Rename:** remove Rename from the three-dots menu. It stays in the About window.
7. **"New face" → "New portrait".**
8. **About window buttons centered.**
9. **Square avatar** for the mirror agent everywhere: header, message rows, chat list, About window.

## Invariants

- Agent disclosure floor (decisions.md, agent-marker ruling): every render of an agent carries the **square avatar silhouette** and the word **`AGENT`**. This spec moves the mirror agent onto that floor. It must not remove the `AGENT` label anywhere it shows.

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| A user shares a story expecting a reply and gets none | ACCEPT | Founder decision; the welcome message explains it; writing one line gets an answer |
| Removing the footer weakens AI disclosure | ACCEPT | The disclosure lives in the terms, the `AGENT` label and the square avatar; the footer repeated it |

**Non-Goals**
- Do NOT change what the mirror reads or its token budget (P1547).
- Do NOT change portrait generation itself, only the button label.

## Cost Budget

Registry: the Supabase Free plan row (test has its own organisation, P1538). No Gemini call is added; quiet shares remove calls.

- **Per request, in the app:** `mirror_request_reply` gains one indexed `EXISTS` on `mirror_jobs.trigger_message_id`, inside the call that already exists. Same number of requests. A text-less share now makes **0** edge calls instead of 6 Supabase requests + 1 Gemini call (P1547 table), so spend only goes down.
- **`e2e/integration/p1554-mirror-quiet-shares.spec.ts`, one run:** 1 user × ~6 (create ≈3, sign-in 1, chat list 1, mirror 1) + 3 points + sends 6 + clarify 1 + requests 6 + job counts 5 + 1 seeded job + 1 row read = **~29**, cleanup chat purge ~4 + 3 point deletes + user delete ~10 = **~17**; total **~46 requests**, 0 edge calls, 0 Gemini.
- **`e2e/p1554-mirror-polish.spec.ts`, one run:** 2 users × ~6 = 12, 1 point, 5 seeded rows = **18** setup; 9 page opens (3 tests × 3 widths) × ~12 app requests (session, chat list, messages, profiles, mirror availability + profile) = **~108**, 9 Realtime connections, ≤9 availability edge calls (they log nothing); cleanup ~25. Total **~151 requests**, 0 Gemini.
- **Fits today:** both files together ≈ 200 requests per run, far under the Free plan's request-free limits (egress 5 GB, 500,000 edge invocations / month): 100 runs a month ≈ 20,000 requests and ≤900 edge invocations. **At 10×** (1,000 runs) ≤9,000 edge invocations, still under 2% of the limit. No upgrade needed.

## Known limitations

- A body of only tabs or newlines is stored as written (`send_chat_message` trims spaces only), so the server would make a job for it. The client never asks (JavaScript `trim()` treats it as empty); only a direct API call reaches it, spending the caller's own budget.

## Acceptance Criteria

- [x] Sending a point or story to the mirror with no text produces no mirror reply and no `mirror_jobs` row; adding a line of text does produce one.
- [x] No mirror answer shows "You decide what fits."
- [x] An answer to the message directly above shows no reply quote; an answer to an older message shows it.
- [x] Editing an earlier own message in the mirror creates no new reply.
- [x] The mirror's greeting is the first message, stays above later messages, has no Clarify instructions, and while unnamed shows one "Give me a name" button that opens rename; a named mirror greets by name with no button.
- [x] While the first portrait is painting, the avatar pulses and the greeting says "Painting my portrait…".
- [x] Scrolled more than half a screen up, a round jump-down button shows bottom right and takes the reader to the newest message; new messages below show as a count on it.
- [x] The three-dots menu has no Rename; the About window has Rename and "New portrait", centered.
- [x] The mirror agent avatar is square on every surface, and `AGENT` still shows wherever it did.

## Related

[P1520](p1520_mirror_v2_mira_answers_and_has_a_face.md) · [P1544](p1544_mirror_launch_on_prod.md) · [P1547](p1547_mirror_memory_token_budget.md) (builds after it ships) · [P1483](p1483_agent_banner_navy_treatment.md) (agents are square)
