---
status: all-done
type: story
rank: 1000945.0
created_date: '2026-07-15'
tags: [gtm, key-hire, landing, stakes]
pipeline_ran: [create-spec, ship]
completed_at: 2026-07-18
---

# P992: Key-Hire Stakes Section — the cost argument, made theirs

> **Scope narrowed 2026-07-15 (with the founder).** Earlier draft framed this as "replace the static stats with a calculator" plus an emailed-report lead magnet. Both were wrong. **This section's job is the argument** — it shows the size of the cost. The personalization is a layer *underneath* the two big numbers, not a replacement for them. The lead magnet is rejected outright (see Non-Goals). See Resolved Decisions.

## Problem

**Situation:** P987's homepage (`/`) argues the stakes with two static sourced numbers rendered as giant `CountUpPercent` figures — Leadership IQ *"46% of new hires fail within 18 months — 9 out of 10 of them because of attitude, not a lack of technical skills"* (ref [1]) and Gallup *"200% of their salary is what replacing a leader costs you"* (ref [2]).

**Complication:** The section argues the cost in the abstract. Two problems compound. First, `46%` and `200%` render as visual twins in the same font at the same size, but they are not the same kind of number — 46% is a **rate** (a share of your hires), 200% is a **multiplier** of a salary that is not on screen. The reader's eye compares them (200 > 46), which is meaningless, and spends a beat resolving "200% of *what*?" — a beat stolen from the argument. Second, the impact was never in the multiplier: "200% of salary" is impressive in the abstract; "€110,400 to replace them" is impressive in the gut.

**Question:** How do we keep the section's argument big and prominent while turning the abstract multiplier into *the founder's own money* — without misrepresenting either study, and without letting the personalization become a toy that defeats the argument?

## Appetite

**Medium blast radius** — rewrites the stakes section of the live homepage; a broken section degrades the primary funnel's priming step. **Reversibility: high** — section swap, revert restores the static stats. **Decision density: medium** — structure, math, affordances, and copy discipline are settled (Resolved Decisions). Open: the **default input values** (highest-leverage decision in the spec), the multiplier bounds, and final copy.

## Solution

Rework the `#stakes` section of `program-page.tsx`. **The two big numbers stay big.** The second one becomes money.

### Structure (four beats, order is load-bearing)

1. **Size — big number 1: `46%`.** Unchanged from P987. A rate is genuinely striking as a percentage.
2. **Size — big number 2: the money.** Replaces the `200%` slot. Counts up to a euro figure, with its derivation legible at rest directly beneath it.
3. **Cause — the reframe.** Nine-out-of-ten, as prose. Redirects the founder from *recruiting* to *talking*.
4. **Delay — the clock.** 18 months. The section's close.

Beats 3 and 4 only work in this order: size alone is doom; size + cause redirects; **the delay is what makes it urgent now** — without it the honest response is "I'll deal with it if it happens."

### The math

```
money = hires × annual salary × failureRate(46%) × replacementMultiple(2×)
```

Default: `1 × €120,000 × 0.46 × 2 = €110,400`. `[FOUNDER DECISION: defaults — see below]`

**The 89% is NOT in this formula.** It re-labels the *cause*, it does not reduce the *amount*. Multiplying it in would make it a knob — just an invisible one — and add a third compound factor for an ~11% haircut on a number that stays enormous. That the number *barely moves* is the point: almost none of it is a skill problem.

### Affordances — what is draggable carries meaning

| | Control | Why |
|---|---|---|
| **Your facts** — headcount, annual salary | **Sliders.** Headcount 1–10 (integer snap), salary €10k snap. | Draggable = invited to change. A slider *encodes the roughness*: you cannot enter a number precise enough to imply precision. Typed input implies exactness the modeled figure does not have — the compound-claim risk arriving via the input. Thumb-friendly at 320px is the second reason, not the first. |
| **The research** — 46%, 2× | **Locked, stated as cited fact.** One line of hint text; click the number to reveal the control. | Prominent sliders make fiddling look like the main event and turn a claim into a toy — backwards from the section's job. Stating it as fact preserves its authority; the skeptic gets a door. Also defends trivialization: dragging to zero becomes something you deliberately reach for. |

No unlock box, no chrome. **The number is the control.** At rest the section shows: two big numbers, a derivation line, two sliders. Nothing else.

### Salary is annual, not monthly

Gallup's "200% of salary" *is* annual salary. A monthly input needs an invisible `×12` sitting between their number and the stat's meaning — precisely where drift creeps in. Label it **"annual salary"**, not "salary".

### Citation placement draws the line

The superscript goes on **the sourced clause, not the sentence**:

> You'd assume you hired wrong. Nine out of ten times you didn't — they fail on attitude, not a lack of technical skills.¹ On the thing nobody said out loud.

Ref ¹ closes after *"technical skills"*. Everything before it is Leadership IQ, in the source's own words. The final sentence carries **no citation** — visibly the founder's claim, standing on its own. A reader can see which is which. Same construction for the close:

> It surfaces within 18 months.¹ By then the roadmap's built on it.

`[FOUNDER DECISION: final wording — tone is the founder's. The citation *structure* above is not a copy choice; it is the mitigation.]`

### Open decisions

- `[FOUNDER DECISION: default headcount + default annual salary]` — **the highest-leverage decision in this spec.** Most visitors never touch a slider, so the defaults *are* the stat for ~90% of traffic. Not a starting point — the actual content. Tension to resolve: `n=1` matches the wedge (H-FounderWince's trigger is *an active key hire*, singular) and ends with the founder thinking about a specific person rather than a spreadsheet; but `n=1` weakens the floor test (below).
- `[FOUNDER DECISION: multiplier bounds]` — see the floor test. Tune against real numbers in the prototype.
- `[FOUNDER DECISION: final copy for beats 3 and 4]`

### The floor test — the pass/fail for the whole section

Drag both multipliers to their most conservative bound. **The number must still hurt.** If the floor reaches a figure the founder shrugs at, the section has *disarmed* them instead of priming them — strictly worse than the static stat it replaced. The bounds are not cosmetic; they are the mechanism.

Unresolved: at `n=1`, a 20%/1× floor lands near €24,000 — plausibly shruggable for someone hiring a €120k exec. At `n=2` it is €48,000 and still stings. The resolution lives in the bounds, and the bounds get tuned against rendered numbers in the prototype, not guessed here.

**Build path:** prototype variants under `/tree/*` (dev-gated, per `.claude/rules/src.md`) in their own worktree — new files only, so it collides with nothing P987 touches. Integrate into `program-page.tsx` on **merged main after P987 ships** (P987 owns that file), then remove the `/tree` route *and its import* (gating never strips an import).

## Risks / Non-Goals

### Risks

- **The 89% smuggle — highest risk in this spec.** Leadership IQ says 89% fail for **attitude, not skill**. It does **not** say attitude is fixable, and it does not say alignment or communication addresses it. "Fixable" is ClarityPledge's thesis. Computing a number and calling it "the fixable portion" repeats the logged incident (`docs/decisions.md:2455` — *"don't agree comms are clear"* drifted into *"don't understand their leaders"*, the page's own thesis wearing the source's citation) on the same page, with a bigger number attached. MITIGATE: the 89% never enters the formula; it stays prose in the source's own words; the citation closes on the sourced clause so the thesis stands visibly uncited beside it.
- **Paraphrase drift.** P987's copy is already the careful, verified version. Every "improvement" to those words is how the logged incident happened — one harmless-looking rewrite at a time. Rejected in review already: *"it's not the résumé"* (drifts "technical skills" → credentials/experience); *"you won't know for 18 months"* (the source says failure *occurs* within 18 months, not that you *learn* at 18 months). MITIGATE: sourced clauses are verbatim from P987; treat any reword of a cited clause as a change requiring re-verification against the study.
- **Compound-claim overreach.** `46% × 2×` is a modeled figure neither study asserts. MITIGATE: frame as *their* rough estimate ("roughly"); derivation legible at rest under the number; each factor keeps its own citation; sliders snap coarsely so no input implies precision; never restate the product as a sourced stat.
- **Trivialization / self-disqualification.** A founder drags the risk to ~zero and leaves unprimed. MITIGATE: the floor test; locked-by-default multipliers; cited defaults prominent.
- **The section cannot close on price.** Cost-of-fix vs cost-of-failure is the argument that writes itself, and it is a Non-Goal here. ACCEPT — deliberate: **the section closes on the clock, not the money** (beat 4), then hands off to the CTA.

### Non-Goals

- **Do NOT build email/report lead capture. Rejected, not deferred.** This section sits *before* the CTA; an "email me the report" button places a second capture beside the primary CTA — two competing actions, which `.claude/rules/visual-qa.md` blocks outright ("at most ONE full-width primary button per view"). The founder about to book gets a lower-commitment out: it doesn't add to the funnel, it leaks from it. The capture already exists downstream — the CTA leads to **P989**'s qualification gate, which takes contact details anyway; a leads table + edge function + Mailgun template would be a second path to the same data. **Revisit condition:** if this ships and CTA rate does *not* move, a lead magnet is a different bet deserving its own spec written from that evidence.
- **Do NOT make the 89% a variable.** It is the punchline, not a parameter. A slider invites "eh, maybe 50% for me", which destroys the reframe and adds a third control to a section fighting to stay clean.
- **Do NOT shrink the two big numbers.** The section argues the cost; the numbers *are* the section. The personalization is a layer beneath them.
- **Do NOT alter the sourced stats' attribution.** Leadership IQ [1] and Gallup [2], as cited in P987. Restating "200% of salary" as "2× salary" is a **units** change (arithmetically identical, attribution intact) and is in scope; any change to a cited clause's *wording* is not.
- **Do NOT build P989's pre-qualification questionnaire here.**
- **Do NOT ask a self-assessed gap/need question** — the calc uses the research rate, not self-diagnosis.
- **Do NOT show the coaching price.**
- **Do NOT ship a prod-reachable `/tree` route.**

## Resolved Decisions

| Decision | Resolution | Reason |
|---|---|---|
| Calc replaces the stats? | **No — stats stay big; calc is a layer beneath.** (Revises an earlier "calc replaces both".) | The section's job is the *argument*. The numbers are the section. |
| Which slot becomes money? | The `200%` slot. `46%` unchanged. | 46% is a rate (striking as a %); 200% is a multiplier of an absent salary. The impact was never in the multiplier. |
| `200%` or `2×`? | Neither in the big slot — **money**. `2×` survives in the derivation line. | "200" has mass, "2×" has legibility; the tension dissolves once the slot shows euros. |
| Multipliers: sliders? | **Locked, click-to-reveal. No box.** | What's draggable is what you're invited to change. Prominent sliders turn a claim into a toy. |
| Inputs: typed or sliders? | **Sliders.** (Revises an earlier "typed".) | Typed implies precision the modeled number lacks — compound-claim risk via the input. Sliders encode roughness. Mobile is the second reason. |
| Salary period? | **Annual.** | Gallup's stat is annual salary; monthly needs an invisible ×12 — a drift vector. |
| 89% in the formula? | **No.** Prose only. | It re-labels the cause; it doesn't reduce the amount. In-formula it's an invisible knob for an ~11% haircut. |
| Where does 18 months go? | **After the reframe — the section's close.** | Size → cause → delay. The delay is what makes it urgent *now*; it also lets the section close without the price. |
| Emailed report? | **Rejected** (see Non-Goals). | Competes with the CTA it's meant to prime; duplicates P989's capture. |

## Done-When

- [ ] The `#stakes` section on `/` shows two big numbers: `46%` (unchanged) and a live money figure in the former `200%` slot (on merged main, post-P987)
- [ ] Headcount + annual salary sliders drive the money figure live; derivation is legible at rest beneath it
- [ ] Multipliers default to the cited values (46% / 2×) with Leadership IQ + Gallup visible, locked, and revealed by clicking the number
- [ ] The floor test passes: both multipliers at their most conservative bound still yields a figure the founder cannot shrug at
- [ ] The 89% appears as prose only — absent from the formula, in the source's own words, with the citation closing on the sourced clause
- [ ] The section closes on the 18-month clock, then hands to the CTA
- [ ] No `/tree` prototype route **or its import** remains after integration
- [ ] Visual-QA pass at 375 / 320 / desktop per `.claude/rules/visual-qa.md`

## Acceptance Criteria

- [ ] A visitor sees a personalized money figure built from their own inputs, with the derivation visible — not a generic multiplier
- [ ] Both multipliers are visibly sourced, default to the cited values, and are adjustable only via a deliberate reach
- [ ] Nothing on screen presents the money figure as a published research finding, and no uncited clause sits inside a citation's scope
- [ ] A founder who drags everything to the most conservative position still faces an uncomfortable number

## UX Notes

- **States:** default (defaults filled, money already large), dragging (live recompute), multiplier-revealed.
- **At rest:** two big numbers, one derivation line, two sliders, the reframe, the clock. Nothing else.
- **Mobile-first** — sliders must work one-thumbed at 320px; the money figure must not overflow at max inputs (10 × €300k → €2,760,000).
- **Explorable, not gated** — public priming; no login, no wall.
- **Count-up:** reuse `CountUpPercent`'s treatment for the money so the section keeps P987's visual voice.

## UI Contract

| Element | Value | Context |
|---------|-------|---------|
| Big number 1 | `46%` + P987 copy verbatim, ref [1] | unchanged |
| Big number 2 | live money figure, €, count-up, framed "roughly" | replaces the `200%` slot |
| Derivation line | `1 key hire × €120,000 × 46% fail × 2× to replace` | at rest, under the money |
| Slider: headcount | 1–10, integer snap, label `[FOUNDER DECISION]` | your facts |
| Slider: salary | €10k snap, range + label `[FOUNDER DECISION]`, "annual" | your facts |
| Locked: failure | 46%, cite Leadership IQ [1], click-to-reveal, bounds `[FOUNDER DECISION]` | the research |
| Locked: replacement | 2×, cite Gallup [2], click-to-reveal, bounds `[FOUNDER DECISION]` | the research |
| Reframe (beat 3) | 89% as prose, citation on the sourced clause only | `[FOUNDER DECISION: wording]` |
| Clock (beat 4) | 18 months, citation on the sourced clause only | `[FOUNDER DECISION: wording]` |
| Prices | none | — |

## Related

- **P987** — owns `program-page.tsx` + both sourced stats and their verified wording. **Must merge first.**
- **P989** — the pre-qualification gate (post-CTA); owns contact capture. This section primes stakes *before* the CTA.
- `docs/decisions.md:2455` — the "thesis smuggled into a stat" incident on this page. The 89% is the same trap.
- goals.md rung 2 (raise perceived value) · hypotheses.md **H-FounderWince** · `.claude/rules/src.md` (/tree discipline) · `.claude/rules/visual-qa.md` (one primary action).
