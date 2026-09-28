---
status: in-progress
type: task
rank: 11
workstream: disagreement-pipeline
created_date: '2026-09-22'
tags: [disagreement-pipeline, attribution, video-summaries, story-draft]
disclosure: public
delivery_stage: dev
pipeline_ran: [create-spec, dev]
drafted_by: opus
exec_model: opus
exec_effort: high
driver: anomaly
---

# P1358: Disagreement pipeline: confirm the speaker before any page quotes them, feed video summaries, set a model per story role

## Problem

**Situation:** The Clarity Night #2 run ("AI and your ikigai", tag planned for 2026-09-29) went through
select Gate 2 across two sessions on 2026-09-22 (before and after one compaction). [P1355](done/2026-06-10/p1355_disagreement_pipeline_standing_rules_from_clarity_night_2.md)
already turned most of that run's lessons into predicates and prose: floors, recency, sweep width, the
two-track screen, `why_in_the_room`, and a reproducible minutes count (`on-topic-minutes.mjs`, C3).
This spec covers what the run showed and P1355 does not.

**Complication:** in order of harm:

1. **A quote on the TEST event page was put under the wrong person.** Naval's line *"we sacrifice
   happiness in order to be successful…"* [34:13] was said by the host, Chris Williamson. Naval's reply
   [34:33] says the opposite. How it happened:
   - The quote went onto the page from a plain `grep -F` of the captions, which proves the words exist,
     not who spoke them. That was about an hour before any diarization ran, and positions had not run.
   - The later check used one 15-minute diarization window. That window put the host's line and
     Naval's own *"Chris Williamson's book would be…"* on the **same** label (`spk:0`).
   - The check that passed it was word share ("guest holds 72–88% of the words"). Step 2c's oracle
     (do questions and answers land on different labels?) is a different test, and it was not the one
     run.
   - A fresh diarization in 5-minute windows (34:00–39:00) separated the two speakers. The founder
     approved the fix and the TEST page is corrected. Had it been published, it would have been a
     false quote under a real person's name.

   **Positions would likely not have caught it either.** `positions.md:223` says Step 4b per-quote
   confirmation is *"Skip[ped] entirely for `single-speaker` and `speaker-labelled` sources"*. A
   diarized source is `speaker-labelled`. That line dates from 2026-08-27 (`04d3f58c4`). The next day's
   ruling that created Step 2c says the opposite: *"Per-quote confirmation is **not** waived"*
   (decisions.md 2026-08-28). `positions.md:74` and `select.md` Step 2c item 5 agree with the ruling.
   Only line 223 was never updated. Also, P1355's new draft mode in `clarity-night-publish.md` makes
   "page after Gate 2, before positions" the normal order, and that skill's quote rule (rule 4,
   `grep -F`) does not look at the speaker.

2. **Video summaries have a table and a page but no writer in the pipeline.**
   - [P1349](done/2026-06-10/p1349_full_video_summary_page.md) shipped `video_summaries`, `/video/:id`
     and the "Read video summary" link, which shows only for a `confirmed` row.
   - [P1357](p1357_video_summary_generator_pipeline.md) specs the writer: an operator CLI with draft,
     check and confirm. Its branch has no commits yet.
   - No disagreement stage mentions summaries (`grep -i summar` over the stage files returns only
     unrelated hits), so a run's stories go out with no summary link.
   - P1357 lists as a risk that captions carry no speaker labels. Yet the pipeline already holds, per
     approved video, exactly what that risk lacks: clean transcripts and speaker-labelled diarization.

3. **The story stage has no model per role, and one rule contradicts its own count.**
   - `story-draft.md` names no model for writers, checkers or controls.
   - It says *"The checker — one per story"* (`:342`), while the conductor's fan-out count assumes one
     per arguer.
   - For this run the founder decided mid-run: Gemini 3.8 writers through `delegate-gemini`, Sonnet
     checkers and controls, and Opus re-runs when a checker fails its control proof. That rests on a
     Fable cost review (estimates, carried below). A decision made mid-run and never written down
     gets asked again on the next run.

4. **The only mechanical point check passed eight points, five of them dead.** `room-split.mjs`
   reported *"8 of 8 assessed"*, exit 0. The Phase 3 judge then found c1 and c3 unanimous, c5 lopsided
   and a forecast, c7 near-unanimous and c8 a duplicate. By its own header `room-split` only checks that
   a room split was *written down*, but the Gate 2 packet reported it as *"passed"*. The founder then
   spent about 90 minutes (13:11–14:43) rewording points. One replacement point existed *"only to give
   Brooks a side"* (orchestrator's own words, session 2).

5. **The run's list of improvements (handoff item 7):** P1355 covered all of it except one: *pipeline
   points feed the P1336 registration survey*. P1336 says the per-event statements *"are written per
   event by a separate session"*. Nothing connects them to the approved points.

6. **Two small frictions, both caught in-session:**
   - The arguer's site returned 404 to curl's default user agent and 200 to a browser user agent.
   - A control's exit code was first read from `tail` at the end of a pipe.

> Founder, verbatim (session 2): *"what do we learn from this session? Do I need to run another session
> and improve something? How this runs? Did we benchmark?"*
> Founder, this session: *"our disagreement pipeline at some point must create summaries and put them in
> database? i guess worth improving? and when we improve worth reflecting in context of also
> disagreement:run orchestrator so it can work?"*

**Question:** What changes would stop a misattributed quote from reaching any page, put checked video
summaries on the pipeline's path, and make the story stage's model split standing? And how does each
one appear in `run-pipeline.md` without that file restating stage logic?

## Appetite

- **Blast radius:** medium-high. R1 governs every quote any disagreement surface shows about a real,
  named person. The rest touches single stages. No product code, no schema.
- **Reversibility:** high. Skill text and pure predicates with fixtures, reverted with `git revert`.
- **Decision density:** low. Two founder calls (R2 scope vs P1357's Non-Goal; R3 benchmark
  threshold). Everything else follows from rulings already on record.

## Invariants

- **Per-quote speaker confirmation is never waived for any multi-speaker source**, whatever its basis
  (`turn-verified` or `speaker-labelled`). decisions.md 2026-08-28 [technical], Step 2c: *"Per-quote
  confirmation is **not** waived."* The diarization is evidence for Step 4b, never a substitute.
- **Step 4c stays independent:** its subagent never receives the claimed speaker (positions.md 4c).
  A 4b/4c disagreement DROPs the quote, and is never re-run until they agree.
- **No quote about a real person appears on any page (event page, story, summary) without a
  confirmation record,** in any environment, including TEST drafts that the founder reviews and that
  may be shared.
- **Arguer unanimity is a signal, never a gate.** decisions.md 2026-09-01 [product] rejected *"a point
  no arguer opposes is not a point"*. Expert unanimity against a predicted room split is the stated
  best case.
- **P1349's summary ladder holds:** writer ≠ checker, `confirmed` only on an explicit operator yes, and
  the checker reads the same caption bytes as the writer (P1357 invariants).
- **Every P1355 invariant holds.** No gate removed or merged; test by default; prod a separate
  invocation.

## Solution

Ranked by harm prevented. Each item names its one-line touch in `run-pipeline.md`, which keeps its
contract: *"restates none of it"*.

### R1. No page quotes a speaker the pipeline has not confirmed (closes 1)

- **R1a. Fix the contradiction.** `positions.md` Step 4b and 4c apply to `speaker-labelled` quotes as
  well as `turn-verified` ones. The interlocutor's reply is read from the diarized turns, with the raw
  `.vtt` as a second view. Update the attribution-basis text at `:210-223` and the run-pipeline Stage 3
  line (*"on a `turn-verified` source"* becomes *"on any multi-speaker source"*). Add a `rule-present`
  row so the skip cannot come back.
- **R1b. Step 2c is judged per window, not per source.** For each diarized window whose turns a quote
  or a minutes count uses:
  - paste the oracle result or `UNMEASURABLE`;
  - paste the label-to-person mapping line **for that window** (labels are not stable across windows,
    as Step 2c already says).

  When a window's oracle fails or is unmeasurable, re-diarize the stretch in ≤5-minute windows before
  using it. Cost is per audio minute, so smaller windows cost nothing extra. Word share is never the
  admitting evidence (already true in the rule, missed in practice).
- **R1c. Quotes on event pages come from the confirmed list.** `clarity-night-publish` rule 4 gains a
  clause: a quote from a multi-speaker source must match a quote with a Step 4b + 4c record. **Draft
  mode** either:
  - runs 4b + 4c for just those page quotes at draft time (the quotes are few); or
  - uses a single-speaker quote; or
  - uses none.

  Single-speaker sources are unchanged. Make it code: a small predicate (or a `run-file-check`
  extension) that refuses a page-quote list with a multi-speaker quote lacking a confirmation record.
  Register it in `verify-all.mjs` with must-pass and must-fail fixtures.
- **run-pipeline touch:** the optional draft-page line after Gate 2 adds *"quotes only with a
  confirmation record (clarity-night-publish rule 4)"*.

### R2. The pipeline produces checked video summaries (closes 2)

`[FOUNDER DECISION: should the pipeline run P1357's draft + check for every approved video of a run
(recommended), given that P1357 currently says "Do NOT generate summaries automatically for every story
video; the operator runs the tool per video"? Confirm stays the operator's either way.]`

If yes:
- **R2a. Amend P1357 before its build starts** (its branch has no commits). The writer and checker
  accept the speaker-labelled turns the pipeline already stored, and only turns from windows that passed
  R1b. The summary attributes a claim to a person only from those turns. Otherwise it says "the host"
  or "a speaker", or drops the claim. This retires P1357's unmitigated risk ("captions have no speaker
  labels") on pipeline videos. It changes P1357's spec, not a second copy of it here.
- **R2b. Where it runs:** after positions, when transcripts and diarization exist for every approved
  video. `draft` + `check` on TEST, one row per video (never per story; P1349: *"N stories from one
  video → one URL"*).
- **R2c. Confirm** sits in publish's dry-run gate: the dry run lists each video's summary status, and
  `confirm` needs the operator's explicit yes per video id. The prod run carries rows through
  promote-to-prod's existing disclosure gate. A story without a confirmed summary is allowed; the link
  simply does not render (P1349).
- **run-pipeline touch:** one line under Stage 3 (*"then P1357 draft + check per approved video"*) and
  one under Stage 5 (*"dry run lists summary status; confirm per video"*).

### R3. Story stage: model per role becomes a standing rule (closes 3)

Promote the founder's in-run decision into `story-draft.md`, with the Fable review's safeguards. Token
figures are that review's **estimates**: about 580k Sonnet + 150k Opus against 0.8–1.3M Opus today,
roughly a 3× cut in Opus-equivalent quota.
- **Precondition:** `<lang>.clean.txt` exists for every source before any spawn. Raw VTT is never an
  input and a missing clean file is a STOP. Measured then: none of the six had one, and raw VTT is 3–4×
  the clean word count.
- **Writers:** Gemini through `delegate-gemini`. The task file is assembled by shell (brief + quotes +
  transcript), never passed through the orchestrator's context. A stateless writer's round 2 is the
  same model with identical inputs plus its draft plus the findings, recorded in the run file. An
  exit 2 (credential scan) means the Claude writer path, never an edited payload.
- **Checkers:** one per **arguer**, with a separate verdict per story (fix `:342`). Sonnet is permitted
  **because** the controls prove it each run. If it misses a planted distortion or flags the good case,
  the checkers re-run on Opus, never Sonnet again. Never Haiku, and never the same model family as the
  writer.
- **Windowing:** only for sources over ~60 minutes. Writer and checker get the same window ± a margin
  (~3 min), taken from windows that passed R1b, with the bounds in the run file. Short sources stay
  whole.
- **Writer brief:** the named extract of story-craft plus Voice, PS-1 and PS-2 (verbatim, not
  paraphrased). story-point-model and points-process are the orchestrator's reading.
- **Controls:** 4 of 5 on the shortest transcripts, with the near-miss control on a mid-length one.
- **The fan-out estimate** prints Sonnet and Opus tokens separately and names the roles that run off
  the subscription.
- **run-pipeline touch:** the input-block paragraph's count (*"thirteen subagents on a four-arguer
  run"*) is recomputed from the new shape, and its estimate follows the template above.

The Decision Criteria below settle whether Gemini stays the default writer.

### R4. Point diagnostics at Gate 2: shown, never refused (closes 4)

- `room-split.mjs`'s passing verdict says what it is: `RECORDED (not measured)`. The Gate 2 packet
  never reports it as "passed".
- Each candidate point in the packet carries its predicted side per arguer, with one quote each, plus
  three **signals**:
  - no arguer opposes;
  - the room is predicted near-unanimous;
  - the point exists to seat one arguer.

  These are signals only, per the 2026-09-01 ruling. The founder sees them before rewording, not after.
- **run-pipeline touch:** none. The change lives in select's Gate 2.

### R5. Approved points feed the event survey (closes 5)

After Gate 2, the approved point statements are written to wherever P1336 reads the per-event survey
statements, so the survey and the room's points are the same set. If P1336's slot does not exist yet,
this item waits on it.

### R6. Two small checks (closes 6)

- select's reachability check for a `subject_key` URL retries with a browser user agent and a
  known-good control before calling a site missing.
- Every control command in the stage files pastes the command's own exit code (`; echo $?`, no pipe).
  Epistemic gate 7 already states why.

**Already fixed, not re-filed:** Sinek's on-topic minutes read three ways (3 / 4.3 / 12) because there
was no defined method. P1355's C3 (`on-topic-minutes.mjs`) shipped an hour after that Gate 2, and C4
refuses a seal without its number. The pending run must re-measure Sinek with C3 before sealing.

## Alternatives Considered

| Option | Why not |
|---|---|
| Block event-page quotes until positions has run | Simplest, but it undoes P1355 draft mode, which the founder uses to judge the page early. R1c keeps draft mode and requires the same per-quote check for the few page quotes. |
| Cap every diarization window at 5 minutes | One incident, and 15-minute windows are the measured transport limit, not the cause. The oracle per window (R1b), falling back to short windows, targets the failure without more calls on sound windows. |
| A hard gate: every point must have an arguer on each side | Rejected by decisions.md 2026-09-01 [product]. |
| Move the Phase 3 judge earlier | Rejected by decisions.md (Phase 3 evaluates sources that do not exist earlier). P1355 Open Question 2 (judge before the page) stays the founder's. |
| Gemini as checker | Same family as the writer, and it cannot open files (Fable review). |
| A second summary writer inside the pipeline | Duplicates P1357. R2 amends it instead. |

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| R1b adds re-diarization calls on long interviews | ACCEPT | Only for windows whose oracle fails or is unmeasurable. Cost is per audio minute (~$0.005/min, select.md Step 2c) |
| No mechanical check can see a merged label | MITIGATE | **Corrected by the replay (see Replay evidence):** per-quote 4b/4c does NOT catch a merged label — the blind 4c check reproduced the original misattribution and answered CONSISTENT. What catches it is **R1b's per-window oracle + per-window label mapping**, enforced as 4b's precondition. 4b/4c remains necessary and is what confirmed the reply correctly |
| Sonnet checkers miss distortions (a prior run measured a 10/10 wrong-test substitution) | MITIGATE | Control proof each run; Opus re-run on failure |
| Gemini writers are worse at story voice | MITIGATE | Pre-registered benchmark (Decision Criteria) before it becomes the default |
| R2 makes a run longer, with one more gate item per video | ACCEPT | Confirm is folded into publish's existing dry run, not a new halt |
| P1336's survey slot does not exist yet | DEFER | R5 waits for P1336 |

**Non-Goals**
- Do NOT change product code, the database schema, or P1349's page, link, table or RLS.
- Do NOT build the summary tool here. P1357 builds it; R2 amends P1357's inputs and adds call sites.
- Do NOT add an arguer-unanimity gate, and do not move the Phase 3 judge.
- Do NOT decide P1355's open questions (100k default, S8, 5-minute floor, quote cap).
- Do NOT remove or merge any existing founder gate.
- Do NOT restate stage logic in `run-pipeline.md`; one line per touch.
- Do NOT quote any passage listed as sensitive in a run's private files.

## Done-When

- [x] `positions.md` no longer skips Step 4b/4c for `speaker-labelled` quotes, and a `rule-present` row
      exits non-zero on a copy of the **real** `positions.md` with the old skip sentence restored (gate 7d)
      — `rule-present.mjs speaker-confirmation` RESOLVE (8 rules, exit 0); mutated real file REJECT (exit 1),
      one finding, `PRESENT BUT BANNED`. The banned pattern ignores blockquotes, so the file keeps its own
      record of the withdrawn sentence (`src/tests/p1210-p1358-speaker-confirmation.test.ts`, 10 tests)
- [x] **Replay, real case:** the Naval [34:13] quote run through the new 4b + 4c on the stored 15-minute
      window (`$DIARIZE_STORE/KyfUysrNaco/1920s+900s.json`) is DROPPED or attributed to the host, never
      filed under Naval. The [34:33] reply from the 5-minute window (`2040s+300s.json`) is confirmed as
      Naval. Both outputs are pasted here
- [x] The page-quote predicate (R1c) is registered in `verify-all.mjs`. It refuses a multi-speaker page
      quote with no confirmation record, and passes a single-speaker quote and a confirmed one —
      `scripts/points/page-quote-check.mjs`; `verify-all` 20 predicates, must-pass `CONFIRMED` / must-fail
      `REFUSE`, exit 0; `two-callers` PASS; 22 tests in `src/tests/p1210-page-quote-check.test.ts`
- [x] `clarity-night-publish.md` rule 4 and draft mode state the R1c requirement; `rule-present` covers it
      (two rows, incl. the command invocation), and Step 5's self-check carries the exit-code line
- [x] P1357 amended (R2a) — founder chose "pipeline runs it" on 2026-09-28. P1357 gains an *Inputs from
      the pipeline* section, the amended Non-Goal, the retired caption-labels risk, an invariant, and the
      Done-When line about attributing nothing outside confirmed turns
- [x] `story-draft.md` carries the model-per-role section, checker one per arguer, the clean-transcript
      STOP and the windowing rule. The fan-out estimate template prints Sonnet and Opus separately
- [x] The benchmark (Decision Criteria) is **pre-registered** in `story-draft.md` with its threshold
      confirmed by the founder (2026-09-28), and the writer model is labelled **on probation** until it
      runs. **Founder decision, same day:** it runs at the first story-draft, not before — the ikigai run
      has not reached that stage, so there are no drafted stories to grade. Its result is recorded here
      when it runs; filed as a follow-up so it does not live in anyone's memory
- [x] The Gate 2 packet shows `RECORDED (not measured)` for room-split and the three per-point signals.
      `room-split.mjs` fixtures are updated, with no new refusal — 14 tests pass, including the 7c cases
      that a single point and an all-`divided` set still do not trip a finding.
      **Scoped honestly after review:** the verdict string is code and is tested; the three signals are
      **prose instructions** in `select.md`, because no predicate can observe an agent printing a packet
      (`rule-present.mjs`'s own SCOPE note). What is mechanical is that the packet's contract states each
      signal and states that none of them gates — four `rule-present` rows, which fail if a signal is
      deleted. An agent that omits a signal from the packet is not caught by anything, and that limit is
      the same one every prose rule in this pipeline carries
- [x] Each `run-pipeline.md` touch above is present and is one line. `input-block-scan.mjs` and
      `rule-present.mjs` exit 0
- [x] Skills re-synced — `sync-agent-skills.sh --check`: 128 skills in sync, 0 collisions, 0 drift

## Replay evidence (Done-When 2) — and a correction to this spec's own claim

Run 2026-09-28 against the stored windows. **The quote is DROPPED. It is never filed under the guest.**
But it is **R1b that catches it, not 4b/4c**, and the risk table below is corrected accordingly.

### Window A — `$DIARIZE_STORE/KyfUysrNaco/1920s+900s.json` (15 minutes, the window used on the day)

Per-window measurement: 113 turns, 30.6 words/turn, **0 askers** (oracle reliable, not UNMEASURABLE).
Word share `spk:0` 78.2% / `spk:1` 21.8% — *healthy-looking, and meaningless here.*

**Step 2c mapping FAILS — one label carries two people:**

```
spk:0 @ 1966.1  "…my old quip was if you're so smart, why aren't you happy?…"      <- the GUEST's own published aphorism
spk:0 @ 2089.3  "…from the bit of time that we've spent together, you have a
                 really interesting trait of holistic selfishness…"                <- said BY the host, ABOUT the guest
spk:0 @ 2053.3  "…we sacrifice happiness in order to be successful…"               <- THE QUOTE, on the merged label
```

A label that speaks the guest's own aphorism *and* addresses the guest as an interviewer is not one
person. Step 2c item 4 (*"a source whose labels cannot be mapped to real names is REJECTED"*) therefore
refuses this window, and R1b refuses anything taken from it. **Outcome: `DROPPED (unconfirmed speaker)`.**
The 78.2% share is the measured proof of R1b's rule that **word share is never the admitting evidence** —
it reads clean on a merged label.

### Window B — `$DIARIZE_STORE/KyfUysrNaco/2040s+300s.json` (5 minutes, re-diarized)

63 turns, 18.7 words/turn, 0 askers. Mapping from content, for **this** window: `spk:1` = the host (it
is `spk:1` that speaks the "time we've spent together / holistic selfishness" turn), `spk:0` = the guest.

- **The [34:13] quote is `spk:1` = the HOST.** Not the guest. Matches the founder's correction on the day.
- **The [34:33] reply (*"in my own life, I have not found it to be a trade-off…"*) is `spk:0` = the GUEST.**
  Step 4b: the interlocutor's reply structure plus the host-identifying turn. Step 4c, blind, returned
  **Naval Ravikant**, agreeing ⟹ **CONFIRMED, `turn-verified`.**

**The labels FLIP between the two windows** (`spk:0` holds the quote in A, `spk:1` in B). Direct evidence
for the rule that a mapping may never be carried from a neighbouring window.

### Step 4c ratio and the finding that matters

**2 of 2 4c agents reported** (`epistemic.md` gate 9b), both within the stated 10-minute deadline, both
writing to a file and returning its path.

**On window A, the blind 4c check did NOT catch the merge — it reproduced the original error.** Given the
merged turns with labels stripped to `A`/`B`, it attributed the quote to the **guest**, reasoning from his
aphoristic voice and his own *"one of my favorite insights"* framing, and answered **CONSISTENT** when
asked directly whether either label carried two people. It read the host's characterising turn as *"a
natural continuation of the same reflective voice"*. Its reasoning is coherent and its conclusion is wrong,
because the merge is invisible in the text alone — the two people are discussing the same idea in
compatible registers.

**So the mitigation in the risk table, *"R1a makes 4b/4c mandatory on diarized sources. The Done-When
replay proves 4b/4c catches the real case"*, is WRONG and is corrected here.** 4b/4c is necessary and it is
what confirms window B correctly, but on a merged window it is **not sufficient** — a blind reader cannot
see a merge. The thing that catches this failure is **R1b's per-window oracle and per-window label mapping**,
enforced as 4b's precondition. Two independent readings of the same window agree beautifully when the
window itself is lying.

Consequence, already in the shipped text: R1b is not a cost-saving refinement of R1a, it is the load-bearing
half. A future edit that keeps 4b/4c and relaxes per-window mapping restores the original defect in full.

## Adversarial review (2 of 3 delivered)

**Opus: 5 HIGH, 5 MEDIUM, 4 LOW. Gemini 3.8: 4 HIGH, 2 MEDIUM, 1 LOW. Codex: NOT DELIVERED** — its
usage limit was reached (`ask-model` exit 1, *"You've hit your usage limit… try again at 6:45 PM"*).
Per `~/.agents/bin/codex-review`'s own warning that is a **failed run, not a clean review**, and it is
reported as missing rather than as no findings (`epistemic.md` gate 9b).

Every finding below was re-executed against the live file before being acted on, and the two reviewers
overlapped on four defects — which is how one of them was found to be **wrong about what was already
fixed**: the reviews ran while the files were being patched, so each finding was re-tested, not trusted.

| # | Severity | Defect | Fixed by |
|---|---|---|---|
| 1 | HIGH | `basis: "single-speaker"` is the page author's own word and `continue`d past the run-file cross-check. **The real incident quote passed with exit 0 while the confirmed list said the HOST said it**, and the summary line claimed it "appears in the run file's confirmed list" | The run file is now consulted **before** any basis branch; a person **or basis** mismatch refuses; the summary is built from the checks that ran |
| 2 | HIGH | A confirmation record was tied to nothing, so one record copied onto another quote passed — including a window from a different video and a window that could not contain the quote's own timecode | `seconds` is mandatory for a multi-speaker quote; the window's `<start>s+<dur>s` bounds must contain it; an optional `video` must appear in the window path |
| 3 | HIGH | `select.md` Step 2c items 2 and 4 still said **"the source is REJECTED"** in bold, around the new per-window paragraph — opposite outcomes for the exact case this spec pastes as its replay evidence | Both items rescoped to the window, with source-level rejection defined as "no window survives, retries included" |
| 4 | HIGH | `run-pipeline.md`'s Stage 3 **stop condition** still named only `turn-verified`, two lines under the sentence R1a had widened — so a `speaker-labelled` quote with no artifact had nothing to halt on | Widened to any multi-speaker basis, plus a `rule-present` row (nothing else reads that file) |
| 5 | HIGH | The banned-sentence rule exempted blockquotes — but `positions.md` writes **binding procedure** in blockquotes, so the exemption covered the exact shape a future author would use. Three rewordings also passed | Exemption is now by explicit **historical marker**, not formatting; a semantic row bans the exemption in any wording; the record gets **one** mention, so history-marker gaming fails. All 8 evasion shapes reject; unmodified files still resolve |
| 6 | MED | The 4b/4c table filed every confirmed quote as `turn-verified`, a label its own definition forbids for a diarized source | Files under the quote's own basis |
| 7 | MED | R3's table banned the writer's own family as checker while R3's own fallback shipped Opus writer / Sonnet checker | Rule is now "never the same **model**"; the fallback is named as the **weaker** same-vendor configuration, recorded per run as `checker_separation` |
| 8 | MED | The benchmark graded the Gemini arm cross-vendor and the Opus arm by its own vendor, biasing the **difference** against Gemini | The founder's blind preference decides when the arms differ by ≤1 story; the report states the asymmetry |
| 9 | MED | Nothing derived the page's quote list from the page — an incomplete enumeration passed | Step 5 requires the count **by command** against `quotes.length`, both numbers pasted |
| 10 | MED | Exit 0 read the same whether the page was checked against the run file or against itself | New verdict `CONFIRMED-SELF-ATTESTED`; Step 5 requires the verdict word |

Also fixed: a tautological assertion, a floor-not-labels assertion, contradictory operator text listing
`turn-inferred` among "allowed values", and — found by re-running the reviewer's own fixture rather than
trusting the edit — **a bounds check that could never fail**, because destructuring took the regex's
separator group and `Number("/")` is `NaN`.

**Honest limit on Done-When 1.** *"Cannot come back"* is now true for the eight shapes tested: verbatim,
wrapped, list item, odd spacing, blockquote at any depth, three rewordings, and a new exemption dressed
as history. A wording the semantic pattern does not anticipate would still pass — the ban raises the cost
of reintroduction and makes the accidental and house-style cases impossible; it is not a proof.

## Decision Criteria

**Does Gemini stay the default story writer?** (pre-registered, before the benchmark runs)
- **Benchmark:**
  - For 2 arguers, Gemini and Opus each write every story for that arguer.
  - One Sonnet checker grades both sets blind to which model wrote which.
  - The founder picks a favourite per pair, also blind.
- **Keep Gemini if both hold:**
  - its checker failure rate is not worse than Opus's by more than one story in the set;
  - the founder prefers Opus in no more than half the pairs.
- **Otherwise:** Opus writers, and the Sonnet/Opus checker rule stands unchanged.

`[FOUNDER DECISION: confirm this threshold before the benchmark runs.]`

## Rollback Strategy

Skill text and predicates revert with `git revert`. R2's P1357 amendment is a spec edit made before
any code, so no data migration is involved.

## Open Questions

1. Is ~60 minutes the right threshold for windowing a story's transcript? It is the Fable review's
   figure, not a measurement.
2. Is R4's "exists to seat one arguer" signal decidable from the packet, or only by the judge?

## Related

- [P1355](done/2026-06-10/p1355_disagreement_pipeline_standing_rules_from_clarity_night_2.md): the same run's standing rules. Its C3 closes the minutes friction; its Open Question 2 (judge before the page) stays open
- [P1357](p1357_video_summary_generator_pipeline.md): summary writer; R2 amends its inputs
- [P1349](done/2026-06-10/p1349_full_video_summary_page.md): the summary table and page
- [P1336](p1336_registration_carries_opt_in_prep_and_survey.md): the per-event survey R5 feeds
- [P1350](p1350_multi_source_evidence_per_arguer.md): multi-source evidence (not touched)
- [P1190](p1190_arbiter_filter_into_disagreement_pipeline.md): point-consequence filter (not touched)
- decisions.md 2026-08-28 [technical] (Step 2c, per-quote not waived) · 2026-09-04 [technical] (diarized turns are the quote artifact) · 2026-09-01 [product] (no arguer-unanimity gate)
