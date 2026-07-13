---
name: video-edit-interview
description: Orchestrate a two-person interview edit end-to-end — trim, an Opus selection pass (aggressive meta-talk cuts + Pareto keep-set + reorder-for-interest, all founder-approved before any cut), apply cuts + reorder with cross-fades, question lower-thirds, and branding. Owns the interview-only judgment; calls /video-edit-talk, /video-question-beats, /video-brand-pass as sub-steps. Everything references a stable segment-identity manifest, never raw source timestamps.
when_to_use: A recorded two-person interview/conversation that needs to become a clean, reordered, branded video with question lower-thirds. NOT for a single-take linear talk (that's /video-edit-talk alone), NOT for multi-camera angle-switching (out of scope — deferred).
version: 1.0.0
---

# /video-edit-interview

Turn a raw interview recording into a clean, reordered, branded cut. This is an **orchestrator**: it sequences the existing stage skills and adds the interview-only stages (meta-talk selection, Pareto highlight, reorder, question beats) that a linear talk doesn't need. It never reimplements the sub-skills.

**Why interviews get their own lane:** session `29932534` forced the linear-talk skill onto a 71-min interview and it landed poorly — meta-talk leaked in (guest coaching the interviewer, "how much time do you have"), the audio hard-cut at question cards, cuts landed mid-sentence, branding was never wired in, and the transcript was lost + re-transcribed twice. This skill fixes the *pipeline mechanics* of that failure.

**Honest ceiling — say this to the founder up front:** meaning and negative-light judgment stay human. The skill **flags and proposes**; the founder approves the whole selection sheet before anything is cut. And single-angle footage will not reach true podcast production feel — **two-camera angle-switching is the dominant lever there and is out of scope** (see below). Frame the win as: no lost transcript, no meta-talk leak, no audio hard-cut, reordered for interest, sentence-clean, branded.

---

## The segment-identity manifest (the backbone every stage references)

`interview.manifest.json` in the project dir is the single source of truth. Every stage reads/writes it; **no stage after Stage 1 ever touches raw source timestamps.**

```json
{
  "source": "/abs/path/raw.mp4",
  "xfade": 0.5,
  "segments": [
    {
      "id": "s1",
      "src_start": 123.4, "src_end": 150.2,
      "anchor_quote": "so the first thing i",
      "state": "keep",
      "question_text": "What made you rethink the approach?",
      "order": 1,
      "out_start": null, "out_end": null
    }
  ]
}
```

- `id` — stable, assigned once at selection time.
- `src_start/src_end` — source range (advisory for re-location; see anchor rule).
- `anchor_quote` — verbatim first ~8 words. **Not unique in a long transcript** ("so I think that the thing is" recurs) — Stage 3 re-locates by matching the occurrence **nearest the advisory `src_start`**; the timestamp is the tiebreaker, never discarded.
- `state` — `keep` | `cut` | `meta-cut`.
- `question_text` — the beat label. **Nullable.** A spontaneous kept moment (a story, an unprompted claim) can carry `"question_text": null` + `"beat": "none"` — do NOT synthesize a question the guest never answered just to fill a card.
- `order` — position in the approved output sequence.
- `out_start/out_end` — **filled by Stage 3** after slicing + cross-fade accounting. This is what the beats place against. `xfade` is the named cross-fade constant, single source of truth for both the assembly overlap and the beat offset.

---

## Model routing (the honest mechanism — a skill cannot switch the session model)

Stage 2 is reflective judgment → **Opus**. Since the skill can't flip `/model`, run Stage 2 as an **Opus subagent** spawned by the orchestrator, with the transcript **inlined into the prompt** (subagents can't read the project dir off disk — a 71-min SRT is ~10k words, well within the window). The subagent **returns the manifest as a single fenced JSON block** (it can't write disk); the orchestrator parses it and writes `interview.manifest.json`. **Founder approval happens in the main session** after the subagent returns. If the founder edits the keep-set so `order` must be re-derived, that is a **second Opus subagent spawn** — never silently re-derived on Sonnet. Stages 1/3/4/5 are mechanical → run in-session (Sonnet is fine). Matches `.claude/rules/model-effort.md`.

---

## Stages

### Stage 1 — Trim  (calls `/video-edit-talk`)
Invoke `/video-edit-talk` on the raw recording. It auto-detects orchestrated mode from the presence of `interview.manifest.json` in the project dir and therefore **retains the transcript** and **suppresses its own content-cuts gate** (content selection is owned solely by Stage 2 — no double-gate). Trim does only start/end/silence here. Output: `final.mp4` + the retained verified `.srt` in the isolated (`mktemp -d`) project dir. Create the empty manifest (`source`, `xfade`, `segments: []`) before calling so orchestrated mode is detected.

### Stage 2 — Selection pass (Opus subagent) — the 3-part approval sheet
Spawn an Opus subagent with the full transcript inlined. It produces ONE markdown sheet (shown inline + saved), approved before any cut. Every row is keyed by **verbatim `anchor_quote` + advisory timestamp**; confidence is coarse **high/med/low** (a decimal from an LLM is uncalibrated noise).

**(a) Meta-talk to CUT — aggressive flags.** Per candidate: `anchor_quote · src range (advisory) · category · confidence · why-cut · recommend`. Categories:
- `self-deprecation` — puts either person in a negative light
- `about-the-video` — discussing the recording/interview itself
- `coaching-the-interviewer` — guest advising the host how to conduct himself
- `logistics-timing` — "how much time do you have", scheduling, small talk
- `reflexive-aside` — "I'm just spitballing", meta-reflection on the conversation
- `personal-offtopic` — personal asides off the throughline
- `fumble-restart` — false starts (mostly already handled by Stage 1)

**(b) Most-valuable moments to KEEP — Pareto, ranked with reasoning.** The ~20% carrying the throughline; each with why-it-lands (spikes interest / advances the argument / quotable).

**(c) Reorder proposal to spike interest — per-move reasoning + causal-dependency check.** Hook-first, tension→payoff. **Before proposing any move, scan each segment for backward references** ("as I said earlier", "the second reason", "going back to") — a segment with a live back-reference cannot move ahead of its referent; flag any reorder that would strand a reference. Part (c) is downstream of (a)+(b): if the founder edits the keep-set, re-derive order (second Opus spawn), don't ship a stale sequence.

Each kept segment MAY get a `question_text` (the actual question, or a concise synthesized label) — or `beat: none` if spontaneous. The orchestrator writes the approved sheet into `interview.manifest.json` (assigns `id`s, `state`, `order`, `question_text`).

### Stage 3 — Apply cuts + reorder  (`assets/assemble.sh`)
```bash
bash assets/assemble.sh --manifest <project>/interview.manifest.json \
  --out <project>/reordered.mp4 --beats-out <project>/beats.tsv
```
Slices every `state==keep` segment, reassembles in `order`, cross-fades joins with the manifest's `xfade`, **writes `out_start/out_end` back into the manifest**, and emits `beats.tsv` (one row per kept segment with non-null `question_text`, fired at `out_start + xfade` so the card doesn't slide in over a dissolve). Re-encodes each slice to uniform params so xfade can chain. Aborts if any kept segment is shorter than `xfade`.

### Stage 4 — Question beats  (calls `/video-question-beats`)
```bash
bash <question-beats>/assets/beats.sh --in <project>/reordered.mp4 \
  --out <project>/beated.mp4 --beats <project>/beats.tsv
```
Reads `beats.tsv` (derived from `out_start`/`question_text`) — never source timestamps. Sliding lower-thirds, audio ducked (never hard-cut).

### Stage 5 — Branding  (calls `/video-brand-pass`) — **GATED**
Intro card, corner logo, outro CTA. **Blocked until the outro-copy decision lands** — the outro currently hardcodes the stale co-founder hook, contradicted by the 2026-07-01 founder-wedge pivot. Do not publish the contradicted hook; confirm the current outro copy before running Stage 5. (Decision recorded 2026-07-13 in `docs/decisions.md`.)

### Stage 6 — Verify + report
Per-stage evidence; open the final; run the visual-QA pass (`.claude/rules/visual-qa.md`). Report what was verified vs. assumed.

---

## Verification (proven; re-run on real footage)

- **Reorder + timeline (the B1 regression test):** on a manifest that reorders 3 segments, cuts 1, and marks 1 spontaneous — `assemble.sh` sliced in `order`, dropped the `meta-cut`, wrote `out_start/out_end` matching the hand-computed cross-fade timeline, and emitted a `beats.tsv` whose beat times = `out_start + xfade` with the null-question segment omitted. End-to-end, the reordered segment's beat displayed at its **new** timeline position (read `out_start`, not source time).
- **Scratch isolation / transcript retention:** inherited from `/video-edit-talk` (its `mktemp -d` + orchestrated-mode SRT retention).
- **Selection sheet:** run Stage 2 on the real transcript; confirm it flags the coaching + "how much time" logistics with high confidence, surfaces the Pareto keep-set, and proposes a reorder with reasoning — as an approval sheet, no auto-cut.

---

## Explicitly OUT of scope (flag, don't build)

- **Two-camera angle sync + switching.** Real multicam work, deferred as its own skill. It is the *dominant* podcast-feel lever — so this skill is NOT "the fix for 'not a good podcast'." It fixes pipeline mechanics; genuine podcast quality still needs multicam.
- **Outro copy / offer decision.** A content/strategy call (a `/kdd`), not a pipeline fix. Stage 5 stays gated until it lands.
