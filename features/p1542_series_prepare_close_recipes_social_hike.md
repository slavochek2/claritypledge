---
status: qa
type: story
rank: 55
workstream: events
created_date: '2026-10-22'
tags: [events, social-hike, close, reviews]
disclosure: public
delivery_stage: ship
pipeline_ran: [create-spec, dev, ship]
drafted_by: opus
exec_model: opus
exec_effort: high
---

# P1542: Prepare and close per series, Social Hike as the second recipe, reviews from the close

## Problem

**Situation:** An event has two attendee pages, `/events/:slug/prepare` (P1402) and `/events/:slug/close` (P1389). Their steps are fixed in code and were built for Clarity Night. Close runs: score, next-topic vote, CMP re-check (positions, then stance), improve, what you liked (with "you may quote me"), then the personal asks (community, connect). Social Hike pages show series reviews (`series_reviews`, P1403), but the founder adds them by hand.

**Complication:** Hikes are the series the founder runs most, and half of the close does not fit them. Nobody votes on a debate topic after a hike. Meanwhile the close already collects the one thing hikes need most, a quotable review, and then drops it into a table nobody publishes from. The sales mastermind is next, so a third copy of fixed steps would follow.

**Question:** How does each series choose its own prepare and close steps from shared pieces, and how does a "you may quote me" answer become a hike review the founder approves?

> Founder, verbatim: "preparing and closing should reflect how and what to reuse for hikes and then for other events … So it has to be like kind of personalizable for different events in series … when we run sales mastermind in the future or other kind of events, we can easily add steps, remove steps, customize steps and stuff like that."

> Founder, verbatim: "I'm gathering reviews so I can automatically gather them and then approve them. That would be cool."

## Appetite

Blast radius: medium. The close is live for every Clarity Night, so the Clarity Night recipe must come out unchanged. Reversibility: medium, one additive migration for pending reviews plus code. Decision density: low. The founder's decisions are recorded below; two copy calls remain.

## Founder decisions (2026-10-22, this conversation)

1. **Hike prepare is optional only.** Offer the existing preparation (including CMP7) as a way to learn what the community is about. It is up to the person whether they do it or discuss it with others.
   - No meeting-point, what-to-bring, ride-share, invite-a-friend or legal-responsibility steps. *"I think they read it. Adult."* Responsibility and non-commercial terms are already in the description.
2. **Hike close** keeps four things:
   - the rating (score)
   - "what can we improve"
   - "what was good", reworded to say it may be used to promote future hikes
   - the CMP re-check (positions, then stance), only if the person did the preparation
   - Topic vote: dropped. Personal asks (community, connect): as today.
3. **Examples under the review box.** Show the series' existing approved reviews (three today) as examples of what to write.
4. **Reviews never publish automatically.** The founder approves each one. *"They are not automatically published, by the way."*
5. **No photos.** The founder handles photos.
6. **Same place as today.** It lives in the event room, reusing the same prepare and close pages, resumable. The founder tells hikers to open the event page on their phones right after the hike, or later.
7. **Modularity:** steps become shared pieces and each series picks and orders its own. Clarity Night is the first recipe (today's list, unchanged), Social Hike the second, the sales mastermind later as the third.

## Added founder decisions (2026-10-22, later in the same conversation)

8. **Hike event room is lean.** No "How up for thinking are you right now?" Ready step, no Table, no Compare. It shows the principle opt-in and roster, the optional preparation banner, and Feedback once the event has started. `/room` goes straight to the room; the step bar has Principle and Close only. Recipe-driven (`room: { readiness, rounds, feedbackOpensAtStart }`); Clarity Night keeps all of it.
9. **Hike preparation is shorter:** story, principle (the question reads "...with the people on this hike?"), cmp7 and the topic positions when the event has a topic. No "how this event is different" clip, no R&D volunteering.
10. **Registration thank-you:** a hike gets the existing preparation screen as an optional learning offer, "Learn what this community is about (about N min)", no "Prepare now", no email reminder. Clarity Night's text is unchanged.
11. **Feedback opens at the start** for hikes: once the start time has passed the room's Close step opens, with no host "End the evening". Clarity Night is unchanged here (a separate spec will change it).

## Founder UAT decisions (2026-10-23, hand-testing a hike)

12. The room's last step is called **Feedback**, not Close, for every event (one shared label; P1548).
13. For hikes the preparation is **learning what this community is**: one quiet link, "Learn what this community is about" (resume: "Continue learning about the community"), before the principle on the Principle view only. No "Preparation not started" / "Start your preparation".
14. **One feedback entry, one time estimate (hikes):** the room's card is "We need your feedback" / "It takes 2 minutes."; its button lands on the first question (no second intro screen).
15. **The CMP re-check is one step (hikes):** the value-perception statements and the stance on the same screen.
16. **No past-hiker reviews under "What did you enjoy"** (supersedes decision 3): they competed with the input.
17. **The thank-you claims no reservation** unless the place was reserved on that screen. Shared with Clarity Night (same bug there).
18. **Feedback takes 2 minutes in both series** (founder, 2026-10-23): every shown estimate says 2 minutes (hike room card, feedback intro screen).

## Founder hand-test round 3 (2026-10-23)

19. **The event room is inside the signed-in shell** (founder 2026-10-23, fourth request): `/events/:slug/room`, `/ready`, `/arriving` and `/meet` show the left menu on desktop and the normal bottom tabs on a phone, instead of the old top bar with "Tools" and the avatar. This reverses P1512's exclusion of the compact room pages from the shell for these routes only. P1512 excluded them because they kept their own chrome; the founder's view is that a signed-in person should always have the one navigation, and the room's own step bar and transcription strip sit fine inside it (the shell's offset rules already covered their sticky head). A new `roomShell` layout prop does it, so a signed-out visitor still gets the compact gate, and `/host` stays compact. On a phone the room's fixed Opt in / Opt out bar is lifted above the bottom tabs (and the "Today's event" strip) instead of hiding them.
20. **Name the community.** "This community" is the event's organising group, the one the hike page names in "Organized by" (e.g. Clarity Practice Community · Chiang Mai). Every learning link and the end of learning use that name; an event with no group falls back to "this community".
21. **Hike thank-yous lead with success** and carry the event's group chat (WhatsApp) as the coordination action, inside the success card, then one optional, named learning line (the same link the room shows; gone once learned). The registration thank-you drops the old heading plus "Optional. A short introduction…" (it said the same thing twice). The feedback thank-you gets the group chat too: after a hike people coordinate travel there.
22. **Learning language, plain time.** The end of the hike learning reads "Thanks for taking the time to learn about <community>"; its header and plan say learning, not preparation. A hike states "We meet at 13:22 at <meeting point>." instead of Clarity Night's "We start at 13:22 sharp."

## Founder round 4 (2026-10-23, the social hike path)

23. **Room step bar is verbs, learning a step** (founder 2026-10-23): a hike's bar reads Learn (optional, first) · Opt in · Give feedback, every label shown at 320px. Learn opens the learning flow; opened from the room its end says "Back to the room", and Learn then carries a check. The separate learning link above the principle is gone.
24. **One default-step rule for every event** (founder 2026-10-23): until (start + duration − 30 min) the room opens on the event's main step (a hike: Opt in; Clarity Night: where it lands today); from then on on Feedback, when Feedback is open (a Clarity Night's still opens when the host ends the evening). People can always switch. `defaultRoomStep` in series-recipes.ts.
25. **The room keeps the Clarity Meeting Principle for the opt-in** (founder 2026-10-23); group terms appear only in the join offer.
26. **Feedback card is just the button** (founder 2026-10-23): "Give feedback" with "Takes 2 minutes" small under it; no "We need your feedback".
27. **The "what was good" step is a recommendation** (founder 2026-10-23): "Would you recommend this hike?" with one helper line, "A sentence or two for future hikers."; consent "Quote me by name to promote future hikes", ticked by default.
28. **Feedback thank-you** (founder 2026-10-23): the WhatsApp caption is "Share photos, plan the next one"; no next-hike offer at all.
29. **Join offer named, and only after learning** (founder 2026-10-23): the community ask was headed with a fixed "Join the Communication Activism Community" while its card and the join already used the event's group; it now names the event's organising group. Offered only to someone who completed the learning (otherwise the thank-you's "Learn about <community>" link stands in). "Review group terms" → "Accept and join" with "Not now" as the small link under it; no Back button. Clarity Night keeps its words.
30. **One WhatsApp button style** (founder 2026-10-23): the outlined button with WhatsApp's green glyph used elsewhere; on the hike thank-yous it leads by order, not by a blue fill.
31. **Community name without the place** (founder 2026-10-23): inline links and headings read the stored group name up to " · " ("Clarity Practice Community"); the group card keeps the full name.

## Founder UAT round 5 (2026-10-23)

32. **Registration thank-you learning is a card** (founder): the grey line nobody clicks becomes an optional card: "Get to know <community>", the learning's real estimate (computed, not a fixed "3 minutes"), "See how we meet and talk, then decide if you want to join.", one OUTLINE button (Start / Continue learning), so the page keeps at most one full-width primary. Hidden once learned.
33. **Learn stays in the room** (founder): the room's Learn step opens the learning inside the room frame (app menu + the room's step bar with Learn shown), not a separate page; its finish returns to the room's Opt in step. `/events/:slug/prepare` keeps working for direct links. Mechanism: `?from=room` on the existing prepare route declares the app menu and draws the room bar (no new route).
34. **Recommendation question** (founder): "Are you open to share a recommendation for future hikers?", no helper line. Supersedes #27's question and helper.
35. **Join is offered to everyone; learning is required before terms; learning counts if done anywhere** (founder). The feedback thank-you no longer links to learning: every non-member sees "Join <community>". Learned → "Review group terms" → "Accept and join" / "Not now" link. Not learned → the button starts the short learning (in the room frame), which lands on the group terms. Nobody reaches the terms without learning; members see no invitation. "Learned" = this event's learning complete, or the account's once-per-person parts (cognitive-understanding video + cmp7 statements) completed in any event's preparation or the general /prepare (`hasLearned`). The same rule drives the registration card and the room's Learn check. The join offer is no longer a close step for a hike (supersedes #29's gating). Where Postgres no longer offers the community ask (e.g. a recent "Not now"), Accept joins through the plain group join; no migration.

36. **Visual review round 5 (two screenshot reviews)**: the Learn step reads "Learn (optional)" until done; learning opened from the thank-you's Join shows "Joining <community> · Step 1 of 2 · Short introduction" instead of the room bar, and the terms after it "Step 2 of 2 · Group terms"; one plan heading "Get to know <community>"; per-step minutes appear only with the total (they read "1 min" before the statements loaded); the registration card's meta reads "Optional · N minutes"; the Join card has a "Not now" link (this visit) and the non-learner caption names the computed length; the hike's group terms hide the phone's "Today's event" strip, fade above the pinned bar, and say "Members accept these non-binding terms as a shared intention."; the recommendation reads "Are you open to sharing a recommendation for future hikers?" with the placeholder "What would you tell someone joining their first hike?". Supersedes #34's wording.

37. **Visual review round 5c**: the learning heading waits for the community's resolved name (never the fallback first); a hike's group terms put "Accept and join" / "Not now" after the terms in the page flow, never pinned over them; "Step 2 of 2 · Group terms" only for someone who came through this flow's learning (route state from the learning's finish), otherwise "Group terms"; learning opened from the room keeps the room's row, the back arrow inline with the step bar (the room's Transcribe bar is not repeated there: room capture pauses on the learning route); on the short step bar a not-yet-done step is grey, done is light with a tick, current is filled (the five-step Clarity Night bar is unchanged); the room's Give feedback step asks "How was the hike?" above its button; the community button reads "Join the community" and is full card width; a hike's last feedback step fills its progress segment; below 360px "(optional)" sits under "Learn"; a hike's thank-yous say "Back to the event".

38. **Visual review round 5d**: a hike's group-terms actions are a sticky footer in the page flow (above the phone tabs), so "Accept and join" is always on screen and the terms' last line still scrolls clear of it; the learning's in-room headers carry the back arrow inline (the join context too); the learn page reserves the room's Transcribe header height (an invisible, inert copy), so the step bar sits where it does in the room; the feedback thank-you title is card-heading size with the check above it; the sidebar's active "Today's event" is visibly filled and ringed; a hike's text steps start at the top.

## Founder UAT round 6 (2026-10-24)

The founder hand-tested the hike path on localhost. Screen-by-screen intent, variants and measurements are in the round-6 design notes. They were delivered with this round and are not in the repo; the decisions below carry what `/dev` needs. The room chrome, Back and loaders moved to a separate spec (room chrome and loader standard). The groups-page join moved to P1549.

39. **Registration thank-you: one calm invitation** (A). The founder: "so many white buttons … where should attention go?"
    - The success block is "You're registered" plus one date/time/place line and a row of quiet text links: WhatsApp, Add to calendar, Share.
    - After 48px of space, a centred learning section:
      - title "Learn about <community>", `text-2xl`;
      - a "6 min" pill (computed);
      - one line, "How we meet, before you decide.";
      - one **outline** "Tell me more" button.
    - No "Optional". No blue primary. At most one button on the page.
    - A partial learner gets "Continue learning about <community>", "N min left" and "Continue". A learner or a member gets no learning section.
    - Share and Add to calendar open the existing row and menu from their links.
    - Clarity Night's confirmation is unchanged.
    - [FOUNDER DECISION: WhatsApp as a quiet link (recommended) or keeps its outlined button]
40. **The room's Give feedback step does not repeat itself** (B).
    - Heading "How was the hike?", button **"Start now"**, then "Takes 2 minutes".
    - Once this person's feedback is finished, the card reads "Thanks, your feedback is in." with no button, and the step carries its check. The room reads `getEventClose(event.id).finished`.
41. **Text steps on desktop** (C, optional). On `lg+` the improve and recommend actions sit in the page flow under the box, not pinned at the viewport bottom. Phones are unchanged. Not blocking. **Dropped** (founder 2026-10-29: "drop 41").
42. **Feedback thank-you hierarchy** (E). One centred stack, no boxed cards:
    - the check and "Thank you for your feedback" (`text-2xl`);
    - 40px of space;
    - for a non-member, the one primary **"Join <community>"**, with the line under it saying what follows:
      - not learned: "Starts with a 6-minute introduction to how we meet." (computed);
      - partial learner: "About N minutes left of the introduction.";
      - learned: no line.
    - The group chat is a small text link with the glyph ("WhatsApp group · Share photos, plan the next one"), only for someone who has not opened it.
    - **No "Not now"**: a destination is left by its Back, and a control that only hides is removed.
    - A member sees no join, only "You joined <community>." if they joined here.
    - Supersedes the round-5 labels "Join the community" / "Review group terms" and the round-5 Join card's "Not now".
43. **Smart buttons** (E). An offer the app knows is done is not advertised again. This table is the contract.
    - R = registered, L = learned (`hasLearned`), P = started but not learned, M = member of the event's group, C = opened this group chat, F = finished this event's feedback.

    | Offer | Event page | Registration thank-you | Room: Give feedback | Learning end (room) | Feedback thank-you |
    |---|---|---|---|---|---|
    | "Join WhatsApp group" button | R, !C, before the end | — | — | — | — |
    | WhatsApp quiet link | R, C, before the end: "Open WhatsApp group" | !C "Join the WhatsApp group" · C "Open WhatsApp group" | — | — | !C only |
    | Add to calendar / Share | before the start | before the start, as links | — | — | — |
    | Learn offer | — | !L and !M (P: Continue variant) | — | — | via the Join button |
    | Join <community> | as today | — | — | — | !M |
    | Give feedback button | — | — | !F "Start now" · F none | — | — |

    The new fact is **"opened the group chat"**:
    - one additive table keyed by `(profile_id, chat_key)`, where `chat_key` is a server-side hash of the invite link. One group shared by many hikes then counts once, and the link is never copied.
    - a SECURITY DEFINER RPC records the tap and a read RPC answers it. The tap also sets a local flag so the screen updates at once.
    - a Mixpanel `group_chat_opened` event (prod only).
    - Once opened, "Join WhatsApp group" is never shown again for that link: the event page, registration success and the thank-you show the quiet "Open WhatsApp group" link before the event, and nothing after it.
    - Membership (`getMyMembership`) and learning (`hasLearned`) are read wherever an offer depends on them.
44. **Learning finished inside the room** (F). The end screen keeps the room's frame and step bar, with Learn now checked. It then shows:
    - "You've learned how we meet" and one line naming the next step;
    - one primary: **"Continue to Opt in"**, or **"Continue to feedback"** when `defaultRoomStep` is Give feedback;
    - no event box, no Add to calendar, no WhatsApp, no share, no "Back to the room".
    - Any community name waits for the resolved name (today the end title shows the fallback "the community").
45. **The group terms' secondary is "Back"** (E/D). It returns to the thank-you and records no refusal, so the join stays offered. It stays inside `ActionRow`, which is centred.
46. **Root cause of the off-centre "Not now"** (D), measured. It is gone with decision 42, but the cause is general:
    - `LetterPrimaryCta` wraps itself in `w-full max-w-sm` without `mx-auto` (`letter-primary-cta.tsx:42`).
    - Inside the 448px Join card the 384px wrapper sat flush left: text centre x=822 vs card centre x=837 at 1440, 0px off at 375.
    - Round 5c widened only the primary (`EventClosePage.tsx:891`), not the link two lines below (`:903`).
    - Every `LetterPrimaryCta` on the hike screens must be measured centred. Whether the fix lives in the component is `/dev`'s call after grepping its callers.

## Founder decision (A), 2026-10-28: finished learning steps never disappear

Seen live at 1440 on a hike room's Learn view (`/events/<hike>/meet?view=learn`) by a signed-in person who had finished
earlier learning parts but had not decided: the Learn view showed only "Decide about your participation in a new social
norm · Step 1 of 1".

- **Decision:** in a hike's learning, steps the person already finished (here, or in another event's learning or on
  /prepare) stay in the list, shown finished (ticked). The person can go back to any of them, and the flow lands on the
  next unfinished step with honest numbering (for example "Step 2 of 3"). Nothing disappears.
- **Cause:** `buildPlan` (`prep-plan.ts`) dropped every once-per-person part (the cognitive-understanding video, the cmp7
  statements) completed before this registration's learning started (`partInPlan`). That is P1336's rule for Clarity
  Night's preparation ("not asked again"); a hike inherited it.
- **Fix:** the hike recipe sets `prepare.keepFinished`. `buildPlan` keeps those steps, and `usePrepState` exposes
  `stepsDone` = this registration's finished steps plus every plan step whose part is already completed
  (`finishedSteps`). Progress, the minutes, the resume point and the flow's ticks read it. Clarity Night is unchanged
  (its shortened plan stays, P1336 "returning person").
- **Test:** `src/tests/p1542-keep-finished-steps.test.ts`. Before the fix: `expected [ 'principle' ] to deeply equal
  [ 'story', 'principle', 'cmp7' ]`, `1 failed | 1 passed`, exit 1. After the fix: 2 passed.
- **Follow-up, same day (founder: "they can go back"):** for a hike, a finished row in the step list opens its step at
  any time, not only once the whole learning is finished. Back reaches the step just before, finished or not, so a
  finished cmp7 step is reachable. Reopened, a finished statements step lists its answered cards (`cardsToShow`) and asks
  nothing again. Clarity Night is unchanged. Test: `src/tests/p1542-go-back-finished.test.tsx`. Before: `2 failed | 1
  passed`, exit 1 (`agenda-open-1` not found; "Step 3 of 4" not found after Back). After: 3 passed.
- **Review round (Gemini + Codex, 2 of 2), same day:**
  - Continue after reopening a finished step resumes at the first unfinished step anywhere in the plan, and the
    learning is recorded complete only when every step is done (`nextTarget`).
  - The flow's ticks resync when parts load after the first render (`mergeDone`).
  - A saved "shown cards" snapshot, including an empty one, no longer hides a reopened statements step: it shows the
    answered cards plus any new ones.
  - A person who finished every step elsewhere lands on the step list and can still reach the end and record completion.
  - `cardsToShow` uses `isAnswered`, and `finishedSteps` returns steps in plan order.
  - Test: `p1542-go-back-finished.test.tsx`, now 8 tests. On the pre-review code: `4 failed | 4 passed` (H1, H2, H3, M1).
    After the fix: 8 passed, and `p1542-keep-finished-steps.test.ts` 2 passed.

## Founder UAT round (2026-10-29)

The founder approved the go-back learning ("This is good") and asked for three changes:

1. **One header row on a desktop.** On `lg+`, "Back to the event" sits on the same row as the room's step bar (Learn
   the principle / Decide / Share feedback), which reclaims the row above it that held only the Back. Below `lg` it
   stays as before: the Back in the app's top bar and the step bar under it.
   - Built as the Back moving DOWN into the room's pinned head (`FocusHeader inPlace`), not the step bar moving up into
     the app's top bar. That bar is not sticky, so the step bar would have scrolled away on a long view. With the Back
     in the pinned head, the step bar stays pinned and the Back is pinned with it.
2. **Share feedback opens inside the room**, the way Learn does.
   - It is a room view, `?view=feedback` on the same `/meet` path: one more room entry (`roomDepth + 1`), no remount,
     and Back returns to the room (`use-room-views.ts`).
   - It draws the existing close flow (`CloseFlow`, its sequence unchanged) under the room's own "Back to the event"
     and step bar. The close's step header goes into the room's pinned head (`CloseHeader.tsx`, `CloseInRoom.tsx`).
   - The URL stays the room's, so there is no `?done=1`. The room's marks (fromEvent, fromReady, roomDepth) are kept.
   - The finished thank-you's Join for a learner opens the group terms the same way (`?view=feedback&join=1`).
   - `/events/:slug/close` still works as a direct URL (emails, the QR code).
3. **No all-ticked list.** When every step is already finished (done elsewhere), opening Learn records the completion
   and goes straight to the end screen ("You've learned the clarity principle" in the room), the same one a normal
   finish shows. There is no agenda with every step ticked and no button (`use-auto-finish.ts`). The finished steps
   stay reopenable from there (decision A). This supersedes the founder's first default, a "Finish" label on the list,
   which the founder found confusing.

Decision 41 is dropped. The Cost Budget's founder decision is option A (see Cost Budget).

**Review rounds 3–6 (2026-10-29): the in-room close's lifecycle and drafts.** The close is drawn only while its view is
shown (keeping it mounted kept producing stale-state bugs: R1, R2, R4). Typed answers survive a tab switch in the tab's
storage (`use-close-draft.ts`):
- per person (another person's draft and resume step in the tab are dropped);
- the quote permission kept with the words, and an explicit refusal never read as consent again;
- a revision wins until it is submitted, and only what a save sent is cleared when it lands;
- everything is cleared on finish.

Quote consent (rounds 7–11): the permission lives only on the server and only the person's own action on the visible
box can raise it. Each click is written at once with the time it was made (`set_event_quote_ok`), and the server applies
a click only if it is newer than the one on record (`quote_ok_at`, `20261029200300_p1542_quote_ok_click_order.sql`),
so a late write from any tab, remount or device never overwrites a newer click. Answer saves (score, improvement,
words) never raise it (`20261029200200_p1542_answer_saves_only_lower.sql`; a first save with nothing stored keeps the
founder default, ticked). Nothing in the browser queues or waits on consent. The close shows the stored value —
ticked when nothing is saved — and re-reads it once on entering "What did you like". Drafts keep words only.
- *Accepted case:* a tab already on "What did you like" when the person refused on another device still shows the tick.
  Submitting words there sends no permission, so the server keeps the refusal; ticking the box there is a visible,
  deliberate consent in that moment.
- *Accepted window:* an untick that lands just after the finish can leave a pending series review created from the
  earlier tick. `scripts/series-reviews.mjs` re-checks `quote_ok` (and the words) before it publishes, so that review
  is refused ("consent withdrawn").
- *Untick shown on screen:* while the box shows unticked, every answer save carries the refusal and, before it goes,
  the person's latest untick is re-sent with its own click time, so an older tick landing late loses.
- *Known limitation (double failure):* if both the untick's write and its re-send fail, the answer save still lowers
  consent, but `quote_ok_at` keeps the older click's time; a tick from before the untick that is still in flight and
  lands afterwards can then raise it again. Window: two failed writes plus a delayed older one.
- *Known limitation:* clicks are ordered on the person's own clock. If one device's clock runs ahead, a later click on a
  correctly clocked device can be ignored until real time passes the earlier stamp; the server clamps a click time to
  now() + 1 minute, which caps that.
- *Known limitation (not fixed):* with two tabs open on the same close, the older tab re-sends its own words on a later
  save, overwriting what the newer tab saved — the same as before.
- *Known limitation (not fixed):* a hike review is queued for moderation only on the person's first finish. If they finish without a quote and later go back and add one, no review is queued for it (Gemini review, 2026-10-29; the hand-off migration is already approved for prod).

The room ticks Share feedback only once the server has confirmed the finish, including a finish made in another tab.
The automatic "all finished elsewhere" completion waits for a visible tab and for the learning to be the shown view.

**Review round (Gemini + Codex, 2 of 2), 2026-10-29: one history model for the room's views** (`use-room-views.ts`):
- Opening a view from the plain room pushes one entry, marked `pushedView` and counted in `roomDepth`. Moving from one
  view to another replaces it, so Learn opened from the feedback is still one entry. A room tab replaces the view with
  the plain room. A view's own Back (the close's first question, a non-attendee bounced) pops what the room pushed; on a
  cold `?view=…` URL it replaces.
- "Back to readiness" returns past the room's entries too (`useBackPast`).
- Reaching the thank-you inside the room ticks Share feedback and ends the room's offer at once (`onFinished`).
- A non-learner's Join learns inside the room (`?view=learn&then=join`) and ends on the group terms there
  (`?view=feedback&join=1`, `joinViaLearning`).
- `?view=feedback` always shows Share feedback as the current step.
- The close measures the bottom of the room's real head instead of assuming a 64px bar.
- A failed close read offers "Try again".
- The room's feedback buttons use the Button's own blue.
- On a desktop the Back's label sits on the tabs' baseline.

## P1562 ships with P1542

P1562 §1–2 (one room header, one Back to the event rule, Clarity Night Transcribe placement) were built and UAT'd on this branch and ship with P1542; §3 (loader) yields to P1586's implementation. P1562's own spec is archived as rejected on main (superseded by P1586).

Known limitations carried over from P1562 that still apply:
- Browser Forward after a multi-step pop (thank-you → event, frozen Meet → event) lands back on the room or `/close`: a pop leaves them as forward entries.
- `useBackToEvent` does not verify where the multi-step pop landed; it trusts `fromEvent` and the history index (a dead pop falls back to a replace).
- On an event change, a roster status from the previous event can be read for one render by callers outside `useRoomRoster` (the hook itself keys its snapshot to the event).
- A stale `self` prop can outlive an `eventId` change (the room remounts on a slug change in practice).
- EventHostPage does not reset its roster on an event change (pre-existing).
- A failed attendee-count read is not logged when `throwOnError` is off (the default for every other caller).
- The room's "Give feedback" buttons use hand-typed `bg-blue-*` classes (pre-existing).
- A slow but working access-check chain can trip the 4.5s uncached deadline and show a false "You're offline" (INBOX-241); fixed separately.
- A timed-out roster read is not aborted; the request runs to completion in the background.
- The self re-read (`refresh()`) runs at most once per event + viewer; if it fails, the 30s poll covers it.
- The `event_room:<id>` realtime channel topic is shared per event across subscribers (pre-existing).
- The events list's "going" counts and the viewer's "Going" marks read RSVPs in batches of 100 events (one read over 373 events exceeded the URL limit, HTTP 414). Each batch is still capped at the server's 1000-row maximum, so a batch whose events hold more than 1000 RSVPs in total undercounts (pre-existing cap; not reachable at current volumes).
- `/events` no longer waits for a visible tab before reading: main's P1586 EventsList was kept over P1562's hidden-tab-aware list.

## Solution

- **Recipes.** Each series has a recipe for prepare and one for close: an ordered list of step ids taken from the steps the pages already have. A series with no recipe gets today's Clarity Night list, so every existing event behaves exactly as now.
  - Recipe conditions cover only what these two recipes need: "only if the person prepared" (the CMP re-check) and "only while it applies" (the personal asks, already decided server-side).
  - Where a recipe lives (code map keyed by series slug, or a column) is `/dev`'s call. Prefer the option with fewer moving parts.
- **Social Hike recipe:**
  - Prepare: today's preparation, offered as optional from the event room.
  - Close: score → [positions → stance, only if prepared] → improve → appreciate (hike wording, approved reviews shown as examples) → personal asks.
- **Review hand-off.** A finished close with a non-empty "what was good" and "you may quote me" ticked creates a **pending** review for that series. It is linked to the person's profile, so it shows their avatar and links to them. The founder lists pending reviews and approves or rejects each, from a founder-only script, the same pattern as `scripts/event-close-results.sh`. Only approved reviews show on hike pages.
- **Room copy.** The event room's close card ("The evening has ended …") needs wording that fits a hike.

Decided 2026-10-22: drafts approved as written. The appreciate step's hike wording: question "What did you enjoy about this hike?"; consent line "You may quote me by name on future hike pages to invite new people."

Decided 2026-10-22: drafts approved as written. The event room close card for hikes: "Thanks for hiking with us" / "Two minutes to tell us how it went?"

## Cost Budget

Applies because round 6 adds Supabase RPCs called per page view (`group_chat_opened`) and per tap
(`mark_group_chat_opened`), a retry path for both the tap and the "feedback finished" save, and a live
integration spec (`docs/technical/metered-services.md`, "When this applies"). No timer loop, no edge
function, no metered model.

- The chat read runs only while this browser has no "opened" record for the link. A tap writes once;
  a failed tap is retried at most once per later page view, until it lands or the server refuses it (42501).
- The "feedback finished" save retries with backoff (3s, 6s, 12s, ... with jitter, capped at 5 minutes),
  sends nothing while the tab is hidden, and makes at most 8 requests per chain. Only an `online` or
  `visible` event starts a new chain. It stops on success or when the page closes.

Request counts per test run were measured with request counters, not estimated: an opt-in counter in the
p1542 e2e (`P1542_COUNT_REQUESTS=1`, every browser Supabase request plus websockets), and a fetch wrapper
for the node-side helpers and the integration spec.

| Measure | Per user (one hike) | Per hour | Per test run |
|---|---|---|---|
| Requests | chat: 3 surfaces viewed (event page, registration thank-you, feedback thank-you) x 1 read + 1 tap write = 4 (after a tap, later surfaces in that browser skip the read); worst case, a failed tap on the last surface, then 2 more chat page views each retrying once = 6. Finish save: 1 per close (measured: each of the 4 UI closes in the e2e made exactly 1 call); worst case under a persistent server failure, 8 per visit plus 8 per `online`/`visible` event. Total normally 4 + 1 = 5 | active hikers per hour x 5 (finish-save worst case: open close pages x 8, then silent) | full p1542 e2e run: 3,919 = node helpers 420 (auth 76, tables 331, RPC 13) + browser 3,499 (tables 2,581, RPC 708, mirror-reply edge function 108, websockets 54, auth reads 48). Integration spec: 73 after batching its fixtures (rule 1): auth create/delete/admin 9 (the admin API has no batch endpoint, so one call per user), sign-ins 3, profiles 2, events insert/delete 2 + 2, link rows 1, RSVPs 1, series reviews 7, group_chat_opens table 6, the three RPCs 40. Total 3,919 + 73 = 3,992. Of these, round 6 itself adds 22 group-chat RPC calls and 4 finish saves in the e2e, plus the 73 of the integration spec; most of the rest is the app shell's general reads on every page load (chats, profiles, letters, invites, the mirror function), which predate this spec. **Plus the `p1542-ac-gaps` lane (review round, ESTIMATE, not measured):** 6 users (1 host + 5 people; the run ledger counted 6 created and 6 deleted), 2 events, 4 flows (registration thank-you, feedback thank-you, room end, event page after the event). Estimated from the full run's rate of about 160 browser requests per flow plus about 15 node-side seeding requests per user: about 4 x 160 + 6 x 15 = about 730, so a run of all three suites is about 3,992 + 730 = about 4,720 |
| Egress (bytes) | 5 requests x about 0.4 KB (boolean body plus headers) = about 2 KB | active hikers per hour x 2 KB | ESTIMATE, not measured: 3,992 requests x an assumed 2 KB average = about 8 MB, before the 54 realtime websocket sessions, whose traffic was not measured. Treat as an order of magnitude, with 2x headroom (about 16 MB) |
| Log lines | 1 API log line per request = 5 (normal); with the migration missing, each chat surface view logs 1 failed call instead, the same count | active hikers per hour x 5 | 3,992 (the deliberately refused insert and the 42501 checks included) |
| Service unit | none from this spec: plain Postgres functions, no tokens. The 108 mirror-reply edge function invocations per e2e run come from the shell, not P1542 | none | 108 edge function invocations (shell, pre-existing) |

1. **Fits the plan limit today?** Split by organisation (prod and TEST are separate since P1538).
   - **Prod (hike traffic):** fits. Monthly egress = 2 KB x active hikers per month, and log lines =
     5 x active hikers per month, against the prod organisation's registry rows.
   - **TEST (test runs): does NOT fit on log ingestion, and already did not before this spec.** The latest
     private dashboard reading (`.private/docs/usage/`) shows the TEST organisation over its free log
     ingestion limit, driven by e2e test-user minting across all suites. That overrun is owned by P1530
     and P1532, not by this spec. This spec's suites make 3,992 requests (so about 3,992 API log lines) per run of both, and creates and deletes 34 test users per run (e2e 24,
     ac-gaps 6, integration 4), and about 4,720 requests with the ac-gaps lane (ESTIMATE, see the table). Mitigation in this spec: both suites run on demand only, never in a loop or on a
     schedule. The cost of a free-org overrun is restriction of TEST after the provider's grace period,
     not a charge.
     **Founder decision (2026-10-29): option A.** The p1542 e2e lanes run on demand before a ship, and their
     share of TEST log ingestion is accepted over the free limit while P1530/P1532 work the overrun down.
2. **At 10x?** Prod fits (20 KB egress and 50 log lines x active hikers per month). TEST scales with runs,
   not users; see 1.
3. **Upgrade if it does not fit:** for TEST, none named by this spec. The decision sits with P1530/P1532,
   and the founder decision above (option A). For prod, the Supabase Pro row is the existing named upgrade.
4. **Known limitation (rule 1, accepted by the orchestrator, for the founder to confirm):** the
   integration spec's client/server parity test calls `group_chat_key` once per test link (16 links,
   plus 1 probe and 2 controls = 19 calls per run). Batching them would need a new production database
   function that exists only to serve a test, which adds permanent prod surface for 18 saved calls per
   on-demand run.

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| The Clarity Night close changes by accident when steps are pulled into recipes | MITIGATE | The Clarity Night recipe is today's list; existing close tests must pass unchanged |
| A review someone wrote before this ships becomes pending without consent | MITIGATE | Only closes finished after ship, with `quote_ok` true, create pending reviews; no backfill |
| No way yet for a person to withdraw quote permission | ACCEPT | Open since P1389 (decisions.md, P1389 entry); founder approval is the gate, and the founder removes on request |
| A third series needs a step condition these two do not | DEFER | Add it when the sales mastermind recipe is written, not now |

**Non-Goals**
- Do NOT build a general step engine, a recipe editor UI or per-event overrides.
- Do NOT add new step types (logistics, legal, ride-share, invite, photos), per the founder decisions.
- Do NOT change Clarity Night's steps, order or copy.
- Do NOT publish any review without founder approval, and do NOT add an in-app moderation UI.
- Do NOT change the Event Room's visibility rule (signed-in only, 2026-10-04).

## Acceptance Criteria

- [x] On a Clarity Night event, the close shows the same steps in the same order as before (existing close e2e passes unchanged). *Evidence: unit test proves the Clarity Night recipe equals the old inline step list for every condition; p1389 `full walk` fails identically on unchanged main (test-DB community data drift, not this change).*
- [x] On a Social Hike event, the close shows no topic vote.
- [x] On a Social Hike event, a person who did the preparation sees the CMP re-check; a person who did not, does not.
- [x] On a Social Hike event, the "what was good" step uses the hike wording. ~~shows the series' approved reviews below the box as examples~~ (superseded by decision 16: no examples block).
- [x] Finishing a hike close with text and "quote me" ticked creates exactly one pending review for that series. With the box unticked, or the text empty, none is created.
- [x] A pending review does not appear on any hike page until the founder approves it. After approval it appears on every hike page of the series with the author's avatar and profile link.
- [x] The founder can list, approve and reject pending reviews from one script (shown working against the test database).
- [x] From a hike's event room, a signed-in attendee can open the optional preparation and, after the hike, the close, on a 375px phone.
- [x] A hike room has no Ready step, no Table and no Compare: `/room` and `/ready` land on the room, and the step bar shows Principle and Close only. A Clarity Night room still shows all five. (e2e/p1542-series-recipes.spec.ts: 10/10 passed 2026-10-22)
- [x] On a hike, Close opens in the room once the start time has passed, without the host ending anything; before then it is disabled. (e2e/p1542-series-recipes.spec.ts: 10/10 passed 2026-10-22)
- [x] A hike's preparation has no welcome clip and no R&D step; its principle question names "this hike". Clarity Night's preparation is unchanged. (e2e/p1542-series-recipes.spec.ts: 10/10 passed 2026-10-22)
- [x] A hike's registration thank-you offers "Learn what this community is about" (optional, no "Prepare now", no reminder button); Clarity Night's shows its existing text. (e2e/p1542-series-recipes.spec.ts: 10/10 passed 2026-10-22)

- [x] UAT 2026-10-23 (decisions 12-17): the room step reads Feedback; an ended hike's Feedback is enabled; hike room shows one quiet learning link; the room card is the only feedback intro and lands on the score; CMP re-check is one step; no review examples; the thank-you after a pre-registered next event says "Thank you for your feedback" with no reservation claim. (e2e/p1542-series-recipes.spec.ts: 10/10 passed 2026-10-23; awaiting founder confirmation)
  - *Evidence:* founder UAT 2026-10-29: "This is good". Run evidence: cloud TEST, 2026-10-28, `--retries=0`: `e2e/p1542-series-recipes.spec.ts:182` (lands on the score, no examples, "Thank you for your feedback", no reservation claim), `:575` (step label, enabled once started) and `:417` (CMP re-check one step) pass. The bottom-tab assertions were stale against VQA round 4 ("one active menu item", commit 37e9c4acf). They now assert exactly the Events tab, or, on the person's event of the day, no tab (checked on the event page).

**Round 6 (decisions 39-46).** Every visual AC is measured at 1440, 375 and 320 with the screen-review brief v2 alignment snippet, not judged by eye.

- [x] A hike's registration thank-you (non-learner) has exactly one button, the filled blue "Learn more" (`bg-blue-600`; founder round 6c (J) replaced the earlier outline "Tell me more"). It sits under a centred `text-2xl` "Learn about <community>", then the subtitle, then an "N min" pill computed from the plan. No "Optional" text. WhatsApp, Add to calendar and Share are text links under the date line.
  - *Evidence:* `e2e/p1542-series-recipes.spec.ts:638` 1 passed on the cloud TEST (a temporary dev server on the branch HEAD pointed at the cloud TEST, 2026-10-28, `--retries=0`) — title text and `text-2xl`, `^\d+ min$` pill, "Learn more" with `bg-blue-600`, exactly one `.bg-blue-600` in the page and no bordered button, no "optional", the quiet links and 40px targets.
- [x] Registration thank-you variants:
  - a partial learner sees "Continue learning about <community>", "N min left" and "Continue";
  - a learner and a member see no learning section;
  - Clarity Night's confirmation is unchanged (p1336 confirm e2e passes unchanged).
  - *Evidence:* partial learner — `e2e/p1542-ac-gaps.spec.ts:57` passed on the cloud TEST (a temporary dev server on the branch HEAD pointed at the cloud TEST, 2026-10-28, `--retries=0`) ("Continue learning about Clarity Practice Community", `^\d+ min left$`, "Continue"); learner — `p1542-series-recipes.spec.ts:638` (end of test, passed); member — `:723` passed; Clarity Night confirmation — `e2e/p1336-registration-prep.spec.ts:92` (smoke) and `:116` (Remind me) pass on the cloud TEST (`:126`, the 320px walk, fails there — see the report; not a confirmation-page assertion).
- [x] The room's Give feedback step:
  - shows "How was the hike?", a "Start now" button and "Takes 2 minutes", and no "Give feedback" text inside the card;
  - after this person's close is finished, it shows "Thanks, your feedback is in." with no button.
  - *Evidence:* `e2e/p1542-series-recipes.spec.ts:477` (self-hosted TEST, 2026-10-28, `--retries=0`, each test run alone): "Start now", "Takes 2 minutes", "How was the hike?", no "We need your feedback" / step-name text in the card (the step itself is now labelled "Share feedback"). Finished: `e2e/p1542-series-recipes.spec.ts:182` (cloud TEST, 2026-10-27 P1562 round-2 baseline, `--retries=0`) — "Thanks, your feedback is in.", no button, the step ticked.
- [x] The hike feedback thank-you:
  - for a non-member it is: the check, "Thank you for your feedback", then one `bg-blue-600` button "Join <community>". No bordered cards, no "Not now";
  - its line under the button is "Starts with a N-minute introduction to how we meet." (not learned), "About N minutes left of the introduction." (partial) or absent (learned);
  - the button opens the learning (not learned or partial) or the group terms (learned);
  - a member sees no join button.
  - *Evidence:* `p1542-series-recipes.spec.ts:182` passed on the cloud TEST (a temporary dev server on the branch HEAD pointed at the cloud TEST, 2026-10-28, `--retries=0`) (non-member layout, one `bg-blue-600` Join, no thanks card or "Not now", "Starts with a …", Join opens the learning); `e2e/p1542-ac-gaps.spec.ts:68` passed (partial: "About N minutes left of the introduction."); `:818` passed (learned: no line, Join opens the group terms; a member sees no join button).
- [x] Opening the group chat from any surface records it once per person per chat link. Proven by a DB row after a tap, and a second tap does not add one. After that, reloading the event page, registration thank-you or feedback thank-you shows no "Join WhatsApp group" button: before the event a quiet "Open WhatsApp group" link, after it nothing. A person who never tapped still sees the join button or link.
  - *Evidence:* DB — two real users on the cloud TEST: a first mark writes 1 row, a second still 1, the key is a hash. UI — `p1542-series-recipes.spec.ts:638` passed on the cloud TEST (a temporary dev server on the branch HEAD pointed at the cloud TEST, 2026-10-28, `--retries=0`): after the tap the registration link is hidden at once and gone after a reload, and the event page then shows only "Open WhatsApp group" (no join button); `:182` passed: the feedback thank-you's link is gone at once and after a reload; people who never tapped see the link in every other test. The event page AFTER the event: `e2e/p1542-ac-gaps.spec.ts:115` passed on the cloud TEST (2026-10-29, `--retries=0`, 4 passed): a person whose open is recorded sees no group-chat link or block once the server answers `group_chat_opened` = true; the control, a registered person who never tapped, sees the link on the same page.
- [x] The group-chat table and RPCs pass the RLS checks: a user cannot read another user's rows, and cannot record a key for an event they are not registered for.
  - *Evidence:* two real test users on the cloud TEST (`ayibkeoyukulbsjpxgaw`), temporary spec, 1 passed: A (registered) reads its own row (1); B reads A's rows → 0; B `mark_group_chat_opened` on an event it is not registered for → `42501 not registered for this event`, 0 rows; B direct insert (own or A's) → `42501`; B `group_chat_opened` → false; anon mark → `42501`. Not runnable on the self-hosted TEST (table absent).
- [x] Learning finished inside the room (founder round 9 copy):
  - shows the room's step bar with Learn checked, "You've learned the clarity principle", the next-step line and one primary, "Continue";
  - shows no event box, Add to calendar, WhatsApp, share or "Back to the room";
  - its title names no community, so it never shows a fallback community name while the name is loading.
  - *Evidence:* `p1542-series-recipes.spec.ts:771` passed on the cloud TEST (a temporary dev server on the branch HEAD pointed at the cloud TEST, 2026-10-28, `--retries=0`) (Learn checked, the heading, one button "Continue" landing on Opt in with Learn ticked; none of the removed controls); `e2e/p1542-ac-gaps.spec.ts:81` passed — with the group reads held 2.5s, the only title ever visible was "You've learned the clarity principle".
- [x] The hike group terms' secondary reads "Back". It returns to the thank-you and writes no community-ask refusal.
  - *Evidence:* `e2e/p1542-series-recipes.spec.ts:814` (self-hosted TEST, 2026-10-28, `--retries=0`, each test run alone, body passed; the run's only error was the afterAll user cleanup the self-hosted guard refuses): one Back, in the shell top bar; it returns to the thank-you, which still offers the join; `personal_ask_answers` has no community refusal for the user. Unit: `src/tests/p1542-round6.test.tsx` 28/28.
- [x] On every hike screen (registration thank-you, room steps, feedback steps, thank-you, group terms, learning plan and end), every text link and button in a centred stack is within 2px of its container's centre at 1440, 375 and 320 (measurement output pasted).
  - *Evidence:* temporary measurement spec on the cloud TEST (a temporary dev server on the branch HEAD pointed at the cloud TEST, 2026-10-28, `--retries=0`) (script kept at `scratchpad/measure/p1542-centring.spec.ts.txt`, output `p1542-centring-output.log`): 8 screens × 3 widths, `withOffenders=0`. Per screen, links/buttons whose nearest layout ancestor is a centring column (flex column + `items-center`, or a block with `text-align:center`) — 1440: registration 3, room Opt in 0, room Feedback 1, score 0, thank-you 2, group terms 1, plan 1, learning end 2 (identical at 375 and 320); all within 2px. Items laid out in a row or grid (Add to calendar · Share, the 0-10 scale, the share icons, Opt in / Opt out) are row items, not stack items, and are not measured. Control on the same page: a button offset 20px and a link offset 30px inside centred stacks were both reported; a centred one was not.
*N/A, removed from this list: the optional decision 41 (on `lg+` the improve and recommend actions sit in the page flow
under the box). Founder 2026-10-29: "drop 41". Not built; the actions stay pinned on every width.*

**Founder UAT round (2026-10-29).**

- [x] On `lg+`, "Back to the event" and the room's step bar are on one row, in the room's pinned head, and the app's
  top-bar row (which held only the Back) is not drawn. Below `lg`, the Back stays in the top bar with the step bar
  under it.
  - *Evidence:* `src/tests/p1542-founder-uat-room.test.tsx` (1) passes. Its first form, written before any change
    (the step bar in the top bar), failed on the old code. It was rewritten when the layout moved to the pinned head.
    Control for the current form: with the in-place Back switched off, the `lg+` test fails (1 failed). Cloud TEST, 2026-10-29: the screenshots and the row geometry at 1440 and 1024 put the Back and the
    step bar on one row (Back y=14, step bar y=12, not in the top bar). At 375 and 320 the step bar is under the Back
    (y=68). No sideways scroll at any width. `e2e/p1542-series-recipes.spec.ts` "B: the event room is inside the
    signed-in shell" asserts the Back in the pinned head on a 1280 desktop, and passed.
- [x] Share feedback ("Start now" on a hike, "Give feedback" on Clarity Night) opens the close inside the room:
  - `/meet?view=feedback` with one more room entry and the room's marks kept;
  - the close's step header is in the room's pinned head;
  - Back from the first question returns to the room;
  - the learner's Join opens `?view=feedback&join=1`;
  - `/close` still works directly.
  - *Evidence:* `src/tests/p1542-founder-uat-room.test.tsx` (2). On the old code: 4 failed | 1 passed. After: 5 passed.
    `src/tests/p1542-close-in-room.test.tsx`: 3 passed. Control: with the in-room options switched off in `CloseFlow`,
    3 failed. Cloud TEST, 2026-10-29, `--retries=0`: `p1542-series-recipes.spec.ts` + `p1542-ac-gaps.spec.ts`
    (excluding the two review-script tests, which need `.env.test.local` on the cloud project) 21 passed. That covers
    the room's "Start now" landing on `/meet?view=feedback` with the step header in the pinned head, Back to `/meet`,
    and the full URL sequence through the thank-you and "Back to the event". The direct `/close` entries are covered
    by the same files. The p1389 suite's direct `/close` tests were not re-run.
- [x] Founder decision (B), 2026-10-29, then REVERSED the same day (the first reading was a misunderstanding): inside the
  room the feedback questions sit vertically centred, as on `/events/:slug/close`, in the space under the room's
  pinned head.
  - *Evidence:* the in-room close's `--chrome` is again the measured bottom of the room's head (`useRoomHeadBottom`),
    not the whole viewport; `src/tests/p1542-close-in-room.test.tsx` "B reversed" failed on the top-aligned code and
    passes now.
- [x] When every step is already finished elsewhere, opening Learn records completion and shows the end screen. There
  is no all-ticked list and no button. With steps still open, the list and "Start now" show and nothing is recorded.
  - *Evidence:* `src/tests/p1542-go-back-finished.test.tsx`, "founder UAT round (3)" (2 tests) and the rewritten M1
    (started here, everything finished elsewhere). After: all pass; both P1542 unit files pass 16 of 16. Control with
    the auto-finish switched off: 2 failed (M1 and "never started here").

## UX Notes

- Happy path on a phone: event page → Event Room → close → thank-you, about two minutes.
- Example reviews sit under the text box, in the lighter example style the page already uses for placeholders, so nobody mistakes them for an answer.
- No approved reviews yet: show no examples block, never an empty frame.
- Resuming: unchanged from P1389, picking up at the step left.

## Open Questions

1. UNVERIFIED: does a hike's event room show the close card today, or only Clarity Night's? `/dev` checks `EventRoomMeet.tsx` `viewing === 'close'` for hike events.
2. UNVERIFIED: how an event knows its series (slug field on `events`). `/dev` confirms in migrations before keying recipes.

## Related

P1389 (closing sequence) · P1402 (standalone prepare) · P1403 (Social Hike series, `series_reviews`) · `docs/events/series/social-hike.md` · `scripts/event-close-results.sh`
