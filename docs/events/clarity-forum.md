# Clarity Forum — documented open-forum practice

> A recurring, in-person, **documented** event at the **Zuzalu library, Chiang Mai**, Monday 18:30.
> Distinct from the no-CTA reading-circle salon ([chiang-mai-cognitive-science-salon.md](chiang-mai-cognitive-science-salon.md)).
> **Community-first; documented so the practice can spread.** The audience brings provocative topics, the
> room argues, and a panel demonstrates the **Min Principle as a game rule** on camera. The recording is
> documentation of a real practice, **not a performance for an audience.** Success is measured by
> **bracelets carried in the wild** — people practising the verify-before-you-disagree habit outside the room.

**Series name: Clarity Forum** (decided 2026-06-26 — "Forum" signals participation, not spectacle;
"Show" would invite performing for the camera, the authenticity risk the red-team flagged). Stable
title-prefix / series key (same convention as `docs/events/series/`). The **title is a fixed tagline
naming the format, not the week's topic** — the room proposes and votes on the night (see Topic Gate), so
no single topic can be promised in advance. Full title: *"Clarity Forum: a social experiment of radical
psychological safety."* Candidate topics appear in the description as examples.

---

## The goal (this is a lab)

The recurring event is Slava's **lab for making the Min Principle more teachable, more viral, more
valuable.** Three jobs, in order:

1. **Build community** that commits to the Min Principle (measured by bracelets carried outside the room).
2. **Experiment** on what makes the principle teachable/viral (each session tests a variation).
3. **Produce content** — every session is recorded and yields at least one postable artifact.

---

## The core mechanic — adopt the Clarity Agreement, add one gate

**Don't reinvent the protocol — it already exists.** The understanding mechanic is the **Clarity
Agreement** (the bilateral Clarity Partner Agreement / CPA, the same first-person oath rendered
unilaterally as the Clarity Pledge). Canonical source of truth:
[`src/app/content/verified-understanding-oath.ts`](../../src/app/content/verified-understanding-oath.ts)
(v5) — edit there, not here.

The forum **offers the CPA at community scale** — anyone who accepts it puts on a bracelet and is "in
the game" (bound by the Agreement) for as long as they wear it. Same text as the CPA, no change. Whoever
is in the game has accepted this:

> **YOUR RIGHT** — When we speak, please feel free to ask how well I assume I cognitively understand the
> intended meaning behind what you say.
>
> **MY PROMISE** — I'll give you an honest number, from 0 (not at all) to 10 (I assume I fully
> understand you). At any time you can give me your own number, for how much you assume I cognitively
> understand you. If I explain back what I understood, without judging or criticizing, you can tell me
> what I missed, and ask me to explain it back again. **I'll accept the lower of our two numbers** as my
> verified understanding of your intended meaning.
>
> **THE EXCEPTION** — If I can't give you an honest number in the moment, I'll explain why.

Everything I earlier "designed" is already in this text: ask the number → give an honest 0–10 → both
hold a number → explain back without judging → "what did I miss" → explain again → **accept the lower of
the two (the min)** as verified understanding. The anti-gaming properties fall out of the oath itself:
you can't self-unlock by rating high (the *other's* number also binds via the min), and "what did I
miss / explain it back again" is the built-in repair.

**The forum's only addition — the game layer:** you may not *press a disagreement* until verified
understanding (the min) is **above 7**. That single threshold is all the forum adds on top of the
Agreement; the rest *is* the Agreement. The viral sentence: *"you can't disagree until you're both past
seven."*

**Demonstrate it at the very start.** Before any topic, the host runs one quick live round of the
Agreement with a volunteer — ask the number, get a low one, explain back, "what did I miss," re-explain,
accept the lower number — so the room *sees* it. People can't run an agreement they've only heard
described.

---

## The Topic Gate (what gets on the marketplace)

Open Space Technology ("unconference"): topics come from the room, posted on **the marketplace** wall.
A topic only qualifies if the proposer can argue it hits **all three**:

1. **Care** — this Chiang Mai / Zuzalu crowd has skin in it.
2. **Disagree** — real spread in the room.
3. **Fuzzy / complex** — the key terms are slippery, not crisp. *(This replaces "has a hidden gap" —
   meaning gaps are universal, so that filtered nothing; fuzziness predicts how productive the verify
   step will be.)*

Guardrail: provocative **and** fuzzy. A provocative-but-crisp topic baits a values fight the protocol
can't dissolve — heat with no reveal.

Examples that pass: *What does "freedom" actually buy you? · How much is "enough"? · Network states:
building the future or exiting responsibility? · Will AI take the meaning out of work? · What makes a
relationship "real"?*

---

## Session shape (90 min, recorded)

Realistic round budget: each discussion round runs ~10 min. That sets the constraint — everything else must compress to fit.

| Time | Block | Notes |
|---|---|---|
| 0:00–0:03 | **Welcome + agenda** | One sentence on what the Forum is. Name the blocks ahead. Nothing else — no tease, no report-back here. (Report-back from bracelet-carriers, if any, lands at close — 1–2 people, 30 sec each.) |
| 0:03–0:08 | **Topic pick — noise vote** | Host calls out: *"Who has a topic?"* Whole room noise-votes for who gets up. Top 3 loudest → each pitches their topic in 30–60 sec. Noise vote again — one winner. Host sanity-checks against the Topic Gate (care / disagree / fuzzy) — if it fails, runner-up moves up. |
| 0:08–0:18 | **Round 1 — whole room, free** | No gate. Let it get heated / tangled. Host scouts the sharpest opposing pair here. |
| 0:18–0:28 | **Round 2 — panel, no gate (ON CAMERA)** | Sharpest opposing voices on stage. Argue freely. The "before." Don't pre-brief them on R3. |
| 0:28–0:33 | **Demo the gate** | Room just felt the problem live. Now the solution: host runs one round with a volunteer — ask the number, get a low one, paraphrase back, "what did I miss," re-score. 5 min, then straight into R3. |
| 0:33–0:50 | **Round 3 — same panel, gate ON (ON CAMERA)** | **Entry condition: every panelist accepts the CPA and puts on a bracelet.** Run the gate on their real disagreement. Climax = **host names the crux** ("you agree on X; the real fight is Y"). **Fail rule:** refusing to paraphrase → swapped, framed as "fresh voice in." |
| 0:50–0:56 | **Coda — panel reflects (gate off)** | Panel still on stage. Panelists narrate what changed. Their testimonial sells harder than the host's. |
| 0:56–1:03 | **Everyone pairs — try the gate once** *(optional)* | **Read the room after coda.** If the room is already hot (side debates starting, people pairing up naturally) — skip it, that energy is already doing the work. If the room is passive / watching-only — run it: panel dissolves, everyone pairs, one paraphrase-then-score loop on a real small disagreement. The one in-room rep that makes "a habit you've done" feel different from "a thing you watched." |
| 1:03–1:10 | **Debrief + close** | Name the Min Principle. Anyone who wants a bracelet takes one (= accept CPA, in the game, wear it in the wild). No ceremony. Tease next week's topic if known. |

---

## Why single-topic + panel (not multiple circles)

- Multiple topics fragment the room — bad audio, bad camera, and the host can't guard the gate in
  rooms he isn't in. The gate is the experiment; it can't be outsourced yet.
- Content needs **one narrative arc**: one before/after, one clip with a beginning, middle, end.
- The panel only works with one topic — it's the recordable centerpiece.

**Resolved (was an open trade-off):** the panel demonstrates; then **everyone pairs and runs the gate
once** (0:53–0:59) so every attendee gets one real rep, not just the panel. Community is goal #1 —
watching ≠ practising — and a rep before the bracelet offer means people consider a habit they've
actually done, not just seen. Cost: Round 1 capped to ~6 min (worth doing anyway).

---

## The bracelet — "in the game" token + North Star metric

- **The bracelet means: I accept the CPA and am in the game right now.** Wearing it = bound by the
  Agreement (give honest numbers, explain back, accept the min). No bracelet = not in the game, not
  bound. It is a live state, not a one-time ceremony — and **not** the Clarity Pledge (that's a separate
  unilateral, public artifact; don't conflate).
- **Panel entry condition:** to go on the panel for the gated **Round 3**, *all* panelists must accept
  the CPA and therefore wear the bracelet. The >7 gate only governs people who are in the game. No
  bracelet → not eligible for the gated round.
- **An offer, not a ceremony.** The host offers the bracelet (= accept the CPA, join the game); take it
  or leave it. No public loyalty oath, so no in-group/out-group sorting (the red-team risk).
- **Signals an invitation:** a stranger asking "what's the bracelet?" *is* the viral loop.
- **North Star = bracelets worn in the wild** — people still in the game (accepting the CPA) in daily
  life, outside the room. Measure weekly: (1) bracelets taken; (2) — the better signal — people who
  **report a specific, checkable outside use** (who, what disagreement, what happened). A bracelet never
  worn outside is a vanity metric.
- **Dinner perk:** `[FOUNDER DECISION]` — dinners for bracelet-wearers (in-the-game) only, or open to
  all attendees? In-the-game-only builds retention but re-introduces an in-group line; open builds
  community but loses the incentive. Your call.

---

## Episode title + description pattern

- **Title:** `Clarity Forum: a social experiment of radical psychological safety` — fixed every week, names the format not the topic (the room votes on the night — no topic can be promised honestly).
- **Description:** surface **2 more candidate topics**, then: *"Bring your own — we vote on the night."*
  Honest Open Space, signals agency, and keeps the listing fresh every week.

---

## Recording / consent

- Consent collected **at the door**; a no-camera zone for opt-outs.
- Consenters **retain veto** — if a featured person doesn't consent to publish, that segment isn't published.
- **Panelists explicitly opt in** to being filmed before going on stage.

---

## Failure modes + the fixes already built in (post-adversarial-review)

Resolved in this version:
1. **Number gamed** (inflate-to-unlock / heckler's veto) → handled by the Clarity Agreement itself:
   `min(both numbers)` binds (can't self-unlock by rating high — the *other's* number also counts), and
   "tell me what I missed, and ask me to explain it back again" is the built-in repair for a low number.
   No new mechanic needed.
2. **Non-reveal anticlimax** (the base case for fuzzy topics) → climax reframed to *naming the crux*, not
   dissolving the disagreement. A clarified disagreement is a win.
3. **Fail rule inverted the principle** (penalised reaching understanding) → fail = *refusing to
   paraphrase* (a behaviour, not an outcome); swap framed as "fresh voice in," never as failure.
4. **Room watches, never reps** → everyone-pairs block added before the close.
5. **Bracelet as in-group oath** → offer not pledge; checkable outside-use as the real metric.

Still to operationalise (high-confidence, not yet scheduled):
- **Dedicated second person** every week for camera + consent + timekeeping — the host is otherwise a
  six-role single point of failure, and gate-enforcement is the first thing dropped when overloaded.
- **Consent ledger + publication opt-in.** Footage is one continuous before/after, so one panelist's
  veto kills the whole episode — get *publication* opt-in (not just filming) before Round 2, allow veto
  *after seeing the cut*, and have one named person hold a name→segment→consent record.
- **B-arc insurance:** always capture a strong room moment + a fallback 60-sec gate explainer, so a
  veto or a non-reveal night still yields a postable artifact.
- **Quorum floor + fallback:** below ~10 people, drop the panel and run one whole-room gated
  conversation with tight framing; decide at 18:25 from a headcount.

Still `[FOUNDER DECISION]`: identity tiers (voice-only/avatar panel for privacy-conscious attendees),
dinner-perk eligibility.

---

## Publishable event description (copy-ready)

> Use this verbatim for Luma, Facebook Events, or any listing. The title is a **fixed series tagline** — it names the *format*, not a topic, because the room proposes and votes on the night, so no single topic can be promised honestly. Candidate topics live in the body as **examples**. This reads with conviction without overclaiming — fitting for a series about integrity. The full `Clarity Forum: a social experiment of radical psychological safety` is the stable series key — don't swap it per week.

---

**Clarity Forum: an experiment in radical psychological safety with strangers**

Free · In person · Zuzalu library, Chiang Mai · Mondays 18:30 · ~90 min

Pick a topic you actually care about. Argue it with someone who disagrees. Then turn on one rule that most arguments never get: you can't push your point until the other person verifies that you have accurately grasped their intended meaning.

Join the clarity experiment. How far can a room of strangers can go toward real honesty, not on good intentions, but because one simple protocol makes it safe?

**Why honesty is hard, and what fixes it**

We soften, hedge, and hold back because we expect to be misunderstood. But once you know the gap is always bridgeable, that you can check how your words landed and correct them, telling the truth gets easier. The aim isn't to agree, or even to disagree more politely. It's to make sure you're disagreeing about the same thing, not two different versions of it.

**What you walk away with**

- A real conversation about something that matters to you.
- A portable active listening skill you can use the next day with a partner, friend, or customer: verifying what someone actually meant before you respond. It's what the best negotiators, sales people, psychotherapists spend years learning, and what defuses a fight, deepens a friendship, and closes a deal.
- The rarest move of all, made easier: admitting when you're wrong, which is exactly what makes people trust you.

**How the evening runs**

- Anyone proposes a topic; the room picks one by sheer enthusiasm. Best topics have a fuzzy word at their core and people who genuinely disagree. For example: is honesty always right, does wealth corrupt, is morality invented, what we owe strangers, free will, monogamy. Anything across psychology, philosophy, economics, religion, societal or social issues, or relationships works.
- We split into small mixed-side groups and debate freely.
- The sharpest opposing voices argue it on a panel, first with no rules, so you feel the problem.
- The host introduces the [clarity partner agreement](https://claritypledge.com/partner-template) and the panel argues the *same* disagreement again, now with one rule: when the verified understanding score is below 7, you can't push further. You explain back first and earn a higher number.
- We close by reflecting on how the experiment went.

**Builders and entrepreneurs welcome.** Want to pitch your project at the end? Go ahead. We recommend 1 minute per pitch with 3 minutes of Q&A.

Panel discussions are recorded and published on YouTube. We can record your pitch and send you the video too. You can opt out of recording anytime.
