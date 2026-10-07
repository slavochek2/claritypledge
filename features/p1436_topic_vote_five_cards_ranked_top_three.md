---
status: backlog
type: story
rank: 40
workstream: events
created_date: '2026-10-07'
tags:
  - events
  - topics
  - voting
disclosure: public
delivery_stage: create-spec
pipeline_ran:
  - create-spec
drafted_by: opus
exec_model: sonnet
exec_effort: medium
driver: anomaly
related:
  - p1347
  - p1414
  - p1336
---

# P1436: The topic vote shows five cards and asks for first, second, third — not a star on each of thirty-six

> **Parked on filing.** The founder stopped running topic voting on 2026-10-07 after the event
> analytics (separate session). This spec is the idea, kept at the bottom of the backlog so the
> measurement is not lost if voting returns. Nothing here is scheduled.

## Problem

**Situation:** `/topics` (P1347) publishes host-chosen candidates and asks for a 0–5 star rating per
topic; P1414 moved the vote onto the next event's page. At Clarity Night #2 (2026-10-06, 20:42–21:00
ICT) 9 signed-in people cast 245 ratings across 36 published topics.

**Complication:** the result could not decide anything.

- **The scale was not used the same way by any two people.** One voter gave 5 to all 36 topics
  (avg 5.00, one distinct level); another averaged 2.53 using all five levels. Their votes are summed
  as if they meant the same thing.
- **Nothing separated from anything.** 34 of 36 published topics landed between 2.50 and 4.17.
  Within-topic spread is ~1.4 at ~7 raters, so the margin of error on a topic's average is ~0.5 —
  wider than the gap between first place and eighth.
- **Order bias is present but small:** top half of the list averaged 3.46 (7.0 raters), bottom half
  3.26 (6.6 raters). People did reach the end; the list length is not primarily a visibility problem.
- **The question is the wrong one.** A star answers *how much do you want this*. A Clarity Night needs
  *will this room split*. The winner, "Meaning of life" (4.17), is a topic almost nobody argues
  against — appetite without disagreement.
- Voting happened in ~2 minutes at the end of the evening; several voters rated all 36 topics in that
  window (~3s per topic). Zero written suggestions were submitted.

> Founder, 2026-10-07: *"it's already like too many topics and they think they were overwhelmed"*;
> *"some people were like giving five stars to everything … they didn't know how to judge or what
> they're judging"*.

**Question:** What vote can a tired attendee complete on a phone in under a minute that produces a
signal the host can act on?

## Appetite

Blast radius: one control on an existing page. Reversibility: total — the star control can be restored.
No schema change beyond a rank column. Decision density: the shortlist rule is a founder call.

## Solution

**Five cards. Tap first, second, third. One round, not three.**

1. **Five candidates, not thirty-six.** Five titles with one line and the thinker's video fit ~1.5
   phone screens; six pushes to two and the last card loses views. Three of five chosen means only two
   are rejected, which is a lighter act than rejecting three of six.
2. **Ranked, not rated.** Tap a card to mark it 1st, then 2nd, then 3rd. Ranking is comparative, so
   "everything is a 5" is unrepresentable — the failure mode observed above cannot occur.
3. **Score:** 3 points for 1st, 2 for 2nd, 1 for 3rd. The host sees points and the number of voters.
4. **The shortlist rule (how the five are chosen):**
   - never a topic already run;
   - the two runners-up from the previous vote carry over;
   - three new ones from `.private/docs/topic-backlog.md`, mixing AI and human topics (this room rates
     human questions higher — "Meaning of life" 4.17, "Intelligence vs character" 3.86, best AI topic
     8th at 3.63);
   - every candidate must already have a video and an opposing thinker, or it cannot be run if it wins.
   `[FOUNDER DECISION: automate the carry-over, or re-pick the five by hand each time?]`
5. **Voting opens with the event page, not at the end of the evening**, so people can watch a video
   before deciding. It closes the night before.
6. **Add-a-topic stays**, unlocked after voting, and remains a suggestion to the host — never an
   entrant in the current vote.

**Not solved here:** whether the room would actually *split* on the winning topic. The star→rank change
measures appetite more honestly; it still does not measure disagreement. That belongs to the
registration survey (P1336) or the pipeline's own contestedness check, and a future spec should put one
claim per finalist in the survey rather than add a second control to this page (the founder rejected an
agree/disagree toggle here: *"agree disagree is also shitty"*).

## Invariants

- The host picks the five. The vote ranks the host's shortlist; it never selects from the whole backlog.
- Votes stay advisory — no code path auto-selects a topic (P1347).
- Signed-in only, one ballot per person (P1347 as shipped: anonymous writes are revoked).

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| Too few voters to separate five options | ACCEPT | 9 voters × 3 picks still orders five options far better than 36 stars did |
| Carried-over runners-up never win and recycle forever | MITIGATE | Drop a candidate after it loses twice |
| Host shortlist re-introduces founder bias | ACCEPT | Deliberate: the room chooses between options the host can actually run |

**Non-Goals**
- Do NOT add agree/disagree or any second control to the card.
- Do NOT run multiple rounds of five (15 topics is the overload again).
- Do NOT auto-publish attendee-added topics into the live vote.

## Done-When

- [ ] The vote shows exactly five candidates, each with title, one line and the thinker's video
- [ ] A voter taps three cards to set 1st/2nd/3rd and can undo a pick
- [ ] A ballot is complete in under a minute on a 375px screen without scrolling past the fifth card to start
- [ ] "All equal" is not expressible: a ballot carries at most one 1st, one 2nd, one 3rd
- [ ] The host sees points and voter count; the two runners-up are visible for carry-over
- [ ] Voting opens when the event page is published and closes the night before

## Open Questions

1. Does the existing card component support an ordinal badge, or is this a new control? UNVERIFIED.
2. Should past ballots be re-scored when a topic is carried over, or does each event start clean?

## Related

- [p1347](done/2026-06-10/p1347_topics_page_attendees_rate_next_topics.md): the /topics page and the star control this replaces
- [p1414](done/2026-06-10/p1414_next_event_page_carries_the_topic_vote.md): the vote lives on the event page
- [p1336](done/2026-06-10/p1336_registration_carries_opt_in_prep_and_survey.md): where a "will it split?" claim would go
- `.private/docs/topic-backlog.md`: the 30 researched candidates the shortlist draws from
