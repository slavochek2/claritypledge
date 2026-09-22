---
status: in-progress
type: task
rank: 13
workstream: infrastructure
created_date: '2026-09-22'
tags: [skills, points-pipeline, selection, events]
disclosure: public
delivery_stage: dev
pipeline_ran: [create-spec, dev]
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
   (Non-Goals) and was asked again; the translation rule in the same line was contradicted. The
   30-per-query sweep was documented in `select.md` Phase 2, yet only 6 to 8 results per query were
   taken. Nothing makes an agent read the standing rules before it starts, and **nothing in code
   enforces them**: `candidate-sweep.mjs` accepts a searched list of any length and checks no
   language field.
2. **The rule never existed (most items).** Event intention; professional meaning vs a jobs forecast;
   AI voices plus older thinkers; the audience floor (100k views, not 2,000); ≥5 minutes on topic;
   AI voices ≤2 years old; room constraints held somewhere the pipeline reads; lived-experience
   voices; points built from the page's own frame; banner design for the fixed-height slot.
3. **The event template fell behind what the founder approved.** `clarity-night-publish.md` still
   lists a Where section, "What makes a Clarity Night different", "five or six" agenda steps, a
   generator-only banner, and "all six sections". Its "why in the room" input line (`:88`,
   8cdad533d) exists, but the run file has no field for it.

> Founder, verbatim: *"improve our disagreement pipeline so I don't have to repeat myself next time."*
> And earlier in the run: *"I can see that it's a pattern that you're repeating this. So you didn't
> load the context"*.

**Question:** Which rules become code the pipeline already runs, which stay prose, and how do the
event page and banner come out right the first time?

## Appetite

- **Blast radius:** medium. It covers every future disagreement run and every Clarity Night page.
  It changes three existing `scripts/points/` predicates and adds two; product code and the database
  are untouched.
- **Reversibility:** high: `git revert`. The scripts are pure functions with fixtures.
- **Decision density:** low. The founder delegated the defaults (*"i trust you"*). Two items are
  marked `[FOUNDER DECISION]` because the review showed they are real trade-offs.

## Decided (do not re-ask)

The founder's words are from the 2026-09-22 session.

| # | Rule | Founder |
|---|---|---|
| 1 | English-only sources for now; a translation is labelled, never shown as the speaker's own words | *"english onliy for now ok approved"* |
| 2 | One video per person per event. Topic fit decides, popularity balances | *"one vidoe per person per evnet yes… it should reocmmend befirst topic fit and balance with popularity"* |
| 3 | AI voices within the last 2 years; for a living person, prefer their newer view | *"we should not accept any video that is longer than, I don't know, one, two years… for this topic, but also for future topics"* · *"better nwer vidoe… becuase ai is closer to what he believes now"* |
| 4 | ≥100,000 views and ≥50 comments, with named exceptions | *"less than 100,000 views, maybe we shouldn't consider the video… Maybe with some exceptions"* |
| 5 | Minutes on topic, never total length | Founder asked whether a 15-minute total rule made sense (*"or the rule doenst make snese?"*) and accepted minutes-on-topic instead. The 5-minute figure is the agent's; see Open Questions |
| 6 | "AI + X" topics: AI voices plus older thinkers on the unresolved X debate | *"ai plus older htinkers yes"* |
| 7 | The topic concerns the room's own (professional) meaning, not a jobs forecast | *"the topic is what ai does to meaning of participants specifically"* · *"is it menaing event or jobs event?… its different event"* |
| 8 | Lived-experience voices are admissible when famous names do not argue a side; they stay out of the title and banner and are listed last | *"maybe thats the point? 1m poeople watched him"* · *"on banner we dont need his face? and we dont need him in the titlee?"* · *"[the developer] is last in the list"* |
| 9 | Never change the banner height; design the banner for the fixed slot | *"i dont thik we should paly with hight… otherwise the evnet description not visible"* |

## Invariants

- **Phase 0 still runs before ANY search**, and a `CONSENSUS` verdict still stops the run with zero
  searches (P1171; decisions.md 2026-08-28 [process], "A search that keeps failing").
- **Floors are never relaxed to manufacture a disagreement** (same entry). An exception is a
  per-arguer `override` **inside the sealed approvals block**, with an enumerated reason. It is never
  a header field that can be edited after Gate 2.
- **A stance is read from the transcript, never from a title** (decisions.md 2026-08-25 [product],
  "YouTube search matches words, not stances"). S4 changes *when* videos are searched, not this.
- **Speaker attribution comes before any per-speaker measurement.** On a multi-speaker source, minutes
  and claim match are counted on speaker-labelled turns only (`select.md` Ranking Axes, "Measure
  claim match… on the ARGUER'S OWN WORDS").
- **No gate is removed or merged.** Every existing founder gate still halts.
- **The run file stays at `.private/points-runs/<slug>.md`.** 9 skills, 1 script (`redact-run.mjs`)
  and the seal paths read that path.

## Solution

### Part 1: standing rules become code the pipeline already runs (closes cause 1)

**Honest limit, stated first:** no check can observe an agent *reading* a rule. What code can do is
refuse the *outputs* a run must produce when those outputs violate a rule. That is the design here:
every rule that has a measurable form is moved into a predicate that a gate cannot pass without.

- **C1. `scripts/points/standing-rules.json`**: the single machine source for the floors (views,
  comments), recency (years, by voice class), minimum on-topic minutes, language, and results per
  query. Scripts read it. `select.md` names it and does not restate the numbers (one fact, one home).
- **C2. `candidate-sweep.mjs` extended:**
  - each candidate carries `voice: ai | classic | lived`, and recency is applied per class
    (`classic` exempt);
  - `language` must be `en`;
  - each query's searched list must hold ≥30 ids, or the recorded count the search returned when it
    was fewer;
  - floors and recency are read from C1 when the input omits them.
  - Must-fail fixtures: an AI voice older than 2 years, a non-English source, a 7-id query, and one
    mixed field where a stale AI voice fails and an old classic passes.
- **C3. New `on-topic-minutes.mjs`.** Inputs: the arguer's speaker-labelled turns (a Step 2c diarize
  JSON, or a single-speaker VTT), the proposed on-topic ranges, and the position's `source-binding`
  terms. Output: the seconds of the **arguer's own speech** that fall inside ranges which contain at
  least one term hit. A multi-speaker source without labels is `REFUSE`, never counted. This replaces
  eyeballed minutes: this run recorded 7, 3 and 1.5 minutes for one source, and 12 vs 3 for another.
- **C4. New `run-file-check.mjs`**, run before the seal in select Phase 5. It refuses an approvals
  block where any arguer lacks `voice`, `why_in_the_room`, `on_topic_seconds` (from C3), `upload_date`
  or `language`, or is below a floor without an `override`.
- **C5. `audience-floor.mjs`** keeps reading the per-arguer `override`. `redact-run.mjs` stops
  defaulting a missing `audience_floor` to 0 and refuses instead.
- **C6.** Every new or changed predicate is registered in `verify-all.mjs` with must-pass and must-fail
  controls. Its coverage check already fails on an unregistered module.

Rules with no measurable form stay prose, gathered in **one "Standing rules" section at the top of
`select.md`**, which Gate 1's header prints. That covers one video per person, AI + older thinkers,
the room's-own-lives framing, lived-experience voices, room constraints and the translation label.
`run-pipeline.md` points to that section and does not copy it (its own "restates none of it" contract).

### Part 2: `select.md` (cause 2)

- **S2. Inputs:**
  - a new **event intention** input (who the evening is for, what it tests, its frame);
  - room constraints read from a new private `constraints` field in the audience registry. An overlay
    room inherits its base room's constraints.
  - Constraints govern **the topic, the page's framing and every quoted passage**. They never
    exclude a source. A source qualifies if its on-topic minutes clear the floor *outside* its
    sensitive passages, which are listed with timecodes and never quoted. (This run's judge flagged
    three sources the founder kept; one source's only on-topic quote sat inside a sensitive analogy
    and was dropped. Both outcomes follow from this rule.)
- **S3. Phase 0:**
  - For an "AI + X" topic, list the positions on X, with AI voices as the current lens.
  - Write the fork about the room's own lives.
  - A fork is a forecast, and goes to the topic backlog as a different event, when it names a
    quantity that data at a future date would settle (for example "jobs will exist in 2030").
  - Phase 0's enumeration runs in a fresh agent context whose input is only the topic, the room and
    the event intention (never the founder's corpus or preferences), and which must list positions
    the founder is likely to dislike. Its input list is printed.
  - A seed from the topic backlog is checked against the fork before Gate 1.
- **S4. Videos are screened before Gate 1, in two tracks.** This overturns, in writing, part of two
  rulings. **decisions.md 2026-08-27 [process]** said Gate 1 sits before any video search because
  that search is the spend Phase 0 protects. **decisions.md 2026-08-25 [product]** rejected
  discovering people via YouTube search. In this run the founder could not judge people without
  their videos (*"open all options in youtube"*, 5 times) and asked to widen cheaply (*"widen enough
  to make ti nice and also token aefficient"*).
  - **Track A, named people (compatible with 2026-08-25):** after Phase 0 and Phase 1's
    transcript-first counterpart hypotheses (DW-7 unchanged: no counterpart search before the
    hypothesis), search each named person's name plus the topic:
    - `ytsearch30:<q>` and the same query sorted by views (`results?search_query=<q>&sp=CAM%253D`);
    - run the sweep (C2);
    - fetch captions for survivors only;
    - pre-screen with `delegate-gemini`.
  - **Track B, lived-experience discovery (amends 2026-08-25):** run topic queries only for a
    position where no named person's video argues it for the minimum time. The stance is decided from
    the transcript, never the title, which removes the reason 2026-08-25 gave.
  - **What Gemini may decide:** only which candidates are worth a closer look, plus proposed on-topic
    ranges and quotes. Minutes come from C3. Quotes are `grep -F`-verified, with a planted fake as a
    control. The stance shown at Gate 1 is written by the orchestrator from the quoted passages.
    `run-pipeline.md` "Never delegate" gains that sentence.
  - Gate 1's halt sentence changes from "before searching for any video" to "before any source is
    approved or fetched as audio". `rule-present` keys are updated to the new wording.
  - **Cost:** caption fetches for sweep survivors only. Exit 7 (proxy quota) keeps its existing stop
    rule.
- **S5. Ranking.**
  - The **floors** are rules 1, 3 and 4 plus the minutes from C3.
  - **Ranking** is topic fit (C3 seconds) and argument quality, as today (`select.md` "Insight…
    decides the ranking").
  - **Tiebreaks:** popularity, then newer upload for a living person, then how the video looks
    (storyboard frames).
  - Views stay a floor, never a ranking axis. The recording date is checked when the upload is a
    re-upload.
- **S6. Lived-experience voices** are used when famous names **do not argue a side**, meaning their
  videos fail the minutes rule. Clearing the view floor is not the test: this run's famous name
  cleared 1.55M views and still failed on topic.
- **S7. Gate 1 and Gate 2 presentation:**
  - per person, a "unique perspective in the room" line, which becomes `why_in_the_room`;
  - a balance table on the evening's own question;
  - candidate videos opened in Chrome in table order.
- **S8. Judge before the page.** `[FOUNDER DECISION: run the Phase 3 judge before any title, banner
  or page draft uses the cast?]` In this run the banner was rebuilt 5 times and the title 3 times
  after the judge removed an arguer. It is the author's proposal and is not adopted without a yes.
- **S9. Gate 2 candidate points are built from the frame the page will show.** A point that
  contradicts the page's own definition is rejected. Founder: *"this makes no snese because ikigai
  part is geting paid"*.
- **Overrides**, one per arguer inside the seal, carry one reason from a fixed list:
  - `recognisable-figure-low-video-reach`;
  - `only-source-arguing-position`;
  - `founder-named: <verbatim>`.

### Part 3: `clarity-night-publish.md` (cause 3)

- **P1. Draft mode, with its own input contract.** It is allowed after select Gate 2, on TEST only.
  - It needs the approved cast with `why_in_the_room`, the planned tag (used for `/stake/<tag>`
    links, which stay unchecked until publish), the date, the venue and the run of show.
  - It does **not** need a live tag, points or stories. The existing PROD path keeps its "tag live on
    prod" precondition.
  - "All six sections" becomes the named list in P3.
- **P2. Title:** `Clarity Night #<N>: <Topic>. <names>`, with only names a stranger would recognise.
  The test is having an English Wikipedia article; lived-experience voices are never named in the
  title. The ending stays open.
- **P3. Section order:**
  - a one-sentence opening, which is also the link preview;
  - Why now, with the explainer image;
  - Who is in the room;
  - Agenda;
  - How Clarity Nights are different: ≤3 sentences, ending with a plain link to the community;
  - Optional preparation, with the recording line;
  - Sources.

  **No Where section.** Rule 11 is rewritten as a check that the header location link opens the
  single venue pin, and the "**Where:**" rule text is removed, not only the section-order line.
- **P4. Who is in the room** is built from `why_in_the_room`:
  - recognisable people first, lived-experience voices last;
  - the video links are swapped to each agent's story after publish;
  - never an HTML comment in the text.
- **P5. Rule 12, Agenda:** this night's run of show is asked as an input and never copied from the
  previous night. Counts are approximate, the demo volunteer is not described, and the closing step
  uses the founder's words.
- **P6. Banner, replacing Step 6.3's generator-only text:**
  - an illustrated line-up of the recognisable arguers, never photoreal;
  - names rendered as HTML text from a committed template, `scripts/events/lineup-banner.html`,
    screenshotted in a browser rather than drawn by the image model;
  - an accurate motif;
  - everything in one flat row inside the middle band of the fixed-height slot;
  - **never change the banner height**;
  - checked on the real page at 320, 375, ~1500 and 1920 px;
  - uploaded through the existing custom-banner route (storage upload plus a `banner_url` PATCH, as
    `publish-run.md` 8b does), in the event's own environment, and on the TEST page before review;
  - a phone variant follows P1354.

### Part 4: `docs/points-process.md`

- **D1. Schema:**
  - `audience_floor` defaults to C1's values and becomes mandatory.
  - Per arguer: `voice`, `why_in_the_room`, `on_topic_seconds`, `on_topic_ranges`, `language`,
    `upload_date`, `recorded_date` (optional), `sensitive_passages`, and `override` with its reason.
  - Header: `event_intention`, `event_folder`.
  - Every consumer is updated: `audience-floor.mjs`, `redact-run.mjs`, `run-scoring.mjs`,
    `candidate-sweep.mjs` and the new C3 and C4.
- **D2.** Step 1 text describes the two-track screen and points to C1 and select's Standing rules.
- **D3.** File locations: from the next event on, event-level files (page text, handoff, prep notes,
  results, improvements) live in `.private/events/<city>-<topic>-<YYYY-MM-DD>/`, with a README linking
  the run file and the campaign folder. **Existing events are not migrated**, and event #2's files
  stay where they are, because the pending pipeline session reads them by their current paths.

### Part 5: `run-pipeline.md`

- **R1.** Inputs: the event intention and the event folder.
- **R2.** The announcement points to select's Standing rules and to C1, without copying either.
- **R3.** The fan-out question says plainly that it runs only after videos are approved (*"Wait,
  what? So we have one video…"*).
- **R4.** After select Gate 2, a TEST draft through clarity-night-publish's draft mode (P1) is
  allowed. PROD stays a separate invocation.
- **R5.** Each founder clarification made during a run is appended to `improvements.md` in the event
  folder.
- **R6.** "Never delegate" gains the S4 sentence: delegated screening proposes; stance and minutes
  shown at a gate are re-derived.

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| The 100k floor puts known-good sources behind an override: replaying event #1's founder-approved cast, 2 of 4 sources are under 100k (79,388 and 8,927 views) | MITIGATE | The enumerated override `recognisable-figure-low-video-reach` covers both. The replay fixture (Done-When) pins this. Whether 100k is the right universal default is an Open Question |
| A short, complete on-fork clip fails the minutes floor | ACCEPT | The founder chose minutes on topic over total length; `founder-named` override exists |
| The two-track screen reopens stance-blind discovery | MITIGATE | Track B only for positions with no named voice arguing on topic, and stance from transcript only |
| Standing rules still in prose are skipped | ACCEPT | Everything measurable moved to C1–C4. The rest is prose with a printed header, and that limit is stated rather than hidden |
| Tightening `candidate-sweep` breaks an existing sweep invocation (7c) | MITIGATE | Run event #1's recorded sweep input through the new version before shipping; it must still return its recorded verdict or differ only on the new named checks |
| The recording date is unknowable for most uploads | ACCEPT | Optional field; checked only for obvious re-uploads |

**Non-Goals**
- Do NOT change product code, the database schema, or the banner component (P1354 owns the phone
  banner; P1353 was rejected).
- Do NOT implement multi-source evidence per arguer or arguers with no video (P1350).
- Do NOT change `story-draft.md` (the quote cap is an open question).
- Do NOT migrate existing event files or rename `.private/points-runs/`.
- Do NOT write room-constraint values or audience keys into any public file.
- Do NOT decide the pending event #2 page questions (listed under Open Questions).

## Done-When

- [x] `node scripts/points/verify-all.mjs` passes with C2, C3 and C4 registered. Each must-fail
      fixture (stale AI voice, non-English source, 7-id query, unlabelled multi-speaker minutes, run
      file missing `why_in_the_room`, below-floor arguer without override) fails, and each must-pass
      fixture passes
      — *Evidence: `PASS — 19 predicate(s)`, `on-topic-minutes.mjs CLEARS / REFUSE`,
      `run-file-check.mjs SEALABLE / REFUSE`, coverage OK. The six must-fails are pinned in
      `src/tests/p1210-p1355-standing-rules.test.ts` (37 tests). Full suite: 4514 passed.*
- [x] **Replay control:** event #1's and event #2's recorded sources, run through C2 and C4 with
      C1's values, produce the expected list. Event #1: 2 sources admitted, 2 needing a
      `recognisable-figure-low-video-reach` override. Event #2: the rejected famous-name source
      rejected on minutes, the older thinker admitted despite a 2022 upload. The replay output is
      pasted into this spec — *see "Replay output" below; pinned as a test.*
- [x] C3 run on the event #2 source that recorded three different minute counts returns one
      reproducible number, and a second run returns the same number
      — *Evidence: the stored diarization (two windows, Harari = `spk:0` in both, sensitive passage
      36:50-40:30 subtracted) returns `92.6s (1.5 min)`, exit 1, on both runs. Without the sensitive
      subtraction: 224.7s, still below 300s. The three eyeballed counts were 7, 3 and 1.5 minutes.*
- [x] Event #1's recorded sweep input returns its recorded verdict under the new `candidate-sweep.mjs`,
      or differs only on a named new check
      — *Honest scope: the raw 261-candidate sweep input was never persisted (`grep -rl '"searched"'`
      over `.private/` and the scratch dirs returns nothing). The run file records the verdict
      (FIELD-NON-EMPTY per position) and the four selected sources' metrics. Replaying those four
      through the new sweep differs from the recorded verdict only on the named new floor
      (views < 100000, standing-rules.json): Bengio's and Sanders' sources are rejected, and the
      override path in C4 admits them. The committed must-pass fixture (the 2026-09-04 run's input)
      returns its recorded FIELD-NON-EMPTY unchanged.*
- [x] `rule-present.mjs` exits 0 with the updated Gate 1 wording, and exits non-zero on a copy of
      the **real** `select.md` with the Standing rules section deleted
      — *Evidence: `P1355 standing-rules: RESOLVE — 4 rule(s)`, exit 0. The mutation test deletes the
      section from a temp copy of the real file and gets `REJECT` (gate 7d); the generated stripped
      fixture also REJECTs.*
- [x] A TEST draft through clarity-night-publish's draft mode renders with the P3 section order and
      no Where section, checked on the real page at 375 px and desktop
      — *Evidence, with its limit: checked against the Clarity Night #2 TEST page (the page this flow
      produced), not a fresh draft-mode insert — a new TEST event row needs the founder's ok. Read
      from TEST: headings `Why now · Who is in the room · Agenda · How Clarity Nights are different ·
      Optional preparation · Sources`, 0 "Where". Rendered on a w5 dev server at a confirmed
      `innerWidth` 375 and at 1440: same order, no horizontal overflow. Still open on that page (event
      #2 question, not this spec's): the opening is three sentences, not one.*
- [x] Skills re-synced (`scripts/sync-agent-skills.sh`) and its check passes
      — *Evidence: `--check: OK — 127 skills in sync, 0 collisions, 0 drift`.*
- [x] decisions.md records the partial overturning of the 2026-08-25 and 2026-08-27 rulings (via `/kdd`)
      — *Evidence: `docs/decisions.md` 2026-09-22 [process], "Videos are screened before Gate 1, in two tracks", and 2026-09-22 [technical], "Standing rules live in one JSON the gates read".*

### Replay output (2026-09-22, `src/tests/p1210-p1355-standing-rules.test.ts`)

```
[replay event #1, C2]
FIELD-NON-EMPTY — 2 of 4 candidate(s) clear the floors, the recency line for their voice, and the language rule.
    ADMIT  MWMe7yjPYpE [ai]
    ADMIT  rf2KFVcKQdQ [ai]
    reject _-CuF1likvw [ai]: views 79388 < 100000
    reject hqx4zk54Q6g [ai]: views 8927 < 100000
[replay event #1, C4 without overrides]
REFUSE — 2 of 4 arguer(s) break a standing rule. Do not seal.
    position 2 (Yoshua Bengio): REFUSE — views 79388 < 100000 and no override covers it
    position 4 (Bernie Sanders): REFUSE — views 8927 < 100000 and no override covers it
[replay event #1, C4 with overrides]
SEALABLE — both lifted by override "recognisable-figure-low-video-reach"
[replay event #2, C2]
FIELD-NON-EMPTY — 2 of 2: ADMIT FNZhxTtOL-I [ai], ADMIT dx4yW0mjezw [classic] (2022 upload)
[replay event #2, C4]
REFUSE — position 1 (Yuval Noah Harari): on topic 92.6s < 300s and no override covers it
         position 2 (Alan Watts): ok
```

Event #1 recorded no on-topic minutes, so its C4 rows use a 600s stand-in to isolate the floors.
Watts' 840s is the recorded single-speaker estimate (the whole lecture), not a C3 measurement.

## Implementation notes (2026-09-22)

- **Contract change in `candidate-sweep.mjs`:** input is now `queries: [{query, requested, ids}]`
  (each requesting >= 30), and candidates carry `voice` and `language`. Omitted floors are read from
  `standing-rules.json` and named in the verdict, where they used to be a REFUSE. The existing
  p1210 sweep tests were updated for this new contract (inputs reshaped; the "no floors → REFUSE"
  assertion became "no floors → standing-rules.json, named"); every other assertion is unchanged.
- **C3 bug found by its own fixture:** merging touching ranges let an off-topic range borrow its
  neighbour's term hit. Ranges are now judged one at a time and only the counted speech is unioned.
- **C3 takes `sensitive` passages** and subtracts them (S2: qualify on minutes outside them).
- **Override coverage is data** (`override_covers` in the JSON): the low-reach reason lifts views and
  comments only; `only-source-arguing-position` also lifts minutes; `founder-named` also lifts
  recency. Language is never overridable.
- **`audience-floor.mjs` unchanged** (C5 "keeps reading"); enum validation happens once, at the seal.
- **Room constraints:** a `constraints` field was added to the private audience registry for the
  Chiang Mai base room, marked DRAFT for the founder to confirm.
- **Banner template:** `scripts/events/lineup-banner.html`, generalised from the Clarity Night #2 v5
  banner; rendered with that banner's data it reproduces it.
- **S8 not adopted** — still the founder decision in Open Question 2.

## Implementation review record (2026-09-22)

Adversarial review of commit `41b0bfe78`, **3 of 3 reported**, all FIX-FIRST or REJECT:
- Gemini `gemini-3.8-flash` (verified as served), text only: 6 findings;
- Opus subagent, with the private run files and live probes: 2 HIGH, 9 MEDIUM;
- Codex `gpt-5.6-sol` at high effort (accepted-only, not verified as served), with probes: 6 HIGH, 5 MEDIUM.

Each finding was re-run by command before it was acted on. Fixed:
- **C3 counted a whole range once any turn in it hit** (Opus H1; confirmed: Harari 92.6s → 353.9s
  with whole-window ranges and the term "AI"). A turn now counts only if it hits, or lies within
  `on_topic_context_seconds` of a hit. Terms under 3 letters are refused, and so are several labels
  without `mapping_evidence`. `minSeconds` can only raise the floor. Harari with whole-window ranges
  now measures 176.6s: the verdict no longer depends on who draws the ranges.
- **C4 trusted a typed `on_topic_seconds`** (Opus H2, Codex 6). Each arguer now names its
  `on_topic_input`; the CLI re-runs C3 on it and refuses a mismatch or a basis that contradicts
  `gate_0_basis`. Checked end to end on the real Harari input: 92.6 seals, a typed 400 is refused.
- **Standard weakening** (Opus M8, Codex 4): a supplied floor or recency line can only be stricter.
- **Impossible dates** (Codex 3): `ymd` now round-trips a real calendar date.
- **Missing `voice`** (Codex 2): always unknown, per C2's "every candidate carries voice".
- **Malformed or padded query records** crashed or passed (Codex 7, 1): now REFUSE.
- **`arguers:` with the schema's trailing comment** parsed to zero arguers (Gemini 1, Opus M6).
- **`language: NA`** read as "not English" (Gemini 3 refuted as stated — `yt` returns `en`/`en-US` —
  but the unset case is real): now "not reported".
- **`$DIARIZE_STORE` crashed the C3 CLI** (Gemini 5): variables are expanded, an unset one is named.
- **Banner overflowed at 6 arguers** (Gemini 4): columns scale with N; sprite crops scale with them.
- **Gate 1 asked for measured minutes that need audio** (Gemini 2, Opus M1): multi-speaker sources
  show `PROVISIONAL (unmeasured)` at Gate 1 and are measured after approval.
- **Relabel and override lifts** (Opus M4, M5): `classic` needs `classic_basis`; `founder-named`
  needs at least three quoted words, and every override is its own Gate 2 acknowledgement.
- **Rule 2 unchecked** (Opus LOW): C4 refuses two arguers sharing a name, subject_key or video.
- **`turn-verified` had no path through C3** (Opus M3): select.md says to measure on diarization.
- **Unbounded views-sorted search** (Opus M7): `--playlist-end 30`.
- **Stale ordering prose** (Opus M9, Codex 9): points-process Gate 1 line and select's description.
- **rule-present checked 4 phrases** (Codex 8): now one anchored row per numbered standing rule (13).
- **Draft mode had no TEST banner** (Codex 11): banner is built in Step 4, before review.

Accepted, with reasons:
- **`requested` is self-declared** (Codex 1, Opus LOW): a record that confesses fewer than 30 is
  refused, and duplicate padding is refused, but a hand-trimmed id file cannot be detected by a
  predicate that only sees the record. select.md says so and says never to edit the files.
- **Recency date from the agent-written `gate_2_approved_at`** (Opus LOW): now a real date, not
  clamped to today, because replays of past runs must use their own date.
- **`founder-named` words cannot be proven to be the founder's** — the run file is agent-written; the
  separate Gate 2 acknowledgement is the control.
- **Replay minutes** (Codex 10): event #1's 600s and Watts' 840s are labelled stand-ins; the replay
  pins floors, recency and the minutes floor. Harari's 92.6s is the only real C3 number in it.
- **Draft-mode Done-When** (Codex 11): verified on the existing TEST page, not a fresh insert
  (a new TEST row needs the founder's ok) — stated on the Done-When line.
- `redact-run.mjs` shares the old `^arguers:\s*$` pattern; it only reads the run-B file, which has
  no comment on that line, so it is left as is.

## Alternatives Considered

- **Keep people-first, with no video search before Gate 1.** Rejected on this run's evidence: the
  founder could not judge people without videos. Track A keeps 2026-08-25's reasoning intact (a name
  is a token).
- **A mandatory dispatcher that owns every step and writes a ruleset-hash ledger (Codex review).**
  Rejected for now. It replaces the markdown pipeline with an executable one, which is a larger change
  than this failure warrants. C1–C4 put the measurable rules at the tools the gates already run.
  Revisit if prose rules are skipped again.
- **Position-level evidence tiers instead of a global reach floor (Codex review).** Rejected: the
  founder stated a numeric floor with exceptions, and the enumerated overrides give the escape
  without a second scoring system.
- **Wikipedia pageviews as the "recognisable" test (Gemini review).** Rejected: it needs an extra
  API call per name, and having an English Wikipedia article is a sufficient binary.
- **Rename `points-runs/` to `events/`.** Rejected because of the dependents listed in Invariants.

## Rollback Strategy

`git revert` of the skill, doc and script commits. The audience-registry field is additive and
ignored by readers that do not know it.

## Open Questions

1. `[FOUNDER DECISION]` **Is 100k views the default for every run?** Event #1's approved cast would
   need 2 overrides out of 4. The alternative is 100k for open-room events only.
2. `[FOUNDER DECISION]` **S8: run the judge before the title, banner or page uses the cast?**
3. **Is 5 minutes the right minutes floor?** The founder accepted minutes-on-topic but did not pick
   the number.
4. **Story quote cap:** max 5 quotes per story? Founder: *"maybe we need to limit to max 5 qutoes?
   there are some that have 7!"* It belongs to `story-draft.md`.
5. For the pipeline session, not this spec:
   - the title ending;
   - the rule wording ("you cannot keep disagreeing…");
   - whether to link the principle to /meet;
   - the one-sentence opening.

## Review record

Adversarial review 2026-09-22, **3 of 3 reported**, all REJECT on the first draft:
- Opus, with the private run files, 13 findings;
- Codex `gpt-5.6-sol` at high effort (model accepted-only, not verified as served), 7 findings;
- Gemini `gemini-3.8-flash` (verified as served), 7 findings.

Findings verified by command before adoption:
- event #1's view counts;
- the 2026-08-25 ruling text;
- `audience-floor.mjs`'s per-source `override`;
- `redact-run.mjs`'s zero default;
- `candidate-sweep.mjs`'s single `recencyFloor`;
- DW-7's regex in `rule-present.mjs`;
- `clarity-night-publish.md:88` already naming "why in the room" (the first draft's "0 hits" was a
  broken grep).

Not adopted, with reasons:
- the dispatcher, evidence tiers and Wikipedia pageviews (see Alternatives);
- Gemini's claim that disabled comments are a new `REFUSE` trap: that is existing, deliberate
  behaviour ("never measured ≠ failed");
- Gemini's snake_case vs camelCase finding: it compares the run-file YAML with the sweep input,
  which are different files.

## Related

- P1171: select Phase 0
- P1350: multi-source evidence (out of scope)
- P1352: description images
- P1354: phone banner
- P1353: banner height (rejected, archived)
- P1336: registration survey
- decisions.md:
  - 2026-08-25 [product], "YouTube search matches words, not stances"
  - 2026-08-27 [process], "Before adding a founder halt"
  - 2026-08-28 [process], "A search that keeps failing"
