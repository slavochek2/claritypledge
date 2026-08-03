---
status: today
type: story
rank: 1000962.0
workstream: letters
created_date: '2026-08-01'
tags:
  - onboarding
  - letters
  - align
  - calibration
delivery_stage: create-spec
pipeline_ran: [create-spec]
---

# P1025: Self-serve protocol onboarding — AI-assisted, human-scored

## Problem

**Situation:** Onboarding a person into the protocol is founder-delivered. The cost has been
quoted at 10 hours, 90 minutes, and 10 minutes in a single conversation — the real number is
unknown, but it is founder time in every case. `/letter/ck` already exists as a doc delivered
as a letter, so a content vehicle is built; the guided loop around it is not.

**Complication:** Founder-delivered onboarding caps the business at a consulting shape. In the
modelled funnel, delivery is roughly half of all hours spent, LTV stops at one engagement, and
nothing recurs when the customer's team grows. It also means every person who wants to try the
protocol has to get on a call first — which is the same treatment-before-diagnosis inversion
recorded as `[mistake-founder]` this week.

**Question:** Can a person reach a verified comprehension state without founder time — AI doing
the volume of the work, the human supplying the scores and the last mile?

## Appetite

**Medium blast radius** — new flow touching the letter reading path and the `/align` loop.
**Reversible** — additive; the facilitated path is untouched. **Low-medium decision density** —
the two live constraints are already decided (sealed-before-reveal; `user_score` mandatory), and
badging is explicitly out of scope.

**Sequencing is an open founder call, recorded honestly:** zero audits have been run under the
current wedge, and `lean-canvas.md:728` carries the kill criterion *"No one pays after 5 pairs →
problem isn't painful enough to monetize."* We are at 0 of 5. This spec is filed at
`status: today` by founder decision; the argument for running the five audits before building is
in Risks, not suppressed.

## Solution

Wrap the existing `/letter/ck` content in a guided, AI-assisted comprehension loop that follows
the `/align` contract rather than reinventing it.

**The contract, unchanged:** `verified ⟺ min(ai_selfscore, user_score) ≥ 8`, and `user_score` is
**mandatory**. The AI is a transmission instrument, never a proxy — it cannot self-certify.

**The loop, per story:**

1. Reader reads the story.
2. **Reader produces their own paraphrase first — before seeing anything from the AI.**
3. AI produces its paraphrase and its own 0–10 self-estimate.
4. The **diff** is revealed: where the two readings differ.
5. Reader scores their comprehension; the printed result is the min.
6. Below threshold → another pass on the gap, not a pass mark.

Short explainer videos for the curriculum stories are a cheap supporting asset, not the core.
(Their content is unread at spec time — they live as database rows, not files — so this spec
makes no claim about what they say.)

## Risks / Non-Goals

### Risks

- **Acquiescence — the one that voids the whole thing.** If the AI's paraphrase is visible before
  the reader commits theirs, the score measures agreement with the AI, not comprehension of the
  story. Same failure mode already flagged on P1012's predicted stories. *Mitigation:* sealed
  ordering enforced server-side, plus a test asserting the AI paraphrase is absent from the
  payload before the reader's is committed — not merely hidden in the UI.
- **Self-certification drift.** Any shortcut where the AI supplies or defaults `user_score` turns
  the measurement into theatre. *Mitigation:* enforce mandatory `user_score` at the data layer,
  not the component.
- **Building ahead of demand.** No audit has run under the current wedge; the reveal may not fire
  at all, in which case this automates a motion that gets killed. *Mitigation:* none available in
  the build — it is a sequencing bet, and the adversarial review commissioned 2026-08-01 is
  testing exactly this claim.
- **Unknown value anchor.** The pitch anchors on "one wrong feature costs more than €3k"
  (`decisions.md:684` — an anchor argument; the price itself is `[FOUNDER DECISION]`, and the only
  floor ever attached to a live offer is **€1500**, `goals.md:9`/`:13`) while
  `hypotheses.md` H-WTP-Pain records **28 sessions / zero cost named**. Cheaper onboarding does not
  fix a value proposition no buyer has priced. *Mitigation:* out of scope here; flagged so this
  spec is not mistaken for a revenue fix.

### Non-Goals

- Do NOT issue or couple to badges — `H-BadgePropagates` is deferred to phase-2 on a base of zero
- Do NOT let the AI supply, default, or infer `user_score`
- Do NOT reveal the AI's paraphrase before the reader has committed their own
- Do NOT change the facilitated `/live` path
- Do NOT design the journey map here — that is `/ux`, after this spec
- Do NOT re-specify the `/align` scoring contract; reference it

## Done-When

- [ ] A person with no prior exposure completes `/letter/ck` and reaches a recorded
      `min(ai_selfscore, user_score)` per story, with zero founder time spent
- [ ] The AI paraphrase is provably absent from the response payload until the reader commits
      theirs (asserted at the API level, not the UI)
- [ ] `user_score` cannot be written by anything but the reader
- [ ] A below-threshold result routes to another pass, not to completion
- [ ] The founder-hours cost of onboarding one person is measured and recorded — replacing the
      three contradictory figures currently in circulation

## UX Notes

- **Commit-then-reveal is the spine of the interaction**, and the copy must make it feel like the
  point rather than a gate: you write yours, then you see the difference.
- **States:** unread · read-not-paraphrased · paraphrase-committed (AI hidden) · diff-revealed ·
  scored-below · scored-verified.
- The diff is the product moment. It should be the most designed surface in the flow.
- A low score must read as the instrument working, not as the reader failing.

## Acceptance Criteria

- [ ] A reader can complete onboarding end-to-end without contacting the founder
- [ ] Scores recorded per story, min displayed, below-threshold loops back
- [ ] Sealed ordering holds under a direct API call, not just in the UI
- [ ] Existing letter and `/live` flows are unchanged (regression covered)
