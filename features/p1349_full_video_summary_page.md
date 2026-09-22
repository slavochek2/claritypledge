---
status: backlog
type: story
rank: 10
workstream: disagreement-pipeline
created_date: '2026-09-22'
tags: [stories, video, summary, disagreement-pipeline]
disclosure: public
delivery_stage: create-spec
pipeline_ran: [create-spec]
drafted_by: opus
exec_model: opus
exec_effort: high
driver: heuristic
---

# P1349: One full-summary page per source video, linked from its stories

## Problem

**Situation:** Agent stories are 1–2 sentences plus quotes (P1348). The reader sees a thin slice of
a long video and can't tell if the slice is fair.
**Complication:** The founder already does this elsewhere ("read-first" project: video summary with
timestamps). UNVERIFIED: that project isn't in this repo; location to confirm.
**Question:** Give every source video one summary page, and link it from every story drawn from it.

> Founder, verbatim: "for each embedded video have such a page similar like read first where there
> is the full thing … at the end read the full summary … people click and can go to that page and go back"

## Appetite

Blast radius: medium. New public route, new generated text about named people. Reversibility: route
can be unpublished. Decision density: a few (below).

## Invariants

- One page per **video**, never per story. N stories from one video → one URL.
- Summary text meets the same accuracy bar as stories: every timestamped claim traces to transcript
  text (P1140 retention) and is checked by an agent that did not write it.
- Person-safety rules that bind stories (story-draft PS-1 etc.) bind the summary too.

## Solution

Prototype on branch `feature/p1349-video-summary-page` (w2): dev-only `?p1349` URL flag on real
pages, plus `/tree/video-summary/page`. Everything below was chosen on that prototype.

**Decided (founder, 2026-09-22): a neutral summary of the whole video, all speakers, like read-first.** It is not about stories, points or any one speaker's position. Its job: "understand what is in the video without watching all the video." Founder's own use: "i need it myself if i would be participant, i cant watch so many videos."

**Data + pipeline (not built yet)**
- A per-video source record (provider + video id, unique) owns the summary, its provenance and status.
- Pipeline stage: summary from the retained transcript. Writer and checker separate. Output shape reuses the
  founder's existing private read-first generator: `tldr`, `summary` (prose), `key_points`, `moments[{t, note}]`.
  Drop its `worth_reading` field (an opinion about a named speaker). Key points: **3, ≤ ~12 words each.**
- Link renders **only when a checked summary exists.** No dead links.

**The link** (decided, founder + 3 review rounds)
- Text: **"Read video summary"**, with a small document icon. "Read full summary" was rejected: in a group,
  "full" reads as the long version of the story below, but the summary covers the whole video, all speakers.
- Style: plain `text-sm` blue text link, **right-aligned directly under the video**, 40px tap area, no border
  or fill. Rejected: a left-aligned pill ("too big and distracting… CTA comes before the story") and grey
  (round-1 "barely visible"). Right edge reads as a caption on the video; the eye still enters the story at the left.
- Placement: **once per video player, wherever a player renders.** Implemented in the one shared component
  every video goes through (`StoryMedia`), so every surface gets it: feed and `/stake` (stories + points
  expanded), grouped lists (once per group via `SourceGroup`), profile, point page, story detail, story and
  point embeds. Never repeated per story in a group.
- In an embed (iframe), the link opens a new tab.

**The summary page** (layout decided)
- Normal site chrome (top nav; bottom nav on mobile as on `/story`). Focus-page `Back` at top.
- Title → `channel · N-min video` → video player (normal flow, **not** pinned) → small "AI summary of the full
  video" label → **Key points** (3, numbered) → **Summary · N-min read** (prose) → **Timestamps** (the same
  blue ▶ pill as story quotes; clicking scrolls up to the player and seeks) → `/stake`-style centred
  "Go back" pill at the end.
- No "report an error" line. No "jump to timestamps" link.
- Route name: `/video/<id>` (TBD at build).

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| Summary misrepresents a named speaker; it becomes the most-trusted, least-checked text on the site | MITIGATE | Same writer/checker + transcript verification as stories |
| Near-duplicate pages hurt SEO / P1280 dedup | MITIGATE | One page per video, canonical URL |
| Copyright/fair use on long summaries of others' talks | MITIGATE | Content rule + legal-page text below (Resolved Decisions, founder 2026-09-22). Not legal advice; a German media lawyer check is recommended before relying on it |
| Point page and story embed drop a story's video (live bug, predates P1349) | FIXED on branch | `point-detail-page.tsx` (both stance rows) and the story embed built story copies without `videoUrl`/`imageUrl`/`videoQuotes`. Fixed in `e401c81ad`; `/code-review` found the viewer's own story still fetched no media columns (`getStoryByUserAndPoint` select), fixed + test in `2d46491df` |

**Non-Goals:** do NOT host the video (embed only); do NOT change story generation beyond adding the link.

## Acceptance Criteria

- [ ] Every video that has a checked summary shows "Read video summary", right-aligned under the player, on: feed stories, feed points (expanded), `/stake` stories + points, profile, point page, story detail, story embed, point embed
- [ ] A group of N stories from one video shows the link exactly once
- [ ] A video with no checked summary shows no link
- [ ] Two stories from the same video link to the same URL
- [ ] Inside an embed the link opens a new tab
- [ ] Summary page order: Back · title · channel + length · player (not pinned) · AI label · 3 key points · Summary + read time · Timestamps · Go back
- [ ] Clicking a timestamp scrolls to the player and seeks it
- [ ] Back (top) and Go back (bottom) return to the originating page
- [ ] Point page and story embed show each story's video (bug fix)
- [ ] At 375px and 320px: no horizontal scroll; link and timestamp pills ≥ 40px tall
- [ ] Every timestamp and every speaker attribution on ≥ 1 real summary checked against the transcript by hand
- [ ] No summary shows until its operator has confirmed it against the video (same rule as machine stories)
- [ ] Summary page says it is AI-written and not endorsed by the creator; credits the channel
- [ ] ToS and privacy text below ship in the same release as the first public summary
- [ ] Summary prose uses the site font

## Open Questions

1. Build follow-up: `story-video-quotes.tsx` still inlines its own timestamp pill. Switch it to the shared
   `timecode-pill.tsx` (P1348 has shipped, so this is unblocked).
2. No Impressum/legal notice route exists in `src/` (German law requires one). Out of P1349 scope; flagged.

## Resolved Decisions

**Founder decisions, 2026-09-22 (after the prototype):**
1. **Stories: rewrite short, don't cut on screen.** The existing `#aisafety1` video stories were rewritten to
   one sentence (6 from the Clarity Night speaker notes, 4 new), on test first; prod on push. Old text
   stays in `story_versions`. The on-screen first-sentence cut was removed. New stories are already
   1–2 sentences by the P1348 pipeline rule (`story-draft.md`).
2. **Site font** for the summary prose, not serif.
3. **Copyright: a short rule, the rest in the legal pages.** Lawyer-perspective review: 1 of 1 reported;
   its file claims were re-checked. The rule:
   > Our own words, never a transcript. Quotes only where they support a point: one line at most, credited
   > and timestamped. The summary sends people to the video; it does not replace it. The video is always the
   > unmodified official embed (youtube-nocookie, already used), credited to its channel. Marked AI-written;
   > the operator checks it against the video before it goes live. No claims the speaker did not make.
   > Corrected or removed promptly when the creator or a named person asks.

   Legal pages (ship with the first public summary):
   - ToS, under Intellectual Property: video summaries are our AI-assisted descriptions of public YouTube
     videos, not transcripts and not endorsed by the creators; the videos play through YouTube's official
     embed and remain their creators'; creators or named people can ask for correction or removal at the
     privacy address.
   - Privacy: rename "Videos embedded in stories" to cover video summaries; add one sentence that speaker
     names in summaries are processed on legitimate interest, with the same right to object as for machine
     accounts.


**Falsify review 2026-09-22: BLOCKED before build.** Reports: 2 of 2 (Opus reviewer + Codex). Both
returned BLOCK, and they agreed. Load-bearing claims re-checked by command:

1. **No per-video identity.** No `videos`/`sources` table in `supabase/migrations/`. The only identity is
   `stories.video_url`, with the key normalised client-side in `src/lib/group-by-source.ts`. Needs a
   source entity (provider + video id, unique) that owns the summary, its provenance and its status.
2. **"Once under the player" isn't true everywhere.** `point-detail-page.tsx` has 0 `groupBySource`
   calls, and grouping needs ≥2 stories (`group-by-source.ts:58`). Point pages and single cards get
   one player per story, so the link would repeat. Depends on P1280 or on enumerating each surface.
3. **Link only when a summary exists.** Otherwise it's a dead link on every un-summarised video.
4. **Person-safety doesn't inherit from story-draft.** PS-1 forbids naming a position, but a digest
   organised by positions does exactly that. A multi-speaker summary needs its own rules:
   per-speaker attribution, a label saying the summary is generated, a way to correct or retract,
   and no positions that aren't in the transcript.
5. **The AC checks timestamps on one video and nothing about attribution or fidelity.** It contradicts
   the invariant.
6. **Embeds:** the link must open top-level or in a new tab. Inside an iframe, "back" can't work.
7. **Need is unproven once P1348 ships.** Always-visible timestamped quotes may already answer "is this slice fair?".
8. **Copyright is a pre-publish gate, not a DEFER.**

Next: founder decides whether to proceed. If yes, rewrite the Solution around a source entity before `/architect`.

**Founder ruling on the review (2026-09-22):** judge it on product and user grounds; storage is technical.
Reframed that way:
- Finding 4 (PS-1 conflict) goes away. PS-1 governs stories that name a person's position, and this is a
  neutral summary of the video. Its remaining rule: label it as machine-written, keep it separate from
  verbatim quotes (the P1141 honesty signal), and timestamp each section back to the source.
- Findings 1–3 and 6 are technical (source table, link only when a summary exists, top-level link from
  embeds). Findings 2's point-page case: the founder notes every expanded point with a story still
  shows a player, so the rule is "link under every player", and a repeat there is acceptable.
- Finding 7 (need unproven): answered by the founder as a participant's own need.
- Finding 8 (copyright) remains a pre-publish check.

**Prototype round, 2026-09-22 (this branch).** Built on real pages behind `?p1349`. Founder feedback drove
five iterations of the link (below-player caption → pill → right-aligned text link) and three of the page.
Visual reviews: 4 rounds from one UX reviewer, 4 of 4 reports received. Each claim was checked against the
code before acting. 5 claims were refuted (pill/Back/timestamp sizes read from shrunk screenshots; turning
pills into plain text would undo the reuse). The rest were applied. Final reviewer verdict: approve the
right-aligned link, keep "Read video summary", keep one link per video. `/architect` skipped (founder):
review and reflection instead.
