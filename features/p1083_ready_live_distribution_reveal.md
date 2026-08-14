---
status: week
type: story
rank: 31
created_date: '2026-08-14'
tags: [meet, ready, events, awareness, distribution]
delivery_stage: create-spec
pipeline_ran: [create-spec]
---

# P1083: Live distribution on `/ready` — always visible, no gate

## Problem

**Situation:** [P1077](done/2026-06-10/p1077_ready_thinking_state_awareness.md) shipped `/ready` — one visitor, one bipolar slider, entirely private. Nothing is recorded, nothing is compared, nothing is shown except your own position.

**Complication:** Reviewing it live, the founder wanted more: a felt sense that other people are also showing up with a range of readiness states — not just a private individual signal. An earlier pass through this spec gated that behind two mechanisms (show only after answering; show only above a minimum headcount), reasoning from a measurement-instrument frame — protect an honest individual signal from being anchored or deanonymized. The founder's own correction: `/ready` was never a measurement instrument (P1077's own Solution section: *"the mechanism is affect labeling, not measurement"*) — it's closer to a mood status. *"We don't care if they are hiding or lying."* A mood board shows you everyone's status before you set your own; that's not a bug in the genre, it's the genre.

**Question:** What does an always-visible, ungated distribution need to get right, given it's explicitly not trying to be an unbiased instrument?

## Appetite

**Blast radius: medium-high.** This is the first backend surface for the `/ready` mechanism family — P1077 was explicitly zero-DB, zero-backend. Needs a table for ephemeral submissions, a write path (on Continue), and a read path (on page load, now — see Solution). Also touches `/meet` — a conditional back button, which explicitly reopens P1077's "do NOT modify `/meet`" non-goal. That reversal is deliberate here, not an oversight, but it's still new blast radius on a route three prior specs (P1016, P1024, P1077) treated as untouchable.

**Reversibility: medium.** The route/table/back-button are all removable. Ungating removes a whole state machine (gated/ungated) relative to the earlier draft — fewer states to build, fewer to unwind if reverted.

**Decision density: medium.** The core mechanism is settled (always visible, no gate). What remains: retention window, visualization treatment, and the no-auth abuse question — see UI Contract.

## Solution

**Always visible, no gate.** The distribution renders directly above the slider on page load — before the visitor has answered, regardless of how many people have answered before them, including zero. No reveal-gate, no minimum-N threshold. The visitor sees the current shape of the room (or of nobody, if they're first) and can drag their own slider in response — including toward or away from what they see. That's expected, not a failure mode, once the premise is mood-sharing rather than measurement.

**Two honest framings, not two mechanisms.** The same always-visible view means something different depending on context, and the copy should say so rather than pretend both are "an anonymized crowd":
- **On `/meet` (1:1):** at N=1, "the distribution" is your specific partner's exact answer. Call it what it is — mutual visibility between the two people about to meet — not an anonymized aggregate, because it isn't one. This is arguably the more useful case: knowing your partner isn't up for heavy thinking today is directly actionable going into the conversation.
- **In the event context (P1055's room):** N is large enough that no individual answer is identifiable. This is a real crowd view.

One code path, two copy treatments selected by context (`/meet` vs. event entry) — not two mechanisms.

**Data model.** Ephemeral submissions only: slider value + timestamp, no auth, no identity. Short rolling retention window (starting point: last 10 minutes — exact window is a founder decision) keeps this a live snapshot, not an accumulating dataset — same "nothing persists" spirit P1077 already committed to, just no longer literally zero-write. The write happens as a side effect of the Continue tap, same as P1077. The **read** now happens on page load, before any write — this is the one new invariant an ungated always-visible view requires.

**Visualization: coarse, not precise.** A compressed histogram or a rough "how many / roughly where" — not a scatterplot of exact values, and never a numeral or percentage. Keeps it a mood glance, not a leaderboard (see Risks — Priming/measurement creep, which is now the main risk this spec carries, not anchoring).

**Conditional back button on `/meet`.** Rendered only when arrival came from `/ready` (route state or referrer check) — lets someone revisit `/ready` and see the view update as more people answer over the course of a session. This is the one, narrow, explicit reversal of P1077's "do NOT modify `/meet`" non-goal.

## Risks / Non-Goals

### Risks

- **Priming / measurement creep.** `ACCEPT`, with the same discipline P1055 already uses for its own reveal mechanism (P1055: *"the numbers are not evidence... say 'this is what the room concluded' — never 'this is what is true'"*). Explicitly accepted here too: seeing the room's shape before answering will influence some answers. That's the accepted trade of a mood-sharing frame, not a defect to gate away — see Problem.
- **`/meet`'s N=1 case is not anonymous, and the spec must not describe it as if it were.** `ACCEPT`, addressed by copy/framing (see Solution), not by hiding the view. Mislabeling it as "anonymized" would be the actual risk — the view itself, honestly labeled as mutual partner visibility, isn't a problem.
- **No-auth abuse.** `MITIGATE` or `ACCEPT` — `[FOUNDER DECISION]`. Without auth there's no accountability; someone could spam submissions to skew the shown view. Options: accept it as a low-stakes vibe-check (skew doesn't matter much if nothing depends on precision), or add a lightweight rate limit (by IP, cheap but imperfect). Needs a call before build.
- **Empty state (N=0, nobody has answered in the retention window).** `MITIGATE` — this is a normal UI state to design (not an error, not a gate), most likely to show for the very first visitor after the window resets or on `/meet`'s 1:1 path before the partner has answered.

### Non-Goals

- Do **NOT** persist any individual answer beyond the retention window. Stays ephemeral. Recording it as a research dataset was explicitly rejected in P1077 (2026-08-13, *"the goal is awareness, not measurement"*) and stays rejected here — a rolling live view is not a dataset.
- Do **NOT** require auth to submit or view. `/ready`'s appeal is being a frictionless, no-login entry point — matches P1077's UI Contract.
- Do **NOT** modify `/meet` beyond the single conditional back-button affordance.
- Do **NOT** show a numeral, percentage, or per-person identity anywhere in the distribution view — same non-goal P1077 already carries for the individual slider, extended to the aggregate.
- Do **NOT** describe or label the `/meet` (1:1) view as "anonymized" or "aggregate" anywhere in code, copy, or docs — it is one identifiable person's answer, and the spec's own credibility depends on not fudging that.

### Alternatives Considered

| Rejected | Why |
|---|---|
| Reveal-gated (show only after the visitor answers) + threshold-gated (show only above a minimum headcount) | The spec's own first draft. Reasoned from a measurement-instrument frame (protect an unbiased individual signal) that doesn't apply once the mechanism is explicitly affect-labeling, not measurement — the founder corrected this directly: *"we don't care if they are hiding or lying."* Superseded 2026-08-14, same session. |
| Live numeral/word feedback on your own slider drag, as a substitute for the distribution | Already discussed and rejected earlier in the same conversation that produced this spec — position feedback on `/ready` stays the moving thumb + fill, no numeral, no live word (P1077 non-goal, reaffirmed 2026-08-14). |
| Record submissions as a research dataset for later analysis | Rejected in P1077's own Alternatives table (2026-08-13). This spec's distribution is live and ephemeral, never a stored dataset — same call, same reasoning. |
| Separate code paths for `/meet`'s 1:1 case vs. events' many-person case | One view, one code path, two copy treatments selected by context — see Solution. Separate mechanisms would duplicate logic for no benefit. |

## UX Notes

**Happy path (either context):** land on `/ready` → distribution renders immediately above the slider, reflecting whoever has answered in the current window (possibly nobody) → drag slider or leave at Neutral, freely influenced or not by what's shown → tap Continue → submission written → proceed to `/meet` or the event flow.

**Empty state (N=0):** a neutral, non-apologetic empty view — `[FOUNDER DECISION: exact copy/treatment]`. Should not read as broken or as a missing feature.

**Back-navigation:** from `/meet`, a back button — visible only when arrival came from `/ready` — returns to `/ready`; the view reflects the current live state, which may have changed (e.g., the partner has now answered).

**No error/loading state beyond what P1077 already has**, except: a distribution-fetch failure on page load fails silently to the empty state, never surfaces an error, and never blocks the slider or Continue from working.

## UI Contract

| Element | Value | Notes |
|---|---|---|
| Retention window | — | `[FOUNDER DECISION: exact duration]` — starting point discussed: last 10 minutes |
| Visualization style | Coarse (histogram-like or count + rough position) | `[FOUNDER DECISION: exact treatment]` — never exact-value scatter, never a numeral |
| Empty state (N=0) | — | `[FOUNDER DECISION: exact copy/treatment]` |
| `/meet` (1:1) copy | Framed as partner visibility, not "anonymized" | `[FOUNDER DECISION: exact wording]` — see Non-Goals |
| Event copy | Framed as room/crowd view | `[FOUNDER DECISION: exact wording]` |
| Back button (on `/meet`) | Visible only when arrived from `/ready` | `[FOUNDER DECISION: icon/label/exact placement]` |
| No-auth abuse handling | — | `[FOUNDER DECISION: accept vs. rate-limit]` — see Risks |

## Done-When

- [ ] Distribution renders above the slider on page load, before any answer is submitted, for both the `/meet` and event contexts
- [ ] No individual submission is queryable or displayed with a numeral, percentage, or identity — coarse visualization only
- [ ] Submissions are not retained beyond the configured rolling window (verified by a query after the window elapses)
- [ ] `/meet`'s back button appears only when navigation originated from `/ready`, never otherwise
- [ ] The empty state (N=0) renders correctly and does not read as an error
- [ ] `/meet`'s 1:1 view is never labeled "anonymized" or "aggregate" anywhere in the shipped copy
- [ ] A distribution-fetch failure never blocks the slider or Continue from working

## Relationship to prior specs

- **[P1077](done/2026-06-10/p1077_ready_thinking_state_awareness.md)** — `/ready` itself. This spec reverses one of its Non-Goals (no DB, no backend) deliberately. It also reuses P1077's own stated premise ("affect labeling, not measurement") as the argument for *why no gating is needed* — the same sentence that justified P1077's design now justifies removing the safety rails an earlier draft of this spec added on a mismatched, measurement-instrument assumption.
- **[P1055](p1055_norm_measurement_instrument.md)** — the event's own reveal mechanism (the P1/P2 gap on staked Points). Different data model (staked Points vs. ephemeral slider submissions) and different question (organizational norm-gap vs. moment-to-moment readiness), but the same underlying move — show a room's positions back to it — and the same discipline about not treating the result as a finding about the world (P1055: *"say what the room concluded, never what is true"*, reused directly in this spec's Risks). P1055's "See the Clarity Meeting Principle, opt in or out" is listed as step 1 of its flow; P1077's own Open Item asked whether `/ready` sits upstream of that step or is skipped for events. This spec doesn't resolve that routing question.
