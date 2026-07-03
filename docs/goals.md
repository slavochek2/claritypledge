# Goals

> **Charter:** doc-routing rules live in [CHARTER.md](CHARTER.md) — one fact, one home; pointers everywhere else. This doc owns **tactical GTM / funnel execution** (rule 7).

Concrete next steps in priority order.

**Last updated:** 2026-06-23 (added the pairs-filed leading-metric scoreboard + backward-counted warm-first sequence). Prior 2026-06-22 terminology: the public event "webinar" is renamed **Clarity Experiment** throughout (decisions.md 2026-06-22); the launch sequence is otherwise unchanged. Prior 2026-06-19 launch-funnel refresh replaced the 2026-06-05 interview-funnel sequence after the 2026-06-18 GTM launch worksheet locked the posture: a coaches-first founding-cohort launch with a public enrollment deadline. The interview-funnel framing (recorded letter-gated interviews as the engine) is retired to the trace block below.

Flywheel: see [lean-canvas.md](lean-canvas.md#channels--flywheel). Distribution rationale: [decisions.md](decisions.md) 2026-06-02 [product]. Bets: [hypotheses.md](hypotheses.md) H-CoachChannel, H-WTP.

**Core outcome (target future state):** A founding cohort of co-founder pairs completes the paid Co-Founder Program, the run produces named case studies + a verified gap-moved metric, and the recorded coach-endorsed Clarity Experiment becomes the proof asset that opens the next cohort and the accelerator/angel distribution channel.

---

## The Launch — Two Stacked Funnels (2026-06-19)

The launch runs on the claritypledge.com *method* brand. It is **not** founder-solo: the founder does not demo alone (no co-founder of his own + a credibility gap that a solo demo can't close). Instead, **coaches who have a business partner** are recruited first — they guest on the Clarity Experiment and demo their own divergent-position story live. That live endorsement, captured on video, *is* the proof, manufactured in the room.

So there are two funnels, and the order matters — **Funnel A gates Funnel B**:

- **Funnel A — coaches (the proof / credibility engine).** Reach coaches who have a business partner → offer a Clarity Experiment guest slot ("come experience a tool that de-risks your own partnership, free; build-in-public, nothing performed — just honest critical feedback; promotion optional") → they demo their real divergence live → capture an on-the-spot video testimonial before they log off. This opens the **coach ladder**: guest → co-deliver → certify (certified-coach program) → retainer / method-franchise (NVC-style). Revenue share is deliberately deferred until after Clarity Experiment 1 — coaches are unsure pre-proof, so don't force it.
  - The non-negotiable coach-fit filter is **comfortable being publicly vulnerable about a real disagreement** (the recorded asset exposes it). Then: shares our audience (founders / dyads), has a business partner (so coach+partner ARE the demo dyad), already works on business relationships. Frame entry as *co-host an event*, not "adopt my tool."
- **Funnel B — founders (the revenue).** The Clarity Experiment — now credible *because of* the coach guests — drives founders to the close: Clarity Experiment → 25% founding code → `/pricing` → Stripe checkout for the Standard Co-Founder Program (€950 list, €712.50 with the founding code). The **25% founding code is contingent on the pair recording a video testimonial** — announced verbally at the Clarity Experiment when the code is handed out (a spoken condition, not Stripe-enforced; recorded in the [co-founder program facilitator guide](cofounder-program-facilitator-guide.md) so it isn't lost). No 1:1 sales; all paying pairs come through the program funnel.

**Why coaches-first beats founder-solo:** it fills the hole the 06-18 worksheet's "Slava is the instrument" Phase 0 left open (*demo against whom?*), and smart coaches endorsing live on video answer the launch's true gating risk — proof / credibility (R₀≈0, one third-party testimonial today).

**Revenue model (unchanged, lean-canvas 2026-06-02):** asymmetric Gottman split — founder keeps method / license / data; coach keeps client-retention revenue. A referral/affiliate incentive is separate and only if a coach actively drives Clarity Experiment→program signups.

---

## The Milestone — Founding Cohort by 2026-08-31

Close the founding cohort by the **public enrollment deadline (2026-08-31)** — the `/pricing` countdown (`COHORT_ENROLLMENT_CLOSES_ISO`; the component is live, but the date is still Jul-19 in code until WS2 resets it to Aug-31). Band: **min 2 / target 3 / ceiling 8 pairs** at €712.50/pair (€950 list, 25% founding code). The deadline IS the one real deadline — it's when the 25% founding code expires — not a second urgency layer stacked on cohort start.

**Why a smaller first cohort than the earlier "5":** for a *first* run it is strictly better — easier to fill (~30 pairs to reach vs ~80), more intimate while delivery is still being de-risked, and it lets the band widen / price rise on cohort #2 once proof exists.

**Why a calendar deadline now, when 2026-04 retired calendar kill-dates:** the retired gates were *private* (a note in a doc; two passed unactioned). This one is *public* — a countdown on a live page, named to every Clarity Experiment attendee, with a discount that expires. Public deadlines with social + financial stakes drive behavior where private ones didn't. That is the whole reason it's reintroduced; don't pattern-match it to the dead kill-dates and drop it.

### Backwards funnel math (the real constraint)

Funnel B conversion drives everything; Funnel A timing gates when it can start.

| Target | Pairs to attend (@~10% close) | Founders to reach (@~10% reach→attend) |
|--------|-------------------------------|----------------------------------------|
| 8 pairs | ~80 | ~800 |
| **3 pairs (min 2)** | **~30** | **~150** |

~150 founders ≈ ~15 accelerator / angel / VC "yes" to share with ~10 founders each ≈ reach ~40-100 of them. Realistic fill is ~10-15/Clarity Experiment, so **biweekly** (not weekly) cadence; first coach-guest Clarity Experiment realistically early-mid July.

### Pre-registered band interpretations (decide the meaning before the data)

- **0-1 pairs:** funnel is broken — re-examine the offer/price, not just effort. Don't silently retry.
- **2-3 pairs (min hit):** thesis alive — run the cohort, capture case studies, and begin Phase-1 distribution recruiting (warm nodes below). `[FOUNDER DECISION: confirm 2/3]`
- **8 pairs (ceiling):** oversubscribed — raise price and/or widen the band on cohort #2. (Implausible for cohort #1 off R₀≈0 + one testimonial — this rung is a cohort-#2 contingency, not a realistic cohort-#1 outcome.)
- **Extend rule:** if min 2 is not hit by 2026-08-31, extend the public deadline **once, by ≤4 weeks**. No silent rolling.

---

## Scoreboard — pairs filed is the leading metric (2026-06-23)

The milestone above (3 paid by 2026-08-31) is the **lagging** outcome. The number to drive **weekly** is **pairs filed** — a featured pair where **both** co-founders have answered the seed letter and added a story (sealed, without discussing it with each other). It is the **supply gate**: no filed pair → no episode → the demand funnel never runs. This is the binding metric *now*; conversion only becomes binding once episodes are running.

Two funnels, each with a target. **Supply gates cadence; demand gates the milestone.**

**Supply — featured pairs → episodes** (the near-term bottleneck):

| Stage | Weekly / total target |
|---|---|
| Contacted (warm-first → connectors → cold; blended across channels) | ~50/wk |
| Responded | ~14/wk |
| Qualified (high-stakes dyad, or coach-with-partner per fit filter) | 1-3/wk |
| **Pairs filed (both, sealed)** ← weekly north star | **1/wk, ramping to 2-3/wk** |
| Episode booked & run | biweekly (Jul) → weekly (Aug) |
| Episodes by 2026-08-31 | ~5 |

**Demand — audience → paid** (the milestone):

| Stage | Total target (conservative 10% close) |
|---|---|
| Founders reached | ~250 |
| Pair-attendances across episodes | ~30 |
| **Paid pairs** | **3 (min 2)** by 2026-08-31 |

`[FOUNDER DECISION]` Close-rate assumption — default **conservative 10%** (~250 reach / ~30 attend). Warm-pair upside **~20%** (~150 reach / ~15 attend); revise the demand row if the first episodes close warmer.
`[FOUNDER DECISION]` Weekly filed-pairs target — **1/wk steady** vs **2-3/wk aggressive ramp**.

**How to read it weekly:** filed-pairs = 0 → the **supply** engine is the problem (sourcing or the per-guest loop), not conversion. Episodes running but paid = 0 → the **demand** side (fill or close). Never diagnose them as one number.

**The per-guest loop (contact → filed pair):** call (qualify + relationship) → send the seed letter to **both** → both file (sealed) → short partner call if the partner is cold (the partner carries the vulnerability) → **only then** fix the podcast date. Gating artifact = both filed. See [cofounder-program-facilitator-guide.md](cofounder-program-facilitator-guide.md) §"Clarity Experiment variant".

---

## Next Steps (2026-06-23 active sequence — warm-first)

1. [ ] **Warm-first sourcing (this week)** — DM the people you've been in closest contact with + past qualified responders. Cheapest, fastest first opportunities; **Event 1's bootstrap pair comes from here.** Seed the supply funnel before any cold campaign.
2. [ ] **Run the per-guest loop** for each opportunity (call → seed letter to both → both file sealed → partner call if needed → book date). Drive **pairs filed/wk** — the leading metric.
3. [ ] **Coach + connector pipeline in parallel (W0)** — ~20 coach-prospect DMs (fit filter) + ~20 accelerator/angel/VC connector DMs. Low yield, ~5-week lead, so start now; coach-guest episodes land from ~W5.
4. [ ] **Bootstrap Event 1 (~mid-July) without waiting for a coach** — an available warm / accelerator pair. Proof-generation (expect ~0 conversions); capture the recording — it recruits the coaches.
5. [ ] **Distribute founder invites (demand)** — connector multiplier (1 yes ≈ 10 founders) + cold LinkedIn at a **safe ~20-30 invites/day** (verify current limit) + email from old lists; ~250 reach over the run.
6. [ ] **Close the cohort** via Clarity Experiment → 25% code (testimonial condition said out loud) → `/pricing` → Stripe, by 2026-08-31.
7. [ ] **`/pricing` copy + deadline sync** — cohort scarcity copy → "one of 3 spots"; `COHORT_ENROLLMENT_CLOSES_ISO` → 2026-08-31; fix the stale placeholder comment in `webinar.ts`. Via `/dev` (touches `src/`). *(Separately: rename `/webinar`→`/experiment` with a redirect — see the route thread.)*

**Daily focus:** the pairs-filed pipeline (warm-first), coach/connector acquisition, Clarity Experiment fill, content production (LinkedIn / blog / podcast). Coaching page (ladischenski.com) stays live but unpromoted — bystander revenue, not a track.

---

## Distribution — Warm Nodes, Not Institutions (yet)

An institutional distribution partner (GAN, accelerator networks) is **premature** — they won't co-sign an unvalidated method (the chicken-and-egg). At launch, credibility transfers through *people*, not institutions:

1. **Coach guests are the first distributors** — a coach with a founder audience posting "I did this live, here's the recording" is warmer reach than any institution.
2. **One well-connected individual node > one institution** — an angel running a syndicate, an ecosystem-builder, a single accelerator program manager (the person, who shares useful content without institutional sign-off). DM directly.
3. **The recording lowers the cold-DM bar** — a formal distribution partner is an *earned Phase-2 luxury* (same logic as "co-launch coach is earned, not bet upfront"), not a precondition. `[FOUNDER DECISION: name one connector node in the network to test first.]`

---

## Open Risks (manage, not build — product dependencies are shipped)

`/pricing` + Stripe + the in-app Clarity Experiment RSVP are built and runnable. Remaining risks are execution:

- **Coach-fit / vulnerability:** finding coaches comfortable exposing a real disagreement on video. Mitigation: private story first → public later; an honest invite about what's exposed. A coach who won't is a paying customer or nothing — no forced synergy.
- **Async-completion of the letter flow (n=1→n=2):** does the coach+partner actually *complete* the letter→explain-back→read flow on the divergent story? The Clarity Experiment deadline is the forcing function async-alone lacked (0 historical completions). The single empirical thing to watch.
- **Credibility / proof:** one third-party testimonial today. The coach-endorsed recording is the designed answer; until it exists, every cold pitch is harder.
- **August holiday dead-zone:** the 2026-06-15 plan deliberately closed the cohort *before* the mid-August EU holiday lull; the biweekly schedule + Aug-31 deadline now run the close and cohort start *into* it — exactly when EU founders are least reachable, compressing the convert window the funnel math depends on. Accepted trade-off (realistic fill cadence over dead-zone avoidance). **Mitigation:** the ≤4-week extend rule below exists largely *for* this — if the lull starves the close, extend once into September rather than declaring the funnel broken.

---

## Phases After the Milestone (the coach ladder + institutional channel)

- **Co-deliver:** with a coach who showed interest, co-run a cohort. Earned, not bet upfront.
- **Certify:** a certified-coach program — the coach delivers the method themselves.
- **Retainer / franchise:** the method licensed NVC-style; coach pays a retainer.
- **Pair-builder programs (Antler / EF / CE):** the cold institutional channel, opened once self-generated case studies make the pitch land — sequenced, not dropped.

---

## Dos

- Use false-belief curriculum (P567) as event structure — don't improvise
- After position switch, ask: "What situations would have been different?" (H-WTP-Pain test)
- Capture a video testimonial from each coach pair on the spot, before they log off
- State the 25% founding code's testimonial condition out loud at every Clarity Experiment close (it's not Stripe-enforced — only real if you say it)
- Pay-what-it's-worth for sessions (communicate upfront, not retroactively)
- File stories/points after each session (you are the scribe)
- Use /live as YOUR diagnostic tool — pairs don't need to learn it
- Every session = labeled calibration data (intelligence infrastructure)
- Check emotional readiness before verification exercises (P518)
- Keep research sessions and revenue sessions separate (H-CoachChannel 2026-06-04)

## Don'ts

- Don't ask completed pairs for payment retroactively (trust breaker)
- Don't run sessions on abstract/philosophical topics — values and real decisions only
- Don't confuse curiosity ("that's cool") with pain ("this cost us X")
- Don't present your points as truth — present as your position, let the protocol work
- Don't try all 8 false beliefs in one workshop — 3-4 with depth beats 8 at surface
- Don't force a revenue-share ask on a coach pre-proof (defer to after Clarity Experiment 1)
- Don't pursue an institutional distribution partner before the proof recording exists
- Don't silently drop the public deadline — extend once by ≤4 weeks if min 2 is missed, and record why

---

## Superseded — 2026-06-05 Interview-Funnel Sequence (replaced 2026-06-19)

> The 06-05 sequence made *letter-gated recorded interviews* the engine (publish a35 → finalize p851 letter gate → coach landing page → invite scientists + coaches to interviews; letter completion = admission gate). The 2026-06-18 GTM worksheet replaced it with the coaches-first founding-cohort launch above: the Clarity Experiment (not an interview) is the surface, the coach+partner live demo (not a letter gate) is the proof, and a public enrollment deadline (not exposure-based action counts) is the forcing function. a35 and p851 survive as credibility/instrument assets, not as the funnel spine. The exposure-based transform conditions are superseded by the pre-registered band interpretations above.

## Superseded — 2026-04-29 Sequence

> DM tracks + calendar decision gates. Replaced by the interview-funnel sequence (itself replaced above). Durable findings retained: ladischenski.com coaching demoted to bystander revenue; EV/grant applications opportunistic (cite a35 once live).

## Reflection 2026-04-27 — Badging Unit Economics (SUPERSEDED)

> Durable findings: full badge is premium (~100-180 min/person), not viral; the diagnostic = listener's own before/after position delta (self-report), not speaker's verdict; one story deep beats 3-4 shallow in a 90-min format.

---

## See Also

- [P606: The Clarity Flip Workshop](../features/p606_clarity_flip_workshop.md) — norm-inversion format
- [Facilitator Guide](facilitator-guide.md) — workshop flow + session types
- [P567: False Belief Curriculum](../features/p567_false_belief_workshop_curriculum.md)
- [hypotheses.md](hypotheses.md) — H-CoachChannel (P0 distribution), H-WTP, H-ComprehensionTrust
- `.private/docs/gtm-launch-icp-worksheet.md` — the full launch-decision worksheet (private)
