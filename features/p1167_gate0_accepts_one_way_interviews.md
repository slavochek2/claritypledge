---
status: in-progress
type: task
rank: 74
workstream: infrastructure
created_date: '2026-08-27'
tags: [skills, points-pipeline, attribution, correctness]
delivery_stage: dev
pipeline_ran: [create-spec, dev]
drafted_by: opus
exec_model: opus
exec_effort: high
driver: anomaly
---

# P1167 — Gate 0 accepts one-way interviews via a new `turn-verified` attribution basis

## Problem

**Situation:** `/slava:disagreement:select` Gate 0 hard-rejects every multi-speaker source. Three later
stages in the same chain already accept them: `positions.md:115-117` defines **three** attribution
bases and only `turn-inferred` is a stop; `publish.md:45` stops only on `turn-inferred`;
`docs/points-process.md:229` carries the enum. `positions.md` also carries a correction dated
2026-08-17 stating that the only cross-camp-split example ever produced came from **two speakers
inside one video** — a result a hard single-speaker Gate 0 makes unreachable.

**Complication:** The source class Gate 0 rejects is the one the room needs. Most credible AI-safety
material is interview-format. Measured on the seed source this session (`_V_ed5fuexA`, Harari,
2886s): the host holds **17.7%** of words, the guest **82.3%**; median turn 36 words vs 75; 5 of 19
host turns end in `?`. It is a one-way interview — the host is a prompt, not an interlocutor — and
Gate 0 rejects it on the same rule that rejects a genuine two-way debate.

**Question:** How does Gate 0 admit a one-way interview without weakening the attribution guarantee
that stops misattributed verbatim quotes from being filed under a named real person's account?

> Founder framing, verbatim: *"It is a video, but the interviewer is asking questions mostly, which is
> good... So it's not like a two-way interview. It's a one-way interview. So I think it's good. And
> maybe we should be able to accept it. So maybe we should improve our skills so it can accept
> something like that too."*

## Appetite

Blast radius: **high** — this gate is the last thing between the pipeline and publishing
misattributed words under a real person's name. Reversibility: `git revert` (five doc files, no code,
no schema, no data). Decision density: **zero** — the design decision was taken in conversation
2026-08-27 and is recorded in Solution below.

## Invariants

- A quote is filed under a speaker only when that speaker's identity was **confirmed for that quote**.
  A pattern that holds across the transcript is not confirmation of any individual quote.
- `turn-inferred` remains a hard STOP at filing. This spec adds a basis; it never relaxes that one.
- Marker presence is **probed per source, never assumed** — in either direction. See P1164.

## Solution

Add a fourth attribution basis, **`turn-verified`**, rather than loosening Gate 0 into `turn-inferred`.

A multi-speaker source qualifies as `turn-verified` when **both** hold:

1. **One-way structure, measured and pasted.** One speaker holds **≥75%** of words and the other's
   turns are predominantly interrogative. The measurement goes in the run file as evidence, not as a
   claim. Below the threshold the source is a two-way exchange and Gate 0 rejects it as before.
2. **Per-quote speaker confirmation.** Each individual quote's speaker is confirmed by reading that
   quote's own surrounding turn, recorded per quote.

Rationale for (2): turn markers signal that the speaker **changed**, never **who** it changed to, so
attribution by alternation parity is inference — one dropped marker silently flips every attribution
after it. Global parity can be wrong everywhere at once; a per-quote read cannot. A run extracts a
handful of quotes, not 37 turns, so the per-quote cost is small.

Gate 0 becomes: **one voice, or one voice plus a verified questioner.**

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| A misattributed quote is published under a real person's name | MITIGATE | Per-quote confirmation is the mitigation; it is the reason this spec does not simply relax Gate 0 |
| The ≥75% threshold is unvalidated — chosen from one measurement (82.3%) | ACCEPT | Stated as a starting threshold, not a finding. Falsifier: if a source passing 75% still yields a misattribution in review, the threshold is wrong and per-quote confirmation is doing all the work |
| `decisions.md` 2026-08-19 ruled attribution is solved by source selection, not parsing | MITIGATE | This spec does not build diarization or a parser; it widens *which sources may be selected* and adds per-quote evidence. Re-read that ruling before implementing — it may rest on the same over-generalized premise P1164 now corrects |
| Depends on P1164's corrected marker handling | DEFER | Land P1164 first; this spec's probe step assumes it |
| Widening Gate 0 invites scope drift toward podcasts and panels | MITIGATE | The ≥75% threshold plus the interrogative test is the boundary, stated as a Non-Goal below |
| **The ≥75% word-share measurement is itself computed by alternation parity** — the same inference the spec declares untrustworthy | MITIGATE | Surfaced by the founder 2026-08-27. The ratio is a **screening heuristic**, not a guarantee: a dropped marker merges two turns and distorts the ratio. The actual guarantee is per-quote confirmation, which does not depend on parity. Implementation MUST state this in the gate output so the number is never read as proof. Consider corroborating the ratio by a parity-independent signal (interrogative shape, turn-length distribution) rather than trusting the count alone |
| Marker provenance and reliability are **unknown** — we do not know what makes YouTube's captioner emit them on one video and not another | ACCEPT | Deliberately tolerable **because** the design never trusts markers for identity. Per-quote confirmation holds whether markers are perfect, patchy, or absent. Documented rather than investigated: knowing the mechanism would not change the design |

**Non-Goals**

- Do **NOT** weaken or remove `turn-inferred` as a filing STOP.
- Do **NOT** accept two-way debates, panels, or podcasts with guests. The ≥75% one-way threshold is
  the boundary and it is not negotiable per-run.
- Do **NOT** build diarization or a speaker-identification model.
- Do **NOT** change cross-language rules — English-only v1 stands.
- Do **NOT** touch the seal mechanics, the prediction block, or any stage's founder gates.

## Done-When

- [x] `_V_ed5fuexA` (Harari, 82.3% one-way) passes Gate 0 as `turn-verified` and flows to filing,
      with its word-share measurement and per-quote confirmations present in the run file
      — measured 2026-08-27: literal `>>` **0**, escaped `&gt;&gt;` **36**, 37 segments, 6733 words,
      dominant-side share **82.3%** (reproduces the spec's figure exactly). ADMIT.
- [x] **The failure path is exercised** (epistemic.md gate 7): a genuine two-way source is run through
      the same gate and is **rejected**, with the measured word-share and the reason printed — a gate
      seen only to pass is unproven
      — exercised on **six** sources, two distinct rejection modes:
      *measured two-way* — `ihhmg_w1o-U` **69.1%**, `rbCQKODKv1o` **63.1%**, `YT7Io2oGCc8` **54.1%**,
      `yAgQWnD31nE` **51.8%**; *unmeasurable* — `YsgiNQKscyY` and `6yQEA18C-XI` (both genuine
      AI-safety debates, **0** markers, so shape cannot be segmented). The two modes print
      differently on purpose.
- [x] A quote whose surrounding turn does not confirm its speaker is dropped, not filed, and the drop
      is visible in the run output
      — exercised on `_V_ed5fuexA`: 2 quotes CONFIRMED via interlocutor reply (turns [10] *"one thing
      you said there"*, [32] *"you you mentioned there"*), 1 DROPPED — *"But that's the biggest
      difference."* @552s, whose both neighbours are the same side and whose next turn is one of the
      5 confirmed mid-turn markers. Drop line printed with its reason.
- [x] The basis enum is consistent across **seven** files — no stage accepts a value another rejects
      (the spec said five; `story-draft.md:67` and `run-pipeline.md:50,125` also carry it).
      Verified by repo-wide grep. No code parses `basis:` — the change is docs-only as claimed.

## Implementation Findings — 2026-08-27

Three things measured during implementation changed the design. Recorded because each one would
otherwise be re-derived, or re-broken, by the next agent.

**1. `vtt-clean` drops turn boundaries, and it flips this gate's verdict.** The raw `.vtt` for
`_V_ed5fuexA` reconstructs to **36** turn markers; `vtt-clean`'s output carries **26**. Segmenting the
cleaned file scores the source at **66.7% → REJECT**; segmenting the raw track scores it at
**82.3% → ADMIT**. Every stage that reasons about turn structure must name the raw track, the way
`positions` Step 3 already does for timecodes. `prepare.md` (v0.7.2), `positions.md` and `select.md`
were all corrected to say so. Note also that the naive grep count on the raw file is **106** — rolling
auto-captions repeat each line, so the stream must be reconstructed (strip inline `<...>` tags, drop
consecutive duplicate lines) before the count means anything.

**2. Two of the spec's own admission criteria were falsified by the seed source.** Both were drafted,
measured, and dropped as gating conditions:

| Criterion as specified | Measured on `_V_ed5fuexA` | Outcome |
|---|---|---|
| *"the other's turns are predominantly interrogative"* | **11%** of the shorter half of segments end in `?`; the short segments are **backchannels** (*"Yes."*, *"Mhm."*, *"[laughter]"*) while the questions run 22–33 words | Falsified. As a gate it rejects the source this spec exists to admit |
| *"median turn 36 words vs 75"* | **40 vs 36** under alternation parity — a 4-word margin | Too weak to gate on; the 75-vs-36 figure required correctly merged turns, which parity does not give |

Auto-captions drop punctuation, so testing the `?` glyph tests the captioner, not the speaker. The
implementation keeps **one** hard condition — dominant-side word share ≥75% — and reports the rest as
diagnostics. This is consistent with the spec's own design: the ratio was always the screening
heuristic, and per-quote confirmation was always the guarantee.

**3. A turn-count floor was added (≥10 turns).** Without it `OgOLjAVxsJc` — a monologue clip with
**2** stray markers and 3 segments — scores **92.3%** and is admitted. Checked against all eight
sources measured: the floor changes exactly one verdict, the degenerate one. Like the 75% threshold it
is **unvalidated** and labelled as such in the skill.

**Open Question 2 resolves, and in the spec's favour.** `decisions.md` 2026-08-19 does **not** rest on
the over-generalized premise P1164 corrects. It reads: *"Prefer single-speaker **or dominant-speaker**
sources."* Gate 0 implemented only the first half — so this spec is not overturning that ruling, it is
reconciling Gate 0 with it. Separately, `decisions.md` 2026-08-21 already names the strongest form of
per-quote confirmation (*"attribute by what the other party says back… cannot be forged by a caption
artifact"*), which the implementation adopts verbatim as Tier 1 rather than inventing a mechanism.

**Also confirmed, incidentally:** the mid-turn-marker finding from 2026-08-21 reproduces on a
different video — **5 of 37** segments on `_V_ed5fuexA` open mid-sentence (14%). Markers are not clean
turn boundaries on this source either, which is why the mid-turn rate is now printed as a confidence
qualifier on the word share.

## Alternatives Considered

- **Loosen Gate 0 to accept multi-speaker as `turn-inferred`.** Rejected: `turn-inferred` is a filing
  STOP, so the source would fail two stages later, more expensively. Ruling at `decisions.md:1201`
  records exactly this outcome blocking an intended prod-shaped run.
- **Use the existing `speaker-labelled` basis.** Rejected: it requires explicit speaker metadata. The
  seed source has none — markers mark changes, not identities.
- **Find a solo talk by the same speaker instead.** Viable per-run and offered to the founder; does
  not address the structural gap, since the rejected source class recurs every week.

## Rollback Strategy

Five documentation files, no code and no schema migration. `git revert` restores the prior Gate 0.
Any run filed as `turn-verified` before a revert stays valid — the basis label is recorded in its run
file, so filed runs are auditable after the fact.

## Related

- **P1164** — corrects the marker-instruction premise this spec's probe step depends on. **Land first.**
- `decisions.md:1201` — `turn-inferred` is a hard stop; durable practice is to *prefer* single-speaker
  sources. This spec keeps that preference and adds an evidenced fallback, rather than replacing it.
- `decisions.md` 2026-08-19 — attribution solved by source selection, not diarization. See Risks.
- `decisions.md:538` — carries the same over-generalized *"auto-captions contain none"* claim P1164
  now corrects. **Needs the same correction; not done here.**
- `positions.md:115-117` · `publish.md:45` · `docs/points-process.md:229` — the basis enum.

## Open Questions

1. Is the ≥75% threshold right? Chosen from a single measurement. Unvalidated.
2. Does `decisions.md` 2026-08-19 survive P1164's correction, or was it made on the same premise?
   Not assessed this session.
3. What causes YouTube's auto-captioner to emit `>>` markers on some videos and not others? **Unknown
   and not investigated.** Measured 2026-08-27: three auto-caption-only videos, one with 106 markers
   and two with zero. No manual-subtitle track on any of them, so manual-vs-auto is not the
   explanation. Not a blocker — the design treats markers as a boundary signal only.
4. **Parked:** a `/slava:disagreement:run-pipeline` run is halted at Stage 1 pending this spec —
   topic *"whether AI concentrates power or distributes it"*, room key `chiang-mai-ai-safety` from
   `.private/audiences.json`, seed `_V_ed5fuexA`. Nothing was filed; no run file was written.
