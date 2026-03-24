# Hypotheses

Active bets in priority order. This is the scoreboard — what we need to prove, what's blocked, what we know.

Session logs, architecture notes, and strategic commentary belong in [decisions.md](decisions.md), not here.

## Summary

| ID | Hypothesis | Stage | Pri | Blocked by | Evidence (Mar 2026) |
|----|-----------|-------|-----|------------|---------------------|
| H-WTP-Pain | Gap reveal produces urgency, not just curiosity | Active | P0 | — | 28 sessions, zero pairs named a cost. Warning sign. |
| H-PairsReturn | Pairs recognize gap as costly and return | Active | P0 | — | 3 pairs run. Protocol works. No "holy shit" observed in transcripts. |
| H-TopicDepthGate | Topic selection determines session value | Active | P1 | — | ~40% sessions failed due to topic inadequacy. |
| H-StoryFirst | Story-first model delivers async gap revelations | Active | P1 | — | Architecture designed, falsification-tested. Not yet built. |
| H-Stories-ColdStart | Filed content creates return trigger | Active | P1 | H-PairsReturn | Reframed: story-first changes the question. |
| H-CalibrationTrainable | Calibration accuracy improves with practice | Active | P2 | — | Weak positive. Within-session improvement visible. N too small. |
| H-AICalib-EntryTeaser | AI demo lowers trust barrier before co-founder offer | Active | P2 | — | Parked until group acquisition phase. |
| H-CoachChannel | Coaches adopt protocol as distribution channel | Active | P2 | H-PairsReturn | Falsification-tested. Market large. Key risk: commodification. |
| H-Retainers-Sticky | Pairs retain monthly FCO retainers | Blocked | — | H-PairsReturn | Not yet testable. |
| H-WorkshopFormat | 1-to-many workshops convert to sessions | Active | P2 | — | Unblocked: false-belief curriculum testable independently. |
| H-MetaEpistemic | Meta-epistemological briefing deepens sessions | Blocked | — | H-PairsReturn | Test passively. |
| H-BriefingProtocol-ColdStart | Mirror agent invitation solves cold start | Blocked | — | H-PairsReturn + H-Stories-ColdStart | Two deps deep. |
| H-ProtocolSpreadsWithoutTool | Protocol spreads free; tool captures value | Blocked | — | H-PairsReturn | Zero pairs have used protocol. |
| H-InvestorDD | Investors pay for pre-investment calibration | Blocked | — | H-PairsReturn + H-Retainers-Sticky | Pull, not push. |
| H-Community-Retention | Peer community adds moat above retainer | Blocked | — | H-Retainers-Sticky | C4 timeline. Way downstream. |
| H-Essays-BuildRecognition | Evidence-based essays build recognition | Blocked | — | H-PairsReturn + H-Retainers-Sticky | Need 10+ pairs for credible essays. |
| H-InsightConversion | Surfacing repeated unacted insights drives change | Blocked | — | H-BriefingProtocol-ColdStart | Later layer. |
| H-SpecsReachResearchers | Technical specs reach AI safety researchers | Blocked | — | H-Essays-BuildRecognition | Need baseline recognition first. |
| H-StoriesAITrainingData | AI labs use verified stories as training data | Blocked | — | H-Essays-BuildRecognition + corpus | Long-term. Timing uncertain. |
| H-AlignedFundersInbound | Recognition generates inbound from aligned funders | Blocked | — | H-Essays-BuildRecognition | Not revenue — opportunity unlock. |

**Parked (12+ months):** H-AgentCoordination, H-SalesTeamAdoption, H-TeamCommunication, H-ProtocolReachesScale, H-ToleranceAmplifies — see [Parked](#parked) section.

**Killed:** None yet. After 28 sessions and zero observed "holy shit" moments, H-WTP-Pain and H-PairsReturn are approaching their kill thresholds. See P0 entries.

---

## Active

### P0 — Must prove now

#### H-WTP-Pain: Gap reveal produces urgency, not just curiosity
**Bet:** Participants find the gap reveal interesting but "interesting" doesn't open wallets. Without felt pain ("this cost us X"), WTP stays near zero.
**Test:** After every gap reveal, ask: "When did a misunderstanding like this cost you something?" Track answers via P518 qualifying question.
**Kill if:** 10 pairs cannot name a concrete cost after experiencing their gap.
**Status (2026-03-18):** 28 sessions, zero pairs expressed that their gap was costing them anything. Reactions: curiosity, intellectual engagement, social warmth. No alarm, no urgency. This is the single most important hypothesis for commercial viability.
**Update (2026-03-21):** CE distribution channel deferred — will return with concrete forwardable offer. Async-first go-to-market adaptation: booking links and written offers instead of scheduling calls. Compounds the delay in testing WTP with revenue-qualified pairs.
**Update (2026-03-22):** False-belief facilitation technique identified as concrete testing mechanism. Workshop flow: surface participant's false belief via question → they position on false-belief point → present counter-story → verify understanding (P561 slider) → position switch → **reflection prompt: "What situations would have been different? What did holding this cost you?"** → they file story about their past false belief + cost. The reflection prompt IS the H-WTP-Pain test — not passively hoping pairs name a cost, but actively engineering the moment where broken belief connects to their relationship. See P567 (false belief curriculum) and [facilitator-guide.md](facilitator-guide.md).
**Risk (2026-03-23):** Purchase frame itself may repel — "buying a de-risking package = admitting our relationship might break." The "sophistication/prenup" reframe works only for founders who already self-identify as high-performing. Workshop reflection tests pain; conversion tests whether pain overcomes the frame resistance. Watch for this in workshop debrief.
**Insight (2026-03-24):** Clarity Letter three-step sequence may resolve the pricing chicken-and-egg. Letter 1 (opened during workshop) demonstrates value. /live verifies understanding and produces gap map. Letter 3 calibrates the commercial exchange using the skill just learned — PWIW with full comprehension context. The workshop participant prices the experience AFTER having experienced calibration, not before. Test: does a workshop that uses Letters 1-3 produce higher PWIW amounts than one without the letter instrument?

---

#### H-PairsReturn: Pairs recognize gap as costly and return
**Bet:** Co-founder pairs who experience a gap revealed in a facilitated session will recognize it as costly, create a partner agreement, and return for session 2.
**Test:** First Pairs milestone — 3-5 free facilitated sessions. Measure: does the "holy shit" moment happen? Do they book session 2?
**Kill if:** Gap doesn't surprise them, OR they find it interesting but not worth paying to prevent, OR zero pairs book session 2. Pre-committed (2026-03-16): if 5 pairs + <€200 combined donations → kill.
**Status (2026-03-16):** 3 pairs run (A: Mar 13, C: Mar 14, B: Mar 16). Protocol works, value received. But: Pair B is pre-revenue (WTP untested), transcript corpus shows no "holy shit" moment observed. ICP learning: pre-revenue pairs validate protocol but not WTP — real ICP qualifier is cash + felt pain.
**Update (2026-03-22):** First Clarity Partner Agreement signed publicly (Jan + Nejc — every 2 days, 15 min explain-back right). Agreement committed to; usage not yet observed. Key test: does the agreement artifact drive recurring practice without facilitator involvement?
**Notes:** Session format: Slava facilitates explain-back on real decisions. Pairs don't learn /live — Slava uses it as diagnostic tool. Merges previous H-CoFounders-WillPay + H-AgreementRetention.

---

### P1 — Testing in parallel

#### H-TopicDepthGate: Topic selection determines session value
**Bet:** Sessions with emotionally meaningful topics (values, fears) produce deep engagement. Abstract/trivial topics produce confusion. The facilitator's topic selection skill is the primary value driver.
**Test:** Topic depth ladder (L1: facts → L2: opinions → L3: values → L4: fears/identity). Default to L3. Correlate depth level with P518 qualifying signal.
**Kill if:** L3-4 topics produce the same shallow results as L1-2.
**Status (2026-03-18):** ~40% of sessions failed due to topic inadequacy. When genuine emotional topics engaged, protocol reached depth fast.
**Update (2026-03-22):** Mechanism identified — false-belief facilitation (P567) engineers depth instead of hoping for it. Start from participant's existing false belief → depth is immediate, no topic drift needed. This shifts H-TopicDepthGate from "is depth the gate?" (yes, confirmed) to "does engineered depth via false beliefs produce felt pain?" (feeds into H-WTP-Pain testing). Standard Socratic technique; ClarityPledge differentiator is measuring the gap + filing position switches as data.

---

#### H-StoryFirst: Story-first content model delivers async gap revelations
**Bet:** When stories are the primary entity and points are extracted from them, the comprehension assessment (reader self-assesses, author counter-assesses from cards) produces gap revelations asynchronously — without Slava present. Scales the facilitated experience into the product.
**Test:** Revise P523 — story-first creation flow with optional comprehension gate. Measure: do authors counter-assess? Does the gap produce action?
**Kill if:** Authors don't counter-assess (bottleneck) OR gaps don't produce behavioral response OR story filing reduces point engagement below baseline.
**Status (2026-03-19):** Architecture designed, falsification-tested. Key decisions: gate is optional, assessment from cards (not just /live), points only from stories, orchestrated settings primary context. Not yet built.

---

#### H-Stories-ColdStart: Filed content creates return trigger
**Bet:** Filed stories/points from session N give concrete material for session N+1. Without filed content, sessions default to whatever's top-of-mind.
**Test:** After facilitated session + agreement, does Slava filing 2-3 stories create a "here's what to verify next time"? Does the pair reference filed content?
**Kill if:** Filed content doesn't shape subsequent sessions — pairs always bring fresh topics regardless.
**Status (2026-03-19):** Reframed by H-StoryFirst. Question shifts from "does filed content feed the FCO loop?" to "does story-first creation naturally produce content that feeds return?" The comprehension assessment creates a new trigger: author sees gap → wants to verify → schedules session.
**Depends on:** H-PairsReturn (at least one facilitated pair).

---

### P2 — Passive / opportunistic

#### H-CalibrationTrainable: Calibration accuracy improves with practice
**Bet:** Users practicing explain-back reduce their understanding gaps over repeated sessions.
**Test:** Track Understanding Gap reduction across sessions for same pairs. Research supports trainability (meta-analysis g=0.46-0.72).
**Kill if:** No measurable gap reduction across repeated sessions.
**Status (2026-03-18):** Weak positive. Within-session improvement visible. No cross-session data — almost no repeat pairs. N too small.

---

#### H-AICalib-EntryTeaser: AI demo lowers trust barrier before co-founder offer
**Bet:** A 5-minute AI calibration demo has lower emotional load and faster demo-ability than leading with co-founder calibration. Workshop opener, not the product.
**Test:** Calibration Lab workshops at AI-adjacent events. Does AI teaser create "aha" faster? Does co-founder pivot feel natural?
**Kill if:** AI teaser creates confusion about what the product is FOR.
**Status (2026-03-06):** Matters for group acquisition (sessions #3-10). Parked until First Pairs validates core gap reveal.

---

#### H-CoachChannel: Coaches adopt protocol as distribution channel
**Bet:** Executive coaches adopt calibration protocol because it gives them something DISC/MBTI/360 miss — measured comprehension accuracy.
**Test:** Train 3-5 coaches. Do they use it with clients? Do clients convert?
**Kill if:** Zero adopt after training 5, OR coaches commodify to checkbox.
**Status (2026-03-18):** Falsification-tested. $100B+ market, existing alignment vocabulary. Blocked by H-PairsReturn — Slava must demonstrate coaching first.

---

## Blocked

Waiting on upstream hypotheses. Each entry lists what must happen before testing can begin.

#### H-Retainers-Sticky: Pairs retain monthly FCO retainers
**Bet:** Pairs subscribe to from-€1,950/month retainers — Slava reviews transcripts, identifies divergence with AI, facilitates targeted sessions.
**Test:** Offer retainer to pairs from First Pairs who booked 2+ sessions. Target 10+ pairs, >60% month-2 retention, €10k MRR.
**Kill if:** <5 signups OR <40% month-2 retention.
**Blocked by:** H-PairsReturn.

---

#### H-WorkshopFormat: 1-to-many workshops convert to sessions
**Bet:** Workshop where participants calibrate against YOUR content (false-belief curriculum, P567) produces position switches and felt pain that convert to €950 de-risking sessions.
**Kill if:** <10% conversion after 3 workshops.
**Unblocked (2026-03-22):** False-belief workshops where participants calibrate against Slava's pre-filed points can be tested independently of H-PairsReturn — no pair dependency. Moved from Blocked to Active P2.
**Test:** Run 3 workshops with P567 curriculum. Measure: position switches, reflection stories filed, conversion to de-risking.
**Variant (2026-03-24):** Compressed three-letter workshop — Letters 1-3 + /live in one session. Letter 1 = pre-work/in-session reading; /live = gap verification; Letter 2 = "create your own" upsell; Letter 3 = PWIW + distributor CTA. Tests H-WorkshopFormat AND H-WTP-Pain simultaneously. Requires P581 shipped.

---

#### H-MetaEpistemic-Prerequisite: Meta-epistemological briefing deepens sessions
**Bet:** If both participants understand the WHY (8 postulates) before a session, depth increases.
**Kill if:** Unbriefed sessions reach equal depth, OR briefing is off-putting.
**Blocked by:** H-PairsReturn. Test passively — A/B briefed vs unbriefed.

---

#### H-BriefingProtocol-ColdStart: Mirror agent invitation solves cold start
**Bet:** Person A's mirror agent invites Person B ("Someone wants you to understand them better"). Person B engages, A+B meet at depth on day one.
**Kill if:** Person B declines OR finds mirror claims generic.
**Blocked by:** H-PairsReturn + H-Stories-ColdStart (two deps deep).

---

#### H-ProtocolSpreadsWithoutTool: Protocol spreads free; tool captures value
**Bet:** Explain-back protocol is valuable enough to spread without the product. Tool captures users who want measurement.
**Kill if:** Zero organic spread after 5+ pairs experience sessions.
**Blocked by:** H-PairsReturn.

---

#### H-InvestorDD: Investors pay for pre-investment calibration assessment
**Bet:** Angels/micro-VCs pay €2,000+ for an unfakeable team alignment assessment (fills gap between financial DD and legal DD).
**Kill if:** Zero interest after pitching 10 investors, OR they expect it free.
**Blocked by:** H-PairsReturn + H-Retainers-Sticky. Lean path: let it emerge as pull ("can you share this with our investor?"), not push.

---

#### H-Community-Retention: Peer community adds moat above retainer
**Bet:** €200-300/month community add-on increases stickiness beyond 1:1 retainers.
**Blocked by:** H-Retainers-Sticky (need 10+ retainer pairs first). C4 timeline.

---

#### H-Essays-BuildRecognition: Evidence-based essays build recognition
**Bet:** Essays grounded in real session data reach AI safety/rationalist communities.
**Blocked by:** H-PairsReturn + H-Retainers-Sticky (need 10+ pairs for credible data). R1 timeline (Month 5+).

---

#### H-InsightConversion: Surfacing repeated unacted insights drives behavior change
**Bet:** Mirror agent tracks same insight recurring without action, surfaces it explicitly → produces behavior change that therapy/coaching miss.
**Kill if:** Produces defensiveness rather than action.
**Blocked by:** H-BriefingProtocol-ColdStart.

---

#### H-SpecsReachResearchers: Technical specs reach AI safety researchers
**Bet:** Specs on LessWrong/Alignment Forum spark adoption discussions about verified stories as training data.
**Kill if:** Zero alignment discussions after 3 months.
**Blocked by:** H-Essays-BuildRecognition.

---

#### H-StoriesAITrainingData: AI labs use verified stories as training data
**Bet:** Verified understanding pairs become valuable training data for agent alignment.
**Blocked by:** H-Essays-BuildRecognition + corpus growth. Long-term, timing uncertain.

---

#### H-AlignedFundersInbound: Recognition generates inbound from aligned funders
**Bet:** "Calibration expert" recognition + credible essays generate inbound from Lightcone, Protocol Labs, SFF.
**Blocked by:** H-Essays-BuildRecognition. Not revenue — opportunity unlock.

---

## Parked

Revisit at 12+ months, after core coaching loop validates.

| ID | Bet (1 line) | Why parked | Revisit when |
|----|-------------|------------|--------------|
| H-AgentCoordination | Agent-to-agent calibration becomes infrastructure | Zero human retention. Agents don't have ego. | Human retention >30% m2, stories + AI verification built |
| H-SalesTeamAdoption | Sales teams improve conversion via explain-back | Different GTM (HR/L&D channels) | Coaching track validates core mechanism |
| H-TeamCommunication | Group communication benefits from verification | Group dynamics requires different facilitation | 1:1 coaching proves out |
| H-ProtocolReachesScale | Protocol propagates globally via coach-led adoption | Endgame vision. Requires massive adoption. | Month 12+ |
| H-ToleranceAmplifies | Topology visibility shifts status norms | Requires scale (LEVEL 4) | Month 12+ |

---

## Research Priors

Literature-backed assumptions underpinning the product thesis. Not hypotheses we tested — evidence we're building on.

| ID | Claim | Evidence |
|----|-------|----------|
| H-Foundation-ListeningMatters | Perceived listening correlates strongly with work outcomes | Kluger et al. 2023 (N=400K): r=.39 overall, r=.47 sales, r=.28 burnout reduction. Healthcare teach-back: 45-60% readmission reduction (RCTs). |
| H-Foundation-CalibrationDeficitReal | People can't accurately assess what they know (r=.178) | Yang et al. 2023 (N=15,889, 115 studies). Measures reading comprehension self-assessment — same metacognitive blindspot applies. |
| H-Foundation-UnderstandingGapMeasurable | Understanding gap is measurable and reducing it improves communication | P96 validation sessions — consistent feedback: "This feels like being actually heard." Mechanism validated; stickiness unproven. |
| H-Foundation-GapInvisible | The gap is invisible; people walk away with miscalibrated confidence | Illusion of transparency + illusion of knowing. Documented in psychology literature. |

---

## Related Docs

- [lean-canvas.md](lean-canvas.md) — Problem, solution, customer segments, coaching price ladder
- [theory-of-change.md](theory-of-change.md) — Causal chain; validated assumptions and research evidence
- [decisions.md](decisions.md) — Strategic decisions shaping hypothesis priority
