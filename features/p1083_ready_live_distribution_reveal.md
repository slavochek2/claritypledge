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

**Decision density: low.** Mechanism and all copy/parameter calls are settled — see UI Contract.

## Solution

**Always visible, no gate.** The distribution renders directly above the slider on page load — before the visitor has answered, regardless of how many people have answered before them, including zero. No reveal-gate, no minimum-N threshold. The visitor sees the current shape of the room (or of nobody, if they're first) and can drag their own slider in response — including toward or away from what they see. That's expected, not a failure mode, once the premise is mood-sharing rather than measurement.

**Two honest framings, not two mechanisms.** The same always-visible view means something different depending on context, and the copy should say so rather than pretend both are "an anonymized crowd":
- **On `/meet` (1:1):** at N=1, "the distribution" is your specific partner's exact answer. Call it what it is — mutual visibility between the two people about to meet — not an anonymized aggregate, because it isn't one. This is arguably the more useful case: knowing your partner isn't up for heavy thinking today is directly actionable going into the conversation.
- **In the event context (P1055's room):** N is large enough that no individual answer is identifiable. This is a real crowd view.

One code path, two copy treatments selected by context (`/meet` vs. event entry) — not two mechanisms.

**Data model.** Ephemeral submissions only: slider value + timestamp, no auth, no identity. Short rolling retention window — **10 minutes** (founder decision, 2026-08-14) — keeps this a live snapshot, not an accumulating dataset — same "nothing persists" spirit P1077 already committed to, just no longer literally zero-write. The write happens as a side effect of the Continue tap, same as P1077. The **read** now happens on page load, before any write — this is the one new invariant an ungated always-visible view requires.

**Visualization: coarse, not precise.** A compressed histogram or a rough "how many / roughly where" — not a scatterplot of exact values, and never a numeral or percentage. Keeps it a mood glance, not a leaderboard (see Risks — Priming/measurement creep, which is now the main risk this spec carries, not anchoring).

**Conditional back button on `/meet`.** Rendered only when arrival came from `/ready` (route state or referrer check) — lets someone revisit `/ready` and see the view update as more people answer over the course of a session. This is the one, narrow, explicit reversal of P1077's "do NOT modify `/meet`" non-goal.

## Risks / Non-Goals

### Risks

- **Priming / measurement creep.** `ACCEPT`, with the same discipline P1055 already uses for its own reveal mechanism (P1055: *"the numbers are not evidence... say 'this is what the room concluded' — never 'this is what is true'"*). Explicitly accepted here too: seeing the room's shape before answering will influence some answers. That's the accepted trade of a mood-sharing frame, not a defect to gate away — see Problem.
- **`/meet`'s N=1 case is not anonymous, and the spec must not describe it as if it were.** `ACCEPT`, addressed by copy/framing (see Solution), not by hiding the view. Mislabeling it as "anonymized" would be the actual risk — the view itself, honestly labeled as mutual partner visibility, isn't a problem.
- **No-auth abuse.** `ACCEPT` (founder decision, 2026-08-14). Without auth there's no accountability, but this is a low-stakes vibe signal, not a decision-critical system — spam requires sustained deliberate effort for a payoff nobody would notice given the coarse dot visualization. Rate-limiting would add real infra (IP tracking, threshold tuning, shared-IP false positives) against a threat with no real consequence. Revisit only if actual abuse is observed.
- **Empty state (N=0, nobody has answered in the retention window).** `ACCEPT` — resolved as no copy at all (see UX Notes / UI Contract), not a gate or an error.

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

```
/READY — always-visible distribution, no gate
════════════════════════════════════════════════════════════════════

┌─────────────────────────┐
│         /ready           │
│                           │
│   ·  ·    ·  ·  ·         │  ← one dot per other respondent,
│   Keep it light…Go deep   │     visible on load, before any answer
│                           │     (N may be 0 — see Empty state)
│  "How up for thinking     │
│   are you right now?"     │
│                           │
│  Keep it light ●──────    │
│         (Neutral)         │
│                    Go deep│
│                           │
│      [   Continue   ]     │
└─────────────┬─────────────┘
              │ tap Continue
              ▼
      ┌───────────────┐
      │ WRITE submission│   ← only write in the flow;
      │ (value, ts,      │     the read already happened on load,
      │  no identity)    │     unconditionally
      └───────┬───────┘
              │
              ▼
        ┌───────────┐
        │   /meet    │
        │ (unchanged │
        │  otherwise)│
        └─────┬──────┘
              │
    arrived from /ready?
        ┌─────┴─────┐
        │ yes        │ no
        ▼            ▼
   [← Back]      (no back button)
        │
        ▼
   back to /ready — view re-fetched,
   may now show the partner's answer
   that wasn't there before
```

**Happy path (either context):** land on `/ready` → distribution renders immediately above the slider, reflecting whoever has answered in the current window (possibly nobody) → drag slider or leave at Neutral, freely influenced or not by what's shown → tap Continue → submission written → proceed to `/meet` or the event flow.

**Empty state (N=0):** no copy at all — the bare axis with zero dots (founder decision, 2026-08-14). A "nobody yet" message announces a shortfall; silence just reads as quiet. Precedent: Apple Music Replay's milestone cards never show a deficient count ("0 responses") — they state a different status or say nothing, never a partial/negative framing of absence.

**Back-navigation:** from `/meet`, a back button — visible only when arrival came from `/ready` — returns to `/ready`; the view reflects the current live state, which may have changed (e.g., the partner has now answered).

**No error/loading state beyond what P1077 already has**, except: a distribution-fetch failure on page load fails silently to the empty state, never surfaces an error, and never blocks the slider or Continue from working.

## UI Contract

| Element | Value | Notes |
|---|---|---|
| Retention window | 10 minutes | Founder decision, 2026-08-14 |
| Visualization style | One dot per other respondent, plotted on a horizontal axis matching the slider's own "Keep it light" ↔ "Go deep" labels — no aggregate marker, no numeral, no percentage | Founder decision, 2026-08-14 — research-grounded, see footnote¹ |
| Empty state (N=0) | No copy — bare axis, zero dots | Founder decision, 2026-08-14 — see Risks / UX Notes |
| `/meet` (1:1) copy | No caption — a single dot on the axis, self-evident | Founder decision, 2026-08-14 — a caption would announce non-anonymity more conspicuously than just showing one honest dot |
| Event copy | No caption — dot density reads as a room on its own | Founder decision, 2026-08-14 — avoids asserting anything in words (P1055 discipline: never claim "this is what's true") |
| Back button (on `/meet`) | Plain "← Back", top-left, visible only when arrived from `/ready` | Founder decision, 2026-08-14 — exact component/pattern (e.g. reuse of an existing header affordance) to be confirmed at `/dev` time |
| No-auth abuse handling | Accept the risk, no rate-limit | Founder decision, 2026-08-14 — see Risks |

¹ **Why this pattern, not a bar or percentage.** Researched real shipped products (2026-08-14): every anonymity-preserving team tool that shows a *normalized* aggregate (Officevibe's 100%-wide segment bar, Slido's decimal average) gates it behind a minimum N of 3–5, because a percentage-normalized bar renders identically at N=1 and N=50 — normalization is specifically what lies at low N. Tools that instead render one glyph per respondent (Simple Poll's `✔✔✔` tally, Slack's `😀 3` reaction pills, Pol.is's one-dot-per-person axis, and the older facilitation pattern of a physical "spectrum line" where each person stands at their point) are count-preserving by construction — they can't misrepresent N, and they degrade gracefully from N=1 up through roughly N=20–50, which covers both this spec's contexts. Mentimeter's "Scales" question type is the closest existing analogue to a bipolar axis with a distribution drawn above it, but its own weighted-average numeral is exactly the thing this spec's Non-Goals rule out — the recommendation strips that numeral and plots individuals instead.

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
