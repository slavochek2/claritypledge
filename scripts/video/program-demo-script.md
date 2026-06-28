# Co-Founder Program demo — `/program` walkthrough script

**Purpose:** ~2:30 synthetic-video script for the **3-week co-founder program** demo (P973).
Proves the program is *real* by showing the actual product screens participants use, not
loose talk. Feeds the synthetic CREATE lane: each `CAPTURE` line is what Playwright records;
each `VO` line is what `kiss-narrate.mjs` speaks (Jessica voice).

## Program vs. platform — get this right

- **The PROGRAM** (what this video sells) = the **educational 3-week** offering. It is what
  `/program` shows. Route `/program` → `OffersPage` → `ProgramTimelineSection` (Week 1/2/3)
  + pricing (app free forever; coached program €950/pair, money-back guarantee) + FAQ.
  Source of truth for week copy: `src/app/components/landing/program-timeline-section.tsx`.
- **The PLATFORM** = the five-moves method (`HowPlatformWorks`, on `/` and `/coach`): increase
  the will · improve the skill · align expectations · decrease friction · prevent pitfalls.
  This is the *tool*, not the program. The program is delivered **on** the platform — so the
  demo narrates the **weeks**, and shows the **platform screens** as what participants do.

**Spine = the 3 weeks** (verbatim program copy below). Program chips: **3 weeks, live · ~7
hours · a cohort of 5 pairs.**

Real screens each week (routes in `src/App.tsx`):

| Week | What participants do on screen | Route(s) |
|------|--------------------------------|----------|
| 1 | file a Clarity Letter → join a live Experiment → exchange written responses | `/letter/:id/compose`→`/preview` · live · `/letter/:id/results` **[BLOCKED P904+P948]** |
| 2 | run live 1-on-1 Clarity sessions → see listening calibration → session history | `/live` · `/me/calibration` · `/sessions` |
| 3 | write a Clarity Partner Agreement **with terms** → leave holding it | `/agreements/new/create` → `/agreements/:id` |

**Capturable now:** intro, Week 1 (filing + live), Week 2 (all), Week 3 (all), outro.
**Blocked on P904 + P948:** Week 1's response-exchange beat (marked `[BLOCKED]`).

**Targets:** ~340–360 spoken words ≈ 2:20–2:30 at ~150 wpm. Five segments.

---

## Segment 0 — Cold open (capturable now)

**CAPTURE:** `/program` hero — "What the co-founder program is about" with the three chips
(3 weeks, live · ~7 hours · a cohort of 5 pairs). Gentle zoom-in.

**VO:**
> Most co-founder conflict isn't a values clash. It's two people who think they understand
> each other — and don't. This is a three-week coached program, run live, that gets you from
> assuming to actually verifying. Here's what the three weeks look like, on the real product.

`[FOUNDER DECISION: cold-open hook]` — confirm the "assuming vs. verifying" framing.

---

## Segment 1 — Week 1: File a Clarity Letter + the live Experiment

> **Program copy (verbatim):** "File your first Clarity Letter and join a live Clarity
> Experiment where we answer all your questions. Then write a response to the letter you
> receive, and exchange them before you meet — so you start from a written, shared baseline
> instead of assumptions."

**CAPTURE:** **Clarity Letter creation** — `/letter/:id/compose` composing a letter, then
`/letter/:id/preview`. (Reuse e2e selectors for the filing path.)

**VO:**
> Week one. You file your first Clarity Letter — you put what you actually mean in writing,
> before the conversation. Then you join a live Clarity Experiment, where we answer every
> question in real time. You start from a written, shared baseline instead of assumptions.

**[BLOCKED — P904 + P948]:** the response-exchange beat. Add this CAPTURE
(`/letter/:id/results`) + VO once async verification (P904) and the response letter (P948) ship:
> …and you each write a response to the letter you received, exchanging them before you meet —
> so the first real conversation starts from two written positions, not a blank page.

---

## Segment 2 — Week 2: Live 1-on-1 sessions + listening calibration + history

> **Program copy (verbatim):** "Meet 5 other participants 1-on-1 and run Clarity sessions
> live. You leave with your listening calibration measured — you know whether you're over- or
> under-confident about how well you actually understand each other."

**CAPTURE:** three real screens in sequence — a live Clarity session (`/live` → `/live/:code`),
the **listening-calibration** read-out (`/me/calibration`), then **session history** (`/sessions`).

**VO:**
> Week two is where it gets measurable. You meet five other participants one-on-one and run
> live Clarity sessions. You leave with your listening calibration measured — a number that
> tells you whether you're over-confident or under-confident about how well you actually
> understand each other. Every session is logged, so you watch that number move instead of
> guessing.

`[FOUNDER DECISION: calibration claim]` — verify the over-/under-confident read-out against
what `/me/calibration` actually displays before narrating it as fact.

---

## Segment 3 — Week 3: The Clarity Partner Agreement (with terms)

> **Program copy (verbatim):** "A discussion and final live Q&A, with guidance on your own
> Clarity Partner Agreement — so you leave with an agreement you'll actually use."

**CAPTURE:** the agreement flow — `/agreements/new/create` building the agreement and showing
the actual **terms**, then the signed certificate (`/agreements/:id` / `AgreementCertificate`).

**VO:**
> Week three. A discussion, a final live Q&A, and guidance on writing your own Clarity Partner
> Agreement — real terms you both sign, not a vague promise to communicate better. You leave
> holding an agreement you'll actually reopen when it's hard.

---

## Segment 4 — Close: what you walk away with + CTA (capturable now)

**CAPTURE:** quick montage — filed letter (`/letter/:id`) → calibration number
(`/me/calibration`) → signed agreement (`/agreements/:id`); then the `/program` pricing/CTA
region (app free forever; program €950/pair, money-back guarantee).

**VO:**
> Three weeks. Around seven hours, live, in a cohort of five pairs. You walk away with three
> things you can point to: a written baseline, a calibration number, and an agreement you'll
> keep using. The app is free forever. The coached program is where you actually do the work —
> come see where your calibration really sits.

`[FOUNDER DECISION: closing CTA line + exact button copy + whether to state €950 on screen]`
— do not ship invented CTA wording; confirm.

---

## Production notes

- **Spine is the PROGRAM (3 weeks)**, not the platform's five moves. The five moves are the
  platform method (`/`, `/coach`); the program is delivered on the platform, so the demo shows
  platform screens *inside* the week structure. Week copy is verbatim from
  `program-timeline-section.tsx` — do not paraphrase the on-screen claims.
- **Capturable now:** segments 0, 1 (filing+live), 2, 3, 4. **Blocked:** Week 1's
  response-exchange beat (P904 + P948).
- **Modular** (P973): each `CAPTURE`/`VO` pair is a standalone clip; the blocked beat drops in
  later without re-recording the rest.
- **Voice:** narrate each VO block separately via `kiss-narrate.mjs` (Jessica default), then
  `kiss-compose.sh` per segment; concat at the end.
- **Founder decisions unresolved** (3): cold-open hook, calibration claim (also needs screen
  verification), closing CTA. The pipeline can render a placeholder cut with draft lines; the
  published video must use founder-confirmed wording.
