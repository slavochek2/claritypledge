---
status: week
type: story
rank: 31
created_date: '2026-08-14'
tags: [meet, ready, events, awareness, distribution]
delivery_stage: create-spec
pipeline_ran: [create-spec]
---

# P1083: Live distribution on `/ready` — anonymized, reveal-gated, scoped to events

## Problem

**Situation:** [P1077](done/2026-06-10/p1077_ready_thinking_state_awareness.md) shipped `/ready` — one visitor, one bipolar slider, entirely private. Nothing is recorded, nothing is compared, nothing is shown except your own position.

**Complication:** Reviewing it live, the founder wanted more: a felt sense that other people are also showing up with a range of readiness states — not just a private individual signal. Two failure modes surfaced in the same conversation, both named by the founder himself before being asked about them: (1) showing the aggregate before you answer *anchors* your own answer to the group norm, defeating the honest self-report `/ready` exists to produce; (2) at low N — which is the near-universal case for `/meet`'s 1:1 path, you plus one partner — the "aggregate" isn't anonymous at all, it's just your partner's answer with extra steps.

**Question:** Can a live distribution be shown without reintroducing either failure — and if so, where does it actually belong: `/meet`'s 1:1 path, the event flow ([P1055](p1055_norm_measurement_instrument.md)), or both?

## Appetite

**Blast radius: medium-high.** This is the first backend surface for the `/ready` mechanism family — P1077 was explicitly zero-DB, zero-backend. Needs a table for ephemeral submissions, a write path, a read/aggregation path. Also touches `/meet` — a conditional back button, which explicitly reopens P1077's "do NOT modify `/meet`" non-goal. That reversal is deliberate here, not an oversight, but it's still new blast radius on a route three prior specs (P1016, P1024, P1077) treated as untouchable.

**Reversibility: medium.** The route/table/back-button are all removable. But if an event comes to depend on the distribution being visible mid-session, removing it later has a real cost to that flow — the "not enough people yet" state is the fallback, not a separate thing to design later.

**Decision density: high.** Mechanism and safety rails are settled below (reveal-gating, threshold-gating). Exact numbers, copy, and visualization are open — see UI Contract.

## Solution

**Reveal-gated.** The distribution is shown only *after* the visitor submits their own answer (taps Continue) — never before. This is the founder's own fix for the anchoring-bias objection, proposed mid-conversation before being asked about it, and it's the entire reason this is safe to build at all.

**Threshold-gated.** Below a minimum N, show a neutral "not enough people yet" state instead of any aggregate. This is also what makes `/meet`'s 1:1 case safe *by construction*: N never reaches threshold on a 1:1 path, so the reveal never fires there. No separate code path for "event" vs "1:1" — one mechanism, one threshold, handles both.

**Scope: events first.** `/meet`'s 1:1 path will effectively never clear the threshold — that's correct behavior, not a gap to fill. The feature earns its complexity in the event context (P1055's 90-minute room), where N can be real and the aggregate can carry actual signal.

**Data model.** Ephemeral submissions only: slider value + timestamp, no auth, no identity, short retention window (starting point: last 10 minutes — exact window is a founder decision). The write happens as a side effect of the same Continue tap that already exists in P1077 — nothing is written before that tap, matching P1077's "Continue always proceeds regardless" behavior exactly.

**Visualization: coarse, not precise.** A compressed histogram or a rough "how many / roughly where" — not a scatterplot of exact values. This keeps it a vibe-check, not a leaderboard or a measurement instrument (see Risks — Priming/measurement creep).

**Conditional back button on `/meet`.** Rendered only when arrival came from `/ready` (route state or referrer check) — lets someone revisit `/ready` and see the distribution update as more people join over the course of a session. This is the one, narrow, explicit reversal of P1077's "do NOT modify `/meet`" non-goal.

## Risks / Non-Goals

### Risks

- **Anchoring / conformity bias.** `MITIGATE` — reveal-gating (see Solution). This is the risk the entire spec exists to route around. If reveal-gating is ever bypassed or weakened, the mitigation is gone and the feature actively harms the thing `/ready` was built to produce.
- **Low-N deanonymization.** `MITIGATE` — threshold gate. Below threshold, no aggregate renders, full stop.
- **Priming / measurement creep.** `ACCEPT`, with the same discipline P1055 already uses for its own reveal mechanism (P1055: *"the numbers are not evidence... say 'this is what the room concluded' — never 'this is what is true'"*). Same trade, same guardrail: never present the aggregate as a finding.
- **No-auth abuse.** `MITIGATE` or `ACCEPT` — `[FOUNDER DECISION]`. Without auth there's no accountability; someone could spam submissions to skew the shown distribution. Options: accept it as a low-stakes vibe-check (skew doesn't matter much if nothing depends on precision), or add a lightweight rate limit (by IP, cheap but imperfect). Needs a call before build.

### Non-Goals

- Do **NOT** show the distribution before the visitor's own Continue tap. This is not negotiable — it's the entire safety mechanism.
- Do **NOT** persist any individual answer beyond the retention window. Stays ephemeral. Recording it as a research dataset was explicitly rejected in P1077 (2026-08-13, *"the goal is awareness, not measurement"*) and stays rejected here.
- Do **NOT** require auth to submit or view. `/ready`'s appeal is being a frictionless, no-login entry point — matches P1077's UI Contract.
- Do **NOT** modify `/meet` beyond the single conditional back-button affordance.
- Do **NOT** render any aggregate below the minimum-N threshold — no partial, no "almost enough," no confidence-qualified partial view.
- Do **NOT** show a numeral, percentage, or per-person identity anywhere in the distribution view — same non-goal P1077 already carries for the individual slider, extended to the aggregate.

### Alternatives Considered

| Rejected | Why |
|---|---|
| Show the aggregate before answering (unconditional, upfront) | The anchoring-bias failure mode this whole spec exists to avoid — the founder caught this himself before it shipped. |
| Live numeral/word feedback on your own slider drag, as a substitute for the aggregate | Already discussed and rejected earlier in the same conversation that produced this spec — position feedback on `/ready` stays the moving thumb + fill, no numeral, no live word (P1077 non-goal, reaffirmed 2026-08-14). |
| Record submissions as a research dataset for later analysis | Rejected in P1077's own Alternatives table (2026-08-13). This spec's distribution is live and ephemeral, never a stored dataset — same call, same reasoning. |
| Separate code paths for `/meet`'s 1:1 case vs. events' many-person case | The threshold gate already handles both as one mechanism; special-casing would duplicate logic for no benefit. |

## UX Notes

**Happy path (event context):** land on `/ready` via the event's link → drag slider or leave at Neutral → tap Continue → distribution reveals (inline or a brief interstitial — `[FOUNDER DECISION]`) if N ≥ threshold → continue into the event flow.

**Happy path (`/meet` 1:1 context):** land on `/ready` → drag or leave at Neutral → tap Continue → threshold isn't met → proceeds to `/meet` exactly as P1077 already behaves, with or without a "not enough people yet" message (`[FOUNDER DECISION]` — a message might read as an apology for a feature that was never the point on this path; silence might read as broken).

**Back-navigation:** from `/meet`, a back button — visible only when arrival came from `/ready` — returns to `/ready`; the distribution reflects the current live count, which may have grown since the first visit.

**No error/loading state beyond what P1077 already has**, except: a distribution-fetch failure fails silently to the "not enough people yet" state, never surfaces an error. This is a vibe-check, not a critical path — it should never be able to block or degrade the actual flow into `/meet`.

## UI Contract

| Element | Value | Notes |
|---|---|---|
| Minimum-N threshold | — | `[FOUNDER DECISION: exact number]` — suggest starting around 5 |
| Retention window | — | `[FOUNDER DECISION: exact duration]` — starting point discussed: last 10 minutes |
| Visualization style | Coarse (histogram-like or count + rough position) | `[FOUNDER DECISION: exact treatment]` — never exact-value scatter |
| Below-threshold state | — | `[FOUNDER DECISION: copy, or no UI at all]` |
| Back button (on `/meet`) | Visible only when arrived from `/ready` | `[FOUNDER DECISION: icon/label/exact placement]` |
| No-auth abuse handling | — | `[FOUNDER DECISION: accept vs. rate-limit]` — see Risks |

## Done-When

- [ ] Distribution never renders before the visitor's own Continue tap
- [ ] Below the minimum-N threshold, no aggregate is shown — only the neutral fallback state
- [ ] No individual submission is queryable or visible as an individual value — only the aggregate, and only above threshold
- [ ] Submissions are not retained beyond the configured window (verified by a query after the window elapses)
- [ ] `/meet`'s back button appears only when navigation originated from `/ready`, never otherwise
- [ ] A visitor who never taps Continue still produces zero network requests to any distribution endpoint (matches P1077's zero-DB-until-submission behavior)
- [ ] No numeral, percentage, or per-person identity is ever shown in the distribution view

## Relationship to prior specs

- **[P1077](done/2026-06-10/p1077_ready_thinking_state_awareness.md)** — `/ready` itself. This spec reverses one of its Non-Goals (no DB, no backend) deliberately, for the event context specifically, with reveal-gating and threshold-gating as the safety rails P1077 didn't need because it had no aggregate at all.
- **[P1055](p1055_norm_measurement_instrument.md)** — the event's own reveal mechanism (the P1/P2 gap on staked Points). Different data model (staked Points vs. ephemeral slider submissions) and different question (organizational norm-gap vs. moment-to-moment readiness), but the same underlying move — aggregate a room's positions and reveal something back to it — and the same discipline about not treating the result as a finding about the world. P1055's "See the Clarity Meeting Principle, opt in or out" is listed as step 1 of its flow; P1077's own Open Item asked whether `/ready` sits upstream of that step or is skipped for events. This spec doesn't resolve that routing question — it answers a narrower one (can a distribution exist safely at all) that the routing question depends on.
