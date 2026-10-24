---
status: week
type: task
rank: 69
workstream: infrastructure
created_date: '2026-10-24'
tags: [privacy, pre-commit, push, figures]
disclosure: public
delivery_stage: create-spec
pipeline_ran: [create-spec]
drafted_by: opus
exec_model: sonnet
exec_effort: high
driver: anomaly
---

# P1561: Catch spend figures at commit time, and decide history rewrites by severity

## Problem

**Situation:** A new spec quoted the founder verbatim, and the quote carried a monthly out-of-pocket
spend figure for upgrading a hosted service. The commit-time figure check (P1526, warn-only) passed it.
The push-time privacy review found it 46 commits later, after three other sessions' branches had been
built on top.

**Complication:** At push time, the only way to remove a figure from unpushed history is a rewrite.
Here that would have given 46 commits new IDs and broken three live co-tenant branches. Their next
ship would have cherry-picked the old commits back in, figure included. The review still offered the
rewrite as the default, because the privacy skill treats every spend figure as a hard flag. Yet the
figure was close to a published list price, and a figure of the same class has been public since
2026-09-08 (P1162's founder quote of a monthly spending cap). The founder spent about an hour of
back-and-forth on a near-zero-harm item.

Probe, 2026-10-24, through `privacy_figure_scan` with `path:line:text` input:
- the real quote: no hit
- a synthetic "upgrading costs N per month out of pocket": no hit
- a control "the spend cap was raised to $N": hit

The matcher needs a currency sign or unit plus a billing word within 60 characters. Phrasing like
"per month", "out of pocket", "paying" or "subscription" with a bare number has neither.

**Question:** Catch this shape at commit time, while a fix is one edit. And when a figure does reach
committed history, offer a rewrite only when the figure is worth that cost.

> Founder, verbatim (2026-10-24): "how we solve this susitanbly in the future?"

> Founder, verbatim (2026-10-24), on option C: "not sure how c works in pracitce but good enough lets do i t"

The founder approved A (widen the commit-time check) and C (rewrite-severity step) and rejected B
(tell spec authors to strip figures) as discipline-dependent, the thing that failed here.

## Appetite

Blast radius: one advisory check (every commit sees its output) and two skill paragraphs.
Reversibility: git revert. Decision density: zero; scope is decided above.

**Review history:** reviewed 2026-10-24 by Gemini 4 Argon and Gemini 3.8 Flash, 2 of 2 reports
received; both found the free-form matcher would flood prose and "same class" was a loophole. Both
folded in after re-checking by command (the 144-line measurement; the privacy skill's step 1 scope).
Codex and Opus not run: the two reviews converged and left no open disagreement.

## Invariants

- **The figure check stays warn-only** (P1526; epistemic.md gate 7c). A broad figure regex blocking
  commits would fail legitimate work. This spec widens what it warns on and never turns it into a gate.
- **The scanner never prints the matched text**, only `path:line` (P1526 contract, top of
  `scripts/lib/privacy-figure-scan.sh`).
- **No real founder figure in any fixture or test.** The must-catch cases are synthetic sentences of
  the same shape. A test file is public, and a real figure there would re-publish it.
- **The severity step never removes the numbered-options protocol for real account figures** (P1526,
  `/push` step 3): usage, balances, revenue, deal terms and unpublished caps still get numbered options
  including the rewrite, with the irreversible option named.

## Solution

**A. A third matcher** in `scripts/lib/privacy-figure-scan.sh`, structure pinned here (both reviews
found a free-form phrase list floods prose; measured 2026-10-24: a bare number directly before
"per/a month|year" already appears on 144 existing lines of `features/` and `docs/`):
- A bare number matches only when it sits **within a few characters of a cadence or pocket phrase**
  (`per month`, `a month`, `monthly`, `/mo`, `per year`, `a year`, `/yr`, `out of pocket`), **and**
  the line also carries a spend word (`pay`/`paying`/`paid`, `costs?`, `price`, `subscription`, `plan`,
  `bill`, `spend`) within 60 characters. No standalone `pay`, `price` or `costs` trigger.
- ISO dates, versions (`v3`, `3.1`) and the number inside a P-number or INBOX id never count as the
  bare number.
- The implementing agent tunes the exact distances against the measurement in Done-When, not by taste.

**C. Severity step before a rewrite is offered.** It runs where the rewrite decision lives: the `/push`
paragraph on hard flags in committed but unpushed content. `/maintain:privacy` gains a one-paragraph
pointer to it (that skill reviews staged files and the last commit only, so it never sees a history
range).
- When a figure is found only in history (the current text is already fixed), classify it before
  offering options. **Print the evidence for the class.**
  - **Low**, only with one of two citations: (a) the **same figure** is already on `origin/main`,
    cited as `file:line`; or (b) the text itself states it is a vendor's standard public tier or list
    price, not a custom amount or a usage total. Fix forward only and say so; no rewrite option.
  - **Everything else is a real account figure** (usage, balances, revenue, deal terms, caps not
    already public). Numbered options as today, rewrite included.
- Whenever a rewrite is offered, state its cost first: how many commits get new IDs
  (`git rev-list --count <commit>^..HEAD`) and which branches and worktrees contain the commit
  (`git branch -a --contains <commit>`, `git worktree list`). A co-tenant branch built on the commit
  makes a rewrite a change to another session's work.

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| The wider matcher warns on ordinary prose and gets ignored | MITIGATE | Measured false-positive count over the existing repo, reported in Done-When |
| "Low" becomes a way to wave real figures through | MITIGATE | Invariant 4; Low needs a printed citation (same figure on origin/main, or a stated public list price); "same class" was removed after review |
| Spelled-out numbers ("twenty-five per month") pass | ACCEPT | Rare in agent-written prose; push-time review remains |
| Warn-only still lets a figure through if nobody reads the warning | ACCEPT | Gate 7c rules out blocking; the push-time review remains the backstop |

**Non-Goals**
- Do NOT make the figure check blocking.
- Do NOT change `audit-privacy.sh`, the server-side privacy scan or Layer 1 of the pre-push hook.
- Do NOT add an authoring rule to `/create-spec` (option B, rejected).
- Do NOT rewrite any existing history as part of this work.

## Done-When

- [ ] Each of these synthetic sentences is reported, as a **separate** test assertion:
      "paying 20 a month for it", "it costs 20 out of pocket", "the 20/mo subscription",
      "the 49 monthly plan". The existing `$` plus "cap" control is still reported.
- [ ] None of these is reported: "3 sessions a month", "pay 2 visits", "on 2026-10-24",
      "about 15 people", "P1526 shipped", "retry 3 times before the subscription webhook fails".
- [ ] Measured over all existing lines of `features/` and `docs/` with a command that prints only
      counts and `path:line` (e.g. `grep -rn "" features/ docs/ | privacy_figure_scan | wc -l`),
      before and after. Every new hit is classified real-figure or noise by the implementer, without
      pasting its text. **Noise hits added ≤ 20**; above that, narrow the matcher.
- [ ] `scripts/test-p1526-privacy-push-gates.sh` covers every sentence above and passes; a mutant that
      drops the new matcher makes it fail (exit code pasted).
- [ ] `/push` describes the severity step, both classes with their required citation, and the
      rewrite cost statement; `/maintain:privacy` points to it; both `.agents/skills/` mirrors synced.

## Alternatives Considered

- **B. Tell spec authors to strip figures from founder quotes.** Rejected by the founder: it relies on
  agents remembering, which is what failed.
- **Make the figure check blocking.** Rejected by gate 7c: a broad regex would block legitimate commits.
- **Always rewrite history on any figure.** Rejected: decisions.md (gitleaks entry) already calls a
  history purge "high cost on a public repo for values that are already dead or public-by-design", and
  the 2026-10-24 case would have broken three co-tenant branches.

## Rollback Strategy

git revert of the commit. Both changes are advisory text and an advisory matcher; nothing persistent
depends on them.

## Related

- P1526: the figure check and the numbered-options protocol for committed hard flags.
- P1162: the figure of the same class already public since 2026-09-08.
- decisions.md: "Rebase the two contaminated branches myself", rejected because the branches belong to
  other sessions; and the gitleaks entry on history purges.
