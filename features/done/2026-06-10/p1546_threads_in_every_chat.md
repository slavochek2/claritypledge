---
status: all-done
type: story
rank: 58
workstream: clarity-chat
created_date: '2026-10-22'
tags: [chat, threads, mirror]
disclosure: public
pipeline_ran: [create-spec, dev, ship]
drafted_by: opus
exec_model: opus
exec_effort: high
completed_at: 2026-10-22
---

# P1546: Threads in every chat: direct messages and the mirror, and the mirror answers inside its thread

## Problem

Threads exist in channels only (`src/app/pages/chat/ChatHomePage.tsx:65`: "a thread URL on a 1:1 or the mirror falls back to the chat"). That was a deliberate carry-over from the Telegram-based frame (decisions.md, P1495 prototype entry). In a direct message you cannot split a side topic out. In the mirror you cannot keep separate subjects apart. P1536 needs exactly that: *+ Canvas* opens a new mirror thread.

> Founder, 2026-10-22: "in one-on-one chats, I don't have threads. But why not? Maybe we should allow that. And then chat with the mirror is one of those."

The mirror's answers today carry `reply_to_id` but never `thread_root_id` (`supabase/migrations/20261020213000_p1520_mirror_v2.sql`, completion insert), so an answer would land outside the thread it was asked in.

## Appetite

Blast radius: medium. Thread rules for two more conversation kinds, plus mirror reply placement. Reversibility: medium (RLS/RPC plus UI). Decision density: zero.

## Solution

1. **Server.** Allow thread roots and thread replies in `dm` and `mirror` conversations. `/dev` finds the channel-only condition in `send_chat_message`, the thread read RPCs and RLS. A thread reply is readable exactly by whoever can read its conversation:
   - in a direct message, the two people;
   - in the mirror, the owner only.
2. **Client.** New thread is offered in direct messages and the mirror. The thread panel and thread URLs work there, and reloading a thread URL opens the thread.
3. **Mirror answers in place.** A mirror job triggered by a message inside a thread inserts its answer with that thread's `thread_root_id`. A message outside any thread is answered outside threads. For context, a mirror question asked inside a thread sees that thread first. The general context rules stay P1520's until P1547.

**Copy:** every user-facing string says "mirror agent", never bare "mirror" (founder, 2026-10-22; P1544 Solution 0).

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| A thread reply in a DM leaks to a third person | MITIGATE | RLS check by curl with a third user |
| Mirror answer lands in the wrong thread when two are asked at once | MITIGATE | Job carries the triggering message's root; concurrency test |
| A deleted thread root orphans its replies | MITIGATE | Same behaviour as channels today; e2e covers it |

**Non-Goals:**
- Do NOT change channel threads.
- Do NOT change the context size (P1547).
- Do NOT add Clarify inside the mirror.

## Cost Budget

Applies because the migration changes per-request functions and the canary creates and deletes test users. No new timer, poll, retry or model call: a thread question triggers exactly the one mirror job a non-thread question already does.

| Measure | Per user | Per hour | Per test run |
|---|---|---|---|
| Requests | unchanged: a thread message is one `send_chat_message` RPC, as a chat message is; opening a thread is the existing `listThread` read (2 reads) plus one `get_thread_stats` per page of roots, now also in 1:1s and the mirror | scales with messages sent, as today | `p1546-threads-everywhere.spec.ts`, counted per call site (loops over 2 users counted twice): setup 19 (1 org, 3 users x 3 helper calls = 9, 2 memberships, 3 sign-ins, 2 chat lists, 1 start_dm, 1 mirror lookup); body 22 sends + 8 thread reads + 5 row reads + 4 last_message_at reads + 4 reply requests + 4 begins x 2 calls + 4 completes + 9 other RPCs + 10 refusals + 7 admin reads + 6 extra loop reads = 87; cleanup 13 (1 spend reset, 2 purge, 3 users x 3 helper calls = 9, 1 org). Total 19 + 87 + 13 = 119, bounded at 150 |
| Users created / deleted | 0 | 0 | 3 users, 1 organization; deleted in `afterAll` |
| Log lines | refusals are the existing error paths, unchanged in count | unchanged | 10 expected refusals per run (9 `refused(` call sites: 8 once, 1 in a loop over 2 users = 8 + 2), 1 API log line each = 10 |
| Gemini | unchanged: one job per triggering message, never more | unchanged | 0: the canary drives the service steps with fixed text, never the model |

1. **Fits the plan limit today?** Yes, with this change's share stated; the project's current total is read on the dashboard usage page (registry, "Where usage is read"), not here. Supabase Free (registry row read 2026-10-21): 50,000 MAU and 5 GB egress a month. At 1 run a day: 3 users x 30 days = 90 MAU a month (0.18% of 50,000), and 150 responses x 2 KB x 30 = 9 MB a month (0.18% of 5 GB). Log lines: 10 refusals x 30 = 300 a month; the registry states no ingestion limit, only 1-day retention.
2. **Fits at 10x?** Yes. 10 runs a day: 3 x 10 x 30 = 900 MAU a month (1.8% of 50,000), 90 MB a month (1.8% of 5 GB), 3,000 log lines a month.
3. **Rule 1 (bulk on the server):** cleanup deletes 3 users one call each through `deleteTestUser`. Supabase Auth's admin API deletes one user per call and the repo has no batch helper. This matches every sibling chat canary (p1512, p1520). Chat rows are purged in one batch by `purgeChatFor`. Accepted, at 3 calls per run.

## Acceptance Criteria

- [x] In a direct message, New thread opens a thread; both people read it; a third signed-in user gets nothing (curl).
- [x] In the mirror, a question inside a thread is answered inside that thread; a question outside threads is answered outside; two threads asked at once each get their own answer.
- [x] Thread URLs for a direct message and the mirror reload into the thread.
- [x] Mirror threads are readable by the owner only (curl as another user).
- [x] Deleting a thread root in a direct message behaves as it does in channels.

## Related

P1512 (threads in channels) · P1520 (mirror) · [P1544](../../p1544_mirror_launch_on_prod.md) · [P1547](../../p1547_mirror_memory_token_budget.md) · P1536 (+ Canvas opens a mirror thread)

## Evidence (dev)

- `e2e/integration/p1546-threads-everywhere.spec.ts` against the test DB: all 6 test bodies passed (DM read/outsider/stats; DM single-reply count; mirror owner-only; mirror answers in place incl. two threads completed out of order and context scoping; clarify never copies the agent answer; deleted DM root). The run reported 1 failed only because two `deleteTestUser` calls in `afterAll` hit test-DB statement timeouts; those users were deleted afterwards with the same helper.
- Thread URLs reload into the thread for a 1:1 and the mirror: `src/tests/p1512-chat-ui.test.tsx` (P1546 cases); full unit suite 6884 passed.
- Not run: the p1512 read/write and p1520 canaries. The test project was degraded all session (PostgREST schema-cache timeouts, its schema queries up to 6 s against an 8 s limit), so every attempt failed while creating fixtures, before any assertion. Re-run them before or at ship.
