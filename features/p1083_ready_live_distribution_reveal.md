---
status: in-progress
type: story
rank: 31
created_date: '2026-08-14'
tags: [meet, ready, events, awareness, distribution]
delivery_stage: dev
pipeline_ran: [create-spec, dev]
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

┌───────────────────────────┐
│          /ready            │
│                            │
│  "How up for thinking      │
│   are you right now?"      │
│                            │
│              ·   ···       │  ← one mark per other respondent,
│      ━━━━━━━◯━━━━━━━━━━    │     ON the visitor's own track,
│  Keep it light  Neutral    │     visible on load before any answer
│                   Go deep  │     (N may be 0 — nothing renders then)
│                            │
│      [   Continue   ]      │
└─────────────┬──────────────┘
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
| Visualization style | One mark per other respondent, rendered **on the slider's own track** — same ringed-circle shape as the visitor's thumb at roughly half its size. No aggregate marker, no numeral, no percentage. Marks sharing a value form a tapered heap; height is capped and a larger crowd grows **wider**, never taller. Marks on the visitor's own value lift clear of the thumb rather than hiding under it | Founder decision, 2026-08-14 — research-grounded, see footnote¹. Placement/shape revised 2026-08-17, see footnote² |
| Empty state (N=0) | No copy — bare axis, zero dots | Founder decision, 2026-08-14 — see Risks / UX Notes |
| `/meet` (1:1) copy | No caption — a single mark on the visitor's own track, self-evident | Founder decision, 2026-08-14. Briefly reversed and then **restored 2026-08-17** — see footnote³ for what was tried and the residual accepted |
| Event copy | No caption — mark density reads as a room on its own | Founder decision, 2026-08-14, restored 2026-08-17 alongside the `/meet` row. Asserts nothing in words (P1055 discipline: never claim "this is what's true") |
| Back button (on `/meet`) | Plain "← Back", top-left, visible only when arrived from `/ready` | Founder decision, 2026-08-14 — exact component/pattern (e.g. reuse of an existing header affordance) to be confirmed at `/dev` time |
| No-auth abuse handling | Accept the risk, no rate-limit | Founder decision, 2026-08-14 — see Risks |

¹ **Why this pattern, not a bar or percentage.** Researched real shipped products (2026-08-14): every anonymity-preserving team tool that shows a *normalized* aggregate (Officevibe's 100%-wide segment bar, Slido's decimal average) gates it behind a minimum N of 3–5, because a percentage-normalized bar renders identically at N=1 and N=50 — normalization is specifically what lies at low N. Tools that instead render one glyph per respondent (Simple Poll's `✔✔✔` tally, Slack's `😀 3` reaction pills, Pol.is's one-dot-per-person axis, and the older facilitation pattern of a physical "spectrum line" where each person stands at their point) are count-preserving by construction — they can't misrepresent N, and they degrade gracefully from N=1 up through roughly N=20–50, which covers both this spec's contexts. Mentimeter's "Scales" question type is the closest existing analogue to a bipolar axis with a distribution drawn above it, but its own weighted-average numeral is exactly the thing this spec's Non-Goals rule out — the recommendation strips that numeral and plots individuals instead.

² **Why the marks sit ON the track, not in a row above it (revised 2026-08-17).** The first
implementation followed this contract literally — a standalone dot row above the question,
carrying its own copy of the "Keep it light" / "Go deep" labels. Reviewed live, it failed to
communicate anything: duplicating the pole labels made the page read as *two unrelated
controls*, the marks floated on an implied axis with no line to be a position on, and the row
sat **above the question**, answering something the visitor had not yet been asked. Moving the
marks onto the slider's own track fixes all three at once — one ruler, one label row, and the
visitor decodes a mark by recognising it as a smaller sibling of the thumb they are about to
drag. This is what keeps "no caption" viable; the caption decision below was never wrong, but
it depended on the drawing actually reading as one axis, which the first version did not.

Two further corrections came from independent visual QA (2026-08-17), both worth recording
because both were invisible to the implementing agent:
- **7px pale-grey marks read as "stray pixel / screen dust / a ruler notch"** — never as a
  person. Against a 28px solid thumb the size ratio was ~5x, so the family resemblance the
  whole no-caption argument rests on did not exist. Marks are now the thumb's own blue,
  ringed, at roughly half its size.
- **An even grid reads as an app icon.** 12-on-one-value first packed into a 3x4 rectangle
  and reviewed as a drag-handle glyph or QR fragment. Rows now taper (5-4-3), which reads as
  a pile of people rather than a UI control.
- **Dimming the marks before first interaction backfired.** It was added to answer "seeing
  them before I answer is weird", but first paint is the one moment they have to land. The
  ordering fix (question first, marks below it) already addresses that concern; dimming is
  dropped. Their marks are solid because they answered — the visitor's thumb stays hollow
  because they have not, and that contrast now carries the state.

³ **A caption was tried and removed (2026-08-17).** Four independent visual-QA passes took the
marks from unreadable to structurally clean — discrete, countable, one consistent glyph, never
fusing, never colliding with the question, never hidden under the thumb. Every *rendering*
objection was fixed. What survived all four passes was semantic: shown a single mark cold, the
reviewer's ranked guesses were "a snap-point marker", "a status dot", "a decorative end-cap" —
"another person" came fourth. Geometry can say *something is at this position*; it cannot say
*someone*. On that basis a short neutral caption was added.

**The founder removed it**, judging the marks self-evident once they sit on the visitor's own
track. That call stands and is the shipped behaviour; the original UI Contract rows above are
restored verbatim in effect. It also has evidence the reviewer structurally could not: the
reviewer judged cropped screenshots in isolation, while a real visitor is on a page that asks
a question, holds a slider they are about to drag, and is minutes from a conversation. Whether
that context does the work the caption would have done is exactly the open question.

**The residual, recorded so it is not rediscovered from scratch.** If live use shows visitors
misreading a lone mark, the fix is one line — a caption constrained to carry no count, no
percentage, no identity, and never the words "anonymized" or "aggregate", rendered only when
N>0 so the empty state stays wordless. A test now asserts the visible column's exact wording,
so a caption cannot reappear by accident; that test is where to start.

A first-visit-only hint was considered and rejected: it adds per-visitor stored state and a
second code path to a mood glance, and anyone returning after the 10-minute window sees nothing.

## Done-When

- [x] Distribution renders on the slider on page load, before any answer is submitted, for both the `/meet` and event contexts — one render path, no context prop: the UI Contract sets both contexts' copy to "no caption," so there's nothing for a context switch to change visually.
- [x] No individual submission is queryable or displayed with a numeral, percentage, or identity — coarse visualization only
- [x] Submissions are not retained beyond the configured rolling window (verified by a query after the window elapses) — verified directly against the test DB across all three enforcement layers: a row backdated 11 minutes is invisible to an anon-key read (RLS SELECT filter), a `pg_cron` job hard-deletes expired rows server-side, and a column-level `GRANT INSERT (value)` (added after an adversarial review found the row-level `WITH CHECK (true)` alone let a client forge `created_at` and defeat both of the other two layers permanently) blocks the client from ever setting that column in the first place
- [x] `/meet`'s back button appears only when navigation originated from `/ready`, never otherwise
- [x] The empty state (N=0) renders correctly and does not read as an error
- [x] `/meet`'s 1:1 view is never labeled "anonymized" or "aggregate" anywhere in the shipped copy
- [x] A distribution-fetch failure never blocks the slider or Continue from working

## Relationship to prior specs

- **[P1077](done/2026-06-10/p1077_ready_thinking_state_awareness.md)** — `/ready` itself. This spec reverses one of its Non-Goals (no DB, no backend) deliberately. It also reuses P1077's own stated premise ("affect labeling, not measurement") as the argument for *why no gating is needed* — the same sentence that justified P1077's design now justifies removing the safety rails an earlier draft of this spec added on a mismatched, measurement-instrument assumption.
- **[P1055](p1055_norm_measurement_instrument.md)** — the event's own reveal mechanism (the P1/P2 gap on staked Points). Different data model (staked Points vs. ephemeral slider submissions) and different question (organizational norm-gap vs. moment-to-moment readiness), but the same underlying move — show a room's positions back to it — and the same discipline about not treating the result as a finding about the world (P1055: *"say what the room concluded, never what is true"*, reused directly in this spec's Risks). P1055's "See the Clarity Meeting Principle, opt in or out" is listed as step 1 of its flow; P1077's own Open Item asked whether `/ready` sits upstream of that step or is skipped for events. This spec doesn't resolve that routing question.
