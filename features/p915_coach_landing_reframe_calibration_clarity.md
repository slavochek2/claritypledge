---
status: in-progress
type: story
rank: 1000800.0
created_date: '2026-06-10'
tags: [coach-landing, copy, calibration, conversion]
delivery_stage: dev
pipeline_ran: [create-spec, dev]
---

# P915: Coach landing reframe + letter calibration legibility (coach CD session)

## Problem

**Situation:** The coach landing page (`src/app/pages/coach-partnership-page.tsx`, P856, serves `/`) and the clarity-letter calibration reveal were reviewed live with a coach (large following) in a customer-development session. That morning he had lost a paying client to a refund: he had an alternative offer (switch group → 1-on-1) in his head and stayed silent, fearing she'd read it as "scammer dodging the refund."

**Complication:** His reactions exposed concrete, specific gaps:
- The hero leads with an abstract which-gap framing ("They believe they disagree / But they misunderstood you") instead of the **validated** pain — the fear of being honest that cost him the client. The coach flagged those two lines as too abstract at the top.
- The page is all concept (stats, venn, "why nobody checks") with **no concrete misunderstanding instance** showing a visible consequence.
- Generic "Meet the Pledgers" social proof doesn't fit a coach audience and reads as sparse.
- On the letter's calibration screen, the author's **genuine, pre-committed prediction** of the reader's understanding read to the coach as a made-up demo number — even though the reveal already happens after the reader submits.

**Question:** How do we re-anchor the coach hero on the validated pain (fear-of-honesty → churn), add a concrete instance, trim mismatched social proof, and make the author's calibration prediction legible as a real pre-committed estimate?

## Appetite

**Blast radius — medium.** Landing `/` is all coach traffic. `gap-banner.tsx` is shared across **all** letter reveals *and* `live-mode-view.tsx` — a copy change there ships everywhere.
**Reversibility — high.** Copy + component/markup changes, git-revertable. No schema, no data migration.
**Decision density — low.** Founder decisions resolved this session: hero copy locked, illustration content approved, pledgers + CTA decided. Two small open sub-decisions remain (see UI Contract): hero avatar stack keep/drop, and final verb confirmation.

## Solution

Three surfaces, one spec. Item 3 has the wider blast radius and gets its own test.

### Surface 1 — Coach landing page (`coach-partnership-page.tsx`)

1. **Hero headline.** Replace the current 3-beat animated H1 (lines ~495–505) with this arc, keeping the existing `showLine2`/`showLine3` reveal mechanic:
   - "Stop losing customers." (unchanged — the coach validated unprompted as "very strong")
   - "Being honest when you disagree is risky." (the safety hook — maps to his lived moment)
   - "Make the hard truth safe to say." (founder-selected; resolves line 2's tension risky → safe)

2. **Relocate the which-gap lines.** Move "They believe they disagree" / "But they misunderstood you" out of the hero and down to the venn section ("The illusion of shared understanding", ~lines 545–552) as a caption/subhead — where the visual gives them context (session 21:54). The which-gap is the differentiator; it belongs in the body, not the cold hero.

3. **Add a concrete "unsent message" illustration section**, placed **after** the venn. Fills the missing-instance gap (session 24:24). Generic business/career-coach scenario (NOT the coach's real story/figures). Reconstructed phone-chat with a typed-but-never-sent honest message (greyed "unsent" bubble) → client leaves. The unsent bubble is the hero's safety-hook made concrete. Ship **static first** (no motion library / reduced-motion handling); scroll-reveal on the outcome line is a later enhancement.

4. **Remove the `<SignatureWall />` "Meet the Pledgers" section** (~line 628). Generic pledge signatures aren't the proof a coach needs and read as sparse.

5. **Keep** the "Take the Pledge" secondary CTA (hero + final CTA) — founder keeps it deliberately to show the end-goal/mission.

### Surface 2 — Venn labels (landing `MisunderstandingVenn`) — RESOLVED: no change

6. **Keep the landing `MisunderstandingVenn` labels.** Investigation (this session) found **no separate letter-flow venn** — the only venn is the landing one. Rendering it showed a relabel would *invert* the meaning: the right (blue) circle is the **client's** flawed understanding ("they wrongly believe they understand you" + the red 'actually here' dot), so relabeling it "Your understanding" on a coach-facing page would tell the visiting coach that *their own* understanding is the broken one — and clash with the venn's red caption. *(Resolved this session: founder confirmed keep "What you mean / What they understand" — the spec's original "don't touch" reasoning holds. "My/Your understanding" was a letter-venn framing that doesn't apply to this sender→receiver venn.)* The relocated which-gap caption (Surface 1, item 2) still lands below the venn.

### Surface 3 — Letter calibration reveal copy (`src/app/components/letters/letter-flow-content.tsx`, story-revealed phase)

> **Corrected mapping (this session):** the `{N}`/`{M}` markers live in `letter-reveal-numeric.tsx`; the "Listening calibration" header is rendered **inline in `letter-flow-content.tsx`** (the compact `LetterRevealNumeric` suppresses its own header). `gap-banner.tsx` carries neither number — so it is **not** the right surface and is **left untouched** (live mode unaffected).

7. The reveal-after-commit mechanic is already correct — the problem is **framing only**. Make the author's number legible as a genuine, pre-committed, person-specific estimate:
   - **Replace the inline "Listening calibration" jargon header** with a plain claim shown *before* the comparison: "Before you answered, {Author} estimated your understanding here at a {N}." Gender-neutral ("your understanding", no "him"). The phrase **"Before you answered"** is the load-bearing pre-commitment cue.
   - **Author marker stays compact** "{Author} {N}" on the 0–10 scale — "estimated" lives in the opener; "{Author} estimated {N}" as a scale label risks 320px overflow (label sits below the track, `whitespace-nowrap`).
   - **Commitment cue:** a lock icon inline with the opener.
   - **Gap verdict** stays in the existing `GapBanner` + scale — not duplicated into the opener (avoids triple gap-messaging).

## Risks / Non-Goals

### Risks
- **`gap-banner.tsx` is shared** (letter reveal + `live-mode-view.tsx`). *Resolved:* implementation does NOT touch gap-banner — the calibration copy change lives in `letter-flow-content.tsx` only, so live mode is unaffected and this risk does not fire.
- **The hero reframe shifts the page spine** from listener-repair to safety-hook; the body must echo it or it reads disjointed. *Mitigation:* the unsent-message illustration carries the safety-hook into the body; the which-gap lines relocate to the venn caption rather than vanish.
- **Validation is one friendly coach.** Copy is a hypothesis, not settled. *Mitigation:* ship-and-watch the behavioral signal (Try-a-Clarity-Letter clicks / bookings); do not treat the exact wording as proven.

### Non-Goals
- Do NOT solve the venn's inability to depict **inverted/opposite** understanding (session 28:07) — conscious deferral, documented so it doesn't resurface as a surprise.
- Do NOT use the coach's real story, domain, or any real figures in the illustration — generic business-coach scenario only.
- Do NOT change the landing `MisunderstandingVenn` labels — reaffirmed this session: relabeling would invert the sender→receiver meaning (right circle = client's understanding). Keep "What you mean / What they understand".
- Do NOT remove the "Take the Pledge" CTA.
- Do NOT add animation to the illustration in v1.
- Do NOT change the calibration **mechanic** (reveal-after-commit) — copy/framing only.
- Do NOT add a server endpoint, schema change, or new DB table.

## Done-When

- [x] Coach hero shows the 3-line arc ("Stop losing customers." / "Being honest when you disagree is risky." / "Make the hard truth safe to say.") with the animated reveal intact, on desktop and 320/375px. *(screenshot-verified at 1280/390/true-320.)*
- [x] The which-gap lines appear as a caption near the venn, no longer in the hero.
- [x] A concrete unsent-message illustration section renders after the venn (static), generic scenario, greyed unsent bubble, on desktop and 320/375px. *(screenshot-verified.)*
- [x] The "Meet the Pledgers" SignatureWall no longer appears on `/`.
- [x] "Take the Pledge" CTA still present (hero + final). *(test asserts 2 occurrences.)*
- [x] Landing `MisunderstandingVenn` labels kept as "What you mean / What they understand" (relabel rejected — would invert sender→receiver meaning).
- [x] Calibration reveal opens with "Before you answered, {Author} estimated your understanding here at a {N}." (gender-neutral) with a lock commitment cue; gap verdict shown by existing GapBanner + scale. *(copy in code + P852 e2e updated; live letter-reveal screenshot deferred to `/verify` — needs a seeded letter flow.)*
- [x] `gap-banner.tsx` left unchanged (verified — live mode unaffected). *(opener live-reveal 320/375 visual deferred to `/verify`.)*
- [x] Existing gap-banner/live-mode tests pass; a new test covers the reframed copy. *(2388 unit tests green; new p915-coach-reframe.test.tsx.)*

## UX Notes

- **Hero spine:** outcome (line 1) → bind (line 2) → relief (line 3). The relief deliberately resolves the bind (risky → safe), not a different loop (predictability).
- **Illustration is the bind made visible:** the greyed "unsent" bubble is the honest thing the coach couldn't risk. It is the body-level echo of hero line 2.
- **Calibration legibility:** the only change is making a true thing *visible* — that the author committed a number in advance, specifically about this reader. No mechanic change.
- **States to cover:** calibration reveal must read correctly in both perfectly-calibrated and gap states, and in both letter-reveal and live-mode contexts.

## Acceptance Criteria

- [x] A coach landing cold sees the validated pain (fear-of-honesty → losing customers) above the fold, not an abstract concept.
- [x] A coach encounters at least one concrete, consequence-bearing misunderstanding instance (unsent-message illustration) before the How-it-works section.
- [x] A letter reader understands, without narration, that the author's calibration number was a real prediction made in advance — opener copy achieves this; comprehension is a UX hypothesis to confirm in live `/verify`.
- [x] No surface regresses on mobile-narrow (320px) — P915 surfaces (hero, caption, illustration) verified overflow-free at true 320px via DOM measurement. *(Pre-existing nav header + TEMPLATE stamp overflow ~9px at 320 is unchanged, NOT introduced by P915.)*

## UI Contract

| Element | Value | Context |
|---|---|---|
| Hero line 1 | `Stop losing customers.` | coach hero (unchanged) |
| Hero line 2 | `Being honest when you disagree is risky.` | coach hero (new) |
| Hero line 3 | `Make the hard truth safe to say.` | coach hero (new, founder-selected) |
| Venn caption (relocated) | `They believe they disagree.` / `But they misunderstood you.` | beside landing venn |
| Illustration — unsent (greyed) | `Honestly, I think you're scaling too fast and it'll burn you out.` | unsent-message section |
| Illustration — client reply | `I'm going to pause our sessions.` | unsent-message section |
| Illustration — coach reply | `Understood.` | unsent-message section |
| Illustration — outcome | `A client who needed you most, gone.` | unsent-message section (no $ figure) |
| Calibration opener | `Before you answered, {Author} estimated your understanding here at a {N}.` | replaces inline "Listening calibration" header (letter-flow-content) |
| Calibration author marker | `{Author} {N}` (compact — "estimated" in opener; 320px safety) | letter-reveal-numeric scale |
| Calibration gap verdict | existing `GapBanner` badge + 0–10 scale (not duplicated into opener) | letter-flow-content |
| Landing venn circles | `What you mean` / `What they understand` (unchanged — relabel rejected) | `MisunderstandingVenn` |

**Resolved sub-decisions [FOUNDER, this session]:**
- Hero `PledgerAvatarStack` (~line 515): **KEEP** alongside the SignatureWall removal.
- Calibration verb: **"estimated"** confirmed.
- Calibration opener pronoun: **gender-neutral** — "estimated your understanding here at a {N}" (no "him"/gender derivation needed).
- Surface 2: no separate letter venn exists; relabeling the landing venn would invert its sender→receiver meaning — **keep "What you mean / What they understand"** (no change).
- Surface 3: numbers live in `letter-reveal-numeric` / header inline in `letter-flow-content`, NOT `gap-banner` — gap-banner left untouched.
