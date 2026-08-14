---
status: backlog
type: comment
rank: 52
created_date: '2026-04-10'
tags:
  - badge
  - propagation
  - viral
  - vision
delivery_stage: create-spec
pipeline_ran:
  - create-spec
---

# P685: Badge & Propagation Vision

## Problem

**Situation:** The Clarity Pledge has 11 signers and zero practice habits. The Pledge is a public promise with no verification attached — signing it doesn't require demonstrating comprehension. Workshop #1 is imminent and needs to optimize for propagation, not just conversion.

**Complication:** Without a propagation mechanism, workshops produce experiences that evaporate. The Clarity Flip is interpersonal — a person who flips wants to flip others. But there's no artifact to carry the flip forward, no tracking of who verified whom, and no quality gate on who can verify others. The current Pledge doesn't create a chain. Meanwhile, the friction required for meaningful verification (~45 min to receive, ~2 hours to become a verifier) may kill virality — or may strengthen it through effortful initiation.

**Question:** What is the minimum badge system that makes the Clarity Flip propagate through relationships — and how do we design workshop #1 to measure whether it will?

## Appetite

High blast radius (changes the growth model from conversion-first to propagation-first). Medium reversibility (badge is additive — doesn't break existing pledge flow). High decision density — many open design questions documented below.

## The Emerging Model

### Two-Level Badge

**Badge to HAVE (~45 min):** Demonstrated comprehension of stories + took positions on points after verified understanding. Proves you "get it." Earned through /live session with a badge-holder.

**Badge to GIVE (~2 hours):** You have your OWN stories explaining YOUR positions. Now you can verify others — because you bring your own perspective, not proxy the original author's. AI-assisted story drafting from /live transcription reduces friction: verifier asks "why?" → transcription captures reasoning → AI suggests story drafts → person edits/approves.

### Why Two Levels

Without own stories, the chain degrades — everyone passes around the same 9 stories forever. With own stories, each node adds new content. The chain is generative, not repetitive. Each person's badge carries their unique perspective into the next verification.

### The Chain

```
A (founder) creates stories explaining positions on points
    → A verifies B on A's stories via /live → B is badged (HAS)
    → B files own stories (AI-assisted from transcript) → B is badged (GIVES)
        → B verifies C on B's stories via /live → C is badged (HAS)
        → C files own stories → C is badged (GIVES)
            → chain grows, each node adds new content
```

### Friction Analysis

| Step | Time | Reducible? |
|------|------|-----------|
| Receive link, read content | ~15 min | Yes (shorter content, better UX) |
| /live verification session | ~30 min | No — verification IS the product |
| File own stories (to become verifier) | ~60-90 min | Partially — AI drafts from transcription |
| **Total to HAVE** | **~45 min** | |
| **Total to GIVE** | **~2 hours** | |

Comparable to other practice-movements: NVC (2-day workshop), CrossFit (1-hour class), meditation teacher training. High-effort initiation increases retention (initiation/sacrifice studies). Viral coefficient (R₀) matters more than per-person time — if each person badges 1.2+ others, slow exponential growth works.

### Relationship to Existing Artifacts

| Artifact | Role after badge split |
|----------|----------------------|
| **Badge** | Earned. Proof you demonstrated comprehension. Low friction, spreads fast. |
| **Pledge** | Optional commitment AFTER badge. "I commit to ongoing practice." Higher bar, slower spread. Badge is prerequisite. |
| **Partner Agreement** | Commitment between two specific people. Can require badge or not (open question). |

## Open Design Questions

These are first-class content — to be resolved by workshop observations and founder decisions, not by building.

### Q1: What content is certified on?

Current: 9 stories with points and anti-points. But different people have different knowledge gaps — one point won't flip everyone. Is badge a progress bar across points, or binary on a subset?

**Sub-question:** Which points are most valuable for certification? Workshop #1 should reveal this — observe which point produces the biggest position switch + emotional reaction.

### Q2: Understanding vs. agreement separation

Verifying understanding of a story ≠ agreeing with its point. Agreeing with a point ≠ filing your own story about it. The product's core claim is that these must not be mixed. But we haven't proved that separation matters in practice. Workshop #1 can observe: do participants conflate "I understood" with "I agree"?

### Q3: Who can certify others?

Options:
- A) Anyone with badge-to-GIVE (viral, mechanism gates quality)
- B) Only founder (bottleneck, doesn't scale)
- C) Founder certifies first wave, they certify next (controlled)

Recommendation: A — if the content is the gatekeeper, the certifier just needs to have passed. But unproven.

### Q4: Does Pledge require Badge?

If yes: existing 11 pledgers have pledged without badge. Options:
- Grandfather (keep pledge, badge is separate)
- Gentle nudge ("earn your badge" CTA on profile)
- Badge display independent of pledge display

If no: badge and pledge remain independent. But then pledge stays decorative.

### Q5: Can Partner Agreement be signed without Badge?

The Agreement is a commitment between two specific people in an existing relationship. Does requiring badge gate access to the conversion action? Or does the Agreement work independently (the relationship IS the motivation, badge is orthogonal)?

### Q6: Chain visibility

Track `verified_by_user_id` in DB (yes — cheap, valuable data). Display who verified whom on profile? One line of code but: what's the VALUE of displaying it vs. just tracking it? Does visible chain create status competition (good) or performance anxiety (bad)?

### Q7: What if someone wants to shortcut?

Someone arrives and wants to sign the Pledge or Partner Agreement without earning the badge. Do we allow it? Options:
- Show they don't have a badge (social signal)
- Block pledge/agreement until badged
- Allow everything optionally — badge is additive signal, not gate

### Q8: Badge versioning

Points evolve. If the set of certification points changes:
- Old badges stay valid (you proved comprehension at that time)
- Badge records which point versions were verified
- No expiry — introduces badge v2 later if needed

### Q9: Friction vs. virality tradeoff

~2 hours to become a verifier. Can this be viral? In social media sense: no. In practice-movement sense: possibly (NVC, meditation, AA all propagate through high-effort personal transmission). R₀ >1 is the test, not speed-per-share.

**Key workshop observation:** After the flip, how many specific people does each participant name when asked "Who would you want to do this with?" 3-5 names = R₀ >1 plausible. 0-1 names = propagation motivation doesn't exist regardless of friction.

### Q10: Post-badge habit formation

Badge proves comprehension at a point in time. But the goal is ongoing practice. Ideas explored (each may become separate specs):
- **Structured weekly journaling:** "Which conversations this week contained important agreements/disagreements? Did I verify understanding?" Surfaces WHERE verification applies in real life.
- **Cohort/clarithon model:** Participants compete to verify more people in first 10 hours of volunteering. Intra-cohort competition. Cohorts can include developers who improve the app (hackathon hybrid).
- **Volunteer tutor assignment:** High-R₀ participants (named many people) get assigned a tutor to help them convert.

### Q11: Does badge make the Pledge problem clear?

Today's exploration surfaced that the Pledge header ("We all crave being understood. Let's commit to listen.") doesn't deliver on the solution promise. The three-line pitch chain:
1. Hook: "How do you know you understood someone — if they don't know you did?"
2. Why it persists: checking is socially costly — pretending is locally rational
3. What changes: the Badge/Pledge makes checking safe and pretending costly

With badge/pledge split, each artifact gets its own problem statement. Badge = "prove you understood." Pledge = "commit to ongoing practice." The copy confusion resolves when the artifacts separate.

## Workshop #1 Observation Protocol

Workshop optimizes for **propagation signal**, not conversion. Key observations:

1. **Which point produces the biggest flip?** → determines certification content
2. **Can they explain the core insight in their own words?** → badge comprehension test
3. **"Who specifically would you want to do this with?"** → R₀ measurement (added to facilitator-guide.md)
4. **"Would you want to do this with them yourself, or want me to?"** → peer certification viability
5. **"What would you send them to start?"** → content/letter spec from users' mouths

## Implementation Staircase

Each step is independently valuable. Cut anywhere — each step tests a different question.

### Step 0: Workshop #1 (no build, already planned)
Run workshop with propagation observation protocol (see above). But Step 1 should be ready so you can badge people AT the workshop and observe sharing behavior.

### Step 1: Auto-certification from /live (~P686, supersedes this sketch)
**Superseded by P686** — see P686 for the actual Step 1 implementation. Key changes from this original sketch: auto-certification from /live free-mode 10/10 (not manual Certify button), `badge_points` table with per-point progress (not binary `has_badge`), `is_certifier` gate, agreement requirement.

**Key observations enabled:**
- Do people want to share their badge? (Do they click the share CTA?)
- Do they want to badge others? (Do they use the Certify button?)
- What's their reaction to being badged? (Celebration? Indifference?)
- Outside workshop: offer badge 1:1 and observe same signals

### Step 2: Content-gated badge (~2-3 days, requires Step 1)
**Tests:** Does structured content improve verification quality?
- "Start badge session" mode in /live → loads specific calibration points as verification content
- Badge records which points were verified (versioned)
- Still manual certification — verifier confirms comprehension after /live
- Badge becomes a progress bar: N of M points verified

### Step 3: AI-assisted story drafting (~3-5 days, requires Step 2 + transcription pipeline)
**Tests:** Does AI-assisted story creation reduce friction enough for "badge to GIVE"?
- After badge /live session, transcription captures "why" behind positions
- AI generates story drafts from transcript
- Person edits/approves → their own stories filed
- This unlocks "badge to GIVE" — person now has own content to verify others on
- The chain becomes generative (each node adds new stories)

### Step 4: Verification graph (~1-2 days, any time after Step 1)
**Tests:** What does the actual propagation graph look like?
- `badges` table: user_id, verified_by, points_verified[], session_id, created_at
- Track chain data. Display later (or never — depends on Q6 answer)
- Measure actual R₀ from badge-to-badge conversions

### Step 5+: Future layers (separate specs when needed)
- Post-flip journaling (structured weekly reflection) → separate spec
- Cohort/clarithon competition model → separate spec
- Volunteer tutor assignment → separate spec
- Badge-gates-pledge requirement → separate spec (after Q4 resolved)
- Chain visualization → separate spec (after Step 4 data collected)

## Risks / Non-Goals

### Risks
- Over-designing the badge kills the simplicity of the flip experience. Mitigation: Step 1 is just a DB flag + one button + one profile indicator. Minimal UX.
- Effortful initiation filters out casual interest but also filters out people who would propagate. Mitigation: measure R₀ separately from badge completion — some may propagate informally without completing the full badge flow.
- Building Step 1 before workshop creates sunk cost bias ("we built it so it must work"). Mitigation: Step 1 is ~1 day. Treat as disposable experiment, not investment.

### Non-Goals
- Do NOT build beyond Step 1 before workshop observations confirm propagation signal
- Do NOT change existing pledge flow — badge is additive
- Do NOT design the full verification graph visualization (track data, display later)
- Do NOT gate pledge or agreement on badge (Q4, Q5 unresolved — keep independent for now)

## Done-When

- [ ] Step 1 built and deployed before workshop #1
- [ ] Workshop #1 completed with propagation observation protocol
- [ ] Badge sharing behavior observed (do badged people share/spread?)
- [ ] R₀ signal measured (how many names per participant)
- [ ] Peer certification viability assessed (do they want to verify others themselves?)
- [ ] Open questions Q1-Q11 have workshop-informed answers (or informed "still open")
- [ ] Decision: proceed to Step 2+ or not, based on observations
- [ ] If yes: implementation specs created for subsequent steps

## Deliverable

Post-workshop decision document answering: Does the flip propagate? Do badged people share? What's the R₀? Is peer certification viable? Which points matter most? Based on answers: proceed up the staircase or document why propagation doesn't work and what alternative growth model to pursue.

## Related

- [decisions.md 2026-04-09](../docs/decisions.md): Badge/Pledge split decision
- [lean-canvas.md §1](../docs/lean-canvas.md): Badge + Pledge (Adoption & Identity)
- [facilitator-guide.md](../docs/facilitator-guide.md): Propagation signal question added
- P567: False belief workshop curriculum (the content being certified on)
- P606: The Clarity Flip Workshop (the format being tested)
- Future: Post-flip journaling spec (structured weekly reflection as habit mechanism)
