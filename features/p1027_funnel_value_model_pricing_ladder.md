---
status: week
type: comment
rank: 1000963.0
created_date: '2026-08-06'
tags:
  - pricing
  - funnel
  - value-model
  - gtm
delivery_stage: create-spec
pipeline_ran: [create-spec]
---

# P1027: Funnel shape, value model and pricing ladder

## Problem

**Situation:** The €300 "gap audit" was killed on 2026-08-05 as unpriceable — it had no market comparable, so the founder had to invent the value, defend it, and guess at willingness-to-pay. The install is modelled at €2,000 for ~16h of delivery.

**Complication:** Three findings from the 2026-08-05 pricing pass make the current ladder untenable, and they compound.

1. **At €2,000 the price is cancelled by the cost of acquiring it.** 151h total − 48h delivery = ~34.3h of unpaid acquisition per install; at the founder's €57/hr target that is **~€1,955 of time-CAC against €2,000 of revenue — contribution ≈ €45.**
2. **There is no rework-cost figure anywhere in the repo**, while a working value-anchoring calculator is **already shipped in prod** (`src/app/components/stakes/key-hire-calculator.tsx`) pointed at the **dormant** key-hire wedge. The active wedge has a price and no number behind it.
3. **The ladder has no paid step on the path.** It is €0 → €3,500. The paid intro hour is positioned as a consolation prize for the unqualified; the paid event is an optional parallel branch. Neither is on the route a qualified buyer actually walks.

Two independent floors converge at **~€2,900**: the hours check (151h × €57 ÷ 3 installs = €2,869) and the founder's own value floor recorded 2026-07-24 (*"one wrong feature ≫ €3k floor… value-anchored, not hourly"*) — **a rule that was written down and then not followed**, which is the pattern this spec exists to break.

**Question:** What is the install actually worth, what shape must the ladder take so the buyer is not asked to jump from free to €3,500, and what price follows from the answer rather than from the founder's hours?

## Appetite

**High blast radius** — sets the price on every offer and the shape of the whole funnel; everything in `goals.md` divides by these numbers. **Medium reversibility** — a list price can be changed, but a *published* price that has been discounted trains expectations permanently (see Risks). **High decision density** — at least four `[FOUNDER DECISION]` items, listed under Deliverable.

## Approach

Four strands, in dependency order. Strand 1 gates the rest — a price argued from hours is the failure this spec is correcting.

**1. Value model (blocks everything else).** Derive what one rework event costs a team, from first principles and from any primary source that survives the repo's own method rule (`decisions.md` 2026-08-05: *"assume any secondhand number is inflated in the seller's direction until the primary is fetched"* — this disqualifies the vendor-published miscommunication-cost figures already in `theory-of-change.md`). Then decide whether to repoint the shipped key-hire calculator at the active wedge, and what it would anchor on.

**2. Funnel shape.** Decide which paid step goes *on the path* between the free event and the install — repositioned intro hour, the paid event, or something else. This is a genuine trade: a rung on the path leaks people, a rung beside the path converts nobody. Model both.

**3. CAC as a variable, not a constant.** The ~€2,900 floor is derived from *today's* acquisition hours. Content, an online course, AI support and delegation all cut them; at half the hours the floor is ~€1,500. **Therefore price is set from value, with the CAC floor used only as a sanity check** — never derived from it.

**4. Throughput reconciliation.** 167h over ~3.5 months is ~48 of ~87 available monthly hours. Even the €59/hr scenario yields **€2,829/month against a €5,000 target.** €/hr divides by hours *worked*, not hours *available* — reconcile the two or state explicitly that the monthly target is out of reach at this throughput and what would change it.

## Risks / Non-Goals

### Risks

- **Discount reflex.** The repo is 3-for-3 on founding discounts (€500→€99, €1,000→€500, €950→€712), and `decisions.md` already rules that *"discounting live in the room destroys the WTP data."* Net effect to date: the list price was never the price, so no list price has ever been tested. **Mitigation:** the spec must produce a no-discount pre-commitment, or explicitly justify breaking it.
- **Anchoring on a word buyers don't use.** *"Rework"* is measured at **0 of 30 competitor heroes and 0 of 3,671 transcript lines.** A correct number attached to the wrong word still fails. **Mitigation:** test the anchor's vocabulary separately from its arithmetic.
- **Deferral, not price, is the historical failure mode.** Paid rungs at this company are 0-for-4 (€950 pair, €1,000/€500 cohort, €99 PoC, €499 group), and each died *"deferred until a pipeline / a room exists"* — never on price. **Mitigation:** every rung this spec keeps must be purchasable on a date, not gated behind a precondition.
- **Attribution is structurally unavailable.** H-BuildRightThing-**Cause** is testable only after installs accumulate, so no avoided-cost figure can be *promised*. **Mitigation:** anchor on exposure, never on guaranteed savings; state the limit in the offer.

### Non-Goals

- Do NOT set prices from delivery hours. That is the defect being corrected.
- Do NOT design the event run-of-show, the deck, or promotion mechanics — those are `goals.md` tactics.
- Do NOT reopen the **channel** decision (event-led vs 1:1). Settled 2026-08-05 and out of scope here.
- Do NOT move the `active-market-focus` or `page-lead` `SINGLE-VALUE` slots. Segment work belongs in `lean-canvas.md` via `/slava:maintain:docs-strategy-update`.
- Do NOT build the rework calculator in this spec — decide *whether* it should exist; building it is a separate spec.
- Do NOT supersede `p1003_three_minute_alignment_audit_funnel.md` (status `today`). It is adjacent — the audit is a funnel *component*; this spec decides the ladder around it. Reconcile, don't absorb.

## Research Questions

1. What does one rework event cost a team of 3–8, derived from primary sources or first principles, with an honest uncertainty band?
2. Does the shipped key-hire calculator repoint to the active wedge, or does the active wedge need its own instrument — and what does it anchor on given "rework" is unattested buyer language?
3. Which paid step goes on the path between free event and install? Model leak-rate against jump-size for each candidate.
4. What is the install price that follows from value, and where does the CAC floor sit relative to it *today* and *after* automation?
5. Does the €5,000/month target survive this throughput? If not, what changes — price, throughput, or the target?
6. What is the cheapest test of the riskiest assumption (that a free-event attendee pays to bring a second person), and can it run without an event?

## Time Box

Report findings before implementing any price change. If the value model cannot be grounded in anything better than vendor-published figures, **say so and price on comparables instead** — do not manufacture a number to fill the section.

## Deliverable

A decision document carrying:

- A value model with a stated uncertainty band and its sources
- The ladder shape, with the on-path paid step named
- `[FOUNDER DECISION: install price]` — band structure by team size (2–4 / 5–9 / 10+), floor ~€2,900
- `[FOUNDER DECISION: paid event price]`
- `[FOUNDER DECISION: intro hour]` — the recommendation on record is €150 → **€250**, the only price this business has ever actually been paid (`lean-canvas.md` *"coaching at €250/hr"*)
- `[FOUNDER DECISION: no founding discount]`
- A pre-committed falsifier for each price

## Done-When

- [ ] A rework-cost value model exists with a named uncertainty band, and every figure in it cites a source or is labeled unverified
- [ ] Install price is justified by value first, with the CAC floor shown as a check and not as the derivation
- [ ] The ladder names exactly one paid step on the path from free event to install, with the leak-vs-jump trade modelled
- [ ] CAC is expressed as a function of acquisition hours, with the floor recomputed at present and post-automation levels
- [ ] The €5,000/month target is either shown to be reachable at this throughput or explicitly restated
- [ ] Every `[FOUNDER DECISION]` above is either answered or listed as open with the question stated
- [ ] Each price carries a pre-committed falsifier
- [ ] `goals.md` funnel arithmetic is updated to the chosen prices, or the mismatch is stated
