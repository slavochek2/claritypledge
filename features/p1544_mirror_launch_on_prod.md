---
status: week
type: story
rank: 56
workstream: clarity-chat
created_date: '2026-10-22'
tags: [mirror, privacy, terms, threads]
disclosure: public
delivery_stage: create-spec
pipeline_ran: [create-spec]
drafted_by: opus
exec_model: opus
exec_effort: high
---

# P1544: Mirror on prod: honest policy, hard terms bump, threads in every chat, a mirror that remembers

## Problem

**Situation:** The mirror agent (P1520) and its portrait (P1534, P1537) are built, shipped to main and work on test. On prod they are off by design: `mirror-reply` and `mirror-portrait` were never deployed there, and neither `MIRROR_AI_ENABLED` nor the mirror key is set (decisions.md, the P1520 availability entry). The reason is the privacy policy. It says *"Your mirror is a private chat that only you can read. No AI reads or answers it."* and *"No chat content is sent to an AI provider."*

**Complication:** The founder wants the mirror live:

> Founder, verbatim: "we already have the mirror agent, but it's not responding, so what's the point of having it?"

A Gemini 4 Argon and a Codex review of a first policy draft (2026-10-22, this conversation) found that it would have been false in four places. Each was confirmed in code before this spec was written:
- Mirror context includes Clarify and forwarded copies of other people's messages, direct messages included (`supabase/functions/_shared/mirror-agent.ts:110-118`).
- A copy made before its source was deleted is still sent (`supabase/migrations/20261020213000_p1520_mirror_v2.sql:470-478`).
- The portrait is generated automatically on first open (`src/app/pages/chat/ConversationPane.tsx:95`) and stored at a public URL (`supabase/functions/mirror-portrait/index.ts:109`).
- "Not used for training" is a fact about the Google billing account, not about our code.

Separately, the mirror reads very little (`MAX_IN_TOKENS = 10_000`, a 6,000-character data budget, at most 30 messages) and has no threads, because threads exist in channels only (`src/app/pages/chat/ChatHomePage.tsx:65`).

**Question:** What does the policy, the terms and the product have to say and do so that switching the mirror on is honest, and so the mirror is worth switching on?

## Appetite

Blast radius: high. Every user gets a blocking terms popup, and chat content starts leaving for Google. Reversibility: medium. Unsetting `MIRROR_AI_ENABLED` turns the AI off at once; the terms version stays bumped. Decision density: one open call, the context budget (below). Everything else was decided by the founder on 2026-10-22.

## Founder decisions (2026-10-22, this conversation)

1. **No opt-out setting.** There is no "don't include my messages in other people's mirrors" setting.
   > "This defies the whole purpose of the chat … I can forward your message from WhatsApp or Telegram to my AI anyway."

   The platform still does the sending, so disclosure is ours. That means: a terms sentence, an honest policy, and objections by email, handled case by case (the Art. 21 route lives in the rights section).
2. **Google: name the service and link Google's terms. Never describe Google's behaviour on its behalf.**
   > "why would we on behalf of Google say something?"
3. **Paid tier.** The key's Google Cloud project must have billing enabled, which credits count as. Verify it; never assume it.
4. **Hard bump.** `requiresConsent: true`. This reverses an explicit "no AI" promise and starts sending third-party chat text to a provider. Precedent: v1.4 (`src/app/content/terms-changes.ts`).
5. **Threads in every chat:** direct messages and the mirror, not only channels.
   > "in one-on-one chats, I don't have threads. But why not? Maybe we should allow that."
6. **Clarify stays hidden inside the mirror.** In the mirror it would copy a message into the same chat (`use-message-actions.tsx`, `onClarify` is undefined for `kind === 'mirror'`). Reply, Forward and New thread work as everywhere else.
7. **The mirror reads far more than 30 messages.**
   > "it can read much more than just last 30 because last 30 is very, very little … at some point it should cut because maybe it takes us too many tokens and too much money."

   The founder flagged long forwarded threads as the case needing a rule. The rule is in Solution 3.

## Solution

1. **Policy (`src/app/content/privacy.md`).** Rewrite the four sections that make the mirror promise:
   - *Who can read a chat*
   - *How it is stored*
   - *AI features*: a new **Your mirror** bullet
   - *Legal Bases* and *Who Processes Your Data* (the Gemini API row)
   
   The new text describes what the code does, item by item, as found in review:
   - **Triggers:** a message in your mirror, Clarify, an ask about a group or event chat.
   - **What is sent:** the current context (Solution 3), names, chat titles, Clarify and forwarded copies including direct messages, and copies made before a source was deleted.
   - **Who sees the answer:** only the asker. Nothing posts in the original chat.
   - **Account deletion:** answers built on a deleted account's words are cleared, and nothing already sent can be recalled.
   - **Portrait:** made on first open and on New face, no data about the owner in the prompt, stored at a public link.
   - **Google:** named as the Gemini API, with a link to Google's own terms and no paraphrase of them.
   - **Rights:** an objection line ("object to your messages being read by another member's mirror: email …").
   
   Draft it, then run Gemini and Codex against the code before it ships. Every factual sentence gets a `file:line`.
2. **Terms.** One sentence in the terms of service: *"Messages you post in a group, event or direct chat can be read by the AI mirror of another person in that chat when they ask it about the chat or copy your message into it."* [FOUNDER DECISION: wording.] Bump `CURRENT_TERMS_VERSION` with a `TERMS_CHANGES` entry, `requiresConsent: true`, one headline and at most three highlights. [FOUNDER DECISION: headline wording.]
3. **Context: the mirror remembers.** Replace the 30-message, 6,000-character window with a token budget. Selection, newest first, until the budget is spent:
   - **In a mirror thread:** the whole thread first, then recent mirror messages outside it.
   - **In the mirror's main chat:** recent mirror messages, threads included as their root plus a line saying how many replies they have.
   - **For a channel ask:** that channel's readable messages under the existing access rules (from the asker's access time, deleted ones excluded).
   - **A forwarded or Clarified thread** counts as one item with its own cap, 20% of the budget. Past the cap the oldest replies are dropped, and the mirror is told "showing the last N of M replies", so it never claims to have read what it did not.
   - The request is refused and never sent when the assembled prompt would exceed the budget. That is today's rule, kept.
   
   [FOUNDER DECISION: the context budget. Options and costs are in the Cost Budget. Recommendation: **50,000 input tokens**. That is about 35,000 words, several hundred chat messages, for about 4 US cents per reply at today's price. 10× the current window at 3.5× the current cost per reply, since the output side does not grow.]
4. **Threads in every chat.** Allow New thread in direct messages and the mirror. The server rule that today permits threads only in channels (`/dev` locates it in `send_chat_message`/RLS and the thread RPCs) widens to all conversation kinds. The thread panel and the thread URL work for direct messages and the mirror. Today a thread URL on those falls back to the chat (`ChatHomePage.tsx:65`). The mirror answers inside a thread when asked inside it.
5. **Go live.** Verify the key's project billing (decision 3), set `MIRROR_AI_ENABLED` and the mirror key on prod, deploy both functions, and run the edge smoke plus one real reply and one portrait on the founder's account.

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| A long context makes injected text in a forwarded message more likely to steer the mirror | MITIGATE | The existing real-model red-team suite (P1520) is re-run at the new budget, with a control test; quoted text stays data, never instructions |
| Bigger context multiplies cost per reply | MITIGATE | Reservation formula uses the new `MAX_IN_TOKENS`; existing per-person and global daily caps unchanged (values kept private), so fewer replies fit under the same cap rather than more money |
| The blocking popup annoys returning users | ACCEPT | Founder decision 4; the change reverses an explicit promise |
| A member objects by email | ACCEPT | Handled case by case; a product-level setting was rejected (decision 1) |
| Gemini prices double after 2026-12-31 (registry) | ACCEPT | The reservation already uses the post-promo price; the caps hold |

**Non-Goals**
- Do NOT add an opt-out setting.
- Do NOT change who can read what in a chat, or the mirror's owner-only rule.
- Do NOT add file uploads to chat. That is P1536.
- Do NOT add Clarify inside the mirror.
- Do NOT add per-mirror memory beyond the conversation (no summaries stored elsewhere).

## Cost Budget

Registry: Gemini API row, `docs/technical/metered-services.md`, read 2026-10-21. Model `gemini-3.8-flash`: $0.75 input / $3.75 output per 1M tokens through 2026-12-31, then $1.50 / $7.50. The code reserves at $1.50 / $7.50 × 1.25 (`mirror-agent.ts`).

| Measure | Per reply | Per user per day | Per test run |
|---|---|---|---|
| Requests | 1 Gemini call per reply (unchanged) | 20 replies × 1 = 20 calls (planning figure) | red-team suite: `/dev` counts the calls, then N × the per-reply cost |
| Tokens, today (10k in) | 10,000 × $0.75/1M + 1,200 × $3.75/1M = $0.0075 + $0.0045 = **$0.012** | 20 × $0.012 = $0.24 | — |
| Tokens at **50k (recommended)** | 50,000 × $0.75/1M + 1,200 × $3.75/1M = $0.0375 + $0.0045 = **$0.042** | 20 × $0.042 = **$0.84** | — |
| Tokens at 100k | 100,000 × $0.75/1M + $0.0045 = **$0.0795** | 20 × $0.0795 = $1.59 | — |
| Reservation at 50k (post-promo, ×1.25) | (50,000 × $1.50 + 1,200 × $7.50)/1M × 1.25 = ($0.075 + $0.009) × 1.25 = **$0.105** | — | — |

A reply rarely uses the full budget; these are ceilings. Daily caps are unchanged and private. `/dev` reports how many replies the per-person cap now allows.

## Acceptance Criteria

- [ ] The privacy policy's mirror text matches the code on every point listed in Solution 1. Each factual sentence carries a `file:line` in the build report, confirmed by a Gemini and a Codex review.
- [ ] The policy names the Gemini API and links Google's terms, and paraphrases none of them.
- [ ] A returning user on the previous terms version gets the blocking popup with the new headline. Declining logs them out; accepting records `acceptance_mode = explicit`.
- [ ] In a direct message and in the mirror, New thread opens a thread; its URL reloads into the thread; a thread reply in a direct message is readable by both people and nobody else (RLS checked by curl).
- [ ] Asked inside a mirror thread, the mirror's request contains that whole thread (shown by the request log on test). Asked in the main mirror chat, it contains messages older than the old 30-message window.
- [ ] A forwarded thread over the per-item cap is cut to its newest replies, and the request tells the model "showing the last N of M".
- [ ] Clarify is not offered inside the mirror; Reply, Forward and New thread are.
- [ ] The red-team suite passes at the new budget, with its control failing as designed.
- [ ] On prod: one real reply and one portrait on the founder's account. Smoke passes. Sentry shows no new errors in 10 minutes. `[post-deploy]`

## Pre-deploy Checklist

### Secrets to provision
- [ ] Confirm the mirror key's Google Cloud project has billing enabled (credits count). Record the project, not the figures, in `.private/docs/accounts.md`.
- [ ] Set `MIRROR_AI_ENABLED=true` and the mirror's Gemini key on **prod** edge functions, via `/slava:util:ai-keys`; spend-capped.

### Deploy commands
- [ ] Deploy `mirror-reply` and `mirror-portrait` to prod (through `/push`'s function deploy). Only after the policy and terms changes are live on main.

### Post-deploy verification
- [ ] `node scripts/edge-function-smoke.mjs --only mirror-reply,mirror-portrait` on prod.
- [ ] Sentry clean for 10 minutes.

## Open Questions

1. Does the Gemini key for the mirror sit in the same Google Cloud project as the other keys, or its own? `/dev` reads it from ai-keys and records it privately.

## Related

P1520 (mirror v2), P1534 / P1537 (portrait), P1512 (Clarity Chat, privacy policy), P1536 (canvas from material, depends on this), decisions.md P1520 availability entry, `src/app/content/terms-changes.ts`, `docs/technical/metered-services.md`
