---
status: in-progress
type: task
rank: 89
workstream: events
created_date: '2026-11-04'
tags: [transcription, events, e2e, testing]
disclosure: public
delivery_stage: dev
pipeline_ran: [create-spec, dev]
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

**Clips (corrected in the build: the timeline is arranged, the speech is real).** A contiguous 4-minute window of a real
meeting cannot supply the phrases: across 138 AMI scenario meetings, with 2 s of nobody else speaking around each phrase,
no window held even 3 phrases per speaker in round 1 plus 1 in round 2 (6 + 2 was the plan). So each clip is built from real,
isolated utterances (cut from each speaker's own headset, 0.2 s padding) placed in turn order on one shared 240 s timeline;
the quiet bleed copies below are mixed from the other speakers' placed tracks. Three speakers, 4 minutes, 16 kHz mono WAV, ending in silence. Time T counts
from the tap on Transcribe. Round 1 runs from about T=20 s to T=140 s and round 2 from T=140 s to T=240 s. Round 1 holds 6
expected phrases per person between T=30 s and T=130 s, including one inside the round's first 60 s. Round 2 holds 2 per
person between T=150 s and T=230 s. Each phrase has at least 6 words and no other speaker within 2 s (P1596 measured that
about 90% of lost sentences overlapped someone, which it accepted, so overlap is not tested here).

**Real-room simulation: in, as the default clips.** Mix a quiet copy of every other speaker into each clip (ffmpeg,
about -12 dB, tuned in the build). AMI headsets bleed little, so with clean clips "not duplicated under someone else"
could pass with the loudest-mic rule off. The bleed is checked on the **captured archive**, not the source file, because
`getUserMedia({ audio: true })` (`room-capture-context.tsx:432`) leaves browser audio processing on, which may remove the
bleed or level the mics. Local Whisper must hear another speaker's phrase in the captured audio, or the run is invalid.

**Browsers (measured on a blank page in the build, see Build findings).** Each person with audio gets **their own launched Chromium, not a context as first proposed**: the file flag
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
4. The host seats A, B, C at one table and starts round 1 near T=20 s. Built through the host RPCs `host_start_round` and
   `host_end_rounds` (as `e2e/p1592-event-transcripts.spec.ts` does), not the host screen: the founder's flow names Transcribe,
   recording, upload, the job and the chat text, and the screen's selectors are unproven. A short "Before round 1" stretch is expected.
5. Before round 2, seed person D (RSVP, room member, consented Transcribe row, no recording), as
   `e2e/p1592-event-transcripts.spec.ts` does; a real tap would start capture. Assert the seed did not log a seat move.
6. Near T=140 s the host starts round 2 with A, B, C, D at one table. That cuts round 1. Nobody's seat changes during a
   round, since a change after 60 s makes the table post nothing with no visible error.
7. Near T=240 s the host closes round 2, then A, B, C tap End, which stops the live slices.
8. Wait: round 1's job from 40 s after its cut. Round 2's job waits on D's missing audio until 180 s after the window end
   (`READY_DEADLINE_S`), deferring until then.
9. Read the threads. The assertions read the round threads from the database (author, thread, title are exact there); the
   host's browser opens the event channel and must show the "Round 1" title, which is reported and not asserted, because
   whether the host is a member of the channel is unproven.

**Job dispatch on TEST.** First build step: find why the 2026-11-02 jobs stayed pending, keeping that evidence before
anything writes to them (epistemic gate 2b), and confirm `transcribe-room-batch-test` still exists. P1592's notes said it
would be deleted afterwards. Confirm the worker's database URL, bucket and current `round_clean.py` too. A wrong database
returns 200 `claimed: false`, so the test asserts `claimed: true`.
**Before repairing the normal chain, count what repair would release:** the tick dispatches every undispatched pending job
on the server and closes abandoned rounds, and queued Cloud Tasks may still fire. State that count and its cost. Clearing
stale rows is a TEST data change and is the founder's call. Until repaired, the test posts its own job ids to `/process`
with an OIDC token, re-posting across the deferral above, and the report says plainly that dispatch was not exercised.

**Assertions (matching: lowercase, no punctuation, at least 80% of the phrase's words in order, on each person's
concatenated text per thread, since a chunk boundary can split a phrase, inside one window of 1.5 x the phrase length + 2
words, so common words spread over minutes cannot count; set before the first run):**

- Round 1: for each of A, B, C, at least 5 of 6 expected phrases appear under that person, and the first-60-s phrase is
  listed separately.
- Round 1: **zero** expected phrases appear under anyone else. Any stray fails the run and is reported; it is not re-run
  until green.
- Round 2: at least 1 of each person's 2 phrases appears under them, which proves recording continued across rounds
  (the spec said "appear"; 1 of 2 is the build's reading, the same slack as 5 of 6). Round 2 strays are reported, not asserted.
- Round 1's title has no missing-audio note. Round 2's has "(some of this table's audio is missing)".
- The report names every phrase, where it landed, each job's status, duration and attempts, and the tap times. The
  worker's mic offsets are not stored anywhere, so they are not reported; exposing them is out of scope.

**Controls, so assertions are proven able to fail:** on saved real output, swapping two speakers' phrase lists must fail;
deleting one speaker's rows must fail; one phrase under two people must fail; a saved round 1 title with the note added,
and round 2 without it, must fail. **Rule-off control:** the same downloaded chunks run through `clean_round` with the
loudest-mic masks disabled must show a phrase under two people. If it does not, the zero-stray result proves nothing, and
the report says so. Expected phrases are re-verified against the audio with local Whisper, independent of Gemini.

**Running.** `npm run test:e2e:p1608` (sets `P1608_LIVE=1`; without it the config refuses). An explicit command with its own Playwright config (`playwright.p1608.config.ts`): retries 0, the same P1607 slot guard, an environment gate,
and the spec ignored by the default config so a full suite can never run it. It exits non-zero on failure and cleans up
its users and event, including on a crash, since an aborted run's room ends about 10 minutes later and can start paid jobs.

**What this cannot prove (those stay with the friends test):**

- iPhone background recording, or any real phone: this is desktop Chromium.
- Real mics picking up each other in one room: the bleed is a digital mix with no echo, reverberation or distance.
- Real microphones, poor mobile networks, neighbour-table bleed, or a mic dying mid-round (a different code path from D).
- The title's cause: the worker does not expose per-person coverage, so the note is tied to D only by every other person's
  phrases being present.
- That transcripts read well. It checks known phrases, not whole-text quality.

### First live run, 2026-11-04 (paid)

**Result: PASS, exit 0, 8.9 minutes.** A 6/6 and 2/2, B 5/6 and 2/2, C 6/6 and 2/2; zero phrases under the wrong person; round 2's title carries the missing-audio note and round 1's does not; each job finished on 1 attempt in about 25 s.

What this result does not show:

- **Normal dispatch was not exercised.** The report's first wording claimed it was; that was wrong and is corrected. The vault still has no `enqueue_room_transcription_*` secret (count 0 after the run), while another session's curl loop was posting `/sweep` to the test worker about once a minute from 03:25 UTC. That loop almost certainly claimed these jobs. It also drained the 8 stale jobs at about 03:26 to 03:28 UTC, so they are no longer pending. That spend (at most about $1.28) was not this test's.
- **The run tested P1604's unmerged state.** The worker image was `p1604-test-1`, deployed by another session at 09:41 local, and TEST holds P1604's migrations. Re-run after P1604 ships or is withdrawn.
- **The rule-off control has not run against Gemini.** The free self-test and Whisper on captured audio show the bleed is present and the masks act on it. Whether Gemini would write the bled words with the rule off is unmeasured, so "zero strays" is not yet proven to depend on the loudest-mic rule. `--job` needs the job row, which cleanup deletes, plus the batch key in the environment.
- **Review fix after the run:** Argon found the matcher ignored words credited to D or a stranger, ignored round 2 strays, and accepted a missing job. All three now fail, with tests; re-scoring the saved run under the stricter matcher is recorded in the handoff.
- **Real cost:** not separately measurable while the same key served other sessions; the budget's counted figures stand.

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

## Build findings

Written 2026-11-04 by the build. Everything below was measured or read this session; nothing on any server was changed.

### Job dispatch on self-hosted TEST (answers Open Question 2)

**Cause (read-only evidence).** The tick `transcribe_round_clean_tick` (every minute) sets `dispatched_at = now()` and only then
calls `_transcribe_round_clean_dispatch`, which reads three vault secrets and returns early, with a warning and no HTTP call,
when any is missing. On self-hosted TEST the vault holds 13 secrets and **none** named `enqueue_room_transcription_url`,
`enqueue_room_transcription_secret` or `enqueue_room_transcription_anon_key` (control: the same query lists the other 13, so
the query works). `net._http_response` holds 14 rows, all from other callers (12 x 200 from 2026-11-03 20:30 to 2026-11-04 02:00,
2 x 202 at 02:15), none for these jobs. So: the dispatch never leaves the database, the job keeps `status: pending`,
`attempts: 0`, and `dispatched_at` set, and because the tick only picks `dispatched_at IS NULL`, nothing ever tries again.
`transcribe_room_job_dispatch` (room-end jobs) reads the same three secrets, so room jobs fail identically.
Further links, checked but moot while the secrets are missing: Cloud Tasks queues `transcribe-room-jobs` and `transcribe-jobs`
exist, RUNNING, and hold no tasks. Whether the `enqueue-room-transcription` edge function is deployed on the self-hosted server
was **not** checked (no read-only way found); it does not matter until the secrets exist.

**The worker exists.** Cloud Run `transcribe-room-batch-test`, us-east4, project `gen-lang-client-0869694595`; latest revision
`transcribe-room-batch-test-00011-w56` created 2026-11-02 13:49 UTC; image `gcr.io/gen-lang-client-0869694595/transcribe-room-batch:p1596-test-11`;
env names `GCS_BUCKET`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (secret reference), `GEMINI_BATCH_API_KEY` (secret reference);
its `SUPABASE_URL` equals the self-hosted TEST origin (compared, not printed); CPU throttling off, max 2 instances.
**Unproven:** the last commit touching `round_clean.py` is dated 2026-11-02 15:03 UTC, after that revision was created, so the deployed
image may predate the committed code. There is no digest-to-source map, so this stays a question for the first live run.
There is no Cloud Scheduler job for the test worker: the one existing job `transcribe-room-sweep` (hourly) targets the **prod** worker.
So nothing drains stale TEST jobs.

**Stale jobs and what repair would release.** On 2026-11-04 TEST holds **8** `pending` clean jobs (7 round, 1 room), all with `attempts 0`
and `dispatched_at` set (2026-11-02, 7 of them stamped in one tick at 13:42 by the abandoned-round close). Four more
undispatched pending room jobs seen at 02:21 had vanished by 02:22 (another session's test cleanup). Repairing the vault
alone releases **0** of the 8 through the tick (it takes only undispatched jobs). They are released only by a call to the test
worker's `/sweep`, which no scheduler makes. Upper bound if someone did call `/sweep`: about 284 mic-minutes of windows
(one 85-minute window alone is 171), about **$1.28** at $0.0045 per mic-minute, only where audio still exists in the bucket. The repair also
makes new tick dispatches work for every future TEST job, including other sessions' runs. **Clearing the 8 rows is a TEST data change and
stays the founder's call** (Open Question 3); the build did not touch them.

**What the test does about it.** `P1608_DISPATCH=auto` (default): wait 90 s after a job's `not_before` for the normal chain; if the job is
still pending, post its id to the worker's `/process` with an identity token and record "dispatch NOT exercised" in the report.
`chain` never posts; `direct` posts at `not_before`. It never calls `/sweep` and only handles its own event's round jobs. The room-end job of
its own event is left alone and deleted with the event.

### Chromium facts (probe: `node scripts/p1608-chromium-probe.mjs`, blank local page, Playwright 1.64 Chromium, exit 0)

| Fact | Measured |
|---|---|
| File flag belongs to the process | **Confirmed.** Two browsers launched with different files each heard their own (440 Hz, 880 Hz); two contexts of one browser both heard the first file. Spec's one-browser-per-person stands. |
| `--use-fake-device-for-media-stream` required | **Yes.** With only the file flag the page heard silence, not the file. (This probe may open the real microphone for 2 s in memory; it printed silence.) The preflight catches a missing flag anyway: removed on purpose, it failed with correlation 0.16 to 0.29 against a pass of 0.98. |
| `%noloop` | **Confirmed.** 3 s file: tone in the first second window, silence from 4 s on; without `%noloop` the tone returns (control). |
| Second `getUserMedia` | **Depends on constraints.** With the app's `{ audio: true }` the second capture does NOT restart the file (it continued at the first stream's position); with echo cancellation, noise suppression and auto gain off it does restart. Stable over 2 runs. Mostly harmless here (the app opens one capture), but a reloaded capturing page would continue, not restart, so reading threads from the host's browser (never a capturing one) stays right. |
| Default audio processing alters the file | **Yes.** On a steady tone pair, default processing cut the loud tone to 0.15 of its unprocessed level and the quiet one to 0.16 (noise suppression removes steady tones, which is why the probe's other checks run with processing off). On real speech (clip A, 5 to 35 s) default capture RMS was 4.4 x the unprocessed capture, whose peak was only 0.08 (the unprocessed fake capture is about 18 dB below the file). So the app hears an automatically levelled version; the bleed must be checked on the captured audio, below. |

The 6 s excerpt correlation of the preflight is scored on loudness envelopes (level-independent), so the processing does not defeat it.

### Corpus

- **Licence:** read on https://groups.inf.ed.ac.uk/ami/corpus/license.shtml on 2026-11-04: "released under the Creative Commons Attribution 4.0 license (CC BY 4.0)". Attribution is in `e2e/p1608/corpus.json` and printed in every report. The clips are modified (cut, resampled, mixed); the attribution says so.
- **Meeting `TS3010c`, speakers A, B, C** (headsets 0, 1, 2), chosen as the first of 86 meetings whose annotations supply 8 isolated phrases per speaker. Phrases come from the AMI human word annotations (`ami_public_manual_1.6.2`, sha256 in corpus.json). Phrases Whisper did not hear (3 of 24 on the first pass) are listed in `e2e/p1608/excluded-phrases.json` and replaced.
- **A cut-short download once halved a headset (Headset-0 arrived as 51 of 68 MB) and made 5 of A's 8 phrases silent; Whisper caught it.** `fetch` now compares the byte count with Content-Length.
- **Whisper re-verification (local, `~/.agents/bin/transcribe`, independent of Gemini), source clips:** own phrases heard A 8/8, B 8/8, C 8/8 (`scripts/p1608-verify-phrases.ts`, exit 0); another speaker's phrases heard in the same clip 6/8 to 8/8 (the -12 dB bleed is audible).
- **Bleed on the captured audio (Chromium playing each clip through `getUserMedia({audio:true})`, 245 s each, saved outside the repo, then local Whisper):** own phrases 8/8 in all three; the other two speakers' phrases heard 8/8, 8/8, 8/8, 8/8, 8/8 and 7/8. So browser processing does not remove the quiet copy. This is a desktop-Chromium result; the spec's check on the real captured archive still runs in the first live run.
- Audio is in `~/.cache/cp-p1608-ami` only. `git ls-files` shows 2 audio files, both older (a sting and a celebration sound); none from this build.

### Assertion, guard and control evidence
Recorded in the build report: 28 unit tests (matcher with all five assertion controls, refusal guard, preflight scoring), refusal on production, hosted and no-opt-in, preflight failure with the flag removed, `--list` default vs explicit, exclusive-spec classification (the new spec is not server-wide; control: the P1592 spec is), and a free dry run. The rule-off control's free self-test passes (rule off: every track carries 240 of 240 s, rule on: 86 to 103); its paid mode is unrun.

### Product observations (not fixed, per scope)
1. The tick stamps `dispatched_at` before dispatching, so a lost dispatch is never retried by the tick (the migration comment says the worker's `/sweep` retries it, but nothing calls `/sweep` on TEST). Worth a bug.
2. Missing vault secrets are reported only as a database WARNING; no job error is recorded.

## Open Questions

1. `[FOUNDER DECISION: pass bar]` Default set here: at least 5 of 6 phrases per person and zero under the wrong person.
   Strict on misattribution, loose on one Gemini slip. Say if you want 6 of 6.
2. ~~Why the 2026-11-02 jobs stayed pending~~ Answered in Build findings: the vault has no `enqueue_room_transcription_*` secrets.
3. `[FOUNDER DECISION: stale TEST jobs]` Whether to clear them before repairing dispatch, once their count and cost are known.

## Related

- P1596 (the pipeline under test, benchmark, known limitations), P1592 (round threads), P1603 (hidden events)
- P1607 (parallel e2e slots, whole-server runs), P1152 (physical-device verification, what stays out of scope here)
- decisions.md 2026-11-03 (self-hosted TEST), 2026-10-29 (TEST holds AI keys), 2026-11-02 (a round's words stay with the round)
