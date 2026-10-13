---
status: week
type: task
rank: 34
workstream: infrastructure
created_date: '2026-10-13'
tags: [e2e, test-hygiene, live, links-menu]
disclosure: public
intent: cold-start
delivery_stage: create-spec
pipeline_ran: [create-spec]
drafted_by: opus
exec_model: sonnet
exec_effort: medium
driver: anomaly
---

# P1478: E2E rot on main: hard-coded links-menu counts, a mic-cancel test that cannot fail, and /live picker specs that never open the picker

## Problem

Filed cold from three agent-written task-inbox notes. There was no founder conversation to quote.

Three groups of E2E specs either fail on unchanged main or pass without testing anything. Each is a
test defect, not an app defect, and each one has already cost another branch a control run.

**1. Links-menu specs assert a hand-kept entry count of 6.**
- `e2e/p1179-links-menu.spec.ts:154` has `await expect(entries).toHaveCount(6)` on the **Tools** tab
  (the sheet opens there). `STANDARD_TOOL_ENTRIES` (`src/app/data/event-links.ts:215`) has **8**
  entries today.
- `e2e/p1179-links-navigation.spec.ts:216` has `toHaveCount(6)` on the **Points** tab.
  `STANDARD_STAKE_TAGS` (`event-links.ts:130`) has **7** entries.
- On 2026-10-04, 7 failures were reported across these two files plus
  `e2e/p1323-links-menu-surfaces.spec.ts` (e.g. `Expected: 6, Received: 7` on
  `getByTestId('event-links-entry')`). A control showed they fail identically without P1402's Tools
  entry, so they predate it. `p1323-…` has **no** `toHaveCount(6)` (grep, 2026-10-13); its failures'
  cause is **unverified**.

**2. The "joiner cancels mic dialog" test passes whether or not the dialog appears.**
`e2e/live-meeting-mic-permission.spec.ts:268` waits a fixed 2 s (`:302`), then clicks Cancel only
`if (await cancelButton.isVisible())` (`:306`). Its joiner context uses `permissions: []` (`:273`)
without the getUserMedia mock its sibling test needs. P1344 relied on this test as a regression guard
and recorded the caveat.

**3. Three /live specs fail looking for the story picker.** `e2e/live-content-picker.spec.ts:95`,
`e2e/p272-live-verification.spec.ts` (`:174`, `:226`, `:295`, `:318`, `:371`) and
`e2e/live-rating-drawer.spec.ts` failed 8/8 on unchanged main on 2026-10-06. Two causes were
reported:
- *User cleanup FK error.* **Already fixed.** `deleteTestUser` (`e2e/helpers/test-user.ts:463-470`)
  now deletes the user's `clarity_sessions` (and their `story_verifications`) before the profile,
  landed in `f55171251`. Verified by reading the helper 2026-10-13.
- *The picker field never appears.* The placeholder strings **match**: the specs and
  `StorySearchPicker` (`src/app/components/partners/story-search-picker.tsx:56`) both use
  `'Search your stories…'` (U+2026). The ASCII `...` variant is in `doc-story-picker.tsx`, which is the
  docs page and not /live. In `live-mode-view.tsx:1394-1408`, the picker only renders after the user
  clicks **"+ Select your story"** (`showStoryPicker` starts `false`, `:1213`; P600, 2026-03-30). It
  also requires `stories.length > 0` (`:1225`). **Hypothesis, unverified:** the specs never click
  that toggle, or their test user has no stories.

## Appetite

- **Blast radius:** test files only.
- **Reversibility:** `git revert`.
- **Decision density:** zero founder decisions.

## Invariants

- **Fix the tests, never the app, to make them pass** (`.claude/rules/tests.md`). If a spec turns
  out to be catching a real app defect, stop, file it as a bug, and leave that assertion failing with
  a pointer.
- **Counts are derived, not hand-kept** (epistemic gate 7e). An assertion about how many links-menu
  entries render derives the number from the same exported constant the app renders from.

## Solution

1. **Links menu:** replace each hard-coded entry count with the length of the matching constant
   (`STANDARD_TOOL_ENTRIES.length`, `STANDARD_STAKE_TAGS.length`, `STANDARD_LETTER_ENTRIES.length`),
   imported into the spec. E2E already imports app constants this way, e.g.
   `e2e/p958-webinar-date-line.spec.ts:17`. Then run all three files and fix any remaining
   count-shaped failure the same way. Report any non-count failure in `p1323-…` with its error rather
   than guessing at it.
2. **Mic-cancel:** assert the dialog is visible (`await expect(cancelButton).toBeVisible()`) before
   clicking Cancel, and give the joiner the deterministic denied-mic setup from
   `e2e/p1344-live-mic-cancel.spec.ts` (`installSwitchableMic`, `:31`). Move that helper to
   `e2e/helpers/` if both specs need it.
3. **/live picker:** confirm the hypothesis first by running one failing spec headed or with a trace.
   If it holds, add a click on "+ Select your story" before each `getByPlaceholder('Search your
   stories…')`, preferably through one shared helper. Make sure the test user has at least one story.
   If the hypothesis is wrong, record the real cause in this spec before changing anything.

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| Importing `event-links.ts` into a Playwright spec pulls in browser-only modules | MITIGATE | Check that the import compiles in the Playwright runner. If it does not, extract the constants to a dependency-free module and import that from both sides |
| The /live picker failure has a cause other than the toggle | MITIGATE | Solution 3 requires confirming before editing |
| Unrelated flakiness under parallel workers masks results | ACCEPT | Run each file with `--workers=1` for the evidence runs; parallel flakiness is out of scope (decisions.md 2026-09-15, P1078) |

**Non-Goals**
- Do NOT change `event-links.ts` entries, the links-menu UI, the mic dialog, or the /live picker UX.
- Do NOT rewrite these spec files beyond the assertions named above.
- Do NOT touch `e2e/helpers/test-user.ts` cleanup. The FK half is already fixed.
- Do NOT add CI jobs.

## Done-When

- [ ] `grep -nE "toHaveCount\(6\)" e2e/p1179-links-menu.spec.ts e2e/p1179-links-navigation.spec.ts`
      returns nothing, and no literal links-menu entry count remains in the three files.
- [ ] `npx playwright test e2e/p1179-links-menu.spec.ts e2e/p1179-links-navigation.spec.ts e2e/p1323-links-menu-surfaces.spec.ts --workers=1`
      passes, or every remaining failure is listed here with its error and a filed follow-up.
- [ ] Gate 7 for the derived count: temporarily append an entry to `STANDARD_TOOL_ENTRIES`, and the
      links-menu spec still passes, because the count follows the constant. Revert.
- [ ] `e2e/live-meeting-mic-permission.spec.ts` contains no `if (await cancelButton.isVisible())`.
      The "joiner who cancels mic dialog" test **fails** when the dialog is suppressed (e.g. with mic
      granted) and passes as written. Paste both runs.
- [ ] `npx playwright test e2e/live-content-picker.spec.ts e2e/p272-live-verification.spec.ts e2e/live-rating-drawer.spec.ts --workers=1`
      passes on main, with the confirmed root cause written in this spec.

## Related

- P1179 / P1323: links menu. P1402: the Tools entry whose arrival exposed the stale count.
- P1344: mic-cancel. Its E2E is the pattern to follow.
- P600: "+ Select your story" toggle. P1345: `deleteTestUser` fails loudly. P1337 (`f55171251`):
  fixed the cleanup FK order.

Promoted from the task inbox, 2026-10-13 (three notes merged into this spec).
