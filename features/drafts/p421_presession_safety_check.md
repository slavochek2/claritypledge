---
status: backlog
type: story
rank: 0.5
workstream: C1
created_date: '2026-02-24'
tags:
  - live
  - psychological-safety
  - onboarding
  - mediation
locked_at: '2026-03-02T14:11:11.068Z'
---

# P421: Pre-Session Psychological Safety Check

## Problem

Calibration requires cognitive access. When one or both parties enter a /live session emotionally flooded, the session produces noise, not signal — or breaks trust. There is currently no mechanism to detect or address this before the session starts.

## Solution

Before a /live session begins, both participants rate how calm and safe they feel (0–10). If either scores below a threshold (~8), the app offers a guided 1-min grounding exercise (breathing, eyes closed) and re-checks. If still below threshold, recommends postponing. Could evolve into mini-mediation guidance with explicit commitments (no interrupting, withhold premature judgment, etc.).

## Technical Notes

### Mini Pledge — Shared Goal Reaffirmation

The commitment ritual takes a specific form: both participants explicitly commit that their shared goal for this session is **cognitive understanding** — not agreement, not emotional resolution.

**Mechanism:** A point (or lightweight UI step) where both press to confirm: *"In this session, I commit to reaching cognitive understanding — not agreement."*

**Why it creates psychological safety (Pinker's common knowledge):** Private intent isn't enough. Safety requires that both people know it, *and* both know the other knows it. The shared act of committing creates that common knowledge — neither person needs to fear the session will be weaponized for something else.

**Definition anchor:** The point can link to the sister story point (the three meanings of "understand": cognitive / emotional / agreement) so "cognitive understanding" isn't abstract — it carries a shared definition both people already agreed to.

**Design note:** Could be as simple as both pressing "I'm ready to listen" simultaneously. The act of pressing *together* is what creates the common knowledge — not just reading the words.

### Exit Ramp — Face-Saving Retreat (Golden Bridge)

Emotional safety is not only an *entry gate* (the pre-session regulation check) — it is also the *in-session exit ramp* that makes changing one's mind survivable. Sun Tzu: *"Build your opponent a golden bridge for his retreat."* A person who fears looking defeated will not update even once they understand, so the mechanism must make softening, conceding, or admitting a misunderstanding feel like the win — never a loss.

**Mechanism implications (product, not just facilitator):**
- When a participant's understanding rating rises or their position softens, the UI/coaching frames it as success ("you updated — that's the point"), never "you were wrong."
- The other party is never given a moment to spike the ball; movement by one side is surfaced as courage, not concession.
- Reward asymmetry: vulnerability is rewarded immediately; a retreat is never punished. This is emotional safety as exit-ramp design, distinct from the entry-gate regulation check above.

(Source: Enemies Project facilitation analysis — `.private/docs/analysis/enemies-project-facilitation.md`.)

## Open Questions

- Can people accurately self-report when flooded? (Self-assessment may fail exactly when needed most — consider proxy signals: time since last conflict mention, language tone in chat)
- Should both parties see each other's scores, or only a combined "ready / not ready" signal?
- What's the right threshold? 8 mirrors the /live verification threshold — worth keeping consistent.
- Mini pledge: same UI step as safety check, or separate micro-step before session?
- Does the pledge repeat every session, or only first-time?

## Acceptance Criteria

- [ ] Both participants rate calm + safety (0–10) before session starts
- [ ] If either < threshold, guided grounding exercise is offered
- [ ] After exercise, re-check scores
- [ ] If still below threshold, session recommends postponing with no penalty
- [ ] If both ≥ threshold, session proceeds normally
- [ ] Optional: brief commitment ritual (don't interrupt, withhold judgment)
- [ ] Exit ramp: when a participant's understanding rating rises or position softens, it is framed as success (not "you were wrong"), and the other party cannot spike the ball

## Testing

_How to verify this works._
