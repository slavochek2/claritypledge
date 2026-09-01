---
status: qa
type: task
rank: 1000066
workstream: infrastructure
created_date: '2026-09-01'
tags: [e2e, testing, cleanup, p1043]
delivery_stage: dev
pipeline_ran: [create-spec, dev]
drafted_by: opus
exec_model: opus
exec_effort: high
driver: anomaly
---

# P1217: Retire the E2E tests that assert deliberately-removed behaviour

## Problem

**Situation:** The 2026-08-31 overnight full-suite run produced 1,624 failures. The P1043 triage
measured that **580 of them (36%) come from 61 spec files whose feature spec is `status: rejected`,
carries `superseded_by:`, or is named by a successor's `predecessor:` field** — tests asserting
behaviour the product deliberately removed.

**Complication:** While those 580 failures sit in the count, the failure number carries no signal.
The ~20 genuine product defects the same triage found are 1% of the noise, and the suite cannot be
used as a gate (P1085) until the count means something. P1043 stays open for the undiagnosed
remainder; this is the separable, mechanical half.

**Question:** Which of the 61 files can be deleted outright, which still protect a live component
and must be kept or split, and how much of the 580 does deleting actually remove?

> Founder framing, verbatim: "retire the E2E tests that assert behaviour we deliberately removed,
> so the suite's failure count reflects real breakage."

## Appetite

Blast radius: **medium** — deleting a test cannot break the product, but silent coverage loss is
invisible by construction (deleting the only test for a live component makes the suite *greener*).
Reversibility: **high** — `git revert` restores any file. Decision density: **low** — the
DEAD/STALE/SPLIT rule is already decided ([decisions.md](../docs/decisions.md) 2026-09-01 [process]).

## Invariants

- **A dead spec is a filter, not a verdict.** Before deleting any file, enumerate every distinct
  component or page the file exercises — not only the feature its spec names — and grep `src/` for
  each. One spec can ship two things; the dead feature and a live shared component then share one
  test file. ([decisions.md](../docs/decisions.md) 2026-09-01 [process].)
- **No live component may lose its last coverage.** If a component still exists in `src/`, another
  `e2e/` spec must be shown to cover it before its blocks are deleted. If none does, the file is
  SPLIT, not DEAD.
- Never delete a file whose spec could not be confirmed dead by reading the spec frontmatter *and*
  the superseding spec.

## Solution

Work the candidate list in failure-count order. For each file, record one of three outcomes:

- **DEAD** — behaviour gone entirely, no live component depends on the file. Delete the file.
- **STALE** — behaviour survived under a new name/selector. Leave the file in place, list it for a
  later rewrite pass. Do not rewrite assertions here — rewriting an assertion re-specifies an AC.
- **SPLIT** — the file mixes both. Delete only the dead blocks; keep the rest and name the component
  those blocks protect.

Start with the six **CONFIRMED** files (reproduced + superseding commit traced). Do the CANDIDATE
files after, and stop to report if their DEAD/STALE/SPLIT distribution runs differently than the
confirmed ones did.

Commit in batches by feature area. Do not push.

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| Deleting the only coverage for a live component | MITIGATE | Per-component grep of `src/` + `e2e/`, per the Invariants |
| Frontmatter says dead but the successor kept the behaviour | MITIGATE | Read the superseding spec, not only the marker |
| A deleted file also held a *correct* failing test (a real defect) | MITIGATE | The triage's ~20 genuine defects are enumerated in `e2e-triage-2026-09-01.md`; cross-check before deleting a file named there |
| Expected failure reduction is computed, not measured | ACCEPT | The full suite takes >6h; re-running it to measure a deletion is not a good use of the window. Directories touched are re-collected to prove nothing broke |
| Some candidate files may have failure counts that shift once the P852 modal or P396 guest-join fixes land | ACCEPT | Those are separate pieces of work; the 580 is measured against this run |

**Non-Goals**
- Do NOT rewrite any test assertion. STALE files are listed, not repaired.
- Do NOT fix any product defect found along the way — file it, leave it.
- Do NOT re-run the full suite.
- Do NOT touch the P852 modal helper, the P396 guest-join guards, or the schema/migration findings.
- Do NOT close P1043.

## Done-When

- [x] Every one of the 61 candidate files carries a recorded verdict: DEAD, STALE, SPLIT, or
      NOT-CONFIRMED (spec could not be confirmed dead)
- [x] Every DEAD/SPLIT decision names the components checked and where their coverage survives
- [x] `npx playwright test --list` over every touched directory collects with no error
- [x] `./scripts/pre-commit-checks.sh` passes on each batch commit
- [x] Expected failure reduction is stated as a number computed from the triage table, labelled as
      computed rather than measured
- [x] Files left as stale-needing-rewrite are listed by name for a follow-up pass
- [x] Any component whose surviving coverage could not be confirmed is named explicitly

## Alternatives Considered

- **Delete all 61 files on frontmatter alone.** Rejected: `e2e/p526-point-image.spec.ts` is a
  confirmed-dead file containing four tests for `image-lightbox.tsx`, which is still used by
  `story-image.tsx` and `profile-page-v2.tsx`. The rule that produces the candidate list is a good
  filter and a bad verdict.
- **Keep every mixed file as STALE.** Rejected: retires almost nothing, since large specs usually
  touch some still-live shared component.
- **Fix the P852 modal first (155 failures, one helper).** Not rejected — it is higher leverage per
  edit, but it is a different piece of work with a different risk profile (editing shared test
  infrastructure vs. deleting dead files) and belongs in its own spec.

## Rollback Strategy

Every change is a file deletion or block removal on `main` in small per-area commits. `git revert`
of a batch commit restores those files exactly. No migration, no product code, no schema.

## Related

- `features/p1043_repair_e2e_tests_rotted_while_suite_uncollectable.md` — parent; stays open for the
  undiagnosed remainder
- `docs/technical/e2e-triage-2026-09-01.md` — the triage this list came from
- `.private/p1043-sweep/RETIREMENT-CANDIDATES.md` — the candidate table
- `features/p1085_trusted_e2e_core_in_ci.md` — the reason the failure count needs to mean something

---

## Findings — verdict for all 61 candidate files (2026-09-01)

**Headline: the retirement list is 20% dead. The other 80% is stale or live.**

| verdict | files | what it means |
|---|---:|---|
| DEAD — file deleted | 12 | Behaviour gone; another spec covers any live component it touched |
| SPLIT — dead blocks deleted, file kept | 6 | One spec shipped two things; the live half stays |
| STALE — untouched, needs a rewrite pass | 32 | Behaviour survived under a new name, route or selector |
| LIVE — untouched, tests current behaviour | 11 | The "dead" marker was wrong at the file level |

**Expected failure reduction: ~253 of 1,624 (16% of the run; 44% of the 580 obsolete-test failures).**
186 from the 12 whole-file deletions, ~67 pro-rata from the 6 splits (deleted tests ÷ original
tests × that file's failures). **Computed from the triage table, not measured** — the full suite
takes >6h. What was measured: `npx playwright test --list` over `e2e/`, `e2e/a11y/` and
`e2e/integration/` returns exit 0, 3066 tests in 443 files, zero hard-error lines.

### DEAD — deleted (12 files, 186 failures)

| file | spec | why it is dead |
|---|---|---|
| `p526-point-image` · `a11y/p526-accessibility` · `integration/p526-point-image-migration` | p526 rejected | `points ADD COLUMN image_url` in no migration; `update_point_image` 0 hits in src/ and migrations/. Lightbox coverage survives in p591 ×2 |
| `p523-point-creation-responses` · `a11y/p523-accessibility` | p523 rejected | No `/create-point` route, no Create dropdown (`menuitem` only in src/tests/), no Responses section or Respond button |
| `a11y/p456-accessibility` | p456 → p465 → p470 | Position symbols never rendered (`aria-hidden` 0 hits in point-card-with-links.tsx); /live hint removed by P733; two tests matched `/…this pointment/i` against `Add your story for this point` and never passed |
| `p684-account-gate-flow` · `a11y/p684-accessibility` | p684 rejected at decompose | `data-muted`, `Sign up to rate`, `Signed in as` = 0 hits; no signup component in src/app/components/letters/ |
| `p425-story-filing` · `a11y/p425-accessibility` | p425 → p467 | `/chat` redirects to `/create`; `StoryGuideChatPage` is imported by nothing. Successor: p486-create-with-point |
| `p411-position-breakdown-stories` | p411 → p542 | P542 collapsed stories behind a chevron; `No story yet` 0 hits. Successor: p542-story-collapse |
| `p616-unlink-point` | p616 → p621 | Unlink is gated on `context === 'point-detail'`; the file drives `/story/:id`, which passes `context="story-detail"`. Successor: p621-unlink-point-detail |

### SPLIT — dead blocks removed, live/stale blocks kept (6 files)

| file | deleted | kept, and what it protects |
|---|---|---|
| `p676-visual-corrections` | 21/23 | Position-badge overflow (STALE): `overflow-hidden` at live-story-card-expanded.tsx:115 has no other e2e assertion |
| `p458-anon-position-auth-gate` | 12/22 | Signup set-position context banner (signup-page.tsx:331-337) — this file is its only e2e coverage |
| `p456-story-cta-footer` | 11/13 | Nested-`<button>` checks; `/story/:id` has no other nested-button coverage |
| `p674-linear-flow` | 2/9 | The live /live state machine; the two deleted describes asserted removals the rejection kept |
| `a11y/p411-accessibility` | 1/4 | Position-badge-has-text check, not duplicated anywhere |
| `a11y/p458-accessibility` | 1/11 | Signup banner ARIA + broken-ARIA/nested-button checks on point detail |

### LIVE — the dead marker was wrong at the file level (11 files)

`integration/p458-auth-callback-position` · `integration/p684-rpc-auth-guards` · `p684-signup-flow` ·
`integration/p465-author-id-migration` · `p465-point-card-footer` · `integration/p551-clarity-docs-migration` ·
`integration/p511-session-resilience-migration` · `integration/p674-live-state-machine` ·
`p699-letter-results-sender` · `p699-letter-results-receiver` · `p682-letter-multi-recipient`

Each was verified by grepping its own identifiers. Examples: P684 is `status: rejected`, yet
`/letter/:letterId/confirm` is a live route (App.tsx:921) and all six token RPCs its integration
file guards exist in both `supabase/migrations/` and `src/`. P674 is rejected, yet `patch_live_state`
appears in 9 migrations and `live_state` in 18.

### STALE — needs a rewrite pass, NOT deleted (32 files)

Behaviour survived under a new name, route or selector. Grouped by cause, most-failures first:

- **Wrong route** — `a11y/p465-accessibility` (20), `a11y/p152-accessibility` (6): navigate to
  `/:slug`; App.tsx defines `/p/:id`. `p152-profile-calibration` (12) uses the right route but
  predates P539's zero-state redesign.
- **P878 people-picker locator drift, already documented and never applied** —
  `a11y/p466-accessibility` (16), `p466-agreement-creation` (14). Commit `8f5165fa` claimed to have
  updated these and touched neither file.
- **Route absorbed into Letters (P660)** — `p551-clarity-docs` (16), `a11y/p551-accessibility` (12),
  `p660-drafts-tab` (6), `p660-inbox-tab` (2), `a11y/p660-accessibility` (10). `/docs` and `/d/:docId`
  redirect; `DocDetailPage` still renders at `/letters/drafts/:docId`.
- **Copy renamed** — `p686-badge-profile` (2): asserts `My badge`; P873 renamed it to
  `My Clarity Badge (N/9)` (profile-page-v2.tsx:980). Also `p686-badge-certificate` (8),
  `p686-badge-certification` (2), `a11y/p686-badge-accessibility` (4),
  `integration/p686-badge-migration` (2) — `badge_points` and `is_certifier` are live.
- **Blocked by the P852 modal, not by staleness** — `p852-verify` (6) is the verification spec for
  the very modal that blocks it. `intensity-tutorial-modal.tsx` is live.
- **Surface intact, selectors drifted** — `a11y/p405-accessibility` (12), `p405-my-sessions` (8),
  `p904-explain-back` (11), `a11y/p904-explain-back-accessibility` (3),
  `integration/p904-explain-back-migration` (2), `p469-live-layout-kiss` (10),
  `a11y/p459-accessibility` (10), `p459-connections-page` (8), `p495-transcription` (8),
  `a11y/p495-accessibility` (4), `a11y/p521-accessibility` (8), `p661-letter-preview` (6),
  `a11y/p455-accessibility` (6), `p483-existing-user-invite` (4),
  `a11y/p700-letter-overview-accessibility` (2), `p617-mode-switcher-lifecycle` (2).

### Components whose surviving coverage could NOT be confirmed

None became uncovered by a deletion. Two live properties are now guarded only by tests that cannot
currently pass, and are the reason two files were split rather than deleted:

1. `overflow-hidden` on the LiveStoryCardExpanded container — guarded only by the kept p676
   describe, which still advances via `/continue/i` and therefore hangs.
2. The position-badge-has-visible-text check — guarded only by the kept `a11y/p411` test.

### Method note

`epistemic.md` gate 1 fired once: `grep -rn "earlier rounds" src/` returned nothing and looked like
evidence that P469's journey-card collapse was removed. The string is built as
`Show {n} earlier {n === 1 ? 'round' : 'rounds'}` (live-mode-view.tsx:2264) — live all along. A
single-string absence probe would have deleted a live file.
