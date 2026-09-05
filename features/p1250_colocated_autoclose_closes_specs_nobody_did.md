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

# P1250: Specs are being closed with the work undone — 23 by the ship tool, 4 more by a record that outran the code

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

**And it is not the only cause.** [P1237](done/2026-06-10/p1237_batch_pipeline_gemini_vs_six_steps.md)
found four *more* artifacts recorded as done, shipped or production-ready that
`git log --all -S` proves have **never existed in this repository on any branch** — a different
mechanism, identical consequence:

| Recorded as | Where | In the repo? |
|---|---|---|
| `get_separate_wavs()` | P552, `status: all-done` 2026-03-19 | never existed |
| `llm_merge.py` | P556, closed *"deployed to prod 2026-03-22"* | never existed |
| `energy_validator.py` | decisions.md 2026-03-22, *"complete with adaptive gates"* | never existed |
| cross-correlation alignment in `audio.py` | decisions.md 2026-03-22, *"production-ready"* | never existed |

That set matters beyond bookkeeping: the 2026-03-22 decision reads *"**No amix. No pyannote for
multi-phone.**"* and the shipped pipeline does both, so the code running today is the option that
entry rejected. And the missing LLM-merge path is the **only** approach ever measured to attribute
the minority speaker — 8 of 10, against 0 of 10 for everything P1237 could actually run.

**Question:** Should closure follow a spec's own completion evidence rather than the branch its
file happens to sit on — what do we do with the 17 auto-closures nobody has audited — and what is
the disposition of the four artifacts whose record outran their code?

## Appetite

**Blast radius:** high, and it compounds silently. A wrongly-closed spec leaves the kanban
asserting work is finished, so nobody schedules it and the next agent to need that capability
rediscovers its absence from scratch — which is exactly the P1237 sequence. **Reversibility:** high
per spec (`chore: reopen pN` commits already exist as precedent). **Decision density:** one founder
call, below.

**The two halves have different urgencies and must not block each other.** The mechanical fix and
the 23-commit audit are the urgent part and depend on nothing. The four March artifacts are a
disposition question whose answer is worth almost nothing this month — the batch pipeline they
belong to has produced no transcript since **2026-07-05**, and every job since 2026-08-29 fails
with *"No files found"* because `RECORD_AUDIO_WHILE_LIVE = false` disables recording
([P1236](p1236_server_side_live_transcription_for_rooms.md)). Ship the fix without waiting for the
verdicts.

## Approach

Three parts. Parts 1 and 2 are independent of each other and of part 3; part 3 blocks nothing.

1. **Audit all 23.** For each, read the closing commit and the spec's completion boxes, and
   classify: legitimately co-implemented / wrongly closed / indeterminate. Reopen the wrong ones
   with a one-line reason, the way `c4e6ceb68` already does. Record the result so this is not
   re-derived a third time.
2. **Change the closure rule.** `ship-gates.sh` gate 2.5 already refuses to merge a spec whose
   boxes are unticked. Phase 2b's auto-close bypasses that judgment entirely — it closes on file
   location. Make co-located closure obey the same evidence gate the primary spec must pass, and
   when a co-located spec cannot pass it, leave it open and say so in the ship output.

3. **Rule on the four March artifacts.** Search outside git before concluding they are gone — a
   deployed Cloud Run revision, a container image, a stale worktree, the conversation history
   stores. The code demonstrably ran in prod in March; it produced the R8FUEQ benchmark. Then one
   verdict each: rebuild / abandon / supersede, with the reason. Reconcile P552 and P556 so they
   stop asserting outcomes their code never delivered.

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
| Part 3's verdicts delay the mechanical fix | MITIGATE | Parts 1-2 ship without part 3; the Done-When items are independent and part 3 carries no code |
| Rebuilding LLM merge on one 8-of-10 benchmark over-reads n=1 | MITIGATE | The 8/10 is a reason to look, not to adopt; any rebuild is re-benchmarked per-speaker against the same ground truth and filed as its own spec |

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
- [ ] Each of the four March artifacts has a written verdict — rebuild / abandon / supersede — with
      its reason, and a search outside git run first so "gone" is a finding rather than an
      assumption
- [ ] P552 and P556 no longer assert outcomes their code did not deliver
- [ ] If any verdict is `rebuild`, it names the per-speaker benchmark that would have to pass and is
      filed as its own spec rather than done here

## Related

- [P1237](done/2026-06-10/p1237_batch_pipeline_gemini_vs_six_steps.md) — went looking for the spend
  cap P1162 claims to have built, found nothing, and recorded the absence.
- [P1162](p1162_cap_claritypledge_gemini_spend.md) — reopened by this work.
- P1251 — filed then folded into this spec the same day; archived as superseded. It covered the
  four March artifacts, which are the same problem class as the 23 auto-closures and did not earn
  a second spec.
- [P1252](p1252_merged_multiphone_audio_is_never_time_aligned.md) — the one concrete code defect
  that came out of the March set; kept separate because it is an audio fix, not a record fix.
