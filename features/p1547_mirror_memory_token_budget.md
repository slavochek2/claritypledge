---
status: in-progress
type: story
rank: 59
workstream: clarity-chat
created_date: '2026-10-22'
tags: [mirror, context, cost]
disclosure: public
delivery_stage: dev
pipeline_ran: [create-spec, dev]
drafted_by: opus
exec_model: opus
exec_effort: high
---

# P1547: The mirror remembers: a token budget instead of 30 messages

## Problem

The mirror reads at most 30 messages. Each is cut to 1,000 characters, copied replies to 500, and copied threads to 10 replies (`supabase/migrations/20261020213000_p1520_mirror_v2.sql:470-523`). The whole data block is capped at 6,000 characters inside a 10,000-token request (`supabase/functions/_shared/mirror-agent.ts`: `MAX_IN_TOKENS`, `DATA_CHAR_BUDGET`).

> Founder, 2026-10-22: "it can read much more than just last 30 because last 30 is very, very little and doesn't have much context ... at some point it should cut because maybe it takes us too many tokens and too much money."

The founder named one case that needs a rule:

> "if I forward a thread, and especially if it's long, I think there we need some kind of discussion on how to deal with that."

## Appetite

Blast radius: medium. Cost per reply, erasure provenance, and injection surface all grow with context. Reversibility: high. The budget is one value in SQL and code. Decision density: zero (budget decided: 50,000).

## Solution

1. **One budget, measured in tokens, covering the whole request:** fixed rules, metadata, escaping and data. Measure with the model's token counter or a stated conservative estimate (characters ÷ 3), and test Unicode and escaped input at the exact boundary.

   **Build correction (/dev, 2026-10-23):** a plain characters ÷ 3 is not conservative for CJK or emoji, which tokenise at about one token per character or worse. The estimate used (`mirror-agent.ts` `estimateTokens`) is ASCII ÷ 3 rounded up, each other code point 1 token, each emoji (outside the BMP) 2.

   **Budget: 50,000 tokens (founder approved, 2026-10-22)**, 5× today's 10,000-token request. That is roughly 35,000 words, several hundred messages, for about 4 US cents per reply at today's price, 3.5× today's cost (the output side does not grow).
2. **Selection, newest first, until the budget is spent:**
   - **In a mirror thread** (P1546): that thread first, newest first. If the thread alone exceeds the budget, the oldest replies are dropped and the model is told "showing the last N of M messages of this thread".
   - **Then** recent mirror messages outside the thread. Other threads appear as their root plus "N replies".
   - **Channel ask:** that channel's readable messages under the existing access rules, (deleted accounts' words never, P1520 erasure).
   - **A forwarded or Clarified thread** is one item with its own cap, 20% of the budget. Past it, the oldest replies are dropped and the model is told "showing the last N of M replies". Founder's case: it is read, to an extent, and the mirror never claims to have read what it did not.
   - **A single message over the remaining budget** is cut, with a marker. The per-message 1,000/500-character cuts go; the item caps above replace them.
3. **Spend.** Raise `_mirror_limits().reply_max_usd` to match the new ceiling: at 50k, (50,000 × $1.50 + 1,200 × $7.50)/1M × 1.25 = **$0.105**. Keep `mirror-agent.ts` and SQL from drifting with one shared test. The per-person and global daily caps are unchanged and private, so fewer replies fit under them. `/dev` reports how many.
4. **Erasure provenance widens with the context.** Every row that reaches the request, including transitive references from earlier mirror answers and authors of thread and copied replies, contributes to `derived_refs` and is locked `FOR SHARE` the way the 30-row selection is today (`20261020213000_p1520_mirror_v2.sql:533`).

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| Larger context makes injection more effective | MITIGATE | Red-team suite extended: attacks placed near the budget boundary and inside native and copied threads; the positive control still passes |
| An answer depends on an author missing from `derived_refs` | MITIGATE | Solution 4, erasure tests for old messages, thread authors and copied replies, including a concurrent erase |
| Reservation and code drift apart | MITIGATE | Shared test (Solution 3) |
| Cost per reply 3.5× | ACCEPT | Caps unchanged; fewer replies per day under them |

**Non-Goals:**
- Do NOT store summaries or memory outside the conversation.
- Do NOT change who can read what.

## Cost Budget

Registry: the Gemini API row, read 2026-10-21 (`gemini-3.8-flash`, $0.75 / $3.75 per 1M tokens through 2026-12-31, then $1.50 / $7.50).

| Measure | Per reply | Per user per day | Per test run |
|---|---|---|---|
| Tokens at 10k (today) | 10,000 × $0.75/1M + 1,200 × $3.75/1M = **$0.012** | 20 × $0.012 = $0.24 | — |
| Tokens at **50k** | 50,000 × $0.75/1M + 1,200 × $3.75/1M = $0.0375 + $0.0045 = **$0.042** | 20 × $0.042 = **$0.84** | extended red-team: 7 tests + 4 new boundary/thread attacks = 11, ≤3 replies each = ≤33 × $0.042 = **≤$1.39** |
| Tokens at 100k | 100,000 × $0.75/1M + $0.0045 = **$0.0795** | 20 × $0.0795 = $1.59 | ≤33 × $0.0795 = ≤$2.62 |
| Reservation at 50k | ($0.075 + $0.009) × 1.25 = **$0.105** | — | — |
| Supabase requests / logs per reply | 5 inside mirror-reply (auth, terms, request_reply, begin, complete) + the invoke = 6. Log lines ≤ 2 (mirror-reply's own, as P1544) + 1 (at most one countTokens warning: the counter stops after its first failure) = **≤3**. countTokens (Gemini, free) ≤3 calls | — | see below |

**`e2e/integration/p1547-mirror-budget.spec.ts`, one run, Supabase requests (recounted in review, /dev 2026-10-23; helper costs are estimates from `e2e/helpers/`):**
- 17 members × ~6 (create user ≈3, membership 1, sign-in 1, chat list 1) + 1 group lookup = **~103**
- message sends: 42 + 2 + 3 + 37 (part 1) + 42 + 36 + 2 + 3 (part 2) = **167** (the filler loops are 155 of them)
- 6 clarifies + 5 mirror lookups × 2 = **16**
- DB-only jobs: 7 + 6 + 10 + ≤12 (race: ≤8 starts) = **≤35**
- model tests: 4 × (availability 2 + reply 6) + 1 mirror_ask = **33**
- setup/cleanup: org 1 + chat purge ~4 + 17 user deletes × ~10 + org delete ~2 = **~177**
- total: 103 + 167 + 16 + 35 + 33 + 177 = **~531 requests**, ≤4 replies × 3 = **≤12 edge log lines** (availability checks log nothing); Gemini: 4 replies, ≤4 × $0.042 = **≤$0.17** actual at today's price (reserved 4 × $0.105).

**Fits today:** spend is bounded by the private daily caps; monthly ≤ 30 × the global daily cap. **At 10×:** the caps refuse further replies. Raising them is a founder call with figures in `.private/`. The figures are ceilings: a short conversation costs what it uses.

## Known limitations (accepted, review rounds 1-2)

- **The 20% copy cap is an estimate.** Each copy is held to 20% of the budget by the local estimate only; the whole request is counted by the model (or the byte bound) before sending, so the total never passes 50,000, but one copy can come out somewhat over or under its 10,000.
- **Skipped rows.** A row an erase (or an edit) is holding while a reply starts is skipped (`FOR SHARE SKIP LOCKED`), never waited for: that reply does not see it. Its derived_refs match exactly the rows read.

- **Erasure over-includes.** derived_refs covers every row SQL *offered*, including rows the edge then trimmed for the budget. Erasing such an author clears answers that never actually saw their words, and the same holds for copied-thread entries SQL trimmed to 15,000 characters (refs come from the whole stored thread). This is the safe direction.
- **Legacy copies.** Clarify copies made before P1547 hold the *oldest* 100 thread entries and no `thread_total`, so "last N of M" counts only what was stored. A thread entry without `author_ref` would stay outside derived_refs. No migration ever wrote one (P1512 introduced the copied thread and `author_ref` together), so this only matters for a hand-edited snapshot.
- **Look-alike marker.** Anyone can type text that resembles the cut marker (`[... cut: too long to show in full]`). It sits inside quoted data and carries no authority, but the model cannot tell a real cut from a typed one.

## Acceptance Criteria

- [ ] A mirror question sees messages older than the old 30-message window, shown by intercepting the outbound request on test with synthetic fixtures (never by logging content).
- [ ] An oversized mirror thread is cut to its newest messages and the request says "showing the last N of M".
- [ ] A forwarded thread over 20% of the budget is cut the same way.
- [ ] A request never exceeds the budget, tested at the exact boundary with Unicode and escaped input.
- [ ] `reply_max_usd` equals the formula at the chosen budget; the shared test fails if code and SQL differ.
- [ ] Erasing an author whose words reached a mirror answer via an old message, a thread reply or a copied reply clears that answer, including when the erase races a starting job.
- [ ] The extended red-team suite passes; its positive control passes.

## Related

P1520 (mirror v2: selection, erasure, spend) · [P1544](p1544_mirror_launch_on_prod.md) (launch) · [P1546](p1546_threads_in_every_chat.md) (threads) · `docs/technical/metered-services.md`
