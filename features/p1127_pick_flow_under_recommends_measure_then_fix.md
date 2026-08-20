---
status: week
type: task
rank: 49
created_date: '2026-08-20'
tags: [infrastructure, skills, pick-flow, measurement]
delivery_stage: create-spec
pipeline_ran: [create-spec]
driver: anomaly
---

# P1127: `/pick-flow` still under-recommends — the founder adds back the steps it drops

> **Title superseded by the phase 1 measurement (2026-08-20).** The founder added steps in
> Feb–Apr and **removes** them from May onward (**2 add : 5 remove** in the post-April census,
> Fisher one-tailed **p = 0.00175**). The rate itself is not distinguishable from the 14% regex
> estimate at these sample sizes. See **Phase 1 Result** below before acting on anything in Problem.

## Problem

**Situation:** the founder asked, on 2026-08-20, *"how often was pick-flow wrong… maybe with
that we can think how to improve it."* The session that followed answered a different question
and drifted onto a bookkeeping mechanism (P1125, rejected). The original question was then
measured directly.

**The measurement — one probe, not yet independently reproduced.** Every `/pick-flow` invocation
across local transcripts, both invocation channels, taking the first genuine founder turn after
the recommendation. **Treat every number below as this probe's output, not as established fact:**
two earlier versions of it produced garbage (one counted a single invocation channel; one mistook
the injected skill body for the founder's reply), and no second method has reproduced 292. Phase 1
re-derives it.

```
probe A (this session)      292 turns : 138 accept (47%) / 40 push-back (14%) / 114 neither (39%)
probe B (independent build) 250 turns : 252 invocations across both channels
```
**The two builds disagree and the corpus size is unsettled.** Probe B excludes `isSidechain`,
counts only the two invocation channels, and spans all 20 `*claritypledge*` project directories.
Probe A's extra ~41 are likely bare prose mentions counted as invocations. Do not cite 292 as
established — Phase 1 settles it.

**14% is a floor, not a ceiling — the opposite of what an earlier draft claimed.** An independent
reviewer hand-read 15 of the 114 "neither" turns and found at least 4 unambiguous step-adding
push-backs the keyword classifier missed (*"lets do /ascii flows first"*, *"what optimizes for
quality and susitanbiltiy and relaibiltiy? did we pick the best flow?"*). Across the corpus, **53
turns name a specific skill** against the 40 the classifier called push-backs. The real rate is
higher than 14%, and any stopping rule calibrated as though 14% were a ceiling would be reading a
floor backwards.

**A second, independent build of this corpus gets 252 invocations / 250 turns, not 292.** The
likely contaminant: a probe keyed on the string `/pick-flow` in a user turn also matches
CLAUDE.md's injected context (*"Run `/pick-flow` to choose a development flow"*), which appears in
**1111** main-chain user messages. Roughly 19 of 250 "founder turns" are also not turns at all —
task notifications, interrupt markers, `Tool loaded.`. Phase 1 must rebuild the frame before
drawing: two invocation channels only, `isSidechain` excluded, prose mentions excluded, non-turn
artifacts filtered.

**The direction matters more than the rate.** In the push-back sample, the founder is almost
always *adding* quality steps the router left out, not removing them:

> *"imho it should be a bit more htought about .. it has ux? /ux , /ui? but before maybe we do
> /ascii-flows?"*

> *"but kanban has to work.. dont you think we need to do it proeprly with architect analzing
> .. test etc or not?"*

> *"wait but what about create-spec and having /view engaged? this is all a lot about front?"*

**Complication:** the *direction* matches a failure already recorded on 2026-04-02 — though not
the same steps: that entry records the founder injecting **diagnosis** steps, where these are
**design and build** steps. Same direction, different steps; "the same failure" overstates it, when 20 sessions
were reviewed and the finding was that `/pick-flow` optimized for the lightest flow while the
founder manually injected diagnosis steps in 5+ of them. The remedy was v2.0.0's inversion —
quality steps in by default, opt out explicitly.

**Two things must not be stated as fact here, because neither has been established.** That the
inversion *stopped holding* rests on the same regex estimate this spec elsewhere calls
unreliable. And that v3 undid it is a guess: v3's recorded cause was agent non-compliance with
Step 0, not a re-fix of the quality bias — though its replacement principle (*"no risk, no
step"*) does bias toward omission whenever a risk goes unarticulated, which is why RQ4 exists.
Both are hypotheses for phase 1 to test, not premises it may assume.

**Question:** is the under-recommendation real at a rate worth fixing, and if so does it come
from v3's "no risk, no step" principle, from the risk examples being too narrow, or from
something else?

## Appetite

Low blast radius for the measurement phase (read-only over transcripts). Medium for any fix —
`/pick-flow` is the routing entry point, and the last two attempts to fix this exact failure
both regressed. Fully reversible. **High decision density:** whether to change the default bias
of the routing skill is a founder call, not an agent call.

## Approach

Two phases, gated. **Do not start phase 2 before phase 1's number is in front of the founder.**

**Phase 1 — settle the rate by hand.** The 14% above comes from a regex classifier, and at
least two of ten inspected samples are misfiled accepts (*"ok lets go — no need to ask"* caught
on "no need"). Hand-classify a random 50 of the 292 by reading each turn and the flow it
followed. This is the method the 2026-08-19 review-gate decision used to overturn a
frequency-based premise, and it cost one sample.

**Phase 2 — locate the cause, then decide.** For the confirmed push-backs, record which step
was added or removed and whether the spec's risks were articulated at routing time. Only then
propose a change, and score any proposal against the 2026-06-25 gate rule (canary +
forgery-proof boundary + mechanical choke-point) before building it.

## Research Questions

1. What is the hand-classified push-back rate, and its confidence interval at n=50?
2. Of confirmed push-backs, what fraction *add* steps versus *remove* them?
3. Which steps are added most often? (`/ux`, `/ui`, `/architect`, `/view`, `/ascii-flows` all
   appear in the raw sample.)
4. In those cases, had the spec articulated a risk the step would address — i.e. is v3's *"no
   risk, no step"* firing correctly on a thin spec, or firing wrongly on a full one?
5. **[Largely unanswerable — record the limit, do not chase it.]** The local transcript corpus
   begins 2026-04-02, the same day v2's inversion landed, so the pre-v2 era it would need as a
   baseline does not exist and the v2-only window is about three days. At best this is a small
   v2-window against a large v3-window. Note also that v3's recorded cause was agent
   non-compliance with Step 0, **not** a re-fix of the quality bias — so "v3 undid v2" is a
   hypothesis, not background fact, and the Complication above should be read that way.
   Localization must therefore come from RQ4 (was the risk articulated) and RQ6 (path class).
6. **[Premise corrected.]** An earlier draft said `/pick-flow` has "only one skip clause". False —
   it has at least five (`:40` lean check, `:69` spec gate, `:108` "Safe to skip", `:112` light
   flow, `:132` infrastructure gate), and the infrastructure gate's scope is
   `.claude/commands/`, `.claude/rules/`, `.claude/hooks/`, `CLAUDE.md`, `scripts/` — not
   `.claude/**`. The live question stands: does push-back concentrate in path classes no skip
   clause covers (`src/`, copy, specs, plans)?

## Time Box

Phase 1 is one hand-classified sample of 50.

**There is no numeric stopping threshold, deliberately.** An earlier draft of this spec set one
at 8%. That number was invented — it appears nowhere else in this repo — and n=50 cannot resolve
it: at the 14% regex estimate the 95% interval is roughly ±10 points, so 8% sits inside it and
any result would license either conclusion. That is precisely the *"threshold uncalibratable"*
alternative `decisions.md` 2026-04-02 rejected, which this spec cites in its own References.

The stopping rule is qualitative instead: **stop if the confirmed push-backs do not concentrate
on a nameable cause** — a specific step, a specific spec shape, or a specific path class. A rate
without a locatable cause gives phase 2 nothing to change, and "change the bias again and hope"
is forbidden by the Non-Goals. If a rate estimate is later wanted to a stated precision, size the
sample to that interval rather than reading it off n=50.

## Deliverable

A `decisions.md` entry carrying the hand-classified rate, the add-versus-remove split, and the
most-added steps — recorded whether or not it justifies a change (epistemic gate 8). If it does
justify one, a follow-up spec with the proposal scored against the gate rule.

## Risks / Non-Goals

### Risks
- **The probe has been wrong three times in one session.** First attempt counted one invocation
  channel only; second mistook the injected skill body for the founder's reply; third produced
  the numbers above. MITIGATE: phase 1 is hand-reading, and the sample must be drawn from the
  full corpus with the drawing method stated.
- **Scoring a router against founder push-back conflates two things** — the router being wrong,
  and the founder changing their mind. MITIGATE: classification records which, and turns that
  cannot be told apart are counted as unclear rather than as either.
- **A third attempt to fix the same bias may regress like the first two.** ACCEPT for phase 1
  (measurement only). For phase 2, the gate-rule scoring is the guard.

### Non-Goals
- Do **NOT** change `/pick-flow` in phase 1. Measurement only.
- Do **NOT** propose adding steps back by default without the cause analysis — that is the 2026-04-02
  remedy re-proposed, and it is exactly the "re-proposes a shipped-and-decayed control" failure.
- Do **NOT** touch the pipeline-tracking fields — that is P1126.
- Do **NOT** start phase 2 while the **pending P1116 `/pick-flow` edit** is unresolved
  (`decisions.md:121` — *"Status: proposed — the `/pick-flow` edit is a skill change and needs
  founder approval before it lands"*). Phase 1's corpus is pre-edit; if that edit lands in
  between, RQ4 and RQ6 are pinned to wording that has moved.
- Do **NOT** use an agent's summary of a past session as evidence for a classification. Read the
  turn (epistemic gate 9).

## Done-When

**Phase 1 complete 2026-08-20** — result recorded in [decisions.md](../docs/decisions.md)
2026-08-20 *"`/pick-flow` push-back measured by hand"*. Reproducer:
`scripts/archive/20260820-p1127-pickflow-frame.py`. Full classification (rubric, all 50 sample
verdicts, the 16-event post-April census, the blind rater's verdicts, and the reconciliation):
`.private/docs/p1127-classification.json`.

- [x] 50 founder turns hand-classified, raw counts pasted, and the draw **reproducible**:
      `random.Random(1127).sample(...)` with `(ts, file, idx)` ordering, over a **471-event** frame;
      corpus `~/.claude/projects/*claritypledge*/*.jsonl`. Stratified: 50 from the 361 events the
      first frame had, 20 from the 108 added by a **third invocation channel the spec never named**
      (`<command-name>/slava:build:pick-flow</command-name>` — invisible to a `/pick[- ]flow` regex
      *and* to wrapper-stripping; **106 events, 22% of the corpus, were missing on the first pass**).
      **Correction to this item's premise:** the two worktree project dirs contain `/pick-flow`
      only in `attachment` lines — **zero** founder invocations — so globbing the main directory
      drops nothing. The real silent-drop risk was `entrypoint`, which is absent in pre-March
      transcripts and deleted the entire February corpus on the first build.
- [x] Push-back rate reported with its interval, and explicitly compared against the 14% regex
      estimate — stratified **21.9% [13.2–30.7%]** on the regex probe's own denominator, **30.8%** on
      eligible events. **14% falls inside the interval**; these samples cannot establish it is too
      low, so the spec's "14% is a floor" reads as *unproven*, not confirmed. Note stratum B (the
      deliberate standalone invocation) pushes back **47%** vs stratum A's **26%** — a probe that
      samples one channel misestimates in a known direction.
- [x] Add-versus-remove split reported, with the most-added steps named — **15 add : 1 remove**
      pre-May; **2 add : 5 remove** in the post-April census, deduped by reply turn (Fisher
      one-tailed **p = 0.00175**).
      Most-added: diagnosis/5-why, `/ux` + `/ascii-flows`, a heavier spec skill, `/generate-tests`,
      `/verify`, code review.
- [x] For each confirmed push-back, recorded whether the spec articulated the relevant risk at
      routing time — **10 of 15 named a step the recommendation never mentioned at all.**
- [x] Pre- and post-v3 rates compared, or stated as not separable with the reason — **not
      separable at these sample sizes**: era cells are single-digit for v2 and v3. Only the
      pooled pre-May vs post-April direction split resolves. (RQ5's premise was also wrong: the
      corpus begins **2026-02-24**, not 2026-04-02, so a pre-v2 window does exist.)
- [x] A `decisions.md` entry exists carrying the result
- [ ] If a change is proposed: scored against canary / forgery-proof boundary / mechanical
      choke-point, with the score stated before any implementation — **phase 2, not started.**

## Phase 1 Result — read this before starting phase 2

**The stopping rule is met and phase 2 is warranted, but its premise must be inverted.**
Push-backs concentrate on a nameable cause — *steps the recommendation never named* (10/15), in
the `src/` path class no skip clause covers (13/15). But the spec's title premise is era-bound: the
founder added steps in Feb–Apr and **removes** them now (*"that overlkill…"*, *"why we need ux and
architect if we just build a prototpye?"*, *"but tits too much? … makes no sense"*). Phase 2's fix is therefore **not** "add steps back by default" — it is to make
every omission *visible* so it can be declined rather than discovered.

**Two facts bound what phase 2 is worth.** `/pick-flow` is now invoked a handful of times a month:
as a share of founder turns, 3.23% (Mar) → 1.53% (Apr) → 0.21 / 0.12 / 0.06 / 0.37% (May–Aug),
while total founder activity did *not* collapse comparably. 95% of all invocations ever are Feb–Apr.
And the pending **P1116 `/pick-flow` edit** is still `Status: proposed` (`docs/decisions.md`,
2026-08-19 entry) — this spec's own Non-Goal blocks phase 2 until it resolves.

**References:** `decisions.md` 2026-04-02 (quality-by-default inversion — the same failure) ·
`decisions.md` 2026-04-05 (v3, principles over tables) · `decisions.md` 2026-08-19 (the
review-gate decision that overturned a frequency premise with one hand-classified sample) ·
P1125 (rejected) · P1126 (the mechanical defects, separate work)
