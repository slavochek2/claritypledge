---
status: in-progress
type: task
rank: 41
created_date: '2026-10-16'
tags: [process, review, skills, reviewers]
disclosure: public
severity: high
delivery_stage: dev
pipeline_ran: [create-spec, dev]
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

## Solution — option A, founder-approved 2026-10-16 ("A is ok")

The original Solution (standards file + pointers) failed the falsify review (section at the end). Rebuilt around **the trigger**:

1. **Stop-hook review gate** — a third check in `.claude/hooks/verify-before-stop.py`. When the turn's last message announces completion (done / ready / implemented / committed / shipped / fixed …) AND this session edited reviewable files (`src/`, `e2e/`, `scripts/`, `supabase/`, `.claude/commands/`, `.claude/hooks/`) AND no review receipt matches those files' current content, it blocks once and tells the agent to run `/finish` on exactly those files. It fires whether or not a build skill ran — the 76-80% case.
2. **Review receipt** — `scripts/review_receipt.py`: `check <files…>` and `write --evidence <reviewer-output…> -- <files…>` (a Python module so the hook imports the same fingerprint rule). The fingerprint is a hash of the files' current content, so an edit after the review makes the receipt stale. `write` refuses unless at least one evidence file is a non-empty `ask-model` output with `exit=0` (an external reviewer really ran). Receipts live in `<git-common-dir>/.review-receipts`; the `.finish-reviewed` stamp is untouched.
3. **`/finish` is the single home of the standard.** The lenses stay in `criteria/code.md`, extended with the P1503 lenses (an existing-analog search for every new element, cut text or turn it into visuals, a first-time-user walk). `/finish` gains the reviewer roster by stakes:
   - Argon on every run, via `REVIEW_GEMINI_MODEL`.
   - Codex when more than one file changed or the diff is over 50 lines.
   - An Opus adversary for migrations, edge functions, auth or ship tooling, naming `/adversarial-review` as the escalation.
   - UI lenses only when UI files changed.
   - A `<received> of <spawned>` count, every finding marked FIXED or listed for the founder with a reason, then the receipt.
4. **Model id** — a new key `REVIEW_GEMINI_MODEL=gemini-4-argon` in `~/.agents/model-defaults.env`, which is inside `model-watch`'s scan roots. It also gets a pointer row in the private Gemini consumer inventory. No model id is written in any prose file.
5. **Shared fixes** — `/dev` 9.5/9.5a and the `/fix` QA gate stamp the sha that was **reviewed**, not the sha after the fixes, so 9.95 re-reviews post-review fixes. The optional "(y/n) run /finish" lines (`dev.md` ~467, ~524) are removed. `/goalify` is not touched.

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| The gate nags on turns that are not build completions | MITIGATE | Needs all three conditions. It blocks at most once per turn (`stop_hook_active`). Docs-only and spec-only edits are not reviewable. |
| Shell edits (sed, heredoc) are invisible to the Edit/Write scan | ACCEPT | Most edits use Edit/Write. Recorded as a known limit. |
| The agent writes a receipt without reviewing | MITIGATE | `write` requires real `ask-model` evidence with exit=0. This is accident prevention, not a security boundary. |
| A review after every fix round loops | MITIGATE | 9.95 re-reviews once. New HIGHs after that go to the founder (2026-10-14 stopping rule). |
| pp and Codex sessions are not covered | DEFER | cp first (founder). Extend if the pp asks continue. |

**Non-Goals:** do NOT change the `.finish-reviewed` format or `/ship` gate 2.7 · do NOT touch `/goalify` · do NOT change the default `GEMINI_MODEL`/`CODEX_MODEL` · do NOT weaken the hook's existing claim gate or KDD gate ordering.

## Done-When

- [x] Hook suite: an ad-hoc reviewable edit plus "done" with no receipt → blocks. A matching receipt → passes. An edit after the receipt → blocks. Docs-only → passes. No completion language → passes. `stop_hook_active` → passes. The existing 11 cases still pass.
- [x] Replay of a real past ad-hoc session transcript (the 2026-10-08 shape) through the new hook → blocks. A known-good control → passes.
- [x] `review_receipt.py write` refuses an empty evidence file and an `exit=4` evidence file (controls), and accepts a real `ask-model` output
- [x] `/finish` carries the roster and the new lenses. `criteria/code.md` holds the lens text, and grep finds it in no other skill file.
- [x] `dev.md` and `fix.md` stamp the reviewed sha. The optional y/n lines are gone.
- [x] `REVIEW_GEMINI_MODEL` is in model-defaults.env and in the inventory row, and `model-watch` reports no drift for it
- [ ] The standard is run on this build itself: Argon + Codex (several files) + Opus (ship tooling), with `<received> of <spawned>` and a receipt written

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

## Falsify Review (2026-10-16): the ORIGINAL Solution (standards file + pointers) failed; option A replaced it

Reports: root cause 1 of 1, Gemini 4 Argon (served model verified) 1 of 1, Codex (gpt-6.1-sol, high) 1 of 1. The creative fan-out phase was not run (it needs 3+ agents); both reviewers proposed alternatives instead.

| Finding | How known |
|---|---|
| **The real cause is a missing trigger, not a missing file.** 19-20 of 25 sampled October review asks (76-80%) came after work where no `/dev`, `/fix`, `/goalify` or `/finish` ran. Pointers in those skills cannot fire there. | Root-cause agent; 15 of 15 sessions re-checked by command |
| P1-P4 each FAIL a replay of the 2026-10-08 shape (fix done in open conversation, then the founder asks "did you review it with codex?"). P5 is worth doing but schedules nothing. | Codex replay; Argon independently |
| As written the spec removes roughly 15-30 of 145 asks, leaving about 3.3-3.7 per day, which is above its own failure line of 2 | Both reviewers' scenario estimates, **not measured** |
| The existing Stop hook (`verify-before-stop.py`) lets an unreviewed "done" end the turn; it has no review check | Codex replay; the hook's 11/11 suite re-run |
| `/dev` 9.5 and the `/fix` QA gate apply fixes, commit, and only then stamp HEAD, so post-review fixes carry a fresh-looking stamp | `dev.md:195-197`, `fix.md:623-625`, read |
| A `/goalify` pointer would break goalify's own CONTRACT-never-PROCEDURE rule | `goalify/SKILL.md:24-36` |
| A reviewer model id in a prose file is invisible to `model-watch` (it does not scan `.md`). A new key in `~/.agents/model-defaults.env` is inside its scan roots. | `model-watch` lines 38-46, read |
| At least 64 of 145 asks name ship, commit, kdd or close in the same message | Regex over kept quotes, a lower bound |

**Severity revised to medium-high** for founder attention (Codex: high; Argon: medium). The direct user risk is not quantified.

Founder chose option A (2026-10-16); the Solution section now describes it.
