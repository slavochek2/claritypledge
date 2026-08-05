---
status: today
type: task
rank: 0.75
created_date: '2026-08-03'
tags:
  - research-programme
  - epistemics
  - docs
  - process
delivery_stage: challenge-prd
pipeline_ran: [create-spec, challenge-prd]
locked_at: '2026-08-03T07:24:42.023Z'
---

# P1026: Research-Programme Rigor Layer (Lakatos) — Core Write-Down, Novel-Prediction Discipline, Rivals Registry, Programme-Health Check

## Problem

**Situation:** The project already runs an implicit Lakatosian research programme: hypotheses.md declares "a failed hypothesis triggers mechanism transformation, not project abandonment" (a verbatim negative heuristic), every belt hypothesis carries a falsifier, and past refutations (R₀≈0, flat demos, zero WTP) were absorbed by adjusting segments/channels while the core commitments stayed untouched.

**Complication:** Because the structure is implicit, three rigor gaps are invisible. (1) The hard core is written down nowhere — every refutation's classification (belt-hit vs core-hit) happens ad-hoc, in the moment. (2) The stated progress metric ("hypotheses falsified per unit time") measures activity, not progress — Lakatos's criterion is corroborated *novel predictions*, and no hypothesis format field captures them, so a degenerating programme (each pivot ad-hoc, accommodating only the anomaly that killed its predecessor) would look identical to a progressive one on the current scoreboard. (3) Rival programmes are untracked, so there is no rational persistence/abandonment criterion. Concretely: the six wedge re-cuts of July 2026 cannot currently be classified as rapid heuristic exploration or degenerating ad-hoc patching — the data needed for that judgment is not being recorded.

**Question:** What minimal doc/process changes make progressive-vs-degenerating status observable and refutation-routing mechanical?

## Appetite

Medium blast radius — touches hypotheses.md conventions, one new doc, two skills, README, CLAUDE.md; all docs/process, no product code. Fully reversible (git revert; conventions apply forward-only). High decision density — core wording, the truth-measurement-layer question, and stopping-rule parameters are all `[FOUNDER DECISION]`.

## Solution

**1. `docs/research-programme.md` (new doc — one home, per CHARTER):**
- **Hard core** — numbered commitments (draft in Appendix, already passed one adversarial-critique round), each labeled with evidential status (literature-proven components vs own conjecture). The core is held by methodological decision and says so.
- **Citation discipline (authoring rule, stated in the doc):** public writing cites the literature-proven *components* (illusion of transparency, speaker overestimation of being understood, closeness-communication bias) and owns the recursive *composite* ("illusion of recursive understanding") as the programme's own conjecture extending Pinker — never "proven by cognitive science." Content/authoring skills inherit this by reference to research-programme.md.
- **Negative heuristic** — stated separately from the core, not as a numbered element (a core element saying "refutations hit the belt" would immunize itself): refutations route to the belt; a core-hit triggers the programme-health check; core retirement = recorded founder decision with reasons, or displacement by a rival with corroborated novel predictions the core cannot match.
- **Positive heuristic** — pointer to the pre-planned model sequence already documented (facilitation ladder + layer model in theory-of-change.md; measurement stack in philosophy.md). No duplication.
- **Rivals registry** — table: rival programme, its core claim, evidence for/against from our own data, progressivity status. Seed with four: (a) affect-first listening (Rogers/NVC/**Gottman-Rapoport** — H-PopperianIncrement is the crucial discriminator experiment; **seeded with citations 2026-08-03**, see below); (b) coordination/process tooling; (c) AI-mediated alignment (agent verifies/summarizes, no human protocol needed); (d) the null programme — affinity-based trust is adequate for most dyads (literature against it: closeness-communication bias; field data partially for it: 28 sessions with no cost named, the true-null demo). Implementation consequence: annotate H-PopperianIncrement in hypotheses.md as the rival-discriminator against rival (a) and move it to the front of the scientific test queue (the priority change itself `[FOUNDER DECISION]`).
- **Progressivity ledger** — running list of corroborated novel predictions. Seed: in-session Understanding-Gap reduction (H-Foundation lineage, MRL 6); H-ProtocolSpreadsWithoutTool(a) (sustained tool-free use, "zero rework").
- **Stopping rule** — the 2026-07-31 avoidance-guard pattern generalized: per wedge, "if no novel prediction is corroborated within N tests or M months `[FOUNDER DECISION: N, M]`, the pivot cadence itself becomes the anomaly → run programme-health review before any further re-cut."

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
- Do NOT resolve the truth-measurement question silently (see Appendix, open decision D2) — silence would perform a mission shrink without recording it.

### Alternatives Considered
- **Core inside philosophy.md:** rejected — philosophy.md is the epistemological foundation and holds the scientific programme's boldest *testable* conjectures (Asymmetric Conversion, ITT/RITT). Mixing the protected core with testable content is the exact confusion this spec removes. research-programme.md points to it instead.
- **JSON schema for hypotheses:** rejected — the bottleneck is discipline, not machine-readability; JSON would break grep/diff/human ergonomics of the whole docs ecosystem.
- **Separate business/scientific hypothesis files:** rejected — several hypotheses belong to both programmes; a tag is sufficient and keeps one scoreboard.

### Rollback Strategy
Delete research-programme.md; revert README/CLAUDE.md lines; remove the skill directory; revert the wiring edits in /docs-strategy-update and /monthly. No product code or data involved.

## Done-When

- [ ] `docs/research-programme.md` exists with: founder-approved numbered hard core, separate negative-heuristic statement, rivals registry (≥4 seeded with evidence columns), progressivity ledger (≥2 seeded), stopping rule with founder-set N/M
- [ ] hypotheses.md preamble documents Novel-prediction field, programme tag, and core-adjacent flag; H-WTP-Pain carries the core-adjacent flag with its one-auxiliary budget
- [ ] `/slava:maintain:programme-health` exists; a dry run on current docs produces a verdict + one recommendation
- [ ] /monthly invokes programme-health; /docs-strategy-update flags a test hypothesis missing its Novel-prediction field
- [ ] README and CLAUDE.md describe the project as a research programme (CLAUDE.md change passed the claude-md gate)
- [ ] All `[FOUNDER DECISION]` items below are resolved and recorded

## Appendix — Draft hard core (post-critique input; founder review pending)

Draft 1 (five elements) went through an adversarial Lakatos-literate critique. Findings applied: "reliably" removed from the protocol claim (it imported the open P0 question into the core); the three-criteria taxonomy demoted to belt (it has a published falsifier and two revisions); the interpersonal constraint split (protected half = first-person authority; delegability = belt); the negative heuristic extracted from the core; two unstated core commitments added (speaker authority; human unit).

**K1 (Miscalibration).** Miscalibrated mutual understanding is the default in conversation: both parties' confidence that understanding happened exceeds actual understanding, and because each also believes the other shares it, the failure is self-concealing. *(Components literature-proven — illusion of transparency, speaker overestimation, closeness-communication bias; the recursive composite is the programme's own conjecture extending Pinker, owned as its boldest claim, MRL 1-2.)*

**K2 (Protocol).** Given an adequately chosen topic, a paraphrase-and-confirm protocol with speaker-side verification can convert illusory understanding into verified understanding within a session *(demonstrated, 30+ sessions, MRL 6)*. Verified comprehension is by construction a separate axis from agreement; the empirical behavior of that separation (softening, decomposition) is belt.

**K3 (Cost boundary).** The unverified gap is costly precisely where its natural consequence-arbiter fails — where feedback is delayed enough that error compounds silently instead of self-correcting. *(The exactly-three-failure-modes taxonomy — fuzzy intent / delayed feedback / concentrated stakes — is belt, where its falsifier already lives.)*

**K4 (Speaker authority).** The speaker is the sole arbiter of whether they were understood; "verified" means speaker-confirmed representation. *(Previously unstated; the entire measurement stack presupposes it. If self-report ever demonstrably fails to track accurate representation, that is a core-hit.)*

**K5 (Unit).** The unit of intervention is a human relationship — verification requires a counterparty with first-person authority to reject the paraphrase ("that's not what I meant"). Whether that authority can ever be delegated (digital twin, async artifact) is a belt question.

**K6 (Mission).** The programme is impact-first: the aim is spreading the verification practice; revenue is second. *("Revenue is proof of impact" is a measurement-proxy claim and lives in the belt — otherwise any WTP refutation could be deflected as "revenue is second anyway.")*

**Open founder decisions:**
- **D1 `[FOUNDER DECISION]`:** final wording of K1–K6.
- **D2 `[FOUNDER DECISION]`:** the truth-measurement ambition (Asymmetric Conversion, Understanding Imbalance, rate asymmetry as the impact premise) — one sentence into the core, or explicit demotion to recorded aspiration. Silence is not an option (it would shrink the mission without recording it).
- **D3 `[FOUNDER DECISION]`:** stopping-rule parameters N (tests) and M (months).

---

## Rival (a) evidence seed — pointer

Rivals-registry row (a) was seeded with citations on 2026-08-03 (Gottman active-listening research pass). **Evidence, rationale, rejected alternatives, and the deliberate non-recordings live in [docs/decisions.md](../docs/decisions.md) 2026-08-03 [product]** — per CHARTER rule 3, dated rationale belongs in the append-only log, not inside a spec that will move to `features/done/`. Implementation consequence for this spec: the registry needs a **work-domain rival row** (closed-loop readback / CRM, Edmondson team-learning, after-action review) — currently it seeds only affect-first listening, a couples/clinical rival for a work-team product.
