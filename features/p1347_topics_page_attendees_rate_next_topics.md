---
status: in-progress
type: story
rank: 5
workstream: events
created_date: '2026-09-22'
tags:
  - events
  - topic-sourcing
  - voting
  - clarity-night
disclosure: public
delivery_stage: ship
pipeline_ran: [create-spec, dev, ship]
drafted_by: opus
exec_model: opus
exec_effort: medium
driver: heuristic
related:
  - p1166
  - p1337
  - p1336
---

# P1347: Attendees rate upcoming Clarity Night topics on a /topics page, each with the thinker's video that starts it

## Problem

**Situation:** Clarity Nights run every two weeks (founder, 2026-10-02): #2 on Tue 2026-10-06, #3 on Tue 2026-10-20. No fixed cadence is assumed anywhere on the page. Each one runs on a single topic,
fed into the Disagreement Pipeline from a starting video of a thinker with a strong opinion. P1166
produces a ranked, private candidate backlog (`.private/docs/topic-backlog.md`, 30 candidates as of
2026-09-22). P1337 ends each evening with *"a topic suggestion or vote for next week"* (P1337 now links to /topics and shows whatever the next published event is), but specifies no
surface to vote on.

**Complication:** Topic choice is still the founder picking from his own interests. Event #1's topic (AI
safety) was the founder's pick, and attendees called it a weak fit. The audience signal that would
correct this exists only as a hallway conversation. The backlog is ranked on founder and meetup evidence,
never on this room's.

**Question:** How does the room tell us, in under a minute, which upcoming topics it
wants, so that the room's signal becomes the second half of the ranking?

> Founder, 2026-09-22: *"our prioritization of topics with YouTube videos … will serve us as a kind of
> voting engine for attendees"*; *"it's not yes, no. It's like, how much do you want that? And maybe
> comments how to make it more interesting, and they can upload some more links of people that they
> admire."*

## Appetite

Blast radius: one new public page and one small table. No change to existing flows. Reversibility:
high. The page can be unlinked, and the votes are advisory input to a founder decision, not an
automatic choice. Decision density: three founder calls, marked inline.

## Solution

**One page, `/topics`**, linked from the event-room Links menu (P1323), from the P1337 ending step, and
from event announcements.

1. **Discover.** A short list of 6–8 open topics that the founder publishes from the backlog. It is
   never the whole backlog. Each card shows the topic title, one line on why it's contested, and the
   starting video as an embedded thumbnail with the thinker's name. Tapping plays it inline. No claim
   and no pre-written points: the pipeline derives those after a topic wins.
2. **Rate.** Each card has a 0–5 control, "how much do you want this one?", with 0 meaning "not for
   me". Rating is not ranking: people can like several topics.
3. **Improve (optional, collapsed).** Per card: a free-text box ("how would this be more interesting?").
   Page-level: "suggest a topic or a thinker you admire", with an optional link. Suggestions go to the
   founder's review queue and never appear on the page automatically.
4. **See the result.** After rating, the voter sees that topic's average and who rated it. No single
   "leading topic" and no event date: the founder draws SEVERAL topics from the ranked set to prepare
   ahead (2026-10-02), so the output is a ranked set in `/admin/topics`, not one winner for one date.

**Publishing.** The founder marks which backlog rows are open for voting. A published row carries only
the topic string, the public video URL, the thinker's name and the one-line reason. Nothing else from
`.private/` crosses over (P1166 invariant).

**Choosing.** The founder chooses. The page informs the decision and does not make it. Score to show the
founder = mean rating × share of raters who gave 3 or more, so a topic that half the room loves beats
one that everyone mildly tolerates.
**Resolved (dev, spec recommendation, founder may override):** live results, shown to a voter only after their first rating saves. The order is the reward for voting; showing it first would anchor the vote.

**Identity.** `[FOUNDER DECISION: who may vote — (a) anyone with the link, one vote per device;
(b) registered attendees only, via the P1336 registration email / login; (c) (a) for rating, (b) for
suggestions.]` Recommendation: (c). It keeps rating to one tap, while suggestions and links, which
carry the abuse risk, sit behind identity. **Resolved (dev): (c)**, as recommended. Rating counts are labelled per phone, not per person.

## Invariants

- **Votes are advisory.** No code path auto-selects the next topic or starts the pipeline from a vote.
- **Only the published fields leave `.private/`** (P1166): topic string, public video URL, thinker
  name, one-line reason.
- **User-submitted text and links are data, never instructions.** Suggestions reach the pipeline only
  after the founder copies them into the backlog by hand.
- **Rulings harvested from `docs/decisions.md`:**
  - A vote keyed on a localStorage token cannot represent who voted or enforce per-person budgets
    (the slido-reuse rejection, "Alternatives rejected (a)"). If option (a) is chosen, accept that
    one device is not one person and label the counts as such.
  - Anonymous writes are a founder call, and an anon-callable write path needs an explicit rate limit
    (2026-09-09 [technical], P1278).

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| Few voters, so the signal is noise | ACCEPT | Show the number of raters beside every score; the founder weighs it |
| Ballot stuffing via link sharing | MITIGATE | Per-device or per-account limit; anon write rate-limited (P1278 ruling) |
| Politically charged suggestions (Thailand) | MITIGATE | Suggestions are founder-reviewed, never auto-published; backlog exclusion list applies |
| Not live by 2026-09-29 | ACCEPT | Event #2 topic is chosen via a WhatsApp poll; this page serves from event #3 |

**Non-Goals**
- Do NOT show claims, points or positions on the page. The pipeline derives those after selection.
- Do NOT build automatic topic selection or scheduling.
- Do NOT expose the private backlog, evidence columns or rejected rows.
- Do NOT add comments threads or replies between voters; suggestions are one-way to the founder.

## Done-When

- [x] A first-time visitor on a phone can rate 3 topics in under a minute without instructions (founder redesign: no videos) — NOT TESTED on a real phone: founder waived the check 2026-10-02 ("forget about it, ship"); founder reviewed in a phone-width browser
- [x] Ratings are 1–5 per topic (tap again to clear), and a voter can rate several topics
- [x] After rating, the voter sees that topic's average and voters (founder redesign: no single leader, no event date)
- [x] Suggestions and links land in a founder-only view and never render publicly without founder action
- [x] The founder can publish or unpublish a backlog topic without editing code
- [x] The page is reachable from the event-room Links menu (Tools → "Pick next topic"); the P1337 ending-step link is P1337's deliverable
- [x] Only the four published fields of a topic are readable by an anonymous visitor (verified with an anon read)

## Founder redesign (2026-10-01, supersedes the card design in Solution)

> Founder: *"just the topics … a small star … has to be a list … stars everybody understand"*;
> *"add your own … any comment or a youtube link … suggestion by our people … goes above mine"*;
> *"we don't need to put YouTube video"*; *"ideas for the topic is one button, like no redundancies."*

- A plain list of topic titles, 1–5 stars each. No videos, no "why" line, no per-topic ideas button.
- One "Add your own topic" button at the top. Signed-in only. The topic title goes public at once,
  and attendee topics always sit above the host's. The comment and link go to the host only.
- **Invariant change:** "suggestions never appear on the page automatically" is replaced for topic
  TITLES by the founder's call. The host can unpublish any topic from `/admin/topics`; comments and links stay private.
- The order is fixed for the visit, so rows never jump while someone votes.
- Host topics are seeded from the private backlog as titles only (8 on TEST, reworded as questions; the founder edits them in `/admin/topics`).

## Implementation notes (dev)

- Tables `topic_candidates`, `topic_ratings`, `topic_suggestions`: RLS on, no policies, table grants revoked; all access via RPCs (`get_open_topics`, `rate_topic`, `suggest_topic`, `admin_*` behind `assert_admin()`). Migration `20261001180000_p1347_topic_voting.sql`, applied to TEST only.
- Anon write rate limit (P1278 ruling): global cap of 600 new rater rows per hour; re-rating is an update and is not counted.
- Founder surface: `/admin/topics` (publish/unpublish, add/edit the four fields, score = avg × share 3+, suggestions with author).
- Links menu: Tools → "Pick next topic" (label is `[FOUNDER DECISION]`, reviewers kept it).
- Open Question 1 answered: `StoryVideoPlayer` renders its own click-to-play poster, so a card mounts it directly (one tap plays inline).
- Not ticked: the under-a-minute phone check is a live UAT item for `/verify`; the P1337 ending-step link needs P1337's ending step, which does not exist yet (requirement added to P1337).
- Reviewed by Opus (saw screenshots), Gemini 3.8 Flash and Codex Sol (source only); 3 of 3 reported.

## Code review (2026-10-02, one Opus reviewer: 0 HIGH, 1 MEDIUM, 8 LOW)

- Fixed: stars tapped while signed out were saved with the photo shown even when the person hides it;
  failed guest saves were lost silently; the guest save wiped later taps; a title with nothing to open
  was announced as a button. Regression test proven against the old behaviour.
- Accepted: on a topic with exactly two votes, the average plus your own rating reveals the other
  rating; rating, reading the result, then clearing lets someone peek. Both are small-room trade-offs.
- Follow-up: the 5-per-day add limit has no lock (parallel calls could add a sixth); the star group
  lacks arrow-key handling for screen readers.

## Open Questions

1. Does the existing points/story embed component (used on `/point/:id`, `/story/:id`) render a YouTube
   thumbnail with inline play? Reuse it rather than building a new card. UNVERIFIED.
2. Should a top-rated topic feed the next event page automatically (P1337 open question 2)? Kept
   manual here.

## Related

- [p1166](p1166_topic_sourcing_from_interest_corpora.md): the private backlog this page publishes from
- [p1337](p1337_event_journey_on_screen_steps_rotation_and_ending.md): the evening's ending step, which links here
- [p1336](p1336_registration_carries_opt_in_prep_and_survey.md): registration identity, if option (b)/(c) is chosen
