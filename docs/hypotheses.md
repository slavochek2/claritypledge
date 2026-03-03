# Hypotheses

Our active bets, in priority order. This is the map of what we still need to prove.

**Currently testing** → **Blocked** → **Validated** → **Killed/Parked**

---

## Active (Currently Testing)

### H-Stories-ColdStart: Stories are the content layer for /live verification
**Bet:** When users create and share stories, they have a concrete "what" to verify understanding against, making /live feel purposeful and triggering higher adoption and retention.
**Testing via:** C1 (Stories + Live + Events) — 20-user pilot Feb–Mar 2026. Target ≥50% story creation rate, ≥30% verification rate.
**Kill if:** <20% story creation after 4 weeks OR stories don't improve /live usage frequency.
**Scope update (2026-02-27):** Stories are now understood as the **content layer**, not the primary cold start trigger. The cold start trigger is the briefing protocol invitation (H-BriefingProtocol-ColdStart below). C1 runs to completion as a content-layer test and comparison baseline. Key question revised: do stories provide useful "what to verify" context once a session is initiated — not whether they initiate sessions on their own.
**Notes:** User feedback consistently asks "on what? when?" The briefing protocol solves the "when" (invitation trigger); stories solve the "what" (content to verify).

---

### H-BriefingProtocol-ColdStart: Mirror agent invitation solves cold start
**Bet:** When Person A's mirror agent reaches out to Person B ("Someone you care about wants you to understand them better — here's a 20-minute briefing"), Person B engages, comprehension is tested, and A+B meet at depth on day one rather than month six.
**Testing via:** Manual briefing experiment — run full protocol with one real high-stakes Person B. Measure: does Person B accept? Does comprehension test surface a gap? Does the meeting start at depth?
**Kill if:** Person B declines invitation OR finds mirror claims generic/unengaging OR meeting doesn't start noticeably deeper than without briefing.
**Precondition:** Requires motivated Person B with pre-existing relationship stakes. Protocol channels existing motivation — doesn't create it from nothing.
**Notes (2026-02-27):** Points surface the gap; stories explain the gap. This is the cold start trigger. H-Stories-ColdStart tests the content layer once a session is initiated.
**Notes (2026-03-02):** V1 doesn't need story learning from /live sessions — AI generates mirror claims directly from story content. /live session history makes claims sharper over time (V2). This means the hypothesis is testable NOW.

---

### H-AICalib-EntryTeaser: AI calibration demo lowers trust barrier before co-founder offer
**Bet:** A 5-minute AI calibration demo ("paraphrase what AI just told you → see the gap") has lower emotional load and faster demo-ability than leading with co-founder calibration. Used as a workshop opener or meetup hook, it primes participants for the calibration concept — making the co-founder offer easier to land.
**Testing via:** Calibration Lab workshops at AI-adjacent events (AI business meetups, etc.). Measure: does the AI teaser create "aha" faster than a co-founder scenario? Does it make the co-founder pivot feel natural (not jarring)?
**Kill if:** AI teaser creates confusion about what the product is FOR, or participants leave thinking "this is an AI tool" rather than "this is for my high-stakes relationships."
**Notes (2026-03-03):** This is NOT a pivot to AI as a market. AI calibration is the demo vehicle; co-founder calibration is the product. Leading with AI calibration as primary positioning was considered and set aside — too diluted, no moat. The value is in the low-friction demo, not in the AI calibration market itself.
**Precondition:** Workshop venue has AI-adjacent participants (AI meetups, AI-using founder communities) where AI examples land naturally.

---

### H-MetaEpistemic-Prerequisite: Meta-epistemological alignment deepens session quality
**Bet:** If both participants understand the meta-epistemological foundation before a /live session — specifically WHY we actively listen (the 8 postulates in philosophy.md), anchored via the sister story (cognitive vs emotional understanding) — session depth increases measurably compared to sessions without this briefing.
**Testing via:** C1 sessions — brief both participants on the 8 postulates using the sister story as entry point before the session. Measure: does the session start deeper? Qualitative signal: "We didn't have to spend the first 10 minutes establishing what we're trying to do."
**Kill if:** Sessions without the meta-epistemological briefing reach equal depth OR participants find the briefing academic/off-putting and disengage.
**Product implementation:** Mini Pledge (P421) — a pre-session commitment ritual grounded in Pinker's common knowledge framing. Both participants confirm: "In this session, I commit to reaching cognitive understanding — not agreement."
**Notes (2026-03-01):** Surfaced from voice note analysis. Onboarding to ClarityPledge sessions isn't just "here's how the tool works" — it's "here's how knowledge works, and why we verify." Without meta-epistemological alignment, participants follow the ritual but miss the point.

---

### H-FilingLoop-Propagation: Sessions without filed material are sterile — filing + agent follow-up is the growth mechanism
**Bet:** A calibration session that produces filed stories/points + agent follow-up generates a new session without Slava present. A session that produces nothing filed generates nothing next — growth depends entirely on Slava showing up again.
**Testing via:** Track post-session behavior in C2 — does filing happen? Does the agent follow up? Does a second session get initiated without direct outreach from Slava?
**Kill if:** Filing happens but no new sessions result OR Slava's presence remains required to initiate every session.
**Precondition:** Requires working filing mechanism (Person A can file insights post-session) and agent post-session engagement capability.
**Blocked by:** H-BriefingProtocol-ColdStart (need validated sessions) AND H-AgreementRetention (need to confirm agreements drive /live return before testing propagation).
**Notes (2026-02-28):** Structural constraint, not optional feature. Without this loop, C-track is a coaching practice (Slava-dependent), not a scalable product.

---

### H-CoFounders-WillPay: Co-founder pairs value and return to preventive calibration
**Bet:** Co-founder pairs who attend a free Calibration Lab and create a partner agreement will return to /live regularly — the agreement operationalizes the commitment, not just records it. If the pair returns, WTP for retainers (H-Retainers-Sticky) becomes testable.
**Testing via:** C2 (First Calibration Labs) — 3–5 free Labs, track partner agreement creation rate and /live return rate. Target ≥50% of agreement-creating pairs return to /live within 30 days.
**Kill if:** <30% agreement creation rate at Calibration Labs OR <30% of agreement-creating pairs return to /live within 30 days.
**Notes:** High-stakes dyad with recurring calibration needs. ICP qualifier: relationship health + decision frequency, not funding stage. Validates positioning as preventive (not therapeutic). WTP itself is confirmed in C3 (H-Retainers-Sticky) — C2 tests engagement and return, not payment.
**Scary thing:** Run first Calibration Lab with at least one co-founder pair by March 14.
**Current status (2026-03-02):** No product yet — only a hypothesis. First pilot sessions are free in exchange for honest feedback. The session IS the product discovery. Goal of pilot: shift pair from "asking to paraphrase feels awkward" → "refusing to paraphrase feels wrong." Session prep: `pp/docs/business/cofounder-session-prep.md`.

---

### H-AgreementRetention: Partner agreements drive recurring /live usage
**Bet:** Co-founder pairs who create a partner agreement at a Calibration Lab continue using /live regularly (at least once a month) for 3+ months — because the agreement operationalizes the commitment, not just records it.
**Testing via:** C2 — track /live session frequency for pairs who created agreements vs. those who didn't. Measure 30-day and 90-day return rates.
**Success:** >50% of agreement-creating pairs use /live at least once in month 2 and month 3.
**Kill if:** <30% of agreement-creating pairs use /live in month 2 — means agreements are symbolic, not behavioral.
**Notes:** This is the foundational retention hypothesis. If agreements don't drive recurring /live usage, the entire product loop breaks: no /live = no positions = no stories = no briefing protocol material. Test this before building anything downstream.

---

### H-Retainers-Sticky: Founder pairs retain monthly €800–1,500 calibration retainers
**Bet:** Co-founder pairs who experience value in C2 sessions will subscribe to ongoing monthly retainers for continuous alignment calibration as they make decisions.
**Testing via:** C3 (Paid Founder Retainers) — launch retainer offers to C2 participants, measure month-2 retention. Target 10+ pairs, >60% month-2 retention, €10k MRR.
**Kill if:** <5 retainer signups OR <40% month-2 retention.
**Notes:** Monthly cadence mirrors how co-founder tensions compound over time. Retainers create predictable MRR vs event-based revenue.

---

### H-Community-Retention: Founder community adds moat and drives retention above 1:1 retainer baseline
**Bet:** Adding a peer community layer (€200–300/month add-on) to individual retainers increases stickiness through group calibration, peer validation, and referral effects.
**Testing via:** C4 (Founder Community) — monthly cohort calls for C3 retainer customers. Target 10+ members, >60% month-2 retention, visible peer calibration.
**Kill if:** <5 community members OR <40% month-2 retention.
**Notes:** Shifts from isolation (1:1) to network (group). Switching cost increases when peers are involved.

---

### H-Essays-BuildRecognition: Evidence-based essays position us as calibration experts in aligned communities
**Bet:** Essays grounded in real founder session data, framed as "calibration infrastructure for personal AI," can reach AI safety/rationalist communities and build recognition as "the calibration expert."
**Testing via:** R1 (Essay Writing) — publish 3+ essays May–Aug 2026. Target ≥50 readers per essay, ≥5 meaningful discussions, ≥1 inbound "you're the expert" mention.
**Kill if:** <50 readers per essay after 3 months OR zero engagement.
**Notes:** Starts Month 5 AFTER C2/C3 generate real founder data. "We ran 10+ sessions and measured X" is 2x more credible than theory-first positioning.

---

### H-CalibrationTrainable: Calibration accuracy is trainable and measurably improves through /live feedback loops
**Bet:** Users practicing the explain-back protocol through /live will reduce their understanding gaps over repeated sessions, improving calibration accuracy (confidence matching reality).
**Testing via:** C1–C3 sessions — track Understanding Gap reduction across sessions for the same user pairs.
**Kill if:** No measurable gap reduction across repeated sessions OR users report no improvement in "knowing what they know."
**Notes:** Foundational assumption. Research evidence supports this (meta-analysis g=0.46–0.72), but workplace context differs from academia.

---

### H-ProtocolSpreadsWithoutTool: The explain-back protocol spreads free; the tool captures value from users who want measurement
**Bet:** The explain-back protocol is valuable enough to spread without our product. Product success comes from protocol users asking "How can I measure this?" — creating the funnel.
**Testing via:** C2 workshops + coach feedback. Observe: Do coaches adopt protocol independently? Do participants ask about measurement?
**Kill if:** Coaches don't teach protocol to clients OR participants don't ask about measurement tools after experiencing the protocol.
**Notes:** This is Protocol-Led Growth. Healthcare parallel: teach-back spreads free, hospitals pay for electronic health records.

---

## Blocked (Waiting on Something Else)

### H-InsightConversion: Surfacing repeated unacted insights increases behavior change
**Bet:** When the mirror agent tracks that a person has had the same insight multiple times without acting on it and surfaces this explicitly ("You've had this insight 4 times and acted on it zero times — what's the actual blocker?"), it produces behavior change that neither therapy nor coaching currently achieves, because it combines insight with memory-backed accountability.
**Blocked by:** H-BriefingProtocol-ColdStart — need validated briefing protocol first; insight tracking is a later layer.
**Unblocked when:** Briefing protocol validated with at least one real high-stakes dyad.
**Kill if:** Surfacing repeated insights produces defensiveness/disengagement rather than action.
**Notes (2026-02-27):** Positions ClarityPledge beyond communication tools — as "calibrated accountability with verified understanding." New category, not a feature of existing categories.

---

### H-SpecsReachResearchers: Technical specifications reach AI safety researchers and trigger adoption discussions
**Bet:** Specs (technical deep dives on calibration infrastructure) published on LessWrong/Alignment Forum can reach AI labs and spark discussions about using verified Stories as training data.
**Blocked by:** H-Essays-BuildRecognition — need baseline recognition before specs land.
**Unblocked when:** R1 achieves ≥50 readers and ≥5 discussions on first essay.
**Kill if:** Specs referenced in zero alignment discussions after 3 months.

---

### H-StoriesAITrainingData: AI labs will use verified Stories corpus as training data for agent alignment
**Bet:** Our Stories dataset (verified understanding pairs) becomes valuable to AI labs training personal agents on aligned instruction-following.
**Blocked by:** H-Essays-BuildRecognition AND C1/C3 story corpus growth — need both credibility AND sufficient Stories data.
**Unblocked when:** Recognition threshold crossed + 100+ verified stories collected.
**Notes:** Long-term bet. Timing uncertain — is the AI training data market ready now or 12+ months out?

---

### H-AlignedFundersInbound: Recognition generates inbound interest from aligned funders (Lightcone, Protocol Labs, SFF)
**Bet:** Recognition as "the calibration expert" + credible essays on AI alignment will generate inbound inquiries from aligned funders.
**Blocked by:** H-Essays-BuildRecognition — need public visibility first.
**Unblocked when:** Essays reach 200+ readers and generate meaningful discussions.
**Notes:** Not a revenue hypothesis — an opportunity unlock.

---

## Validated

### H-Foundation-ListeningMatters: Perceived listening correlates strongly with work outcomes
**Bet:** Listening is not a soft skill — it's a hard business driver.
**Evidence:** Kluger et al. 2023 meta-analysis (N=400K): r=.39 overall, r=.47 in sales, r=.28 burnout reduction. Healthcare teach-back: 45–60% readmission reduction (RCTs).

---

### H-Foundation-CalibrationDeficitReal: People can't accurately assess what they know (metacognitive accuracy r=.24)
**Bet:** Baseline metacognitive accuracy is r=.24 — predictions barely match reality. This is the misalignment we're trying to surface and fix.
**Evidence:** Yang et al. 2023 meta-analysis (N=15,889). 75% of self-report research relies on miscalibrated self-assessment.

---

### H-Foundation-UnderstandingGapMeasurable: The gap between "how well I think I understood" and "how well I actually understood" is measurable and reducing it improves communication
**Bet:** /live verification (explain-back + rating gap) produces measurable Understanding Gap. Users feel more understood after /live than before.
**Evidence:** P96 validation sessions — consistent user feedback: "This feels like being actually heard."
**Notes:** Mechanism validated. But "works in-session" ≠ "sticky." That's why Stories was born.

---

### H-Foundation-GapInvisible: The Understanding Gap is invisible; people walk away with miscalibrated confidence
**Bet:** Without verification, people are confident they understood when they didn't. The gap is the real problem, not the gap-closure mechanism.
**Evidence:** Illusion of transparency (speakers overestimate clarity) + illusion of knowing (listeners overestimate comprehension). Documented in psychology literature.

---

## Parked / Future

### H-AgentCoordination: Agents will use calibration infrastructure to verify each other's understanding
**Bet:** As AI agents proliferate, agents will need to verify they understood each other's instructions. Agent-to-agent calibration becomes infrastructure.
**Why parked:** Zero human retention yet. Agents solve problems differently (no ego, can share state directly). Ecosystem unstable.
**Revisit when:** Human retention >30% month-2, Stories + AI verification built, agent ecosystem stabilizes.

---

### H-InvestorDueDiligence: Investors pay for calibration sessions during founder due diligence
**Bet:** VCs will pay for a /live session with a founder they're considering backing, to verify communication clarity before writing a check.
**Why parked:** Coaching track not validated yet. VC sales cycle is slow (3–6 months) — premature before coaching traction.
**Revisit when:** C2 hit (10+ Calibration Lab participants with agreements created), C3 hit (5+ retainer pairs with month-2 retention).

---

### H-SalesTeamAdoption: Sales teams adopting explain-back will improve conversion and customer retention
**Bet:** Explain-back protocol + /live verification improves listening skills, leading to higher sales conversion and customer retention.
**Why parked:** Requires different go-to-market (HR/L&D channels vs. founder networks). Deferring until coaching track validates the core mechanism.

---

### H-TeamCommunication: Teams practicing explain-back in standups and retros will reduce miscommunication costs
**Bet:** Group communication (not just co-founder dyads) benefits from verification. Standups, retros, decision meetings all suffer from "we talked but didn't align."
**Why parked:** Group dynamics requires different facilitation and larger cohorts. Current focus: 1:1 dyads with high intrinsic motivation.
**Revisit when:** 1:1 coaching proves out. Facilitation ladder: 1:1 → broadcast → chain → topology.

---

### H-ProtocolReachesScale: The √N mathematics hold — verification propagates globally through coach-led adoption
**Bet:** Protocol-led growth follows the √N rule: only ~89K verified connections needed for everyone on Earth to be 1–2 steps from verification.
**Why parked:** Endgame vision. Requires massive protocol adoption. Current focus: 0–6 month validation.
**Revisit when:** Month 12+, after critical mass.

---

### H-ToleranceAmplifies: Topology visibility shifts status norms — "verified understander" becomes higher status than "loud asserter"
**Bet:** When disagreement groups see who understands whom, status shifts. Informed disagreement becomes status-positive vs. unexamined assertion.
**Why parked:** Requires scale (LEVEL 4: topology visibility). Can't test until many users verify each other.
**Revisit when:** Months 12+.

---

## Killed / Abandoned

*(None yet. No hypotheses have been definitively killed as of Feb 2026.)*

---

## Dependency Map

```
COACHING TRACK (C) — Months 1-6, PRIMARY
├─ H-CalibrationTrainable (foundational — test in C1–C3)
├─ H-ProtocolSpreadsWithoutTool (test in C2)
├─ H-Stories-ColdStart (C1) → unlocks C2
├─ H-CoFounders-WillPay (C2) → unlocks C3
├─ H-AgreementRetention (C2) → required before H-FilingLoop-Propagation
├─ H-FilingLoop-Propagation (blocked by H-AgreementRetention + H-BriefingProtocol-ColdStart)
├─ H-Retainers-Sticky (C3) → unlocks C4
└─ H-Community-Retention (C4)

RECOGNITION TRACK (R) — Months 5-12, SECONDARY
├─ H-Essays-BuildRecognition (R1, after C2/C3 generate data)
├─ H-SpecsReachResearchers (blocked by R1 success)
├─ H-StoriesAITrainingData (blocked by R1 + story corpus)
└─ H-AlignedFundersInbound (blocked by essay credibility)

FUTURE SCALE — Months 12+
├─ H-AgentCoordination (parked)
├─ H-ToleranceAmplifies (parked)
└─ H-ProtocolReachesScale (parked)
```

---

## Related Docs

- [lean-canvas.md](lean-canvas.md) — Problem, solution, customer segments, business model
- [theory-of-change.md](theory-of-change.md) — Causal chain; validated assumptions and research evidence base
- [milestones/](milestones/) — C1–C4 and R1 contain hypothesis-specific testing protocols and kill criteria
- [decisions.md](decisions.md) — Strategic decisions shaping hypothesis priority
- [future-directions.md](future-directions.md) — FD-1, FD-2 (parked hypotheses with revisit conditions)
