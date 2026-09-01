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
- ACCEPT — "Clarity Principle" / "Clarity Champions" naming on two kept slides is still `[FOUNDER DECISION]` from 2026-08-20/24; not resolved here.
- NON-GOAL — `/presi2`, the Chiang Mai event slides' content, the GSAP motion layer, mobile layout beyond not regressing.
- NON-GOAL — new numbers, testimonials, pricing. None added.

## Done-When

- [x] Slide audit table below filled for every slide of `/presi`.
- [x] No slide in the main arc frames the problem as a cofounder split; the arc opens on the landing's hero copy.
- [x] Every authored sentence is wrapped in a visible `[FOUNDER DECISION: …]` in the slide AND listed under "Founder decisions" below.
- [x] Every slide has a `<!-- NOTES` block with 2–4 bullets.
- [x] Keyboard nav + counter verified in a headless browser; every slide screenshotted at 1920×1080; zero console errors.
- [x] `./scripts/pre-commit-checks.sh` passes (run at commit time).

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

## New order (main arc 1–30, backing 31–38)

hook/pain: 1 hero (landing H1) · 2 35% CB Insights · 3 the seam (Maya chat) · 4 everybody assumes · 5 why nobody verifies → root cause: 6 illusion venn · 7 three types · 8 spiral → rework · 9 st5 no will/skill → who it's for: 10 qualify · 11 scope matrix → mechanism/demo: 12 listening calibration · 13 st1 lie/memory/misunderstanding · 14 live demo QR · 15 anti-point · 16 point · 17 habit · 18 Clarity Group Terms · 19 five moves → evidence: 20 credibility · 21 montage · 22 fundraising loop · 23 Dalio · 24 prior art · 25 names cloud → close: 26 two axes · 27 optimism · 28 meta-optimism · 29 nested integrity → ask: 30 CTA. Backing: 31–34 A–D · 35 influences · 36 gaslight · 37 CM gift · 38 st2. Old title/QR slide (4Seas, 15 June) removed.

## Founder decisions (authored copy — accept / reword each)

Visible in the slide as an amber `[FOUNDER DECISION: …]` chip (`.fd-mark`); delete the span once decided.

1. Slide 21 headline: **"What assumed agreement cost me."** (was "I have lost business partners."). Cards unchanged.
2. Slide 8 heading: **"… lead to rework?"** (was "… lead to a partner split?").
3. Slide 8 last step: **"Until the team rebuilds what it thought it had already agreed on."** (was "Until walking away feels easier than working it out.").
4. Slide 30 path label: **"For growing teams"** (replaces "For co-founders"; the h3/microcopy under it are the landing's verbatim).

Left as-is, flagged (founder bio lines, not authored here): slide 13 story-card byline "I have lost partners. I help you keep yours." (a rendering of the live st1 card; the current profile tagline is a founder decision, not invented here) and slide 20 bullet "Studied why partnerships break".

Inherited, not new — already marked on their source: slide 3 dialogue (landing §2b, FOUNDER DECISION awaiting UAT); slide 10 "Clarity Champions" copy (2026-08-20); slide 11 "Clarity Principle" (2026-08-24); the closer headings on 27–28.

## Evidence (2026-09-01)

- Headless Chromium 1920×1080, all 38 slides + first-advance states: `<scratchpad>/presi/s01…s38(.b).png`; 375px for slides 1, 3, 8, 21, 30: `m*.png`.
- Console: 0 errors, 0 warnings, 0 failed requests. Keyboard: `1 / 38` → ArrowRight `2 / 38` → ArrowLeft `1 / 38` → End `38 / 38` → Home `1 / 38`.
- Overflow probe: no element outside the viewport on any slide except the gaslight thread's deliberately scrollable body (backing slide 36, pre-existing).
