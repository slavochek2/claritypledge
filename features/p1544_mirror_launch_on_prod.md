---
status: qa
type: story
rank: 56
workstream: clarity-chat
created_date: '2026-10-22'
tags: [mirror, privacy, terms]
disclosure: public
delivery_stage: dev
pipeline_ran: [create-spec, dev]
drafted_by: opus
exec_model: opus
exec_effort: high
---

# P1544: Mirror on prod: honest policy, hard terms bump, server-side terms gate

**Split 2026-10-22 after spec review.** Gemini 4 Argon and Codex both recommended splitting, and the founder decisions are preserved across all three:
- **P1544** (this spec) switches the mirror on, at today's context.
- **[P1546](p1546_threads_in_every_chat.md):** threads in direct messages and the mirror.
- **[P1547](p1547_mirror_memory_token_budget.md):** the mirror reads far more.

Each ships on its own. P1536 needs P1544 and P1546.

## Problem

**Situation:** The mirror agent (P1520) and its portrait (P1534, P1537) are on main and work on test. On prod they are off by design:
- `mirror-reply` and `mirror-portrait` were never deployed;
- neither `MIRROR_AI_ENABLED` nor the mirror key is set (decisions.md, the P1520 availability entry).

The reason is the privacy policy, which says *"Your mirror is a private chat that only you can read. No AI reads or answers it."* and *"No chat content is sent to an AI provider."* (`src/app/content/privacy.md`, Clarity Chat section).

**Complication:** The founder wants it live:

> Founder, verbatim: "we already have the mirror agent, but it's not responding, so what's the point of having it?"

A first policy draft, reviewed by Gemini and Codex on 2026-10-22, would have been false in four places. Each was confirmed in code:
- Context includes Clarify and forwarded copies, including direct messages (`supabase/functions/_shared/mirror-agent.ts:110-118`).
- A copy made before its source was deleted is still sent (`supabase/migrations/20261020213000_p1520_mirror_v2.sql:470-478`).
- The portrait is made on first open (`src/app/pages/chat/ConversationPane.tsx:95`) and stored at a public URL (`supabase/functions/mirror-portrait/index.ts:109`).
- "Not used for training" is a fact about the Google account, not our code.

A review of this spec also found that nothing on the server checks terms acceptance before an AI call (`supabase/functions/mirror-reply/index.ts`, no terms read).

**Question:** What must the policy, the terms and the server say and do so that switching the mirror on is honest?

## Appetite

Blast radius: high. Every user gets a blocking popup, and chat text starts going to Google. Reversibility: medium. Unsetting `MIRROR_AI_ENABLED` stops the AI at once; the terms version stays bumped. Decision density: the wording below, plus two rules flagged for the founder.

## Founder decisions (2026-10-22, this conversation)

1. **No self-serve opt-out setting.**
   > "This defies the whole purpose of the chat … I can forward your message from WhatsApp or Telegram to my AI anyway."

   The platform does the sending, so disclosure is ours: a terms sentence, an honest policy, and objections by email.
2. **Google: name the service and link Google's terms. Never describe Google's behaviour on its behalf.**
3. **Paid tier.** The key's project must have billing enabled, which credits count as. Verify it.
4. **Hard bump** (`requiresConsent: true`). This reverses an explicit "no AI" promise. Precedent: v1.4.
5. **Clarify stays hidden inside the mirror** (`use-message-actions.tsx`: `onClarify` is undefined for `kind === 'mirror'`).

## Solution

0. **Terminology (founder, 2026-10-22): "mirror agent", never bare "mirror", in everything a user reads**: policy, terms, popup, and every UI string (today e.g. "Write to your mirror", "Could not ask your mirror. Try again.", "Could not open your mirror."). "Mirror" alone reads as a picture of yourself. `docs/definitions.md` already defines *mirror agent*.

1. **Policy (`src/app/content/privacy.md`).** Rewrite the mirror promises in *Who can read a chat*, *How it is stored*, *AI features* (a new **Your mirror** bullet), *Legal Bases*, *Who Processes Your Data* (the Gemini API row) and *Your rights*. The text describes what the code does. Every factual sentence carries a `file:line` in the build report.
   - **Triggers:** a message in your mirror, Clarify, an ask about a group or event chat.
   - **What is sent:** recent context under a size limit, named generically ("recent messages, up to a limit") so that P1547 does not force another rewrite. That includes names, chat titles, and Clarify and forwarded copies, direct messages included, and copies made before their source was deleted.
   - **Who sees the answer:** only the asker. Nothing is posted in the original chat.
   - **Account deletion:** answers built on a deleted account's words are cleared (`derived_refs` erasure, P1520). Nothing already sent can be recalled.
   - **Portrait:** made on first open and on New face, contains no data about the owner, stored at a public link, and stays stored when the owner's account is erased (`20261020213000_p1520_mirror_v2.sql:48`).
   - **Google:** "the Gemini API", with a link to Google's own terms and no paraphrase.
   - **Legal basis:**
     - *Contract (Art. 6(1)(b))* for what the asker sends.
     - *Legitimate interest (Art. 6(1)(f))* for other members' messages. The interest is understanding a conversation the asker is part of. It is limited to what the asker can already read, other members are told at the hard bump, and they can object.
     - The existing instruction not to post special-category information is extended to chats.
   - **Objecting:** say plainly that a member who does not want their words read by other members' mirror agents can delete their messages or delete their account, which removes their words everywhere, Clarify and forwarded copies included (P1520 erasure). Objections by email get that same answer (Solution 4). **Build correction (2026-10-22, Gemini + Codex review, confirmed in code):** leaving a chat does NOT remove earlier messages from other members' mirror agent context (the context reads by the asker's access, not author membership), so the policy says leaving only stops future posts.
2. **Terms.** One sentence in the terms of service, with a `CURRENT_TERMS_VERSION` bump and a `TERMS_CHANGES` entry with `requiresConsent: true`. Draft wording:
   - Terms: *"Messages you post in a group, event or direct chat can be read by the mirror agent of another person in that chat, when they ask it about the chat or copy your message into it."*
   - Popup headline: *"Your mirror agent can now answer you, using Google's Gemini."*
   - Highlights:
     - What it reads.
     - Other members' mirrors may read what you post.
     - How to object.
   
   Build with this wording; the founder confirms or rewrites it at UAT (founder, 2026-10-22: proceed).
3. **Server-side terms gate.** `mirror-reply` and `mirror-portrait` refuse unless the caller has accepted the current terms version, and they say so as a typed error the client shows. A cached old client or a direct API call cannot reach Gemini otherwise.
4. **Objection = leave or delete; no partial opt-outs (founder, 2026-10-22).** No per-person flag and no "delete this one message for me" requests by the operator. Members already delete their own messages themselves; account deletion is the complete remedy and already erases their words from every copy and every mirror agent answer built on them. Messages posted before launch are treated like any other (founder: "we can assume there is none").
   > Founder: "I cannot delete only a portion of their data ... I can delete the whole thing, you including your profile. Which one do you want?"
5. **Go live.** Verify the key's project billing (decision 3). Set `MIRROR_AI_ENABLED` and the mirror key on prod. Deploy both functions after the policy, terms and the SQL for Solution 3 are on prod. Run the edge smoke, one real reply and one portrait on the founder's account.

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| Old client reaches Gemini before accepting | MITIGATE | Solution 3, server-side |
| An objection that wants less than account deletion | ACCEPT | Founder decision; members can still delete their own messages. Not lawyer-reviewed: if a legal request ever insists on partial handling, revisit |
| The blocking popup annoys returning users | ACCEPT | Decision 4 |
| Gemini price doubles after 2026-12-31 | ACCEPT | The SQL reservation (`reply_max_usd` 0.03) already uses the post-promo price |

**Non-Goals**
- Do NOT change the context size (P1547) or add threads (P1546).
- Do NOT add a user-facing opt-out.
- Do NOT add Clarify inside the mirror.

## Cost Budget

Registry: the Gemini API row in `docs/technical/metered-services.md`, read 2026-10-21. Model `gemini-3.8-flash`, $0.75 / $3.75 per 1M tokens through 2026-12-31, then $1.50 / $7.50. Context is unchanged here, so per-call figures are P1520's.

| Measure | Per user | Per hour | Per test run |
|---|---|---|---|
| Reply calls | ≤10,000 in × $0.75/1M + ≤1,200 out × $3.75/1M = $0.0075 + $0.0045 = **≤$0.012** per reply; reservation $0.03 (`_mirror_limits`) | bounded by the private global daily cap | red-team suite: 7 tests (`e2e/integration/p1520-mirror-redteam.spec.ts`), ≤3 replies each = ≤21 × $0.012 = **≤$0.25** |
| Portrait runs | reservation `portrait_max_usd` **$0.70** per run (2 generations × primary+fallback + 2 vision checks, × 1.25; `20261020213000_p1520_mirror_v2.sql:156`); first open + New face | bounded by the private portrait cap | 1 run on prod verification = **≤$0.70** |
| Supabase requests | 1 edge invocation + 1 auth lookup + 1 terms-gate profile read (new, P1544) + 1 `mirror_request_reply` + 1 `_mirror_begin_job` + 1 `_mirror_complete_job` = **6** per reply; portrait: invocation + auth + terms read + begin + upload + settle = 6 | 6 × replies | 21 replies × 6 = **≤126** for the suite, + 6 for one portrait |
| Egress | one reply row ≤1,200 out tokens ≈ ≤6 KB via Realtime + response ≈ **≤12 KB** per reply; one portrait image ≈ ≤1 MB on first view | 12 KB × replies | 21 × 12 KB ≈ **≤0.25 MB** + ≤1 MB portrait, against 5 GB/month free |
| Log lines | ≤2 per reply (P1453 rule: codes only, never content) | 2 × replies | 21 × 2 = **≤42** |

**Fits today:** yes. Spend is bounded by the existing private daily caps; monthly ≤ 30 × the global daily cap. **At 10×:** the caps refuse further replies rather than spend more. Raising them is a founder call with the figures in `.private/`.

## Acceptance Criteria

- [x] Every factual sentence of the new mirror text in the policy is backed by a `file:line` in the build report, and a Gemini and a Codex review find no false statement.
- [x] The policy names the Gemini API and links Google's terms without paraphrasing them.
- [x] A user on the previous terms version gets the blocking popup with the new headline. Declining logs out; accepting records `acceptance_mode = explicit`.
- [x] `mirror-reply` and `mirror-portrait` refuse a caller who has not accepted the current version (curl with an old-version test user on test), and the client shows the refusal.
- [x] Deleting a member's account removes their words from every later mirror agent request and clears answers built on them (P1520 erasure, re-run on test), and the policy says so.
- [x] The P1520 red-team suite passes on test. Its first test, the positive control that proves the model reads its context, passes.
- [x] Clarify is not offered inside the mirror agent chat.
- [x] No user-facing string says "mirror" without "agent" (grep of `src/app` strings and the policy/terms text, list attached).
- [ ] On prod: one real reply and one portrait on the founder's account, edge smoke passes, and Sentry is clean for 10 minutes. `[post-deploy]`

**Evidence (2026-10-22, test project, branch HEAD 4aa788850):**
- AC1/AC2: sentence-to-code map in the build report; Gemini + Codex + Sonnet reviews, every false statement found was fixed (objection wording, attachment kind, "cannot be copied"); Gemini re-review of the fixes found none.
- AC3: `e2e/p1300-terms-popup.spec.ts` — accept records acceptance and closes the notice ✓, documents open ✓. The smoke test fails only on console CORS errors because slot w14's dev port 6400 is outside `_shared/cors.ts` DEV_ORIGIN_RE (pre-existing, filed); its popup assertions ran before the console check.
- AC4: `e2e/integration/p1544-terms-gate-live.spec.ts` 3 passed (v1.4 user → 409 from both functions, 0 jobs, 0 spend; current-version control → 404 NOT_AVAILABLE). Refusal UI: `src/tests/p1520-mirror-ui.test.tsx`.
- AC5/AC6: `p1520-mirror-redteam` + `p1520-mirror-canary` 18 passed, 1 flaky (channel ask Realtime delivery control, passed on retry; unrelated to P1544). Erase scrub + its control passed.
- AC7: `src/tests/p1520-mirror-ui.test.tsx:135` (no Clarify in the mirror).
- AC8: grep of `src/app` (.ts/.tsx) and policy/terms text — no bare "mirror" in chat UI; remaining hits are the landing-lab rehearsal (different feature, founder decision open), the pledge verb "mirror back", and policy line wraps before "agent".

## Pre-deploy Checklist

### Secrets to provision
- [ ] Confirm the mirror key's project has billing enabled. Record which project in `.private/docs/accounts.md`, with no figures.
- [ ] Set `MIRROR_AI_ENABLED=true` and the mirror Gemini key on prod edge functions, via `/slava:util:ai-keys`, spend-capped.

### Deploy commands
- [ ] Policy, terms and the SQL for Solution 3 are live on prod first (`/push` applies the migrations).
- [ ] Then deploy `mirror-reply` and `mirror-portrait` to prod.

### Post-deploy verification
- [ ] `node scripts/edge-function-smoke.mjs --only mirror-reply,mirror-portrait` on prod.
- [ ] Sentry clean for 10 minutes.

## Related

P1520 (mirror v2) · P1534 / P1537 (portrait) · P1512 (Clarity Chat policy) · [P1546](p1546_threads_in_every_chat.md) · [P1547](p1547_mirror_memory_token_budget.md) · P1536 (needs this) · `src/app/content/terms-changes.ts` · `docs/technical/metered-services.md`
