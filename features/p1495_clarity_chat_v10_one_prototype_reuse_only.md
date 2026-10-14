---
status: week
type: story
rank: 39
workstream: clarity-chat
created_date: '2026-10-15'
tags: [clarity-chat, prototype, reuse, navigation]
disclosure: public
delivery_stage: create-spec
pipeline_ran: [create-spec]
drafted_by: opus
exec_model: opus
exec_effort: high
driver: anomaly
---

# P1495: Clarity Chat v10, one prototype built only from components the product already has

> **Where it is built.** On the P1437 prototype branch (`feature/p1437-conversation-groups-v2`), where
> the v8 prototype (`/tree/conversation-groups`) and v9 (`/tree/v9/menu`, `/tree/v9/make`,
> `/tree/v9/ledger`) live. Dev-only, mock data, no network writes from prototype code. P1485
> (`features/p1485_clarity_chat_v8_light_cards.md` on that branch) is the predecessor; its rules hold
> unless this spec names a change. Paths are relative to `src/`, checked against the branch at `1b728bd27`.
> "V8" = `app/prototypes/conversation-groups/` (or `app/prototypes/letter-review/` where noted).

## Decisions needed before build

Ordered by how much they block. Each is a [FOUNDER DECISION]; the build starts after 1 to 5.

1. **Message style: Slack rows or Telegram bubbles?**
   Telegram: *"we orient ourselves more like telegram"*, *"telegram has them on opposite sides"*.
   Slack: *"I also like generally Slack like ... It's also quite clean in Slack"*, *"So either do Slack
   like or Telegram like, but not what we currently have"*, and *"we don't want new build, we want to reuse"*.
   - A. Slack rows: V8 `ui.tsx` `Message` + `Toolbar`. Zero new code; whole-row highlight and top-right
     toolbar are native; the V8 chat list is already Slack-shaped (Channels, Direct messages).
   - B. Telegram bubbles: V8 `chat-kit.tsx` `MyBubble` / `AgentBubble`. Needs two NEW pieces: a hover-row
     wrapper (the bubbles have no `group relative` row, hover band or toolbar slot; `Toolbar` is
     `absolute -top-5 right-3` and only works inside `Message`) and a Telegram chat-list row (the V8 rows
     are inline JSX in a non-exported `Sidebar`). `MyBubble` is `bg-blue-600 text-white`, so cards post
     outside it; product blue palette, no wallpaper, no times in bubbles.
   - Cost: A keeps rows on one side; B is the only new code in the chat.
   - Recommendation: **A**, because it is the only option with zero new markup.
2. **Evolve `/tree/conversation-groups` in place?** Yes: v10 becomes that route's default view, and v9 is
   deleted. No: a new `/tree/v10` route, which forces copying the non-exported `Sidebar`
   (`ConversationGroupsPrototype.tsx:400`) or exporting it. Cost of yes: v8's other paths (letter, WhatsApp
   box, join, helper) share the route and must keep walking. Recommendation: **yes**.
3. **Allow the Clarify composition (NEW 1)?** V8 `mirror.tsx` `AgentMessage` holding 1 to 3 V8
   `stake-cards.tsx` `StakePoint` cards, inside V8 `ui.tsx` `SidePanel`. The alternative is V8
   `AgentReplyView` as is: outline text buttons, "Pick one, or write your own:", a text input, then a grey
   preview with "Edit" and "Post" (`chat-card.tsx:163-256`), the invented forms the founder rejected.
   Recommendation: **allow**.
4. **Allow the "Clarity Ledger" turn action (NEW 2)?** A prototype-only optional prop `footerAction` on
   `FeedPointCard` and `FeedStoryCard`, rendered in the footer row, never passed by production callers
   (same precedent as `mock`, `draft`, `statementPrefix`). Without it no slot exists: the corner is
   hard-wired to `CardMenu` and the footer to the footer actions (`feed-point-card.tsx:378`, `:401-409`).
   Label: *"a small button clarity ledger"* vs *"see ledger is maybe short CTA"*. Cost: two production
   files gain one unused-by-production prop. Recommendation: **allow, label "Clarity Ledger"**.
5. **`/stake` tabs: extract or not, and which block is canonical?** Three inline Points/Stories tab blocks
   exist: `app/pages/stake-page.tsx:475`, `app/pages/feed-page.tsx:625`, `app/pages/profile-page-v2.tsx:1261`.
   Extracting one into an export (no behaviour change, adopted by its own page only) is a production
   change; copying fails the reuse gate. Recommendation: **extract the stake block** (*"it has to be
   exactly like stakes"*).
6. **Composer "+": add "Point" and "Story"?** Point has a source (V8 `commands.ts` `pointsFor`, listed as
   `StakePoint` cards in the NEW 1 composition). Story has none: no story picker exists in production or
   V8. A: both, via an optional `extraItems` prop on V8 `Composer` (today `ui.tsx:547-548` hardcodes
   Mention and Emoji), Story listing the viewer's `FeedStoryCard`s in the same composition. B: Point only.
   Founder: *"how in any chat I can select any story so this plus icon on the left ... probably is
   important"*. Recommendation: **A**.
7. **`Agree+` on the card front, "Strongly agree" on the turned side?** `PositionButtons` prints
   `POSITION_SHORT_LABELS` (`Agree+`); `StatementRow` prints `POSITION_FIRST_PERSON` /
   `POSITION_FULL_LABELS` ("Strongly agree" / "Strongly agrees") for the same position. Changing either is
   a production copy change. Recommendation: **accept both as production prints them**.
8. **Ledger sort order.** `/compare` lists largest gap first (`compare-page.tsx:5`); `/stake` lists oldest
   first. Recommendation: **Points tab gap first (it is the compare row), Stories tab oldest first**.

## Problem

**Situation:** v9 split Clarity Chat into three pages (menu, make, ledger), each on a third chat kit,
with its own point card, position picker, story card and ledger page.
**Complication:** The founder rejected all three for the same reason: they diverge from each other
and from the product, and they reinvent components that exist.
**Question:** What does ONE prototype look like when every element on screen is a production component,
a V8 component, or an explicitly approved new one?

> Founder framing, verbatim (2026-10-14/15):
>
> *"why did you create custom buttons ... you invented a new fucking point component ... normal point components normal story components no form on the things that exist no reinvention needed"*
>
> *"now make is very different than for example slash three conversation groups and menu and so on now now they are diverging ... maybe we should be actually working on one prototype instead"*
>
> *"go hard on reusing the components that we have anything there needs to be either eliminated or reused"*
>
> *"maybe i'm creating contradictory things ... this is why adversarial reviewer is important"*

## Appetite

- **Blast radius:** one dev-only prototype route plus the deletion of v9. Production files change only
  where a decision above allows (2 and 5).
- **Reversibility:** git revert. **Decision density:** high (8 above, 12 smaller below).
- **Desktop only (1440).** Founder: *"we don't need to optimize for mobile yet"*.

## Solution

### Reuse rules

- Anything that renders a point, story, position or rating is a **production** component.
- V8 components are allowed only for the shell and chat chrome.
- Production strings are free. A V8 string on the main path is allowed only if it is listed verbatim
  in the UI Contract. Anything else is NEW and needs a founder yes.

### 1. Reuse map

| # | Element | Source (path, export) | Kind |
|---|---|---|---|
| 1 | Point card, every surface | V8 `stake-cards.tsx` `StakePoint` (wraps `app/components/feed/feed-point-card.tsx` `FeedPointCard` with `mock` and the `refuseInert` keyboard guard, `stake-cards.tsx:138-141`). Direct `FeedPointCard` use is forbidden | PROD via V8 |
| 2 | Position control | `app/components/shared/PositionButton.tsx` `PositionButtons` (CP wrapper, inside `FeedPointCard`) | PROD |
| 3 | Story card | `app/components/feed/feed-story-card.tsx` `FeedStoryCard` with `onNavigate`, `authorOverride`; never `currentUserId` (its linked points render `QuotedPointCard`, which writes positions when given a viewer) | PROD |
| 4 | Story nested in a point | `app/components/social/point-card-with-links.tsx` `QuotedStory` via V8 `StakeQuoted` | PROD |
| 5 | Signed-out site | the real site at `/feed`, a link | PROD |
| 6 | Shell, sidebar | V8 `letter-review/chat-kit.tsx` `ChatShell`, `SidebarFrame` with `bare` (without it, it renders its own app links, letter folders and "New chat") | V8 |
| 7 | App menu: Chats (home), Feed, Groups, Events, Letters | V8 `app-menu.tsx` `AppMenu` with a NEW optional `items` prop (NEW 6); today `signedInItems` is Home(`/feed`), Letters, Partners, Groups, My Profile | V8 |
| 8 | Feed, Groups, Events in the main pane | v9 `menu/real-pages.tsx` `RealPage`, `InShellLinks`, moved and trimmed (delete list) | moved |
| 9 | My Profile, Partners, Settings pages | V8 `app-menu.tsx` `QuietFrame` | V8 |
| 10 | Account row, bottom left | V8 sidebar footer: `ui.tsx` `Avatar` (photo from `mock-data.ts`, `public/prototypes/people/bob.jpg`) + `Presence` + name | V8 |
| 11 | Account menu (My Profile, Partners, Settings) | NEW 5; labels from `app/components/layout/navigation-menu-items.tsx` (it reads real auth, so not mounted) | NEW |
| 12 | Tools | `app/components/layout/event-links-menu.tsx` `EventLinksMenu` (`enabled`, the provider; without it `EventLinksButton` returns null, line 117) + `EventLinksButton`, wrapped by `InShellLinks`, in the sidebar above the account row | PROD |
| 13 | Letters page | V8 `letters-page.tsx` `LettersPage` | V8 |
| 14 | Chat list rows, search | V8 `ConversationGroupsPrototype.tsx` `Sidebar` rows (Decision 1) | V8 |
| 15 | Message rows | V8 `ui.tsx` `Message` (Decision 1 A) | V8 |
| 16 | Hover toolbar | V8 `ui.tsx` `Toolbar` with `quiet={false}` (V8 passes `quiet` on others' messages, `ConversationGroupsPrototype.tsx:719`, which keeps it always visible), `ToolButton` | V8 |
| 17 | Clarify action | `ToolButton` holding V8 `Avatar` with `agent` | V8 |
| 18 | Composer | V8 `ui.tsx` `Composer` (+ `extraItems`, Decision 6) | V8 |
| 19 | Clarify panel | V8 `ui.tsx` `SidePanel` + `mirror.tsx` `AgentMessage` + item 1 (`draft`, `onVote`): NEW 1 | V8 |
| 20 | Bob's guess of Alice's position | V8 `eyes-mark.tsx` `GuessMenu`, `EyesHeader` (no gap score) | V8 |
| 21 | Writing a story or reverse story | V8 `letter-controls.tsx` `InlineEditor`; V8 `commands.ts` `reverseDraft` for the agent's draft | V8 |
| 22 | Agent naming | V8 `agents.tsx` `AgentDialog` | V8 |
| 23 | 0 to 10 rating | `app/components/shared/comprehension-rating-card.tsx` `ComprehensionRatingCard` (`question`, `hideSubmit`, production `highLabel`), not V8 `RatingRow` (it overrides `highLabel`) | PROD |
| 24 | Seal state | V8 `letter-state.ts` seal fields (`eyesSeal`, `ownSeal`); not its step order (`ThreadStep`) | V8 |
| 25 | Ledger tabs | Decision 5 | PROD |
| 26 | Ledger, point turned | `app/components/compare/statement-row.tsx` `StatementRow` (`compact`, `trailing` = turn back) inside a `<ul>` (`compare-page.tsx:269` pattern; it renders an `<li>`) | PROD |
| 27 | Ledger, story turned, answered | `app/components/letters/calibration-verdict.tsx` `CalibrationVerdict` (`perspective`, `readerName`) in NEW 3 | PROD |
| 28 | Ledger, story turned, not answered | `app/components/shared/RatingDots.tsx` `RatingDotsPending` ("Pending") in NEW 3 | PROD |
| 29 | Partner upgrade | `app/components/agreements/agreement-certificate.tsx` `AgreementCertificate` (`variant="creation"`, `partnerNameValue`, `partnerNameReadOnly`) in `app/components/layout/certificate-page-shell.tsx` `CertificatePageShell` | PROD |
| 30 | Prototype strip | V8 `prototype-strip.tsx` `PrototypeBar` | V8 |
| 31 | Draft chip on suggestions | V8 `stake-cards.tsx` `DraftChip` ("Draft") | V8 |

### 2. NEW list (each [FOUNDER DECISION: allow?], recommendation yes unless noted)

| # | What | Why nothing existing fits |
|---|---|---|
| 1 | Clarify composition (Decision 3) | `AgentReplyView` renders text buttons and forms, not cards |
| 2 | `footerAction` prop on `FeedPointCard`, `FeedStoryCard`, passed through `StakePoint` (Decision 4) | no slot exists |
| 3 | Turned-story container: the verdict or pending dots plus the turn-back action | `CalibrationVerdict` and `RatingDots` have no slot and no story text |
| 4 | Telegram hover-row wrapper and chat-list row (only if Decision 1 = B) | see Decision 1 |
| 5 | Bottom-left account menu: My Profile, Partners, Settings | V8 footer has no menu; production menu reads real auth |
| 6 | Optional props on V8: `AppMenu.items`, `Composer.extraItems`, `SidebarFrame` logo target (today a real `<Link to="/feed">`, `chat-kit.tsx:164`, which leaves the prototype), `StakePoint.footerAction` | defaults keep v8 unchanged |
| 7 | Ledger entry: a `ToolButton` in the chat header, person fixed by the chat (as `/compare/:slug`; `/stake` has no person selector) | no entry exists |
| 8 | Partner status line in the chat ("pending") | nearest `app/components/agreements/agreement-row.tsx` `AgreementRow`, not chat-sized. Not recommended until the founder says what it reads |

### 3. Delete list

Verified: all 25 files under `app/prototypes/v9/` go (one moves), and nothing outside v9 imports v9 except
`App.tsx` and five tests.

| Remove | Duplicates |
|---|---|
| `v9/shared/position-picker.tsx`, `vocab.ts` | `PositionButtons`, `BUTTON_GROUPS` |
| `v9/shared/cards.tsx` | `FeedPointCard`, `StatementRow`, `FeedStoryCard` |
| `v9/shared/understanding-scale.tsx` | `LetterRevealNumeric`, `CalibrationVerdict`, `GapBanner` |
| `v9/shared/identity.tsx` | `components/ui/person-avatar.tsx` `PersonAvatar`, `GravatarAvatar isAgent` |
| `v9/shared/chat.tsx`, `onboarding.tsx` | V8 `ui.tsx`, `chat-kit.tsx`, `agents.tsx` |
| `v9/shared/clarify/ClarifyPanel.tsx`, `flow.ts` | NEW 1 on V8 parts |
| `v9/shared/ledger-entry.tsx`, `ledger-slot.tsx`, `v9/ledger/LedgerPrototype.tsx` | `StatementRow`, the compare pattern |
| `v9/menu/MenuPrototype.tsx`, `chat.tsx`, `me.tsx`, `agreement.tsx`, `model.ts`; `v9/make/MakePrototype.tsx` | V8 shell, `ProfileConnectionsPage`, `SettingsPage`, `AgreementRow`, `CreateAgreementPage` |
| `v9/shared/copy.ts`, `seed.ts`, `store.ts`, `agent.ts`, `viewer.ts`, `index.ts` | mock state |
| `App.tsx` lines 119-121 and 1170-1172 | the three `/tree/v9/*` routes |
| `tests/p1485-v9-{ledger,make-flow,make-page,menu-shell,shared-kit}.test.tsx` | tests of deleted code |
| `v9/menu/real-pages.tsx`, **moved** into V8's folder: remove `LedgerInShell` and its lazy import of `../ledger/LedgerPrototype` (lines 98-108); trim `RealPage` routes and `SHOWN` to `/feed`, `/groups`, `/groups/:slug`, `/events/*` | today it mounts `/pledgers`, `/login`, `/signup`, `/sign-pledge`, landings |

### 4. Areas

**a. Signed out and signed in**

> *"why don't we do that as is ... and when the person is logged in then we switch to the chat like interface"*
> *"at the bottom there is the account and so on. Settings are there"* · *"I would much rather prefer my profile"* · *"my partners live under me"*
> *"if chats are the new home then feed needs to be somehow there ... groups I see all groups ... what happened to letters ... where did tools go"*
> *"you invite somebody normally, upgrading to a partner is something else ... it can be prefilled out of for example some chat"*

| Signed out | Signed in |
|---|---|
| The real site as is (Use cases, Book a 15-min discovery call, Tools, Log in; `/` goes to `/feed`) | App menu (item 7): Chats (home), Feed, Groups, Events, Letters. Bottom left: account row (10) with menu (NEW 5): My Profile, Partners, Settings, each a `QuietFrame` (9). Tools above the account row (12). Pledgers nowhere in the shell |
| | Feed, Groups, Events are the real pages, and they render **signed out** inside the shell (e.g. `FeedPage` reads `useAuth`, `feed-page.tsx:95`): accepted, labelled by the strip (UI Contract) |
| | Invite = a new chat. Upgrade = the certificate (29) prefilled from the chat; prefill does not exist on `app/pages/create-agreement-page.tsx` (no URL parameters read), so v10 renders the certificate itself with `partnerNameValue`; the page's picker, visibility and "Seal & Send" are inline in that page and are not shown |

**b. Chat**

> *"when I hover over a message ... the icon should be Mira's icon clarify ... we don't need to say with Mira ... it should be on the right top on the message like in slack or in telegram and the message has to be like selected properly"*
> *"this plus icon on the left that we had before in the input field probably is important"*

- Rows per Decision 1. Hover highlights the whole message; the toolbar sits at its top right, hover only,
  on every message (Bob's and Alice's); one action: agent avatar + "Clarify".
- A posted card sits in the message body at full width (A), or outside the bubble on the sender's side,
  max 90%, no fill (B). It reads exactly like the same card elsewhere in v10.
- Composer "+": Decision 6. V8's second posting path (placeholder "...or @agent to post a point",
  `commands.ts` `composerHint`) is not shown.

**c. Clarify**

> *"it should suggest some options so I can correct them so one two three and I can correct"*
> *"if I agree why do I need to edit the point I already agree if I strongly agree I don't know just proceed ... I can probably hover over it and click on edit icon on it"*
> *"after the point I should say add a story right or at the reverse story"*

| Step | What Bob sees | Source |
|---|---|---|
| 1 | Clarify opens `SidePanel` on the right, private to Bob; Alice's chat stays visible; nothing reaches Alice until Post | 16, 19 |
| 2 | The agent's message with 1 to 3 suggested point cards, each with the Draft chip | 19, 1, 31 |
| 3 | Bob takes a position with the product's buttons. The card stays in place and live: a second tap still sets strength; no auto-advance, no "Edit the point" | 2 |
| 4 | Under the same card: Bob's guess of Alice's position | 20 |
| 5 | "+ Add a story" (production `ADD_STORY_COPY`, `card-footer.tsx:110`), then the reverse-story step [FOUNDER DECISION: label] | 21 |
| 6 | Per story, Bob's prediction, `hideSubmit`, one primary action per step | 23 |
| 7 | "Post" puts the point and stories into the Bob-Alice chat | 15 |

Two seals (decided this session):
- **(a) Stories after the point.** Bob's story and reverse story open for Alice only after her blind answer
  on the point. Reading his version of her view first would anchor her answer.
- **(b) Numbers after her answer.** Bob's prediction numbers and his guess of her position stay hidden
  until Alice commits her own answer for that item (her position for the guess, her rating for each
  story's number). She reads each story before rating it.

Rating sentences:

| Who, what | Sentence | Source |
|---|---|---|
| Bob, own story, predicts | "How well do you believe {Alice} understands your intended meaning behind your story?" | `app/components/letters/letter-prediction-walk.tsx:116` |
| Bob, reverse story, predicts | "How well do you believe this story represents {Alice}'s intended meaning?" | NEW copy, mirrors Alice's (founder: *"they say as well the same thing so it's kind of just reverse"*) |
| Alice, Bob's story | "How well do you believe you understand {Bob}'s intended meaning behind their story?" | `app/components/letters/letter-flow-content.tsx:928` |
| Alice, Bob's reverse story | "How well do you believe this story represents your intended meaning?" | `letter-flow-content.tsx:927` |

**d. Ledger**

> *"on points, I need to see the points. On stories, I need to see the stories. And it has to be exactly like stakes ... I can see the other side of the card"*
> *"on the points it's clear it's just a comparison ... compare is the page ... if it's just like a gap then it's a gap"*
> *"no invention please just just reuse what we have story cards gaps as in leather [letter] ... a small button clarity ledger or something like that"*

| | Front | Turned (replaces the card in place, same width, same action turns back) |
|---|---|---|
| Point | item 1 | item 26 (both people's actual positions) |
| Story, answered | item 3 | item 27, `perspective` = whose screen |
| Story, not answered | item 3 | item 28 |

- Entry: NEW 7. Tabs: Decision 5. Sort: Decision 8. No live-score row (no live data in v10).
- From a story its point is reachable through the card's linked points; from a point its stories
  through its footer. No text beyond what the reused components print.

## Contradictions

Not in the decision block; each with a recommendation and a [FOUNDER DECISION].

| # | A | B | Recommendation |
|---|---|---|---|
| 1 | Round 1: *"clarify with the name of the agent"* | Round 4: *"we don't need to say with Mira"* | Avatar + "Clarify" (latest) |
| 2 | Signed out *"as is"* (the public menu lists Pledgers under Product, `app/components/layout/nav-links.ts`) | *"pledgers is not something that is part of the product"* | Signed in: none. Signed out unchanged; moving it is a separate production change |
| 3 | Signed out *"as is"* (and `nav-links.ts` records an earlier founder call: Use cases leads) | *"the product category has to be above use cases"* | Unchanged in v10; its own spec |
| 4 | Founder: signed out = today's site | Research: ChatGPT-style usable app signed out | Founder's line |
| 5 | *"we don't need to say edit point"* | *"click on edit icon on it"* | Pencil `ToolButton` on hover of a suggestion opens `InlineEditor`; production point cards have no edit (`CardMenu` gets `onEdit` only at `app/pages/profile-page-v2.tsx:1750`, a story) |
| 6 | *"my partners is a part of chats"* | *"upgrading a chat to a partner is something else"* | One partner list (account menu), upgrade started from the chat |
| 7 | *"we don't have the rewind yet"* | *"rewind is only visible when I talk to my agent"* | Out of v10 |
| 8 | Ledger gap *"as in letter"* | `LetterRevealNumeric` hardcodes "You" for the rater (line 173) | `CalibrationVerdict` only; a `readerName` prop would be a production change |
| 9 | *"tap on the card ... turns the card"* | *"maybe it's expanding down"* | Turn in place |
| 10 | *"predicting position of the other person is exactly what makes point good"* | *"does it really matter if my predicted position is very far away"* | Keep Bob's guess (item 20), never score the gap |

## Open Questions

| # | [FOUNDER DECISION] | Recommendation |
|---|---|---|
| 1 | On Unsure or Disagree with a suggestion: next suggestion, or the pencil? | Pencil |
| 2 | Are V8 group chats and the real Groups page the same thing? (*"Spaces ... those are groups"*) | Groups = the real page; v10 shows DMs only. V8 `SpaceFilter` (ClarityPledge vs WhatsApp chips) is not shown |
| 3 | Agent chat pinned first (*"pin first works"*)? | Yes |
| 4 | Naming: the agent is "Agent" with initials until named (`mock-data.ts:87`); open `AgentDialog` on first Clarify? (*"everybody gives a name to their agent ... randomly generated name"*) | Yes, prefilled with a generated name |
| 5 | Adding someone who is not a partner (round 1: *"how do I add new partners and how to add people who are not partners"*): new chat by name or email | Yes; the dialog is V8 or NEW, to be named at /ux |
| 6 | Signed-out invitee opening a chat link | The real `/login`; join flow stays a non-goal |
| 7 | Telegram-style folders | No (one list) |
| 8 | "she" to "you" in Bob's point: v9 named Alice in the third person (`v9/shared/copy.ts:44`); the founder's source sentence is not in the recorded words (UNVERIFIED) | "you" in anything Alice reads |
| 9 | Story gap unit: `CalibrationVerdict` prints "{n}-point gap"; "point" is also the product's noun | Production copy as is |
| 10 | `StatementRow`'s Details is a raw `<a href="/point/{id}" target="_blank">` (line 84): in mock it opens the real app on a fictional id | Accept, labelled by the strip |
| 11 | Production `PositionButtons` (via V8 `StakePoint`, as in v8) brings localStorage intensity learning, analytics and the tutorial modal (`PositionButton.tsx:12-52`), which P1484 decision 9 avoided by using the presentational core | Keep production behaviour; clear intensity storage before each AC run; whether analytics is a no-op in dev is UNVERIFIED (`lib/mixpanel.ts` gates on `import.meta.env.PROD`, line 24) |
| 12 | `RatingRow`'s "Complete understanding" vs production "Complete cognitive understanding" | Production default |

## UX Notes

- **Main path (blind walk):** signed in as Bob, Alice's chat open; hover Alice's message, Clarify; take
  Agree on one suggestion, guess Alice, add a story, predict, Post; switch to Alice (strip): she answers
  the point, the stories open, she rates each; switch to Bob: open the ledger, turn the point and the story.
- **Unnamed agent:** first Clarify opens `AgentDialog` (pending Open Question 4).
- **Empty:** a chat with no messages shows the composer only; a ledger with no shared items shows the tabs
  with `(0)`.
- **Real pages:** keep their own loading, error and signed-out states and CTAs; those are not v10 elements.

## UI Contract

Production strings are free. Every other string on the main path:

| Where | Copy | Status |
|---|---|---|
| Hover action | "Clarify" | founder's word |
| Turn action | "Clarity Ledger" | Decision 4 |
| Reverse-story step label | to be set | [FOUNDER DECISION] |
| Bob's reverse prediction | "How well do you believe this story represents {Alice}'s intended meaning?" | NEW, recommended |
| Composer "+" items | "Point", "Story"; tooltip "Add a point, story, mention or emoji" | NEW, Decision 6 |
| Account menu | "My Profile", "Partners", "Settings" | production labels |
| App menu | "Chats", "Feed", "Groups", "Events", "Letters" | "Chats" NEW, rest production |
| Strip label | "Feed, Groups and Events are the real pages, shown signed out." | NEW |
| V8 strings kept | "Draft" (`DraftTag`), "Only visible to you" (`OnlyYou`), "Post" (`CARD_LINES.post`), "In the app this is {route}." (`QuietFrame`), "Close thread" / "Back to the conversation" (`SidePanel`), "Search everything", "Search is a mock in this prototype" (sidebar), "Opens its page in the app. Not part of this prototype." (`stake-cards.tsx:101`) | V8, listed for approval |
| Not rendered | `AgentReplyView`, `PointPreview`, `WriteOwn`, `ChatCardView` and their `CARD_LINES` copy ("Pick one, or write your own:", "Edit", "How sure are you? {her} won't see this until she rates.", ...); "Previewing as" | excluded |

## Acceptance Criteria

Checked at 1440, fresh session (intensity storage cleared), fictional data, browser not signed in to the app.

- [ ] 1. **Reuse gate, code half.** (a) Every import under v10's files resolves to a path in the reuse map
      or a v10 mock-data file. (b) `grep -rnE "<(button|input|textarea|select|label|ul|li|p|span|h[1-6])[ >]"`
      over v10's files returns lines only in one named layout file. (c) At runtime, every point card carries
      `data-card="point"` (`feed-point-card.tsx:359`) and their count equals the cards a person counts.
      **Known-bad control:** copy `v9/shared/position-picker.tsx` into the v10 folder and render it; (a)
      and (b) must fail. Both runs are attached.
- [ ] 2. **Reuse gate, screen half.** A reviewer who did not build v10, given the running page and this
      reuse map, lists every rendered element on every state of the main path with its source; any element
      not traceable to a reuse-map row or an approved NEW row fails.
- [ ] 3. **Design consistency.** A second reviewer compares shell, rows, hover and composer with
      the founder's references (chosen chat style per Decision 1, Slack hover top right with the whole row
      highlighted, Notion account row bottom left); each mismatch is fixed or recorded as a founder decision.
- [ ] 4. **Blind walk.** A first-time user who has not seen v8, v9 or this spec walks the main path with a
      one-sentence task; every stop or question is recorded with its screen.
- [ ] 5. **No v9 left.** `find src/app/prototypes/v9` returns nothing; `grep -rn "prototypes/v9" src` returns nothing.
- [ ] 6. A point card in a chat, in Clarify and in the ledger is the same `StakePoint` draft variant: same
      tag pills, same position row, no `...` menu, no `Details →`; the second tap on Agree opens Somewhat
      Agree / Agree / Strongly Agree, and the choice shows as `Agree+` / `Agree−` (pending Decision 7).
- [ ] 7. A story card in a chat and in the ledger is the same `FeedStoryCard`: avatar, name, time, tags,
      linked points.
- [ ] 8. Hovering a message highlights the whole message and shows, at its top right, the agent's avatar and
      "Clarify"; nothing shows without hover (pending Contradiction 1).
- [ ] 9. Clarify opens beside the chat, Alice's chat stays visible, and Alice's view shows nothing from it
      before Post. It holds 1 to 3 point cards; no button reads "Edit", "Edit the point" or "Post" inside a
      suggestion and no text input sits in the agent's reply; after any Agree level the next step appears
      under the same card, which stays live; each step has one primary action.
- [ ] 10. In Alice's view, Bob's story and reverse story are not shown until she answers the point; each
      story is readable before she rates it; Bob's guess and each prediction number appear only after she
      commits the matching answer; Bob's view then shows `CalibrationVerdict` with `perspective="sender"`.
- [ ] 11. Turning a point in the ledger shows `StatementRow` with both actual positions; turning an
      unanswered story shows "Pending"; no sentence appears that a reused component does not print.
- [ ] 12. Signed out goes to the real `/feed` with today's header; nothing from v10 is drawn on it.
- [ ] 13. Signed in, Feed, Groups and Events open the real pages inside the shell; Pledgers is not
      reachable inside the shell, including through links on those pages; the account row shows Bob's photo.

## Done-When

- [ ] Decisions 1 to 5 are answered and written into this spec before the build starts.
- [ ] Typecheck and unit tests pass with the v9 tests removed and the v8 tests unchanged.
- [ ] AC 1 and AC 2 outputs are attached, with `<reports received> of <reviewers spawned>`.

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| Real pages act with the browser's real session; a signed-in tester's position click on the real Feed writes to the database the dev server points at | MITIGATE | ACs run signed out; strip label. Which database the dev server reads is UNVERIFIED |
| `FeedPointCard` / `FeedStoryCard` under `mock` may still read the network (counts, linked content) | MITIGATE | Network log during AC 2 |
| Building before Decisions 1 to 5 rebuilds twice | MITIGATE | Done-When item 1 |
| Reuse forces a look the founder dislikes (`Agree+`, "point gap") | ACCEPT | Raised as production copy questions, never patched in the prototype |
| Evolving v8 in place breaks its other paths | MITIGATE | v8 tests unchanged (Done-When) |

**Non-Goals**
- Do NOT change production components, pages or copy, except: optional prototype-only props that no
  production caller passes (Decision 4 class), and the tab extraction if Decision 5 says yes.
- Do NOT add a component, wrapper or string that is not in the reuse map, an approved NEW row or the UI Contract.
- Do NOT render `AgentReplyView`, `PointPreview`, `WriteOwn` or `ChatCardView` in v10.
- Do NOT build mobile layouts, rewind, gap scoring of guesses, WhatsApp, join flow or the helper.
- Do NOT edit V8 files except by adding optional props whose defaults keep today's behaviour.

## Invariants

- Positions are chosen only with production `PositionButtons`, never a copy.
- Agents never score and never write for the other person; a mirror agent's role is always shown (ruling 2026-10-12).
- Two seals: Bob's stories open for Alice only after her answer on the point; Bob's numbers and guess
  open only after her matching answer. She reads a story before rating it.

## Rulings harvested

2026-10-12 [product] mental model and mirror-agent role · 2026-10-12 [product] Clarity Chat loop ·
2026-10-02 [product] `/` to `/feed`, one CTA "Book a 15-min discovery call" · 2026-09-16 [product] Links
menu on every product surface · 2026-09-11 [product] a story behaves the same wherever it is read (P1296).

## Related

P1485 (v8, v9; `features/p1485_clarity_chat_v8_light_cards.md` on branch `feature/p1437-conversation-groups-v2`) ·
[P1484](p1484_clarity_chat_letter_loop_v7.md) (letter loop, seals) ·
[P1437](p1437_conversation_groups_agents_check_understanding.md) ·
[P1459](p1459_clarity_chat_clarity_ledger.md) (ledger placeholder) ·
[P1462](p1462_clarity_chat_left_menu.md) (left menu placeholder) ·
[P1458](p1458_clarity_chat_agents_on_other_people.md)
