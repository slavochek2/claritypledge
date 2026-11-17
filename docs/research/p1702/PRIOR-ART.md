# P1702 prior art (stage 1)

> Written by a research agent, 2026-11-17. The main session re-checked three load-bearing claims by search: Han, Santos, Lenaerts & Pereira 2015 (*Sci. Rep.* 5:9312) exists and contains the quoted "neither unconditional use of commitment nor intention recognition can perform optimally"; He, Shen, Shi & Tanimoto 2024 (*Phys. Rev. Research* 6:013062) exists (the ~9% figure is NOT in its abstract and is unverified until reproduced); arXiv 2605.13750 (Abolhasani, Moghimi-Araghi & Salahshour 2026) models costly signals of type, not misunderstanding checks (abstract only). Everything else below is the agent's reading, not re-verified.

# P1702 Stage 1: prior-art check for "gap-reveal-then-bridge"

Date: 2026-11-17. Scope: the Stage 1 paper list in `features/p1702_verification_beats_forgiveness_conjecture.md` (the copy on main at the time of reading, which now names the bet H-CheapGapReveal), plus targeted searches for Decision Criterion 1's three mechanisms.

Method: each paper was located by web search. Where an open full text existed (arXiv, Europe PMC, author PDF), it was downloaded and the model section was read through `pdftotext`. Quotes below are copied from those texts. Labels:
- **READ**: I read the model section (or the equivalent working-paper version, named where it applies).
- **ABSTRACT-ONLY**: I confirmed the bibliographic record and read the abstract, but not the model.
- **NOT FOUND**: no record located.

**Coverage limit.** This is a web search, not a census. I did not query Google Scholar, Web of Science or citation graphs. Two recent preprints surfaced by search were not read (listed in section 4). A NOT FOUND below means "not found by the listed search strings", not "does not exist".

---

## 1. Stage 1 citations: verification

| # | Spec citation | Actual paper | Status | Notes |
|---|---|---|---|---|
| 1 | Wu & Axelrod 1995 | Jianzhong Wu & Robert Axelrod, "How to Cope with Noise in the Iterated Prisoner's Dilemma", *J. Conflict Resolution* 39(1):183–189, 1995. DOI 10.1177/0022002795039001008 | READ (author PDF, umich) | Implementation noise only: "for each intended choice there is a 1% chance that the opposite choice will actually be implemented". GTFT here "cooperates 10% of the time that it would otherwise defect". Results: GTFT is best against unadapted players, CTFT once others adapt, and "Pavlov is not robust". Method: Axelrod's 63 second-round rules plus an ecological simulation. Not an evolutionary-dynamics model. |
| 2 | Han et al. IJCAI 2013 | The Anh Han, Luís Moniz Pereira, Francisco C. Santos & Tom Lenaerts, "Why Is It So Hard to Say Sorry? Evolution of Apology with Commitments in the Iterated Prisoner's Dilemma", *IJCAI 2013*, pp. 177–182 | READ | COMA proposes a commitment before play, at arrangement cost ε. After a unilateral defection, the defector apologizes by paying γ. Noise is execution only ("an intended action, C or D, can fail, and become its opposite, with probability α"). Compared against AllC, AllD, TFT, GTFT, WSLS and fake committers/apologizers. Parameters: N=100, ω=0.9, b=2, c=1, α=0.05, β=0.1, γ=2, ε=1, δ=2.5. Small-mutation embedded chain. |
| 3 | Centola et al. Science 2018 | Damon Centola, Joshua Becker, Devon Brackbill & Andrea Baronchelli, "Experimental evidence for tipping points in social convention", *Science* 360(6393):1116, 2018 | ABSTRACT-ONLY (press release + abstract + SM listing) | Naming-game experiment: 10 groups of 20, confederates pushing an alternative name. Committed minorities below 25% failed; at about 25% they flipped the convention. A coordination task with no dilemma payoff. |
| 4 | Cardillo & Masuda 2020 | Alessio Cardillo & Naoki Masuda, "Critical mass effect in evolutionary games triggered by zealots", *Phys. Rev. Research* 2, 023305, 2020 (arXiv 1912.00400) | READ | One-shot 2×2 games, R=1, P=0, T∈[0,2], S∈[−1,1]. Fermi rule with β∈{1,10,100}. Well-mixed N=10⁴; networks REG/ER/BA with N=1000, ⟨k⟩=6. Zealots: "A zealot always cooperates and, is immune to strategy updating, while other agents may still imitate her." Zealots also contribute payoff to everyone. In Stag Hunt, critical mass fZ≈0.15 (β=10), falling to ≈0.08 at β=1. In one-shot PD: "Nevertheless, we do not observe a critical mass effect" in well-mixed populations. On BA networks the PD shows one only at fZ*>0.25 (search snippet of the published text; consistent with Fig. 4 of the preprint). |
| 5 | arXiv 2307.08502 (authors/venue unconfirmed) | Zhixue He, Chen Shen, Lei Shi & Jun Tanimoto, "Impact of Committed Minorities: Unveiling Critical Mass of Cooperation in the Iterated Prisoner's Dilemma Game", *Phys. Rev. Research* 6, 013062, 2024 | READ | **Now confirmed.** IPD as a donation game with b−c=1, using long-run expected payoffs for C, D and χ-extortion Eχ (TFT = Eχ at χ=1). **No noise.** Committed fraction ρ∈(0,0.5). Main update rule: replicator-like, w=(rj−ri)/(H·max(kj,ki)). Fermi rule used only as a robustness check. Networks: lattice/SW/ER/BA with ⟨K⟩=4, N=3,000–10,000. Averages over the last 3,000 of 5×10⁴ MCS steps, 50+ runs. Well-mixed result: "when ρ ≈ 0.09, the existence of committed TFT individuals (ρ ≈ 0.125 for committed extortioners) can dramatically shift the outcome from extinction of cooperation (FC = 0) to its dominance (FC = 1)" at b=1.1. Too many committed conditional cooperators can lower cooperation on networks. |
| 6 | Xie et al. PRE 2011 | J. Xie, S. Sreenivasan, G. Korniss, W. Zhang, C. Lim & B. K. Szymanski, "Social consensus through the influence of committed minorities", *Phys. Rev. E* 84, 011130, 2011 (arXiv 1102.3931) | READ | Binary-agreement (2-opinion naming game) model. No payoffs, no game. "when the committed fraction grows beyond a critical value pc ≈ 10%, there is a dramatic decrease in the time, Tc, taken for the entire population to adopt the committed opinion". On complete graphs, Tc∼exp(α(p)N) below pc and Tc∼ln N above it. ER and scale-free networks behave qualitatively the same. |
| 7 | Han, Pereira, Santos 2012 (intention recognition, "unread") | The Anh Han, Luís Moniz Pereira & Francisco C. Santos, "Corpus-based intention recognition in cooperation dilemmas", *Artificial Life* 18(4):365–383, 2012 | READ | Strategy IR infers the co-player's strategy (its "intention") from past moves using a plan corpus, at a cognitive cost ς per interaction. Noise is execution only. Compared with TFT, GTFT, WSLS, AllC, AllD; IR prevails "even in the presence of errors". Parameters: m=10 rounds, N=100, β=0.1, b/c=3. Companion papers: IJCAI 2011 pp. 1684–1688 and *Adaptive Behavior* 2011 (ABSTRACT-ONLY). |
| 8 | Miyagawa, Miyahara & Sekiguchi 2008 (JET) | Eiichi Miyagawa, Yasuyuki Miyahara & Tadashi Sekiguchi, "The folk theorem for repeated games with observation costs", *J. Econ. Theory* 139(1):192–221, 2008. DOI 10.1016/j.jet.2007.04.001 | READ for the 2003 working paper ("Repeated Games with Observation Costs", KIER WP 565); ABSTRACT-ONLY for the JET version | Citation correct. Quote: "We assume that at the end of each period, each player decides whether to obtain information about the actions chosen by the other players in the period. Obtaining the information costs a certain amount of utility". The observation decision is private. Key result: in any pure-strategy equilibrium nobody monitors, so cooperation needs mixed strategies; the JET version proves a full folk theorem for any observation cost. Equilibrium analysis, not evolutionary dynamics. |
| 9 | Ben-Porath & Kahneman 2003 | Elchanan Ben-Porath & Michael Kahneman, "Communication in repeated games with costly monitoring", *Games Econ. Behav.* 44(2):227–250, 2003 | ABSTRACT-ONLY (author PDF redirected) | Citation correct. Perfect monitoring is possible but costly. Public announcements let patient players approximate any interior feasible, individually rational payoff. Equilibrium analysis. |
| 10 | Kandori & Obara 2006 | Michihiro Kandori & Ichiro Obara, "Efficiency in Repeated Games Revisited: The Role of Private Strategies", *Econometrica* 74(2):499–519, 2006 | ABSTRACT-ONLY | **This is the wrong citation for costly monitoring.** The 2006 Econometrica paper is about private strategies under imperfect *public* monitoring. The costly-monitoring paper is Kandori & Obara, "Endogenous Monitoring" (SED Meeting Paper 752, 2004; also Obara, UCLA Econ Online Paper 398). Its abstract: players choose each period whether to monitor, at a cost; efficiency is approximated by monitoring only some of the time ("random auditing"); with many tasks, efficiency holds regardless of per-task monitoring cost. Cite that one instead (ABSTRACT-ONLY). |
| 11 | Bhaskar & Obara 2002 | V. Bhaskar & Ichiro Obara, "Belief-based equilibria in the repeated prisoners' dilemma with private monitoring", *J. Econ. Theory* 102(1):40–69, 2002 | ABSTRACT-ONLY | Citation correct. Exogenous, almost-perfect private monitoring, with mixed trigger strategies conditioned on beliefs. Monitoring is not costly. This is the equilibrium analogue of perception noise, not of a check. |
| 12 | Sekiguchi 1997 | Tadashi Sekiguchi, "Efficiency in repeated prisoner's dilemma with private monitoring", *J. Econ. Theory* 76(2):345–361, 1997 | ABSTRACT-ONLY | Citation correct. First efficiency result under almost-perfect private monitoring. Exogenous noisy signals, no cost. |
| 13 | Boerlijst, Nowak & Sigmund 1997 | Maarten C. Boerlijst, Martin A. Nowak & Karl Sigmund, "The logic of contrition", *J. Theor. Biol.* 185(3):281–293, 1997 | READ (IIASA IR-97-073 version) | Citation and the spec's gloss are correct. Contrite TFT works by "standing". It "survives very well—at least as long as errors are restricted to mistakes in implementation … However, this cooperative strategy cannot persist if mistakes in perception are included as well." Also introduces Remorse and **Prudent Pavlov**, an ESS "immune against both mis-perception and mis-implementation". **Terminology clash:** the paper already calls misperceiving the *other's past move* "errors in understanding". The spec's "understanding error" (misreading the partner's *intended* move *before* acting) must be defined explicitly against this usage. |
| 14 | Martinez-Vaquero et al. 2015 | Luis A. Martinez-Vaquero, The Anh Han, Luís Moniz Pereira & Tom Lenaerts, "Apology and forgiveness evolve to resolve failures in cooperative agreements", *Sci. Rep.* 5:10639, 2015 (PMC4460819) | READ | Agreement before the IPD, implementation errors α ("playing D when they intend to play C and vice versa"), and costly apology γ after a failure. Finds a "sincerity threshold" for γ. Reactive strategies only (AllC, AllD, TFT, ATFT). N=100, β=0.1, small-mutation limit. |
| 15 | Jansen & van Baalen 2006 | Vincent A. A. Jansen & Minus van Baalen, "Altruism through beard chromodynamics", *Nature* 440:663–666, 2006 | ABSTRACT-ONLY | Citation correct. When tag and altruism are tightly linked, greenbeard dynamics are unstable and altruism is lost. With loose coupling, cooperation persists through coexisting, cycling tags. This is the tag-assortment confound that the badge-without-check control is meant to separate out. |

**Wrong or imprecise citations:** only #10, which names the wrong Kandori & Obara paper. #5 now has confirmed authors and venue. All other Stage 1 citations exist as stated.

---

## 2. Additional prior art found by the mechanism searches

| Paper | Status | Relevance |
|---|---|---|
| T. A. Han, C. Perret & S. T. Powers, "When to (or not to) trust intelligent machines: Insights from an evolutionary game theory analysis of trust in repeated games", *Cognitive Systems Research* 68, 2021 (arXiv 2007.11338) | READ | **Evolutionary costly monitoring in the IPD.** TFT pays an opportunity cost ε that includes "a cost of revealing the actual actions of co-players". Trust-based TUC stops checking after θ cooperative rounds, then "we assume that TUC will check, with a probability p, the co-player's actions after switching off". No noise. No GTFT, CTFT or WSLS. b=2, c=1, r=50, N=100, β=0.1, θ=3, p=0.25, ε=0.25. Small-mutation chain (EGTTools). |
| C. Perret, T. A. Han, E. Fernández Domingos, T. Cimpeanu & S. T. Powers, "Disentangling trust from cooperation: Evolution of trust as reduced monitoring in social dilemmas", *Chaos, Solitons & Fractals* 208, 118130, 2026 (arXiv 2509.04143 v4) | READ (scan of v4) | The same TUC idea extended across all 2×2 dilemmas, now with **action errors**. Abstract: "when monitoring is costly, trust heuristics allow for higher levels of cooperation in social dilemmas where the temptation to defect is high. Second, when agents can make action errors, trust heuristics promote cooperation even in coordination problems." No perception noise, no forgiveness baselines (0 hits for GTFT/WSLS/forgiv). r=50, N=100, β=0.1, ε up to 0.75. |
| T. A. Han, F. C. Santos, T. Lenaerts & L. M. Pereira, "Synergy between intention recognition and commitments in cooperation dilemmas", *Sci. Rep.* 5:9312, 2015 (PMC4366807) | READ | **The closest structural precedent for detect-then-repair.** First a cheap intention recognition with a given accuracy, then a costly commitment only when unsure. Quote: "The key parameter in our model is a confidence threshold (θ), which is utilized to decide when intention recognition can be relied on (to choose a move), or a commitment deal needs to be arranged to clarify the co-player's intention." Result: "an intermediate level of confidence threshold leading to the highest evolutionary advantage, showing that neither unconditional use of commitment nor intention recognition can perform optimally." This is the "gap-reveal-then-bridge vs always-paraphrase" comparison in another setting: IRCOM vs COMP (always commit). However it is a **one-shot** PD with **strategic** intentions, **no noise**, and no forgiveness baselines. b=4, c=1, N=100, β=0.1. |
| T. A. Han, L. M. Pereira, F. C. Santos & T. Lenaerts, "Good agreements make good friends", *Sci. Rep.* 3:2695, 2013 (PMC3776200) | READ (scan) | The commitment-before-play base model: one-shot PD, COMP pays arrangement cost ε, defaulter pays δ, with FAKE and FREE free-riders. T=2, R=1, P=0, S=−1, β=0.1, N=100, δ=4. |
| A. A. Arechar, A. Dreber, D. Fudenberg & D. G. Rand, "'I'm just a soul whose intentions are good': The role of communication in noisy repeated games", *Games Econ. Behav.* 104:726–743, 2017 | ABSTRACT-ONLY (first page read) | Lab experiment: participants state their intended action in a noisy IPD. Cheap talk, mostly honest. It helps only when the returns to cooperation are high. |
| D. G. Rand, D. Fudenberg & A. Dreber, "It's the thought that counts: The role of intentions in noisy repeated games", *J. Econ. Behav. Org.* 116:481–499, 2015 | ABSTRACT-ONLY | Lab experiment: making intentions observable (δ=7/8, error 1/8) restores cooperation to no-noise levels. Intentions are revealed *after* the move, for free. |
| L. A. Martinez-Vaquero, F. C. Santos & V. Trianni, "Signalling boosts the evolution of cooperation in repeated group interactions", *J. R. Soc. Interface* 17:20200635, 2020 (arXiv 2104.06466) | READ (scan) | Group game with *perception errors about the environment state*. Costly signals: "signalling represents a mechanism capable of correcting the individual perception errors, owing to the aggregation of information from multiple individuals". Not a pairwise check of a partner's intended move. Z=100, N=9, β=1, ε=0.01. |
| M. Hoffman, E. Yoeli & M. A. Nowak, "Cooperate without looking: why we care what people think and not just what they do", *PNAS* 112(6), 2015 | ABSTRACT-ONLY | **A threat to the pledger story.** Looking (checking costs before deciding) is observable, and partners trust those who *don't* look. A visible "I welcome checks" badge could be read as calculation or distrust. The model should test this (see section 5). |
| N. Masuda, "Evolution of cooperation driven by zealots", *Sci. Rep.* 2:646, 2012; Y. Nakajima & N. Masuda, "Evolutionary dynamics in finite populations with zealots", *J. Math. Biol.* 70:465–484, 2015 | ABSTRACT-ONLY | Method references for zealots under weak selection and for finite-population fixation times with zealots. Nakajima & Masuda: "there is a threshold selection intensity below which the fixation is fast for an arbitrary payoff matrix." |
| S. Suzuki & H. Kimura, "Indirect reciprocity is sensitive to costs of information transfer", *Sci. Rep.* 3:1435, 2013 | ABSTRACT-ONLY (search snippet) | Adjacent: a cost of reputation information as small as about 1% of b destroys indirect-reciprocity cooperation in their model. This warns that information costs can be decisive, and it supports Criterion 2's cost floor. |

---

## 3. Verdicts on Decision Criterion 1

### (a) Post-perception costly check (costly or private monitoring): **COVERED**

- Equilibrium theory. Miyagawa, Miyahara & Sekiguchi: "at the end of each period, each player decides whether to obtain information about the actions chosen by the other players in the period. Obtaining the information costs a certain amount of utility." Other papers in this line: Ben-Porath & Kahneman 2003; Kandori & Obara 2004 ("Endogenous Monitoring", random auditing); Bhaskar & Obara 2002 and Sekiguchi 1997 for noisy private signals.
- Evolutionary dynamics. Han, Perret & Powers 2021 charge TFT "a cost of revealing the actual actions of co-players", and TUC checks "with a probability p, the co-player's actions". Perret et al. 2026 add action errors.
- Residual gap (not novelty-bearing): no paper found that combines (i) a check *triggered by a perceived defection*, (ii) *perception* noise, (iii) sensitivity q, and (iv) a head-to-head against GTFT, CTFT and WSLS. That is a parameter variant of covered mechanisms. Present it as a baseline built on these papers, never as a contribution. This matches the spec's presumption.

### (b) Costly pre-action check that lowers an error rate in a repeated PD, compared against forgiveness: **PARTIAL**

What is covered:
- *Paying a cost to read the partner's intention and beating forgiveness under noise.* Han, Pereira & Santos 2012 (IR, cognitive cost ς) beats TFT, GTFT and WSLS "even in the presence of errors". However IR classifies the partner's *strategy* from history; it does not lower any per-move error rate.
- *Two-stage detect-then-repair with "repair only when flagged" beating "always repair".* Han, Santos, Lenaerts & Pereira 2015 (IRCOM vs COMP), including an optimal intermediate threshold. This is the closest precedent for the s/a-versus-repair-cost structure. **It must be cited, and the paper cannot claim the detect/repair cost split as new.** Same caveat for Han, Perret & Powers 2021 (TUC vs TFT: check less to save cost).
- *Commitment before play, and costly apology as repair, in a noisy IPD against TFT, GTFT and WSLS.* Han et al. IJCAI 2013; Martinez-Vaquero et al. 2015.
- *Communicating or observing intentions in noisy repeated PDs.* Rand, Fudenberg & Dreber 2015; Arechar et al. 2017. These are experiments: free, and revealed after the move.
- *Costly signals that correct perception errors.* Martinez-Vaquero, Santos & Trianni 2020, for group games and environment-state errors.

What is missing (NOT FOUND):
1. An error source defined as *misreading the partner's intended move before acting*, kept separate from implementation and perception errors. Boerlijst et al. use "errors in understanding" for misperceiving the *past* move.
2. A check that *prevents* the error before the action. Everything found repairs *after* the error (apology, forgiveness, contrition, revealed intentions), or screens strategic types (IR, IRCOM).
3. A detection stage with sensitivity s and false-alarm rate a, then conditional repair, in an *iterated* PD with noise, compared against GTFT, TF2T, CTFT, WSLS and apology together.

Search strings that returned nothing on these three points:
- "costly pre-play communication noisy repeated prisoner's dilemma evolution"
- "repeated prisoner's dilemma pre-play communication intentions noise cheap talk evolution misunderstanding signaling intended move"
- "evolutionary game theory misunderstanding clarification OR repair cost cooperation communication errors evolution of conversational repair model"
- "signal detection false alarm repeated prisoner's dilemma detect defection sensitivity evolution forgiveness noise model"
- "evolution of cooperation players pay cost to reduce their own error rate repeated prisoner's dilemma error rate evolves costly accuracy"
- "evolution of cooperation perception errors repeated prisoner's dilemma strategy pays cost to verify co-player's actual action"
- "evolutionary game costly signaling of intention before acting prisoner's dilemma"

**Modelling caution that decides how much of the PARTIAL is real.** In a 2×2 PD, a pre-move understanding error that makes a well-intending player act wrongly is *observationally an implementation error* to the partner. A pre-move check that cuts it from ε to ε(1−s) therefore amounts to *paying to lower one's effective execution-noise rate*. Novelty then rests on that cost structure (detection d every checked move, repair cost only on flag, false alarms a), on checks being *bilateral and consent-gated* (only in share m of encounters, only when both agree), and on comparing it with forgiveness. It does not rest on a new kind of error. If the model cannot produce a difference between "understanding error + check" and "implementation error with a cheaper ε", the contribution collapses into the IRCOM/TUC cost argument. Run that equivalence test explicitly (section 5).

### (c) Critical committed fraction for a check or verify strategy: **PARTIAL** (the framework is covered; the instance is NOT FOUND)

- Covered framework. He, Shen, Shi & Tanimoto 2024 give a critical mass of committed *conditional* cooperators in the IPD: committed TFT ρ≈0.09 and committed extortioners ρ≈0.125 (well-mixed, b=1.1, no noise). Cardillo & Masuda 2020 show critical mass depends on β, update rule and network, with none in the well-mixed one-shot PD. Xie et al. 2011 (pc≈10%) and Centola et al. 2018 (≈25%) give the opinion/convention versions. Masuda 2012 and Nakajima & Masuda 2015 cover zealot methods.
- Missing: no paper found that derives f* for committed *checkers or verifiers*. None does it under noise (He et al. is noise-free), and none separates the tag effect from the check effect.
- Search strings: "zealots OR committed minority critical mass iterated prisoner's dilemma noise errors forgiving strategy WSLS GTFT tipping point"; "critical mass OR zealots evolutionary game commitment proposers OR intention recognition OR monitoring OR verification committed fraction cooperation"; "zealots repeated game direct reciprocity reactive strategies implementation errors committed individuals fixation Moran process".
- By the spec's wording ("not novel if any paper derives a critical committed fraction for a check/verify strategy"), the criterion is not triggered. Novelty here is thin, though: it is an established method applied to a new strategy. It becomes substantive only if f*(check) differs from f*(committed TFT) and from f*(badge-without-check) under the same rules.

### Criterion 1 outcome
Not all three mechanisms are covered, so **the paper track is not killed. It must be narrowed.** A defensible claim would be:

> "Under understanding errors in an iterated PD, a consent-gated detect-then-repair check available in a share m of encounters outperforms forgiveness, contrition and apology at a cost no lower than the floor in Criterion 2, and committed visible checkers have a critical mass f* that differs from both committed TFT and a badge-only control."

The paper must cite and position against IRCOM (Han et al. 2015), TUC (Han, Perret & Powers 2021; Perret et al. 2026), COMA/apology (Han et al. 2013; Martinez-Vaquero et al. 2015), Prudent Pavlov (Boerlijst et al. 1997) and He et al. 2024.

---

## 4. Not read: verify before citing

- arXiv 2605.13750, "The Co-evolution of Costly Signaling and Cooperation in Social Dilemmas" (2026 preprint). A search summary says agents emit costly signals and condition actions on them across the PD, Snowdrift and Stag Hunt. **Read this before claiming (b).** It is the most likely unread overlap.
- "Social viscosity with zealots", *R. Soc. Open Sci.* 13(6):252508 (2026). The page returned 403 and authors are unconfirmed. Possibly relevant to (c) on networks.
- Hino, MPRA 99972 (observation cost after actions, folk theorem); Kamei & Nesterov (experiments on endogenous monitoring). Search snippets only.
- Nowak & Sigmund 1992 (GTFT generosity formula). Cited from memory in the spec and not re-verified here.

---

## 5. Modelling recommendations, so results are comparable

Values below are from the papers marked READ unless stated otherwise.

**Game.** Use the donation game with c=1 and b∈{2, 3, 4}.
- b=2, c=1 matches Han 2013, Han, Perret & Powers 2021 and Perret et al. 2026.
- b/c=3 matches Han 2012.
- b=4 matches Han 2015.
- For the committed-minority sweep, add the near-threshold b=1.1 with b−c normalised to 1, as in He et al. 2024. That regime is where critical mass is visible.
- Report payoffs **per round** (averaged over rounds, as Han, Perret & Powers and Perret et al. do). β is only comparable across papers when payoff units match.

**Repetition.** Use continuation probability ω=0.9 (10 rounds on average; Han 2013 and Martinez-Vaquero 2015) as the main case. Use r=50 (Han, Perret & Powers; Perret et al.) as the long-game case. Avoid fixed finite 10-round games. That is one of the P1687 toy-engine departures, and end-game effects confound the comparison.

**Noise.** Keep the three sources as separate parameters:
- implementation α ∈ {0.01, 0.05} (Wu & Axelrod 1%; Han 2013 5%; Martinez-Vaquero, Santos & Trianni 0.01);
- perception (Boerlijst et al.);
- understanding ε_u.

Run the **equivalence control**: understanding errors with no check must reproduce implementation-error results. Then show what the check adds beyond a lower effective α.

**Baseline strategies.**
- GTFT with generosity from Nowak & Sigmund 1992 (re-verify the formula), plus Wu & Axelrod's 10% as a sensitivity point.
- CTFT and **Prudent Pavlov** (Boerlijst et al.). Prudent Pavlov is robust to both noise types and is the strongest "no-check" competitor under perception noise; omitting it would weaken any win.
- WSLS, TF2T, and COMA/apology with γ=2, ε=1, δ=2.5 (Han 2013).
- An IRCOM-style "check only when unsure" strategy, which is the same cost logic as gap-reveal. If gap-reveal cannot beat or differ from it, (b) is covered.

**Costs, anchored to the literature.**
- Detection cost d ∈ [0.05, 0.25]·c. 0.25 is the monitoring cost in Han, Perret & Powers and Perret et al.
- Repair cost ∈ [0.5, 2]·c. Apology γ=2 and commitment ε=1 come from the Han-group papers.
- Criterion 2's floor (cost ≥ ε·b per encounter) should be shown on the same axes.

**Population and selection.**
- N=100 for finite well-mixed populations (Han 2012/2013/2015, Martinez-Vaquero 2015, Han, Perret & Powers 2021, Perret et al. 2026).
- N=1000 with ⟨k⟩=6 for networks (Cardillo & Masuda), plus ⟨k⟩=4 lattice/ER/BA as in He et al.
- β ∈ {0.1, 1, 10} with per-round payoffs. 0.1 is the Han-group "weak" value, 1 is used by Martinez-Vaquero, Santos & Trianni, and 10 is Cardillo & Masuda's main value; Cardillo & Masuda also use 100. State that β depends on payoff scaling.

**Dynamics with zealots.**
- The spec is right that the small-mutation embedded chain (Fudenberg & Imhof, used by every Han-group paper) is invalid once committed players exist, because monomorphic states stop being absorbing.
- Use agent-based pairwise comparison (Fermi) for the well-mixed and network runs. Use Cardillo & Masuda's zealot rule: zealots never update, still pay and receive payoffs, and **can be imitated**.
- Measure fC (or check-strategy share) **among normal agents only**.
- Sweep fZ ∈ [0, 0.5].
- Average the last 3,000 of 5×10⁴ MCS steps over at least 50 seeded runs (He et al.). Add small exploration μ≈10⁻³ only as a stated robustness check.
- For finite-N fixation times with zealots, see Nakajima & Masuda 2015.

**Known-good controls (run before any f* claim).**
1. Reproduce He et al.'s committed-TFT critical mass ρ≈0.09: well-mixed, b=1.1, no noise, their replicator-like rule.
2. Reproduce Cardillo & Masuda's Stag Hunt fZ≈0.15 at β=10, and the *absence* of critical mass in the well-mixed one-shot PD.

If the simulator does not reproduce both, its f* for checkers is not reportable.

**Badge vs check.** Use Jansen & van Baalen's tag-linkage result to model the badge with tag–strategy decoupling (a badge-wearer may not check) as well as tight linkage. Add a "looking penalty" variant after Hoffman, Yoeli & Nowak 2015, where a visible checker is trusted less. f* must survive it before "pledgers turn the room" can be claimed.
