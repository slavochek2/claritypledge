---
status: week
type: task
rank: 1000066
workstream: content
created_date: '2026-09-01'
tags: [presi, deck, positioning, wedge]
delivery_stage: create-spec
pipeline_ran: [create-spec]
drafted_by: fable
exec_model: fable
exec_effort: high
---

# P1218: Refresh /presi to the current wedge (prevent rework before work begins)

## Problem

`/presi` still tells the **cofounder-split** story ("I've lost business partners. I help you keep yours.", "65% of startup failures stem from co-founder conflict", "How does the illusion lead to a *partner split*?", CTA "Join a founding cohort of co-founders"). The active wedge since the 2026-07-20 flip is **a growing seed–A team that keeps building the wrong thing because they never verify they understood each other before agreeing or disagreeing** — re-stated 2026-08-10 as **prevent rework before work begins** ([lean-canvas.md](../docs/lean-canvas.md) §Customer Segments → Active focus; [hypotheses.md](../docs/hypotheses.md) H-BuildRightThing; [decisions.md](../docs/decisions.md) 2026-07-20 + 2026-08-10 [product]). The shipped landing (`/`, `build-right-thing-landing.tsx`) already carries the current copy; the deck contradicts it. Slide order is also the June-15 "Monday talk" order, with a stale event title slide (4Seas, 15 June) at position 2.

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
