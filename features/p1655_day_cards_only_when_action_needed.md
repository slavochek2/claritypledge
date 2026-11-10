---
status: week
type: task
rank: 119
workstream: infrastructure
created_date: '2026-11-10'
tags: [day, budgets, fingerprints, noise]
disclosure: public
delivery_stage: create-spec
pipeline_ran: [create-spec]
drafted_by: opus
exec_model: sonnet
exec_effort: high
driver: anomaly
spec_review_hash: e7f1f30dddde39865dc1eb1c2c63a205d4cce0257e22a04936bb231582d357ff
spec_review_vendors: [gemini, openrouter]
---

# P1655: /day raises cards that ask the founder for nothing

## Problem

> Founder framing, verbatim (2026-11-10): "you filed something and now you say no change uh leave
> them as they are then why did we do it at all like reflect i guess and improve the procedure so
> i'm only dealing with things that we need fixing otherwise what's the point of flagging something
> in the card"

**Situation:** On 2026-11-10 /day sent 9 items to a fix session. Verification left four whose
honest answer was "no change": two budget cards, a test-server drift that was on purpose, and a
LinkedIn stall caused by a known founder choice. Three more were tagged "came back" only because
their fingerprint had been renamed.
**Complication:** Every such card costs the founder a read and a decision that ends in "do
nothing", and teaches them to skim the cards that matter.
**Question:** Which card classes can never ask for an action, and how does /day stop raising them?

Three classes seen on 2026-11-10:

1. **Projected over an alert budget, when a verified hard cap exists for the same key.** The cap
   is the designed stop. Today: an alert e-mail level was projected to be passed while the cap
   held; a test key was projected past its cap although it was already replaced and due to be
   revoked. (Figures kept private.)
2. **Fingerprint renames re-raise an evaluated cause.** Records filed by P1605 match on the exact
   fingerprint, so a check that renames its key (project name to org id; `cp.health` to
   `cp.reflect`; `branch-only-deploy` to `differs`) shows the card again as "came back".
3. **A stall with a known, founder-accepted cause.** The LinkedIn runner showed "Out of Data
   Credits"; the healer reports READY from window titles, so the check can only say "needs you",
   never the cause.

## Appetite

Blast radius: medium. It changes what /day hides; a wrong rule hides a real fault. Reversibility:
high, code only. Decision density: low; the founder's rule is quoted above.

## Invariants

- A hidden fault stays in the report, as P1605 requires (decisions.md 2026-11-03 "An evaluated
  /day cause is a ledger record"). Nothing is deleted, only folded.
- A `fixed` verdict never hides its own recurrence (same entry).
- A rule that suppresses must name the evidence that makes the card actionless; when that evidence
  cannot be read, the card shows (fail open toward the founder).

## Solution

Folding happens where P1605 folds: in the /day render (`buildView`), never by a check dropping a
finding. A folded card stays in the report and in the "hidden" count.

1. **Budgets.** A projected-over finding for a key folds when the same run's `ai-keys --report`
   prints `CAP_VERIFIED:<key>` (it does today, e.g. 2026-11-10 for all three keys). The 80% warning
   and "spend reached the cap" still show when the key serves prod. A key whose registry entry says
   it is replaced or due for revoke folds every budget finding. UNVERIFIED: whether the registry
   carries such a status today; if not, add one field (`retiring: YYYY-MM-DD`). Missing or
   unreadable cap or registry: the card shows.
2. **Renames.** An explicit alias file next to the check registry maps old fingerprints to new.
   An evaluated record matches a fault under its own fingerprint or any alias. Seed it with the
   three real renames of 2026-11-10:
   `cp.quota:quota:claritypledge-test:log-ingestion` -> `cp.quota:quota:jwpujlzsdkkeohiggxpt:log-ingestion`;
   `cp.health:kdd:uncaptured` -> `cp.reflect:kdd:uncaptured`;
   `cp.testfns:testfns:branch-only-deploy` -> `cp.testfns:testfns:differs`.
   A test fails when a check's emitted fault key changes and no alias exists for the old one.
3. **LinkedIn cause.** The outreach check adds the runner's campaign state, read from the
   instance DB or the screen title bar, as a slug in the fault key (`...:needs-you:out-of-credits`,
   `...:needs-you:unknown`), matching `day-evaluated.ts`'s fingerprint pattern. An accepted record
   on one cause then does not hide a different stall. The first occurrence of a new cause still
   shows; that is intended. Unreadable state gives `unknown`, today's card. The old
   `disp.lhcodex:lhcodex:needs-you` record is aliased to `...:out-of-credits`.

The test-server drift item is not a separate rule: it was settled by an accepted record and only
re-surfaced through a rename (rule 2).

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| Rule 1 hides real overspend | MITIGATE | Folds only on a cap verified in the same run; a cap pauses the key, so spend past it is impossible |
| An alias joins two different causes | MITIGATE | Aliases are explicit, reviewed, and tested with the three real renames |
| A misread runner state forks the fingerprint | ACCEPT | Worst case is one extra card under a new cause, never a hidden one |

**Non-Goals**
- Do NOT change budgets, caps or keys.
- Do NOT change the 90-day evaluated limit or the verdict semantics.

## Done-When

- [x] Fixture: projected-over with `CAP_VERIFIED` folds; the same without it shows; an 80% warning on a prod key still shows.
- [x] Fixture: a key marked retiring folds its budget findings; an unreadable registry shows them.
- [x] Replay: records under the three old fingerprints hide the renamed cards; a fixture with a different cause still shows.
- [ ] A test fails when an emitted fault key changes without an alias (shown failing once, then passing).
- [x] Fixtures: an out-of-credits stall, a crash stall and an unreadable state get three different fingerprints, each accepted by `day-evaluated.ts`.
- [ ] Every new fold rule is shown failing on its known-bad fixture, and the existing /day tests pass.

## Known Limits (build, 2026-11-10)

- The rename guard reads only this repo's check prose. Keys defined in the global /day file
  (`disp.*`, including budgets and LinkedIn) and keys with a `<placeholder>` are not covered,
  so box 4 stays open (Opus review).
- The retiring rule is dormant: the key registry has no retiring field yet, and adding one
  changes live key data, so it waits for the founder.
- A retiring key folds only its projection; its 80% and cap warnings still show, since it may
  still serve prod (Opus review).
- The LinkedIn cause is usually `unknown` until the check prints the runner's campaign state.
- Aliases are one hop. A second rename re-raises the card, which fails toward the founder.

## Rollback Strategy

Revert the commit. Records filed against the new LinkedIn fingerprints stop matching and those cards show again, which fails toward the founder.

## Related

- [P1605](done/2026-06-10/p1605_day_accepted_until_record.md) (evaluated records)
- decisions.md 2026-11-03 "Why /day findings keep coming back after an answer"
