---
status: week
type: comment
rank: 345
workstream: research
created_date: '2026-11-17'
tags: [research, game-theory, cooperation, paper]
disclosure: public
delivery_stage: ship
pipeline_ran: [create-spec, inline, ship]
flow: inline
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

0. **Record the bet.** Add H-CheapGapReveal to `docs/hypotheses.md` (UNTESTED, n=0, falsifier = stage 2 result) via `/docs-strategy-update`.
1. **Novelty check.** Targeted search: costly / imperfect private monitoring in repeated games, costly verification, intention recognition (Han, Pereira, Santos 2012 — unread), communication before moves in noisy PD, tag/greenbeard assortment. Verify by reading, not search summaries: Wu & Axelrod 1995; Han et al. IJCAI 2013; Centola et al. Science 2018; Cardillo & Masuda 2020; arXiv 2307.08502 (authors/venue unconfirmed); Xie et al. PRE 2011. Reviewer-suggested, all UNVERIFIED until read: Miyagawa, Miyahara & Sekiguchi 2008 (JET, observation costs); Ben-Porath & Kahneman 2003; Kandori & Obara 2006; Bhaskar & Obara 2002; Sekiguchi 1997; Boerlijst, Nowak & Sigmund 1997 (contrite TFT vs Pavlov, both noise types); Martinez-Vaquero et al. 2015 (apology and forgiveness); Jansen & van Baalen 2006 (greenbeards).
2. **Minimal model + headless simulation.** Repeated PD with three error sources kept apart: implementation slips, perception errors, and *understanding* errors (the partner's intended move is misread before acting — the film's Friday-vs-Sunday case). Two distinct check placements, never merged:
   - **Pre-move check** (what the P1687 askers do): both pay to confirm meaning before acting; lowers the understanding-error rate by q. Can be invaded by fakers/excusers, so model it as gameable.
   - **Post-perception check**: on a perceived defection, pay c to learn the realized action w.p. q. This is costly monitoring — compare against the economics results named in Stage 1, do not present it as new.
   **What "the check" is — model these as separate strategies (founder, 2026-11-17: "If it's always asking to paraphrase, it costs. But if it is always to reveal the gap in understanding, and then they can decide if they are bridging it, then it's different."):**
   - *Always-paraphrase*: pays the full repair cost every checked move.
   - *Gap-reveal-then-bridge* (the Clarity practice): pays a small detection cost every checked move, which flags a misunderstanding with sensitivity s and false-alarm rate a; pays the repair cost only when flagged. Detection and repair costs are separate parameters.
   - *No check / forgive*: the baselines below.
   **Where checks apply (founder: "it's only for specific relationships, for specific situations like meetings and for specific groups… And pledge is the biggest one."):** a share m of encounters are high-stakes (meetings); checks are available only there. A pledger is visible and welcomes a check in every such encounter; a non-pledger asker checks only when both sides agree. Report results across m, not at one value.
   Baselines: ALLC, ALLD, TFT, stochastic GTFT (Nowak & Sigmund 1992 — not TF2T), TF2T, contrite TFT, WSLS, and an apology/cheap-talk strategy. Dynamics: pairwise comparison (Fermi, selection strength β) with full Moran transitions when committed players are present — the low-mutation embedded chain is invalid with zealots. Then a fixed share f of committed visible checkers: report f* with degree k, β and zealot rules fixed, well-mixed and one network; separate the badge's effect (tag assortment) from the check's effect by running badge-without-check as a control. Reproducible: seeded, one command, data committed.
3. **P1687 engine reconciliation note.** List where the toy engine departs from the model of record (implementation noise only; asker checks every round; forgiver is TF2T; 10-round finite games; `leader()` tie order) and send it to the P1687 session. The film/explorable copy stays theirs.

**Stop after Stage 3.** Explorable, preprint and article/outreach are follow-up specs, filed only if Stage 2's criteria pass.

## Research Questions

1. Does any paper already model a costly pre-response check of the partner's true action under perception noise, compared against forgiveness strategies?
2. In a correct model, is there a region where Checker-TFT beats GTFT / contrite TFT / WSLS, and is it the perception-noise region specifically?
3. Is there a critical share f* of committed checkers; how does it depend on c, ε and topology?
4. Do the P1687 explorable's claims hold in the stage-2 model?

## Decision Criteria (pre-registered)

1. **Novel?** → Judged per mechanism, not by one paper covering everything. Post-perception check: presumed covered by costly-monitoring work unless Stage 1 shows otherwise. Pre-move understanding check: not novel if any paper models a costly pre-action check that lowers an error rate in a repeated PD and compares it to forgiveness. Committed-checker threshold: not novel if any paper derives a critical committed fraction for a check/verify strategy. If all three are covered → kill the paper track; go to the application article + real-room test.
2. **Conjecture survives?** → Survives only if the checker is the most abundant strategy at a check cost no lower than the forgiver's expected loss to defectors under the same noise (c ≥ ε·b per encounter as the floor), across β ∈ {weak, strong}, robust to ±50% on q, *and* with fakers/excusers present. A win only as c → 0 counts as refuted. Refuted → record in hypotheses.md and decisions.md; publish nothing claiming the opposite.
3. **"A few pledgers turn the room"** → Only claimable as f*(c/b, ε, k, β) with zealot rules stated, and only if f* differs between badge-with-check and badge-without-check. No toy-world number (e.g. "three") is stated publicly unless the model reproduces it.

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

- [x] H-CheapGapReveal recorded in `docs/hypotheses.md` as UNTESTED with a falsifier
- [x] Prior-art note lists every cited paper as read (or marked unread), and states criterion-1 verdict — `docs/research/p1702/PRIOR-ART.md`. Verdict: (a) post-perception check COVERED (Miyagawa, Miyahara & Sekiguchi; Han, Perret & Powers 2021); (b) pre-move check vs forgiveness PARTIAL — Han, Santos, Lenaerts & Pereira 2015 (*Sci. Rep.* 5:9312) already has the cheap-first-stage / costly-fix-when-unsure structure, one-shot and noise-free; (c) committed-checker threshold PARTIAL — committed-TFT critical mass exists (He et al. 2024), none for a check strategy or under noise. Paper track continues, novelty claim narrowed to the understanding-error check in a noisy repeated game and its committed-minority threshold vs committed TFT and badge-only. Key risk carried into stage 2: a misreading may be indistinguishable from a slip to the partner, so the check could reduce to "pay for a lower error rate" — tested by an equal-cost untargeted-error-reduction control.
- [x] Simulation reproduces from one command with a fixed seed; figures regenerate from committed data — `npx tsx scripts/p1702-run-model.ts`, two runs byte-identical (`main_map.csv` regenerated, not committed: 4.7 MB)
- [x] Criterion-2 and criterion-3 verdicts written, with the numbers — `docs/research/p1702/RESULTS.md`: Criterion 2 REFUTED in this restricted model (0/765); Criterion 3 UNINFORMATIVE (blind against the starting population); reviewed in three rounds, final round no verdict-changing defect
- [x] Engine reconciliation note delivered to the P1687 session — written beside the film briefs in the private events folder (2026-11-17); no live P1687 session was identifiable to message
- [x] Follow-up spec(s) for explorable / preprint filed only if criteria pass; otherwise refutation recorded — criteria failed; refutation recorded in hypotheses.md H-CheapGapReveal and decisions.md 2026-11-17 + 2026-11-18 correction

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
