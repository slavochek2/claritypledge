---
status: all-done
type: task
rank: 1
created_date: '2026-08-03'
tags:
  - research-programme
  - epistemics
  - docs
  - process
pipeline_ran:
  - create-spec
  - challenge-prd
  - dev
  - ship
completed_at: 2026-08-07
---

# P1026: Research-Programme Rigor Layer (Lakatos) — Core Write-Down, Novel-Prediction Discipline, Rivals Registry, Programme-Health Check

## Problem

**Situation:** The project already runs an implicit Lakatosian research programme: hypotheses.md declares "a failed hypothesis triggers mechanism transformation, not project abandonment" (a verbatim negative heuristic), every belt hypothesis carries a falsifier, and past refutations (R₀≈0, flat demos, zero WTP) were absorbed by adjusting segments/channels while the core commitments stayed untouched.

**Complication:** Because the structure is implicit, three rigor gaps are invisible. (1) The hard core is written down nowhere — every refutation's classification (belt-hit vs core-hit) happens ad-hoc, in the moment. (2) The stated progress metric ("hypotheses falsified per unit time") measures activity, not progress — Lakatos's criterion is corroborated *novel predictions*, and no hypothesis format field captures them, so a degenerating programme (each pivot ad-hoc, accommodating only the anomaly that killed its predecessor) would look identical to a progressive one on the current scoreboard. (3) Rival programmes are untracked, so there is no rational persistence/abandonment criterion. Concretely: the six wedge re-cuts of July 2026 cannot currently be classified as rapid heuristic exploration or degenerating ad-hoc patching — the data needed for that judgment is not being recorded.

**Question:** What minimal doc/process changes make progressive-vs-degenerating status observable and refutation-routing mechanical?

## Appetite

Medium blast radius — touches hypotheses.md conventions, one new doc, two skills, README, CLAUDE.md; all docs/process, no product code. Fully reversible (git revert; conventions apply forward-only). Decision density was high — core wording, the truth-measurement-layer question, and stopping-rule parameters were all `[FOUNDER DECISION]`; **all four resolved 2026-08-07**, see `## Resolved Decisions`.

## Solution

**1. `docs/research-programme.md` (new doc — one home, per CHARTER):**
- **Hard core** — numbered commitments (draft in Appendix, already passed one adversarial-critique round), each labeled with evidential status (literature-proven components vs own conjecture). The core is held by methodological decision and says so.
- **Citation discipline (authoring rule, stated in the doc):** public writing cites the literature-proven *components* (illusion of transparency, speaker overestimation of being understood, closeness-communication bias) and owns the recursive *composite* ("illusion of recursive understanding") as the programme's own conjecture extending Pinker — never "proven by cognitive science." Content/authoring skills inherit this by reference to research-programme.md.
- **Negative heuristic** — stated separately from the core, not as a numbered element (a core element saying "refutations hit the belt" would immunize itself): refutations route to the belt; a core-hit triggers the programme-health check; core retirement = recorded founder decision with reasons, or displacement by a rival with corroborated novel predictions the core cannot match.
- **Positive heuristic** — pointer to the pre-planned model sequence already documented (facilitation ladder + layer model in theory-of-change.md; measurement stack in philosophy.md). No duplication.
- **Rivals registry** — table: rival programme, its core claim, evidence for/against from our own data, progressivity status. Seed with four: (a) affect-first listening (Rogers/NVC/**Gottman-Rapoport** — H-PopperianIncrement is the crucial discriminator experiment; **seeded with citations 2026-08-03**, see below); (b) coordination/process tooling; (c) AI-mediated alignment (agent verifies/summarizes, no human protocol needed); (d) the null programme — affinity-based trust is adequate for most dyads (literature against it: closeness-communication bias; field data partially for it: 28 sessions with no cost named, the true-null demo). Implementation consequence: annotate H-PopperianIncrement in hypotheses.md as the rival-discriminator against rival (a) and move it to the front of the scientific test queue — **approved 2026-08-07 (D4), with a recorded install-precondition and the control arm fixed as closed-loop readback / two-challenge, not Gottman-Rapoport.** The registry also needs a **work-domain rival row** (see D4's implementation-gap note).
- **Progressivity ledger** — running list of corroborated novel predictions. Seed: in-session Understanding-Gap reduction (H-Foundation lineage, MRL 6); H-ProtocolSpreadsWithoutTool(a) (sustained tool-free use, "zero rework").
- **Stopping rule** — the 2026-07-31 avoidance-guard pattern generalized. **Parameters set 2026-08-07 (D3): N=3, M=2**, in two clauses: (1) *repeat before re-cut* — a wedge definition may not be re-cut until tested at least twice; (2) *Lakatos clause* — 3 tests run with zero novel predictions corroborated, or 2 months with zero tests run, → the pivot cadence itself is the anomaly, run programme-health review before any further re-cut. **The clock counts tests run, not calendar time since the last re-cut.**

**2. hypotheses.md format additions (forward-only, documented in the preamble):**
- **Novel prediction** field on every new or materially-updated hypothesis: what this predicts that the predecessor framing didn't, stated before the test — plus corroboration status (pending / corroborated / failed). Falsifiers protect against dogmatism; novel predictions protect against degeneration — different disciplines, both required.
- **Programme tag:** `business | scientific | both` (many are both, e.g. H-PopperianIncrement).
- **Core-adjacent flag** for belt hypotheses whose failure cannot be absorbed by segment/channel adjustment. Apply first to H-WTP-Pain (revelation reframe): its ad-hoc-ness budget is ONE auxiliary — the demo-selection/dyad-pre-screening precondition. If revelation stays unreliable on dyads pre-screened for likely divergence, that escalates to a core-hit review, not another belt patch.

**3. Programme-health skill** (`/slava:maintain:programme-health`; approval of this spec = approval to create it): reads research-programme.md + hypotheses.md + recent decisions.md entries; outputs exactly one verdict (progressive / stagnating / degenerating) + one recommendation, backed by: novel predictions corroborated this period, pivot count, heuristic-vs-anomaly work ratio, rival status delta. Invoked by /monthly (auto) and after any transform-trigger fires. Includes the **adoption-time novelty audit**: when a successor framing is adopted, document what novel content it adds. Pre-naming successors is NOT required — successor framings historically emerge only after falsifying evidence lands, and Lakatos's discovery-vs-justification distinction makes that legitimate: ideas may arrive however they arrive; rigor applies at adoption, not at conception.

**4. Wiring:** /docs-strategy-update gains a gate — any hypothesis add/update missing the Novel-prediction field is flagged; audit mode adds a rivals-reflection pass. /docs-strategy-update's routing awareness also gains research-programme.md as a home (core, rivals registry, progressivity ledger) AND the README/CLAUDE.md reflection duty — so every strategy-shift sync checks whether those surfaces need updating, not just the five strategy docs. /create-spec optionally records `driver: heuristic | anomaly` in spec frontmatter (one line; ratio read by programme-health; no enforcement).

**5. Public description:** README gets a short "As a research programme" section (the project is a research programme with a commercial delivery arm, not only a startup); CLAUDE.md Reference Guide gets ≤2 lines — via the `/slava:maintain:claude-md` gate, never edited directly.

## Risks / Non-Goals

### Risks
- **Ceremony without behavior change** — the ledger becomes ritual. Mitigation: forward-only application; the health skill outputs one verdict + one recommendation, not a report; total new required text per hypothesis is ~2 lines.
- **Self-judged progressivity** — the same person owns the core, routes refutations, and judges rivals (the sharpest critique of the whole exercise). Mitigation: the health check runs as a fresh subagent given only the docs (never the conversation that produced the pivot); verdict criteria are written before any period is judged. This reduces, not removes, the conflict — the doc says so honestly.
- **Core wording ossifies belt content** — the failure mode the critique round caught in draft 1 (three of five elements were belt-in-costume). Mitigation: the Appendix draft ships only after founder review of the flagged decisions; every element carries an evidential-status label; the critique's escape-hatch list ("reliably", "materially", "live") is a wording checklist for the final pass.

### Non-Goals
- Do NOT convert hypotheses.md, lean-canvas.md, or any doc to JSON/YAML schemas. Markdown + named bold fields. (A lint script over headings is a future option, explicitly out of scope here.)
- Do NOT retroactively rewrite existing hypothesis entries — the format applies forward.
- Do NOT restructure lean-canvas.md — its boxes ARE belt hypotheses of the business programme and already carry falsifiers; add at most a cross-reference line to research-programme.md.
- Do NOT write the Lakatos article inside this spec's implementation — it goes through the content pipeline (/draft-blog) separately.
- Do NOT schedule the health skill beyond the /monthly wiring.
- Do NOT re-open or silently re-scope the truth-measurement question — **resolved by D2** (aim → core as K7; operational metrics stay belt, MRL 1-2, scale-gated). Implementing it as anything other than that split would perform a mission shrink, or an immunization, without recording it.

### Alternatives Considered
- **Core inside philosophy.md:** rejected — philosophy.md is the epistemological foundation and holds the scientific programme's boldest *testable* conjectures (Asymmetric Conversion, ITT/RITT). Mixing the protected core with testable content is the exact confusion this spec removes. research-programme.md points to it instead.
- **JSON schema for hypotheses:** rejected — the bottleneck is discipline, not machine-readability; JSON would break grep/diff/human ergonomics of the whole docs ecosystem.
- **Separate business/scientific hypothesis files:** rejected — several hypotheses belong to both programmes; a tag is sufficient and keeps one scoreboard.

### Rollback Strategy
Delete research-programme.md; revert README/CLAUDE.md lines; remove the skill directory; revert the wiring edits in /docs-strategy-update and /monthly. No product code or data involved.

## Done-When

- [x] `docs/research-programme.md` exists with: founder-approved numbered hard core **K1–K7, each carrying a core-hit signature line** (K6/K7 declaring themselves not empirically hittable), separate negative-heuristic statement, rivals registry (≥4 seeded with evidence columns), progressivity ledger (≥2 seeded), stopping rule with N=3 / M=2 and both clauses (repeat-before-re-cut; tests-run clock)
- [x] The rivals registry contains a **work-domain rival row** — closed-loop readback / CRM, Edmondson team-learning, after-action review, pre-mortems. Affect-first listening alone is a couples/clinical rival for a work-team product; ≥4 rows is not sufficient without this one
- [x] K2's topic precondition appears as a **belt** entry (*a topic on which the parties hold a live, consequential, unresolved difference*), not inside the core element
- [x] hypotheses.md preamble documents Novel-prediction field, programme tag, and core-adjacent flag; H-WTP-Pain carries the core-adjacent flag with its one-auxiliary budget
- [x] H-PopperianIncrement annotated as rival-discriminator, moved to front of the scientific queue **with its install-precondition recorded**, control arm fixed as closed-loop readback / two-challenge, and its prediction **pre-registered** (the pre-registration is a progressivity-ledger entry)
- [x] `/slava:maintain:programme-health` exists; a dry run on current docs produces a verdict + one recommendation
- [x] /monthly invokes programme-health; /docs-strategy-update flags a test hypothesis missing its Novel-prediction field
- [x] README and CLAUDE.md describe the project as a research programme (CLAUDE.md change passed the claude-md gate)
- [x] All `[FOUNDER DECISION]` items are resolved and recorded — D1–D4, 2026-08-07, see `## Resolved Decisions`

## Resolved Decisions

Founder decisions D1–D4, resolved 2026-08-07. Permanent record — downstream skills read these rather than re-opening them.

### D1 — Core wording: accept K1, K3–K6; two structural fixes

**Decision:** ship the drafted core with two mechanical corrections rather than another wording round. (1) **Strip K2's "adequately chosen topic" hedge** and restate topic-selection as a named, checkable belt precondition — it is checkable, so it is belt by definition, and left in the core it functions as an unrecorded auxiliary knob (the same class the critique round removed "reliably" for). (2) **Require a core-hit signature line on every element.** Only K4 had one; K1, K2, K3, K5, K6 did not. A core element with no stated core-hit signature cannot be hit *noticeably* — the refutation lands and routes to the belt by default, which is the immunization this spec exists to prevent.

**Alternatives rejected:** ship as drafted (leaves the K2 hedge and five silent elements — the doc reads rigorous while the mechanism is absent); a second full adversarial-critique round (draft 1 already absorbed the structural corrections — three belt-in-costume elements demoted, the negative heuristic extracted, two unstated commitments added; the residual defects are structural, and fix (2) addresses them directly where more rhetoric would not).

### D2 — Truth-measurement ambition: split, not core-or-demote

**Decision:** split the ambition along the K6 pattern already used for revenue. The **aim** enters the core as **K7**; the **operational metrics** (Asymmetric Conversion Rate, asymmetry score, point truth scores, retention/conversion) stay in `philosophy.md` / `theory-of-change.md` as belt, labeled MRL 1-2 and scale-gated.

**Why neither pole:** putting the full ambition in the core would immunize the programme's *boldest testable* conjecture while K2 (MRL 6, demonstrated) sits beside it — inverting the evidential order — and would permanently disqualify it from ever contributing a corroborated novel prediction, since core content cannot earn progressivity. Pure demotion to recorded aspiration is honest but leaves the core mute on what impact-first is aiming *at*: K6 says revenue is second without saying what comes first.

**Consistency note:** this makes the doc apply one rule uniformly. K6 = mission in core, measurement-proxy in belt. K7 = aim in core, measurement layer in belt.

### D3 — Stopping rule: N=3, M=2, two clauses, clock counts tests run

**Decision:**
1. **Repeat before re-cut.** A wedge definition may not be re-cut until it has been **tested at least twice**. Composes with the existing named-human-field-datum gate (decisions.md 2026-07-29).
2. **Lakatos clause.** **3 tests run with zero novel predictions corroborated**, OR **2 months with zero tests run** → programme-health review before any further re-cut.
3. **The clock counts tests run, not calendar time since the last re-cut** — otherwise a month of copy iteration silently resets it, which is exactly the observed July pattern.

**Why clause 1 leads:** the drafted rule keyed only on corroboration would have fired in July for the wrong reason. Nothing was corroborated because nothing was *run* — decisions.md 2026-08-07: across ~6 founder interviews the wedge was re-cut 4 times, so "no single definition has been tested more than ~twice — nothing converged because nothing was repeated… no definition has been falsified; they were untested." The diagnosed failure is re-cutting before repeating, and clause 1 names it directly.

**Why these parameters:** N=3 would have fired exactly once across July — the correct rate for a rule that must be rare but real. N=5 never fires at current test volume (ceremony — risk #1 of this spec). N=2 fires on noise. M=2 bites (July ran ~1 month per re-cut; the prior avoidance-guard used ~1 month) without flagging an ordinary slow fortnight. M=3 lets a full quarter of pure copy iteration pass unflagged, the observed failure. M=1 would fire immediately on a window where zero tests ran for known reasons (build frozen, campaign prep) — overridden on day one, and a rule overridden once loses its authority permanently.

### D4 — H-PopperianIncrement: front of the scientific queue, with an install-precondition

**Decision:** promote to the front of the **scientific** test queue (the business P0, H-BuildRightThing-Sell, is unaffected and remains testable now), with an explicit precondition recorded alongside it: **it cannot run before installs exist.** The runnable-today portion is done now — (a) fix the control arm as **closed-loop readback / two-challenge rule**, not Gottman-Rapoport (per the 2026-08-03 correction: G-R is clinician-mediated and unadministrable to a seed–A team ICP; a control arm you cannot administer to your own ICP is not a control arm), and (b) **pre-register the prediction**, which costs nothing and is what makes the eventual result count as a *novel* prediction rather than a post-hoc accommodation. Pre-registration seeds the progressivity ledger, which currently holds two entries.

**Why the precondition is not optional:** promoting it without one puts an unrunnable item at the top of the queue — visible progress on the scoreboard while nothing moves. That is precisely the degeneration signature this spec was written to detect, and it would be performed by the spec itself.

### Implementation gap surfaced alongside D4 (not a founder decision)

The rivals registry as seeded covers only affect-first listening — a couples/clinical rival for a work-team product. Done-When's "≥4 seeded" is satisfied by the current four, so the checklist would pass on a registry pointed at the wrong market. The **work-domain rival row** (closed-loop readback / CRM, Edmondson team-learning, after-action review, pre-mortems) is now an explicit Done-When item.

---

## Appendix — Hard core (post-critique; founder-approved 2026-08-07)

Draft 1 (five elements) went through an adversarial Lakatos-literate critique. Findings applied: "reliably" removed from the protocol claim (it imported the open P0 question into the core); the three-criteria taxonomy demoted to belt (it has a published falsifier and two revisions); the interpersonal constraint split (protected half = first-person authority; delegability = belt); the negative heuristic extracted from the core; two unstated core commitments added (speaker authority; human unit).

**Every element carries a core-hit signature** — the observation that would constitute a hit on *this* element rather than on the belt. An element without one is unfalsifiable in the bad way: a core-hit could land and never be noticed. Value/aim elements (K6, K7) are not empirically hittable and say so; their retirement route is a recorded founder decision, per the negative heuristic.

**K1 (Miscalibration).** Miscalibrated mutual understanding is the default in conversation: both parties' confidence that understanding happened exceeds actual understanding, and because each also believes the other shares it, the failure is self-concealing. *(Components literature-proven — illusion of transparency, speaker overestimation, closeness-communication bias; the recursive composite is the programme's own conjecture extending Pinker, owned as its boldest claim, MRL 1-2.)*
> **Core-hit signature:** across a representative sample, measured comprehension tracks felt comprehension with no systematic overestimate, OR the recursive layer is absent (parties do not in fact assume the other shares the belief) ⟹ the default is calibrated and the programme has no problem to solve.

**K2 (Protocol).** A paraphrase-and-confirm protocol with speaker-side verification can convert illusory understanding into verified understanding within a session *(demonstrated, 30+ sessions, MRL 6)*. Verified comprehension is by construction a separate axis from agreement; the empirical behavior of that separation (softening, decomposition) is belt.
> **Topic precondition moved to belt (D1):** the draft read "given an adequately chosen topic." "Adequately chosen" is an escape hatch of the same class as the "reliably" the critique round removed — any failed session absorbs into it without recording that an auxiliary was adjusted. The precondition is checkable, so it belongs in the belt, stated as: *a topic on which the parties hold a live, consequential, unresolved difference.* Belt-testable, and its failure is a belt-hit.
> **Core-hit signature:** competent administration on topics meeting the stated belt precondition fails to move verified understanding within a session, across operators ⟹ the conversion mechanism itself does not work.

**K3 (Cost boundary).** The unverified gap is costly precisely where its natural consequence-arbiter fails — where feedback is delayed enough that error compounds silently instead of self-correcting. *(The exactly-three-failure-modes taxonomy — fuzzy intent / delayed feedback / concentrated stakes — is belt, where its falsifier already lives.)*
> **Core-hit signature:** domains with fast, reliable consequence-feedback accumulate unverified-understanding costs at the same rate as delayed-feedback domains ⟹ the arbiter-failure boundary is not where cost concentrates, and the targeting premise is wrong.

**K4 (Speaker authority).** The speaker is the sole arbiter of whether they were understood; "verified" means speaker-confirmed representation. *(Previously unstated; the entire measurement stack presupposes it.)*
> **Core-hit signature:** speaker self-report demonstrably fails to track accurate representation — speakers confirm paraphrases that independent scoring shows are wrong, or reject ones it shows are right ⟹ the measurement stack rests on an invalid arbiter.

**K5 (Unit).** The unit of intervention is a human relationship — verification requires a counterparty with first-person authority to reject the paraphrase ("that's not what I meant"). Whether that authority can ever be delegated (digital twin, async artifact) is a belt question.
> **Core-hit signature:** verified understanding is achieved with *no* counterparty holding first-person rejection authority at all ⟹ the relationship is not the unit. (Delegation to a proxy that still derives its authority from the person is belt, not core — that is the open delegability question.)

**K6 (Mission).** The programme is impact-first: the aim is spreading the verification practice; revenue is second. *("Revenue is proof of impact" is a measurement-proxy claim and lives in the belt — otherwise any WTP refutation could be deflected as "revenue is second anyway.")*
> **Core-hit signature:** none — this is a value commitment, held by decision, not an empirical claim. Retirement route is a recorded founder decision with reasons.

**K7 (Aim) — added by D2.** The programme aims at a truth-measurement layer built on verified understanding, not only at better conversations.
> **Belt, not core:** the operational claims that would realize this aim — the Asymmetric Conversion Rate, the asymmetry score, point truth scores, retention/conversion metrics ([philosophy.md](../docs/philosophy.md), [theory-of-change.md](../docs/theory-of-change.md)) — stay where they are, labeled **MRL 1-2 and scale-gated**. They are the programme's boldest *testable* conjectures and must stay refutable: core content cannot earn corroborated novel predictions, so immunizing them would forfeit the best available source of progressivity.
> **Core-hit signature:** none — same class as K6. This is the aim, not a finding.

**Founder decisions D1–D4 resolved 2026-08-07** — see [## Resolved Decisions](#resolved-decisions) above for each decision, its rejected alternatives, and the reasoning.

---

## Rival (a) evidence seed — pointer

Rivals-registry row (a) was seeded with citations on 2026-08-03 (Gottman active-listening research pass). **Evidence, rationale, rejected alternatives, and the deliberate non-recordings live in [docs/decisions.md](../docs/decisions.md) 2026-08-03 [product]** — per CHARTER rule 3, dated rationale belongs in the append-only log, not inside a spec that will move to `features/done/`. Implementation consequence for this spec: the registry needs a **work-domain rival row** (closed-loop readback / CRM, Edmondson team-learning, after-action review) — currently it seeds only affect-first listening, a couples/clinical rival for a work-team product.
