---
status: in-progress
type: story
rank: 109
workstream: clarity-chat
created_date: '2026-10-23'
tags: [chat, profile, discovery]
disclosure: public
delivery_stage: dev
pipeline_ran: [create-spec, create-spec.2, dev]
drafted_by: opus
exec_model: opus
exec_effort: high
spec_review_hash: c216ba0f9acb392a9d570fd667c0db05ea71ed7b54196b2336e5a95a866560e9
spec_review_vendors: [codex]
---

# P1556: Find and message a person — handle, personal code and link

## Problem

Two people meet in person, or know each other from outside Clarity Pledge, and want to talk in Clarity Chat. Today they can't. A 1:1 can only start between people who share a Clarity Group, an event or an active Clarity Partner agreement: the server's `start_dm` refuses everyone else (`cannot start a conversation with this person`, `20261019203000_p1512_clarity_chat.sql`), and New message search only lists people with such a connection. A person's handle is their profile address (`/p/<handle>`); it is not shown on the profile, appears in New message only to tell apart two people with the same name, and search matches names, not handles. So nobody knows their own handle or where to type someone else's.

> Founder, 2026-10-23: "how in chat am I supposed to find a person and message this person? ... Is there like a QR code that they can generate and exchange? Can they find each other by nickname? Is there like a page like slash me in Telegram?"

> Founder, 2026-11-05: "two users meet each other. They are not connected on Clarity Pledge. They don't have a chat. How do they find each other? ... on WhatsApp they just say here is my QR code scan you scan you connect if you don't have WhatsApp you scan and register"

It is also the fast path to transcribing together: once two people have a 1:1, one taps Transcribe and the other taps Join, which already exists (P1604). This replaces a parked idea of a QR invite into a transcription session (decisions.md, 2026-11-05).

## Appetite

Blast radius: medium. It touches profile, chat start and who may reach whom, including the server rule on starting a 1:1. Reversibility: medium; a code once printed or shared keeps working until reset. Decision density: settled with the founder on 2026-11-05/06, except the copy and link format below.

## Solution

**Prototype:** `/tree/find-connect`, version C, on branch `feature/p1643-find-and-connect` (DEV-only, render-only). It was built and reviewed before this spec was found and merged into it. The prototype predates the decisions below: where they differ (a notice to the code-shower, a separate landing screen, the code inline on the profile), this spec wins.

1. **Personal code.** Each member has a permanent personal code: a link containing a random token, not their handle, shown as a QR with Copy link and Share. A **Reset code** action replaces the token, so every old copy, printed or sent, stops working. The token is random because handles derive from names (`generateSlug`, `api.ts:687`), so a handle-based link would let anyone guess their way into messaging.
2. **Opening a code means consent.** Opening a valid code link, by scanning or from a sent link, starts or opens a 1:1 with its owner, even with no shared group, event or agreement. Being shown or sent the code is the owner's consent. Block and the daily new-1:1 limit (P1512 D2) still apply.
3. **Where the code lives.**
   - A code icon beside the + at the top of the chat list, one tap away.
   - A **My code** button on your own profile, opening the same sheet. The code is not shown inline on the profile.
   - A **My code** row at the top of the New message dialog, with **Invite a Clarity Partner** moved up beneath it as an ordinary row; it is no longer pinned to the bottom.
   - The + stays an icon; on desktop it already has a "New message" tooltip.
4. **Scanning without an account** opens the code's page, which shows who they are connecting with (name and photo) and hands off to the existing Google sign-in, sign-up and log-in, each returning to the code to finish. Signed-in people go straight to the chat. No new sign-up or log-in form is built.
5. **Handle.** Shown on every profile under the name, and tapping it copies it. Exact-handle search in New message finds anyone's profile. **Message** shows on a profile and in search results only where messaging is allowed (a shared connection, or a 1:1 that already exists); otherwise the result points to their code.
6. **No scan notice.** The person showing the code gets no "X scanned your code" alert; the new chat appearing in their list is the signal.

### Server contract (from the spec review, 2026-11-06)

- **The token reaches the server.** A new function redeems a token: it resolves the owner, applies the checks below and creates or returns the 1:1, in one transaction. The client never turns a token into a profile id and calls `start_dm` with it. `start_dm` and `_chat_dm_for_share` (P1545) keep the shared-connection rule unchanged; the token is the only new way past it.
- **Token:** at least 128 bits from a cryptographic generator, unique, stored where only its owner can read it (reading your own code and resetting it are owner-only calls). A deleted account's token goes with it.
- **Reset** replaces the token under a row lock that redemption also takes, so a redemption either finishes before the reset or sees the new token and fails. Reset stops **new** chats only: a 1:1 that already exists stays usable, as every 1:1 does today ("An existing conversation stays usable after the shared connection ends").
- **Checks on redemption, in order:** signed in; token valid; not your own code (opens your own profile instead); not blocked in either direction (`_chat_blocked_either`); the scanner's daily limit (D2); and a new **owner-side limit**: at most 20 new chats per day may start from one person's code. Past it, the code says it is paused until tomorrow. Agent and mirror profiles get no code.
- **Before sign-up,** a public lookup returns only the owner's name and photo for a valid token, so the sign-up page can say who they are connecting with. An invalid, reset or deleted code shows "This code no longer works" before sign-up, never after. All failures show the same message, so a probe cannot tell blocked from invalid.
- **Return after sign-up:** the code path is added to the post-login allowlist (`src/auth/redirect-allowlist.ts`), so the redemption runs after Google sign-in and after email confirmation.
- **The token is a secret in the URL.** Treat it like a room code (P1304): redact it in Sentry and Mixpanel, stop session recording on the code page, and send no referrer from it.
- **Exact-handle search** is a new server function, separate from `search_chat_people`: it trims spaces, drops a leading `@` or a pasted profile URL, ignores case, and returns at most one profile on an exact match, shown above the connection results. Blocked people are not returned.
- **Profile Message button** shows when a 1:1 exists or a shared connection does, and neither side has blocked the other; that check is a server call.

[FOUNDER DECISION: link format, e.g. `claritypledge.com/c/<token>`.]
[FOUNDER DECISION: all new wording: the sign-up context line, the sheet's caption, the Reset confirmation, the "not reachable, ask for their code" line.]

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| A posted code lets strangers message the owner | MITIGATE | Reset code; block; the owner-side limit of 20 new chats a day (the existing limit caps only the scanner) |
| The token leaks through a URL | MITIGATE | Redaction and no referrer, as for room codes |
| Guessing tokens | MITIGATE | 128-bit tokens; identical failure messages |
| The camera → browser or installed app → sign-up → chat handoff loses the destination on some phones | MITIGATE | Tested on a real iPhone and a real Android before done |
| Guessing handles to find profiles | ACCEPT | Profiles are already public at `/p/<handle>`; exact match only, no browsing |
| No message requests or report button | DEFER | Open handle messaging waits for them |

**Non-Goals**
- Do NOT let a handle alone start a 1:1. Only a code, or the existing shared-connection rule, does.
- Do NOT add handle editing in v1. Profile links are already shared in letters and badges, and a change would break them; filed separately.
- Do NOT add partial or name search beyond today's connection-scoped search. Exact handle only.
- Do NOT expose email addresses for discovery.
- Do NOT build an in-app camera scanner; the phone camera opens the link.

## Cost Budget

Every call is one Supabase RPC on the shared project; none runs on a timer, a retry loop or per row.

| Measure | Per user | Per hour | Per test run |
|---|---|---|---|
| Requests | opening My code: 1 (`get_my_contact_code`) · Reset: 1 · opening a code: 1 lookup signed out + 1 redeem = 2 · viewing someone's profile: 1 (`can_message_profile`) · New message: 1 exact-handle lookup per debounced query (250 ms), so a 5-letter name typed at normal speed ≈ 1-2 | bounded by the above; no background calls | integration spec: 6 test users created + 6 deleted (each with one sign-in), 45 RPCs (1 setup + 1+9+5+1+5+8+2+6+7 across the 9 tests), 13 of them expected refusals; unit tests: 0 (Supabase mocked) |
| Egress (bytes) | a lookup row ≈ 200 B; a token 32 B; a handle match ≈ 300 B | negligible | 45 × 300 B ≈ 13.5 KB |
| Rows written | 1 code row per person (lazily, on first open); 1 redemption row per new chat started from a code | at most 20 redemption rows per owner per 24 h (the owner-side limit) | 2 code rows (A and F; A's reset updates its row), 21 redemption rows (B, C, D on A's code + 17 seeded to reach the limit + C on F's code), 1 agent row; all deleted in `afterAll` (the agent row by cascade, since agent rows cannot be deleted directly) |

## Invariants

- Starting a 1:1 is decided on the server. A client-side check alone never grants it.
- A reset code stops working at once, and the server checks that for every new 1:1 it starts.
- Block wins over a code, in both directions.
- A token is never readable by anyone but its owner.

## Acceptance Criteria

- [x] Two accounts with no shared group, event or agreement connect by one scanning the other's code, and both see the 1:1. — server verified on TEST (`e2e/integration/p1556-contact-code.spec.ts`, both accounts list the chat); the camera-scan half is the real-device box below.
- [ ] A person with no account scans a code, signs up, and lands in the chat with the code's owner.
- [ ] A sent code link does the same as scanning it.
- [x] After Reset code, the old link shows "This code no longer works" and starts no chat, the new one works, and an existing chat stays open. — integration spec (server) + page test (the message).
- [x] After 20 new chats in a day from one code, the next scan says the code is paused. — integration spec (server) + `src/tests/p1556-connect-page.test.tsx` (message).
- [x] Opening your own code opens your profile, not a chat. — integration spec (refusal) + page test (goes to `/me`).
- [x] When either person has blocked the other, opening the code shows the same "This code no longer works" message and starts no chat. — integration spec: both directions return the identical message, and a blocked signed-in lookup returns nothing.
- [ ] The code sheet has Copy link, Share and Reset code; New message shows My code first and Invite a Clarity Partner beneath it.
- [ ] Every profile shows the handle; tapping it copies it.
- [ ] Exact-handle search finds a profile; Message shows only where a 1:1 is allowed.
- [ ] My code opens from the chat list icon, from your profile, and from the New message dialog.
- [ ] The scan → sign-up → chat handoff, with both Google and email sign-up, is verified on an iPhone (Camera → Safari) and an Android phone (Camera → Chrome).
- [ ] The code token does not appear in Sentry events or Mixpanel URLs; checked with a test event.

## Related

[P1512](done/2026-06-10/p1512_clarity_chat_v1_real_release.md) (Clarity Chat: D1 shared-connection rule, D2 block and daily limit) · [P1509](done/2026-06-10/p1509_clarity_chat_v1_chats_home.md) (chats home) · [P1461](p1461_clarity_chat_channel_members_settings.md) (adding people to channels) · P1604 (transcription in a chat)
