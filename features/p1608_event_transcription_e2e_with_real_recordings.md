---
status: week
type: task
rank: 89
workstream: events
created_date: '2026-11-04'
tags: [transcription, events, e2e, testing]
disclosure: public
delivery_stage: create-spec
pipeline_ran: [create-spec]
drafted_by: opus
exec_model: sonnet
exec_effort: high
driver: heuristic
---

# P1608: Automated end-to-end test of event transcription, with real recordings as fake mics

## Problem

**Situation:** P1596 shipped loudest-mic transcripts for events. Unit and integration tests cover the
pieces with mocks and seeded rows. Solo tests on TEST each found something only a whole run could find
(no archive secret on the server, Safari background saving).
**Complication:** Nothing proves the chain as one piece without gathering people: Transcribe, recording,
upload, the cleaning job, and text in the event chat under the right person. On 2026-11-04, self-hosted TEST
showed the gap is live: its newest clean jobs, from 2026-11-02, read `status: pending`, `attempts: 0`,
with `dispatched_at` set, so dispatch fired and no worker ever claimed them.
**Question:** Can one command run that whole chain with real speech and fail when any link breaks?

> Founder, verbatim: "prove the whole chain works without people: Transcribe, recording, upload, the cleaning
> job, and text arriving in the event chat under the right person."

## Appetite

Blast radius: test-only code, plus whatever defects it finds on self-hosted TEST. Reversibility: git revert.
Decision density: low; the founder set the flow, the environment and the review. One default is flagged below.

## Invariants

- Runs on self-hosted TEST only. It refuses to start, before any browser or network call, if the resolved
  server is not the active self-hosted one (never hosted, never prod).
- Never in the default e2e run, and never run with Playwright retries: each attempt calls paid Gemini.
- The test processes only the jobs of its own event. It never calls the worker's `/sweep`, which drains every
  pending job on the server, including the stale ones above, at our cost.
- The expected text comes from the corpus's human transcript, never from Gemini output. A phrase list recorded
  from the system under test would pass whatever the system does.

## Solution

**Recording source.** AMI Meeting Corpus, individual headset mics, one meeting (P1596's benchmark source, stated
there as CC BY 4.0; re-read the licence page and record the finding here before downloading). A script fetches the
audio and annotations, cuts clips with ffmpeg and checks hashes. **Audio stays out of the repo**, in a local cache
directory. The repo holds only the script, hashes, cut times, short expected phrases and attribution.

**Clips.** Three speakers on one shared meeting timeline, 4 minutes, 16 kHz mono WAV, ending in silence. Time T counts
from the tap on Transcribe. Round 1 runs from about T=20 s to T=140 s and round 2 from T=140 s to T=240 s. Round 1 holds 6
expected phrases per person between T=30 s and T=130 s, including one inside the round's first 60 s. Round 2 holds 2 per
person between T=150 s and T=230 s. Each phrase has at least 6 words and no other speaker within 2 s (P1596 measured that
about 90% of lost sentences overlapped someone, which it accepted, so overlap is not tested here).

**Real-room simulation: in, as the default clips.** Mix a quiet copy of every other speaker into each clip (ffmpeg,
about -12 dB, tuned in the build). AMI headsets bleed little, so with clean clips "not duplicated under someone else"
could pass with the loudest-mic rule off. The bleed is checked on the **captured archive**, not the source file, because
`getUserMedia({ audio: true })` (`room-capture-context.tsx:432`) leaves browser audio processing on, which may remove the
bleed or level the mics. Local Whisper must hear another speaker's phrase in the captured audio, or the run is invalid.

**Browsers.** Each person with audio gets **their own launched Chromium, not a context as first proposed**: the file flag
is a launch argument for the whole process (first build step proves this). Flags: `--use-fake-device-for-media-stream`,
`--use-file-for-fake-audio-capture=<clip>%noloop`, `--use-fake-ui-for-media-stream`.
**Preflight, before the app or any Gemini call:** a blank page records 5 s per browser and compares it with the clip, so a
misconfigured flag can never send the real Mac microphone to TEST and Gemini. The host is one more browser with no file.
Threads are read only from the host's browser: reloading a capturing browser re-opens the mic and may restart the clip.

**Flow, through the real UI wherever the founder's flow names it:**

1. Precondition: `transcribe_channel_posting.enabled` is true and `enabled_at` is in the past (on today). The test reads
   it, fails with instructions if off, and never writes it (a write takes the whole server, P1607).
2. Hidden event (P1603), attendees A, B, C, through the test helpers.
3. A, B, C each tap Transcribe (one tap, it includes consent), all within 10 s; each tap time is recorded, and a spread
   over 3 s invalidates the run because the worker aligns only within 5 s (`MAX_SHIFT_S`). Capturing before the round
   starts matters: a seated person under 80% of the window marks the table partial (`pipeline.py:156`).
4. The host seats A, B, C at one table and starts round 1 near T=20 s. A short "Before round 1" stretch is expected.
5. Before round 2, seed person D (RSVP, room member, consented Transcribe row, no recording), as
   `e2e/p1592-event-transcripts.spec.ts` does; a real tap would start capture. Assert the seed did not log a seat move.
6. Near T=140 s the host starts round 2 with A, B, C, D at one table. That cuts round 1. Nobody's seat changes during a
   round, since a change after 60 s makes the table post nothing with no visible error.
7. Near T=240 s the host closes round 2, then A, B, C tap End, which stops the live slices.
8. Wait: round 1's job from 40 s after its cut. Round 2's job waits on D's missing audio until 180 s after the window end
   (`READY_DEADLINE_S`), deferring until then.
9. Read the threads from the host's browser.

**Job dispatch on TEST.** First build step: find why the 2026-11-02 jobs stayed pending, keeping that evidence before
anything writes to them (epistemic gate 2b), and confirm `transcribe-room-batch-test` still exists. P1592's notes said it
would be deleted afterwards. Confirm the worker's database URL, bucket and current `round_clean.py` too. A wrong database
returns 200 `claimed: false`, so the test asserts `claimed: true`.
**Before repairing the normal chain, count what repair would release:** the tick dispatches every undispatched pending job
on the server and closes abandoned rounds, and queued Cloud Tasks may still fire. State that count and its cost. Clearing
stale rows is a TEST data change and is the founder's call. Until repaired, the test posts its own job ids to `/process`
with an OIDC token, re-posting across the deferral above, and the report says plainly that dispatch was not exercised.

**Assertions (matching: lowercase, no punctuation, at least 80% of the phrase's words in order, on each person's
concatenated text per thread, since a chunk boundary can split a phrase; set before the first run):**

- Round 1: for each of A, B, C, at least 5 of 6 expected phrases appear under that person, and the first-60-s phrase is
  listed separately.
- Round 1: **zero** expected phrases appear under anyone else. Any stray fails the run and is reported; it is not re-run
  until green.
- Round 2: each person's phrases appear, which proves recording continued across rounds.
- Round 1's title has no missing-audio note. Round 2's has "(some of this table's audio is missing)".
- The report names every phrase, where it landed, each job's status, duration and attempts, and the tap times. The
  worker's mic offsets are not stored anywhere, so they are not reported; exposing them is out of scope.

**Controls, so assertions are proven able to fail:** on saved real output, swapping two speakers' phrase lists must fail;
deleting one speaker's rows must fail; one phrase under two people must fail; a saved round 1 title with the note added,
and round 2 without it, must fail. **Rule-off control:** the same downloaded chunks run through `clean_round` with the
loudest-mic masks disabled must show a phrase under two people. If it does not, the zero-stray result proves nothing, and
the report says so. Expected phrases are re-verified against the audio with local Whisper, independent of Gemini.

**Running.** An explicit command with its own Playwright config: retries 0, the same P1607 slot guard, an environment gate,
and the spec ignored by the default config so a full suite can never run it. It exits non-zero on failure and cleans up
its users and event, including on a crash, since an aborted run's room ends about 10 minutes later and can start paid jobs.

**What this cannot prove (those stay with the friends test):**

- iPhone background recording, or any real phone: this is desktop Chromium.
- Real mics picking up each other in one room: the bleed is a digital mix with no echo, reverberation or distance.
- Real microphones, poor mobile networks, neighbour-table bleed, or a mic dying mid-round (a different code path from D).
- The title's cause: the worker does not expose per-person coverage, so the note is tied to D only by every other person's
  phrases being present.
- That transcripts read well. It checks known phrases, not whole-text quality.

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| A broken test retries and spends money | MITIGATE | Retries 0, one explicit command, short clips, own jobs only |
| Gemini paraphrases, so phrases do not match | MITIGATE | Threshold set above before the first run; failures are reported, never re-run until green |
| Browsers start seconds apart, so mics are misaligned | MITIGATE | Record the offsets; the worker aligns by loudness. Offset over 3 s fails the run as invalid, not as a product bug |
| A red run is a product defect, not a test defect | ACCEPT | That is the purpose. File it with `/create-bug`; do not loosen the test to pass |
| Test audio stays in the TEST bucket | ACCEPT | Public-corpus speech, no personal data |
| Seeded D is not a person whose mic failed | ACCEPT | D has no chunks; a mic dying mid-round takes another branch (`pipeline.py:315`) and is left to the friends test |
| Browser processing changes loudness on fake audio | MITIGATE | Bleed checked on the captured archive; rule-off control |
| Zero strays across 24 phrases may false-alarm (P1596 measured 1.9% wrong) | ACCEPT | Isolated phrases should lower it; the first run measures it, and a stray is reported, not hidden |
| Run holds a slot for about 10 min | ACCEPT | A waiting exclusive run may exit 75 and retry |
| gcloud login expired on 2026-11-04 | DEFER | The founder runs `gcloud auth login` before the first live run; the worker checks need it |

**Non-Goals**
- Do NOT change product behaviour or thresholds to make the test pass.
- Do NOT add it to CI or a schedule; a later decision, after real runs show what it costs.
- Do NOT score transcript quality or build a benchmark; P1596 did that.
- Do NOT test the end-of-room transcript beyond counting its cost.

## Alternatives Considered

- **Browser contexts in one Chromium:** rejected, the flag is process-wide, so all mics would play one file.
- **Inject audio with a mocked `getUserMedia`:** rejected, it skips the real capture path this test exists to cover.
- **Seed chunks into the bucket and start at the worker:** rejected, the founder asked for the whole chain; recording
  and upload would go unproven.
- **Clean clips with no mixing:** rejected as the default, see the real-room section.
- **Assert on Gemini output recorded from a first good run:** rejected, it would test the system against itself.

## Cost Budget

Per [metered-services.md](../docs/technical/metered-services.md). Mic-minutes: 3 mics x 4 min = 12, plus 1 min of margin
each before End = 15 for the live path. Argon rate from P1596: $0.27 / (4 mics x 15 min) = $0.0045 per mic-minute, about
$0.50 / 60 = $0.0083 from 2026-11-30. Transcribe from the registry: $0.003 + $0.002 = $0.005 per minute.

| Measure | Per user | Per hour | Per test run |
|---|---|---|---|
| Argon, clean jobs (before-round, 2 rounds, room-end cover the 12 once) | none, test-only | none, not scheduled | 12 x $0.0045 = $0.054; 3 attempts: $0.162 (after doubling $0.10, $0.30) |
| Transcribe, live slices, no silence gate, 1 s lead-in on 13 s | none | none | 15 x 14/13 x $0.005 = $0.08 |
| Transcribe, end-of-room pass, if the sweep ends the room before cleanup | none | none | 12 x $0.005 = $0.06; 3 attempts: $0.18 |
| Argon, rule-off control, only with its flag | none | none | 12 x $0.0045 = $0.054 |
| **Gemini total** | none | none | **$0.25 usual; $0.48 worst** ($0.35, $0.67 after doubling, control included) |
| Whisper checks | none | none | $0, local |
| GCS | none | none | 12 min x 2 chunks/min = 24 chunks, 24 x 3 = 72 operations, 12 x 1.92 MB = 23 MB; under $0.01 |
| Cloud Run worker | none | none | Runs `--no-cpu-throttling`, idles about 15 min (decisions.md 2026-10-01), so about 25 instance-minutes |
| Supabase | none | none | Self-hosted TEST, no plan limit; 4 test users created and deleted |
| AMI download | none | none | Once, then cached; no charge |

1. **Fits the plan limit today?** No cap applies (Gemini lists a price, TEST is self-hosted). Spend = runs per month x
   $0.25 to $0.67, against the budget-capped batch key. Verdict: fits.
2. **Fits at 10x?** 10x runs a month stays near one real event's clean cost ($5.40 to $30, P1596). Verdict: fits.
3. **If either answer is no:** cut clips to 2 minutes, which halves every line.

Prices are as P1596 and the registry state them. The live and end-of-room lines are counted, not measured; the first run
records real usage here. The test cannot cancel work already on the worker, so the true limit is the worker's 3 attempts,
already in the worst case; the test reports any job above 1 attempt and fails.

## Done-When

- [ ] One command runs the whole flow on self-hosted TEST and ends with a named report. Evidence: the report from a real run.
- [ ] Round 1: each speaker's phrases appear under them to the threshold and none appear under anyone else. Round 2's title says audio is missing. Round 1's does not.
- [ ] Each assertion control fails when run, with its exit code pasted; the rule-off control's result and the phrase re-verification with Whisper are recorded.
- [ ] Preflight fails when the fake-device flag is removed, shown before any Gemini call.
- [ ] The test refuses a hosted or prod target before any browser starts, shown by a real refusal.
- [ ] `npx playwright test --list` without the explicit command does not list this test. Shown by its output, with a control that the explicit command does.
- [ ] The dispatch cause on TEST is recorded here, stating whether the normal chain was exercised or `/process` was called directly.
- [ ] The actual cost of the first run is recorded next to the budget.
- [ ] Licence read and recorded; no audio in the repo (shown by `git ls-files`), attribution present.
- [ ] Reviewed by Gemini 4 Argon, Codex and Opus, with load-bearing findings verified by command. Spec review 2026-11-04: Argon and Opus reported; Codex failed on its usage limit and reviews the build.

## Open Questions

1. `[FOUNDER DECISION: pass bar]` Default set here: at least 5 of 6 phrases per person and zero under the wrong person.
   Strict on misattribution, loose on one Gemini slip. Say if you want 6 of 6.
2. Why the 2026-11-02 jobs stayed pending, answered in the build.
3. `[FOUNDER DECISION: stale TEST jobs]` Whether to clear them before repairing dispatch, once their count and cost are known.

## Related

- P1596 (the pipeline under test, benchmark, known limitations), P1592 (round threads), P1603 (hidden events)
- P1607 (parallel e2e slots, whole-server runs), P1152 (physical-device verification, what stays out of scope here)
- decisions.md 2026-11-03 (self-hosted TEST), 2026-10-29 (TEST holds AI keys), 2026-11-02 (a round's words stay with the round)
