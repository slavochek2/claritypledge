---
status: week
type: task
rank: 41
created_date: '2026-10-16'
tags: [process, review, skills, reviewers]
disclosure: public
severity: medium
delivery_stage: create-spec
pipeline_ran: [create-spec]
drafted_by: opus
exec_model: opus
exec_effort: high
driver: anomaly
---

# P1505: The end-of-build review standard lives in the founder's head and is re-typed every build

## Problem

**Situation:** At the end of a build the founder asks, by hand, for the same review. It has these parts:
- a Codex review and a Gemini 4 Argon review (Opus as stakes rise)
- technical correctness and code quality
- design-system consistency and reuse of existing components
- cutting unnecessary text and turning it into visuals
- finding UX problems from the user's point of view before the founder sees them

None of the build commands runs this. A grep over `.claude/commands/slava/build/` and `.claude/rules/`
for `codex-review`, `delegate-gemini` and `ask-model` finds only `.claude/rules/model-effort.md`, a routing rule
that runs no review. `/dev` and `/fix` call `/finish code`, which is one Sonnet subagent working from
`finish/criteria/code.md`.

**Complication:** The ask is frequent, it is growing, and it gets missed. History search (`~/.agents/bin/hist`, all four stores, 2026-10-16):

| measure | value | how known |
|---|---|---|
| founder-typed end-of-build review asks | **145 in 119 sessions**, 2026-08-21 → 2026-10-16 | measured; ±15 on the end-of-build vs pre-build judgment |
| per month | Aug 7 (11 days) · Sep 68 · **Oct 70 in 16 days (4.4/day)** | measured |
| reviewer named | Codex 110 · Gemini/Argon 81 · both 52 | measured |
| asks naming at least one lens beyond the model (correctness, quality, reuse, text→visual, user view) | 27, of which 21 in October | measured; low count because typos defeat the regex |
| where | cp 123 · pp 21 · other 1 | measured |
| re-asks because a part was missed | 7, all in October | measured, each quote confirmed by a direct `hist` query |

It is not just the typing. A review left out or run too early has let defects through:
- [decisions.md](../docs/decisions.md) 2026-10-12: a review ran after round 1 only, and a Codex run then found two MEDIUM bugs that had already reached "ready".
- 2026-10-14: Codex found HIGHs that `/finish` and Gemini both passed, and Gemini passed a fail-open that `/finish` caught.
- 2026-10-16: on P1503, Opus, Argon and Codex each found blockers the other two missed.

**Question:** Where should this standard live, so that every build gets it without the founder saying it, and with no second copy that drifts?

> Founder, 2026-10-16, verbatim: *"i have requested many times that everything is reviewed with at the end with gemini for argon and podx … technically … coding quality … visually in terms of UX UI from perspective of the user"*
>
> Founder, 2026-10-05: *"maybe worth visually examining with UX, UI, Codex, Reviewer, an Opus Reviewer tool. Because I asked many, many times for that"*
>
> Founder, 2026-10-13: *"review with codex for both usability, simopligcity, consistency of designs with cp , resuse of compents , and ogod flow and lint tests etc.."*

**Severity: medium.** No user is harmed directly. The cost is the founder's attention, every day and rising, plus defects that reach the founder when they should have been caught first.

**Expected attention saved:**

| saving | estimate | label |
|---|---|---|
| typing | ~26 s per ask, ~2 min/day at October's rate | the history agent's estimate (review sentences only, assumed 40 wpm typed / 130 wpm dictated), **not re-derived** |
| typing, upper bound | whole messages: 2,441 typed + 16,953 dictated words, ~191 min over 57 days | word counts re-derived |
| re-asks | 7 in October, each one extra turn plus a late review cycle | unmeasured beyond the count |
| the larger share | defects found by the founder at UAT instead of by a reviewer, and not having to wonder *"did it get reviewed?"* | **UNTESTED**; measured by the Success Measure below |

## Appetite

- **Blast radius:** every future build in cp, plus pp builds if the file is global. A bad standard costs every build, either in noise or in missed findings.
- **Reversibility:** high. These are prose files and pointer lines, reverted with git.
- **Decision density:** low to medium. Three founder calls are marked below.

## Existing machinery: extend, don't duplicate

| Already exists | Covers | Missing for this standard |
|---|---|---|
| `/finish` (SKILL.md + `criteria/code.md`) | Runs inside `/dev` step 9.5 and the `/fix` QA gate. Classifies changes by path (UI vs not). The code criteria already ask for code quality, a button matrix, "component reuse" (similar code in 2+ places) and UX flow completeness. Writes the `.finish-reviewed` stamp keyed on sha. | No second model: one Sonnet subagent only. No search for an existing analog of each **new** element. No text-cut or visual lens. No blind user-view walk. No reviewer choice by stakes. |
| `/slava:think:adversarial-review` | Hostile reviewers sized by stakes for a mechanism, and how to launch Codex and Gemini (each as its own background call, output checked non-empty). | It is a red-team for a mechanism, not a routine end-of-build review. The standard should **say when to escalate** to it, not absorb it. |
| `.claude/rules/visual-qa.md` | The per-screenshot checklist, three viewports, and a separate QA subagent that never sees the diff. | Nothing missing. The standard **points** to it for the visual lens. |
| P1503 Verification Contract (RD-9, C-1..C-4, roster) | The most complete written form of this standard: Codex + Argon final reviews under four headings, a reuse lens with an analog search, a ux lens that cuts text and turns it into visuals, blind lenses with given and forbidden inputs, and every finding marked FIXED or FOUNDER. | It lives inside one spec. The next spec would have to re-type it. **This is the text to extract** into the standard. |
| `/goalify` | Turns a spec into a contract with blind reviewer rows. | Its design rule is *"CONTRACT, never PROCEDURE … names no skills, no flow, no model tier"*. See Risks. |

## Solution

1. **One standards file, the only copy.** It holds:
   - **lenses:** correctness, code quality, design-system and component reuse (for every new element, search for an existing analog), text cut or turned into visuals, and a user-view walk
   - **when each lens fires:** the UI lenses only when UI files changed, using `/finish`'s existing path classification
   - **the reviewer roster by stakes** (private ruling 2026-10-16): Argon first; add Codex for anything a bit complex (a longer run, more than one file, or work that already needs a second model); add Opus as stakes rise; escalate to `/adversarial-review` for security, data or ship tooling
   - **run rules:** run after the last code change (`/dev` step 9.95); launch external reviewers the way `/adversarial-review` does; report `<received> of <spawned>`; every finding ends FIXED, or listed for the founder with a one-line reason
   - **content:** extracted from P1503 RD-9 and C-1..C-4, then generalised

   Model ids appear only here, apart from `~/.agents/model-defaults.env`.
2. **`/finish` is the loader.** It is already the end-of-build dispatcher that `/dev` and `/fix` call. Its step 4 reads the standard and adds the external reviewers by stakes. Two changes go with that:
   - `criteria/code.md` drops the parts the standard now owns and points to it.
   - The standalone `/finish` stays the manual entry point.

   `[FOUNDER DECISION: loader. Extending /finish (recommended: no second dispatcher, and the stamp and sha-keyed skip are reused) or a new thin command as first proposed]`
3. **One pointer line each in `/dev`, `/fix` and `/goalify`.** No copied text. `/dev` and `/fix` already reach `/finish`, so their line only names the standard. `/goalify`'s line tells the contract to cite the standard for its final-review rows instead of re-typing them.
4. **Where the file lives:** `[FOUNDER DECISION: cp only (.claude/), or global (~/.agents/) so pp builds get it too (21 of 145 asks were in pp). Recommendation: global, with cp's design-system specifics referenced from the cp side]`
5. **Register the Argon pin** in the private Gemini consumer inventory, so `model-watch` sees it. A pin outside that inventory is the dead-pin failure from the private ruling of 2026-10-16.

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| A `/goalify` pointer that names reviewers breaks its own CONTRACT-never-PROCEDURE rule | MITIGATE | The pointer names the standard as the source of the final-review **outcome** rows. Model ids stay in the standard. `[FOUNDER DECISION: accept this one exception to goalify's rule, or keep /goalify out and rely on /dev's review inside the loop]` |
| Four reviewers on every build is noise and cost | MITIGATE | The stakes roster: a one-file, non-UI change gets Argon (plus the existing `/finish` Sonnet review) only. Falsifier from the ruling: Codex adds nothing beyond Argon and Opus on small multi-file changes. |
| The Argon intro price doubles on 2026-11-30 | ACCEPT | Already a dated watch item in the private Gemini inventory. The roster is one edit in one file. |
| A reviewer runs before the last change and its pass is stale | MITIGATE | The standard requires a run after the last code change; `/dev` 9.95 already re-runs on a stale stamp. |
| Silent reviewers read as clean | MITIGATE | The `<received> of <spawned>` line and the non-empty output check are both mandatory in the standard. |

**Non-Goals**
- Do NOT copy lens text into `/dev`, `/fix`, `/goalify` or any spec. Pointer lines only.
- Do NOT merge `/adversarial-review` or `visual-qa.md` into the standard. Point to them.
- Do NOT change the `.finish-reviewed` stamp format or `/ship` gate 2.7.
- Do NOT change model defaults in `~/.agents/model-defaults.env`.

## Done-When

- [ ] The standards file exists, and a distinctive sentence from each lens appears in exactly one file across `.claude/` and `~/.agents/` (grep count = 1)
- [ ] `/dev`, `/fix` and `/goalify` each carry one pointer line, and none contains lens text (same grep)
- [ ] Two real past diffs, run through the standard: a non-UI script diff triggers no UI lens, and a UI diff triggers every UI lens. Control in both directions.
- [ ] Three real past diffs map to the right roster: one file → Argon; several files → Argon + Codex; ship tooling → plus Opus, with escalation named
- [ ] One full run on a real diff shows the served Argon model verified, every external output non-empty, `<received> of <spawned>`, and every finding FIXED or FOUNDER
- [ ] `model-watch` reports the new Argon pin with no drift
- [ ] Founder decisions above recorded in this spec

## Success Measure (post-ship, filed to the inbox at ship, not a checkbox)

Over the 30 days after ship, count founder-typed end-of-build review asks with the same `hist` queries
(the query list is in this spec's evidence note). Baseline: 4.4 per day (October).

- **Success:** at most 0.5 per day, and zero "I asked many times" re-asks.
- **Failure:** the rate stays above 2 per day. Then the problem is not where the standard lives (for example, the founder asks out of distrust rather than habit). Re-diagnose; don't add more prose.

## Alternatives Considered

- **A new standalone `/review` command** (first proposal). It would add a second dispatcher beside `/finish`, with its own stamp and skip logic, and `/dev` and `/fix` would still call `/finish`. Kept as the founder's option in Solution 2.
- **A rule file in `.claude/rules/`.** It loads into every session as prose, but nothing runs it. Reviews would still depend on the agent remembering.
- **A Stop hook that refuses "done" without review evidence.** It enforces mechanically, but on every session including non-builds. It belongs to the falsify step as the strongest option, not the default.

## Rollback Strategy

`git revert` the commit(s). The standard is prose plus pointer lines. `/finish` keeps its current Sonnet-only path whenever the standard is absent.

## Related

- [P1503](p1503_clarity_chat_v11_whole_vision_prototype.md): RD-9 and the Verification Contract are the source text.
- [decisions.md](../docs/decisions.md) 2026-10-12 (review freshness), 2026-10-14 (independent reviewers not redundant, stopping rule), 2026-10-05 (findings set aside are told to the founder, proposed).
- Private ruling 2026-10-16: reviewer choice by stakes, with a low bar for Codex.
