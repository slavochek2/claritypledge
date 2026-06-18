# Chiang Mai Cognitive-Science Salon — reusable template + 6-event season

> A recurring, in-person salon (the founder's hobby), bi-weekly **Monday 18:30** at the **Zuzalu
> library, Chiang Mai**. **It's a reading circle, not a lecture series.** Each night centers on
> *someone else's* work — a paper, a book chapter, an idea. The founder gives a short framing of that
> thinker's argument; his own insight enters during the discussion, not from the stage. No CTA — a pure
> salon. ClarityPledge is not *sold* here; it is *practised* — the room adopts it as the house norm for
> the night.
>
> **Working series name:** "Conjecture Night" — `[FOUNDER DECISION]` (alternatives: "Clarity Salon
> Chiang Mai", "Conjectures & Refutations"). The name is the stable title-prefix / series key (same
> convention as the webinar series — see `docs/events/series/`).
>
> This doc is the **template** (Part 1) and the **filled season** (Part 2). To run again, copy Part 1
> and fill a new brief from Part 3's bench. Cognitive science is the home turf, but any text that
> rewards close, honest discussion fits.

---

## Part 1 — The reusable session template

Every session is the same shape. Only the **text, framing, questions, and the one driving question**
change. The fixed open/close keep the room's norm reliable and let the format compound across the
season.

### The core move

The host does **not** present his own thesis. He picks a **text** — a thinker's article, chapter, or
idea — frames it honestly in ~10 minutes (what it claims, why it's worth an evening), then opens 50
minutes of discussion. The host's own view is a *participant's* contribution inside the discussion,
under the same norm as everyone else. The text is the star; the host is the curator and facilitator.

### Format (90 min)

| Time | Block | What happens |
|---|---|---|
| 0:00–0:10 | **Arrive** | People settle. No program yet. |
| 0:10–0:20 | **Adopt the house norm** | The host introduces ClarityPledge in ~2 min and the room *adopts it for the night* (ritual below). This is the only "ClarityPledge moment" — it's a method, not a sale. |
| 0:20–0:30 | **The framing (10 min)** | The host frames the night's **text** — what the thinker actually argues, the one tension that makes it worth chewing on. A faithful setup of *someone else's* idea, not the host's own claim. No slides required. |
| 0:30–1:20 | **Discussion (50 min)** | The prepared questions, run **under the norm**. The host facilitates and contributes his own lens *as a participant* — he doesn't lecture. |
| 1:20–1:30 | **Close** | Thank the room. Announce next date + text. **No CTA.** If — and only if — someone asks, point them to the free app / the Clarity Letter. |

### The house-norm ritual (the open)

State it roughly like this, then get a live consent check:

> "Tonight we run as a clarity community. Two house rules. **One:** if anyone asks you to paraphrase
> what they just said, you give it a genuine try — that's how we catch a misunderstanding before it
> turns into a fake disagreement. **Two:** at any point anyone can ask *'on 0 to 10, how well did
> that land?'* — and a low number is welcome, not embarrassing; it's the most useful thing you can
> say. If you'd rather not take part this way, just raise your hand now — we'll respect it and you're
> still completely welcome to listen and join in." *(pause, scan the room, look for raised hands —
> everyone accepts; proceed.)*

- **Opt-out is by raised hand and is honoured by the whole room** — no one is put on the spot.
- The **0–10 understanding check** and **paraphrase-on-request** are the only two mechanics. Keep it
  that simple (KISS). The point is to *experience* verified understanding, not to run a workshop.
- The norm doubles as a live experiment: several briefs end with a question that turns the instrument
  on the night itself ("where did the clarity norm feel costly tonight?").

### Logistics (per occurrence)

| Field | Value |
|---|---|
| Cadence | Bi-weekly, **Monday 18:30**, Asia/Bangkok (ICT, UTC+7) |
| Duration | 90 min |
| Location | **Zuzalu library, Chiang Mai** `[CONFIRM exact venue string]` — the last in-person AI event in prod used this venue; clone from it (below) to copy the real address. |
| Cost | Free |
| Max attendees | `[FOUNDER DECISION]` — reading circles run best small (a table, ~8–15); set a cap. |
| Recording | Optional. If recording, get verbal consent at the open. |

### Picking the text (how to fill a new brief)

- **Short, always.** The required read is a single ~10–15 min artifact — a magazine/HBR article, one
  short essay, a paper abstract, a 2–3 page summary, or a short video. **Never a full book** as
  required reading; the book is the *idea source*, and goes in "go deeper (optional)" for the curious.
  People should be able to engage having read once, over coffee — and still join cold.
- **It should provoke, not instruct.** Pick something arguable — where a smart room will genuinely
  split — over something merely informative.
- **Cognitive science is home base** (understanding, coordination, bias, language) but anything that
  rewards honest disagreement works. Part 3 is the bench.
- **The host's job is to be faithful to the author first.** Frame what *they* argue; save your own
  take for the discussion floor.

### Publishing each occurrence

No new infrastructure — reuse the existing tooling. **Recommended:** `/publish-event` **clone mode** —
clone the last Zuzalu in-person event so the real venue address and format carry over; change the
title, date, description, then *you* click Create (the skill never publishes). Founder-machine
alternative: `scripts/create-event.ts` (direct prod insert).

- **Title pattern:** `Conjecture Night: <short hook>` — the `Conjecture Night:` prefix is the series key.
- **Seed cadence:** publish in a rolling window (e.g. the next 2–3) rather than all 6 at once, so
  dates stay easy to adjust. Top up as the season runs.
- **Description** = the night's text + the driving question + "what to expect" (read the text, then
  discuss under a clarity norm). The event page is the canonical link; it must stand alone.
- A series-filtered `/events?series=` view (like the webinar's) is **out of scope** — there's no CTA
  or funnel pointing here, so it would be unused. Add later only if a discovery surface needs it.

### Optional add-on — a short Clarity Letter per text (deferred)

Each text could ship a **short Clarity Letter** (one point + anti-point + grounding story) that
attendees file before or after. Tooling exists (`/slava:content:sifter-point`, `/slava:content:story`).
**Recommendation: defer for v1** — start with read + discuss, add letters once the room rhythm is
established. Ask me to draft the six short letters when you want them.

---

## Part 2 — The season (6 texts)

A deliberate arc: the **problem** (1–2) → **how coordination really works** (3) → **the hard cases**
(4–5) → **the deep cut** (6). Each brief = title · date · the text · the host's 10-min framing · the
one question on the table · discussion questions · what to read before. **Every text is a public,
external source** — the night belongs to that thinker, not to the host. The **required read is always a
short piece** (~10 min); the book it comes from is optional, for the curious.

---

### Event 1 — Mon **2026-06-22**, 18:30 ICT
## Conjecture Night: The Curse of Knowledge — Heath & Heath (and Newton's tappers)

**The text.** Chip & Dan Heath, *Made to Stick* — the "Curse of Knowledge" chapter, built on Elizabeth
Newton's 1990 "tappers and listeners" study: tappers of a famous tune predicted listeners would name it
~50% of the time; ~2.5% did. The claim: once you know something, you literally cannot reconstruct not
knowing it — so you overestimate how clear you are.

**Host's 10-min framing.** What Newton's experiment actually measured → how the Heaths generalize it to
the "curse of knowledge" → its cousin, the illusion of transparency (Gilovich, Savitsky & Medvec) → the
unsettling part: the *feeling* of having been clear arrives before any verification. Frame the authors'
case fairly; don't resolve it.

**On the table.** *If the feeling of clarity always shows up before the evidence, can you ever trust it?*

**Discussion questions.**
1. Recall a moment you were *sure* you'd been clear and later found you weren't. What was the first sign?
2. The tappers heard the whole song in their heads. What's the "song in your head" you assume others hear?
3. Does being *close* to someone make you clearer to them — or just more confident you are? (Savitsky: closeness doesn't help.)
4. Do the Heaths overclaim? Is some "curse of knowledge" actually just bad effort, not a real cognitive limit?
5. Where in your life would verifying understanding be most awkward socially — and is that exactly where it matters most?
6. Now that you can name this bias, are you any less subject to it?

**Read before (~15 min).** Gilovich, Savitsky & Medvec (1998), "The Illusion of Transparency: Biased
Assessments of Others' Ability to Read One's Emotional States," *Journal of Personality and Social
Psychology* 75(2):332–346. DOI `10.1037/0022-3514.75.2.332` — Sci-Hub it. Read abstract + intro +
Study 1 (~5 pp); the tapper story is in there directly. *Go deeper (optional):* Heath & Heath, *Made
to Stick*, "Curse of Knowledge" chapter (same phenomena, different framing).

---

### Event 2 — Mon **2026-07-06**, 18:30 ICT
## Conjecture Night: Listening Before Evaluating — Carl Rogers

**The text.** Carl Rogers, "Communication: Its Blocking and Its Facilitation" (1951). The claim: our
first reaction to any statement is to *evaluate* it — agree/disagree — and that the rare discipline of
restating the other's view to *their* satisfaction, before responding, is what actually unblocks
communication. (Rogers' "active listening" originates here.)

**Host's 10-min framing.** Rogers' core move (the evaluative reflex vs. the understanding response) →
his proposed cure (you may speak only after you've restated the prior speaker's view to their
satisfaction) → connect it, in the discussion, to a distinction worth testing: *understanding the
reasoning*, *feeling the resonance*, and *agreeing with the conclusion* are three different things we
hide under one word. Present Rogers faithfully; bring the three-kinds lens as a participant.

**On the table.** *Can you genuinely understand a view you find repugnant — and should that be the bar?*

**Discussion questions.**
1. Rogers says we evaluate before we understand. Catch yourself doing it — what triggers the reflex hardest?
2. His rule: restate the other view to *their* satisfaction before you reply. When did you last actually pass that test?
3. When someone says "I understand," do they mean *your reasoning*, *your feeling*, or *I agree*? Does the slippage cause fights?
4. Is Rogers' method always honest, or can "I'm just reflecting what you said" become a tactic?
5. Take a recent argument — was it a meaning-gap dressed as disagreement, or a genuine clash of values?
6. If only understanding-the-reasoning can be verified, are the other two just hope?

**Read before (~5 min).** Gilovich & Savitsky (1999), "The Spotlight Effect and the Illusion of
Transparency: Accidental Virtues of Self-Consciousness," *Current Directions in Psychological Science*
8(6):165–168. DOI `10.1111/1467-8721.00039` — Sci-Hub it. 4 pages; a concise bridge from Event 1's
illusion-of-transparency into *why we evaluate before we understand*. *Go deeper (optional):* Rogers &
Roethlisberger, "Barriers and Gateways to Communication," *HBR* 1952 — on Scribd (free login).

---

### Event 3 — Mon **2026-07-20**, 18:30 ICT
## Conjecture Night: Focal Points — Thomas Schelling

**The text.** Thomas Schelling, *The Strategy of Conflict* — the tacit-coordination chapter. The famous
puzzle: you must meet a stranger in your city tomorrow, no way to communicate where or when. People
converge far more than chance allows, on a "focal point." The deeper idea: coordination often runs on
what we believe *everyone believes everyone believes* — common knowledge, not private agreement.

**Host's 10-min framing.** Schelling's focal points → the ladder of "I know that you know that I know"
(Lewis, Aumann in the background) → the emperor's-new-clothes structure (everyone sees, no one says) →
seed for discussion: a *false* sense of common ground may spread cheaper than the verified kind. Frame
Schelling; bring the rate-asymmetry idea as a participant.

**On the table.** *Where is your team stalled — not because you disagree, but because no one made the agreement common?*

**Discussion questions.**
1. Schelling's meeting puzzle: where and when do *you* go in your city — and why does a focal point exist at all?
2. Where on your team is everyone waiting for everyone else, each assuming the others already agree?
3. Is a focal point real shared knowledge, or just a lucky guess about other people's guesses?
4. Why might a false shared belief spread faster than a verified one? What's the friction difference?
5. What tips a room into "everyone knows that everyone knows" — and can you engineer it on purpose?
6. Is public verification (saying it together) genuinely different from private agreement, or just slower?

**Read before (~10 min).** A short explainer of Schelling / focal points built around the meeting-place
puzzle (a 2–3 page summary or the "focal point" overview). *Go deeper (optional):* the tacit-coordination
chapter of *The Strategy of Conflict*; Aumann (1976), "Agreeing to Disagree" (technical).

---

### Event 4 — Mon **2026-08-03**, 18:30 ICT
## Conjecture Night: The Logic of Indirect Speech — Pinker, Nowak & Lee

> A self-critique night: the text argues *against* the house norm. Steelman the other side.

**The text.** Pinker, Nowak & Lee (2008), "The Logic of Indirect Speech," *PNAS*. Why do we say "Is
there any way to take care of the ticket here, officer?" instead of offering the bribe plainly? Their
answer: indirectness preserves a *plausible-deniability equilibrium* — making things explicit can
destroy relationships, face, and options that the vagueness was protecting.

**Host's 10-min framing.** Pinker's veiled-speech examples → face-saving equilibria → the reversibility
cost of naming a relationship out loud → the real point for tonight: you can be fully *able* to verify
understanding and still rightly *choose* ambiguity. Then turn the instrument on ourselves. Present
Pinker's case at full strength — it's the strongest argument against the house norm.

**On the table.** *If clarity is sometimes the harmful move, what's your rule for when NOT to verify?*

**Discussion questions.**
1. Pinker's case: why don't we just offer the officer the bribe plainly? What is the indirectness *buying*?
2. When has staying vague genuinely *protected* something real for you?
3. Does explicitness help more in one-off transactions or long-term relationships — and why might it flip?
4. Can "paraphrase what I just said" ever be a power move? How would it feel coming from your boss?
5. Where does Pinker's argument break — when is "strategic ambiguity" just cowardice with a theory?
6. We've run on a clarity norm all night. Where did it feel costly, intrusive, or unwelcome?

**Watch/read before (~11 min).** Pinker's RSA Animate talk "Language as a Window into Human Nature"
(~11 min video) — the indirect-speech section. *Go deeper (optional):* Pinker, Nowak & Lee (2008),
"The Logic of Indirect Speech," *PNAS* (abstract + intro).

---

### Event 5 — Mon **2026-08-17**, 18:30 ICT
## Conjecture Night: Pluralistic Ignorance — Miller & McFarland

**The text.** Miller & McFarland (1987) and the broader work on *pluralistic ignorance*: in a room
where no one asks the question, each person concludes they're the only one who didn't get it — and
privately braces for a judgment that almost no one is actually making. The fear is real; the threat is
mostly imagined, and self-sealing.

**Host's 10-min framing.** The classic finding (students who don't understand stay silent, each
assuming everyone else gets it) → recursive pluralistic ignorance → Kruglanski's need for cognitive
closure (we "seize and freeze" on the first answer) in the background → why the belief survives: the
fear blocks the very test ("how well did that land?") that would disprove it. Frame the researchers'
finding; bring the one-sentence fix as a participant.

**On the table.** *What would make saying "I'm at a 4" high-status instead of humiliating?*

**Discussion questions.**
1. When did you last pretend to follow something rather than ask? What did the pretending cost you?
2. Miller & McFarland found the fear is near-universal and near-groundless. Does naming that actually dissolve it?
3. Be honest: do *you* judge people who admit they didn't understand? Then why assume they judge you?
4. Is the urge to "have an answer now" a personality trait or a situational pressure? When is it worst?
5. What would actually lower the social cost of admitting a low number — and can a group make it high-status?
6. We made the 0–10 check a norm tonight. Did it get easier as the evening went on?

**Read before (~10 min).** Schroeder & Prentice (1998), "Exposing Pluralistic Ignorance to Reduce
Alcohol Use Among College Students," *Journal of Applied Social Psychology* — free PDF hosted by
Stanford SPARQ: [sparq.stanford.edu](https://sparq.stanford.edu/sites/g/files/sbiybj19021/files/media/file/schroeder_prentice_1998_-_exposing_pluralistic_ignorance.pdf).
Read the intro + Study 1 (~5 pp); the classroom-silence pattern is laid out clearly. *Go deeper
(optional):* Kruglanski & Webster (1996) on the need for cognitive closure (DOI `10.1037/0033-295X.103.2.263`, Sci-Hub).

---

### Event 6 — Mon **2026-08-31**, 18:30 ICT
## Conjecture Night: Conjectures and Refutations — Karl Popper

> Capstone. Ties the season together.

**The text.** Karl Popper, *Conjectures and Refutations* — the title essay. Knowledge grows not by
proving theories but by *refuting* them; a claim earns scientific status only if it could be shown
wrong. Read alongside Rapoport's rules (via Dennett): before you criticise, restate the other view so
well they'd adopt your phrasing.

**Host's 10-min framing.** Popper's conjecture-and-refutation → the demarcation criterion (falsifiability)
→ pair it with Rapoport/Dennett's steelman → the gap to test in discussion: falsification has no step
that checks you *understood* the thing you're refuting. Present Popper and Dennett faithfully; offer the
"missing precondition" as a conjecture for the room to attack.

**On the table.** *If you "refute" someone but never verified you understood them — what did you actually refute?*

**Discussion questions.**
1. Popper: a claim is scientific only if it *could* be proven wrong. What belief of your own could be?
2. Rapoport's rule: restate the other view so well they say "I wish I'd put it that way." When did you last do that?
3. Does adding a comprehension step to falsification weaken it (more friction) or strengthen it (fewer false refutations)?
4. A refutation that *surprises* you: is that a win, or a flag that you're talking past each other?
5. Is Popper's whole picture too tidy — does real understanding ever advance by something other than refutation?
6. Across the six nights — which text survived your scrutiny, and which one flipped you?

**Read before (~10 min).** Dennett's "Rapoport's rules" — the ~2-page excerpt from *Intuition Pumps*
that circulates standalone — plus a one-page summary of Popper's falsifiability. *Go deeper (optional):*
Popper's full title essay in *Conjectures and Refutations*.

---

## Part 3 — Text bench (swap in / extend past 6)

Candidate texts and the thinker each centers on, ready to fill into the Part 1 template. (Anchor a
ClarityPledge concept to a primary source the same way Part 2 does.)

| Text / thinker | The question it puts on the table | ClarityPledge thread |
|---|---|---|
| **Buber, *I and Thou*** | Is there a kind of understanding that explicitness destroys rather than reveals? | Emotional vs cognitive understanding (A13) |
| **Kahneman, *Thinking, Fast and Slow*** (WYSIATI) | Do we mistake "the story I can tell" for "what's true"? | "I communicate fine" as an unverified belief (A10) |
| **Festinger, cognitive dissonance** | Do we resolve dissonance by understanding the other side, or by not? | Why we avoid the comprehension step (A14) |
| **Arendt, *Eichmann in Jerusalem*** (thoughtlessness) | Is the failure to think *from another's standpoint* a moral failure? | Mentalizing and leadership (A25) |
| **Locke, *Second Treatise*** (consent) | Is consent without comprehension just theatre? | Comprehension as the basis of legitimacy (A12) |
| **Byron Katie, *Loving What Is* / CBT** | "Is it true?" verifies a thought against reality — but never against the *other view*. Is that a gap? | Does inquiry need a second-person step? (A14) |
| **Frankl, *Man's Search for Meaning*** | Is private meaning that can't cross indistinguishable from loneliness? | Why being misunderstood hurts (A13) |

---

## Open decisions

- `[FOUNDER DECISION]` Series name (working title "Conjecture Night").
- `[FOUNDER DECISION]` Attendee cap.
- `[CONFIRM]` Exact Zuzalu library venue string (clone from the last in-person event to copy it).
- **The texts themselves:** I picked one external work per night (Heath/Newton, Rogers, Schelling,
  Pinker, Miller & McFarland, Popper). Swap any for a book you'd rather host — Part 3 is the bench.
- **Pre-reading links:** cited by author + title rather than inventing URLs; drop in the actual links
  (or a PDF) when you publish each event page.
- **Clarity Letters:** deferred for v1 — say the word and I'll draft six short ones (point · anti-point · story).
