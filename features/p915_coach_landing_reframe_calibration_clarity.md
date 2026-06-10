---
status: week
type: story
rank: 1000800.0
created_date: '2026-06-10'
tags: [coach-landing, copy, calibration, conversion]
delivery_stage: create-spec
pipeline_ran: [create-spec]
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
   - "Stop losing customers." (unchanged — Kai validated unprompted as "very strong")
   - "Being honest when you disagree is risky." (the safety hook — maps to his lived moment)
   - "Make the hard truth safe to say." (founder-selected; resolves line 2's tension risky → safe)

2. **Relocate the which-gap lines.** Move "They believe they disagree" / "But they misunderstood you" out of the hero and down to the venn section ("The illusion of shared understanding", ~lines 545–552) as a caption/subhead — where the visual gives them context (session 21:54). The which-gap is the differentiator; it belongs in the body, not the cold hero.

3. **Add a concrete "unsent message" illustration section**, placed **after** the venn. Fills the missing-instance gap (session 24:24). Generic business/career-coach scenario (NOT Kai's story/figures). Reconstructed phone-chat with a typed-but-never-sent honest message (greyed "unsent" bubble) → client leaves. The unsent bubble is the hero's safety-hook made concrete. Ship **static first** (no motion library / reduced-motion handling); scroll-reveal on the outcome line is a later enhancement.

4. **Remove the `<SignatureWall />` "Meet the Pledgers" section** (~line 628). Generic pledge signatures aren't the proof a coach needs and read as sparse.

5. **Keep** the "Take the Pledge" secondary CTA (hero + final CTA) — founder keeps it deliberately to show the end-goal/mission.

### Surface 2 — Letter venn relabel

6. Relabel the **letter-flow** venn circles (the one shown inside the clarity-letter reading flow Kai reviewed — NOT the landing `MisunderstandingVenn`, whose "What you mean / What they understand" labels are already clear) to **"My private understanding" / "Your private understanding"**, overlap = shared/verified. Fixes the axis-meaning confusion the coach voiced (session 26:30). **Component not yet located** — `/architect` to find the letter-side venn (quick grep did not surface it).

### Surface 3 — Letter calibration reveal copy (`src/app/components/shared/gap-banner.tsx`, SHARED)

7. The reveal-after-commit mechanic is already correct — the problem is **framing only**. Make the author's number legible as a genuine, pre-committed, person-specific estimate:
   - **Replace the "LISTENING CALIBRATION" jargon header** with a plain claim shown *before* the comparison: "Before you answered, {Author} estimated you understand him here at a {N}." The phrase **"Before you answered"** is the load-bearing pre-commitment cue.
   - **Relabel the author marker** from "{Author} {N}" to past-tense **"{Author} estimated {N}"**.
   - **Add a commitment cue** (lock icon or "predicted when writing your letter").
   - **Gap state:** same opener, then "You said {M} — a {gap}-point gap to close."

## Risks / Non-Goals

### Risks
- **`gap-banner.tsx` is shared** (letter reveal + `live-mode-view.tsx`). A copy change ships to all letters and live mode. *Mitigation:* its own test; visually verify both surfaces before ship.
- **The hero reframe shifts the page spine** from listener-repair to safety-hook; the body must echo it or it reads disjointed. *Mitigation:* the unsent-message illustration carries the safety-hook into the body; the which-gap lines relocate to the venn caption rather than vanish.
- **Validation is one friendly coach.** Copy is a hypothesis, not settled. *Mitigation:* ship-and-watch the behavioral signal (Try-a-Clarity-Letter clicks / bookings); do not treat the exact wording as proven.

### Non-Goals
- Do NOT solve the venn's inability to depict **inverted/opposite** understanding (session 28:07) — conscious deferral, documented so it doesn't resurface as a surprise.
- Do NOT use Kai's real story, domain (wellness/inner-child), or the $2K figure in the illustration — generic business-coach scenario only.
- Do NOT change the landing `MisunderstandingVenn` labels — already clear.
- Do NOT remove the "Take the Pledge" CTA.
- Do NOT add animation to the illustration in v1.
- Do NOT change the calibration **mechanic** (reveal-after-commit) — copy/framing only.
- Do NOT add a server endpoint, schema change, or new DB table.

## Done-When

- [ ] Coach hero shows the 3-line arc ("Stop losing customers." / "Being honest when you disagree is risky." / "Make the hard truth safe to say.") with the animated reveal intact, on desktop and 320/375px.
- [ ] The which-gap lines appear as a caption near the venn, no longer in the hero.
- [ ] A concrete unsent-message illustration section renders after the venn (static), generic scenario, greyed unsent bubble, on desktop and 320/375px.
- [ ] The "Meet the Pledgers" SignatureWall no longer appears on `/`.
- [ ] "Take the Pledge" CTA still present (hero + final).
- [ ] Letter-flow venn circles read "My private understanding" / "Your private understanding".
- [ ] Calibration reveal opens with "Before you answered, {Author} estimated you understand him here at a {N}." and the author marker reads "{Author} estimated {N}"; gap state shows the gap sentence.
- [ ] `gap-banner.tsx` copy change verified on BOTH the letter reveal and live-mode-view without layout breakage.
- [ ] Existing gap-banner/live-mode tests pass; a new test covers the reframed copy.

## UX Notes

- **Hero spine:** outcome (line 1) → bind (line 2) → relief (line 3). The relief deliberately resolves the bind (risky → safe), not a different loop (predictability).
- **Illustration is the bind made visible:** the greyed "unsent" bubble is the honest thing the coach couldn't risk. It is the body-level echo of hero line 2.
- **Calibration legibility:** the only change is making a true thing *visible* — that the author committed a number in advance, specifically about this reader. No mechanic change.
- **States to cover:** calibration reveal must read correctly in both perfectly-calibrated and gap states, and in both letter-reveal and live-mode contexts.

## Acceptance Criteria

- [ ] A coach landing cold sees the validated pain (fear-of-honesty → losing customers) above the fold, not an abstract concept.
- [ ] A coach encounters at least one concrete, consequence-bearing misunderstanding instance before the How-it-works section.
- [ ] A letter reader understands, without narration, that the author's calibration number was a real prediction made in advance about them.
- [ ] No surface regresses on mobile-narrow (320px).

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
| Calibration opener | `Before you answered, {Author} estimated you understand him here at a {N}.` | replaces "LISTENING CALIBRATION" header |
| Calibration author marker | `{Author} estimated {N}` | gap-banner |
| Calibration gap line | `You said {M} — a {gap}-point gap to close.` | gap-banner, gap state |
| Letter venn circles | `My private understanding` / `Your private understanding` | letter-flow venn |

**Open sub-decisions [FOUNDER]:**
- Hero `PledgerAvatarStack` (light avatar stack, ~line 515): keep or drop alongside the SignatureWall removal?
- Calibration verb: confirm "estimated" (recommended) vs "predicted"/"assumed".
- Calibration opener pronoun: "him" assumes a male author — needs to derive from author gender or use a neutral phrasing ("…understand them here…"). Flag for `/architect`.
