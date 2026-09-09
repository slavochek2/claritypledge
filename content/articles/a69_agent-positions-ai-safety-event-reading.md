---
status: idea
title: "Where Four People Actually Stand on AI Safety — And Who Said So"
rank: 1
tags:
  - ai-safety
  - agent-positions
  - events
  - transcript-grounding
created_at: 2026-09-09T00:00:00.000Z
---

# Where Four People Actually Stand on AI Safety — And Who Said So

## Idea

The reading artifact for the first AI-safety event, doubling as a standalone content asset. It presents four polarizing points on AI safety, each with exactly two opposed positions, each position attributed to an "Agent on [Name]" and backed by an agent-written story with real quotes and timestamps into the unedited source video. Only one or two points are used live in the 90-minute session; the rest exist so the article keeps working after the event, as the thing someone shares and the thing that fills the next repeat run.

The article is the first container that shows many stories from the same source side by side, which is what surfaces the structural requirement below. A story is self-contained everywhere else — feed, profile, standalone link — and carries its own video embed. That must not change. But one source video yields several stories, one per point, so walking the article point-by-point would embed the same full player three or four times.

The rule: **a story always carries its source; a container deduplicates sources on render.** The article walks stories in document order, keeps the full embed on first occurrence of each source, and renders every repeat as quotes and timestamps with the player collapsed behind a small expandable "source" affordance. Timestamps stay visible on repeats without exception — the embed is convenience, the timestamp is the falsifiability hook.

Second requirement, independent of dedup: the "Agent on X" label carries its own disclosure, but the profile-page explanation of what that means does not travel into the article. One framing sentence at the top, in the founder's own voice — positions are AI-reasoned from what each person said on video; the quotes and timestamps are real, the positions are inference — with every label linking to the profile. No methodology section, no hedging throughout; over-explaining reads defensive. That sentence is also the pitch: most readers have never seen transcript-grounded position inference.

## Source

Claude.ai conversation 2026-09-09, "Event preparation with AI-generated agent perspectives" (private conversation archive, `~/Projects/private/<repo>/2026-09/`). Worked through event format, artifact structure and source redundancy, and disclosure labelling for AI-inferred positions.

Decisions reached in that conversation, carried here as constraints:

**Counts corrected 2026-09-09 against prod:** the source conversation said five points; the run
that shipped produced **four** points, four agents, eight stories. Use four.

- **Rejected — a per-story "hide embed" setting.** Makes the same object behave differently depending on where it lands, so every new article re-makes the decision by hand. Breaks at volume.
- **Rejected — promoting Source to an entity that owns the embed.** Would strip the embed from the story and break feed/profile self-containment. The duplication is a rendering problem, not an ontology problem.
- **Rejected — auto-clipping videos to the relevant segments.** Clipping is what selective quotation looks like. Timestamps into the unedited original are the epistemic integrity mechanism of the product; shipping clipped video would undercut the thing being sold.
- **Live scope is one point, maybe two — not four.** A single point with two opposed positions and their stories is 3–4 minutes of silent reading, done in the room, so everyone arrives on equal footing whether or not they prepared. All four is 20–30 minutes, a third of a 90-minute event, spent on the one activity that does not need the room.

Assembly for the first run is a hand-built Ghost post; there is no in-app article container today (`/manifesto` renders one committed static markdown file, the blog is external Ghost). Deduping sources by hand for one article is also the cheapest test of whether the reading order works before any of it is built.

Open, deliberately not resolved here: whether an agent-extracted position summary is really a "story" under the existing definition (a subjective experiential container) or a fourth entity type. Worth deciding before generating a hundred of them.


## Inputs for /prepare-blog — everything the writing session needs

**Audience.** People attending a 90-minute AI-safety session. Mixed familiarity: some have a
settled view, some none. They are not the product's existing users and do not know the
stories/points/positions ontology — do not explain it, let the artifact teach it by being read.

**What the article is for, in priority order.**
1. Get the reader to arrive with a *staked position* rather than a first impression. Reading
   something is not having a position; the article must make them land somewhere.
2. Make them curious enough to come, and useful enough to share afterwards — it is the asset
   that fills the next repeat run.
3. Teach the shape of the instrument by using it, so the room can use the vocabulary in
   minute ten without a lecture.

**Live scope is ONE point, maybe two — not all four.** Read silently in the room, 3-4 minutes.
The rest exist so the article keeps working after the event. Do not write the article as if all
four will be discussed.

**Material, all verified and live on prod under tag `aisafety1`:**
- 4 points, each with exactly 2 opposed positions (4 strongly_disagree, 3 strongly_agree, 1 agree).
- 8 agent stories, all `public`, each linked to its point, each carrying 2-3 quotes with timecodes.
- 4 agents, 4 source videos. One agent holds 3 stories on a single video.
- Primary source-of-truth file: `.private/points-runs/ai-power-remedies-d.md` — the run that
  produced all of the above, including the arguer set and the verified quotes.
- Read live values from prod rather than trusting this file's counts (they are a snapshot).
- **Sync verified 2026-09-09 — do not re-investigate.** Prod `aisafety1` (4 points, 9 Sep) and test
  `aisafety2` (same 4 points, 7 Sep) agree, and the run file carries prod's story text verbatim
  (two stories spot-checked on mid-sentence fragments, both exact). `promote-to-prod` performed its
  write-back correctly. **Trap:** test ALSO carries an old `aisafety1` — 5 different points from
  1 Sep, a superseded run. Same tag name, wrong material. Query prod for `aisafety1`, or test for
  `aisafety2`; never test for `aisafety1`.
- **From the run file, worth knowing when picking the live point:** the point target was 5 and the
  run yielded 4, deliberately not padded — four arguers give four distinct pairs. One arguer holds a
  position on only ONE point (P3, the ownership point); if that point is not among the ones run at
  the event, that arguer does not appear at all.
- **Transcripts are NOT in the repo.** P1140 retains them outside it; the run file's verified
  quotes are the working evidence. Do not promise the article more source text than that.

**Embeds — settled, do not re-litigate:**
- Embed points as `<iframe src="https://claritypledge.com/point/{id}?embed=true&expanded=true">`.
  `expanded=true` is required: it puts the evidence on load instead of behind a click, and it
  sidesteps P1287 (the first click on a cold collapsed load is discarded).
- `/draft-blog` step 2b already converts these iframes into Ghost HTML cards. No new tooling.
- Order: points first, then their opposed positions beneath. Within a point, order by opposed
  position, not by agent — the value is disagree-next-to-agree adjacency.
- The point used live in the room goes FIRST. The rest descend by sharpness of disagreement,
  not pipeline order.

**Accepted for v1, do not try to fix in the article:** one agent's video will appear under three
separate points, in three iframes that cannot see each other. That is P1280 and it is not
solvable at article level. It will read repetitively. Ship it repetitive.

**Two hard requirements:**
1. One framing sentence at the top, in the founder's own voice: positions are AI-reasoned from
   what each person said on video; the quotes and timestamps are real, the positions are
   inference. Every "Agent on X" label links to that agent's profile. No methodology section,
   no hedging in the body — over-explaining reads defensive.
2. Do not summarise the agent positions in the founder's voice to make it flow. The agent
   stories ARE the content. The founder's voice is the framing sentence, the point selection,
   and the closing invitation — nothing in between.

**Prerequisite before publishing:** the embeds only work once main is pushed (the CSP fix that
makes the video player render at all, plus P1282's gate fix). Verify signed-out that a point
embed renders its stories with a playing video before the link goes in an event description.

## Angle Ideas

- "Where Four People Actually Stand on AI Safety — And Who Said So" — the event-reading framing, points first.
- "We Asked an Agent What Bernie Sanders Would Say About AI Safety. Then We Showed Our Work." — leads with the method, makes the timestamps the payload.
- "The Quotes Are Real. The Positions Are Inference." — leads with the disclosure sentence, turning the caveat into the hook.
- "Reading Something Doesn't Make You Understand It" — leads with the comprehension problem the event exists to solve, article as the evidence.

## Enrichment (2026-09-09)
Source: session that shipped P1282 (point-embed fix) and filed P1280 / P1287
Applied to: a-spec body (pre-draft phase, status: idea)
