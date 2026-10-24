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

**A. Widen the matcher** in `scripts/lib/privacy-figure-scan.sh`:
- Add a third matcher for a bare number near spend phrasing, for example "per month", "/mo", "a month",
  "per year", "out of pocket", "paying" / "pay", "subscription", "price" / "costs".
- The implementing agent picks the exact phrase list and distance by measuring false positives against
  the real repo. Run the matcher over every existing line in `features/` and `docs/` (not only added
  lines) and report the hit count before and after. A large rise in hits on ordinary prose (dates,
  counts, durations such as "3 times a month") is a reason to narrow, not to accept.

**C. Severity step before a rewrite is offered**, in `/maintain:privacy` and the `/push` paragraph on
hard flags in committed but unpushed content:
- When a figure is found only in history (the current text is already fixed), classify it before
  offering options:
  - **Low:** already public, equal to a published list price, or the same class as a figure already
    on `origin/main`. Fix forward only and say so; no rewrite option.
  - **Real account figure:** usage, balances, revenue, deal terms, unpublished caps. Offer numbered
    options as today, rewrite included.
- Whenever a rewrite is offered, state its cost first: how many commits get new IDs, and which live
  branches contain the affected commit (`git branch --contains`). A co-tenant branch built on the
  commit makes a rewrite a change to another session's work.

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| The wider matcher warns on ordinary prose and gets ignored | MITIGATE | Measured false-positive count over the existing repo, reported in Done-When |
| "Low" becomes a way to wave real figures through | MITIGATE | Invariant 4; the classification names its evidence (the public file:line or the published price) |
| Warn-only still lets a figure through if nobody reads the warning | ACCEPT | Gate 7c rules out blocking; the push-time review remains the backstop |

**Non-Goals**
- Do NOT make the figure check blocking.
- Do NOT change `audit-privacy.sh`, the server-side privacy scan or Layer 1 of the pre-push hook.
- Do NOT add an authoring rule to `/create-spec` (option B, rejected).
- Do NOT rewrite any existing history as part of this work.

## Done-When

- [ ] A synthetic sentence of the missed shape (bare number plus "per month" plus "out of pocket") is
      reported by the check, and the existing `$` plus "cap" control is still reported. Pasted output.
- [ ] Ordinary numeric sentences ("3 sessions a month", "on 2026-10-24", "about 15 people") are not
      reported. Pasted output.
- [ ] The false-positive count over all existing lines in `features/` and `docs/`, before and after,
      is pasted with a one-line judgement.
- [ ] `scripts/test-p1526-privacy-push-gates.sh` covers the new must-catch and must-not-catch cases and
      still passes; a mutant that drops the new matcher makes it fail (exit code pasted).
- [ ] `/maintain:privacy` and `/push` describe the severity step, the two classes and the rewrite cost
      statement; the `.agents/skills/` mirrors are synced.

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
