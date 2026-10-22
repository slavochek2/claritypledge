---
status: in-progress
type: story
rank: 57
workstream: clarity-chat
created_date: '2026-10-22'
tags: [navigation, artifacts, chat, events]
disclosure: public
delivery_stage: dev
pipeline_ran: [create-spec, dev]
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
- [x] Three variants reachable on one dev route, each at desktop, 375px and 320px, covering every state listed in Phase 1.
- [x] Visual review reports received from Gemini 4 Argon and Opus (count stated), findings fixed or set aside with a reason.
- [ ] The founder's pick and comments recorded under `## Resolved Decisions`.

Phase 2:
- [ ] Signed in, Home opens the feed; Chats, Events, Artifacts and You are tabs on the phone and entries on desktop.
- [ ] A group the person belongs to is in Inbox with no messages; a newly joined group and a new event channel (from 24h before start) arrive unread once; an empty event chat leaves 12h after start.
- [ ] Artifacts shows Yours and Shared with you. A draft letter shows Draft. A canvas shows 🔒 or 🌐 only. A received item names its sender. Search filters by title. + offers Letter and Canvas.
- [ ] Sharing a canvas with an event posts one message in that event's channel, and opening it from the channel marks it read in Shared with you.
- [ ] Every old `/letters` tab URL lands on the matching Artifacts view.
- [ ] Events list, signed out and empty: the Chiang Mai card is the main element and "Sign Up to Host" is a quiet link. With events: the card sits below the list. Taps record a Mixpanel event.
- [ ] Screenshots at 1440, 375 and 320 pass `.claude/rules/visual-qa.md`, reviewed by a separate agent.

## Phase 1 record

- **Route:** `/tree/artifacts?v=a|b|c&state=full|shared|menu-open|search-open|empty-yours|empty-shared|events-empty|events-some` (dev only). Files: `src/app/tree/artifacts-lab/`.
- **Variants:** A = compact tabbed list, left sidebar. B = card grid, top nav, chats side panel. C = icon rail + list + preview pane (phone: list + bottom sheet).
- **Visual review:** 10 of 10 reports received (Gemini 4 Argon, 3 rounds x 3 variants, plus 1 Opus critic). Last round: A 0 HIGH, B 1 HIGH, C 1 HIGH; C's was fixed. Set aside: fixed tab bar drawn mid-page (a full-page-capture artifact, checked against a viewport shot); B's phone chat preview (round 2 removed it as a duplicate, round 3 asked for it back, so the card meta says "in your chat"); the "Shared" short label (the spec names the tab "Shared with you").
- **Code review:** 3 of 3 reports (Sonnet `/finish` code reviewer plus 2 Gemini 4 Argon rounds). Fixed: C showed Share/Delete on items you don't own, claimed "in your chat" with no share message, opened the + menu upward on desktop, and froze its breakpoint; lab params are now validated.
- **Carried to Phase 2** (lab-only, not fixed in throwaway code): build on the real `BottomNav` and shared components, not the lab copies; phone sheet needs a real dialog primitive (Escape, focus trap, scroll lock); the tabs need the full ARIA tab pattern; on desktop a pane that opens by default marks its item read; the dual-mounted + menu should become a single responsive trigger; delete `src/app/tree/artifacts-lab/` and its route once the picked variant ships.
- **Copy still open** (placeholders written by agents): "Remove from my list" on shared items, the Chiang Mai card's button and link text, the empty-state lines, "No events from us right now".

## Phase 1 round 2: action inventory

Read from the real code on 2026-10-22 (`letters-page.tsx`, `drafts-tab.tsx`, `sent-tab.tsx`, `inbox-tab.tsx`, `letter-overview-page.tsx`, `letter-preview-page.tsx`, `canvas-page.tsx`). Round 1's invented labels ("Continue", "See replies", "Remove from my list", a canvas "Delete") are gone from the lab. Paths below are under `src/app/`. Round 2 variants: **B2** (card grid) and **C2** (list + preview pane), both on the left sidebar (desktop) and bottom tabs (phone); `?v=b2|c2`.

**One finding changes the page's shape:** today's Inbox is not only "letters sent to you". It also lists activity on your own sent letters ("<name> completed <title>", "Someone responded to", "<name> is reading", "• N new from <name>"). Those are about **Yours**, not **Shared with you**. In the new design they live on the sent letter's card (progress, unread dot, new-reply line).

| Item state | Today (exact label, file:line) | In new design | Status |
|---|---|---|---|
| Page chrome | Title "Clarity Letters", tabs "Inbox (N)" / "Drafts" / "Published", default tab Inbox (`pages/letters-page.tsx:98,131-152`, `:42`) | Title "Artifacts", tabs "Yours" / "Shared with you (N)". Drafts and Published merge into Yours; the unread count moves to Shared with you | renamed. Default tab (Inbox today) is open for Phase 2: Yours or Shared with you? |
| Create | "New Draft" button (phone: "New") opening "Private Draft: Only people you share with can see this" / "Public Draft: Visible on your profile" (`letters-page.tsx:101-127`) | Labelled button "New artifact" ("New" below the sm breakpoint, as today). Menu items: "Letter (private draft)" and "Letter (public draft)" with today's two hints, then "Canvas" | moved and renamed (today "Private Draft" / "Public Draft"). Today there is no canvas create or canvas list at all; the Canvas entry is new (decision 4, P1536) |
| Draft letter, card | Whole row opens the editor; lock/globe icon, title, "N stories · N points", "Updated X ago" (`components/letters/drafts-tab.tsx:142,149,156-159`) | Same facts on the card: type label "Letter", Draft chip, 🔒/🌐, "N stories · N points", "Updated X ago". The title is a link that stretches over the card, so tapping anywhere opens the editor, as the row does today | kept |
| Draft letter, "Edit" | Text button, desktop only (`drafts-tab.tsx:203-210`) | The ONE visible button on the card, now on phones too | kept (now also on phone) |
| Draft letter, "Prepare Letter" | Filled blue button on desktop; on phone only inside the ⋯ menu; disabled with title "Add at least one story first." when 0 stories (`drafts-tab.tsx:212-221,195-200`) | Inside ⋯ (same on desktop and phone), same disabled rule | moved to ⋯. Reason: one primary per card (founder, round 2); the desktop pair "Edit" + "Prepare Letter" was two |
| Draft letter, "Delete" | ⋯ "Actions for <title>" > "Delete"; disabled with "Can't delete — letters were sent from this draft." when `has_sent_letters`; confirm dialog "Delete draft" (`drafts-tab.tsx:170-190,228-245`) | ⋯ > "Delete", last, red, below a separator. Same disabled rule (a mock draft with `hasSentLetters` shows it) and dialog | kept |
| Published letter, card | Lock/globe, title, summary "Public link letter" (public only) · "Sealed X ago" · "N of M recipients completed" · "N responses" (public only) (`components/letters/sent-tab.tsx:176-189`) | "Sealed X ago", "N of M recipients completed", "N responses", plus the unread blue dot when something new arrived. "Public link letter" is dropped as text: the globe and the LETTER label already say it | kept, except "Public link letter" (dropped as text, the icon carries it). Today a row click toggles the recipients; here the title opens the overview and the toggle is the separate "Recipients (N)" disclosure |
| Published letter, "Open overview" | Filled blue button, desktop only; first item of ⋯ on phone (`sent-tab.tsx:271-280,295-300`) | The ONE visible button on the card, phone too | kept (now also on phone) |
| Published letter, recipients | ▶/▼ toggle (aria "Expand"/"Collapse"); rows: name (links to /p/slug), "Invited / Opened / In progress / Completed", "N of M steps", "No recipients yet." (`sent-tab.tsx:68-76,82-132,242-252,349`) | A "Recipients (N)" disclosure on the card (B2) and a Recipients section in the pane (C2), same label in both (N = every delivery, link respondents included). Same four status words, "N of M steps", "No recipients yet.", and each registered name links to /p/<slug> as today | kept |
| Published letter, per-recipient "Results" | Button on each row with results, desktop only; whole row tappable on phone (`sent-tab.tsx:98,132-144`) | "Results" button on each recipient row, phone too, in the smaller nested outlined style so the card keeps one primary | kept (now also on phone) |
| Published letter, "Preview letter" | ⋯ item, opens `/letter/<doc>/preview` in a new tab (`sent-tab.tsx:301-303,203-205`) | ⋯ item, same label | kept |
| Published letter, "Add recipient(s)" | ⋯ item, opens the add-recipient modal (`sent-tab.tsx:304-306,364-374`) | ⋯ item, same label | kept |
| Published letter, "Copy public link" | ⋯ item, public letters only, toast "Link copied to clipboard" (`sent-tab.tsx:307-311,193-201`) | ⋯ item, public letters only, same label | kept |
| Published letter, "Delete letter" | ⋯ item; disabled with tooltip "Can't delete — letter has been shared." when any delivery exists; dialog "Delete letter?" (`sent-tab.tsx:312-333,376-394`) | ⋯ > "Delete letter", last, red, below a separator. Disabled when the letter has any delivery (recipients plus link respondents, `deliveries.length > 0`), with the same text under the label (phone has no tooltip). Mock `A note before the retreat` has none, so it is enabled | kept |
| Activity on my letter | Inbox rows: "<name> completed <title>", "Someone responded to <title>", "<name> is reading <title>", "Someone is responding to <title>", button "Results", "N of M steps", "• N new from <name>" (`components/letters/inbox-tab.tsx:341-361,262-273,286`) | Folded into the sent letter's card: unread dot, "N of M recipients completed", "N new from <name>" in blue; names and status in Recipients; "Results" per recipient. No separate row | moved to Yours > the sent letter. This is the Inbox/Yours split above |
| Letter sent to me, not finished | Inbox row: unread dot, mail icon, "<name> sent you <title>", "X ago", "N of M steps", button "Open" (`inbox-tab.tsx:240-256,283-284,336-339`) | Card in Shared with you: type label "Letter", "<name> sent you this letter" (name links to /p/<slug>), "N of M steps", unread dot, no lock/globe; ONE button "Open"; the title also opens it | renamed (today "<name> sent you <title>"; the title is now the card heading) |
| Letter sent to me, finished | Same row, icon arrow-down-left, button "Results" (`inbox-tab.tsx:285-286,300-302`) | Same card, ONE button "Results" | kept |
| Live invite | Row above the inbox list: "<author> invited you to verify <story>" with "Join" (`inbox-tab.tsx:193-224`) | Not drawn. It is a live-session invite, not an artifact | **OPEN, founder decision:** where does it live in the new menu (Chats or Events are the candidates)? Not dropped; Phase 2 must not ship without an answer |
| Empty states | "No drafts yet." + "New Draft"; "No published letters yet."; "No letters or responses yet." (`drafts-tab.tsx:117`, `sent-tab.tsx:475`, `inbox-tab.tsx:173`) | One line per tab: empty Yours points at "New artifact"; empty Shared with you says nothing was shared | renamed (copy is a founder decision) |
| Load error, retry, stale notice | "Something went wrong loading your …" + "Retry"; "Can't reach the server — showing your last update, retrying…" (`drafts-tab.tsx:99-105`, `sent-tab.tsx:460-468`, `inbox-tab.tsx:20,156-164`) | Not drawn in the lab (data states, not layout) | kept for Phase 2 |
| Canvas, card | None. Canvases have no list today. The page is `/p/:handle/canvas/:projectTag` (`pages/canvas-page.tsx`, route `App.tsx:998`) | Card: type label "Canvas", canvas icon in the canvas blue (`bg-blue-100 text-blue-600`, `canvas-page.tsx:585`), 🔒/🌐, updated; ONE button "Open" | new (decision 4) |
| Canvas, in-page actions | "Compare positions" picker and the canvas picker, both on the page (`canvas-page.tsx:745-760`, ProjectPicker) | Unchanged, stay on the canvas page | kept (not list actions) |
| Canvas, "Share" | Not in this branch: sharing is P1515 (spec only, no UI in `canvas-page.tsx`) | ⋯ > "Share", on your own canvases only | new (P1515). Not buildable until P1515 lands |
| Canvas, "Delete" | None. A canvas is a project tag over your points, "no canvas record" (`canvas-page.tsx` header comment, App.tsx:997) | Not offered | dropped because there is nothing to delete today; round 1's canvas "Delete" was invented. Open for the founder: should a canvas be deletable at all? |
| Canvas shared with me | None | Card with "Shared by <name>", unread dot, ONE button "Open"; no ⋯ (there is no action behind it) | new (decision 4). Round 1's "Remove from my list" was invented and is dropped |
| Preview page | Banner "THIS IS A PREVIEW — The receiver will see this", "Close preview" (`pages/letter-preview-page.tsx:117-125,242-249`) | Unchanged page | kept |
| Overview page | "Letter Overview", title, author, one cohort table per story, back buttons (`pages/letter-overview-page.tsx:172-221`) | Unchanged page; its back fallback `/letters?tab=sent` redirects to Artifacts > Yours in Phase 2 | kept |

**Dropped, with reason:** canvas Delete (nothing to delete today), "Remove from my list" (never existed). **Moved:** Prepare Letter to ⋯; sender-side Inbox rows onto the sent letter's card. **Open for the founder:** the live-invite row's home; default tab; whether a canvas can be deleted.

## Related

P1512 (Home = chat list, now reversed for Home only) · P1543 (Events tab) · P1515 (canvas sharing model: Private or Shared, link access, no public switch) · P1508 (canvas page) · P1536 (+ Canvas opens a mirror thread) · P1546 (threads everywhere) · P1437 (`/tree` mock-prototype pattern) · decisions.md 2026-04-06 (letters email metaphor, superseded for navigation)
