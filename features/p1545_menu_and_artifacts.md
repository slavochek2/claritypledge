---
status: week
type: story
rank: 57
workstream: clarity-chat
created_date: '2026-10-22'
tags: [navigation, artifacts, chat, events]
disclosure: public
delivery_stage: create-spec
pipeline_ran: [create-spec]
drafted_by: opus
exec_model: opus
exec_effort: high
---

# P1545: Feed home again, Chats and Artifacts in the menu, one Inbox rule, Chiang Mai card on Events

## Problem

**Situation:**
- **Home:** since P1512, Home is the chat list and Feed is a separate tab.
- **Phone tabs:** after P1543 they are Home (chats) · Feed · Events · Letters · You.
- **Letters:** its own menu item, with Inbox / Drafts / Published (decisions.md 2026-04-06, the email metaphor).
- **Canvases:** a second kind of thing people make and share (P1508, sharing in P1515). They have no menu entry at all; one is reached only by its URL or from an event page.
- **Events list:** for a signed-out visitor with nothing upcoming, the only big button is "Sign Up to Host".

**Complication:**
- There are few chats yet, so a chat list as the first screen looks empty.
- Letters and canvases are both things you make and share, but the letter menu is built around sending email.
- A visitor who opens Events and sees one hike, or "Nothing coming up yet" (screenshot, P1543 UAT), leaves.

> Founder, 2026-10-22: "we make feed home as it was before and then you know instead put chats because the problem is today there are not many chats at all"

**Question:** One coherent menu where people find chats, the things they made or received, and something to go to.

## Appetite

Blast radius: high. Every signed-in screen's navigation, plus the letters surface. Reversibility: medium. Code only, no schema change is expected; `/dev` confirms that. Decision density: settled for structure (below); copy is open. **Built in two phases with a founder gate between them.**

## Founder decisions (2026-10-22, this conversation)

1. **Feed is Home again.** Chats becomes its own tab.
2. **Phone tabs:** Home (feed) · Chats · Events · Artifacts · You. **"Artifacts"** is the name (founder: "lets keep artifacts as name"). It replaces the Letters tab. The desktop signed-in menu carries the same entries. The signed-out desktop menu already shows Events and Groups and is unchanged.
3. **Chats, one Inbox rule, no per-series exceptions.** A chat enters your Inbox when it becomes relevant to you, and it arrives **unread**. What "relevant" means depends only on the kind of chat:
   - **Direct message:** when someone writes.
   - **Group:** when you join. Groups are always in Inbox, even with no messages.
   - **Event:** 24 hours before it starts, or as soon as anyone writes. An event chat nobody wrote in leaves both Inbox and Channels 12 hours after the start (today's rule, `chat-view-model.ts`).
   - **A new channel** shows one unread mark until opened, and counts in the Chats tab's number.
4. **Artifacts page:**
   - **Tabs:** two, **Yours** and **Shared with you**. No "All".
   - **Shared with you:** today's letter inbox plus canvases shared with you.
   - **Icons:** the same two as points and stories, 🔒 not public and 🌐 public. "Not public" covers nobody, or specific people, groups and events. No third "shared" icon.
   - **Who it's shared with:** the card shows the icon only. The audience can be many entries or none, so it lives in the Share panel. **Agent call, delegated by the founder** ("Up to you to decide").
   - **Two exceptions:** a *Shared with you* card names who shared it (where it came from, not who else sees it), and an unsent letter shows **Draft**. Sending seals a letter's predictions, so "not sent yet" is a real state; a canvas has no such state.
   - **Search:** an icon that opens a search field.
   - **Create:** a **+** menu with *Letter* and *Canvas*. *Canvas* opens a mirror thread (P1536).
   - **Letter actions** (today Open, Preview, Recipients, Edit, Prepare letter, Delete) are redesigned as part of the variants, not carried over as-is.
5. **Every share posts where it happened.** A letter or canvas sent to a person appears in your chat with them; one shared with a group or event appears in that channel as "<name> shared a canvas". Opening it from either place marks it read in both.
6. **Chiang Mai card on the events list**, reusing the existing Chiang Mai calendar banner:

   | Visitor | Our list | Main thing | Chiang Mai card | Host button |
   |---|---|---|---|---|
   | Signed out | has events | Join on each event | below the list, one level quieter | top right, unchanged |
   | Signed out | empty | the card | the main thing | becomes a quiet link |
   | Signed in | either | as above | as above | Host Event / Co-create top right, unchanged |

   The card's taps are counted (Mixpanel). Many taps are the evidence for a custom Chiang Mai list later; an embedded Google Calendar was rejected (heavy, slow on phones, already at /cm).

## Solution: two phases, one founder gate

**Phase 1: three variants, mock data, founder picks.** Built in a new session.
- Three distinct layouts of the Artifacts page and the new menu, at desktop and 375px. Each one:
  - covers decisions 2, 4 and 5 and the Chiang Mai card;
  - covers every state: empty Yours, empty Shared with you, a draft letter, a sent letter, a private canvas, a public canvas, a received canvas;
  - shows the + menu, search open and closed, and a letter's actions.
- The variants differ in layout and action placement, not in the decisions above.
- Built on a dev-only route on mock data (the P1437 `/tree/...` pattern), by Sonnet subagents, one per variant.
- **Reviewed visually**: Gemini 4 Argon on screenshots at 1440, 375 and 320; Opus as the critic; Codex only if the code needs it. Brief: shorter, clearer, no redundancy, one primary action per view, `.claude/rules/visual-qa.md`. Fix rounds until no realistic finding remains.
- **Founder gate:** the founder opens the running dev server (URL printed in the session, e.g. `http://localhost:<worktree port>/tree/artifacts`), clicks through all three, and picks one with comments. **Phase 2 does not start without that pick.** Record the pick and the comments in this spec under `## Resolved Decisions`.

**Phase 2: build the picked variant for real**, in the same new session:
- the nav change (decisions 1 and 2);
- the Inbox rule (decision 3, in `chat-view-model.ts` and its unread count);
- the Artifacts page on real letters and canvases (P1515 data);
- share messages in chats (decision 5);
- the events-list card (decision 6).
- Old `/letters` URLs redirect to the matching Artifacts view.

[FOUNDER DECISION: all on-screen copy in the picked variant: tab labels beyond "Artifacts", the card text for the Chiang Mai calendar, the share message wording, empty-state lines.]

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| Old `/letters?tab=` links in sent emails break | MITIGATE | Phase 2 redirects every old tab URL; e2e covers each |
| "Shared with you" mixes sealed-letter reading with canvas reading, and a reader opens the wrong flow | MITIGATE | Each card opens its own existing page; the list only lists |
| The share message in a busy channel gets buried | ACCEPT | It is also in Shared with you (decision 5) |
| Variants converge on one design | MITIGATE | Each subagent gets a different layout premise; reviewers reject near-duplicates |
| Inbox rule change makes a group channel appear for every member at once | ACCEPT | One group today; that is the point of decision 3 |

**Non-Goals**
- Do NOT change the letter sealing or reading flow, or canvas sharing rules (P1515).
- Do NOT add a third visibility icon.
- Do NOT build the custom Chiang Mai events list or embed the Google Calendar.
- Do NOT start Phase 2 before the founder's pick is recorded.
- Do NOT change the signed-out desktop menu.

## Acceptance Criteria

Phase 1:
- [ ] Three variants reachable on one dev route, each at desktop, 375px and 320px, covering every state listed in Phase 1.
- [ ] Visual review reports received from Gemini 4 Argon and Opus (count stated), findings fixed or set aside with a reason.
- [ ] The founder's pick and comments recorded under `## Resolved Decisions`.

Phase 2:
- [ ] Signed in, Home opens the feed; Chats, Events, Artifacts and You are tabs on the phone and entries on desktop.
- [ ] A group the person belongs to is in Inbox with no messages; a newly joined group and a new event channel (from 24h before start) arrive unread once; an empty event chat leaves 12h after start.
- [ ] Artifacts shows Yours and Shared with you. A draft letter shows Draft. A canvas shows 🔒 or 🌐 only. A received item names its sender. Search filters by title. + offers Letter and Canvas.
- [ ] Sharing a canvas with an event posts one message in that event's channel, and opening it from the channel marks it read in Shared with you.
- [ ] Every old `/letters` tab URL lands on the matching Artifacts view.
- [ ] Events list, signed out and empty: the Chiang Mai card is the main element and "Sign Up to Host" is a quiet link. With events: the card sits below the list. Taps record a Mixpanel event.
- [ ] Screenshots at 1440, 375 and 320 pass `.claude/rules/visual-qa.md`, reviewed by a separate agent.

## Related

P1512 (Home = chat list, now reversed for Home only) · P1543 (Events tab) · P1515 (canvas sharing model: Private or Shared, link access, no public switch) · P1508 (canvas page) · P1536 (+ Canvas opens a mirror thread) · P1546 (threads everywhere) · P1437 (`/tree` mock-prototype pattern) · decisions.md 2026-04-06 (letters email metaphor, superseded for navigation)
