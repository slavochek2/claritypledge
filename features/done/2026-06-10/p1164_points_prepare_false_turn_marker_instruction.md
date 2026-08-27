---
status: all-done
type: task
rank: 73
workstream: infrastructure
created_date: '2026-08-27'
tags: [skills, points-pipeline, correctness]
pipeline_ran: [create-spec, dev]
drafted_by: opus
exec_model: sonnet
exec_effort: medium
driver: anomaly
completed_at: 2026-08-27
---

# P1164 — `/slava:disagreement:prepare` instructs attribution by `>>` markers that captions do not contain

## Problem

`.claude/commands/slava/disagreement/prepare.md:106` (v0.7.0) reads: *"Auto-captions carry no
speaker labels. Attribute by content and by the `>>` turn markers, and say so."* The sentence
contradicts itself — it states the absence, then instructs the reader to use the absent thing.

Measured 2026-08-24 during P1156 on a control pair, a one-speaker talk and a two-speaker interview
probed identically: `>>` turn markers **0 and 0**, dash-dialogue markers **0 and 0**, bracketed
speaker labels **0 and 0**. Harmless for new runs, which are single-speaker by construction under
the P1156 selector's Gate 0; a run on any pre-Gate-0 multi-speaker source inherits a method that
cannot work and will silently fall back to guessing.

## Appetite

Blast radius: one clause in one skill file. Reversibility: `git revert`. Decision density: zero.

**Revised 2026-08-27:** effort raised `low` → `medium`. The original scope was a deletion; the
corrected scope is a conditional branch plus a two-branch demonstration, which is no longer a
one-line mechanical edit.

## Solution

**REVISED 2026-08-27 — see Correction below. The original solution (delete the clause) is withdrawn.**

Make the clause **conditional and evidence-bearing** instead of deleting it:

1. Probe the actual transcript for markers, searching the **HTML-escaped** form `&gt;&gt;` as well as
   the literal `>>` — a VTT stores them escaped, so a literal-only probe returns 0 on a file that
   has them.
2. **Markers present** → they mark that the speaker *changed*, never *who* it changed to. Attribution
   still requires confirming identity per quote; alternation parity alone is not attribution.
3. **Markers absent** → content-based attribution, with the existing unattributed-rather-than-guess
   rule carrying the ambiguous cases. That rule stays verbatim and is still the safeguard.

## Correction — 2026-08-27, premise revised on new measurement

The Problem above states auto-captions carry *"zero speaker labels of any kind."* **That is
over-generalized from n=2.** Re-measured 2026-08-27 against this spec's own named control pair plus a
third source:

| Video | Track type | literal `>>` | escaped `&gt;&gt;` |
|---|---|---|---|
| `lJR-7_Dcess` (one-speaker TEDx, this spec's control) | auto-captions only | 0 | 0 |
| `sRv-ETHskXI` (two-speaker interview, this spec's control) | auto-captions only | 0 | 0 |
| `_V_ed5fuexA` (Harari, 2-speaker interview, 2886s) | auto-captions only | 0 | **106** |

**The original measurement is confirmed correct on its own two sources** — it was not a probe
artifact. But all three videos are auto-caption-only, so *"auto-captions carry no markers"* is false
as a general claim: YouTube's auto-captioner emits speaker-change markers on some videos and not
others. The 2026-08-24 control pair happened to contain two that lack them, and a two-speaker control
that looks identical to a one-speaker control is consistent with *this captioner run produced no
markers*, not with *no captioner run ever does*.

**Two separate defects, both real:**

- **The generalization** (this correction) — n=2 cannot support "of any kind". Fixed by the revised
  Solution above.
- **The probe shape** — the 2026-08-24 probe searched the literal `>>` only. On these two controls
  that changed nothing (0 either way), but the same probe returns 0 on `_V_ed5fuexA`, which has 106.
  Any future re-measurement must search the escaped form or it will reproduce the wrong answer for
  the wrong reason.

**Withdrawn claim, recorded not deleted:** an earlier reading this session asserted the 2026-08-24
result was itself a blind-probe false negative. Re-running that spec's named control pair with both
spellings **refuted it** — 0 in both forms on both controls. Recorded so the same hypothesis is not
re-proposed.

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| Removing the clause reads as removing the safeguard | MITIGATE | The safeguard is the next sentence (mark unattributed rather than guess); it stays verbatim |
| A future source format does carry turn markers | ACCEPT | Re-add against a measurement then; a method claim with no evidence behind it is the thing being removed |

**Non-Goals**

- Do NOT substitute another parsing method. `decisions.md` 2026-08-19 already ruled attribution is
  solved by **source selection**, not by parsing markers out of a transcript. **2026-08-27 note:** that
  ruling should be re-read against the corrected measurement above before it is relied on again — it
  may have been made on the same over-generalized premise. Re-reading it is in scope; overturning it
  is not, and is not done here.
- Do NOT touch Gate 0, the selector, or any other stage — P1156 shipped stages 1-5 byte-identical
  on purpose, and this is a one-line correction inside that constraint, not a reopening of it.
- Do NOT edit the version-history block beyond the version bump.

## Done-When

- [x] `prepare.md` Stage 2 instructs a **probe** for markers (both `>>` and escaped `&gt;&gt;`) rather
      than asserting their presence or their absence
- [x] The instruction states that a marker signals a speaker *change*, not a speaker *identity*
- [x] The unattributed-rather-than-guess sentence is present and unchanged
- [x] Both branches demonstrated: a run on `_V_ed5fuexA` (markers present) and on `sRv-ETHskXI`
      (markers absent) each take the correct branch, with the probe counts pasted

  Fetched fresh captions via `yt --write-auto-sub` (2026-08-27) and probed the raw `.vtt` for both
  spellings:

  ```
  sRv-ETHskXI.en.vtt | literal >> : 0 | escaped &gt;&gt; : 0    → markers absent  → content-based branch
  _V_ed5fuexA.en.vtt | literal >> : 0 | escaped &gt;&gt; : 106  → markers present → change-not-identity branch
  ```

  Matches the spec's own Correction table exactly — both branches take the instruction path the
  revised Stage 2 text now names.

- [x] The `docs/process-learnings.md` entry that filed this is corrected, not merely closed — it
      carries the over-generalized claim verbatim

  Correction block appended below the original entry (kept in place, not graduated/deleted) at
  `docs/process-learnings.md` — "False `>>` marker claim in disagreement:prepare Stage 2 attribution
  instruction".

## Related

- `docs/process-learnings.md` — "False `>>` marker claim in disagreement:prepare Stage 2", filed
  2026-08-25 with the control-pair measurement and its falsifier
- `docs/decisions.md` — the P1156 entry flagging this **"Open and flagged, not fixed here"**
- P1156 — the spec that measured it and deliberately left it
