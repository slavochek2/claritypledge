---
status: week
type: task
rank: 104
workstream: infrastructure
created_date: '2026-11-05'
tags: [review, finish, create-spec, orchestration]
disclosure: public
delivery_stage: create-spec
pipeline_ran: [create-spec]
drafted_by: opus
exec_model: opus
exec_effort: high
driver: anomaly
---

# P1634: Spec review, Sonnet building and quota handling run by default, and the review gate sees subagent edits

## Problem

**Situation:** The founder's working instruction is typed into session after session: *"Actors orchestrator you can probably no need to develop yourself just you know spin-ups up agents if for token saving you can use Sonnet and then review with Gemini Fargon Codex and Opus."* P1505 moved the end-of-build review into a Stop-hook gate, with its own falsifier: founder-typed review asks should fall below 2 a day within 30 days of 2026-10-16.

**Complication:** They have not fallen. A keyword count of the founder's messages (a reviewer's name near a review word; noisy) gives 8.3 and 6.4 a day in the two weeks before the gate, then 9.6, 5.9 and about 9 after. Reading the code shows why:

1. **Spec review has no owner.** `/create-spec` ends with "first a multi-model spec review when the stakes call for one". Nothing triggers it, names who reviews, or checks it ran. By the same rough count, about a third of post-gate asks mention it.
2. **Building through subagents is never the default.** `/dev`'s Orchestrator Mode fires only on `## Implementation Tasks`, written only by the archived `/decompose`. 0 of 223 open specs have it (grep, 2026-11-05).
3. **The gate cannot see the mode the founder asks for.** `session_edits` reads the main transcript only, a known limitation P1505 recorded. Since 2026-10-17, 195 of 1,043 sessions with reviewable edits had subagent edits, and 50 had nothing else. As an independent check, 333 of 1,880 code files changed since then have no receipt for their current content (lockfiles and small later edits inflate this).
4. **Work waits on quota.** Decisions 2026-10-14 records reviews waiting for a Codex reset, and P1608's worktree was held for one.

**Question:** What has to run by default so the founder can stop typing the roster, without widening the gate's blind spot?

> Founder framing, verbatim: *"is there a better approach to decide which reviews should be run when and how automatically without me saying this?"*

## Appetite

Blast radius: high, every spec, every `/dev` and `/fix` run and the Stop hook in every session. Reversibility: high, skill text and one hook, revertable per slice. Decision density: low; the founder made the two calls on 2026-11-05 (build this, never wait for a reset).

## Invariants

- **Never wait for a reviewer's quota reset, unless the founder says so for specific work.** Founder decision 2026-11-05, superseding the practice recorded 2026-10-14. A reviewer out of quota is named as missing in the `Reviewers:` line and the work continues. If no Gemini or Codex run can succeed, the P1630 floor refuses the receipt and the founder is told at once; that is a question to the founder, not a silent wait.
- **Quota is discovered by failure, not by reading it.** `~/.agents/model-routing.md` says never to read another harness's quota, and threshold swapping was shown to deadlock (Alternatives, B).
- **Spec reviewers follow the 2026-10-16 ruling:** different vendors, every load-bearing claim verified by command before it is folded in, and a re-review after a round of founder answers.
- **Embargoed specs never go to GLM,** with P1630's fail-closed rule. Same content, same rule.
- **A scan the gate could not finish must not read as a pass.** Today, going over budget returns "nothing unreviewed" (`verify-before-stop.py`, `unreviewed_edits`). Adding subagent transcripts makes that likelier, so this changes in the same slice.
- **The waiver rules of P1505 are unchanged.** Only the founder's explicit words skip a review.
- **Subagents stage, the main session commits** (`.claude/rules/git.md`), and a subagent's report is verified before it is relied on (epistemic gate 9). Background agents write their result to a file (`.claude/rules/skills.md`).

## Solution

Three slices, in this order. Each can ship and be reverted alone.

1. **Spec review runs by default.**
   - `/create-spec` runs it at its end, and the roster lives in that one place: Gemini and GLM on every spec except a low-blast-radius one; Codex and Opus added when Appetite says blast radius is high, or the spec reverses a ruling, carries privacy seals, or touches migrations, auth or a gate.
   - The result is stamped on the spec as a hash of its body (frontmatter excluded, since pipeline stamps change it) plus the vendors that reported, written after findings are folded in.
   - `/dev` and `/fix` compare the hash on entry. No stamp or a changed body runs the review once before building. This is what makes "already reviewed" true for the content being built.
   - The report shows the same `Reviewers:` line P1630 adds to `/finish`.
2. **The gate sees subagent edits.** Edits from `<session>/subagents/*.jsonl` count, with a bounded scan. A scan that cannot finish blocks once and says coverage was incomplete. The implementer may use another detection method if it passes the same Done-When; on the shared main checkout a plain `git status` also sees co-tenants' files, so it cannot be the whole answer.
3. **Sonnet building is the default in `/dev` and `/fix`.** The main session plans, dispatches, verifies and commits. Sonnet subagents write mechanical code. Judgment-bearing work (skill bodies, prompts, gates) stays on the main model, per `/recommend-model-effort`'s trap, which is read rather than restated. Edits small enough that spawning costs more stay inline. The dead Orchestrator Mode section is removed. An explicit founder instruction in the session wins.

Slice 3 comes after slice 2 because ad-hoc orchestrated sessions copy this habit, and those are the ones only the gate protects.

## Cost Budget

Price source and read date: P1630's Cost Budget (OpenRouter listing, 2026-11-05); that spec adds the registry row. Gemini runs on credits; Codex and Opus are subscriptions. Volume is the count of specs added to `features/` over 30 days, with one re-review assumed. Its value and the totals are kept in `.private/docs/usage/p1634-cost-budget.md`.

| Measure | Per user | Per hour | Per test run |
|---|---|---|---|
| Requests | n/a, no end users | n/a | 2 GLM calls per spec (review + one re-review) |
| Egress (bytes) | n/a | n/a | `2 x about 20 KB spec` |
| Log lines | n/a | n/a | 0 added (existing delegation log) |
| Service unit x registry price | n/a | n/a | `10,000 input x $0.08/1M + 1,000 output x $3.60/1M`, twice per spec |

1. **Fits today?** Yes on the typical case, at `2 x specs per month x cost per call`.
2. **Fits at 10x?** Yes on the typical case. The prepaid balance is the ceiling.
3. **If either answer were no:** drop GLM from spec review; it is advisory here too.

The larger cost is subscription quota: review and verification tokens on the main session, offset by Sonnet doing the building. It is unmeasured; the 30-day check below reads the outcome.

## Alternatives Considered

| Option | Verdict | Why |
|---|---|---|
| A. A roster table alone, referenced by every skill | Rejected | Proposed by one reviewer. A table cannot say whether this version of the spec was reviewed. Codex: a review of version A would satisfy a rewritten version B. |
| B. Pick reviewers by live quota thresholds | Rejected | In the first sketch, Codex near its limit hands work to Opus while Claude near its limit hands it back. Failure already degrades to "missing", and P1630's always-on GLM removes most of the choice. |
| C. Per-reviewer ledger of findings driving thresholds | Rejected | Counts reward noisy reviewers, double-credit shared finds, and cannot see misses. Re-running the bug benchmark measures misses directly. |
| D. Fold all this into P1630 | Rejected | P1630 is one revertable commit. This changes every spec and build flow. |
| E. Do nothing, keep typing | Rejected | The founder chose to build this on 2026-11-05. |

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| Automatic spec review slows small specs | MITIGATE | Low blast radius skips it. |
| A cheap edit (typo, folded finding) triggers re-review | MITIGATE | The stamp is written after folding. A later body change re-reviews once, per `/dev` run. |
| Scanning subagent transcripts exceeds the hook's time budget | MITIGATE | Bounded scan and the incomplete-coverage block. Measure on the largest real session at `/dev`. |
| More blocks in orchestrated sessions | ACCEPT | Blocks are once per turn, and only when completion is announced. These are the reviews the gate was missing. |
| `verify-screenshot-before-reedit.py` reads the parent transcript inside subagents and can block them | MITIGATE | Recorded 2026-10-16 as awaiting a yes. Check its state before slice 3, and fix it there if still open. |
| Background subagent reports fail to arrive (2026-10-14) | MITIGATE | Result files, and a count of reports received. |
| Sonnet writes worse code than the main model | ACCEPT | The `/finish` reviewers run on every build, and judgment-bearing work stays on the main model. |
| A new frontmatter field breaks a reader such as the kanban | MITIGATE | Grep readers at `/dev`; document it in `.claude/rules/features.md` through the claude-md gate. |

**Non-Goals**
- Do NOT read Codex or OpenRouter quota, or swap reviewers by threshold.
- Do NOT add a findings ledger or runtime model scoring.
- Do NOT change the `/finish` Step 4b roster; P1630 owns it.
- Do NOT try to detect shell edits; they stay a known limitation.
- Do NOT start slice 1 before P1630 ships: it reuses the GLM row, the `Reviewers:` line and the embargo rule.

## Done-When

- [ ] Filing a normal-stakes spec runs Gemini and GLM with no typed request, stamps the hash and vendors, and shows the `Reviewers:` line. A high-stakes spec also gets Codex and Opus. A low-blast-radius spec skips review and says so.
- [ ] `/dev` on an unstamped or changed spec reviews it first, once. On an unchanged spec, or one changed only in frontmatter, it does not.
- [ ] An embargoed spec's review never sends to GLM (no `vendor=openrouter` line in the delegation log for it).
- [ ] With Codex forced to fail, a review continues, names Codex missing and does not wait. With Gemini and Codex both failing, the founder is told immediately.
- [ ] The P1505 test suite gains cases, each seen failing on the old code: an edit made only by a subagent blocks; a receipt clears it; an oversized subagent history, over 300 paths, and budget exhaustion each block with the incomplete-coverage message. Every existing case still passes.
- [ ] A real `/dev` run on a throwaway spec, with no orchestration typed, has Sonnet subagents writing mechanical code and the main session committing. A skill-body edit in the same run stays on the main model.
- [ ] `grep -n "Orchestrator Mode" .claude/commands/slava/build/dev.md` no longer finds the dead section, and `dev.md` and `fix.md` state the new default.
- [ ] Decisions log carries the never-wait ruling, noting that it supersedes the 2026-10-14 practice.
- [ ] A `/note` entry with `due: month` is filed: re-run the typed-asks count for the 30 days after slice 3 ships. Below 2 a day confirms this; otherwise read which asks remain and say why. It also closes P1505's falsifier with its result.

## Rollback Strategy

Revert per slice: the `/create-spec` and entry-check text, the hook change, or the `/dev` and `/fix` text. A leftover stamp in spec frontmatter is ignored by everything once the check is gone. No data to migrate.

## Related

- P1630: dependency; GLM row, `Reviewers:` line, embargo rule.
- P1505: the gate extended here; its falsifier is what this answers.
- P1514: retired the old spec pipeline and left spec review ownerless.
- Rulings: decisions.md 2026-10-16 (P1505; spec reviews by different vendors), 2026-10-19 (route), 2026-10-14 (stopping rule, Codex wait).
