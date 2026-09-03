---
status: all-done
type: task
rank: 1000066
workstream: content
created_date: '2026-09-01'
tags: [presi, deck, positioning, wedge]
pipeline_ran: [create-spec, inline, ship]
drafted_by: fable
exec_model: fable
exec_effort: high
completed_at: 2026-09-03
---

# P1218: Refresh /presi to the current wedge (prevent rework before work begins)

## Problem

`/presi` still tells the **cofounder-split** story ("I've lost business partners. I help you keep yours.", "65% of startup failures stem from co-founder conflict", "How does the illusion lead to a *partner split*?", CTA "Join a founding cohort of co-founders"). The active wedge since the 2026-07-20 flip is **a growing seed–A team that keeps building the wrong thing because they never verify they understood each other before agreeing or disagreeing** — re-stated 2026-08-10 as **prevent rework before work begins** ([lean-canvas.md](../../../docs/lean-canvas.md) §Customer Segments → Active focus; [hypotheses.md](../../../docs/hypotheses.md) H-BuildRightThing; [decisions.md](../../../docs/decisions.md) 2026-07-20 + 2026-08-10 [product]). The shipped landing (`/`, `build-right-thing-landing.tsx`) already carries the current copy; the deck contradicts it. Slide order is also the June-15 "Monday talk" order, with a stale event title slide (4Seas, 15 June) at position 2.

## Appetite

One session, deck-only. No new binaries, no new pages, no product code. Copy is quoted from the docs/landing wherever one exists; every sentence I had to author is marked `[FOUNDER DECISION: …]` in the slide and listed below.

## Solution

1. `/presi` is the live deck (see Audit → "presi vs presi2"). `/presi2` is left untouched.
2. Reorder into an event arc: **hook/pain → who it's for → mechanism → demo → evidence → ask**; backing slides stay after the closer.
3. Rewrite/remove cofounder-era slides; port the landing's current hero, stakes stat, "what your teammate didn't say" seam, five moves, and the Clarity Group Terms artifact.
4. Speaker notes as `<!-- NOTES … -->` comment per slide (deck has no notes mechanism; adding a UI is out of scope). Nav counter + keyboard already work (content-keyed, not index-keyed — safe to reorder).

## Risks / Non-Goals

- ACCEPT — QR on the old title slide pointed at a retired event URL; removed rather than regenerated (no QR library in the deck; no binaries added).
- RESOLVED 2026-09-03 — "Clarity Principle" is kept (attested: `src/app/content/full-article.md` §VI; `how-platform-works.tsx` move 2, "a minimum clarity principle"). "Clarity Champions" is a real shipped offer level (`offers-section.tsx`, P1087) but is no longer named on the qualify slide: the deck's single ask is the free alignment audit, and naming an unexplained program before a different ask is what broke the arc.
- NON-GOAL — `/presi2`, the Chiang Mai event slides' content, the GSAP motion layer, mobile layout beyond not regressing.
- NON-GOAL — new numbers, testimonials, pricing. None added.

## Done-When

- [x] Slide audit table below filled for every slide of `/presi`.
- [x] No slide in the main arc frames the problem as a cofounder split; the arc opens on the landing's hero copy.
- [x] Every authored sentence was wrapped in a `[FOUNDER DECISION]` marker and listed under "Founder decisions" below — **and every marker is now resolved and deleted**: `grep -c "FOUNDER DECISION" public/presi/index.html` → 0 (was 13).
- [x] Every slide has a `<!-- NOTES` block with 2–4 bullets.
- [x] Keyboard nav + counter verified in a headless browser; every slide screenshotted at 1920×1080; zero console errors.
- [x] `./scripts/pre-commit-checks.sh` passes (run at commit time).
- [x] Deck is usable at a live event: a stranger learns what the product is on slide 1 (identity line) before the severity stat on slide 2, and the closing slide carries a concrete next step (audit URL as a button + the 15-min disclosure).
- [x] No render regression from the round-3 edits — see Evidence (round 3).

## Audit

### presi vs presi2

`public/presi2/` was created in one commit (`c46caa18`, 2026-06-13) as the "[AI] Chiang Mai" audience variant (AI-orchestration quadrant, "How well do your AI understand your business model?", gaslight thread) and never touched again. `public/presi/` received 14 further commits through 2026-08-24 (influences cloud, closers, prior-art, qualify, scope matrix) and absorbed presi2's reusable slides (Dalio, gaslight, montage). **`/presi` is the live deck.** `/presi2` is a frozen June draft for a different room; not edited.

### Slide-by-slide (order as of `9070bf0f`)

| # | Current title / claim | Status | Superseded by |
|---|---|---|---|
| 1 | "I've lost business partners. I help you keep yours." · €100k–€1M split | OUTDATED-cofounder | landing hero (P1004 locked copy) |
| 2 | Title/QR — "Monday 15th · 4Seas … register" | OUTDATED-other (stale event) | removed |
| 3 | Credibility — raised €398k, 6y SaaS, closed down | KEEP | — |
| 4 | Fundraising loop — €398k without PMF | KEEP (evidence) | — |
| 5 | Listening calibration gauge | KEEP (mechanism) | — |
| 6 | 65% of startup failures = co-founder conflict | OUTDATED-cofounder | CB Insights "no market need" stat (landing ref 1) |
| 7 | Loss montage "I have lost business partners" | KEEP, reframed headline | lean-canvas §Problem "weeks lost, work thrown away" |
| 8 | Dalio exchange | KEEP (evidence) | — |
| 9 | Everybody assumes (8/10, 5/10, 6/10) | CURRENT | landing reuses as-is |
| 10 | Why almost nobody verifies | CURRENT | landing reuses as-is |
| 11 | Influences cloud | KEEP → backing | — |
| 12 | Illusion venn | CURRENT | landing reuses as-is |
| 13 | Spiral "… lead to a partner split?" | OUTDATED-cofounder | H-BuildRightThing (rework) |
| 14 | st5 — no will/skill to verify | KEEP | — |
| 15 | Live demo QR → /letter/st1 | KEEP | — |
| 16 | st1 anti-point card | KEEP | — |
| 17 | st1 story — lie/memory/misunderstanding | KEEP | — |
| 18 | st1 point card | KEEP | — |
| 19 | Habit bracelet | KEEP | — |
| 20 | Clarity Partner Agreement (named pair) "Protect your partnership" | OUTDATED-cofounder | Clarity Group Terms (landing §7b, COA v6) |
| 21 | Five moves "What's the solution?" | CURRENT, text synced | `how-platform-works.tsx` MOVES |
| 22 | CTA "Let's collaborate" — co-founder cohort path | OUTDATED-cofounder | landing AuditCTA + offers |
| 23 | Gift — CM calendar | KEEP → backing (venue-specific) | — |
| 24 | Gaslight your AI | KEEP → backing | — |
| 25 | st2 — information asymmetry | KEEP | — |
| 26 | st3 — three types of understanding | KEEP | — |
| 27 | Close 1 — problems → challenges | KEEP | — |
| 28 | Close 2 — meta-optimism | KEEP | — |
| 29 | Close 3 — two axes matrix | KEEP | — |
| 30 | Names cloud (teach-back …) | KEEP | — |
| 31 | Nested integrity closer | KEEP | — |
| 32–35 | Backing A–D | KEEP (backing) | — |
| 36 | Prior art — closed-loop | KEEP → main arc (evidence) | — |
| 37 | Qualify — who it's for | KEEP → main arc (who it's for) | — |
| 38 | Scope matrix | KEEP → main arc | — |

## New order — round 2 after the independent critic (main arc 1–23, backing 24–39)

hook/pain: 1 hero (landing H1) · 2 35% CB Insights + bridge line · 3 the seam (Maya chat, scaled for projection) · 4 what assumed agreement cost me · 5 everybody assumes · 6 why nobody verifies → root cause: 7 three types · 8 spiral → rework → who it's for: 9 qualify → mechanism/demo: 10 five moves (named before they are demonstrated) · 11 listening calibration · 12 live demo QR · 13 anti-point · 14 point (three clauses) · 15 habit · 16 Clarity Group Terms (two load-bearing lines) → evidence: 17 credibility · 18 fundraising loop · 19 prior art → close: 20 two axes · 21 meta-optimism · 22 nested integrity → ask: 23 one CTA. Backing 24–39: A–D · influences · gaslight · CM gift · st2 · illusion venn · st5 · scope matrix · st1 card · Dalio · names cloud · optimism · full Clarity Group Terms.

Critic moves applied: s21→after s03; s06, s09, s11, s13, s23, s25, s27 → backing; s19 before s12. Declined: none of the reorder moves. Declined elsewhere: (a) title-anchor normalisation across slides — the deck centres each slide's content block with flex, so the title sits where the graphic's height puts it; a two-anchor rule would need per-slide layout work for a low-severity item and is left for a design pass; (b) s09's baked-in typos — it is a JPEG, cannot be edited here; parked in backing with the note.

## Founder decisions — RESOLVED 2026-09-03 (all markers removed from the deck)

The founder answered the open set in one pass. Verbatim answers and what each resolved:

| # | Founder's answer | Applied where |
|---|---|---|
| A | *"i describe it in same way main page does"* | The deck's description of the product is the landing's. Hero eyebrow/H1/sub already verbatim from `build-right-thing-landing.tsx`; slide 1 now also carries the product identity line **"ClarityPledge — a platform to practice verified understanding."** (the repo's own wording, `public/presi/index.html` credibility slide). The seam-slide comment no longer flags the dialogue as awaiting approval — quoting the landing IS the resolution. No cofounder framing survives in the main arc. |
| B | *"it could be for anybody in terms of size of company not only small companies maybe up to medium"* | Qualify slide footer: **"Small to medium companies."** |
| C | *"we are not sure yet who are buyers but it could be related to change management and transformation in general in medium companies"* | Same footer, stated as a bet, never as fact: **"Medium company: whoever owns change and transformation — the bet we're testing."** Speaker notes say the buyer is unresolved and that a room contradicting it is data. |
| D | *"in small teams it still c-level probably or product responsible"* | Same footer: **"Small team: a founder, C-level, or whoever owns product."** |
| E | *"rest you can fill yourself"* | Every remaining marker resolved below; none invented a price, a customer name, or a metric. |

Each round-1/round-2 authored line below is now **confirmed as written** and its `[FOUNDER DECISION]` marker deleted from `public/presi/index.html` (grep returns zero).

### Prior rounds — the wording that is now confirmed

Round 1 (authored copy, now rendered as proposed wording):
1. Slide 4 headline: **"What assumed agreement cost me."** (was "I have lost business partners."). Cards unchanged.
2. Slide 8 heading: **"… lead to rework?"** (was "… lead to a partner split?").
3. Slide 8 last step: **"Until the team rebuilds what it thought it had already agreed on."** (was "Until walking away feels easier than working it out.").
4. Slide 23 path label "For growing teams" — **resolved by removal**: the ask is one action with no audience labels; leaders/coaches paths are a footer line.

Round 2 (authored on the critic's findings):
5. Slide 2 bridge line: **"Building got 10x cheaper. Checking you meant the same thing didn't."** — pays off the hero's "10x" (the critic found the AI promise never returned) and turns the market-need stat toward internal misunderstanding.
6. Slide 9 card 1 body cut to **"Months lost. Work thrown away."** — "A relationship that frayed." dropped as cofounder residue (the 2026-08-20 draft copy). Number badges dropped. "Clarity Champions" naming still open from 2026-08-20.
7. Slide 14 lead line **"'You don't understand me' can mean three things:"** condenses the point's first sentence; the three clauses are verbatim; full point text in NOTES.
8. Slide 15 title **"Make it a habit"** (was the badge text) + setup line **"A bracelet is the reminder: on in the morning, counted in the evening."**
9. Slide 6 card bodies cut to one verbatim sentence each (substrings of the landing copy; citations moved to NOTES) — cut, not authored, but confirm the cut.
10. Slide 17 credibility: the bullet **"Studied why partnerships break — wrote about what I learned"** is removed from the slide (line kept verbatim in NOTES, never rewritten); the essay is still linked from slide 18.

Round 3 (resolutions applied 2026-09-03):

11. Slide 1 gains the product identity line (answer A) — the live-event fix below.
12. Slide 9 heading **"Who this is for"** (was "Who the Clarity Champions program is for") + the size/buyer footer (answers B/C/D). Resolved by removal of the program name, not by inventing one.
13. Backing scope matrix keeps **"Clarity Principle"** — the term is attested in the repo, so the "reconcile before presenting" warning was wrong and is gone.
14. Backing close-1 heading, meta-optimism heading and the Deutsch footnote: confirmed as written (attributed quote, backing slide only).
15. Stale comment fixed: the live-demo slide's comment said `/story/st1`; the slide, its QR alt text and `features/uat/p849.md` all say `/letter/st1`. Comment corrected — the QR image itself was not touched (unchanged from `main`).

### Live-event slide order

The arc opened on the pain and asked the room to care about a 35% failure stat before saying what
ClarityPledge *is*. Fixed on slide 1 rather than by reordering: the identity line sits under the
promise, one beat before the stakes slide. The rest of the round-2 order already satisfies the
requirement — the closer (23) is a concrete next step: **"Book a free alignment audit."** with
`claritypledge.com/intro` as a button and "Starts with a 15-min call." No other reorder was made.

### Claims checked against the repo

Verified verbatim: five moves (`how-platform-works.tsx` MOVES, all five title+text) · Clarity Group
Terms' three clauses (`verified-understanding-oath.ts`, `intendedMeaning` variant) · 35% / CB
Insights, 8-10 / 5-10 / 6-10 and their sources (landing `REFERENCES`, `ASSUMED_STATS`) · €398k /
6 years / 60-page SSRN paper / two-skills essay (`founder-credibility.tsx` CRED_POINTS + line 161) ·
`/letter/st1` slug route (`features/uat/p849.md` UAT-2) · `/intro`, `/coach`, `/manifesto`,
`/sign-pledge`, `/story/:id` routes (`src/App.tsx`) · open-source repo URL.

**Not verified — flagged, not removed:** the QR image on the live-demo slide is a base64 PNG
inherited unchanged from `main`; its *encoded* target was not decoded, only the printed URL beside
it was checked. Scan it once before presenting.

## Noted discrepancies — for the founder, nothing changed

1. **The closing CTA is NOT retired.** A review flagged *"Book a free alignment audit."* on the closer as
   contradicting a strategy doc. It was left alone: the shipped landing
   (`src/app/pages/build-right-thing-landing.tsx:114-116`) still ships exactly that funnel, so the deck
   matches the product. **The discrepancy is between the strategy doc and the shipped product, not
   inside the deck** — recorded here for the founder to resolve in whichever direction they want; neither
   file was edited.
2. **The landing carries the same unbuilt-capability claim the deck just dropped.**
   `src/app/components/landing/how-platform-works.tsx:34` still reads *"Agents flag the high-stakes
   matters requiring alignment with your team."* — the sentence the deck synced from and has now
   rewritten (finding 4 below). `docs/decisions.md` 2026-07-15 [product] records that bridge as
   deliberately advertised-before-built (a founder-owned fake door with the assistant's attribution
   objection overruled, not refuted). Left untouched: the deck is in scope here, the landing is not, and
   the fake door is a founder decision. Flagging it so the two surfaces are not silently inconsistent.
3. **Narrow-width overflow was NOT chased.** The review flagged it; it is not a regression on this branch
   (measurements below). Slides 3, 10, 16, 23, 29, 39 clip at 320px and slides 3, 10, 29 at 375px on
   `main` as well as here.

## Evidence (2026-09-03, round 6 — founder restructure #2: arc 1–22, backing 23–38)

Seven founder changes to `public/presi/index.html`. **One line deleted, nothing else** — every other change
is a block move (leading comment + any scoped `<style>` travelling with its slide). Slide identity, never
slide number, was used to locate each target; the full list was re-derived from the file by script before
and after the moves.

### Final order (38 slides, re-derived after the moves)

Arc (1–22): 1 hero · 2 credibility €398k · 3 scientists & thinkers · 4 35% CB Insights ·
**5 Closed-Loop Communication** *(was 22)* · 6 the seam (Maya chat) · 7 what assumed agreement cost me ·
8 everybody assumes · **9 which situations need the Clarity Principle** *(was 2)* ·
**10 when I refuse, what am I protecting** *(was 31, backing)* · 11 spiral → rework ·
12 names this method already goes by · 13 what's the solution · 14 listening calibration · 15 live demo QR ·
16 anti-point card · 17 st1 story card · 18 point card · 19 make it a habit · 20 make it normal to admit ·
**21 the ask — Clarity Champions Program** · **22 gift, Chiang Mai calendar**.

Backing (23–38, Q&A only): 23 the mechanism · 24 the marked move · 25 who carries the risk ·
**26 why almost nobody verifies** *(was 9, arc — takes the slot vacated by "when I refuse")* ·
27 gaslight thread · **28 three types of cognitive understanding** *(was 10, arc)* · 29 information
asymmetry (st2) · 30 the illusion of shared understanding (venn) · 31 no will or skill (st5) · 32 Ray Dalio ·
33 how to turn problems into challenges · **34 how misunderstandings influence decisions** *(was 23, arc)* ·
**35 how to gain clarity over the problem definition** *(was 24, arc)* · **36 what the practice is really
building** *(was 25, arc)* · **37 the fundraising loop** *(was 21, arc)* · 38 full Clarity Group Terms.

Arc check: the arc still ends on the ask (21) with only the gift after it (22).

### Per change

1. **Scope matrix → after "everybody assumes"** (2 → 9), with its leading comment and its scoped
   `.mx-scope` `@media(max-width:480px)` block. It lands after "everybody assumes" and before the refusal
   slide, per the founder's placement; the refusal slide (change 7) therefore sits one position later than
   the raw slot number, because change 1 claimed the slot immediately after "everybody assumes".
2. **"Three types of cognitive understanding" → backing**, placed immediately **before** "Information
   asymmetry between speaker and listener" (now 28, ahead of 29–31). Reason: it defines the three types,
   29 and 30 then show how they diverge between speaker and listener, and 31 gives the consequence — one
   continuous understanding-theory run in the backing deck.
3. **Bracelet line deleted** from "Make it a habit": `<p class="lead">A bracelet is the reminder: on in the
   morning, counted in the evening.</p>`. Nothing else on the slide changed. Layout re-checked by
   screenshot at 1920 and 375 (`<scratchpad>/d-s19.png`, `m-s19.png`): the ritual tree still centres and
   still reads at both widths; the slide clips at no viewport, before or after. The h2 now sits ~0.3rem
   above the first ritual step — tighter than any comparable slide. Cosmetic, not a defect; **not changed**,
   because a spacing edit was not asked for. The slide's own `<!-- NOTES -->` comment still quotes the line
   as a "setup line" — left in place under delete-nothing-else.
4. **"The fundraising loop" → backing, second-to-last** (21 → 37), ahead of the full Clarity Group Terms.
   Reason: 38 is a reference appendix (the whole agreement); a narrative Q&A slide reads better before it
   than after it. Its own inline `<style>` and `<script>` sit *inside* its `<section>`, so both moved with it.
5. **Closed-Loop Communication → arc position 5** (was 22), immediately after the 35% CB Insights stat —
   the prior-art answer now lands while the stakes are still on screen.
6. **Decision closers → backing** (23, 24, 25 → 34, 35, 36), relative order kept, placed immediately after
   "How to turn problems into challenges?". Reason: that slide's own comment marks it `CLOSE 1 · TRANSFORM
   (high level)` and the three arrivals are `CLOSE 3`, `CLOSE 2` and `CLOSER · NESTED INTEGRITY` — the
   closer family is reunited in one run rather than split across the two arcs.
7. **Arc/backing exchange.** "When I refuse, what am I protecting?" (backing 31) → arc; "Why almost nobody
   verifies understanding" (arc 9) → the backing slot it vacated (now 26). The refusal slide's scoped
   `.card.refuse` style block moved with it — verified visually, not just structurally
   (`<scratchpad>/d-s10.png` shows the red-bordered cards intact in the arc).

**Backing-deck banner comment updated, not deleted:** *"the arc, which now runs 1–27"* → *"1–22"*, and the
`D · what they protect` line now records that the D slot holds "why almost nobody verifies" and that the
refusal slide moved into the arc. Left stale comments would have mis-described the arc boundary for the
next reader. These two comment lines plus the deleted `<p>` are the **only** non-move changes in the diff:
`sort`-diff of the file against `8e749c6c` shows exactly those three hunks and nothing else.

### Render regression check — `8e749c6c` (control) vs working tree, same probe, same directory

Playwright/Chromium, `reducedMotion`, every slide activated via the deck's own `show(n)`. Clip metric = max
pixels of any visible descendant outside the slide's own box ∩ the viewport. `window.innerWidth` asserted
equal to the requested width before any measurement (all six runs passed; the probe aborts the viewport
otherwise). Control was measured from a copy in the **same directory** so relative assets resolve
identically. **Compared by slide identity, not index** — indices moved.

| viewport | control (`8e749c6c`) | working tree | verdict |
|---|---|---|---|
| 1920×1080 | gaslight 38px | gaslight 38px | unchanged |
| 375×812 | seam 18px · solution 540px · gaslight 489px | seam 18px · solution 540px · gaslight 489px | unchanged |
| 320×700 | seam 187px · why-nobody 66px · solution 684px · make-it-normal 191px · gaslight 795px · terms 136px | seam 187px · why-nobody 66px · solution 684px · make-it-normal 191px · gaslight 794px · terms 135px | unchanged (±1px jitter, documented in round 5) |

**No new clipping at any viewport, and no slide moved into or out of a clipping state.** Every clip present
is pre-existing and carried by the same slide identity in both versions. Console errors, page errors and
failed requests: **0** at all three viewports, both versions.

**Print / PDF path.** `page.pdf` headless with `preferCSSPageSize`, read with `pdfinfo`: **38 pages,
1200 × 675.12 pts (16:9)** — one page per slide, matching `grep -c '<section class="slide'` → 38. Order
spot-checked with `pdftotext`: p1 hero, p5 Closed-Loop, p9 which situations, p10 when I refuse, p19 make it
a habit, p21 the ask, p22 the gift, p23 the mechanism, p26 why almost nobody verifies, p37 the fundraising
loop, p38 the terms — matching the order above.

**Structural integrity.** `<section>`/`</section>` 38/38. Multiset diff of file lines against `8e749c6c`:
1 line removed (the bracelet `<p>`), 2 comment lines changed — every other line preserved verbatim, which is
the proof the reorder was a pure block permutation. Dev server on `:5180` re-checked after the write:
38 sections served, 0 occurrences of the deleted `<p>`.

**Style-block travel — the named risk, checked directly.** Every scoped `<style>` block was moved as part of
its slide's block; the two slides that changed arcs and carry their own scoped CSS were then verified by
screenshot rather than by structure alone: the refusal slide (`.card.refuse`, `d-s10.png`) and the scope
matrix (`.mx-scope` `@media(max-width:480px)`, `m-s9.png`) both render with their styles applied in their
new positions. The backing deck's shared `.bk` block stays at the arc boundary with the banner; the one
slide that left that group ("when I refuse") does not use `.bk`.

## Evidence (2026-09-03, round 5 — founder restructure: arc 1–27, backing 28–38)

Nine changes to `public/presi/index.html`, on top of the audience-slide deletion already in the tree
(39 → 38 slides). **Nothing was deleted except where the founder asked**; every other change is a
reorder. Positions below were re-derived from the file by script before and after each step, never
from the spec or from the deck's own comments.

### Final order (38 slides, re-derived after the moves)

Arc: 1 hero · 2 which situations need the Clarity Principle *(was 33)* · 3 credibility, €398k *(was 16)* ·
4 scientists & thinkers who influenced the work *(was 27)* · 5 35% CB Insights · 6 the seam (Maya chat) ·
7 what assumed agreement cost me · 8 everybody assumes · 9 why almost nobody verifies · 10 three types ·
11 spiral → rework · 12 names this method already goes by *(was 36)* · 13 what's the solution · 14 the skill,
defined · 15 live demo QR (/letter/st1) · 16 anti-point card · 17 st1 story card *(was 34)* · 18 point card ·
19 make it a habit · 20 make it normal to admit · 21 listening calibration · 22 proven, just not practiced ·
23 how misunderstandings influence decisions · 24 how to gain clarity over the problem definition ·
25 what the practice is really building · 26 **the ask — Clarity Champions Program** *(was 22)* ·
27 gift, Chiang Mai calendar *(was 29)*.

Backing (Q&A only, unchanged relative order): 28 the mechanism · 29 why it has to be pre-agreed ·
30 asymmetry of vulnerability · 31 where the will breaks down · 32 gaslight thread · 33 information
asymmetry (st2) · 34 the root cause (venn) · 35 no will or skill (st5) · 36 Ray Dalio · 37 the principle
of optimism · 38 make it normal / full Clarity Group Terms.

Arc check: the room learns which situations this applies to (2), who is speaking (3) and whose ideas
this rests on (4) before any claim is made on it; the ask is last in the arc (26) and only the gift
follows it (27).

### Per change

1. **Hero reduced.** Badge + H1 only. Deleted from the face of the slide: *"ClarityPledge — a platform to
   practice verified understanding."* and *"claritypledge.com"* (founder, explicit), plus the promise line
   *"Get your team off the treadmill."* under "cut the rest". All three survive **verbatim in the speaker
   notes**, which is the deck's own convention for cut copy. Type down: `h1` was
   `clamp(2.1rem,6vw,5.2rem)` → `clamp(1.7rem,4.4vw,3.8rem)`. `h1` is used by no other slide
   (`grep -c '<h1' → 1`). Measured, control vs working tree, same probe:

   | viewport | control font-size / lines | working tree |
   |---|---|---|
   | 1920×1080 | 83.2px / 3 lines / 267px tall | **60.8px / 3 lines / 195px** |
   | 375×812 | 33.6px / 6 lines / 216px | **27.2px / 5 lines / 145px** |
   | 320×700 | 33.6px / 7 lines / 252px | **27.2px / 6 lines / 175px** |

2. **Credibility slide to position 3** (was 16). Moved as a block with its leading comment. No copy change.
3. **Influences cloud to position 4** (was 27), immediately after the credibility slide — founder: *"its a
   story whom i studied.. after my picture slide"*. Its `.cloud-slide` style block moved with it; the other
   cloud slide (now 12) sits after it, so both are still covered. Speaker note re-labelled BACKING → IN THE ARC.
4. **Scope matrix to position 2** (was 33), with its leading comment and its scoped `.mx-scope` style block.
   Its comment claimed *"last slide, and the only concession in the deck"* and referenced *"slide 29"* by
   number — both rewritten (position stated, sibling slide named rather than numbered).
5. **Names cloud to position 12** (was 36), immediately before "What's the solution?" — so the room hears
   the method is not new before it is introduced.
6. **st1 story card to position 17** (was 34), between the anti-point card (16) and the point card (18).
   Both kept. Its shared `.st1-*` style block was moved to sit before it, so the styles still precede
   both story slides. **Flagged for the founder:** slide 16 is the *anti*-point (the statement the room
   votes on) and slide 18 is the point (the correct three-meanings answer) — the instruction placed the
   story between them. If the intent was point-then-story, the card belongs after 18; that is a one-block move.
7. **The ask, repointed to the paid program.** Deleted, as instructed: the leaders/coaches footer line and
   the open-source line (GitHub is still named on the five-moves slide, now slide 13 — the
   "say it once" note there still holds). New wording is **entirely lifted from the program page**, nothing
   authored for the deck and no founder decision required:
   - heading *"Join the Clarity Champions Program"* — `src/app/pages/offers-page.tsx:68`
   - sub-line *"Weekly live practice with a small batch of peers, €295/month, cancel anytime."* —
     `src/app/pages/offers-page.tsx:52`
   - button *"Start at €295/month →"* — `src/app/components/landing/offers-section.tsx:337`
   - link `claritypledge.com/program`, a real route redirecting to `/pricing` (`src/App.tsx:350`).
   Price appears twice (sub-line and button), so the ask cannot be read as a free call. Available verbatim
   from the same page if the founder wants risk reversal on the slide, recorded in the notes but **not**
   added: *"Full refund if the first two sessions aren't for you."*
8. **Chiang Mai gift to position 27**, immediately after the ask — founder: *"this is a gift i can give"*.
9. **Deniability added to the obstacle** on slide 24. `docs/hypotheses.md:604` states misunderstanding-harm
   is *"diffuse, deniable, and unattributable"*, so deniability is the mechanism that makes the harm
   unattributable. Added in the slide's existing idiom — same red block, now two label lines
   (`ego · fear · laziness` / `deniability`), rect widened 144→180 and heightened 68→82, label 13px→12px.
   No restructure. `aria-label` and the speaker notes updated to match.

**Comments corrected, not slides:** the BACKING banner still claimed the arc ended at 23 and that the scope
matrix / st1 card / names cloud were parked behind the CTA — rewritten to describe the 1–27 arc. Five
per-slide `BACKING` notes re-labelled `IN THE ARC` with the founder's reason. The `.mx-scope` comment's
"slide 29" reference replaced with the slide's name, since numbers move.

### Render regression check — control vs working tree, same probe, same directory

Probe reused from round 4 (Playwright/Chromium, `reducedMotion`, every slide activated via the deck's own
`show(n)`; clip metric = max pixels of any visible descendant outside the slide's box ∩ the viewport;
`window.innerWidth` asserted equal to the requested width before any measurement — all six runs passed).
Control = the working tree as it stood before this round (38 slides). Clips are listed by **slide identity**,
because the indices moved.

| viewport | control | working tree | verdict |
|---|---|---|---|
| 1920×1080 | gaslight 39–40px | gaslight 39–40px | unchanged |
| 375×812 | seam 20px · solution 542px · gaslight 491px | seam 20px · solution 542px · gaslight 491px | unchanged |
| 320×700 | seam 189px · why-nobody 68px · solution 687px · make-it-normal 193px · **CTA 4px** · gaslight 796–797px · terms 137–138px | seam 189px · why-nobody 68px · solution 687px · make-it-normal 193px · gaslight 796–797px · terms 137–138px | **CTA clip gone**; rest unchanged |

**No new clipping at any viewport**; the CTA's 4px clip at 320 was closed by the rewrite. The ±1px ranges are
run-to-run jitter — reproduced in the **control** across repeat runs, not a change. Console errors, page
errors and failed requests: **0** at all three viewports, both versions. No slide moved into or out of a
clipping state.

**Print / PDF path.** Exported headless (`page.pdf`, `preferCSSPageSize`), read with `pdfinfo`:
**38 pages, 1200 × 675.12 pts (16:9)** — one page per slide, matching `grep -c '<section class="slide'` → 38.
Order spot-checked with `pdftotext` per page: p1 hero, p2 which situations, p3 credibility, p4 scientists,
p12 names-this-method, p13 what's the solution, p17 st1 card, p26 the ask, p27 gift, p28 the mechanism,
p38 the terms — matching the arc above.

**Structural integrity.** The reorder was a pure block permutation: line multiset of the file before vs after
differs only by the intended content edits (21 lines added, 24 removed, every one accounted for above);
`<section>`/`</section>` 38/38, `<style>`/`</style>` 8/8, blank-line count identical.

**Independent visual QA** (1 of 1 subagent reported; screenshots + checklist only, no diff, no intent) on
the 9 changed/moved slides at 1920 / 375 / 320. It found no defect introduced by this round. It raised four
pre-existing items, none touched here and all left for the founder: (a) the small/low-contrast tiers on both
word-cloud slides (`.cw.m` `#c4c4c8`, `.cw.s` `#8a8a92`) are hard to read from the back of a room; (b) the
deck-wide `.note` / kicker captions are the smallest text on every slide that has one; (c) the hero headline
widows at 375/320 — measured **better** than control (5 vs 6 lines, 6 vs 7), a consequence of the forced
`<br>` structure, not a regression; (d) the credibility slide's two checklist bullets look like links —
they are links (SSRN paper, manifesto), so the affordance is correct.

### Deletion candidates — NOT deleted, founder decides

1. `.cta-alt` CSS (`index.html:446-447`) is now unreferenced — the only user was the leaders/coaches footer
   line the founder asked to delete. Verified by grep: 0 uses outside the rule itself. Removing it is safe;
   left in place because removal was not asked for.
2. Slide 37 ("The principle of optimism", backing) carries the *same* Point A/B obstacle diagram as slide 24,
   and its own note already says so: *"same diagram as meta-optimism, which is the one applied to the topic."*
   Now that slide 24 carries the fuller obstacle (four items incl. deniability), 37 is the weaker twin.
   Left in place — it is backing, so it costs nothing in the arc.
3. Slide 12 (names cloud, now in the arc) and slide 22 ("Proven — just not practiced", prior art) make the
   same argument — *this method is not new* — 10 slides apart. The names cloud's own note used to say it
   *"duplicates the prior-art slide"*. Both kept; if one goes, the prior-art slide is the one with citations.

## Evidence (2026-09-03, round 4 — Codex-review fixes)

Five findings applied to `public/presi/index.html`. Per-finding proof:

1. **Four dead citation links closed.** `grep -c 'href="#"' public/presi/index.html` → **0** (was 4, at
   the 35% stat and the three assumed-clarity cards). All three URLs are the landing's own — copied from
   `build-right-thing-landing.tsx` `REFERENCES` (lines 43-45), not authored: CB Insights
   `research/startup-failure-reasons-top/`, Axios HQ `insights/internal-communications-statistics`
   (used by both ref-1 cards), Radical Candor `trust-gap`. Every citation had a real source in the repo,
   so **nothing was de-linked**. Rendered hrefs verified at lines 669, 742-744.
2. **Tab title.** `<title>` was *"Slava — Protecting High-Stakes Partnerships"* (retired cofounder-era
   positioning) → **"ClarityPledge — Practice Verified Understanding"**, the deck's own product identity
   line from slide 1 (answer A). Verified at `index.html:6`.
3. **Printing exports every slide.** `.slide{display:none}` / `.slide.active{display:flex}` with no print
   rule made a PDF export one page. Added an `@media print` block (screen behaviour untouched — it is
   entirely inside the media query): slides go `position:relative; display:flex`, one per page at
   `@page size:1600px 900px`, nav + progress hidden. **Verified by actually exporting**, headless Chrome
   `--print-to-pdf`, page count read with `pdfinfo`:

   | version | Pages | Page size |
   |---|---|---|
   | HEAD (control) | **1** | 612 × 792 pts (letter) |
   | working tree | **39** | 1200 × 675.12 pts (16:9) |

   39 pages = 39 slides (`grep -c '<section class="slide'` → 39). Order spot-checked by `pdftotext` per
   page: p1 hero, p2 the 35% stat, p9 "Who this is for", p10 five moves, p23 the CTA closer, p39 the
   backing Clarity Group Terms — matching the round-2 arc. Page 10 also rendered to PNG to confirm the
   print layout is not degenerate.
4. **Unbuilt capability no longer asserted.** Five-moves card 3 body was *"Agents flag the high-stakes
   matters requiring alignment with your team."* — a shipped-capability claim for a bridge
   `docs/decisions.md` 2026-07-15 [product] records as deliberately unbuilt. Now: **"Where this is going:
   high-stakes matters surfaced before work starts."** No replacement capability invented; the card title
   ("Surface high-stakes decisions") is unchanged. See discrepancy 2 above for the landing's copy.
5. **Audience slide — founder's ruling applied, size is not the segmentation axis.** Was: *"Small to
   medium companies. Small team: a founder, C-level, or whoever owns product. Medium company: whoever
   owns change and transformation — the bet we're testing."* Now, verbatim:

   > Whoever owns the alignment problem — a founder, C-level or product owner in a small team; whoever
   > owns change and transformation in a larger one, the bet we're testing. Size isn't the filter: so
   > far, small teams through medium companies.

   Role and situation lead; the size range is stated as an observation of where it has shown up, not as
   the definition of the segment — `lean-canvas.md:79` explicitly rejects company size as a segmentation
   variable in its own right. The buyer stays a hypothesis ("the bet we're testing"). `lean-canvas.md`
   was **not** edited. Speaker notes rewritten to say why size leads nowhere and that a room
   contradicting the buyer bet is data.

### Render regression check — HEAD vs working tree, same probe, same directory

Playwright/Chromium, `reducedMotion`, every one of the 39 slides activated via the deck's own `show(n)`.
Clip metric = max pixels of any visible descendant outside the slide's box ∩ the viewport.
`window.innerWidth` asserted equal to the requested width before any measurement (all three passed).

| viewport | HEAD (control) | working tree |
|---|---|---|
| 1920×1080 | `29:40px` | `29:40px` |
| 375×812 | `3:21px 10:542px 29:491px` | `3:20px 10:542px 29:491px` |
| 320×700 | `3:189px 6:68px 9:128px 10:687px 16:193px 23:4px 29:797px 39:137px` | `3:189px 6:68px 10:687px 16:193px 23:4px 29:796px 39:137px` |

**No new clipping at any viewport.** Slide 9 (the rewritten audience slide) is *better*: its 128px clip at
320px is gone, and it does not clip at 375px either — the new note is longer than the line it replaced, so
it first regressed (+13px at 375, +53px at 320) and a scoped `@media(max-width:400px)` rule on `.qualify`
(note size, card padding, icon size, card gap) closed it and the pre-existing clip with it. Slide 10 also
regressed +23px at 375 on the first wording of fix 4 and was closed by tightening that sentence, not by
CSS. Every remaining clip is pre-existing and untouched. Console/page errors and failed requests: **0** at
all three viewports, both versions.

Artifacts: `<scratchpad>/p1218/presi-final.pdf` (39pp), `head-control.pdf` (1pp), `shots/{d,m,xs}-s{2,5,9,10}.png`.

## Evidence (2026-09-01, round 1)

- Headless Chromium 1920×1080, all 38 slides + first-advance states: `<scratchpad>/presi/s01…s38(.b).png`; 375px for slides 1, 3, 8, 21, 30: `m*.png`.
- Console: 0 errors, 0 warnings, 0 failed requests. Keyboard: `1 / 38` → ArrowRight `2 / 38` → ArrowLeft `1 / 38` → End `38 / 38` → Home `1 / 38`.
- Overflow probe: no element outside the viewport on any slide except the gaslight thread's deliberately scrollable body (backing slide 36, pre-existing).

## Evidence (round 2)

- Independent critic pass (visual-QA + presentation-coach, no code seen): verdict FIX-THEN-PRESENT; top-5 applied — chips out, arc 30→23, legibility floor (24px body / ≤40 words on the flagged slides), one ask, cofounder residue out of the main arc.
- Headless Chromium 1920×1080 all 39 slides + first-advance states, and 375px for all 39: `<scratchpad>/presi/round2/`. Console errors, keyboard and 375px overflow: recorded in the round-2 report.

## Evidence (2026-09-03, round 3 — founder answers applied)

- `grep -n "FOUNDER DECISION" public/presi/index.html` → no matches (13 before). Slide count unchanged: `grep -c '<section class="slide'` → 39.
- Headless Chromium, **HEAD vs working tree side by side from the same directory** (so relative assets resolve identically — the first control run was measured from a copied file and reported spurious `ERR_FILE_NOT_FOUND`), all 39 slides advanced by ArrowRight, clip metric = pixels of descendant content outside the slide's own box or the viewport:

  | viewport | HEAD | working tree |
  |---|---|---|
  | 1920×1080 | none | none |
  | 375×812 | `3:12px 10:534px` | `3:12px 10:534px` |
  | 320×700 | `3:181px 6:60px 9:144px 10:679px 16:185px` | `3:181px 6:60px 9:120px 10:679px 16:185px` |

  Identical at projection size and at 375px; slide 9 is 24px **better** at 320px. Every remaining clip is pre-existing and untouched by this round.
- Console/page errors and failed requests on the working tree: **0** at all three viewports. Keyboard: `1 / 39` → 8×ArrowRight → `9 / 39` → End `39 / 39` → Home `1 / 39`.
- **A first probe here returned a false pass.** `scrollHeight > viewport` reported "no slide taller than the viewport" for both versions while the 375px screenshot visibly cut the new footer line off — the slides are `height:100vh` so `scrollHeight` is clamped. Re-measured against descendant bounding boxes with HEAD as a known-good control; that probe found a real 80px clip introduced by the new line, which the scoped `@media(max-width:560px)` rule on `.qualify` then closed (verified: 892px → 782px content bottom at 375×812).
- Screenshots: `<scratchpad>/shots/d-s1.png` (hero with identity line), `d-qualify.png`, `m-qualify.png`.
