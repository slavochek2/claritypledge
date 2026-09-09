---
status: backlog
type: story
rank: 1000064
workstream: C2
created_date: '2026-09-09'
tags: [stories, agents, articles, video]
disclosure: public
delivery_stage: create-spec
pipeline_ran: [create-spec]
drafted_by: opus
exec_model: opus
exec_effort: high
driver: heuristic
---

# P1280: A story carries its source everywhere; a container dedups sources on render

## Problem

**Situation:** The points pipeline (P1096) takes a YouTube video, transcribes it, and produces one
agent story per point — "Agent on Bernie Sanders" holds a position on point 1, another on point 2,
another on point 3, each with its own text, its own quotes and its own timestamps into the same
video. P1141 made each story carry its source inline: `stories.video_url` plus `video_quotes`, so
the story is self-contained in the feed, on a profile, and as a shared link. P1212 established that
there is **one** agent story card and it renders identically wherever a story or a point appears —
its worst defect was `profile-page-v2` holding a private `StoryCardFull` that never imported
`StoryMedia`, so a shared profile link showed no video at all.

**Complication:** The first artifact that shows many stories from one source side by side is an
article organised point-first — a point, then the opposed positions under it. Walked that way, the
same source video is embedded three or four times on one page. Self-containment is correct and is
not the thing to give up; the redundancy exists only inside a container that aggregates.

The obvious fixes are both wrong, and were rejected before this spec (see Invariants). A per-story
"hide embed" flag makes one object behave differently depending on where it lands, so every new
article re-makes the decision by hand. Promoting Source to an entity that owns the embed would
strip the embed from the story and break the self-containment P1141 built.

**Complication, second:** There is no article container today. `/manifesto` renders one committed
static markdown file through `renderArticle()`; the blog is external Ghost driven by
`docs/content-process.md`; `clarity_docs`/`doc_stories` is the only DB-backed multi-story container
and every one of its render paths hardcodes `mode="thumbnail"`, which is why the duplication has
never been seen in-app. So this is not a bug fix. It is *define the container, with the dedup rule
built into the first render*.

**Question:** What does a container that shows many agent stories from one source render, such that
the source appears once, the evidence stays checkable everywhere, and the P1212 card contract does
not fork a fifth time?

> Founder framing, verbatim: *"the same video is embedded multiple times… I can in theory disable
> it for the second one, but then, um, I don't know."*

> On the shape of the fix, verbatim: *"if we do that embed should use same structure as when we
> improved consistency of our stories/points across feed and profiles… it should be also using same
> consistency for embeds."*

## Appetite

Large. This introduces a public reading surface that does not exist, and it touches the shared card
path that P1212 spent a full cycle converging. It is explicitly **not** required for the first
AI-safety event — that artifact is a hand-assembled Ghost post (`content/articles/a69`), which is
also the cheapest test of whether the point-first reading order works before any of this is built.
Do not start this before a69 has run at an event.

## Invariants

Additive-only. Each is a decision already taken; none is re-opened by this spec.

1. **A story always carries its source.** `stories.video_url` and `video_quotes` stay inline on the
   story, and the story stays self-contained on feed, profile and standalone link (P1141). No
   `sources` table, no per-story embed-suppression flag.
2. **Dedup is container-supplied context to the shared card, never a second card implementation.**
   The article renders stories through the same `StoryMedia` path as every other surface and passes
   down whether this page has already embedded this source. A bespoke article-only story renderer
   re-creates the P1212 defect by construction.
3. **Timestamps never collapse.** On a repeat the player may be hidden; the quotes and their
   timecodes may not. The embed is convenience, the timestamp is the falsifiability hook — the
   reader's ability to check that the quote is real is the epistemic claim the product is built on.
4. **The "Agent on X" byline is not deduplicated.** Meeting it fresh under each point is the
   disclosure travelling with the label, which is why the naming convention works at all.
5. **Every render branch of this surface enters the disclosure census.** The unit of
   `src/tests/p1259-disclosure-route-on-every-surface.test.tsx` is the render branch, not the
   component — an entry whose author lookup resolves does not cover a branch where it returns
   `undefined` ([decisions.md](../docs/decisions.md) 2026-09-08, P1270). First-occurrence and
   deduped-repeat are two branches and need two entries.
6. **No auto-clipping of source video.** Clipping is what selective quotation looks like;
   timestamps into an unedited original are the opposite. Rejected 2026-09-09 on product grounds,
   not technical ones.

## Solution

**Structure: point-first.** The article walks points in order; under each point, the stories that
carry positions on it. This is what makes the artifact usable in the room — participants read one
point with its opposed positions — and it is also what creates the repetition, so the structure
choice and the dedup rule are one decision. Order stories within a point by opposed position, not
by agent: the value of the cluster is disagree-next-to-agree, and ordering by agent buries it.

**Dedup key: the YouTube video id, not the URL string.** `parseVideoUrl` in `src/lib/video.ts`
already extracts the 11-character id, which is stable across the `youtu.be/`, `watch?v=`, `shorts/`
and `embed/` forms the `stories_video_url_allowlisted_host` CHECK permits. A raw string comparison
would treat two spellings of one video as two sources. **No migration is required for this** — the
key is derived, not stored.

**Render rule.** The container walks its stories in document order and remembers which video ids it
has embedded.

- *First occurrence* — full player above the quotes, as story detail renders today
  (`StoryCardDetail`, `mode='player'`). The source is the subject here.
- *Repeat* — quotes and timestamps first, with a collapsed source affordance **beneath** them.
  Expanding pushes nothing the reader was reading. Clicking a timestamp expands the player and
  seeks to that timecode in one gesture, via the existing `seekTo` handle on `StoryVideoPlayer`.

The below-the-quotes placement on repeats is load-bearing, not cosmetic: an affordance that expands
*above* the quote list moves the timestamp the reader just clicked down the screen, at the exact
moment they asked to look closer. The position difference between first occurrence and repeat is
not an inconsistency — on first occurrence the source is what is being shown, on a repeat the text
is the subject and the video is verification on demand.

**Only one expanded player at a time.** Expanding a repeat collapses the previously expanded one.
Ten expanded repeats is ten mounted iframes; `useLazyStoryPlayer` and its IntersectionObserver
mount margin exist because this has already bitten (P1259).

**Disclosure.** One framing sentence at the top of the article, in the founder's own voice —
positions are AI-reasoned from what each person said on video; the quotes and timestamps are real,
the positions are inference — with every "Agent on X" label linking to that profile. Not a
disclaimer block, not a methodology section, no hedging through the body: the profile explanation
does not travel into the article, and a reader who never opens the profile can read "agent" as
"his team", which is the reading that cannot be afforded. One sentence is proportionate; over-explaining
reads defensive.

**Container choice is open** — see Open Questions. The dedup rule, the key, and the card contract
hold whichever container wins.

## Risks / Non-Goals

**Risks**

- *Forking the card.* The single largest risk, and the one P1212 already paid for. If dedup is
  implemented by writing an article-specific story renderer rather than by threading context into
  the shared one, this spec makes the drift worse, not better.
- *Player mount cost.* A long point-first article can hold dozens of stories. The dedup reduces
  embeds but does not by itself bound mounted iframes; the one-expanded-at-a-time rule does, and it
  is a behaviour that must be tested, not assumed.
- *Public exposure of inferred positions.* The article publishes agent reconstructions of what a
  named real person would say. The label plus the framing sentence is the agreed mitigation; whether
  the public artifact uses real names at all is a founder call that this spec does not make.

**Non-Goals**

- Auto-clipping or re-hosting source video (Invariant 6).
- A `sources` table or any schema change to `stories` (Invariant 1).
- Retrofitting dedup onto letters, docs, feed or profile. None of them mounts players today; the
  rule is written so they can adopt it later by supplying the same context, but adopting it is not
  this spec.
- Resolving whether an agent-extracted position summary is a "story" under the existing definition
  (a subjective experiential container) or a fourth entity type. Parked deliberately — but worth
  deciding before a hundred more are generated.
- The first event's reading artifact. That is `content/articles/a69`, hand-assembled to Ghost, where
  a repeat degrades to a plain `?t=` deep link into the source.

## Done-When

- [ ] A container renders points in order, with the stories carrying positions on each point beneath
      it, ordered by opposed position rather than by agent.
- [ ] Two stories sharing one source video render one full player: the first occurrence embeds, the
      second renders quotes + timestamps with the player collapsed beneath them.
- [ ] Dedup matches across URL spellings — `youtu.be/ID` and `youtube.com/watch?v=ID` in two stories
      on one page produce one embed, proven by a test that uses two different spellings.
- [ ] Clicking a timestamp on a deduped repeat expands that repeat's player and seeks to the
      timecode, in one interaction.
- [ ] Expanding a second repeat collapses the first; at most one player is mounted from repeats at
      any time.
- [ ] Every quote timecode is present in the DOM on a deduped repeat, with the player collapsed —
      asserted directly, not inferred from the absence of an error.
- [ ] The container renders stories through the shared `StoryMedia` path; a test fails the build if
      this surface renders story media without it (the P1212 select-guard shape).
- [ ] `p1259-disclosure-route-on-every-surface.test.tsx` carries an entry for the first-occurrence
      branch **and** the deduped-repeat branch, each exercised with an author lookup that returns
      `undefined` as well as one that resolves.
- [ ] The framing sentence renders once at the top, and every "Agent on X" label links to that
      agent's profile.
- [ ] Each of the above verified by a test seen to FAIL before it passes (epistemic gate 7), with
      the non-zero exit pasted.

## Open Questions

- **Which container?** Three candidates, none obviously right. (a) A new DB-backed public article
  surface — correct long-term, most work, needs its own schema. (b) Extend `clarity_docs` /
  `doc_stories`, which already carry ordered stories and RLS — less new schema, but bends a
  letters/live artifact into a public reading artifact, and its PK `(doc_id, story_id)` means a
  story appears at most once per doc, which may or may not fit. (c) Extend the static
  `renderArticle()` path with story/point embedding — smallest surface, no authoring UI.
  **Decide after a69 has run at an event**, informed by whether the point-first order actually read
  well and whether readers used the timestamps at all.
- **Does the collapsed affordance need to name the source?** "Source: Bernie Sanders on AI (shown
  above)" is more useful than a bare chevron, but it re-introduces a per-repeat title. Cheap to test
  in the a69 hand assembly.

## Related

- `features/done/2026-06-10/p1212_agent_story_card_contract_drift_across_surfaces.md` — one card,
  identical across surfaces. This spec's Invariant 2 exists to protect it.
- `features/done/2026-06-10/p1141_story_carries_a_video_with_jumpable_quotes.md` — origin of
  `video_url`, `video_quotes`, `StoryVideoPlayer`, `seekTo`.
- `features/done/2026-06-10/p1259_agent_story_surfaces_leak_their_own_evidence.md` — mounted players
  across surfaces; source of the disclosure census.
- `features/done/2026-06-10/p1096_public_multisource_point_pipeline.md` — produces the material this
  container renders.
- `features/p1013_doc_sections_grouped_stories.md` — grouping stories under a shared matter in a doc.
- `features/p1172_first_run_verification_deferred_from_p1141_p1160.md` — open follow-up to P1141.
- `content/articles/a69_agent-positions-ai-safety-event-reading.md` — the hand-assembled first run.
- [decisions.md](../docs/decisions.md) 2026-09-08 (P1270) — census unit is the render branch.
