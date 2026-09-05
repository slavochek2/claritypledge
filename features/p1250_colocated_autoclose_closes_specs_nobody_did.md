---
status: week
type: bug
rank: 1000070
workstream: infrastructure
created_date: '2026-09-05'
tags: [process, ship, kanban, cost-control]
delivery_stage: create-spec
pipeline_ran: [create-spec]
drafted_by: opus
exec_model: opus
exec_effort: high
driver: anomaly
---

# P1250: `/ship` auto-closes co-located specs whose work was never done — 23 times, 6 already reverted

## Problem

**Situation:** `git-ops.sh ship` Phase 2b closes every spec whose file sits on the shipped branch,
not only the spec being shipped. The `/ship` skill documents this as expected behaviour
(*"co-located specs auto-close"*). It has fired **23 times**, and **6 of those were subsequently
reopened or reverted by hand** as wrong — P1241, P1044, P1045, P1047, P1048, P929.

**Complication:** Shipping P803 auto-closed four specs in one run. All four carry **zero ticked
completion boxes and 40 unticked ones**:

| Spec | Closed by | Ticked | Unticked |
|---|---|---|---|
| [P1162](p1162_cap_claritypledge_gemini_spend.md) — Gemini spend cap | `43c46d6f9` | 0 | 11 |
| [P828](done/2026-06-10/p828_live_agentic_mode.md) — live agentic mode | `93972fa91` | 0 | 21 |
| [P558](done/2026-06-10/p558_gemini_transcript_speaker_correction.md) — Gemini speaker correction | `08b425d86` | 0 | 8 |
| [P572](done/2026-06-10/p572_ai_point_extraction.md) — AI point extraction | `e0982a026` | 0 | 0 |

Two of those closures have already caused real harm. **P1162 is the Gemini spend cap** — the
control that [P1237](done/2026-06-10/p1237_batch_pipeline_gemini_vs_six_steps.md) found missing
yesterday when it went looking for one, having no idea a shipped spec claimed to have built it.
[decisions.md](../docs/decisions.md) line 5117 describes P1162 as *"open, untouched by this
work"* — written before the auto-close moved it to `done/`. **P558** is the spec P1237's Related
section names as *"should be superseded by whatever this concludes"*; it was closed on 2026-09-03,
before P1237 concluded anything.

**Question:** Should closure follow a spec's own completion evidence rather than the branch its
file happens to sit on — and what do we do with the 17 auto-closures nobody has audited?

## Appetite

**Blast radius:** high, and it compounds silently. A wrongly-closed spec leaves the kanban
asserting work is finished, so nobody schedules it and the next agent to need that capability
rediscovers its absence from scratch — which is exactly the P1237 sequence. **Reversibility:** high
per spec (`chore: reopen pN` commits already exist as precedent). **Decision density:** one founder
call, below.

## Approach

Two halves, and the audit does not depend on the fix.

1. **Audit all 23.** For each, read the closing commit and the spec's completion boxes, and
   classify: legitimately co-implemented / wrongly closed / indeterminate. Reopen the wrong ones
   with a one-line reason, the way `c4e6ceb68` already does. Record the result so this is not
   re-derived a third time.
2. **Change the closure rule.** `ship-gates.sh` gate 2.5 already refuses to merge a spec whose
   boxes are unticked. Phase 2b's auto-close bypasses that judgment entirely — it closes on file
   location. Make co-located closure obey the same evidence gate the primary spec must pass, and
   when a co-located spec cannot pass it, leave it open and say so in the ship output.

`[FOUNDER DECISION: what should happen to a co-located spec that fails the evidence gate — leave
it open silently, leave it open with a warning in the ship report, or refuse the ship until the
co-located specs are moved off the branch. The third is safest and the most disruptive.]`

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| The audit reopens specs that were genuinely finished, creating busywork | MITIGATE | Classify from the spec's own boxes plus the closing commit's diff, not from the title; `indeterminate` is an allowed verdict and stays closed |
| Tightening Phase 2b blocks a legitimate multi-spec ship | MITIGATE | Gate 7c: run the repo's own documented multi-P workflows (`/ship p798 p799`) through the new rule before shipping it, not a synthetic case |
| 17 unaudited closures include ones whose work has since been done anyway | ACCEPT | Reopening a spec whose work landed elsewhere costs one triage pass; the reverse costs a rediscovery |
| P572 has zero boxes of either kind, so the evidence gate cannot classify it | ACCEPT | Specs with no completion section are indeterminate by construction — name them rather than guessing |

**Non-Goals**
- Do NOT change gate 2.5 itself — it works; this is about the path that skips it.
- Do NOT batch-reopen all 23 without reading each one.
- Do NOT re-litigate whether co-located specs should share a branch; that is a worktree-hygiene
  question and this spec is about what closure *means*.

## Done-When

- [ ] All 23 co-located auto-closures classified, each with a written verdict and the evidence it
      rests on; the 6 already reverted are included and confirmed
- [ ] Every spec classified `wrongly closed` is reopened with a one-line reason in the commit
- [ ] Phase 2b applies the same completion-evidence check to co-located specs that gate 2.5 applies
      to the primary spec
- [ ] The new rule is exercised **both** ways before shipping: a co-located spec with unticked
      boxes is left open, and a genuinely co-implemented spec still closes — the second case run
      against the repo's own documented multi-P workflow, not an invented one
- [ ] `/ship`'s skill file no longer describes unconditional co-located auto-close as expected
      behaviour

## Related

- [P1237](done/2026-06-10/p1237_batch_pipeline_gemini_vs_six_steps.md) — went looking for the spend
  cap P1162 claims to have built, found nothing, and recorded the absence.
- [P1162](p1162_cap_claritypledge_gemini_spend.md) — reopened by this work.
- [P1251](p1251_disposition_of_the_four_missing_march_transcription_artifacts.md) — the same
  closure-without-outcome shape from a different cause (recorded as shipped, never committed).
