# Co-Founder Program — Facilitator Guide

**For:** Slava (and badged co-facilitators / coaches) running the **facilitated practice** inside the Co-Founder Program, and the live demo inside the Clarity Experiment funnel (the public event renamed from "webinar" 2026-06-22).

> **The featured table (2026-06-22):** a Clarity Experiment features a **coach guest AND a normal co-founder pair** — the coach is the credibility / proof asset, the pair is the relatability mirror the audience sees themselves in. A *layer* on the coaches-first spine (decisions.md 2026-06-19 + 2026-06-22), not a replacement; founder-solo demos remain rejected.
**Scope:** A committed co-founder *pair*, working a *real* disagreement. NOT the 1-to-many workshop — for cold-audience, false-belief workshops see [facilitator-guide.md](facilitator-guide.md).
**Last updated:** 2026-06-23

> **Why this guide exists separately.** The workshop guide surfaces *pre-filed false beliefs* to a cold room. The program works the *pair's own live disagreement* — the mechanism, the safety stakes, and the close are different. This guide owns the pair session; the workshop guide owns the room.

---

## The core move: let normal talk fail first, then switch

The single most important design choice in a pair session is **sequence**. Do not open by teaching the protocol. Open by letting the pair communicate **the way they already do** — and let it visibly fail to produce verified understanding. Only then introduce the protocol, so it lands as *relief from a gap they just felt*, not as a technique imposed by a coach.

A pair that is *told* "you misunderstand each other" defends. A pair that *watches itself* fail to verify, on a decision that matters to them, cannot un-see it. Manufacture the contrast; don't assert it.

This is the same logic as the [workshop position-switch](facilitator-guide.md#workshop-format-false-belief-curriculum) (surface → position → reveal gap → switch), pointed at a live relationship instead of a filed story. It extends our earlier pair-session script by adding the *deliberately-unstructured first round* in front of the reveal.

---

## Clarity Experiment variant: one seed letter (the CPA) + sealed solo answers

> **Scope:** this section governs the **public Clarity Experiment** demo. A private program session can work the pair's own disagreement (Phase 1 below); the Experiment surfaces it through one *authored* letter so topic-selection never fails on stage (~40% of sessions fail on topic — [H-TopicDepthGate](hypotheses.md)).

**One seed letter, not nine. You are the author = ground truth.** The seed letter is a single authored letter — a modified **Story 8** (the CPA rationale: refusing to read / paraphrase / sign the CPA → *why?* → the root of compounding problems is the illusion of understanding; with someone not predictably bridgeable you can't share risk, because sharing risk rests on the hope they can see the gaps in their understanding of you → so you can't coordinate on future problems). The pair does **not** author — authoring is your skill, and the author is the verification ground truth ([lean-canvas.md](lean-canvas.md) "Verification-ready vs verified"). They are readers/responders.

**Sealed solo answers — say this *before* it starts.** Before the event, each co-founder answers the seed letter **alone**: positions on the point/anti-point + sealed-bid comprehension self-ratings (P904, shipped). They do **not** see each other's answers and do **not** discuss it with each other. State this when you send the letter — it is not enforced by software, so it is only real if you say it.

**Async is data-collection only; the rupture is live.** The async answering pre-loads the topic and positions so live time goes straight to the verification moment. It must stop at data collection. If the pair *resolves* async — paraphrasing each other, exchanging bilateral letters — the rupture is **spent** and the audience never watches it. That deeper async exchange (bilateral answer-letters, reveal-moment response threads — **P948 / P952**) is for **program delivery, NOT the Experiment.**

**Answering does NOT auto-create a story — they must "Add a story" (corrected 2026-06-23; an earlier draft wrongly claimed answering files a story).** The default answer actions — *lock in position* (`setPosition`) and *explain back* (`uploadExplainBack`) — write a position and an explain-back, **not a story.** To leave /live something to verify, each co-founder must use the separate **"Add a story"** affordance on the seed point while answering: it calls `createLetterPositionStory`, which inserts a real *private* story linked to the point (author = them). So **instruct them to add a story on the seed point** — positions + explain-backs alone leave /live with nothing to pick. **Once added it is pickable:** /live is fed by `getStoriesByAuthorWithPoints(userId, userId)` (all their authored stories), and that story is one of them. **Candidate P948 re-scope (not built):** automatically bootstrapping the story from their responses — so they don't have to add one by hand — is *not* shipped. That **responses → STORY** job is the near-term P948, and it is *distinct* from packaging a story into a *letter to send* (the separate exchange / delivery step the current P948 spec describes).

**The test content is the close.** The seed letter's content *is* the CPA, so the Experiment's test content and its commercial close (sign the CPA → enter the program) are the **same object** — the [triple-duty instrument](lean-canvas.md) sharpened to a single artifact. The CPA is not a pivot after the demo; it is the thing being read, verified, and adopted live.

### Branching on the CPA probe

- **Both agree** (after verifying they actually understand it — not just nod): they **sign the CPA live and draft terms.** The audience watches a pair commit to the protocol in real time — the strongest close.
- **They disagree → test whether they understand each other.**
  - *Not understanding each other* → run [the switch (Phase 3)](#phase-3--the-switch-15-20-min) on the CPA divergence itself. That is the demo.
  - *Both genuinely understand each other AND both verify the CPA isn't needed* → the other eight stories / false beliefs become your **backup diagnostic menu** — they tell you what the pair should actually discuss. Orchestrate with questions, sometimes answering "what I meant when I said X."

---

## The session arc

Roughly 60–75 min for a pair. Phases 1–4 are the engine; 0, 5, 6 are the frame.

### Phase 0 — Safety gate (5 min)

Before any disagreement is opened, run the [emotional-readiness check and exit-ramp framing](facilitator-guide.md#emotional-safety) from the workshop guide — it applies unchanged and matters *more* here, because a real relationship is on the table, not a stranger's filed story.

- Regulation check (0–10), made visible to both. If either is <5, steer to a lower-stakes Level-2 decision, not a values-level one.
- State the [golden-bridge rule](facilitator-guide.md#the-exit-ramp-golden-bridge) out loud: *every* update, softening, or "I hadn't thought of that" is the win, never a loss. Nobody spikes the ball. You will protect whoever moves first.

### Phase 1 — The unstructured attempt (8–10 min)

> **Goal:** capture a real, normal, un-coached conversation that will fail to verify.

1. **Pick a live disagreement, not an aligned one.** "What's a decision the two of you keep circling and haven't actually closed?" If they claim alignment: "Pick the one you're *least* sure you see the same way." Topic depth is the #1 failure surface — see [topic-depth gate](#topic-depth-gate) below. **(Clarity Experiment: skip the pick — the seed letter has already surfaced the divergence; go straight to step 2. See the seed-letter section above.)**
2. **Let them talk.** "Just talk it through the way you normally would. I'm not going to interrupt." Then *don't.* No protocol, no paraphrase, no facilitation. 8 minutes.
3. **Watch for the tells** (you'll name these later): persuasion language ("but don't you think…"), **repetition** (a partner who restates the same point doesn't believe they've been understood), talking past each other, the false close ("ok, fine, let's move on"), rising temperature, or — just as telling — *smooth surface agreement* on a decision they've never actually verified.

Resist the urge to help. The failure is the asset.

### Phase 2 — The conviction poll: name the failure (5–7 min)

> **Goal:** make the gap undeniable, in their own ratings, before you offer anything.

Stop them. Ask each one **separately** (sealed-bid — don't let them hear each other's number first):

- "How confident are you that you understood what your partner *actually meant*?" (0–10)
- "How confident are you that *they* understood *you*?" (0–10)
- "On this decision — did either of you move?"

Then test it: have A state, in one sentence, what B's actual position and *reason* is. Ask B: "Is that it — at the depth you feel it?" The self-rated confidence almost always exceeds the verified explain-back. **That delta is the whole session.**

Name it plainly — this is the pivot of the entire session:

> "You just had an honest, normal conversation — and neither of you can verify you were understood. That's not a character flaw and it's not because you don't care. Normal conversation has **no verification step.** This is exactly how quiet drift accumulates: you agree, you move on, and the gap stays invisible to both of you until it costs something."

The underlying claim (keep it in your pocket, deploy if they're analytical): **arguments accomplish nothing without verified shared understanding of the claim.** Two people updating against a strawman of each other can't converge — Aumann's agreement theorem needs common knowledge of *meaning* as its precondition, and debate skips that step. Verification installs the missing precondition.

### Phase 3 — The switch (15–20 min)

> **Goal:** run the *same* disagreement again, with one rule — and let them feel the difference.

"Let's run it again. Same decision. One rule this time."

The protocol:

1. **A states their position** (one move at a time — a claim and its reason, not a monologue).
2. **B explains it back.** Two constraints, both load-bearing:
   - **No rebuttal.** B is not allowed to argue yet.
   - **No agreement either.** "When you jump to agreeing, you rob your partner of being *heard* — they still don't know whether you got it or just want to move on." B's only job is to render A's view accurately enough that A recognizes it.
3. **A scores the depth, not the words.** Not "did you repeat me" but "did you get it at the depth I *feel* it?" A rough number is fine ("about 70%"). If A repeats themselves, that *is* the signal B hasn't landed it — loop, don't proceed.
4. **Confirm, then swap.** Only when A says "yes, that's it" does B get to take the floor as A.

You are the protocol's enforcement, not a participant. You catch the rebuttals, you catch the premature agreements, you hold the no-interruption line. Use [/live as your own diagnostic](facilitator-guide.md#dos) — the pair doesn't learn the tool, they feel the result.

**Optional climax — role reversal.** For a pair that's regulated and engaged: have them switch seats and argue *as each other*, to the other's satisfaction. The marker of success is linguistic — the qualifier drops, "I just mean it" replaces "I mean, I guess they'd say…", or one of them says some version of "ok, you actually got me." This is the strongest single producer of movement, but it costs regulation budget — don't run it on a fragile pair.

### Phase 4 — Measure the contrast (5 min)

> **Goal:** prove the switch did something — in numbers, not vibes.

Re-poll, same instruments as the [workshop measurement battery](facilitator-guide.md#workshop-metrics-2026-04-02) (use them by reference — don't reinvent):

- **Understanding-confidence** (the Phase-2 questions, re-asked) — should rise.
- **[Agreement-demand delta](facilitator-guide.md#agreement-substitution-measurement-2026-04-22):** "How important is it *right now* that they agree with you?" — should *drop* even if neither position moved.
- **[Warmth delta](facilitator-guide.md#relational--position-extremity-deltas-2026-05-29):** "How warm do you feel toward them right now?" — moves first and fastest.
- **[Position-extremity / nuance](facilitator-guide.md#relational--position-extremity-deltas-2026-05-29):** where they stand on the exact claim, −5…+5, plus any newly-admitted considerations.

**Read the result honestly.** A full position flip is rare and is not the bar. A pair that drops agreement-demand, warms toward each other, and admits one new consideration each has succeeded — that's a verified disagreement or a fork, not a failure ([definitions.md](definitions.md) Verification Outcome States). Do not let them (or yourself) read "we still disagree" as "nothing happened." The thing that was broken — *not being able to tell whether you understood each other* — is the thing that got fixed.

### Phase 5 — Name the belief + reflect (5 min)

The KEY "name the belief" move:

> "The belief that produced the first conversation — *'I can tell whether we understood each other without checking'* — that belief didn't just produce this gap. It will produce the next one, and the one after that. What you added today is the checking step."

Then surface cost: "Think of a past decision where this exact gap was running and neither of you knew. What did it cost?" Quantify if they'll let you. This is where pain — and therefore willingness — surfaces. **Don't skip it.**

### Phase 6 — Close (5 min)

The conversion is not a sale of *this* session; it's the recognition that the checking step is a **repeatable protocol they take home.** Anchor to the program:

- The [Clarity Partner Agreement](../features/done/21_feb_26/p422_clarity_partner_agreement.md) (p422) is the artifact that makes the protocol a standing norm between them, not a one-off experience.
- Program pricing is fixed — **€950/pair**. Founding cohort: a **25% founding code → €712.50/pair**, given out at the Clarity Experiment close (supersedes the 06-15 €500; decisions 2026-06-19). **The 25% discount is contingent on the pair recording a video testimonial — say this out loud when you hand out the code** ("the founding price is for pairs who'll record a short video testimonial after the program"). It's a spoken condition, not enforced by Stripe, so it's only real if you announce it every time. **Do not** apply the workshop's three-track pay-what-it's-worth here — that's a workshop instrument, not a program one.

If it landed: "You felt one gap close today. You have dozens you haven't checked — that's the program." If it fell flat: note it as falsification signal, don't push.

---

## Topic-depth gate

~40% of /live sessions fail on topic inadequacy ([H-TopicDepthGate](hypotheses.md)). The protocol reaches depth fast on the *right* disagreement and produces noise on the wrong one. Steer toward decisions with real stakes between *these two people* — equity, roles, risk appetite, what "success" means, who decides what. Avoid abstract or philosophical topics; avoid anything neither of them actually owns. When in doubt, ask "which of these have you actually had to *act* on together and weren't sure you agreed?" See [P926 Founder Gap-Location Guide](../features/p926_founder_gap_location_guide.md) for the high-risk domain map.

---

## Failure modes (watch for all of these)

- **One-sided opening (the killer).** One partner "feels profoundly seen" while the other recedes. Scaffold the receding partner deliberately — give them the floor first next round, slow B down.
- **Empathy-by-equivalence.** "I've been through that too / I totally get it" lands as *erasing* the partner's distinctness, not honoring it. Redirect to rendering *their* specific view, not a shared one.
- **Power asymmetry.** The partner with more positional power (more equity, the "technical" one, the older one) has more empathy budget; the one with less needs more scaffolding to be heard. Don't run the protocol as if the floor is level when it isn't.
- **The false close.** "Fine, you're right, let's move on" is surrender, not understanding. It produces no verification. Catch it and reopen.
- **Re-traumatization in role-reversal.** A cruel or mocking impersonation triggers the other. Cut it; depth and good faith, never parody.
- **Smuggling the *what* back in.** When asked *why* (value/fear), a partner restates *what* (the policy/position). Empathy attempts fail precisely there. Drive toward the underlying value or fear, not the surface stance.

---

## Credibility move worth stealing

**Self-correct out loud.** When *you* mishandle a moment — let a rebuttal slide, push too hard, miss a receding partner — name it: "That was on me, I let that run too long." Facilitator self-correction on camera/in-room buys more trust than flawless delivery. It also models the exact update behavior you're asking of them.

---

## Carried from the workshop guide (by reference — not duplicated)

| Asset | Where it lives | Why it carries |
|---|---|---|
| Emotional safety + golden bridge | [facilitator-guide.md §Emotional Safety](facilitator-guide.md#emotional-safety) | Higher stakes with a real pair |
| Measurement battery (4 deltas) | [facilitator-guide.md §Workshop Metrics](facilitator-guide.md#workshop-metrics-2026-04-02) | These *are* the Phase-4 contrast proof |
| Agreement-substitution delta | [facilitator-guide.md §Agreement Substitution](facilitator-guide.md#agreement-substitution-measurement-2026-04-22) | Core to "no position moved, yet it worked" |
| Dos/Don'ts | [facilitator-guide.md §Dos / §Don'ts](facilitator-guide.md#dos) | Most apply unchanged (steer to real decisions; present points as position not truth; don't bill completed pairs retroactively) |

**Explicitly NOT carried into the program:** the 9-item False Belief Curriculum, the Three-Letter Compressed Session, the Three-Position Pitch Library, and the workshop three-track pricing. Those serve the 1-to-many workshop and the Clarity Experiment *sales* surface (p937), not the facilitated pair session — **with one exception:** the False Belief Curriculum is the Clarity Experiment's **backup diagnostic menu** when the CPA probe resolves clean (see [seed-letter section](#clarity-experiment-variant-one-seed-letter-the-cpa--sealed-solo-answers)).

---

## `[FOUNDER DECISION]` — open

- **Final close language** in Phase 6 (the line that moves a warmed pair to the Clarity Partner Agreement) — placeholder copy above, your call on the exact words.
- **Whether this guide should fold the existing workshop guide into a single "Facilitation" doc** with two formats, or stay as two files (current choice: two files). Say the word and I'll merge + retitle.

---

## Related

- [facilitator-guide.md](facilitator-guide.md) — workshop (1-to-many) facilitation
- [P422: Clarity Partner Agreement](../features/done/21_feb_26/p422_clarity_partner_agreement.md)
- [P937: Webinar funnel + offers](../features/done/2026-06-10/p937_webinar_funnel_landing_and_offers_page.md) — the sales surface this session sits behind
- [definitions.md](definitions.md) — Verification Outcome States (Flip / Fork / Verified disagreement)
- [hypotheses.md](hypotheses.md) — H-TopicDepthGate, H-AgreementSubstitution, H-ForkSoftening
</content>
</invoke>
