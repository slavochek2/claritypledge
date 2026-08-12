---
status: week
type: task
rank: 1000973.0
created_date: '2026-08-12'
tags: [measurement, norms, events, instrument]
delivery_stage: create-spec
pipeline_ran: [create-spec]
driver: heuristic
---

# P1055: Norm-Measurement Instrument + Event Capture Protocol

## Problem

**Situation:** The demo, the sales moment and the norm claim all rest on one move — reveal that people misperceive how willing others are to admit non-comprehension (*"you predicted 3, actually 8"*). Nothing in the repo measures whether that move can work.

**Complication:** Bicchieri (*Norms in the Wild* 2016, pp. 44–45) finds this entire class of intervention flips a **descriptive** norm and **fails** on a **social** norm — one additionally supported by normative expectations — and that *"any successful change must change **both** empirical and normative expectations."* Two failure paths, not one: people must also believe the information is accurate **and** that everyone else will actually change.

**Question:** Is gap-admission a descriptive norm (our reveal works) or a social norm (our reveal is known to fail)? Nobody knows, it cannot be reasoned out, and **four binary questions settle it in about a minute.**

### Why this exists at all — the motivation, kept in the spec deliberately

Two independent reasons, and the spec dies if either is forgotten:

1. **Epistemic.** The reveal is load-bearing for the event, the membership pitch and H-LegibilityVsCost branch (C). If gap-admission turns out to be a social norm, the demo still *feels* good in the room and produces no durable change — the worst possible failure, because it is invisible and self-confirming.
2. **Commercial.** The research dataset is a **zero-cost byproduct** of a measurement that has to happen anyway — founder decision 2026-08-12 option A ([decisions.md](../docs/decisions.md)) — which is why "we can't afford to be rigorous" is not an objection: the minimum commercially-useful capture and the minimum scientifically-useful capture are the same five questions. **Note the split:** the *before/after renewal argument* is an install artefact and lives in [p1056](p1056_install_norm_battery_and_safety_scale.md). What Tier 1 contributes commercially is narrower and should not be oversold — it is the reveal that makes the room want the thing, not a number a buyer renews on.

## Appetite

**Blast radius: medium-high.** Not code — this changes what happens in every event, and it is the measurement the strategy docs now route through. A wrong instrument produces confident numbers about the wrong construct, which is worse than no numbers.
**Reversibility: high for the protocol** (stop asking the questions), **low for the data** — inconsistent early sessions cannot be retro-fixed into a dataset, and the consent line cannot be obtained retroactively.
**Decision density: low.** The design is settled (below) and the four items are now written from the toolkit's own templates. What remains open is the vignette and the status-sanction scale — neither of which Tier 1 needs.

### Runs at event #1 — founder decision 2026-08-12

The diagnostic goes in the card for **event #1**, accepting that n≈6–8 ([goals.md](../docs/goals.md)) cannot classify anything on its own. **What event #1 buys is the protocol, not the answer**: does the room tolerate four survey questions, does the dense passage produce admissions, does the tally method work, does the capture sheet fill. Quadrant counts accumulate across events and the classification comes when the cells stop being 1–2 people. Running it late would mean discarding the first rooms and re-learning the protocol on a room that matters more.

## Approach

**This spec is Tier 1 only — free events.** It contains what gets executed at event #1 and nothing else. The install tier moved to [p1056](p1056_install_norm_battery_and_safety_scale.md) (backlog, blocked on the first install existing); Tier 3 — conditionality vignettes, per-contact expectation mapping, generation-2 fidelity — is not specced anywhere and is a non-goal below.

### Tier 1 — free events (~3 minutes total)

- **4 binary items — the go/no-go diagnostic.** An *approval* pair crossed with a *behaviour* pair, each cross-classified into its own 2×2. Printed reading rule (UNICEF toolkit): extreme quadrants ⟹ normatively driven; middle quadrants ⟹ *"either abiding by a normative behaviour they would rather not practice, or challenging a normative behaviour that is widely practiced."*
- **1 prediction item** about **this room specifically**, and **the tally** of who says unprompted that they did not follow, after one deliberately dense passage. Both are already fully specified in [hypotheses.md](../docs/hypotheses.md) H-LegibilityVsCost (prediction wording, the dense-passage denominator, and the behavior→prediction→reveal ordering). **That entry owns them — do not restate the rules here, and if they change, change them there.**
- **Consent line** about recording and future research use.

### The four items — wording, unblocked 2026-08-12

The toolkit prints both pairs as templates with an `[insert behaviour]` slot. The slot takes the settled behaviour string below, which makes the card writable now — **this is not blocked on the two acquisitions** (see Open Items for what actually is).

Behaviour string, used verbatim in all four: *saying so at the time when you haven't understood what someone meant*.

| # | Item | What it elicits |
|---|---|---|
| A1 | *"Do you approve of saying so at the time when you haven't understood what someone meant?"* | Personal normative belief |
| A2 | *"Do others, whose thoughts and opinions matter to you, approve of saying so at the time when you haven't understood what someone meant?"* | Normative expectation (approval) |
| B1 | *"Do others, whose thoughts and opinions you care about, say so at the time when they haven't understood what someone meant?"* | Empirical expectation |
| B2 | *"Do others, whose thoughts and opinions you care about, expect you to say so at the time when you haven't understood what someone meant?"* | Normative expectation (behaviour) |

**Three things about the source, recorded so the card doesn't inherit them:**

1. **The behaviour pair is EE × NE, not self × others.** Both B-items ask about others — whether they do it, and whether they expect you to. Any reading of the behaviour 2×2 as "my behaviour vs theirs" is wrong.
2. **The stem is not one string in the source.** The approval table says *"whose thoughts and opinions **matter to** you"*; the behaviour table says *"whose thoughts and opinions you **care about**"*. Kept as printed above. `[FOUNDER DECISION: harmonise to one stem, or keep both as published]` — harmonising is a departure and would need labelling as ours.
3. **The source's behaviour-quadrant list contains an error** — quadrant 4 is labelled "(bottom left)", the same cell as quadrant 3. Read it as bottom-right. Do not transcribe the printed label.

### Design decisions already settled — do not re-litigate

| Decision | Resolution | Source |
|---|---|---|
| Reference group | **Self-anchoring stem**: *"others, whose thoughts and opinions matter to you"* — imposes no group, requires no elicitation, works for attendees with no colleagues | UNICEF toolkit, verbatim |
| Response format | **Both**: binary for the 4-item quadrant diagnostic, counts-out-of-N only for the in-room prediction that meets a tally | founder, 2026-08-12 |
| Behavior wording | *"saying so at the time when you haven't understood **what someone meant**"* — used verbatim in every item | **"what they meant" separates comprehension failure from domain ignorance** |
| Predicate matching | Personal-belief and normative-expectation items **must use identical predicate wording** | Bicchieri 2016 p. 98 — breaking it invalidates the whole comparison |
| Ordering | Behavior → predictions → reveal. **Randomise order across events**, treat order as a factor | ours; no source gives order guidance |
| Denominator | One deliberately dense passage, so everyone had something to admit | without it a zero count cannot distinguish "nobody was confused" from "everybody hid it" |
| Psych-safety scale | **Not in this spec.** Installs only, run whole — see [p1056](p1056_install_norm_battery_and_safety_scale.md) | founder; a subset of a validated scale is not that scale |

### The `/meet` opt-in, resolved

- **Anyone may ask anyone. The commitment is on the ANSWERING side, not the asking side.** Opt-ins owe an answer — a number, or an explicit *"not now, because X."* Opt-outs owe nothing. That is the whole difference and the only price. *(Corrected 2026-08-12 after founder pushback. The first draft of this spec restricted invocation rights to opt-ins, which contradicted the norm statement already in [hypotheses.md](../docs/hypotheses.md) H-NormFlip — "not giving a number when asked, without a good excuse, is the unsafe act" and "the sanction targets refusal to disclose." The norm was always about answering; gatekeeping who may ask was invented here and is retracted.)*
- **Letting opt-outs invoke is a conversion mechanism, not a leak.** Norms spread because non-adopters observe adopters doing the thing without consequence — so an opt-out who asks is manufacturing the evidence that would convert them. "Benefit without paying the price" is a free trial. Abuse is handled by the existing *"or say why not"* clause, not by restricting who may ask.
- **Bound on the retracted concern, kept because it may still hold elsewhere:** the one-way-status-transfer argument is about a ledger balancing over **repeated** encounters. A 90-minute room has no ledger. In a **durable** Clarity Organization, a member who permanently asks and never answers is a real asymmetry — open question, not a blocker, and not this spec's problem.
- **The opt-in set IS the reference network**, and this is the resolution to the single genuine hole across all three sources: a room of strangers is not a reference network, and nothing in the literature addresses transient or single-session groups. A bounded, mutually-known, mutually-committed set is one — **manufactured inside a single session.** Reference-network items scoped to "this room" should therefore be scoped to *the opt-in set*, not the room at large.
- **Opt-outs get a job: test whether the protocol holds.** They are otherwise the people most likely to feel judged and least likely to convert.

## Risks / Non-Goals

### Risks

- **The instrument measures a construct we cannot name.** Mitigation: the predicate-matching rule, and one behavior definition reused verbatim in every item.
- **Self-selection read as an effect.** Opt-ins will admit more gaps than opt-outs *because they were already willing*. A large difference is a **fake effect**. Mitigation: it is a non-goal below, stated as a hard constraint.
- **The tally is over-read.** For a behavior whose signal is an **absence**, Bicchieri (2016, p. 57) warns the sustaining beliefs *"are not observable, nor are they inferable from observed actions."* The in-room count **demonstrates that misperception exists**; it does not measure their norm. Mitigation: never report the tally without the expectation items beside it.
- **Order contamination in both directions.** Ask predictions first and you tell the room others might be confused, contaminating the count. Ask after and beliefs may be post-hoc rationalisation — Bicchieri & Xiao's own exogeneity test was **rejected** (χ²=35.84, p<0.001) on exactly this. Neither order is clean. Mitigation: randomise across events; hedge the causal claim, never the descriptive one.
- **Adversarial framing splits the room.** Cast opt-outs as opposition and you get believers versus skeptics, which is the fastest route to compliance theatre. Mitigation: the framing rule is an acceptance criterion, not a suggestion.
- **Inconsistent early sessions destroy the dataset.** Twenty consistent sessions is something a collaborator cannot obtain elsewhere; twenty improvised ones are worth nothing.

### Non-Goals

- **Do NOT compare opt-ins to opt-outs as groups.** Self-selection. Excellent for roles and engagement, worthless as a comparison. Analyse by assignment only where assignment exists.
- **Do NOT invent item wording.** Adapt from the published instruments; where we depart, label it as ours (see Open Items).
- **Do NOT cite Bicchieri or UNICEF for the bipolar status scale or the randomise-order rule** — both are ours.
- **Do NOT run Edmondson's scale at free events**, and do NOT run a subset of it anywhere.
- **Do NOT build Tier 2 here.** The install battery and the psychological-safety scale live in [p1056](p1056_install_norm_battery_and_safety_scale.md), backlogged until an install exists. Pulling them back in makes this spec's Done-When unsatisfiable.
- **Do NOT build Tier 3** (conditionality vignettes, per-contact mapping, generation-2 fidelity) — not here and not in p1056.
- **Do NOT restate the prediction item, the denominator or the ordering rule as spec-owned rules.** [hypotheses.md](../docs/hypotheses.md) H-LegibilityVsCost owns them; a second copy here will drift.
- **Do NOT read event #1's quadrant counts as a classification.** n≈6–8 puts 1–2 people per cell.
- **Do NOT use "out of 10" phrasing and attribute it to the UNICEF toolkit** — every closed item there is binary; the count format is Bicchieri-lab.
- **Do NOT add app/UI work.** This is paper, phone-form, or facilitator script. `/meet` integration is a later spec.

### Alternatives Considered

- **Skip the diagnostic, just run the reveal.** Rejected: it is the one thing that determines whether the reveal can work at all, and it costs four binary questions.
- **Acquire ACT Framework + Bicchieri/Lindemans/Jiang 2014 first, then spec.** Rejected (founder, 2026-08-12): waiting blocks the event on a library run. Carried as acquisition tasks instead.
- **Use only Edmondson's scale.** Rejected: it contains no empirical expectation, no normative expectation and no conditionality — it is predominantly sanction/consequence expectation, so it cannot detect a norm.
- **Ask conditionality directly** (*"would you still do it if nobody else did?"*). Rejected: cheap hypothetical self-report. Bicchieri never asks it directly — lab manipulates, field uses vignettes.

## Done-When

- [ ] A one-page facilitator card exists: the dense passage, the 4 binary items, the prediction item, the tally method, the reveal script, and the consent line — in fixed order
- [ ] Every item uses the single behavior definition verbatim, including "what someone meant"
- [ ] The personal-belief and normative-expectation items use identical predicate wording (checked by reading them side by side)
- [ ] Each item is labelled with its source tradition, and items that are ours are marked as ours
- [ ] Running Tier 1 at event #1 yields **quadrant counts** — every attendee placed in exactly one cell of each 2×2 — recorded with the date and attendee count. **Not a classification:** at n≈6–8 the cells hold 1–2 people and the toolkit's rule (*"if most participants fall into the extreme quadrants"*) is unreadable. The classification is a later Done-When, satisfied when pooled cells across events are non-trivial
- [ ] The reveal shows predicted vs observed and the room sees both numbers
- [ ] Opt-in rate and admission rate are both recorded, separately, for the same session
- [ ] The capture format is fixed enough that session 2 produces a row comparable to session 1
- [ ] Consent language is in place before the first recorded session

## Research Questions

1. **Is gap-admission a descriptive or a social norm in the target population?** (The go/no-go. Everything else is downstream.)
2. How large is the gap between predicted and observed admission in a room — and is it in the direction Miller & McFarland found?
3. Do aggregated personal normative beliefs diverge from aggregated normative expectations? (Bicchieri's pluralistic-ignorance detector, 2016 p. 74.)
4. Does opt-in rate diverge from admission rate in the same session? **If many opt in and almost nobody admits, the pledge-vs-practice gap already in the docs (11 pledgers, zero practice habits) has reproduced live in 90 minutes** — a stronger finding than either number alone, and both halves are already being run.

## Deliverable

A facilitator card (Tier 1) plus a capture sheet with one row per session. Not an app, not a report.

**The first run's output is quadrant counts and a working protocol, not a classification.** The classification — descriptive or social — is the pooled output across events, and RQ1 is answered there rather than at event #1.

## Open Items — carried deliberately, for a later session

- **~~Exact item wording.~~ RESOLVED 2026-08-12 — this was overstated.** The claim was that wording is blocked on two acquisitions. It is not: the toolkit prints both pairs as templates with an `[insert behaviour]` slot, and the settled behaviour string fills it. The four items are written above. **What the two missing acquisitions actually gate is the vignette and the conditionality items** — and conditionality is Tier 3, out of scope. Still worth acquiring, no longer blocking: **ACT Framework** (UNICEF/UNFPA 2019/2020 — the toolkit's own interview and focus-group guides, cited repeatedly but never reproduced) and **Bicchieri, Lindemans & Jiang 2014** (cited four times in *Norms in the Wild* as where the vignettes and the matching rule actually live).
- **Unverified citation — the predicate-matching rule.** The Design-decisions table attributes it to *Norms in the Wild* p. 98. A grep of the local copy for "identical predicate" / "same predicate" returns nothing, which most likely means different phrasing rather than a false attribution — but it has **not** been confirmed against the page. Confirm or re-source before the rule is quoted anywhere outside this spec.
- **Vignette text** for anchoring *"when it matters."* Construction rule from the toolkit: three sentences — named ordinary character with a sympathetic motive → the act → **a witness** — stopping before any reaction, with the character left explicitly undecided. The three-criteria filter (fuzzy intent / delayed feedback / concentrated stakes) cannot be explained inside a survey item; instantiate it in a scene instead.
- **Whether the bipolar status-sanction scale (−5 lose status … +5 gain status) survives.** It appears in **none** of the three sources and is ours, justified separately by the finding that observers rate advice-seekers as *more* competent. Keep or cut — but never attribute it to them.

## References

**Sources** (all in `.private/research/papers/`, indexed with what each does and does not contain at `.private/research/INDEX.md`): Bicchieri & Xiao 2009 · Bicchieri, *Norms in the Wild* 2016 · UNICEF *Participatory Research Toolkit for Social Norms Measurement* (Sood/Kostizak/Stevens 2020).

**Hypotheses this serves:** [hypotheses.md](../docs/hypotheses.md) H-LegibilityVsCost branch (C) · H-NormFlip items (a)–(d). **H-NormRaisesSafety is not served by this spec** — it is install-only and bounded, see [p1056](p1056_install_norm_battery_and_safety_scale.md).

**Split:** [p1056](p1056_install_norm_battery_and_safety_scale.md) — Tier 2, the install battery + Edmondson's scale. Split out 2026-08-12 so this spec holds only what runs at event #1. **The two must share item wording or neither dataset pools.**

**Decisions:** [decisions.md](../docs/decisions.md) 2026-08-12 (both entries). **Narrative:** `content/articles/a66`, `a67`.

**Adjacent, not superseded:** [p851](p851_minimum_clarity_letter_field_experiment.md) — the instrumented *letter* variant, backlogged. It notes the norm-flip thesis "rests on theory, not field data"; this spec supplies that data through events rather than letters. If p851 revives, the two must share item wording or neither dataset pools.
