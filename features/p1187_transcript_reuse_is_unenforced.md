---
status: backlog
type: task
rank: 240
workstream: infrastructure
created_date: '2026-08-28'
tags: [transcripts, caching, points-pipeline, correctness]
delivery_stage: create-spec
pipeline_ran: [create-spec]
drafted_by: opus
exec_model: opus
exec_effort: high
driver: anomaly
---

# P1187 — Transcript reuse is unenforced: P1140's retention guarantee silently stopped holding, and diarization has no store at all

## Problem

**Situation:** [P1140](done/2026-06-10/p1140_transcript_retention_for_quote_reverification.md) shipped a
transcript store at `~/.local/share/yt-store/` so a published quote stays re-verifiable against the
**exact bytes** it was checked against. Its first Done-When is ticked:

> - [x] A transcript fetched by `/points-prepare` is still readable, byte-identical, in a later session

**Complication: that ticked criterion is false in production use.** Measured across two sessions and
~15 transcript fetches (2026-08-27/28): the store served **zero** hits and was **never written to** —
it held 11 videos throughout, all from an unrelated earlier session. Three stacked causes, in the
order a caller meets them:

| # | Cause | State |
|---|---|---|
| 1 | `classify()` knew `--write-auto-subs` but not `--write-auto-sub` (both accepted by yt-dlp) → `NOCACHE unrecognized flag`, bypassing the store in **both** directions | **FIXED** 2026-08-28; all aliases route to the same `out[]` key |
| 2 | Subs mode requires `-o` to be exactly `PREFIX%(id)s.%(ext)s`. Undocumented anywhere a caller reads. A natural `-o "harari.%(ext)s"` → `NOCACHE unsupported -o template shape` | **OPEN** |
| 3 | With cause 1 fixed **and** the canonical `-o` shape, a fetch of a video that **is** in the store still re-fetched — no hit logged, count unchanged. Hypothesis: `sub_langs` key mismatch between the saving and reading session | **OPEN, untested** |

**And diarization has no store at all.** Five speaker-labelled transcripts (~$2 of API spend, ~40 min
of audio downloads) were produced into a **session scratchpad** that is deleted on session exit.
Rescued by hand into `~/.local/share/diarize-store/<video_id>/<start>s+<duration>s.json`; that
directory now exists with a README, but `~/.agents/bin/diarize` **does not write to it** — callers
must copy by hand.

**The unifying defect, and why both went unnoticed for two sessions:** every refusal is computed, sent
to a control channel, and the fetch then **succeeds normally**. Nothing errors. The only symptom is
paying twice. An adversarial review named the rescued store *"a documented convention nothing enforces
— the same defect class it claims to fix."*

**Question:** How is local-first transcript reuse made to actually happen, rather than hoped for?

> Founder framing, verbatim — the word *programmatically* is the requirement:
> *"future skills need to somehow, before calling transcript, before calling YTDOT or before
> downloading an audio and diarizing it I think they should first look locally and how do we enforce
> it programmatically so that it actually happens and we don't hope that they do it but it actually
> happens"*

## Appetite

Blast radius: **high** — a wrong cache hit would serve one video's transcript for another's, silently,
into quote verification, and this pipeline publishes verbatim quotes under real people's names.
Reversibility: high for the store code (`git revert`); **not** reversible for a misattributed quote
already published. Decision density: zero — direction is recorded below.

## Invariants

- **A quote must remain re-verifiable against the exact bytes it was verified against.** This is
  P1140's whole purpose and it survives any redesign here.
- **Correctness before hit-rate. A store that misses is an expense; a store that lies is a published
  misattribution.** Where the two conflict, miss.
- **Both tracks are retained, never just one.** `decisions.md` 2026-08-25 (P1140 planning) measured
  that *"the raw caption file returns 0 hits for a genuine quote in every case"* — raw is needed for
  timecodes and turn boundaries, cleaned for `grep -F`. Storing one is storing neither.

## Solution

Direction only; the implementing session picks mechanism.

**(a) Close cause 3 and neutralise cause 2.** Diagnose the miss on a stored video; make a natural `-o`
either work or say loudly that it will not.

**(b) Make `diarize` write its store, and read it, in the SCRIPT.** Not in a caller convention.
`/slava:util:diarize` already names this as *"the fix"*; it simply is not done.

**(c) Make the bypass visible where it cannot be made impossible.** `classify()` already computes
`NOCACHE <reason>` on **every** call. Surfacing that one line would have exposed all three causes on
the **first** fetch instead of after two sessions. This is the cheapest item here and probably the
highest-value.

**(d) Re-read the fail-open design against this repo's own ruling.** The store is documented to
*"fail open, always — anything `yt-store-lib.py` cannot confidently classify runs the ladder
untouched."* That is defensible for a cache. But `decisions.md` **2026-08-16 [technical]** rules that
*"a parse whose result feeds a safety decision is a defect whenever 'empty' is also the permissive
answer."* Because this store also underwrites **quote re-verification**, it is not purely a cache —
decide explicitly which of the two it is, and record the decision.

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| **The alias fix is safe VACUOUSLY, not structurally** — aliases agree because *nothing* hits | MITIGATE | The collision property is untested and becomes load-bearing the moment hits begin. Required test already written in `pp/docs/infra/youtube.md`: with hits working, the three alias spellings must **HIT** one entry while human-vs-auto, `en.*`-vs-`de.*` and `vtt`-vs-`srt` each **MISS** it |
| Enabling hits before that test could start serving wrong bytes | DEFER | Do not enable hits until both halves of the collision test pass |
| Cleaning is still improvised prose, so "the cleaned track" is not a stable artifact | ACCEPT | Out of scope here, but it bounds what the store can promise — retain raw as the authoritative copy |
| A new guard refuses legitimate work | MITIGATE | epistemic gate 7c — run the tools' own documented workflows through it before shipping |
| The store spans two repos (`pp` code, `cp` consumer) | ACCEPT | Stated so the implementing session expects it |

**Non-Goals**

- Do **NOT** solve this with a prose instruction in a skill file. That is the failure mode, not the
  fix — and this repo already enforces git safety with real scripts while this pipeline enforces
  everything with markdown asking nicely.
- Do **NOT** weaken per-quote speaker confirmation or any Gate 0 threshold as part of this.
- Do **NOT** commit transcript **content** to any git-tracked path — P1140's Done-When forbids it and
  that box is still valid.

## Done-When

- [ ] A transcript fetched in one session is served **from the store** in a later one — P1140's
      Done-When box 1 re-verified by an actual cross-session read, not asserted
- [ ] `diarize` writes its store on every successful call and reads it before spending, **in the
      script** — demonstrated by a second identical call costing nothing
- [ ] **Failure path exercised** (gate 7): the three alias spellings HIT one stored entry, while
      human-vs-auto, `en.*`-vs-`de.*` and `vtt`-vs-`srt` each MISS it. Both halves pass, output pasted
- [ ] **No false positives** (gate 7c): each tool's own documented workflows run through the new
      behaviour and still succeed
- [ ] A bypass is visible at the moment it happens — a run that does not use the store says so on one
      line, rather than succeeding silently
- [ ] The cache-vs-safety-artifact question in Solution (d) is answered in writing

## Alternatives Considered

- **Instruct callers in skill prose to check the store first.** Rejected — that is precisely what
  exists today for `diarize`, and it is what the adversarial review named as the defect.
- **Commit transcripts to the repo.** Rejected — P1140 explicitly forbids transcript content in
  tracked paths.
- **Leave it; re-fetching is cheap.** Rejected on the invariant, not on cost: re-fetching can return a
  *different* caption track than the one a published quote was verified against.

## Rollback Strategy

Store code is in `pp` (`scripts/yt-store-lib.py`, `~/.agents/bin/diarize`); `git revert` restores
current behaviour, which is "always fetch" — degraded but safe. Anything already written to either
store stays readable; neither format changes.

## Related

- **P1140** — shipped the store; its ticked Done-When box 1 is the thing this spec found false.
- `decisions.md` **2026-08-28 [technical]**, *"Correction — 'auto-captions contain none' is
  over-generalized from n=2, and expensive results silently failed to persist in two tools"* — the
  measurements.
- `decisions.md` **2026-08-16 [technical]** — the empty-is-permissive ruling behind Solution (d).
- `decisions.md` **2026-08-25** (P1140 planning) — no cleaning program; raw returns 0 hits for genuine
  quotes.
- `pp/docs/infra/youtube.md` — the three causes and the required collision test.
- P1164 · P1167 · P1171 — the pipeline work that surfaced all of this.

## Open Questions

1. Is this store a **cache** (fail-open correct) or a **safety artifact** underwriting quote
   re-verification (fail-closed correct)? It is currently documented as the first and used as the
   second. Solution (d).
2. Should `diarize` store the **audio** as well? Downloads cost minutes and are IP-gated; five
   downloads this session took ~40 minutes. Not assessed.
