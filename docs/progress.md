# Progress

> **Charter:** doc-routing rules live in [CHARTER.md](CHARTER.md) — one fact, one home; pointers everywhere else.

The project's verifiable progress record: what was bet, what was tested, what was killed, what's live now — with instructions to verify every number. Nothing here asks to be believed; every row names its primary source.

**Last verified:** 2026-08-21 · refresh the numbers: `./scripts/progress-refresh.sh`

## Current readings

<!-- AUTO:BEGIN -->
- Registered users (prod `profiles`): **90**
- /live sessions (prod `clarity_sessions`): **229**
- Story verifications (prod `story_verifications`): **39**
- Clarity letters: RLS-protected from anonymous reads — last published figure: 18 (2026-06-02, decisions.md)
- Dated decision entries ([decisions.md](decisions.md)): **1634**
- Hypotheses registered ([hypotheses.md](hypotheses.md)): **52** (**6** active P0)
<!-- AUTO:END -->

Counts include founder-facilitated activity — see *What is NOT claimed*.

## Bets and kills

Every P0 bet carries a pre-committed falsifier written before its data arrives. Full log with dates: [hypotheses.md](hypotheses.md).

| P0 bet | The claim | Pre-committed falsifier | Status |
|---|---|---|---|
| H-LetterAsProduct | A public clarity letter spreads the practice async/virally | <3 completions after 30 days OR zero forwards | **Killed 2026-06-02.** Prod query: 18 letters, 0 async completions (R₀≈0). Threshold met → distribution transformed to coach channel, same day, across all strategy docs |
| H-FounderWince | A founder feels a real wince over an unproven bet and pulls toward a room that fixes it | Felt pull below threshold (e.g. <3/5) OR real pain consistently elsewhere (execution/funding/loneliness) → re-cut wedge/value-prop | Active — audit-demo test not yet run (discovery-by-asking retired 2026-07-07) |
| H-CoachChannel | Coaches with existing clients + a retention pain carry the instrument | First co-delivered workshop yields 0 paid conversions AND no coach markets it after ~3 co-deliveries | **Dormant 2026-07-03** — fallback if founder-direct falsifies |
| H-WTP-Pain | WTP follows reliable *revelation* of important, otherwise-unspoken gaps — not *conversion* of an already-revealed one (reframed 2026-06-10) | (1) protocol surfaces an important+unspoken gap yet the pair won't pay → conversion is the blocker (revert); (2) protocol can't reliably surface such gaps even with safe-frame + async letter → fails upstream of WTP | Active — redesigned test not yet run |
| H-PairsReturn | Pairs recognize the gap as costly and return | — | Active — 3 pairs run; protocol works; no urgency signal observed in transcripts |

## Field events

| When | What |
|---|---|
| ~2026-02 | Prague — first public talk/workshop `[FOUNDER REVIEW: date/venue]` |
| 2026-03 | Koh Phangan — "Thinking Clearly About AI" calibration meetup, Inner Space Coworking `[FOUNDER REVIEW]` |
| 2026-01→03 | 28 facilitated /live sessions (the H-WTP-Pain evidence base — [hypotheses.md](hypotheses.md)) |
| 2026-05 | Chiang Mai — AI agents meetup ([luma.com/lrskf8sh](https://luma.com/lrskf8sh)) |
| 2026-05/06 | Chiang Mai — public clarity event + 3-hour workshop (4C's) `[FOUNDER REVIEW: dates]` |
| upcoming | Chiang Mai — recorded co-presented talks + panel + Q&A |

## Evidence index

What to read depending on the question you're asking. **E** = entrepreneurial (would I back this?) · **S** = scientific (is this rigorous?) · **I** = impact (does it matter if it works?)

| Artifact | What it answers | For |
|---|---|---|
| [hypotheses.md](hypotheses.md) — transform log | What was bet, what evidence arrived, what was killed or transformed, with pre-committed thresholds | E S |
| [decisions.md](decisions.md) — 1,141 dated entries | The day-by-day decision and belief-revision record. GitHub commits are squashed per task; **this log is the auditable progression** | E S I |
| [theory-of-change.md](theory-of-change.md) | Mechanism with cited effect sizes (named studies, Ns, g-values) | S I |
| [a35 research agenda](../content/articles/a35_premature-grounding-closure.md) — §7, §10 | Pre-registered falsifiable predictions (git-timestamped) and openly stated methodological gaps, including the unsolved construct-validity question | S |
| [decisions.md](decisions.md) 2026-05-31 — novelty audits | The project attacked its own "discovery" claim against the literature and downgraded it to synthesis | S |
| [lean-canvas.md](lean-canvas.md) | Business model + the governing metric: learning velocity, with income as fourth circle | E I |
| [philosophy.md](philosophy.md) | Why it matters if it works — dyad→org→society scaling, explicitly marked thesis, not finding | I |

## What is NOT claimed

- No revenue. No retention data. No validated measurement instrument — the open methodological gaps are stated in a35 §10 rather than hidden.
- Usage counts above include founder-facilitated activity; organic adoption is not demonstrated (1 GitHub star at last verification).
- The project's most important open hypothesis (H-WTP-Pain, flagged "single most important for commercial viability" on 2026-03-18) has not had its redesigned test run as of 2026-06-07. Tracked here as a self-discipline metric.
- The societal-scale impact claim is a thesis. The dyadic effect is what the current experiments can evidence.

## How to verify

- **Numbers:** run `./scripts/progress-refresh.sh` against prod (read-only, anon key, RLS is the boundary) — or curl the REST counts yourself.
- **Progression:** GitHub history is squashed per-task by design; audit the dated, append-only [decisions.md](decisions.md) instead.
- **Reproduce the evaluation:** this project ran two adversarial clean-context screenings on itself (investor lens, researcher lens) in 2026-06. Given only the repo URL, both missed most of the table above. To run your own: evaluate from the repo alone, then re-evaluate including this index and its sources, and compare. This document's own falsifier is registered in [decisions.md](decisions.md) (2026-06-07): if pointing evaluators here doesn't change their assessment, it has failed its purpose.
