---
status: week
type: task
rank: 15
workstream: disagreement-pipeline
created_date: '2026-09-28'
tags: [disagreement-pipeline, clarity-night, events, skills]
disclosure: public
delivery_stage: create-spec
pipeline_ran: [create-spec]
drafted_by: opus
exec_model: opus
exec_effort: high
driver: anomaly
---

# P1367: Disagreement pipeline: what Clarity Night #2 still teaches after P1355 and P1358

## Problem

**Situation:** The Clarity Night #2 run ("AI and your ikigai", slug `ai-ikigai-2026-09-29`) reached
TEST on 2026-09-28: 6 points, 21 stories, 6 agent accounts, an event page. Two follow-up specs
already closed most of what the founder had to correct during the run: P1355 (standing rules for
video selection, page section order, event intention) and P1358 (speaker confirmation before any
page quotes someone, video summaries, a model per story role). A review of the 16 sessions behind
the run (2026-09-17 → 2026-09-28) found what neither covered.

**Complication:** In order of how often the founder will hit it again:

1. **The event-page corrections of 2026-09-28 landed on one event, not on the skill.** Between 09:16
   and 10:46 the founder rewrote the TEST page's copy line by line, then approved it ("open to
   see" → "ship"). `clarity-night-publish.md` was last changed that day by P1358 (attribution only)
   and still prescribes what the founder corrected. Verified by reading the skill:
   - Section list (line 118) names **"Who is in the room"**; the approved page says **"Experts who
     disagree"**, and the founder asked whether it belongs inside the agenda's preparation rather than
     as its own section (09:46).
   - Rule 8 (line 195) says the Clarity Meeting Principle is **"never linked (`/meet` stays
     unlinked)"**; the founder, 10:09: *"maybe okay link it"*. This overturns
     `docs/events/clarity-practice-event.md:70`, which is where the unlinked rule lives.
   - Nothing states the rule the page must describe. The draft said *"Before you disagree, explain
     back what the other person means"*; founder, 09:48: *"It's not true. It's not before you
     disagree. You cannot continue disagreeing if the minimum number is below 8."* (Matches
     decisions.md 2026-09-16, "repeat until 8+".)
   - The "how Clarity Nights are different" section is to talk about the **social norm**, not the
     0-10 mechanics. Founder's own text, 09:57: *"In many groups admitting 'I did not understand you'
     people think it makes them look stupid or offensive… In our events revealing gaps in
     understanding is rewarded, not punished."* Heading preference, 09:49: *"it was better before
     when you say why we run these events"*, keeping the community link *"for transparency"*.
   - Writing rules the skill lacks: no negation opener (*"Why do you start with negation?"*, 09:36);
     never "we quoted them" (09:43); never imply the experts spoke about ikigai (*"say none of them
     said a word about Ikigai. That's not cool"*, 09:52); short sentences, cut maximum sentence
     length (09:43); no YouTube links in Sources when the stories already carry the video (09:44);
     no product vocabulary the reader cannot know (*"A person doesn't know what is a story, what is
     a point"*, 09:59).
   - Run of show: groups of three rotating **speaker, listener, observer** (10:11: *"everybody tries
     the switches through the roles"*), not the fishbowl `clarity-practice-event.md:119` still
     describes; optional dinner as the last agenda line (10:00).
2. **A date typed as "next Tuesday" is not read back.** 2026-09-28 is a Monday. The founder asked
   for "next Tuesday" at 10:00 and at 14:16, in another session, found the page showing *"6th? not
   sure how it comes"*. The run slug, run files and TEST event slug all carry `2026-09-29`
   (verified: `.private/points-runs/ai-ikigai-2026-09-29.*`, the TEST URL
   `/events/clarity-night-ai-and-your-ikigai-2026-09-29`). The skill writes the slug by hand
   (`clarity-night-publish.md:234`); the app's own `generateSlug` stamps the *creation* date
   (`src/app/data/events-service-real.ts:189`), so no layer ties the slug to the event date.
3. **Every resume starts with the founder asking where we are.** At least six times across the run:
   *"what next what we did what now"* (09-28 08:03), *"but where is it? … open the feed"* (08:09),
   *"so next is upload or what?"* (09-24). The run had five compactions. The answer was always in
   `.private/points-runs/<slug>.handoff.md`; `run-pipeline.md` has no step that shows it first
   (grep for resume/status in that file finds only the prod re-invocation note, line 122).
4. **The format change from event #1 is not written down.** The handoff (line 117) records it as
   pending: *"event #1 feedback says people want one-on-one, not fishbowl.
   `docs/events/clarity-practice-event.md` still says fishbowl."* The event page now describes
   trios; the doc the skill cites does not.

> Founder framing, verbatim (2026-09-28): *"reflect … what other issues we want to fix or improve so
> next run has less friction and I am more out of the loop"*.

**Question:** Which changes make the next Clarity Night page come out of the skill already in the
approved shape, with the right date, and let the founder resume without asking where things are?

## Appetite

Blast radius: medium. Every future Clarity Night page and every pipeline resume, but only skill text,
one doc and one read-only check. No app code, no schema. Reversibility: git revert. Decision density:
one open founder call (item 2 of the review, plain links; see Open Questions). Everything else was
decided in the 2026-09-28 session and is recorded below.

## Decided (do not re-ask)

- Rule wording: disagreement continues only once the lower of the two numbers is 8 or more
  (decisions.md 2026-09-16; founder 2026-09-28 09:48).
- `/meet` is linked from the Clarity Meeting Principle's single mention (founder 10:09). This is an
  explicit overturn of `clarity-practice-event.md:70` and of rule 8's "never linked".
- Trios with rotating roles, optional dinner, 18:30 to 20:30 for this event (founder 10:00, 10:11).
- The **approved TEST page text is the reference**, not this spec's paraphrase of it. Where the two
  differ, the page wins.

## Solution

### S1. The skill learns the approved page (closes 1)

Update `clarity-night-publish.md` so a fresh draft reproduces the structure and rules of the page the
founder approved on 2026-09-28: section names and order, the 8+ rule, the social-norm framing, the
`/meet` link, the writing rules listed in Complication 1, Sources without YouTube duplicates, trios
and the optional dinner line in the run of show. Update rule 8 and the event doc in the same change,
so the skill and the doc it cites do not disagree. Record the overturn in decisions.md via `/kdd`.

Derive every rule from a diff between the skill's current template and the approved TEST page
description, fetched from the TEST database, not from memory or from this spec.

### S2. Dates are absolute and read back (closes 2)

The skill asks for the date as an absolute date and echoes it back with the weekday and the
Asia/Bangkok time before writing anything ("Tuesday 6 October 2026, 18:30 to 20:30"). Relative
input ("next Tuesday") is resolved and shown, never written silently. A read-only check compares
the date inside the event slug (if any) with the event's `datetime` and fails loudly on a mismatch.
Whether to fix this event's slug is an operational step in the prod promote, not part of this spec;
`/night` (3221b4910) already gives a date-free link.

### S3. Every resume opens with the run's state (closes 3)

`run-pipeline.md` gains one step at the start of any resume: read the run's handoff file and print
three lines before doing anything else: **done** (last completed stage and target), **next** (the
next stage and its gate), **where to see it** (the URL on the environment it was published to). It
also names what is on TEST but not on PROD. Read-only.

### S4. The event doc matches the room (closes 4)

`docs/events/clarity-practice-event.md` replaces the fishbowl block with the trio format, citing the
event #1 feedback as the reason, and moves the `/meet` rule to "linked once".

## Invariants

- The TEST → PROD separation in `run-pipeline.md` ("two invocations, never one") is untouched.
- P1358's page-quote predicate and its enumeration requirement stay in force; S1 must not weaken
  or reorder them.
- DB is the source of truth for story text after the 2026-09-28 rename (handoff line 113). Nothing
  here re-publishes from the run file.

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| S1 encodes this one event's copy as universal rules (e.g. "six" points, ikigai-specific lines) | MITIGATE | Every new rule is stated generically; a second-topic dry run (event #1's material) must still produce a sensible draft |
| Linking `/meet` breaks the protocol-silence reasoning in the event doc (studying the principle before the room) | ACCEPT | Founder decided it on 2026-09-28; recorded as an overturn with the reason, so it can be reversed on evidence |
| Local `.event.md` copy is stale versus the TEST DB (it still has "Who is in the room") | MITIGATE | S1 reads the page from the DB; the implementer notes the stale file in the handoff |
| The date check fires on older events whose slugs carry creation dates | MITIGATE | Check only events created by this skill, or treat a slug without a date as pass |
| Founder-fit of cast and points (Brett, the unmeaningful point, 2026-09-22) recurs | DEFER | P1355 added the event intention input on the same day; unknown whether it prevents this. Falsifier: on the next run the founder cuts or questions an arguer or point at Gate 2 for fit rather than fact. Then file a spec |

**Non-Goals**
- Do NOT change `src/index.css` link styling. Plain inline links are a founder decision (Open Questions).
- Do NOT promote anything to PROD. Another session owns the Clarity Night #2 promote.
- Do NOT touch select, positions or story-draft stages; P1355 and P1358 own them.
- Do NOT add an event-page RSVP or CTA change (asked 10:11; separate question).

## Alternatives Considered

- **Leave the skill and correct each page by hand.** Rejected: this is the state that cost ~20
  founder messages on 2026-09-28.
- **Copy the approved page into the skill as a template.** Rejected: topic-specific text would leak
  into the next event; rules generalise, copy does not.
- **Enforce section order by a script.** Deferred: P1355 already made the order a stated rule; no
  evidence yet that the order is ignored rather than out of date.

## Rollback Strategy

All changes are skill and doc text plus one read-only check: `git revert` of the commit.

## Done-When

- [ ] A diff between the skill's template and the approved TEST page is recorded in this spec
      (Implementation notes), and every difference is either a new rule in the skill or listed as
      deliberately not generalised, with a reason
- [ ] A fresh draft-mode run on event #2's run file produces a page with the approved section names
      and order, the 8+ rule, the linked `/meet`, and no YouTube duplicates in Sources, checked
      against the approved page
- [ ] The same draft run on event #1's material still produces a sensible page (no ikigai- or
      six-point-specific text leaks in)
- [ ] `rule-present` (P1355) covers the new rules and exits non-zero on a copy with the 8+ rule removed
- [ ] Entering "next Tuesday" produces an absolute date with weekday, shown before any write
- [ ] The slug/date check fails on a fixture slug `…-2026-09-29` with `datetime` 2026-10-06, and
      passes on the matching pair (both exit codes pasted)
- [ ] A resume of `run-pipeline` on the ikigai run prints done / next / where-to-see first, and the
      three lines match the handoff file
- [ ] `clarity-practice-event.md` describes trios and a linked `/meet`, with the event #1 reason
- [ ] decisions.md records the `/meet` overturn and the trio format (via `/kdd`)
- [ ] Skills re-synced (`scripts/sync-agent-skills.sh --check` passes)

## Open Questions

1. **[FOUNDER DECISION: expert names in the event text: plain inline links or unlinked?]** Today
   every link in an event description renders as a black pill (`src/index.css`,
   `.event-description a`, deliberate), so linked names became buttons and were reverted. Plain
   links need a separate UI spec; unlinked costs nothing.
2. Should "prepare before the event" sit before the agenda or be agenda item 0? The founder
   considered both (09:46, 09:49, 10:08). The approved page is the answer; the implementer reads it.

## Related

- [P1355](done/2026-06-10/p1355_disagreement_pipeline_standing_rules_from_clarity_night_2.md) and
  [P1358](done/2026-06-10/p1358_disagreement_pipeline_attribution_summaries_story_models.md):
  the fixes this spec continues
- decisions.md 2026-09-16 [product]: pairs rounds and the 8+ rule
- `3221b4910`: `/night` shortlink
- P1336 / P1337: registration and on-screen event journey (the page should not explain what they will)
