# Research Programme

> **Charter:** doc-routing rules live in [CHARTER.md](CHARTER.md) — one fact, one home; pointers everywhere else.

ClarityPledge runs as a **Lakatosian research programme**: a small set of commitments held by methodological decision (the **hard core**), surrounded by testable bets that absorb refutations (the **protective belt**), governed by rules about where a refutation is allowed to land (the **negative heuristic**) and where new work should go next (the **positive heuristic**).

That structure was already operating implicitly — [hypotheses.md](hypotheses.md) states the negative heuristic almost verbatim (*"A failed hypothesis triggers mechanism transformation … not project abandonment"*), every belt hypothesis carries a falsifier, and past refutations (R₀≈0, flat demos, zero WTP) were absorbed by adjusting segments and channels while the core stayed untouched. **Implicit is the problem.** Undeclared, three things are invisible: which refutations were core-hits, whether the programme is *progressing* or *degenerating*, and whether a rival programme is doing better on our own evidence.

**This doc is the scoreboard for the programme itself.** It does not hold bets (that is [hypotheses.md](hypotheses.md)), the business model ([lean-canvas.md](lean-canvas.md)), the impact mechanism ([theory-of-change.md](theory-of-change.md)), or dated rationale ([decisions.md](decisions.md)). It holds four things nothing else does: the **hard core**, the **negative heuristic**, the **rivals registry**, and the **progressivity ledger** — plus the **stopping rule** that fires when the programme stops moving.

**Origin:** [P1026](../features/done/2026-06-10/p1026_research_programme_rigor_layer.md), founder decisions D1–D4 resolved 2026-08-07. That spec holds the rejected alternatives and the reasoning for each decision below.

---

## Why "progress" needed redefining

CLAUDE.md states the project's progress metric as *"learning speed (hypotheses falsified per unit time)."* That measures **activity**, not progress. Lakatos's criterion is stricter and it is the one this doc adopts:

> A programme is **progressive** when each successor framing predicts something its predecessor did not, and at least some of those novel predictions are **corroborated**. It is **degenerating** when each successor only accommodates the anomaly that killed its predecessor — explaining the past, predicting nothing new.

On the falsified-per-unit-time scoreboard a degenerating programme and a progressive one look **identical**: both retire hypotheses at a healthy clip. The **July 2026 wedge re-cuts** are the live case — they cannot currently be classified as rapid heuristic exploration or as ad-hoc patching, because the data needed for that judgment (what each re-cut newly predicted, and whether it was tested) was never recorded.

> **The count itself is unreconciled, which makes the point better than a clean number would.** [decisions.md](decisions.md) 2026-08-07 records **"July 2026's six wedge re-cuts"** in one entry and **"across ~6 founder interviews the wedge was re-cut 4 times (07-01 solo builder → 07-14 key hire → 07-20 team-internal)"** in another — same month, same day's review, 6 vs 4. Nobody noticed, because nothing in the process was reading the count. Resolving it is a `/docs-strategy-update` job on the log, not a rewrite here; the stopping rule's N=3 derivation uses the more specific second figure.

Falsifiers protect against **dogmatism**. Novel predictions protect against **degeneration**. They are different disciplines and the programme needs both.

---

## Hard core

Seven commitments, **K1–K7**. These are held by **methodological decision**, not by evidence — the programme's policy is to route refutations away from them (see [Negative heuristic](#negative-heuristic)). Saying so plainly is the point: an unstated core is one that immunizes itself silently.

**Two labels every element carries:**

1. **Evidential status** — literature-proven components are distinguished from the programme's own conjecture. Never blur the two in public writing (see [Citation discipline](#citation-discipline)).
2. **Core-hit signature** — the observation that would constitute a hit on *this element* rather than on the belt. An element without one is unfalsifiable in the bad way: the refutation lands, nobody notices, and it routes to the belt by default. That default *is* the immunization this doc exists to prevent. Value/aim elements (K6, K7) are not empirically hittable and say so; their retirement route is a recorded founder decision.

*Draft 1 (five elements) went through an adversarial Lakatos-literate critique. Applied: "reliably" removed from the protocol claim (it imported the open P0 question into the core); the three-criteria cost taxonomy demoted to belt (it has a published falsifier and two revisions); the interpersonal constraint split (protected half = first-person authority; delegability = belt); the negative heuristic extracted out of the core; two unstated commitments added (K4 speaker authority, K5 human unit). D1 then stripped K2's topic hedge to the belt and required a core-hit signature on every element.*

### K1 — Miscalibration

Miscalibrated mutual understanding is the default in conversation: both parties' confidence that understanding happened exceeds actual understanding, and because each also believes the other shares that confidence, the failure is **self-concealing**.

*Evidential status:* **components literature-proven** — illusion of transparency, speaker overestimation of being understood, closeness-communication bias (Savitsky, Keysar, Epley et al. 2011). The **recursive composite** — "the illusion of recursive understanding" — is the programme's own conjecture extending Pinker, owned as its boldest claim, **MRL 1-2**.

> **Core-hit signature:** across a representative sample, measured comprehension tracks felt comprehension with no systematic overestimate, OR the recursive layer is absent (parties do not in fact assume the other shares the belief) ⟹ the default is calibrated and the programme has no problem to solve.

### K2 — Protocol

A paraphrase-and-confirm protocol with speaker-side verification can convert illusory understanding into verified understanding within a session. Verified comprehension is **by construction** a separate axis from agreement; the empirical behavior of that separation (softening, decomposition) is belt.

*Evidential status:* **demonstrated**, 30+ sessions, **MRL 6** ([theory-of-change.md](theory-of-change.md) — Empirical grounding).

> **Core-hit signature:** competent administration on topics meeting the belt precondition below fails to move verified understanding within a session, **across operators** ⟹ the conversion mechanism itself does not work.

### K3 — Cost boundary

The unverified gap is costly precisely where its natural consequence-arbiter fails — where feedback is delayed enough that error compounds silently instead of self-correcting.

*Evidential status:* the specific **exactly-three-failure-modes** taxonomy (fuzzy intent / delayed feedback / concentrated stakes) is **belt**, where its falsifier already lives. Only the arbiter-failure boundary is core.

> **Core-hit signature:** domains with fast, reliable consequence-feedback accumulate unverified-understanding costs at the same rate as delayed-feedback domains ⟹ the arbiter-failure boundary is not where cost concentrates, and the targeting premise is wrong.

### K4 — Speaker authority

The speaker is the sole arbiter of whether they were understood; "verified" means **speaker-confirmed representation**.

*Evidential status:* previously unstated; the entire measurement stack presupposes it.

> **Core-hit signature:** speaker self-report demonstrably fails to track accurate representation — speakers confirm paraphrases that independent scoring shows are wrong, or reject ones it shows are right ⟹ the measurement stack rests on an invalid arbiter.

### K5 — Unit

The unit of intervention is a **human relationship** — verification requires a counterparty with first-person authority to reject the paraphrase ("that's not what I meant"). Whether that authority can ever be **delegated** (digital twin, async artifact) is a belt question.

> **Core-hit signature:** verified understanding is achieved with *no* counterparty holding first-person rejection authority at all ⟹ the relationship is not the unit. (Delegation to a proxy that still derives its authority from the person is belt, not core — that is the open delegability question.)

### K6 — Mission

The programme is **impact-first**: the aim is spreading the verification practice; revenue is second.

*Belt, not core:* **"revenue is proof of impact"** is a measurement-proxy claim and lives in the belt — otherwise any WTP refutation could be deflected as "revenue is second anyway."

> **Core-hit signature:** none — this is a value commitment, held by decision, not an empirical claim. Retirement route is a recorded founder decision with reasons.

### K7 — Aim

The programme aims at a **truth-measurement layer built on verified understanding**, not only at better conversations.

*Belt, not core (D2):* the operational claims that would realize this aim — the **Asymmetric Conversion Rate**, the **asymmetry score** ([philosophy.md](philosophy.md) — The Asymmetric Conversion Hypothesis), **point truth scores**, retention/conversion metrics ([theory-of-change.md](theory-of-change.md)) — stay where they are, labeled **MRL 1-2 and scale-gated**. They are the programme's boldest *testable* conjectures and must stay refutable: **core content cannot earn corroborated novel predictions**, so immunizing them would forfeit the best available source of progressivity.

> **Core-hit signature:** none — same class as K6. This is the aim, not a finding.

**Consistency note (D2):** the doc applies one rule uniformly. K6 = mission in core, measurement-proxy in belt. K7 = aim in core, measurement layer in belt.

---

## Belt preconditions extracted from the core

Conditions that read like part of a core element but are **checkable**, and therefore belt by definition. Left inside the core they function as unrecorded auxiliary knobs — any failed session absorbs into them without anyone recording that an auxiliary was adjusted.

| # | Precondition | Belongs to | Status |
|---|---|---|---|
| B-K2-topic | **A topic on which the parties hold a live, consequential, unresolved difference.** | K2 | **Belt-testable.** Its failure is a **belt-hit**, not a core-hit. |

**Why this one was extracted (D1):** the K2 draft read *"given an adequately chosen topic."* "Adequately chosen" is an escape hatch of the same class as the "reliably" the critique round already removed — unfalsifiable, and it absorbs every failed session. Related belt evidence: [hypotheses.md](hypotheses.md) H-TopicDepthGate (~40% of sessions failed on topic inadequacy) and the **demo-selection precondition** under H-FounderWince (the true-null demo — nothing in the protocol currently selects a dyad or topic where a gap is likely).

**Wording checklist for future core edits** — the escape hatches the critique round removed. Any core element containing one of these is belt in costume: *"reliably"*, *"materially"*, *"live"*, *"adequately"*, *"properly administered"*, *"in the right context"*.

---

## Negative heuristic

Stated **separately from the core, and deliberately not as a numbered element** — a core element saying "refutations hit the belt" would immunize itself.

1. **Refutations route to the belt.** A failed hypothesis triggers **mechanism transformation** — try a different segment, channel, framing, delivery — not project abandonment. This is the rule [hypotheses.md](hypotheses.md) already states.
2. **A core-hit triggers the programme-health check**, not an immediate belt patch. A refutation matching a stated core-hit signature is not absorbable by segment/channel adjustment; treating it as if it were is the immunization move.
3. **Core-adjacent belt hypotheses have an ad-hoc-ness budget.** A belt hypothesis flagged `core-adjacent` in [hypotheses.md](hypotheses.md) may absorb a **stated number of auxiliary adjustments**. Exceeding the budget escalates to a core-hit review rather than another patch.
4. **Core retirement has exactly two routes:** (a) a **recorded founder decision** with reasons, or (b) **displacement by a rival** with corroborated novel predictions the core cannot match. Nothing else retires a core element — and neither route is available *silently*.

---

## Positive heuristic

The pre-planned sequence of models to develop next is **already documented**; this doc points rather than duplicates (CLAUDE.md — Reference Over Duplication).

- **Delivery/facilitation sequence** — [theory-of-change.md](theory-of-change.md) § *The Facilitation Ladder* and § *The Layer Model*.
- **Measurement sequence** — [philosophy.md](philosophy.md) § *The Measurement Stack*.

**Adoption-time novelty audit (the discipline this adds).** Pre-naming successor framings is **not required**. Successors historically emerge only after falsifying evidence lands, and Lakatos's discovery-vs-justification distinction makes that legitimate: ideas may arrive however they arrive. **Rigor applies at adoption, not at conception** — when a successor framing is adopted, document what novel content it adds over its predecessor, *before* it is tested. That record is what the progressivity ledger reads.

---

## Citation discipline

An **authoring rule**, binding on all public writing (articles, landing copy, decks, event material). Content and authoring skills inherit it by reference to this section.

| Claim | How it may be stated |
|---|---|
| Illusion of transparency; speaker overestimation of being understood; closeness-communication bias | **Cite the literature.** These are established findings — name the source. |
| The **recursive composite** ("illusion of recursive understanding") | **Own it as the programme's own conjecture**, extending Pinker. **MRL 1-2.** |
| Paraphrase-gated persuasion as a mechanic | **Cite prior art, never claim discovery** — **Rogers & Roethlisberger, *HBR* 1952** (the oldest and the most damaging to any discovery claim: *restate the previous speaker's ideas to that speaker's satisfaction before replying*, in a mainstream management journal, added 2026-08-12); Gottman-Rapoport for the clinical/couples domain; closed-loop readback / the two-challenge rule (crew resource management) for the work domain. **The usable form of the claim is *"nobody does this"*, never *"nobody thought of this"*.** |

**Never write "proven by cognitive science" of the composite claim.** The components are proven; the recursive composite that makes the failure self-concealing is ours and unproven. Blurring them is the single most damaging citation error available to this programme — it converts the boldest conjecture into a borrowed fact and removes it from the scoreboard.

---

## Rivals registry

Programmes that could explain our evidence as well or better. Untracked rivals mean no rational persistence criterion: without them, "we're still here" is indistinguishable from "we should have switched."

**Progressivity status** is judged the same way we judge ourselves — corroborated novel predictions, not plausibility.

| # | Rival programme | Its core claim | Evidence FOR, from our own data | Evidence AGAINST, from our own data | Progressivity status |
|---|---|---|---|---|---|
| **(a)** | **Affect-first listening** — Rogers, NVC (Rosenberg), Gottman-Rapoport | What repairs communication is felt empathy and validation; comprehension accuracy is downstream of feeling heard | Session feedback is overwhelmingly affective — *"this feels like being actually heard"* (H-Foundation-UnderstandingGapMeasurable). H-AffectiveHonesty holds that cold rooms inflate self-rated comprehension, i.e. affect gates the measurement | Gottman-Rapoport **gates persuasion on paraphrase-to-satisfaction** — the same researcher whose 1998 paper is the standard objection to active listening now runs a paraphrase gate, which is our mechanic, not theirs alone. Our claimed separation is **agreement-decoupling**: G-R *requires* validation, CP permits understood-and-rejected | **Undetermined — discriminator pre-registered, not yet run.** See H-PopperianIncrement. Domain caveat: G-R is Gottman Method *training material*, not a trial; no component RCT exists |
| **(b)** | **Coordination / process tooling** — specs, RFCs, decision docs, PM process | Misalignment is an artifact problem: write it down well enough and shared understanding follows | The team wedge's own pain statement (rebuild after discovering a decision was understood differently) is exactly what better specs claim to fix; teams reach for this first, unprompted | H-BuildRightThing-Cause names the competing explanations directly (changing requirements, thin specs, weak PM) and treats them as **the thing to rule out**. Not yet ruled out | **Untested by us.** The `-Cause` leg is testable only after installs exist |
| **(c)** | **AI-mediated alignment** — an agent verifies, summarizes, and reconciles; no human protocol needed | The verification work can be delegated to a model, so the human practice is transitional | Nothing in our data yet. This rival is **the least evidenced and the fastest-moving** — recorded because absence of a row would read as absence of a threat | Argument only, not data: the wedge's own problem statement holds that AI **amplifies** divergence (each side's agent ships faster in opposing directions). K5 (human unit) and K4 (speaker authority) are the core commitments this rival attacks — the delegability question is explicitly open belt | **Unassessed — the registry's weakest row.** Named as a gap, not a judgment |
| **(d)** | **The null programme** — affinity-based trust is adequate | For most dyads, existing rapport already produces enough shared understanding; the gap is real but not worth instrumenting | **28 sessions, zero cost named** ([hypotheses.md](hypotheses.md) H-WTP-Pain). The **true-null demo** — a high-mutual-understanding peer dyad returned a matched 7/7, counterpart reported no effect while saying he would have welcomed one. H-CalibratedButBlind is the founder-raised version of this rival | Closeness-communication bias runs the **opposite** way — spouses and friends understood no better than strangers, yet speakers were *more* confident of being understood with close others (Savitsky et al. 2011). Affinity inflates the illusion rather than closing the gap | **Live and partially corroborated on our own data.** The strongest rival in the registry. H-WTP-Pain's revelation reframe is the programme's answer and is itself untested |
| **(e)** | **Work-domain verification practice** — closed-loop readback / two-challenge rule (CRM), Edmondson team-learning & psychological safety, after-action review, pre-mortems, "disagree and commit" | Work teams already have verification practices that work; the gap is adoption and safety, not the absence of an instrument | Closed-loop readback is **arguably closer prior art to CP's mechanic than Gottman-Rapoport is** — restate → originator confirms → only then proceed. Edmondson's finding that safety comes from what the highest-status person does *first* is load-bearing in our own carrier mechanic. CRM appears in our docs as a source of countable "corpses" (H-AccountingLayer) | These practices carry **no sealed-bid estimate, no Min, no calibration measurement** — the number is our claimed increment. But that increment is **contested internally**: the sole field adopter dropped the score (H-ProtocolSpreadsWithoutTool), and the "is the number load-bearing" sub-bet is open | **Undetermined and under-examined.** CRM sat in our docs for months without being recognized as prior art; the 2026-08-03 research pass ran in the couples literature and nearly returned a couples-therapy control arm for a work-team test |

**Rival (e) got stronger on our own data, 2026-08-12 — recorded rather than absorbed.** Row (e)'s core claim is *"the gap is adoption and safety, not the absence of an instrument."* **Rogers & Roethlisberger 1952** is that claim as a historical fact: the mechanic was published in *HBR* seventy-four years ago, costs nothing, and never became standard practice. Add to it the two-gate finding (disclosure needs legibility **and** safety — [hypotheses.md](hypotheses.md) H-NormFlip), which is (e)'s "and safety" clause arriving from our own reasoning rather than theirs. **This is the registry working as designed, so state the consequence plainly rather than softening it: on the adoption leg, (e) is now better evidenced than our own instrument-centred framing.**

**What survives, and it is a relocation rather than a rebuttal.** CP is not refuted by (e), because CP's answer moves onto the same ground (e) names: **the product is an adoption mechanism** — social conditions, commitment device, measurement — **not a new instrument** ([lean-canvas.md](lean-canvas.md) §UVP "Selling adoption, not the technique"). The live question therefore is no longer *"is our mechanic better than readback?"* but *"does anything close the seventy-four-year adoption gap?"*, which is exactly what H-LegibilityVsCost branch (C) now bets on. **The honest cost of the relocation:** the "number is our claimed increment" differentiator in the row above is unaffected but is *no longer the load-bearing claim* — and it remains internally contested (the sole field adopter dropped the score). **What would make (e) win outright:** an adoption mechanism from that tradition — TeamSTEPPS-style curricula, CRM training — shown to install voluntary comprehension-verification in teams with no authority to mandate it. Nobody has looked; that is the check to run before the next re-cut.

**Why (e) is not optional.** Rivals (a)–(d) were the original seed, and (a) — affect-first listening — is a **couples/clinical** rival for a work-team product. A "≥4 rivals seeded" checklist passes on a registry pointed at the wrong market. Row (e) is the work-domain rival set, and the active wedge is a work-team wedge.

**Crucial discriminator experiment:** **H-PopperianIncrement** is the registry's live discriminator against rival (a) — and, via its control-arm specification, against (e). It is at the **front of the scientific test queue**, with the install-precondition recorded there.

> **"Front of the scientific queue" is defined as an auditable predicate, not a claim about row position:** it means `Pri: P0-scientific` in the [hypotheses.md](hypotheses.md) summary table, and **exactly one entry may hold that value at a time.** Check it with `grep -c 'P0-scientific' docs/hypotheses.md` (expect 1). The summary table is *not* maintained in strict rank order — H-BuildRightThing sits at row 10 carrying P0 — so **row position proves nothing** and a queue claim resting on it would be exactly the kind of unfalsifiable assertion this doc exists to catch. The `Pri` cell is the artifact; the ordering is not. Its control arm is fixed as **closed-loop readback / two-challenge**, not Gottman-Rapoport: G-R is clinician-mediated and unadministrable to a seed–A team ICP, and *a control arm you cannot administer to your own ICP is not a control arm.*

---

## Progressivity ledger

A running list of **novel predictions** — what a framing predicted that its predecessor did not, recorded **before** the test — and whether they were corroborated.

**Novelty grade is recorded honestly and separately from corroboration.** A prediction that was only recognized as such *after* the evidence landed is a **retrodiction**: real evidence, but it cannot count toward progressivity, because a degenerating programme produces retrodictions at exactly the same rate as a progressive one. Grading them as novel would defeat the ledger's only purpose.

| # | Framing | Novel prediction | Predecessor did not predict | Novelty grade | Corroboration | Source |
|---|---|---|---|---|---|---|
| **L1** | Understanding-Gap as a **measurable** quantity (H-Foundation lineage) | Reducing the measured in-session gap changes the felt experience of being understood | Pre-programme framings treated understanding as unmeasurable and self-evident | **Retrodiction** — recognized as a prediction after the sessions, not before | **Corroborated**, MRL 6 — 30+ sessions; consistent participant report | [theory-of-change.md](theory-of-change.md); H-Foundation-UnderstandingGapMeasurable |
| **L2** | Protocol/tool split (H-ProtocolSpreadsWithoutTool, split 2026-07-14) | Leg **(a)**: the protocol sustains **without the tool** — an adopter keeps using it unaided | The unsplit framing predicted tool adoption and protocol adoption together, so it could not distinguish them | **Novel** — the split was recorded 2026-07-14, before the field datum | **Leg (a) supported, n=1** — an unsolicited practitioner outside the founder's circle sustained tool-free use for weeks and reported that nothing comes back for rework. **Leg (b) refuted, n=1** — he never transmitted it, corroborating R₀≈0 | H-ProtocolSpreadsWithoutTool |
| **L3** | **H-PopperianIncrement** (pre-registered 2026-08-07, D4) | CP's falsification layer — sealed-bid estimate exchange + agreed refutation conditions + "would this survive a test" — beats a matched **closed-loop readback / two-challenge** control on (a) errors caught and (b) decision quality, with paraphrase held constant in both arms | The predecessor framing ("CP beats active listening") did not specify a mechanic-matched control, so it could not distinguish a real increment from beating a weak control | **Novel — pre-registered before any test** | **Pending.** Blocked on the recorded install-precondition: it cannot run before installs exist | H-PopperianIncrement; [P1026](../features/done/2026-06-10/p1026_research_programme_rigor_layer.md) D4 |

**Reading the ledger as it stands (2026-08-07): one corroborated novel prediction (L2 leg (a), n=1), one pre-registered and pending (L3), one retrodiction (L1).** That is a thin ledger, and it is *supposed* to read thin — the alternative was a scoreboard on which it read full.

**Two disciplines the ledger enforces:**
- **Pre-registration costs nothing and is the whole difference.** A prediction written down before the test counts as novel; the same sentence written after the result is an accommodation. L3 is pre-registered specifically so its eventual result can count.
- **Corroborating a novel prediction is the only thing that earns progressivity** — which is why K7's operational metrics were kept in the belt (D2). Core content is ineligible by construction.

---

## Stopping rule

Generalizes the 2026-07-31 avoidance-guard pattern, which existed but was attached to a **parked** hypothesis rather than the active slot — a coverage hole recorded in [decisions.md](decisions.md). Parameters set by D1–D4 (**N=3, M=2**), 2026-08-07.

### Clause 1 — Repeat before re-cut

> **A wedge definition may not be re-cut until it has been tested at least twice.**

Composes with the existing **named-human-field-datum gate** ([decisions.md](decisions.md) 2026-07-29).

**Why this clause leads.** A rule keyed only on corroboration would have fired in July for the *wrong reason*. Nothing was corroborated because nothing was **run**: across ~6 founder interviews the wedge was re-cut 4 times, so no single definition was tested more than about twice — nothing converged because nothing was repeated, and no definition was falsified because they were untested. The diagnosed failure is **re-cutting before repeating**, and this clause names it directly.

### Clause 2 — Lakatos clause

> **3 tests run with zero novel predictions corroborated**, OR **2 months with zero tests run** ⟹ the pivot cadence itself is the anomaly. Run the programme-health review **before any further re-cut**.

### Clause 3 — The clock counts tests run

> **The clock counts tests run, not calendar time since the last re-cut.**

Otherwise a month of copy iteration silently resets it — which is exactly the observed July pattern.

### Why these parameters

| Parameter | Chosen | Rejected | Reason |
|---|---|---|---|
| **N** (tests with zero corroboration) | **3** | N=5 | Never fires at current test volume — ceremony, which is this doc's own top risk |
| | | N=2 | Fires on noise |
| | | | N=3 would have fired **exactly once** across July — the correct rate for a rule that must be rare but real |
| **M** (months with zero tests) | **2** | M=3 | Lets a full quarter of pure copy iteration pass unflagged — the observed failure |
| | | M=1 | Fires immediately on a window where zero tests ran for known reasons (build frozen, campaign prep) — overridden on day one, and **a rule overridden once loses its authority permanently** |
| | | | M=2 bites (July ran ~1 month per re-cut) without flagging an ordinary slow fortnight |

---

## Programme-health check

`/slava:maintain:programme-health` reads this doc, [hypotheses.md](hypotheses.md), and recent [decisions.md](decisions.md) entries, and outputs **exactly one verdict** — *progressive · stagnating · degenerating* — plus **one recommendation**.

**Invoked:** automatically by `/slava:maintain:monthly`; and after any transform-trigger fires or any stopping-rule clause trips.

**Deliberately one verdict and one recommendation, not a report.** The top risk of this whole layer is ceremony — a ledger that becomes ritual. A health check that emits a document would be the first symptom.

---

## Known conflict of interest

**The same person owns the core, routes the refutations, and judges the rivals.** This is the sharpest critique of the entire exercise and it is not fully answerable.

**What is done about it:**
- The health check runs as a **fresh subagent given only the docs** — never the conversation that produced the pivot, whose framing is the thing under audit.
- **Verdict criteria are written before any period is judged** (this doc, above), not chosen after the evidence is in.
- **Core-hit signatures were written before the refutations they will classify** — the classification is mechanical rather than discretionary at the moment it matters.
- Rival evidence columns are populated **from our own data**, including where it favors the rival — see rival (d), which is recorded as the strongest rival in the registry.

**What is not done about it:** none of this is independent review. It reduces the conflict; it does not remove it. A genuinely independent judgment would require someone who does not own the core, and the programme does not currently have one.
