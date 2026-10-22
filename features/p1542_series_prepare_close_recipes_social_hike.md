---
status: week
type: story
rank: 55
workstream: events
created_date: '2026-10-22'
tags: [events, social-hike, close, reviews]
disclosure: public
delivery_stage: create-spec
pipeline_ran: [create-spec]
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

## Solution

- **Recipes.** Each series has a recipe for prepare and one for close: an ordered list of step ids taken from the steps the pages already have. A series with no recipe gets today's Clarity Night list, so every existing event behaves exactly as now.
  - Recipe conditions cover only what these two recipes need: "only if the person prepared" (the CMP re-check) and "only while it applies" (the personal asks, already decided server-side).
  - Where a recipe lives (code map keyed by series slug, or a column) is `/dev`'s call. Prefer the option with fewer moving parts.
- **Social Hike recipe:**
  - Prepare: today's preparation, offered as optional from the event room.
  - Close: score → [positions → stance, only if prepared] → improve → appreciate (hike wording, approved reviews shown as examples) → personal asks.
- **Review hand-off.** A finished close with a non-empty "what was good" and "you may quote me" ticked creates a **pending** review for that series. It is linked to the person's profile, so it shows their avatar and links to them. The founder lists pending reviews and approves or rejects each, from a founder-only script, the same pattern as `scripts/event-close-results.sh`. Only approved reviews show on hike pages.
- **Room copy.** The event room's close card ("The evening has ended …") needs wording that fits a hike.

[FOUNDER DECISION: the appreciate step's hike wording. Draft: question "What did you enjoy about this hike?"; consent line "You may quote me by name on future hike pages to invite new people." Confirm or rewrite.]

[FOUNDER DECISION: the event room close card for hikes. Draft: "Thanks for hiking with us" / "Two minutes to tell us how it went?" Confirm or rewrite.]

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

- [ ] On a Clarity Night event, the close shows the same steps in the same order as before (existing close e2e passes unchanged).
- [ ] On a Social Hike event, the close shows no topic vote.
- [ ] On a Social Hike event, a person who did the preparation sees the CMP re-check; a person who did not, does not.
- [ ] On a Social Hike event, the "what was good" step uses the hike wording and shows the series' approved reviews below the box as examples.
- [ ] Finishing a hike close with text and "quote me" ticked creates exactly one pending review for that series. With the box unticked, or the text empty, none is created.
- [ ] A pending review does not appear on any hike page until the founder approves it. After approval it appears on every hike page of the series with the author's avatar and profile link.
- [ ] The founder can list, approve and reject pending reviews from one script (shown working against the test database).
- [ ] From a hike's event room, a signed-in attendee can open the optional preparation and, after the hike, the close, on a 375px phone.

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
