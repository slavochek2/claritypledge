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
> `/tree/v9/ledger`) live. Dev-only route, mock data, no network writes from prototype code.
> P1485 (`features/p1485_clarity_chat_v8_light_cards.md` on branch `feature/p1437-conversation-groups-v2`) is the predecessor; its rules hold
> unless this spec names a change. All paths below are relative to `src/` and were checked against
> the branch at `1b728bd27`.

## Problem

**Situation:** v9 split Clarity Chat into three pages (menu, make, ledger), each on a third chat kit,
with its own point card, position picker, story card and ledger page.
**Complication:** The founder rejected all three for the same reason: they diverge from each other
and from the product, and they reinvent components that exist.
**Question:** What does ONE prototype look like when every element on screen is an existing
production component, an existing v8 prototype component, or an explicitly approved new one?

> Founder framing, verbatim (2026-10-14/15):
>
> *"why did you create custom buttons ... next time we need a review please review hard harsh adversarial review on reusing components you invented a new fucking point component ... normal point components normal story components no form on the things that exist no reinvention needed"*
>
> *"now make is very different than for example slash three conversation groups and menu and so on now now they are diverging ... maybe we should be actually working on one prototype instead"*
>
> *"it wasn't good to diverge we need to converge back and work on one ... go hard on reusing the components that we have anything there needs to be either eliminated or reused"*
>
> *"exactly, we want to... we don't want new build, we want to reuse ... and reuse more and be more consistent, not less consistent"*
>
> *"maybe when we create this spec we need to be clear that it's consistent and that makes sense you know maybe i'm creating contradictory things ... this is why adversarial reviewer is important"*

## Appetite

- **Blast radius:** one dev-only prototype route plus the deletion of v9. Production components are
  used as they are; the two places where that is impossible are listed as founder decisions, not built.
- **Reversibility:** git revert.
- **Decision density:** high. 16 contradictions and 12 open questions below; the build waits on
  the ones marked BLOCKING (Contradiction 1, Open Questions 1, 2, 5, 8).
- **Desktop only (1440).** Founder: *"we don't need to optimize for mobile yet"*.

## Solution

One route, `/tree/v10` [FOUNDER DECISION: URL; or evolve `/tree/conversation-groups` in place],
two states switched by the existing prototype strip:

- **Signed out:** the real website, unchanged. v10 shows nothing of its own; "signed out" links to
  the real `/feed`.
- **Signed in:** a messenger shell built from the v8 shell, with the real Feed, Groups and Events
  pages mounted inside it, chats as home, and Clarify, the composer "+" and the ledger built from
  the components in the reuse map.

### 1. Reuse map

Every element v10 renders. "PROD" = production component, used with today's props. "V8" = the v8
prototype (`app/prototypes/conversation-groups/`, or `letter-review/` where noted). Nothing may be
rendered that is not in this table.

| # | Element | Source (path, export) | Kind | Note |
|---|---|---|---|---|
| 1 | Point card, everywhere (chat, Clarify, ledger) | `app/components/feed/feed-point-card.tsx` `FeedPointCard` via `mock`, `draft`, `hideFooter`, `statementPrefix`, `renderLinkedStory` | PROD | Pattern already in V8 `stake-cards.tsx` `StakePoint`. Never rebuilt from `PointCardShell` |
| 2 | Position control | `app/components/shared/PositionButton.tsx` `PositionButtons` (inside `FeedPointCard`) | PROD | Disagree / Unsure / Agree, second tap opens Somewhat / plain / Strongly, chosen strength shows `Agree+` / `Agree−` (`app/utils/position-labels.ts`). Behaviour under `mock` (no network) UNVERIFIED in v10 |
| 3 | Story card, everywhere | `app/components/feed/feed-story-card.tsx` `FeedStoryCard` via `onNavigate`, `authorOverride`, `linkedPoints` | PROD | Same in chat and ledger |
| 4 | Story nested in a point | `app/components/social/point-card-with-links.tsx` `QuotedStory` | PROD | Already used by V8 `StakeQuoted` |
| 5 | Signed-out site | the real site at `/feed` (`SimpleNavigation`, `FeedPage`) | PROD | Not re-rendered; a link |
| 6 | Shell, sidebar, collapse | V8 `letter-review/chat-kit.tsx` `ChatShell`, `SidebarFrame` | V8 | `SidebarFrame` has a `footer` slot |
| 7 | App menu in the sidebar | V8 `app-menu.tsx` `AppMenu`, `signedInItems` (Home, Letters, Partners, Groups, My Profile, the bottom-nav order) | V8 | |
| 8 | Real Feed / Groups / Events pages in the main pane | v9 `menu/real-pages.tsx` `RealPage`, `InShellLinks` | moved from v9 | Mounts the real `FeedPage`, `OrgDirectoryPage`, `OrgPage`, `EventsPrototype` (routed in prod at `/events/*`). The one v9 file kept; it moves into the v10 folder |
| 9 | Pages with no mock path (Partners, My Profile, Settings) | V8 `app-menu.tsx` `QuietFrame` ("In the app this is /settings.") | V8 | The real pages read the session; see Contradiction 9 |
| 10 | Account row, bottom left | V8 sidebar footer (`ui.tsx` `Avatar` + `Presence` + name) | V8 | Photo: `components/ui/gravatar-avatar.tsx` `GravatarAvatar` (PROD). What it shows for a fictional email UNVERIFIED |
| 11 | Account menu (My Profile, Settings) | **missing**, see Open Question 3 | | Nearest: `layout/navigation-menu-items.tsx` `NavigationMenuItems` "Your account" block, which reads real auth state |
| 12 | Tools | `components/layout/event-links-menu.tsx` `EventLinksButton` | PROD | Links menu, ruling 2026-09-16 |
| 13 | Letters page | V8 `letters-page.tsx` `LettersPage` | V8 | Production `pages/letters-page.tsx` reads `useAuth` |
| 14 | Chat list rows, search | V8 `ConversationGroupsPrototype.tsx` sidebar rows, `space-filter.tsx` | V8 | Folders: Open Question 7 |
| 15 | Message rows | V8 `letter-review/chat-kit.tsx` `MyBubble` (right, blue) and `AgentBubble` (left) OR V8 `ui.tsx` `Message` (Slack rows) | V8 | One of the two, Contradiction 1 |
| 16 | Hover toolbar, top right, whole row highlighted | V8 `ui.tsx` `Toolbar`, `ToolButton` (row hover `bg-gray-100`) | V8 | |
| 17 | "Clarify" action icon | V8 `ui.tsx` `Avatar` with `agent` (the agent's square avatar) inside `ToolButton` | V8 | Label is new copy, UI Contract |
| 18 | Composer (textarea, "+", mic, send) | V8 `ui.tsx` `Composer` | V8 | Its "+" offers only Mention and Emoji today |
| 19 | Composer "+" Point / Story | **missing**, see Open Question 1 | | Nearest: V8 `commands.ts` `pointsFor` + `chat-card.tsx` `AgentReplyView` (agent lists up to 3 of Bob's points) |
| 20 | Mira's 1 to 3 suggestions | V8 `chat-card.tsx` `AgentReplyView`, inside V8 `mirror.tsx` `AgentMessage` | V8 | Each suggestion is item 1 with `draft` |
| 21 | Correcting a suggestion | V8 `letter-controls.tsx` `InlineEditor` | V8 | Trigger: Contradiction 5 |
| 22 | Agent naming | V8 `agents.tsx` `AgentDialog` | V8 | v9's naming chat is deleted |
| 23 | Writing a story or reverse story | V8 `letter-controls.tsx` `InlineEditor`; V8 `commands.ts` `reverseDraft` for the agent's draft | V8 | |
| 24 | Seal and reveal rules | V8 `letter-state.ts` | V8 | Story and reverse story sealed until the other person's blind answer (decided) |
| 25 | 0 to 10 rating | `app/components/shared/comprehension-rating-card.tsx` `ComprehensionRatingCard` | PROD | V8 `RatingRow` wraps it but overrides `highLabel` to "Complete understanding" (production default "Complete cognitive understanding"): Contradiction 11 |
| 26 | "Alice in Bob's eyes" mark | V8 `eyes-mark.tsx` `EyesMark`, `eyesName` | V8 | Ruling 2026-10-12 |
| 27 | Ledger page frame, tabs Points / Stories | `app/pages/stake-page.tsx` tab markup (lines 474-493, not exported) | PROD, not reusable as is | Open Question 5 (BLOCKING) |
| 28 | Ledger, point turned | `app/components/compare/statement-row.tsx` `StatementRow` (`compact`, `meInFirstPerson`), `StanceColumn` | PROD | Labels from `lib/compare-positions.ts` |
| 29 | Ledger, story turned (a gap) | `app/components/letters/calibration-verdict.tsx` `CalibrationVerdict` (`perspective: 'reader' \| 'sender'`, `readerName`) | PROD | |
| 30 | Ledger, story turned (scale) | `app/components/letters/letter-reveal-numeric.tsx` `LetterRevealNumeric` (`compact`) | PROD | Reader label hardcoded "You" (line 173): only correct on the rater's own screen. Contradiction 12 |
| 31 | Ledger, live score | `app/components/shared/RatingDots.tsx` `RatingDots` | PROD | |
| 32 | "Clarity Ledger" action on a card | **missing**, see Open Question 2 | | |
| 33 | Partner upgrade | `app/components/agreements/agreement-certificate.tsx` `AgreementCertificate` (`variant="creation"`, `partnerNameValue`, `partnerNameReadOnly`) in `components/layout/certificate-page-shell.tsx` `CertificatePageShell` | PROD | Prefill: Open Question 4 |
| 34 | Partner status in the chat | **missing**, see Open Question 4 | | Nearest: `components/agreements/agreement-row.tsx` `AgreementRow` |
| 35 | Prototype strip (Bob / Alice, signed in / out) | V8 `prototype-strip.tsx` | V8 | |

**NEW (founder-approved): none.** Items 11, 19, 32 and 34 are missing and wait on Open Questions.

### 2. Delete list

Removed in the same build, after v10 passes the reuse gate (AC 1). Verified by `find` and `grep`:
nothing outside `app/prototypes/v9/` imports v9 except `App.tsx` and the five v9 tests.

| File or export | Duplicates |
|---|---|
| `app/prototypes/v9/shared/position-picker.tsx` `PositionPicker` | `PositionButtons` |
| `app/prototypes/v9/shared/vocab.ts` `GROUPS`, `groupOf` | `BUTTON_GROUPS` (`position-groups.ts`) |
| `app/prototypes/v9/shared/cards.tsx` `PointCard`, `Stand`, `StoryFrame`, `StoryCard`, `SeeLedger`, `ChatCards`, `pendingFor` | `FeedPointCard`, `StatementRow`, `FeedStoryCard` |
| `app/prototypes/v9/shared/understanding-scale.tsx` `UnderstandingScale`, `StoryVerdict`, `GapNote` | `LetterRevealNumeric`, `CalibrationVerdict`, `GapBanner` |
| `app/prototypes/v9/shared/identity.tsx` `PersonAvatar`, `AgentAvatar`, `agentLabel` | `components/ui/person-avatar.tsx` `PersonAvatar`, `GravatarAvatar isAgent` |
| `app/prototypes/v9/shared/chat.tsx` (`Bubble`, `Composer`, `ChatHeader`, `Chips`, `AgentLine`, `ClarifyAction`, `RewindAction`, `CHAT_ROW`) | V8 `ui.tsx`, V8 `chat-kit.tsx` |
| `app/prototypes/v9/shared/onboarding.tsx` | V8 `agents.tsx` |
| `app/prototypes/v9/shared/clarify/ClarifyPanel.tsx`, `flow.ts` | V8 `AgentReplyView`, `ask-thread.tsx` |
| `app/prototypes/v9/shared/ledger-entry.tsx`, `ledger-slot.tsx`, `ledger/LedgerPrototype.tsx` | `ComparePage` pattern, `StatementRow` |
| `app/prototypes/v9/menu/MenuPrototype.tsx`, `chat.tsx`, `me.tsx`, `agreement.tsx`, `model.ts` | V8 shell, `ProfileConnectionsPage`, `SettingsPage`, `AgreementRow`, `CreateAgreementPage` |
| `app/prototypes/v9/make/MakePrototype.tsx` | V8 shell |
| `app/prototypes/v9/shared/copy.ts`, `seed.ts`, `store.ts`, `agent.ts`, `viewer.ts`, `index.ts` | mock state; anything v10 needs moves into the v10 folder, the rest goes |
| `App.tsx` lines 119-121 and 1170-1172 (the three `/tree/v9/*` routes) | |
| `tests/p1485-v9-{ledger,make-flow,make-page,menu-shell,shared-kit}.test.tsx` | tests of deleted code |

Kept: `app/prototypes/v9/menu/real-pages.tsx` moves to the v10 folder (reuse map item 8).
[FOUNDER DECISION: retire v9 pages] carried below.

### 3. Areas

**a. Signed out and signed in**

> *"for the sign out if we orient ourselves on notion ... the feed is maybe the starter starting point ... if I'm logged out now what do I have well I have use cases at top book 15 minutes tools login fine why don't we do that as is ... and when the person is logged in then we switch to the chat like interface"*
> *"at the bottom there is the account and so on. Settings are there"* · *"why am I not showing the picture properly on the bottom left"* · *"is me the new my profile I would much rather prefer my profile"*
> *"if chats are the new home then feed needs to be somehow there groups and events are kind of similar things ... by clicking on groups I rather just keep it as is groups I see all groups ... what happened to letters ... where did tools go"*
> *"pleasures [pledgers] is not something that is part of the product by the way"*
> *"you invite somebody normally, upgrading to a partner is something else ... if you look at the page of actual slash agreements new create, it's like very specific, you know, it can be prefilled out of for example some chat"*

| Signed out | Signed in |
|---|---|
| Today's site as is: Use cases, Book a 15-min discovery call (primary), Tools, Log in; `/` goes to `/feed` (ruling 2026-10-02) | Chats are home. Sidebar: app menu (item 7), chat list (14), account row bottom left with photo (10) |
| Nothing new | Feed, Groups, Events: the real pages in the main pane (8). Letters: V8 page (13). Tools: `EventLinksButton` (12). My Profile, Partners, Settings: `QuietFrame` (9). Pledgers: not in the app |
| | Invite = a new chat. Upgrade to partner = the agreement certificate (33), prefilled from the chat. **Prefill does not exist today:** `pages/create-agreement-page.tsx` reads no URL parameters (grep for `useSearchParams`, `URLSearchParams`, `location.state`: no hits). See Open Question 4 |

**b. Chat**

> *"we orient ourselves more like telegram ... in the bottom I have myself ... look at how clean it is"*
> *"So either do Slack like or Telegram like, but not what we currently have. What we currently have is a weird hybrid."*
> *"when I hover over a message, the message is not you know selected ... the icon should be Mira's icon clarify ... we don't need to say with Mira because then it always changes and then it should be on the right top on the message like in slack or in telegram and the message has to be like selected properly"*
> *"it's not clear how I forward it into a chat and how in any chat I can select any story so this plus icon on the left that we had before in the input field probably is important"*

- Messages: one style for the whole app (Contradiction 1).
- Hover: the whole message row highlights; the toolbar sits at the row's top right (item 16) with
  one action, the agent's avatar plus "Clarify" (item 17).
- Composer: V8 `Composer` (item 18). Posting an existing point or story into any chat needs two
  items in its "+" menu that do not exist (Open Question 1).

**c. Clarify**

> *"it should suggest some options so I can correct them so one two three and I can correct"*
> *"if it is a point then we reuse the card then it's strongly agree strongly disagree you don't invent"*
> *"then it says edit point but that's not cool we don't need to say edit point ... if I agree why do I need to edit the point I already agree if I strongly agree I don't know just proceed ... I can probably hover over it and click on edit icon on it"*
> *"after the point I should say add a story right or at the reverse story that's not clear how that happens at all"*
> *"we need to use as much as possible the formulations that we already have"*

| Step | What the person sees | Source |
|---|---|---|
| 1 | Clarify on a message opens the agent's reply with 1 to 3 suggested points | items 20, 1 (`draft`) |
| 2 | They take a position on a suggestion with the product's own buttons | item 2; no "Edit the point" button anywhere |
| 3 | Any Agree level proceeds. Unsure or Disagree: Open Question 6 | |
| 4 | "Add your story" and "Add how you think Alice sees it" appear as visible steps | items 23, 26; step labels are [FOUNDER DECISION: copy], v9's chips are deleted |
| 5 | Each story is sealed with a prediction, then posted into the chat; sealed until Alice's blind answer | items 24, 25 |

Rating sentences, verbatim from production (no rewording):

| Who, what | Sentence | Source |
|---|---|---|
| Bob, own story, predicts | "How well do you believe {Alice} understands your intended meaning behind your story?" | `components/letters/letter-prediction-walk.tsx:116` |
| Alice, Bob's story | "How well do you believe you understand {Bob}'s intended meaning behind their story?" | `components/letters/letter-flow-content.tsx:928` |
| Alice, Bob's reverse story | "How well do you believe this story represents your intended meaning?" | `letter-flow-content.tsx:927` |
| Bob, reverse story, predicts | **no production sentence exists** (v9 marked its own as NEW, `v9/shared/copy.ts:53`) | Open Question 8 |

**d. Ledger**

> *"So on points, I need to see the points. On stories, I need to see the stories. And it has to be exactly like stakes. It is the only difference that I guess I see the other side. I can see the other side of the card"*
> *"on the points it's clear it's just a comparison and this is exactly what we already built no need to invent it compare is the page on the stories it just shows the ledger which is whatever we have if it's just like a gap then it's a gap if it's like scoring from life it's scoring from life"*
> *"why it has so much text what is this text you invented stuff no invention please just just reuse what we have story cards gaps as in leather [letter] we just need to figure out the turning from the story to this which i suggested before it's a small button clarity ledger or something like that"*

| | Front of the card | Turned (other side) |
|---|---|---|
| Point | `FeedPointCard` (1) | `StatementRow` (28), the compare row, two `StanceColumn`s |
| Story with a sealed prediction | `FeedStoryCard` (3) | `CalibrationVerdict` (29), `perspective` = whose screen |
| Story scored live | `FeedStoryCard` (3) | `RatingDots` (31) |

- Page: Points / Stories tabs with counts, like `/stake/:tag` (item 27, Open Question 5); the person
  being compared is chosen at the top. `/stake` has no person selector (checked: no picker in
  `stake-page.tsx`); `/compare/:slug` takes the person from the URL and shows them in its header.
- The only added control is the turn action (item 32). No text on the turned side beyond what the
  reused component prints.
- From a story in the ledger, its point is reachable through the card's own linked points (item 3);
  from a point, its stories through the card's own stories footer.

## Contradictions

Each pair below is two founder requirements that cannot both hold, or one that reads two ways. A
recommendation is given; none is decided here.

| # | Requirement A | Requirement B | Recommendation |
|---|---|---|---|
| 1 | *"either do Slack like or Telegram like, but not what we currently have ... a weird hybrid"* | *"we orient ourselves more like telegram"* + hover *"on the right top on the message like in slack"* with *"the message ... selected properly"* | Telegram bubbles (`MyBubble` right, `AgentBubble` left) with the V8 hover toolbar placed on the bubble row. That is a hybrid at the hover level only, which the founder asked for. [FOUNDER DECISION: message style] **BLOCKING** |
| 2 | *"it's strongly agree strongly disagree you don't invent"* | *"why did you create custom buttons"* (use the product's buttons) | `PositionButtons` as is: "Strongly Agree" appears in its second-tap menu, the chosen segment then reads `Agree+`. Both quotes hold; no inline strength row. [FOUNDER DECISION: confirm `Agree+` on the card] |
| 3 | Round 1: *"Clarify is better, but clarify with the name of the agent"* | Round 4 (latest): *"we don't need to say with Mira because then it always changes"* | Round 4: the agent's avatar plus "Clarify", no name in the label. [FOUNDER DECISION: confirm] |
| 4 | Signed out *"why don't we do that as is"* (the site keeps Pledgers under Product in its menu, `layout/nav-links.ts`) | *"pledgers is not something that is part of the product"* | Signed in: no Pledgers. Signed out: unchanged, since "as is" is the binding line; moving Pledgers out of the public menu is a separate production change. [FOUNDER DECISION] |
| 5 | *"we don't need to say edit point"* | *"I can probably hover over it and click on edit icon on it"* | No "Edit" text; a pencil `ToolButton` on hover of a suggestion opens `InlineEditor`. Production point cards have no edit at all (`CardMenu` gets `onEdit` only from `profile-page-v2.tsx:1750`, a story), so this exists only on drafts. [FOUNDER DECISION] |
| 6 | Signed out *"as is"* | *"don't you think that the product category has to be above use cases"* (and `nav-links.ts` records the earlier founder call "Use cases leads") | Keep v10 signed out as is; reordering the public header is a production change for its own spec. [FOUNDER DECISION] |
| 7 | Signed out = today's site (founder) | research on ChatGPT: a usable app shell signed out, sell the gate inline | Founder's line wins for v10; the ChatGPT model is recorded, not built. [FOUNDER DECISION: confirm] |
| 8 | *"my partners live under me"* / *"my partners is a part of chats"* | *"upgrading a chat to a partner is something else"*, and the existing page `/p/:slug/partners` | Partners reachable from the app menu (production order already has it); in a chat, the upgrade happens from that chat and shows there as status. One list, two entry points. [FOUNDER DECISION] |
| 9 | *"by clicking on groups I rather just keep it as is"* (real pages) | Mock-only prototype: `RealPage` mounts real pages with whatever session the browser holds, and Partners, My Profile, Settings read the session | Real pages only where they render signed out (Feed, Groups, Events); `QuietFrame` for the rest. [FOUNDER DECISION] |
| 10 | Ledger *"exactly like stakes"* (`/stake` lists oldest first) | *"compare is the page"* (`/compare` lists largest gap first, `compare-page.tsx:5`) | Points tab sorted like compare (gap first), stories like stake (oldest first)? or one order for both. [FOUNDER DECISION: ledger sort order] |
| 11 | *"reuse what we have"* (production `ComprehensionRatingCard` high label "Complete cognitive understanding") | V8 `RatingRow` overrides it to "Complete understanding" | Use the production default in v10. [FOUNDER DECISION: confirm] |
| 12 | Ledger shows the story gap *"as in letter"* | `LetterRevealNumeric` labels the rater "You" (hardcoded), so on Bob's screen it would call Alice "You" | Bob's screen: `CalibrationVerdict perspective="sender"` only; Alice's screen: verdict plus scale. A `readerName` prop like `LetterRevealOrdinal`'s (P1469) would be a production change. [FOUNDER DECISION] |
| 13 | Ledger: *"tap on the card ... turns the card"* / *"I can see the other side of the card"* | *"maybe it's expanding down ... expanding in a different way than expand point or details"* | Turn in place: the card is replaced by its other side, same width, with the same action to turn back; nothing expands below. [FOUNDER DECISION] |
| 14 | *"we don't have the rewind yet"* | *"we can also show rewind, but rewind is only visible when I talk to my agent"* | No rewind in v10 (nothing to reuse). [FOUNDER DECISION: confirm out] |
| 15 | *"in the reverse story i predict how much i understand my story represents their intent"* | No production sentence for that prediction (Open Question 8) | See Open Question 8 |
| 16 | *"So it's like point is the minimum ... predicting position of the other person is exactly what makes point good"* | *"does it really matter if my predicted position is very far away from the actual position? I don't know."* | v10 does not ask Bob to predict Alice's position; the ledger compares actual positions only. [FOUNDER DECISION] |

## Open Questions

| # | Question | Founder words | BLOCKING |
|---|---|---|---|
| 1 | [FOUNDER DECISION: allow new "Point" and "Story" items in the V8 composer "+" menu, opening the V8 `AgentReplyView` list of your own points or stories?] | *"this plus icon on the left that we had before in the input field probably is important"* | yes, for area b |
| 2 | [FOUNDER DECISION: allow a new small action on point and story cards that turns the card; label "Clarity Ledger" or "See ledger"?] | *"it's a small button clarity ledger or something like that"* · *"see ledger is maybe short CTA"* | yes, for area d |
| 3 | [FOUNDER DECISION: allow a new account menu above the bottom-left row (My Profile, Settings), reusing the "Your account" labels?] | *"at the bottom there is the account and so on. Settings are there"* | no |
| 4 | [FOUNDER DECISION: partner upgrade path. A: render `AgreementCertificate variant="creation"` prefilled from the chat inside v10 (no production change; ProfilePickerInput, visibility and Seal & Send are inline in `CreateAgreementPage` and are not rendered). B: add a default-off prefill parameter to `CreateAgreementPage` (production change). C: link to the real page, no prefill. Plus: allow a new "pending" status line in the chat?] | *"it can be prefilled out of for example some chat"* · *"this is like one of the messages that is there and it says pending or whatever I actually don't know what makes sense"* | no |
| 5 | [FOUNDER DECISION: the stake tabs are inline markup in `stake-page.tsx`. Extract them into an exported component with no behaviour change (production change), or copy them (fails the reuse gate)?] | *"it has to be exactly like stakes"* | yes, for area d |
| 6 | [FOUNDER DECISION: on Unsure or Disagree with a suggestion, what happens: next suggestion, or the pencil?] | *"if I agree ... just proceed"* | no |
| 7 | [FOUNDER DECISION: one chat list, or Telegram-style folders (V8 `SpaceFilter`)?] | *"in telegram or in whatsapp you see double menu so menu on the left there is chats updates communities"* | no |
| 8 | [FOUNDER DECISION: allow one new sentence for Bob's prediction on his reverse story, written in the letter's pattern?] | *"we need to use as much as possible the formulations that we already have"* | yes, for area c |
| 9 | [FOUNDER DECISION: retire the three v9 pages in this build?] Recommendation: yes, after AC 1 passes. | *"it wasn't good to diverge we need to converge back and work on one"* | no |
| 10 | [FOUNDER DECISION: where Letters and Tools sit signed in.] Recommendation: Letters in the app menu (production order), Tools as `EventLinksButton` in the chat header. | *"what happened to letters ... where did tools go because we have tools for signed in and for non-signed in as well"* | no |
| 11 | [FOUNDER DECISION: "she" to "you" in Bob's point.] Mira's lines in v9 name Alice in the third person ("Add how you think she sees it?", `v9/shared/copy.ts:44`); a point posted into the Bob-Alice chat is read by Alice. Which sentence carried "she" is not recorded in the founder's words (source: the orchestrator's brief; UNVERIFIED). | none in the input | no |
| 12 | [FOUNDER DECISION: story gap unit wording.] `CalibrationVerdict` prints "{n}-point gap"; "point" is also the product's name for a statement. Production copy, used as is unless changed. | *"gaps as in letter"* | no |

## UX Notes

- **Happy path (main path for the blind walk):** signed in as Bob, Alice's chat is open; hover
  Alice's message, Clarify; pick one of the suggestions with Agree; add a story and seal it; post;
  switch to Alice; she answers blind; switch back; open the ledger on Alice, turn the point and the
  story.
- **Empty:** a chat with no messages shows the V8 composer only. The ledger with no shared points
  shows the tabs with `(0)`.
- **Error / loading:** mock, none, except the real pages (item 8), which keep their own loading and
  error states.

## UI Contract

Only strings printed by reused components, plus these. Anything else on screen fails AC 1.

| Where | Copy | Status |
|---|---|---|
| Hover action | "Clarify" | founder's word |
| Card turn action | "Clarity Ledger" or "See ledger" | [FOUNDER DECISION], Open Question 2 |
| Clarify steps 4 | step labels | [FOUNDER DECISION: copy] |
| Rating sentences | the four in area c, verbatim | production (three), Open Question 8 (one) |
| Composer "+" items | "Point", "Story" | [FOUNDER DECISION], Open Question 1 |

## Acceptance Criteria

Checked at 1440 on a fresh session, fictional data, in a browser that is not signed in to the app.

- [ ] 1. **Reuse gate (adversarial).** A reviewer who did not build v10, given only the running
      page and this spec's reuse map, lists every rendered element on every state of the main path
      and its source. Any element not traceable to a row of the reuse map, or to an Open Question
      the founder approved, fails the AC. The list and the verdict are attached to the spec.
- [ ] 2. **Design consistency.** A second reviewer compares the signed-in shell, message rows, hover
      and composer against the founder's references (Telegram chat list and bubbles, Slack hover
      toolbar at top right with the whole row highlighted, Notion account row bottom left) and
      reports each mismatch; every mismatch is fixed or recorded as a founder decision.
- [ ] 3. **Blind walk.** A first-time user who has not seen v8, v9 or this spec walks the main path
      (UX Notes) with one sentence of task; every point where they stop or ask is recorded with
      the screen.
- [ ] 4. **No v9 duplicate remains.** `find src/app/prototypes/v9` returns nothing except what the
      founder kept under Open Question 9; `grep -rn "prototypes/v9" src` returns nothing.
- [ ] 5. A point card in a chat, in Clarify and in the ledger is the same `FeedPointCard`: same tag
      pills, same `...` menu, same `Details →`, same position row; the second tap on Agree opens
      Somewhat Agree / Agree / Strongly Agree, and the chosen one shows as `Agree+` / `Agree−`.
- [ ] 6. A story card in a chat and in the ledger is the same `FeedStoryCard`: avatar, name, time,
      tags, linked points, `Details →`.
- [ ] 7. Hovering a message highlights the whole message and shows the toolbar at its top right
      with the agent's avatar and "Clarify"; no "with Mira" anywhere.
- [ ] 8. Clarify shows 1 to 3 suggestions; no button reads "Edit the point"; taking any Agree level
      moves to the story steps without another tap.
- [ ] 9. Bob's story and reverse story are not readable in Alice's view before she answers; after
      she answers, the ledger shows the gap with `CalibrationVerdict` on Bob's screen.
- [ ] 10. Turning a point in the ledger shows `StatementRow` with both people's labels from
      `compare-positions.ts`; no sentence appears that the reused components do not print.
- [ ] 11. Signed out, v10 sends the visitor to the real `/feed` with today's header (Use cases, Book
      a 15-min discovery call, Tools, Log in); nothing from v10 is drawn on it.
- [ ] 12. Signed in, Feed, Groups and Events open the real pages inside the shell; Pledgers is not
      reachable from the app menu; the account row bottom left shows a photo, not initials.

## Done-When

- [ ] Every BLOCKING Open Question has the founder's answer written into this spec before the build
      starts.
- [ ] Typecheck and the prototype's unit tests pass with the v9 tests removed and the v8 tests
      unchanged.
- [ ] The reuse-gate list (AC 1) is attached, with `<reports received> of <reviewers spawned>`.

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| Real pages inside the shell act with the browser's real session; a signed-in tester clicking a position on the real Feed writes to the database the dev server points at | MITIGATE | ACs run signed out; the strip says which pages are real. Which environment the dev server reads is UNVERIFIED |
| `FeedPointCard`/`FeedStoryCard` under `mock` may still render something that reads the network (counts, linked content) | MITIGATE | The reuse gate (AC 1) and a network log during the walk |
| The founder's lines contradict each other (16 rows); building before the BLOCKING answers rebuilds twice | MITIGATE | Done-When item 1 gates the build |
| Reuse forces a look the founder does not like (e.g. `Agree+`, "point gap") | ACCEPT | That is a production copy question, raised as a founder decision, never patched in the prototype |
| v10 and v8 drift again, two prototypes on one branch | DEFER | Unblocked by the URL decision (evolve v8 in place or keep both) |

**Non-Goals**
- Do NOT change any production component, page or copy. The three places a change could be wanted
  (stake tabs, agreement prefill, numeric reveal reader label) are Open Questions.
- Do NOT add a component, wrapper or string that is not in the reuse map or an approved Open Question.
- Do NOT build mobile layouts, rewind, predicted positions, WhatsApp, join flow or the helper (v8
  keeps those on its own route).
- Do NOT edit v8 files except by adding optional props that default to today's behaviour.

## Invariants

- Positions are chosen only with the production `PositionButtons`, never a copy (founder, 2026-10-15).
- Agents never score and never write for the other person; a mirror agent's role is always shown
  (ruling 2026-10-12).
- Story and reverse story stay sealed until the other person's blind answer (decided, P1484).

## Rulings harvested

- 2026-10-12 [product] "Alice in Bob's eyes" is a mental model; mirror agent shows its role.
- 2026-10-12 [product] Clarity Chat loop and `clarity-chat` workstream.
- 2026-10-02 [product] `/` goes to `/feed`; every landing carries one CTA, "Book a 15-min discovery call".
- 2026-09-16 [product] The Links menu (Points / Letters / Tools) is on every product surface.
- 2026-09-11 [product] A story behaves the same wherever it is read (P1296): one footer, clamp, share sheet.

## Related

P1485 (v8, v9; `features/p1485_clarity_chat_v8_light_cards.md` on branch `feature/p1437-conversation-groups-v2`) ·
[P1484](p1484_clarity_chat_letter_loop_v7.md) (letter loop, seal rules) ·
[P1437](p1437_conversation_groups_agents_check_understanding.md) ·
[P1459](p1459_clarity_chat_clarity_ledger.md) (ledger placeholder) ·
[P1462](p1462_clarity_chat_left_menu.md) (left menu placeholder) ·
[P1458](p1458_clarity_chat_agents_on_other_people.md)
