---
status: all-done
type: story
rank: 17
workstream: events
created_date: '2026-10-02'
tags:
  - events
  - feedback
  - closing
  - community
disclosure: public
pipeline_ran: [create-spec, dev, ship]
drafted_by: opus
exec_model: opus
exec_effort: high
driver: anomaly
related:
  - p1337
  - p1347
  - p1055
completed_at: 2026-10-05
---

# P1389: The evening closes on the phone — feedback, whether positions moved, next week's topic, and one personal ask

## Problem

> Founder framing, verbatim: *"I think better in the room! because otherwise nobody does it … on
> quote and intro they can decide to do it later — remind me over email. but topics should be right
> at event — I need input now because otherwise I can't prepare the next one."*

> And on the ask itself, verbatim: *"maybe instead of saying, do you know somebody … I'm looking for
> the first customers who want to try running these events in their own organization or business …
> it's for somebody who is where it costs them money because people leave and replacing them costs a
> lot of time, and they leave because some conversations are stuck and people avoid having these
> conversations."*

**Situation:** Clarity Night #1 had a post-event Tally feedback email. It never fired: **13 RSVPs,
zero rows in `email_send_log`** — the "always scheduled" fix from P509 never ran, and nothing alerted,
because monitoring had been explicitly rejected as over-engineering
([decisions.md](../../../docs/decisions.md) 2026-09-22 [technical]).

**Complication:** Everything the evening needs to produce happens in the ten minutes before people
stand up: whether anyone's position moved, what the room wants to discuss next week, and whether
anyone will carry the format into an organisation. Once they are on their feet it is gone, and an
email has already been shown not to reach them.

**Question:** What does each person see after the last round, in what order, so the evening's data is
captured without the close reading as extraction?

## Appetite

Blast radius: one flow, at the emotional high point of the evening — a close that reads as a sales
funnel costs more than a missing data point. Reversibility: high for copy and order; the suppression
state is durable. Decision density: several, marked inline.

## Decisions (founder, 2026-10-02)

Made before `/dev`, after checking the spec against the code (P1337 unbuilt; P1347 shipped the
same day; the Tally form already asked for a recommendation).

1. **Where it opens:** its own page, `/events/:slug/close`. The host shows its QR on the projector
   after the last round; the same link goes in the email for anyone who left early. When P1337
   ships, the room opens this page at the end (Open Question 1, answered).
2. **Topics step:** the shipped `/topics` list inside the step (same rows, "Add a topic", "Show more"
   at the end of the list). One pinned **Continue**, dimmed until one star or an own topic; a tap
   while dimmed says what is missing. No Back in the bar; the top-left arrow is Back.
3. **Feedback = the Tally set, merged with step 7:** 0-10 "recommend to a friend", "What did you
   like, and who would you recommend it to?", "What should I do better next time?". Name and email
   come from the account. Step 7 (quote) becomes one tap on the "liked" answer.
4. **One personal ask per person per event**, order community, what do you need, quote, intros.
   Only a tap counts: an ask shown and not tapped records nothing and is shown again next time.
   A yes is never asked again; a no is quiet for 90 days from the tap. A person who misses events
   simply gets their next unanswered ask at their next close.
5. **Step 8 wording (approved):** "Know a team where hard conversations get avoided? / I'm looking
   for the first teams to try a Clarity session at work, free. If someone comes to mind, I'll send
   you a short note you can forward to them. Nothing goes out without your OK." Two equal buttons:
   "Yes, someone comes to mind" / "Not now".
6. **Who reads feedback:** founder only, by one terminal command
   (`scripts/event-close-results.sh <slug>`, read-only token). Open Question 2, answered.
7. **Tally stays on for one event**, then is cut over (AC 8).

**Built differently from the text above, on purpose:**
- "Remind me by email" is **not** shown yet: nothing sends that email, and a button promising an
  email that never arrives repeats the Tally failure this spec starts from. Follow-up needed.
- The community ask uses the event's own group chat link, and is offered only when the event has one.
- The position re-check shows the cmp7 statements the person answered before (one tag). The
  two-events-unchanged taper is not built.

## Decisions from the founder's test rounds (2026-10-04 / 05)

These supersede the numbered decisions above where they differ. The live flow is the source of
truth; e2e/p1389-event-close.spec.ts asserts each line.

- **Order, one question per screen:** start screen (thanks, ~5 minutes, the agenda; no event card)
  → NPS 0-10 (standard wording "How likely is it that you would recommend this event to a friend
  or colleague?", anchors "Not at all likely" / "Extremely likely"; a small non-clickable reminder
  of the evening above it; header "Feedback", never "Recommend") → topics (P1347's whole list;
  rate 5 or add one; Skip link; "Hide my photo" at the top) → did your positions change (cmp7,
  button "No changes" / "Save changes") → how can we improve → what did you like (+ quote
  permission, ticked from the start) → reserve the next Clarity Night → one personal ask → thanks.
- **Text steps:** main "Submit" dimmed until written (a tap explains); the way past is the small
  link ("Continue without feedback" / "Continue without sharing"). The label never changes while typing.
- **Quote permission:** a checkbox on the feedback itself (event_feedback.quote_ok), saved with the
  words in one write. The separate "May I share your words?" ask is gone.
- **Reserving a placeholder event: kept.** Topic chosen later → the existing event-update email.
- **Personal asks by evenings attended** (registrations, the only record): 1st community (the real
  group: Chiang Mai `cm` by location, else `online`; event's own group if set; members never asked),
  2nd the session gift, 3rd+ "Can I help you with anything?". One per evening; yes never again;
  no quiet 90 days.
- **Community "Join as member"** (round 7, supersedes the join-page detour): the group card is
  static, its About opens in place, and the group terms are accepted INSIDE the close, which then
  carries on to the thank-you. The yes is saved before the join (a member is never offered the ask,
  so the server refuses an answer after the membership row exists).
- **Gift flow:** value 0-10 → from 8: do you know who → if not, may I look at your LinkedIn →
  connect → how should I reach you (email / WhatsApp / Telegram); below 8 ends kindly (recorded no).
  Saved as one answer, details JSON. **Copy still open** (see Open Questions).
- **Thank you:** a destination with the app menus back (`?done=1`), "Go to feed"; if they reserved,
  the registration block (details, calendar, share).
- **Shared components changed for this:** EventCard (phone banner everywhere, `asStatic`, `compact`,
  `goingLabel`), OrgCard (exported, `newTab`, `openLabel`), ComprehensionRatingCard (`lowLabel`,
  `highLabel`, `accent`), topic list moved to components/topics/topic-parts.tsx (P1347 copy:
  "Suggest a topic", "Suggest an expert", "Make my contribution anonymous"), org-join-page `?return=`.

## Round 7 — founder feedback (2026-10-05, built — see "Round 7 as built" below)

Read this before touching the flow. Each line is the founder's ask, paraphrased; build all, then
show three demo people again.

1. **Visual pass first, with a separate Opus reviewer (screenshots only, no code):** too much white
   space on desktop; NPS question too small; is left alignment right; does each screen work on
   both phone and desktop; "better visual, less text". On the reserve screen the eye goes to the
   middle card, not the bottom actions (maybe the blue left stripe): make the card smaller and the
   question + call to action more prominent, without breaking consistency; consider putting it all
   in one card.
2. **Start screen:** less text; is "Thank you for attending" consistent; agenda names become:
   Net promoter score · Recommend the next topic · Reflect on your perception (cmp7) · Critical
   feedback · Your recommendation · Reserve a place at the next event · A gift for a friend (when
   that is the ask). "One last question" is too vague — name the actual ask. Question whether
   "about 5 minutes" is needed.
3. **Topics:** while the list scrolls, keep the title, sort, "Suggest a topic" (and hide-my-photo)
   fixed at the top; size "Show more" to the screen (show as many as fit) instead of a fixed 8.
   "Suggest an expert on the topic". Anonymous label: maybe "Make my topic suggestion anonymous"
   (founder: "maybe fine as is"). Editing/deleting your own suggestion: only if simple.
4. **What you liked:** "What did you like about today's event?". Consent line simpler, fewer
   commas, maybe two short sentences ("Feel free to use my quote and my name to promote future events").
5. **Community:** no "Your host" line; no "See more" (do not let them leave); the About text
   expands in place; buttons "Join as member" / "Not now". Joining must happen INSIDE the flow (accept
   the group terms as one more step) and then continue to the end — today "Yes, join" leaves the
   flow for the join page. Reference: the /prezzy-3 call-to-action slide ("Join the Communication
   Activism Community — practise clarity together, build trust that holds"), no QR.
6. **Gift copy (founder, replaces the earlier proposal):** start from the person's own memory:
   "Try to remember the last times you were in an emotionally stuck conversation at work: the
   kind people stop having because nothing moves, and then they give up or leave their job."
   Then a 0-10 instead of yes/no: how much it impacted them (emotionally and financially). Then
   value for a team in that situation → do you know one → LinkedIn → how to reach you. Title it
   as a gift for a friend.

### Round 7 as built

- **One screen shape:** every step's title starts at the same place under the header (no vertical
  centring). The NPS question is the page title; the evening is one muted line under it.
- **Names:** agenda and header say the same thing: Net promoter score · Recommend the next topic ·
  Reflect on your perception · Critical feedback · Your recommendation · Reserve a place at the next
  event · then the ask by name (Join the community / A gift for a friend / Can I help you with anything?).
- **Start screen:** "Thank you for attending" is the title; "N short steps, to make the next one
  better." replaces the 5-minutes line.
- **Step count never shrinks:** reserving keeps its step (Back skips it), so "Step 6 of 7" is never
  followed by "Step 6 of 6".
- **Topics:** the title, sort and "Suggest a topic" stay pinned under the header while rows scroll;
  "Hide my photo" is a small line under them; the first page and each "Show more" hold as many rows
  as fit the screen. "Suggest an expert on the topic". Anonymous label unchanged (founder: fine as is).
- **What you liked:** "What did you like about today's event?"; consent "Feel free to use my quote
  and my name to promote future events."
- **Reserve:** the big event card became one small line (title; date · time · place), so the
  question and the buttons lead.
- **Community:** no host line, no "See more", About opens in place ("Read more"), "Join as member" /
  "Not now", terms inside the flow (see the decision above).
- **Gift:** starts from the person's memory of an emotionally stuck conversation at work, 0-10 on
  how much it affected them, then "A gift for a friend's team" with the value 0-10 (from 8 the rest
  as before). The 0-10 questions sit in the pinned card so they are visible at 320px. Detail JSON
  now carries `impact`. Contact asks in the first person ("How should I reach you about it?").
- **Kept, against the visual reviewer** (founder decisions): dimmed Submit with an explaining tap,
  equal-width Yes/Not now, the bar pinned on every width, the standard NPS wording, the agenda list.

## Round 10 — screen blueprint from the attendee's side (2026-10-05, built — see "Round 10 as built")

Founder feedback on round 9: the main question went into the drawer (wrong), titles are not
centred, "Your feedback on tonight" is noise, the community screen has too much text, the
thank-you and the reserve screen are one screen. Reference: /presi3 slide 17 ("Join the
communication activism community — Practice clarity together. Build trust that holds.") and
the deck's own step wording "Did your value perception of CMP change?".

**Rules for every screen (one template, phone and desktop):**
- The main question is the page title: top, centred, the largest text on the screen.
- Above it, only when it helps, a small context line or card (never a second heading).
- The bottom drawer holds the ANSWER only (0-10, box, buttons), pinned on every width; the
  host's small photo sits in it when the host is the one asking.
- Progress counts half steps: the two feedback screens fill step 4 in two halves; the gift's
  screens fill step 5 in parts.

**Screens:**
1. Start (centred): "We need your feedback" · "It takes 5 minutes." · agenda: Net promoter
   score · Vote on the next event topic · Reflect on your value perception of CMP [D1] ·
   Feedback: what to improve, what was good · the ask ("Decide on joining the community" /
   "A gift for someone in your network" / "Can I help you with anything?").
2. 0-10: small "Thank you for participating" + small evening card, then the big centred
   question "How likely would you recommend this event to a friend or colleague?"; drawer:
   the 0-10 and Submit.
3. Topics: as now.
4. Positions: title "Did your value perception of CMP change?".
5. Improve: title "How can we improve our next event?"; drawer: box, Submit, "Continue
   without feedback". No card, no "Your feedback on tonight".
6. Liked: title "What did you like about today's event?"; drawer: box, quote tick, Submit.
7. Community (1st evening): centred title "Join the Communication Activism Community", one
   line "Practise clarity together. Build trust that holds.", the group card; the long About
   text goes [D2]; drawer: "Join as member" / "Not now". Terms screen: centred "Accept the
   group terms" with "To join <group>" under it.
8. Gift (2nd) / Help (3rd): as round 9, question as the title.
9. Thank-you = the reserve screen (one screen, app menus back): "Thank you for your feedback",
   the next event (the published placeholder) as a small card, ONE button "Reserve your
   place"; no "Not now" [D3]. After reserving, or if already registered: the registration
   block (details, calendar, share).

**Founder answers (2026-10-05):** D1 = "Reflect on your value perception of CMP" (the deck's
wording) · D2 = the About text is deleted · D3 = only "Reserve your place", the app menus are the
way out. **Still open:** the "$1,000" figure · the quote-withdrawal channel · the blue stripe
app-wide · the social-proof count.

### Round 10 as built

- Every screen's question is the page title (`Question`: centred, the largest text); context is a
  small muted line or a small card, never a second heading. The drawer holds the answer only, with
  the host's photo line when the host asks (gift, "Can I help you").
- The separate closing step is gone: the thank-you (`?done=1`, app menus back) shows the next
  event as a small card with the people who came and ONE "Reserve your place"; after reserving, or
  if already registered, the registration block. No event to offer: the thanks alone.
- Progress: the feedback pair fills step 4 in two halves; the gift (4 parts) and the community
  (card, terms) report their part to the header.
- Names: step 3 "Reflect on your value perception of CMP", screen title "Did your value perception
  of CMP change?"; the community ask is "Decide on joining the community" in the agenda, and its
  screen says "Join the Communication Activism Community" / "Practise clarity together. Build
  trust that holds." above the static group card.
- Resume: an answered "improve" with no "liked" resumes at "liked" (Codex review, round 10; the
  rule had skipped it since round 9).

### Round 10b (founder, 2026-10-05, built)

- **The close is the evening's only "after".** Positions are set before or at the start of the
  evening; at the end each person opens the close on their own phone. So step 3 is two halves: the
  seven re-checked ("Did your value perception of CMP change?", earlier answers pre-set, "No
  changes" is one tap), then the three about opting in ("Where do you stand on CMP in your
  important conversations?"). Shown every evening to anyone who answered the seven before; drop it
  for regulars only if the data later shows they never change.
- **Asks follow what the person has not done yet:** join the community (not a member) → "Let's
  connect on LinkedIn" (one tap that opens the host's profile; offered only when the host has a
  LinkedIn link) → nothing. The session gift and "Can I help you with anything?" left the close:
  the offer comes later as the host's own LinkedIn message, never as a pitch inside feedback.
  Server ask name `connect`; `intros` and `need` stay valid only for rows already written.
  **One flow (founder, 2026-10-05):** both asks are ordinary steps at the end of the same evening —
  a first-timer sees "join the community" and then "connect"; each is hidden once done, and a
  "Not now" rests for 90 days. One answer per ask per evening; answered asks are stepped over.
- **No host photo line** in the bottom bar on any screen; the bar holds the answer's buttons only.
  Text boxes sit under their question; short screens centre above the bar (no white band).
- **Thank-you:** the invitation leads ("Join the next Clarity Night" as the title, "Thank you for
  your feedback" as the small line above), the card opens the event, one "Reserve my place".
- **Topics:** every topic on the page, no "Show more", on the close step and on /topics (the page
  the placeholder event links to): rows behind a button were never seen, so they never won votes.
- **Terms screen:** the join page's own wording — "Join <group>" / "Members accept these not
  legally binding terms as a shared intention."
- **Quote permission:** "You may quote me by name to invite new people to future events."
- **Quote withdrawal channel:** still open — not ops@ (an agent-read service inbox that also
  receives signup codes); slava@ or another address is the founder's call.

## Solution

Eight steps on each phone, in **increasing order of what they ask of the person**, after the last
round. Items 1–4 are the evening's data and have no escape hatch; 5–8 are personal and each carries a
**"remind me by email"** so a tired person is not lost to a swipe.

1. **Feedback** — the existing Tally question set, ported rather than redesigned.
2. **Did your position move?** — the cmp statements they answered before the event, then the newly
   added ones. **This is a re-check, not a second survey**: `point_position_history` already records
   movement, so before/after is free ([decisions.md](../../../docs/decisions.md), P1055 reasoning).
3. **Topics for next week** — rate the published candidates, and suggest your own with an optional
   link, a name, or a comment. **Not a YouTube-URL field**: a video is the usual starting point, not a
   requirement. Rating UI and publishing belong to [P1347](p1347_topics_page_attendees_rate_next_topics.md);
   this step links into it rather than rebuilding it.
4. **The next Clarity Night — register now.** Date and venue fixed, topic shown as chosen from
   tonight's votes. The next event is published ahead with the topic still open, which is what makes
   registering on the spot possible at all.
5. **"What do you need?"** — the host offers first: a hire, a collaborator, a source, a stuck problem.
   The host answers from his own connections or the community.
6. **Join the free community** — Chiang Mai → Communication Activism; elsewhere → the online Clarity
   Practice community.
7. **May we publish your quote?** — what they said about tonight, on the next event's page. It helps
   the next person decide to come, which a private recommendation does not.
8. **Introductions.** Framed as a gift they can hand on, not a request: the host connects with them,
   comes back with a short list of people and *why each one might need it*, and they forward it and
   ask. `[FOUNDER DECISION: final wording]`

### Showing less each time

- **Per-event questions (1–4) are asked every event** — they are about tonight.
- **Personal asks (5–8) are asked once.** A **yes** is never re-asked and becomes a status. A **no** is
  not re-asked for roughly three months, because circumstances change but weekly nagging does not.
- **The suppression logic is never shown to the attendee.** They see fewer screens than last time,
  which should feel like being known rather than being tracked.
- **Position re-check tapers:** if someone's answers have not moved across two consecutive events,
  stop asking and show their standing positions with an "update" link.

`[FOUNDER DECISION: whether to cap at one personal ask per event (priority order: community → help
offer → quote → introductions), rather than showing all four to a first-timer]`

### Where it starts and where it is finishable

The last round ending opens step 1 in the room. The same sequence is reachable afterwards by link and
by email, for anyone who left early — which is most of the people steps 5–8 are aimed at.

Once this is verified working for one event, disable the Tally path (`scripts/resend-feedback.sh` and
the feedback branch in `send-event-emails`) rather than running both.
`[FOUNDER DECISION: cut over immediately, or keep both for one event]`

## Invariants

- **Nothing here asks the attendee to buy anything or to book a session for themselves.** Step 8 asks
  about *other* organisations and every introduction is approved one at a time. The founder has
  accepted that asking at all costs the clean reading of the champion-pilot prediction
  ([decisions.md](../../../docs/decisions.md) 2026-09-21 [product]; research-programme ledger L4) — recorded
  as a deliberate trade, optimising for a pilot over the measurement.
- **Position comparisons are within-person before/after only.** Never opt-ins against opt-outs as
  groups — self-selection (P1055 Non-Goals).
- **Positions are not revealed while people are still answering** (P1055): publicity is the cure for
  pluralistic ignorance, so it cannot also be the instrument.
- **A "no" is remembered.** Re-asking something already declined is the failure this spec exists to
  avoid.

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| Eight steps is too many and people abandon at 5 | MITIGATE | The founder decision above caps personal asks at one per event |
| People leave before the close | MITIGATE | The sequence is reachable by link and email afterwards |
| The close reads as a sales funnel | MITIGATE | Host gives (step 5) before asking (7, 8); no self-purchase ask anywhere |
| Suppression state makes a returning attendee think the app forgot them | ACCEPT | A yes becomes a visible status rather than silence |
| Tally cut over before the new path is proven | DEFER | Blocked on one event's verified run |

**Non-Goals**
- Do NOT rebuild topic rating — link to P1347.
- Do NOT redesign the feedback questions; port the Tally set as-is.
- Do NOT create new cmp statements here — P1055 owns the set and its wording is unfixable after staking.
- Do NOT show the suppression rules to the attendee.

## Acceptance Criteria

- [x] After the last round, every attendee still present can reach the feedback step — by the QR the host shows and by the event link (AC5 e2e). Opening it automatically from the room is P1337's (founder, 2026-10-05: "i let 1337 wire the close flow into itself").
- [x] A person who answers the position re-check produces a `point_position_history` row only when their position actually changed — existing trigger (`IS DISTINCT FROM`); E2E "AC2" proves same answer = no row, changed answer = one row
- [x] A returning attendee who already said yes to the community is not asked again — enforced in Postgres (`p1389_next_ask`), E2E "AC3/AC4"
- [x] A returning attendee who said no to introductions is not asked again within three months — E2E "AC3/AC4": quiet at 10 days, offered again at 91
- [x] Someone who leaves early can complete the same sequence from a link — `/events/:slug/close`, E2E "AC5"
- [x] Registration for the next event can be completed inside the close — E2E full walk asserts the `event_rsvps` row
- [x] No step offers the attendee a session or a purchase for themselves — E2E "AC7" source check; intros ask is about other teams
- [x] Feedback rows are written end to end on test (full-walk e2e reads them back, and `scripts/event-close-results.sh` prints them). `[post-deploy]` confirm real rows after the 6 Oct Clarity Night before the Tally path is switched off.

## Open Questions

- **Gift copy (built in round 9, closed):** lead with the person's own experience of emotionally stuck
  conversations at work, then the value for a team in that situation, then "do you know one".
  Wording to be approved; the documented prospect question was not found in docs/.
- **Value line (decided 2026-10-05):** no amount — "...run by me inside their organisation, free for
  one team you recommend."
- **Withdrawing quote consent:** which channel to name (currently not shown).
- **Blue stripe app-wide (decided 2026-10-05):** remove it everywhere, as its own spec after this one.
- **Social proof count (decided 2026-10-05):** Clarity Nights only, as built.

1. Does the close belong to the event room, or is it its own route reachable without the room? Affects how the "left early" link is built.
2. Who can read feedback results — founder only, any organizer, or a terminal query? Carried over from P1337, still undecided.
3. Should a quote already given be re-asked when it goes stale, or only offered as "update yours"?

## Handoff from P1414 (2026-10-05) — keep when merging

P1414 shipped to main an **embedded mode** of `TopicsPage` (event page of a Clarity Night with no topic yet; see `features/done/2026-06-10/p1414_*`). When this branch moves the topic parts into `topic-parts.tsx`, main's `topics-page.tsx` will conflict. Keep, from main:

1. **Embedded mode** (`embedded`, `returnTo`, `className`, `id`, `onVisibleChange` props): no `<SEO>`, no fixed bar or Back, stacked rows, profile links open in a new tab, sign-in links return to the event, centred blue-outline rounded "Show N more · M left", renders nothing (and reports invisible) until ready with topics > 0. `EventDetail` relies on `onVisibleChange` for the second "Reserve your seat".
2. **Guest ratings in localStorage** (`p1347-guest-ratings`, `{at, r}`, 1h TTL) so they survive the magic-link tab; the sign-in flush never overwrites a rating the account already has.
3. **On the event page "Suggest a topic" stays outlined** (`secondary`), because "Reserve your seat" is that page's one primary. Founder agreed 2026-10-05: "Suggest a topic" text and the photo choice at the top apply there too.

Tests that must stay green: `src/tests/p1414-event-topic-vote.test.tsx`, `src/tests/p1347-topics-page.test.tsx`.

## Related

- [p1337](../../p1337_event_journey_on_screen_steps_rotation_and_ending.md) — the rounds this closes
- [p1347](p1347_topics_page_attendees_rate_next_topics.md) — topic rating, linked from step 3
- [p1055](../../p1055_norm_measurement_instrument.md) — the cmp statement set, the staking flow, and the within-person rule step 2 obeys
