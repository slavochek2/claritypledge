---
status: backlog
type: story
rank: 329
workstream: clarity-canvas
created_date: '2026-11-24'
tags: [clarity-canvas, stories, points, mirror]
disclosure: public
delivery_stage: create-spec
pipeline_ran: [create-spec]
drafted_by: opus
exec_model: opus
exec_effort: high
---

# P1720: The canvas draft writes a story under a point when the owner's material holds one

## Problem

**Situation:** P1658 Revision 3 (v9) makes every canvas point a bare claim. A point never says why. Solution, Offers & Pricing and Go-to-market strategy carry no status, waiting or history, and where the business stands goes to My current biggest challenge and My next milestone. A canvas point can already carry a story, but only when someone types it by hand. The owner writes an ordinary story in the letters composer, linked to the point by `story_points`, at most one per author per point (`story_points_author_point_unique`). A reader writes one through `canvas_add_story`, which refuses the owner and stores the link in `canvas_added_stories`. `get_canvas` reads the owner's stories on a version's points through `story_points` with no version or visibility condition. The drafting agent never writes a story.

**Complication:** The material v9 pulls out of points is the owner's reasoning, and today it is simply dropped. The founder's own Copy-prompt run under v8 (P1658, `~/Desktop/v8.md`, private) shows what gets lost:
- "Impact over revenue, because revenue comes second as proof of positive impact." (a reason)
- "… so it retired the viral front door. The completions figure was corrected …, so the retirement is under revisit." (history and status)
- "not tried yet, invitations wait for a call that can run the Listening Game" (waiting)

A point with no story is a bare claim: a reader can take a side, but has nothing to understand. The project verifies comprehension of the story behind a claim, not the claim itself (`docs/story-point-model.md`, "What verify means here").

> Founder (P1658, 2026-11-19 and 2026-11-23): "a story is how I came to this point."
> Founder, 2026-11-24, filing this spec: "the draft writes a story under a point when the material holds one … A story is the experience, observations and reasoning that led to the point; a point with no story is a bare claim. It should absorb the leaks named in P1658 Revision 3 (status, 'because', waiting, history)."

**Question:** Can the drafting agent write the owner's story under a point, from the owner's own material, when that material holds how the owner came to the point, and leave the point bare when it does not, without inventing a story or letting a draft story reach published readers?

## Appetite

Blast radius: medium-high. Every new canvas draft and round update changes: the drafting prompt gains story rules, the model's output gains stories, the engine has to vet them, and stories reach the canvas page. Published canvases change only at their next version. Reversibility: medium. The prompt and engine changes revert with git. Stories published from drafts are ordinary `stories`/`story_points` rows and stay unless removed. Drafted stories that were never published live only with the draft (Solution 4). Decision density: a few founder calls (marked below).

## Invariants

- **Grounding.** Every clause of a drafted story traces to the owner's material (GLOBAL_RULES "Grounding"). Like a point, a story is written in its own words and carries a separate field holding a verbatim quote, which the engine checks. That quote comes only from the owner's own items, never from another person's words, in a round update too. When the material holds no reasoning behind a point, that point gets no story. A story is never written to fill a point.
- **A drafted story is the owner's own.** It is never written in another person's name. In a round update, where other people's words count as material for points, a story is written only from the owner's own words. A partner's reason belongs to P1574's link, and a written story in a partner's name needs that partner's confirmation (decisions.md 2026-10-30 [product], item 3; 2026-10-12 [product], "did a person approve it as their own belief?").
- **A draft story never reaches published readers before the owner publishes.** `get_canvas` returns the owner's stories on a version's points with no version condition. So a story linked from the draft to a point kept from a published version is read at once by that version's readers, and Discard does not take it back (P1536 security review, `src/app/components/canvas/canvas-page-data.ts`, `addStoryBlocked`). Drafted stories stay readable by the owner alone until the version that carries them is published.
- **Any write to `stories` or `story_points` clears the list-return cache after the write** (decisions.md, P1364 entry: "Any new write to … `stories`, `story_points` … must clear the cache"; the `p1364-cache-invalidation-drift-guard` enforces it).
- **The P1658 point rules hold.** A point still never says why. Moving reasoning into the story never moves it back into the point, and the P1658 point checks (revision 4, built in the same session) must not get worse.

## Solution

1. **The drafting agent's story rule, taken from `docs/story-point-model.md`:**
   - **What a story is.** It is first person, in the owner's voice ("I"), and tells how the owner came to the point: the experience, the observations and the reasoning.
   - **It carries the why.** A story that only recounts events (a sequence with no why) does not count ("Recount vs reveal").
   - **Points stay third person.** THIRD_PERSON_RULE stays a rule for points only, and the drafting prompt says so.
   - **Where the absorbed material goes:**
     - What P1658 strips out of a point goes into that point's story when it is part of how the owner came to the point: the reason ("because …"), the history ("I retired …, then the figure was corrected"), and the waiting or status as the owner lived it ("I have not sent the invitations, because no call can run the game yet").
     - Where the business stands still goes in My current biggest challenge and My next milestone as points (P1658). A story tells how, and never stands in for those boxes.
2. **When.**
   - At most one drafted story per point. The owner can hold only one story per point (`story_points_author_point_unique`).
   - When the owner already has a story on that point, the draft writes none and keeps theirs. The draft's note says so once per run.
   - A story is written only when the owner's material holds the reasoning.
   - A point with no story stays bare and gets no extra question (founder, 2026-11-24: defaults accepted).
   - Length cap: 600 characters per story (points: 300, `MAX_STATEMENT_CHARS`) (founder, 2026-11-24: defaults accepted).
3. **Vetting.** The engine runs these checks on a story:
   - the quote check (two shared words, verbatim, from an owner item only)
   - the number rule (no number the owner did not give)
   - the names filter (`canvas-names.ts`: no other person's or private company's name; the owner's own product names pass as they do in points)
   - the length cap
   It does NOT run the point-only checks on a story: box placement, the third-person rule, and the P1658 status, reason and timing rules. Those are what a story is for. A story that fails is dropped; its point stays, and the run reports why.
4. **Draft scope and approval.** A story linked through `story_points` to a point kept from a published version is read at once by that version's readers, whatever its visibility. So:
   - Every drafted story is held in the draft's own state, never in `stories` or `story_points`, until publish.
   - The owner sees, edits and removes drafted stories from the draft state in the draft view.
   - At publish, each drafted story becomes an ordinary owner story in the same table and link the owner's composer uses. Its visibility is inherited from the point it is linked to (founder, 2026-11-24: "point stories are also private because they inherit privacy settings from the points they're linked to"). That write clears the list-return cache (Invariant 4).
   - Discard drops drafted stories with the draft, and nothing reaches the owner's story library.
   - **Decided (founder, 2026-11-24): publishing the version is the owner's approval of its drafted stories, as it is for its points.** "Clarity Canvas draft means … points and linked stories are drafts until the person publishes, then he publishes all of that … we are not approving points either." No per-story approve step.
   - A review before publishing (the owner reads each point's wording, sets a position, and reads its story) is P1657's scope, extended to stories. The founder noted it matters more once stories are drafted; it is built after this spec, not inside it.
5. **Display.**
   - The story shows under its point the way a story added by hand does today.
   - The owner can edit or remove a drafted story before publishing, as they can a point.
   - No new label or wording on screen for a drafted story (founder, 2026-11-24: defaults accepted).
6. **The Copy prompt.**
   - The owner's own-AI Copy prompt is at 1099 of its 1100 words (P1658), and the upload parser does not read stories.
   - Stories stay in in-app drafting first; the Copy prompt and its upload parser do not carry stories in this spec (founder, 2026-11-24: defaults accepted).
7. **Measure** with the P1658 harness (`scripts/p1658-rules-ab-eval.ts`) on the same four packs, 3 runs each:
   - points with a story and points left bare
   - each story's quote checked
   - stories that only recount (no "because", "so", "to" or "when" reasoning: a lexical flag for a human to read)
   - stories in anyone else's name (must be 0)
   - the P1658 revision-4 point violations, which must not rise above the same session's points-only run (stories off)
   - output tokens per run, against `MAX_OUT_TOKENS` (thinking included)

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| The model invents a plausible story where the material holds only the claim | MITIGATE | Quote rule plus engine vetting; "no story when the material holds none" in the prompt; the A/B counts invented clauses by quote check |
| A story repeats My current biggest challenge (status written twice) | MITIGATE | The story tells how the owner came to the point; where the business stands stays a point in Challenge or Milestone. The A/B flags a story that only states status |
| A drafted story on a kept point leaks to published readers | MITIGATE | Invariant 3; a test reads `get_canvas` as another user before publish |
| Stories push a run's output past `MAX_OUT_TOKENS` (16,000, and thinking counts toward it). Judging the why behind each point also adds thinking, so the run fails | MITIGATE | The 600-character cap; the A/B records output and thinking tokens per run, and the build stops if any run comes within 20% of the limit |
| Drafted model text lands in the owner's story library before they approve it | MITIGATE | Solution 4: drafted stories live in the draft state until publish |
| Stories in first person sit beside third-person points and confuse a reader | ACCEPT | The point model's own split: a point is a claim anyone can test, a story is one person's why |
| The Copy prompt cannot carry stories within 1100 words | DEFER | Stories stay in-app first (Solution 6); a later spec adds them to the Copy prompt |
| A drafted story is published without the owner reading it | ACCEPT | Founder, 2026-11-24: publishing is approval, as for points. P1657 (review before publishing, extended to stories) follows this spec |

**Non-Goals**
- Do NOT change the point rules or the Copy prompt's point text beyond P1658 revision 4, which is built in the same session (founder, 2026-11-24: "they're connected … do both").
- Do NOT write a story in a partner's or any other person's name (P1574, P1458).
- Do NOT show story-ness or point-ness scores (P1656).
- Do NOT rewrite published canvases. Stories arrive at a canvas's next version.
- Do NOT add a story review screen or per-story approval. Review before publishing is P1657's.

## Cost Budget

The canvas draft calls the Gemini API (`DRAFT_MODEL` = the mirror model, registry row "Gemini API": $0.75 per 1M input tokens, $3.75 per 1M output tokens through 2026-12-31, then $1.50 and $7.50).

| Measure | Per user | Per hour | Per test run |
|---|---|---|---|
| Requests | No new requests: stories come back in the same drafting call, so 1 call per drafting run as today | unchanged | unchanged |
| Egress (bytes) | +1 story of at most 600 characters per point, 27 points at most (9 boxes, `BOX_DEFINITIONS`, x 3, `MAX_POINTS_PER_BOX`) = 16,200 bytes per draft at most, read on the canvas page | negligible | negligible |
| Log lines | +1 line per story the engine drops (as for points) = at most 27 per run | at most 27 x runs | at most 27 x 12 runs = 324 (only the new side drafts stories) |
| Gemini tokens x price | Today's cost per drafting run, C, comes from the P1658 final A/B (figure in `.private/canvas-rules-test/p1720-cost-base.md`). Added output: story plus quote about 200 tokens, plus up to 200 thinking tokens to judge the why = about 400 tokens per story, an estimate. The first A/B replaces it with a real token count. Typical: 5 stories x 400 = 2,000 tokens x $3.75/1M = $0.0075. Worst: 27 x 400 = 10,800 tokens x $3.75/1M = $0.0405. Added input: about 400 tokens of story rules x $0.75/1M = $0.0003. So C + $0.0078 typical and C + $0.0408 worst, per run; both double after 2026-12-31. A draft is capped at 30 runs (`REVISION_CAP_RUNS`): 30 x (C + $0.0408) worst per draft | runs per hour x (C + $0.0408) worst | both A/B sides, 3 runs x 4 packs each: 12 x C + 12 x (C + $0.0408) worst |

1. **Fits the plan limit today?** Gemini has a price and no cap. Monthly cost = runs per month x (C + $0.0078) typical, a rise of $0.0078 per run over the drafting cost already running in production. It fits if today's drafting spend plus runs per month x $0.0078 fits the spend the founder has accepted. The registry row reads per-key spend through `/slava:util:ai-keys`, and the reviewer checks it there. The measured figures stay in `.private/` (P1526).
2. **Fits at 10x?** 10 x runs per month x (C + $0.0078) typical, doubled after 2026-12-31: today's drafting verdict at 10x, plus 10 x runs per month x $0.0078.
3. **If not:** no upgrade path changes the per-token price. The lever is the story length cap (600 characters) or writing stories only on the five ranked boxes' points.

## Acceptance Criteria

- [ ] On a draft from material that explains how the owner came to a point, that point shows a story in the owner's voice telling how, and the point itself carries no reason.
- [ ] On a draft from material that states a claim with no reasoning, that point shows no story.
- [ ] Another signed-in user who reads the published version does not see a drafted story before the owner publishes the draft that carries it.
- [ ] After the owner publishes, the story shows under its point to readers of that version, the same way a hand-added story shows.
- [ ] No drafted story is in another person's name, including after a round update built from a conversation with other people.

## Done-When

- [ ] The four P1658 packs, 3 runs each (`scripts/p1658-rules-ab-eval.ts`, summary in `.private/canvas-rules-test/`), show:
  - at least one kept story in every run of the claritypledge-stories pack, whose material holds stories
  - every kept story's quote verbatim from an owner item
  - 0 stories in another person's name
  - a P1658 revision-4 point-violation rate no higher than the same session's points-only run (stories off); for reference, v9's final run was 2 in 123 kept points (1.6%)
  - no run's output plus thinking above 80% of `MAX_OUT_TOKENS`
- [ ] A round-update test, with a transcript holding another person's reasons, keeps 0 stories whose quote comes from that person's words.
- [ ] The founder marks each drafted story on his own canvas "this is how I came to this point" or not, from a list where each story stands next to its point. At least 80% are marked "is" (founder, 2026-11-24: defaults accepted).
- [ ] A test reads `get_canvas` as a second user before and after publish: the drafted story is absent before and present after, including on a point kept from the published version.
- [ ] Discarding a draft leaves no drafted story in the owner's story library, verified by a query.
- [ ] The founder decisions above are recorded in `docs/decisions.md` before `/dev` starts.

## Related

[P1658](p1658_canvas_points_as_claims.md) (rules v9, the source of the stripped material; its Revision 3 "Out of scope: stories" bullet routes here) · [P1632](p1632_mirror_drafts_linked_owner_stories.md) (mirror drafts the owner's stories for letters; the same draft-then-review pattern, separate surface) · [P1574](p1574_canvas_partner_story_requests.md) (a partner's reason for a canvas change; never a story in their name) · [P1656](p1656_point_story_scores_visible.md) (story-ness scores, not built here) · [P1621](done/2026-06-10/p1621_canvas_draft_actions_redesign.md) and [P1536](done/2026-06-10/p1536_canvas_first_draft_from_owner_material.md) (adding a story by hand on the canvas; the kept-point rule) · `docs/story-point-model.md` (Story, "Recount vs reveal", "What verify means here")
