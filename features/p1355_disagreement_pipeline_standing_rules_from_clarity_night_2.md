---
status: week
type: task
rank: 13
workstream: infrastructure
created_date: '2026-09-22'
tags: [skills, points-pipeline, selection, events]
disclosure: public
delivery_stage: create-spec
pipeline_ran: [create-spec]
drafted_by: opus
exec_model: opus
exec_effort: xhigh
driver: anomaly
---

# P1355: The disagreement pipeline learns what the founder had to repeat during Clarity Night #2

## Problem

**Situation:** The Clarity Night #2 run ("AI and your ikigai: threat or opportunity?", 2026-09-22) went
through `select` into a drafted event page and banner. Along the way the founder had to correct,
clarify or decide **34 things** the pipeline should have known. The reflection that listed them read
both halves of the session transcript (before and after one compaction), the run's handoff file and
its Gate 2 packet.

**Complication:** They fall into three causes, and only one of them is "a rule was missing":
1. **The rule existed and was not loaded (4 items).** English-only sat at the end of `select.md`
   (Non-Goals) and was asked again. The translation rule sat in the same line and was contradicted.
   The 30-per-query sweep was documented at `select.md` Phase 2 and skipped, with 6 to 8 results
   taken instead. Nothing makes an agent read the standing rules before it starts.
2. **The rule never existed (most items).** Event intention; professional meaning vs a jobs forecast;
   AI voices plus older thinkers; the audience floor (100k views, not 2,000); ≥5 minutes on topic;
   AI voices ≤2 years old; room constraints (no politics or religion in Thailand) held anywhere the
   pipeline reads; lived-experience voices; a per-person "why in the room" line (0 hits across the
   pipeline); points built from the page's own frame; banner design for the fixed-height slot.
3. **The event template fell behind what the founder approved.** `clarity-night-publish.md` still
   lists a Where section, "What makes a Clarity Night different", "five or six" agenda steps, and a
   generator-only banner.

The event's files are also spread across four places: `points-runs/`, `docs/events/<tag>-prep/`,
`campaigns/` and a results file, all under `.private/`.

> Founder, verbatim: *"improve our disagreement pipeline so I don't have to repeat myself next time."*
> And earlier in the run: *"I can see that it's a pattern that you're repeating this. So you didn't
> load the context"*.

**Question:** Which rules go where, so that the next run loads them before its first search, and so
that the event page and banner come out right the first time?

## Appetite

- **Blast radius:** medium. It covers every future disagreement run and every Clarity Night page, and
  touches no product code or schema. The run file is a gitignored markdown file.
- **Reversibility:** high. Everything is prose skill and doc edits plus one private JSON field, each
  reverted with `git revert`.
- **Decision density:** low. The founder said *"i trust you"* on the four defaults below, and the
  open items are listed as open questions.

## Decided (do not re-ask)

The founder's words are from the 2026-09-22 session.

| # | Rule | Founder |
|---|---|---|
| 1 | English-only sources for now; a translation is labelled, never shown as the speaker's own words | *"english onliy for now ok approved"* |
| 2 | One video per person per event. The winner is topic fit first, then popularity, then fit with the other arguers | *"one vidoe per person per evnet yes… it should reocmmend befirst topic fit and balance with popularity"* |
| 3 | AI voices within the last 2 years; a living person's newest qualifying video | *"we should not accept any video that is longer than, I don't know, one, two years… for this topic, but also for future topics"* |
| 4 | ≥100,000 views and ≥50 comments, with named exceptions | *"less than 100,000 views, maybe we shouldn't consider the video… Maybe with some exceptions"* |
| 5 | ≥5 minutes on topic, never total length | Founder asked about a 15-minute total ("or the rule doenst make snese?"). The 5-minutes-on-topic rule was tested on 5 known videos and got every one right; accepted |
| 6 | "AI + X" topics: AI voices plus older thinkers on the unresolved X debate | *"ai plus older htinkers yes"* |
| 7 | The topic concerns the room's own (professional) meaning, not a jobs forecast | *"its not menaign in tgeneral - the topic is what ai does to meaning of participants specifically"* · *"is it menaing event or jobs event?… its different event"* |
| 8 | Lived-experience voices are admissible when famous names do not argue a side; they stay out of the title and banner and are listed last | *"maybe thats the point? 1m poeople watched him"* · *"on banner we dont need his face? and we dont need him in the titlee?"* · *"[the developer] is last in the list"* |
| 9 | Never change the banner height; design the banner for the fixed slot | *"i dont thik we should paly with hight… otherwise the evnet description not visible"* |
| 10 | Defaults the founder delegated (*"i trust you"*): the floors in row 4 apply to **every** run; the event folder is `.private/events/<city>-<topic>-<YYYY-MM-DD>/`; `audiences.json` gains a `constraints` field | 2026-09-22 |

## Invariants

- **Phase 0 still runs before ANY search**, and a `CONSENSUS` verdict still stops the run with zero
  searches (P1171; decisions.md 2026-08-28). S4 below moves video *screening* ahead of Gate 1; it does
  not move anything ahead of Phase 0.
- **The floors are never relaxed to manufacture a disagreement** (decisions.md 2026-08-28, founder).
  An exception is a named, founder-approved line in the run file, never a silent lowering.
- **Views are a floor, never the ranking axis.** "Do NOT rank primarily on views" in `select.md`
  stays; the ranking is topic fit first.
- **No gate is removed or merged.** Every existing founder gate still halts (`run-pipeline.md`).
- **The run file stays at `.private/points-runs/<slug>.md`.** 9 skills, 1 script (`redact-run.mjs`) and the seal paths
  read it, so it is not renamed.

## Solution

Each item is tagged with the clarification numbers it closes (A1..F34 from the reflection).

### `select.md`

- **S1. A "Standing rules, read before Phase 0" section at the top**, holding rules 1 to 4 and 6 to 8
  plus room constraints, or pointing to where each lives. Gate 1's header prints the list, so the
  founder can see it was loaded. The English-only line moves here from Non-Goals, leaving a pointer
  behind.
- **S2. Inputs:** a new **event intention** input (who the evening is for, what it tests, its
  frame). Room constraints are read from `audiences.json` `constraints`, not pasted per run.
- **S3. Phase 0:**
  - For an "AI + X" topic, list the positions on X (the older debate), with AI voices as the current
    lens.
  - Write the fork about the room's own lives.
  - A fork that numbers can settle (a forecast) is a different event: record it in the topic
    backlog, not in this run.
  - The enumeration is produced by an agent **not** given the founder's corpus or favourites, which
    must include positions the founder would dislike.
  - A seed from the topic backlog is checked against the fork before Gate 1.
- **S4. A cheap wide screen before Gate 1** (the founder proposed it: *"widen enough to make ti nice
  and also token aefficient"*). After Phase 0, for each position plus lived-experience queries:
  1. run `ytsearch30:<q>` **and** the same query sorted by views
     (`results?search_query=<q>&sp=CAM%253D`, 30 results each);
  2. measure every id through `candidate-sweep.mjs` and apply the floors;
  3. pre-screen each survivor's transcript through `delegate-gemini`, returning stance, minutes on
     topic with timecode ranges, sensitive passages and 3 quotes; every quote is `grep -F`-verified,
     with one planted fake quote as a control.

  Gate 1 then shows each person **with** their best video. **This overturns part of the 2026-08-27
  ruling** ("Gate 1 already halts before any video search"). That ruling protected the cost of
  reading transcripts in full, and a flash pre-screen costs little. The new ruling is recorded in
  decisions.md when this ships.
- **S5. The Ranking Axes popularity line becomes a Selection criteria table** with rules 2 to 5, room
  constraints, and a visual check (storyboard frames). Recency applies to AI voices; older thinkers
  on the non-AI half are exempt, and the recording date is checked against the upload date. Each
  sensitive passage is listed with timecodes and never quoted. A source whose on-topic passage sits
  *inside* a sensitive frame fails.
- **S6. Lived-experience voices (rule 8):** used when no known name on a side clears the floors.
  They are identified by role on the page.
- **S7. Gate 1 and Gate 2 presentation:**
  - a per-person "unique perspective in the room" line, which becomes `why_in_the_room`;
  - a balance table on the evening's own question;
  - all candidate videos opened in Chrome in table order.
- **S8. The Phase 3 judge runs before any title, banner or page draft uses the cast.** This run
  rebuilt the banner 5 times and the title 3 times after the judge removed an arguer. This is the
  author's proposal, not the founder's words; see Open Questions.
- **S9. Gate 2 candidate points are built from the frame the page will show** (here the four ikigai
  circles). A point that contradicts the page's own definition is rejected. Founder: *"this makes no
  snese because ikigai part is geting paid"*.

### `run-pipeline.md`

- **R1.** Inputs: event intention and event folder. Room constraints come from the registry, all in
  one message.
- **R2.** Load select's Standing rules before Stage 1 and print them as one line in the announcement.
  Add a `rule-present.mjs` key so the self-check fails if the block disappears.
- **R3.** The fan-out question says plainly that it runs only after videos are approved. Founder:
  *"Wait, what? So we have one video… what am I improving specifically?"*
- **R4.** After select Gate 2 and the judge, the event page may be drafted on **TEST**. PROD stays a
  separate invocation.
- **R5.** Each founder clarification made during a run is appended to `improvements.md` in the event
  folder, so the next reflection reads a list instead of mining the transcript.

### `clarity-night-publish.md`

- **P1.** Draft mode on TEST is allowed after select Gate 2; the page is finalised after publish.
- **P2. Title:** `Clarity Night #<N>: <Topic>. <names>`. Only names a stranger would recognise, as a
  comma list. The ending stays open (see Open Questions).
- **P3. Section order:**
  - a one-sentence opening, which is also the link preview;
  - Why now, with the explainer image;
  - Who is in the room;
  - Agenda;
  - How Clarity Nights are different: ≤3 sentences, ending with a plain link to the community;
  - Optional preparation, with the recording line;
  - Sources.

  **No Where section.** Rule 11 becomes a check that the header location link opens the single
  venue pin.
- **P4. Who is in the room** is built from `why_in_the_room`:
  - recognisable people first, lived-experience voices last;
  - the video links are swapped to each agent's story on its profile after publish;
  - never an HTML comment in the description.
- **P5. Rule 12, Agenda:** this night's run of show is asked as an input and never copied from the
  previous night. Counts are approximate, the demo volunteer is not described, and the closing step
  uses the founder's words.
- **P6. Banner, replacing the generator-only text:**
  - an illustrated line-up of the recognisable arguers, never photoreal;
  - names drawn as HTML text in a browser screenshot, not by the image model;
  - an accurate motif, such as four *overlapping* circles for ikigai;
  - everything in one flat row inside the middle band that survives the fixed-height crop;
  - **never change the banner height**;
  - checked on the real page at 320, 375, ~1500 and 1920 px;
  - uploaded in the event's environment and placed on the TEST page before review;
  - a phone variant follows P1354 once it ships.

### `docs/points-process.md`

- **D1. Schema:**
  - `audience_floor` defaults to `{min_views: 100000, min_comments: 50}`, plus `floor_exceptions`.
  - Per arguer: `why_in_the_room`, `voice: thinker | lived-experience`, `on_topic_minutes`,
    `on_topic_ranges`, `recorded_date`, `sensitive_passages`.
  - Header: `event_intention`, `event_folder`, `room_constraints`.
  - Check `scripts/points/redact-run.mjs` and `run-scoring.mjs`, which parse `audience_floor`,
    against the new default.
- **D2.** Step 1 text mentions the wide screen and points to select's criteria table. The table is
  defined once, in select.
- **D3.** File locations:
  - the event folder holds the page text, handoff, prep notes, results and `improvements.md`;
  - a README in it links the run file and the campaign folder;
  - the run file stays in `points-runs/`.

### Outside the pipeline files

- `.private/audiences.json`: add `"constraints": ["no partisan politics", "no government", "no religion"]`
  to `chiang-mai-clarity-forum`. This matches the exclusion already written in the private topic
  backlog.
- `.private/INDEX.md`: list the events folder.
- Move event #2's `event.md` and `handoff.md` into its event folder, and hand the founder a corrected
  resume prompt for the pipeline session in the same step. The previous prompt named the old paths.

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| 100k floor starves positions that only have niche voices (it removed Crawford 59k, Mogi, the ikigai-specific talks) | MITIGATE | Named, founder-approved exceptions plus the lived-experience rule (S6). A position that stays unfilled is reported, never dropped |
| "≥5 min on topic" is a judgement, not a count: the agent and the judge disagreed on one source (~12 vs ~3 min) | MITIGATE | Timecode ranges are listed so the minutes can be re-derived. A disagreement over 2× is shown at Gate 2 |
| S4 spends Gemini calls on people the founder then rejects at Gate 1 | ACCEPT | Flash pre-screen is cheap, and the founder asked to widen; showing people without videos cost more founder turns in this run |
| The entry stage piles up constraints its consumers never needed (decisions.md 2026-08-28) | MITIGATE | Each new criterion here traces to a founder clarification, never to an agent's guess |
| A Standing rules block is prose, so an agent can still skip reading it | MITIGATE | R2 prints it in the announcement, and a `rule-present` key fails the self-check if it disappears. The honest limit: that proves it is *stated*, not *obeyed* |
| The moved event files break the resume prompt already given to the founder | MITIGATE | A corrected prompt is delivered in the same step as the move |

**Non-Goals**
- Do NOT change product code, the database schema, or the banner component (P1354 owns the phone
  banner; P1353 was rejected).
- Do NOT implement multi-source evidence per arguer or arguers with no video (P1350).
- Do NOT change `story-draft.md` (the quote cap is an open question).
- Do NOT rename `.private/points-runs/`.
- Do NOT decide the four pending event #2 page questions (listed under Open Questions); they belong to
  the pipeline session.

## Done-When

- [ ] `select.md` has a Standing rules section that Gate 1's header prints, and `grep` finds the
      100k floor, the 5-minute on-topic rule, the 2-year AI-voice rule, one video per person, and the
      room-constraints read in that file
- [ ] `node scripts/points/rule-present.mjs` exits 0 with the new standing-rules key, and exits
      non-zero when that block is deleted from a scratch copy (failure path watched)
- [ ] `node scripts/points/input-block-scan.mjs` and `store-inspection-scan.mjs` still exit 0
- [ ] `points-process.md` schema shows `min_views: 100000` and the new per-arguer fields; the
      `redact-run.mjs` and `run-scoring.mjs` self-tests (if present) still pass
- [ ] `clarity-night-publish.md` lists the P3 section order with no Where section, the P5 agenda rule
      and the P6 banner rule; `grep -c "Where ·"` returns 0
- [ ] `audiences.json` parses (`python3 -m json.tool`) and carries the `constraints` field
- [ ] Event #2's event folder exists with a README, and the corrected resume prompt has been given to
      the founder
- [ ] Agent skills re-synced (`sync-agent-skills.sh`) and the sync check passes
- [ ] Adversarial review by Opus, Codex and Gemini 3.8, reported as `<received> of 3`, with every
      adopted finding verified by command
- [ ] decisions.md records the S4 ruling that replaces part of 2026-08-27 (via `/kdd`)

## Alternatives Considered

- **Keep people-first (Gate 1 before any video search).** Rejected. In this run the founder asked 5
  times to "open all options in youtube" and could not judge people without their videos. The ruling
  this overturns protected expensive full-transcript reads, which S4 does not do.
- **Rename `points-runs/` to `events/`.** Rejected: 9 skills, 1 script (`redact-run.mjs`) and the seal paths depend
  on it. Keeping pipeline and event artifacts apart also keeps the run file's single-writer rule clean.
- **Put the selection criteria in `points-process.md`.** Rejected in favour of `select.md`, which is
  where they are operative. `points-process.md` carries only the schema defaults and a pointer
  (one fact, one home).

## Rollback Strategy

`git revert` of the skill and doc commits. The `audiences.json` field is additive and ignored by
readers that do not know it.

## Open Questions

1. **Story quote cap:** max 5 quotes per story? Founder: *"if text is short maybe we need to limit to
   max 5 qutoes? there are some that have 7!"* It belongs to `story-draft.md` and is not decided.
2. **S8 (judge before the page)** is the author's proposal, not a founder decision. It is reversible;
   it is adopted unless reviewed otherwise.
3. Pending event #2 page items, for the pipeline session, not this spec:
   - the title ending ("…Disagree. Where Do You Stand?");
   - the rule wording ("you cannot keep disagreeing…");
   - whether to link the principle to /meet (conflicts with rule 8's "never linked");
   - the one-sentence opening.

## Related

- P1171: select Phase 0 (its frontmatter still reads `backlog` although Phase 0 is in `select.md`;
  not touched here)
- P1350: multi-source evidence per arguer (out of scope)
- P1352: description images
- P1354: phone banner
- P1353: banner height (rejected, archived)
- P1336: registration survey fed by the run's points
- decisions.md 2026-08-27 [process] "Before adding a founder halt…", 2026-08-28 [process] "A search
  that keeps failing…"
