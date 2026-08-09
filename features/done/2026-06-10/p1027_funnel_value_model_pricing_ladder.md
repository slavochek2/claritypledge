---
status: all-done
type: comment
rank: 1
created_date: '2026-08-06'
completed_at: '2026-08-07'
tags:
  - pricing
  - funnel
  - value-model
  - gtm
delivery_stage: create-spec
pipeline_ran:
  - create-spec
pipeline_skipped:
  - challenge-prd -- the 2026-08-07 working session performed the adversarial pass live (core noun falsified, method falsified, calculator population gap found); running it against the corrected premise would re-test a premise already known wrong
locked_at: '2026-08-07T09:12:31.965Z'
---

# P1027: Funnel shape, value model and pricing ladder

## Problem

**Situation:** The €300 "gap audit" was killed on 2026-08-05 as unpriceable — no market comparable, so the founder had to invent the value, defend it, and guess at willingness-to-pay. The install was modelled at €2,000 for ~16h of delivery.

**Complication:** Three findings from the 2026-08-05 pricing pass made the ladder untenable, and they compounded.

1. **At €2,000 the price was cancelled by the cost of acquiring it.** 151h total − 48h delivery = ~34.3h of unpaid acquisition per install; at the founder's €57/hr target that is **~€1,955 of time-CAC against €2,000 of revenue — contribution ≈ €45.**
2. **There is no cost-of-discarded-work figure anywhere in the repo**, while a working value-anchoring calculator is **already shipped in prod** (`src/app/components/stakes/key-hire-calculator.tsx`) pointed at the **dormant** key-hire wedge. The active wedge had a price and no number behind it.
3. **The ladder had no paid step on the path.** €0 → €3,500, with the paid intro hour positioned as a consolation prize for the unqualified and the paid event an optional parallel branch. Neither sat on the route a qualified buyer walks.

Two independent floors converged at **~€2,900**: the hours check (151h × €57 ÷ 3 installs = €2,869) and the founder's own value floor recorded 2026-07-24 (*"one wrong feature ≫ €3k floor… value-anchored, not hourly"*) — **a rule written down and then not followed**, which is the pattern this spec exists to break.

**Question:** What is the install actually worth, what shape must the ladder take so the buyer is not asked to jump from free to €3,500, and what price follows from the answer rather than from the founder's hours?

---

### CORRECTION 2026-08-07 — the original framing was wrong at the vocabulary layer

The working session falsified two premises this spec was built on. Recorded here because the rest of the document is written against the corrected version.

**1. The noun was wrong.** *"Rework"* implies you fix the work. Founder correction: *"You don't rework. You just dump the work and start over."* Confirmed by `.private/docs/business/buyer-language-corpus-2026-07-29.md` (30 verified competitor heroes, 51 sourced practitioner quotes, 4 transcripts read in full): buyers' verbs for discarded work are **threw away / thrown away (11)** · wasted (9) · rewrite (8) · down the drain (3). *"Rework"* appears **0 times in 3,671 lines of founder transcript** and **0 of 30 competitor heroes** — it is consultant vocabulary. *Scrapped, shelved, binned, ripped out, reverted* are also zero-hit. **"Dump" is not attested either** — the buyer's word is **"threw away."**

**2. The unit was wrong, which invalidated RQ1 as originally written.** Same corpus, verbatim:

> **Money: essentially never for their own loss.** Founders in the private corpus produced ZERO currency figures for a communication cost. Public corpus uses dollars only when someone ELSE pays. **Price the pain in months or weeks, never dollars.**

Their units: **months (12)** for organisational loss · **"two weeks" (8)** as the idiom for recoverable waste · days (3) · hours (3) · **story points: zero**. RQ1 originally asked what one event costs *in euros, from primary sources*. That question is malformed twice — the noun is unattested and the unit is unattested. **The founder's instinct is the method: ask them, don't derive it.**

---

## Appetite

**High blast radius** — sets the price on every offer and the shape of the whole funnel; everything in `goals.md` divides by these numbers. **Medium reversibility** — a list price can be changed, but a *published* price that has been discounted trains expectations permanently. **High decision density.**

## Approach

**1. Value model — elicit, never derive (supersedes the original strand 1).** No published figure survives the repo's own method rule (`decisions.md` 2026-08-05: *"assume any secondhand number is inflated in the seller's direction until the primary is fetched"* — which disqualifies the Grammarly/Harris figures sitting in `theory-of-change.md:33,634`). The buyer supplies every input, **in weeks or months**; they convert to money themselves because they know their own burn and we do not. This dodges the vendor-figure problem, the invented-number problem, and the attribution problem simultaneously.

**2. Instrument — keep the UI, drop the contents.** The shipped calculator is the right *instrument* and the wrong *contents*. Keep the stacked-bill layout and the scrubber; remove every published figure. The component already carries the mechanism: `SourceTag` swaps a study's name for **"(yours)"** the instant a value moves off the cited one. An all-elicited instrument is permanently "(yours)" and needs no citation gate at all.

**3. Ladder — one paid step, and it is not a new product.** Resolved 2026-08-07; see Resolved Decisions.

**4. CAC as a variable, not a constant.** The ~€2,900 floor derives from *today's* acquisition hours. Content, multiplier channels, AI support and delegation all cut them. **Price is set from value; the CAC floor is a sanity check only** — never the derivation.

**5. Throughput reconciliation.** Resolved 2026-08-07; see Resolved Decisions.

## Resolved Decisions

Applied to `docs/goals.md` on 2026-08-07. Recorded here so downstream work does not re-open them.

### RQ3 — the on-path paid step: **phase 1 of the install, sold at the event**

**The paid event is killed.** It was the ladder's riskiest assumption (*will an attendee pay to bring a second person?*), paid rungs at this company are **0-for-4**, and `decisions.md` 2026-08-05 had already modelled the no-paid-rung case and named the consequence: *"the install price must carry the funnel."* At €2,000 the paid event was load-bearing; at €4,500 it is not — €13,500/151h = **€89/hr**, beating every row of the retired scenario table with no extra events. Free events are **one person per company**. The hourly intro stays **off-path** at €250 for the unqualified; selling hours to a *qualified* buyer competes with the install and re-anchors on hours.

**Phase 1 is a milestone on one priced engagement, not a product.** It needs no separate value model, no separate comparable, and no separate falsifier — it inherits the install's.

| | |
|---|---|
| Install | **€4,500**, banded by team size (2–4 / 5–9 / 10+; band edges `[FOUNDER DECISION]`) |
| Phase 1 | **€1,000 *of* the €4,500**, paid at the event, credited against the total |
| Phase-1 boundary | **first verified exchange** — `min(ai_selfscore, user_score) ≥ 8`, the `/align` contract — on one real decision the team is currently carrying |
| Remaining €3,500 | invoiced when that milestone lands |
| If it never lands | not invoiced for the rest; the €1,000 is kept |

**Never price phase 1 in hours.** It takes ~4–5h; that is a delivery fact, never the price basis and never said aloud as one. Naming a duration re-anchors the engagement hourly and invites the buyer to divide. Fixed price means **the seller absorbs the variance** — a consistent overrun is repricing data, not a delivery failure.

**Why this boundary survives where others don't:** it is not a clock (no time reference), not a business outcome (promises nothing about avoided waste, so H-BuildRightThing-**Cause**'s untestability never bites), and not the founder's judgment (**the buyer scores; the min gates; no agent may self-certify**). Binary, observable, and already the product's core mechanism rather than invented for pricing. **The milestone gates the next invoice, never the first** — so no delivery risk sits with the founder, which is exactly what killed the contingent pay-gate on 2026-08-05.

### RQ5 — the €5,000/month target: reachable on **both** levers, neither alone

| | Prior (6 events, €2,000, paid rung) | Applied (12 events, €4,500, no paid rung) |
|---|---|---|
| Revenue | €9,900 | ~€27,000 |
| Hours | 167h | ~250h |
| €/hr | €59 | **~€108** |
| **Per month** | €2,829 | **~€6,350** |
| Utilisation | 55% of ~305h | ~68% of ~370h |

€4,500 installs at 6 events → ~€3,200/mo. 12 events at €2,000 → ~€2,800/mo. **Neither single lever reaches the target; both together clear it with slack.** The binding constraint moves off hours (68% utilisation) and onto **sourcing 12 rooms** — which relocates the riskiest assumption and rewrites RQ6.

### Channel mix — multiplier-first, cold email demoted to booster

The prior funnel routed **100% of seats through cold email** while naming the platform hedge only in prose. Four channels now, each with its own rate and hours: **multiplier** (angels, accelerators, community leads) · **organic** (Luma / Eventbrite) · **DM** (LinkedIn as sourcing surface only) · **cold email** (booster).

**The framing flip:** the ask is ***"can I run this for your startups?"*** — not *"come to my event."* It inverts the request from *give me your audience* to *let me give your cohort something*, against a standing content obligation coordinators already carry to their portfolio.

**Multiplier runs first on falsification cost, not preference.** ~15 coordinator conversations resolve in ~2 weeks at near-zero setup; cold email costs **40h of list-building before it emits any signal**. Cold at 25% of seats needs **~450 emails/event (~5,400 for 12 events)** — half the list the prior plan needed for six.

**Costs, stated:** it is a **B2B2C sale** (the coordinator is an unmeasured funnel of its own), it is **lumpy** (one "no" kills a room; cold degrades gracefully), and room composition is whatever the cohort selected for. **Benefit:** accelerator portfolios are pre-filtered for growing seed–A teams.

### RQ1 — the value model is an elicitation, and step 3 is the part that must not be dropped

Applied to `goals.md` as the live elicitation, replacing the prior qualifier (which asked for a **count** while the attested unit is **duration**, and used *"rebuild"* — a near-miss on corpus vocabulary). `[FOUNDER DECISION: exact wording]`, drafted 2026-08-07.

| | Ask |
|---|---|
| **1 — anchor** | *"Think of the last thing your team built that got **thrown away**. How long had you been working on it?"* |
| **2 — frequency** | *"How many times in the last year?"* |
| **3 — what it licenses** | *"That's what it costs you when it happens. I'm not going to tell you we'll stop it — I can't measure that yet, and nobody can. What we do is make the disagreement visible **before** the work starts, so you find out in the room instead of six weeks later."* |

**Step 3 is the whole safety mechanism.** Without it, an elicited number becomes an implied promise to save that number — a claim H-BuildRightThing-**Cause** cannot back until installs accumulate, and one the first customer who measures will falsify. Duration × frequency = annual exposure, **every input the buyer's own**.

**Reading it:** *months* → organisational loss, higher band. *"Two weeks"* → corpus-attested **idiom for "a recoverable amount"**; treat as possible minimising and probe once. *"Never happened"* → not the buyer; route to the intro hour or out. It **routes and collects exposure; it is not evidence** — a self-report validates nothing about the mechanism.

### RQ2 — the instrument: **DEFER, revisit after event #1**

**Decision: do not repoint and do not rebuild — not now.** The shipped calculator stays as-is, pointed at the dormant key-hire wedge.

**Reason: the funnel is no longer website-led.** Seats now come from coordinator conversations and rooms; a homepage calculator converts nobody in that model, so rebuilding it is effort aimed at the previous funnel. **Prove the elicitation works in a room first** — if it does, the instrument becomes worth building *and* we will know exactly what it should ask, which we do not know today.

**The population reasoning, recorded so it is not re-derived.** The founder's observation — the calculator assumes only new hires leave, while tenured staff leave too — is **correct**, and already on record in `.private/` (that champion is precisely the excluded population: tenured, already announced, **probability = 1**). It is **not a bug**: `key-hire-calculator.tsx` rejects turnover twice and deliberately (*"a six-year CTO resigning is turnover and is nowhere in the 46%"*); Leadership IQ's figure covers new-hire failure within 18 months and the component is correctly scoped to its source. Widening it with a *different published source* re-enters the secondhand-number trap. **Elicitation dissolves the problem** — ask *"how many people left in the last 18 months"* and the buyer counts everyone, no source required. So when it is built: **keep the stacked-bill UI and the scrubber, drop every published figure.** `SourceTag` already swaps to **"(yours)"** off a cited value, so an all-elicited instrument is permanently "(yours)" and needs no citation gate.

**Revisit trigger:** after event #1, if the elicitation produced usable numbers in the room.

### The 2026-08-05 freeze was void before this spec was filed

`goals.md` carried `[PROPOSED-PENDING-CONTACT — the only permitted action on these two slots is contact]`. `decisions.md` 2026-08-05 [process] had **already voided that wording** — *"no rule may block a write to the docs; rules may only require a label… any pre-commitment that forbids recording is void on sight"* — naming this exact phrasing as a re-instated withhold. The same entry routes it: an event's **promotion target is tactical** (`goals.md`); `active-market-focus` stays structural (`lean-canvas.md`). **Unfreezing the channel does not unfreeze the target**, which remains `PROPOSED` with its counter-evidence unanswered.

## Research Questions

**All resolved or deliberately handed off.** Answers are in Resolved Decisions above; what could not be answered from the desk is named below with its owner.

1. ~~What does the elicitation ask, and what does it license?~~ → **resolved**, RQ1 above.
2. ~~Repoint the calculator, or replace it?~~ → **resolved: DEFER**, RQ2 above.
3. **What are the multiplier / organic / DM conversion rates?** → **cannot be answered from the desk, and must not be invented.** They carry `[FOUNDER ESTIMATE]` slots in `goals.md`; only cold has history (2.5% / 45%) and **even those have no derivation anywhere in the repo** — a grep of `docs/` and `decisions.md` returns none; the one documented derivation belongs to the retired 1:1 chain (*"the founder's own rates"*). **Owner: the multiplier campaign** — ~15 coordinator conversations produce the first real rate. Inventing them is the defect this spec exists to correct.
4. **What is the cheapest test of the new riskiest assumption?** → **answered.** It is no longer *"will an attendee pay to bring a second person"* (that rung is gone) but **"can 12 rooms be filled"** — concretely, will a coordinator say yes to *"can I run this for your startups?"* Runnable with no event and no list, in ~2 weeks. **That is the next action, and it does not belong in this spec.**

## Risks / Non-Goals

### Risks

- **`MITIGATE` — Discount reflex.** 3-for-3 on founding discounts (€500→€99, €1,000→€500, €950→€712); `decisions.md` rules that *"discounting live in the room destroys the WTP data."* Net effect: **no list price has ever been tested.** *Mitigation applied:* price moves on **bands** (a published variable), never per-customer flex. Same up/down movement, without burning the read.
- **`MITIGATE` — Anchoring on a word buyers don't use.** *"Rework"* is 0/30 heroes and 0/3,671 transcript lines; *"dump"* is unattested too. *Mitigation applied:* the offer uses **threw away / wasted**, and prices the pain in **weeks**, per the corpus.
- **`MITIGATE` — Deferral, not price, is the historical failure mode.** Paid rungs are 0-for-4 and each died *"deferred until a pipeline / a room exists"* — never on price. *Mitigation applied:* phase 1 is purchasable **on the event date**, and it is a milestone on an existing engagement rather than a new product needing its own precondition.
- **`ACCEPT` — Attribution is structurally unavailable.** H-BuildRightThing-**Cause** is testable only after installs accumulate, so no avoided-cost figure can be promised. *Accepted:* the phase-1 milestone is a **state verified inside delivery** (`min ≥ 8`), never a business outcome — so the offer never depends on attribution. Anchor on exposure; state the limit.
- **`ACCEPT` — Every rate in the funnel is an estimate with no derivation.** Cold's 2.5%/45% have history but no recorded basis; the other three channels are unset. *Accepted for now:* the multiplier falsifier (<2 rooms from ~15 conversations) reads in ~2 weeks and is cheaper than deriving rates up front.
- **`ACCEPT` — The cold-email falsifier got slower.** <15 registrations per 2,000 sends is no longer readable from event #1; at booster weight ~2,000 sends accumulate across ~4 events. *Accepted cost* of demoting cold.
- **`ACCEPT` — Killing the pair rung changes what the free event can prove.** Breakouts become cross-company pairings with a stranger; first practice with the buyer's real counterpart moves inside the install. Since the install *is* onboarding, that is arguably where it belongs. *Accepted* — but the free event must not claim otherwise.
- **`DEFER` — Multiplier is a B2B2C sale with an unmeasured rate**, and it is lumpy: one "no" kills a whole room where cold degrades at the margin. *Deferred* until the ~15 conversations produce a rate.

### Non-Goals

- Do NOT set prices from delivery hours. That is the defect being corrected — and it re-enters most easily through **phase 1**, which must never be quoted as "4–5 hours."
- Do NOT design the event run-of-show, the deck, or promotion mechanics. **Event *volume and portfolio* IS in scope** (it is the RQ5 throughput lever); run-of-show is not.
- Do NOT move the `active-market-focus` or `page-lead` `SINGLE-VALUE` slots. The channel was unfrozen; **the target was not.** Segment work belongs in `lean-canvas.md` via `/slava:maintain:docs-strategy-update`.
- Do NOT build the elicitation instrument in this spec — decide *whether* it should exist; building it is a separate spec.
- Do NOT supersede `p1003_three_minute_alignment_audit_funnel.md`. It is adjacent — the audit is a funnel *component*; this spec decides the ladder around it. Reconcile, don't absorb.
- Do NOT fill any `[FOUNDER ESTIMATE]` rate by invention.

## Time Box

Report findings before implementing any further price change. If the elicitation cannot be grounded in the buyer's own reported numbers, **say so and price on comparables** — do not manufacture a number to fill the section.

## Deliverable

- [x] The elicitation design: the question, its units, and an explicit statement of what it does and does not license the offer to claim
- [x] The instrument decision (repoint / replace / neither), with the population-constraint reasoning stated
- [x] `[FOUNDER ESTIMATE: multiplier / organic / DM rates]` — **listed open with the question stated**, deliberately not invented; owner is the multiplier campaign
- [x] A pre-committed falsifier for each price and each channel
- [ ] `[FOUNDER DECISION: install band edges]` — 2–4 / 5–9 / 10+ around the €4,500 anchor. **Open; carried out of this spec** (see Closure)
- ~~An event-volume plan~~ — **moved out.** It is a to-do list, not a research question, and it is **downstream of a decision this spec never owned: what gets delivered at the event.** Cities, topics and co-delivery cannot be chosen before the thing being delivered is defined.

## Done-When

- [x] The ladder names exactly one paid step on the path from free event to install *(phase 1 of the install, sold at the event)*
- [x] The €5,000/month target is either shown to be reachable at this throughput or explicitly restated *(reachable on both levers together, neither alone)*
- [x] `goals.md` funnel arithmetic is updated to the chosen prices
- [x] Every Risk carries a `MITIGATE | ACCEPT | DEFER` label
- [x] The value model is expressed as an **elicitation in the buyer's units**, with every figure sourced or labelled unverified
- [x] The instrument decision is recorded with its population-constraint reasoning
- [x] CAC is expressed as a function of acquisition hours, recomputed at present and post-automation levels — `floor(N) = €5,928/N + €1,881`, reproducing the recorded €2,869 at N=6, giving **€2,375 at N=12**, asymptote **~€1,881**, post-automation **~€1,634 at N=12**
- [x] Every `[FOUNDER DECISION]` / `[FOUNDER ESTIMATE]` above is answered or listed as open with the question stated
- [x] Each price and each channel carries a pre-committed falsifier *(one per channel, table in `goals.md`)*
- [ ] **Install price is justified by value first — it is not, and this spec closes without it.** €4,500 triangulates three numbers, **none of them a buyer's**: the CAC floor, the founder's own 2026-07-24 value floor (*"one wrong feature ≫ €3k"*), and the throughput arithmetic for €5,000/mo. That is a defensible **list price to test**, not a value derivation. **Carried out deliberately** — the elicitation that would close it can only run in front of a buyer, and no buyer has been in front of it. Closes when the elicitation returns a figure, or when the Time Box fires and the price is restated as comparables-based.

## Closure

**Closed 2026-08-07 with one Done-When box open, on purpose.** The spec's question — *what is the install worth, what shape must the ladder take, what price follows* — is answered for ladder and price and applied to `goals.md`. What remains cannot be answered at a desk:

| Carried out | To | Why |
|---|---|---|
| Value-first price justification | the first ~5 scoping / coordinator conversations | requires a buyer in the room; the price is testable meanwhile |
| Install band edges | same | bands are read off real answers, not assigned in advance |
| Multiplier / organic / DM rates | the multiplier campaign | ~15 coordinator conversations produce the first real rate |
| Event volume + cities + topics + co-delivery | **event design first, then a campaign** | downstream of *what gets delivered at the event*, which this spec never owned |

**Next action is not a spec.** It is deciding what the event delivers — then the volume plan, then promotion. Filling the `[FOUNDER ESTIMATE]` slots by invention rather than by conversation would reintroduce the exact defect this spec corrected.

## Follow-ups this spec cannot do inline

- **`docs/hypotheses.md` — H-WorkshopFormat** is *"Active P1 since 2026-04-02 with zero workshops run"*, so its `<10% conversion after 3 workshops` transform-if has never been reachable. Making event-led the applied posture at 12 events should sync it. Gated doc → `/slava:maintain:docs-strategy-update`.
- **`lean-canvas.md` §Revenue** still carries the €950 pair price and the coaching ladder. The price *numbers* are tactical (CHARTER rule 7), but the section is stale.
