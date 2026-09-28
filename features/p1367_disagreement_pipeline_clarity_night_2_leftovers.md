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

**Situation:** The Clarity Night #2 run ("AI and your ikigai", run slug `ai-ikigai-2026-09-29`)
reached TEST on 2026-09-28: 6 points, 21 stories, 6 agent accounts, an event page. P1355 (standing
rules for selection, page order, event intention) and P1358 (speaker confirmation, video summaries,
model per story role) already closed most of what the founder corrected during the run. A review of
the 16 sessions behind it (2026-09-17 → 2026-09-28) found four things neither covered.

**Complication**, in order of how often the founder would hit each again:

1. **The founder's page corrections of 2026-09-28 landed on one event, not on the skill.** Between
   09:16 and 10:13 the founder rewrote the TEST page line by line. The last-corrected description is
   snapshotted at `.private/points-runs/ai-ikigai-2026-09-29.approved-page.json`
   (sha256 `cd4a519d…491a`, fetched from TEST 2026-09-28). It was never explicitly approved; the
   founder's last word on it is "ok" at 10:13, so it is the **last-corrected state**, not a signed-off
   template. Against it, `clarity-night-publish.md` is out of date in these ways (verified by reading
   both):
   - **Sections.** The page has five headings: *Why now · Agenda · Prepare for the event · How Clarity
     Nights are different · Sources*. The six people are bullets with one quote each inside *Prepare
     for the event*, closed by the one button. The skill still prescribes seven sections with "Who is
     in the room" and "Optional preparation" (line 118, repeated as "seven" at 272, 338, 377), rule 13
     ("Optional preparation … one sentence") and a three-sentence cap on "How Clarity Nights are
     different" (line 124). The page's version of that section is one nine-sentence paragraph the
     founder wrote himself (09:57).
   - **The round rule is not on the page, deliberately.** The draft said *"Before you disagree,
     explain back… They rate you out of 10"*. Founder, 09:48: *"It's not true… You cannot continue
     disagreeing if the minimum number is below 8… maybe we shouldn't talk here about mechanics"*, and
     asked for the social norm instead. The rule in force is decisions.md **2026-09-17** [product]
     (which explicitly rejected 2026-09-16's "repeat until 8+"): no disagreeing while the lower of two
     numbers is under 8, numbers only if the listener opted in. The page carries none of it (regex
     `\b8\b`: 0 hits); agenda item 1 links `/meet` instead.
   - **`/meet` is linked** as a plain italic link in agenda item 1 (founder 10:09: *"maybe okay link
     it"*; the page kept it through 10:13). The skill's rule 8 says *"never linked"* (line 195), and
     the event doc says so twice (`clarity-practice-event.md:70` and `:388`).
   - **Writing corrections the skill does not check.** No negation opener (09:36 *"Why do you start
     with negation?"*); never "we quoted them" (09:43); never imply the experts spoke about ikigai
     (09:50–09:52: *"say none of them said a word about Ikigai. That's not cool. Six well-known experts
     argue about AI work in meaning"*); the maximum sentence length cut (09:43; the page ended at a
     mean of 8.3 words, longest 17); no talk videos in Sources, because the stories carry them
     (09:44). "No product vocabulary" and "short sentences" already exist as prose (rules 8, 10) and
     were violated anyway.
   - **The run of show changed.** Trios, three rounds of 15 minutes: six minutes on one person's
     meaning, six on the other's, three for the observer; everyone rotates through speaker, listener
     and observer (founder 09:16, 10:04, 10:11). Optional dinner as the last item (10:00).
   - **The corrections were never logged where P1355 said they would be.** `run-pipeline.md:257`
     requires each founder clarification appended to `improvements.md` in the event folder;
     `.private/events/` does not exist. About twenty corrections, zero lines. This spec had to be
     rebuilt from transcripts, which is what that rule was written to end.
2. **"Next Tuesday" on a Monday has two answers, and the chosen one was never saved.** 2026-09-28
   is a Monday. The founder asked at 10:00 for "next Tuesday"; the agent resolved it to Tuesday
   6 October and said so at 10:02; the founder compacted at 10:03, and the resolution reached neither
   the handoff (it still says 18:00 to 20:30) nor any other file. At 14:16, in another session: *"date
   in localhost says 6th? not sure how it comes"*. **The date is still contradictory today:** TEST
   holds `2026-10-06T11:30Z` (Tue 6 Oct, 18:30 Bangkok, 120 min); `docs/goals.md:9` says
   *"event #2 (Tue 2026-09-29)"*; the event slug says `2026-09-29`. Separately, the PROD creator
   `scripts/create-event.ts:65-72` stamps the slug with the **creation** date (`new Date()`), so the
   date in a PROD slug never tracks the event date either.
3. **Every resume started with the founder asking where things were.** At least six times: *"what
   next what we did what now"* (09-28 08:03), *"but where is it? … open the feed"* (08:09), *"so next
   is upload or what?"* (09-24). These were open-conversation turns after compactions, not skill
   invocations. The handoff has no fixed "state" block, so even a reader who opens it gets a long log.
   CLAUDE.md's post-compaction recovery rule already asks for such a report, as prose, and did not
   fire. `run-pipeline.md:4` sends resumes to the individual stage skills, so a step added only to
   `run-pipeline` would not run either.
4. **The room format is recorded five different ways.** decisions.md 2026-09-16 and 2026-09-17:
   pairs, 10 min per point, 5 each. `clarity-practice-event.md:119`: fishbowl, and `:368` records
   "the fishbowl panel". The deck (P1338) and the on-screen journey (P1337) model pairs. The TEST page
   says trios. The trios came from the founder's redesign on 09-28, not from event #1 feedback (which
   asked for one-on-one; event #1 already ran pairs).

> Founder framing, verbatim (2026-09-28): *"reflect … what other issues we want to fix or improve so
> next run has less friction and I am more out of the loop"*.

**Question:** What makes the next Clarity Night page come out of the skill in the corrected shape,
the date unambiguous and persisted, the founder's state visible on resume without asking, and the
room format recorded once?

## Appetite

Blast radius: medium. Every future Clarity Night page and pipeline resume; skill text, one doc, two
small scripts, one change to `scripts/create-event.ts`, one session hook. No app code, no schema.
Reversibility: git revert. Decision density: none left open; the three founder calls raised by review were answered on
2026-09-28 (below).

## Invariants

- TEST and PROD stay two invocations, never one (`run-pipeline.md` hard rule).
- P1358's page-quote predicate and its enumeration requirement stay in force and are not reordered.
- The DB is the source of truth for story text after the 2026-09-28 rename. Nothing here re-publishes
  from the run file.
- A check proven only on synthetic fixtures does not count: every new check has a must-fail control
  built by **mutating the real snapshot** (epistemic gate 7d).

## Solution

### S1. The page is checked, not only described (closes 1)

- **A page check script** runs on the draft description (a file, before any DB write) and in
  Step 5, and prints its findings with an exit code that the stage pastes. It checks the things the
  founder corrected: the heading list and order; the maximum words per sentence (threshold from the
  snapshot's own longest, rounded up); forbidden strings (`we quoted`, a negation opener, the product
  terms outside the button text); no Sources entry that duplicates a person's talk video; exactly one
  `/meet` link, plain; names unlinked; exactly one pill (the button); no round-rule mechanics
  (`0-10`, `out of 10`, `8`).
- **The skill text** is brought in line: the five sections and their content rules replace the
  seven at all four sites, rule 13 and the three-sentence cap go, and rule 8 moves from "never linked"
  to "linked once, plain". The room's round rule is stated in the skill as what the room does
  (citing decisions.md 2026-09-17), explicitly **not** as page copy. Every rule is written
  generically, never as this event's text.
- **The corrections log exists before the first correction.** Draft mode creates the event folder
  and an empty `improvements.md` at its start, and every founder correction to the page is appended
  there in the same turn.

### S2. Dates are chosen, not guessed, and the choice is saved (closes 2)

- A **date resolver** takes relative input and today's date. When the input has more than one
  reading ("next Tuesday" on a Monday), it prints every candidate with weekday, date and Bangkok time
  and **blocks the write** until the founder picks one. An absolute date is echoed back the same way.
- The chosen date and time are written to the handoff's state block (S3) in the same step as the DB
  write, so a compaction cannot drop them.
- `scripts/create-event.ts` takes the date in the slug from the event's `datetime`, not the creation
  date. After that, a slug/date check runs in Step 5 and Step 6 and fails on a mismatch. The app's own
  event form (`events-service-real.ts:189`) is out of scope.

### S3. State is shown on resume, without anyone asking (closes 3)

- The handoff gets a fixed `## Now` block at the top: **done** (last completed stage and target),
  **next** (next stage and its gate), **where to see it** (URL per environment), **date** (absolute,
  from S2), **not yet on PROD**. Each stage rewrites the block when it ends.
- A **status script** reads the block for a given run (event folder first, legacy
  `.private/points-runs/<slug>.handoff.md` for old runs) and **cross-checks it against the target
  environment** (the tag's points exist where the block says; the event row's `datetime` matches the
  block's date). A mismatch is reported as stale, with a non-zero exit.
- A **session-start hook** runs the status script for any handoff changed in the last 7 days and
  prints the result, including after `/compact`. This is the mechanical form of the CLAUDE.md
  post-compaction rule, for pipeline runs.

### S4. The room format is recorded once (closes 4)

- `/kdd` records that **in-person Clarity Nights** now run trios (speaker, listener, observer;
  6 / 6 / 3 minutes, three rounds), explicitly superseding the pairs format of decisions.md
  2026-09-16 and 2026-09-17 for physical events. The reason is the founder's 09-28 redesign.
  The round rule (2026-09-17) stays in force inside each round. The same entry records the online
  format (fishbowl with an observer, no breakouts) as intended, not yet run, and the observer's
  self-rating before paraphrasing as tentative.
- `clarity-practice-event.md` gets the trio block, the recording line reworded (no "fishbowl
  panel"), the `/meet` rule scoped to "linked once on Clarity Night pages", and the stale header
  ("Zero events run") corrected.
- P1337 and P1338 each get a one-line pointer to this supersession, so the deck and the on-screen
  journey are built for trios before the night.

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| The page check encodes this event's copy (six, ikigai) as universal | MITIGATE | Run it on a draft built from event #1's material; `grep -ciE "ikigai\|six"` on that draft = 0 |
| The page check is satisfied by its own examples in the skill file | MITIGATE | Examples use placeholders; controls mutate the real snapshot (gate 7d) |
| The hook prints on every session and trains the founder to ignore it | MITIGATE | Only handoffs changed within 7 days; one block, at most 6 lines per run |
| The hook is a change to shared config (settings) | ACCEPT | Approval is part of approving this spec; `/slava:maintain:claude-md` is not needed (no CLAUDE.md edit) |
| Linking `/meet` weakens the protocol-silence reasoning (people study the principle before the room) | ACCEPT | Founder's call on 09-28, recorded as a scoped supersession so it can be reversed on evidence |
| `sync-agent-skills.sh --check` exits 0 unconditionally at its success line (366); Codex reported it printing OK after `mktemp` failures in a sandbox | DEFER | Not re-run here. Done-When reads its census line, not only its exit code; the fail-open is filed to the inbox |
| Founder-fit of cast and points (the Brett and "not meaningful for me" questions of 09-22) recurs | DEFER | P1355's event-intention input shipped that day. Falsifier: at the next Gate 2 the founder cuts or questions an arguer or point for fit, not fact. Then file a spec |

**Non-Goals**
- Do NOT change `src/index.css` or the app's event form. Plain links already exist as italic links.
- Do NOT promote anything to PROD or edit the Clarity Night #2 row. Another session owns the promote.
- Do NOT touch the select, positions or story-draft stages (P1355, P1358).
- Do NOT change the event page's RSVP or CTA (asked 10:11; separate question).

## Alternatives Considered

- **Only add prose rules to the skill.** Rejected: rules 8 and 10 already said "no product
  vocabulary" and "short sentences", and the draft broke both. P1355's `improvements.md` rule was
  never executed once.
- **Copy the corrected page into the skill as a template.** Rejected: topic-specific text would leak
  into the next event. The snapshot is a test fixture, not a template.
- **Resume step only in `run-pipeline.md`.** Rejected: that skill tells resumes to go elsewhere, and
  none of the six asks invoked it.
- **Echo the date back, no block.** Rejected: the echo happened at 10:02 and was lost three seconds
  later.

## Rollback Strategy

Skill and doc text, two scripts, one line in `scripts/create-event.ts`, one hook entry: `git revert`
of the commit, and removing the hook entry.

## Done-When

- [ ] The snapshot `.private/points-runs/ai-ikigai-2026-09-29.approved-page.json` matches the sha256
      recorded above, and the page check exits 0 on its description (output pasted)
- [ ] The page check exits non-zero on each mutation of the **real snapshot**: a sixth heading, a
      heading reordered, a 30-word sentence, "we quoted them", a negation opener, a talk video added to
      Sources, `/meet` removed, a name linked, a second pill, "rate you out of 10" (exit codes pasted)
- [ ] A draft built from event #1's material passes the page check and contains no "ikigai" or "six"
      (grep count pasted)
- [ ] `clarity-night-publish.md` has no "seven" sections left, no three-sentence cap, and rule 8
      reads "linked once, plain" (grep output pasted); `rule-present` covers the new rules
- [ ] Draft mode creates the event folder and `improvements.md` before its first founder question
      (directory listing pasted)
- [ ] The date resolver, given `--today 2026-09-28 "next Tuesday"`, prints both 29 Sep and 6 Oct and
      exits non-zero until one is picked; given an absolute date it prints weekday, date and Bangkok time
- [ ] `create-event.ts` produces a slug with the event's date for an event created a week ahead
      (run on TEST, output pasted); the slug/date check fails on `…-2026-09-29` with `datetime`
      2026-10-06 and passes on the matching pair (both exit codes pasted)
- [ ] The status script prints the `## Now` block for the ikigai run and for an event-folder run;
      it exits non-zero on a block naming a tag with no points on the named environment, and on a date
      that differs from the event row (both pasted)
- [ ] After a simulated `/compact`, the session-start hook prints the block with no prompt; with the
      block removed from the handoff, it reports the handoff as unreadable
- [ ] decisions.md records the trio format superseding 2026-09-16/17 for physical events and the
      scoped `/meet` link (via `/kdd`); `clarity-practice-event.md` has no remaining "fishbowl panel",
      "stays unlinked" or "no link to it" (grep output pasted); P1337 and P1338 carry the pointer
- [ ] Skills re-synced; `sync-agent-skills.sh --check` output pasted in full, census line included

## Decided by the founder (2026-09-28, after review)

1. **Clarity Night #2 is Tuesday 6 October 2026, 18:30 Bangkok** (what TEST holds). `docs/goals.md`
   corrected in the same commit as this answer. The `2026-09-29` in the slug and run-file names is
   now only a name; S2's resolver and check exist so the next one cannot drift.
2. **Trios are for in-person Clarity Nights.** Online events are not being organized yet; when they
   are, the format is a fishbowl with an observer and no breakouts. S4 records both, and the event
   doc stops claiming one shared run-of-show.
3. **The observer rates their own understanding before they paraphrase** (calibration), tentative:
   *"not sure if observer gives understanding scores but if they paraphrase the others then I guess
   before they do it makes sense for calibration purposes."* This belongs to P1337/P1338; S4's pointer
   carries it there. Whether the speakers also rate the observer's paraphrase is not decided.

## Adversarial review record (2026-09-28, draft 1 → this draft)

**3 of 3 reviewers delivered:** Fable (12 findings), Codex `gpt-5.6-sol` high (11), Gemini
`gemini-3.8-flash`, served model verified (5). All three: not ready / reject. Gemini did not see the
private handoff (the tool refuses private file names by design); Codex's isolated clone did not
contain it either.

Verified by command and folded in: the approved page has no "Experts who disagree" section and no
round rule (DB snapshot); the rule in force is decisions.md 2026-09-17 [product], "The round rule, final for event #1", not 2026-09-16; the
PROD slug uses the creation date (`create-event.ts:65-72`); the date was read back at 10:02 and lost
to a compaction (transcript); "open to see" → "ship" referred to P1365, not the page (transcript);
`run-pipeline.md:4` routes resumes elsewhere; `improvements.md` was never created (`.private/events`
absent); "seven" appears four times in the skill; plain links already exist (`src/index.css:434`);
the event doc forbids the `/meet` link twice (`:70`, `:388`); `docs/goals.md:9` contradicts the
TEST date.

Rejected after checking: Fable #8 (five quotes "mis-timed or unlocatable"). All five exist as founder
messages at the cited times; they consisted only of pasted text, which its search skipped.
Gemini #2 (a `/meet` link renders as a pill): false for italic links (`src/index.css:434`).
Gemini #3 (the store-inspection scan forbids reading the handoff): that scan targets `~/.local/share`
stores, not named run files.

## Related

- [P1355](done/2026-06-10/p1355_disagreement_pipeline_standing_rules_from_clarity_night_2.md),
  [P1358](done/2026-06-10/p1358_disagreement_pipeline_attribution_summaries_story_models.md)
- [P1337](p1337_event_journey_on_screen_steps_rotation_and_ending.md),
  [P1338](p1338_clarity_night_deck_cut_theory_and_run_rounds.md): must follow the trio supersession
- decisions.md 2026-09-16 and 2026-09-17 [product]: pairs rounds and the round rule
- `3221b4910`: `/night` shortlink
