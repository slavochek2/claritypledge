---
status: week
type: comment
rank: 345
workstream: research
created_date: '2026-11-17'
tags: [research, game-theory, cooperation, paper]
disclosure: public
delivery_stage: create-spec
pipeline_ran: [create-spec]
drafted_by: opus
exec_model: opus
exec_effort: high
driver: heuristic
---

# P1702: Verification beats forgiveness under perception noise — test the conjecture, model it, publish it

## Problem

**Situation:** The "Third Condition" film (`~/video-library/third-condition-trust-film-nov-2026`) and the P1687 explorable (branch `feature/p1687-third-condition-explorable`, engine at `src/app/tree/lower-number/engine.ts`) argue that when good people misread each other, the fix is a *check* before acting, and that a few visible people who welcome checks (pledgers) can turn a room. Nicky Case's *Evolution of Trust* names low miscommunication as trust's third condition; the known repairs for noise are forgiveness (generous TFT), contrition and win-stay-lose-shift.

**Complication:** The claim the film rests on is not recorded as a bet anywhere (`docs/hypotheses.md`, `docs/philosophy.md`, `docs/decisions.md` searched 2026-11-17). Its key number ("a check stops 9 mistakes in 10") is an assumption, and the P1687 review rounds already found errors in the toy simulation. A first prior-art pass (one agent, abstracts only, unverified) found no paper treating verification-before-response as its own strategy class, and no committed-minority threshold for it — but did not search the economics literature on costly/imperfect private monitoring, the most likely home of prior art.

**Question:** Is "verification beats forgiveness when the noise is in perception, and a share f* of visible checkers tips a group" new, and does it survive a correct model? If so, publish a simulation, an explorable and a paper; if not, publish an application article and a real-room test.

> Founder, verbatim: "verification beats forgiveness as the fix for noise, and it spreads through visible first movers (pledgers)." — "yes"
> Founder, verbatim: "are you saying three badger players are enough to turn every room in this game-theoretic world? Did we prove it? Is it provable?"
> Founder, verbatim: "will the simulation be an interface that people can play around and set like different kind of settings and so on? That would be pretty cool, right? because then we can publish that too."

## Appetite

Blast radius: low — research, docs and a prototype route; no migration, auth, hook or gate. Reversibility: high until anything is published externally (preprint, article, outreach are ALWAYS-ASK). Decision density: a few founder calls (venue, public explorable, article tone).

## Approach

Stage-gated; each stage's Decision Criteria decide whether the next one runs.

0. **Record the bet.** Add H-VerificationBeatsForgiveness to `docs/hypotheses.md` (UNTESTED, n=0, falsifier = stage 2 result) via `/docs-strategy-update`.
1. **Novelty check.** Targeted search: costly / imperfect private monitoring in repeated games, costly verification, intention recognition (Han, Pereira, Santos 2012 — unread), communication before moves in noisy PD. Verify the six citations from the first pass by reading the papers, not the search summaries: Wu & Axelrod 1995; Han et al. IJCAI 2013; Centola et al. Science 2018; Cardillo & Masuda 2020; arXiv 2307.08502 (authors/venue unconfirmed); Xie et al. PRE 2011.
2. **Minimal model + headless simulation.** Repeated PD with *separate* perception-error and implementation-error rates. Checker-TFT pays cost c on a perceived defection to learn the true action with probability q, then responds to what happened. Compete against ALLD, TFT, GTFT, contrite TFT, WSLS in finite populations (low mutation, Fudenberg–Imhof style). Map the region in (ε_perception, ε_implementation, c, b/c) where Checker wins. Then fix a share f of committed visible checkers; find f* well-mixed and on at least one network. Reproducible: seeded, script-run, outputs committed as data. Reconcile with the P1687 engine — its known errors must be fixed or explicitly not inherited; one engine of record, not two.
3. **Explorable.** Sliders for both noise types, check cost, checker share; built on the P1687 engine/route, not a second one.
4. **Paper draft (preprint).** Model, results, honest limits (model-only, no human data), prior art.
5. **Later, separate go:** blog article "a conjecture — come break it" with the improved film embedded; outreach to rationality-community organizers to run a real-room test.

## Research Questions

1. Does any paper already model a costly pre-response check of the partner's true action under perception noise, compared against forgiveness strategies?
2. In a correct model, is there a region where Checker-TFT beats GTFT / contrite TFT / WSLS, and is it the perception-noise region specifically?
3. Is there a critical share f* of committed checkers; how does it depend on c, ε and topology?
4. Do the P1687 explorable's claims hold in the stage-2 model?

## Decision Criteria (pre-registered)

1. **Novel?** → Not novel if a paper models a costly check of the partner's actual action before responding, under perception noise, *and* compares it to forgiveness strategies. If such a paper also gives a minority threshold → kill the paper track; go to the application article + real-room test. If it covers the strategy but not the threshold → paper scope narrows to the threshold.
2. **Conjecture survives?** → Survives if Checker-TFT is the most abundant strategy in a non-empty region with c > 0 that lies at higher ε_perception than ε_implementation, robust to ±50% on q. Refuted if forgiveness strategies dominate wherever c > 0 — record the refutation in hypotheses.md and decisions.md, publish nothing claiming the opposite.
3. **"A few pledgers turn the room"** → Only claimable with a computed f* and its conditions. No number from the toy world (e.g. "three") is stated publicly unless the model reproduces it.

## Deliverable

Hypothesis entry; a prior-art note (`docs/research/`); simulation code + data + figures; explorable route; preprint draft. Article and outreach are a follow-up spec.

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| Prior art exists in the monitoring literature | MITIGATE | Stage 1 runs before any modelling; criterion 1 kills or narrows |
| Toy-engine errors leak into the paper | MITIGATE | Stage 2 builds the model of record and tests the P1687 engine against it |
| Result depends on modelling choices (update rule, network) | ACCEPT | Report the dependence; that is a result, as in Cardillo & Masuda |
| Overclaiming to a rationalist audience | MITIGATE | Criterion 3; UNTESTED / model-only labels in every public text |
| Two sessions editing one engine (P1687 in w19) | MITIGATE | Coordinate through the P1687 branch; never fork the engine |

**Non-Goals**
- Do NOT publish, post, submit or send anything (preprint, article, outreach) without a same-turn founder go.
- Do NOT change the film or the P1687 copy — the neighbouring session owns those; report findings to it.
- Do NOT add backend, database or analytics; the explorable is client-only.
- Do NOT claim human behaviour from model results.

## Done-When

- [ ] H-VerificationBeatsForgiveness recorded in `docs/hypotheses.md` as UNTESTED with a falsifier
- [ ] Prior-art note lists every cited paper as read (or marked unread), and states criterion-1 verdict
- [ ] Simulation reproduces from one command with a fixed seed; figures regenerate from committed data
- [ ] Criterion-2 and criterion-3 verdicts written, with the numbers
- [ ] Explorable lets a reader set both noise types, check cost and checker share, and matches the headless model on 3 named settings
- [ ] Preprint draft exists, with limits and prior-art sections, awaiting founder review

## Open Questions

- [FOUNDER DECISION: preprint venue — arXiv (needs an endorser for physics.soc-ph / econ.TH), Zenodo (as for the 2024 paper), or both]
- [FOUNDER DECISION: publish the explorable publicly, and under which URL]
- [FOUNDER DECISION: article tone and title, after stage 2]
- Who outside the programme could review the model (an evolutionary-game-theory reader) before posting?

## Related

- P1687 — third-condition explorable (branch `feature/p1687-third-condition-explorable`, engine `src/app/tree/lower-number/engine.ts`)
- `content/articles/a35_premature-grounding-closure.md` L203 — three-arm sim design (no-check / check / check-with-miscalibrated-agents)
- `docs/visions/p6.1_intuitive_trust_building.md` — Nowak indirect reciprocity; the 2024 paper
- decisions.md 2026-10 H-ObserverTransfer entry — notes a literature sweep on communication in PD settings that should fold in
